
import { addDays, diffDays, todayYmd, nowMin } from './time.js';
import {
  getMessage, messageOn, messageText, mayReceive, missingVars, fillMessage, varsFor,
  reminderTimes, reviewTime, afterCareFor, afterCareTime, payReminderTime, comeBackTime, birthdayTime,
  isQuiet, outOfQuiet, LINKS,
} from './messages.js';
import { apptTotal, apptTravel, firstVisitIds, isVisit, normalizePhone } from './model.js';

export const WINDOWS = {
  reminder24EndBeforeStartMin: 120,    // 5ב: לא שולחים פחות משעתיים לפני התור
  reminder48FallbackBeforeStartMin: 360, // 5 ו-6: נגמרת כש-5ב מגיעה (ואם אין 5ב, 6 שעות לפני התור)
  cancelMaxMin: 3 * 1440,              // 11, 12: עד שלושה ימים אחרי הביטול, ולא אחרי שהתור התחיל
  afterPlasmaHours: 20,                // 16: ההנחיות הן ל-24 השעות הראשונות, אחרי 20 שעות כבר מאוחר
  afterFungusHours: 48,                // 17: ההמשך בבית לא תלוי בשעה
  reviewHours: 16,                     // 15: עד 12:00 למחרת (20:00 + 16 שעות). יומיים אחרי לא שולחים
  payReminderDays: 5,                  // 18: עד חמישה ימים אחרי השעה שלו
  comeBackDays: 7,                     // 19: שבוע אחרי השעה שלו. בהפעלה ראשונה כלום ממה שקדם להפעלה
};

export const NOT_DERIVED = {
  'book-link': 'יוצאת בלחיצה מכרטיס הלקוח/ה, לא לפי כלל זמן',
  health: 'חסר טופס בריאות וסימון "מולא"',
  'before-care': 'חסר דף הנחיות לטיפול',
  'photo-form': 'חסר טופס הסכמה וסימון "מולא"',
  'photo-form-again': 'חסר טופס הסכמה וסימון "מולא"',
  'freed-slot': 'חסר דף העברת התור (offer). הכלל קיים (freedSlotOffers) ויחובר כשהדף יהיה',
  receipt: 'יוצאת מהקופה, ועוד אין דף קבלה',
  voucher: 'יוצאת מהקופה, ועוד אין דף שובר',
};

const EPOCH = '2000-01-01';
const abs = (r) => diffDays(EPOCH, r.date) * 1440 + r.min;
const fromAbs = (n) => { const d = Math.floor(n / 1440); return { date: addDays(EPOCH, d), min: n - d * 1440 }; };
const plus = (r, min) => fromAbs(abs(r) + min);

export function wallOf(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : { date: todayYmd(d), min: nowMin(d) };
}
export const nowOf = (d = new Date()) => ({ date: todayYmd(d), min: nowMin(d) });

const slotOf = (a) => ({ date: a.date, startMin: a.startMin });
const sameSlot = (s, a) => !!s && s.date === a.date && s.startMin === a.startMin;
const INFORMED = ['booked', 'approved', 'updated'];

function markOn(a, id, slotAware) {
  const m = a.msgs && a.msgs[id];
  if (!m) return null;
  return slotAware && m.slot && !sameSlot(m.slot, a) ? null : m;
}

function lastSlotMark(a) {
  let best = null;
  for (const id of INFORMED) {
    const m = a.msgs && a.msgs[id];
    if (!m || !m.slot) continue;
    if (!best || Date.parse(m.at) >= Date.parse(best.at)) best = m;
  }
  return best;
}

const informed = (a) => INFORMED.some((id) => a.msgs && a.msgs[id]);

export function defaultLinkFor(kind, appt, settings) {
  const base = String((settings && settings.linkBase) || '').trim();
  if (!/^https?:\/\//.test(base)) return null;
  const root = base.endsWith('/') ? base : base + '/';
  if (kind === 'book') return root + 'book.html';
  if (kind === 'myappt') return appt && appt.token ? `${root}book.html#/my/${encodeURIComponent(appt.token)}` : null;
  return null;
}

export function sendablePhone(phone) {
  const p = normalizePhone(phone);
  if (!p) return null;
  if (p.startsWith('+972') && !/^\+9725\d{8}$/.test(p)) return null;
  return p;
}

const LINK_REASON = {
  myappt: 'לתור אין עדיין קישור אישי',
  book: 'כתובת דף קביעת התור עוד לא הוגדרה',
  form: 'דף הטופס עוד לא קיים',
  receipt: 'דף הקבלה עוד לא קיים',
  voucher: 'דף השובר עוד לא קיים',
  offer: 'דף העברת התור עוד לא קיים',
};

function reasonFor(msg, missing, appt, linkBase) {
  if (missing.includes('קישור')) {
    const kind = msg.link;
    const text = kind === 'myappt' && !linkBase ? 'כתובת הבסיס של הקישורים עוד לא הוגדרה' : LINK_REASON[kind] || `חסר ${LINKS[kind] || 'קישור'}`;
    return { code: 'link', text };
  }
  if (missing.includes('פייבוקס') || missing.includes('חשבון')) return { code: 'pay', text: 'פרטי התשלום עוד לא מולאו בהגדרות' };
  if (missing.includes('טיפול')) return { code: 'items', text: 'לתור אין שם טיפול' };
  return { code: 'vars', text: `חסר: ${missing.join(', ')}` };
}

const dayEnd = (r) => fromAbs(abs({ date: r.date, min: 0 }) + 1440);

export function computeOutbox(state, now, opt = {}) {
  const settings = state.settings || {};
  const linkFor = opt.linkFor || defaultLinkFor;
  const own = settings.outbox && wallOf(settings.outbox.startedAt);
  const started = own || (settings.demo ? { date: now.date, min: 0 } : null);
  const out = { active: !!started, due: [], later: [], notSendable: [], dropped: [] };
  if (!started) return out;
  const startedAbs = abs(started);
  const nowAbs = abs(now);
  const clients = new Map((state.clients || []).map((c) => [c.id, c]));
  const appts = state.appointments || [];
  const firstIds = firstVisitIds(appts);
  const quietNow = isQuiet(now);
  const cands = [];

  const SKEW_MIN = 5;
  const push = (c) => {
    if (c.eventAt) {
      if (abs(c.dueAt) > nowAbs + SKEW_MIN) { out.dropped.push({ key: c.key, msgId: c.msgId, reason: 'event-in-future' }); return; }
      if (abs(c.dueAt) > nowAbs) c.dueAt = now;
    }
    cands.push(c);
  };
  const apptCand = (a, msgId, extra) => ({
    msgId, apptId: a.id, clientId: a.clientId, target: 'appt', markId: a.id, markKey: msgId, appt: a,
    key: `${a.id}|${msgId}|${a.date}T${a.startMin}`, slot: slotOf(a), ...extra,
  });

  const byClient = new Map();
  for (const a of appts) {
    if (!a.clientId) continue;
    if (!byClient.has(a.clientId)) byClient.set(a.clientId, []);
    byClient.get(a.clientId).push(a);
  }

  for (const a of appts) {
    const client = clients.get(a.clientId);
    const start = { date: a.date, min: a.startMin };
    const startAbs = abs(start);
    const held = a.needsReview === true;
    if (held && (a.status === 'booked' || a.status === 'confirmed' || a.status === 'cancelled')) {
      out.dropped.push({ key: `${a.id}|held`, msgId: null, reason: 'needs-review' });
    }

    if (!held && (a.status === 'booked' || a.status === 'confirmed')) {
      let eventAbs = Math.max(abs(wallOf(a.createdAt) || { date: EPOCH, min: 0 }), a.approvedAt ? abs(wallOf(a.approvedAt) || { date: EPOCH, min: 0 }) : 0);
      for (const id of INFORMED) {
        const m = markOn(a, id, true);
        const w = m && wallOf(m.at);
        if (w) eventAbs = Math.max(eventAbs, abs(w));
      }
      if (!informed(a)) {
        const event = wallOf(a.approvedAt) || wallOf(a.createdAt);
        const msgId = a.approvedAt ? 'approved' : 'booked';
        if (event) push(apptCand(a, msgId, { dueAt: event, expireAt: start, eventAt: true }));
        else out.dropped.push({ key: `${a.id}|${msgId}`, msgId, reason: 'no-event-time' });
        eventAbs = Math.max(eventAbs, nowAbs);
      } else {
        const lm = lastSlotMark(a);
        if (lm && !sameSlot(lm.slot, a)) {
          push(apptCand(a, 'updated', { dueAt: now, expireAt: start }));
          eventAbs = Math.max(eventAbs, nowAbs);
        }
      }

      const list = reminderTimes(a, null, client);
      const t48 = list.find((r) => r.id === 'reminder-48');
      const t24 = list.find((r) => r.id === 'reminder-24');
      const covered = (r) => eventAbs > abs(r);
      if (t48 && a.status !== 'confirmed' && !covered(t48)) {
        const expireAt = t24 ? t24 : plus(start, -WINDOWS.reminder48FallbackBeforeStartMin);
        if (!markOn(a, 'reminder-48', true)) push(apptCand(a, 'reminder-48', { dueAt: t48, expireAt }));
        if (firstIds.has(a.id) && apptTravel(a) === 0 && !markOn(a, 'way', true)) push(apptCand(a, 'way', { dueAt: t48, expireAt }));
      } else if (t48 && covered(t48)) out.dropped.push({ key: `${a.id}|reminder-48`, msgId: 'reminder-48', reason: 'covered' });
      if (t24 && !covered(t24) && !markOn(a, 'reminder-24', true)) {
        push(apptCand(a, 'reminder-24', { dueAt: t24, expireAt: plus(start, -WINDOWS.reminder24EndBeforeStartMin) }));
      } else if (t24 && covered(t24)) out.dropped.push({ key: `${a.id}|reminder-24`, msgId: 'reminder-24', reason: 'covered' });
    }

    if (!held && a.status === 'cancelled' && a.cancelledAt && startAbs > nowAbs) {
      const msgId = a.cancelledBy === 'owner' ? 'cancel-owner' : 'cancel-client';
      const cw = wallOf(a.cancelledAt);
      const m = a.msgs && a.msgs[msgId];
      const doneNow = m && Date.parse(m.at) >= Date.parse(a.cancelledAt);
      if (!doneNow && cw) {
        if (informed(a) || (a.source === 'online' && !a.rejectedAt)) {
          push(apptCand(a, msgId, { dueAt: cw, expireAt: fromAbs(Math.min(startAbs, abs(cw) + WINDOWS.cancelMaxMin)), eventAt: true }));
        } else out.dropped.push({ key: `${a.id}|${msgId}`, msgId, reason: 'client-never-informed' });
      }
    }

    if (isVisit(a) && a.date <= now.date) {
      const careId = afterCareFor(a);
      if (careId && !markOn(a, careId, false)) {
        const dueAt = afterCareTime(a);
        const hours = careId === 'after-plasma' ? WINDOWS.afterPlasmaHours : WINDOWS.afterFungusHours;
        push(apptCand(a, careId, { dueAt, expireAt: plus(dueAt, hours * 60) }));
      }
      if (a.status === 'arrived' && !markOn(a, 'pay-reminder', false)) {
        const dueAt = payReminderTime(a);
        push(apptCand(a, 'pay-reminder', { dueAt, expireAt: plus(dueAt, WINDOWS.payReminderDays * 1440), extra: { 'סכום': String(apptTotal(a)) } }));
      }
    }
  }

  for (const [clientId, list] of byClient) {
    const client = clients.get(clientId);
    if (!client) continue;
    const visits = list.filter((a) => isVisit(a) && a.date <= now.date)
      .sort((x, y) => (x.date === y.date ? x.startMin - y.startMin : x.date < y.date ? -1 : 1));
    if (visits.length && !list.some((a) => a.msgs && a.msgs.review)) {
      const a = visits.find((v) => abs(reviewTime(v)) >= startedAbs);
      if (a) {
        const dueAt = reviewTime(a);
        push(apptCand(a, 'review', { dueAt, expireAt: plus(dueAt, WINDOWS.reviewHours * 60) }));
      }
    }
    const last = visits[visits.length - 1];
    if (last && !last.noFollowUp && !client.callBefore) {
      const future = list.some((a) => ['pending', 'booked', 'confirmed'].includes(a.status) && abs({ date: a.date, min: a.startMin }) > nowAbs);
      const markKey = `come-back:${last.id}`;
      if (!future && !(client.msgs && client.msgs[markKey])) {
        const dueAt = comeBackTime(last, client, settings);
        push({
          msgId: 'come-back', apptId: last.id, clientId, target: 'client', markId: clientId, markKey, appt: null,
          key: `${clientId}|${markKey}`, slot: null, dueAt, expireAt: plus(dueAt, WINDOWS.comeBackDays * 1440),
        });
      }
    }
  }
  const year = Number(now.date.slice(0, 4));
  for (const client of clients.values()) {
    for (const y of [year - 1, year, year + 1]) {
      const dueAt = birthdayTime(client, y);
      const markKey = `birthday:${y}`;
      if (!dueAt || (client.msgs && client.msgs[markKey])) continue;
      push({
        msgId: 'birthday', apptId: null, clientId: client.id, target: 'client', markId: client.id, markKey, appt: null,
        key: `${client.id}|${markKey}`, slot: null, dueAt, expireAt: dayEnd(dueAt),
      });
    }
  }

  for (const c of cands) {
    const msg = getMessage(c.msgId);
    const client = clients.get(c.clientId);
    const drop = (reason) => out.dropped.push({ key: c.key, msgId: c.msgId, reason });
    if (!messageOn(msg, settings)) { drop('off'); continue; }
    if (!client) { drop('no-client'); continue; }
    if (!mayReceive(msg, client)) { drop('opt-out'); continue; }
    if (abs(c.dueAt) < startedAbs && c.msgId !== 'updated') { drop('before-start'); continue; }
    const expireAbs = abs(c.expireAt);
    if (nowAbs >= expireAbs) { drop('expired'); continue; }
    const sendFrom = isQuiet(c.dueAt) ? outOfQuiet(c.dueAt, 'after') : c.dueAt;
    if (abs(sendFrom) >= expireAbs) { drop('quiet-expired'); continue; }

    let bucket;
    let availableAt = null;
    let held = false;
    if (nowAbs < abs(sendFrom)) {
      if (sendFrom.date !== now.date) continue;   // לא היום: עוד לא מוצג
      bucket = 'later';
      availableAt = sendFrom;
    } else if (quietNow) {
      availableAt = outOfQuiet(now, 'after');
      if (abs(availableAt) >= expireAbs) { drop('quiet-expired'); continue; }
      bucket = 'later';
      held = true;   // הגיעה, אבל עכשיו שבת או חג
    } else bucket = 'due';

    const appt = c.appt;
    const link = msg.link ? linkFor(msg.link, appt, settings) || null : null;
    const extra = { ...(c.extra || {}) };
    if (msg.link) extra['קישור'] = link;
    const vars = varsFor(appt, client, { settings, ...extra });
    const text = messageText(msg, settings);
    const missing = missingVars(text, vars);
    const to = sendablePhone(client.phone);
    const item = {
      key: c.key, msgId: c.msgId, n: msg.n, title: msg.title, apptId: c.apptId, clientId: c.clientId, clientName: client.name,
      to, text: fillMessage(text, vars), vars, dueAt: { date: c.dueAt.date, min: c.dueAt.min }, group: msg.group,
      target: c.target, markId: c.markId, markKey: c.markKey, slot: c.slot,
      availableAt: availableAt && { date: availableAt.date, min: availableAt.min }, held,
    };
    let reason = null;
    if (!to) reason = { code: 'phone', text: 'אין מספר נייד שאפשר לשלוח אליו בוואטסאפ' };
    else if (missing.length) reason = reasonFor(msg, missing, appt, String(settings.linkBase || '').trim());
    if (reason) out.notSendable.push({ ...item, reason: reason.text, reasonCode: reason.code, bucket });
    else out[bucket].push(item);
  }
  const order = (x, y) => abs(x.dueAt) - abs(y.dueAt) || (x.key < y.key ? -1 : 1);
  for (const k of ['due', 'later', 'notSendable']) out[k].sort(order);
  return out;
}

export function markFor(item, via, atIso) {
  const m = { at: atIso, via };
  if (item.target === 'appt' && item.slot) m.slot = { ...item.slot };
  return m;
}

export const markPatch = (row, markKey, mark) => ({ msgs: { ...((row && row.msgs) || {}), [markKey]: mark } });

export function mergeMsgs(a, b) {
  const out = { ...(a || {}) };
  for (const [k, m] of Object.entries(b || {})) {
    if (!out[k] || Date.parse(m.at) > Date.parse(out[k].at)) out[k] = m;
  }
  return out;
}

export function activation(state, now, atIso) {
  const nowAbs = abs(now);
  const marks = [];
  for (const a of state.appointments || []) {
    if (!['booked', 'confirmed'].includes(a.status) || informed(a)) continue;
    if (abs({ date: a.date, min: a.startMin }) <= nowAbs) continue;
    marks.push({ apptId: a.id, markKey: 'booked', mark: { at: atIso, via: 'baseline', slot: slotOf(a) } });
  }
  return { settingsPatch: { outbox: { startedAt: atIso } }, marks };
}
