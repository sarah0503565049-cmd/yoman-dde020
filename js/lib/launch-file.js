
import { normalizePhone, validateAppointment, validateBlock } from './model.js';
import { isYmd } from './time.js';

export const LAUNCH_FORMAT = 'torim-launch';
export const LAUNCH_VERSION = 1;

const SETTINGS_KEYS = ['incomeImport', 'categories'];
const KINDS = ['treatment', 'product', 'series'];
const REPEATS = ['none', 'daily', 'weekly'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const normName = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

export const SECTIONS = [
  { key: 'clients', label: 'לקוחות' },
  { key: 'services', label: 'פריטים' },
  { key: 'blocks', label: 'אירועים קבועים' },
  { key: 'appointments', label: 'תורים' },
];

function rowErrors(section, r) {
  if (!isObj(r) || typeof r.id !== 'string' || !r.id) return 'שורה בלי מזהה';
  if (section === 'services') {
    if (!String(r.name || '').trim()) return 'פריט בלי שם';
    if (!KINDS.includes(r.kind)) return 'פריט עם סוג לא מוכר';
    if (!(Number(r.price) >= 0) || !(Number(r.durationMin) >= 0)) return 'פריט עם מחיר או משך לא תקינים';
  } else if (section === 'clients') {
    if (!String(r.name || '').trim()) return 'לקוח/ה בלי שם';
    if (!r.phone || normalizePhone(r.phone) !== r.phone) return 'לקוח/ה עם טלפון לא תקין';
    if (typeof r.marketingOptOut !== 'boolean') return 'לקוח/ה בלי סימון הודעות פרסום';
  } else if (section === 'blocks') {
    if (!isYmd(r.date)) return 'אירוע בלי תאריך תקין';
    if (!REPEATS.includes(r.repeat || 'none')) return 'אירוע עם חזרה לא מוכרת';
    if (validateBlock(r).length) return 'אירוע לא תקין';
  } else if (section === 'appointments') {
    if (!isYmd(r.date)) return 'תור בלי תאריך תקין';
    if (validateAppointment(r).length) return 'תור לא תקין';
    if (!r.items.every((it) => it && typeof it.serviceId === 'string')) return 'תור עם פריט לא תקין';
  }
  return null;
}

export function planImport(file, state) {
  const out = { fatal: [], already: false, problems: [], counts: {}, settings: { add: [] }, canImport: false, batch: null };
  const st = state || {};
  if (!isObj(file)) { out.fatal.push('הקובץ לא נראה כמו קובץ עלייה.'); return out; }
  if (file.format !== LAUNCH_FORMAT) out.fatal.push('הקובץ לא נראה כמו קובץ עלייה של היומן.');
  else if (file.version !== LAUNCH_VERSION) out.fatal.push('גרסת הקובץ לא מוכרת.');
  for (const { key, label } of SECTIONS) if (!Array.isArray(file[key])) out.fatal.push(`בקובץ חסר החלק: ${label}.`);
  if (file.settings != null && !isObj(file.settings)) out.fatal.push('חלק ההגדרות בקובץ לא תקין.');
  if (typeof file.launchId !== 'string' || !file.launchId) out.fatal.push('בקובץ אין מזהה עלייה.');
  if (out.fatal.length) return out;

  const settings = st.settings || {};
  if ((settings.importedLaunches || []).includes(file.launchId)) { out.already = true; return out; }

  const probs = new Map();
  const bump = (text) => probs.set(text, (probs.get(text) || 0) + 1);
  const cur = {
    services: st.services || [], clients: st.clients || [], appointments: st.appointments || [], blocks: st.blocks || [],
  };
  const add = { services: [], clients: [], appointments: [], blocks: [] };
  for (const { key } of SECTIONS) out.counts[key] = { file: file[key].length, add: 0, have: 0, bad: 0 };

  const haveIds = Object.fromEntries(Object.keys(cur).map((k) => [k, new Set(cur[k].map((x) => x.id))]));
  const phoneToId = new Map(cur.clients.filter((c) => !c.deletedAt).map((c) => [c.phone, c.id]));   // אותו טלפון = אותו כרטיס
  const filePhones = new Set();
  const idMap = new Map();   // מזהה לקוח/ה בקובץ ⇐ מזהה הכרטיס באפליקציה (כרטיס שכבר נפתח בלי הקובץ)
  const haveNames = new Set(cur.services.map((s) => normName(s.name)));
  const seenIds = { services: new Set(), clients: new Set(), appointments: new Set(), blocks: new Set() };
  const knownClients = new Set(cur.clients.map((c) => c.id));

  for (const { key } of SECTIONS) {
    for (const r0 of file[key]) {
      const c = out.counts[key];
      const err = rowErrors(key, r0);
      if (err) { c.bad += 1; bump(err); continue; }
      if (seenIds[key].has(r0.id)) { c.bad += 1; bump('שורה כפולה בתוך הקובץ'); continue; }
      seenIds[key].add(r0.id);
      let r = r0;
      if (key === 'clients') {
        if (haveIds.clients.has(r.id)) { c.have += 1; continue; }
        if (!r.deletedAt) {
          if (filePhones.has(r.phone)) { c.bad += 1; bump('טלפון כפול בתוך הקובץ'); continue; }
          filePhones.add(r.phone);
          if (phoneToId.has(r.phone)) { idMap.set(r.id, phoneToId.get(r.phone)); c.have += 1; continue; }
          phoneToId.set(r.phone, r.id);
        }
        knownClients.add(r.id);
      } else if (haveIds[key].has(r.id)) { c.have += 1; continue; }
      if (key === 'services') {
        if (haveNames.has(normName(r.name))) { c.have += 1; continue; }
        haveNames.add(normName(r.name));
      }
      if (key === 'appointments') {
        const cid = idMap.get(r.clientId) || r.clientId;
        if (!knownClients.has(cid)) { c.bad += 1; bump('תור שאין לו כרטיס לקוח/ה'); continue; }
        if (cid !== r.clientId) r = { ...r, clientId: cid };
      }
      add[key].push(r);
      c.add += 1;
    }
  }

  const patch = {};
  for (const [k, v] of Object.entries(file.settings || {})) {
    if (!SETTINGS_KEYS.includes(k)) { bump('הגדרה שהקובץ לא רשאי לשנות'); continue; }
    if (k === 'categories') {
      if (!Array.isArray(v)) continue;
      const merged = [...new Set([...(settings.categories || []), ...v.filter((x) => typeof x === 'string')])];
      if (merged.length !== (settings.categories || []).length) { patch.categories = merged; out.settings.add.push('קטגוריות'); }
    } else if (k === 'incomeImport') {
      if (isObj(v) && isObj(v.months) && /^\d{4}-\d{2}$/.test(String(v.upTo))) { patch.incomeImport = v; out.settings.add.push('הכנסות מלפני היומן'); }
      else bump('הכנסות מלפני היומן בצורה לא תקינה');
    }
  }
  out.problems = [...probs].map(([text, count]) => ({ text, count }));
  const total = add.services.length + add.clients.length + add.appointments.length + add.blocks.length + Object.keys(patch).length;
  out.canImport = total > 0;
  out.batch = { launchId: file.launchId, settings: patch, ...add };
  return out;
}
