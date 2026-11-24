
import { html } from '../../vendor/preact-htm.js';
import {
  Page, Section, Button, IconButton, Notice, List, Row, Card, Empty, Loader, StatusBadge, Money,
} from '../ui/bits.js';
import { useData } from '../ui/hooks.js';
import { formatPhone, apptTotal, apptDiscount, lastNextStep, visitSummary, isPast, isVisit, FREE_REASONS } from '../lib/model.js';
import { fmtDate, fmtTime, todayYmd, nowMin } from '../lib/time.js';
import { fmtMoney } from '../ui/bits.js';

const treatmentOf = (a) => (a.items || []).map((i) => i.shortName || i.name).join(' + ') || 'בלי טיפול';

export default function ClientCard({ params }) {
  const id = params.id;
  const { data, loading } = useData(async (s) => {
    const client = await s.getClient(id);
    const appts = client ? await s.listAppointments({ clientId: id, includeCancelled: true }) : [];
    return { client, appts };
  }, [id]);

  if (!data) {
    return html`<${Page} title="כרטיס" em="לקוח/ה" back backTo="/clients">${loading && html`<${Loader} />`}</${Page}>`;
  }
  const { client, appts } = data;
  if (!client || client.deletedAt) {
    return html`<${Page} title="כרטיס" em="לקוח/ה" back backTo="/clients">
      <${Empty} text="הלקוח/ה לא נמצא/ה" />
      <${Button} kind="soft" href="/clients">חזרה ללקוחות</${Button}>
    </${Page}>`;
  }

  const today = todayYmd();
  const now = nowMin();
  const upcoming = appts.filter((a) => a.status !== 'cancelled' && !isPast(a, today, now));
  const past = appts.filter((a) => isPast(a, today, now)).sort((a, b) => b.date.localeCompare(a.date) || b.startMin - a.startMin);
  const visits = past.filter((a) => isVisit(a));
  const discount = visits.reduce((s, a) => s + (a.status === 'free' ? 0 : apptDiscount(a)), 0);
  const next = lastNextStep(appts, today);
  const summary = visitSummary(appts, today);
  const digits = String(client.phone || '').replace(/\D/g, '');

  return html`<${Page} title="כרטיס" em="לקוח/ה" back backTo="/clients">
    <${Card}>
      <div class="cl-name">${client.name}</div>
      <div class="cl-phone">
        <span class="cl-phone-num"><bdi dir="ltr">${formatPhone(client.phone)}</bdi></span>
        <${IconButton} icon="phone" label="חיוג" href=${'tel:' + client.phone} />
        <${IconButton} icon="whatsapp" label="וואטסאפ" href=${'https://wa.me/' + digits} target="_blank" rel="noopener" />
      </div>
      ${client.callBefore && html`<${Notice} kind="warn" icon="phone">להתקשר לפני התור · לא קורא/ת הודעות</${Notice}>`}
      ${client.marketingOptOut && html`<div class="cl-line cl-optout">בלי הודעות פרסום${client.optOutAt ? ' · מאז ' + fmtDate(todayYmd(new Date(client.optOutAt))) : ''}</div>`}
      ${next && html`<${Notice} class="is-usertext" icon="edit">
        <div>בפעם הבאה: ${next.text}</div>
        <div class="small">מהביקור ב-${fmtDate(next.date)}</div>
      </${Notice}>`}
      <div class="cl-lines">
        ${client.email && html`<div class="cl-line"><a href=${'mailto:' + client.email} dir="ltr">${client.email}</a></div>`}
        ${client.birthDate && html`<div class="cl-line">תאריך לידה: ${fmtDate(client.birthDate)}</div>`}
        ${client.notes && html`<div class="cl-notes is-usertext">${client.notes}</div>`}
        <div class="cl-line sub">${visits.length} ביקורים${visits.length ? ' · ביקור אחרון ' + fmtDate(visits[0].date) : ''}</div>
        ${discount > 0 && html`<div class="cl-line sub">הנחות שניתנו: ${fmtMoney(discount)}</div>`}
      </div>
    </${Card}>

    <div class="cl-actions">
      <${Button} href=${'/appt/new?client=' + client.id}>תור חדש</${Button}>
      <${Button} kind="soft" href=${'/client/' + client.id + '/edit'}>עריכה</${Button}>
    </div>

    ${summary.length > 0 && html`<${Section} title="סיכום טיפולים">
      <${List}>${summary.map((r) => html`<${Row} key=${r.key} title=${r.name} right=${html`<span class="sum-count">${r.count}</span>`} />`)}</${List}>
    </${Section}>`}

    <${Section} title="תורים קרובים">
      ${upcoming.length === 0
        ? html`<${Empty} text="אין תורים קרובים" />`
        : html`<${List}>${upcoming.map((a) => html`<${Row} key=${a.id} href=${'/appt/' + a.id}
            title=${fmtDate(a.date) + ' · ' + fmtTime(a.startMin)} sub=${treatmentOf(a)}
            right=${html`<${StatusBadge} status=${a.status} />`} />`)}</${List}>`}
    </${Section}>

    <${Section} title="ביקורים קודמים">
      ${past.length === 0
        ? html`<${Empty} text="אין ביקורים קודמים" />`
        : html`<${List}>${past.map((a) => {
            const off = a.status === 'free' ? 0 : apptDiscount(a);
            const free = a.status === 'free';
            const counted = a.status !== 'cancelled' && a.status !== 'noshow';
            return html`<${Row} key=${a.id} href=${'/appt/' + a.id}
              title=${fmtDate(a.date) + ' · ' + fmtTime(a.startMin)} sub=${treatmentOf(a)}
              right=${html`<${StatusBadge} status=${a.status} />`}>
              ${(counted || a.visitNote || a.nextStep || (a.status === 'cancelled' && a.cancelReason)) && html`<div class="visit-extra">
                ${free && a.freeReason && FREE_REASONS[a.freeReason.kind] && html`<div class="visit-money"><span>${FREE_REASONS[a.freeReason.kind]}</span></div>`}
                ${counted && !free && html`<div class="visit-money"><${Money} value=${apptTotal(a)} />${off > 0 && html`<span>הנחה ${fmtMoney(off)}</span>`}</div>`}
                ${a.status === 'cancelled' && a.cancelReason && html`<p class="visit-reason is-usertext">הסיבה: ${a.cancelReason}</p>`}
                ${a.visitNote && html`<p class="visit-note is-usertext">${a.visitNote}</p>`}
                ${a.nextStep && html`<p class="visit-next is-usertext">בפעם הבאה: ${a.nextStep}</p>`}
              </div>`}
            </${Row}>`;
          })}</${List}>`}
    </${Section}>
  </${Page}>`;
}
