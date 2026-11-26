
import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Page, Section, Card, List, Row, Button, Field, Select, Toggle, Loader, Dot, toast, confirmSheet } from '../ui/bits.js';
import { useData } from '../ui/hooks.js';
import { getStore } from '../data/store.js';
import { DAY_NAMES, timeOptions } from '../lib/time.js';
import { syncInfo } from '../boot.js';
import MfaSection from './mfa.js';   // הקוד מהטלפון (מצב אמיתי בלבד)

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;   // 1440 = 24:00
const opts = (from, to, step) => timeOptions(from, to + 1, step).map((m) => ({ value: m, label: hhmm(m) }));
const START_OPTS = opts(0, 22 * 60, 60);
const END_OPTS = opts(60, 24 * 60, 60);
const FROM_OPTS = opts(0, 23 * 60 + 30, 30);
const TO_OPTS = opts(30, 24 * 60, 30);
const RETURN_OPTS = [
  { value: 2, label: 'שבועיים' }, { value: 3, label: '3 שבועות' }, { value: 4, label: '4 שבועות' },
  { value: 5, label: '5 שבועות' }, { value: 6, label: '6 שבועות' }, { value: 8, label: 'חודשיים' },
];
const BUFFER_OPTS = [0, 5, 10, 15, 20, 30].map((n) => ({ value: n, label: `${n} דקות` }));

async function save(patch) {
  await getStore().saveSettings(patch);
  toast('נשמר');
}

function DiaryHours({ settings }) {
  const [start, setStart] = useState(settings.dayStartMin);
  const [end, setEnd] = useState(settings.dayEndMin);
  const [error, setError] = useState('');
  useEffect(() => { setStart(settings.dayStartMin); setEnd(settings.dayEndMin); setError(''); }, [settings.dayStartMin, settings.dayEndMin]);

  const change = (s, e) => {
    setStart(s);
    setEnd(e);
    if (e <= s) { setError('שעת הסיום חייבת להיות אחרי שעת ההתחלה'); return; }
    setError('');
    save({ dayStartMin: s, dayEndMin: e });
  };
  return html`<${Card}>
    <${Field} label="מתחיל ב"><${Select} value=${start} onChange=${(v) => change(v, end)} options=${START_OPTS} /></${Field}>
    <${Field} label="נגמר ב" error=${error}><${Select} value=${end} onChange=${(v) => change(start, v)} options=${END_OPTS} /></${Field}>
  </${Card}>`;
}

function dayState(settings) {
  const out = {};
  for (let d = 0; d < 7; d++) {
    const r = ((settings.clinicHours || {})[d] || [])[0];
    out[d] = r ? { open: true, from: r.from, to: r.to } : { open: false, from: 540, to: 1080 };
  }
  return out;
}

function ClinicHours({ settings }) {
  const sig = JSON.stringify(settings.clinicHours || {});
  const [days, setDays] = useState(() => dayState(settings));
  const [errors, setErrors] = useState({});
  useEffect(() => { setDays(dayState(settings)); setErrors({}); }, [sig]);

  const update = (d, patch) => {
    const next = { ...days, [d]: { ...days[d], ...patch } };
    setDays(next);
    const day = next[d];
    if (day.open && day.to <= day.from) {
      setErrors({ ...errors, [d]: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' });
      return;
    }
    setErrors({ ...errors, [d]: '' });
    const hours = {};
    for (let i = 0; i < 7; i++) {
      const x = i === d ? day : (errors[i] ? dayState(settings)[i] : next[i]);
      hours[i] = x.open ? [{ from: x.from, to: x.to }] : [];
    }
    save({ clinicHours: hours });
  };

  return html`<${Card} class="hours-card">
    ${[0, 1, 2, 3, 4, 5, 6].map((d) => html`<div class="hours-day" key=${d}>
      <${Toggle} label=${DAY_NAMES[d]} checked=${days[d].open} onChange=${(v) => update(d, { open: v })} />
      ${days[d].open && html`<div class="form-pair">
        <${Field} label="מ"><${Select} value=${days[d].from} onChange=${(v) => update(d, { from: v })} options=${FROM_OPTS} /></${Field}>
        <${Field} label="עד" error=${errors[d]}><${Select} value=${days[d].to} onChange=${(v) => update(d, { to: v })} options=${TO_OPTS} /></${Field}>
      </div>`}
    </div>`)}
  </${Card}>`;
}

const SYNC_TEXT = {
  synced: 'הכול שמור ומסונכרן',
  pending: 'שומר...',
  offline: 'אין חיבור. השינויים נשמרים בטלפון ויישלחו כשיחזור.',
  error: 'יש שינוי שלא נשמר. לפנות לתמיכה.',
};
const SYNC_DOT = { synced: 'var(--olive)', pending: 'var(--gold)', offline: 'var(--line-strong)', error: 'var(--danger)' };

function SyncLine({ sync }) {
  const [st, setSt] = useState(() => sync.status());
  useEffect(() => {
    const tick = () => setSt(sync.status());
    const timer = setInterval(tick, 1000);
    const off = getStore().subscribe(() => setTimeout(tick, 0));
    return () => { clearInterval(timer); off(); };
  }, []);
  const key = SYNC_TEXT[st] ? st : 'pending';
  return html`<p class=${'sync-line is-' + key} role="status"><${Dot} color=${SYNC_DOT[key]} size=${10} /><span>${SYNC_TEXT[key]}</span></p>`;
}

export default function More() {
  const { data: settings } = useData((s) => s.getSettings(), []);
  const sync = syncInfo();   // null במצב הדגמה

  const reset = async () => {
    const ok = await confirmSheet({ title: 'לאפס את כל הנתונים?', ok: 'איפוס', cancel: 'חזרה', danger: true });
    if (!ok) return;
    await getStore().resetDemo();
    toast('הנתונים אופסו');
  };

  const signOut = async () => {
    const ok = await confirmSheet({ title: 'לצאת מהחשבון?', ok: 'יציאה', cancel: 'חזרה' });
    if (ok) await sync.signOut();
  };

  return html`<${Page} title="עוד">
    ${sync && html`<${SyncLine} sync=${sync} />`}
    <${List}>
      <${Row} title="דוחות" sub="הכנסות ומכירות, לפי יום, שבוע, חודש או טווח" href="/reports" chevron />
      <${Row} title="פריטים" href="/items" chevron />
      <${Row} title="הודעות אוטומטיות" sub="מה כתוב בכל הודעה ללקוחות, ומתי היא יוצאת" href="/messages" chevron />
      ${sync && html`<${Row} title="ייבוא נתונים" sub="קובץ העלייה מהמחשב" href="/import" chevron />`}
    </${List}>
    ${!settings ? html`<${Loader} />` : html`
      <${Section} title="שעות היומן"><${DiaryHours} settings=${settings} /></${Section}>

      <${Section} title="שעות הקבלה">
        <p class="sub card-note">בשעות האלה לקוחות יוכלו לקבוע תור בעצמם. את קובעת תור בכל שעה.</p>
        <${ClinicHours} settings=${settings} />
      </${Section}>

      <${Section} title="התור הבא">
        <p class="sub card-note">כמה זמן אחרי ביקור מציעים את התור הבא. אפשר לקבוע אחרת לכל לקוח/ה בכרטיס.</p>
        <${Card}>
          <${Field} label="חוזר/ת בדרך כלל כל">
            <${Select} value=${settings.returnWeeks} onChange=${(v) => save({ returnWeeks: v })} options=${RETURN_OPTS} />
          </${Field}>
        </${Card}>
      </${Section}>

      <${Section} title="זמן ניקיון אחרי טיפול">
        <p class="sub card-note">הזמן הזה נשמר פנוי אחרי כל תור. לקוחות יוכלו לקבוע רק אחריו.</p>
        <${Card}>
          <${Field} label="זמן ניקיון">
            <${Select} value=${settings.bufferMin} onChange=${(v) => save({ bufferMin: v })} options=${BUFFER_OPTS} />
          </${Field}>
        </${Card}>
      </${Section}>

      ${sync && sync.mfa && html`<${MfaSection} mfa=${sync.mfa} />`}
      ${sync ? html`<${Button} kind="soft" onClick=${signOut}>יציאה מהחשבון</${Button}>` : html`
      <${Section} title="נתוני דוגמה">
        <${Card}>
          <p class="card-note">כל הנתונים כאן מומצאים, לבדיקה בלבד.</p>
          <${Button} kind="soft" onClick=${reset}>איפוס נתוני הדוגמה</${Button}>
        </${Card}>
      </${Section}>`}

      <p class="small card-note">גרסה 0.1 · שלב 1</p>
    `}
  </${Page}>`;
}
