
import { diffDays } from './time.js';

export const STATUS = {
  pending: { label: 'ממתין לאישור', short: 'ממתין' },
  booked: { label: 'נקבע', short: 'נקבע' },
  confirmed: { label: 'אישר/ה הגעה', short: 'אישר/ה' },
  arrived: { label: 'הגיע/ה', short: 'הגיע/ה' },
  paid: { label: 'שולם', short: 'שולם' },
  free: { label: 'ללא תשלום', short: 'ללא תשלום' },
  cancelled: { label: 'בוטל', short: 'בוטל' },
  noshow: { label: 'לא הגיע/ה', short: 'לא הגיע/ה' },
};

export const FREE_REASONS = {
  soldier: 'חייל/ת',
  family: 'משפחה',
  other: 'אחר',
};

export const isClosed = (a) => a.status === 'paid' || a.status === 'free';

export const isVisit = (a) => a.status === 'arrived' || a.status === 'paid' || a.status === 'free';

export function freeValue(a) {
  if (a.status !== 'free') return 0;
  return (a.items || []).reduce((s, it) => s + (Number(it.listPrice) || Number(it.price) || 0), 0);
}

export const isActive = (a) => a.status !== 'cancelled';

export const CANCELLED_BY = {
  client: 'הלקוח/ה',
  link: 'דרך הקישור',
  owner: 'העסק',
};

export const apptEnd = (a) => a.startMin + a.durationMin;

export function apptTotal(a) {
  return (a.items || []).reduce((s, it) => s + (Number(it.price) || 0), 0);
}

export function paidAmount(a) {
  if (a.status !== 'paid') return 0;
  const p = a.payment;
  if (!p) return apptTotal(a);
  return (Number(p.amount) || 0) + (Number(p.tip) || 0);
}

export function lastNextStep(clientAppts, today) {
  let best = null;
  for (const a of clientAppts) {
    if (!isActive(a) || a.status === 'noshow' || a.date > today) continue;
    if (!best || a.date > best.date || (a.date === best.date && a.startMin > best.startMin)) best = a;
  }
  const text = best && String(best.nextStep || '').trim();
  return text ? { text, date: best.date } : null;
}

export function returnWeeksOf(client, settings) {
  return Number(client && client.returnWeeks) || Number(settings && settings.returnWeeks) || 4;
}

export function visitSummary(appts, today = null) {
  const visits = (appts || [])
    .filter((a) => isVisit(a) && (!today || a.date <= today))
    .slice()
    .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1));
  const map = new Map();
  for (const a of visits) {
    for (const it of a.items || []) {
      const key = it.serviceId || `name:${it.name}`;
      const row = map.get(key) || { key, name: it.name, count: 0, lastDate: a.date };
      row.count += 1;
      row.name = it.name;
      row.lastDate = a.date;
      map.set(key, row);
    }
  }
  return [...map.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name, 'he'));
}

export const canSendMarketing = (client) => !!client && !client.deletedAt && !client.marketingOptOut;

export const canSendService = (client) => !!client && !client.deletedAt;

export function needsNextAppointment(appts, clientsById, today, settings) {
  const get = (id) => (clientsById instanceof Map ? clientsById.get(id) : clientsById[id]);
  const byClient = new Map();
  for (const a of appts) {
    if (!a.clientId) continue;
    if (!byClient.has(a.clientId)) byClient.set(a.clientId, []);
    byClient.get(a.clientId).push(a);
  }
  const out = [];
  for (const [clientId, list] of byClient) {
    const c = get(clientId);
    if (!c || c.deletedAt) continue;
    const hasNext = list.some((a) => {
      if (!['pending', 'booked', 'confirmed'].includes(a.status)) return false;
      return a.date >= today;
    });
    if (hasNext) continue;
    let last = null;
    for (const a of list) {
      if (!isVisit(a) || a.date > today) continue;
      if (!last || a.date > last.date || (a.date === last.date && a.startMin > last.startMin)) last = a;
    }
    if (!last || last.noFollowUp) continue;
    const weeks = returnWeeksOf(c, settings);
    const daysSince = diffDays(last.date, today);
    if (daysSince > Math.max(56, weeks * 7 + 28)) continue;
    out.push({
      clientId,
      lastVisit: last,
      daysSince,
      returnWeeks: weeks,
      dueInDays: weeks * 7 - daysSince,
      overdue: daysSince >= weeks * 7,
    });
  }
  return out.sort((x, y) => {
    const xt = x.daysSince === 0 ? 0 : 1;
    const yt = y.daysSince === 0 ? 0 : 1;
    return xt - yt || x.dueInDays - y.dueInDays || (x.clientId < y.clientId ? -1 : 1);
  });
}

export function apptDiscount(a) {
  return (a.items || []).reduce((s, it) => {
    const list = Number(it.listPrice);
    const price = Number(it.price) || 0;
    return s + (list > price ? list - price : 0);
  }, 0);
}

export function callsDue(appts, clientsById, today, tomorrow, nowMinutes) {
  const get = (id) => (clientsById instanceof Map ? clientsById.get(id) : clientsById[id]);
  return appts
    .filter((a) => {
      if (a.calledAt || !['booked', 'confirmed', 'pending'].includes(a.status)) return false;
      const c = get(a.clientId);
      if (!c || !c.callBefore) return false;
      if (a.date === tomorrow) return true;
      return a.date === today && a.startMin > nowMinutes;
    })
    .sort((x, y) => (x.date === y.date ? x.startMin - y.startMin : x.date < y.date ? -1 : 1));
}

export function itemsDuration(items) {
  return (items || []).reduce((s, it) => s + (Number(it.durationMin) || 0), 0);
}

export function apptTitle(a) {
  const names = (a.items || []).map((it) => it.name);
  return names.join(' + ') || 'תור';
}

export function rangesOverlap(aStart, aDur, bStart, bDur) {
  return aStart < bStart + bDur && bStart < aStart + aDur;
}

export function findConflicts(cand, appts, blockInstances, opt = {}) {
  const out = [];
  const buffer = Math.max(0, Number(opt.bufferMin) || 0);
  const candEnd = cand.startMin + cand.durationMin;
  for (const a of appts) {
    if (a.date !== cand.date || !isActive(a) || a.id === opt.ignoreApptId) continue;
    if (rangesOverlap(cand.startMin, cand.durationMin, a.startMin, a.durationMin)) {
      out.push({ type: 'appointment', startMin: a.startMin, durationMin: a.durationMin, ref: a });
    } else if (buffer > 0) {
      const aEnd = a.startMin + a.durationMin;
      const gap = cand.startMin >= aEnd ? cand.startMin - aEnd : a.startMin - candEnd;
      if (gap < buffer) {
        out.push({ type: 'buffer', startMin: a.startMin, durationMin: a.durationMin, gapMin: gap, ref: a });
      }
    }
  }
  for (const b of blockInstances) {
    if (b.date !== cand.date || b.blockId === opt.ignoreBlockId) continue;
    if (rangesOverlap(cand.startMin, cand.durationMin, b.startMin, b.durationMin)) {
      out.push({ type: 'block', startMin: b.startMin, durationMin: b.durationMin, ref: b });
    }
  }
  return out.sort((x, y) => x.startMin - y.startMin);
}

export function isPast(a, today, nowMinutes) {
  const d = diffDays(a.date, today);
  if (d > 0) return true;
  if (d < 0) return false;
  return apptEnd(a) <= nowMinutes;
}

export function apptVisual(a, today, nowMinutes, isNewClient) {
  const past = isPast(a, today, nowMinutes);
  let tone = 'color';
  if (a.status === 'paid' || a.status === 'free') tone = 'paid';
  else if (a.status === 'pending') tone = 'pending';
  else if (a.status === 'noshow') tone = 'noshow';
  return {
    tone,
    free: a.status === 'free',
    unpaid: past && (a.status === 'booked' || a.status === 'confirmed' || a.status === 'arrived'),
    thumb: a.status === 'confirmed',
    star: !!isNewClient,
  };
}

export function firstVisitIds(allAppts) {
  const first = new Map();
  for (const a of allAppts) {
    if (!isActive(a) || !a.clientId) continue;
    const cur = first.get(a.clientId);
    if (!cur || a.date < cur.date || (a.date === cur.date && a.startMin < cur.startMin)) first.set(a.clientId, a);
  }
  return new Set([...first.values()].map((a) => a.id));
}

export function normalizePhone(raw) {
  let s = String(raw || '').replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('+972')) s = '0' + s.slice(4);
  else if (s.startsWith('972')) s = '0' + s.slice(3);
  else if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : null;
  if (!/^0\d{8,9}$/.test(s)) return null;
  return '+972' + s.slice(1);
}

export function formatPhone(intl) {
  if (!intl) return '';
  if (!intl.startsWith('+972')) return intl;
  const local = '0' + intl.slice(4);
  return local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3)}` : `${local.slice(0, 2)}-${local.slice(2)}`;
}

export function textOn(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return '#3A3026';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.58 ? '#3A3026' : '#FFFFFF';
}

export function validateAppointment(a) {
  const errs = [];
  if (!a.clientId) errs.push('חסר שם של לקוח/ה');
  if (!a.items || !a.items.length) errs.push('צריך לבחור טיפול אחד לפחות');
  if (!(a.durationMin > 0)) errs.push('חסר משך הזמן');
  if (a.startMin == null || a.startMin < 0 || a.startMin >= 1440) errs.push('חסרה שעת התחלה');
  if (a.startMin != null && a.durationMin > 0 && a.startMin + a.durationMin > 1440) errs.push('התור נגמר אחרי חצות');
  return errs;
}

export function validateBlock(b) {
  const errs = [];
  if (!String(b.title || '').trim()) errs.push('חסר שם לאירוע');
  if (!b.allDay) {
    if (!(b.durationMin > 0)) errs.push('חסר משך הזמן');
    if (b.startMin + b.durationMin > 1440) errs.push('האירוע נגמר אחרי חצות');
  }
  if (b.until && diffDays(b.date, b.until) < 0) errs.push('תאריך הסיום לפני ההתחלה');
  return errs;
}

export function clinicRanges(settings, dayOfWeek) {
  const h = settings && settings.clinicHours;
  const list = (h && (h[dayOfWeek] || h[String(dayOfWeek)])) || [];
  return list.filter((r) => r.to > r.from).sort((a, b) => a.from - b.from);
}

export function isClinicTime(settings, dayOfWeek, startMin, durationMin = 1) {
  return clinicRanges(settings, dayOfWeek).some((r) => startMin >= r.from && startMin + durationMin <= r.to);
}

export function gridRange(settings, events) {
  let from = settings.dayStartMin;
  let to = settings.dayEndMin;
  for (const e of events) {
    if (e.allDay) continue;
    from = Math.min(from, Math.floor(e.startMin / 60) * 60);
    to = Math.max(to, Math.min(1440, Math.ceil((e.startMin + e.durationMin) / 60) * 60));
  }
  return { from: Math.max(0, from), to };
}
