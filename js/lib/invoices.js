
import { isYmd, todayYmd, fmtDate } from './time.js';

export const GROW_METHODS = ['אשראי', 'ביט'];

export const GROW_PATH = ['מסמכים', 'דו"ח מסמכים', 'מסמך חדש'];

export function paidOn(a) {
  const at = a && a.payment && a.payment.paidAt;
  if (!at) return null;
  const t = new Date(at);
  return Number.isNaN(t.getTime()) ? null : todayYmd(t);
}

export function growMethodsOf(settings) {
  return settings && Array.isArray(settings.growMethods) ? settings.growMethods : GROW_METHODS;
}

export function needsInvoice(a, settings) {
  if (!a || a.status !== 'paid' || !a.payment) return false;
  const p = a.payment;
  if (String(p.invoiceNo || '').trim()) return false;
  if (p.source === 'tiffulit') return false;
  const from = settings && settings.invoicesFrom;
  if (!isYmd(from)) return false;
  if (!p.method || growMethodsOf(settings).includes(p.method)) return false;
  const day = paidOn(a);
  return !!day && day >= from;
}

export function invoicesDue(appts, settings) {
  return (appts || [])
    .filter((a) => needsInvoice(a, settings))
    .sort((x, y) => String(x.payment.paidAt).localeCompare(String(y.payment.paidAt)) || String(x.id).localeCompare(String(y.id)));
}

export function methodsOn(settings, today) {
  const list = (settings && Array.isArray(settings.paymentMethods)) ? settings.paymentMethods : [];
  const from = (settings && settings.methodsFrom) || {};
  return list.filter((m) => !(isYmd(from[m]) && from[m] > today));
}

export function invoiceLines(a, clientName) {
  const p = (a && a.payment) || {};
  const day = paidOn(a);
  const amount = Number(p.amount) || 0;
  const tip = Number(p.tip) || 0;
  const lines = [
    { key: 'client', label: 'לקוח/ה', value: clientName || '', copy: clientName || '' },
    { key: 'date', label: 'תאריך התשלום', value: day ? fmtDate(day) : '', copy: day ? fmtDate(day) : '' },
    ...((a && a.items) || []).map((it, i) => ({
      key: 'item' + i, label: 'פריט', value: it.name, copy: it.name, price: Number(it.price) || 0,
    })),
    { key: 'amount', label: 'סכום', value: amount, copy: String(amount), money: true },
  ];
  if (tip > 0) lines.push({ key: 'tip', label: 'טיפ', value: tip, copy: String(tip), money: true });
  lines.push({ key: 'method', label: 'אמצעי תשלום', value: p.method || '', copy: p.method || '' });
  return lines;
}

export function cleanInvoiceNo(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return { value: null, error: 'חסר מספר חשבונית' };
  if (!/^\d+$/.test(value)) return { value: null, error: 'במספר החשבונית כותבים רק ספרות' };
  return { value, error: null };
}

export function unpayWarning(a) {
  const no = a && a.payment && String(a.payment.invoiceNo || '').trim();
  return no ? `חשבונית ${no} כבר יצאה בגרואו, וצריך לבטל אותה שם במסמך זיכוי.` : null;
}
