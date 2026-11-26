
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
