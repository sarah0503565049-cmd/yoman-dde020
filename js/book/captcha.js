
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading = null;

function loadScript(doc = globalThis.document) {
  if (globalThis.turnstile) return Promise.resolve(globalThis.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const s = doc.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve(globalThis.turnstile || null);
    s.onerror = () => { loading = null; resolve(null); };
    doc.head.appendChild(s);
  });
  return loading;
}

export function mountCaptcha(el, siteKey) {
  let id = null;
  let current = null;
  let gone = false;
  const waiters = new Set();
  const settle = (v) => { for (const w of [...waiters]) w(v); waiters.clear(); };
  const ready = loadScript().then((ts) => {
    if (!ts || gone || !el) return null;
    id = ts.render(el, {
      sitekey: siteKey,
      appearance: 'interaction-only',
      language: 'he',
      theme: 'light',
      size: 'flexible',
      callback: (t) => { current = t; settle(t); },
      'expired-callback': () => { current = null; },
      'error-callback': () => { current = null; settle(null); return true; },
    });
    return ts;
  });
  return {
    async token(waitMs = 8000) {
      await ready;
      if (current) return current;
      if (id == null) return null;
      return new Promise((resolve) => {
        const t = setTimeout(() => { waiters.delete(done); resolve(null); }, waitMs);
        const done = (v) => { clearTimeout(t); resolve(v); };
        waiters.add(done);
      });
    },
    reset() {
      current = null;
      if (id != null && globalThis.turnstile) { try { globalThis.turnstile.reset(id); } catch { /* הווידג'ט כבר לא שם */ } }
    },
    destroy() {
      gone = true;
      settle(null);
      if (id != null && globalThis.turnstile) { try { globalThis.turnstile.remove(id); } catch { /* כבר הוסר */ } }
      id = null;
    },
  };
}
