
import { html } from '../../vendor/preact-htm.js';
import { Page, Section, Button, Card, Toggle, List, Row, Dot, Money, Tag, Empty, Loader } from '../ui/bits.js';
import { useData, useSessionState } from '../ui/hooks.js';
import { fmtDuration } from '../lib/time.js';

export default function Items() {
  const { data } = useData(async (s) => ({
    services: await s.listServices({ includeInactive: true }),
    settings: await s.getSettings(),
  }), []);
  const [showInactive, setShowInactive] = useSessionState('items.inactive', false);

  let body = html`<${Loader} />`;
  if (data) {
    const list = data.services.filter((s) => showInactive || s.active);
    const known = data.settings.categories || [];
    const extra = [...new Set(list.map((s) => s.category))].filter((c) => !known.includes(c));
    const groups = [...known, ...extra]
      .map((cat) => ({ cat, items: list.filter((s) => s.category === cat) }))
      .filter((g) => g.items.length > 0);
    body = groups.length === 0
      ? html`<${Empty} text="אין פריטים להצגה" />`
      : groups.map((g) => html`<${Section} key=${g.cat} title=${g.cat || 'בלי קטגוריה'}>
          <${List}>${g.items.map((s) => html`<${Row} key=${s.id} href=${'/item/' + s.id} chevron
            start=${html`<${Dot} color=${s.color} />`}
            title=${s.name}
            sub=${s.kind !== 'product' && s.durationMin > 0 ? fmtDuration(s.durationMin) : null}
            right=${html`<${Money} value=${s.price} />`}>
            ${!s.active && html`<span class="item-tag"><${Tag}>לא פעיל</${Tag}></span>`}
          </${Row}>`)}</${List}>
        </${Section}>`);
  }

  return html`<${Page} title="פריטים" back backTo="/more">
    <${Button} href="/item/new" icon="plus">פריט חדש</${Button}>
    <${Card}>
      <${Toggle} label="להציג גם לא פעילים" checked=${showInactive} onChange=${setShowInactive} />
    </${Card}>
    ${body}
  </${Page}>`;
}
