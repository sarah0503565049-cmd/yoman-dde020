
import { html, useState } from '../../vendor/preact-htm.js';
import {
  Page, Hero, Section, Button, IconButton, Tile, Tiles, Money, Notice, List, Row, Dot, StatusBadge, Tag, Card, Empty,
  toast, confirmSheet, fmtMoney,
} from '../ui/bits.js';
import { BarChart, yearMark, Swatch } from '../ui/charts.js';
import { reportHref } from '../ui/period.js';
import { incomeRows, monthlyIncome } from '../lib/reports.js';
import { Icon } from '../ui/icons.js';
import { useData, useNow } from '../ui/hooks.js';
import { getStore } from '../data/store.js';
import { addDays, fmtDate, fmtDateLong, fmtDayMonth, fmtTime } from '../lib/time.js';
import {
  apptEnd, apptTotal, apptVisual, callsDue, firstVisitIds, isActive, needsNextAppointment,
} from '../lib/model.js';

const range = (a) => `${fmtTime(a.startMin)} עד ${fmtTime(apptEnd(a))}`;
const treat = (a) => (a.items || []).map((it) => it.shortName || it.name).join(' + ');
const firstServiceId = (a) => (a.items && a.items[0] && a.items[0].serviceId) || '';

function daysAgo(n) {
  if (n <= 0) return 'היום';
  if (n === 1) return 'לפני יום';
  if (n === 2) return 'לפני יומיים';
  return `לפני ${n} ימים`;
}

function MonthChart({ appts, today }) {
  const [hover, setHover] = useState(null);
  const months = monthlyIncome(appts, today);
  const cur = months.find((m) => m.current);
  const shown = months.find((m) => m.key === hover) || cur;
  const anyBooked = months.some((m) => m.booked > 0);
  const bars = months.map((m, i) => ({
    key: m.key, short: m.short, narrow: String(Number(m.key.slice(5))), value: m.paid, booked: m.booked, current: m.current,
    year: yearMark(months, i),
    href: reportHref('/reports/income', { p: 'month', d: m.from }),
    aria: `${m.label}: הכנסות ${fmtMoney(m.paid)}${m.booked > 0 ? `, כבר נקבע ${fmtMoney(m.booked)}` : ''}`,
  }));
  return html`<${Card} class="mc">
    <div class="mc-head">
      <span class="mc-title">הכנסות · ${shown.label}${shown.current ? ' עד היום' : ''}</span>
      <a class="mc-link" href="#/reports">לדוחות<${Icon} name="chevronEnd" size=${18} /></a>
    </div>
    <div class="mc-vals">
      <span class="mc-num">${fmtMoney(shown.paid)}</span>
      ${shown.booked > 0 && html`<span class="mc-booked">+ ${fmtMoney(shown.booked)} כבר נקבע</span>`}
    </div>
    <${BarChart} bars=${bars} height=${112} active=${hover} onActive=${setHover} ariaLabel="הכנסות לפי חודש, 12 החודשים האחרונים" />
    ${anyBooked && html`<div class="mc-legend" aria-hidden="true">
      <span><${Swatch} /> הכנסות</span><span><${Swatch} booked /> כבר נקבע (תורים שעוד לא שולמו)</span>
    </div>`}
  </${Card}>`;
}

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function SplitRow({ href, title, sub, end, children }) {
  return html`<div class="row home-split">
    <a class="home-split-link" href=${'#' + href}>
      <span class="row-main">
        <span class="home-title-line"><span class="row-title">${title}</span>${end}</span>
        ${sub && html`<span class="row-sub">${sub}</span>`}
      </span>
    </a>
    <span class="row-end">${children}</span>
  </div>`;
}

export default function Home() {
  const { today, min } = useNow();
  const { data } = useData(async (s) => {
    const [settings, appts, clients] = await Promise.all([s.getSettings(), s.listAppointments(), s.listClients()]);
    return { settings, appts, clients };
  }, []);

  const brand = html`<div class="home-brand"><img class="home-logo" src="img/logo.png" alt="Sarah B Cosmetics" width="500" height="500" decoding="async" /></div>`;
  const hero = html`<${Hero} image="img/clinic-chair.jpg" title="היום" sub=${fmtDateLong(today)}
    actions=${data && data.settings.demo && html`<${Tag} tone="gold">נתוני דוגמה</${Tag}>`} />`;
  const newBtn = html`<${Button} href=${'/appt/new?date=' + today}>תור חדש</${Button}>`;

  if (!data) return html`<${Page} class="home">${brand}${hero}${newBtn}</${Page}>`;

  const { settings, appts } = data;
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const nameOf = (id) => (clients.get(id) && clients.get(id).name) || 'לקוח/ה';
  const first = firstVisitIds(appts);
  const tomorrow = addDays(today, 1);

  const todays = appts.filter((a) => a.date === today && isActive(a));
  const income = incomeRows(appts, null, { from: today, to: today }).reduce((s, r) => s + r.total, 0);
  const pending = appts.filter((a) => a.status === 'pending' && a.date >= today);
  const unpaid = appts.filter((a) => apptVisual(a, today, min, false).unpaid);
  const calls = callsDue(appts, clients, today, tomorrow, min);
  const next = needsNextAppointment(appts, clients, today, settings);

  const markCalled = async (a) => {
    try {
      await getStore().patchAppointment(a.id, { calledAt: new Date().toISOString() });
      toast('סומן שהתקשרת');
    } catch (err) { toast(err.message); }
  };
  const dropFromList = async (n) => {
    const name = nameOf(n.clientId);
    const ok = await confirmSheet({ title: `להוריד את ${name} מהרשימה?`, ok: 'כן, לא צריך תור הבא', cancel: 'חזרה' });
    if (!ok) return;
    try {
      await getStore().patchAppointment(n.lastVisit.id, { noFollowUp: true });
      toast('הוסר מהרשימה');
    } catch (err) { toast(err.message); }
  };
  const confirmAppt = async (a) => {
    try {
      await getStore().setAppointmentStatus(a.id, 'booked');
      toast('התור אושר');
    } catch (err) { toast(err.message); }
  };

  return html`<${Page} class="home">
    ${brand}
    ${hero}
    <${MonthChart} appts=${appts} today=${today} />
    ${newBtn}

    <${Tiles}>
      <${Tile} label="תורים היום" value=${todays.length} />
      <${Tile} label="הכנסות היום" value=${html`<${Money} value=${income} />`} href=${reportHref('/reports/income', { p: 'day', d: today })} />
      <${Tile} label="ממתינים לאישור" value=${pending.length} onClick=${pending.length ? () => scrollToId('pending') : undefined} />
      <${Tile} label="לא שולמו" value=${unpaid.length} onClick=${unpaid.length ? () => scrollToId('unpaid') : undefined} />
    </${Tiles}>

    ${unpaid.length > 0 && html`<${Section} title="לא שולמו" id="unpaid">
      <${Notice} kind="warn" icon="coin">${unpaid.length === 1 ? 'תור אחד שעבר ועוד לא שולם' : `${unpaid.length} תורים שעברו ועוד לא שולמו`}</${Notice}>
      <${List}>
        ${unpaid.map((a) => html`<${Row} key=${a.id} href=${'/appt/' + a.id} title=${nameOf(a.clientId)}
          sub=${`${fmtDayMonth(a.date)} · ${fmtTime(a.startMin)} · ${treat(a)}`}
          right=${html`<${Money} value=${apptTotal(a)} />`} />`)}
      </${List}>
    </${Section}>`}

    ${calls.length > 0 && html`<${Section} title="להתקשר לפני התור" id="calls">
      <${List}>
        ${calls.map((a) => {
          const c = clients.get(a.clientId);
          return html`<${SplitRow} key=${a.id} href=${'/appt/' + a.id} title=${nameOf(a.clientId)}
            sub=${`${a.date === today ? 'היום' : 'מחר'} · ${fmtTime(a.startMin)} · ${treat(a)}`}>
            <${IconButton} icon="phone" label="חיוג" href=${'tel:' + (c ? c.phone : '')} />
            <${IconButton} icon="check" label="התקשרתי" onClick=${() => markCalled(a)} />
          </${SplitRow}>`;
        })}
      </${List}>
    </${Section}>`}

    ${next.length > 0 && html`<${Section} title="לא קבעו תור הבא" id="next">
      <${List}>
        ${next.map((n) => {
          const v = n.lastVisit;
          const it = v.items && v.items[0];
          const href = `/appt/new?client=${encodeURIComponent(n.clientId)}&service=${encodeURIComponent(firstServiceId(v))}&min=${v.startMin}&next=1`;
          return html`<${SplitRow} key=${n.clientId} href=${href} title=${nameOf(n.clientId)}
            sub=${`ביקור אחרון ${fmtDate(v.date)}${it ? ' · ' + (it.shortName || it.name) : ''}`}
            end=${html`<span class=${'home-days' + (n.overdue ? ' is-overdue' : '')}>${daysAgo(n.daysSince)}</span>`}>
            <${IconButton} icon="close" label="לא צריך תור הבא" kind="plain" onClick=${() => dropFromList(n)} />
          </${SplitRow}>`;
        })}
      </${List}>
    </${Section}>`}

    ${pending.length > 0 && html`<${Section} title="ממתינים לאישור" id="pending">
      ${pending.map((a) => html`<${Card} key=${a.id} class="home-pend">
        <a class="home-pend-link" href=${'#/appt/' + a.id}>
          <span class="row-title">${fmtDateLong(a.date)} · ${range(a)}</span>
          <span class="row-sub">${nameOf(a.clientId)} · ${treat(a)}</span>
          <span class="inline-row">${a.source === 'online' && html`<${Tag} tone="olive">נקבע באתר</${Tag}>`}<${StatusBadge} status="pending" /></span>
        </a>
        <${Button} onClick=${() => confirmAppt(a)}>אישור התור</${Button}>
      </${Card}>`)}
    </${Section}>`}

    <${Section} title="התורים של היום" id="today">
      ${todays.length === 0 ? html`<${Empty} text="אין תורים היום" />` : html`<${List}>
        ${todays.map((a) => {
          const vis = apptVisual(a, today, min, first.has(a.id));
          const color = a.items && a.items[0] && a.items[0].color;
          return html`<${Row} key=${a.id} href=${'/appt/' + a.id}
            start=${html`<${Dot} color=${color} />`}
            title=${html`${vis.star && html`<span class="mark-star" title="ביקור ראשון"><${Icon} name="star" fill size=${16} /></span>`}${nameOf(a.clientId)}`}
            sub=${`${range(a)} · ${treat(a)}`}
            right=${html`${vis.unpaid && html`<span class="mark-coin" title="לא שולם"><${Icon} name="coin" size=${20} /></span>`}<${StatusBadge} status=${a.status} short />${vis.thumb && html`<span class="mark-thumb" title="אישר/ה הגעה"><${Icon} name="thumb" size=${20} /></span>`}`} />`;
        })}
      </${List}>`}
    </${Section}>
  </${Page}>`;
}
