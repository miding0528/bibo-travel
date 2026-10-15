/* Phase 2 對真實後端的檢查：fx-rate 與 ask-bibo（需要匿名登入已開、DEEPSEEK_API_KEY 已設）。
   用法： node tests/sync/real-phase2.mjs BIBO-XXXX-XX
   會建立兩個匿名使用者：一個加入行程（暱稱「測試C」），一個不加入（應被擋下，403）。
   跑完請清掉：members 與 auth.users 裡的匿名測試使用者，以及 fx_rates / ask_log 的測試列。 */
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { SUPABASE_URL, SUPABASE_KEY } from '../../src/supabase.js';

const code = process.argv[2];
if (!code) { console.error('usage: node tests/sync/real-phase2.mjs <trip code>'); process.exit(1); }
const mk = () => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function call(c, name, body) {
  const r = await c.functions.invoke(name, { body });
  if (!r.error) return { status: 200, data: r.data };
  const ctx = r.error.context;
  let payload = null;
  if (ctx && ctx.json) { try { payload = await ctx.json(); } catch { /* ignore */ } }
  return { status: ctx ? ctx.status : 0, data: payload, err: String(r.error.message) };
}

const member = mk();
const s = await member.auth.signInAnonymously();
assert.ok(!s.error, 'anon sign-in: ' + (s.error && s.error.message));
const j = await member.rpc('join_trip', { p_code: code, p_nickname: '測試C' });
assert.ok(!j.error, 'join: ' + (j.error && j.error.message));
console.log('member uid', s.data.session.user.id);

const outsider = mk();
const o = await outsider.auth.signInAnonymously();
assert.ok(!o.error);
console.log('outsider uid', o.data.session.user.id);

// fx-rate
const fx1 = await call(member, 'fx-rate', {});
console.log('fx-rate ->', fx1.status, JSON.stringify(fx1.data));
assert.equal(fx1.status, 200);
assert.ok(fx1.data.rate > 3.5 && fx1.data.rate < 6, 'rate plausible');
const fx2 = await call(member, 'fx-rate', {});
assert.equal(fx2.data.rate, fx1.data.rate, 'second call returns stored row');
const rows = await member.from('fx_rates').select('*');
console.log('fx_rates visible to member:', JSON.stringify(rows.data), rows.error ? rows.error.message : '');
assert.ok(rows.data && rows.data.length >= 1);
const outRows = await outsider.from('fx_rates').select('*');
console.log('fx_rates visible to outsider:', JSON.stringify(outRows.data), outRows.error ? outRows.error.message : '');
const w = await member.from('fx_rates').insert({ date: '2020-01-01', rate: 9, source: 'x' });
console.log('client insert into fx_rates blocked:', !!w.error);
assert.ok(w.error);
const al = await member.from('ask_log').select('*');
console.log('client read ask_log:', JSON.stringify(al.data), al.error ? al.error.message : '');
assert.ok(al.error || (al.data && al.data.length === 0));

// ask-bibo
const q1 = await call(member, 'ask-bibo', { question: '碑林有什麼一定要看？' });
console.log('ask q1 ->', q1.status); console.log((q1.data.answer || JSON.stringify(q1.data)).slice(0, 200));
assert.equal(q1.status, 200);
console.log('--- full q1 ---\n' + q1.data.answer);
const q2 = await call(member, 'ask-bibo', { question: '兵馬俑門票多少錢？幾點開門？', dayHint: 'Day 2（12/26）早市與碑林' });
console.log('ask q2 ->', q2.status); console.log('--- full q2 ---\n' + (q2.data.answer || JSON.stringify(q2.data)));
assert.equal(q2.status, 200);

// non-member
const f403 = await call(outsider, 'ask-bibo', { question: '你好' });
console.log('outsider ask ->', f403.status, JSON.stringify(f403.data)); assert.equal(f403.status, 403);
const g403 = await call(outsider, 'fx-rate', {});
console.log('outsider fx ->', g403.status, JSON.stringify(g403.data)); assert.equal(g403.status, 403);
// no auth header (anon key only is not a user JWT)
const bad = await fetch(SUPABASE_URL + '/functions/v1/ask-bibo', { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: '{"question":"hi"}' });
console.log('no-jwt ask ->', bad.status);
// CORS preflight
const pre = await fetch(SUPABASE_URL + '/functions/v1/ask-bibo', { method: 'OPTIONS', headers: { Origin: 'https://miding0528.github.io', 'Access-Control-Request-Method': 'POST' } });
console.log('preflight ->', pre.status, pre.headers.get('access-control-allow-origin'));
// validation
const e1 = await call(member, 'ask-bibo', { question: '   ' });
console.log('empty question ->', e1.status, JSON.stringify(e1.data));
console.log('\nDONE');
process.exit(0);
