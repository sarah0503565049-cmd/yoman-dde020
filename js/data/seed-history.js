
import { addDays, dow, todayYmd, nowMin } from '../lib/time.js';
import { expandBlocks } from '../lib/recur.js';
import { findConflicts } from '../lib/model.js';

const pad2 = (n) => String(n).padStart(2, '0');
const pad3 = (n) => String(n).padStart(3, '0');

const FIRST_F = ['הדס', 'ענבל', 'אורית', 'גלית', 'סיגל', 'רוני', 'אפרת', 'קרן', 'שני', 'מורן', 'עדי', 'ליאורה',
  'צביה', 'פנינה', 'יהודית', 'אילנה', 'רינה', 'טליה', 'שושנה', 'חגית', 'מירב', 'נגה'];
const FIRST_M = ['משה', 'יעקב', 'אליהו', 'חיים', 'שמעון', 'עמית', 'איתן', 'גיל', 'רון', 'ניר', 'עוזי', 'בני',
  'צבי', 'אהרון', 'מאיר', 'יגאל', 'שלמה', 'ארז', 'אסף', 'עידו', 'נתן', 'זאב'];
const LAST = ['לוי', 'מזרחי', 'פרץ', 'ביטון', 'אזולאי', 'חדד', 'עמר', 'גבאי', 'פרידמן', 'שפירא', 'אורן',
  'ברק', 'גל', 'טל', 'שגב', 'רביב', 'הראל', 'נחום', 'ששון', 'יוסף', 'דהן', 'קדוש', 'סויסה'];

export function historyClientNames() {
  const out = [];
  for (let i = 0; i < 22; i++) {
    out.push(`${FIRST_F[i]} ${LAST[i % LAST.length]}`);
    out.push(`${FIRST_M[i]} ${LAST[(i + 9) % LAST.length]}`);
  }
  return out;
}

const TREAT_W = [['svc-03', 30], ['svc-01', 14], ['svc-05', 9], ['svc-07', 9], ['svc-08', 9], ['svc-06', 5], ['svc-09', 5],
  ['svc-11', 4], ['svc-12', 4], ['svc-13', 4], ['svc-10', 3], ['svc-04', 2], ['svc-02', 1]];
const MAIN_W = TREAT_W.filter(([id]) => id !== 'svc-02' && id !== 'svc-04');
const PROD_W = [['svc-14', 35], ['svc-15', 25], ['svc-16', 15], ['svc-17', 15], ['svc-18', 10]];
const METHOD_W = [['אשראי', 42], ['ביט', 22], ['מזומן', 18], ['העברה בנקאית', 14], ["צ'ק", 4]];
const BASE_POOL = ['cl-01', 'cl-02', 'cl-03', 'cl-04', 'cl-05', 'cl-06', 'cl-07', 'cl-08', 'cl-09'];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(r, list) {
  const sum = list.reduce((s, [, w]) => s + w, 0);
  let x = r() * sum;
  for (const [v, w] of list) { x -= w; if (x < 0) return v; }
  return list[list.length - 1][0];
}

export function israelIso(ymd, min) {
  const [y, m, d] = ymd.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60);
  const probe = new Date(wall - 2 * 3600000);
  const off = (((nowMin(probe) - (probe.getUTCHours() * 60 + probe.getUTCMinutes())) % 1440) + 1440) % 1440;
  const t = new Date(wall - off * 60000);
  return todayYmd(t) === ymd ? t.toISOString() : new Date(wall - 2 * 3600000).toISOString();
}

const firstOfMonthsAgo = (ymd, n) => {
  const [y, m] = ymd.split('-').map(Number);
  const t = y * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${pad2((t % 12) + 1)}-01`;
};

export function buildHistory(today, db) {
  const settings = db.settings || {};
  const buffer = Number(settings.bufferMin) || 15;
  const services = new Map((db.services || []).map((s) => [s.id, s]));
  const hours = settings.clinicHours || {};
  const start = firstOfMonthsAgo(today, 11);
  const end = addDays(today, -7);

  const usedPhones = new Set((db.clients || []).map((c) => c.phone));
  const usedIds = new Set((db.clients || []).map((c) => c.id));
  const newClients = [];
  historyClientNames().forEach((name, i) => {
    const id = `hc-${pad2(i + 1)}`;
    const phone = `+97250555${String(201 + i).padStart(4, '0')}`;
    if (usedIds.has(id) || usedPhones.has(phone)) return;
    newClients.push({
      id, name, phone, email: '', birthDate: null, notes: '', createdAt: null, deletedAt: null,
      callBefore: false, returnWeeks: null, marketingOptOut: false, optOutAt: null, optOutSource: null,
    });
  });
  const known = new Set((db.clients || []).filter((c) => !c.deletedAt).map((c) => c.id));
  const basePool = BASE_POOL.filter((id) => known.has(id));
  const isBase = new Set(basePool);
  const baseCut = addDays(today, -21);

  const r0 = rng(hash(`clients|${today}`));
  const state = new Map();
  const startClient = (id, date) => {
    const weeks = r0() < 0.25 ? null : [3, 4, 4, 5, 6, 8][Math.floor(r0() * 6)];
    state.set(id, { id, weeks, due: date, main: weighted(r0, MAIN_W), visits: 0, last: null });
  };
  for (const id of basePool) startClient(id, addDays(start, Math.floor(r0() * 35)));
  const waiting = newClients.map((c) => c.id);

  const byDate = new Map();
  for (const a of db.appointments || []) {
    if (a.status === 'cancelled') continue;
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date).push(a);
  }

  const appts = [];
  let seq = 0;
  const itemOf = (id, price) => {
    const s = services.get(id);
    return { serviceId: s.id, name: s.name, shortName: s.shortName, color: s.color, price: price ?? s.price, listPrice: s.price, durationMin: s.durationMin };
  };

  for (let date = start; date <= end; date = addDays(date, 1)) {
    const w = dow(date);
    if (w > 4) continue;
    const range = (hours[w] || [])[0];
    if (!range) continue;
    const r = rng(hash(`day|${date}`));
    const [yy, mm] = date.split('-').map(Number);
    const monthIdx = (yy * 12 + mm) - (Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)));
    const season = [6, 7, 8].includes(mm) ? 0.35 : mm === 4 || mm === 10 ? -0.35 : 0;
    const expected = 2.1 + monthIdx * 0.06 + season + (rng(hash(`month|${date.slice(0, 7)}`))() - 0.5) * 0.5;
    let n = Math.round(expected + (r() + r() - 1) * 1.4);
    if (r() < 0.06) n = 0;
    n = Math.max(0, Math.min(5, n));
    if (!n) continue;

    const lunch = { blockId: '__lunch', date, startMin: 720, durationMin: 60 };
    const blocks = [...expandBlocks(db.blocks || [], date, date), lunch];
    const placed = [...(byDate.get(date) || [])];
    let cursor = range.from + [0, 0, 0, 30, 60, 90][Math.floor(r() * 6)];
    const todayIds = new Set(placed.map((a) => a.clientId));

    for (let k = 0; k < n; k++) {
      let cid = null;
      const free = (s) => !todayIds.has(s.id) && (!isBase.has(s.id) || date <= baseCut);
      const due = [...state.values()].filter((s) => s.weeks !== null && s.due <= date && free(s))
        .sort((x, y) => (x.due < y.due ? -1 : x.due > y.due ? 1 : x.id < y.id ? -1 : 1));
      if (due.length && r() < 0.72) cid = due[0].id;
      else if (waiting.length && r() < 0.7) { cid = waiting.shift(); startClient(cid, date); }
      else {
        const gap = addDays(date, -14);
        const any = [...state.values()].filter((s) => free(s) && (!s.last || s.last.date <= gap));
        if (any.length) cid = any[Math.floor(r() * any.length)].id;
        else if (waiting.length) { cid = waiting.shift(); startClient(cid, date); }
      }
      if (!cid) break;
      const st = state.get(cid);

      const svc = r() < 0.7 ? st.main : weighted(r, TREAT_W);
      const items = [itemOf(svc)];
      if ((svc === 'svc-03' || svc === 'svc-08') && r() < 0.1) items.push(itemOf('svc-09'));
      const dur = items.reduce((s, it) => s + it.durationMin, 0);

      let slot = null;
      for (let s = Math.ceil(cursor / 15) * 15; s + dur <= range.to; s += 15) {
        const c = findConflicts({ date, startMin: s, durationMin: dur }, placed, blocks, { bufferMin: buffer });
        if (!c.length) { slot = s; break; }
      }
      if (slot == null) break;
      cursor = slot + dur + buffer + [0, 0, 15, 30, 45, 60, 90][Math.floor(r() * 7)];

      const x = r();
      const status = x < 0.035 ? 'cancelled' : x < 0.06 ? 'noshow' : x < 0.08 ? 'free' : 'paid';
      const id = `hp-${pad3(++seq)}`;
      const fin = slot + dur;
      const a = {
        id, clientId: cid, date, startMin: slot, durationMin: dur, status, source: 'manual', items, note: '',
        createdAt: israelIso(addDays(date, -14 - Math.floor(r() * 20)), 600),
        cancelledBy: null, cancelledAt: null, cancelReason: '', calledAt: null, noFollowUp: false,
        visitNote: '', nextStep: '', payment: null, everPaid: false, freeReason: null, closedAt: null,
      };
      if (status === 'cancelled') {
        a.cancelledBy = r() < 0.7 ? 'client' : 'owner';
        a.cancelledAt = israelIso(addDays(date, -1), 900);
        a.cancelReason = a.cancelledBy === 'owner' && r() < 0.5 ? 'מחלה' : '';
      } else if (status === 'free') {
        a.freeReason = { kind: r() < 0.6 ? 'soldier' : 'family', note: '' };
        a.closedAt = israelIso(date, fin);
      } else if (status === 'paid') {
        if (r() < 0.06) items[0].price = Math.max(0, Math.round((items[0].listPrice * 0.9) / 10) * 10);
        if (r() < 0.3) {
          const p1 = weighted(r, PROD_W);
          items.push(itemOf(p1));
          if (r() < 0.12) {
            const p2 = weighted(r, PROD_W);
            if (p2 !== p1) items.push(itemOf(p2));
          }
        }
        const method = weighted(r, METHOD_W);
        const late = method === 'העברה בנקאית' && r() < 0.25;
        const paidOn = late ? addDays(date, 1 + Math.floor(r() * 2)) : date;
        a.everPaid = true;
        a.payment = {
          method,
          amount: items.reduce((s, it) => s + it.price, 0),
          tip: r() < 0.04 ? (r() < 0.6 ? 20 : 50) : 0,
          paidAt: israelIso(paidOn, late ? 600 : Math.min(fin + 5, 1435)),
        };
      }
      appts.push(a);
      placed.push(a);
      todayIds.add(cid);
      if (status !== 'cancelled') {
        st.visits += 1;
        st.last = a;
        if (st.weeks !== null) st.due = addDays(date, st.weeks * 7 + Math.floor(r() * 18) - 7);
      }
    }
  }

  const firstDate = new Map();
  for (const a of appts) if (!firstDate.has(a.clientId)) firstDate.set(a.clientId, a.date);
  const clients = newClients.filter((c) => firstDate.has(c.id)).map((c) => ({ ...c, createdAt: israelIso(addDays(firstDate.get(c.id), -3), 600) }));
  const isNew = new Set(clients.map((c) => c.id));
  for (const c of clients) {
    const last = [...appts].reverse().find((a) => a.clientId === c.id && (a.status === 'paid' || a.status === 'free'));
    if (last) last.noFollowUp = true;
  }
  return { clients, appointments: appts.filter((a) => isNew.has(a.clientId) || known.has(a.clientId)) };
}

export function addHistory(db, today) {
  if (db.historyAdded) return false;
  const h = buildHistory(db.seededOn || today, db);
  db.clients = [...(db.clients || []), ...h.clients];
  db.appointments = [...(db.appointments || []), ...h.appointments]
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin || a.id.localeCompare(b.id));
  db.historyAdded = true;
  return true;
}
