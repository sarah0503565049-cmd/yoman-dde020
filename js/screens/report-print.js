
import { html } from '../../vendor/preact-htm.js';
import { Page, Button, Loader, fmtMoney } from '../ui/bits.js';
import { useNow } from '../ui/hooks.js';
import { usePeriod, useReportData, countPayments } from '../ui/period.js';
import { fmtDate, fmtTime } from '../lib/time.js';
import { VAT_RATE, GROUP_LABEL, incomeRows, freeRows, incomeSummary, sortIncomeRows, salesRows, salesTotals } from '../lib/reports.js';

const M = (v) => html`<span class="num">${fmtMoney(v).replace(/[\s ]*₪$/, '')}</span>`;

function Table({ head, rows, foot, wide, numFrom = 1 }) {
  const from = wide ? head.length - 1 : numFrom;
  const cell = (c, i) => (i === 0 ? html`<th scope="row">${c}</th>` : html`<td class=${i >= from ? 'is-num' : ''}>${c}</td>`);
  return html`<div class="doc-scroll"><table class=${'doc-table' + (wide ? ' is-wide' : '')}>
    <thead><tr>${head.map((h, i) => html`<th scope="col" class=${i && i >= from ? 'is-num' : ''}>${h}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${r.map(cell)}</tr>`)}</tbody>
    ${foot && html`<tfoot><tr>${foot.map(cell)}</tr></tfoot>`}
  </table></div>`;
}

export default function ReportPrint({ query }) {
  const { today } = useNow();
  const type = query.t === 'sales' ? 'sales' : 'income';
  const period = usePeriod('/reports/print', query, today);
  const { from, to } = period;
  const detail = query.v === 'detail';
  const { data } = useReportData();
  const footer = html`<${Button} icon="print" onClick=${() => window.print()}>הדפסה</${Button}>`;
  if (!data) return html`<${Page} title="תצוגה" em="להדפסה" back backTo="/reports"><${Loader} /></${Page}>`;

  const rows = incomeRows(data.appts, data.servicesById, { from, to });
  const free = freeRows(data.appts, { from, to });
  const title = type === 'sales' ? 'דוח מכירות' : detail ? 'דוח הכנסות מפורט' : 'דוח הכנסות מתומצת';
  let body;
  if (type === 'income') {
    const sum = incomeSummary(rows, { methods: data.settings.paymentMethods || [], free });
    body = html`
      <h3 class="doc-h">סיכום</h3>
      <${Table} head=${['', 'כמות', 'לפני מע"מ (₪)', 'מע"מ (₪)', 'סה"כ (₪)']} rows=${[['סה"כ הכנסות', sum.count, M(sum.net), M(sum.vat), M(sum.total)]]} />
      <h3 class="doc-h">לפי אמצעי תשלום</h3>
      <${Table} head=${['אמצעי תשלום', 'כמות', 'לפני מע"מ (₪)', 'מע"מ (₪)', 'סה"כ (₪)']}
        rows=${sum.byMethod.map((m) => [m.method, m.count, M(m.net), M(m.vat), M(m.total)])}
        foot=${['סה"כ', sum.count, M(sum.net), M(sum.vat), M(sum.total)]} />
      <h3 class="doc-h">לפי סוג</h3>
      <${Table} head=${['סוג', 'לפני מע"מ (₪)', 'מע"מ (₪)', 'סה"כ (₪)']}
        rows=${sum.byGroup.map((g) => [g.label, M(g.net), M(g.vat), M(g.total)])}
        foot=${['סה"כ', M(sum.net), M(sum.vat), M(sum.total)]} />
      ${sum.free.count > 0 && html`<p class="doc-note">${sum.free.count === 1 ? 'טיפול אחד' : `${sum.free.count} טיפולים`} ללא תשלום (שווי ${fmtMoney(sum.free.value)} לפי המחירון), לא נכללים בהכנסות.</p>`}
      ${detail && html`
        <h3 class="doc-h">כל התשלומים</h3>
        <${Table} wide head=${['תאריך', 'לקוח/ה', 'פריטים', 'אמצעי', 'סה"כ (₪)']}
          rows=${sortIncomeRows(rows, query.sort === 'desc' ? 'desc' : 'asc').map((r) => [html`${fmtDate(r.date).replace(/\/(\d\d)(\d\d)$/, '/$2')}<span class="doc-sub">${fmtTime(r.timeMin)}</span>`, data.nameOf(r.clientId), r.items.join(' + '), r.method, M(r.total)])}
          foot=${['סה"כ', countPayments(sum.count), '', '', M(sum.total)]} />`}
    `;
  } else {
    const group = ['treatments', 'products'].includes(query.g) ? query.g : 'all';
    const list = salesRows(rows, { group, q: query.q || '' });
    const tot = salesTotals(list);
    body = html`
      ${(group !== 'all' || query.q) && html`<p class="doc-note">${group !== 'all' ? `רק ${GROUP_LABEL[group]}` : ''}${group !== 'all' && query.q ? ' · ' : ''}${query.q ? `חיפוש: ${query.q}` : ''}</p>`}
      <${Table} numFrom=${2} head=${['פריט', 'סוג', 'כמות', 'סה"כ (₪)']} rows=${list.map((x) => [x.name, GROUP_LABEL[x.group], x.qty, M(x.total)])}
        foot=${['סה"כ', '', tot.qty, M(tot.total)]} />
      ${free.length > 0 && html`<p class="doc-note">${free.length === 1 ? 'לא כולל טיפול אחד שנסגר ללא תשלום.' : `לא כולל ${free.length} טיפולים שנסגרו ללא תשלום.`}</p>`}
    `;
  }

  return html`<${Page} title="תצוגה" em="להדפסה" back backTo="/reports" footer=${footer} class="print-page">
    <article class="doc">
      <header class="doc-head">
        <img class="doc-logo" src="img/logo-round.png" alt="Sarah B Cosmetics" width="300" height="330" />
        <div class="doc-head-text">
          <h2 class="doc-title">${title}</h2>
          <p class="doc-meta">${period.label}</p>
          <p class="doc-meta small">${fmtDate(from)} עד ${fmtDate(to)}</p>
          <p class="doc-meta small">הופק ב-${fmtDate(today)}</p>
        </div>
      </header>
      ${body}
      <p class="doc-foot small">${`הסכומים כוללים מע"מ ${VAT_RATE}%. הדוח מסכם את התשלומים שנרשמו בקופה של האפליקציה.`}</p>
    </article>
  </${Page}>`;
}
