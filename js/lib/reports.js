
import { addDays, diffDays, parts, weekStart, todayYmd, nowMin, MONTH_NAMES, fmtDate, fmtDateLong, fmtWeekRange, fmtDayMonth, fmtTime } from './time.js';
import { apptTotal, freeValue, FREE_REASONS } from './model.js';

export const VAT_RATE = 18;

const pad = (n) => String(n).padStart(2, '0');
const get = (m, k) => (m instanceof Map ? m.get(k) : m ? m[k] : undefined);

export const MONTH_SHORT = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

export function monthStart(ymd) {
  const { y, m } = parts(ymd);
  return `${y}-${pad(m)}-01`;
}

export function addMonths(ymd, n) {
  const { y, m } = parts(ymd);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}-01`;
}

export function monthEnd(ymd) {
  return addDays(addMonths(ymd, 1), -1);
}

export function monthLabel(ymd) {
  const { y, m } = parts(ymd);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export const PRESETS = ['day', 'week', 'month', 'range'];

export function periodRange(preset, anchor) {
  if (preset === 'week') {
    const s = weekStart(anchor);
    return { from: s, to: addDays(s, 6) };
  }
  if (preset === 'month') return { from: monthStart(anchor), to: monthEnd(anchor) };
  return { from: anchor, to: anchor };
}

export function shiftAnchor(preset, anchor, dir) {
  if (preset === 'week') return addDays(anchor, 7 * dir);
  if (preset === 'month') return addMonths(anchor, dir);
  return addDays(anchor, dir);
}

export function normRange(from, to) {
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}

export function periodLabel(preset, from, to) {
  if (preset === 'day') return fmtDateLong(from);
  if (preset === 'week') return fmtWeekRange(from);
  if (preset === 'month') return monthLabel(from);
  return from === to ? fmtDate(from) : `${fmtDate(from)} עד ${fmtDate(to)}`;
}

export const toAgorot = (v) => Math.round((Number(v) || 0) * 100);

export function vatOf(totalAg, rate = VAT_RATE) {
  return Math.round((totalAg * rate) / (100 + rate));
}

export function vatSplit(total, rate = VAT_RATE) {
  const t = toAgorot(total);
  const v = vatOf(t, rate);
  return { total: t / 100, net: (t - v) / 100, vat: v / 100 };
}

export function rowTime(a) {
  const at = a && a.payment && a.payment.paidAt;
  const t = at ? Date.parse(at) : NaN;
  if (Number.isNaN(t) || todayYmd(new Date(t)) === a.date) return a.startMin;
  return nowMin(new Date(t));
}

export function payDate(a) {
  const at = a && a.payment && a.payment.paidAt;
  if (at) {
    const t = Date.parse(at);
    if (!Number.isNaN(t)) return todayYmd(new Date(t));
  }
  return a.date;
}

export const GROUPS = [
  { key: 'treatments', label: 'טיפולים' },
  { key: 'products', label: 'מוצרים' },
  { key: 'courses', label: 'קורסים' },
  { key: 'tips', label: 'טיפים' },
];
export const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.key, g.label]));

export function itemGroup(item, servicesById) {
  const s = get(servicesById, item && item.serviceId);
  const kind = (s && s.kind) || (item && item.kind) || 'treatment';
  if (kind === 'product') return 'products';
  if (kind === 'course') return 'courses';
  return 'treatments';
}

export function paymentLines(a, servicesById, rate = VAT_RATE) {
  const p = a.payment || {};
  const amountAg = toAgorot(p.amount != null ? p.amount : apptTotal(a));
  const lines = (a.items || []).map((it) => ({
    serviceId: it.serviceId || null,
    name: it.name || '',
    group: itemGroup(it, servicesById),
    qty: Math.max(1, Math.round(Number(it.qty) || 1)),
    totalAg: toAgorot(it.price),
  }));
  const sum = lines.reduce((s, l) => s + l.totalAg, 0);
  if (sum !== amountAg) {
    if (lines.length) lines[0].totalAg += amountAg - sum;
    else lines.push({ serviceId: null, name: 'תשלום', group: 'treatments', qty: 1, totalAg: amountAg });
  }
  const tipAg = toAgorot(p.tip);
  if (tipAg > 0) lines.push({ serviceId: null, name: 'טיפ', group: 'tips', qty: 1, totalAg: tipAg, tip: true });
  for (const l of lines) {
    l.vatAg = vatOf(l.totalAg, rate);
    l.netAg = l.totalAg - l.vatAg;
  }
  return lines;
}

export function incomeRows(appts, servicesById, { from, to, rate = VAT_RATE } = {}) {
  const out = [];
  for (const a of appts || []) {
    if (a.status !== 'paid') continue;
    const date = payDate(a);
    if ((from && date < from) || (to && date > to)) continue;
    const lines = paymentLines(a, servicesById, rate);
    let totalAg = 0;
    let vatAg = 0;
    let tipAg = 0;
    for (const l of lines) {
      totalAg += l.totalAg;
      vatAg += l.vatAg;
      if (l.tip) tipAg += l.totalAg;
    }
    out.push({
      id: a.id,
      date,
      apptDate: a.date,
      startMin: a.startMin,
      timeMin: rowTime(a),
      clientId: a.clientId,
      method: (a.payment && a.payment.method) || 'לא צוין',
      items: lines.filter((l) => !l.tip).map((l) => l.name),
      lines,
      total: totalAg / 100,
      net: (totalAg - vatAg) / 100,
      vat: vatAg / 100,
      tip: tipAg / 100,
    });
  }
  return sortIncomeRows(out, 'asc');
}

export function sortIncomeRows(rows, dir = 'asc') {
  const s = [...rows].sort((x, y) => (x.date === y.date
    ? (x.startMin - y.startMin) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
    : x.date < y.date ? -1 : 1));
  return dir === 'desc' ? s.reverse() : s;
}

export function freeRows(appts, { from, to } = {}) {
  return (appts || [])
    .filter((a) => a.status === 'free' && (!from || a.date >= from) && (!to || a.date <= to))
    .map((a) => ({
      id: a.id,
      date: a.date,
      startMin: a.startMin,
      clientId: a.clientId,
      items: (a.items || []).map((it) => it.name),
      reason: (a.freeReason && FREE_REASONS[a.freeReason.kind]) || '',
      value: freeValue(a),
    }))
    .sort((x, y) => (x.date === y.date ? x.startMin - y.startMin : x.date < y.date ? -1 : 1));
}

export function incomeSummary(rows, { methods = [], free = [] } = {}) {
  const z = () => ({ totalAg: 0, vatAg: 0 });
  const tot = z();
  const byMethod = new Map();
  const byGroup = new Map(GROUPS.map((g) => [g.key, z()]));
  for (const r of rows) {
    const m = byMethod.get(r.method) || { method: r.method, count: 0, ...z() };
    m.count += 1;
    for (const l of r.lines) {
      tot.totalAg += l.totalAg; tot.vatAg += l.vatAg;
      m.totalAg += l.totalAg; m.vatAg += l.vatAg;
      const g = byGroup.get(l.group) || z();
      g.totalAg += l.totalAg; g.vatAg += l.vatAg;
      byGroup.set(l.group, g);
    }
    byMethod.set(r.method, m);
  }
  const money = (x) => ({ total: x.totalAg / 100, net: (x.totalAg - x.vatAg) / 100, vat: x.vatAg / 100 });
  const rank = (k) => { const i = methods.indexOf(k); return i < 0 ? methods.length : i; };
  return {
    count: rows.length,
    ...money(tot),
    tip: byGroup.get('tips').totalAg / 100,
    byMethod: [...byMethod.values()]
      .sort((x, y) => rank(x.method) - rank(y.method) || x.method.localeCompare(y.method, 'he'))
      .map((m) => ({ method: m.method, count: m.count, ...money(m) })),
    byGroup: GROUPS
      .filter((g) => g.key === 'treatments' || g.key === 'products' || byGroup.get(g.key).totalAg !== 0)
      .map((g) => ({ key: g.key, label: g.label, ...money(byGroup.get(g.key)) })),
    free: { count: free.length, value: free.reduce((s, f) => s + (Number(f.value) || 0), 0) },
  };
}

export function bucketUnit(from, to) {
  const n = diffDays(from, to) + 1;
  if (n <= 31) return 'day';
  if (n <= 112) return 'week';
  return 'month';
}

export function buckets(from, to, unit) {
  const out = [];
  if (!from || !to || from > to) return out;
  if (unit === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ key: d, from: d, to: d, short: fmtDayMonth(d), label: fmtDateLong(d) });
  } else if (unit === 'week') {
    for (let s = weekStart(from); s <= to; s = addDays(s, 7)) {
      const a = s < from ? from : s;
      const e = addDays(s, 6) > to ? to : addDays(s, 6);
      out.push({ key: s, from: a, to: e, short: fmtDayMonth(a), label: `${fmtDate(a)} עד ${fmtDate(e)}` });
    }
  } else {
    for (let s = monthStart(from); s <= to; s = addMonths(s, 1)) {
      const a = s < from ? from : s;
      const e = monthEnd(s) > to ? to : monthEnd(s);
      out.push({ key: s.slice(0, 7), from: a, to: e, short: MONTH_SHORT[parts(s).m - 1], label: monthLabel(s) });
    }
  }
  return out;
}

export function incomeByBucket(rows, from, to, unit) {
  const list = buckets(from, to, unit).map((b) => ({ ...b, totalAg: 0 }));
  for (const r of rows) {
    const b = list.find((x) => r.date >= x.from && r.date <= x.to);
    if (b) b.totalAg += toAgorot(r.total);
  }
  return list.map(({ totalAg, ...b }) => ({ ...b, total: totalAg / 100 }));
}

export const OPEN_STATUSES = ['pending', 'booked', 'confirmed', 'arrived'];

export function monthlyIncome(appts, today, { months = 12, ahead = 2, servicesById = null } = {}) {
  const list = [];
  const first = addMonths(today, -(months - 1));
  for (let i = 0; i < months + ahead; i++) {
    const s = addMonths(first, i);
    list.push({
      key: s.slice(0, 7), from: s, to: monthEnd(s), short: MONTH_SHORT[parts(s).m - 1], label: monthLabel(s),
      paidAg: 0, bookedAg: 0, current: i === months - 1, future: i >= months,
    });
  }
  const byKey = new Map(list.map((m) => [m.key, m]));
  for (const a of appts || []) {
    if (a.status === 'paid') {
      const m = byKey.get(payDate(a).slice(0, 7));
      if (m) m.paidAg += paymentLines(a, servicesById).reduce((s, l) => s + l.totalAg, 0);
    } else if (OPEN_STATUSES.includes(a.status) && a.date >= today) {
      const m = byKey.get(a.date.slice(0, 7));
      if (m) m.bookedAg += toAgorot(apptTotal(a));
    }
  }
  while (list.length > months && list[list.length - 1].bookedAg === 0) list.pop();
  return list.map(({ paidAg, bookedAg, ...m }) => ({ ...m, paid: paidAg / 100, booked: bookedAg / 100 }));
}

const catOf = (item, servicesById) => {
  const s = get(servicesById, item && item.serviceId);
  return (s && s.category) || (item && item.category) || null;
};

const keyOf = (unit, ymd) => (unit === 'month' ? ymd.slice(0, 7) : unit === 'week' ? weekStart(ymd) : ymd);

function importedValue(v, category) {
  if (v == null) return 0;
  if (typeof v === 'number') return category ? null : v;
  if (!category) return Number(v.total) || 0;
  return v.byCategory && v.byCategory[category] != null ? Number(v.byCategory[category]) || 0 : null;
}

export function incomeSeries(appts, today, opt = {}) {
  const { unit = 'month', servicesById = null, category = null, imported = null, ahead = 2, weeks = 12, aheadWeeks = 4 } = opt;
  const make = (u) => {
    const list = [];
    if (u === 'month') {
      const first = `${today.slice(0, 4)}-01-01`;
      const cur = monthStart(today);
      for (let s = first; s <= addMonths(cur, ahead); s = addMonths(s, 1)) {
        list.push({ key: s.slice(0, 7), from: s, to: monthEnd(s), short: MONTH_SHORT[parts(s).m - 1], narrow: String(parts(s).m), label: monthLabel(s), current: s === cur, future: s > cur });
      }
    } else if (u === 'week') {
      const cur = weekStart(today);
      for (let s = addDays(cur, -7 * (weeks - 1)); s <= addDays(cur, 7 * aheadWeeks); s = addDays(s, 7)) {
        list.push({ key: s, from: s, to: addDays(s, 6), short: fmtDayMonth(s), narrow: '', label: `${fmtDayMonth(s)} עד ${fmtDayMonth(addDays(s, 6))}`, current: s === cur, future: s > cur });
      }
    } else {
      for (let d = monthStart(today); d <= monthEnd(today); d = addDays(d, 1)) {
        list.push({ key: d, from: d, to: d, short: String(parts(d).d), narrow: String(parts(d).d), label: fmtDateLong(d), current: d === today, future: d > today });
      }
    }
    return list.map((b) => ({ ...b, paidAg: 0, bookedAg: 0, imported: false }));
  };

  const fill = (u, list) => {
    const byKey = new Map(list.map((b) => [b.key, b]));
    const upTo = imported && imported.upTo;
    const hasMonth = (k) => !!(imported && imported.months && imported.months[k] != null);
    const isImported = (k) => u === 'month' && upTo && k <= upTo && hasMonth(k);
    let gap = false;
    for (const a of appts || []) {
      if (a.status === 'paid') {
        const pd = payDate(a);
        const b = byKey.get(keyOf(u, pd));
        if (!b || isImported(pd.slice(0, 7))) continue;
        for (const l of paymentLines(a, servicesById)) {
          if (category && (l.tip || catOf(l, servicesById) !== category)) continue;
          b.paidAg += l.totalAg;
        }
      } else if (OPEN_STATUSES.includes(a.status) && a.date >= today) {
        const b = byKey.get(keyOf(u, a.date));
        if (!b) continue;
        for (const it of a.items || []) {
          if (category && catOf(it, servicesById) !== category) continue;
          b.bookedAg += toAgorot(it.price);
        }
      }
    }
    for (const b of list) {
      if (!isImported(b.key)) continue;
      const v = importedValue(imported.months && imported.months[b.key], category);
      if (v == null) { gap = true; continue; }
      b.paidAg = toAgorot(v);
      b.imported = true;
    }
    return gap;
  };

  const months = make('month');
  const gap = fill('month', months);
  let bars = months;
  if (unit !== 'month') { bars = make(unit); fill(unit, bars); }
  if (unit !== 'day') while (bars.length && bars[bars.length - 1].future && bars[bars.length - 1].bookedAg === 0) bars.pop();
  const out = (b) => { const { paidAg, bookedAg, ...rest } = b; return { ...rest, paid: paidAg / 100, booked: bookedAg / 100 }; };
  const cur = months.find((m) => m.current);
  const yearAg = months.filter((m) => !m.future).reduce((s, m) => s + m.paidAg, 0);
  return {
    bars: bars.map(out),
    month: { paid: cur.paidAg / 100, booked: cur.bookedAg / 100 },
    year: { paid: yearAg / 100 },
    importedGap: gap,
  };
}

export const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
export function niceMax(max) {
  if (!(max > 0)) return 1000;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const k of NICE_STEPS) if (Math.round(k * p * 1000) / 1000 >= max) return Math.round(k * p * 1000) / 1000;
  return 10 * p;
}

export function salesRows(rows, { group = 'all', q = '' } = {}) {
  const map = new Map();
  for (const r of rows) {
    for (const l of r.lines) {
      if (l.tip) continue;
      const key = l.serviceId || `name:${l.name}`;
      const x = map.get(key) || { key, name: l.name, group: l.group, qty: 0, totalAg: 0 };
      x.qty += l.qty;
      x.totalAg += l.totalAg;
      x.name = l.name;
      x.group = l.group;
      map.set(key, x);
    }
  }
  const needle = String(q || '').trim().toLowerCase();
  return [...map.values()]
    .filter((x) => (group === 'all' || x.group === group) && (!needle || x.name.toLowerCase().includes(needle)))
    .sort((x, y) => y.qty - x.qty || y.totalAg - x.totalAg || x.name.localeCompare(y.name, 'he'))
    .map(({ totalAg, ...x }) => ({ ...x, total: totalAg / 100 }));
}

export function salesTotals(list) {
  let qty = 0;
  let ag = 0;
  for (const x of list) { qty += x.qty; ag += toAgorot(x.total); }
  return { qty, total: ag / 100 };
}

export function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(table) {
  return '﻿' + table.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const HEAD_DETAIL = ['תאריך', 'שעה', 'לקוח/ה', 'פריטים', 'אמצעי תשלום', 'לפני מע"מ', 'מע"מ', 'סה"כ', 'מתוך זה טיפ'];

export function incomeDetailTable(rows, nameOf, { from, to } = {}) {
  const t = [['דוח הכנסות מפורט', `${fmtDate(from)} עד ${fmtDate(to)}`], [], HEAD_DETAIL];
  let net = 0; let vat = 0; let tot = 0; let tip = 0;
  for (const r of rows) {
    t.push([fmtDate(r.date), fmtTime(r.timeMin ?? r.startMin), nameOf(r.clientId), r.items.join(' + '), r.method, r.net, r.vat, r.total, r.tip]);
    net += toAgorot(r.net); vat += toAgorot(r.vat); tot += toAgorot(r.total); tip += toAgorot(r.tip);
  }
  t.push(['סה"כ', '', `${rows.length} תשלומים`, '', '', net / 100, vat / 100, tot / 100, tip / 100]);
  return t;
}

export function incomeSummaryTable(sum, { from, to } = {}) {
  const t = [['דוח הכנסות מתומצת', `${fmtDate(from)} עד ${fmtDate(to)}`], []];
  t.push(['', 'כמות', 'לפני מע"מ', 'מע"מ', 'סה"כ']);
  t.push(['סה"כ הכנסות', sum.count, sum.net, sum.vat, sum.total]);
  t.push([]);
  t.push(['לפי אמצעי תשלום', 'כמות', 'לפני מע"מ', 'מע"מ', 'סה"כ']);
  for (const m of sum.byMethod) t.push([m.method, m.count, m.net, m.vat, m.total]);
  t.push([]);
  t.push(['לפי סוג', '', 'לפני מע"מ', 'מע"מ', 'סה"כ']);
  for (const g of sum.byGroup) t.push([g.label, '', g.net, g.vat, g.total]);
  if (sum.free.count) {
    t.push([]);
    t.push(['טיפולים ללא תשלום (לא הכנסה)', sum.free.count, '', '', sum.free.value]);
  }
  return t;
}

export function salesTable(list, { from, to } = {}) {
  const t = [['דוח מכירות', `${fmtDate(from)} עד ${fmtDate(to)}`], [], ['פריט', 'סוג', 'כמות', 'סה"כ']];
  for (const x of list) t.push([x.name, GROUP_LABEL[x.group] || '', x.qty, x.total]);
  const s = salesTotals(list);
  t.push(['סה"כ', '', s.qty, s.total]);
  return t;
}
