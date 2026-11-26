
import { diffDays, dow, DAY_NAMES, fmtDayMonth, fmtTime } from './time.js';

export const treat = (a) => (a.items || []).map((it) => it.shortName || it.name).join(' + ');

export function whenLabel(date, today) {
  const n = diffDays(today, date);
  if (n <= 0) return 'היום';
  if (n === 1) return 'מחר';
  if (n === 2) return 'מחרתיים';
  return `ביום ${DAY_NAMES[dow(date)]}, ${fmtDayMonth(date)}`;
}

export function toastText(fresh, nameOf, today) {
  if (fresh.length > 1) return `${fresh.length} תורים חדשים מהאתר`;
  const a = fresh[0];
  return `תור חדש מהאתר: ${nameOf(a.clientId)}, ${whenLabel(a.date, today)} ב-${fmtTime(a.startMin)}`;
}

export function linkToastText(fresh, nameOf, today) {
  if (fresh.length > 1) return `${fresh.length} שינויים מהקישור`;
  const { appt: a, kind } = fresh[0];
  if (kind === 'overridden') return `לבדוק: ${a.linkEvent.kind === 'cancel' ? 'ביטול' : 'שינוי'} מהקישור של ${nameOf(a.clientId)}`;
  const slot = kind === 'cancel' && a.linkEvent.from ? a.linkEvent.from : a;
  return `${kind === 'cancel' ? 'ביטול' : 'שינוי'} מהקישור: ${nameOf(a.clientId)}, ${whenLabel(slot.date, today)} ב-${fmtTime(slot.startMin)}`;
}

export function linkRowText({ appt: a, kind }, today) {
  const e = a.linkEvent;
  if (kind === 'overridden') {
    const tail = 'וביומן נשמר אחר כך משהו אחר. כדאי לבדוק';
    if (e.kind === 'cancel') {
      const s = e.from || a;
      return `${treat(a)} · ביטל/ה בקישור (${whenLabel(s.date, today)} ב-${fmtTime(s.startMin)}), ${tail}`;
    }
    const s = e.to || a;
    return `${treat(a)} · העביר/ה בקישור ל${whenLabel(s.date, today).replace(/^ב/, '')} ב-${fmtTime(s.startMin)}, ${tail}`;
  }
  if (kind === 'cancel') {
    const from = e.from || a;
    return `${treat(a)} · ביטל/ה: ${whenLabel(from.date, today)} ב-${fmtTime(from.startMin)}`;
  }
  const was = e.from ? ` (היה ${whenLabel(e.from.date, today)} ב-${fmtTime(e.from.startMin)})` : '';
  return `${treat(a)} · העביר/ה ל${whenLabel(a.date, today).replace(/^ב/, '')} ב-${fmtTime(a.startMin)}${was}`;
}
