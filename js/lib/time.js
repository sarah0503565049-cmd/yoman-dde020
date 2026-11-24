
export const TZ = 'Asia/Jerusalem';
export const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const pad = (n) => String(n).padStart(2, '0');

function toUtc(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(dt) {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function isYmd(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUtc(toUtc(s)) === s;
}

export function addDays(ymd, n) {
  const dt = toUtc(ymd);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

export function diffDays(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

export function dow(ymd) {
  return toUtc(ymd).getUTCDay();
}

export function weekStart(ymd) {
  return addDays(ymd, -dow(ymd));
}

export function weekDays(ymd) {
  const s = weekStart(ymd);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(s, i));
}

export function parts(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

export function fmtTime(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function fmtDuration(min) {
  if (min < 60) return `${min} דקות`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  const hours = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  if (r === 0) return hours;
  if (r === 30) return `${hours} וחצי`;
  if (r === 15) return `${hours} ורבע`;
  return `${hours} ו-${r} דקות`;
}

export function fmtDate(ymd) {
  const { y, m, d } = parts(ymd);
  return `${pad(d)}/${pad(m)}/${y}`;
}

export function fmtDayMonth(ymd) {
  const { m, d } = parts(ymd);
  return `${d}/${m}`;
}

export function fmtDateLong(ymd) {
  const { m, d } = parts(ymd);
  return `יום ${DAY_NAMES[dow(ymd)]}, ${d} ב${MONTH_NAMES[m - 1]}`;
}

export function fmtWeekRange(ymd) {
  const days = weekDays(ymd);
  const a = parts(days[0]);
  const b = parts(days[6]);
  if (a.m === b.m) return `${a.d} עד ${b.d} ב${MONTH_NAMES[a.m - 1]} ${b.y}`;
  return `${a.d} ב${MONTH_NAMES[a.m - 1]} עד ${b.d} ב${MONTH_NAMES[b.m - 1]} ${b.y}`;
}

export function todayYmd(now = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(now);
}

export function nowMin(now = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  const [h, m] = f.format(now).split(':').map(Number);
  return (h % 24) * 60 + m;
}

export function snap(min, slot = 15) {
  return Math.floor(min / slot) * slot;
}

export function timeOptions(from, to, slot = 15) {
  const out = [];
  for (let m = from; m < to; m += slot) out.push(m);
  return out;
}
