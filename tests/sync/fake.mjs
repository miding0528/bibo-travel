// In-memory fake of the parts of supabase-js that sync.js uses, with shared DB + realtime fan-out.
import fs from 'node:fs';
export const seed = JSON.parse(fs.readFileSync(new URL('../../src/data/seed.json', import.meta.url)));
let clock = Date.parse('2026-10-15T04:00:00Z') * 1000; // microseconds
export function pgTs() {
  clock += 1 + Math.floor(Math.random() * 5000);
  const ms = Math.floor(clock / 1000), us = clock % 1000;
  const d = new Date(ms).toISOString().replace('Z', '');
  const [a, frac] = d.split('.');
  let f = frac + String(us).padStart(3, '0');
  f = f.replace(/0+$/, '');
  return a + (f ? '.' + f : '') + '+00:00';
}
export class FakeDB {
  constructor() {
    this.trip = { id: 'trip-1', code: 'BIBO-TEST-00', name: '測試行程', seed_version: 0, seed_ids: null };
    this.items = new Map(); this.members = []; this.subs = new Set(); this.log = []; this.failNext = 0; this.users = 0;
  }
  key(r) { return r.collection + '|' + r.item_id; }
  broadcast(row, type) { this.subs.forEach(s => { if (s.active) setTimeout(() => s.cb({ eventType: type, new: row, old: {} }), 5); }); }
}
export function makeClient(db, { offlineRef = { v: false } } = {}) {
  let session = null; const user = { id: 'u' + (++db.users) };
  const guard = () => { if (offlineRef.v) { const e = new TypeError('Failed to fetch'); throw e; } if (db.failNext > 0) { db.failNext--; const e = new Error('boom 500'); e.code = '500'; throw e; } };
  const client = {
    auth: {
      async getSession() { return { data: { session }, error: null }; },
      async signInAnonymously() { guard(); session = { user }; return { data: { session }, error: null }; },
    },
    async rpc(name, args) {
      guard();
      if (name === 'join_trip') {
        if (String(args.p_code).trim().toUpperCase() !== db.trip.code) return { data: null, error: { message: 'invalid_code', code: 'P0002' } };
        if (!db.members.find(m => m.user_id === user.id)) db.members.push({ user_id: user.id, nickname: args.p_nickname });
        return { data: [{ trip_id: db.trip.id, name: db.trip.name, code: db.trip.code, seed_version: db.trip.seed_version, seed_ids: db.trip.seed_ids }], error: null };
      }
      if (name === 'leave_trip') {
        const n = db.members.length; db.members = db.members.filter(m => m.user_id !== user.id);
        return { data: n - db.members.length, error: null };
      }
      if (name === 'set_trip_seed') {
        if (db.trip.seed_version < args.p_version) { db.trip.seed_version = args.p_version; db.trip.seed_ids = args.p_ids; return { data: true, error: null }; }
        return { data: false, error: null };
      }
    },
    from(table) {
      const q = { table, filters: [], orders: [], sel: '*' };
      const b = {
        select(c) { q.sel = c; return b; },
        eq(k, v) { q.filters.push(['eq', k, v]); return b; },
        gte(k, v) { q.filters.push(['gte', k, v]); return b; },
        order(k) { q.orders.push(k); return b; },
        range(a, z) { q.range = [a, z]; return b; },
        upsert(rows, opts) { q.upsert = { rows: Array.isArray(rows) ? rows : [rows], opts }; return b; },
        async maybeSingle() { const r = await b.then(x => x); return { data: r.data && r.data[0] || null, error: r.error }; },
        then(res, rej) { return exec().then(res, rej); },
      };
      async function exec() {
        try { guard(); } catch (e) { return { data: null, error: e, __thrown: true }; }
        if (table === 'trips') return { data: [db.trip], error: null };
        if (table === 'members') return { data: db.members.map(m => ({ nickname: m.nickname })), error: null };
        if (q.upsert) {
          const out = [];
          for (const r of q.upsert.rows) {
            const k = db.key(r); const ex = db.items.get(k);
            if (ex && q.upsert.opts?.ignoreDuplicates) continue;
            const row = { trip_id: r.trip_id, collection: r.collection, item_id: r.item_id, data: JSON.parse(JSON.stringify(r.data)), deleted: !!r.deleted, updated_at: pgTs(), updated_by: user.id };
            db.items.set(k, row); db.broadcast(row, ex ? 'UPDATE' : 'INSERT'); out.push({ collection: row.collection, item_id: row.item_id, updated_at: row.updated_at });
            db.log.push(['upsert', k, user.id]);
          }
          return { data: out, error: null };
        }
        let rows = [...db.items.values()];
        for (const [op, k, v] of q.filters) rows = rows.filter(r => op === 'eq' ? r[k] === v : tsNum(r[k]) >= tsNum(v));
        rows.sort((a, b) => tsNum(a.updated_at) - tsNum(b.updated_at));
        if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
        return { data: JSON.parse(JSON.stringify(rows)), error: null };
      }
      return b;
    },
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(path, ttl) {
            guard();
            if (!db.members.find(m => m.user_id === user.id)) return { data: null, error: { message: 'Object not found' } };
            return { data: { signedUrl: 'https://fake.storage/' + bucket + '/' + path + '?ttl=' + ttl }, error: null };
          },
        };
      },
    },
    channel() {
      const sub = { active: false, cb: null };
      const ch = { on(_t, _f, cb) { sub.cb = cb; return ch; }, subscribe(f) { sub.active = true; db.subs.add(sub); setTimeout(() => f && f('SUBSCRIBED'), 1); return ch; }, _sub: sub };
      return ch;
    },
    removeChannel(ch) { ch._sub.active = false; db.subs.delete(ch._sub); },
    user,
  };
  return client;
}
export function tsNum(s) { const m = /^(.*?)(?:\.(\d+))?(Z|[+-]\d\d:?\d\d)?$/.exec(s); return Math.floor(Date.parse(m[1] + (m[3] || 'Z')) / 1000) * 1e6 + (m[2] ? Number((m[2] + '000000').slice(0, 6)) : 0); }
