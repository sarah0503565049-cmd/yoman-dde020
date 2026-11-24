
import { addDays, diffDays, dow, weekStart } from '../lib/time.js';
import { expandBlocks } from '../lib/recur.js';
import { findConflicts } from '../lib/model.js';

const NOTIF_TITLE = 'זמן הודעות';

const SERVICE_ROWS = [
  ['טיפול בפטרת הציפורן - פוטותרפיה חד-פעמי', 'פוטותרפיה', 'פדיקור פרא-רפואי', 'treatment', 580, 90, '#8FB8E8'],
  ['סדרת פוטותרפיה לפטרת הציפורן - 6 טיפולים', 'סדרת פוטותרפיה', 'פדיקור פרא-רפואי', 'series', 3400, 90, '#6FA3DD'],
  ['פדיקור פרא-רפואי מלא', 'פרא-רפואי', 'פדיקור פרא-רפואי', 'treatment', 390, 90, '#7FCB7A'],
  ['פדיקור פרא-רפואי מלא כולל ביקור בית', 'ביקור בית', 'פדיקור פרא-רפואי', 'treatment', 620, 150, '#BFEBC3'],
  ['טיפול בחודרנית', 'חודרנית', 'פדיקור פרא-רפואי', 'treatment', 410, 60, '#EE8ACF'],
  ['אורטונקסיה - יישור ציפורן חודרנית', 'אורטונקסיה', 'פדיקור פרא-רפואי', 'treatment', 550, 60, '#F0705A'],
  ['הסרת יבלות ויראליות בשיטת פלזמה', 'יבלות', 'פדיקור פרא-רפואי', 'treatment', 390, 60, '#8ED6D0'],
  ['פדיקור טבעי', 'טבעי', 'פדיקור מפנק', 'treatment', 320, 60, '#D58BE0'],
  ['תרמותרפיה - טיפול פרפין', 'פרפין', 'טיפולי רגליים', 'treatment', 320, 45, '#F4D94E'],
  ['בנייה טיפולית לציפורן', 'בנייה', 'טיפולי רגליים', 'treatment', 550, 60, '#DDE9A8'],
  ['עיסוי ניקוז לימפטי לרגליים', 'לימפטי', 'טיפולי רגליים', 'treatment', 420, 60, '#2E9E5B'],
  ['רפלקסולוגיה', 'רפלקסולוגיה', 'טיפולי רגליים', 'treatment', 420, 60, '#3D5BF0'],
  ['מניקור פרא-רפואי', 'מניקור', 'טיפולי ידיים', 'treatment', 280, 60, '#56606B'],
  ['סרום נגד פטרת הציפורן', 'סרום', 'מוצרים למכירה', 'product', 130, 0, '#C9BBA6'],
  ['משחה טבעית נגד פטרת העור', 'משחה', 'מוצרים למכירה', 'product', 140, 0, '#C9BBA6'],
  ['טלק טיפול טבעי נגד פטרת', 'טלק', 'מוצרים למכירה', 'product', 180, 0, '#C9BBA6'],
  ['סבון אנטיספטי טבעי', 'סבון', 'מוצרים למכירה', 'product', 120, 0, '#C9BBA6'],
  ['ערכת גזירה', 'ערכה', 'מוצרים למכירה', 'product', 120, 0, '#C9BBA6'],
];

const CLIENT_NAMES = [
  'תמר גולן', 'יעל שחר', 'אורי נבון', 'רחל אדלר', 'דוד שגיא', 'מיכל רון',
  'אסתר פלד', 'יוסי כרמי', 'שירה אלון', 'חנה ברוש', 'אבי זמיר', 'ליאת דרור',
];

const pad2 = (n) => String(n).padStart(2, '0');

function buildSettings() {
  const day = [{ from: 540, to: 1080 }];
  return {
    businessName: 'Sarah B Cosmetics',
    dayStartMin: 420,
    dayEndMin: 1260,
    slotMin: 15,
    bufferMin: 15,
    returnWeeks: 4,
    returnWeeks: 4,
    defaultView: 'week',
    categories: ['פדיקור פרא-רפואי', 'פדיקור מפנק', 'טיפולי רגליים', 'טיפולי ידיים', 'מוצרים למכירה'],
    demo: true,
    paymentMethods: ['מזומן', 'אשראי', 'העברה בנקאית', 'ביט', 'צ\'ק'],
    clinicHours: { 0: [...day], 1: [...day], 2: [{ from: 780, to: 1080 }], 3: [...day], 4: [...day], 5: [], 6: [] },
  };
}

function buildServices() {
  return SERVICE_ROWS.map(([name, shortName, category, kind, price, durationMin, color], i) => ({
    id: `svc-${pad2(i + 1)}`, name, shortName, category, kind, price, durationMin, color, active: true, sort: i + 1,
  }));
}

function buildClients(today) {
  const created = `${addDays(today, -60)}T08:00:00.000Z`;
  return CLIENT_NAMES.map((name, i) => ({
    id: `cl-${pad2(i + 1)}`,
    name,
    phone: `+97250555${String(101 + i).padStart(4, '0')}`,
    birthDate: i === 2 ? '1984-05-12' : i === 6 ? '1991-09-03' : null,
    notes: i === 2 ? 'מעדיפ/ה תורים בבוקר' : i === 6 ? 'מעדיפ/ה תורים אחר הצהריים' : '',
    createdAt: created,
    deletedAt: null,
    callBefore: i === 7,
    returnWeeks: i === 10 ? 6 : null,
    marketingOptOut: i === 10,
    optOutAt: i === 10 ? `${addDays(today, -20)}T10:00:00.000Z` : null,
    optOutSource: i === 10 ? 'reply' : null,
  }));
}

function buildBlocks(today) {
  const ballet = addDays(weekStart(addDays(today, -30)), 2); // שלישי של השבוע של today-30
  let wed = addDays(today, 1);
  while (dow(wed) !== 3) wed = addDays(wed, 1);
  let fri = today;
  while (dow(fri) !== 5) fri = addDays(fri, 1);
  let closed = addDays(today, 8);
  while (dow(closed) > 4) closed = addDays(closed, 1);
  const mk = (n, title, date, startMin, durationMin, repeat = 'none', allDay = false) => ({
    id: `bl-${pad2(n)}`, title, date, startMin, durationMin, allDay, repeat, until: null, exceptions: [], movedFrom: null,
  });
  return [
    mk(1, NOTIF_TITLE, addDays(today, -30), 510, 30, 'daily'),
    mk(2, 'הפסקת אוכל', addDays(today, -30), 720, 60, 'daily'),
    mk(3, 'חוג', ballet, 720, 60, 'weekly'),
    mk(4, 'צילומים', wed, 780, 180),
    mk(5, 'פגישה', fri, 600, 60),
    mk(6, 'סגור', closed, 0, 1440, 'none', true),
  ];
}

function appointmentSpecs() {
  const T = true;
  return [
    [0, [2], 'paid', [-6, -4], { pref: [540] }],
    [0, [0], 'paid', [-5, -3], { pref: [630] }],
    [1, [7], 'paid', [-6, -3], { pref: [810] }],
    [2, [4], 'paid', [-5, -2], { pref: [870] }],
    [3, [2], 'paid', [-4, -1], { pref: [600], discount: 350 }],
    [4, [6], 'paid', [-4, -1], { pref: [930] }],
    [5, [8], 'paid', [-3, -1], { pref: [840] }],
    [6, [7], 'arrived', [-3, -1], { pref: [660] }],
    [7, [5], 'noshow', [-3, -1], { pref: [900] }],
    [8, [2], 'cancelled', [-3, -1], { pref: [570], cancelled: T }],
    [1, [12], 'free', [-6, -2], { pref: [960] }], // נסגר ללא תשלום: חייל/ת
    [4, [2], 'confirmed', null, { trio: 0 }],
    [5, [9], 'booked', null, { trio: 1 }],
    [11, [7], 'booked', null, { trio: 2 }],
    [10, [0], 'paid', [-29, -20], { pref: [600], old: true }],
    [7, [4], 'booked', [2, 7], { early: T }],
    [0, [2, 8], 'booked', [1, 7], { pref: [900] }],
    [3, [3], 'booked', [3, 7], { pref: [780] }],
    [1, [12], 'booked', [2, 9], { pref: [570] }],
    [9, [10], 'confirmed', [2, 6], { pref: [840] }],
    [3, [11], 'confirmed', [3, 7], { pref: [570] }],
    [8, [4], 'pending', [3, 9], { pref: [1020], online: T }],
    [6, [5], 'pending', [4, 10], { pref: [600], online: T }],
    [4, [7], 'booked', [6, 11], { pref: [930] }],
    [7, [7], 'booked', null, { nextWorkday: T, pref: [570] }],
  ];
}

export function buildSeed(today) {
  const settings = buildSettings();
  const services = buildServices();
  const clients = buildClients(today);
  const blocks = buildBlocks(today);
  const notif = blocks[0];

  const clinicOf = (ymd) => settings.clinicHours[dow(ymd)] || [];
  const anchor = (() => { // היום, או ראשון הקרוב כשסגור
    let d = today;
    while (dow(d) > 4) d = addDays(d, 1);
    return d;
  })();
  const trioTimes = dow(anchor) === 2 ? [780, 885, 1005] : [570, 810, 960];

  const placed = [];

  function fits(date, start, dur, free, ignoreNotif) {
    if (!free && !clinicOf(date).some((r) => start >= r.from && start + dur <= r.to)) return false;
    const cand = { date, startMin: start, durationMin: dur };
    let conflicts = findConflicts(cand, placed, expandBlocks(blocks, date, date), { bufferMin: settings.bufferMin });
    if (ignoreNotif) conflicts = conflicts.filter((c) => !(c.type === 'block' && c.ref.title === NOTIF_TITLE));
    return conflicts.length === 0;
  }

  function place(dur, win, opt) {
    const past = win[1] < 0;
    const wins = opt.trio != null || opt.nextWorkday || opt.old ? [win] : [win, past ? [-6, -1] : [1, 12]];
    for (const [lo, hi] of wins) {
      for (let off = lo; off <= hi; off++) {
        const date = addDays(today, off);
        const w = dow(date);
        if (!opt.early && w > 4) continue;
        if (opt.early && (w > 4 || w === 2)) continue;
        const starts = [];
        if (opt.early) starts.push(480);
        else if (opt.trio != null) starts.push(trioTimes[opt.trio]);
        else {
          starts.push(...(opt.pref || []));
          for (const r of clinicOf(date)) for (let m = r.from; m < r.to; m += 15) starts.push(m);
        }
        for (const s of starts) if (fits(date, s, dur, !!opt.early, !!opt.early)) return { date, startMin: s };
      }
    }
    throw new Error(`seed: לא נמצאה משבצת לתור (today=${today})`);
  }

  const specs = appointmentSpecs().map((s, i) => ({ s, i }));
  const order = [
    ...specs.filter(({ s }) => s[4].trio != null),
    ...specs.filter(({ s }) => s[4].early),
    ...specs.filter(({ s }) => s[4].nextWorkday),
    ...specs.filter(({ s }) => s[4].trio == null && !s[4].early && !s[4].nextWorkday),
  ];
  let nextWork = addDays(today, 1);
  while (dow(nextWork) > 4) nextWork = addDays(nextWork, 1);
  const nextWorkOff = diffDays(today, nextWork);

  const byIndex = new Map();
  let paidCount = 0;
  for (const { s, i } of order) {
    const [ci, svcIdx, status, win, opt] = s;
    const items = svcIdx.map((k) => {
      const v = services[k];
      return {
        serviceId: v.id, name: v.name, shortName: v.shortName, color: v.color,
        listPrice: v.price, price: opt.discount != null ? opt.discount : v.price, durationMin: v.durationMin,
      };
    });
    const dur = items.reduce((a, it) => a + it.durationMin, 0);
    const slot = opt.trio != null ? place(dur, [diffDays(today, anchor), diffDays(today, anchor)], opt)
      : opt.nextWorkday ? place(dur, [nextWorkOff, nextWorkOff], opt) : place(dur, win, opt);
    if (opt.trio != null && slot.date !== anchor) throw new Error('seed: עוגן היום');
    const ap = {
      id: `ap-${pad2(i + 1)}`,
      clientId: clients[ci].id,
      date: slot.date,
      startMin: slot.startMin,
      durationMin: dur,
      status,
      source: opt.online ? 'online' : 'manual',
      items,
      note: '',
      createdAt: opt.online ? `${today}T07:00:00.000Z` : `${addDays(slot.date, -3)}T09:00:00.000Z`,
      cancelledBy: opt.cancelled ? 'client' : null,
      cancelledAt: opt.cancelled ? `${addDays(slot.date, -1)}T10:00:00.000Z` : null,
      calledAt: null,
      noFollowUp: false,
      visitNote: '',
      nextStep: '',
      payment: null,
      everPaid: status === 'paid',
      freeReason: status === 'free' ? { kind: 'soldier', note: '' } : null,
      closedAt: status === 'free'
        ? `${slot.date}T${pad2(Math.floor((slot.startMin + dur) / 60))}:${pad2((slot.startMin + dur) % 60)}:00.000Z`
        : null,
    };
    if (status === 'paid') {
      const k = paidCount++;
      const end = slot.startMin + dur;
      ap.payment = {
        method: settings.paymentMethods[k % settings.paymentMethods.length],
        amount: items.reduce((s, it) => s + it.price, 0),
        tip: k === 1 ? 10 : 0,
        paidAt: `${slot.date}T${pad2(Math.floor(end / 60))}:${pad2(end % 60)}:00.000Z`,
      };
    }
    if (opt.early) notif.exceptions.push(slot.date);
    placed.push(ap);
    byIndex.set(i, ap);
  }

  const tamarPaid = [...placed].filter((a) => a.clientId === clients[0].id && a.status === 'paid')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  for (const a of tamarPaid) a.visitNote = 'טיפול מלא. העור בעקבים יבש, הומלץ קרם כל ערב.';
  tamarPaid[tamarPaid.length - 1].nextStep = 'בעוד חודש: לבדוק אם ממשיכים בפדיקור רגיל.';

  const appointments = specs.map(({ i }) => byIndex.get(i))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin || a.id.localeCompare(b.id));

  return { version: 1, seededOn: today, settings, services, clients, appointments, blocks, audit: [] };
}
