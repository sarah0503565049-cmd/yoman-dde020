
import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { Section, Card, Field, Button, Notice, Dot } from '../ui/bits.js';
import { CodeInput, codeDigits, codeError } from './login.js';

const NBSP = '\u00a0';

const TEXT = {
  title: 'קוד מהטלפון',
  wait: 'רגע...',
  offline: 'צריך חיבור לאינטרנט כדי לראות את ההגדרה הזאת.',
  failed: 'ההגדרה לא נטענה.',
  retry: 'לנסות שוב',
  offLead: 'אפשר להוסיף לכניסה ליומן קוד מאפליקציה בטלפון. ככה מי שיודע/ת את הסיסמה עדיין לא יכול/ה להיכנס בלי הטלפון שלך.',
  turnOn: 'הפעלת קוד מהטלפון',
  step1: () => html`מתקינים בטלפון אפליקציית אימות, למשל <bdi class="mfa-name">Google Authenticator</bdi> (חינם). לוחצים בה על${NBSP}+ וסורקים את הריבוע.`,
  qrAlt: 'ריבוע לסריקה באפליקציית האימות',
  step2: 'אי אפשר לסרוק, למשל כשהמסך הזה פתוח באותו טלפון? בוחרים באפליקציה בהקלדת מפתח, ומקלידים:',
  openApp: 'פתיחה באפליקציית האימות',
  second: 'כדאי לסרוק את אותו ריבוע גם בטלפון נוסף, ככה אם טלפון אחד הולך לאיבוד, הקוד נשאר בשני.',
  codeLabel: 'הקוד שמופיע באפליקציה',
  confirm: 'הפעלה',
  cancel: 'ביטול',
  on: 'הכניסה מוגנת בקוד מהטלפון.',
  turnOff: 'ביטול הקוד מהטלפון',
  offLeadRemove: 'כדי לבטל, מקלידים את הקוד שמופיע עכשיו באפליקציית האימות.',
  removeLabel: 'קוד מהטלפון',
  remove: 'ביטול הקוד',
  back: 'חזרה',
  startFailed: 'ההפעלה לא התחילה. אפשר לנסות שוב.',
  noNet: 'אין חיבור לאינטרנט.',
};

export const secretGroups = (s) => String(s || '').replace(/\s+/g, '').match(/.{1,4}/g) || [];

const touchDevice = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };

export default function MfaSection({ mfa }) {
  const [view, setView] = useState({ kind: 'loading' });   // loading · problem · off · enroll · on · remove
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const unfinished = useRef(null);   // הקוד שבאמצע הפעלה, למחיקה אם יוצאים מהמסך

  const load = async () => {
    setView({ kind: 'loading' });
    setError('');
    const r = await mfa.state();
    setView(r.problem ? { kind: 'problem', problem: r.problem } : { kind: r.state === 'on' ? 'on' : 'off' });
  };
  useEffect(() => {
    load();
    return () => { if (unfinished.current) mfa.cancel(unfinished.current); };
  }, []);

  const go = (kind, extra = {}) => { setCode(''); setError(''); setView({ kind, ...extra }); };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const r = await mfa.start();
    setBusy(false);
    if (r.state === 'on') { go('on'); return; }
    if (r.problem) { setError(r.problem === 'offline' ? TEXT.noNet : TEXT.startFailed); return; }
    unfinished.current = r.factorId;
    go('enroll', { factorId: r.factorId, qr: r.qr, secret: r.secret, uri: r.uri });
  };

  const cancel = async () => {
    const id = unfinished.current;
    unfinished.current = null;
    go('off');
    if (id) await mfa.cancel(id);
  };

  const check = async (value) => {
    if (running.current) return;
    const c = codeDigits(value);
    if (c.length !== 6) {
      const field = document.getElementById('mfa-set-code');
      if (field) field.focus();
      if (c.length) setError(codeError('wrong'));
      return;
    }
    running.current = true;
    setBusy(true);
    setError('');
    const r = view.kind === 'enroll' ? await mfa.confirm(view.factorId, c) : await mfa.remove(c);
    running.current = false;
    setBusy(false);
    if (r === 'ok') {
      if (view.kind === 'enroll') { unfinished.current = null; go('on'); } else go('off');
      return;
    }
    setCode('');
    setError(codeError(r));
  };
  const submit = (e) => { e.preventDefault(); check(code); };
  const edit = (v) => { setCode(v); if (error) setError(''); };

  let body;
  if (view.kind === 'loading') {
    body = html`<p class="sub card-note" role="status">${TEXT.wait}</p>`;
  } else if (view.kind === 'problem') {
    body = html`<${Card}>
      <p class="card-note">${view.problem === 'offline' ? TEXT.offline : TEXT.failed}</p>
      <${Button} kind="soft" onClick=${load}>${TEXT.retry}</${Button}>
    </${Card}>`;
  } else if (view.kind === 'off') {
    body = html`<${Card}>
      <p class="card-note">${TEXT.offLead}</p>
      ${error && html`<${Notice} kind="danger">${error}</${Notice}>`}
      <${Button} kind="soft" disabled=${busy} onClick=${start}>${busy ? TEXT.wait : TEXT.turnOn}</${Button}>
    </${Card}>`;
  } else if (view.kind === 'on') {
    body = html`<${Card}>
      <p class="sync-line mfa-on" role="status"><${Dot} color="var(--olive)" size=${10} /><span>${TEXT.on}</span></p>
      <${Button} kind="danger" onClick=${() => go('remove')}>${TEXT.turnOff}</${Button}>
    </${Card}>`;
  } else if (view.kind === 'enroll') {
    body = html`<${Card} class="mfa-card">
      <form class="mfa-form" novalidate onSubmit=${submit}>
        <p class="card-note">${TEXT.step1()}</p>
        ${view.qr && html`<div class="mfa-qr-box"><img class="mfa-qr" src=${view.qr} alt=${TEXT.qrAlt} width="200" height="200" /></div>`}
        <p class="card-note">${TEXT.step2}</p>
        <div class="mfa-secret" dir="ltr" translate="no">${secretGroups(view.secret).map((g, i) => html`<span key=${i}>${g}</span>`)}</div>
        ${view.uri && touchDevice() && html`<${Button} kind="soft" href=${view.uri}>${TEXT.openApp}</${Button}>`}
        <p class="card-note">${TEXT.second}</p>
        <${Field} label=${TEXT.codeLabel} id="mfa-set-code">
          <${CodeInput} value=${code} onChange=${edit} onFull=${check} />
        </${Field}>
        ${error && html`<${Notice} kind="danger">${error}</${Notice}>`}
        <${Button} type="submit" disabled=${busy}>${busy ? TEXT.wait : TEXT.confirm}</${Button}>
        <${Button} kind="soft" disabled=${busy} onClick=${cancel}>${TEXT.cancel}</${Button}>
      </form>
    </${Card}>`;
  } else {
    body = html`<${Card} class="mfa-card">
      <form class="mfa-form" novalidate onSubmit=${submit}>
        <p class="card-note">${TEXT.offLeadRemove}</p>
        <${Field} label=${TEXT.removeLabel} id="mfa-set-code">
          <${CodeInput} value=${code} onChange=${edit} onFull=${check} autoFocus />
        </${Field}>
        ${error && html`<${Notice} kind="danger">${error}</${Notice}>`}
        <${Button} kind="danger" type="submit" disabled=${busy}>${busy ? TEXT.wait : TEXT.remove}</${Button}>
        <${Button} kind="soft" disabled=${busy} onClick=${() => go('on')}>${TEXT.back}</${Button}>
      </form>
    </${Card}>`;
  }
  return html`<${Section} title=${TEXT.title}>${body}</${Section}>`;
}
