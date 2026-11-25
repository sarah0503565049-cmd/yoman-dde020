
import { addDays, dow } from './time.js';
import { isYomTov } from './booking.js';
import { vatSplit } from './reports.js';

export const DEPOSIT = {
  amount: 150,          // ₪, כולל מע"מ
  refundHours: 48,      // "יומיים"
  refundWithinDays: 14, // החזר כספי: תוך 14 יום מהביטול
};

export const SELF_SOURCES = ['online', 'bot'];

export const isRestDay = (ymd) => dow(ymd) === 6 || isYomTov(ymd);

export function depositRequired(source) {
  return SELF_SOURCES.includes(source);
}

export const later = (a, b) => a.date > b.date || (a.date === b.date && a.min > b.min);

export function refundDeadline(appt, mode = 'hours') {
  if (mode === 'days') {
    let date = appt.date;
    let counted = 0;
    while (counted < 2) {
      date = addDays(date, -1);
      if (!isRestDay(date)) counted += 1;
    }
    return { date, min: 0 };
  }
  let left = DEPOSIT.refundHours * 60;
  let date = appt.date;
  let min = appt.startMin;
  for (;;) {
    if (!isRestDay(date)) {
      if (min >= left) return { date, min: min - left };
      left -= min;
    }
    date = addDays(date, -1);
    min = 1440;
  }
}

export function refundOpen(appt, now, mode = 'hours') {
  return !later(now, refundDeadline(appt, mode));
}

export function cancelOutcome(appt, when, by, mode = 'hours') {
  const dep = appt && appt.deposit;
  if (!dep || dep.state !== 'held') return { result: 'none', choices: [], ownerMay: [] };
  const back = { result: 'return', choices: ['credit', 'refund'], ownerMay: [] };
  if (by === 'owner') return back;
  if (by !== 'noshow' && refundOpen(appt, when, mode)) return back;
  return { result: 'kept', choices: [], ownerMay: ['credit', 'refund'] };
}

export function creditBalance(credits, clientId) {
  return (credits || [])
    .filter((c) => c.clientId === clientId && !c.usedApptId)
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

export function dueAtCheckout(total, depositHeld = 0, credit = 0) {
  const t = Math.max(0, Number(total) || 0);
  const d = Math.max(0, Number(depositHeld) || 0);
  const c = Math.max(0, Number(credit) || 0);
  const fromDeposit = Math.min(t, d);
  const fromCredit = Math.min(t - fromDeposit, c);
  return {
    fromDeposit,
    fromCredit,
    toPay: t - fromDeposit - fromCredit,
    creditLeft: c - fromCredit,
    depositLeft: d - fromDeposit,
  };
}

export function depositVat(amount = DEPOSIT.amount) {
  return vatSplit(amount);
}
