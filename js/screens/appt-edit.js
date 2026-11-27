
import { html, useState, useMemo, useRef } from '../../vendor/preact-htm.js';
import {
  Page, Button, TextButton, IconButton, Chip, Chips, Segmented, Dot, Money, Card, List, Row, Empty, Loader,
  Field, TextInput, NumberInput, TextArea, Select, DateInput, Notice, Sheet, toast, confirmSheet,
} from '../ui/bits.js';
import { useData } from '../ui/hooks.js';
import { go, replace, back } from '../router.js';
import { getStore } from '../data/store.js';
import {
  addDays, dow, DAY_NAMES, fmtDuration, fmtTime, isYmd, nowMin, timeOptions, todayYmd,
} from '../lib/time.js';
import {
  apptTotal, findConflicts, formatPhone, itemsDuration, lastNextStep, returnWeeksOf, validateAppointment, FOR_MAX,
} from '../lib/model.js';
import { expandBlocks } from '../lib/recur.js';

const RETURN_CHIPS = [
  [14, 'בעוד שבועיים'], [21, 'בעוד 3 שבועות'], [28, 'בעוד חודש'],
  [35, 'בעוד 5 שבועות'], [42, 'בעוד חודש וחצי'], [56, 'בעוד חודשיים'],
];

const withCurrent = (list, current) => (current == null || list.includes(current)
  ? list
  : [...list, current].sort((a, b) => a - b));

function searchClients(clients, q) {
  const text = q.trim().toLowerCase();
  if (!text) return [];
  const digits = text.replace(/\D/g, '');
  return clients.filter((c) => {
    if (c.name.toLowerCase().includes(text)) return true;
    if (!digits) return false;
    const intl = String(c.phone || '').replace(/\D/g, '');
    const local = intl.startsWith('972') ? '0' + intl.slice(3) : intl;
    return local.includes(digits) || intl.includes(digits);
  }).slice(0, 6);
}

function defaultStart(date) {
  if (date === todayYmd()) {
    const n = Math.ceil((nowMin() + 1) / 15) * 15;
    if (n >= 540 && n < 1080) return n;
  }
  return 540;
}

export default function ApptEdit({ params, query }) {
  const id = params && params.id;
  const { data, error } = useData(async (s) => {
    const [settings, services, clients, appts, appt] = await Promise.all([
      s.getSettings(),
      s.listServices({ includeInactive: true }),
      s.listClients(),
      s.listAppointments({ includeCancelled: true }),
      id ? s.getAppointment(id) : Promise.resolve(null),
    ]);
    return { settings, services, clients, appts, appt };
  }, [id]);

  const title = id ? 'עריכת' : 'תור';
  const em = id ? 'תור' : 'חדש';
  const backTo = id ? '/appt/' + id : '/cal';

  if (error && !data) {
    return html`<${Page} title=${title} em=${em} back=${backTo}>
      <${Notice} kind="danger">לא הצלחנו לטעון את הנתונים</${Notice}>
      <${Button} kind="soft" onClick=${() => back(backTo)}>חזרה</${Button}>
    </${Page}>`;
  }
  if (!data) return html`<${Page} title=${title} em=${em} back=${backTo}><${Loader} /></${Page}>`;

  if (id && (!data.appt || data.appt.status === 'paid' || data.appt.status === 'cancelled')) {
    return html`<${Page} title=${title} em=${em} back=${backTo}>
      <${Notice} kind="info">${data.appt ? 'אי אפשר לערוך תור ששולם או בוטל' : 'התור לא נמצא'}</${Notice}>
      <${Button} kind="soft" onClick=${() => back(backTo)}>חזרה</${Button}>
    </${Page}>`;
  }

  return html`<${ApptForm} key=${id || 'new'} id=${id} query=${query || {}} data=${data} backTo=${backTo} />`;
}

function ApptForm({ id, query, data, backTo }) {
  const { settings, services, clients, appts, appt } = data;
  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const init = useRef(null);
  if (!init.current) {
    if (appt) {
      init.current = {
        clientId: appt.clientId, items: appt.items.map((it) => ({ ...it })), date: appt.date, startMin: appt.startMin,
        durationMin: appt.durationMin, durManual: appt.durationMin !== itemsDuration(appt.items), note: appt.note || '', forName: appt.forName || '', chip: null,
      };
    } else {
      const next = query.next === '1';
      const today = todayYmd();
      const client = query.client && clientsById.get(query.client) ? query.client : null;
      let date = isYmd(query.date) ? query.date : today;
      let chip = null;
      if (next) {
        const days = returnWeeksOf(client ? clientsById.get(client) : null, settings) * 7;
        if (!isYmd(query.date)) date = addDays(today, days);
        if (RETURN_CHIPS.some(([d]) => d === days) && date === addDays(today, days)) chip = days;
      }
      const minRaw = query.min !== undefined && query.min !== '' ? Number(query.min) : NaN;
      const startMin = Number.isFinite(minRaw) && minRaw >= 0 && minRaw < 1440 ? Math.round(minRaw) : defaultStart(date);
      const svc = query.service ? services.find((x) => x.id === query.service) : null;
      const items = svc ? [itemOf(svc)] : [];
      init.current = {
        clientId: client, items, date, startMin, durationMin: itemsDuration(items) || 60, durManual: false, note: '', forName: '', chip,
      };
    }
  }
  const i0 = init.current;

  const [clientId, setClientId] = useState(i0.clientId);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newErr, setNewErr] = useState(null);
  const [items, setItems] = useState(i0.items);
  const [date, setDate] = useState(i0.date);
  const [chip, setChip] = useState(i0.chip);
  const [startMin, setStartMin] = useState(i0.startMin);
  const [durationMin, setDurationMin] = useState(i0.durationMin);
  const [durManual, setDurManual] = useState(i0.durManual);
  const [note, setNote] = useState(i0.note);
  const [forName, setForName] = useState(i0.forName);
  const [picker, setPicker] = useState(false);
  const [pq, setPq] = useState('');
  const [tried, setTried] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const busy = useRef(false);

  const client = clientId ? clientsById.get(clientId) : null;

  function itemOf(svc) {
    return {
      serviceId: svc.id, name: svc.name, shortName: svc.shortName, color: svc.color,
      price: svc.price, listPrice: svc.price, durationMin: svc.durationMin,
      ...(svc.travelMin ? { travelMin: svc.travelMin } : {}),
    };
  }

  function changeItems(next) {
    setItems(next);
    if (!durManual) {
      const sum = itemsDuration(next);
      if (sum > 0) setDurationMin(sum);
    }
  }

  const patchItem = (i, patch) => changeItems(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));

  const matches = useMemo(() => searchClients(clients, q), [clients, q]);
  const nextStep = useMemo(
    () => (clientId ? lastNextStep(appts.filter((a) => a.clientId === clientId), todayYmd()) : null),
    [appts, clientId],
  );
  const dupClient = newErr && newErr.clientId ? clientsById.get(newErr.clientId) : null;

  function pickClient(cid) {
    setClientId(cid);
    setQ('');
    setAdding(false);
    setNewErr(null);
  }

  async function addClient() {
    setNewErr(null);
    try {
      const c = await getStore().saveClient({ name: newName, phone: newPhone });
      pickClient(c.id);
      setNewName('');
      setNewPhone('');
    } catch (e) {
      setNewErr({ message: e.message, clientId: e.code === 'duplicate_phone' ? e.clientId : null, field: e.message === 'חסר שם' ? 'name' : 'phone' });
    }
  }

  const groups = useMemo(() => {
    const t = pq.trim().toLowerCase();
    const list = services.filter((s) => s.active && (s.kind === 'treatment' || s.kind === 'series')
      && (!t || s.name.toLowerCase().includes(t) || String(s.shortName || '').toLowerCase().includes(t)));
    const order = [...(settings.categories || [])];
    list.forEach((s) => { if (!order.includes(s.category)) order.push(s.category); });
    return order.map((cat) => ({ cat, list: list.filter((s) => s.category === cat) })).filter((g) => g.list.length);
  }, [services, settings, pq]);

  function addService(svc) {
    changeItems([...items, itemOf(svc)]);
    setPicker(false);
    setPq('');
  }

  const total = apptTotal({ items: items.map((it) => ({ ...it, price: Number(it.price) || 0 })) });
  const endMin = startMin + durationMin;
  const startOpts = withCurrent(timeOptions(settings.dayStartMin, settings.dayEndMin, 15), startMin)
    .map((m) => ({ value: m, label: fmtTime(m) }));
  const durOpts = (cur) => withCurrent(timeOptions(15, 301, 15), cur).map((m) => ({ value: m, label: fmtDuration(m) }));

  const errors = [];
  if (tried) {
    errors.push(...validateAppointment({ clientId, items, durationMin, startMin }));
    if (!isYmd(date)) errors.push('חסר תאריך');
  }
  if (saveErr) errors.push(saveErr);

  async function save() {
    setTried(true);
    setSaveErr('');
    if (validateAppointment({ clientId, items, durationMin, startMin }).length || !isYmd(date)) return;
    if (busy.current) return;
    busy.current = true;
    try {
      const s = getStore();
      const [dayAppts, blocks] = await Promise.all([s.listAppointments({ from: date, to: date }), s.listBlocks()]);
      const cand = { date, startMin, durationMin, items };
      const found = findConflicts(cand, dayAppts, expandBlocks(blocks, date, date), { ignoreApptId: id, bufferMin: settings.bufferMin });
      if (found.length) {
        const real = found.some((c) => c.type !== 'buffer');
        const lines = found.map((c) => {
          const name = c.type === 'block' ? c.ref.title : (clientsById.get(c.ref.clientId) || {}).name || 'תור';
          return `${fmtTime(c.startMin)} עד ${fmtTime(c.startMin + c.durationMin)} · ${name}${c.travel ? ' · כולל נסיעה' : ''}${real && c.type === 'buffer' ? ' · בלי זמן ניקיון' : ''}`;
        });
        const ok = await confirmSheet({
          title: real ? 'השעה הזאת תפוסה' : 'אין זמן ניקיון בין התורים',
          lines, ok: 'לקבוע בכל זאת', cancel: 'חזרה',
        });
        if (!ok) return;
      }
      const cleanItems = items.map((it) => ({ ...it, price: Number(it.price) || 0 }));
      const rec = { ...(appt || {}), clientId, date, startMin, durationMin, items: cleanItems, note: note.trim(), forName: forName.replace(/\s+/g, ' ').trim() };
      await s.saveAppointment(rec);
      if (id) { toast('התור עודכן'); back('/appt/' + id); }
      else { toast('התור נשמר'); replace('/cal/week/' + date + '?at=' + startMin); }
    } catch (e) {
      setSaveErr(e.message || 'השמירה לא הצליחה');
    } finally {
      busy.current = false;
    }
  }

  const switchKind = !id && html`<${Segmented} label="סוג" value="appt"
    options=${[{ value: 'appt', label: 'תור' }, { value: 'block', label: 'אירוע' }]}
    onChange=${() => replace(`/block/new?date=${date}&min=${startMin}`)} />`;

  const clientField = html`<${Field} label="לקוח/ה">
    ${client ? html`
      <${Card} class="client-pick">
        <div class="client-pick-main">
          <span class="row-title">${client.name}</span>
          <span class="row-sub">${formatPhone(client.phone)}</span>
        </div>
        <${TextButton} onClick=${() => setClientId(null)}>החלפה</${TextButton}>
      </${Card}>
      ${nextStep && html`<${Notice} class="is-usertext">מהביקור הקודם: ${nextStep.text}</${Notice}>`}
    ` : html`
      <${TextInput} icon="search" value=${q} onChange=${setQ} placeholder="חיפוש לפי שם או טלפון" autocomplete="off" />
      ${q.trim() && (matches.length
        ? html`<${List}>${matches.map((c) => html`<${Row} key=${c.id} title=${c.name}
            sub=${formatPhone(c.phone)} onClick=${() => pickClient(c.id)} />`)}</${List}>`
        : html`<${Empty} text="לא נמצאו לקוחות" />`)}
      ${!adding && html`<div class="form-link"><${TextButton} onClick=${() => setAdding(true)}>+ לקוח/ה חדש/ה</${TextButton}></div>`}
      ${adding && html`<${Card} class="mini-client">
        <${Field} label="שם מלא" error=${newErr && newErr.field === 'name' ? newErr.message : null}>
          <${TextInput} value=${newName} onChange=${setNewName} autocomplete="off" />
        </${Field}>
        <${Field} label="טלפון" error=${newErr && newErr.field === 'phone' ? newErr.message : null}>
          <${TextInput} type="tel" value=${newPhone} onChange=${setNewPhone} autocomplete="off" />
        </${Field}>
        ${dupClient && html`<${Button} kind="soft" onClick=${() => pickClient(dupClient.id)}>לבחור את ${dupClient.name}</${Button}>`}
        <${Button} onClick=${addClient}>הוספה</${Button}>
      </${Card}>`}
    `}
  </${Field}>`;

  const itemsField = html`<${Field} label="טיפול">
    ${items.map((it, i) => html`<${Card} key=${i} class="item-card">
      <div class="item-head">
        <${Dot} color=${it.color} />
        <span class="item-name">${it.name}</span>
        <${IconButton} icon="close" label="הסרת הטיפול" kind="plain" onClick=${() => changeItems(items.filter((_, k) => k !== i))} />
      </div>
      <div class="form-pair">
        <${Field} label="מחיר">
          <${NumberInput} value=${it.price} suffix="₪" onChange=${(v) => patchItem(i, { price: v })} />
          ${it.listPrice != null && (Number(it.price) || 0) !== Number(it.listPrice)
            && html`<p class="small-hint">מחיר מחירון ${it.listPrice} ₪</p>`}
        </${Field}>
        <${Field} label="משך">
          <${Select} value=${it.durationMin} options=${durOpts(it.durationMin)} onChange=${(v) => patchItem(i, { durationMin: v })} />
        </${Field}>
      </div>
    </${Card}>`)}
    <${Button} kind="soft" icon="plus" onClick=${() => setPicker(true)}>הוספת טיפול</${Button}>
  </${Field}>`;

  const dateField = html`<${Field} label=${'תאריך' + (isYmd(date) ? ' · יום ' + DAY_NAMES[dow(date)] : '')}>
    ${query.next === '1' && !id && html`<${Chips}>${RETURN_CHIPS.map(([days, label]) => html`<${Chip} key=${days} active=${chip === days}
      onClick=${() => { setChip(days); setDate(addDays(todayYmd(), days)); }}>${label}</${Chip}>`)}</${Chips}>`}
    <${DateInput} value=${date} onChange=${(v) => { setDate(v); setChip(null); }} />
  </${Field}>`;

  const timeFields = html`<div class="form-pair">
    <${Field} label="שעת התחלה"><${Select} value=${startMin} options=${startOpts} onChange=${setStartMin} /></${Field}>
    <${Field} label="משך" hint=${'עד ' + fmtTime(endMin)}>
      <${Select} value=${durationMin} options=${durOpts(durationMin)} onChange=${(v) => { setDurationMin(v); setDurManual(true); }} />
    </${Field}>
  </div>`;

  const footer = html`
    ${errors.length > 0 && html`<${Notice} kind="danger">${errors.join(' · ')}</${Notice}>`}
    <p class="summary">סה"כ <${Money} value=${total} /> · ${fmtDuration(durationMin)} · עד ${fmtTime(endMin)}</p>
    <${Button} type="submit">שמירה</${Button}>`;

  return html`<${Page} title=${id ? 'עריכת' : 'תור'} em=${id ? 'תור' : 'חדש'} back=${backTo} onSubmit=${save} footer=${footer}>
    ${switchKind}
    ${clientField}
    ${client && html`<${Field} label="עבור" hint="רק כשהטיפול בשביל מישהו אחר, למשל הבת או האמא.">
      <${TextInput} value=${forName} onChange=${setForName} maxlength=${FOR_MAX} autocomplete="off" placeholder="שם מלא" />
    </${Field}>`}
    ${itemsField}
    ${dateField}
    ${timeFields}
    <${Field} label="הערה"><${TextArea} value=${note} onChange=${setNote} voice rows=${4} /></${Field}>

    <${Sheet} open=${picker} onClose=${() => { setPicker(false); setPq(''); }} title="בחירת טיפול">
      <${TextInput} icon="search" value=${pq} onChange=${setPq} placeholder="חיפוש טיפול" autocomplete="off" />
      ${groups.length === 0 && html`<${Empty} text="לא נמצאו טיפולים" />`}
      ${groups.map((g) => html`<div class="pick-group" key=${g.cat}>
        <h3>${g.cat}</h3>
        <${List}>${g.list.map((s) => html`<${Row} key=${s.id} start=${html`<${Dot} color=${s.color} />`} title=${s.name}
          sub=${fmtDuration(s.durationMin)} right=${html`<${Money} value=${s.price} />`} onClick=${() => addService(s)} />`)}</${List}>
      </div>`)}
    </${Sheet}>
  </${Page}>`;
}
