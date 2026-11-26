
import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { Page, Field, TextInput, Button, Notice } from '../ui/bits.js';

const MIN_LEN = 8;
const CODE_LEN = 6;

const SENT = () => html`הקישור נשלח למייל. המייל באנגלית, מאת <bdi>Supabase Auth</bdi>, בנושא <bdi>Reset Your Password</bdi>.
  כדאי לבדוק גם בספאם. הקישור תקף לשעה, ויכול לקחת דקה עד שיגיע.`;

const TEXT = {
  wrong: 'המייל או הסיסמה לא נכונים.',
  offline: 'אין חיבור לאינטרנט.',
  badMail: 'כתובת המייל לא תקינה.',
  forgot: 'שכחתי סיסמה',
  forgotNoMail: 'קודם כותבים למעלה את כתובת המייל.',
  forgotSent: SENT,
  forgotWait: 'נשלחו כמה בקשות ברצף. כדאי לבדוק במייל, גם בספאם, ואם אין, לנסות שוב בעוד שעה.',
  codeTitle: 'קוד מהטלפון',
  codeLead: 'פותחים את אפליקציית האימות בטלפון ומקלידים את הקוד של היומן.',
  codeLeadReset: 'לפני הסיסמה החדשה, מקלידים את הקוד מאפליקציית האימות בטלפון.',
  codeLabel: 'קוד',
  codeGo: 'כניסה',
  codeGoReset: 'המשך',
  codeWrong: 'הקוד לא נכון, או שכבר התחלף. מקלידים את הקוד שמופיע עכשיו.',
  codeExpired: 'עבר יותר מדי זמן. מקלידים את הקוד שמופיע עכשיו.',
  codeWait: 'נעשו כמה ניסיונות ברצף. אפשר לנסות שוב בעוד דקה.',
  codeFailed: 'הבדיקה לא הצליחה. אפשר לנסות שוב.',
  newTitle: 'סיסמה חדשה',
  newFirst: 'סיסמה חדשה',
  newAgain: 'הקלדת הסיסמה שוב',
  save: 'שמירה וכניסה ליומן',
  differ: 'הסיסמאות לא זהות.',
  short: `הסיסמה קצרה מדי. צריך לפחות ${MIN_LEN} תווים.`,
  expired: 'הקישור כבר לא תקף, כי נעשה בו שימוש או שעברה שעה. אפשר לבקש קישור חדש.',
  toLogin: 'חזרה לכניסה',
  wait: 'רגע...',
};

function Frame({ children }) {
  return html`<div class="shell"><div class="shell-screen">
    <${Page} class="login">
      <div class="login-brand"><img class="login-logo" src="img/logo-round.png" alt="Sarah B Cosmetics" width="300" height="330" decoding="async" /></div>
      ${children}
    </${Page}>
  </div></div>`;
}

export default function Login({ onLogin, onForgot }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState(null);   // { kind, text }: מה קרה אחרי "שכחתי סיסמה"

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const mail = email.trim();
    if (!mail || !pass) {
      const empty = document.getElementById(mail ? 'login-pass' : 'login-mail');
      if (empty) empty.focus();
      return;
    }
    setBusy(true);
    setError('');
    setNote(null);
    let result;
    try { result = await onLogin(mail, pass); } catch { result = 'offline'; }
    if (result === 'ok') return;
    setBusy(false);
    setError(TEXT[result] || TEXT.wrong);
  };

  const forgot = async () => {
    if (busy || !onForgot) return;
    const mail = email.trim();
    setError('');
    if (!mail) {
      const field = document.getElementById('login-mail');
      if (field) field.focus();
      setNote({ kind: 'info', text: TEXT.forgotNoMail });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(mail)) { setNote(null); setError(TEXT.badMail); return; }
    setBusy(true);
    setNote(null);
    let result;
    try { result = await onForgot(mail); } catch { result = 'offline'; }
    setBusy(false);
    if (result === 'sent') setNote({ kind: 'info', text: TEXT.forgotSent() });
    else if (result === 'wait') setNote({ kind: 'warn', text: TEXT.forgotWait });
    else setError(TEXT.offline);
  };

  const edit = (set) => (v) => { set(v); if (error) setError(''); };

  return html`<${Frame}>
    <h1 class="login-title">כניסה</h1>
    <form class="login-form" novalidate onSubmit=${submit}>
      <${Field} label="מייל" id="login-mail">
        <${TextInput} type="email" dir="ltr" autocomplete="username" autocapitalize="off" spellcheck="false"
          value=${email} onChange=${edit(setEmail)} />
      </${Field}>
      <${Field} label="סיסמה" id="login-pass">
        <${TextInput} type="password" autocomplete="current-password" value=${pass} onChange=${edit(setPass)} />
      </${Field}>
      ${error && html`<${Notice} kind="danger">${error}</${Notice}>`}
      ${note && html`<${Notice} kind=${note.kind}>${note.text}</${Notice}>`}
      <${Button} type="submit" disabled=${busy}>${busy ? TEXT.wait : 'כניסה'}</${Button}>
      ${onForgot && html`<${Button} kind="soft" class="login-forgot" disabled=${busy} onClick=${forgot}>${TEXT.forgot}</${Button}>`}
    </form>
  </${Frame}>`;
}

export const codeDigits = (v) => String(v || '').replace(/\D/g, '').slice(0, CODE_LEN);

export function CodeInput({ value, onChange, onFull, autoFocus }) {
  useEffect(() => {
    if (!autoFocus) return;
    const el = document.querySelector('.input-code');
    if (el) el.focus();
  }, []);
  return html`<${TextInput} class="input-code" type="text" dir="ltr" inputmode="numeric" pattern="[0-9]*" maxlength=${CODE_LEN}
    autocomplete="one-time-code" autocapitalize="off" spellcheck="false"
    value=${value} onChange=${(v, e) => {
      const d = codeDigits(v);
      if (e && e.currentTarget && e.currentTarget.value !== d) e.currentTarget.value = d;
      onChange(d);
      if (d.length === CODE_LEN && onFull) onFull(d);
    }} />`;
}

const CODE_ERRORS = { wrong: TEXT.codeWrong, expired: TEXT.codeExpired, wait: TEXT.codeWait, offline: TEXT.offline, failed: TEXT.codeFailed };
export const codeError = (r) => CODE_ERRORS[r] || TEXT.codeFailed;

export function Code({ onVerify, onBack, reset = false }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);   // שש הספרות שולחות לבד, וגם הכפתור: בדיקה אחת בכל פעם

  const check = async (value) => {
    if (running.current) return;
    const c = codeDigits(value);
    if (c.length !== CODE_LEN) {
      const field = document.getElementById('mfa-code');
      if (field) field.focus();
      if (c.length) setError(TEXT.codeWrong);
      return;
    }
    running.current = true;
    setBusy(true);
    setError('');
    let result;
    try { result = await onVerify(c); } catch { result = 'offline'; }
    if (result === 'ok') return;
    running.current = false;
    setBusy(false);
    setCode('');
    setError(codeError(result));
  };
  const submit = (e) => { e.preventDefault(); check(code); };
  const edit = (v) => { setCode(v); if (error) setError(''); };

  return html`<${Frame}>
    <h1 class="login-title">${TEXT.codeTitle}</h1>
    <form class="login-form" novalidate onSubmit=${submit}>
      <p class="login-lead">${reset ? TEXT.codeLeadReset : TEXT.codeLead}</p>
      <${Field} label=${TEXT.codeLabel} id="mfa-code">
        <${CodeInput} value=${code} onChange=${edit} onFull=${check} autoFocus />
      </${Field}>
      ${error && html`<${Notice} kind="danger">${error}</${Notice}>`}
      <${Button} type="submit" disabled=${busy}>${busy ? TEXT.wait : (reset ? TEXT.codeGoReset : TEXT.codeGo)}</${Button}>
      <${Button} kind="soft" disabled=${busy} onClick=${onBack}>${TEXT.toLogin}</${Button}>
    </form>
  </${Frame}>`;
}

export function Expired({ onBack }) {
  return html`<${Frame}>
    <${Notice} kind="warn">${TEXT.expired}</${Notice}>
    <${Button} onClick=${onBack}>${TEXT.toLogin}</${Button}>
  </${Frame}>`;
}

export function NewPass({ onSave, onBack, error: firstError }) {
  const [first, setFirst] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(firstError === 'weak' ? TEXT.short : firstError === 'offline' ? TEXT.offline : '');
  const [expired, setExpired] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!first || !again) {
      const empty = document.getElementById(first ? 'new-again' : 'new-first');
      if (empty) empty.focus();
      return;
    }
    if (first.length < MIN_LEN) { setError(TEXT.short); return; }
    if (first !== again) { setError(TEXT.differ); return; }
    setBusy(true);
    setError('');
    let result;
    try { result = await onSave(first); } catch { result = 'offline'; }
    if (result === 'ok') return;
    setBusy(false);
    if (result === 'expired') { setExpired(true); return; }
    setError(result === 'weak' ? TEXT.short : TEXT.offline);
  };

  const edit = (set) => (v) => { set(v); if (error) setError(''); };

  if (expired) return html`<${Expired} onBack=${onBack} />`;
  return html`<${Frame}>
    <h1 class="login-title">${TEXT.newTitle}</h1>
    <form class="login-form" novalidate onSubmit=${submit}>
      <${Field} label=${TEXT.newFirst} id="new-first">
        <${TextInput} type="password" autocomplete="new-password" value=${first} onChange=${edit(setFirst)} />
      </${Field}>
      <${Field} label=${TEXT.newAgain} id="new-again">
        <${TextInput} type="password" autocomplete="new-password" value=${again} onChange=${edit(setAgain)} />
      </${Field}>
      ${error && html`<${Notice} kind="danger">${error}</${Notice}>`}
      <${Button} type="submit" disabled=${busy}>${busy ? TEXT.wait : TEXT.save}</${Button}>
    </form>
  </${Frame}>`;
}

export function Stop({ text, kind = 'info', action, onAction }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy || !onAction) return;
    setBusy(true);
    try { await onAction(); } catch (err) { console.warn('stop', err); }
    setBusy(false);
  };
  return html`<${Frame}>
    <${Notice} kind=${kind}>${text}</${Notice}>
    ${action && html`<${Button} disabled=${busy} onClick=${run}>${busy ? TEXT.wait : action}</${Button}>`}
  </${Frame}>`;
}
