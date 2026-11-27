
import { html, useState, useRef } from '../../vendor/preact-htm.js';
import { Page, Section, Card, List, Row, Button, Notice, Loader, confirmSheet } from '../ui/bits.js';
import { getStore } from '../data/store.js';
import { planImport, SECTIONS } from '../lib/launch-file.js';
import { syncInfo } from '../boot.js';

const PROBLEM_LIMIT = 8;

function CountRows({ plan }) {
  return html`<${List}>${SECTIONS.map(({ key, label }) => {
    const c = plan.counts[key];
    if (!c || c.file === 0) return null;
    const sub = [c.have ? `כבר קיימים: ${c.have}` : '', c.bad ? `לא תקינים, לא ייכנסו: ${c.bad}` : ''].filter(Boolean).join(' · ');
    return html`<${Row} key=${key} title=${label} sub=${sub || null} right=${html`<strong class="num">${c.add}</strong>`} />`;
  })}
    ${plan.settings.add.length > 0 && html`<${Row} title="הגדרות" sub=${plan.settings.add.join(' · ')} right=${html`<strong class="num">${plan.settings.add.length}</strong>`} />`}
    ${plan.sync && plan.sync.update > 0 && html`<${Row} title="תורים שהשתנו בתפעולית" sub=${plan.sync.paid ? `מתוכם שולמו: ${plan.sync.paid}` : null}
      right=${html`<strong class="num">${plan.sync.update}</strong>`} />`}
    ${plan.sync && plan.sync.cancel > 0 && html`<${Row} title="תורים שבוטלו או הוזזו בתפעולית" sub="יסומנו כמבוטלים, בלי הודעה ללקוחות"
      right=${html`<strong class="num">${plan.sync.cancel}</strong>`} />`}
  </${List}>`;
}

export default function Import({ query = {} }) {
  const [step, setStep] = useState('pick');   // pick | preview | done
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const input = useRef(null);
  const real = !!syncInfo() || query.test === '1';

  const choose = async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    setError('');
    setBusy(true);
    try {
      let file;
      try { file = JSON.parse(await f.text()); } catch { setError('לא הצלחתי לקרוא את הקובץ. צריך את קובץ העלייה (launch-...json).'); return; }
      const store = getStore();
      const state = await store.exportAll();
      if (state.settings && state.settings.demo !== false && query.test !== '1') {
        setError('המסד עוד לא אופס לשימוש אמיתי. לא מייבאים לפני האיפוס.');
        return;
      }
      const p = planImport(file, state);
      setPlan(p);
      setStep('preview');
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    const n = plan.counts;
    const ok = await confirmSheet({
      title: 'לייבא ליומן?',
      lines: [`${n.clients.add} לקוחות/ות, ${n.services.add} פריטים, ${n.blocks.add} אירועים, ${n.appointments.add} תורים`,
        ...(plan.sync && (plan.sync.update || plan.sync.cancel) ? [`יתעדכנו ${plan.sync.update} תורים ויבוטלו ${plan.sync.cancel}, לפי תפעולית`] : []),
        'אי אפשר לבטל בלחיצה. הכול יישמר וייכנס גם לטלפון.'],
      ok: 'ייבוא', cancel: 'חזרה',
    });
    if (!ok) return;
    setBusy(true);
    try {
      setDone(await getStore().importBatch(plan.batch));
      setStep('done');
    } catch (e) {
      setError(e.message || 'הייבוא נכשל. שום דבר לא נכנס.');
      setStep('pick');
    } finally { setBusy(false); }
  };

  const again = () => { setPlan(null); setError(''); setStep('pick'); };

  if (!real) {
    return html`<${Page} title="ייבוא" em="נתונים" back backTo="/more">
      <${Notice} kind="warn">המסך הזה עובד רק באפליקציה האמיתית, אחרי שהמסד אופס.</${Notice}>
    </${Page}>`;
  }

  if (step === 'done') {
    return html`<${Page} title="הייבוא" em="הסתיים" back backTo="/more">
      <${Notice} title="הכול נשמר">הנתונים נכנסו ליומן ויישלחו לכל המכשירים המחוברים.</${Notice}>
      <${List}>
        <${Row} title="לקוחות/ות" right=${html`<strong class="num">${done.clients}</strong>`} />
        <${Row} title="פריטים" right=${html`<strong class="num">${done.services}</strong>`} />
        <${Row} title="אירועים קבועים" right=${html`<strong class="num">${done.blocks}</strong>`} />
        <${Row} title="תורים" right=${html`<strong class="num">${done.appointments}</strong>`} />
        ${done.updated > 0 && html`<${Row} title="תורים שעודכנו לפי תפעולית" right=${html`<strong class="num">${done.updated}</strong>`} />`}
        ${done.cancelled > 0 && html`<${Row} title="תורים שבוטלו לפי תפעולית" right=${html`<strong class="num">${done.cancelled}</strong>`} />`}
      </${List}>
      <${Button} href="/more">חזרה ל"עוד"</${Button}>
    </${Page}>`;
  }

  if (step === 'preview' && plan) {
    const refused = plan.fatal.length > 0 || plan.already;
    return html`<${Page} title="לפני" em="הייבוא" back backTo="/more">
      ${plan.fatal.length > 0 && html`<${Notice} kind="danger" title="הקובץ לא מתאים">${plan.fatal.map((t) => html`<div key=${t}>${t}</div>`)}</${Notice}>`}
      ${plan.already && html`<${Notice} kind="warn" title="הקובץ הזה כבר יובא">אין צורך לייבא אותו שוב.</${Notice}>`}
      ${!refused && html`<${Section} title="מה ייכנס"><${CountRows} plan=${plan} /></${Section}>`}
      ${!refused && !plan.canImport && html`<${Notice}>אין בקובץ שום דבר חדש. הכול כבר ביומן.</${Notice}>`}
      ${plan.problems.length > 0 && html`<${Notice} kind="warn" title="שורות שלא ייכנסו">
        ${plan.problems.slice(0, PROBLEM_LIMIT).map((p) => html`<div key=${p.text}>${p.text}: ${p.count}</div>`)}
      </${Notice}>`}
      ${error && html`<${Notice} kind="danger">${error}</${Notice}>`}
      ${!refused && plan.canImport && html`<${Button} onClick=${confirm} disabled=${busy}>ייבוא ליומן</${Button}>`}
      <${Button} kind="soft" onClick=${again}>לבחור קובץ אחר</${Button}>
    </${Page}>`;
  }

  return html`<${Page} title="ייבוא" em="נתונים" back backTo="/more">
    <${Notice} title="קובץ העלייה">
      בוחרים את הקובץ שנבנה במחשב (launch-...json). לפני הייבוא רואים כמה ייכנסו ומה לא תקין, ורק אחרי אישור הכול נכנס.
    </${Notice}>
    ${error && html`<${Notice} kind="danger">${error}</${Notice}>`}
    <input ref=${input} type="file" accept=".json,application/json" onChange=${choose} hidden />
    ${busy ? html`<${Loader} />` : html`<${Button} onClick=${() => input.current && input.current.click()}>בחירת קובץ</${Button}>`}
  </${Page}>`;
}
