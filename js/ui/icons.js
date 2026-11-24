
import { html } from '../../vendor/preact-htm.js';

const P = (d) => html`<path d=${d} />`;

export const ICONS = {
  home: [P('M3.5 10.5 12 3.5l8.5 7'), P('M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9')],
  calendar: [
    html`<rect x="3.5" y="5" width="17" height="15.5" rx="3" />`,
    P('M3.5 10h17'), P('M8 3v4'), P('M16 3v4'),
  ],
  users: [
    html`<circle cx="9" cy="8.5" r="3.5" />`,
    P('M2.75 20c.6-3.5 3.2-5.75 6.25-5.75S14.65 16.5 15.25 20'),
    P('M15.5 5.2a3.4 3.4 0 0 1 0 6.6'), P('M17.75 14.6c1.9.8 3.1 2.8 3.5 5.4'),
  ],
  more: [
    html`<circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" />`,
    html`<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />`,
    html`<circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" />`,
  ],
  plus: [P('M12 5v14'), P('M5 12h14')],
  chevronStart: [P('M9.5 5.5 16 12l-6.5 6.5')],
  chevronEnd: [P('M14.5 5.5 8 12l6.5 6.5')],
  back: [P('M4.5 12h15'), P('M13.5 6l6 6-6 6')],
  phone: [P('M6.2 3.8h2.9l1.5 4-2 1.4a11.5 11.5 0 0 0 6.2 6.2l1.4-2 4 1.5v2.9a1.8 1.8 0 0 1-1.9 1.8A16 16 0 0 1 4.4 5.7a1.8 1.8 0 0 1 1.8-1.9z')],
  whatsapp: [
    P('M4.2 19.8l1.1-3.6a8.4 8.4 0 1 1 3.1 3z'),
    P('M9.2 8.4c-.4 2.9 3 6.2 5.9 5.9l.8-1.4-1.9-1-.9.8a4.6 4.6 0 0 1-2.1-2.1l.8-.9-1-1.9z'),
  ],
  star: [P('M12 3.6l2.55 5.2 5.7.85-4.12 4 .97 5.68L12 16.65l-5.1 2.68.97-5.68-4.12-4 5.7-.85z')],
  thumb: [
    P('M7 10.5V20H4.5a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1z'),
    P('M7 10.5l3.6-6.3a1.9 1.9 0 0 1 3.5 1.3l-.7 3.5h4.9a2 2 0 0 1 2 2.3l-1.1 6.9a2 2 0 0 1-2 1.8H7'),
  ],
  clock: [html`<circle cx="12" cy="12" r="8.5" />`, P('M12 7.5V12l3 2')],
  edit: [P('M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10z'), P('M13 7l4 4')],
  trash: [P('M4.5 7h15'), P('M9.5 7V4.5h5V7'), P('M6.5 7l.9 12.5a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7'), P('M10 11v5.5'), P('M14 11v5.5')],
  search: [html`<circle cx="10.5" cy="10.5" r="6.5" />`, P('M15.4 15.4 20 20')],
  close: [P('M6.5 6.5l11 11'), P('M17.5 6.5l-11 11')],
  repeat: [P('M4.5 11V9.5a3 3 0 0 1 3-3h12'), P('M16.5 3.5l3 3-3 3'), P('M19.5 13v1.5a3 3 0 0 1-3 3h-12'), P('M7.5 20.5l-3-3 3-3')],
  check: [P('M5 12.5l4.5 4.5L19 7.5')],
  coin: [
    html`<circle cx="12" cy="12" r="8.75" />`,
    html`<text x="12" y="16.1" text-anchor="middle" font-size="11.5" font-weight="700" font-family="Assistant, sans-serif" fill="currentColor" stroke="none">₪</text>`,
  ],
  mic: [P('M9 6a3 3 0 0 1 6 0v5.5a3 3 0 0 1-6 0z'), P('M5.5 11a6.5 6.5 0 0 0 13 0'), P('M12 17.5V21'), P('M8.75 21h6.5')],
  chart: [P('M4 20.5h16'), P('M6.5 20.5v-6'), P('M11 20.5V9'), P('M15.5 20.5v-8.5'), P('M20 20.5V5.5')],
  download: [P('M12 4v11'), P('M7.5 10.5 12 15l4.5-4.5'), P('M4.5 19.5h15')],
  print: [P('M7 8.5V4h10v4.5'), html`<rect x="4" y="8.5" width="16" height="8" rx="2" />`, P('M7.5 14h9v6h-9z')],
};

export function Icon({ name, size = 24, fill = false, class: cls = '', title }) {
  const shapes = ICONS[name];
  if (!shapes) return null;
  return html`<svg class=${'icon ' + cls} width=${size} height=${size} viewBox="0 0 24 24"
    fill=${fill ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${title ? html`<title>${title}</title>` : null}${shapes}</svg>`;
}
