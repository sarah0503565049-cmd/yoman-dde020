
import { addDays, diffDays } from '../lib/time.js';
import { expandBlocks } from '../lib/recur.js';
import { bookableDays, minGapFor, publicMode, slotLength, ONLINE_MIN_NOTICE_MIN } from '../lib/booking.js';

export const AUTH_STORAGE_KEY = 'torim.book.auth';

export const CLIENT_OPTIONS = Object.freeze({
  auth: Object.freeze({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY }),
});

const coded = (message, code) => Object.assign(new Error(message), { code });

export function failKind(res) {
  const st = Number(res && res.status) || 0;
  if (!res || st === 0 || st >= 500 || st === 408 || st === 429) return 'network';
  return 'error';
}

async function call(fn) {
  try {
    const res = await fn();
    return res || { error: { message: 'אין תשובה' }, status: 0 };
  } catch (err) {
    return { error: { message: String((err && err.message) || err) }, status: 0 };
  }
}

const isOpen = (d) => !!(d && d.now && typeof d.now.date === 'string' && Number.isFinite(d.now.min)
  && typeof d.until === 'string' && Array.isArray(d.services) && Array.isArray(d.busy) && Array.isArray(d.events));

export function createBookRemote(client) {
  return {
    async open() {
      const res = await call(() => client.rpc('booking_open'));
      if (res.error) throw coded(res.error.message || 'booking_open', failKind(res));
      if (!isOpen(res.data)) throw coded('booking_open: תשובה לא צפויה', 'error');
      return res.data;
    },
    async book(req) {
      const res = await call(() => client.rpc('book_online', { req }));
      if (res.error) return { ok: false, code: failKind(res) };
      const d = res.data;
      if (!d || typeof d.ok !== 'boolean') return { ok: false, code: 'error' };
      if (d.ok && !(d.appointment && typeof d.appointment.date === 'string')) return { ok: false, code: 'error' };
      return d;
    },
  };
}


export function servicesOf(open) {
  return (open.services || []).map((s) => ({
    id: s.id, name: s.name, shortName: s.shortName, category: s.category, kind: s.kind || 'treatment',
    price: s.price, durationMin: s.durationMin, travelMin: Number(s.travelMin) || 0, sort: s.sort, active: true,
  }));
}

export function pageConfig(base, open) {
  const o = open.online || {};
  const svcs = open.services || [];
  const pick = (k) => (o[k] !== undefined ? o[k] : base[k]);
  return {
    ...base,
    onlineStatus: pick('onlineStatus'),
    minNoticeMin: pick('minNoticeMin'),
    daysAhead: pick('daysAhead'),
    stepMin: pick('stepMin'),
    minGapMin: pick('minGapMin'),
    showSeries: true,   // סדרה מגיעה מהשרת רק כשמותר להציג אותה
    hidden: [],
    captchaSiteKey: typeof o.captchaSiteKey === 'string' && /^[0-9A-Za-z_-]{10,100}$/.test(o.captchaSiteKey) ? o.captchaSiteKey : null,
    whatsappOnly: svcs.filter((s) => s.mode === 'whatsapp').map((s) => s.id),
    blockMin: Object.fromEntries(svcs.filter((s) => Number(s.lengthMin) > 0).map((s) => [s.id, Number(s.lengthMin)])),
  };
}

export function nowFrom(open, fetchedAt, nowMs = Date.now()) {
  const passed = Math.max(0, Math.floor((nowMs - fetchedAt) / 60000));
  const total = open.now.min + passed;
  return { today: addDays(open.now.date, Math.floor(total / 1440)), nowMin: total % 1440 };
}

export function ctxOf(open, cfg, services, now) {
  const settings = open.settings || null;
  return {
    settings,
    appts: (open.busy || []).map((b, i) => ({
      id: 'busy-' + i, date: b.date, startMin: Number(b.startMin), durationMin: Number(b.durationMin), status: 'booked', travelMin: Number(b.travelMin) || 0,
    })),
    blocks: expandBlocks((open.events || []).map((e, i) => ({ ...e, id: 'event-' + i, title: '' })), now.today, open.until),
    today: now.today,
    nowMin: now.nowMin,
    minNoticeMin: cfg.minNoticeMin != null ? Number(cfg.minNoticeMin) : ONLINE_MIN_NOTICE_MIN,
    stepMin: Number(cfg.stepMin) || 30,
    minGapMin: minGapFor(services, cfg, settings ? settings.bufferMin : 15),
  };
}

export function daysFor(open, svc, cfg, services, now) {
  if (!svc || publicMode(svc, cfg) !== 'book') return [];
  const days = Math.min(Number(cfg.daysAhead) || 42, diffDays(now.today, open.until));
  if (!(days >= 0)) return [];
  return bookableDays(slotLength(svc, cfg), ctxOf(open, cfg, services, now), { from: now.today, days });
}

export function createRemoteSource(remote, base, { maxAgeMs = 60000, clock = () => Date.now() } = {}) {
  let open = null;
  let at = 0;
  let services = [];
  let cfg = base;
  const load = async () => {
    const data = await remote.open();
    open = data;
    at = clock();
    services = servicesOf(data);
    cfg = pageConfig(base, data);
    return { services, cfg };
  };
  return {
    load,
    get cfg() { return cfg; },
    get services() { return services; },
    async days(serviceId) {
      if (!open || clock() - at > maxAgeMs) await load();
      return daysFor(open, services.find((s) => s.id === serviceId), cfg, services, nowFrom(open, at, clock()));
    },
    async moveDays(mine) {
      if (!open || clock() - at > maxAgeMs) await load();
      return moveDaysFor(open, mine, cfg, services, nowFrom(open, at, clock()));
    },
    stale() { at = -Infinity; },
    async book(req) {
      const r = await remote.book(req);
      if (!r.ok && r.code === 'slot_taken') at = -Infinity;   // הנתונים ישנים: נטען מחדש במסך הבא
      return r;
    },
  };
}


const isMine = (a) => !!(a && typeof a.date === 'string' && Number.isFinite(a.startMin) && Number.isFinite(a.durationMin)
  && typeof a.status === 'string' && Array.isArray(a.items) && a.can && typeof a.can === 'object');

export function createMyRemote(client) {
  const ask = async (name, req) => {
    const res = await call(() => client.rpc(name, { req }));
    if (res.error) return { ok: false, code: failKind(res) };
    const d = res.data;
    if (!d || typeof d.ok !== 'boolean') return { ok: false, code: 'error' };
    if (d.ok && !isMine(d.appointment)) return { ok: false, code: 'error' };
    if (!d.ok && typeof d.code !== 'string') return { ok: false, code: 'error' };
    if (!d.ok && d.appointment && !isMine(d.appointment)) return { ok: false, code: d.code, reason: d.reason };
    return d;
  };
  return {
    get: (token) => ask('my_appt', { token }),
    confirm: (token) => ask('my_confirm', { token }),
    cancel: (token) => ask('my_cancel', { token }),
    move: (token, date, startMin) => ask('my_move', { token, date, startMin }),
  };
}

export function withoutOwn(open, mine) {
  let gone = false;
  const busy = (open.busy || []).filter((b) => {
    if (gone || b.date !== mine.date || Number(b.startMin) !== Number(mine.startMin) || Number(b.durationMin) !== Number(mine.durationMin)) return true;
    gone = true;
    return false;
  });
  return { ...open, busy };
}

export function moveDaysFor(open, mine, cfg, services, now) {
  if (!mine || !(Number(mine.durationMin) > 0)) return [];
  const days = Math.min(Number(cfg.daysAhead) || 42, diffDays(now.today, open.until));
  if (!(days >= 0)) return [];
  const ctx = ctxOf(withoutOwn(open, mine), cfg, services, now);
  return bookableDays(Number(mine.durationMin), ctx, { from: now.today, days })
    .map((d) => (d.date === mine.date ? { date: d.date, starts: d.starts.filter((m) => m !== Number(mine.startMin)) } : d))
    .filter((d) => d.starts.length);
}
