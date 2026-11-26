
import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Sheet, Button, Field, TextInput, Notice, List, IconButton, Money, toast } from '../ui/bits.js';
import { getStore } from '../data/store.js';
import { GROW_PATH, cleanInvoiceNo, invoiceLines } from '../lib/invoices.js';

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(String(text));
    toast('הועתק');
  } catch {
    toast('אי אפשר להעתיק מכאן');
  }
};

export function InvoiceSheet({ appt, nameOf, onClose }) {
  const [no, setNo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(appt);
  const open = !!appt;
  const id = appt && appt.id;
  const cur = appt || last;

  useEffect(() => { if (appt) setLast(appt); setNo(''); setErr(''); setBusy(false); }, [id]);

  const save = async () => {
    if (busy) return;
    const { value, error } = cleanInvoiceNo(no);
    if (error) { setErr(error); return; }
    setBusy(true);
    setErr('');
    try {
      await getStore().setInvoiceNo(cur.id, value);
      toast('מספר החשבונית נשמר');
      onClose();
    } catch (e) {
      setErr((e && e.message) || 'משהו השתבש, אפשר לנסות שוב');
    }
    setBusy(false);
  };

  const footer = html`<${Button} disabled=${!no.trim() || busy} onClick=${save}>שמירה</${Button}>`;

  return html`<${Sheet} open=${open} onClose=${onClose} title="חשבונית להפקה" footer=${footer} class="inv-sheet">
    ${cur && html`
      <${Notice} icon="coin" title="בגרואו, במחשב:">${GROW_PATH.join(' ⇐ ')}</${Notice}>
      <${List} class="inv-lines">
        ${invoiceLines(cur, nameOf ? nameOf(cur.clientId) : '').map((l) => html`<div class="row inv-line" key=${l.key}>
          <span class="row-main">
            <span class="row-sub">${l.label}</span>
            <span class="row-title">${l.money ? html`<${Money} value=${l.value} />` : l.value}</span>
          </span>
          <span class="row-end">
            ${l.price != null && html`<${Money} value=${l.price} />`}
            <${IconButton} icon="copy" label=${'העתקה: ' + l.label} onClick=${() => copyText(l.copy)} />
          </span>
        </div>`)}
      </${List}>
      <${Field} label="מספר החשבונית" hint="המספר של המסמך שהפקת בגרואו" error=${err}>
        <${TextInput} value=${no} onChange=${(v) => { setNo(v); if (err) setErr(''); }} inputmode="numeric" autocomplete="off" enterkeyhint="done" />
      </${Field}>`}
  </${Sheet}>`;
}
