
import {
  html, render, Component, createContext,
  useState, useEffect, useLayoutEffect, useRef, useMemo, useContext,
} from '../../vendor/preact-htm.js';
import { Icon } from './icons.js';
import { useBackClose } from './hooks.js';
import { back as routerBack, currentRoute, useRoute } from '../router.js';
import { STATUS } from '../lib/model.js';
import { DAY_NAMES, dow, isYmd } from '../lib/time.js';
import { createDictation, dictationErrorText } from '../lib/voice.js';

const cx = (...a) => a.filter(Boolean).join(' ');
const toHref = (h) => (typeof h === 'string' && h.startsWith('/') ? '#' + h : h);
const has = (v) => v !== undefined && v !== null && v !== false && v !== '';
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let seq = 0;
const useId = (prefix) => useMemo(() => `${prefix}${++seq}`, []);

export function Page({
  title, em, sub, back, backTo, onBack, actions, top, footer, onSubmit,
  wide, scroll = true, class: cls, children,
}) {
  const main = useRef(null);
  const foot = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const showBack = !!(back || onBack);
  const fallback = typeof back === 'string' ? back : backTo || '/home';
  const doBack = () => (onBack ? onBack() : routerBack(fallback));
  const hasFoot = has(footer);

  useScrollMemory(main, scroll);

  useLayoutEffect(() => {
    syncBars();
    const el = foot.current;
    let ro = null;
    if (el && typeof ResizeObserver === 'function') { ro = new ResizeObserver(syncBars); ro.observe(el); }
    return () => { if (ro) ro.disconnect(); syncBars(); };
  }, [hasFoot]);

  const onScroll = (e) => {
    const s = e.currentTarget.scrollTop > 4;
    if (s !== scrolled) setScrolled(s);
  };

  const headEmpty = !title && !showBack && !has(actions) && !has(top) && !has(sub);
  const header = html`<header class=${cx('page-head', headEmpty && 'is-empty')}>
    ${!headEmpty && html`<div class="page-head-in">
      ${(title || showBack || has(actions)) && html`<div class="page-head-row">
        ${showBack && html`<button type="button" class="icon-btn back-btn" aria-label="חזרה" onClick=${doBack}><${Icon} name="back" /></button>`}
        ${title ? html`<h1>${title}${em ? ' ' : ''}${em && html`<em>${em}</em>`}</h1>` : html`<span class="page-head-fill" />`}
        ${has(actions) && html`<div class="page-actions">${actions}</div>`}
      </div>`}
      ${has(sub) && html`<p class="page-sub">${sub}</p>`}
      ${has(top) && html`<div class="page-top">${top}</div>`}
    </div>`}
  </header>`;

  const mainEl = html`<main class="page-main" ref=${main} onScroll=${scroll ? onScroll : undefined}>
    <div class="page-body">${children}</div>
  </main>`;
  const footEl = hasFoot && html`<div class="page-foot" ref=${foot}><div class="page-foot-in">${footer}</div></div>`;

  const submit = (e) => { e.preventDefault(); if (onSubmit) onSubmit(e); };
  const keyDown = (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    const t = e.target;
    if (t && t.tagName === 'INPUT' && !['submit', 'button', 'checkbox', 'radio'].includes(t.type)) {
      e.preventDefault();
      t.blur();
    }
  };

  return html`<div class=${cx('page', wide && 'is-wide', !scroll && 'is-fixed', scrolled && 'is-scrolled', cls)}>
    ${header}
    ${onSubmit
      ? html`<form class="page-form" novalidate onSubmit=${submit} onKeyDown=${keyDown}>${mainEl}${footEl}</form>`
      : [mainEl, footEl]}
  </div>`;
}

const scrollMemory = new Map();
function useScrollMemory(ref, enabled) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    const r = currentRoute();
    const key = `${(history.state && history.state.idx) || 0}|${r.hash}`;
    const saved = scrollMemory.get(key);
    let stop = false;
    let ro = null;
    const restore = () => {
      if (stop || !saved) return;
      el.scrollTop = saved;
      if (Math.abs(el.scrollTop - saved) < 2) { stop = true; if (ro) ro.disconnect(); }
    };
    const userMoved = () => { stop = true; };
    if (saved) {
      restore();
      if (!stop && typeof ResizeObserver === 'function') {
        ro = new ResizeObserver(restore);
        ro.observe(el.firstElementChild || el);
        setTimeout(() => { stop = true; if (ro) ro.disconnect(); }, 1500);
      }
      el.addEventListener('touchstart', userMoved, { passive: true });
      el.addEventListener('wheel', userMoved, { passive: true });
    }
    let raf = 0;
    const save = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; scrollMemory.set(key, el.scrollTop); });
    };
    el.addEventListener('scroll', save, { passive: true });
    return () => {
      if (ro) ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      scrollMemory.set(key, el.scrollTop);
      el.removeEventListener('scroll', save);
      el.removeEventListener('touchstart', userMoved);
      el.removeEventListener('wheel', userMoved);
    };
  }, []);
}

export function Section({ title, em, id, actions, class: cls, children }) {
  return html`<section class=${cx('section', cls)} id=${id}>
    ${(title || has(actions)) && html`<div class="section-head">
      ${title && html`<h2>${title}${em ? ' ' : ''}${em && html`<em>${em}</em>`}</h2>`}
      ${has(actions) && html`<div class="section-actions">${actions}</div>`}
    </div>`}
    ${children}
  </section>`;
}

export function Hero({ image, title, em, sub, actions, position = 'center 74%', class: cls }) {
  return html`<section class=${cx('hero', cls)}>
    ${image && html`<img class="hero-img" src=${image} alt="" decoding="async" style=${{ objectPosition: position }} />`}
    <div class="hero-shade" aria-hidden="true" />
    <div class="hero-text">
      ${title && html`<h1>${title}${em ? ' ' : ''}${em && html`<em>${em}</em>`}</h1>`}
      ${has(sub) && html`<p class="hero-sub">${sub}</p>`}
    </div>
    ${has(actions) && html`<div class="hero-actions">${actions}</div>`}
  </section>`;
}

export function Button({ kind = 'primary', type = 'button', href, onClick, disabled, icon, class: cls, children, ...rest }) {
  const c = cx('btn', `btn-${kind}`, cls);
  const inner = [icon && html`<${Icon} name=${icon} size=${22} />`, html`<span>${children}</span>`];
  if (href && !disabled) return html`<a class=${c} href=${toHref(href)} onClick=${onClick} ...${rest}>${inner}</a>`;
  return html`<button class=${c} type=${type} disabled=${disabled} onClick=${onClick} ...${rest}>${inner}</button>`;
}

export function TextButton({ onClick, href, type = 'button', class: cls, children, ...rest }) {
  if (href) return html`<a class=${cx('btn-text', cls)} href=${toHref(href)} onClick=${onClick} ...${rest}>${children}</a>`;
  return html`<button class=${cx('btn-text', cls)} type=${type} onClick=${onClick} ...${rest}>${children}</button>`;
}

export function IconButton({ icon, label, onClick, href, kind = 'soft', size = 24, class: cls, ...rest }) {
  const c = cx('icon-btn', kind !== 'soft' && `is-${kind}`, cls);
  const ic = html`<${Icon} name=${icon} size=${size} />`;
  if (href) return html`<a class=${c} href=${toHref(href)} aria-label=${label} title=${label} onClick=${onClick} ...${rest}>${ic}</a>`;
  return html`<button type="button" class=${c} aria-label=${label} title=${label} onClick=${onClick} ...${rest}>${ic}</button>`;
}

export function Fab({ onClick, href, label = 'תור חדש', icon = 'plus', class: cls }) {
  useLayoutEffect(() => { syncBars(); return syncBars; }, []);   // ההודעה הקופצת עולה מעליו
  const ic = html`<${Icon} name=${icon} size=${28} />`;
  if (href) return html`<a class=${cx('fab', cls)} href=${toHref(href)} aria-label=${label} title=${label}>${ic}</a>`;
  return html`<button type="button" class=${cx('fab', cls)} aria-label=${label} title=${label} onClick=${onClick}>${ic}</button>`;
}

export function Chip({ active, onClick, color, disabled, class: cls, children, ...rest }) {
  return html`<button type="button" class=${cx('pill chip', active && 'is-active', cls)} aria-pressed=${active ? 'true' : 'false'}
    disabled=${disabled} onClick=${onClick} ...${rest}>${color && html`<${Dot} color=${color} />`}<span>${children}</span></button>`;
}

export function Chips({ class: cls, children }) {
  return html`<div class=${cx('chips', cls)}>${children}</div>`;
}

export function Segmented({ options, value, onChange, label, class: cls }) {
  const ctx = useContext(FieldCtx);
  return html`<div class=${cx('seg', cls)} role="radiogroup" aria-labelledby=${ctx ? ctx.labelId : undefined} aria-label=${ctx ? undefined : label}>
    ${options.map((o) => {
      const on = o.value === value;
      return html`<button type="button" role="radio" aria-checked=${on ? 'true' : 'false'} class=${cx('seg-opt', on && 'is-active')}
        disabled=${o.disabled} onClick=${() => { if (!on && onChange) onChange(o.value); }}>${o.label}</button>`;
    })}
  </div>`;
}

export function Tag({ tone = 'muted', compact, class: cls, children }) {
  return html`<span class=${cx('pill tag', `tag-${tone}`, compact && 'is-compact', cls)}>${children}</span>`;
}

export function StatusBadge({ status, short, compact, class: cls }) {
  const s = STATUS[status];
  if (!s) return null;
  return html`<span class=${cx('pill badge', `st-${status}`, compact && 'is-compact', cls)}>${short ? s.short : s.label}</span>`;
}

export function Dot({ color, size = 12, class: cls }) {
  return html`<span class=${cx('dot', cls)} aria-hidden="true" style=${{ background: color || 'var(--line)', width: size + 'px', height: size + 'px' }} />`;
}

export function fmtMoney(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  const d = Number.isInteger(n) ? 0 : 2;
  return `${n.toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: 2 })} ₪`;
}

export function Money({ value, class: cls }) {
  return html`<span class=${cx('money', cls)}>${fmtMoney(value)}</span>`;
}

const FieldCtx = createContext(null);

function useFieldProps(id) {
  const ctx = useContext(FieldCtx);
  return {
    id: id || (ctx ? ctx.id : undefined),
    'aria-invalid': ctx && ctx.invalid ? 'true' : undefined,
    'aria-describedby': ctx ? ctx.describedBy : undefined,
  };
}

export function Field({ label, hint, error, id, class: cls, children }) {
  const auto = useId('f');
  const fid = id || auto;
  const ctx = {
    id: fid,
    labelId: fid + '-l',
    invalid: !!error,
    describedBy: [hint && fid + '-h', error && fid + '-e'].filter(Boolean).join(' ') || undefined,
  };
  return html`<div class=${cx('field', error && 'has-error', cls)}>
    ${label && html`<label class="field-label" id=${ctx.labelId} for=${fid}>${label}</label>`}
    <${FieldCtx.Provider} value=${ctx}>${children}</${FieldCtx.Provider}>
    ${has(hint) && html`<p class="field-hint" id=${fid + '-h'}>${hint}</p>`}
    ${has(error) && html`<p class="field-error" id=${fid + '-e'} role="alert">${error}</p>`}
  </div>`;
}

export function TextInput({ value, onChange, type = 'text', icon, id, class: cls, ...rest }) {
  const f = useFieldProps(id);
  const input = html`<input class=${cx('input', icon && 'has-icon', cls)} type=${type} dir=${type === 'tel' ? 'ltr' : undefined}
    value=${value ?? ''} onInput=${(e) => onChange && onChange(e.currentTarget.value, e)} ...${rest} ...${f} />`;
  if (!icon) return input;
  return html`<div class="input-wrap"><span class="input-icon" aria-hidden="true"><${Icon} name=${icon} size=${22} /></span>${input}</div>`;
}

export function NumberInput({ value, onChange, suffix, id, class: cls, ...rest }) {
  const f = useFieldProps(id);
  const onInput = (e) => {
    const raw = e.currentTarget.value.replace(/[^\d.]/g, '');
    const n = raw === '' ? null : Number(raw);
    if (onChange) onChange(Number.isFinite(n) ? n : null, e);
  };
  const input = html`<input class=${cx('input is-num', suffix && 'has-suffix', cls)} type="text" inputmode="numeric" autocomplete="off"
    value=${value == null ? '' : String(value)} onInput=${onInput} ...${rest} ...${f} />`;
  if (!suffix) return input;
  return html`<div class="input-wrap">${input}<span class="input-suffix" aria-hidden="true">${suffix}</span></div>`;
}

export function TextArea({ value, onChange, voice, rows = 4, demoListening, id, class: cls, ...rest }) {
  const f = useFieldProps(id);
  const ta = useRef(null);
  const [listening, setListening] = useState(false);
  const live = listening || !!demoListening;
  const val = useRef(value);
  val.current = value;
  const cb = useRef(onChange);
  cb.current = onChange;
  const dict = useRef(null);

  useEffect(() => () => { if (dict.current) dict.current.destroy(); }, []);

  const toggle = () => {
    if (demoListening) return;
    if (!dict.current) {
      dict.current = createDictation({
        getBase: () => String(val.current ?? ''),
        onText: (t) => { if (cb.current) cb.current(t); },
        onState: (s) => setListening(s === 'listening'),
        onError: (code) => {
          toast(dictationErrorText(code));
          if (code === 'unsupported' && ta.current) ta.current.focus();
        },
      });
    }
    if (dict.current.listening) dict.current.stop(); else dict.current.start();
  };

  const area = html`<textarea ref=${ta} class=${cx('input textarea', voice && 'has-mic', cls)} rows=${rows}
    value=${value ?? ''} readOnly=${live} onInput=${(e) => cb.current && cb.current(e.currentTarget.value, e)} ...${rest} ...${f} />`;
  if (!voice) return area;
  return html`<div class=${cx('ta-wrap', live && 'is-listening')}>
    <div class="ta-box">
      ${area}
      <button type="button" class="mic-btn" aria-pressed=${live ? 'true' : 'false'}
        aria-label=${live ? 'עצירת ההכתבה' : 'הכתבה בקול'} title=${live ? 'עצירת ההכתבה' : 'הכתבה בקול'} onClick=${toggle}>
        <${Icon} name="mic" />
      </button>
    </div>
    <p class="mic-note" role="status">${live ? 'מדברים עכשיו, הטקסט נכתב לבד' : ''}</p>
  </div>`;
}

export function Select({ options = [], value, onChange, placeholder, id, class: cls, ...rest }) {
  const f = useFieldProps(id);
  const idx = options.findIndex((o) => String(o.value) === String(value));
  return html`<select class=${cx('input select', cls)} value=${idx >= 0 ? String(idx) : ''}
    onChange=${(e) => { const o = options[Number(e.currentTarget.value)]; if (o && onChange) onChange(o.value, e); }} ...${rest} ...${f}>
    ${idx < 0 && html`<option value="" disabled>${placeholder || ''}</option>`}
    ${options.map((o, i) => html`<option value=${String(i)} disabled=${o.disabled}>${o.label}</option>`)}
  </select>`;
}

export function DateInput({ value, onChange, showDay, id, class: cls, ...rest }) {
  const f = useFieldProps(id);
  const input = html`<input class=${cx('input date', cls)} type="date" value=${value || ''}
    onInput=${(e) => onChange && onChange(e.currentTarget.value || null, e)} ...${rest} ...${f} />`;
  if (!showDay) return input;
  return html`<div class="date-row">${input}<span class="date-day">${value && isYmd(value) ? 'יום ' + DAY_NAMES[dow(value)] : ''}</span></div>`;
}

export function Toggle({ label, hint, checked, onChange, disabled, class: cls }) {
  const id = useId('t');
  return html`<label class=${cx('toggle', disabled && 'is-disabled', cls)} for=${id}>
    <span class="toggle-text">
      <span class="toggle-label">${label}</span>
      ${has(hint) && html`<span class="toggle-hint">${hint}</span>`}
    </span>
    <input id=${id} type="checkbox" role="switch" class="toggle-input" checked=${!!checked} disabled=${disabled}
      onChange=${(e) => onChange && onChange(e.currentTarget.checked, e)} />
    <span class="toggle-track" aria-hidden="true"><span class="toggle-knob" /></span>
  </label>`;
}

export function Card({ onClick, href, class: cls, children }) {
  if (href) return html`<a class=${cx('card is-link', cls)} href=${toHref(href)}>${children}</a>`;
  if (onClick) return html`<button type="button" class=${cx('card is-link', cls)} onClick=${onClick}>${children}</button>`;
  return html`<div class=${cx('card', cls)}>${children}</div>`;
}

export function List({ class: cls, children }) {
  return html`<div class=${cx('card list', cls)}>${children}</div>`;
}

export function Row({ title, sub, start, right, onClick, href, chevron, class: cls, children }) {
  const inner = [
    has(start) && html`<span class="row-start">${start}</span>`,
    html`<span class="row-main">
      ${has(title) && html`<span class="row-title">${title}</span>`}
      ${has(sub) && html`<span class="row-sub">${sub}</span>`}
      ${children}
    </span>`,
    has(right) && html`<span class="row-end">${right}</span>`,
    chevron && html`<span class="row-chev" aria-hidden="true"><${Icon} name="chevronEnd" size=${20} /></span>`,
  ];
  if (href) return html`<a class=${cx('row is-link', cls)} href=${toHref(href)}>${inner}</a>`;
  if (onClick) return html`<button type="button" class=${cx('row is-link', cls)} onClick=${onClick}>${inner}</button>`;
  return html`<div class=${cx('row', cls)}>${inner}</div>`;
}

export function Tile({ label, value, onClick, href, class: cls }) {
  const inner = [html`<span class="tile-value">${value}</span>`, html`<span class="tile-label">${label}</span>`];
  if (href) return html`<a class=${cx('tile is-link', cls)} href=${toHref(href)}>${inner}</a>`;
  if (onClick) return html`<button type="button" class=${cx('tile is-link', cls)} onClick=${onClick}>${inner}</button>`;
  return html`<div class=${cx('tile', cls)}>${inner}</div>`;
}

export function Tiles({ class: cls, children }) {
  return html`<div class=${cx('tiles', cls)}>${children}</div>`;
}

export function Notice({ kind = 'info', title, icon, class: cls, children }) {
  return html`<div class=${cx('notice', `is-${kind}`, cls)} role=${kind === 'danger' ? 'alert' : undefined}>
    ${icon && html`<span class="notice-icon" aria-hidden="true"><${Icon} name=${icon} size=${22} /></span>`}
    <div class="notice-body">
      ${has(title) && html`<p class="notice-title">${title}</p>`}
      ${has(children) && html`<div class="notice-text">${children}</div>`}
    </div>
  </div>`;
}

export function Empty({ text, class: cls, children }) {
  return html`<div class=${cx('empty', cls)}>${has(text) && html`<p>${text}</p>`}${children}</div>`;
}

export function Loader({ class: cls }) {
  return html`<div class=${cx('loader', cls)} role="status" aria-label="טוען"><span class="loader-dots"><span /><span /><span /></span></div>`;
}

let sheetCount = 0;

function Portal({ children }) {
  const host = useRef(null);
  if (!host.current) {
    host.current = document.createElement('div');
    host.current.className = 'portal';
  }
  useLayoutEffect(() => {
    const el = host.current;
    document.body.appendChild(el);
    return () => { render(null, el); el.remove(); };
  }, []);
  useLayoutEffect(() => { render(children, host.current); });
  return null;
}

export function Sheet({ open, onClose, title, footer, class: cls, children }) {
  const [shown, setShown] = useState(!!open);
  const [leaving, setLeaving] = useState(false);
  const panel = useRef(null);
  const titleId = useId('sh');
  const close = useRef(onClose);
  close.current = onClose;
  const doClose = () => { if (close.current) close.current(); };

  useEffect(() => {
    if (open) { setShown(true); setLeaving(false); return undefined; }
    if (!shown) return undefined;
    setLeaving(true);
    const t = setTimeout(() => { setShown(false); setLeaving(false); }, reduceMotion() ? 0 : 180);
    return () => clearTimeout(t);
  }, [open]);

  useBackClose(!!open, doClose);

  useLayoutEffect(() => {
    if (!open) return undefined;
    sheetCount += 1;
    document.documentElement.classList.add('has-sheet');
    return () => {
      sheetCount = Math.max(0, sheetCount - 1);
      if (!sheetCount) document.documentElement.classList.remove('has-sheet');
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); doClose(); } };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => { if (panel.current) panel.current.focus({ preventScroll: true }); }, 30);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [open]);

  if (!shown && !open) return null;
  return html`<${Portal}>
    <div class=${cx('sheet-layer', leaving && 'is-leaving')}>
      <div class="sheet-backdrop" onClick=${doClose} />
      <div class=${cx('sheet', cls)} role="dialog" aria-modal="true" aria-labelledby=${titleId} tabindex="-1" ref=${panel}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="sheet-head">
          <div class="sheet-title" id=${titleId}>${title}</div>
          <button type="button" class="icon-btn is-plain sheet-close" aria-label="סגירה" title="סגירה" onClick=${doClose}><${Icon} name="close" /></button>
        </div>
        <div class="sheet-body">${children}</div>
        ${has(footer) && html`<div class="sheet-foot">${footer}</div>`}
      </div>
    </div>
  </${Portal}>`;
}

const overlay = { asks: [], toast: null };
const overlaySubs = new Set();
const emit = () => overlaySubs.forEach((fn) => fn({ asks: overlay.asks, toast: overlay.toast }));
let askSeq = 0;
let toastSeq = 0;

export function askSheet({ title, text, lines, choices = [] }) {
  return new Promise((resolve) => {
    const id = ++askSeq;
    overlay.asks = [...overlay.asks, { id, title, text, lines, choices, resolve, open: true }];
    emit();
  });
}

export function confirmSheet({ title, text, lines, ok = 'אישור', cancel = 'חזרה', danger = false }) {
  return askSheet({
    title, text, lines,
    choices: [{ value: true, label: ok, kind: danger ? 'danger' : 'primary' }, { value: false, label: cancel, kind: 'soft' }],
  }).then((v) => v === true);
}

function answer(id, value) {
  const a = overlay.asks.find((x) => x.id === id);
  if (!a || !a.open) return;
  overlay.asks = overlay.asks.map((x) => (x.id === id ? { ...x, open: false } : x));
  emit();
  a.resolve(value);
  setTimeout(() => { overlay.asks = overlay.asks.filter((x) => x.id !== id); emit(); }, 400);
}

export function toast(text, { action, ms } = {}) {
  measureBars();
  overlay.toast = { id: ++toastSeq, text, action, ms: ms || (action ? 5000 : 2500) };
  emit();
}

let barsRaf = 0;
function measureBars() {
  if (barsRaf) { cancelAnimationFrame(barsRaf); barsRaf = 0; }
  if (typeof document === 'undefined') return;
  const vh = window.innerHeight;
  let top = vh;
  document.querySelectorAll('.tabbar, .page-foot, .fab').forEach((el) => {
    if (el.classList.contains('fab') && getComputedStyle(el).position !== 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.width > 0 && r.top < top) top = r.top;
  });
  const b = Math.max(0, Math.round(vh - top));
  const root = document.documentElement;
  if (b > 0) root.style.setProperty('--bar-b', b + 'px'); else root.style.removeProperty('--bar-b');
}
function syncBars() {
  if (typeof requestAnimationFrame !== 'function') return;
  if (!barsRaf) barsRaf = requestAnimationFrame(() => { barsRaf = 0; measureBars(); });
}

export function OverlayHost() {
  const [st, setSt] = useState({ asks: overlay.asks, toast: overlay.toast });
  const route = useRoute();
  useEffect(() => { overlaySubs.add(setSt); return () => overlaySubs.delete(setSt); }, []);
  useEffect(() => {
    window.addEventListener('resize', syncBars);
    return () => window.removeEventListener('resize', syncBars);
  }, []);
  useLayoutEffect(() => { syncBars(); }, [route.hash]);   // הסרגל מופיע ונעלם עם המסלול

  const t = st.toast;
  useEffect(() => {
    if (!t) return undefined;
    const timer = setTimeout(() => { if (overlay.toast && overlay.toast.id === t.id) { overlay.toast = null; emit(); } }, t.ms);
    return () => clearTimeout(timer);
  }, [t && t.id]);

  const dismiss = () => { overlay.toast = null; emit(); };

  return html`
    ${st.asks.map((a) => html`<${Sheet} key=${a.id} open=${a.open} title=${a.title} onClose=${() => answer(a.id, null)}>
      ${has(a.text) && html`<p class="sheet-text">${a.text}</p>`}
      ${a.lines && a.lines.length > 0 && html`<${List}>${a.lines.map((l) => html`<${Row} title=${l} />`)}</${List}>`}
      <div class="sheet-actions">
        ${a.choices.map((c) => html`<${Button} kind=${c.kind || 'primary'} onClick=${() => answer(a.id, c.value)}>${c.label}</${Button}>`)}
      </div>
    </${Sheet}>`)}
    <div class="toast-host" aria-live="polite">
      ${t && html`<div class=${cx('toast', t.action && 'has-action')} key=${t.id}>
        <span class="toast-text">${t.text}</span>
        ${t.action && html`<button type="button" class="toast-action" onClick=${() => { dismiss(); t.action.onClick(); }}>${t.action.label}</button>`}
      </div>`}
    </div>`;
}

export class Boundary extends Component {
  constructor() {
    super();
    this.state = { err: null };
  }
  componentDidCatch(err) {
    console.error('המסך נפל', err);
    this.setState({ err });
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null });
  }
  render({ children, fallback }) {
    return this.state.err ? fallback : children;
  }
}
