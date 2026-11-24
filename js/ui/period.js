
import { html } from '../../vendor/preact-htm.js';
import { Segmented, Field, DateInput, IconButton, toast } from './bits.js';
import { replace } from '../router.js';
import { useData } from './hooks.js';
import { isYmd } from '../lib/time.js';
import { PRESETS, periodRange, shiftAnchor, normRange, periodLabel, toCsv } from '../lib/reports.js';

const PRESET_OPTS = [
  { value: 'day', label: 'יום' }, { value: 'week', label: 'שבוע' },
  { value: 'month', label: 'חודש' }, { value: 'range', label: 'טווח' },
];

export function reportHref(path, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export function usePeriod(path, query, today, defaults = {}) {
  const preset = PRESETS.includes(query.p) ? query.p : defaults.p || 'month';
  const anchor = isYmd(query.d) ? query.d : today;
  let from;
  let to;
  if (preset === 'range') {
    const base = periodRange('month', anchor);
    ({ from, to } = normRange(isYmd(query.from) ? query.from : base.from, isYmd(query.to) ? query.to : base.to));
  } else {
    ({ from, to } = periodRange(preset, anchor));
  }
  const set = (patch) => replace(reportHref(path, { ...query, ...patch }));
  return { preset, anchor, from, to, label: periodLabel(preset, from, to), set, query };
}

export function PeriodPicker({ period }) {
  const { preset, anchor, from, to, label, set } = period;
  const choose = (p) => {
    if (p === 'range') set({ p, from, to, d: null });
    else set({ p, d: preset === 'range' ? to : anchor, from: null, to: null });
  };
  return html`<div class="rp-period">
    <${Segmented} label="תקופה" value=${preset} onChange=${choose} options=${PRESET_OPTS} />
    ${preset === 'range'
      ? html`<div class="form-pair">
          <${Field} label="מתאריך"><${DateInput} value=${from} onChange=${(v) => v && set({ from: v })} /></${Field}>
          <${Field} label="עד תאריך"><${DateInput} value=${to} onChange=${(v) => v && set({ to: v })} /></${Field}>
        </div>`
      : html`<div class="rp-nav">
          <${IconButton} icon="chevronStart" label="התקופה הקודמת" kind="plain" onClick=${() => set({ d: shiftAnchor(preset, anchor, -1) })} />
          <span class="rp-nav-label">${label}</span>
          <${IconButton} icon="chevronEnd" label="התקופה הבאה" kind="plain" onClick=${() => set({ d: shiftAnchor(preset, anchor, 1) })} />
        </div>`}
  </div>`;
}

export function csvName(title, from, to) {
  return `${title}-${from}${from === to ? '' : `-עד-${to}`}.csv`;
}

export function downloadCsv(filename, table) {
  const blob = new Blob([toCsv(table)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('הקובץ ירד להורדות');
}

export function useReportData() {
  return useData(async (s) => {
    const [settings, services, clients, appts] = await Promise.all([
      s.getSettings(), s.listServices({ includeInactive: true }), s.listClients(), s.listAppointments(),
    ]);
    const servicesById = new Map(services.map((x) => [x.id, x]));
    const names = new Map(clients.map((c) => [c.id, c.name]));
    return { settings, servicesById, appts, nameOf: (id) => names.get(id) || 'לקוח/ה' };
  }, []);
}

export const countPayments = (n) => (n === 1 ? 'תשלום אחד' : `${n} תשלומים`);
