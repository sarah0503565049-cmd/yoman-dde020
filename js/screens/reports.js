
import { html } from '../../vendor/preact-htm.js';
import { Page, Tiles, Tile, Money, List, Row, Notice, Loader } from '../ui/bits.js';
import { useNow } from '../ui/hooks.js';
import { useReportData, reportHref } from '../ui/period.js';
import { incomeRows, periodRange } from '../lib/reports.js';

export default function Reports() {
  const { today } = useNow();
  const { data } = useReportData();

  const sumOf = (from, to) => (data ? incomeRows(data.appts, data.servicesById, { from, to }).reduce((s, r) => s + r.total, 0) : 0);
  const week = periodRange('week', today);
  const month = periodRange('month', today);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const tile = (label, from, to, params) => html`<${Tile} label=${label} value=${html`<${Money} value=${sumOf(from, to)} />`}
    href=${reportHref('/reports/income', params)} />`;

  return html`<${Page} title="דוחות" back backTo="/more">
    ${!data ? html`<${Loader} />` : html`<${Tiles}>
      ${tile('הכנסות היום', today, today, { p: 'day', d: today })}
      ${tile('הכנסות השבוע', week.from, week.to, { p: 'week', d: today })}
      ${tile('הכנסות החודש', month.from, month.to, { p: 'month', d: today })}
      ${tile('מתחילת השנה', yearStart, today, { p: 'range', from: yearStart, to: today })}
    </${Tiles}>`}
    <${List}>
      <${Row} title="הכנסות" sub=${'כמה נכנס ביום, בשבוע, בחודש או בטווח תאריכים. מתומצת או מפורט, עם מע"מ.'} href="/reports/income" chevron />
      <${Row} title="מכירות" sub="כמה טיפולים ומוצרים נמכרו, מכל פריט, בתקופה שבוחרים." href="/reports/sales" chevron />
    </${List}>
    <${Notice} kind="info">הדוחות מסכמים את התשלומים שנרשמו בקופה של האפליקציה. כל דוח אפשר להוריד לאקסל או להדפיס. שליחה למייל תגיע בשלב הבא.</${Notice}>
  </${Page}>`;
}
