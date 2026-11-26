
import { html, useEffect } from '../../vendor/preact-htm.js';
import { Section, List, IconButton, toast } from '../ui/bits.js';
import { useData } from '../ui/hooks.js';
import { getStore } from '../data/store.js';
import { go } from '../router.js';
import { fmtTime, todayYmd } from '../lib/time.js';
import { unseenOnline, freshOnline, linkNotices, freshLinkNotices } from '../lib/booking.js';
import { treat, whenLabel, toastText, linkToastText, linkRowText } from '../lib/online-text.js';

export { toastText, linkToastText, linkRowText };

let watching = false;
function startWatch() {
  if (watching) return;
  watching = true;
  const s = getStore();
  let known = null;
  let knownLink = null;
  let queue = Promise.resolve();
  const check = async () => {
    const today = todayYmd();
    const list = await s.listAppointments({ from: today, includeCancelled: true });
    const r = freshOnline(list.filter((a) => !a.linkEvent), today, known);
    known = r.known;
    const l = freshLinkNotices(list, today, knownLink);
    knownLink = l.known;
    if (!r.fresh.length && !l.fresh.length) return;
    const names = new Map((await s.listClients()).map((c) => [c.id, c.name]));
    const nameOf = (id) => names.get(id) || 'לקוח/ה';
    const all = r.fresh.length + l.fresh.length;
    if (r.fresh.length && l.fresh.length) {
      toast(`${all} עדכונים מהאתר`, { action: { label: 'לרשימה', onClick: () => go('/home') } });
    } else if (r.fresh.length) {
      const one = r.fresh.length === 1 ? r.fresh[0] : null;
      toast(toastText(r.fresh, nameOf, today), {
        action: one ? { label: 'לתור', onClick: () => go('/appt/' + one.id) } : { label: 'לרשימה', onClick: () => go('/home') },
      });
    } else {
      const one = l.fresh.length === 1 ? l.fresh[0].appt : null;
      toast(linkToastText(l.fresh, nameOf, today), {
        action: one ? { label: 'לתור', onClick: () => go('/appt/' + one.id) } : { label: 'לרשימה', onClick: () => go('/home') },
      });
    }
  };
  const run = () => { queue = queue.then(check, check).catch(() => null); };
  run();
  s.subscribe(run);
}

const seen = async (a) => {
  try {
    await getStore().patchAppointment(a.id, { seenAt: new Date().toISOString() });
  } catch (err) { toast(err.message); }
};

export function OnlineNew({ appts, clients, today }) {
  useEffect(startWatch, []);
  const { data: withCancelled } = useData((s) => s.listAppointments({ from: today, includeCancelled: true }), [today]);
  const list = unseenOnline(appts, today).filter((a) => !a.linkEvent);
  const changes = linkNotices(withCancelled || [], today);
  const nameOf = (id) => (clients && clients.get(id) && clients.get(id).name) || 'לקוח/ה';
  if (!list.length && !changes.length) return null;
  return html`
    ${list.length > 0 && html`<${Section} title="תורים חדשים מהאתר" id="online-new">
      <p class="sub card-note">תורים שלקוחות קבעו בעצמם באתר. אחרי שראית, מסמנים "ראיתי".</p>
      <${List}>
        ${list.map((a) => html`<div class="row home-split" key=${a.id}>
          <a class="home-split-link" href=${'#/appt/' + a.id}>
            <span class="row-main">
              <span class="home-title-line"><span class="row-title">${nameOf(a.clientId)}</span></span>
              <span class="row-sub">${treat(a)} · ${whenLabel(a.date, today)} · ${fmtTime(a.startMin)}</span>
            </span>
          </a>
          <span class="row-end"><${IconButton} icon="check" label="ראיתי" onClick=${() => seen(a)} /></span>
        </div>`)}
      </${List}>
    </${Section}>`}
    ${changes.length > 0 && html`<${Section} title="ביטולים ושינויים מהקישור" id="online-link">
      <p class="sub card-note">לקוחות שביטלו או העבירו תור בעצמם, בקישור שבהודעה. אחרי שראית, מסמנים "ראיתי".</p>
      <${List}>
        ${changes.map((x) => html`<div class="row home-split" key=${x.appt.id}>
          <a class="home-split-link" href=${'#/appt/' + x.appt.id}>
            <span class="row-main">
              <span class="home-title-line"><span class="row-title">${nameOf(x.appt.clientId)}</span></span>
              <span class="row-sub">${linkRowText(x, today)}</span>
            </span>
          </a>
          <span class="row-end"><${IconButton} icon="check" label="ראיתי" onClick=${() => seen(x.appt)} /></span>
        </div>`)}
      </${List}>
    </${Section}>`}`;
}
