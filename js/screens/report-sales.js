
import { html, useState } from '../../vendor/preact-htm.js';
import { Page, Card, Segmented, TextInput, Button, Notice, Empty, Loader, fmtMoney } from '../ui/bits.js';
import { useNow } from '../ui/hooks.js';
import { usePeriod, PeriodPicker, reportHref, downloadCsv, csvName, useReportData } from '../ui/period.js';
import { incomeRows, freeRows, salesRows, salesTotals, salesTable, GROUP_LABEL } from '../lib/reports.js';

const GROUP_OPTS = [{ value: 'all', label: 'הכול' }, { value: 'treatments', label: 'טיפולים' }, { value: 'products', label: 'מוצרים' }];

export default function SalesReport({ query }) {
  const { today } = useNow();
  const period = usePeriod('/reports/sales', query, today);
  const { from, to } = period;
  const group = ['treatments', 'products'].includes(query.g) ? query.g : 'all';
  const [q, setQ] = useState('');
  const { data } = useReportData();

  const head = html`<${PeriodPicker} period=${period} />
    <${Segmented} label="מה להציג" value=${group} onChange=${(v) => period.set({ g: v === 'all' ? null : v })} options=${GROUP_OPTS} />
    <${TextInput} value=${q} onChange=${setQ} icon="search" placeholder="חיפוש פריט" aria-label="חיפוש פריט" />`;
  if (!data) return html`<${Page} title="דוח" em="מכירות" back backTo="/reports">${head}<${Loader} /></${Page}>`;

  const rows = incomeRows(data.appts, data.servicesById, { from, to });
  const list = salesRows(rows, { group, q });
  const tot = salesTotals(list);
  const freeCount = freeRows(data.appts, { from, to }).length;
  const printHref = reportHref('/reports/print', { t: 'sales', p: period.preset, d: period.anchor, from: period.preset === 'range' ? from : null, to: period.preset === 'range' ? to : null, g: group === 'all' ? null : group, q: q.trim() || null });

  return html`<${Page} title="דוח" em="מכירות" back backTo="/reports">
    ${head}
    ${list.length === 0
      ? html`<${Empty} text=${q.trim() ? 'לא נמצאו פריטים' : 'אין מכירות בתקופה הזאת'} />`
      : html`<${Card} class="rp-table-card">
        <table class="rp-table">
          <thead><tr><th scope="col">פריט</th><th scope="col" class="is-num">כמות</th><th scope="col" class="is-num">סה"כ</th></tr></thead>
          <tbody>
            ${list.map((x) => html`<tr key=${x.key}>
              <th scope="row"><span class="rp-item">${x.name}</span>${group === 'all' && html`<span class="rp-item-sub">${GROUP_LABEL[x.group]}</span>`}</th>
              <td class="is-num">${x.qty}</td>
              <td class="is-num"><span class="money">${fmtMoney(x.total)}</span></td>
            </tr>`)}
          </tbody>
          <tfoot><tr><th scope="row">סה"כ</th><td class="is-num">${tot.qty}</td><td class="is-num"><span class="money">${fmtMoney(tot.total)}</span></td></tr></tfoot>
        </table>
      </${Card}>`}
    ${freeCount > 0 && html`<${Notice} kind="info">${freeCount === 1 ? 'לא כולל טיפול אחד שנסגר ללא תשלום.' : `לא כולל ${freeCount} טיפולים שנסגרו ללא תשלום.`}</${Notice}>`}

    <div class="rp-export">
      <${Button} icon="download" disabled=${!list.length} onClick=${() => downloadCsv(csvName('דוח-מכירות', from, to), salesTable(list, { from, to }))}>הורדה לאקסל</${Button}>
      <${Button} kind="soft" icon="print" href=${printHref}>תצוגה להדפסה</${Button}>
      <p class="small rp-note">שליחה למייל תגיע בשלב הבא.</p>
    </div>
  </${Page}>`;
}
