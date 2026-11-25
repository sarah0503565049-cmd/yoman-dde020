
import { addDays, diffDays, dow } from './time.js';
import { apptTravel, clinicRanges, findConflicts, isActive } from './model.js';

const HEB = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', month: 'long', day: 'numeric' });

const YOM_TOV = { Tishri: [1, 2, 10, 15, 22], Nisan: [15, 21], Sivan: [6] };

export function hebrewDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const p = HEB.formatToParts(new Date(Date.UTC(y, m - 1, d)));
  const get = (t) => (p.find((x) => x.type === t) || {}).value;
  return { month: get('month'), day: Number(get('day')) };
}

export function isYomTov(ymd) {
  const { month, day } = hebrewDate(ymd);
  return !!(YOM_TOV[month] && YOM_TOV[month].includes(day));
}

export function publicMode(svc, cfg = {}) {
  if (!svc || !svc.active || svc.kind === 'product') return null;
  if (svc.kind === 'series' && !cfg.showSeries) return null;
  if ((cfg.hidden || []).includes(svc.id)) return null;
  if ((cfg.whatsappOnly || []).includes(svc.id)) return 'whatsapp';
  if (!(Number(svc.durationMin) > 0)) return 'whatsapp';
  return 'book';
}

export function slotLength(svc, cfg = {}) {
  return Number(cfg.blockMin && cfg.blockMin[svc.id]) || Number(svc.durationMin) || 0;
}

const ceilTo = (min, grid) => Math.ceil(min / grid) * grid;

export function freeStarts(date, lengthMin, ctx) {
  const { settings, appts = [], blocks = [], today, nowMin = 0, minNoticeMin = 0, stepMin = 30 } = ctx;
  if (!(lengthMin > 0) || !settings) return [];
  const ahead = diffDays(today, date);
  if (ahead < 0 || isYomTov(date)) return [];
  const dayBlocks = blocks.filter((b) => b.date === date);
  if (dayBlocks.some((b) => b.allDay || b.durationMin >= 1440)) return [];
  const ranges = clinicRanges(settings, dow(date));
  if (!ranges.length) return [];

  const grid = Number(settings.slotMin) || 15;
  const buffer = Math.max(0, Number(settings.bufferMin) || 0);
  const step = Math.max(grid, Number(stepMin) || 30);
  const earliest = nowMin + minNoticeMin - ahead * 1440;
  const dayAppts = appts.filter((a) => a.date === date && isActive(a));
  const anchors = [
    ceilTo(earliest, grid),
    ...dayAppts.map((a) => ceilTo(a.startMin + a.durationMin + (apptTravel(a) || buffer), grid)),
    ...dayBlocks.map((b) => ceilTo(b.startMin + b.durationMin, grid)),
  ];

  const out = new Set();
  for (const r of ranges) {
    const last = r.to - lengthMin;
    const cands = [];
    for (let m = r.from; m <= last; m += step) cands.push(m);
    for (const m of anchors) if (m >= r.from && m <= last) cands.push(m);
    for (const m of cands) {
      if (m < earliest || out.has(m)) continue;
      const hit = findConflicts({ date, startMin: m, durationMin: lengthMin }, dayAppts, dayBlocks, { bufferMin: buffer });
      if (!hit.length) out.add(m);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function bookableDays(lengthMin, ctx, { from, days = 42 } = {}) {
  const start = from || ctx.today;
  const out = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(start, i);
    const starts = freeStarts(date, lengthMin, ctx);
    if (starts.length) out.push({ date, starts });
  }
  return out;
}

export const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ');
export const sameName = (a, b) => cleanName(a).toLowerCase() === cleanName(b).toLowerCase();
