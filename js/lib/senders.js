
import { MESSAGES, getMessage, messageText, fillMessage, sampleVars, CLINIC_WAY } from './messages.js';

export function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export const WA_URL_SOFT_LIMIT = 6000;

export const manualSender = {
  id: 'manual',
  via: 'manual',
  needsConfirm: true,
  prepare(item) {
    const href = waLink(item.to, item.text);
    return { href, long: !!href && href.length > WA_URL_SOFT_LIMIT };
  },
};

const MARKETING_IDS = new Set(['come-back', 'birthday', 'review']);
export const templateCategory = (msg) => (msg.kind === 'marketing' || MARKETING_IDS.has(msg.id) ? 'marketing' : 'service');

const META_BODY_MAX = 1024;
const PAY_KEYS = { 'פייבוקס': 'paybox', 'חשבון': 'bank' };

export function toTemplate(msg, settings = null, { home = false } = {}) {
  const text = messageText(msg, settings);
  const pay = (settings && settings.payInfo) || {};
  const fixed = {};
  if (msg.vars.includes('הדרך')) fixed['הדרך'] = home ? '' : CLINIC_WAY;
  for (const [k, f] of Object.entries(PAY_KEYS)) if (msg.vars.includes(k) && String(pay[f] || '').trim()) fixed[k] = String(pay[f]).trim();
  const filled = fillMessage(text, fixed);
  const params = [];
  const body = filled.replace(/\{([^{}\n]+)\}/g, (m, k) => {
    let i = params.indexOf(k);
    if (i < 0) { params.push(k); i = params.length - 1; }
    return `{{${i + 1}}}`;
  });
  const sample = { ...sampleVars(msg), 'קישור': 'https://example.org/book.html', 'פייבוקס': '050-0000000', 'חשבון': 'בנק 00, סניף 000, חשבון 000000' };
  const issues = [];
  if ([...body].length > META_BODY_MAX) issues.push(`הגוף ארוך מ-${META_BODY_MAX} תווים (${[...body].length})`);
  if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}\s*$/.test(body)) issues.push('משתנה בתחילת הגוף או בסופו');
  if (/\n\s*\n/.test(body)) issues.push('שורה ריקה בגוף');
  const cat = templateCategory(msg);
  return {
    msgId: msg.id,
    n: msg.n,
    name: `torim_${msg.id.replace(/-/g, '_')}${home ? '_home' : ''}`,
    language: 'he',
    category: cat,
    metaCategory: cat === 'marketing' ? 'MARKETING' : 'UTILITY',
    body,
    params,
    examples: params.map((k) => String(sample[k] != null ? sample[k] : '')),
    issues,
  };
}

export function listTemplates(settings = null) {
  const out = [];
  for (const msg of MESSAGES) {
    out.push(toTemplate(msg, settings));
    if (msg.vars.includes('הדרך')) out.push(toTemplate(msg, settings, { home: true }));
  }
  return out;
}

export function templatePayload(item, settings = null) {
  const msg = getMessage(item.msgId);
  const tpl = toTemplate(msg, settings, { home: !!item.vars && item.vars['הדרך'] === '' });
  return {
    to: item.to,
    template: tpl.name,
    language: tpl.language,
    category: tpl.category,
    params: tpl.params.map((k) => String((item.vars && item.vars[k]) ?? '')),
  };
}

export function createProviderSender({ id = 'provider', transport, settings = null } = {}) {
  if (typeof transport !== 'function') throw new Error('חסר transport לשולח הספק');
  return {
    id,
    via: 'api',
    needsConfirm: false,
    async send(item) {
      const res = await transport(templatePayload(item, settings));
      return res && res.ok ? { status: 'sent', providerId: res.id || null } : { status: 'failed', error: (res && res.error) || 'השליחה נכשלה' };
    },
  };
}

export { META_BODY_MAX };

export const templateBase = (msg, home = false) => `torim_${msg.id.replace(/-/g, '_')}${home ? '_home' : ''}`;

export function numberParams(text) {
  const params = [];
  const body = String(text).replace(/\{([^{}\n]+)\}/g, (m, k) => {
    let i = params.indexOf(k);
    if (i < 0) { params.push(k); i = params.length - 1; }
    return `{{${i + 1}}}`;
  });
  return { body, params };
}

const glyphs = (s) => [...String(s)].length;

export function splitForMeta(text, max = META_BODY_MAX) {
  const t = String(text);
  if (glyphs(numberParams(t).body) <= max) return [t];
  const lines = t.split('\n');
  let best = null;
  for (let i = 1; i < lines.length; i++) {
    if (/^\s*•/.test(lines[i]) || !lines[i].trim()) continue;
    const a = lines.slice(0, i).join('\n');
    const b = lines.slice(i).join('\n');
    const la = glyphs(numberParams(a).body);
    const lb = glyphs(numberParams(b).body);
    if (la > max || lb > max) continue;
    const score = Math.abs(la - lb);
    if (!best || score < best.score) best = { score, parts: [a, b] };
  }
  if (!best) throw new Error('אי אפשר לחלק את ההודעה לשני חלקים קצרים מ-1024 תווים');
  return best.parts;
}

export function metaIssues(body) {
  const issues = [];
  if (glyphs(body) > META_BODY_MAX) issues.push(`הגוף ארוך מ-${META_BODY_MAX} תווים (${glyphs(body)})`);
  if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}\s*$/.test(body)) issues.push('משתנה בתחילת הגוף או בסופו');
  if (/\n\s*\n/.test(body)) issues.push('שורה ריקה בגוף');
  if (/\}\}\s*\{\{/.test(body)) issues.push('שני משתנים צמודים');
  return issues;
}

export function paramProblem(v) {
  const s = String(v ?? '');
  if (!s.trim()) return 'ריק';
  if (/[\n\r\t]/.test(s)) return 'ירידת שורה או טאב';
  if (/ {4,}/.test(s)) return 'ארבעה רווחים ברצף';
  return null;
}

const API_SAMPLE = {
  'קישור': 'https://sarahbcosmetics.com/tor/book.html#/my/k7Qm2xPa',
  'פייבוקס': '050-0000000',
  'חשבון': 'בנק 00, סניף 000, חשבון 000000',
};

export function apiTemplates(msg, settings = null, { home = false } = {}) {
  const text = messageText(msg, settings);
  const fixed = {};
  if (msg.vars.includes('הדרך')) fixed['הדרך'] = home ? '' : CLINIC_WAY;
  const pieces = splitForMeta(fillMessage(text, fixed));
  const sample = { ...sampleVars(msg), ...API_SAMPLE };
  const base = templateBase(msg, home);
  const cat = templateCategory(msg) === 'marketing' ? 'MARKETING' : 'UTILITY';
  return pieces.map((p, i) => {
    const { body, params } = numberParams(p);
    return {
      msgId: msg.id, n: msg.n,
      base: pieces.length > 1 ? `${base}_p${i + 1}` : base,
      part: i + 1, parts: pieces.length,
      language: 'he', metaCategory: cat, body, params,
      examples: params.map((k) => String(sample[k] != null ? sample[k] : '')),
      issues: metaIssues(body),
    };
  });
}

export function metaCreatePayload(t, name = t.base) {
  const comp = { type: 'BODY', text: t.body };
  if (t.params.length) comp.example = { body_text: [t.examples] };
  return { name, language: t.language, category: t.metaCategory, components: [comp] };
}

export const bodyOf = (t) => {
  const c = ((t && t.components) || []).find((x) => String(x.type || '').toUpperCase() === 'BODY');
  return String((c && c.text) || '').replace(/\r\n?/g, '\n');
};

const versionRe = (base) => new RegExp(`^${base.replace(/[^a-z0-9_]/g, '')}(?:_v(\\d+))?$`);

export function findApproved(list, base, body, language = 'he') {
  const re = versionRe(base);
  const want = String(body).replace(/\r\n?/g, '\n');
  return (list || []).find((t) => re.test(t.name) && t.language === language && t.status === 'APPROVED' && bodyOf(t) === want) || null;
}

export function versionsOf(list, base, language = 'he') {
  const re = versionRe(base);
  return (list || []).filter((t) => t.language === language && re.test(t.name))
    .map((t) => ({ t, v: Number(re.exec(t.name)[1] || 1) }));
}

export function nextName(list, base, language = 'he') {
  const vs = versionsOf(list, base, language).map((x) => x.v);
  return vs.length ? `${base}_v${Math.max(...vs) + 1}` : base;
}

export function apiTemplateList(settings = null, ids = null) {
  const out = [];
  for (const msg of MESSAGES) {
    if (ids && !ids.includes(msg.id)) continue;
    out.push(...apiTemplates(msg, settings));
    if (msg.vars.includes('הדרך')) out.push(...apiTemplates(msg, settings, { home: true }));
  }
  return out;
}

export function apiSendParts(item, settings = null) {
  const msg = getMessage(item.msgId);
  const home = msg.vars.includes('הדרך') && !!item.vars && item.vars['הדרך'] === '';
  return apiTemplates(msg, settings, { home }).map((t) => ({
    base: t.base, part: t.part, parts: t.parts, body: t.body, language: t.language,
    values: t.params.map((k) => String((item.vars && item.vars[k]) ?? '')),
  }));
}

export const API_FRESH_MIN = 25;

export function itemBase(item) {
  const msg = getMessage(item.msgId);
  const home = msg.vars.includes('הדרך') && !!item.vars && item.vars['הדרך'] === '';
  return templateBase(msg, home);
}

export function apiState(settings, now = new Date()) {
  const hb = (settings && settings.outboxApi) || null;
  const age = hb && hb.at ? (now.getTime() - Date.parse(hb.at)) / 60000 : Infinity;
  return {
    on: !!(settings && settings.autoSend === true),
    seen: !!hb,
    alive: !!hb && age < API_FRESH_MIN && hb.kapso === 'ok' && !hb.stop,
    ready: new Set((hb && hb.ready) || []),
    failed: new Map(((hb && hb.failed) || []).map((f) => [f.key, f])),   // key ⇒ { at, unsure?, partsSent? }
    templates: (hb && hb.templates) || [],
    hb,
  };
}

export const sendsItself = (item, st) => st.on && st.alive && st.ready.has(itemBase(item)) && !st.failed.has(item.key);
