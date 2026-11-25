
import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import {
  Page, Section, Card, Button, TextButton, TextInput, IconButton, Chip, Chips, Notice, Empty, Loader, Sheet, Field, NumberInput, TextArea,
  StatusBadge, Tag, Dot, Money, Toggle, Select, fmtMoney, toast, askSheet, confirmSheet,
} from '../ui/bits.js';
import { Icon } from '../ui/icons.js';
import { useData } from '../ui/hooks.js';
import { back as routerBack, go, afterPendingPop } from '../router.js';
import { getStore } from '../data/store.js';
import {
  STATUS, CANCELLED_BY, FREE_REASONS, apptTotal, apptDiscount, apptEnd, findConflicts, formatPhone, callReminderOn, callDaysOf, callDate,
} from '../lib/model.js';
import { expandBlocks } from '../lib/recur.js';
import { fmtDateLong, fmtTime, fmtDuration, todayYmd } from '../lib/time.js';

const FALLBACK = '/cal';
const CHIP_STATUSES = ['booked', 'confirmed', 'arrived', 'noshow'];
const CALL_DAYS = [{ value: 1, label: 'יום לפני' }, { value: 2, label: 'יומיים לפני' }, { value: 3, label: '3 ימים לפני' }, { value: 4, label: '4 ימים לפני' }];

const nextApptPath = (a) => {
  const first = a.items && a.items[0];
  return `/appt/new?client=${a.clientId}${first && first.serviceId ? '&service=' + first.serviceId : ''}&min=${a.startMin}&next=1`;
};

const settle = async () => {
  await new Promise((r) => setTimeout(r, 80));
  await new Promise((r) => afterPendingPop(r));
};

const errText = (e) => (e && e.message) || 'משהו השתבש, אפשר לנסות שוב';

async function confirmRestore(a) {
  const s = getStore();
  const [settings, appts, blocks, clients] = await Promise.all([
    s.getSettings(), s.listAppointments({ from: a.date, to: a.date }), s.listBlocks(), s.listClients(),
  ]);
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const found = findConflicts(
    { date: a.date, startMin: a.startMin, durationMin: a.durationMin, items: a.items },
    appts, expandBlocks(blocks, a.date, a.date),
    { ignoreApptId: a.id, bufferMin: settings.bufferMin },
  );
  if (!found.length) return true;
  const hard = found.some((f) => f.type !== 'buffer');
  const lines = found.map((f) => {
    const who = f.type === 'block' ? f.ref.title : names.get(f.ref.clientId) || 'תור';
    const base = `${fmtTime(f.startMin)} עד ${fmtTime(f.startMin + f.durationMin)} · ${who}${f.travel ? ' · כולל נסיעה' : ''}`;
    return hard && f.type === 'buffer' ? `${base} · בלי זמן ניקיון` : base;
  });
  const pick = await askSheet({
    title: hard ? 'השעה הזאת תפוסה' : 'אין זמן ניקיון בין התורים',
    lines,
    choices: [{ value: true, label: 'לקבוע בכל זאת', kind: 'primary' }, { value: false, label: 'חזרה', kind: 'soft' }],
  });
  return pick === true;
}

function TillSheet({ open, appt, methods, onClose }) {
  const [method, setMethod] = useState(null);
  const [tip, setTip] = useState(null);
  const [view, setView] = useState('till'); // till | free | done
  const [doneKind, setDoneKind] = useState('paid');
  const [reason, setReason] = useState(null);
  const [fnote, setFnote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setMethod(null); setTip(null); setView('till'); setReason(null); setFnote(''); setErr(''); setBusy(false); }
  }, [open]);

  const pay = async () => {
    if (!method || busy) return;
    setBusy(true);
    try {
      await getStore().payAppointment(appt.id, { method, tip: tip || 0 });
      setDoneKind('paid');
      setView('done');
    } catch (e) {
      toast(errText(e));
    }
    setBusy(false);
  };

  const closeFree = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setErr('');
    try {
      await getStore().closeFree(appt.id, { kind: reason, note: fnote.trim() });
      setDoneKind('free');
      setView('done');
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  };

  const canFree = reason && (reason !== 'other' || fnote.trim());
  let footer = null;
  if (view === 'till') footer = html`<${Button} disabled=${!method || busy} onClick=${pay}>שולם</${Button}>`;
  if (view === 'free') {
    footer = html`<${Button} disabled=${!canFree || busy} onClick=${closeFree}>סגירה</${Button}>
      <${Button} kind="soft" onClick=${() => { setErr(''); setView('till'); }}>חזרה</${Button}>`;
  }

  const title = view === 'free' ? 'סגירה ללא תשלום' : 'לקופה';

  return html`<${Sheet} open=${open} onClose=${onClose} title=${title} footer=${footer}>
    ${view === 'done' && html`<div class="till-done">
      <${Notice} icon="check" title=${doneKind === 'free' ? 'נסגר ללא תשלום' : 'נרשם ששולם'} />
      <${Button} onClick=${() => { onClose(); go(nextApptPath(appt)); }}>לקבוע את התור הבא</${Button}>
      <${Button} kind="soft" onClick=${onClose}>סיום</${Button}>
    </div>`}
    ${view === 'till' && html`
      <div class="till-lines">
        ${(appt.items || []).map((it) => html`<div class="ac-item">
          <${Dot} color=${it.color} />
          <span class="ac-item-name">${it.name}</span>
          <${Money} value=${it.price} />
        </div>`)}
      </div>
      <div class="till-total"><span>סה"כ</span><${Money} value=${apptTotal(appt)} /></div>
      <${Field} label="אמצעי תשלום">
        <${Chips}>${methods.map((m) => html`<${Chip} key=${m} active=${method === m} onClick=${() => setMethod(m)}>${m}</${Chip}>`)}</${Chips}>
      </${Field}>
      <${Field} label="טיפ">
        <${NumberInput} value=${tip} onChange=${setTip} suffix="₪" placeholder="לא חובה" />
      </${Field}>
      ${!appt.everPaid && html`<${TextButton} class="till-free" onClick=${() => setView('free')}>סגירה ללא תשלום</${TextButton}>`}`}
    ${view === 'free' && html`
      ${err && html`<${Notice} kind="danger">${err}</${Notice}>`}
      <${Field} label="סיבה">
        <${Chips}>${Object.entries(FREE_REASONS).map(([k, l]) => html`<${Chip} key=${k} active=${reason === k} onClick=${() => setReason(k)}>${l}</${Chip}>`)}</${Chips}>
      </${Field}>
      <${Field} label="הערה" hint=${reason === 'other' ? 'חובה לכתוב מה הסיבה' : undefined}>
        <${TextInput} value=${fnote} onChange=${setFnote} />
      </${Field}>`}
  </${Sheet}>`;
}

function CancelSheet({ open, busy, onClose, onSubmit }) {
  const [who, setWho] = useState(null);
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) { setWho(null); setReason(''); } }, [open]);
  const footer = html`<${Button} disabled=${!who || busy} onClick=${() => onSubmit(who, reason)}>ביטול התור</${Button}>
    <${Button} kind="soft" onClick=${onClose}>חזרה</${Button}>`;
  return html`<${Sheet} open=${open} onClose=${onClose} title="ביטול התור" footer=${footer}>
    <${Field} label="מי ביטל/ה?">
      <${Chips}>
        <${Chip} active=${who === 'client'} onClick=${() => setWho('client')}>הלקוח/ה</${Chip}>
        <${Chip} active=${who === 'owner'} onClick=${() => setWho('owner')}>אני</${Chip}>
      </${Chips}>
    </${Field}>
    <${Field} label="הסיבה" hint="לא חובה">
      <${TextArea} voice rows=${2} value=${reason} onChange=${setReason} />
    </${Field}>
  </${Sheet}>`;
}

export default function ApptCard({ params }) {
  const { data, loading } = useData(async (s) => {
    const appt = await s.getAppointment(params.id);
    if (!appt) return { appt: null };
    const [client, settings] = await Promise.all([s.getClient(appt.clientId), s.getSettings()]);
    return { appt, client, settings };
  }, [params.id]);

  const [tillOpen, setTillOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [visitNote, setVisitNote] = useState('');
  const [nextStep, setNextStep] = useState('');
  const inited = useRef(null);

  const appt = data && data.appt;

  useEffect(() => {
    if (appt && inited.current !== appt.id) {
      inited.current = appt.id;
      setVisitNote(appt.visitNote || '');
      setNextStep(appt.nextStep || '');
    }
  }, [appt && appt.id]);

  const dirty = !!appt && inited.current === appt.id
    && (visitNote !== (appt.visitNote || '') || nextStep !== (appt.nextStep || ''));

  const gone = useRef(false);
  const guard = useRef({ on: false, dropping: false });
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => () => { gone.current = true; }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const g = guard.current;
    const push = () => { history.pushState({ ...(history.state || {}), sheet: undefined, guard: 1 }, ''); g.on = true; };
    push();
    const onPop = async () => {
      if (g.dropping || !g.on) return;
      if (history.state && history.state.guard) return; // נסגרה חלונית שישבה מעל
      g.on = false;
      const leave = await confirmSheet({ title: 'לצאת בלי לשמור את ההערה?', ok: 'לצאת', cancel: 'להישאר', danger: true });
      await settle();
      if (leave) routerBack(FALLBACK); else push();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!gone.current && g.on && history.state && history.state.guard) { g.on = false; history.back(); }
    };
  }, [dirty]);

  const dropGuard = () => new Promise((resolve) => {
    const g = guard.current;
    if (!g.on || !(history.state && history.state.guard)) { resolve(); return; }
    g.on = false;
    g.dropping = true;
    const fin = () => { window.removeEventListener('popstate', fin); g.dropping = false; resolve(); };
    window.addEventListener('popstate', fin);
    setTimeout(fin, 400);
    history.back();
  });

  const leaveThen = async (fn) => {
    if (dirtyRef.current) {
      const ok = await confirmSheet({ title: 'לצאת בלי לשמור את ההערה?', ok: 'לצאת', cancel: 'להישאר', danger: true });
      if (!ok) return;
      await new Promise((r) => setTimeout(r, 80));
      await new Promise((r) => afterPendingPop(r));
      await dropGuard();
    }
    fn();
  };
  const link = (path) => (e) => { e.preventDefault(); leaveThen(() => go(path)); };

  const act = async (fn, okText) => {
    try {
      await fn();
      if (okText) toast(okText);
    } catch (e) { toast(errText(e)); }
  };
  const setStatus = (st) => act(() => getStore().setAppointmentStatus(appt.id, st));
  const approve = () => act(() => getStore().setAppointmentStatus(appt.id, 'booked'), 'התור אושר');
  const called = () => act(() => getStore().patchAppointment(appt.id, { calledAt: new Date().toISOString() }));
  const setCall = (patch) => act(() => getStore().patchAppointment(appt.id, patch), 'נשמר');

  const cancel = async (who, reason) => {
    if (!who || cancelBusy) return;
    setCancelBusy(true);
    try {
      await getStore().setAppointmentStatus(appt.id, 'cancelled', { cancelledBy: who, reason });
    } catch (e) { toast(errText(e)); setCancelBusy(false); return; }
    setCancelBusy(false);
    setCancelOpen(false);
    toast('התור בוטל');
    await settle();
    leaveThen(() => routerBack(FALLBACK));
  };

  const restore = async () => {
    if (!(await confirmRestore(appt))) return;
    act(() => getStore().setAppointmentStatus(appt.id, 'booked'), 'התור הוחזר ליומן');
  };

  const reopen = async () => {
    const ok = await confirmSheet({ title: 'לפתוח את התור מחדש?', ok: 'פתיחה מחדש', cancel: 'חזרה', danger: true });
    if (ok) act(() => getStore().reopenFree(appt.id), 'התור נפתח מחדש');
  };

  const unpay = async () => {
    const ok = await confirmSheet({ title: 'לבטל את רישום התשלום?', ok: 'ביטול התשלום', cancel: 'חזרה', danger: true });
    if (ok) act(() => getStore().unpayAppointment(appt.id), 'התשלום בוטל');
  };

  const saveNote = () => act(() => getStore().patchAppointment(appt.id, { visitNote, nextStep }), 'ההערה נשמרה');

  const head = { title: 'פרטי', em: 'התור', back: true, backTo: FALLBACK };

  if (loading && !data) return html`<${Page} ...${head}><${Loader} /></${Page}>`;
  if (!appt) {
    return html`<${Page} ...${head}>
      <${Empty} text="התור לא נמצא" />
      <${Button} kind="soft" onClick=${() => routerBack(FALLBACK)}>חזרה</${Button}>
    </${Page}>`;
  }

  const { client, settings } = data;
  const st = appt.status;
  const cancelled = st === 'cancelled';
  const paid = st === 'paid';
  const free = st === 'free';
  const open = !cancelled && !paid && !free;
  const callOn = callReminderOn(appt, client);
  const discount = apptDiscount(appt);
  const phone = client && client.phone;
  const digits = String(phone || '').replace(/\D/g, '');
  const p = appt.payment;

  return html`<${Page} ...${head} onBack=${() => leaveThen(() => routerBack(FALLBACK))}>
    <${Card}>
      ${client
        ? html`<a class="ac-name" href=${'#/client/' + client.id} onClick=${link('/client/' + client.id)}>
          <span class="ac-name-text">${client.name}</span>
          <span class="ac-name-chev" aria-hidden="true"><${Icon} name="chevronEnd" size=${20} /></span>
        </a>`
        : html`<span class="ac-name">לקוח/ה שנמחק/ה</span>`}
      ${phone && html`<div class="ac-phone">
        <span class="ac-phone-num" dir="ltr">${formatPhone(phone)}</span>
        <${IconButton} icon="phone" label="חיוג" href=${'tel:' + phone} />
        <${IconButton} icon="whatsapp" label="וואטסאפ" href=${'https://wa.me/' + digits} target="_blank" rel="noopener" />
      </div>`}
      <div class="ac-when">
        <span class="ac-when-day">${fmtDateLong(appt.date)}</span>
        <span class="ac-when-time">${fmtTime(appt.startMin)} עד ${fmtTime(apptEnd(appt))} · ${fmtDuration(appt.durationMin)}</span>
      </div>
      <div class="ac-items">
        ${(appt.items || []).map((it, i) => html`<div class="ac-item" key=${i}>
          <${Dot} color=${it.color} />
          <span class="ac-item-name">${it.name}</span>
          <${Money} value=${it.price} />
        </div>`)}
      </div>
      <div class="ac-total"><span>סה"כ</span><${Money} value=${apptTotal(appt)} /></div>
      ${discount > 0 && html`<div class="ac-sub-line"><span>הנחה ${fmtMoney(discount)}</span></div>`}
      <div class="ac-badges">
        <${StatusBadge} status=${st} />
        ${appt.source === 'online' && html`<${Tag}>נקבע באתר</${Tag}>`}
      </div>
      ${appt.note && html`<p class="ac-note is-usertext">${appt.note}</p>`}
      ${cancelled && html`<p class="ac-note">בוטל על ידי ${CANCELLED_BY[appt.cancelledBy] || 'לא ידוע'}</p>`}
      ${cancelled && appt.cancelReason && html`<p class="ac-note is-usertext">הסיבה: ${appt.cancelReason}</p>`}
    </${Card}>

    ${open && appt.date >= todayYmd() && html`<${Card} class=${callOn && !appt.calledAt ? 'ac-call is-due' : 'ac-call'}>
      <${Toggle} label="להתקשר לתזכורת" hint="במקום התזכורות בוואטסאפ, תופיע לך תזכורת להתקשר במסך הבית."
        checked=${callOn} onChange=${(v) => setCall({ callReminder: v })} />
      ${callOn && html`<${Field} label="מתי להתקשר" hint=${'התזכורת תופיע ב' + fmtDateLong(callDate(appt))}>
        <${Select} value=${callDaysOf(appt)} onChange=${(v) => setCall({ callDaysBefore: v })} options=${CALL_DAYS} />
      </${Field}>`}
      ${callOn && (appt.calledAt
        ? html`<p class="ac-note">סומן שהתקשרת</p>`
        : html`<${Button} kind="soft" class="ac-callbtn" icon="phone" onClick=${called}>התקשרתי</${Button}>`)}
    </${Card}>`}

    ${st === 'pending' && html`<${Button} onClick=${approve}>אישור התור</${Button}>`}

    ${open && html`<div class="ac-actions">
      <${Chips}>${CHIP_STATUSES.map((k) => html`<${Chip} key=${k} active=${st === k} onClick=${() => st !== k && setStatus(k)}>${STATUS[k].label}</${Chip}>`)}</${Chips}>
      <${Button} onClick=${() => setTillOpen(true)}>לקופה</${Button}>
      <${Button} kind="soft" href=${'/appt/' + appt.id + '/edit'} onClick=${link('/appt/' + appt.id + '/edit')}>עריכה</${Button}>
      <${Button} kind="danger" onClick=${() => setCancelOpen(true)}>ביטול התור</${Button}>
    </div>`}

    ${paid && html`<div class="ac-actions">
      <p class="ac-paid">שולם · ${p ? p.method : ''} · ${fmtMoney(p ? p.amount : apptTotal(appt))}${p && p.tip > 0 ? ' · טיפ ' + fmtMoney(p.tip) : ''}</p>
      <${Button} kind="soft" href=${nextApptPath(appt)} onClick=${link(nextApptPath(appt))}>לקבוע את התור הבא</${Button}>
      <${Button} kind="danger" onClick=${unpay}>ביטול התשלום</${Button}>
    </div>`}

    ${free && html`<div class="ac-actions">
      <p class="ac-paid">נסגר ללא תשלום · ${(appt.freeReason && FREE_REASONS[appt.freeReason.kind]) || ''}</p>
      ${appt.freeReason && appt.freeReason.note && html`<p class="ac-note is-usertext">${appt.freeReason.note}</p>`}
      <${Button} kind="soft" href=${nextApptPath(appt)} onClick=${link(nextApptPath(appt))}>לקבוע את התור הבא</${Button}>
      <${Button} kind="danger" onClick=${reopen}>פתיחה מחדש</${Button}>
    </div>`}

    ${cancelled && html`<${Button} kind="soft" onClick=${restore}>החזרת התור ליומן</${Button}>`}

    ${!cancelled && html`<${Section} title="הערת טיפול">
      <div class="ac-notes">
        <${TextArea} voice rows=${5} value=${visitNote} onChange=${setVisitNote} aria-label="הערת טיפול" />
        <${Field} label="בפעם הבאה">
          <${TextArea} voice rows=${2} value=${nextStep} onChange=${setNextStep} />
        </${Field}>
        <${Button} kind="soft" disabled=${!dirty} onClick=${saveNote}>שמירת ההערה</${Button}>
      </div>
    </${Section}>`}

    <${CancelSheet} open=${cancelOpen} busy=${cancelBusy} onClose=${() => setCancelOpen(false)} onSubmit=${cancel} />
    <${TillSheet} open=${tillOpen} appt=${appt} methods=${(settings && settings.paymentMethods) || []} onClose=${() => setTillOpen(false)} />
  </${Page}>`;
}
