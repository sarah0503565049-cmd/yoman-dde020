
import { html } from '../../vendor/preact-htm.js';
import { MONTH_NAMES } from '../lib/time.js';
import { birthParts } from '../lib/model.js';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function birthToParts(v) {
  const b = birthParts(v);
  return b ? { d: String(b.d), m: String(b.m), y: b.y != null ? String(b.y) : '' } : { d: '', m: '', y: '' };
}

export function BirthInput({ id, value, onChange, thisYear, years = 100, invalid, describedBy, labelledBy }) {
  const v = value || { d: '', m: '', y: '' };
  const set = (k) => (e) => onChange && onChange({ ...v, [k]: e.currentTarget.value });
  const top = Number(thisYear) || new Date().getFullYear();
  const yearList = Array.from({ length: years + 1 }, (_, i) => top - i);
  const common = (k) => ({
    class: 'input select' + (v[k] === '' ? ' is-empty' : ''),
    'aria-invalid': invalid ? 'true' : undefined,
    'aria-describedby': describedBy,
    onChange: set(k),
  });
  return html`<div class="birth-row" role="group" aria-labelledby=${labelledBy}>
    <select id=${id} aria-label="יום" value=${v.d} ...${common('d')}>
      <option value="">יום</option>
      ${DAYS.map((d) => html`<option key=${d} value=${String(d)}>${d}</option>`)}
    </select>
    <select id=${id + '-m'} aria-label="חודש" value=${v.m} ...${common('m')}>
      <option value="">חודש</option>
      ${MONTH_NAMES.map((name, i) => html`<option key=${i} value=${String(i + 1)}>${name}</option>`)}
    </select>
    <select id=${id + '-y'} aria-label="שנה" value=${v.y} ...${common('y')}>
      <option value="">שנה</option>
      ${yearList.map((y) => html`<option key=${y} value=${String(y)}>${y}</option>`)}
    </select>
  </div>`;
}
