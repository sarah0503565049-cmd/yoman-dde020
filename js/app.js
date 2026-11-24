
import { html, render, useState, useEffect } from '../vendor/preact-htm.js';
import { useRoute, replace, fillPath } from './router.js';
import { TABS, loadScreen } from './routes.js';
import { Page, Empty, Notice, Loader, OverlayHost, Boundary } from './ui/bits.js';
import { Icon } from './ui/icons.js';


const modules = new Map();

function screenEntry(file) {
  let e = modules.get(file);
  if (!e) {
    e = { status: 'loading', C: null };
    e.ready = loadScreen(file).then(
      (m) => {
        if (typeof m.default === 'function') { e.status = 'ok'; e.C = m.default; } else e.status = 'missing';
      },
      () => { e.status = 'missing'; },
    );
    modules.set(file, e);
  }
  return e;
}

function Placeholder({ route, params }) {
  return html`<${Page} title=${route.title} em=${route.em} back=${!route.tab} backTo=${fillPath(route.backTo || '/home', params)}>
    <${Empty} text="המסך הזה עוד לא נבנה" />
  </${Page}>`;
}

function ScreenHost({ r }) {
  const entry = screenEntry(r.route.file);
  const [, bump] = useState(0);
  const wasLoading = entry.status === 'loading';
  useEffect(() => {
    if (!wasLoading) return undefined;
    let alive = true;
    entry.ready.then(() => { if (alive) bump((n) => n + 1); });
    return () => { alive = false; };
  }, [r.route.file]);

  if (entry.status === 'loading') return html`<div class="page" />`;
  const fallback = html`<${Placeholder} route=${r.route} params=${r.params} />`;
  if (entry.status !== 'ok') return fallback;
  const Screen = entry.C;
  return html`<${Boundary} fallback=${fallback} resetKey=${r.hash}>
    <${Screen} params=${r.params} query=${r.query} />
  </${Boundary}>`;
}


function TabBar({ active }) {
  const onTap = (e, t) => {
    if (t.id !== active) return; // מעבר רגיל דרך הקישור
    e.preventDefault();
    const main = document.querySelector('.page-main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return html`<nav class="tabbar" aria-label="ניווט ראשי">
    <div class=${'tabbar-in' + (TABS.some((t) => t.wide) ? ' has-wide' : '')}>
      ${TABS.map((t) => html`<a key=${t.id} class=${'tab' + (t.id === active ? ' is-active' : '') + (t.wide ? ' is-wide-only' : '')} href=${'#' + t.path}
          aria-current=${t.id === active ? 'page' : undefined} onClick=${(e) => onTap(e, t)}>
        <span class="tab-pill"><${Icon} name=${t.icon} size=${26} /><span class="tab-label">${t.label}</span></span>
      </a>`)}
    </div>
  </nav>`;
}


function App() {
  const r = useRoute();
  useEffect(() => { if (!r.route) replace('/home'); }, [r.hash]);
  if (!r.route) return null;
  const tab = r.route.tab;
  return html`<div class=${'shell' + (tab ? ' has-nav' : '')}>
    <div class="shell-screen">
      <${ScreenHost} key=${r.route.key || r.route.path} r=${r} />
    </div>
    ${tab && html`<${TabBar} active=${tab} />`}
    <${OverlayHost} />
  </div>`;
}

function BootError() {
  return html`<div class="shell"><div class="shell-screen">
    <${Page} title="יומן">
      <${Notice} kind="danger" title="היומן לא נטען">כדאי לסגור את האפליקציה ולפתוח אותה שוב.</${Notice}>
    </${Page}>
  </div></div>`;
}

async function boot() {
  const root = document.getElementById('app');
  render(html`<${Loader} />`, root);
  try {
    const { getStore } = await import('./data/store.js');
    const store = await getStore();
    await store.getSettings(); // בפעם הראשונה כאן נכתבים נתוני הדוגמה
  } catch (err) {
    console.error('הטעינה של הנתונים נכשלה', err);
    render(html`<${BootError} />`, root);
    return;
  }
  render(html`<${App} />`, root);
}

boot();


const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && secure) {
  const reg = () => navigator.serviceWorker.register('sw.js').catch((err) => console.warn('sw', err));
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
}
