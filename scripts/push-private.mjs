/* 把私有票券資料（訂位代號、行程單 PDF）上傳到 Supabase。不在 CI 執行，只在本機手動跑。
   用法：node scripts/push-private.mjs <行程代碼> [--private <tickets-private.json>] [--pdf-dir <含 tickets/ 的資料夾>] [--dry-run]
   做的事：匿名登入 -> 以暱稱「上傳工具」加入行程 -> 上傳 PDF 到 trip-files/<trip_id>/tickets/<ascii檔名> -> 寫入
   collection=ticketPrivate 的 items（每張票一列：{ bookingCodes, files:[{label, path}] }）-> leave_trip() 離開行程。
   來源檔不進 git（預設在 repo 外的 sheet\private 與 prototype-v3\tickets）。可重複執行（upsert）。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../src/supabase.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');          // bibo-travel\
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const dry = argv.includes('--dry-run');
const code = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !['--private', '--pdf-dir'].includes(argv[i - 1])));
if (!code) { console.error('用法：node scripts/push-private.mjs <行程代碼> [--private 檔] [--pdf-dir 資料夾] [--dry-run]'); process.exit(2); }
const privFile = flag('--private') || path.join(root, 'sheet', 'private', 'tickets-private.json');
const pdfDir = flag('--pdf-dir') || path.join(root, 'prototype-v3');

const priv = JSON.parse(fs.readFileSync(privFile, 'utf8'));
/* 整理成：每張票 -> { bookingCodes, files:[{label, name, local}] }，檔名必須是 ASCII */
const plan = {}; const uploads = new Map();
for (const [tid, v] of Object.entries(priv)) {
  const files = (v.pdfs || []).map((p) => {
    const name = path.posix.basename(p.href);
    if (!/^[A-Za-z0-9._-]+\.pdf$/.test(name)) throw new Error('檔名需為 ASCII：' + name);
    const local = path.join(pdfDir, ...p.href.split('/'));
    if (!fs.existsSync(local)) throw new Error('找不到檔案：' + local);
    uploads.set(name, local);
    return { label: p.label, name };
  });
  plan[tid] = { bookingCodes: v.bookingCodes || [], files };
}
console.log('票券：', Object.keys(plan).join(', '), '；檔案：', [...uploads.keys()].join(', '));
if (dry) { console.log('dry-run，不連線。'); process.exit(0); }

const client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let joined = false, tripId = null;
try {
  const a = await client.auth.signInAnonymously();
  if (a.error) throw a.error;
  console.log('匿名使用者 id（暫時的）：', a.data.user.id);
  const j = await client.rpc('join_trip', { p_code: code, p_nickname: '上傳工具' });
  if (j.error) throw j.error;
  joined = true;
  const row = Array.isArray(j.data) ? j.data[0] : j.data;
  tripId = row.trip_id;
  console.log('已加入行程', row.name, tripId);

  for (const [name, local] of uploads) {
    const dest = `${tripId}/tickets/${name}`;
    const up = await client.storage.from('trip-files').upload(dest, fs.readFileSync(local), { contentType: 'application/pdf', upsert: true });
    if (up.error) throw new Error('上傳失敗 ' + dest + '：' + up.error.message);
    console.log('已上傳', dest);
  }

  const rows = Object.entries(plan).map(([tid, v]) => ({
    trip_id: tripId, collection: 'ticketPrivate', item_id: tid, deleted: false,
    data: { bookingCodes: v.bookingCodes, files: v.files.map((f) => ({ label: f.label, path: `${tripId}/tickets/${f.name}` })) },
  }));
  const r = await client.from('items').upsert(rows, { onConflict: 'trip_id,collection,item_id' }).select('item_id');
  if (r.error) throw r.error;
  console.log('已寫入 ticketPrivate：', r.data.map((x) => x.item_id).join(', '));
} finally {
  if (joined) {
    const l = await client.rpc('leave_trip', { p_trip: tripId });
    console.log(l.error ? '離開行程失敗：' + l.error.message : '已離開行程（移除上傳工具成員列）');
  }
  await client.auth.signOut().catch(() => {});
}
