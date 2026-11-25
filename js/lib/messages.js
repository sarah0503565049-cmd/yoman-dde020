
import { addDays, diffDays, dow, DAY_NAMES, fmtTime, parts } from './time.js';
import { isYomTov } from './booking.js';
import { apptEnd, apptTravel, canSendService, returnWeeksOf } from './model.js';

export const WAZE = 'https://waze.com/ul/hsv8uy09dk';
export const REVIEW_LINK = 'https://g.page/r/CSQyxj1iUAcsEBM/review';
export const CLINIC_WAY = `הקליניקה ברחוב זית 42, רמת רזיאל. הכניסה מרחוב הברוש:\n${WAZE}`;

export const TIMING = {
  reminderHours: [48, 24],      // 5 ו-5ב
  reviewAtMin: 20 * 60,         // 15: ביום הטיפול ב-20:00, לכולם
  reviewEveAfterMin: 60,        // 15 ביום שישי או בערב חג: שעה אחרי סוף הטיפול
  afterCareMin: 60,             // 16 ו-17: שעה אחרי סוף הטיפול
  formResendHours: 48,          // 9ב: הטופס עוד לא מולא, 48 שעות לפני התור
  formResendFallbackMin: 180,   // 9ב כשהתור נקבע פחות מ-48 שעות לפני: 3 שעות אחרי ההודעה הראשונה
  payReminderDays: 2,           // 18: יומיים אחרי ביקור שלא שולם
  payReminderAtMin: 10 * 60,
  returnAtMin: 10 * 60,         // 19: בשעה 10:00 ביום שמגיע
  birthdayAtMin: 9 * 60,        // 21: בבוקר של יום ההולדת
  freedSlotMinDaysLater: 7,     // 13: למי שהתור הבא שלו/ה לפחות שבוע אחרי השעה שהתפנתה
  freedSlotMinNoticeMin: 120,   // 13: לא מציעים שעה שמתחילה בעוד פחות משעתיים
  quiet: { guardMin: 60, endAtMin: 20 * 60, eveLastMin: 12 * 60 },
  candleMin: [965, 990, 1010, 1095, 1115, 1135, 1135, 1100, 1060, 965, 955, 955],
};

export const AFTER_CARE = { 'after-plasma': ['svc-07'], 'after-fungus': ['svc-01', 'svc-02'] };

export const VARS = {
  'שם': 'השם הפרטי',
  'טיפול': 'שם הטיפול',
  'יום': 'היום בשבוע',
  'תאריך': 'התאריך, למשל 2.12',
  'שעה': 'השעה, למשל 10:00',
  'קישור': 'הקישור של ההודעה',
  'הדרך': 'הכתובת והקישור לוויז. בביקור בית לא נכתב',
  'סכום': 'הסכום לתשלום',
  'מאת': 'ממי השובר',
  'התור שלך': 'התור הקיים, למשל: ביום חמישי, 11.12, בשעה 14:00',
  'פייבוקס': 'מספר הפייבוקס. ימולא בהשקה',
  'חשבון': 'פרטי חשבון הבנק. ימולא בהשקה',
};

export const LINKS = {
  myappt: 'הקישור לתור: אישור הגעה, שינוי יום או שעה, ביטול',
  book: 'הקישור לדף קביעת התור',
  form: 'הקישור לטופס',
  receipt: 'הקישור לקבלה',
  voucher: 'הקישור לשובר',
  offer: 'הקישור להעברת התור לשעה שהתפנתה',
};

export const GROUPS = [
  { id: 'before', title: 'עד התור' },
  { id: 'change', title: 'שינוי וביטול' },
  { id: 'after', title: 'אחרי הביקור' },
];

const APPT_VARS = ['שם', 'טיפול', 'יום', 'תאריך', 'שעה', 'קישור'];

export const MESSAGES = [
  {
    id: 'booked', n: '1', group: 'before', kind: 'service', link: 'myappt', vars: [...APPT_VARS, 'הדרך'],
    title: 'תור נקבע',
    when: 'כשנקבע תור, על ידך או בדף הקביעה. בביקור בית בלי שורת הכתובת.',
    text: 'היי {שם} 🌿\nהתור שלך נקבע: {טיפול} ביום {יום}, {תאריך}, בשעה {שעה}.\nרוצה לשנות יום או שעה? הכל כאן:\n{קישור}\n{הדרך}\nנתראה 🤍 שרה',
  },
  {
    id: 'approved', n: '2', group: 'before', kind: 'service', link: 'myappt', vars: [...APPT_VARS, 'הדרך'],
    title: 'תור אושר',
    when: 'כשאת מאשרת תור מדף הקביעה שחיכה לאישור שלך.',
    text: 'היי {שם} 🌿\nאישרתי את התור שלך: {טיפול} ביום {יום}, {תאריך}, בשעה {שעה}.\nרוצה לשנות יום או שעה? הכל כאן:\n{קישור}\n{הדרך}\nנתראה 🤍 שרה',
  },
  {
    id: 'book-link', n: '4', group: 'before', kind: 'service', link: 'book', vars: ['שם', 'קישור'],
    title: 'הקישור לקביעת תור',
    when: 'כשאת שולחת למישהו/י את הקישור, בלחיצה מהכרטיס.',
    text: 'היי {שם} 🌿\nכאן אפשר לבחור טיפול, יום ושעה שנוחים לך:\n{קישור}\nמחכה לך 🤍 שרה',
  },
  {
    id: 'reminder-48', n: '5', group: 'before', kind: 'service', link: 'myappt', vars: APPT_VARS,
    title: 'תזכורת ואישור הגעה',
    when: '48 שעות לפני התור. אם זה נופל בשבת או בחג, יוצאת לפני, ביום שישי או בערב החג.',
    text: 'היי {שם},\nמזכירה שקבענו {טיפול} ביום {יום}, {תאריך}, בשעה {שעה}.\nאשמח שתאשר/י הגעה כאן, ואם זה לא נוח לך, אפשר לשנות יום או שעה באותו קישור:\n{קישור}\nמחכה לך 🤍 שרה',
  },
  {
    id: 'reminder-24', n: '5ב', group: 'before', kind: 'service', link: 'myappt', vars: APPT_VARS,
    title: 'תזכורת יום לפני',
    when: '24 שעות לפני התור. אם זה נופל בשבת או בחג, יוצאת במוצאי השבת או החג, ב-20:00.',
    text: 'היי {שם},\nנתראה ביום {יום}, {תאריך}, בשעה {שעה}, ל{טיפול}.\nאם עוד לא אישרת הגעה, או שמשהו השתנה, הכל כאן:\n{קישור}\nמחכה לך 🤍 שרה',
  },
  {
    id: 'way', n: '6', group: 'before', kind: 'service', link: null, vars: ['שם'],
    title: 'הדרך לקליניקה',
    when: 'עם התזכורת, רק בתור הראשון, ולא בביקור בית.',
    text: `היי {שם}, הנה הדרך לקליניקה 🌿\nרחוב זית 42, רמת רזיאל. הכניסה מרחוב הברוש.\n${WAZE}\nנתראה 🤍 שרה`,
  },
  {
    id: 'health', n: '7', group: 'before', kind: 'service', link: 'form', vars: ['שם', 'קישור'],
    title: 'הצהרת בריאות',
    when: 'יום לפני התור, עם התזכורת. רק בתור הראשון, ופעם בשנה לעדכון.',
    text: 'היי {שם} 🌿\nלפני שנפגשים, אשמח שתמלא/י טופס קצר על הבריאות שלך. זה לוקח כמה דקות, ועוזר לי להתאים את הטיפול בדיוק לך:\n{קישור}\nתודה 🤍 שרה',
  },
  {
    id: 'before-care', n: '8', group: 'before', kind: 'service', link: 'form', vars: ['שם', 'טיפול', 'קישור'],
    title: 'הנחיות לפני הטיפול',
    when: 'עם התזכורת, רק לטיפול שיש לו הנחיות.',
    text: 'היי {שם} 🌿\nכאן כל מה שכדאי לדעת לפני {טיפול}:\n{קישור}\nמחכה לך 🤍 שרה',
  },
  {
    id: 'photo-form', n: '9', group: 'before', kind: 'service', link: 'form', vars: ['שם', 'קישור'],
    title: 'הסכמה לפוטותרפיה',
    when: 'כשנקבע תור לפוטותרפיה, רק לתור הראשון בסדרה. הטופס: הסכמה ומידע רפואי, חובה.',
    text: 'היי {שם},\nלפני הפוטותרפיה, אשמח שתמלא/י טופס קצר: הסכמה לטיפול ומידע רפואי. יש בו גם הסבר על הטיפול.\nמילוי הטופס הוא חובה כדי שנוכל לעשות את הטיפול, ואם עולה שאלה, אני כאן:\n{קישור}\nתודה 🤍 שרה',
  },
  {
    id: 'photo-form-again', n: '9ב', group: 'before', kind: 'service', link: 'form', vars: ['שם', 'קישור'],
    title: 'הטופס עוד לא מולא',
    when: 'רק אם הטופס של 9 עוד לא מולא: 48 שעות לפני התור, פעם אחת. תור שנקבע פחות מ-48 שעות לפני: 3 שעות אחרי ההודעה הראשונה.',
    text: 'היי {שם},\nהטופס לפני הפוטותרפיה (הסכמה ומידע רפואי) עוד לא מולא.\nהטיפול מותנה במילוי הטופס, אז אשמח שתמלא/י אותו לפני שנפגשים:\n{קישור}\nתודה 🤍 שרה',
  },
  {
    id: 'updated', n: '10', group: 'change', kind: 'service', link: 'myappt', vars: APPT_VARS,
    title: 'עדכון תור',
    when: 'כשהתור זז, על ידך או על ידי הלקוח/ה בקישור.',
    text: 'היי {שם} 🌿\nהתור שלך עודכן: {טיפול} ביום {יום}, {תאריך}, בשעה {שעה}.\nצריך לשנות שוב? הכל כאן:\n{קישור}\nנתראה 🤍 שרה',
  },
  {
    id: 'cancel-client', n: '11', group: 'change', kind: 'service', link: 'book', vars: ['שם', 'יום', 'תאריך', 'שעה', 'קישור'],
    title: 'ביטול, הלקוח/ה ביטל/ה',
    when: 'כשהלקוח/ה מבטל/ת בקישור, או כשאת מסמנת "הלקוח/ה".',
    text: 'היי {שם},\nהתור שלך ביום {יום}, {תאריך}, בשעה {שעה} בוטל.\nכשיתאים לך, אפשר לקבוע מחדש כאן:\n{קישור}\nאשמח לראות אותך 🌿 שרה',
  },
  {
    id: 'cancel-owner', n: '12', group: 'change', kind: 'service', link: 'book', vars: ['שם', 'יום', 'תאריך', 'שעה', 'קישור'],
    title: 'ביטול על ידי העסק',
    when: 'כשאת מבטלת ובוחרת "אני". הסיבה שכתבת לא נשלחת.',
    text: 'היי {שם},\nמצטערת, אני צריכה לבטל את התור שלך ביום {יום}, {תאריך}, בשעה {שעה}.\nאפשר לבחור מועד חדש כאן:\n{קישור}\nאו לכתוב לי בוואטסאפ 058-7165442, ונמצא יחד זמן שנוח לך.\nסליחה על השינוי, ותודה על ההבנה 🤍 שרה',
  },
  {
    id: 'freed-slot', n: '13', group: 'change', kind: 'service', link: 'offer', vars: ['שם', 'יום', 'תאריך', 'שעה', 'התור שלך', 'קישור'],
    title: 'התפנה תור',
    when: 'כשתור מתבטל: לבד, בוואטסאפ, ללקוחות שהתור שלהם לפחות שבוע אחרי השעה שהתפנתה, ושהטיפול שלהם נכנס בה. מי שלוחץ/ת ראשון/ה מקבל/ת את השעה.',
    text: 'היי {שם},\nהתפנה תור ביום {יום}, {תאריך}, בשעה {שעה}.\nהתור שלך עכשיו {התור שלך}. אם נוח לך להקדים, אפשר לעבור לשעה הזאת כאן, כל עוד היא פנויה:\n{קישור}\nואם לא, הכל נשאר כמו שהוא 🤍 שרה',
  },
  {
    id: 'receipt', n: '14', group: 'after', kind: 'service', link: 'receipt', vars: ['שם', 'קישור'],
    title: 'הקבלה',
    when: 'מיד אחרי תשלום בקופה. הקבלה עצמה מהתוכנה הרשומה.',
    text: 'היי {שם}, תודה שהגעת היום 🤍\nהקבלה שלך כאן:\n{קישור}\nשרה',
  },
  {
    id: 'review', n: '15', group: 'after', kind: 'service', link: null, vars: ['שם'],
    title: 'תודה, וביקורת בגוגל',
    when: 'ביום הטיפול ב-20:00. ביום שישי או בערב חג: שעה אחרי סוף הטיפול, כדי שתגיע לפני שבת. פעם אחת לכל לקוח/ה, לא אחרי כל ביקור.',
    text: `היי {שם}, שמחתי שהגעת לטיפול.\nאם יש לך דקה, אשמח מאוד שתכתוב/י כמה מילים על הביקור בגוגל. זה עוזר לאנשים נוספים למצוא אותי, להשתפר ולהתאים את הטיפול הכי עבורך:\n${REVIEW_LINK}\nתודה מכל הלב 🤍 שרה`,
  },
  {
    id: 'after-plasma', n: '16', group: 'after', kind: 'service', link: null, vars: ['שם'],
    title: 'אחרי פלזמה',
    when: 'שעה אחרי שטיפול הפלזמה נגמר.',
    text: 'היי {שם},\nכמה דברים ל-24 השעות הראשונות אחרי הפלזמה:\n• לא בריכה, לא ים, לא ללכת יחף ולא מקום ציבורי. העור במקום עוד פתוח, וחשוב לא להידבק במשהו אחר.\n• מקלחת מותרת, כרגיל.\n• בלי חבישה, לא מכסים את המקום.\nואחר כך: לא נוגעים בגלד. הוא נושר לבד, תוך 7 עד 14 יום.\nלכל שאלה אני כאן 🤍 שרה',
  },
  {
    id: 'after-fungus', n: '17', group: 'after', kind: 'service', link: null, vars: ['שם'],
    title: 'ההמשך בבית, פטרת',
    when: 'שעה אחרי שטיפול הפוטותרפיה נגמר.',
    text: 'היי {שם} 🌿\nתודה שבחרת להגיע אליי. כדי להמשיך בבית את מה שעשינו היום, הנה ההנחיות למוצרים שלקחת:\n• הסרום לציפורניים: פעמיים ביום, בוקר וערב, על ציפורן נקייה ויבשה. טיפה או שתיים ישירות על הציפורן, וגם מתחת לשוליים אם אפשר. לחכות שיתייבש לפני שגורבים גרביים.\n• הסבון לרגליים: לשטוף את כפות הרגליים פעם ביום, עדיף בערב, גם בין האצבעות. לייבש היטב במגבת אישית.\n• המשחה לעור: שכבה דקה, פעם או פעמיים ביום, על האזורים שהראיתי לך. מתאימה גם בין האצבעות, על הקשת, בעקבים ובסדקים.\n• הטלק: לפזר בעדינות בבוקר, בין האצבעות ובמקומות שנוטים ללחות.\nוכמה הרגלים קטנים שעוזרים:\n• לייבש את הרגליים אחרי כל מקלחת, במיוחד בין האצבעות.\n• מגבת נפרדת לרגליים.\n• גרביים מכותנה, ולהחליף כל יום.\n• בבית בלי נעליים, לתת לרגליים לנשום.\n• לא להישאר הרבה שעות בנעליים סגורות.\n• פעם בחודש לרענן את הנעליים: חצי כוס סודה לשתייה, חצי כוס חומץ תפוחים וחצי ליטר מים פושרים. לנגב את פנים הנעליים במטלית, ולייבש באוויר או בשמש.\nזה תהליך הדרגתי, וההתמדה היא החלק הכי חשוב. יש מי שרואה שינוי אחרי כמה שבועות, ויש מי שלוקח לו כמה חודשים.\nלכל שאלה, גם בין הטיפולים, אני כאן: וואטסאפ 058-7165442 🤍 שרה',
  },
  {
    id: 'pay-reminder', n: '18', group: 'after', kind: 'service', link: null, vars: ['שם', 'תאריך', 'סכום', 'פייבוקס', 'חשבון'],
    title: 'תזכורת על תשלום',
    when: 'יומיים אחרי ביקור שלא שולם, ב-10:00, פעם אחת. וגם בלחיצה מהבית.',
    text: 'היי {שם}, מה שלומך?\nתזכורת: התשלום על הביקור בתאריך {תאריך}, סכום {סכום} ₪.\nכשנוח לך, אפשר לשלם באחת הדרכים:\n• פייבוקס: {פייבוקס}\n• העברה בנקאית: {חשבון}\n• כרטיס אשראי\nתודה רבה 🤍 שרה',
  },
  {
    id: 'come-back', n: '19', group: 'after', kind: 'marketing', link: 'book', vars: ['שם', 'קישור'],
    title: 'חזרה אחרי כמה שבועות',
    when: 'כמה שבועות אחרי הביקור האחרון, לפי מה שקבעת ללקוח/ה (ברירת המחדל 4 שבועות), ב-10:00. רק למי שאין תור קרוב ולא ביקש/ה הסרה. במקום ההודעה החודשית.',
    text: 'פרסומת\nהיי {שם} 🌿\nעברו כמה שבועות מאז שנפגשנו, ורציתי לשאול מה שלומך, ואיך הרגליים מרגישות.\nאם מתאים לך לקבוע, כאן בוחרים יום ושעה:\n{קישור}\nשרה · וואטסאפ 058-7165442\nלהסרה מהודעות כאלה, אפשר להשיב "הסר".',
  },
  {
    id: 'birthday', n: '21', group: 'after', kind: 'service', link: null, vars: ['שם'],
    title: 'יום הולדת',
    when: 'בבוקר של יום ההולדת, ב-9:00. רק למי שיש תאריך לידה בכרטיס ולא ביקש/ה הסרה.',
    text: 'היי {שם}, יום הולדת שמח! 🌷\nמאחלת לך שנה של בריאות, שקט וצעדים קלים.\nבאהבה, שרה 🤍',
  },
  {
    id: 'voucher', n: '22', group: 'after', kind: 'service', link: 'voucher', vars: ['שם', 'מאת', 'טיפול', 'קישור'],
    title: 'שובר מתנה',
    when: 'כשנמכר שובר בקופה, למי שמקבל/ת אותו.',
    text: 'היי {שם} 🌷\nקיבלת מ{מאת} שובר מתנה ל{טיפול} בקליניקה 🤍\nכל הפרטים כאן, ומשם אפשר גם לקבוע תור:\n{קישור}\nמחכה לפנק אותך, שרה',
  },
];

const BY_ID = Object.fromEntries(MESSAGES.map((m) => [m.id, m]));
export const getMessage = (id) => BY_ID[id] || null;

export function messageText(msg, settings) {
  const own = settings && settings.messages && settings.messages[msg.id];
  return own && typeof own.text === 'string' && own.text.trim() ? own.text : msg.text;
}
export function messageOn(msg, settings) {
  const own = settings && settings.messages && settings.messages[msg.id];
  return !(own && own.off);
}
export function mayReceive(msg, client) {
  if (!canSendService(client)) return false;
  return msg.kind !== 'marketing' && msg.id !== 'birthday' ? true : !client.marketingOptOut;
}

const VAR_RE = /\{([^{}\n]+)\}/g;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function varsIn(text) {
  return [...new Set([...String(text || '').matchAll(VAR_RE)].map((m) => m[1]))];
}

export function fillMessage(text, vars = {}) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const only = /^\s*\{([^{}\n]+)\}\s*$/.exec(line);
    if (only && own(vars, only[1]) && vars[only[1]] === '') continue;
    out.push(line.replace(VAR_RE, (m, k) => (own(vars, k) && vars[k] != null ? String(vars[k]) : m)));
  }
  return out.join('\n');
}

export function missingVars(text, vars = {}) {
  return varsIn(text).filter((k) => !own(vars, k) || vars[k] == null);
}

export function checkText(msg, text) {
  const t = String(text || '');
  const errs = [];
  if (!t.trim()) return ['ההודעה ריקה'];
  for (const k of varsIn(t)) {
    if (!msg.vars.includes(k)) errs.push(`{${k}} לא שייך להודעה הזאת`);
  }
  if ((t.match(/\{/g) || []).length !== (t.match(/\}/g) || []).length) errs.push('סוגריים מסולסלים לא סגורים');
  if (msg.kind === 'marketing') {
    if (t.trim().split('\n')[0].trim() !== 'פרסומת') errs.push('בהודעת פרסום השורה הראשונה היא "פרסומת" (חוק התקשורת)');
    if (!t.includes('הסר')) errs.push('בהודעת פרסום חייבת להיות אפשרות הסרה, "הסר" (חוק התקשורת)');
  }
  return errs;
}

export const fmtShortDate = (ymd) => { const { d, m } = parts(ymd); return `${d}.${m}`; };
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
export const apptPhrase = (a) => `ביום ${DAY_NAMES[dow(a.date)]}, ${fmtShortDate(a.date)}, בשעה ${fmtTime(a.startMin)}`;

export function varsFor(appt, client, { settings = null, ...extra } = {}) {
  const v = {};
  if (client) v['שם'] = firstName(client.name);
  if (appt) {
    v['טיפול'] = (appt.items || []).map((it) => it.name).filter(Boolean).join(' ו') || null;
    v['יום'] = DAY_NAMES[dow(appt.date)];
    v['תאריך'] = fmtShortDate(appt.date);
    v['שעה'] = fmtTime(appt.startMin);
    v['הדרך'] = apptTravel(appt) > 0 ? '' : CLINIC_WAY;
  }
  const pay = (settings && settings.payInfo) || {};
  v['פייבוקס'] = String(pay.paybox || '').trim() || null;
  v['חשבון'] = String(pay.bank || '').trim() || null;
  for (const [k, val] of Object.entries(extra)) v[k] = val;
  return v;
}

export const norm = (date, min) => { const d = Math.floor(min / 1440); return { date: addDays(date, d), min: min - d * 1440 }; };
export const earlier = (a, b) => a.date < b.date || (a.date === b.date && a.min < b.min);

const isRestDay = (ymd) => dow(ymd) === 6 || isYomTov(ymd);
export const isEve = (ymd) => !isRestDay(ymd) && isRestDay(addDays(ymd, 1));
export const shabbatEntryMin = (ymd) => TIMING.candleMin[parts(ymd).m - 1];

export function isQuiet({ date, min }) {
  const Q = TIMING.quiet;
  if (isRestDay(date)) return min < Q.endAtMin || isRestDay(addDays(date, 1));
  return isEve(date) && min >= shabbatEntryMin(date) - Q.guardMin;
}

export function outOfQuiet(at, dir) {
  if (!isQuiet(at)) return { ...at, shifted: false };
  const Q = TIMING.quiet;
  let d = at.date;
  if (dir === 'after') {
    if (!isRestDay(d)) d = addDays(d, 1);
    while (isRestDay(addDays(d, 1))) d = addDays(d, 1);
    return { date: d, min: Q.endAtMin, shifted: true };
  }
  while (isRestDay(d)) d = addDays(d, -1);
  return { date: d, min: Math.min(at.min, Q.eveLastMin), shifted: true };
}

function beforeAppt(at, start, dir) {
  const out = outOfQuiet(at, dir);
  if (dir === 'after' && !earlier(out, norm(start.date, start.min - 60))) return outOfQuiet(at, 'before');
  return out;
}

export function reminderTimes(appt, now = null) {
  if (!appt || appt.status === 'cancelled') return [];
  const start = { date: appt.date, min: appt.startMin };
  const [h1, h2] = TIMING.reminderHours;
  const list = [
    { id: 'reminder-48', ...beforeAppt(norm(appt.date, appt.startMin - h1 * 60), start, 'before') },
    { id: 'reminder-24', ...beforeAppt(norm(appt.date, appt.startMin - h2 * 60), start, 'after') },
  ];
  return list.filter((r) => earlier(r, start) && (!now || !earlier(r, now)));
}

export function reviewTime(appt) {
  if (!isEve(appt.date)) return outOfQuiet({ date: appt.date, min: TIMING.reviewAtMin }, 'after');
  const end = apptEnd(appt);
  const entry = shabbatEntryMin(appt.date);
  if (end >= entry) return outOfQuiet({ date: appt.date, min: end }, 'after');
  const late = end + TIMING.reviewEveAfterMin > entry - TIMING.quiet.guardMin;
  return { date: appt.date, min: late ? end : end + TIMING.reviewEveAfterMin, shifted: true };
}

export function afterCareFor(appt) {
  const ids = (appt.items || []).map((it) => it.serviceId);
  for (const [msgId, svcIds] of Object.entries(AFTER_CARE)) if (ids.some((id) => svcIds.includes(id))) return msgId;
  return null;
}

export function afterCareTime(appt) {
  const at = norm(appt.date, apptEnd(appt) + TIMING.afterCareMin);
  return isQuiet(at) ? { ...norm(appt.date, apptEnd(appt)), shifted: true } : { ...at, shifted: false };
}

export function formResendTime(appt, firstSent) {
  const start = { date: appt.date, min: appt.startMin };
  let at = norm(appt.date, appt.startMin - TIMING.formResendHours * 60);
  if (!earlier(firstSent, at)) at = norm(firstSent.date, firstSent.min + TIMING.formResendFallbackMin);
  const out = beforeAppt(at, start, 'after');
  return earlier(firstSent, out) && earlier(out, start) ? out : null;
}

export function payReminderTime(appt) {
  return outOfQuiet({ date: addDays(appt.date, TIMING.payReminderDays), min: TIMING.payReminderAtMin }, 'after');
}

export function comeBackTime(lastVisit, client, settings) {
  return outOfQuiet({ date: addDays(lastVisit.date, returnWeeksOf(client, settings) * 7), min: TIMING.returnAtMin }, 'after');
}

export function birthdayTime(client, year) {
  if (!client || !client.birthDate) return null;
  const { m, d } = parts(client.birthDate);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  const date = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return outOfQuiet({ date, min: TIMING.birthdayAtMin }, 'after');
}

export function freedSlotOffers(freed, appts, clientsById, opt = {}) {
  const { now = null, minDaysLater = TIMING.freedSlotMinDaysLater, minNoticeMin = TIMING.freedSlotMinNoticeMin } = opt;
  if (now && earlier(norm(freed.date, freed.startMin - minNoticeMin), now)) return [];
  const get = (id) => (clientsById instanceof Map ? clientsById.get(id) : clientsById[id]);
  const next = new Map();
  for (const a of appts) {
    if (a.id === freed.id || a.clientId === freed.clientId || a.status === 'cancelled') continue;
    if (a.date < freed.date || (a.date === freed.date && a.startMin <= freed.startMin)) continue;
    const cur = next.get(a.clientId);
    if (!cur || a.date < cur.date || (a.date === cur.date && a.startMin < cur.startMin)) next.set(a.clientId, a);
  }
  const out = [];
  for (const a of next.values()) {
    const c = get(a.clientId);
    if (!canSendService(c) || c.callBefore) continue;
    if (!['booked', 'confirmed'].includes(a.status)) continue;
    if (diffDays(freed.date, a.date) < minDaysLater) continue;
    if (a.durationMin > freed.durationMin || apptTravel(a) > 0) continue;
    out.push(a);
  }
  out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.startMin - y.startMin));
  return out.map((a) => ({ clientId: a.clientId, apptId: a.id }));
}

export function sampleVars(msg) {
  const photo = msg.id === 'photo-form' || msg.id === 'photo-form-again' || msg.id === 'after-fungus';
  return {
    'שם': 'תמר',
    'טיפול': photo ? 'טיפול בפטרת הציפורן - פוטותרפיה' : 'פדיקור פרא-רפואי מלא',
    'יום': 'שלישי',
    'תאריך': '2.12',
    'שעה': '10:00',
    'הדרך': CLINIC_WAY,
    'סכום': '390',
    'מאת': 'יעל',
    'התור שלך': 'ביום חמישי, 11.12, בשעה 14:00',
  };
}
