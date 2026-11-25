
import { html, render } from '../vendor/preact-htm.js';
import { Loader } from './ui/bits.js';

const WAKE_MS = 60 * 1000;
const QUICK_MS = 4000;   // מכשיר מוכר: לא מחכים לרשת חלשה יותר מזה כדי לפתוח את היומן

const TEXT = {
  notOwner: 'החשבון הזה לא מורשה להיכנס.',
  signOut: 'יציאה',
  firstRun: 'צריך חיבור לאינטרנט בפעם הראשונה.',
  retry: 'לנסות שוב',
};

let live = null;   // במצב אמיתי, מהרגע שהיומן עולה: { status(), signOut() }

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
  render(html`<${Loader} />`, root);
  const cfg = await readConfig();
  if (cfg.url && cfg.key) return real(root, cfg, { startApp, fail });

  if (cfg.missing) {
    let key = 'torim.v1';
    try { key = (await import('./data/store.js')).STORAGE_KEY; } catch { /* נשאר */ }
    if (realDevice(key)) {
      try {
        const ui = await import('./screens/login.js');
        render(html`<${ui.Stop} text=${TEXT.firstRun} action=${TEXT.retry} onAction=${() => location.reload()} />`, root);
      } catch { fail(); }
      return undefined;
    }
  }
  return startApp(root);
}

async function real(root, cfg, { startApp, fail }) {
  let ui;
  try { ui = await import('./screens/login.js'); } catch (err) { console.error('מסך הכניסה לא נטען', err); fail(); return; }
  const show = (C, props = {}) => render(html`<${C} ...${props} />`, root);
  const reload = () => location.reload();

  if (cfg.problem) { console.error(cfg.problem); show(ui.Stop, { text: cfg.problem, kind: 'danger' }); return; }

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

  let storage = null;     // נוצר רק אחרי אישור בעלת החשבון, ופעם אחת
  let started = false;
  let revoked = false;
  let leaving = false;
  let stopWake = () => {};

  const getMark = () => { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } };
  const setMark = (id) => {
    try { if (id) localStorage.setItem(OWNER_KEY, id); else localStorage.removeItem(OWNER_KEY); } catch { /* אין גישה */ }
  };
  const isLinked = () => { try { return !!(parse(localStorage.getItem(`${KEY}.sync`)) || {}).linked; } catch { return false; } };
  const netError = (err) => !err || lib.isAuthRetryableFetchError(err) || !err.status || err.status >= 500;

  const run = (step) => step().catch((err) => { console.error('העלייה נכשלה', err); fail(); });
  const firstRunStop = () => show(ui.Stop, { text: TEXT.firstRun, action: TEXT.retry, onAction: () => run(proceed) });
  const notOwnerStop = () => {
    setMark(null);
    show(ui.Stop, { text: TEXT.notOwner, kind: 'warn', action: TEXT.signOut, onAction: signOut });
  };

  async function readSession() {
    try {
      const { data, error } = await client.auth.getSession();
      const s = data && data.session;
      if (s) return { kind: 'in', user: s.user ? s.user.id : null };
      return { kind: error && lib.isAuthRetryableFetchError(error) ? 'unknown' : 'out' };
    } catch {
      return { kind: 'unknown' };
    }
  }

  async function askOwner() {
    if ((await readSession()).kind !== 'in') return 'unknown';
    try { return (await remote.isOwner()) ? 'yes' : 'no'; } catch { return 'unknown'; }
  }

  async function proceed() {
    const mark = getMark();
    const known = isLinked() && !!mark;   // המכשיר כבר חובר, ובעלת החשבון כבר אומתה בו

    const s = await (known ? within(readSession(), QUICK_MS, { kind: 'unknown' }) : readSession());
    if (s.kind === 'out') { show(ui.default, { onLogin: signIn, onForgot: forgot }); return; }

    const trusted = known && (s.kind === 'unknown' || s.user === mark);
    if (s.kind !== 'in' && !trusted) { firstRunStop(); return; }   // יש חיבור שמור, אבל בלי רשת אי אפשר לבדוק אותו
    const check = askOwner();
    const owner = await (trusted ? within(check, QUICK_MS, 'late') : check);
    if (owner === 'no') { notOwnerStop(); return; }
    if (owner !== 'yes' && !trusted) { firstRunStop(); return; }
    if (owner === 'yes' && s.user) setMark(s.user);
    if (owner === 'late') check.then((r) => { if (r === 'no') revoke(); });

    if (revoked) return;
    if (!storage) storage = sync.createSyncStorage({ local: localStorage, remote, key: KEY });
    try {
      await storage.start();
    } catch (err) {
      console.warn('החיבור הראשון נכשל', err);
      firstRunStop();
      return;
    }
    if (revoked) return;

    await open();
  }

  async function open() {
    if (started) return;
    started = true;
    store.useStorage(storage);
    storage.onChange(() => store.getStore().touch());
    live = { status: () => storage.status(), signOut };
    if (!(await startApp(root))) return;
    if (revoked) { notOwnerStop(); return; }   // התשובה "לא מורשה" הגיעה בזמן שהיומן נטען

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

  function revoke() {
    revoked = true;
    halt();
    live = null;
    notOwnerStop();
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
    run(proceed);   // המסך נשאר "רגע..." עד שהשלב הבא מחליף אותו
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

  const cleanUrl = () => history.replaceState(null, '', `${location.pathname}#/home`);

  function showNewPass(tokenHash) {
    let verified = false;
    const back = () => { cleanUrl(); run(proceed); };
    const save = async (pass) => {
      if (navigator.onLine === false) return 'offline';
      try {
        if (!verified) {
          const v = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
          if (v.error) return netError(v.error) ? 'offline' : 'expired';
          verified = true;
        }
        const u = await client.auth.updateUser({ password: pass });
        if (u.error && u.error.code !== 'same_password') {
          if (netError(u.error)) return 'offline';
          return u.error.code === 'weak_password' ? 'weak' : 'expired';
        }
      } catch (err) {
        return netError(err) ? 'offline' : 'expired';
      }
      cleanUrl();
      run(proceed);   // יש חיבור: ממשיכים ליומן כמו אחרי כניסה רגילה
      return 'ok';
    };
    show(ui.NewPass, { onSave: save, onBack: back });
  }

  const params = new URLSearchParams(location.search);
  const recovery = params.get('type') === 'recovery' ? params.get('token_hash') : null;
  if (recovery) { showNewPass(recovery); return; }
  await run(proceed);
}
