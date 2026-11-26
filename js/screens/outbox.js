
import { html, useState } from '../../vendor/preact-htm.js';
import { Page, Section, Card, Button, TextButton, Tag, Notice, Empty, Loader, toast, confirmSheet } from '../ui/bits.js';
import { Icon } from '../ui/icons.js';
import { useData, useNow, useSessionState } from '../ui/hooks.js';
import { getStore } from '../data/store.js';
import { addDays, fmtTime, fmtDayMonth } from '../lib/time.js';
import { computeOutbox, defaultLinkFor, activation, markFor, markPatch } from '../lib/outbox.js';
import { manualSender } from '../lib/senders.js';

async function load(s) {
  const [settings, clients, appointments] = await Promise.all([s.getSettings(), s.listClients(), s.listAppointments({ includeCancelled: true })]);
  return { settings, clients, appointments };
}

function linkerFor(settings) {
  const demoBase = settings.demo && typeof document !== 'undefined' ? new URL('./', document.baseURI).href : '';
  const st = { ...settings, linkBase: settings.linkBase || demoBase };
  const linkFor = (kind, appt, s) => defaultLinkFor(kind, appt, s)
    || (settings.demo && (kind === 'myappt' || kind === 'book') ? defaultLinkFor('book', null, s) : null);
  return { state: st, linkFor };
}

function compute(data, now) {
  const { state, linkFor } = linkerFor(data.settings);
  return computeOutbox({ settings: state, clients: data.clients, appointments: data.appointments }, { date: now.today, min: now.min }, { linkFor });
}

function whenLabel(d, today) {
  const t = fmtTime(d.min);
  if (d.date === today) return `היום, ${t}`;
  if (d.date === addDays(today, -1)) return `אתמול, ${t}`;
  return `${fmtDayMonth(d.date)}, ${t}`;
}

function Bubble({ text }) {
  const parts = String(text).split(/(https?:\/\/\S+)/g);
  return html`<div class="msg-bubble" aria-label="הטקסט שיישלח">${parts.map((p, i) => (/^https?:\/\//.test(p)
    ? html`<bdi class="msg-url" dir="ltr" key=${i}>${p}</bdi>` : p))}</div>`;
}

async function markItem(it, via) {
  const s = getStore();
  const mark = markFor(it, via, new Date().toISOString());
  if (it.target === 'appt') {
    const row = await s.getAppointment(it.markId);
    await s.patchAppointment(it.markId, markPatch(row, it.markKey, mark));
  } else {
    const row = await s.getClient(it.markId);
    await s.patchClient(it.markId, markPatch(row, it.markKey, mark));
  }
}

function Item({ it, kind, today, opened, setOpened }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const asking = !!opened[it.key];
  const prep = kind === 'due' ? manualSender.prepare(it) : null;

  const done = async (via, msg) => {
    if (busy) return;
    setBusy(true);
    try {
      await markItem(it, via);
      setOpened((o) => { const n = { ...o }; delete n[it.key]; return n; });
      toast(msg);
    } catch (err) { toast(err.message); }
    setBusy(false);
  };
  const skip = async () => {
    const ok = await confirmSheet({ title: `לדלג על ההודעה ל${it.clientName}?`, text: 'היא לא תחזור לרשימה.', ok: 'כן, לדלג', cancel: 'חזרה' });
    if (ok) done('skip', 'דילגת על ההודעה');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(it.text); toast('הטקסט הועתק'); } catch { toast('אי אפשר להעתיק מכאן'); }
  };

  const sub = kind === 'later'
    ? (it.held ? `מחכה לצאת השבת או החג, מ-${fmtTime(it.availableAt.min)}` : `מגיעה היום ב-${fmtTime(it.dueAt.min)}`)
    : `הגיעה לשליחה: ${whenLabel(it.dueAt, today)}`;

  return html`<${Card} class="ob-item" data-key=${it.key}>
    <div class="ob-head"><span class="ob-name">${it.clientName}</span><${Tag} tone=${kind === 'blocked' ? 'gold' : 'olive'}>${it.title}</${Tag}></div>
    <p class="ob-sub">${sub}</p>
    ${kind === 'blocked' && html`<${Notice} kind="warn">${it.reason}</${Notice}>`}
    <${TextButton} class="ob-toggle" onClick=${() => setOpen(!open)} aria-expanded=${open ? 'true' : 'false'}>${open ? 'הסתרת הטקסט' : 'הצגת הטקסט'}</${TextButton}>
    ${open && html`<${Bubble} text=${it.text} />`}
    ${kind === 'due' && (asking
      ? html`<p class="ob-ask">נשלחה ההודעה?</p>
        <${Button} onClick=${() => done('manual', 'סומן שנשלחה')} disabled=${busy}>כן, נשלחה</${Button}>
        <${Button} kind="soft" onClick=${() => setOpened((o) => { const n = { ...o }; delete n[it.key]; return n; })}>לא</${Button}>`
      : html`<${Button} href=${prep.href} target="_blank" rel="noopener" icon="whatsapp"
          onClick=${() => setOpened((o) => ({ ...o, [it.key]: 1 }))}>שליחה בוואטסאפ</${Button}>`)}
    ${kind === 'due' && prep.long && html`<${Button} kind="soft" onClick=${copy}>העתקת הטקסט</${Button}>`}
    ${kind !== 'later' && html`<${TextButton} class="ob-skip" onClick=${skip} disabled=${busy}>דילוג</${TextButton}>`}
  </${Card}>`;
}

function Activate({ data, now }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const s = getStore();
      const at = new Date().toISOString();
      const act = activation({ appointments: data.appointments }, { date: now.today, min: now.min }, at);
      for (const m of act.marks) {
        const row = await s.getAppointment(m.apptId);
        if (row) await s.patchAppointment(m.apptId, markPatch(row, m.markKey, m.mark));
      }
      await s.saveSettings(act.settingsPatch);
      toast('ההודעות הופעלו');
    } catch (err) { toast(err.message); }
    setBusy(false);
  };
  return html`<${Notice} kind="warn" title="עוד לא הופעל">
      מרגע ההפעלה, תורים שכבר נקבעו נחשבים כמי שהלקוחות כבר יודעים עליהם. לכאן יגיעו תורים חדשים, שינויים, ביטולים ותזכורות.
    </${Notice}>
    <${Button} onClick=${go} disabled=${busy}>הפעלת ההודעות</${Button}>`;
}

export default function Outbox() {
  const now = useNow();
  const { data } = useData(load, []);
  const [opened, setOpened] = useSessionState('outbox.opened', {});

  return html`<${Page} title="הודעות" em="לשליחה" back backTo="/home">
    ${!data ? html`<${Loader} />` : (() => {
      const r = compute(data, now);
      if (!r.active) return html`<${Activate} data=${data} now=${now} />`;
      const list = (items, kind) => items.map((it) => html`<${Item} key=${it.key} it=${it} kind=${kind} today=${now.today} opened=${opened} setOpened=${setOpened} />`);
      return html`
        <${Notice} kind="info">לוחצים על שליחה בוואטסאפ, הטקסט נפתח מוכן, ושולחים משם.</${Notice}>
        <${Section} title="לשלוח עכשיו" id="due">
          ${r.due.length ? list(r.due, 'due') : html`<${Empty} text="אין הודעות לשליחה עכשיו" />`}
        </${Section}>
        ${r.later.length > 0 && html`<${Section} title="בהמשך היום" id="later">${list(r.later, 'later')}</${Section}>`}
        ${r.notSendable.length > 0 && html`<${Section} title="לא ניתן לשלוח" id="blocked">${list(r.notSendable, 'blocked')}</${Section}>`}`;
    })()}
  </${Page}>`;
}

export function OutboxLine() {
  const now = useNow();
  const { data } = useData(load, []);
  if (!data) return null;
  const n = compute(data, now).due.length;
  if (!n) return null;
  return html`<${Card} href="/outbox" class="ob-line">
    <span class="ob-line-icon" aria-hidden="true"><${Icon} name="whatsapp" size=${24} /></span>
    <span class="ob-line-text">${n === 1 ? 'הודעה אחת מחכה לשליחה' : `${n} הודעות מחכות לשליחה`}</span>
    <${Icon} name="chevronEnd" size=${20} />
  </${Card}>`;
}
