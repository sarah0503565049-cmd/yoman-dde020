
export const TABLES = ['services', 'clients', 'appointments', 'blocks'];
export const SETTINGS_ID = 'main';

export const rowKey = (table, id) => `${table}/${id}`;

export const auditKey = (e) => `${e.at}|${e.action}|${e.apptId || ''}`;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const list = (x) => (Array.isArray(x) ? x : []);
const byId = (arr) => new Map(list(arr).filter((r) => r && r.id != null).map((r) => [String(r.id), r]));

export function diffState(prev, next) {
  const ops = [];
  const p = prev || {};
  const n = next || {};
  if (n.settings && !same(p.settings, n.settings)) {
    ops.push({ table: 'settings', id: SETTINGS_ID, kind: 'put', doc: n.settings });
  }
  for (const table of TABLES) {
    const before = byId(p[table]);
    const after = byId(n[table]);
    for (const [id, doc] of after) {
      if (!before.has(id) || !same(before.get(id), doc)) ops.push({ table, id, kind: 'put', doc });
    }
    for (const id of before.keys()) {
      if (!after.has(id)) ops.push({ table, id, kind: 'gone', doc: null });
    }
  }
  const seen = new Set(list(p.audit).map(auditKey));
  for (const e of list(n.audit)) {
    const key = auditKey(e);
    if (!seen.has(key)) {
      seen.add(key);
      ops.push({ table: 'audit', id: key, kind: 'put', doc: e });
    }
  }
  return ops;
}

export function compactOutbox(ops) {
  const last = new Map();
  list(ops).forEach((op, i) => last.set(rowKey(op.table, op.id), i));
  return list(ops).filter((op, i) => last.get(rowKey(op.table, op.id)) === i);
}

export const pendingKeys = (ops) => new Set(list(ops).map((op) => rowKey(op.table, op.id)));

export function mergeRemote(state, rows, pending = new Set()) {
  const next = { ...state };
  for (const t of TABLES) next[t] = list(state && state[t]).slice();
  next.audit = list(state && state.audit).slice();
  let changed = false;
  let auditAdded = false;
  const auditSeen = new Set(next.audit.map(auditKey));

  for (const row of list(rows)) {
    if (!row || !row.table) continue;
    if (row.table === 'audit') {
      if (row.gone || !row.doc) continue;
      const key = auditKey(row.doc);
      if (auditSeen.has(key)) continue;
      auditSeen.add(key);
      next.audit.push(row.doc);
      auditAdded = true;
      changed = true;
      continue;
    }
    if (pending.has(rowKey(row.table, row.id))) continue;
    if (row.table === 'settings') {
      if (row.gone || !row.doc) continue;
      if (!same(next.settings, row.doc)) { next.settings = row.doc; changed = true; }
      continue;
    }
    if (!TABLES.includes(row.table)) continue;
    const arr = next[row.table];
    const i = arr.findIndex((r) => r && String(r.id) === String(row.id));
    if (row.gone || !row.doc) {
      if (i >= 0) { arr.splice(i, 1); changed = true; }
    } else if (i < 0) {
      arr.push(row.doc);
      changed = true;
    } else if (!same(arr[i], row.doc)) {
      arr[i] = row.doc;
      changed = true;
    }
  }
  if (auditAdded) next.audit.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return { state: next, changed };
}

export function nextCursor(cursor, rows) {
  let best = cursor || null;
  let bestMs = best ? Date.parse(best) : -Infinity;
  for (const r of list(rows)) {
    const ms = r && r.updated_at ? Date.parse(r.updated_at) : NaN;
    if (Number.isFinite(ms) && ms > bestMs) { bestMs = ms; best = r.updated_at; }
  }
  return best;
}

export function firstLink(remoteCount) {
  return remoteCount > 0 ? 'adopt' : 'push';
}

export function stateFromRows(rows, base = {}) {
  const empty = { version: 1, seededOn: null, ...base, settings: null, services: [], clients: [], appointments: [], blocks: [], audit: [] };
  return mergeRemote(empty, rows).state;
}
