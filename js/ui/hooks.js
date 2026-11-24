
import { useState, useEffect, useRef, useCallback } from '../../vendor/preact-htm.js';
import { todayYmd, nowMin } from '../lib/time.js';
import { popSheetEntry, afterPendingPop } from '../router.js';

let storeP = null;
function store() {
  if (!storeP) storeP = import('../data/store.js').then((m) => m.getStore());
  return storeP;
}

export function useData(loader, deps = []) {
  const [state, setState] = useState({ data: undefined, loading: true, error: null });
  const ver = useRef(0);
  const fn = useRef(loader);
  fn.current = loader;

  const run = useCallback(async (quiet) => {
    const v = ++ver.current;
    if (!quiet) setState((s) => (s.loading && !s.error ? s : { ...s, loading: true, error: null }));
    try {
      const data = await fn.current(await store());
      if (v === ver.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (v === ver.current) {
        console.warn('useData', error);
        setState((s) => ({ data: s.data, loading: false, error }));
      }
    }
  }, []);

  useEffect(() => { run(false); }, deps);

  useEffect(() => {
    let off = null;
    let dead = false;
    store().then((s) => { if (!dead) off = s.subscribe(() => run(true)); });
    return () => { dead = true; if (off) off(); };
  }, []);

  return { ...state, reload: () => run(true) };
}

function nowSnap() {
  return { today: todayYmd(), min: nowMin() };
}

export function useNow(everyMs = 30000) {
  const [now, setNow] = useState(nowSnap);
  useEffect(() => {
    const tick = () => setNow((p) => { const n = nowSnap(); return n.today === p.today && n.min === p.min ? p : n; });
    const t = setInterval(tick, everyMs);
    const vis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [everyMs]);
  return now;
}

export function useSessionState(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw != null) return JSON.parse(raw);
    } catch { /* אין גישה או ערך שבור */ }
    return typeof initial === 'function' ? initial() : initial;
  });
  const set = useCallback((v) => {
    setVal((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* מלא או חסום */ }
      return next;
    });
  }, [key]);
  return [val, set];
}

let lockCount = 0;

export function useBackClose(open, onClose) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    let myDepth = 0;
    let pushed = false;
    let byBack = false;
    let dead = false;
    const onPop = () => {
      const d = (history.state && history.state.sheet) || 0;
      if (d < myDepth) {
        byBack = true;
        window.removeEventListener('popstate', onPop);
        if (close.current) close.current();
      }
    };
    afterPendingPop(() => {
      if (dead) return;
      myDepth = ((history.state && history.state.sheet) || 0) + 1;
      history.pushState({ ...(history.state || {}), sheet: myDepth }, '');
      pushed = true;
      window.addEventListener('popstate', onPop);
    });
    lockCount += 1;
    document.documentElement.classList.add('is-locked');
    return () => {
      dead = true;
      window.removeEventListener('popstate', onPop);
      lockCount = Math.max(0, lockCount - 1);
      if (!lockCount) document.documentElement.classList.remove('is-locked');
      if (pushed && !byBack) {
        afterPendingPop(() => {
          if (history.state && history.state.sheet === myDepth) popSheetEntry();
        });
      }
    };
  }, [open]);
}
