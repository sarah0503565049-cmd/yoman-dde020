
import { sessionLevel } from './auth-link.js';

export const ISSUER = 'Sarah B';          // השם שמופיע באפליקציית האימות, ליד המייל
export const FACTOR_NAME = 'יומן';        // השם של הקוד בלוח הבקרה של Supabase

export function authProblem(err) {
  if (!err) return null;
  if (err.name === 'AuthSessionMissingError') return 'out';
  const status = typeof err.status === 'number' ? err.status : 0;
  if (err.name === 'AuthRetryableFetchError' || !status || status >= 500 || status === 408) return 'offline';
  if (status === 429) return 'wait';
  switch (err.code) {
    case 'mfa_verification_failed': return 'wrong';
    case 'mfa_challenge_expired': return 'expired';
    case 'insufficient_aal': return 'aal';
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
      return 'out';
    case 'weak_password': return 'weak';
    case 'same_password': return 'same';
    default: return 'failed';
  }
}

async function call(fn) {
  try {
    const r = await fn();
    return r && typeof r === 'object' ? r : { data: null, error: null };
  } catch (err) {
    return { data: null, error: err && typeof err === 'object' ? err : { name: 'AuthRetryableFetchError', status: 0 } };
  }
}

const digits = (code) => String(code || '').replace(/\D/g, '');

export async function listTotp(auth) {
  const r = await call(() => auth.mfa.listFactors());
  if (r.error) return { problem: authProblem(r.error) };
  const all = (r.data && Array.isArray(r.data.all) ? r.data.all : []).filter((f) => f && f.factor_type === 'totp');
  return { verified: all.filter((f) => f.status === 'verified'), unverified: all.filter((f) => f.status !== 'verified') };
}

export async function verifyCode(auth, factorIds, code) {
  const c = digits(code);
  if (c.length !== 6) return 'wrong';
  let ids = Array.isArray(factorIds) ? factorIds.filter(Boolean) : [];
  if (!ids.length) {
    const l = await listTotp(auth);
    if (l.problem) return l.problem;
    ids = l.verified.map((f) => f.id);
  }
  if (!ids.length) return 'none';
  let last = 'wrong';
  for (const factorId of ids) {
    const r = await call(() => auth.mfa.challengeAndVerify({ factorId, code: c }));
    if (!r.error) return 'ok';
    last = authProblem(r.error);
    if (last !== 'wrong') return last;   // רשת, המתנה, אתגר שפג: לא ממשיכים לקוד הבא
  }
  return last;
}

export async function currentLevel(auth) {
  const r = await call(() => auth.getSession());
  return sessionLevel(r.data && r.data.session);
}

export async function whyRefused(auth) {
  const r = await call(() => auth.getUser());
  if (r.error) return authProblem(r.error) === 'out' ? 'out' : 'no';
  const user = r.data && r.data.user;
  const verified = (user && Array.isArray(user.factors) ? user.factors : []).some((f) => f && f.status === 'verified');
  if (!verified) return 'no';
  const lvl = await currentLevel(auth);
  return lvl.aal === 'aal2' ? 'no' : 'code';
}

export async function openLinkSession(auth, link) {
  if (!link || !link.accessToken || !link.refreshToken) return 'expired';
  const r = await call(() => auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken }));
  if (r.error) return authProblem(r.error) === 'offline' ? 'offline' : 'expired';
  if (!r.data || !r.data.session) return 'expired';
  return 'ok';
}

export async function setNewPassword(auth, password) {
  const r = await call(() => auth.updateUser({ password }));
  if (!r.error) return 'ok';
  const p = authProblem(r.error);
  if (p === 'same') return 'ok';   // אותה סיסמה כמו קודם: אין מה לשנות, ממשיכים
  if (p === 'weak' || p === 'aal' || p === 'offline') return p;
  return 'expired';
}

const SVG_PREFIX = /^data:image\/svg\+xml;(utf-?8|charset=utf-?8),/i;

export function qrImage(qr) {
  const v = String(qr || '');
  const m = SVG_PREFIX.exec(v);
  if (!m) return v.trim().startsWith('<svg') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(v.trim())}` : v;
  const raw = v.slice(m[0].length);
  let svg = raw;
  if (/%[0-9a-f]{2}/i.test(raw) && !raw.includes('<')) { try { svg = decodeURIComponent(raw); } catch { svg = raw; } }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function mfaState(auth) {
  const l = await listTotp(auth);
  if (l.problem) return { problem: l.problem };
  return { state: l.verified.length ? 'on' : 'off' };
}

export async function startEnroll(auth) {
  const l = await listTotp(auth);
  if (l.problem) return { problem: l.problem };
  if (l.verified.length) return { state: 'on' };
  for (const f of l.unverified) {
    const u = await call(() => auth.mfa.unenroll({ factorId: f.id }));
    if (u.error && authProblem(u.error) === 'offline') return { problem: 'offline' };
  }
  let r = await call(() => auth.mfa.enroll({ factorType: 'totp', issuer: ISSUER, friendlyName: FACTOR_NAME }));
  if (r.error && r.error.code === 'mfa_factor_name_conflict') {
    r = await call(() => auth.mfa.enroll({ factorType: 'totp', issuer: ISSUER, friendlyName: `${FACTOR_NAME} ${Date.now()}` }));
  }
  if (r.error) return { problem: authProblem(r.error) };
  const d = r.data || {};
  const totp = d.totp || {};
  if (!d.id || !totp.secret) return { problem: 'failed' };
  return { factorId: d.id, qr: qrImage(totp.qr_code), secret: totp.secret, uri: totp.uri || '' };
}

export async function confirmEnroll(auth, factorId, code) {
  return verifyCode(auth, [factorId], code);
}

export async function cancelEnroll(auth, factorId) {
  if (!factorId) return;
  const l = await listTotp(auth);
  if (l.problem || !l.unverified.some((f) => f.id === factorId)) return;
  await call(() => auth.mfa.unenroll({ factorId }));
}

export async function removeWithCode(auth, code) {
  const l = await listTotp(auth);
  if (l.problem) return l.problem;
  if (!l.verified.length) return 'ok';
  const v = await verifyCode(auth, l.verified.map((f) => f.id), code);
  if (v !== 'ok') return v;
  for (const f of [...l.verified, ...l.unverified]) {
    const u = await call(() => auth.mfa.unenroll({ factorId: f.id }));
    if (u.error) return authProblem(u.error);
  }
  return 'ok';
}
