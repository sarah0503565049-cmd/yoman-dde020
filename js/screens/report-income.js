
import { html, useState } from '../../vendor/preact-htm.js';
import { Page, Section, Card, List, Row, Button, Segmented, Money, Notice, Empty, Loader, fmtMoney } from '../ui/bits.js';
import { useNow } from '../ui/hooks.js';
import { BarChart, yearMark } from '../ui/charts.js';
import { usePeriod, PeriodPicker, reportHref, downloadCsv, csvName, useReportData, countPayments } from '../ui/period.js';
import { fmtDate, fmtDayMonth, fmtTime } from '../lib/time.js';
import {
  VAT_RATE, incomeRows, freeRows, incomeSummary, sortIncomeRows, bucketUnit, incomeByBucket,
  incomeDetailTable, incomeSummaryTable,
} from '../lib/reports.js';

const UNIT_TITLE = { day: 'לפי יום', week: 'לפי שבוע', month: 'לפי חודש' };
const VIEW_OPTS = [{ value: 'sum', label: 'מתומצת' }, { value: 'detail', label: 'מפורט' }];
const SORT_OPTS = [{ value: 'asc', label: 'מהישן לחדש' }, { value: 'desc', label: 'מהחדש לישן' }];

const nb = (s) => s.replace(/ /g, String.fromCharCode(160));
const vatLine = (x) => `${nb(`לפני מע"מ ${fmtMoney(x.net)}`)} · ${nb(`מע"מ ${fmtMoney(x.vat)}`)}`;

function TotalCard({ sum }) {
  return html`<${Card} class="rp-total">
    <div class="rp-total-head">
      <span class="rp-total-label">סה"כ הכנסות</span>
      <span class="rp-total-num">${fmtMoney(sum.total)}</span>
    </div>
    <div class="rp-split">
      <div class="rp-split-cell"><span class="rp-split-label">לפני מע"מ</span><span class="rp-split-val">${fmtMoney(sum.net)}</span></div>
      <div class="rp-split-cell"><span class="rp-split-label">מע"מ ${VAT_RATE}%</span><span class="rp-split-val">${fmtMoney(sum.vat)}</span></div>
      <div class="rp-split-cell"><span class="rp-split-label">תשלומים</span><span class="rp-split-val">${sum.count}</span></div>
    </div>
  </${Card}>`;
}

function PeriodChart({ rows, from, to, today, view }) {
  const [hover, setHover] = useState(null);
  const unit = bucketUnit(from, to);
  const list = incomeByBucket(rows, from, to, unit);
  const bars = list.map((b, i) => ({
    key: b.key, short: b.short, narrow: unit === 'month' ? String(Number(b.key.slice(5))) : null, value: b.total, current: today >= b.from && today <= b.to,
    year: unit === 'month' ? yearMark(list, i) : '',
    href: reportHref('/reports/income', { p: unit, d: b.from, v: view === 'detail' ? 'detail' : null }),
    aria: `${b.label}: ${fmtMoney(b.total)}`,
  }));
  const shown = list.find((b) => b.key === hover);
  const best = list.reduce((m, b) => (b.total > (m ? m.total : 0) ? b : m), null);
  return html`<${Card} class="rp-chart">
    <div class="mc-head">
      <span class="mc-title">${UNIT_TITLE[unit]}</span>
      <span class="rp-readout">${shown ? html`${shown.label}: <strong class="num">${fmtMoney(shown.total)}</strong>`
        : best ? html`הכי גבוה: ${best.label}, <strong class="num">${fmtMoney(best.total)}</strong>` : ''}</span>
    </div>
    <${BarChart} bars=${bars} height=${120} active=${hover} onActive=${setHover} labelWidth=${unit === 'month' ? 23 : 38} ariaLabel=${`הכנסות ${UNIT_TITLE[unit]}`} />
    <details class="rp-details">
      <summary>הסכומים של הגרף</summary>
      <${List}>${list.map((b) => html`<${Row} key=${b.key} title=${b.label} right=${html`<${Money} value=${b.total} />`} />`)}</${List}>
    </details>
  </${Card}>`;
}

export default function IncomeReport({ query }) {
  const { today } = useNow();
  const period = usePeriod('/reports/income', query, today);
  const { from, to } = period;
  const view = query.v === 'detail' ? 'detail' : 'sum';
  const sort = query.sort === 'desc' ? 'desc' : 'asc';
  const { data } = useReportData();

  const head = html`<${PeriodPicker} period=${period} />
    <${Segmented} label="סוג הדוח" value=${view} onChange=${(v) => period.set({ v: v === 'detail' ? 'detail' : null })} options=${VIEW_OPTS} />`;
  if (!data) return html`<${Page} title="דוח" em="הכנסות" back backTo="/reports">${head}<${Loader} /></${Page}>`;

  const { settings, servicesById, appts, nameOf } = data;
  const rows = incomeRows(appts, servicesById, { from, to });
  const free = freeRows(appts, { from, to });
  const sum = incomeSummary(rows, { methods: settings.paymentMethods || [], free });
  const printHref = reportHref('/reports/print', { t: 'income', p: period.preset, d: period.anchor, from: period.preset === 'range' ? from : null, to: period.preset === 'range' ? to : null, v: view === 'detail' ? 'detail' : null });

  const csv = () => {
    if (view === 'detail') downloadCsv(csvName('דוח-הכנסות-מפורט', from, to), incomeDetailTable(sortIncomeRows(rows, sort), nameOf, { from, to }));
    else downloadCsv(csvName('דוח-הכנסות-מתומצת', from, to), incomeSummaryTable(sum, { from, to }));
  };

  const emptyText = period.preset === 'day' ? 'אין תשלומים ביום הזה' : 'אין תשלומים בתקופה הזאת';
  const freeNotice = sum.free.count > 0 && html`<${Notice} kind="info">${sum.free.count === 1 ? 'טיפול אחד' : `${sum.free.count} טיפולים`} ללא תשלום בתקופה הזאת (שווי ${fmtMoney(sum.free.value)} לפי המחירון). הם לא נכללים בהכנסות.</${Notice}>`;

  return html`<${Page} title="דוח" em="הכנסות" back backTo="/reports">
    ${head}
    <${TotalCard} sum=${sum} />
    ${from !== to && html`<${PeriodChart} rows=${rows} from=${from} to=${to} today=${today} view=${view} />`}

    ${view === 'sum' ? html`
      <${Section} title="לפי אמצעי תשלום">
        ${sum.byMethod.length === 0 ? html`<${Empty} text=${emptyText} />` : html`<${List}>
          ${sum.byMethod.map((m) => html`<${Row} key=${m.method} title=${m.method} sub=${countPayments(m.count)} right=${html`<${Money} value=${m.total} />`}>
            <span class="row-sub">${vatLine(m)}</span>
          </${Row}>`)}
          <${Row} class="rp-sum-row" title=${'סה"כ'} sub=${countPayments(sum.count)} right=${html`<${Money} value=${sum.total} />`}>
            <span class="row-sub">${vatLine(sum)}</span>
          </${Row}>
        </${List}>`}
      </${Section}>
      ${sum.count > 0 && html`<${Section} title="לפי סוג">
        <${List}>
          ${sum.byGroup.map((g) => html`<${Row} key=${g.key} title=${g.label} sub=${vatLine(g)} right=${html`<${Money} value=${g.total} />`} />`)}
          <${Row} class="rp-sum-row" title=${'סה"כ'} sub=${vatLine(sum)} right=${html`<${Money} value=${sum.total} />`} />
        </${List}>
      </${Section}>`}
      ${freeNotice}
    ` : html`
      <${Section} title="כל התשלומים">
        <${Segmented} label="מיון" value=${sort} onChange=${(v) => period.set({ sort: v === 'desc' ? 'desc' : null })} options=${SORT_OPTS} />
        ${rows.length === 0 ? html`<${Empty} text=${emptyText} />` : html`<${List} class="rp-rows">
          ${sortIncomeRows(rows, sort).map((r) => html`<${Row} key=${r.id} href=${'/appt/' + r.id} title=${nameOf(r.clientId)}
            sub=${`${fmtDate(r.date)} · ${fmtTime(r.timeMin)} · ${r.items.join(' + ')}`}
            right=${html`<${Money} value=${r.total} />`}>
            <span class="row-sub">${r.method}${r.tip > 0 ? ` · כולל טיפ ${fmtMoney(r.tip)}` : ''}${r.apptDate !== r.date ? ` · הטיפול ב-${fmtDayMonth(r.apptDate)}` : ''}</span>
          </${Row}>`)}
          <${Row} class="rp-sum-row" title=${'סה"כ'} sub=${`${countPayments(sum.count)} · ${vatLine(sum)}`} right=${html`<${Money} value=${sum.total} />`} />
        </${List}>`}
      </${Section}>
      ${free.length > 0 && html`<${Section} title="ללא תשלום">
        <${List}>${free.map((f) => html`<${Row} key=${f.id} href=${'/appt/' + f.id} title=${nameOf(f.clientId)}
          sub=${`${fmtDate(f.date)} · ${fmtTime(f.startMin)} · ${f.items.join(' + ')}${f.reason ? ` · ${f.reason}` : ''}`}
          right=${html`<span class="rp-free-val">שווי ${fmtMoney(f.value)}</span>`} />`)}</${List}>
        ${freeNotice}
      </${Section}>`}
    `}

    <div class="rp-export">
      <${Button} icon="download" onClick=${csv}>הורדה לאקסל</${Button}>
      <${Button} kind="soft" icon="print" href=${printHref}>תצוגה להדפסה</${Button}>
      <p class="small rp-note">שליחה למייל תגיע בשלב הבא.</p>
    </div>
  </${Page}>`;
}
