
import { html, useState } from '../../vendor/preact-htm.js';
import { Page, Section, Card, Field, TextArea, Toggle, Button, Notice, Empty, Loader, toast, confirmSheet } from '../ui/bits.js';
import { useData } from '../ui/hooks.js';
import { back } from '../router.js';
import { getStore } from '../data/store.js';
import { getMessage, messageText, messageOn, fillMessage, sampleVars, checkText, VARS, LINKS } from '../lib/messages.js';

const LINK_LABEL = { myappt: 'הקישור לתור', book: 'הקישור לקביעת תור', form: 'הקישור לטופס', receipt: 'הקישור לקבלה', voucher: 'הקישור לשובר', offer: 'הקישור להעברת התור' };
const PH_LABEL = { 'פייבוקס': 'מספר הפייבוקס, בהשקה', 'חשבון': 'פרטי החשבון, בהשקה' };

function Bubble({ msg, text }) {
  const filled = fillMessage(text, sampleVars(msg));
  const parts = filled.split(/(\{[^{}\n]+\}|https?:\/\/\S+)/g);
  return html`<div class="msg-bubble is-usertext" aria-label="איך ההודעה נראית">${parts.map((p, i) => {
    if (/^\{[^{}\n]+\}$/.test(p)) {
      const k = p.slice(1, -1);
      const label = k === 'קישור' ? LINK_LABEL[msg.link] || 'קישור' : PH_LABEL[k] || k;
      return html`<span class="msg-ph" key=${i}>${label}</span>`;
    }
    if (/^https?:\/\//.test(p)) return html`<bdi class="msg-url" dir="ltr" key=${i}>${p}</bdi>`;
    return p;
  })}</div>`;
}

function MessageForm({ msg, settings }) {
  const [text, setText] = useState(messageText(msg, settings));
  const [on, setOn] = useState(messageOn(msg, settings));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const changed = text !== msg.text;

  const save = async () => {
    if (busy) return;
    const errs = checkText(msg, text);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    const all = { ...(settings.messages || {}) };
    const mine = {};
    if (text !== msg.text) mine.text = text;
    if (!on) mine.off = true;
    if (Object.keys(mine).length) all[msg.id] = mine; else delete all[msg.id];
    await getStore().saveSettings({ messages: all });
    toast('נשמר');
    back('/messages');
  };

  const reset = async () => {
    const ok = await confirmSheet({ title: 'לחזור לנוסח המקורי?', text: 'הנוסח ששינית יימחק מהשדה. הוא יישמר רק אחרי "שמירה".', ok: 'חזרה לנוסח המקורי', cancel: 'ביטול' });
    if (ok) { setText(msg.text); setErrors([]); }
  };

  const footer = html`<${Button} type="submit" disabled=${busy}>שמירה</${Button}>`;

  return html`<${Page} title=${msg.title} back backTo="/messages" onSubmit=${save} footer=${footer}>
    <${Notice} kind="info" title=${`הודעה ${msg.n} · מתי היא יוצאת`}>${msg.when}</${Notice}>
    ${msg.kind === 'marketing' && html`<${Notice} kind="warn" title="הודעת פרסום">לפי החוק היא מתחילה במילה "פרסומת" ונגמרת באפשרות להשיב "הסר". מי שביקש/ה הסרה לא מקבל/ת אותה.</${Notice}>`}

    <${Section} title="איך זה נראה">
      <${Bubble} msg=${msg} text=${text} />
      <p class="small card-note">דוגמה עם שם ותאריך מומצאים. מה שמסומן בצהוב ימולא לבד בכל הודעה.</p>
    </${Section}>

    <${Section} title="הנוסח">
      ${errors.length > 0 && html`<${Notice} kind="danger">${errors.join(' · ')}</${Notice}>`}
      <${Field} label="מה כתוב בהודעה">
        <${TextArea} value=${text} onChange=${(v) => { setText(v); if (errors.length) setErrors([]); }} rows=${Math.min(14, Math.max(6, text.split('\n').length + 1))} />
      </${Field}>
      ${changed && html`<${Button} kind="soft" onClick=${reset}>חזרה לנוסח המקורי</${Button}>`}
      <${Card}>
        <p class="msg-vars-title">אפשר להשתמש ב:</p>
        <div class="msg-vars">
          ${msg.vars.map((k) => html`<div class="msg-var" key=${k}><b>{${k}}</b> ${k === 'קישור' && msg.link ? LINKS[msg.link] : VARS[k]}</div>`)}
        </div>
      </${Card}>
      ${msg.vars.includes('פייבוקס') && html`<${Notice} kind="warn">מספר הפייבוקס ופרטי החשבון ימולאו בהשקה, באפליקציה האמיתית. עד אז ההודעה הזאת לא יוצאת.</${Notice}>`}
    </${Section}>

    <${Card}>
      <${Toggle} label="ההודעה פעילה" hint="כבויה = לא נשלחת ללקוחות" checked=${on} onChange=${setOn} />
    </${Card}>
  </${Page}>`;
}

export default function MessageEdit({ params }) {
  const msg = getMessage(params && params.id);
  const { data: settings, loading } = useData((s) => s.getSettings(), []);
  if (!msg) {
    return html`<${Page} title="הודעה" back backTo="/messages">
      <${Empty} text="ההודעה לא נמצאה" />
      <${Button} kind="soft" href="/messages">חזרה להודעות</${Button}>
    </${Page}>`;
  }
  if (!settings) return html`<${Page} title=${msg.title} back backTo="/messages">${loading && html`<${Loader} />`}</${Page}>`;
  return html`<${MessageForm} key=${msg.id} msg=${msg} settings=${settings} />`;
}
