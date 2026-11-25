
import { todayYmd, isYmd, nowMin, addDays } from '../lib/time.js';
import {
  firstVisitIds as modelFirstVisitIds, normalizePhone, apptTotal, FREE_REASONS, validateAppointment, validateBlock,
  isMobilePhone, birthParts, fmtBirth,
} from '../lib/model.js';
import { expandBlocks } from '../lib/recur.js';
import { publicMode, slotLength, freeStarts, bookableDays, cleanName, sameName, ONLINE_MIN_NOTICE_MIN, minGapFor } from '../lib/booking.js';
import { buildSeed, SERVICE_PATCH, NAME_PATCH } from './seed.js';
import { addHistory } from './seed-history.js';

function patchServices(db) {
  if (!db.settings || !db.settings.demo) return false;
  let dirty = false;
  for (const [key, patch] of [['servicePatch', SERVICE_PATCH], ['namePatch', NAME_PATCH]]) {
    if (db[key] === patch.id) continue;
    for (const p of patch.rows) {
      const s = (db.services || []).find((x) => x.id === p.id);
      if (s && Object.entries(p.was).every(([k, v]) => s[k] === v)) Object.assign(s, p.set);
    }
    if (patch.categories && Array.isArray(db.settings.categories)) {
      db.settings.categories = db.settings.categories.map((c) => patch.categories[c] || c);
    }
    db[key] = patch.id;
    dirty = true;
  }
  return dirty;
}

export const STORAGE_KEY = 'torim.v1';
const BAK_KEY = 'torim.v1.bak';

const clone = (v) => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();
const newId = () => globalThis.crypto.randomUUID();

function normalizeBlock(b) {
  const out = {
    ...b,
    title: String(b.title || '').trim(),
    repeat: b.repeat || 'none',
    until: b.until || null,
    exceptions: Array.isArray(b.exceptions) ? [...b.exceptions] : [],
    movedFrom: b.movedFrom || null,
    allDay: !!b.allDay,
  };
  if (out.allDay) {
    out.startMin = 0;
    out.durationMin = 1440;
  }
  return out;
}

function checkBlock(b) {
  const errs = [];
  if (!isYmd(b.date)) errs.push('חסר תאריך');
  errs.push(...validateBlock(b));
  if (errs.length) throw new Error(errs.join(' · '));
}

function assertNeverPaid(a) {
  if (a.status === 'paid' || a.everPaid) throw new Error('תור ששולם לא נסגר ללא תשלום');
}

function codedError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function bookingCtx(db, from, to, config, now) {
  return {
    settings: db.settings,
    appts: db.appointments.filter((a) => a.date >= from && a.date <= to),
    blocks: expandBlocks(db.blocks, from, to),
    today: todayYmd(now),
    nowMin: nowMin(now),
    minNoticeMin: config.minNoticeMin != null ? Number(config.minNoticeMin) : ONLINE_MIN_NOTICE_MIN,
    stepMin: Number(config.stepMin) || 30,
    minGapMin: minGapFor(db.services, config, db.settings.bufferMin),
  };
}

function logAudit(db, action, apptId, from, to, detail) {
  if (!Array.isArray(db.audit)) db.audit = [];
  db.audit.push({ at: nowIso(), action, apptId, from, to, detail });
}

export function createStore({ storage, today, history = false } = {}) {
  const subscribers = new Set();
  const store = () => storage || globalThis.localStorage;

  function seed() {
    const db = buildSeed(today || todayYmd());
    if (history) addHistory(db, today || todayYmd());
    return db;
  }

  function read() {
    const st = store();
    const raw = st.getItem(STORAGE_KEY);
    if (raw == null) {
      const db = seed();
      st.setItem(STORAGE_KEY, JSON.stringify(db));
      return db;
    }
    let db = null;
    try {
      db = JSON.parse(raw);
    } catch {
      db = null;
    }
    if (!db || typeof db !== 'object' || db.version !== 1) {
      try { st.setItem(BAK_KEY, raw); } catch { /* גיבוי נכשל, ממשיכים */ }
      db = seed();
      st.setItem(STORAGE_KEY, JSON.stringify(db));
    } else {
      let dirty = patchServices(db);
      if (history && db.settings && db.settings.demo && !db.historyAdded) { addHistory(db, today || todayYmd()); dirty = true; }
      if (dirty) st.setItem(STORAGE_KEY, JSON.stringify(db));
    }
    return db;
  }

  function write(db) {
    store().setItem(STORAGE_KEY, JSON.stringify(db));
    for (const fn of [...subscribers]) {
      try { fn(); } catch { /* מנוי שזרק לא שובר כתיבה */ }
    }
  }

  const byName = (a, b) => a.name.localeCompare(b.name, 'he');

  return {
    async getSettings() { return clone(read().settings); },
    async saveSettings(patch) {
      const db = read();
      db.settings = { ...db.settings, ...clone(patch || {}) };
      write(db);
      return clone(db.settings);
    },

    async listServices({ includeInactive = false } = {}) {
      return clone(read().services.filter((s) => includeInactive || s.active).sort((a, b) => a.sort - b.sort));
    },
    async getService(id) {
      const s = read().services.find((x) => x.id === id);
      return s ? clone(s) : null;
    },
    async saveService(svc) {
      const name = String(svc.name || '').trim();
      if (!name) throw new Error('חסר שם לפריט');
      const db = read();
      const idx = svc.id ? db.services.findIndex((x) => x.id === svc.id) : -1;
      let out;
      if (idx >= 0) {
        out = { ...db.services[idx], ...clone(svc), name };
        db.services[idx] = out;
      } else {
        out = {
          shortName: name, category: '', kind: 'treatment', price: 0, durationMin: 0, color: '#C9BBA6', active: true,
          ...clone(svc), name, id: svc.id || newId(),
          sort: db.services.reduce((m, s) => Math.max(m, s.sort), 0) + 1,
        };
        db.services.push(out);
      }
      write(db);
      return clone(out);
    },

    async listClients() {
      return clone(read().clients.filter((c) => !c.deletedAt).sort(byName));
    },
    async getClient(id) {
      const c = read().clients.find((x) => x.id === id);
      return c ? clone(c) : null;
    },
    async saveClient(c) {
      const name = String(c.name || '').trim();
      if (!name) throw new Error('חסר שם');
      const phone = normalizePhone(c.phone);
      if (!phone) throw new Error('מספר הטלפון לא תקין');
      const db = read();
      const dup = db.clients.find((x) => !x.deletedAt && x.phone === phone && x.id !== c.id);
      if (dup) {
        const err = new Error(`כבר יש לקוח/ה עם הטלפון הזה: ${dup.name}`);
        err.code = 'duplicate_phone';
        err.clientId = dup.id;
        throw err;
      }
      const idx = c.id ? db.clients.findIndex((x) => x.id === c.id) : -1;
      let out;
      const before = idx >= 0 ? db.clients[idx] : null;
      const wasOptOut = !!(before && before.marketingOptOut);
      const isOptOut = 'marketingOptOut' in c ? !!c.marketingOptOut : wasOptOut;
      if (idx >= 0) {
        out = { ...before, ...clone(c), name, phone };
        out.callBefore = !!out.callBefore;
        db.clients[idx] = out;
      } else {
        out = {
          birthDate: null, notes: '', createdAt: nowIso(), deletedAt: null,
          ...clone(c), name, phone, id: c.id || newId(), callBefore: !!c.callBefore,
        };
        db.clients.push(out);
      }
      out.marketingOptOut = isOptOut;
      if (isOptOut && !wasOptOut) {
        out.optOutAt = nowIso();
        out.optOutSource = c.optOutSource || 'manual';
      } else if (isOptOut) {
        out.optOutAt = before.optOutAt || null;
        out.optOutSource = before.optOutSource || null;
      } else {
        out.optOutAt = null;
        out.optOutSource = null;
      }
      write(db);
      return clone(out);
    },

    async listAppointments({ from, to, clientId, includeCancelled = false } = {}) {
      return clone(read().appointments
        .filter((a) => (includeCancelled || a.status !== 'cancelled')
          && (!from || a.date >= from) && (!to || a.date <= to)
          && (!clientId || a.clientId === clientId))
        .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin || a.id.localeCompare(b.id)));
    },
    async getAppointment(id) {
      const a = read().appointments.find((x) => x.id === id);
      return a ? clone(a) : null;
    },
    async saveAppointment(a) {
      const errs = validateAppointment(a);
      if (errs.length) throw new Error(errs.join(' · '));
      const db = read();
      const idx = a.id ? db.appointments.findIndex((x) => x.id === a.id) : -1;
      const prev = idx >= 0 ? db.appointments[idx] : null;
      const out = {
        status: 'booked', source: 'manual', note: '', cancelledBy: null, cancelledAt: null, cancelReason: '', calledAt: null,
        visitNote: '', nextStep: '', payment: null, everPaid: false, freeReason: null, closedAt: null,
        createdAt: nowIso(),
        ...(prev || {}),
        ...clone(a),
        id: a.id || newId(),
      };
      if (prev) {
        if (out.status === 'free' && prev.status !== 'free') assertNeverPaid(prev);
        out.everPaid = !!(prev.everPaid || out.everPaid); // לא מנקים אף פעם
      }
      if (prev) db.appointments[idx] = out; else db.appointments.push(out);
      write(db);
      return clone(out);
    },
    async patchAppointment(id, patch) {
      const db = read();
      const idx = db.appointments.findIndex((x) => x.id === id);
      if (idx < 0) throw new Error('התור לא נמצא');
      const cur = db.appointments[idx];
      const next = { ...cur, ...clone(patch || {}), id };
      if (next.status === 'free' && cur.status !== 'free') assertNeverPaid(cur);
      next.everPaid = !!(cur.everPaid || next.everPaid); // לא מנקים אף פעם
      db.appointments[idx] = next;
      write(db);
      return clone(db.appointments[idx]);
    },
    async payAppointment(id, { method, tip = 0 } = {}) {
      if (!method) throw new Error('חסר אמצעי תשלום');
      const db = read();
      const a = db.appointments.find((x) => x.id === id);
      if (!a) throw new Error('התור לא נמצא');
      if (a.status === 'cancelled') throw new Error('תור מבוטל לא משלמים');
      if (a.status === 'free') throw new Error('התור נסגר ללא תשלום');
      const from = a.status;
      a.status = 'paid';
      a.everPaid = true;
      a.payment = { method, amount: apptTotal(a), tip: Number(tip) || 0, paidAt: nowIso() };
      a.cancelledBy = null;
      a.cancelledAt = null;
      a.cancelReason = '';
      logAudit(db, 'pay', id, from, 'paid', `${method} · ${a.payment.amount} ₪ · טיפ ${a.payment.tip} ₪`);
      write(db);
      return clone(a);
    },
    async unpayAppointment(id) {
      const db = read();
      const a = db.appointments.find((x) => x.id === id);
      if (!a) throw new Error('התור לא נמצא');
      const from = a.status;
      a.status = 'arrived';
      a.payment = null; // everPaid נשאר
      logAudit(db, 'unpay', id, from, 'arrived', '');
      write(db);
      return clone(a);
    },
    async closeFree(id, { kind, note = '' } = {}) {
      const db = read();
      const a = db.appointments.find((x) => x.id === id);
      if (!a) throw new Error('התור לא נמצא');
      if (!Object.prototype.hasOwnProperty.call(FREE_REASONS, kind)) throw new Error('חסרה סיבה');
      const cleanNote = String(note || '').trim();
      if (kind === 'other' && !cleanNote) throw new Error('צריך לכתוב את הסיבה');
      if (a.status === 'cancelled') throw new Error('תור מבוטל לא נסגר');
      assertNeverPaid(a);
      const from = a.status;
      a.status = 'free';
      a.freeReason = { kind, note: cleanNote };
      a.closedAt = nowIso();
      a.payment = null;
      a.cancelledBy = null;
      a.cancelledAt = null;
      a.cancelReason = '';
      logAudit(db, 'closeFree', id, from, 'free', cleanNote ? `${kind} · ${cleanNote}` : kind);
      write(db);
      return clone(a);
    },
    async reopenFree(id) {
      const db = read();
      const a = db.appointments.find((x) => x.id === id);
      if (!a) throw new Error('התור לא נמצא');
      if (a.status !== 'free') throw new Error('התור לא נסגר ללא תשלום');
      a.status = 'arrived';
      a.freeReason = null;
      a.closedAt = null;
      logAudit(db, 'reopenFree', id, 'free', 'arrived', '');
      write(db);
      return clone(a);
    },
    async listAudit({ apptId } = {}) {
      const list = read().audit || [];
      return clone(list.filter((e) => !apptId || e.apptId === apptId)).reverse();
    },
    async setAppointmentStatus(id, status, { cancelledBy, reason } = {}) {
      const db = read();
      const a = db.appointments.find((x) => x.id === id);
      if (!a) throw new Error('התור לא נמצא');
      if (status === 'free') throw new Error('סגירה ללא תשלום נעשית בנפרד, עם סיבה');
      const from = a.status;
      a.status = status;
      if (status === 'cancelled') {
        a.cancelledBy = cancelledBy || 'owner';
        a.cancelledAt = nowIso();
        a.cancelReason = String(reason || '').trim();
        logAudit(db, 'cancel', id, from, 'cancelled', a.cancelReason ? `${a.cancelledBy} · ${a.cancelReason}` : a.cancelledBy);
      } else {
        a.cancelledBy = null;
        a.cancelledAt = null;
        a.cancelReason = '';
      }
      write(db);
      return clone(a);
    },

    async bookingDays(serviceId, { config, now = new Date() } = {}) {
      const db = read();
      const svc = db.services.find((s) => s.id === serviceId);
      if (publicMode(svc, config) !== 'book') return [];
      const today = todayYmd(now);
      const days = Number(config.daysAhead) || 42;
      const ctx = bookingCtx(db, today, addDays(today, days), config, now);
      return bookableDays(slotLength(svc, config), ctx, { from: today, days });
    },

    async bookOnline({ serviceId, date, startMin, name, phone, birthDate = null } = {}, { config, now = new Date() } = {}) {
      const typed = cleanName(name);
      if (!typed) throw codedError('חסר שם', 'name');
      const ph = normalizePhone(phone);
      if (!ph || !isMobilePhone(ph)) throw codedError('מספר הטלפון לא תקין', 'phone');
      const birth = birthParts(birthDate) && !(birthDate.length === 10 && birthDate > todayYmd(now)) ? birthDate : null;
      const db = read();
      const svc = db.services.find((s) => s.id === serviceId);
      if (publicMode(svc, config) !== 'book') throw codedError('את הטיפול הזה אי אפשר לקבוע כאן', 'service');
      const len = slotLength(svc, config);
      const start = Number(startMin);
      if (!isYmd(date) || !freeStarts(date, len, bookingCtx(db, date, date, config, now)).includes(start)) {
        throw codedError('השעה הזאת כבר לא פנויה', 'slot_taken');
      }
      const at = nowIso();
      let client = db.clients.find((c) => !c.deletedAt && c.phone === ph);
      const existingClient = !!client;
      if (!client) {
        client = {
          id: newId(), name: typed, phone: ph, email: '', birthDate: birth, notes: '', callBefore: false, returnWeeks: null,
          createdAt: at, deletedAt: null, marketingOptOut: false, optOutAt: null, optOutSource: null,
        };
        db.clients.push(client);
      }
      const nameDiffers = existingClient && !sameName(client.name, typed);
      const notes = nameDiffers ? [`נקבע על שם ${typed}`] : [];
      if (existingClient && birth) {
        const was = birthParts(client.birthDate);
        const got = birthParts(birth);
        const sameDay = was && was.m === got.m && was.d === got.d;
        if (!nameDiffers && (!was || (sameDay && was.y == null && got.y != null))) client.birthDate = birth;
        else if (!sameDay || (got.y != null && was.y != null && was.y !== got.y)) notes.push(`תאריך לידה: ${fmtBirth(birth)}`);
      }
      const appt = {
        id: newId(), clientId: client.id, date, startMin: start, durationMin: len,
        status: config.onlineStatus || 'booked', source: 'online',
        items: [{
          serviceId: svc.id, name: svc.name, shortName: svc.shortName, color: svc.color,
          price: svc.price, listPrice: svc.price, durationMin: svc.durationMin,
          ...(svc.travelMin ? { travelMin: svc.travelMin } : {}),
        }],
        note: notes.join(' · '), bookedName: typed,
        cancelledBy: null, cancelledAt: null, cancelReason: '', calledAt: null, visitNote: '', nextStep: '',
        payment: null, everPaid: false, freeReason: null, closedAt: null, noFollowUp: false, createdAt: at,
      };
      const errs = validateAppointment(appt);
      if (errs.length) throw new Error(errs.join(' · '));
      db.appointments.push(appt);
      write(db);
      return { appointment: clone(appt), client: clone(client), existingClient, nameDiffers };
    },

    async listBlocks() { return clone(read().blocks); },
    async getBlock(id) {
      const b = read().blocks.find((x) => x.id === id);
      return b ? clone(b) : null;
    },
    async saveBlock(b) {
      const norm = normalizeBlock(clone(b));
      checkBlock(norm);
      const db = read();
      const idx = norm.id ? db.blocks.findIndex((x) => x.id === norm.id) : -1;
      norm.id = norm.id || newId();
      if (idx >= 0) db.blocks[idx] = norm; else db.blocks.push(norm);
      write(db);
      return clone(norm);
    },
    async deleteBlock(id) {
      const db = read();
      db.blocks = db.blocks.filter((x) => x.id !== id);
      write(db);
    },
    async skipBlockOn(id, ymd) {
      const db = read();
      const b = db.blocks.find((x) => x.id === id);
      if (!b) throw new Error('האירוע לא נמצא');
      b.exceptions = Array.isArray(b.exceptions) ? b.exceptions : [];
      if (!b.exceptions.includes(ymd)) b.exceptions.push(ymd);
      write(db);
      return clone(b);
    },
    async overrideBlockOn(id, ymd, patch = {}) {
      const db = read();
      const idx = db.blocks.findIndex((x) => x.id === id);
      if (idx < 0) throw new Error('האירוע לא נמצא');
      const series = db.blocks[idx];
      if (!series.repeat || series.repeat === 'none') {
        const merged = normalizeBlock({ ...series, ...clone(patch), id });
        checkBlock(merged);
        db.blocks[idx] = merged;
        write(db);
        return clone(merged);
      }
      const one = normalizeBlock({
        title: series.title,
        startMin: series.startMin,
        durationMin: series.durationMin,
        allDay: series.allDay,
        ...clone(patch),
        id: newId(),
        date: patch.date || ymd,
        repeat: 'none',
        until: null,
        exceptions: [],
        movedFrom: { blockId: id, date: ymd },
      });
      checkBlock(one);
      series.exceptions = Array.isArray(series.exceptions) ? series.exceptions : [];
      if (!series.exceptions.includes(ymd)) series.exceptions.push(ymd);
      db.blocks.push(one);
      write(db);
      return clone(one);
    },

    async firstVisitIds() { return modelFirstVisitIds(read().appointments); },

    async resetDemo() {
      write(seed());
    },
    async exportAll() { return clone(read()); },
    subscribe(fn) {
      subscribers.add(fn);
      return () => { subscribers.delete(fn); };
    },
  };
}

let singleton = null;
export function getStore() {
  if (!singleton) singleton = createStore({ storage: window.localStorage, history: true });
  return singleton;
}
