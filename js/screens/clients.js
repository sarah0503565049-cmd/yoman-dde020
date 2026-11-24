
import { html, useState, useMemo } from '../../vendor/preact-htm.js';
import { Page, Button, TextInput, List, Row, Empty, Loader } from '../ui/bits.js';
import { useData, useSessionState } from '../ui/hooks.js';
import { formatPhone } from '../lib/model.js';

export function matchClient(c, query) {
  const q = String(query || '').trim();
  if (!q) return true;
  if (String(c.name || '').toLowerCase().includes(q.toLowerCase())) return true;
  if (!/^[\d\s\-+()]+$/.test(q)) return false;
  const d = q.replace(/\D/g, '');
  if (!d) return false;
  const intl = String(c.phone || '').replace(/\D/g, '');
  const local = intl.startsWith('972') ? '0' + intl.slice(3) : intl;
  return local.includes(d) || intl.includes(d);
}

export default function Clients() {
  const { data, loading } = useData((s) => s.listClients(), []);
  const [q, setQ] = useSessionState('clients.q', '');
  const shown = useMemo(() => (data || []).filter((c) => matchClient(c, q)), [data, q]);

  return html`<${Page} title="לקוחות">
    <${TextInput} icon="search" value=${q} onChange=${setQ} placeholder="חיפוש לפי שם או טלפון"
      aria-label="חיפוש לפי שם או טלפון" autocomplete="off" enterkeyhint="search" />
    <${Button} href="/client/new" icon="plus">לקוח/ה חדש/ה</${Button}>
    ${data === undefined && loading && html`<${Loader} />`}
    ${data !== undefined && html`
      <p class="sub count-line">${shown.length} לקוחות</p>
      ${shown.length === 0
        ? html`<${Empty} text="לא נמצאו לקוחות" />`
        : html`<${List}>${shown.map((c) => html`<${Row} key=${c.id} title=${c.name} sub=${formatPhone(c.phone)}
            href=${'/client/' + c.id} chevron />`)}</${List}>`}
    `}
  </${Page}>`;
}
