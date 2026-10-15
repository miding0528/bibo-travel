/* BIBO Travel 同步引擎（Supabase）。
   - 畫面程式仍然只讀寫 STORE 並呼叫 persist()；這裡在 persist() 之後把 STORE 拆成「一筆一列」的 items，
     與上次已處理的快照（base）比對，差異放進 outbox，再批次 upsert 到 Supabase。
   - 即時：訂閱 items 的 realtime，並用 updated_at 比對（較新才套用）。另有輪詢與回到前景時補抓，避免漏事件。
   - 離線優先：沒網路時照常讀寫 STORE，outbox 存在 localStorage，恢復連線後送出。同一筆以最後寫入為準。
   純邏輯，不碰 DOM，方便在 Node 內用假的 client 測試（見 createSync 的 deps）。 */

var P = 'bibo-sync-';
var K = { trip: P + 'trip', base: P + 'base', outbox: P + 'outbox', meta: P + 'meta' };
var PULL_OVERLAP_MS = 120000;
var POLL_MS = 25000;
var BATCH = 100;

/* ---------- helpers ---------- */
function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(function (x) { return x === undefined ? 'null' : canon(x); }).join(',') + ']';
  var ks = Object.keys(v).filter(function (k) { return v[k] !== undefined && typeof v[k] !== 'function'; }).sort();
  return '{' + ks.map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
}
function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
/* Postgres 的 timestamptz 文字會去掉尾端的 0，不能直接字串比大小；轉成「秒 * 1e6 + 微秒」比較 */
function tsNum(s) {
  if (!s) return 0;
  var m = /^(.*?)(?:\.(\d+))?(Z|[+-]\d\d(?::?\d\d)?)?$/.exec(String(s).replace(' ', 'T'));
  var tz = m[3] || 'Z';
  if (/^[+-]\d\d$/.test(tz)) tz += ':00';
  var whole = Date.parse(m[1] + tz);
  var frac = m[2] ? Number((m[2] + '000000').slice(0, 6)) : 0;
  return Math.floor(whole / 1000) * 1e6 + frac;
}
function cmpTs(a, b) { return tsNum(a) - tsNum(b); }
function splitKey(k) { var n = k.indexOf('|'); return [k.slice(0, n), k.slice(n + 1)]; }
function replaceInPlace(target, src) {
  Object.keys(target).forEach(function (k) { if (!(k in src)) delete target[k]; });
  Object.keys(src).forEach(function (k) { target[k] = clone(src[k]); });
}
function isNetworkError(e) {
  if (!e) return false;
  var msg = String(e.message || e);
  return e.name === 'TypeError' || e.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg);
}
export function friendlyError(e) {
  var msg = String((e && (e.message || e.code)) || e || '');
  var code = e && e.code;
  if (code === 'anonymous_provider_disabled' || /anonymous sign-ins are disabled/i.test(msg)) {
    return { kind: 'anon_disabled', text: '目前無法加入：專案尚未開啟匿名登入，請通知管理者' };
  }
  if (/invalid_code/.test(msg)) return { kind: 'invalid_code', text: '找不到這個行程代碼，請再確認' };
  if (/nickname_required/.test(msg)) return { kind: 'nickname', text: '請輸入暱稱' };
  if (isNetworkError(e)) return { kind: 'offline', text: '連不上網路，請稍後再試' };
  return { kind: 'other', text: '加入失敗，請稍後再試' };
}

export function createSync(deps) {
  var store = deps.store, DATA = deps.DATA, storage = deps.storage;
  var ui = deps.ui, seed = deps.seed;
  var isOnlineFn = deps.isOnline || function () { return true; };
  var env = deps.env || {};
  var log = deps.log || function () {};

  var client = null, trip = null, base = {}, outbox = {}, meta = { lastPull: null, lastOrd: 0, seedBump: null };
  var ready = false, applying = false, started = false;
  var inflight = {}, flushing = false, syncing = false, blocked = false, backoff = 0;
  var retryTimer = null, flushTimer = null, applyTimer = null, pollTimer = null, channel = null, pendingRows = [];
  var newOrd = {};
  var touched = { days: {}, tabs: {}, tickets: false, expenses: false, spots: false };
  var changedByRemote = false, anonToastShown = false;

  /* ---------- storage ---------- */
  function load(key, def) {
    try { var raw = storage.getItem(key); if (raw === null || raw === undefined) return def; return JSON.parse(raw); } catch (e) { return def; }
  }
  function save(key, val) { try { storage.setItem(key, JSON.stringify(val)); } catch (e) { /* 容量滿了就算了，下次開啟會重新比對 */ } }
  function saveBase() { save(K.base, base); }
  function saveOutbox() { save(K.outbox, outbox); }
  function saveMeta() { save(K.meta, meta); }
  function saveTrip() { save(K.trip, trip); }
  function clearAll() { [K.trip, K.base, K.outbox, K.meta].forEach(function (k) { try { storage.removeItem(k); } catch (e) {} }); }

  function isOnline() { return isOnlineFn() !== false; }

  /* ---------- STORE <-> items ---------- */
  function nextOrd() {
    var v = Math.max(Date.now(), (meta.lastOrd || 0) + 1);
    meta.lastOrd = v;
    return v;
  }
  function ordFor(k) {
    var b = base[k];
    if (b && b.o !== undefined && b.o !== null) return b.o;
    if (newOrd[k] === undefined) newOrd[k] = nextOrd();
    return newOrd[k];
  }

  /* 清單型項目（行程項目、清單）的排序值：盡量沿用每一列已送出的 order，刪除其他列不會牽動它們。
     只有順序真的被改（排序、移動）或新增時，才替「不再遞增」的列重新配值（落在前後兩個已定值之間，可為小數）。 */
  function seqOrders(items, keyOf) {
    var n = items.length, out = new Array(n), kept = new Array(n), i, j, k;
    /* 已有 order 的列中，取最長的嚴格遞增子序列保持不動（只動了一列的搬移／新增，其他列都不會被改寫） */
    var vals = [], idxs = [];
    for (i = 0; i < n; i++) {
      var b = base[keyOf(items[i])];
      if (b && typeof b.o === 'number' && isFinite(b.o)) { vals.push(b.o); idxs.push(i); }
    }
    var tails = [], prev = new Array(vals.length);
    for (i = 0; i < vals.length; i++) {
      var lo0 = 0, hi0 = tails.length;
      while (lo0 < hi0) { var mid = (lo0 + hi0) >> 1; if (vals[tails[mid]] < vals[i]) lo0 = mid + 1; else hi0 = mid; }
      prev[i] = lo0 > 0 ? tails[lo0 - 1] : -1;
      tails[lo0] = i;
    }
    for (var t = tails.length ? tails[tails.length - 1] : -1; t >= 0; t = prev[t]) { out[idxs[t]] = vals[t]; kept[idxs[t]] = true; }
    i = 0;
    while (i < n) {
      if (kept[i]) { i++; continue; }
      j = i; while (j < n && !kept[j]) j++;
      var cnt = j - i, lo = i > 0 ? out[i - 1] : null, hi = j < n ? out[j] : null;
      for (k = 0; k < cnt; k++) {
        if (lo !== null && hi !== null) out[i + k] = lo + (hi - lo) * (k + 1) / (cnt + 1);
        else if (lo !== null) out[i + k] = lo + k + 1;
        else if (hi !== null) out[i + k] = hi - (cnt - k);
        else out[i + k] = k;
      }
      i = j;
    }
    return out;
  }

  /* STORE -> Map(key -> {c, i, data, s}) */
  function extract() {
    var out = new Map();
    function add(c, i, data, o) { out.set(c + '|' + i, { c: c, i: i, data: data, s: canon(data), o: o }); }
    (store.days || []).forEach(function (d) {
      var items = d.items || [];
      var ords = seqOrders(items, function (it) { return 'dayItem|' + it.id; });
      items.forEach(function (it, idx) {
        var o = clone(it); o.day = d.day; o.order = ords[idx];
        add('dayItem', String(it.id), o, ords[idx]);
      });
    });
    ['prep', 'packing'].forEach(function (tab) {
      var list = (store.checklist && store.checklist[tab]) || [];
      var ords = seqOrders(list, function (it) { return 'checklist|' + tab + '/' + it.id; });
      list.forEach(function (it, idx) {
        var o = clone(it); o.tab = tab; o.order = ords[idx];
        add('checklist', tab + '/' + it.id, o, ords[idx]);
      });
    });
    (store.tickets || []).forEach(function (t) {
      var o = clone(t), k = 'ticket|' + t.id;
      if (store.ticketStatus && store.ticketStatus[t.id]) o.status = store.ticketStatus[t.id];
      if (store.ticketAlerts && Object.prototype.hasOwnProperty.call(store.ticketAlerts, t.id)) o.alert = !!store.ticketAlerts[t.id];
      o.ord = ordFor(k);
      add('ticket', String(t.id), o, o.ord);
    });
    (store.expenses || []).forEach(function (e) {
      var o = clone(e), id = String(e.id);
      o.ord = ordFor('expense|' + id);
      add('expense', id, o, o.ord);
    });
    (store.customSpots || []).forEach(function (s) {
      var o = clone(s);
      o.ord = ordFor('customSpot|' + s.id);
      add('customSpot', String(s.id), o, o.ord);
    });
    add('meta', 'settings', {
      memberNames: clone(store.memberNames || {}), feePercent: store.feePercent, fxRatesOverride: clone(store.fxRatesOverride || {})
    });
    add('meta', 'notes', { text: typeof store.notes === 'string' ? store.notes : '' });
    return out;
  }

  /* ---------- 套用遠端資料到 STORE（就地修改，避免畫面上已拿著的物件失效） ---------- */
  function oOf(k) { var b = base[k]; return (b && b.o !== undefined && b.o !== null) ? b.o : Infinity; }
  function byOrder(keyOf) {
    return function (a, b) {
      var d = oOf(keyOf(a)) - oOf(keyOf(b));
      if (d === 0 || isNaN(d)) { var x = String(a.id), y = String(b.id); return x < y ? -1 : (x > y ? 1 : 0); }
      return d;
    };
  }
  function findDayItem(id) {
    var res = null;
    (store.days || []).forEach(function (d) { d.items.forEach(function (it, idx) { if (String(it.id) === id) res = { day: d, idx: idx, item: it }; }); });
    return res;
  }
  function findIn(list, id) {
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === id) return i;
    return -1;
  }
  function targetDay(n) {
    var days = store.days || [], hit = null;
    days.forEach(function (d) { if (d.day === n) hit = d; });
    return hit || days[days.length - 1];
  }

  function storeUpsert(c, i, data) {
    var rest;
    if (c === 'dayItem') {
      rest = clone(data); var dayNum = rest.day; delete rest.day; delete rest.order;
      if (rest.id === undefined) rest.id = i;
      var loc = findDayItem(i), tgt = targetDay(dayNum);
      if (!tgt) return;
      if (loc) {
        replaceInPlace(loc.item, rest);
        if (loc.day !== tgt) { loc.day.items.splice(loc.idx, 1); tgt.items.push(loc.item); touched.days[loc.day.day] = true; }
      } else { tgt.items.push(rest); }
      touched.days[tgt.day] = true;
    } else if (c === 'checklist') {
      rest = clone(data); var tab = rest.tab === 'packing' ? 'packing' : 'prep'; delete rest.tab; delete rest.order;
      var id = i.slice(i.indexOf('/') + 1);
      if (rest.id === undefined) rest.id = id;
      if (!store.checklist) store.checklist = { prep: [], packing: [] };
      var list = store.checklist[tab] = store.checklist[tab] || [];
      var ix = findIn(list, id);
      if (ix >= 0) replaceInPlace(list[ix], rest); else list.push(rest);
      touched.tabs[tab] = true;
    } else if (c === 'ticket') {
      rest = clone(data); var st = rest.status, al = rest.alert; delete rest.status; delete rest.alert; delete rest.ord;
      if (rest.id === undefined) rest.id = i;
      store.tickets = store.tickets || [];
      var tx = findIn(store.tickets, i);
      if (tx >= 0) replaceInPlace(store.tickets[tx], rest); else store.tickets.push(rest);
      store.ticketStatus = store.ticketStatus || {}; store.ticketAlerts = store.ticketAlerts || {};
      if (st) store.ticketStatus[i] = st; else delete store.ticketStatus[i];
      if (al === undefined) delete store.ticketAlerts[i]; else store.ticketAlerts[i] = !!al;
      touched.tickets = true;
    } else if (c === 'expense') {
      rest = clone(data); delete rest.ord;
      if (rest.id === undefined) rest.id = i;
      store.expenses = store.expenses || [];
      var ex = findIn(store.expenses, i);
      if (ex >= 0) replaceInPlace(store.expenses[ex], rest); else store.expenses.push(rest);
      touched.expenses = true;
    } else if (c === 'customSpot') {
      rest = clone(data); delete rest.ord;
      if (rest.id === undefined) rest.id = i;
      store.customSpots = store.customSpots || [];
      var sx = findIn(store.customSpots, i);
      if (sx >= 0) replaceInPlace(store.customSpots[sx], rest); else store.customSpots.push(rest);
      touched.spots = true;
    } else if (c === 'meta') {
      if (i === 'settings') {
        if (data.memberNames) { store.memberNames = store.memberNames || {}; replaceInPlace(store.memberNames, data.memberNames); }
        if (data.feePercent !== undefined) store.feePercent = data.feePercent;
        if (data.fxRatesOverride) { store.fxRatesOverride = store.fxRatesOverride || {}; replaceInPlace(store.fxRatesOverride, data.fxRatesOverride); }
      } else if (i === 'notes') {
        store.notes = typeof data.text === 'string' ? data.text : '';
      }
    }
  }
  function storeRemove(c, i) {
    if (c === 'dayItem') {
      var loc = findDayItem(i);
      if (loc) { loc.day.items.splice(loc.idx, 1); touched.days[loc.day.day] = true; }
    } else if (c === 'checklist') {
      var tab = i.slice(0, i.indexOf('/')), id = i.slice(i.indexOf('/') + 1);
      var list = store.checklist && store.checklist[tab];
      if (list) { var ix = findIn(list, id); if (ix >= 0) list.splice(ix, 1); touched.tabs[tab] = true; }
    } else if (c === 'ticket') {
      var tx = findIn(store.tickets || [], i);
      if (tx >= 0) store.tickets.splice(tx, 1);
      if (store.ticketStatus) delete store.ticketStatus[i];
      if (store.ticketAlerts) delete store.ticketAlerts[i];
    } else if (c === 'expense') {
      var ex = findIn(store.expenses || [], i);
      if (ex >= 0) store.expenses.splice(ex, 1);
    } else if (c === 'customSpot') {
      var sx = findIn(store.customSpots || [], i);
      if (sx >= 0) store.customSpots.splice(sx, 1);
    }
  }

  function applyOne(row, force) {
    var c = row.collection, i = String(row.item_id), k = c + '|' + i;
    var b = base[k];
    if (!force && b && b.t && cmpTs(row.updated_at, b.t) <= 0) return false;
    if (!force && (outbox[k] || inflight[k])) {
      /* 這一筆本機還有沒送出的修改，送出後會蓋掉遠端；只記下時間 */
      base[k] = { s: b ? b.s : null, t: row.updated_at, o: b ? b.o : undefined };
      return false;
    }
    if (row.deleted) {
      storeRemove(c, i);
      base[k] = { s: null, t: row.updated_at };
    } else {
      var data = row.data || {};
      storeUpsert(c, i, data);
      var o = (c === 'dayItem' || c === 'checklist') ? data.order : data.ord;
      base[k] = { s: canon(data), t: row.updated_at, o: o };
    }
    return true;
  }

  function finalize() {
    Object.keys(touched.days).forEach(function (n) {
      (store.days || []).forEach(function (d) {
        if (String(d.day) === n) d.items.sort(byOrder(function (it) { return 'dayItem|' + it.id; }));
      });
    });
    Object.keys(touched.tabs).forEach(function (tab) {
      var list = store.checklist && store.checklist[tab];
      if (list) list.sort(byOrder(function (it) { return 'checklist|' + tab + '/' + it.id; }));
    });
    if (touched.tickets && store.tickets) {
      store.tickets.sort(byOrder(function (t) { return 'ticket|' + t.id; }));
      if (ui.sortTickets) ui.sortTickets();
    }
    if (touched.expenses && store.expenses) store.expenses.sort(byOrder(function (e) { return 'expense|' + e.id; }));
    if (touched.spots && store.customSpots) store.customSpots.sort(byOrder(function (s) { return 'customSpot|' + s.id; }));
    touched = { days: {}, tabs: {}, tickets: false, expenses: false, spots: false };
  }

  /* 套用後，把受影響的列重新以 STORE 為準算一次 s（位置型 order 可能與遠端數字有空隙，不應因此再送出） */
  function rebase(keys) {
    var cur = extract();
    keys.forEach(function (k) { var e = cur.get(k); if (e && base[k]) base[k].s = e.s; });
  }

  function applyRows(rows, force) {
    if (!rows.length) return 0;
    applying = true;
    var n = 0, keys = [];
    try {
      rows.forEach(function (r) {
        if (applyOne(r, force)) { n++; keys.push(r.collection + '|' + r.item_id); }
        if (!meta.lastPull || cmpTs(r.updated_at, meta.lastPull) > 0) meta.lastPull = r.updated_at;
      });
      finalize();
      rebase(keys);
    } finally { applying = false; }
    saveBase(); saveMeta();
    if (n) { changedByRemote = true; ui.persistRaw(); }
    return n;
  }

  function resetShape() {
    store.days = (DATA.days || []).map(function (d) { return { day: d.day, date: d.date, tag: d.tag, title: d.title, subtitle: d.subtitle, items: [] }; });
    store.checklist = { prep: [], packing: [] };
    store.tickets = []; store.ticketStatus = {}; store.ticketAlerts = {};
    store.expenses = []; store.customSpots = []; store.notes = '';
    store.memberNames = { Lena: 'Lena', Key: 'Key' }; store.feePercent = 1.5; store.fxRatesOverride = {};
  }

  function rebuildFrom(rows) {
    applying = true;
    try {
      resetShape();
      base = {}; newOrd = {};
      meta.lastPull = null;
      rows.forEach(function (r) {
        applyOne(r, true);
        if (!meta.lastPull || cmpTs(r.updated_at, meta.lastPull) > 0) meta.lastPull = r.updated_at;
      });
      touched.days = {}; (store.days || []).forEach(function (d) { touched.days[d.day] = true; });
      touched.tabs = { prep: true, packing: true }; touched.tickets = touched.expenses = touched.spots = true;
      finalize();
      rebase(Object.keys(base));
    } finally { applying = false; }
    saveBase(); saveMeta();
    changedByRemote = true;
    ui.persistRaw();
  }

  /* ---------- 比對 STORE 與快照，差異進 outbox ---------- */
  function diffAndEnqueue() {
    if (!ready || applying || !trip) return 0;
    var cur = extract(), n = 0, k;
    cur.forEach(function (e, key) {
      var b = base[key];
      if (!b || b.s !== e.s) {
        outbox[key] = { c: e.c, i: e.i, d: e.data };
        base[key] = { s: e.s, t: b ? b.t : undefined, o: e.o };
        n++;
      }
    });
    Object.keys(base).forEach(function (key) {
      if (base[key].s !== null && !cur.has(key)) {
        var p = splitKey(key);
        outbox[key] = { c: p[0], i: p[1], d: null };
        base[key] = { s: null, t: base[key].t };
        n++;
      }
    });
    if (n) { saveBase(); saveOutbox(); saveMeta(); scheduleFlush(); }
    return n;
  }

  /* ---------- 連線 / 登入 ---------- */
  async function ensureAuth() {
    var r = await client.auth.getSession();
    var session = r && r.data && r.data.session;
    if (!session) {
      if ((r && r.error) || !isOnline()) throw new Error('offline');
      var s = await client.auth.signInAnonymously();
      if (s.error) throw s.error;
      session = s.data.session;
    }
    if (trip && trip.uid && session.user.id !== trip.uid) {
      /* 登入身分換了（例如舊的登入資料被清掉）：用原本的行程代碼與暱稱悄悄重新加入 */
      var j = await client.rpc('join_trip', { p_code: trip.code, p_nickname: trip.nick });
      if (j.error) throw j.error;
      trip.uid = session.user.id; saveTrip();
    }
    return session;
  }

  async function refreshTrip() {
    var t = await client.from('trips').select('id,name,code,seed_version,seed_ids').eq('id', trip.id).maybeSingle();
    if (t.error) throw t.error;
    if (t.data) { trip.name = t.data.name; trip.code = t.data.code; trip.seed_version = t.data.seed_version; trip.seed_ids = t.data.seed_ids; }
    var m = await client.from('members').select('nickname').eq('trip_id', trip.id).order('created_at', { ascending: true });
    if (!m.error && m.data) trip.members = m.data.map(function (x) { return x.nickname; });
    saveTrip();
  }

  async function pullRows(since) {
    var rows = [], from = 0, PAGE = 1000;
    for (;;) {
      var q = client.from('items').select('*').eq('trip_id', trip.id);
      if (since) q = q.gte('updated_at', since);
      var res = await q.order('updated_at', { ascending: true }).order('collection').order('item_id').range(from, from + PAGE - 1);
      if (res.error) throw res.error;
      rows = rows.concat(res.data);
      if (res.data.length < PAGE) break;
      from += PAGE;
    }
    return rows;
  }

  function toRow(c, i, d) {
    return { trip_id: trip.id, collection: c, item_id: i, data: d === null ? {} : d, deleted: d === null };
  }

  async function bootstrap() {
    /* 行程是空的：把這支手機現有的狀態變成共同狀態。用 ignoreDuplicates，兩支手機同時開局時先到的先贏，不會互相覆蓋 */
    var cur = extract(), rows = [];
    cur.forEach(function (e) { rows.push(toRow(e.c, e.i, e.data)); });
    for (var x = 0; x < rows.length; x += 200) {
      var res = await client.from('items').upsert(rows.slice(x, x + 200), { onConflict: 'trip_id,collection,item_id', ignoreDuplicates: true });
      if (res.error) throw res.error;
    }
    var sv = store.seedVersion || seed.version;
    var ids = store.seedIds || seed.currentIds();
    var r = await client.rpc('set_trip_seed', { p_trip: trip.id, p_version: sv, p_ids: ids });
    if (r.error) throw r.error;
    log('bootstrap', rows.length);
    return rows.length;
  }

  async function firstAttach() {
    ready = false;
    base = {}; outbox = {}; newOrd = {}; meta = { lastPull: null, lastOrd: 0, seedBump: null };
    saveBase(); saveOutbox(); saveMeta();
    var rows = await pullRows(null);
    var boot = 0;
    if (rows.length === 0) { boot = await bootstrap(); rows = await pullRows(null); }
    await refreshTrip();
    rebuildFrom(rows);
    /* 本機 seedVersion 以行程為準 */
    if (trip.seed_version > 0) { store.seedVersion = trip.seed_version; if (trip.seed_ids) store.seedIds = trip.seed_ids; }
    ready = true;
    ui.persistRaw();
    return { pulled: rows.length, bootstrapped: boot };
  }

  async function seedStep() {
    var sv = trip.seed_version || 0;
    if (sv <= 0) return;
    if (sv >= seed.version) {
      if (store.seedVersion !== sv) { store.seedVersion = sv; if (trip.seed_ids) store.seedIds = trip.seed_ids; ui.persistRaw(); }
      return;
    }
    if (meta.seedBump && meta.seedBump.v >= seed.version) return;
    store.seedVersion = sv;
    if (trip.seed_ids) store.seedIds = trip.seed_ids;
    seed.run();                       /* seedSync：內部 persist() 會觸發 diffAndEnqueue */
    meta.seedBump = { v: seed.version, ids: store.seedIds };
    saveMeta();
    changedByRemote = true;
  }

  /* ---------- 送出 ---------- */
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(function () { flushTimer = null; flush(); }, 300);
  }

  async function flush() {
    if (flushing || !ready || !trip) return 0;
    var pending = Object.keys(outbox);
    if (!pending.length && !meta.seedBump) return 0;
    if (!isOnline()) { if (pending.length) blocked = true; return 0; }
    flushing = true;
    var sent = 0;
    try {
      await ensureAuth();
      for (;;) {
        var keys = Object.keys(outbox);
        if (!keys.length) break;
        var chunk = keys.slice(0, BATCH), entries = {}, rows = [];
        chunk.forEach(function (k) { entries[k] = outbox[k]; inflight[k] = true; rows.push(toRow(outbox[k].c, outbox[k].i, outbox[k].d)); });
        var res = await client.from('items').upsert(rows, { onConflict: 'trip_id,collection,item_id' }).select('collection,item_id,updated_at');
        chunk.forEach(function (k) { delete inflight[k]; });
        if (res.error) throw res.error;
        res.data.forEach(function (r) {
          var k = r.collection + '|' + r.item_id;
          if (outbox[k] === entries[k]) delete outbox[k];
          if (base[k]) base[k].t = r.updated_at;
          if (!meta.lastPull || cmpTs(r.updated_at, meta.lastPull) > 0) meta.lastPull = r.updated_at;
        });
        sent += chunk.length;
        saveOutbox(); saveBase(); saveMeta();
      }
      if (meta.seedBump && !Object.keys(outbox).length) {
        var b = await client.rpc('set_trip_seed', { p_trip: trip.id, p_version: meta.seedBump.v, p_ids: meta.seedBump.ids });
        if (b.error) throw b.error;
        trip.seed_version = Math.max(trip.seed_version || 0, meta.seedBump.v); trip.seed_ids = meta.seedBump.ids;
        meta.seedBump = null; saveMeta(); saveTrip();
      }
      backoff = 0;
      if (sent > 0 && blocked) ui.toast('已同步 ' + sent + ' 筆');
      if (!Object.keys(outbox).length) blocked = false;
    } catch (e) {
      Object.keys(inflight).forEach(function (k) { delete inflight[k]; });
      blocked = true;
      handleError(e, 'flush');
    } finally { flushing = false; }
    return sent;
  }

  function handleError(e, where) {
    var fe = friendlyError(e);
    log('error', where, e && (e.message || e.code));
    if (fe.kind === 'anon_disabled' && !anonToastShown) { anonToastShown = true; ui.toast('無法同步：專案尚未開啟匿名登入'); }
    if (fe.kind === 'offline' || isNetworkError(e) || (e && e.message === 'offline')) { /* 靜默，等網路恢復 */ }
    backoff = Math.min(backoff ? backoff * 2 : 2000, 60000);
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { retryTimer = null; syncNow('retry'); }, backoff);
  }

  /* ---------- 完整一輪：登入 -> 補抓 -> seed -> 送出 ---------- */
  async function syncNow(reason) {
    if (!trip || syncing) return;
    if (!isOnline()) { blocked = true; return; }
    syncing = true;
    try {
      await ensureAuth();
      if (!ready) {
        await firstAttach();
        if (ui.refresh) ui.refresh();
      } else {
        var since = meta.lastPull ? new Date(Date.parse(meta.lastPull.replace(' ', 'T')) - PULL_OVERLAP_MS).toISOString() : null;
        var rows = await pullRows(since);
        applyRows(rows, false);
        await refreshTrip();
      }
      await seedStep();
      subscribe();
      syncing = false;
      await flush();
      if (changedByRemote) { changedByRemote = false; if (ui.refresh) ui.refresh(); }
      backoff = 0;
    } catch (e) {
      handleError(e, 'sync:' + reason);
    } finally { syncing = false; }
  }

  /* ---------- Realtime ---------- */
  function onRealtime(payload) {
    var row = null, force = false;
    if (payload.eventType === 'DELETE') {
      row = payload.old && payload.old.collection ? Object.assign({}, payload.old, { deleted: true }) : null;
      force = true;
    } else { row = payload.new; }
    if (!row || !row.collection) return;
    pendingRows.push({ row: row, force: force });
    if (!applyTimer) applyTimer = setTimeout(drainRealtime, 80);
  }
  function drainRealtime() {
    applyTimer = null;
    var list = pendingRows; pendingRows = [];
    if (!ready) return;
    var n = 0;
    var normal = list.filter(function (x) { return !x.force; }).map(function (x) { return x.row; });
    var forced = list.filter(function (x) { return x.force; }).map(function (x) { return x.row; });
    n += applyRows(normal, false);
    n += applyRows(forced, true);
    if (n && ui.refresh) ui.refresh();
  }
  function subscribe() {
    if (channel || !client || !trip) return;
    try {
      channel = client.channel('items-' + trip.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: 'trip_id=eq.' + trip.id }, onRealtime)
        .subscribe(function (status) {
          log('realtime', status);
          if (status === 'SUBSCRIBED' && ready) { pullQuiet(); }
        });
    } catch (e) { channel = null; }
  }
  function unsubscribe() {
    if (channel && client) { try { client.removeChannel(channel); } catch (e) {} }
    channel = null;
  }
  function pullQuiet() { if (!syncing) syncNow('rt'); }

  /* ---------- 公開介面 ---------- */
  function isJoined() { return !!trip; }

  async function start(opts) {
    if (started) return;
    started = true;
    opts = opts || {};
    trip = load(K.trip, null);
    if (!trip) { ui.needJoin(); return; }
    client = deps.getClient();
    var b = load(K.base, null);
    if (b && opts.hadStore === false) { b = null; storage.removeItem(K.outbox); }   /* 本機 STORE 被清掉（重設）：重新向雲端抓 */
    outbox = load(K.outbox, {}) || {};
    meta = Object.assign({ lastPull: null, lastOrd: 0, seedBump: null }, load(K.meta, {}));
    if (b) { base = b; ready = true; diffAndEnqueue(); } else { base = {}; ready = false; outbox = {}; }
    bindEnv();
    syncNow('start');
  }

  var envBound = false;
  function bindEnv() {
    if (envBound) return;
    envBound = true;
    if (env.on) {
      env.on('online', function () { syncNow('online'); });
      env.on('offline', function () { blocked = true; });
      env.on('visible', function () { syncNow('visible'); });
    }
    if (env.setInterval) pollTimer = env.setInterval(function () { if (!env.isHidden || !env.isHidden()) syncNow('poll'); }, POLL_MS);
  }

  async function join(code, nick) {
    client = client || deps.getClient();
    var s = await client.auth.getSession();
    var session = s && s.data && s.data.session;
    if (!session) {
      var a = await client.auth.signInAnonymously();
      if (a.error) throw a.error;
      session = a.data.session;
    }
    var r = await client.rpc('join_trip', { p_code: code, p_nickname: nick });
    if (r.error) throw r.error;
    var row = Array.isArray(r.data) ? r.data[0] : r.data;
    trip = { id: row.trip_id, code: row.code, name: row.name, nick: String(nick).trim(), uid: session.user.id,
      seed_version: row.seed_version, seed_ids: row.seed_ids, members: [] };
    saveTrip();
    ready = false; started = true;
    try {
      var res = await firstAttach();
      bindEnv();
      subscribe();
      await flush();
      if (ui.joined) { try { ui.joined(); } catch (e) {} }
      return res;
    } catch (e) {
      /* 加入成功但後續失敗（例如斷線）：保留行程，下次 syncNow 會重做 firstAttach */
      log('join-attach-failed', e && e.message);
      bindEnv();
      handleError(e, 'join');
      throw e;
    }
  }

  /* 呼叫 Edge Function（問 BIBO、匯率）。回傳 { data } 或 { error: { kind, status, code, message } }，不丟例外。
     kind: not_joined / offline / http / network */
  async function callFunction(name, body) {
    if (!trip) return { error: { kind: 'not_joined' } };
    if (!isOnline()) return { error: { kind: 'offline' } };
    try {
      client = client || deps.getClient();
      await ensureAuth();
      var r = await client.functions.invoke(name, { body: body || {} });
      if (!r.error) return { data: r.data };
      var err = r.error, ctx = err.context, status = ctx && ctx.status, payload = null;
      if (ctx && typeof ctx.json === 'function') { try { payload = await ctx.json(); } catch (e) { payload = null; } }
      if (status) return { error: { kind: 'http', status: status, code: payload && payload.error, message: payload && payload.message } };
      return { error: { kind: 'network', message: String(err.message || err) } };
    } catch (e) {
      return { error: { kind: isNetworkError(e) || (e && e.message === 'offline') ? 'offline' : 'network', message: String((e && e.message) || e) } };
    }
  }

  function leave() {
    unsubscribe();
    clearAll();
    trip = null; base = {}; outbox = {}; ready = false; started = false; newOrd = {};
    meta = { lastPull: null, lastOrd: 0, seedBump: null };
  }

  return {
    start: start, join: join, leave: leave, callFunction: callFunction, flush: flush, syncNow: syncNow, isJoined: isJoined,
    onPersist: function () { if (ready && !applying) diffAndEnqueue(); },
    getTrip: function () { return trip; },
    refreshTrip: async function () { if (trip && client && isOnline()) { try { await ensureAuth(); await refreshTrip(); } catch (e) {} } return trip; },
    status: function () { return { joined: !!trip, ready: ready, pending: Object.keys(outbox).length, blocked: blocked, lastPull: meta.lastPull, baseSize: Object.keys(base).length }; },
    _debug: { extract: extract, base: function () { return base; }, outbox: function () { return outbox; }, applyRows: applyRows, rebuildFrom: rebuildFrom, canon: canon, cmpTs: cmpTs }
  };
}
