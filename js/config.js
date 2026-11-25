export const SUPABASE = { url: "https://gwwqyickcxibxfqpjbgs.supabase.co", key: "sb_publishable_PmffPg6WVJtCxvIIBY598g_VvbCzr2t" };

const b64urlDecode = (s) => {
  const b = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const padded = b + '='.repeat((4 - (b.length % 4)) % 4);
  if (typeof atob === 'function') {
    const bin = atob(padded);
    return decodeURIComponent(Array.from(bin, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
  }
  return Buffer.from(padded, 'base64').toString('utf8');
};

export function configProblem(cfg) {
  const key = cfg && typeof cfg.key === 'string' ? cfg.key.trim() : '';
  if (!key) return null;
  const msg = 'זה מפתח סודי ואסור לשים אותו באפליקציה. צריך את המפתח הציבורי בלבד.';
  if (key.startsWith('sb_secret_')) return msg;
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(b64urlDecode(parts[1]));
      if (payload && payload.role === 'service_role') return msg;
    } catch { /* לא JWT קריא: לא מסמנים */ }
  }
  return null;
}
