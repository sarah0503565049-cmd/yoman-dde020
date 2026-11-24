
import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import {
  Page, Button, Card, Chip, Chips, Segmented, Field, TextInput, DateInput, Toggle, Select, Notice, Empty, Loader,
  toast, askSheet, confirmSheet,
} from '../ui/bits.js';
import { useData } from '../ui/hooks.js';
import { back as routerBack, replace } from '../router.js';
import { getStore } from '../data/store.js';
import { validateBlock } from '../lib/model.js';
import { expandBlocks, REPEAT_LABELS } from '../lib/recur.js';
import {
  addDays, dow, DAY_NAMES, isYmd, todayYmd, timeOptions, fmtTime, fmtDuration, fmtDate, fmtDayMonth,
} from '../lib/time.js';

const QUICK = ['הפסקת אוכל', 'זמן הודעות', 'בלט', 'ספורט', 'פגישה', 'סגור'];
const KIND_OPTIONS = [{ value: 'appt', label: 'תור' }, { value: 'block', label: 'אירוע' }];
const REPEAT_OPTIONS = ['none', 'daily', 'weekly'].map((v) => ({ value: v, label: REPEAT_LABELS[v] }));
const TIMES = timeOptions(0, 1440, 15).map((m) => ({ value: m, label: fmtTime(m) }));
const DURATIONS = timeOptions(15, 12 * 60 + 1, 15).map((m) => ({ value: m, label: fmtDuration(m) }));
const SHOW_MAX = 5;

const errText = (e) => (e && e.message) || 'משהו השתבש, אפשר לנסות שוב';
const withValue = (opts, v, label) => (opts.some((o) => o.value === v) ? opts : [...opts, { value: v, label }].sort((a, b) => a.value - b.value));

export default function BlockEdit({ params, query }) {
  const isNew = !params.id;
  const { data, loading } = useData(async (s) => {
    const block = isNew ? null : await s.getBlock(params.id);
    return { block, settings: await s.getSettings() };
  }, [params.id]);

  const [f, setF] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);
  const ready = useRef(null);

  const block = data && data.block;
  const qDate = query && isYmd(query.date) ? query.date : null;
  const instanceDate = block ? qDate || block.date : null;
  const repeating = !!block && block.repeat !== 'none';

  useEffect(() => {
    if (!data || ready.current === (params.id || 'new')) return;
    if (!isNew && !block) return;
    ready.current = params.id || 'new';
    if (isNew) {
      const min = Number(query && query.min);
      setF({
        title: '', date: qDate || todayYmd(), allDay: false,
        startMin: Number.isFinite(min) && min >= 0 && min < 1440 ? Math.floor(min / 15) * 15 : 540,
        durationMin: 60, repeat: 'none', until: null,
      });
    } else {
      setF({
        title: block.title, date: block.repeat !== 'none' ? instanceDate : block.date, allDay: !!block.allDay,
        startMin: block.allDay ? 540 : block.startMin, durationMin: block.allDay ? 60 : block.durationMin,
        repeat: block.repeat, until: block.until || null,
      });
    }
  }, [data]);

  const set = (patch) => { setErrors([]); setF((p) => ({ ...p, ...patch })); };

  const week = (date) => `/cal/week/${date}`;
  const head = { title: isNew ? 'אירוע' : 'עריכת', em: isNew ? 'חדש' : 'אירוע', back: true, backTo: '/cal' };

  if (!f && loading) return html`<${Page} ...${head}><${Loader} /></${Page}>`;
  if (!isNew && data && !block) {
    return html`<${Page} ...${head}>
      <${Empty} text="האירוע לא נמצא" />
      <${Button} kind="soft" onClick=${() => routerBack('/cal')}>חזרה</${Button}>
    </${Page}>`;
  }
  if (!f) return html`<${Page} ...${head}><${Loader} /></${Page}>`;

  const apptConflicts = async (cand, onlyDay) => {
    const s = getStore();
    const today = todayYmd();
    let from = cand.date;
    let to = cand.date;
    if (!onlyDay && cand.repeat !== 'none') {
      from = cand.date > today ? cand.date : today;
      to = addDays(today, 60);
    }
    const [appts, clients] = await Promise.all([s.listAppointments({ from, to }), s.listClients()]);
    const names = new Map(clients.map((c) => [c.id, c.name]));
    const inst = expandBlocks([{ ...cand, id: 'cand', exceptions: onlyDay ? [] : cand.exceptions || [] }], from, to);
    const hits = new Map();
    for (const i of inst) {
      for (const a of appts) {
        if (a.date === i.date && a.startMin < i.startMin + i.durationMin && i.startMin < a.startMin + a.durationMin) hits.set(a.id, a);
      }
    }
    return [...hits.values()]
      .sort((x, y) => (x.date === y.date ? x.startMin - y.startMin : x.date < y.date ? -1 : 1))
      .map((a) => `${fmtDayMonth(a.date)} · ${fmtTime(a.startMin)} · ${names.get(a.clientId) || 'תור'}`);
  };

  const save = async () => {
    if (busy) return;
    const cand = {
      title: f.title.trim(), date: f.date, allDay: f.allDay,
      startMin: f.allDay ? 0 : f.startMin, durationMin: f.allDay ? 1440 : f.durationMin,
      repeat: f.repeat, until: f.repeat === 'none' ? null : f.until || null,
      exceptions: block ? block.exceptions || [] : [],
    };
    const errs = [];
    if (!isYmd(cand.date)) errs.push('חסר תאריך');
    errs.push(...validateBlock(cand));
    if (errs.length) { setErrors(errs); return; }

    let scope = 'all';
    if (repeating) {
      const pick = await askSheet({
        title: 'מה לשנות?',
        choices: [
          { value: 'day', label: `רק ביום הזה (${fmtDate(instanceDate)})`, kind: 'primary' },
          { value: 'all', label: 'את כל הסדרה', kind: 'soft' },
        ],
      });
      if (!pick) return;
      scope = pick;
    }

    setBusy(true);
    try {
      const lines = await apptConflicts(cand, scope === 'day');
      if (lines.length) {
        const shown = lines.slice(0, SHOW_MAX);
        if (lines.length > SHOW_MAX) shown.push(`ועוד ${lines.length - SHOW_MAX}`);
        const go = await askSheet({
          title: 'יש תורים בזמן הזה', lines: shown,
          choices: [{ value: true, label: 'לשמור בכל זאת', kind: 'primary' }, { value: false, label: 'חזרה', kind: 'soft' }],
        });
        if (go !== true) { setBusy(false); return; }
      }
      const s = getStore();
      if (repeating && scope === 'day') {
        await s.overrideBlockOn(block.id, instanceDate, {
          title: cand.title, date: cand.date, startMin: cand.startMin, durationMin: cand.durationMin, allDay: cand.allDay,
        });
      } else if (block) {
        await s.saveBlock({
          ...block, title: cand.title, startMin: cand.startMin, durationMin: cand.durationMin, allDay: cand.allDay,
          repeat: cand.repeat, until: cand.until,
          date: repeating && !touched.current ? block.date : cand.date,
        });
      } else {
        await s.saveBlock({ ...cand, movedFrom: null });
      }
      toast('האירוע נשמר');
      replace(week(cand.date) + (cand.allDay ? '' : '?at=' + cand.startMin));
    } catch (e) {
      setErrors([errText(e)]);
      setBusy(false);
    }
  };

  const remove = async () => {
    const s = getStore();
    try {
      if (repeating) {
        const pick = await askSheet({
          title: 'מה למחוק?',
          choices: [
            { value: 'day', label: `רק ביום הזה (${fmtDate(instanceDate)})`, kind: 'danger' },
            { value: 'all', label: 'את כל הסדרה', kind: 'danger' },
            { value: null, label: 'חזרה', kind: 'soft' },
          ],
        });
        if (!pick) return;
        if (pick === 'day') await s.skipBlockOn(block.id, instanceDate); else await s.deleteBlock(block.id);
      } else {
        const ok = await confirmSheet({ title: 'למחוק את האירוע?', ok: 'מחיקה', cancel: 'חזרה', danger: true });
        if (!ok) return;
        await s.deleteBlock(block.id);
      }
      toast('האירוע נמחק');
      replace(week(instanceDate));
    } catch (e) { toast(errText(e)); }
  };

  const switchKind = (v) => {
    if (v === 'appt') replace(`/appt/new?date=${f.date}&min=${f.startMin}`);
  };

  const footer = html`<${Button} type="submit" disabled=${busy}>שמירה</${Button}>`;

  return html`<${Page} ...${head} onSubmit=${save} footer=${footer}>
    <div class="be-form">
      ${isNew && html`<${Segmented} label="סוג" options=${KIND_OPTIONS} value="block" onChange=${switchKind} />`}

      ${errors.length > 0 && html`<${Notice} kind="danger">${errors.join(' · ')}</${Notice}>`}

      <${Field} label="שם">
        <${TextInput} value=${f.title} onChange=${(v) => set({ title: v })} />
      </${Field}>
      <${Chips}>${QUICK.map((q) => html`<${Chip} key=${q} active=${f.title === q} onClick=${() => set({ title: q })}>${q}</${Chip}>`)}</${Chips}>

      <${Field} label=${'תאריך' + (isYmd(f.date) ? ' · יום ' + DAY_NAMES[dow(f.date)] : '')}>
        <${DateInput} value=${f.date} onChange=${(v) => { touched.current = true; set({ date: v }); }} />
      </${Field}>

      <${Card}><${Toggle} label="כל היום" checked=${f.allDay} onChange=${(v) => set({ allDay: v })} /></${Card}>

      ${!f.allDay && html`<div class="form-pair">
        <${Field} label="שעת התחלה">
          <${Select} value=${f.startMin} onChange=${(v) => set({ startMin: v })} options=${withValue(TIMES, f.startMin, fmtTime(f.startMin))} />
        </${Field}>
        <${Field} label="משך" hint=${'עד ' + fmtTime(f.startMin + f.durationMin)}>
          <${Select} value=${f.durationMin} onChange=${(v) => set({ durationMin: v })} options=${withValue(DURATIONS, f.durationMin, fmtDuration(f.durationMin))} />
        </${Field}></div>`}

      <${Field} label="חוזר">
        <${Segmented} options=${REPEAT_OPTIONS} value=${f.repeat} onChange=${(v) => set({ repeat: v })} />
      </${Field}>

      ${f.repeat !== 'none' && html`<${Field} label="עד תאריך" hint="לא חובה. בלי תאריך האירוע חוזר בלי הגבלה.">
        <${DateInput} value=${f.until} onChange=${(v) => set({ until: v })} />
      </${Field}>`}

      ${!isNew && html`<${Button} kind="danger" class="be-danger" onClick=${remove}>מחיקת האירוע</${Button}>`}
    </div>
  </${Page}>`;
}
