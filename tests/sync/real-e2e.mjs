/* 真實 Supabase 的雙手機測試（兩個 Node 用戶端，各自匿名登入、加入行程、即時同步）。
   前提：Supabase 已開啟匿名登入。用法： node tests/sync/real-e2e.mjs BIBO-XXXX-XX
   注意：行程是空的時候，第一個加入的會把種子資料灌進去（bootstrap）。跑完後請用 SQL 清空（腳本最後會印出指令）。 */
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { SUPABASE_URL, SUPABASE_KEY } from '../../src/supabase.js';
import { Phone, sleep, same } from './phone.mjs';

const code = process.argv[2];
if (!code) { console.error('usage: node tests/sync/real-e2e.mjs <trip code>'); process.exit(1); }
const mk = () => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const A = new Phone('Lena', null, { client: mk() });
const B = new Phone('Key', null, { client: mk() });
await A.sync.join(code, 'E2E-Lena');
console.log('A joined, rows pending', A.sync.status());
await B.sync.join(code, 'E2E-Key');
same(A, B, 'B rebuilt equals A'); console.log('PASS B rebuilt from DB equals A');

A.day(2).items[0].done = true; A.persist();
await sleep(4000);
assert.equal(B.day(2).items[0].done, true); console.log('PASS A tick -> B (realtime)');
B.store.expenses.push({ id: 'e-e2e', date: '12/27', title: 'e2e', amount: 1, payer: 'Key', method: '現金', split: 'even', rateOverride: 4.4 }); B.persist();
await sleep(4000);
assert.ok(A.store.expenses.find(e => e.id === 'e-e2e')); console.log('PASS B expense -> A');
B.offline.v = true; B.day(2).items[1].done = true; B.persist(); B.store.notes = 'e2e'; B.persist(); await sleep(500);
assert.equal(B.sync.status().pending, 2);
await B.goOnline(); await sleep(4000);
assert.equal(A.day(2).items[1].done, true); assert.equal(A.store.notes, 'e2e'); console.log('PASS offline edits flushed, toasts:', B.toasts);
console.log('\nDone. Clean up with SQL (as project owner):');
console.log("  delete from public.items; delete from public.members; update public.trips set seed_version = 0, seed_ids = null;");
process.exit(0);
