import { FakeDB, seed, pgTs } from './fake.mjs';
import { Phone, sleep, proj, same, clone, freshStore } from './phone.mjs';
import assert from 'node:assert/strict';

let pass = 0; const ok = (name) => { pass++; console.log('PASS', name); };

const db = new FakeDB();
const A = new Phone('Lena', db);
const orig = proj(A.store);
await A.sync.join(' bibo-test-00 ', 'Lena');
assert.equal(db.items.size > 100, true, 'bootstrap rows');
assert.equal(db.trip.seed_version, seed.seedVersion);
assert.deepEqual(proj(A.store), orig); ok('A bootstraps empty trip, local STORE unchanged (' + db.items.size + ' rows)');
assert.equal(A.sync.status().pending, 0);

const B = new Phone('Key', db);
await B.sync.join('BIBO-TEST-00', 'Key');
same(A, B, 'B rebuilt from DB'); ok('B joins, rebuilt STORE equals A');
assert.equal(B.sync.status().pending, 0);
assert.equal(db.members.length, 2);

const Cx = new Phone('X', db);
await assert.rejects(Cx.sync.join('NOPE', 'x')); assert.equal(Cx.sync.isJoined(), false); ok('invalid code rejected, not joined');

const it = A.day(2).items[0]; it.done = true; A.persist();
await sleep(500);
assert.equal(B.day(2).items[0].done, true); same(A, B, 'tick'); ok('A ticks itinerary item -> B sees it (realtime)');
const it2 = B.day(2).items[1]; it2.done = true; B.persist(); await sleep(500);
assert.equal(A.day(2).items[1].done, true); ok('B ticks -> A sees');

B.store.expenses.push({ id: 'e-123', date: '12/27', title: '牛肉湯', amount: 40, payer: 'Key', method: '微信支付', split: 'even', feeApplied: false, rateOverride: 4.4 }); B.persist(); await sleep(500);
assert.equal(A.store.expenses.length, 3); same(A, B, 'expense'); ok('B adds expense -> A has it (order kept)');
A.store.expenses.find(e => e.id === 'e-123').amount = 55; A.persist(); await sleep(500);
assert.equal(B.store.expenses.find(e => e.id === 'e-123').amount, 55); ok('A edits expense -> B updated in place');
B.store.expenses.splice(B.store.expenses.findIndex(e => e.id === 'e-123'), 1); B.persist(); await sleep(500);
assert.equal(A.store.expenses.length, 2); ok('B deletes expense -> A removed');

A.store.checklist.prep.push({ id: 'prep-custom-1', title: '帶充電器', group: 'transport', done: false }); A.persist(); await sleep(700);
assert.ok(B.store.checklist.prep.find(x => x.id === 'prep-custom-1')); same(A, B, 'cl add');
B.store.checklist.prep.splice(B.store.checklist.prep.findIndex(x => x.id === 'prep-custom-1'), 1); B.persist(); await sleep(700);
assert.ok(!A.store.checklist.prep.find(x => x.id === 'prep-custom-1')); same(A, B, 'cl del'); ok('checklist add on A / delete on B');
const delSeed = A.store.checklist.packing[3].id; A.store.checklist.packing.splice(3, 1); A.persist(); await sleep(650);
assert.ok(!B.store.checklist.packing.find(x => x.id === delSeed)); ok('seed checklist item deleted -> B removed');

A.store.ticketStatus['t1'] = 'purchased'; A.store.ticketAlerts['t1'] = true; A.persist(); await sleep(700);
assert.equal(B.store.ticketStatus['t1'], 'purchased'); assert.equal(B.store.ticketAlerts['t1'], true); same(A, B, 'ticket');
B.store.ticketStatus['t1'] = 'ticketed'; B.persist(); await sleep(700);
assert.equal(A.store.ticketStatus['t1'], 'ticketed'); ok('ticket status/alert both directions');
B.store.tickets[0].note = '改過'; B.persist(); await sleep(650); assert.equal(A.store.tickets[0].note, '改過');

A.store.notes = '帶 2 瓶水\n第二行'; A.store.feePercent = 2; A.store.memberNames.Key = '阿奇'; A.store.fxRatesOverride['12/26'] = 4.5; A.persist(); await sleep(700);
assert.equal(B.store.notes, '帶 2 瓶水\n第二行'); assert.equal(B.store.feePercent, 2); assert.equal(B.store.memberNames.Key, '阿奇'); assert.equal(B.store.fxRatesOverride['12/26'], 4.5); ok('notes + settings sync');

const mv = A.day(3).items.splice(1, 1)[0]; A.day(4).items.splice(1, 0, mv); A.persist(); await sleep(700);
same(A, B, 'move'); assert.ok(B.day(4).items.find(x => x.id === mv.id)); ok('move item to another day (+ position)');
{ const d = B.day(4); const x = d.items[0]; d.items[0] = d.items[1]; d.items[1] = x; B.persist(); await sleep(700); same(A, B, 'reorder'); ok('reorder within day'); }
A.day(2).items.splice(2, 0, { id: 'c-1-1', title: '新增行程', time: '10:00', type: '景點', note: 'n' }); A.store.customSpots.push({ id: 'spot-1', name: '某景點', isCustom: true, day: undefined, intro: ['x'] }); A.persist(); await sleep(700);
same(A, B, 'custom'); assert.equal(B.store.customSpots.length, 1); ok('custom item + custom spot');

{ const x = A.day(5).items[0]; x.done = true; A.persist(); x.done = false; A.persist(); x.done = true; A.persist(); await sleep(700); assert.equal(A.day(5).items[0].done, true); assert.equal(B.day(5).items[0].done, true); same(A, B, 'rapid'); ok('rapid toggles settle consistently'); }

// ---------- offline ----------
db.log.length = 0;
A.setOffline(true);
A.day(2).items[3].done = true; A.persist();
A.store.expenses.push({ id: 'e-off', date: '12/28', title: '離線帳', amount: 9, payer: 'Lena', method: '現金', split: 'even', rateOverride: 4.4 }); A.persist();
A.store.notes = '離線筆記'; A.persist();
await sleep(600);
assert.equal(A.sync.status().pending, 3, 'pending=' + A.sync.status().pending);
assert.equal(db.log.length, 0); assert.equal(B.store.notes, '帶 2 瓶水\n第二行'); ok('offline: 3 edits queued, nothing sent');
const A2off = new Phone('Lena', db, { storage: A.storage, store: JSON.parse(A.storage.get('bibo-v3-store')) }); A2off.setOffline(true);
await A2off.sync.start({ hadStore: true }); assert.equal(A2off.sync.status().pending, 3); ok('reload while offline keeps outbox');
await A.goOnline(); await sleep(600);
assert.equal(A.sync.status().pending, 0); assert.ok(A.toasts.includes('已同步 3 筆'), JSON.stringify(A.toasts));
assert.equal(db.log.filter(l => l[0] === 'upsert').length, 3); same(A, B, 'offline flush'); ok('online: 3 rows arrive, toast, B gets them');

// ---------- reload ----------
const A3 = new Phone('Lena', db, { storage: A.storage, store: JSON.parse(A.storage.get('bibo-v3-store')) });
const cntBefore = db.items.size;
await A3.sync.start({ hadStore: true }); await sleep(650);
same(A, A3, 'reload'); assert.equal(db.items.size, cntBefore); assert.equal(A3.sync.status().pending, 0);
assert.ok(!A3.store.checklist.packing.find(x => x.id === delSeed)); ok('reload: same state, no dupes, deleted seed item stays deleted');
const C = new Phone('Key2', db); await C.sync.join('BIBO-TEST-00', 'Key2');
same(A, C, 'C'); assert.ok(!C.store.checklist.packing.find(x => x.id === delSeed)); ok('new phone joining existing trip gets DB state, not local seed');

// ---------- store wiped (reset) ----------
const wiped = new Phone('Lena', db, { storage: new Map(A.storage), store: freshStore() });
await wiped.sync.start({ hadStore: false }); await sleep(650);
same(A, wiped, 'reset'); assert.equal(wiped.sync.status().pending, 0);
assert.equal(db.items.size, cntBefore); ok('reset (store wiped) re-pulls without clobbering DB');

// ---------- conflict ----------
A.setOffline(true); B.day(2).items[0].title = 'B標題'; B.persist(); await sleep(650);
A.day(2).items[0].title = 'A標題'; A.persist(); await sleep(100);
await A.goOnline(); await sleep(500);
assert.equal(B.day(2).items[0].title, 'A標題'); assert.equal(A.day(2).items[0].title, 'A標題'); ok('conflict: later write (A on reconnect) wins on both');

// ---------- seed bump ----------
const Bnew = new Phone('Key', db, { storage: B.storage, store: JSON.parse(B.storage.get('bibo-v3-store')), seedVersion: seed.seedVersion + 1 });
Bnew.seedFn = (st) => { st.days[1].items.push({ id: 'seed-new-1', time: '09:00', type: '景點', title: '新種子項目' }); st.days[1].items[0].note = '種子改過'; };
await Bnew.sync.start({ hadStore: true }); await sleep(800);
assert.equal(Bnew.seedRuns, 1); assert.equal(db.trip.seed_version, seed.seedVersion + 1);
assert.ok(A.store.days[1].items.find(x => x.id === 'seed-new-1')); assert.equal(A.store.days[1].items[0].note, '種子改過'); ok('seed bump: runs after pull, trip seed_version bumped, other phone receives');
const Bnew2 = new Phone('Key', db, { storage: B.storage, store: JSON.parse(B.storage.get('bibo-v3-store')), seedVersion: seed.seedVersion + 1 });
await Bnew2.sync.start({ hadStore: true }); await sleep(650); assert.equal(Bnew2.seedRuns, 0); ok('seed sync not repeated once trip is at that version');

// ---------- deleting one row must not rewrite the others (ord / order churn) ----------
{
  await sleep(700);
  for (let i = 0; i < 4; i++) A.store.expenses.push({ id: 'del-x' + i, date: '12/27', title: 't' + i, amount: 1, payer: 'Lena', method: '現金', split: 'even', rateOverride: 4.4 });
  A.persist(); await sleep(700);
  assert.equal(A.sync.status().pending, 0);
  const outboxKeys = () => Object.keys(A.sync._debug.outbox());
  A.store.expenses.splice(A.store.expenses.findIndex(e => e.id === 'del-x1'), 1); A.persist(); await sleep(60);
  assert.deepEqual(outboxKeys(), ['expense|del-x1']); await sleep(700);
  A.store.checklist.prep.splice(0, 1); A.persist(); await sleep(60);
  assert.equal(outboxKeys().length, 1); await sleep(700);
  A.day(2).items.splice(0, 1); A.persist(); await sleep(60);
  assert.equal(outboxKeys().length, 1); await sleep(700);
  A.store.customSpots = A.store.customSpots || [];
  const lastId = A.day(2).items[A.day(2).items.length - 1].id;
  A.day(2).items.push({ id: 'new-last', time: '20:00', type: '景點', title: '新增在最後' }); A.persist(); await sleep(60);
  assert.deepEqual(outboxKeys(), ['dayItem|new-last']); await sleep(700);
  const moved = A.day(2).items.pop(); A.day(2).items.splice(1, 0, moved); A.persist(); await sleep(60);
  assert.deepEqual(outboxKeys(), ['dayItem|new-last']);
  await sleep(700);
  assert.equal(B.day(2).items[1].id, 'new-last');
  ok('deleting / appending / moving one row only rewrites that row (gaps in ord are fine)');
}

// ---------- ticketPrivate (read-only collection, written only by the upload tool) ----------
{
  const putPriv = (id, data, deleted) => {
    const row = { trip_id: db.trip.id, collection: 'ticketPrivate', item_id: id, data, deleted: !!deleted, updated_at: pgTs(), updated_by: 'tool' };
    const ex = db.items.has('ticketPrivate|' + id); db.items.set('ticketPrivate|' + id, row); db.broadcast(row, ex ? 'UPDATE' : 'INSERT');
  };
  const payload = { bookingCodes: [{ code: 'ABC123', holder: 'TEST' }], files: [{ label: '行程單', path: 'trip-1/tickets/x.pdf' }] };
  const before = db.log.length;
  putPriv('t1', payload); await sleep(500);
  assert.deepEqual(A.store.ticketPrivate.t1, payload); assert.deepEqual(B.store.ticketPrivate.t1, payload);
  assert.equal(A.sync.status().pending, 0); assert.equal(B.sync.status().pending, 0);
  A.persist(); B.persist(); await sleep(700);
  assert.equal(db.log.slice(before).filter(l => l[1].startsWith('ticketPrivate')).length, 0, 'phones never write ticketPrivate');
  assert.equal(db.items.get('ticketPrivate|t1').deleted, false);
  assert.ok(!Object.keys(A.sync._debug.outbox()).some(k => k.startsWith('ticketPrivate')));
  ok('ticketPrivate row lands in STORE.ticketPrivate on both phones and is never written back');
  putPriv('t1', { ...payload, bookingCodes: [{ code: 'ZZZ999' }] }); await sleep(500);
  assert.equal(A.store.ticketPrivate.t1.bookingCodes[0].code, 'ZZZ999');
  putPriv('t1', {}, true); await sleep(500);
  assert.equal(A.store.ticketPrivate.t1, undefined); assert.equal(B.store.ticketPrivate.t1, undefined);
  putPriv('t8', payload); await sleep(500);
  const F = new Phone('Fresh', db); await F.sync.join('BIBO-TEST-00', 'Fresh');
  assert.deepEqual(F.store.ticketPrivate.t8, payload); assert.equal(F.sync.status().pending, 0);
  ok('ticketPrivate update / tombstone propagate; a fresh phone pulls it on join');
  const sg = await F.sync.signFile('trip-1/tickets/x.pdf', 600);
  assert.ok(sg.url && sg.url.includes('ttl=600'), 'signed url'); ok('signFile returns a short-lived URL');
  F.setOffline(true);
  assert.equal((await F.sync.signFile('trip-1/tickets/x.pdf')).error.kind, 'offline'); F.setOffline(false); ok('signFile offline -> error kind offline');
  const nm = db.members.length;
  const left = await F.sync.leave();
  assert.equal(left, true); assert.equal(db.members.length, nm - 1); assert.equal(F.sync.isJoined(), false);
  assert.deepEqual(F.store.ticketPrivate, {}); ok('leave() removes own member row via leave_trip and clears ticketPrivate locally');
  putPriv('t8', {}, true); await sleep(300);
}

// ---------- transient errors ----------
db.failNext = 2; A.day(2).items[0].note = '重試'; A.persist(); await sleep(650);
console.log('status after failures', A.sync.status());
await sleep(7000);
console.log('status after backoff', A.sync.status(), 'B note:', B.day(2).items[0].note);
assert.equal(B.day(2).items[0].note, '重試'); ok('transient server errors retried with backoff');
console.log('\nALL', pass, 'checks passed');
process.exit(0);
