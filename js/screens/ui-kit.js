
import { html, useState } from '../../vendor/preact-htm.js';
import {
  Page, Section, Hero, Button, TextButton, IconButton, Fab, Chip, Chips, Segmented, Tag, StatusBadge, Dot, Money,
  Field, TextInput, NumberInput, TextArea, Select, DateInput, Toggle, Card, List, Row, Tile, Tiles,
  Notice, Empty, Sheet, toast, confirmSheet, askSheet,
} from '../ui/bits.js';
import { Icon } from '../ui/icons.js';
import { STATUS } from '../lib/model.js';
import { fmtDateLong, fmtDuration, fmtTime, timeOptions, todayYmd } from '../lib/time.js';

const COLORS = ['#8FB8E8', '#7FCB7A', '#BFEBC3', '#EE8ACF', '#F0705A', '#8ED6D0', '#D58BE0', '#F4D94E', '#DDE9A8', '#2E9E5B', '#3D5BF0', '#56606B'];
const QUICK = ['הפסקת אוכל', 'זמן הודעות', 'בלט', 'ספורט', 'פגישה', 'סגור'];
const ICON_NAMES = [
  ['home', 'בית'], ['calendar', 'יומן'], ['users', 'לקוחות'], ['more', 'עוד'], ['plus', 'הוספה'],
  ['chevronStart', 'הקודם'], ['chevronEnd', 'הבא'], ['back', 'חזרה'], ['phone', 'חיוג'], ['whatsapp', 'וואטסאפ'],
  ['star', 'ביקור ראשון'], ['thumb', 'אישר/ה'], ['clock', 'שעה'], ['edit', 'עריכה'], ['trash', 'מחיקה'],
  ['search', 'חיפוש'], ['close', 'סגירה'], ['repeat', 'חוזר'], ['check', 'אישור'], ['coin', 'לא שולם'], ['mic', 'הכתבה'],
];

export default function UiKit() {
  const today = todayYmd();
  const [quick, setQuick] = useState('בלט');
  const [svc, setSvc] = useState('#8FB8E8');
  const [view, setView] = useState('week');
  const [kind, setKind] = useState('appt');
  const [repeat, setRepeat] = useState('none');
  const [q, setQ] = useState('');
  const [name, setName] = useState('תמר גולן');
  const [short, setShort] = useState('פוטותרפיה');
  const [phone, setPhone] = useState('050-55501');
  const [price, setPrice] = useState(580);
  const [dur, setDur] = useState(90);
  const [start, setStart] = useState(540);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [note2, setNote2] = useState('מעדיפה תורים בבוקר');
  const [allDay, setAllDay] = useState(false);
  const [active, setActive] = useState(true);
  const [sheet, setSheet] = useState(false);

  const durations = timeOptions(15, 301, 15).map((m) => ({ value: m, label: fmtDuration(m) }));
  const times = timeOptions(420, 1260, 15).map((m) => ({ value: m, label: fmtTime(m) }));

  const footer = html`
    <p class="summary">סה"כ <${Money} value=${970} /> · ${fmtDuration(dur)} · עד ${fmtTime(start + dur)}</p>
    <${Button} type="submit">שמירה</${Button}>`;

  return html`<${Page} title="ערכת" em="העיצוב" back backTo="/more" footer=${footer} onSubmit=${() => toast('נשמר')}>

    <${Hero} image="img/clinic-chair.jpg" title="היום" sub=${fmtDateLong(today)}
      actions=${html`<${Tag} tone="gold">נתוני דוגמה</${Tag}>`} />

    <${Section} title="כותרות" em="וטקסט">
      <h1>תור <em>חדש</em></h1>
      <h2>התורים של היום</h2>
      <h3>שעות היומן</h3>
      <p>גוף הטקסט הוא 17 פיקסלים בגופן אסיסטנט, בצבע החום של האתר. כשהוא נמשך על פני כמה שורות הוא מיושר לשני הצדדים, והשורה האחרונה נשארת מימין.</p>
      <p class="sub">כל הנתונים כאן מומצאים, לבדיקה בלבד.</p>
      <p class="small">גרסה 0.1 · שלב 1</p>
    </${Section}>

    <${Section} title="כפתורים">
      <${Button} onClick=${() => toast('נשמר')}>שמירה</${Button}>
      <${Button} kind="soft">עריכה</${Button}>
      <${Button} kind="danger">ביטול התור</${Button}>
      <${Button} disabled>שמירה</${Button}>
      <${Button} kind="soft" icon="plus">הוספת טיפול</${Button}>
      <${TextButton}>+ לקוח/ה חדש/ה</${TextButton}>
      <div class="inline-row">
        <${IconButton} icon="phone" label="חיוג" />
        <${IconButton} icon="whatsapp" label="וואטסאפ" />
        <${IconButton} icon="edit" label="עריכה" />
        <${IconButton} icon="plus" label="הוספה" kind="primary" />
        <${IconButton} icon="close" label="סגירה" kind="plain" />
        <${Fab} class="kit-static" label="תור חדש" />
      </div>
    </${Section}>

    <${Section} title="בועות" em="ובחירה">
      <${Chips}>${QUICK.map((n) => html`<${Chip} active=${quick === n} onClick=${() => setQuick(n)}>${n}</${Chip}>`)}</${Chips}>
      <${Chips}>
        ${[['#8FB8E8', 'פוטותרפיה'], ['#7FCB7A', 'פרא-רפואי'], ['#EE8ACF', 'חודרנית'], ['#F4D94E', 'פרפין']].map(([c, n]) =>
          html`<${Chip} color=${c} active=${svc === c} onClick=${() => setSvc(c)}>${n}</${Chip}>`)}
      </${Chips}>
      <${Segmented} label="תצוגה" value=${view} onChange=${setView} options=${[{ value: 'week', label: 'שבועי' }, { value: 'day', label: 'יומי' }]} />
      <${Segmented} label="סוג" value=${kind} onChange=${setKind} options=${[{ value: 'appt', label: 'תור' }, { value: 'block', label: 'אירוע' }]} />
      <${Segmented} label="חוזר" value=${repeat} onChange=${setRepeat}
        options=${[{ value: 'none', label: 'חד-פעמי' }, { value: 'daily', label: 'כל יום' }, { value: 'weekly', label: 'כל שבוע' }]} />
      <div class="inline-row">
        <${Tag} tone="gold">נתוני דוגמה</${Tag}>
        <${Tag}>לא פעיל</${Tag}>
        <${Tag} tone="olive">נקבע באתר</${Tag}>
      </div>
    </${Section}>

    <${Section} title="שדות">
      <${Field} label="לקוח/ה">
        <${TextInput} icon="search" value=${q} onChange=${setQ} placeholder="חיפוש לפי שם או טלפון" />
      </${Field}>
      <${Field} label="שם מלא"><${TextInput} value=${name} onChange=${setName} autocomplete="name" /></${Field}>
      <${Field} label="שם קצר ליומן" hint="מה שרואים במשבצת של היומן"><${TextInput} value=${short} onChange=${setShort} /></${Field}>
      <${Field} label="טלפון" error="מספר הטלפון לא תקין"><${TextInput} type="tel" value=${phone} onChange=${setPhone} /></${Field}>
      <${Field} label="מחיר"><${NumberInput} value=${price} onChange=${setPrice} suffix="₪" /></${Field}>
      <${Field} label="תאריך"><${DateInput} value=${date} onChange=${setDate} showDay /></${Field}>
      <${Field} label="שעת התחלה"><${Select} value=${start} onChange=${setStart} options=${times} /></${Field}>
      <${Field} label="משך" hint=${'עד ' + fmtTime(start + dur)}><${Select} value=${dur} onChange=${setDur} options=${durations} /></${Field}>
      <${Field} label="הערה"><${TextArea} value=${note} onChange=${setNote} voice /></${Field}>
      <${Field} label="הערה, בזמן הכתבה"><${TextArea} value=${note2} onChange=${setNote2} voice demoListening /></${Field}>
      <${Card}>
        <${Toggle} label="כל היום" checked=${allDay} onChange=${setAllDay} />
        <${Toggle} label="פעיל" checked=${active} onChange=${setActive} />
      </${Card}>
    </${Section}>

    <${Section} title="כרטיסים" em="ושורות">
      <${Card}>
        <h3>נתוני דוגמה</h3>
        <p>כל הנתונים כאן מומצאים, לבדיקה בלבד.</p>
        <${Button} kind="soft">איפוס נתוני הדוגמה</${Button}>
      </${Card}>
      <${List}>
        <${Row} title="תמר גולן" sub="050-5550101" href="/_ui" chevron />
        <${Row} title="יעל שחר" sub="050-5550102" href="/_ui" chevron />
        <${Row} title="אורי נבון" sub="050-5550103" href="/_ui" chevron />
      </${List}>
      <${List}>
        <${Row} start=${html`<${Dot} color="#8FB8E8" />`} title="מיכל רון" sub="09:00 עד 10:30 · פוטותרפיה"
          right=${html`<${StatusBadge} status="confirmed" short /><span class="mark-thumb"><${Icon} name="thumb" size=${20} /></span>`} onClick=${() => {}} />
        <${Row} start=${html`<${Dot} color="#7FCB7A" />`} title=${html`<span class="mark-star"><${Icon} name="star" fill size=${16} /></span>ליאת דרור`}
          sub="16:30 עד 18:00 · פרא-רפואי" right=${html`<${StatusBadge} status="booked" />`} onClick=${() => {}} />
        <${Row} start=${html`<${Dot} color="#EE8ACF" />`} title="דוד שגיא" sub="20/11 · 13:00 · חודרנית"
          right=${html`<${Money} value=${410} />`} onClick=${() => {}} />
      </${List}>
      <${Card}>
        <div class="row-title">יום חמישי, 26 בנובמבר · 10:00 עד 11:30</div>
        <div class="row-sub">אבי זמיר · סדרת פוטותרפיה</div>
        <div class="inline-row"><${Tag} tone="olive">נקבע באתר</${Tag}><${StatusBadge} status="pending" /></div>
        <${Button} onClick=${() => toast('התור אושר')}>אישור התור</${Button}>
      </${Card}>
    </${Section}>

    <${Section} title="משבצות">
      <${Tiles}>
        <${Tile} label="תורים היום" value=${3} />
        <${Tile} label="הכנסות היום" value=${html`<${Money} value=${970} />`} />
        <${Tile} label="ממתינים לאישור" value=${2} onClick=${() => {}} />
        <${Tile} label="לא שולמו" value=${1} onClick=${() => {}} />
      </${Tiles}>
    </${Section}>

    <${Section} title="הודעות">
      <${Notice}>בשעות האלה לקוחות יוכלו לקבוע תור בעצמם. את קובעת תור בכל שעה.</${Notice}>
      <${Notice} kind="warn" icon="coin">2 תורים שעברו ועוד לא שולמו</${Notice}>
      <${Notice} kind="danger">חסר שם של לקוח/ה · צריך לבחור טיפול אחד לפחות</${Notice}>
    </${Section}>

    <${Section} title="מצבי" em="התור">
      <div class="inline-row">${Object.keys(STATUS).map((s) => html`<${StatusBadge} status=${s} />`)}</div>
      <div class="inline-row">${Object.keys(STATUS).map((s) => html`<${StatusBadge} status=${s} short compact />`)}</div>
    </${Section}>

    <${Section} title="צבעים" em="וסכומים">
      <div class="inline-row">${COLORS.map((c) => html`<${Dot} color=${c} size=${22} />`)}</div>
      <${List}>
        <${Row} title="טיפול בפטרת הציפורן - פוטותרפיה חד-פעמי" right=${html`<${Money} value=${580} />`} />
        <${Row} title="סדרת פוטותרפיה לפטרת הציפורן - 6 טיפולים" right=${html`<${Money} value=${3400} />`} />
        <${Row} title="סה״כ" right=${html`<${Money} value=${3980} />`} />
      </${List}>
    </${Section}>

    <${Section} title="מצב ריק">
      <${Empty} text="אין תורים היום" />
      <${Empty} text="המסך הזה עוד לא נבנה" />
    </${Section}>

    <${Section} title="חלונית" em="והודעה">
      <${Button} kind="soft" onClick=${() => setSheet(true)}>לפתוח חלונית</${Button}>
      <${Button} kind="soft" onClick=${() => toast('התור נשמר')}>הודעה קופצת</${Button}>
      <${Button} kind="soft" onClick=${() => toast('התור הועבר ל-10:45', { action: { label: 'ביטול', onClick: () => toast('התור חזר למקום') } })}>הודעה עם ביטול</${Button}>
      <${Button} kind="soft" onClick=${async () => {
        const who = await askSheet({ title: 'מי ביטל/ה?', choices: [{ value: 'client', label: 'הלקוח/ה' }, { value: 'owner', label: 'אני', kind: 'soft' }] });
        if (who) toast('התור בוטל');
      }}>שאלה עם שתי תשובות</${Button}>
      <${Button} kind="danger" onClick=${async () => {
        if (await confirmSheet({ title: 'למחוק את האירוע?', ok: 'מחיקה', danger: true })) toast('נמחק');
      }}>שאלת מחיקה</${Button}>
    </${Section}>

    <${Section} title="סמלים">
      <div class="kit-icons">
        ${ICON_NAMES.map(([n, label]) => html`<div class="kit-icon"><${Icon} name=${n} size=${26} /><span>${label}</span></div>`)}
      </div>
    </${Section}>

    <${Sheet} open=${sheet} onClose=${() => setSheet(false)} title=${fmtDateLong(today) + ', 10:15'}>
      <${Button} onClick=${() => { setSheet(false); toast('תור חדש'); }}>תור חדש</${Button}>
      <${Button} kind="soft" onClick=${() => { setSheet(false); toast('אירוע חדש'); }}>אירוע חדש</${Button}>
    </${Sheet}>
  </${Page}>`;
}
