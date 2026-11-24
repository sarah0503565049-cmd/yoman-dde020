
import { useState, useEffect } from '../vendor/preact-htm.js';
import { ROUTES } from './routes.js';

const compiled = ROUTES.map((r) => {
  const names = [];
  const rx = new RegExp('^' + r.path.replace(/:([a-zA-Z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '/?$');
  return { r, rx, names };
});

export function matchRoute(path) {
  for (const { r, rx, names } of compiled) {
    const m = rx.exec(path);
    if (m) {
      const params = {};
      names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  return null;
}

export function fillPath(pattern, params = {}) {
  return String(pattern || '').replace(/:([a-zA-Z]+)/g, (_, n) => encodeURIComponent(params[n] ?? ''));
}

function read() {
  const raw = location.hash.replace(/^#/, '') || '';
  const q = raw.indexOf('?');
  let path = q >= 0 ? raw.slice(0, q) : raw;
  const search = q >= 0 ? raw.slice(q + 1) : '';
  if (path.length > 1) path = path.replace(/\/+$/, '');
  const query = {};
  new URLSearchParams(search).forEach((v, k) => { query[k] = v; });
  const m = path ? matchRoute(path) : null;
  return { hash: raw, path, query, params: m ? m.params : {}, route: m ? m.route : null };
}

let current = read();
const listeners = new Set();

function notify(force) {
  const next = read();
  if (!force && next.hash === current.hash) return; // אותה כתובת (למשל חלונית שנסגרה בכפתור החזרה)
  current = next;
  listeners.forEach((fn) => fn(current));
}

let pendingPop = null;

function popEntries(n) {
  const p = new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', finish);
      if (pendingPop === p) pendingPop = null;
      resolve();
    };
    window.addEventListener('popstate', finish);
    setTimeout(finish, 400);
  });
  pendingPop = p;
  history.go(-n);
  return p;
}

export function popSheetEntry() {
  return popEntries(1);
}

export function afterPendingPop(fn) {
  if (pendingPop) pendingPop.then(() => afterPendingPop(fn)); else fn();
}

function unwind(fn) {
  afterPendingPop(() => {
    const n = (history.state && history.state.sheet) || 0;
    if (!n) fn();
    else popEntries(n).then(() => afterPendingPop(fn));
  });
}

function idx() {
  return (history.state && history.state.idx) || 0;
}

function toHash(path) {
  return '#' + (path.startsWith('/') ? path : '/' + path);
}

export function go(path) {
  unwind(() => {
    history.pushState({ idx: idx() + 1 }, '', toHash(path));
    notify(true);
  });
}

export function replace(path) {
  unwind(() => {
    history.replaceState({ idx: idx() }, '', toHash(path));
    notify(true);
  });
}

export function back(fallback = '/home') {
  unwind(() => {
    if (idx() > 0) history.back();
    else replace(fallback);
  });
}

export function href(path) {
  return toHash(path);
}

export function useRoute() {
  const [r, setR] = useState(current);
  useEffect(() => {
    listeners.add(setR);
    if (r !== current) setR(current);
    return () => listeners.delete(setR);
  }, []);
  return r;
}

export function currentRoute() {
  return current;
}

window.addEventListener('popstate', () => notify(false));
window.addEventListener('hashchange', () => notify(false));

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest('a[href^="#/"]');
  if (!a || a.target === '_blank') return;
  e.preventDefault();
  const path = a.getAttribute('href').slice(1);
  if (a.hasAttribute('data-replace')) replace(path); else go(path);
});

if (!current.route) {
  history.replaceState({ idx: 0 }, '', '#/home');
  current = read();
}
