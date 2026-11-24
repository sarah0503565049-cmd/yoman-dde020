
import { html, useState, useEffect, useLayoutEffect, useRef, useMemo } from '../../vendor/preact-htm.js';
import { Page, Chip, Segmented, IconButton, Sheet, Button, Fab, StatusBadge, Tag, toast, confirmSheet, fmtMoney } from '../ui/bits.js';
import { Icon } from '../ui/icons.js';
import { useData, useNow } from '../ui/hooks.js';
import { go, replace, currentRoute } from '../router.js';
import { getStore } from '../data/store.js';
import { DAY_LETTERS, addDays, dow, isYmd, weekDays, fmtTime, fmtDateLong, fmtWeekRange } from '../lib/time.js';
import { expandBlocks } from '../lib/recur.js';
import { layoutDay } from '../lib/lanes.js';
import {
  STATUS, apptEnd, apptTotal, apptVisual, clinicRanges, findConflicts, firstVisitIds, gridRange, isActive, isClosed, textOn,
} from '../lib/model.js';

const ROW = { week: 24, day: 28 };   // גובה של 15 דקות
const GUTTER = 44;                    // עמודת השעות
const LONG_MS = 400;                  // לחיצה ארוכה שמרימה משבצת
const SLOP = 8;                       // תזוזה שעד אליה זו עדיין לחיצה
const SWIPE = 60;
const EDGE = 48;                      // גלילה אוטומטית ליד הקצה בזמן גרירה
const NAME_LH = 14;                   // שורת השם במשבצת שבועית (12px)
const LINE_LH = 13;                   // שורה משנית במשבצת שבועית (11px)

function readSS(key) {
  try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeSS(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* חסום או מלא */ }
}

const range = (s, d) => `${fmtTime(s)} עד ${fmtTime(s + d)}`;

function breakParts(text) {
  return String(text || '').split(/(?<=[\s-])/).filter((p) => p.trim());
}

function fitLines(text, budget, innerW, charW) {
  const t = String(text || '').trim();
  if (!t || budget <= 0) return [];
  if (budget === 1 || t.length * charW <= innerW) return [t];
  const parts = breakParts(t);
  if (parts.length <= budget) return parts.map((p) => p.trim());
  return [...parts.slice(0, budget - 1).map((p) => p.trim()), parts.slice(budget - 1).join('').trim()];
}

function conflictLine(c, names, withBufferNote) {
  const what = c.type === 'block' ? c.ref.title : names.get(c.ref.clientId) || 'לקוח/ה';
  const when = c.type === 'block' && c.ref.allDay ? 'כל היום' : range(c.startMin, c.durationMin);
  return `${when} · ${what}${withBufferNote && c.type === 'buffer' ? ' · בלי זמן ניקיון' : ''}`;
}

function placeStyle(ev, ctx) {
  const top = ((ev.startMin - ctx.from) / 15) * ctx.rowH + 1;
  const h = Math.max(12, (ev.durationMin / 15) * ctx.rowH - 2);
  return {
    h,
    style: {
      top: top + 'px',
      height: h + 'px',
      insetInlineStart: `calc(${(ev.lane / ev.lanes) * 100}% + 1px)`,
      width: `calc(${100 / ev.lanes}% - 2px)`,
    },
  };
}

const Star = () => html`<span class="cal-star" aria-hidden="true"><${Icon} name="star" fill size=${10} /></span>`;
const Thumb = ({ size = 11 }) => html`<span class="cal-thumb" aria-hidden="true"><${Icon} name="thumb" size=${size} /></span>`;

function apptInfo(a, ctx) {
  const vis = apptVisual(a, ctx.today, ctx.nowMin, ctx.first.has(a.id));
  const full = ctx.names.get(a.clientId) || 'לקוח/ה';
  const item = (a.items && a.items[0]) || null;
  const color = (item && item.color) || '#C9BBA6';
  const label = [full, range(a.startMin, a.durationMin), (a.items || []).map((it) => it.name).join(' + '),
    STATUS[a.status] ? STATUS[a.status].label : ''].filter(Boolean).join(', ');
  return { vis, full, item, color, label };
}

function apptShell(ev, ctx, inner, h, style, info, extraCls, day) {
  const { a } = ev;
  const { vis, color } = info;
  const s = { ...style, '--ev': color };
  if (vis.tone === 'color') s.color = textOn(color);
  const cls = ['cal-ev', 'is-appt', `tone-${vis.tone}`, extraCls].filter(Boolean).join(' ');
  return html`<button type="button" key=${ev.key} class=${cls} style=${s} data-key=${ev.key}
    data-drag=${!isClosed(a) && isActive(a) ? '1' : '0'} aria-label=${info.label} title=${info.label}>
    <span class="cal-ev-in">${inner}</span>
    ${vis.unpaid && !day && html`<span class="cal-coin" aria-hidden="true" />`}
  </button>`;
}

function WeekAppt(ev, ctx) {
  const { a } = ev;
  const info = apptInfo(a, ctx);
  const { vis, item } = info;
  const { h, style } = placeStyle(ev, ctx);
  const pending = vis.tone === 'pending';
  const narrow = ctx.colW / ev.lanes < 34;
  const innerW = (ctx.colW - 1) / ev.lanes - 2 - (narrow ? 2 : 4) - (pending ? 4 : 0);
  const firstName = info.full.split(/\s+/)[0];
  let rest = Math.floor((h - 4 - (pending ? 4 : 0) - NAME_LH) / LINE_LH);
  const nameW = firstName.length * 7;
  const marksW = (vis.star ? 12 : 0) + (vis.thumb ? 13 : 0);
  const marksInline = !marksW || nameW + marksW <= innerW || rest < 1;
  if (!marksInline) rest -= 1;

  const lines = [];
  if (pending && rest > 0) { lines.push({ t: 'ממתין', strong: true }); rest -= 1; }
  if (vis.free && rest > 0) {
    const f = fitLines('ללא תשלום', Math.min(rest, 2), innerW, 5.8);
    f.forEach((t) => lines.push({ t, strong: true }));
    rest -= f.length;
  }
  const short = item ? item.shortName || item.name : '';
  fitLines(short, rest, innerW, 5.8).forEach((t) => lines.push({ t }));

  const inner = html`<span class="cal-ev-name">
      ${marksInline && vis.star && html`<${Star} />`}<span class="cal-ev-t">${firstName}</span>${marksInline && vis.thumb && html`<${Thumb} />`}
    </span>
    ${!marksInline && html`<span class="cal-ev-marks">${vis.star && html`<${Star} />`}${vis.thumb && html`<${Thumb} />`}</span>`}
    ${lines.map((l) => html`<span class=${'cal-ev-line' + (l.strong ? ' is-strong' : '')}>${l.t}</span>`)}`;
  return apptShell(ev, ctx, inner, h, style, info, narrow ? 'is-narrow' : '');
}

function DayAppt(ev, ctx) {
  const { a } = ev;
  const info = apptInfo(a, ctx);
  const { vis } = info;
  const { h, style } = placeStyle(ev, ctx);
  const when = range(ev.startMin, a.durationMin);
  const names = (a.items || []).map((it) => it.name).join(' + ');
  const money = vis.free ? null : html`<span class="cal-dv-money">${vis.unpaid && html`<span class="cal-dv-coin" title="לא שולם"><${Icon} name="coin" size=${16} /></span>`}${fmtMoney(apptTotal(a))}</span>`;
  const name = html`<span class="cal-dv-name">
    ${vis.star && html`<span class="cal-star" aria-hidden="true"><${Icon} name="star" fill size=${14} /></span>`}<span class="cal-ev-t">${info.full}</span>${vis.thumb && html`<${Thumb} size=${16} />`}
  </span>`;
  let inner;
  if (h < 40) {
    inner = html`<span class="cal-dv-row">${name}<span class="cal-dv-sub is-inline">${when}</span>${money}</span>`;
  } else {
    inner = html`<span class="cal-dv-row">${name}${money}</span>
      <span class="cal-dv-sub">${when} · ${names}</span>
      ${h >= 70 && html`<span class="cal-dv-tags">
        <${StatusBadge} status=${a.status} compact />
        ${a.source === 'online' && html`<${Tag} tone="olive" compact>נקבע באתר</${Tag}>`}
      </span>`}`;
  }
  return apptShell(ev, ctx, inner, h, style, info, 'is-day', true);
}

function BlockTile(ev, ctx, day) {
  const { b } = ev;
  const { h, style } = placeStyle(ev, ctx);
  const repeat = b.repeat && b.repeat !== 'none';
  const label = `${b.title}, ${range(ev.startMin, ev.durationMin)}`;
  let inner;
  let narrow = false;
  if (day) {
    inner = h < 40
      ? html`<span class="cal-dv-row"><span class="cal-dv-name"><span class="cal-ev-t">${b.title}</span></span><span class="cal-dv-sub is-inline">${range(ev.startMin, ev.durationMin)}</span>${repeat && html`<span class="cal-rep"><${Icon} name="repeat" size=${14} /></span>`}</span>`
      : html`<span class="cal-dv-row"><span class="cal-dv-name"><span class="cal-ev-t">${b.title}</span></span>${repeat && html`<span class="cal-rep"><${Icon} name="repeat" size=${16} /></span>`}</span>
        <span class="cal-dv-sub">${range(ev.startMin, ev.durationMin)}</span>`;
  } else {
    narrow = ctx.colW / ev.lanes < 34;
    const innerW = (ctx.colW - 1) / ev.lanes - 2 - (narrow ? 2 : 4);
    const corner = repeat && h >= 40;
    const budget = Math.max(1, Math.floor((h - 4 - (corner ? 12 : 0)) / NAME_LH));
    const lines = fitLines(b.title, budget, innerW, 6.8);
    inner = html`${lines.map((t) => html`<span class="cal-ev-name"><span class="cal-ev-t">${t}</span></span>`)}
      ${corner && html`<span class="cal-rep is-corner"><${Icon} name="repeat" size=${11} /></span>`}`;
  }
  return html`<button type="button" key=${ev.key} class=${'cal-ev is-block' + (day ? ' is-day' : '') + (narrow ? ' is-narrow' : '')} style=${style}
    data-key=${ev.key} data-drag="1" aria-label=${label} title=${label}><span class="cal-ev-in">${inner}</span></button>`;
}

async function loadAll(s) {
  const [settings, appts, blocks, clients] = await Promise.all([
    s.getSettings(), s.listAppointments(), s.listBlocks(), s.listClients(),
  ]);
  return { settings, appts, blocks, clients };
}

function pathWithoutAt() {
  const cur = currentRoute();
  const q = new URLSearchParams();
  Object.entries(cur.query || {}).forEach(([k, v]) => { if (k !== 'at') q.set(k, v); });
  const s = q.toString();
  return cur.path + (s ? '?' + s : '');
}

export default function Calendar({ params, query }) {
  const now = useNow();
  const today = now.today;
  const { data, reload } = useData(loadAll, []);
  const [pend, setPend] = useState(null);       // תור או אירוע שהוזז ועוד לא נשמר: { key, date, startMin }
  const [ask, setAsk] = useState(null);         // לחיצה על מקום ריק: { date, min }
  const [jump, setJump] = useState(0);
  const lastAsk = useRef(null);
  if (ask) lastAsk.current = ask;
  const scRef = useRef(null);
  const [colW, setColW] = useState(() => (Math.min(window.innerWidth, 1100) - GUTTER) / 7);

  const last = readSS('cal.last');
  const pView = params.view === 'week' || params.view === 'day' ? params.view : null;
  const pDate = isYmd(params.date) ? params.date : null;
  const lastView = last && (last.view === 'week' || last.view === 'day') ? last.view : null;
  const view = pView || lastView || (data && data.settings.defaultView === 'day' ? 'day' : 'week');
  const date = pDate || (last && isYmd(last.date) ? last.date : today);
  const week = weekDays(date);
  const shown = view === 'week' ? week : [date];
  const rowH = ROW[view];

  const r = currentRoute();
  const posKey = `${(history.state && history.state.idx) || 0}|${r.hash}`;
  const keyRef = useRef(posKey);
  keyRef.current = posKey;

  useEffect(() => { writeSS('cal.last', { view, date }); }, [view, date]);

  const model = useMemo(() => {
    if (!data) return null;
    const { settings, appts, blocks, clients } = data;
    const names = new Map(clients.map((c) => [c.id, c.name]));
    const first = firstVisitIds(appts);
    const per = new Map(week.map((d) => [d, []]));
    const allDay = new Map(week.map((d) => [d, []]));
    for (const a of appts) {
      if (!isActive(a)) continue;
      const key = 'a:' + a.id;
      const p = pend && pend.key === key ? pend : null;
      const d = p ? p.date : a.date;
      if (!per.has(d)) continue;
      per.get(d).push({ key, kind: 'a', date: d, startMin: p ? p.startMin : a.startMin, durationMin: a.durationMin, a });
    }
    for (const b of expandBlocks(blocks, week[0], week[6])) {
      if (b.allDay) { allDay.get(b.date).push(b); continue; }
      const key = `b:${b.blockId}|${b.date}`;
      const p = pend && pend.key === key ? pend : null;
      const d = p ? p.date : b.date;
      if (!per.has(d)) continue;
      per.get(d).push({ key, kind: 'b', date: d, origDate: b.date, startMin: p ? p.startMin : b.startMin, durationMin: b.durationMin, b });
    }
    const cols = shown.map((d) => ({ date: d, items: layoutDay(per.get(d)) }));
    const rng = gridRange(settings, cols.flatMap((c) => c.items));
    return { settings, names, first, cols, allDay, range: rng };
  }, [data, date, view, pend]);

  useEffect(() => {
    const sc = scRef.current;
    if (!sc || typeof ResizeObserver !== 'function') return undefined;
    const measure = () => setColW(Math.max(20, (sc.clientWidth - GUTTER) / shown.length));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sc);
    return () => ro.disconnect();
  }, [shown.length]);

  const topMin = useRef(null);
  const placed = useRef(false);
  const want = useRef(null);
  const from = model ? model.range.from : null;
  const atRaw = query && query.at != null ? String(query.at) : null;
  const atSeen = useRef(undefined);
  const atWant = useRef(null);
  if (atRaw !== atSeen.current) {
    atSeen.current = atRaw;
    const n = atRaw === null || atRaw.trim() === '' ? NaN : Number(atRaw);
    atWant.current = Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), 1440) : null;
  }

  useLayoutEffect(() => {
    const sc = scRef.current;
    if (!sc || from == null) return;
    let m;
    if (atWant.current != null) {
      const at = atWant.current;
      atWant.current = null;
      want.current = null;
      const grid = sc.querySelector('.cal-grid');
      const gridTop = grid ? grid.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop : 0;
      const px = gridTop + ((at - from) / 15) * rowH - sc.clientHeight / 3;
      m = from + (Math.max(0, px) / rowH) * 15;
    } else if (want.current != null) { m = want.current; want.current = null; }
    else if (!placed.current) {
      const saved = readSS('cal.pos');
      if (saved && saved.key === keyRef.current && Number.isFinite(saved.topMin)) m = saved.topMin;
      else m = shown.includes(today) ? now.min - 60 : 480;
    } else m = topMin.current;
    placed.current = true;
    if (atRaw !== null) {
      const clean = pathWithoutAt();
      if (clean !== currentRoute().hash) replace(clean);
    }
    if (m == null) return;
    sc.scrollTop = Math.max(0, ((m - from) / 15) * rowH);
    topMin.current = from + (sc.scrollTop / rowH) * 15;
    writeSS('cal.pos', { key: keyRef.current, topMin: topMin.current });
  }, [from, rowH, jump, atRaw]);

  useEffect(() => {
    if (topMin.current != null) writeSS('cal.pos', { key: posKey, topMin: topMin.current });
  }, [posKey]);

  const to = (v, d) => replace(`/cal/${v}/${d}`);
  const shift = (n) => to(view, addDays(date, n * (view === 'week' ? 7 : 1)));
  const goToday = () => {
    want.current = Math.max(0, now.min - 60);
    setJump((j) => j + 1);
    if (date !== today) to(view, today);
  };
  const setView = (v) => {
    const d = v === 'day' && view === 'week' && week.includes(today) ? today : date;
    to(v, d);
  };

  const open = (key) => {
    if (key.startsWith('a:')) go('/appt/' + key.slice(2));
    else {
      const [blockId, d] = key.slice(2).split('|');
      go(`/block/${blockId}?date=${d}`);
    }
  };

  const commitMove = async (ev, d, startMin) => {
    const store = getStore();
    const L = live.current;
    setPend({ key: ev.key, date: d, startMin });
    try {
      if (ev.kind === 'a') {
        const a = ev.a;
        const conf = findConflicts({ date: d, startMin, durationMin: a.durationMin },
          L.data.appts.filter((x) => x.date === d), expandBlocks(L.data.blocks, d, d),
          { ignoreApptId: a.id, bufferMin: L.data.settings.bufferMin });
        if (conf.length) {
          const hard = conf.some((c) => c.type !== 'buffer');
          const ok = await confirmSheet({
            title: hard ? 'השעה הזאת תפוסה' : 'אין זמן ניקיון בין התורים',
            lines: conf.map((c) => conflictLine(c, L.model.names, hard)),
            ok: 'להזיז בכל זאת',
            cancel: 'חזרה',
          });
          if (!ok) { setPend(null); return; }
        }
        const prev = a;
        await store.saveAppointment({ ...a, date: d, startMin });
        await reload();
        setPend(null);
        toast(`התור הועבר ל-${fmtTime(startMin)}`, {
          action: { label: 'ביטול', onClick: () => { store.saveAppointment(prev).catch((e) => toast(e.message)); } },
        });
      } else {
        const series = L.data.blocks.find((x) => x.id === ev.b.blockId);
        if (!series) { setPend(null); return; }
        if (!series.repeat || series.repeat === 'none') {
          await store.saveBlock({ ...series, date: d, startMin });
          await reload();
          setPend(null);
          toast(`האירוע הועבר ל-${fmtTime(startMin)}`, {
            action: { label: 'ביטול', onClick: () => { store.saveBlock(series).catch((e) => toast(e.message)); } },
          });
        } else {
          const one = await store.overrideBlockOn(series.id, ev.origDate, { date: d, startMin });
          await reload();
          setPend(null);
          toast('האירוע הוזז רק ביום הזה', {
            action: {
              label: 'ביטול',
              onClick: async () => {
                try { await store.deleteBlock(one.id); await store.saveBlock(series); } catch (e) { toast(e.message); }
              },
            },
          });
        }
      }
    } catch (err) {
      setPend(null);
      toast(err.message || 'השמירה לא הצליחה');
    }
  };

  const tapEmpty = (col, clientY) => {
    const L = live.current;
    if (!L.model) return;
    const rect = col.getBoundingClientRect();
    const y = clientY - rect.top;
    const m = L.model.range.from + Math.floor((y + 2) / L.rowH) * 15;
    setAsk({ date: col.dataset.date, min: Math.min(Math.max(m, 0), 1425) });
  };

  const live = useRef(null);
  live.current = { data, model, view, rowH, tapEmpty, open, shift, commitMove };

  useEffect(() => {
    const sc = scRef.current;
    if (!sc) return undefined;
    let st = null;
    let raf = 0;
    let suppressUntil = 0;
    const suppress = () => { suppressUntil = performance.now() + 450; };

    const findEv = (key) => {
      const m = live.current.model;
      if (!m) return null;
      for (const c of m.cols) for (const it of c.items) if (it.key === key) return it;
      return null;
    };

    const place = () => {
      const g = st;
      const ev = g.ev;
      const dyPx = (g.y - g.y0) + (sc.scrollTop - g.scroll0);
      let start = Math.round((ev.startMin + (dyPx / g.rowH) * 15) / 15) * 15;
      const lo = Math.max(0, g.range.from);
      const hi = Math.max(lo, Math.min(1440, g.range.to) - ev.durationMin);
      start = Math.min(Math.max(start, lo), hi);
      let ci = g.col0;
      if (g.cols.length > 1) {
        let best = Infinity;
        g.cols.forEach((c, i) => {
          const d = Math.abs(g.x - (c.rect.left + c.rect.width / 2));
          if (d < best) { best = d; ci = i; }
        });
      }
      const dx = g.cols[ci].rect.left - g.cols[g.col0].rect.left;
      const dy = ((start - ev.startMin) / 15) * g.rowH;
      g.tile.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
      g.newStart = start;
      g.newDate = g.cols[ci].date;
      g.label.textContent = fmtTime(start);
      g.label.style.left = `${g.r0.left + dx + g.r0.width / 2}px`;
      g.label.style.top = `${g.r0.top - (sc.scrollTop - g.scroll0) + dy}px`;
    };

    const loop = () => {
      cancelAnimationFrame(raf);
      const step = () => {
        if (!st || !st.lifted) return;
        const r = sc.getBoundingClientRect();
        let v = 0;
        if (st.y < r.top + EDGE) v = -Math.ceil((r.top + EDGE - st.y) / 4);
        else if (st.y > r.bottom - EDGE) v = Math.ceil((st.y - (r.bottom - EDGE)) / 4);
        if (v) {
          const before = sc.scrollTop;
          sc.scrollTop += v;
          if (sc.scrollTop !== before) place();
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const onKey = (e) => { if (e.key === 'Escape' && st && st.lifted) { e.preventDefault(); endLift(false); } };

    const lift = () => {
      const g = st;
      if (!g) return;
      g.timer = 0;
      const ev = findEv(g.tile.dataset.key);
      if (!ev || !g.tile.isConnected) { st = null; return; }
      const L = live.current;
      g.lifted = true;
      g.ev = ev;
      g.rowH = L.rowH;
      g.range = L.model.range;
      g.scroll0 = sc.scrollTop;
      g.r0 = g.tile.getBoundingClientRect();
      g.cols = [...sc.querySelectorAll('.cal-col')].map((c) => ({ date: c.dataset.date, rect: c.getBoundingClientRect() }));
      g.col0 = Math.max(0, g.cols.findIndex((c) => c.date === ev.date));
      g.newDate = ev.date;
      g.newStart = ev.startMin;
      g.tile.classList.add('is-lifted');
      try { g.tile.setPointerCapture(g.pointerId); } catch { /* מצביע מדומה בבדיקות */ }
      try { if (navigator.vibrate) navigator.vibrate(10); } catch { /* אין רטט */ }
      g.label = document.createElement('div');
      g.label.className = 'cal-drag-label';
      g.label.setAttribute('aria-hidden', 'true');
      document.body.appendChild(g.label);
      document.addEventListener('keydown', onKey);
      place();
      loop();
    };

    const endLift = (commit) => {
      const g = st;
      st = null;
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      if (g.label) g.label.remove();
      g.tile.classList.remove('is-lifted');
      try { g.tile.releasePointerCapture(g.pointerId); } catch { /* כבר שוחרר */ }
      suppress();
      const same = g.newDate === g.ev.date && g.newStart === g.ev.startMin;
      if (commit && !same) live.current.commitMove(g.ev, g.newDate, g.newStart);
      g.tile.style.transform = '';
    };

    const onDown = (e) => {
      if (st) {
        const second = e.pointerId !== st.pointerId;   // אצבע שנייה: מבטלים. אותו מצביע: מחווה ישנה שלא נסגרה
        if (st.lifted) endLift(false);
        else { clearTimeout(st.timer); st = null; }
        if (second) return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const tile = e.target.closest ? e.target.closest('.cal-ev') : null;
      st = {
        pointerId: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
        tile, moved: false, lifted: false, timer: 0,
      };
      if (tile && tile.dataset.drag === '1') st.timer = setTimeout(lift, LONG_MS);
    };

    const onMove = (e) => {
      if (!st || e.pointerId !== st.pointerId) return;
      st.x = e.clientX;
      st.y = e.clientY;
      if (!st.lifted) {
        if (!st.moved && Math.hypot(st.x - st.x0, st.y - st.y0) > SLOP) {
          st.moved = true;
          clearTimeout(st.timer);
          st.timer = 0;
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      place();
    };

    const onUp = (e) => {
      if (!st || e.pointerId !== st.pointerId) return;
      const g = st;
      if (g.lifted) { endLift(true); return; }
      clearTimeout(g.timer);
      st = null;
      if (!g.moved) return;                 // לחיצה רגילה: ה-click יטפל
      suppress();
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (g.type !== 'mouse' && Math.abs(dx) > SWIPE && Math.abs(dx) > 1.5 * Math.abs(dy)) {
        live.current.shift(dx > 0 ? 1 : -1);  // ימינה = קדימה בזמן (RTL)
      }
    };

    const onCancel = (e) => {
      if (!st || e.pointerId !== st.pointerId) return;
      if (st.lifted) endLift(false);
      else { clearTimeout(st.timer); st = null; }
    };

    const onTouchMove = (e) => { if (st && st.lifted && e.cancelable) e.preventDefault(); };
    const onCtx = (e) => { if ((st && st.lifted) || (e.target.closest && e.target.closest('.cal-ev'))) e.preventDefault(); };
    const onClickCapture = (e) => {
      if (performance.now() < suppressUntil) { suppressUntil = 0; e.preventDefault(); e.stopPropagation(); }
    };
    const onClick = (e) => {
      const L = live.current;
      const tile = e.target.closest('.cal-ev');
      if (tile) { L.open(tile.dataset.key); return; }
      const col = e.target.closest('.cal-col');
      if (col) L.tapEmpty(col, e.clientY);
    };

    let sraf = 0;
    const onScroll = () => {
      if (sraf) return;
      sraf = requestAnimationFrame(() => {
        sraf = 0;
        const L = live.current;
        if (!L.model) return;
        topMin.current = L.model.range.from + (sc.scrollTop / L.rowH) * 15;
        writeSS('cal.pos', { key: keyRef.current, topMin: topMin.current });
      });
    };

    sc.addEventListener('pointerdown', onDown);
    sc.addEventListener('pointermove', onMove);
    sc.addEventListener('pointerup', onUp);
    sc.addEventListener('pointercancel', onCancel);
    sc.addEventListener('touchmove', onTouchMove, { passive: false });
    sc.addEventListener('contextmenu', onCtx);
    sc.addEventListener('click', onClickCapture, true);
    sc.addEventListener('click', onClick);
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (st && st.lifted) endLift(false);
      if (st && st.timer) clearTimeout(st.timer);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(sraf);
      document.removeEventListener('keydown', onKey);
      sc.removeEventListener('pointerdown', onDown);
      sc.removeEventListener('pointermove', onMove);
      sc.removeEventListener('pointerup', onUp);
      sc.removeEventListener('pointercancel', onCancel);
      sc.removeEventListener('touchmove', onTouchMove);
      sc.removeEventListener('contextmenu', onCtx);
      sc.removeEventListener('click', onClickCapture, true);
      sc.removeEventListener('click', onClick);
      sc.removeEventListener('scroll', onScroll);
      if (topMin.current != null) writeSS('cal.pos', { key: keyRef.current, topMin: topMin.current });
    };
  }, []);

  const isWeek = view === 'week';
  const nav = html`<div class="cal-nav">
    <${IconButton} icon="chevronStart" label=${isWeek ? 'השבוע הקודם' : 'היום הקודם'} onClick=${() => shift(-1)} />
    <div class="cal-range" aria-live="polite">${isWeek ? fmtWeekRange(date) : fmtDateLong(date)}</div>
    <${IconButton} icon="chevronEnd" label=${isWeek ? 'השבוע הבא' : 'היום הבא'} onClick=${() => shift(1)} />
  </div>`;
  const seg = html`<${Segmented} class="cal-seg" label="תצוגה" value=${view} onChange=${setView}
    options=${[{ value: 'week', label: 'שבועי' }, { value: 'day', label: 'יומי' }]} />`;

  const anyAllDay = model && week.some((d) => model.allDay.get(d).length > 0);
  const head = html`<div class=${'cal-head' + (anyAllDay ? ' has-allday' : '')}>
    <div class="cal-head-gutter" />
    ${week.map((d) => {
      const n = Number(d.slice(8));
      const cls = ['cal-hd', d === today && 'is-today', !isWeek && d === date && 'is-sel'].filter(Boolean).join(' ');
      const pills = model ? model.allDay.get(d) : [];
      return html`<div class=${cls} key=${d}>
        <button type="button" class="cal-hd-btn" aria-label=${fmtDateLong(d)}
          aria-current=${!isWeek && d === date ? 'date' : undefined}
          onClick=${() => (isWeek ? go(`/cal/day/${d}`) : to('day', d))}>
          <span class="cal-hd-letter">${DAY_LETTERS[dow(d)]}</span>
          <span class="cal-hd-num">${n}</span>
        </button>
        ${pills.map((b) => html`<button type="button" class="cal-allday" title=${b.title} aria-label=${`${b.title}, כל היום`}
          onClick=${() => go(`/block/${b.blockId}?date=${d}`)}><span class="cal-allday-t">${b.title}</span></button>`)}
      </div>`;
    })}
  </div>`;

  let grid = null;
  if (model) {
    const { from: f, to: t } = model.range;
    const H = ((t - f) / 15) * rowH;
    const ctx = {
      from: f, rowH, colW, today, nowMin: now.min, names: model.names, first: model.first,
    };
    const buffer = Math.max(0, Number(model.settings.bufferMin) || 0);
    const y = (m) => ((m - f) / 15) * rowH;
    const lines = [];
    for (let m = Math.ceil(f / 30) * 30; m <= t; m += 30) {
      lines.push(html`<div class=${'cal-line' + (m % 60 ? ' is-half' : '')} style=${{ top: y(m) + 'px' }} />`);
    }
    const hours = [];
    for (let m = Math.ceil(f / 60) * 60; m <= t; m += 60) {
      hours.push(html`<div class="cal-hour" style=${{ top: y(m) + 'px' }}>${fmtTime(m)}</div>`);
    }
    grid = html`<div class="cal-grid" style=${{ height: H + 'px', gridTemplateColumns: `${GUTTER}px repeat(${shown.length}, minmax(0, 1fr))` }}>
      <div class="cal-gutter" aria-hidden="true">${hours}</div>
      ${model.cols.map((c) => {
        const open = clinicRanges(model.settings, dow(c.date))
          .map((rg) => ({ a: Math.max(rg.from, f), b: Math.min(rg.to, t) })).filter((rg) => rg.b > rg.a);
        const allDay = model.allDay.get(c.date).length > 0;
        return html`<div key=${c.date} class=${'cal-col' + (allDay ? ' is-allday' : '') + (c.date === today ? ' is-today' : '')} data-date=${c.date}>
          ${open.map((rg) => html`<div class="cal-open" style=${{ top: y(rg.a) + 'px', height: (y(rg.b) - y(rg.a)) + 'px' }} />`)}
          ${buffer > 0 && c.items.filter((ev) => ev.kind === 'a' && c.date >= today && apptEnd(ev) < t).map((ev) => html`<div class="cal-strip"
            style=${{
              top: y(apptEnd(ev)) + 'px',
              height: (Math.min(apptEnd(ev) + buffer, t) - apptEnd(ev)) / 15 * rowH + 'px',
              insetInlineStart: `calc(${(ev.lane / ev.lanes) * 100}% + 1px)`,
              width: `calc(${100 / ev.lanes}% - 2px)`,
            }} />`)}
          ${c.items.map((ev) => (ev.kind === 'a' ? (isWeek ? WeekAppt(ev, ctx) : DayAppt(ev, ctx)) : BlockTile(ev, ctx, !isWeek)))}
          ${ask && ask.date === c.date && html`<div class="cal-pick" style=${{ top: y(ask.min) + 'px', height: rowH + 'px' }} />`}
          ${c.date === today && now.min >= f && now.min <= t && html`<div class="cal-now" style=${{ top: y(now.min) + 'px' }} />`}
        </div>`;
      })}
      <div class="cal-lines" aria-hidden="true">${lines}</div>
    </div>`;
  }

  const fabDate = isWeek ? (week.includes(today) ? today : date) : date;
  const shownAsk = ask || lastAsk.current;

  return html`<${Page} class="cal-page" title="יומן" wide scroll=${false}
    actions=${html`${seg}<${Chip} class="cal-today" onClick=${goToday}>היום</${Chip}>`}
    top=${nav}>
    <div class=${'cal is-' + view}>
      ${head}
      <div class="cal-scroll fill-scroll" ref=${scRef}>
        <div class="cal-body">${grid}</div>
      </div>
    </div>
    <${Fab} href=${'/appt/new?date=' + fabDate} label="תור חדש" />
    <${Sheet} open=${!!ask} onClose=${() => setAsk(null)}
      title=${shownAsk ? `${fmtDateLong(shownAsk.date)}, ${fmtTime(shownAsk.min)}` : ''}>
      <div class="sheet-actions">
        <${Button} onClick=${() => { const a = ask; setAsk(null); if (a) go(`/appt/new?date=${a.date}&min=${a.min}`); }}>תור חדש</${Button}>
        <${Button} kind="soft" onClick=${() => { const a = ask; setAsk(null); if (a) go(`/block/new?date=${a.date}&min=${a.min}`); }}>אירוע חדש</${Button}>
      </div>
    </${Sheet}>
  </${Page}>`;
}
