
import { html, useState } from '../../vendor/preact-htm.js';
import {
  Page, Button, TextButton, Field, TextInput, DateInput, Select, Toggle, TextArea, Card, Empty, Loader, toast,
} from '../ui/bits.js';
import { useData } from '../ui/hooks.js';
import { go, replace, back } from '../router.js';
import { getStore } from '../data/store.js';
import { formatPhone } from '../lib/model.js';

const RETURN_OPTIONS = [
  { value: null, label: 'לפי ברירת המחדל' },
  { value: 2, label: 'שבועיים' },
  { value: 3, label: '3 שבועות' },
  { value: 4, label: '4 שבועות' },
  { value: 5, label: '5 שבועות' },
  { value: 6, label: '6 שבועות' },
  { value: 8, label: 'חודשיים' },
  { value: 12, label: '3 חודשים' },
];

function ClientForm({ client }) {
  const isNew = !client;
  const [name, setName] = useState(client ? client.name : '');
  const [phone, setPhone] = useState(client ? formatPhone(client.phone) : '');
  const [email, setEmail] = useState(client ? client.email || '' : '');
  const [birth, setBirth] = useState(client ? client.birthDate || null : null);
  const [callBefore, setCallBefore] = useState(client ? !!client.callBefore : false);
  const [optOut, setOptOut] = useState(client ? !!client.marketingOptOut : false);
  const [weeks, setWeeks] = useState(client ? client.returnWeeks ?? null : null);
  const [notes, setNotes] = useState(client ? client.notes || '' : '');
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    const mail = email.trim().toLowerCase();
    if (mail && !/^\S+@\S+\.\S+$/.test(mail)) {
      setErr({ email: 'כתובת המייל לא תקינה' });
      return;
    }
    setBusy(true);
    setErr({});
    try {
      const saved = await getStore().saveClient({
        ...(client || {}),
        name,
        phone,
        email: mail,
        birthDate: birth || null,
        callBefore,
        marketingOptOut: optOut,
        returnWeeks: weeks,
        notes: notes.trim(),
      });
      toast('נשמר');
      if (isNew) replace('/client/' + saved.id);
      else back('/client/' + saved.id);
    } catch (e) {
      const m = e && e.message ? e.message : 'השמירה נכשלה';
      if (e && e.code === 'duplicate_phone') {
        const who = m.includes(': ') ? m.split(': ').slice(1).join(': ') : '';
        setErr({
          phone: html`<span class="dup-msg">${m}</span>
            <${TextButton} onClick=${() => go('/client/' + e.clientId)}>${'לכרטיס של ' + who}</${TextButton}>`,
        });
      } else if (m.includes('שם')) setErr({ name: m });
      else if (m.includes('טלפון')) setErr({ phone: m });
      else setErr({ form: m });
      setBusy(false);
    }
  };

  const footer = html`<${Button} type="submit" disabled=${busy}>שמירה</${Button}>`;
  const title = isNew ? 'לקוח/ה' : 'עריכת';
  const em = isNew ? 'חדש/ה' : 'לקוח/ה';

  return html`<${Page} title=${title} em=${em} back backTo=${isNew ? '/clients' : '/client/' + client.id}
    onSubmit=${save} footer=${footer}>
    <${Field} label="שם מלא" error=${err.name}>
      <${TextInput} value=${name} onChange=${setName} autocomplete="off" />
    </${Field}>
    <${Field} label="טלפון" error=${err.phone}>
      <${TextInput} type="tel" value=${phone} onChange=${setPhone} inputmode="tel" autocomplete="off" />
    </${Field}>
    <${Field} label="מייל" error=${err.email}>
      <${TextInput} type="email" dir="ltr" value=${email} onChange=${setEmail} inputmode="email" autocomplete="off" autocapitalize="off" />
    </${Field}>
    <${Field} label="תאריך לידה">
      <${DateInput} value=${birth} onChange=${setBirth} />
    </${Field}>
    <${Card}>
      <${Toggle} label="להתקשר לפני התור" hint="למי שלא קורא/ת הודעות. יום לפני התור תופיע תזכורת במסך הבית."
        checked=${callBefore} onChange=${setCallBefore} />
      <${Toggle} label="בלי הודעות פרסום" hint="למי שביקש/ה הסרה. תורים, תזכורות ואישורים ממשיכים להגיע."
        checked=${optOut} onChange=${setOptOut} />
    </${Card}>
    <${Field} label="חוזר/ת בדרך כלל כל">
      <${Select} value=${weeks} onChange=${setWeeks} options=${RETURN_OPTIONS} />
    </${Field}>
    <${Field} label="הערות">
      <${TextArea} value=${notes} onChange=${setNotes} voice rows=${5} />
    </${Field}>
    ${err.form && html`<p class="field-error" role="alert">${err.form}</p>`}
  </${Page}>`;
}

export default function ClientEdit({ params }) {
  const id = params && params.id;
  const { data, loading } = useData(async (s) => (id ? { client: await s.getClient(id) } : { client: null }), [id]);

  if (id && !data) {
    return html`<${Page} title="עריכת" em="לקוח/ה" back backTo="/clients">${loading && html`<${Loader} />`}</${Page}>`;
  }
  if (id && (!data.client || data.client.deletedAt)) {
    return html`<${Page} title="עריכת" em="לקוח/ה" back backTo="/clients">
      <${Empty} text="הלקוח/ה לא נמצא/ה" />
      <${Button} kind="soft" href="/clients">חזרה ללקוחות</${Button}>
    </${Page}>`;
  }
  return html`<${ClientForm} key=${id || 'new'} client=${id ? data.client : null} />`;
}
