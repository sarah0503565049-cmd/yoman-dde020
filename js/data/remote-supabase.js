
export const TABLES = ['settings', 'services', 'clients', 'appointments', 'blocks', 'audit'];
const PAGE = 1000;   // מקסימום שורות בבקשה אחת מה-API
const BATCH = 500;
const OVERLAP_MS = 2 * 60 * 1000;   // כמה אחורה מהסמן מבקשים בכל משיכה
const COLS = 'id, doc, gone, updated_at';

function classify(res) {
  if (!res) return 'fail';
  if (!res.error) return 'ok';
  const s = Number(res.status);
  if (s >= 400 && s < 500 && s !== 401 && s !== 403 && s !== 408 && s !== 429) return 'refused';
  return 'fail';
}

const reasonOf = (res) => String((res.error && (res.error.message || res.error.code)) || `status ${res.status}`);

function failError(what, res) {
  const e = new Error(res && res.error ? `${what}: ${reasonOf(res)}` : `${what}: אין תשובה`);
  e.status = res ? res.status : undefined;
  return e;
}

export function createRemote(client) {
  async function run(build) {
    const res = await build();
    return res;
  }

  const since = (cursor) => {
    const ms = Date.parse(cursor);
    return Number.isFinite(ms) ? new Date(ms - OVERLAP_MS).toISOString() : cursor;
  };
  const quote = (v) => `"${String(v).replace(/["\\]/g, '')}"`;

  async function pull(cursor) {
    const out = [];
    for (const table of TABLES) {
      let last = null;
      for (;;) {
        let q = client.from(table).select(COLS);
        if (last) {
          q = q.or(`updated_at.gt.${quote(last.updated_at)},and(updated_at.eq.${quote(last.updated_at)},id.gt.${quote(last.id)})`);
        } else if (cursor) {
          q = q.gte('updated_at', since(cursor));
        }
        const res = await run(() => q.order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(PAGE));
        if (!res || res.error) throw failError(`pull ${table}`, res);
        const data = Array.isArray(res.data) ? res.data : [];
        for (const r of data) out.push({ table, id: r.id, doc: r.doc ?? null, gone: !!r.gone, updated_at: r.updated_at });
        if (data.length < PAGE) break;
        const tail = data[data.length - 1];
        last = { updated_at: tail.updated_at, id: tail.id };
      }
    }
    return out;
  }

  async function sendRows(table, rows) {
    const opts = table === 'audit' ? { onConflict: 'id', ignoreDuplicates: true } : { onConflict: 'id' };
    const res = await run(() => client.from(table).upsert(rows, opts));
    const c = classify(res);
    if (c === 'ok') return [];
    if (c === 'fail') throw failError(`push ${table}`, res);
    const rejected = [];
    for (const row of rows) { // המסד סירב לחבילה: שורה שורה, ורק הרעה נדחית
      const r1 = await run(() => client.from(table).upsert([row], opts));
      const c1 = classify(r1);
      if (c1 === 'fail') throw failError(`push ${table}`, r1);
      if (c1 === 'refused') rejected.push({ table, id: row.id, reason: reasonOf(r1) });
    }
    return rejected;
  }

  async function push(ops) {
    const rejected = [];
    for (const table of TABLES) {
      const mine = (ops || []).filter((o) => o.table === table);
      const puts = mine.filter((o) => o.kind !== 'gone').map((o) => ({ id: o.id, doc: o.doc, gone: false }));
      for (let i = 0; i < puts.length; i += BATCH) rejected.push(...await sendRows(table, puts.slice(i, i + BATCH)));
      if (table === 'audit') continue; // ביומן לא מוחקים ולא מעדכנים
      for (const o of mine.filter((x) => x.kind === 'gone')) {
        const res = await run(() => client.from(table).update({ gone: true }).eq('id', o.id));
        const c = classify(res);
        if (c === 'fail') throw failError(`push ${table}`, res);
        if (c === 'refused') rejected.push({ table, id: o.id, reason: reasonOf(res) });
      }
    }
    return rejected.length ? { rejected } : undefined;
  }

  function listen(fn) {
    const ch = client
      .channel('torim-sync')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        const n = payload && payload.new;
        if (!n || n.id == null || !TABLES.includes(payload.table)) return; // מחיקה אמיתית או טבלה זרה: מתעלמים
        fn([{ table: payload.table, id: n.id, doc: n.doc ?? null, gone: !!n.gone, updated_at: n.updated_at }]);
      })
      .subscribe();
    return () => { client.removeChannel(ch); };
  }

  async function count() {
    const results = await Promise.all(TABLES.map((t) =>
      run(() => client.from(t).select('id', { count: 'exact', head: true }).eq('gone', false))));
    let sum = 0;
    results.forEach((res, i) => {
      if (!res || res.error || typeof res.count !== 'number') throw failError(`count ${TABLES[i]}`, res);
      sum += res.count;
    });
    return sum;
  }

  async function isOwner() {
    const res = await run(() => client.rpc('is_owner'));
    if (!res || res.error) throw failError('is_owner', res);
    return res.data === true;
  }

  return { pull, push, listen, count, isOwner };
}
