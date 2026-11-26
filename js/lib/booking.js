
import { addDays, diffDays, dow } from './time.js';
import { apptTravel, birthFromParts, clinicRanges, findConflicts, isActive, isMobilePhone } from './model.js';

export const ONLINE_MIN_NOTICE_MIN = 24 * 60;

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

export function minGapFor(services, cfg = {}, bufferMin = 15) {
  if (cfg.minGapMin != null) return Math.max(0, Number(cfg.minGapMin) || 0);
  const lens = (services || []).filter((s) => publicMode(s, cfg) === 'book').map((s) => slotLength(s, cfg)).filter((n) => n > 0);
  return lens.length ? Math.min(...lens) + Math.max(0, Number(bufferMin) || 0) : 0;
}

const ceilTo = (min, grid) => Math.ceil(min / grid) * grid;

export function freeStarts(date, lengthMin, ctx) {
  const { settings, appts = [], blocks = [], today, nowMin = 0, minNoticeMin = ONLINE_MIN_NOTICE_MIN, stepMin = 30, minGapMin = 0 } = ctx;
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

  const gap = Math.max(0, Number(minGapMin) || 0);
  const busy = [
    ...dayAppts.map((a) => ({ start: a.startMin - (apptTravel(a) || 0), free: a.startMin + a.durationMin + (apptTravel(a) || buffer) })),
    ...dayBlocks.map((b) => ({ start: b.startMin, free: b.startMin + b.durationMin })),
  ];
  const usable = (g) => g <= 0 || g >= gap;
  const gapsOk = (m, r) => {
    let prev = r.from;
    let next = r.to;
    for (const x of busy) {
      if (x.free <= m) prev = Math.max(prev, x.free);
      if (x.start >= m + lengthMin) next = Math.min(next, x.start);
    }
    return usable(m - prev) && usable(next - (m + lengthMin + buffer));
  };

  const out = new Set();
  for (const r of ranges) {
    const last = r.to - lengthMin;
    const cands = [];
    for (let m = r.from; m <= last; m += gap > 0 ? grid : step) cands.push(m);
    for (const m of anchors) if (m >= r.from && m <= last) cands.push(m);
    for (const m of cands) {
      if (m < earliest || out.has(m)) continue;
      if (gap > 0 && !gapsOk(m, r)) continue;
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

export const isUnseenOnline = (a, today) => !!a && a.source === 'online' && !a.seenAt && isActive(a) && a.date >= today;

export function unseenOnline(appts, today) {
  return (appts || []).filter((a) => isUnseenOnline(a, today) && a.status !== 'pending')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
}

export function freshOnline(appts, today, known) {
  const list = (appts || []).filter((a) => isUnseenOnline(a, today));
  const ids = new Set(list.map((a) => a.id));
  if (!known) return { known: ids, fresh: [] };
  return { known: new Set([...known, ...ids]), fresh: list.filter((a) => !known.has(a.id)) };
}

export function linkNotice(a, today) {
  const e = a && a.linkEvent;
  if (!e || typeof e !== 'object' || a.seenAt || typeof e.at !== 'string') return null;
  if ((e.kind === 'cancel' || e.kind === 'move') && typeof e.overriddenAt === 'string') {
    const days = [e.from && e.from.date, e.to && e.to.date, a.date].filter((d) => typeof d === 'string');
    return days.some((d) => d >= today) ? 'overridden' : null;
  }
  if (e.kind === 'cancel') {
    const day = (e.from && e.from.date) || a.date;
    return a.status === 'cancelled' && a.cancelledBy === 'link' && a.cancelledAt === e.at && day >= today ? 'cancel' : null;
  }
  if (e.kind === 'move') {
    const to = e.to || {};
    return isActive(a) && a.date === to.date && a.startMin === to.startMin && a.date >= today ? 'move' : null;
  }
  return null;
}

export function linkNotices(appts, today) {
  const at = (x) => (x.kind !== 'move' && x.appt.linkEvent.from ? x.appt.linkEvent.from : x.appt);
  return (appts || []).map((a) => ({ appt: a, kind: linkNotice(a, today) })).filter((x) => x.kind)
    .sort((x, y) => String(at(x).date).localeCompare(String(at(y).date)) || Number(at(x).startMin) - Number(at(y).startMin));
}

export function freshLinkNotices(appts, today, known) {
  const list = linkNotices(appts, today);
  const key = (x) => `${x.appt.id}|${x.appt.linkEvent.at}|${x.appt.linkEvent.overriddenAt || ''}`;
  const keys = new Set(list.map(key));
  if (!known) return { known: keys, fresh: [] };
  return { known: new Set([...known, ...keys]), fresh: list.filter((x) => !known.has(key(x))) };
}

export const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ');
export const sameName = (a, b) => cleanName(a).toLowerCase() === cleanName(b).toLowerCase();

export const ME_ERRORS = {
  name: 'כדי לקבוע תור צריך שם מלא',
  phoneEmpty: 'כדי לקבוע תור צריך מספר נייד',
  phone: 'צריך מספר נייד של 10 ספרות, שמתחיל ב-05',
  partial: 'ליום ההולדת צריך לבחור יום וחודש',
  invalid: 'אין תאריך כזה בלוח השנה',
  future: 'התאריך הזה עוד לא הגיע',
};

export function checkMe({ name, phone, birth } = {}, today = null) {
  const errors = {};
  if (!cleanName(name)) errors.name = ME_ERRORS.name;
  if (!String(phone || '').replace(/\D/g, '')) errors.phone = ME_ERRORS.phoneEmpty;
  else if (!isMobilePhone(phone)) errors.phone = ME_ERRORS.phone;
  const b = birthFromParts(birth || {}, today);
  if (b.error) errors.birth = ME_ERRORS[b.error];
  return { errors, birthDate: b.value };
}
