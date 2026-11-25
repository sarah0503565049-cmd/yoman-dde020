
import {
  diffState, compactOutbox, pendingKeys, mergeRemote, nextCursor, firstLink, stateFromRows, rowKey,
} from '../lib/sync.js';

const parse = (raw) => {
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return undefined; } // undefined = קיים אבל שבור
};

export function createSyncStorage({ local, remote, key = 'torim.v1' } = {}) {
  const OUTBOX_KEY = `${key}.outbox`;
  const SYNC_KEY = `${key}.sync`;
  const REJECTED_KEY = `${key}.rejected`;

  let raw = local.getItem(key); // המצב כמחרוזת, בזיכרון
  let outbox = (() => {
    const o = parse(local.getItem(OUTBOX_KEY));
    return Array.isArray(o) ? o : [];
  })();
  let meta = (() => {
    const m = parse(local.getItem(SYNC_KEY));
    return m && typeof m === 'object' ? { linked: !!m.linked, cursor: m.cursor || null } : { linked: false, cursor: null };
  })();

  let rejected = (() => {
    const r = parse(local.getItem(REJECTED_KEY));
    return Array.isArray(r) ? r : [];
  })();

  let failed = false;        // האם הדחיפה או המשיכה האחרונה נכשלה
  let inflightFlush = null;
  let inflightPull = null;
  let inflightStart = null;
  let pulling = 0;           // כמה משיכות רצות עכשיו
  let sentWhilePulling = new Set(); // שורות שנשלחו בזמן משיכה: התשובה שלה עלולה להיות ישנה מהן
  let unlisten = null;
  const listeners = new Set();

  const saveOutbox = () => local.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  const saveMeta = () => local.setItem(SYNC_KEY, JSON.stringify(meta));
  const saveRejected = () => local.setItem(REJECTED_KEY, JSON.stringify(rejected));
  const emit = () => {
    for (const fn of [...listeners]) {
      try { fn(); } catch { /* מנוי שזרק לא שובר את השאר */ }
    }
  };

  function saveState(state) {
    raw = JSON.stringify(state);
    local.setItem(key, raw);
  }

  function applyRows(rows, pending) {
    const cur = parse(raw);
    if (cur === undefined) return false; // מצב שבור: store.js יטפל בו, לא דורסים
    const base = cur || { version: 1, seededOn: null };
    const { state, changed } = mergeRemote(base, rows, pending);
    if (!changed) return false;
    saveState(state);
    emit();
    return true;
  }

  function setItem(k, v) {
    if (k !== key) { local.setItem(k, v); return; }
    const prev = parse(raw);
    raw = String(v);
    local.setItem(key, raw);
    if (!meta.linked) return; // לפני החיבור הראשון לא מכניסים כלום לתור
    const next = parse(raw);
    if (!next) return;
    const ops = diffState(prev || null, next);
    if (!ops.length) return;
    outbox = compactOutbox([...outbox, ...ops]);
    saveOutbox();
    flush();
  }

  function localChanged() {
    const cur = local.getItem(key);
    if (cur == null || cur === raw) return false;
    if (parse(cur) === undefined) return false; // נכתב משהו שבור: לא מאמצים
    setItem(key, cur);
    emit();
    return true;
  }

  function flush() {
    if (inflightFlush) return inflightFlush;
    if (!meta.linked || !outbox.length) return Promise.resolve(true);
    const snapshot = outbox.slice();
    const sent = compactOutbox(snapshot);
    inflightFlush = (async () => {
      try {
        const res = await remote.push(sent);
        const gone = new Set(snapshot);
        outbox = outbox.filter((op) => !gone.has(op)); // מה שנוסף בזמן הדחיפה נשאר
        saveOutbox();
        const bad = new Map(((res && res.rejected) || []).map((x) => [rowKey(x.table, x.id), x.reason || '']));
        if (bad.size) {
          for (const op of sent) {
            const k = rowKey(op.table, op.id);
            if (bad.has(k)) rejected.push({ ...op, reason: bad.get(k), at: new Date().toISOString() });
          }
          saveRejected();
        }
        if (pulling) for (const op of sent) sentWhilePulling.add(rowKey(op.table, op.id));
        failed = false;
        return true;
      } catch {
        failed = true;
        return false;
      } finally {
        inflightFlush = null;
      }
    })();
    const run = inflightFlush;
    run.then((sentOk) => { if (sentOk && outbox.length && !inflightFlush) flush(); });
    return run;
  }

  function pullNow() {
    if (inflightPull) return inflightPull;
    if (!meta.linked) return Promise.resolve(false);
    inflightPull = (async () => {
      pulling++;
      if (pulling === 1) sentWhilePulling = new Set();
      try {
        const rows = await remote.pull(meta.cursor);
        const pending = pendingKeys(outbox);
        for (const k of sentWhilePulling) pending.add(k);
        applyRows(rows, pending);
        const cursor = nextCursor(meta.cursor, rows);
        if (cursor !== meta.cursor) { meta.cursor = cursor; saveMeta(); }
        failed = false;
        return true;
      } catch {
        failed = true;
        return false;
      } finally {
        pulling--;
        inflightPull = null;
      }
    })();
    return inflightPull;
  }

  async function wake() {
    await flush();
    await pullNow();
  }

  function startListening() {
    if (unlisten) { unlisten(); unlisten = null; }
    const off = remote.listen((rows) => {
      try { applyRows(rows, pendingKeys(outbox)); } catch { /* שורה לא תקינה לא מפילה את ההאזנה */ }
    });
    unlisten = typeof off === 'function' ? off : null;
  }

  async function firstLinkNow() {
    const count = await remote.count(); // נכשל ⇒ start נדחה ושום דבר לא מסומן כמחובר
    if (firstLink(count) === 'push') {
      const cur = parse(raw);
      outbox = cur ? compactOutbox(diffState(null, cur)) : [];
      saveOutbox();
    } else {
      const rows = await remote.pull(null);
      const cur = parse(raw);
      const seededOn = cur && cur.seededOn ? cur.seededOn : null;
      saveState(stateFromRows(rows, { seededOn, historyAdded: true }));
      outbox = [];
      saveOutbox();
      meta.cursor = nextCursor(null, rows);
    }
    meta.linked = true;
    saveMeta();
    failed = false;
    if (firstLink(count) === 'adopt') emit();
  }

  function start() {
    if (inflightStart) return inflightStart;
    inflightStart = (async () => {
      try {
        if (!meta.linked) {
          try { await firstLinkNow(); } catch (e) { failed = true; throw e; }
          startListening();
          wake().catch(() => {}); // החיבור הראשון מתחיל לשלוח לבד, ברקע
        } else {
          startListening();
          wake().catch(() => {}); // ברקע, wake לא זורקת
        }
      } finally {
        inflightStart = null;
      }
    })();
    return inflightStart;
  }

  function stop() {
    if (unlisten) { unlisten(); unlisten = null; }
  }

  return {
    getItem: (k) => (k === key ? raw : local.getItem(k)),
    setItem,
    removeItem(k) {
      if (k !== key) { local.removeItem(k); return; }
      raw = null;
      local.removeItem(key);
    },
    start, stop, flush, pullNow, wake, localChanged,
    status: () => (rejected.length ? 'error' : failed ? 'offline' : outbox.length ? 'pending' : 'synced'),
    rejected: () => rejected.map((r) => ({ ...r })),
    clearRejected() { rejected = []; saveRejected(); },
    onChange(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
