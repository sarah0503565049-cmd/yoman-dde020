
import { html, render } from '../vendor/preact-htm.js';
import { Loader } from './ui/bits.js';
import { parseAuthLink, stripsAtOnce, cleanAddress, wantsNewPassword, sessionLevel, bootStep, trustedDevice } from './lib/auth-link.js';
import * as flow from './lib/auth-flow.js';
import { takeFirstHash } from './first-hash.js';

const WAKE_MS = 60 * 1000;
const QUICK_MS = 4000;   // מכשיר מוכר: לא מחכים לרשת חלשה יותר מזה כדי לפתוח את היומן

const TEXT = {
  notOwner: 'החשבון הזה לא מורשה להיכנס.',
  signOut: 'יציאה',
  firstRun: 'צריך חיבור לאינטרנט בפעם הראשונה.',
  retry: 'לנסות שוב',
};

let live = null;   // במצב אמיתי, מהרגע שהיומן עולה: { status(), signOut(), mfa }

export function syncInfo() { return live; }

const parse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };
const later = (ms, value) => new Promise((r) => { setTimeout(() => r(value), ms); });
const within = (promise, ms, fallback) => Promise.race([promise, later(ms, fallback)]);

async function readConfig() {
  try {
    const m = await import('./config.js');
    const c = m.SUPABASE || {};
    const url = String(c.url || '').trim();
    const key = String(c.key || '').trim();
    const problem = typeof m.configProblem === 'function' ? m.configProblem({ url, key }) : null;
    return { url, key, problem };
  } catch {
    return { url: '', key: '', missing: true };   // אין קובץ (כתובת ההדגמה), או שלא נטען
  }
}

function realDevice(key) {
  try {
    const meta = parse(localStorage.getItem(`${key}.sync`));
    if (meta && meta.linked) return true;
    for (let i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return true;
  } catch { /* אין גישה לאחסון */ }
  return false;
}

function takeAuthLink() {
  let link = null;
  try {
    link = parseAuthLink(location.hash, location.search);
    const first = takeFirstHash();
    if (!link) link = parseAuthLink(first, '');
    if (!link) link = parseAuthLink(loadedHash(), '');
  } catch { return null; }
  if (stripsAtOnce(link)) {
    try { history.replaceState(history.state, '', cleanAddress(location.pathname, location.search)); } catch { /* נשאר כמו שהוא */ }
  }
  return link;
}

function loadedHash() {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav || !nav.name) return '';
    const u = new URL(nav.name);
    return u.origin === location.origin && u.pathname === location.pathname ? u.hash : '';
  } catch {
    return '';
  }
}

function loadScript(src) {
  if (globalThis.supabase && typeof globalThis.supabase.createClient === 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error(`לא נטען: ${src}`)); };
    document.head.appendChild(s);
  });
}

export async function boot({ root, startApp, fail }) {
  const link = takeAuthLink();
  render(html`<${Loader} />`, root);
  const cfg = await readConfig();

  let device = false;
  if (!(cfg.url && cfg.key) && cfg.missing) {
    let key = 'torim.v1';
    try { key = (await import('./data/store.js')).STORAGE_KEY; } catch { /* נשאר */ }
    device = realDevice(key);
  }
  const step = bootStep({ config: cfg, realDevice: device });
  if (step === 'demo') return startApp(root);
  if (step === 'offline-stop') {
    try {
      const ui = await import('./screens/login.js');
      render(html`<${ui.Stop} text=${TEXT.firstRun} action=${TEXT.retry} onAction=${() => location.reload()} />`, root);
    } catch { fail(); }
    return undefined;
  }
  return real(root, cfg, link, { startApp, fail });
}

async function real(root, cfg, link, { startApp, fail }) {
  let ui;
  try { ui = await import('./screens/login.js'); } catch (err) { console.error('מסך הכניסה לא נטען', err); fail(); return; }
  const show = (C, props = {}) => render(html`<${C} ...${props} />`, root);
  const reload = () => location.reload();

  if (bootStep({ config: cfg }) === 'config-problem') { console.error(cfg.problem); show(ui.Stop, { text: cfg.problem, kind: 'danger' }); return; }

  let store, sync, remoteMod;
  try {
    [store, sync, remoteMod] = await Promise.all([
      import('./data/store.js'), import('./data/sync-storage.js'), import('./data/remote-supabase.js'),
    ]);
    await loadScript('vendor/supabase.js');
  } catch (err) {
    console.warn('העלייה בלי רשת', err);
    show(ui.Stop, { text: TEXT.firstRun, action: TEXT.retry, onAction: reload });
    return;
  }
  const lib = globalThis.supabase;
  const client = lib.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const remote = remoteMod.createRemote(client);
  const KEY = store.STORAGE_KEY;
  const OWNER_KEY = `${KEY}.owner`;   // המשתמש שאושר כבעל/ת החשבון במכשיר הזה (מזהה בלבד)
  const RESET_KEY = `${KEY}.reset`;   // sessionStorage: המשתמש שבא מקישור "שכחתי סיסמה" ועוד לא בחר סיסמה (בלשונית הזו)

  let storage = null;     // נוצר רק אחרי אישור בעלת החשבון, ופעם אחת
  let started = false;
  let stopped = null;     // 'no' | 'code': תשובה מאוחרת מהמסד עצרה את היומן
  let leaving = false;
  let stopWake = () => {};
  let pendingLink = link;   // הקישור מהכתובת, עד שטופל (כבר לא בכתובת)
  let pendingPass = null;   // קישור token_hash: הסיסמה שהוקלדה לפני הקוד מהטלפון

  const getMark = () => { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } };
  const setMark = (id) => {
    try { if (id) localStorage.setItem(OWNER_KEY, id); else localStorage.removeItem(OWNER_KEY); } catch { /* אין גישה */ }
  };
  const getReset = () => { try { return sessionStorage.getItem(RESET_KEY); } catch { return null; } };
  const setReset = (id) => {
    try { if (id) sessionStorage.setItem(RESET_KEY, id); else sessionStorage.removeItem(RESET_KEY); } catch { /* אין גישה */ }
  };
  const isLinked = () => { try { return !!(parse(localStorage.getItem(`${KEY}.sync`)) || {}).linked; } catch { return false; } };
  const netError = (err) => !err || lib.isAuthRetryableFetchError(err) || !err.status || err.status >= 500;

  const run = (step) => step().catch((err) => { console.error('העלייה נכשלה', err); fail(); });
  const firstRunStop = () => show(ui.Stop, { text: TEXT.firstRun, action: TEXT.retry, onAction: () => run(proceed) });
  const notOwnerStop = () => {
    setMark(null);
    show(ui.Stop, { text: TEXT.notOwner, kind: 'warn', action: TEXT.signOut, onAction: signOut });
  };
  const showExpired = (onBack) => show(ui.Expired, { onBack: onBack || (() => run(proceed)) });

  async function readSession() {
    try {
      const { data, error } = await client.auth.getSession();
      const s = data && data.session;
      if (s) return { kind: 'in', user: s.user ? s.user.id : null, ...sessionLevel(s) };
      return { kind: error && lib.isAuthRetryableFetchError(error) ? 'unknown' : 'out' };
    } catch {
      return { kind: 'unknown' };
    }
  }

  async function askOwner() {
    if ((await readSession()).kind !== 'in') return 'unknown';
    let yes;
    try { yes = await remote.isOwner(); } catch { return 'unknown'; }
    if (yes) return 'yes';
    return flow.whyRefused(client.auth);
  }

  async function liveToken() {
    try {
      const { data } = await client.auth.getSession();
      const t = data && data.session && data.session.access_token;
      if (t && client.realtime && typeof client.realtime.setAuth === 'function') await client.realtime.setAuth(t);
    } catch { /* בחידוש הבא */ }
  }

  async function proceed() {
    const mark = getMark();
    const known = isLinked() && !!mark;   // המכשיר כבר חובר, ובעלת החשבון כבר אומתה בו
    let session;
    let owner;
    for (;;) {
      const facts = { config: cfg, link: pendingLink, session, known, mark, owner, recovering: !!getReset() };
      const step = bootStep(facts);
      switch (step) {
        case 'link-expired':
          pendingLink = null;
          showExpired();
          return;
        case 'link-new-password':
          showNewPassHash(pendingLink.tokenHash);
          return;
        case 'link-session': {
          const l = pendingLink;
          const r = await flow.openLinkSession(client.auth, l);
          if (r === 'offline') { firstRunStop(); return; }   // "לנסות שוב" ממשיך מאותו קישור (הוא בזיכרון)
          pendingLink = null;
          if (r !== 'ok') { showExpired(); return; }
          if (wantsNewPassword(l)) setReset((await readSession()).user || 'reset');
          continue;
        }
        case 'read-session': {
          session = await (known ? within(readSession(), QUICK_MS, { kind: 'unknown' }) : readSession());
          const reset = getReset();
          if (reset && (session.kind === 'out' || (session.kind === 'in' && session.user && reset !== 'reset' && session.user !== reset))) setReset(null);
          continue;
        }
        case 'login':
          setReset(null);
          pendingPass = null;
          show(ui.default, { onLogin: signIn, onForgot: forgot });
          return;
        case 'code':
          showCode();
          return;
        case 'new-password':
          await newPassword();
          return;
        case 'first-run':
          firstRunStop();
          return;
        case 'ask-owner': {
          const trusted = trustedDevice(facts);
          const check = askOwner();
          owner = await (trusted ? within(check, QUICK_MS, 'late') : check);
          if (owner === 'yes' && session.user) setMark(session.user);
          if (owner === 'late') check.then(lateAnswer);
          continue;
        }
        case 'not-owner':
          notOwnerStop();
          return;
        case 'open':
          if (await startSync()) await open();
          return;
        default:
          console.error('שלב לא מוכר בעלייה', step);
          fail();
          return;
      }
    }
  }

  async function startSync() {
    if (stopped) return false;
    if (!storage) storage = sync.createSyncStorage({ local: localStorage, remote, key: KEY });
    try {
      await storage.start();
    } catch (err) {
      console.warn('החיבור הראשון נכשל', err);
      firstRunStop();
      return false;
    }
    return !stopped;
  }

  async function open() {
    if (started) return;
    started = true;
    store.useStorage(storage);
    storage.onChange(() => store.getStore().touch());
    live = {
      status: () => storage.status(),
      signOut,
      mfa: {
        state: () => flow.mfaState(client.auth),
        start: () => flow.startEnroll(client.auth),
        confirm: async (id, code) => { const r = await flow.confirmEnroll(client.auth, id, code); if (r === 'ok') await liveToken(); return r; },
        cancel: (id) => flow.cancelEnroll(client.auth, id),
        remove: async (code) => { const r = await flow.removeWithCode(client.auth, code); if (r === 'ok') await liveToken(); return r; },
      },
    };
    if (!(await startApp(root))) return;
    if (stopped) { stopShow(); return; }   // התשובה המאוחרת הגיעה בזמן שהיומן נטען

    const adopt = () => { try { storage.localChanged(); } catch (err) { console.warn('אימוץ כתיבה מדף אחר נכשל', err); } };
    const wake = () => { adopt(); storage.wake().catch(() => {}); };
    const onVisible = () => { if (document.visibilityState === 'visible') wake(); };
    const onStorage = (e) => { if (e.key === KEY) adopt(); };
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(wake, WAKE_MS);
    stopWake = () => {
      clearInterval(timer);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && !leaving) { leaving = true; halt(); toLogin(); }
    });
  }

  function halt() {
    stopWake();
    if (storage) storage.stop();
    setMark(null);
  }

  function toLogin() {
    history.replaceState(null, '', `${location.pathname}${location.search}#/home`);
    location.reload();
  }

  const stopShow = () => { if (stopped === 'code') showCode(); else notOwnerStop(); };

  function lateAnswer(r) {
    if (r === 'no' || r === 'code') {
      stopped = r;
      halt();
      live = null;
      stopShow();
    } else if (r === 'out' && !leaving) {
      leaving = true;
      halt();
      if (started) toLogin(); else { leaving = false; run(proceed); }
    }
  }

  function forgetSession() {
    const sk = client.auth && client.auth.storageKey;
    if (typeof sk !== 'string' || !sk) return;
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.filter((k) => k === sk || (k && k.startsWith(`${sk}-`))).forEach((k) => localStorage.removeItem(k));
    } catch { /* אין גישה */ }
  }

  async function signOut() {
    leaving = true;
    halt();
    setReset(null);
    pendingPass = null;
    await within(client.auth.signOut({ scope: 'local' }).catch(() => null), QUICK_MS, null);
    forgetSession();   // גם כשהרשת חלשה והספרייה לא סיימה
    if (started) { toLogin(); return; }
    leaving = false;
    await proceed();
  }

  async function signIn(email, pass) {
    if (navigator.onLine === false) return 'offline';
    let res;
    try { res = await client.auth.signInWithPassword({ email, password: pass }); } catch (err) { return netError(err) ? 'offline' : 'wrong'; }
    if (res && res.error) return netError(res.error) ? 'offline' : 'wrong';
    run(proceed);   // המסך נשאר "רגע..." עד שהשלב הבא (הקוד מהטלפון, או היומן) מחליף אותו
    return 'ok';
  }

  async function forgot(email) {
    if (navigator.onLine === false) return 'offline';
    const redirectTo = `${location.origin}${location.pathname}`;
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (!error) return 'sent';
      if (error.status === 429) return 'wait';
      return netError(error) ? 'offline' : 'sent';
    } catch (err) {
      return netError(err) ? 'offline' : 'sent';
    }
  }

  function showCode() {
    const reset = !!getReset() || !!pendingPass;
    const verify = async (code) => {
      if (navigator.onLine === false) return 'offline';
      const lvl = await flow.currentLevel(client.auth);
      const r = await flow.verifyCode(client.auth, lvl.factorIds, code);
      if (r === 'none') {
        await client.auth.refreshSession().catch(() => null);
      } else if (r !== 'ok' && r !== 'out') {
        return r;
      }
      if (r === 'ok') await liveToken();
      if (started) { reload(); return 'ok'; }   // היומן נעצר באמצע: עולים מחדש, הפעם ברמה aal2
      stopped = null;
      run(proceed);
      return 'ok';
    };
    show(ui.Code, { onVerify: verify, onBack: signOut, reset });
  }

  async function newPassword() {
    if (pendingPass) {
      const p = pendingPass;
      pendingPass = null;
      const r = await flow.setNewPassword(client.auth, p);
      if (r === 'ok') { setReset(null); run(proceed); return; }
      if (r === 'aal') { pendingPass = p; showCode(); return; }
      if (r === 'expired') { setReset(null); showExpired(signOut); return; }
      showNewPass(r);   // 'weak' | 'offline'
      return;
    }
    showNewPass();
  }

  function showNewPass(error) {
    const save = async (pass) => {
      if (navigator.onLine === false) return 'offline';
      const r = await flow.setNewPassword(client.auth, pass);
      if (r === 'ok') { setReset(null); run(proceed); return 'ok'; }   // ממשיכים ליומן כמו אחרי כניסה רגילה
      if (r === 'aal') { pendingPass = pass; showCode(); return 'ok'; }   // קוד שנוסף בינתיים: קודם הקוד, ואז הסיסמה שהוקלדה
      if (r === 'expired') setReset(null);
      return r;
    };
    show(ui.NewPass, { onSave: save, onBack: signOut, error });
  }

  const cleanUrl = () => history.replaceState(null, '', `${location.pathname}#/home`);

  function showNewPassHash(tokenHash) {
    let verified = false;
    const back = () => { pendingLink = null; cleanUrl(); run(proceed); };
    const save = async (pass) => {
      if (navigator.onLine === false) return 'offline';
      if (!verified) {
        let v;
        try { v = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }); } catch (err) { return netError(err) ? 'offline' : 'expired'; }
        if (v.error) return netError(v.error) ? 'offline' : 'expired';
        verified = true;
      }
      pendingLink = null;
      cleanUrl();
      setReset((await readSession()).user || 'reset');
      pendingPass = pass;   // נשמרת אחרי הקוד מהטלפון, אם הופעל; אחרת מיד
      run(proceed);
      return 'ok';
    };
    show(ui.NewPass, { onSave: save, onBack: back });
  }

  await run(proceed);
}
