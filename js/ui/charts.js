
import { html, useState, useRef, useLayoutEffect } from '../../vendor/preact-htm.js';
import { niceMax } from '../lib/reports.js';

const cx = (...a) => a.filter(Boolean).join(' ');

export function compactNum(v) {
  const n = Number(v) || 0;
  if (n >= 1000) return `${Math.round(n / 100) / 10}K`;
  return String(Math.round(n));
}

const Y_W = 30;   // רוחב הציר (--bc-y ב-css/reports.css)
export function BarChart({ bars, height = 140, active = null, onActive, labelWidth = 23, narrowWidth = 18, ariaLabel, class: cls }) {
  const root = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const top = Math.max(0, ...bars.map((b) => (Number(b.value) || 0) + (Number(b.booked) || 0)));
  const max = niceMax(top);
  const ticks = [0, max / 2, max];
  const px = (v) => (v > 0 ? Math.max(2, Math.round((v / max) * height)) : 0);
  const cols = { gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` };
  const last = bars.length - 1;
  const slot = w ? (w - Y_W) / bars.length : 99;
  const narrow = slot < labelWidth && bars.some((b) => b.narrow);
  const every = Math.max(1, Math.ceil((narrow ? narrowWidth : labelWidth) / slot));
  const showLabel = (i, b) => i === last || (last - i) % every === 0 || (every === 1 && b.current);
  const text = (b) => (narrow && b.narrow ? b.narrow : b.short);
  const set = (k) => onActive && onActive(k);

  return html`<div class=${cx('bc', cls)} dir="ltr" ref=${root} style=${{ '--bc-h': height + 'px' }}>
    <div class="bc-body">
      <div class="bc-y" aria-hidden="true">
        ${ticks.map((t) => html`<span class="bc-y-label" key=${t} style=${{ bottom: px(t) + 'px' }}>${compactNum(t)}</span>`)}
      </div>
      <div class="bc-plot" role="group" aria-label=${ariaLabel}>
        ${ticks.map((t) => html`<span class="bc-grid" key=${'g' + t} style=${{ bottom: px(t) + 'px' }} />`)}
        <div class="bc-cols" style=${cols} onMouseLeave=${() => set(null)}>
          ${bars.map((b) => {
            const v = px(Number(b.value) || 0);
            const all = px((Number(b.value) || 0) + (Number(b.booked) || 0));
            const e = b.booked > 0 ? Math.max(4, all - v) : 0;
            const stack = html`<span class="bc-stack" aria-hidden="true">
              ${v > 0 && html`<span class=${cx('bc-seg is-val', e > 0 && 'is-under')} style=${{ height: v + 'px' }} />`}
              ${e > 0 && html`<span class="bc-seg is-booked" style=${{ height: (v > 0 ? e - 2 : e) + 'px', bottom: (v > 0 ? v + 2 : 0) + 'px' }} />`}
            </span>`;
            const c = cx('bc-col', b.current && 'is-current', active === b.key && 'is-active', active && active !== b.key && 'is-dim');
            const ev = { onMouseEnter: () => set(b.key), onFocus: () => set(b.key), onBlur: () => set(null) };
            return b.href
              ? html`<a key=${b.key} class=${c} href=${'#' + b.href} aria-label=${b.aria} ...${ev}>${stack}</a>`
              : html`<span key=${b.key} class=${c} role="img" aria-label=${b.aria} tabindex="0" ...${ev}>${stack}</span>`;
          })}
        </div>
      </div>
    </div>
    <div class="bc-x" aria-hidden="true" style=${cols}>
      ${bars.map((b, i) => html`<span key=${b.key} class=${cx('bc-x-label', b.current && 'is-current', active === b.key && 'is-active')}>${showLabel(i, b) ? text(b) : ''}</span>`)}
    </div>
    ${bars.some((b) => b.year) && html`<div class="bc-x bc-years" aria-hidden="true" style=${cols}>
      ${bars.map((b) => html`<span key=${b.key} class="bc-x-label">${b.year || ''}</span>`)}
    </div>`}
  </div>`;
}

export function yearMark(list, i) {
  const k = list[i].key;
  if (k.endsWith('-01')) return k.slice(0, 4);
  if (i === 0 && !list.some((x) => x.key.endsWith('-01'))) return k.slice(0, 4);
  return '';
}

export function Swatch({ booked }) {
  return html`<span class=${cx('bc-swatch', booked && 'is-booked')} aria-hidden="true" />`;
}
