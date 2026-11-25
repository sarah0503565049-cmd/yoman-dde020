
import { html, render, useState, useEffect, useLayoutEffect, useRef } from '../../vendor/preact-htm.js';
import { Icon } from '../ui/icons.js';
import { getStore } from '../data/store.js';
import { publicMode, slotLength } from '../lib/booking.js';
import { normalizePhone, formatPhone } from '../lib/model.js';
import { DAY_NAMES, dow, parts, fmtTime, fmtDuration, fmtDateLong, isYmd } from '../lib/time.js';
import { BOOK } from './config.js';
import { HERO, LOGO, BUTTONS, TREATMENTS } from './content.js';

const store = getStore();
const cx = (...a) => a.filter(Boolean).join(' ');
const money = (v) => `${(Number(v) || 0).toLocaleString('he-IL')} ₪`;
const dayChip = (ymd) => { const { d, m } = parts(ymd); return `${DAY_NAMES[dow(ymd)]} ${d}/${m}`; };
const nameOf = (s) => String(s || '').replace(/ - /g, ' - ');
const FIRST_DAYS = 9;

const RIVER_SEL = '.bk-line, .bk-lead, .bk-detail p, .bk-li-t, .notice-text';
function unRiver() {
  for (const el of document.querySelectorAll(RIVER_SEL)) {
    el.style.textAlign = 'start';
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = [];
    for (const r of range.getClientRects()) {
      if (!r.width) continue;
      const l = lines.find((x) => Math.abs(x.top - r.top) < 4);
      if (l) { l.left = Math.min(l.left, r.left); l.right = Math.max(l.right, r.right); } else lines.push({ top: r.top, left: r.left, right: r.right });
    }
    let river = false;
    if (lines.length > 1) {
      const width = el.getBoundingClientRect().width;
      const words = el.textContent.trim().split(/\s+/).length;
      const total = lines.reduce((s, l) => s + (l.right - l.left), 0);
      for (const l of lines.slice(0, -1)) {
        const w = l.right - l.left;
        const gaps = Math.max(1, Math.round((words * w) / total) - 1);
        if ((width - w) / gaps > 9) river = true;
      }
    }
    el.style.textAlign = river ? 'start' : '';
  }
}
let riverTimer = 0;
const unRiverSoon = () => { clearTimeout(riverTimer); riverTimer = setTimeout(unRiver, 60); };
window.addEventListener('resize', unRiverSoon);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(unRiverSoon);


history.scrollRestoration = 'manual';
const depth = () => (history.state && history.state.bk) || 0;
const readRoute = () => {
  const raw = location.hash.replace(/^#\/?/, '');
  const q = raw.indexOf('?');
  const path = q >= 0 ? raw.slice(0, q) : raw;
  const query = {};
  new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '').forEach((v, k) => { query[k] = v; });
  return { key: `${depth()}|${raw}`, seg: path.split('/').filter(Boolean).map(decodeURIComponent), query };
};
const listeners = new Set();
const scrollMem = new Map();
let current = readRoute();
const emit = () => { current = readRoute(); listeners.forEach((fn) => fn(current)); };

function go(path, { replace = false } = {}) {
  scrollMem.set(current.key, window.scrollY);
  const url = '#/' + path.replace(/^\//, '');
  if (replace) history.replaceState({ bk: depth() }, '', url); else history.pushState({ bk: depth() + 1 }, '', url);
  emit();
}
function back(fallback = '/') {
  if (depth() > 0) history.back(); else go(fallback, { replace: true });
}
function setQuery(path) { history.replaceState({ bk: depth() }, '', '#/' + path); current = readRoute(); }

window.addEventListener('popstate', () => { scrollMem.set(current.key, window.scrollY); emit(); });
window.addEventListener('hashchange', () => { if (readRoute().key !== current.key) emit(); });
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest('a[href^="#/"]');
  if (!a) return;
  e.preventDefault();
  go(a.getAttribute('href').slice(2));
});

function useRoute() {
  const [r, setR] = useState(current);
  useEffect(() => { listeners.add(setR); return () => listeners.delete(setR); }, []);
  return r;
}

function useScrollRestore(ready) {
  const done = useRef(false);
  useLayoutEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    window.scrollTo(0, scrollMem.get(current.key) || 0);
  }, [ready]);
}


const ME_KEY = 'book.me';
const readMe = () => { try { return JSON.parse(sessionStorage.getItem(ME_KEY)) || {}; } catch { return {}; } };
const writeMe = (v) => { try { sessionStorage.setItem(ME_KEY, JSON.stringify(v)); } catch { /* בלי אחסון: ממלאים שוב */ } };


function Shell({ head = true, backTo = '/', top = false, foot, children }) {
  useLayoutEffect(unRiver);
  return html`<div class="bk">
    ${head && html`<header class="bk-head"><div class=${cx('bk-in bk-head-row', !backTo && 'no-back')}>
      ${backTo && html`<button type="button" class="icon-btn back-btn" aria-label="חזרה" onClick=${() => back(backTo)}><${Icon} name="back" /></button>`}
      <a class="bk-head-logo" href="#/"><img src=${LOGO.black} alt="Sarah B Cosmetics" width="300" height="330" /></a>
    </div></header>`}
    <main class=${cx('bk-main bk-in', top && 'is-top')}>${children}</main>
    ${foot && html`<div class="bk-foot"><div class="bk-in bk-foot-in">${foot}</div></div>`}
  </div>`;
}

function Meta({ svc }) {
  const len = publicMode(svc, BOOK) === 'book' ? slotLength(svc, BOOK) : svc.durationMin;
  return html`<p class="bk-meta">
    ${BOOK.showPrices && html`<span class="money">${money(svc.price)}</span>`}
    ${BOOK.showPrices && len > 0 && html`<span aria-hidden="true">·</span>`}
    ${len > 0 && html`<span>${fmtDuration(len)}</span>`}
  </p>`;
}

function BookButton({ svc }) {
  if (publicMode(svc, BOOK) === 'whatsapp') {
    return html`<a class="btn btn-primary" href=${BOOK.whatsapp.href} target="_blank" rel="noopener">
      <${Icon} name="whatsapp" size=${22} /><span>${BUTTONS.book} בוואטסאפ</span></a>`;
  }
  return html`<a class="btn btn-primary" href=${'#/when/' + svc.id}><span>${BUTTONS.book}</span></a>`;
}

function AskButton() {
  return html`<a class="btn btn-soft" href=${BUTTONS.askHref} target="_blank" rel="noopener">
    <${Icon} name="whatsapp" size=${22} /><span>${BUTTONS.ask}</span></a>`;
}

function Loading() {
  return html`<div class="bk-loading" role="status" aria-label="טוען"><span class="loader-dots"><span /><span /><span /></span></div>`;
}

function Notice({ kind = 'info', title, children }) {
  return html`<div class=${'notice is-' + kind} role=${kind === 'danger' ? 'alert' : undefined}>
    <div class="notice-body">
      ${title && html`<p class="notice-title">${title}</p>`}
      ${children && html`<div class="notice-text">${children}</div>`}
    </div>
  </div>`;
}


function TreatmentCard({ svc }) {
  const c = TREATMENTS[svc.id] || {};
  const img = c.image;
  const hasDetails = (c.details || []).length > 0 || (c.intro || []).length > 0;
  return html`<article class="card bk-card" id=${'t-' + svc.id}>
    <div class="bk-card-body">
      <div class="bk-card-head">
        ${img && html`<img class="bk-circle" src=${img.src} alt="" loading="lazy" decoding="async" />`}
        <h2 class="bk-card-title">${nameOf(svc.name)}</h2>
      </div>
      ${c.line && html`<p class="bk-line">${c.line}</p>`}
      <${Meta} svc=${svc} />
      ${hasDetails && html`<a class="btn-text bk-more" href=${'#/t/' + svc.id}>${BUTTONS.details}<${Icon} name="chevronEnd" size=${20} /></a>`}
      <${BookButton} svc=${svc} />
    </div>
  </article>`;
}

function ListScreen({ services }) {
  useScrollRestore(true);
  return html`<${Shell} head=${false} top>
    <section class="bk-hero">
      <picture>
        <source media="(min-width: 600px)" srcset=${HERO.imageWide} />
        <img class="bk-hero-img" src=${HERO.image} alt="" fetchpriority="high" />
      </picture>
    </section>
    <div class="bk-intro">
      <p class="bk-place">${HERO.place}</p>
      <h1>${HERO.title} <em>${HERO.titleEm}</em></h1>
      <p class="bk-sub">${HERO.sub}</p>
    </div>
    <div class="bk-list">${services.map((s) => html`<${TreatmentCard} key=${s.id} svc=${s} />`)}</div>
    <${AskButton} />
    <div class="bk-end"><img src=${LOGO.black} alt="Sarah B Cosmetics" width="300" height="330" loading="lazy" /></div>
  </${Shell}>`;
}


function DetailPart({ d }) {
  const items = d.items || [];
  const List = d.ordered ? 'ol' : 'ul';
  return html`<section class="bk-detail">
    ${d.title && html`<h3>${d.title}</h3>`}
    ${(d.paras || []).map((p, j) => html`<p key=${j}>${p}</p>`)}
    ${items.length > 0 && html`<${List} class=${cx('bk-items', d.ordered && 'is-ordered')}>
      ${items.map((it, j) => html`<li key=${j}>
        ${it.head && html`<span class="bk-li-h">${it.head}</span>`}
        ${it.text && html`<span class="bk-li-t">${it.text}</span>`}
      </li>`)}
    </${List}>`}
  </section>`;
}

function DetailScreen({ svc }) {
  useScrollRestore(true);
  const c = TREATMENTS[svc.id] || {};
  const img = c.image;
  const intro = (c.intro || []).length ? c.intro : (c.line ? [c.line] : []);
  return html`<${Shell} foot=${html`<${BookButton} svc=${svc} />`}>
    <div class="bk-detail-head">
      ${img && html`<img class="bk-circle is-big" src=${img.src} alt="" />`}
      <h1>${nameOf(svc.name)}</h1>
    </div>
    ${intro.map((p, i) => html`<p class="bk-lead" key=${i}>${p}</p>`)}
    <${Meta} svc=${svc} />
    ${(c.details || []).length > 0 && html`<div class="card bk-details">
      ${c.details.map((d, i) => html`<${DetailPart} key=${i} d=${d} />`)}
    </div>`}
    <${AskButton} />
  </${Shell}>`;
}


function Picked({ svc, date, min }) {
  return html`<div class="card bk-pick">
    <p class="bk-pick-name">${nameOf(svc.name)}</p>
    ${date ? html`<p class="bk-meta"><span>${fmtDateLong(date)}</span><span aria-hidden="true">·</span><span>${fmtTime(min)}</span></p>` : html`<${Meta} svc=${svc} />`}
  </div>`;
}

function WhenScreen({ svc, query }) {
  const [days, setDays] = useState(null);
  const [date, setDate] = useState(isYmd(query.d || '') ? query.d : null);
  const [min, setMin] = useState(query.m != null && query.m !== '' ? Number(query.m) : null);
  const [all, setAll] = useState(false);
  const timesRef = useRef(null);
  useEffect(() => { store.bookingDays(svc.id, { config: BOOK }).then(setDays); }, [svc.id]);
  useScrollRestore(!!days);

  const day = days && days.find((d) => d.date === date);
  const chosen = !!(day && min != null && day.starts.includes(min));
  const shown = days ? (all ? days : days.slice(0, FIRST_DAYS)) : [];
  const dateHidden = days && date && !shown.some((d) => d.date === date);

  const pickDay = (d) => {
    setDate(d);
    setMin(null);
    setQuery(`when/${svc.id}?d=${d}`);
    requestAnimationFrame(() => {
      const el = timesRef.current;
      if (el && el.getBoundingClientRect().top > window.innerHeight * 0.55) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const pickTime = (m) => { setMin(m); setQuery(`when/${svc.id}?d=${date}&m=${m}`); };
  const next = () => { if (chosen) go(`me/${svc.id}/${date}/${min}`); };

  return html`<${Shell} backTo="/" foot=${days && days.length > 0 && html`<button type="button" class="btn btn-primary" disabled=${!chosen} onClick=${next}><span>המשך</span></button>`}>
    <h1>מתי <em>נוח לך?</em></h1>
    <${Picked} svc=${svc} />
    ${!days && html`<${Loading} />`}
    ${days && days.length === 0 && html`<${Notice} title="אין כרגע שעות פנויות לטיפול הזה" />
      <a class="btn btn-primary" href=${BOOK.whatsapp.href} target="_blank" rel="noopener"><${Icon} name="whatsapp" size=${22} /><span>${BUTTONS.book} בוואטסאפ</span></a>`}
    ${days && days.length > 0 && html`<section class="bk-sec" aria-labelledby="bk-day">
      <h2 id="bk-day">יום</h2>
      <div class="bk-grid bk-days">
        ${(dateHidden ? days : shown).map((d) => html`<button type="button" key=${d.date} class=${cx('pill chip', d.date === date && 'is-active')}
          aria-pressed=${d.date === date ? 'true' : 'false'} onClick=${() => pickDay(d.date)}><span>${dayChip(d.date)}</span></button>`)}
      </div>
      ${!all && !dateHidden && days.length > FIRST_DAYS && html`<button type="button" class="btn btn-soft" onClick=${() => setAll(true)}><span>ימים נוספים</span></button>`}
    </section>`}
    ${day && html`<section class="bk-sec" ref=${timesRef} aria-labelledby="bk-time">
      <h2 id="bk-time">שעה</h2>
      <p class="bk-meta">${fmtDateLong(day.date)}</p>
      <div class="bk-grid bk-times">
        ${day.starts.map((m) => html`<button type="button" key=${m} class=${cx('pill chip', m === min && 'is-active')}
          aria-pressed=${m === min ? 'true' : 'false'} onClick=${() => pickTime(m)}><span>${fmtTime(m)}</span></button>`)}
      </div>
    </section>`}
  </${Shell}>`;
}


function MeScreen({ svc, date, min }) {
  useScrollRestore(true);
  const saved = readMe();
  const [name, setName] = useState(saved.name || '');
  const [phone, setPhone] = useState(saved.phone || '');
  const [err, setErr] = useState({});
  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!name.trim()) errs.name = 'חסר שם';
    if (!normalizePhone(phone)) errs.phone = 'מספר הטלפון לא תקין';
    setErr(errs);
    writeMe({ name, phone });
    if (!Object.keys(errs).length) go(`sum/${svc.id}/${date}/${min}`);
  };
  const keyDown = (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); e.target.blur(); }
  };
  const field = (id, label, value, set, error, extra) => html`<div class=${cx('field', error && 'has-error')}>
    <label class="field-label" for=${id}>${label}</label>
    <input id=${id} class="input" value=${value} aria-invalid=${error ? 'true' : undefined} aria-describedby=${error ? id + '-e' : undefined}
      onInput=${(e) => set(e.currentTarget.value)} ...${extra} />
    ${error && html`<p class="field-error" id=${id + '-e'} role="alert">${error}</p>`}
  </div>`;
  return html`<form novalidate onSubmit=${submit} onKeyDown=${keyDown} style="display: contents">
    <${Shell} backTo=${`/when/${svc.id}?d=${date}&m=${min}`} foot=${html`<button type="submit" class="btn btn-primary"><span>המשך</span></button>`}>
      <h1>הפרטים <em>שלך</em></h1>
      <${Picked} svc=${svc} date=${date} min=${min} />
      ${field('bk-name', 'שם מלא', name, setName, err.name, { type: 'text', autocomplete: 'name', enterkeyhint: 'next' })}
      ${field('bk-phone', 'טלפון', phone, setPhone, err.phone, { type: 'tel', dir: 'ltr', inputmode: 'tel', autocomplete: 'tel', enterkeyhint: 'done' })}
    </${Shell}>
  </form>`;
}


function SumScreen({ svc, date, min }) {
  useScrollRestore(true);
  const me = readMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ph = normalizePhone(me.phone);
  useEffect(() => { if (!String(me.name || '').trim() || !ph) go(`me/${svc.id}/${date}/${min}`, { replace: true }); }, []);
  const book = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await store.bookOnline({ serviceId: svc.id, date, startMin: min, name: me.name, phone: me.phone }, { config: BOOK });
      go(`done/${r.appointment.id}`, { replace: true });
    } catch (e) {
      setError(e && e.code === 'slot_taken' ? 'slot' : 'other');
      setBusy(false);
    }
  };
  const row = (k, v, ltr) => html`<div class="bk-sum-row"><span class="bk-sum-k">${k}</span><span class="bk-sum-v" dir=${ltr ? 'ltr' : undefined}>${v}</span></div>`;
  const foot = error === 'slot'
    ? html`<a class="btn btn-primary" href=${`#/when/${svc.id}?d=${date}`}><span>לבחירת שעה אחרת</span></a>`
    : html`<button type="button" class="btn btn-primary" disabled=${busy} onClick=${book}><span>לקביעת התור</span></button>`;
  return html`<${Shell} backTo=${`/me/${svc.id}/${date}/${min}`} foot=${foot}>
    <h1>סיכום <em>התור</em></h1>
    ${error === 'slot' && html`<${Notice} kind="warn" title="השעה הזאת כבר נתפסה">אפשר לבחור שעה אחרת.</${Notice}>`}
    ${error === 'other' && html`<${Notice} kind="danger" title="התור לא נשמר">אפשר לנסות שוב.</${Notice}>`}
    <div class="card bk-sum">
      ${row('טיפול', nameOf(svc.name))}
      ${row('יום', fmtDateLong(date))}
      ${row('שעה', fmtTime(min))}
      ${row('משך', fmtDuration(slotLength(svc, BOOK)))}
      ${BOOK.showPrices && row('מחיר', html`<span class="money">${money(svc.price)}</span>`)}
      ${row('שם', String(me.name || '').trim())}
      ${row('טלפון', formatPhone(ph), true)}
    </div>
  </${Shell}>`;
}


function DoneScreen({ id }) {
  const [a, setA] = useState(undefined);
  useEffect(() => { store.getAppointment(id).then(setA); }, [id]);
  useScrollRestore(a !== undefined);
  if (a === undefined) return html`<${Shell} backTo=${null}><${Loading} /></${Shell}>`;
  if (!a) return html`<${Shell} backTo=${null}><${Notice} title="התור לא נמצא במכשיר הזה" /></${Shell}>`;
  const name = nameOf((a.items || []).map((it) => it.name).join(' + '));
  return html`<${Shell} backTo=${null}>
    <div class="bk-done">
      <h1>התור <em>נקבע</em></h1>
      <p>תודה, נתראה בקליניקה 🤍</p>
    </div>
    <div class="card bk-sum">
      <div class="bk-sum-row"><span class="bk-sum-k">טיפול</span><span class="bk-sum-v">${name}</span></div>
      <div class="bk-sum-row"><span class="bk-sum-k">יום</span><span class="bk-sum-v">${fmtDateLong(a.date)}</span></div>
      <div class="bk-sum-row"><span class="bk-sum-k">שעה</span><span class="bk-sum-v">${fmtTime(a.startMin)}</span></div>
      <div class="bk-sum-row"><span class="bk-sum-k">איפה</span><span class="bk-sum-v">${HERO.place}</span></div>
    </div>
    <${AskButton} />
  </${Shell}>`;
}


function App() {
  const r = useRoute();
  const [services, setServices] = useState(null);
  useEffect(() => {
    store.listServices().then((list) => setServices(list.filter((s) => publicMode(s, BOOK))));
  }, []);
  if (!services) return html`<div class="bk"><${Loading} /></div>`;

  const [screen, a, b, c] = r.seg;
  const svc = a && services.find((s) => s.id === a);
  const bookable = svc && publicMode(svc, BOOK) === 'book';
  const slotOk = isYmd(b || '') && /^\d+$/.test(c || '');
  let view = null;
  if (!screen) view = html`<${ListScreen} services=${services} />`;
  else if (screen === 't' && svc) view = html`<${DetailScreen} svc=${svc} />`;
  else if (screen === 'when' && bookable) view = html`<${WhenScreen} svc=${svc} query=${r.query} />`;
  else if (screen === 'me' && bookable && slotOk) view = html`<${MeScreen} svc=${svc} date=${b} min=${Number(c)} />`;
  else if (screen === 'sum' && bookable && slotOk) view = html`<${SumScreen} svc=${svc} date=${b} min=${Number(c)} />`;
  else if (screen === 'done' && a) view = html`<${DoneScreen} id=${a} />`;
  if (!view) {
    setTimeout(() => go('/', { replace: true }), 0);
    return null;
  }
  return html`<div key=${r.key}>${view}</div>`;
}

async function boot() {
  const root = document.getElementById('app');
  try {
    await store.getSettings();
  } catch (err) {
    console.error('הטעינה נכשלה', err);
  }
  render(html`<${App} />`, root);
}

boot();
