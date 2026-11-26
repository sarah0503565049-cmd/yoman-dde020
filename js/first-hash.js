let first = '';
try { first = typeof location !== 'undefined' ? String(location.hash || '') : ''; } catch { first = ''; }

export function takeFirstHash() {
  const h = first;
  first = '';
  return h;
}
