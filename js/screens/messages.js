
import { html } from '../../vendor/preact-htm.js';
import { Page, Section, List, Row, Tag, Notice, Loader } from '../ui/bits.js';
import { useData } from '../ui/hooks.js';
import { MESSAGES, GROUPS, messageOn, messageText } from '../lib/messages.js';

export default function Messages() {
  const { data: settings } = useData((s) => s.getSettings(), []);

  return html`<${Page} title="הודעות" em="אוטומטיות" back backTo="/more">
    <${Notice} kind="info">כאן רואים מתי כל הודעה יוצאת, ומשנים מה כתוב בה. ההודעות עוד לא נשלחות: השליחה בוואטסאפ תגיע בשלב הבא.</${Notice}>
    ${!settings ? html`<${Loader} />` : GROUPS.map((g) => html`<${Section} key=${g.id} title=${g.title}>
      <${List}>
        ${MESSAGES.filter((m) => m.group === g.id).map((m) => {
          const tags = [
            m.kind === 'marketing' && html`<${Tag} tone="gold">פרסומת</${Tag}>`,
            !messageOn(m, settings) && html`<${Tag}>כבויה</${Tag}>`,
            messageText(m, settings) !== m.text && html`<${Tag} tone="olive">שונה</${Tag}>`,
          ].filter(Boolean);
          return html`<${Row} key=${m.id} title=${`${m.n}. ${m.title}`} sub=${m.when} href=${'/message/' + m.id} chevron
            right=${tags.length ? html`<span class="msg-tags">${tags}</span>` : null} />`;
        })}
      </${List}>
    </${Section}>`)}
  </${Page}>`;
}
