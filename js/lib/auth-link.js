
const LINK_KEYS = ['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'type', 'sb',
  'provider_token', 'provider_refresh_token', 'error', 'error_code', 'error_description', 'token_hash'];

const num = (v) => { const n = Number(v); return Number.isFinite(n) && v !== null && v !== '' ? n : null; };

export function parseAuthLink(hash = '', search = '') {
  const h = String(hash || '').replace(/^#/, '');
  if (h && !h.startsWith('/')) {
    const p = new URLSearchParams(h);
    if (p.get('error') || p.get('error_code') || p.get('error_description')) {
      return { kind: 'error', code: p.get('error_code') || p.get('error') || 'unknown', description: p.get('error_description') || '' };
    }
    const accessToken = p.get('access_token');
    const refreshToken = p.get('refresh_token');
    if (accessToken && refreshToken) {
      return {
        kind: 'session', accessToken, refreshToken,
        expiresIn: num(p.get('expires_in')), expiresAt: num(p.get('expires_at')),
        tokenType: p.get('token_type') || 'bearer', type: p.get('type') || '',
      };
    }
    if (accessToken || refreshToken) return { kind: 'error', code: 'incomplete', description: '' };
  }
  const q = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  if (q.get('error_code') || q.get('error_description')) {
    return { kind: 'error', code: q.get('error_code') || q.get('error') || 'unknown', description: q.get('error_description') || '' };
  }
  const tokenHash = q.get('token_hash');
  if (tokenHash && q.get('type') === 'recovery') return { kind: 'token-hash', tokenHash, type: 'recovery' };
  return null;
}

export function stripsAtOnce(link) {
  return !!link && (link.kind === 'session' || link.kind === 'error');
}

export function cleanAddress(pathname = '/', search = '') {
  const q = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  for (const k of LINK_KEYS) q.delete(k);
  const s = q.toString();
  return `${pathname}${s ? `?${s}` : ''}#/home`;
}

export function wantsNewPassword(link) {
  return !!link && (link.type === 'recovery' || link.type === 'invite');
}

function b64urlJson(part) {
  const b = String(part).replace(/-/g, '+').replace(/_/g, '/');
  const padded = b + '='.repeat((4 - (b.length % 4)) % 4);
  let text;
  if (typeof atob === 'function') {
    const bin = atob(padded);
    text = decodeURIComponent(Array.from(bin, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
  } else {
    text = Buffer.from(padded, 'base64').toString('utf8');
  }
  return JSON.parse(text);
}

export function tokenClaims(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return {};
    const c = b64urlJson(parts[1]);
    return c && typeof c === 'object' ? c : {};
  } catch {
    return {};
  }
}

export function sessionLevel(session) {
  if (!session || !session.access_token) return { aal: null, factors: 0, factorIds: [] };
  const claims = tokenClaims(session.access_token);
  const list = (session.user && Array.isArray(session.user.factors) ? session.user.factors : []).filter((f) => f && f.status === 'verified');
  return {
    aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
    factors: list.length,
    factorIds: list.filter((f) => f.factor_type === 'totp' && f.id).map((f) => f.id),
  };
}

export function needsCode(level) {
  return !!level && level.factors > 0 && level.aal !== 'aal2';
}

export function trustedDevice(f = {}) {
  const s = f.session;
  return !!f.known && !!s && (s.kind === 'unknown' || s.user === f.mark);
}

export function bootStep(f = {}) {
  const cfg = f.config || {};
  if (!(cfg.url && cfg.key)) return cfg.missing && f.realDevice ? 'offline-stop' : 'demo';
  if (cfg.problem) return 'config-problem';

  const link = f.link;
  if (link && link.kind === 'error') return 'link-expired';
  if (link && link.kind === 'token-hash') return 'link-new-password';
  if (link && link.kind === 'session') return 'link-session';

  const s = f.session;
  if (!s) return 'read-session';
  if (s.kind === 'out') return 'login';
  if (s.kind === 'in' && needsCode(s)) return 'code';   // גם בלי רשת: בלי הקוד לא נכנסים (נשאר רק "חזרה לכניסה")
  if (f.recovering) return s.kind === 'in' ? 'new-password' : 'first-run';

  const trusted = trustedDevice(f);
  if (s.kind !== 'in' && !trusted) return 'first-run';
  if (f.owner === undefined) return 'ask-owner';
  if (f.owner === 'code') return 'code';
  if (f.owner === 'out') return 'login';
  if (f.owner === 'no') return 'not-owner';
  if (f.owner !== 'yes' && !trusted) return 'first-run';
  return 'open';
}
