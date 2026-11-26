
import { html, render, useState, useEffect, useLayoutEffect, useRef } from '../../vendor/preact-htm.js';
import { Icon } from '../ui/icons.js';
import { getStore } from '../data/store.js';
import { publicMode, slotLength, checkMe } from '../lib/booking.js';
import { normalizePhone, formatPhone, fmtBirth } from '../lib/model.js';
import { DAY_NAMES, dow, parts, fmtTime, fmtDuration, fmtDateLong, isYmd, todayYmd } from '../lib/time.js';
import { BirthInput } from '../ui/birth-input.js';
import { BOOK } from './config.js';
import { HERO, LOGO, BUTTONS, TREATMENTS } from './content.js';
import { CLIENT_OPTIONS, createBookRemote, createRemoteSource, createMyRemote } from './remote.js';
import { CLINIC_WAY, WAZE } from '../lib/messages.js';

let demoStore = null;
const store = () => demoStore || (demoStore = getStore());
let live = null;
let my = null;
let CFG = BOOK;
const NAME_MAX = 60;   // השרת מקבל שם עד 60 תווים (db/booking.sql)

const TEXT = {
  offTitle: 'אין חיבור כרגע',
  offText: 'אפשר לנסות שוב בעוד רגע, או לקבוע בוואטסאפ.',
  retry: 'לנסות שוב',
  limit: 'את התור הזה נשמח לקבוע איתך בוואטסאפ.',
};
const MY = {
  title: 'התור', titleEm: 'שלך',
  askConfirm: 'אשמח שתאשר/י הגעה',
  confirmed: 'אישרת הגעה, תודה 🤍',
  moved: 'התור עודכן 🤍',
  cancelled: 'התור בוטל',
  pending: 'התור מחכה לאישור שלי',
  over: 'התור הזה כבר עבר',
  confirm: 'אישור הגעה',
  change: 'שינוי יום או שעה',
  cancel: 'ביטול התור',
  until: (when, time) => `אפשר לשנות או לבטל כאן עד ${when}, בשעה ${time}.`,
  late: (hours) => `כאן אפשר לשנות או לבטל עד ${hours} שעות לפני התור. מכאן והלאה, אשמח שתכתוב/י לי בוואטסאפ.`,
  waChange: 'לשינוי יום או שעה, אשמח שתכתוב/י לי בוואטסאפ.',
  wa: 'לכתוב לי בוואטסאפ',
  waze: 'ניווט בוויז',
  cancelAsk: 'לבטל את התור?',
  cancelYes: 'כן, לבטל את התור',
  cancelNo: 'לא, להשאיר את התור',
  moveTitle: 'שינוי', moveEm: 'יום או שעה',
  save: 'שמירת השינוי',
  notFound: 'לא מצאתי את התור הזה',
  notFoundText: 'אפשר לכתוב לי בוואטסאפ, ואבדוק.',
  offText: 'אפשר לנסות שוב בעוד רגע, או לכתוב לי בוואטסאפ.',
  failed: 'השינוי לא נשמר',
};
const PLACE = CLINIC_WAY.split('\n')[0].replace(/:\s*$/, '.');
const cx = (...a) => a.filter(Boolean).join(' ');
const money = (v) => `${(Number(v) || 0).toLocaleString('he-IL')} ₪`;
const dayChip = (ymd) => { const { d, m } = parts(ymd); return `${DAY_NAMES[dow(ymd)]} ${d}/${m}`; };
const nameOf = (s) => String(s || '').replace(/ - /g, ' - ');
const tileName = (s) => nameOf(s).split(/(\S+-\S+)/).map((p, i) => (i % 2 ? html`<span class="nw">${p}</span>` : p));
const FIRST_DAYS = 9;

const RIVER_SEL = '.bk-line, .bk-lead, .bk-detail p, .bk-li-t, .notice-text';
function fitDetailH1() {
  const h = document.querySelector('.bk-detail-head h1');
  if (!h) return;
  h.style.fontSize = '';
  h.style.whiteSpace = 'nowrap';
  const base = parseFloat(getComputedStyle(h).fontSize);
  const range = document.createRange();
  range.selectNodeContents(h);
  const textW = range.getBoundingClientRect().width;
  const colW = h.getBoundingClientRect().width;
  if (!textW || !colW) { h.style.whiteSpace = ''; return; }
  const size = Math.min(92, (base * colW) / textW);
  if (size <= base) h.style.whiteSpace = '';
  else h.style.fontSize = Math.floor(size * 10) / 10 + 'px';
}
function unRiver() {
  fitDetailH1();
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

const DONE_KEY = 'book.done';
const writeDone = (a) => { try { sessionStorage.setItem(DONE_KEY, JSON.stringify(a)); } catch { /* בלי אחסון: המסך יגיד שהתור לא נמצא */ } };
const readDone = (token) => { try { const a = JSON.parse(sessionStorage.getItem(DONE_KEY)); return a && a.token === token ? a : null; } catch { return null; } };
const KEY_KEY = 'book.key';
function attemptKey(req) {
  const sig = [req.serviceId, req.date, req.startMin, normalizePhone(req.phone)].join('|');
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY_KEY));
    if (saved && saved.sig === sig) return saved.key;
    const key = globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : undefined;
    sessionStorage.setItem(KEY_KEY, JSON.stringify({ sig, key }));
    return key;
  } catch { return undefined; }
}

function Shell({ head = true, backTo = '/', top = false, foot, children }) {
  useLayoutEffect(unRiver);
  return html`<div class="bk">
    ${head && html`<header class="bk-head"><div class=${cx('bk-in bk-head-row', !backTo && 'no-back')}>
      ${backTo && html`<button type="button" class="icon-btn back-btn" aria-label="חזרה" onClick=${() => (typeof backTo === 'function' ? backTo() : back(backTo))}><${Icon} name="back" /></button>`}
      <a class="bk-head-logo" href="#/"><img src=${LOGO.black} alt="Sarah B Cosmetics" width="300" height="330" /></a>
    </div></header>`}
    <main class=${cx('bk-main bk-in', top && 'is-top')}>${children}</main>
    ${foot && html`<div class="bk-foot"><div class="bk-in bk-foot-in">${foot}</div></div>`}
  </div>`;
}

function Meta({ svc }) {
  const len = slotLength(svc, CFG);
  return html`<p class="bk-meta">
    ${CFG.showPrices && html`<span class="money">${money(svc.price)}</span>`}
    ${CFG.showPrices && len > 0 && html`<span aria-hidden="true">·</span>`}
    ${len > 0 && html`<span>${fmtDuration(len)}</span>`}
  </p>`;
}

function WhatsAppBook({ soft = false } = {}) {
  return html`<a class=${soft ? 'btn btn-soft' : 'btn btn-primary'} href=${CFG.whatsapp.href} target="_blank" rel="noopener">
    <${Icon} name="whatsapp" size=${22} /><span>${BUTTONS.book} בוואטסאפ</span></a>`;
}

function Offline({ onRetry }) {
  return html`<${Notice} title=${TEXT.offTitle}>${TEXT.offText}</${Notice}>
    <button type="button" class="btn btn-primary bk-retry" onClick=${onRetry}><span>${TEXT.retry}</span></button>
    <${WhatsAppBook} soft />`;
}

function AskButton() {
  return html`<a class="btn btn-soft" href=${BUTTONS.askHref} target="_blank" rel="noopener">
    <${Icon} name="whatsapp" size=${22} /><span>${BUTTONS.ask}</span></a>`;
}

function Loading() {
  return html`<div class="bk-loading" role="status" aria-label="טוען"><span class="loader-dots"><span /><span /><span /></span></div>`;
}

function Notice({ kind = 'info', title, children, id }) {
  return html`<div id=${id} class=${'notice is-' + kind} role=${kind === 'danger' ? 'alert' : undefined}>
    <div class="notice-body">
      ${title && html`<p class="notice-title">${title}</p>`}
      ${children && html`<div class="notice-text">${children}</div>`}
    </div>
  </div>`;
}

const SVC_KEY = 'book.svc';
const readChosen = () => { try { return sessionStorage.getItem(SVC_KEY); } catch { return null; } };
const writeChosen = (id) => { try { sessionStorage.setItem(SVC_KEY, id); } catch { /* בלי אחסון: בלי סימון */ } };

function TreatmentTile({ svc, chosen }) {
  const c = TREATMENTS[svc.id] || {};
  const img = c.image;
  const wa = publicMode(svc, CFG) === 'whatsapp';
  const len = slotLength(svc, CFG);
  const bookHref = wa ? CFG.whatsapp.href : '#/when/' + svc.id;
  const ext = (on) => (on ? { target: '_blank', rel: 'noopener' } : {});
  const pick = () => writeChosen(svc.id);
  return html`<article class=${cx('bk-tile', chosen && 'is-active')} id=${'t-' + svc.id}>
    <a class="bk-tile-info" href=${'#/when/' + svc.id}
      aria-current=${chosen ? 'true' : undefined} onClick=${pick}>
      ${img ? html`<img class="bk-circle" src=${img.src} alt="" loading="lazy" decoding="async" />`
        : html`<span class="bk-circle is-logo" aria-hidden="true"><img src=${LOGO.black} alt="" loading="lazy" /></span>`}
      <h2 class="bk-tile-title">${tileName(svc.name)}</h2>
      <span class="bk-tile-meta">
        ${CFG.showPrices && html`<span class="money">${money(svc.price)}</span>`}
        ${CFG.showPrices && len > 0 && html`<span aria-hidden="true"> · </span>`}
        ${len > 0 && html`<span>${fmtDuration(len)}</span>`}
      </span>
    </a>
    <a class="bk-tile-book" href=${bookHref} ...${ext(wa)} onClick=${pick}
      aria-label=${`${BUTTONS.tileBook}${wa ? ' בוואטסאפ' : ''}: ${svc.name}`}>
      <span>${BUTTONS.tileBook}</span>
    </a>
    ${chosen && html`<span class="bk-tile-check" aria-hidden="true"><${Icon} name="check" size=${16} /></span>`}
  </article>`;
}

function ListScreen({ services }) {
  useScrollRestore(true);
  const chosen = readChosen();
  return html`<${Shell} head=${false} top>
    <section class="bk-hero">
      <picture>
        <source media="(min-width: 600px)" srcset=${HERO.imageWide} />
        <img class="bk-hero-img" src=${HERO.image} alt="" fetchpriority="high" />
      </picture>
      <h1 class="bk-hero-title">${HERO.title} <em>${HERO.titleEm}</em></h1>
    </section>
    <div class="bk-intro">
      <p class="bk-place">${HERO.place}</p>
      <p class="bk-sub">${HERO.sub}</p>
    </div>
    <div class="bk-tiles">${services.map((s) => html`<${TreatmentTile} key=${s.id} svc=${s} chosen=${s.id === chosen} />`)}</div>
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

function Sheet({ title, onClose, children }) {
  const panel = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = panel.current;
    const first = el && (el.querySelector('.chip.is-active') || el.querySelector('.chip') || el.querySelector('button'));
    if (first) first.focus({ preventScroll: true });
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    document.documentElement.classList.add('bk-noscroll');
    return () => {
      document.removeEventListener('keydown', key);
      document.documentElement.classList.remove('bk-noscroll');
      if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, []);
  return html`<div class="bk-sheet-back" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="bk-sheet" role="dialog" aria-modal="true" aria-labelledby="bk-sheet-t" ref=${panel}>
      <div class="bk-sheet-head">
        <h2 id="bk-sheet-t">${title}</h2>
        <button type="button" class="icon-btn" aria-label="סגירה" onClick=${onClose}><${Icon} name="close" /></button>
      </div>
      <div class="bk-sheet-body">${children}</div>
    </div>
  </div>`;
}

function PickButton({ id, icon, label, value, disabled, onClick }) {
  return html`<button type="button" id=${id} class=${cx('btn btn-soft bk-pickbtn', value && 'has-value')} disabled=${disabled}
    aria-haspopup="dialog" aria-label=${value ? `${label}: ${value}` : label} onClick=${onClick}>
    <${Icon} name=${icon} size=${22} />
    <span class="bk-pickbtn-t">${value || label}</span>
    <span class="bk-pickbtn-arrow" aria-hidden="true"><${Icon} name="chevronEnd" size=${20} /></span>
  </button>`;
}

function TreatmentScreen({ svc, query }) {
  const c = TREATMENTS[svc.id] || {};
  const wa = publicMode(svc, CFG) === 'whatsapp';
  const [days, setDays] = useState(wa ? [] : null);
  const [offline, setOffline] = useState(false);
  const [date, setDate] = useState(isYmd(query.d || '') ? query.d : null);
  const [min, setMin] = useState(query.m != null && query.m !== '' ? Number(query.m) : null);
  const [sheet, setSheet] = useState(null);
  const [all, setAll] = useState(false);
  const [more, setMore] = useState(query.more === '1');
  const loadDays = () => {
    if (!live) { store().bookingDays(svc.id, { config: CFG }).then(setDays); return; }
    setOffline(false);
    live.days(svc.id).then((d) => { CFG = live.cfg; setDays(d); }, () => setOffline(true));
  };
  useEffect(() => { if (!wa) loadDays(); }, [svc.id]);
  useScrollRestore(!!days || offline);

  const day = days && days.find((d) => d.date === date);
  const chosen = !!(day && min != null && day.starts.includes(min));
  const shown = days ? (all ? days : days.slice(0, FIRST_DAYS)) : [];
  const dateHidden = days && date && !shown.some((d) => d.date === date);
  const intro = (c.intro || []).length ? c.intro : (c.line ? [c.line] : []);
  const hasMore = intro.length > 0 || (c.details || []).length > 0;

  const pickDay = (d) => { setDate(d); setMin(null); setQuery(`when/${svc.id}?d=${d}`); setSheet('time'); };
  const pickTime = (m) => { setMin(m); setQuery(`when/${svc.id}?d=${date}&m=${m}`); setSheet(null); };
  const next = () => { if (chosen) go(`me/${svc.id}/${date}/${min}`); };
  const toggleMore = () => { setMore(!more); if (!more) requestAnimationFrame(unRiverSoon); };

  const foot = wa ? html`<${WhatsAppBook} />`
    : days && days.length > 0 && html`<button type="button" class="btn btn-primary" disabled=${!chosen} onClick=${next}><span>המשך</span></button>`;
  return html`<${Shell} backTo="/" foot=${foot}>
    <div class="bk-detail-head"><h1>${nameOf(svc.name)}</h1></div>
    <${Meta} svc=${svc} />
    ${!days && !offline && html`<${Loading} />`}
    ${!days && offline && html`<${Offline} onRetry=${loadDays} />`}
    ${!wa && days && days.length === 0 && html`<${Notice} title="אין כרגע שעות פנויות לטיפול הזה" /><${WhatsAppBook} />`}
    ${!wa && days && days.length > 0 && html`<div class="bk-picks">
      <${PickButton} id="bk-pick-day" icon="calendar" label=${BUTTONS.pickDay} value=${day ? fmtDateLong(day.date) : null} onClick=${() => setSheet('day')} />
      <${PickButton} id="bk-pick-time" icon="clock" label=${BUTTONS.pickTime} value=${chosen ? fmtTime(min) : null} disabled=${!day} onClick=${() => setSheet('time')} />
    </div>`}
    ${hasMore && html`<button type="button" class="btn-text bk-more-btn" aria-expanded=${more ? 'true' : 'false'} aria-controls="bk-more" onClick=${toggleMore}>
      <span>${BUTTONS.more}</span><span class=${cx('bk-more-arrow', more && 'is-open')} aria-hidden="true"><${Icon} name="chevronEnd" size=${20} /></span>
    </button>`}
    ${hasMore && more && html`<div class="bk-more" id="bk-more">
      ${c.image && html`<img class="bk-circle is-big" src=${c.image.src} alt="" />`}
      ${intro.map((p, i) => html`<p class="bk-lead" key=${i}>${p}</p>`)}
      ${(c.details || []).length > 0 && html`<div class="card bk-details">
        ${c.details.map((d, i) => html`<${DetailPart} key=${i} d=${d} />`)}
      </div>`}
    </div>`}
    <${AskButton} />
    ${sheet === 'day' && days && html`<${Sheet} key="day" title=${BUTTONS.pickDay} onClose=${() => setSheet(null)}>
      <div class="bk-grid bk-days">
        ${(dateHidden ? days : shown).map((d) => html`<button type="button" key=${d.date} class=${cx('pill chip', d.date === date && 'is-active')}
          aria-pressed=${d.date === date ? 'true' : 'false'} onClick=${() => pickDay(d.date)}><span>${dayChip(d.date)}</span></button>`)}
      </div>
      ${!all && !dateHidden && days.length > FIRST_DAYS && html`<button type="button" class="btn btn-soft" onClick=${() => setAll(true)}><span>ימים נוספים</span></button>`}
    </${Sheet}>`}
    ${sheet === 'time' && day && html`<${Sheet} key="time" title=${BUTTONS.pickTime} onClose=${() => setSheet(null)}>
      <p class="bk-meta">${fmtDateLong(day.date)}</p>
      <div class="bk-grid bk-times">
        ${day.starts.map((m) => html`<button type="button" key=${m} class=${cx('pill chip', m === min && 'is-active')}
          aria-pressed=${m === min ? 'true' : 'false'} onClick=${() => pickTime(m)}><span>${fmtTime(m)}</span></button>`)}
      </div>
    </${Sheet}>`}
  </${Shell}>`;
}

const EMPTY_BIRTH = { d: '', m: '', y: '' };

function Picked({ svc, date, min }) {
  return html`<div class="card bk-pick">
    <p class="bk-pick-name">${nameOf(svc.name)}</p>
    <p class="bk-meta"><span>${fmtDateLong(date)}</span><span aria-hidden="true">·</span><span>${fmtTime(min)}</span></p>
  </div>`;
}

function MeScreen({ svc, date, min }) {
  useScrollRestore(true);
  const saved = readMe();
  const [name, setName] = useState(saved.name || '');
  const [phone, setPhone] = useState(saved.phone || '');
  const [birth, setBirth] = useState(saved.birth || EMPTY_BIRTH);
  const [err, setErr] = useState({});
  const today = todayYmd();
  const submit = (e) => {
    e.preventDefault();
    const { errors, birthDate } = checkMe({ name, phone, birth }, today);
    setErr(errors);
    writeMe({ name, phone, birth, birthDate });
    if (!Object.keys(errors).length) go(`sum/${svc.id}/${date}/${min}`);
    else requestAnimationFrame(() => { const el = document.querySelector('.field.has-error'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  };
  const clear = (k, set) => (v) => { set(v); if (err[k]) setErr({ ...err, [k]: undefined }); };
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
      ${field('bk-name', 'שם מלא', name, clear('name', setName), err.name, { type: 'text', autocomplete: 'name', enterkeyhint: 'next', 'aria-required': 'true', maxlength: live ? NAME_MAX : undefined })}
      ${field('bk-phone', 'טלפון', phone, clear('phone', setPhone), err.phone, { type: 'tel', dir: 'ltr', inputmode: 'tel', autocomplete: 'tel', enterkeyhint: 'done', 'aria-required': 'true' })}
      <div class=${cx('field', err.birth && 'has-error')}>
        <label class="field-label" id="bk-birth-l" for="bk-birth">תאריך לידה <span class="field-opt">(לא חובה)</span></label>
        <${BirthInput} id="bk-birth" value=${birth} onChange=${clear('birth', setBirth)} thisYear=${Number(today.slice(0, 4))}
          labelledBy="bk-birth-l" invalid=${!!err.birth} describedBy=${err.birth ? 'bk-birth-e' : undefined} />
        ${err.birth && html`<p class="field-error" id="bk-birth-e" role="alert">${err.birth}</p>`}
      </div>
    </${Shell}>
  </form>`;
}

function SumScreen({ svc, date, min }) {
  useScrollRestore(true);
  const me = readMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ph = normalizePhone(me.phone);
  const ok = !Object.keys(checkMe(me, todayYmd()).errors).length;
  useEffect(() => { if (!ok) go(`me/${svc.id}/${date}/${min}`, { replace: true }); }, []);
  const book = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (live) {
      const req = { serviceId: svc.id, date, startMin: min, name: me.name, phone: me.phone, birthDate: me.birthDate || null };
      const r = await live.book({ ...req, key: attemptKey(req) });
      if (r.ok) { writeDone(r.appointment); go(`done/${r.appointment.token}`, { replace: true }); return; }
      setError(r.code === 'slot_taken' ? 'slot' : r.code === 'limit' ? 'limit' : 'other');
      setBusy(false);
      return;
    }
    try {
      const r = await store().bookOnline({ serviceId: svc.id, date, startMin: min, name: me.name, phone: me.phone, birthDate: me.birthDate || null }, { config: CFG });
      go(`done/${r.appointment.id}`, { replace: true });
    } catch (e) {
      setError(e && e.code === 'slot_taken' ? 'slot' : 'other');
      setBusy(false);
    }
  };
  const row = (k, v, ltr) => html`<div class="bk-sum-row"><span class="bk-sum-k">${k}</span><span class="bk-sum-v" dir=${ltr ? 'ltr' : undefined}>${v}</span></div>`;
  const foot = error === 'slot'
    ? html`<a class="btn btn-primary" href=${`#/when/${svc.id}?d=${date}`}><span>לבחירת שעה אחרת</span></a>`
    : error === 'limit' ? html`<${WhatsAppBook} />`
    : html`<button type="button" class="btn btn-primary" disabled=${busy} onClick=${book}><span>לקביעת התור</span></button>`;
  return html`<${Shell} backTo=${`/me/${svc.id}/${date}/${min}`} foot=${foot}>
    <h1>סיכום <em>התור</em></h1>
    ${error === 'slot' && html`<${Notice} kind="warn" title="השעה הזאת כבר נתפסה">אפשר לבחור שעה אחרת.</${Notice}>`}
    ${error === 'limit' && html`<${Notice} title=${TEXT.limit} />`}
    ${error === 'other' && html`<${Notice} kind="danger" title="התור לא נשמר">אפשר לנסות שוב.</${Notice}>`}
    <div class="card bk-sum">
      ${row('טיפול', nameOf(svc.name))}
      ${row('יום', fmtDateLong(date))}
      ${row('שעה', fmtTime(min))}
      ${row('משך', fmtDuration(slotLength(svc, CFG)))}
      ${CFG.showPrices && row('מחיר', html`<span class="money">${money(svc.price)}</span>`)}
      ${row('שם', String(me.name || '').trim())}
      ${row('טלפון', formatPhone(ph), true)}
      ${me.birthDate && row('תאריך לידה', fmtBirth(me.birthDate))}
    </div>
  </${Shell}>`;
}

function DoneScreen({ id }) {
  const [a, setA] = useState(undefined);
  useEffect(() => { if (live) setA(readDone(id)); else store().getAppointment(id).then(setA); }, [id]);
  useScrollRestore(a !== undefined);
  if (a === undefined) return html`<${Shell} backTo=${null}><${Loading} /></${Shell}>`;
  if (!a) return html`<${Shell} backTo=${null}><${Notice} title="התור לא נמצא במכשיר הזה" /></${Shell}>`;
  const name = nameOf((a.items || []).map((it) => it.name).join(' + '));
  return html`<${Shell} backTo=${() => go('/', { replace: true })}>
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

const TOKEN_RE = /^[0-9a-f]{32}([0-9a-f]{32})?$/;
const myCache = new Map();

function WhatsAppMe({ primary = false } = {}) {
  return html`<a class=${primary ? 'btn btn-primary' : 'btn btn-soft'} href=${CFG.whatsapp.href} target="_blank" rel="noopener">
    <${Icon} name="whatsapp" size=${22} /><span>${MY.wa}</span></a>`;
}

function MyNotFound() {
  return html`<${Shell} backTo=${null}>
    <${Notice} title=${MY.notFound}>${MY.notFoundText}</${Notice}>
    <${WhatsAppMe} primary />
  </${Shell}>`;
}

function MyOffline({ onRetry, backTo = null }) {
  return html`<${Shell} backTo=${backTo}>
    <${Notice} title=${TEXT.offTitle}>${MY.offText}</${Notice}>
    <button type="button" class="btn btn-primary bk-retry" onClick=${onRetry}><span>${TEXT.retry}</span></button>
    <${WhatsAppMe} />
  </${Shell}>`;
}

const treatName = (a) => nameOf((a.items || []).map((it) => it.name).join(' + '));

function MyScreen({ token }) {
  const cached = myCache.get(token);
  const [st, setSt] = useState(cached ? { kind: 'ok', data: cached.data } : { kind: 'loading' });
  const [just, setJust] = useState(cached ? cached.just : null);
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState(false);
  const [ask, setAsk] = useState(false);
  const keep = (data, j = null) => { myCache.set(token, { data, just: null }); setSt({ kind: 'ok', data }); setJust(j); };
  const load = () => {
    if (!my || !TOKEN_RE.test(token || '')) { setSt({ kind: 'nf' }); return; }
    setSt({ kind: 'loading' });
    my.get(token).then((r) => {
      if (r.ok) keep(r);
      else setSt({ kind: r.code === 'not_found' ? 'nf' : 'off' });
    });
  };
  useEffect(() => { if (cached) myCache.set(token, { ...cached, just: null }); else load(); }, [token]);
  useScrollRestore(st.kind !== 'loading');

  const act = async (kind) => {
    if (busy) return;
    setBusy(kind);
    setFailed(false);
    const r = kind === 'confirm' ? await my.confirm(token) : await my.cancel(token);
    setBusy(null);
    setAsk(false);
    if (r.appointment) keep(r, r.ok ? kind : null);   // גם "לא מותר" מחזיר את המצב העדכני (למשל: עברו 48 השעות)
    else if (r.code === 'not_found') setSt({ kind: 'nf' });
    else setFailed(true);
  };

  if (st.kind === 'loading') return html`<${Shell} backTo=${null}><${Loading} /></${Shell}>`;
  if (st.kind === 'nf') return html`<${MyNotFound} />`;
  if (st.kind === 'off') return html`<${MyOffline} onRetry=${load} />`;
  const a = st.data.appointment;
  const live2 = a.status === 'booked' || a.status === 'confirmed';
  const state = just === 'move' && live2 ? MY.moved
    : a.status === 'confirmed' ? MY.confirmed
    : a.status === 'booked' ? MY.askConfirm
    : a.status === 'cancelled' ? MY.cancelled
    : a.status === 'pending' ? MY.pending
    : MY.over;
  const can = a.can || {};
  const cu = a.changeUntil;
  const hours = Math.round((Number(a.changeUntilMin) || 2880) / 60);
  const waShown = live2 && !!a.noChange;
  const row = (k, v) => html`<div class="bk-sum-row"><span class="bk-sum-k">${k}</span><span class="bk-sum-v">${v}</span></div>`;
  return html`<${Shell} backTo=${null}>
    <h1>${MY.title} <em>${MY.titleEm}</em></h1>
    ${failed && html`<${Notice} kind="danger" title=${MY.failed}>אפשר לנסות שוב.</${Notice}>`}
    <${Notice} title=${state} />
    <div class="card bk-sum bk-my-card">
      ${row('טיפול', treatName(a))}
      ${row('יום', fmtDateLong(a.date))}
      ${row('שעה', fmtTime(a.startMin))}
      ${!a.home && row('איפה', PLACE)}
    </div>
    ${live2 && html`<div class="bk-my-actions">
      ${can.confirm && html`<button type="button" class="btn btn-primary" id="my-confirm" disabled=${!!busy} onClick=${() => act('confirm')}><span>${MY.confirm}</span></button>`}
      ${can.change && html`<button type="button" class="btn btn-soft" id="my-change" disabled=${!!busy} onClick=${() => go(`my/${token}/move`)}><span>${MY.change}</span></button>`}
      ${can.cancel && html`<button type="button" class="btn btn-danger" id="my-cancel" disabled=${!!busy} onClick=${() => setAsk(true)}><span>${MY.cancel}</span></button>`}
      ${can.change && can.cancel && cu && html`<${Notice} id="my-until">${MY.until(fmtDateLong(cu.date), fmtTime(cu.min))}</${Notice}>`}
      ${a.noChange === 'late' && html`<${Notice} id="my-late">${MY.late(hours)}</${Notice}>`}
      ${(a.noChange === 'home' || a.noChange === 'moves') && html`<${Notice} id="my-wa-line">${MY.waChange}</${Notice}>`}
      ${waShown && html`<${WhatsAppMe} primary=${!can.confirm} />`}
    </div>`}
    ${live2 && !a.home && html`<a class="btn btn-soft" id="my-waze" href=${WAZE} target="_blank" rel="noopener"><span>${MY.waze}</span></a>`}
    ${live2 && !waShown && html`<${AskButton} />`}
    ${a.status === 'pending' && html`<${WhatsAppMe} />`}
    ${(a.status === 'cancelled' || a.status === 'over') && html`<a class="btn btn-primary" href="#/"><span>${BUTTONS.book}</span></a>`}
    ${ask && html`<${Sheet} key="cancel" title=${MY.cancelAsk} onClose=${() => { if (!busy) setAsk(false); }}>
      <div class="bk-my-actions">
        <button type="button" class="btn btn-danger" id="my-cancel-yes" disabled=${!!busy} onClick=${() => act('cancel')}><span>${MY.cancelYes}</span></button>
        <button type="button" class="btn btn-soft" id="my-cancel-no" disabled=${!!busy} onClick=${() => setAsk(false)}><span>${MY.cancelNo}</span></button>
      </div>
    </${Sheet}>`}
  </${Shell}>`;
}

function MoveScreen({ token, query }) {
  const cached = myCache.get(token);
  const [mine, setMine] = useState(cached ? cached.data.appointment : null);
  const [days, setDays] = useState(null);
  const [offline, setOffline] = useState(false);
  const [date, setDate] = useState(isYmd(query.d || '') ? query.d : null);
  const [min, setMin] = useState(query.m != null && query.m !== '' ? Number(query.m) : null);
  const [sheet, setSheet] = useState(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const home = () => go(`my/${token}`, { replace: true });
  const load = async () => {
    if (!my || !live || !TOKEN_RE.test(token || '')) { home(); return; }
    setOffline(false);
    try {
      let m = mine;
      if (!m) {
        const r = await my.get(token);
        if (!r.ok) { if (r.code === 'not_found') { home(); return; } throw new Error(r.code); }
        myCache.set(token, { data: r, just: null });
        m = r.appointment;
        setMine(m);
      }
      if (!(m.can && m.can.change)) { home(); return; }
      const d = await live.moveDays(m);
      CFG = live.cfg;
      setDays(d);
    } catch {
      setOffline(true);
    }
  };
  useEffect(() => { load(); }, [token]);
  useScrollRestore(!!days || offline);

  const day = days && days.find((d) => d.date === date);
  const chosen = !!(day && min != null && day.starts.includes(min));
  const shown = days ? (all ? days : days.slice(0, FIRST_DAYS)) : [];
  const dateHidden = days && date && !shown.some((d) => d.date === date);
  const pickDay = (d) => { setDate(d); setMin(null); setError(null); setQuery(`my/${token}/move?d=${d}`); setSheet('time'); };
  const pickTime = (m) => { setMin(m); setError(null); setQuery(`my/${token}/move?d=${date}&m=${m}`); setSheet(null); };
  const save = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    const r = await my.move(token, date, min);
    setBusy(false);
    if (r.ok) { myCache.set(token, { data: r, just: 'move' }); back(`/my/${token}`); return; }
    if (r.code === 'slot_taken') { setError('slot'); setMin(null); setDays(null); live.stale(); load(); return; }
    if (r.code === 'not_found') { myCache.delete(token); home(); return; }
    if (r.appointment) { myCache.set(token, { data: r, just: null }); back(`/my/${token}`); return; }
    setError('other');
  };

  if (offline && !days) return html`<${MyOffline} onRetry=${load} backTo=${`/my/${token}`} />`;
  const foot = days && days.length > 0
    && html`<button type="button" class="btn btn-primary" id="my-save" disabled=${!chosen || busy} onClick=${save}><span>${MY.save}</span></button>`;
  return html`<${Shell} backTo=${`/my/${token}`} foot=${foot}>
    <h1>${MY.moveTitle} <em>${MY.moveEm}</em></h1>
    ${mine && html`<${Picked} svc=${{ name: treatName(mine) }} date=${mine.date} min=${mine.startMin} />`}
    ${error === 'slot' && html`<${Notice} kind="warn" title="השעה הזאת כבר נתפסה">אפשר לבחור שעה אחרת.</${Notice}>`}
    ${error === 'other' && html`<${Notice} kind="danger" title=${MY.failed}>אפשר לנסות שוב.</${Notice}>`}
    ${!days && html`<${Loading} />`}
    ${days && days.length === 0 && html`<${Notice} title="אין כרגע שעות פנויות לטיפול הזה" /><${WhatsAppMe} primary />`}
    ${days && days.length > 0 && html`<div class="bk-picks">
      <${PickButton} id="bk-pick-day" icon="calendar" label=${BUTTONS.pickDay} value=${day ? fmtDateLong(day.date) : null} onClick=${() => setSheet('day')} />
      <${PickButton} id="bk-pick-time" icon="clock" label=${BUTTONS.pickTime} value=${chosen ? fmtTime(min) : null} disabled=${!day} onClick=${() => setSheet('time')} />
    </div>`}
    ${sheet === 'day' && days && html`<${Sheet} key="day" title=${BUTTONS.pickDay} onClose=${() => setSheet(null)}>
      <div class="bk-grid bk-days">
        ${(dateHidden ? days : shown).map((d) => html`<button type="button" key=${d.date} class=${cx('pill chip', d.date === date && 'is-active')}
          aria-pressed=${d.date === date ? 'true' : 'false'} onClick=${() => pickDay(d.date)}><span>${dayChip(d.date)}</span></button>`)}
      </div>
      ${!all && !dateHidden && days.length > FIRST_DAYS && html`<button type="button" class="btn btn-soft" onClick=${() => setAll(true)}><span>ימים נוספים</span></button>`}
    </${Sheet}>`}
    ${sheet === 'time' && day && html`<${Sheet} key="time" title=${BUTTONS.pickTime} onClose=${() => setSheet(null)}>
      <p class="bk-meta">${fmtDateLong(day.date)}</p>
      <div class="bk-grid bk-times">
        ${day.starts.map((m) => html`<button type="button" key=${m} class=${cx('pill chip', m === min && 'is-active')}
          aria-pressed=${m === min ? 'true' : 'false'} onClick=${() => pickTime(m)}><span>${fmtTime(m)}</span></button>`)}
      </div>
    </${Sheet}>`}
  </${Shell}>`;
}

function OfflineScreen({ onRetry }) {
  return html`<${Shell} backTo=${null}><${Offline} onRetry=${onRetry} /></${Shell}>`;
}

function App() {
  const r = useRoute();
  const [services, setServices] = useState(null);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const load = () => {
    started.current = true;
    if (!live) { store().listServices().then((list) => setServices(list.filter((s) => publicMode(s, CFG)))); return; }
    setFailed(false);
    live.load().then((x) => { CFG = x.cfg; setServices(x.services.filter((s) => publicMode(s, CFG))); }, (err) => { console.warn('booking_open', err); setFailed(true); });
  };
  const isMy = r.seg[0] === 'my';
  useEffect(() => { if (!isMy && !started.current) load(); }, [isMy]);
  if (isMy) {
    const view = r.seg[2] === 'move' ? html`<${MoveScreen} token=${r.seg[1] || ''} query=${r.query} />` : html`<${MyScreen} token=${r.seg[1] || ''} />`;
    return html`<div key=${r.key}>${view}</div>`;
  }
  if (failed) return html`<${OfflineScreen} onRetry=${load} />`;
  if (!services) return html`<div class="bk"><${Loading} /></div>`;

  const [screen, a, b, c] = r.seg;
  const svc = a && services.find((s) => s.id === a);
  const bookable = svc && publicMode(svc, CFG) === 'book';
  const slotOk = isYmd(b || '') && /^\d+$/.test(c || '');
  let view = null;
  if (!screen) view = html`<${ListScreen} services=${services} />`;
  else if (screen === 't' && svc) { setTimeout(() => go(`when/${svc.id}?more=1`, { replace: true }), 0); return null; }
  else if (screen === 'when' && svc) view = html`<${TreatmentScreen} svc=${svc} query=${r.query} />`;
  else if (screen === 'me' && bookable && slotOk) view = html`<${MeScreen} svc=${svc} date=${b} min=${Number(c)} />`;
  else if (screen === 'sum' && bookable && slotOk) view = html`<${SumScreen} svc=${svc} date=${b} min=${Number(c)} />`;
  else if (screen === 'done' && a) view = html`<${DoneScreen} id=${a} />`;
  if (!view) {
    setTimeout(() => go('/', { replace: true }), 0);
    return null;
  }
  return html`<div key=${r.key}>${view}</div>`;
}

async function readSupabase() {
  try {
    const m = await import('../config.js');
    const c = m.SUPABASE || {};
    const url = String(c.url || '').trim();
    const key = String(c.key || '').trim();
    return { url, key, problem: typeof m.configProblem === 'function' ? m.configProblem({ url, key }) : null };
  } catch {
    return { url: '', key: '' };
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

async function boot() {
  const root = document.getElementById('app');
  const cfg = await readSupabase();
  if (cfg.url && cfg.key) {
    if (cfg.problem) { console.error(cfg.problem); render(html`<${OfflineScreen} onRetry=${() => location.reload()} />`, root); return; }
    try {
      await loadScript('vendor/supabase.js');
      const client = globalThis.supabase.createClient(cfg.url, cfg.key, CLIENT_OPTIONS);
      live = createRemoteSource(createBookRemote(client), BOOK);
      my = createMyRemote(client);
    } catch (err) {
      console.warn('הספרייה לא נטענה', err);
      render(html`<${OfflineScreen} onRetry=${() => location.reload()} />`, root);
      return;
    }
    render(html`<${App} />`, root);
    return;
  }
  try {
    await store().getSettings();
  } catch (err) {
    console.error('הטעינה נכשלה', err);
  }
  render(html`<${App} />`, root);
}

boot();
