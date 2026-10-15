import './styles.css';
import seedData from './data/seed.json';
import { makeClient } from './supabase.js';
import { createSync } from './sync.js';
import { createSyncUI } from './sync-ui.js';

/* BIBO Travel 主程式：原型 index.html 的 <script>，邏輯未改。
   唯一差異：種子資料不再內嵌，改由 src/data/seed.json 匯入（var SHEET_DATA = seedData）。
   inline onclick 呼叫的函式都掛在 window 上，所以不需要 export。 */
(function(){
"use strict";
/* ---------------- SPREADSHEET SEED DATA ----------------
   src/data/seed.json 由 sheet/tools/sheet_to_app.py 從試算表產生，請勿手改；改試算表再匯入。seedVersion 每次匯入 +1。 */
var SHEET_DATA = seedData;

/* ---------------- DATA ---------------- */

var WEEKDAY = SHEET_DATA.weekday;

var DATA = {};

DATA.days = SHEET_DATA.days;

DATA.spots = SHEET_DATA.spots;

/* AMAP_KEYWORDS is derived from each spot's amapKeyword (spreadsheet column 高德關鍵字) */
var AMAP_KEYWORDS = {};
DATA.spots.forEach(function(s){ if(s.amapKeyword){ AMAP_KEYWORDS[s.id] = { kw:s.amapKeyword, city:cityName(s.city) }; } });

DATA.fxRates = SHEET_DATA.fxRates;
DATA.today = '12/26';
DATA.expenses = [
  {id:1, date:'12/26', title:'碑林門票', amount:170, payer:'Lena', method:'刷卡', split:'even', sample:true, rateOverride:4.39},
  {id:2, date:'12/26', title:'早市早餐', amount:32, payer:'Key', method:'微信支付', split:'even', sample:true, rateOverride:4.39},
  {id:3, date:'12/26', title:'回民街晚餐', amount:146, payer:'Key', method:'微信支付', split:'even', sample:true, rateOverride:4.39},
  {id:4, date:'12/25', title:'鄭州東站晚餐', amount:58, payer:'Lena', method:'微信支付', split:'even', sample:true, rateOverride:4.38},
  {id:5, date:'12/25', title:'西安宵夜泡饃', amount:68, payer:'Key', method:'微信支付', split:'even', sample:true, rateOverride:4.38}
];

DATA.weatherAvg = SHEET_DATA.weatherAvg;

DATA.DAY_CITY = SHEET_DATA.dayCity;

/* ---------------- REMINDERS TAB DATA (spot detail "提醒") ---------------- */

DATA.reminders = SHEET_DATA.reminders;

/* ---------------- CHECKLIST DATA ---------------- */

DATA.checklistPrep = SHEET_DATA.checklistPrep;

DATA.checklistPackingGroups = SHEET_DATA.checklistPackingGroups;

DATA.checklistPacking = SHEET_DATA.checklistPacking;

DATA.checklistPrepGroups = SHEET_DATA.checklistPrepGroups;

/* ---------------- TICKETS DATA ---------------- */

DATA.tickets = SHEET_DATA.tickets;

/* ---------------- ASK BIBO DATA ---------------- */

DATA.askQuick = [
  {q:'洛陽牛肉湯要怎麼點？', icon:'restaurant', iconColor:'text-tertiary',
    a:'先說要牛肉湯，再選碗的大小，配燒餅掰進湯裡吃；辣椒自己加。很多店可以免費續湯，以店家為準。'},
  {q:'12306 用台胞證怎麼取票？', icon:'train', iconColor:'text-secondary',
    a:'現在多是電子客票，不用取紙本票。進站時拿台胞證正本，走人工通道或支援證件的閘機；需要報銷憑證再到窗口列印。'},
  {q:'老門東先逛哪裡？', icon:'storefront', iconColor:'text-primary',
    a:'從武定門站出來往老門東牌坊走，先逛箍桶巷與三條營，傍晚到城牆邊，最後去先鋒書店。'}
];
DATA.askLongmenQ = '龍門石窟西山跟東山差在哪？';
DATA.askLongmenA = {
  title:'西山精華・東山全景',
  text:'西山是主要石窟區，盧舍那大佛、古陽洞都在這；東山在伊河對岸，看得到西山全景，人比較少。',
  tip:'先走西山石窟，約 2 到 3 小時，再過橋到東山，從對岸看西山全景。'
};

/* ---------------- STATE / STORAGE ---------------- */

/* Bump when built-in itinerary DATA changes in a way that already-saved STORE.days needs patching. */
var DATA_VERSION = 2;

/* Spreadsheet seed sync: when SHEET_DATA.seedVersion is newer than STORE.seedVersion, seed-owned content is rebuilt (see seedSync). */
var SEED_VERSION = SHEET_DATA.seedVersion || 1;
/* Seed ids that shipped before the spreadsheet pipeline existed (phones with no STORE.seedIds fall back to these). */
var LEGACY_SEED_IDS = {"days": ["d1-0", "d1-1", "d1-2", "d1-3", "d1-4", "d1-5", "d1-6", "d1-7", "d1-8", "d1-9", "d2-0", "d2-1", "d2-2", "d2-3", "d2-4", "d2-5", "d2-6", "d2-7", "d2-8", "d3-0", "d3-1", "d3-2", "d3-3", "d3-4", "d3-5", "d3-6", "d3-7", "d4-0", "d4-1", "d4-2", "d4-3", "d4-4", "d4-5", "d4-6", "d4-7", "d4-8", "d4-9", "d5-0", "d5-1", "d5-2", "d5-3", "d5-4", "d5-5", "d5-6", "d5-7", "d5-8", "d6-0", "d6-1", "d6-2", "d6-3", "d6-3b", "d6-4", "d6-5", "d6-6", "d7-0", "d7-1", "d7-2", "d7-3", "d7-4", "d7-5", "d7-6", "d8-0", "d8-1", "d8-2", "d8-3", "d8-4", "d9-0", "d9-1", "d9-2", "d9-3", "d9-4", "d9-5", "d9-6", "d9-7", "d10-0", "d10-1", "d10-2", "d10-3", "d10-4", "d10-5", "d10-6"], "prep": ["p-transport-1", "p-transport-2", "p-transport-3", "p-transport-4", "p-transport-5", "p-transport-6", "p-ticket-1", "p-ticket-2", "p-ticket-3", "p-ticket-4", "p-ticket-5", "p-ticket-6", "p-ticket-7", "p-hotel-1", "p-hotel-2", "p-hotel-3", "p-hotel-4", "p-network-1", "p-insurance-1", "p-other-1", "p-other-2"], "packing": ["k-docs-1", "k-docs-2", "k-docs-3", "k-docs-4", "k-docs-5", "k-docs-6", "k-docs-7", "k-docs-8", "k-gadgets-1", "k-gadgets-2", "k-gadgets-3", "k-gadgets-4", "k-gadgets-5", "k-gadgets-6", "k-care-1", "k-care-2", "k-care-3", "k-care-4", "k-care-5", "k-care-6", "k-care-7", "k-care-8", "k-care-9", "k-clothes-1", "k-clothes-2", "k-clothes-3", "k-clothes-4", "k-clothes-5", "k-clothes-6", "k-clothes-7", "k-clothes-8", "k-clothes-9", "k-other-1", "k-other-2", "k-other-3", "k-other-4"], "tickets": ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"]};

/* ---- 同步（Supabase）相關旗標：載入 STORE 之前先讀 ---- */
var JOINED = false, HAD_STORE = false, syncSeedAllowed = false, drawerLocked = false;
try{ JOINED = !!localStorage.getItem('bibo-sync-trip'); HAD_STORE = !!localStorage.getItem('bibo-v3-store'); }catch(e){}
var Sync = null, SyncUI = null;

var STORE = {
  itineraryDone:{}, itineraryOrder:{}, spotFav:{}, chat:null, checklist:null, ticketStatus:{}, expenses:null,
  days:null, customSpots:[], notes:'', todaySelectedDay:null, dataVersion:0,
  memberNames:{ Lena:'Lena', Key:'Key' }, feePercent:1.5, fxRatesOverride:{},
  tickets:null, ticketAlerts:{}, ticketPrivate:{}
};
(function loadStore(){
  try{
    var raw = localStorage.getItem('bibo-v3-store');
    if(raw){ var parsed = JSON.parse(raw); for(var k in parsed){ STORE[k] = parsed[k]; } }
  }catch(e){}

  /* Migrate itinerary into an editable STORE.days (deep copy, stable ids) */
  var freshDays = false;
  if(!STORE.days){
    freshDays = true;
    STORE.days = DATA.days.map(function(d){
      return { day:d.day, date:d.date, tag:d.tag, title:d.title, subtitle:d.subtitle,
        items: d.items.map(function(it){ var c={}; for(var k in it){ c[k]=it[k]; } return c; }) };
    });
    STORE.days.forEach(function(d){
      d.items.forEach(function(it){
        var key = d.day+'/'+it.id;
        if(STORE.itineraryDone && STORE.itineraryDone.hasOwnProperty(key)){ it.done = !!STORE.itineraryDone[key]; }
      });
      var order = STORE.itineraryOrder && STORE.itineraryOrder[d.day];
      if(order && order.length){
        var map = {}; d.items.forEach(function(it){ map[it.id]=it; });
        var reordered = [];
        order.forEach(function(id){ if(map[id]){ reordered.push(map[id]); delete map[id]; } });
        for(var id2 in map){ reordered.push(map[id2]); }
        d.items = reordered;
      }
    });
  }
  if(!STORE.customSpots){ STORE.customSpots = []; }
  if(typeof STORE.notes !== 'string'){ STORE.notes = ''; }
  if(!STORE.memberNames){ STORE.memberNames = { Lena:'Lena', Key:'Key' }; }
  if(!STORE.feePercent){ STORE.feePercent = 1.5; }
  if(!STORE.fxRatesOverride){ STORE.fxRatesOverride = {}; }
  if(!STORE.ticketAlerts){ STORE.ticketAlerts = {}; }
  if(!STORE.ticketPrivate){ STORE.ticketPrivate = {}; }
  if(!STORE.tickets){
    STORE.tickets = DATA.tickets.map(function(t){
      var c = {}; for(var k in t){ c[k]=t[k]; }
      c.from = { name:t.from.name, sub:t.from.sub };
      c.to = { name:t.to.name, sub:t.to.sub };
      return c;
    });
  }
  if(!STORE.checklist){
    STORE.checklist = {
      prep: DATA.checklistPrep.map(function(it){ var c={}; for(var k in it){ c[k]=it[k]; } c.done=false; return c; }),
      packing: DATA.checklistPacking.map(function(it){ var c={}; for(var k in it){ c[k]=it[k]; } c.done=false; return c; })
    };
  }
  if(!STORE.expenses){
    STORE.expenses = DATA.expenses.map(function(e){ var c={}; for(var k in e){ c[k]=e[k]; } return c; });
  }
  if(!STORE.chat){ STORE.chat = null; }

  /* Data-version migrations: patch already-saved STORE.days without touching the user's other edits / ticks. */
  if(freshDays){
    STORE.dataVersion = DATA_VERSION;
  } else if(!STORE.dataVersion || STORE.dataVersion < DATA_VERSION){
    if(!STORE.dataVersion || STORE.dataVersion < 2){ patchDay6CanalErlitou(); }
    STORE.dataVersion = DATA_VERSION;
    persist();
  }

  /* Spreadsheet seed sync (runs after the data-version patches above) */
  seedSync(freshDays);
})();

/* v2: Day 6 merged item "大運河 或 二里頭（二選一）" -> two alt items, one per spot */
function patchDay6CanalErlitou(){
  var day6 = null;
  STORE.days.forEach(function(d){ if(d.day === 6) day6 = d; });
  if(!day6) return;
  var haveSpot = {};
  STORE.days.forEach(function(d){ d.items.forEach(function(it){ if(it.spotId) haveSpot[it.spotId] = true; }); });
  var NOTE = '二選一；二里頭在偃師，車程較遠';
  var canal = { id:'d6-3', time:'14:00', type:'景點', title:'隋唐大運河文化博物館', note:NOTE, spotId:'grand_canal_museum', alt:true };
  var erli = { id:'d6-3b', time:'14:00', type:'景點', title:'二里頭夏都遺址博物館', note:NOTE, spotId:'erlitou', alt:true };
  var origIdx = -1;
  day6.items.forEach(function(it, i){
    if(origIdx === -1 && !it.spotId && it.title && it.title.indexOf('二里頭') !== -1 && it.title.indexOf('運河') !== -1){ origIdx = i; }
  });
  var usedIds = {};
  STORE.days.forEach(function(d){ d.items.forEach(function(it){ if(it !== day6.items[origIdx]) usedIds[it.id] = true; }); });
  var toAdd = [];
  if(!haveSpot.grand_canal_museum) toAdd.push(canal);
  if(!haveSpot.erlitou) toAdd.push(erli);
  toAdd.forEach(function(it){ if(usedIds[it.id]) it.id = genId('d6'); });
  if(origIdx !== -1){
    /* replace in place; if one of the two already exists elsewhere, the original is still dropped */
    Array.prototype.splice.apply(day6.items, [origIdx, 1].concat(toAdd));
  } else {
    toAdd.forEach(function(it){ insertItemByTime(day6, it); });
  }
}

/* ---- Spreadsheet seed sync ----
   Rebuilds seed-owned content (itinerary, prep/packing templates, tickets) from SHEET_DATA when the spreadsheet was
   re-imported (SHEET_DATA.seedVersion > STORE.seedVersion). The spreadsheet is the master: seed items take the new text.
   Kept: done ticks (same id), items the user added in the app (id in neither old nor new seed), seed items the user
   deleted on this phone (id was in the previous seed, now missing from STORE), ticket status / alerts, custom spots,
   expenses, settings, chat, notes. */
function currentSeedIds(){
  var ids = { days:[], prep:[], packing:[], tickets:[] };
  DATA.days.forEach(function(d){ d.items.forEach(function(it){ ids.days.push(it.id); }); });
  DATA.checklistPrep.forEach(function(it){ ids.prep.push(it.id); });
  DATA.checklistPacking.forEach(function(it){ ids.packing.push(it.id); });
  DATA.tickets.forEach(function(t){ ids.tickets.push(t.id); });
  return ids;
}
function seedIdSet(list){ var m = {}; (list||[]).forEach(function(id){ m[id] = true; }); return m; }
function seedCopy(o){ var c = {}; for(var k in o){ c[k] = o[k]; } return c; }
function seedSync(fresh){
  /* 已加入共同行程時，種子升級改由 sync 在抓完雲端資料之後執行（sync.js 的 seedStep），避免用過期的本機勾選覆蓋對方 */
  if(JOINED && !syncSeedAllowed) return;
  var newIds = currentSeedIds();
  if(fresh){
    STORE.seedVersion = SEED_VERSION; STORE.seedIds = newIds;
    return;
  }
  var cur = STORE.seedVersion || 0;
  if(cur >= SEED_VERSION){
    if(!STORE.seedIds){ STORE.seedIds = newIds; }
    return;
  }
  if(!cur && SEED_VERSION <= 1){
    /* first spreadsheet-enabled build: seed content is identical to the legacy seed, just stamp it */
    STORE.seedVersion = SEED_VERSION; STORE.seedIds = newIds; persist();
    return;
  }
  var oldIds = STORE.seedIds || LEGACY_SEED_IDS;
  var oldDays = seedIdSet(oldIds.days), newDays = seedIdSet(newIds.days);

  /* itinerary */
  var existing = {};
  STORE.days.forEach(function(d){ d.items.forEach(function(it){ existing[it.id] = it; }); });
  var rebuilt = DATA.days.map(function(d){
    var nd = { day:d.day, date:d.date, tag:d.tag, title:d.title, subtitle:d.subtitle, items:[] };
    d.items.forEach(function(it){
      var e = existing[it.id];
      if(!e && oldDays[it.id]) return;
      var c = seedCopy(it);
      if(e && e.hasOwnProperty('done')) c.done = !!e.done;
      nd.items.push(c);
    });
    return nd;
  });
  var byNum = {};
  rebuilt.forEach(function(d){ byNum[d.day] = d; });
  STORE.days.forEach(function(d){
    d.items.forEach(function(it){
      if(oldDays[it.id] || newDays[it.id]) return;
      insertItemByTime(byNum[d.day] || rebuilt[rebuilt.length-1], it);
    });
  });
  STORE.days = rebuilt;

  /* checklists */
  function syncList(tab, seedList, oldSet, newSet){
    var curList = (STORE.checklist && STORE.checklist[tab]) || [];
    var ex = {};
    curList.forEach(function(it){ ex[it.id] = it; });
    var out = [];
    seedList.forEach(function(s){
      var e = ex[s.id];
      if(!e && oldSet[s.id]) return;
      var c = seedCopy(s); c.done = e ? !!e.done : false;
      out.push(c);
    });
    curList.forEach(function(it){ if(!oldSet[it.id] && !newSet[it.id]) out.push(it); });
    STORE.checklist[tab] = out;
  }
  if(!STORE.checklist){ STORE.checklist = { prep:[], packing:[] }; }
  syncList('prep', DATA.checklistPrep, seedIdSet(oldIds.prep), seedIdSet(newIds.prep));
  syncList('packing', DATA.checklistPacking, seedIdSet(oldIds.packing), seedIdSet(newIds.packing));

  /* tickets (status / alerts live in STORE.ticketStatus / ticketAlerts, keyed by id, untouched) */
  var oldT = seedIdSet(oldIds.tickets), newT = seedIdSet(newIds.tickets);
  var exT = {};
  (STORE.tickets || []).forEach(function(t){ exT[t.id] = t; });
  var tOut = [];
  DATA.tickets.forEach(function(t){
    var e = exT[t.id];
    if(!e && oldT[t.id]) return;
    var c = seedCopy(t);
    c.from = { name:t.from.name, sub:t.from.sub };
    c.to = { name:t.to.name, sub:t.to.sub };
    if(e){ ['carriage','orderLink','ticketLink','rushNote'].forEach(function(k){ if(e[k] !== undefined) c[k] = e[k]; }); }
    tOut.push(c);
  });
  (STORE.tickets || []).forEach(function(t){ if(!oldT[t.id] && !newT[t.id]) tOut.push(t); });
  STORE.tickets = tOut;
  sortTicketsByDate();

  STORE.seedVersion = SEED_VERSION;
  STORE.seedIds = newIds;
  persist();
}

function persistRaw(){
  try{ localStorage.setItem('bibo-v3-store', JSON.stringify(STORE)); }catch(e){}
}
function persist(){
  persistRaw();
  if(Sync) Sync.onPersist();
}

function fxRateFor(date){
  return (STORE.fxRatesOverride && STORE.fxRatesOverride[date]) || DATA.fxRates[date] || 4.4;
}

/* ---- 台銀當日匯率（Edge Function fx-rate）----
   取回的匯率只放在 DATA.fxRates（不進 STORE、不同步），所以設定裡手動改過的匯率（fxRatesOverride）永遠優先。 */
var FX_CACHE_KEY = 'bibo-fx-cache';
function fxTodayKey(){ var d = new Date(); return (d.getMonth()+1)+'/'+d.getDate(); }
function fxTodayStamp(){ var d = new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
function fxApply(rate){
  var r = Number(rate);
  if(!isFinite(r) || r < 3 || r > 7) return false;
  DATA.fxRates[fxTodayKey()] = Math.round(r*10000)/10000;
  return true;
}
function fxLoadCache(){
  try{
    var c = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || 'null');
    if(c && fxApply(c.rate)) return c;
  }catch(e){}
  return null;
}
var fxBusy = false;
function refreshFx(force){
  if(fxBusy || !Sync || !Sync.isJoined()) return;
  var cache = null;
  try{ cache = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || 'null'); }catch(e){}
  if(!force && cache && cache.stamp === fxTodayStamp()) return;
  if(navigator.onLine === false || window.__biboOffline) return;
  fxBusy = true;
  Sync.callFunction('fx-rate', {}).then(function(res){
    fxBusy = false;
    var d = res && res.data;
    if(d && fxApply(d.rate)){
      try{ localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ stamp: fxTodayStamp(), rate: Number(d.rate), source: d.source || '', date: d.date || '' })); }catch(e){}
      refreshCurrentView();
    }
  });
}

function memberName(key){ return (STORE.memberNames && STORE.memberNames[key]) || key; }
function feeMultiplier(){ return 1 + (STORE.feePercent||1.5)/100; }

var state = { selectedDay: 3, spotCity: 'all', spotQuery: '' };

/* ---------------- HELPERS ---------------- */

function fmtNum(n){ return Math.round(n).toLocaleString('en-US'); }
function fmtPerson(n){
  var r = Math.round(n*10)/10;
  return (r % 1 === 0) ? String(Math.round(r)) : String(r);
}
function showToast(msg){
  var root = document.getElementById('toast-root');
  var el = document.createElement('div');
  el.className = 'fixed left-1/2 -translate-x-1/2 bottom-24 z-[999] px-4 py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-lg flex items-center gap-1.5';
  el.style.transition = 'opacity .25s ease, transform .25s ease';
  el.innerHTML = '<span class="material-symbols-outlined text-[16px]">construction</span><span>'+(msg||'這個畫面還在設計中')+'</span>';
  root.appendChild(el);
  setTimeout(function(){
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, 6px)';
    setTimeout(function(){ el.remove(); }, 260);
  }, 1500);
}

function showUndoToast(msg, undoFn){
  var root = document.getElementById('toast-root');
  var el = document.createElement('div');
  el.className = 'fixed left-1/2 -translate-x-1/2 bottom-24 z-[999] px-4 py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-lg flex items-center gap-2';
  el.style.transition = 'opacity .25s ease, transform .25s ease';
  var span = document.createElement('span');
  span.textContent = msg;
  var btn = document.createElement('button');
  btn.className = 'underline font-bold shrink-0';
  btn.textContent = '復原';
  var done = false;
  function dismiss(){
    if(done) return; done = true;
    el.style.opacity = '0'; el.style.transform = 'translate(-50%, 6px)';
    setTimeout(function(){ el.remove(); }, 260);
  }
  btn.addEventListener('click', function(){ if(!done){ done = true; undoFn(); el.remove(); } });
  el.appendChild(span); el.appendChild(btn);
  root.appendChild(el);
  setTimeout(dismiss, 4000);
}

/* ---------------- SHARED BOTTOM DRAWER ---------------- */

function openDrawer(innerHTML, onMount){
  var root = document.getElementById('drawer-root');
  root.innerHTML = '<div class="fixed inset-0 bg-on-surface/40 backdrop-blur-sm z-[65]" id="drawer-backdrop"></div>'
    + '<div class="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-[70] flex flex-col justify-end pointer-events-none">'
    + '<div class="bg-surface-bright rounded-t-[28px] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] p-margin pb-safe flex flex-col space-y-space-md max-h-[88vh] overflow-y-auto pointer-events-auto" style="padding-bottom:calc(24px + env(safe-area-inset-bottom,0px))" id="drawer-body">'
    + '<div class="flex flex-col items-center w-full"><div class="w-12 h-1.5 rounded-full bg-surface-container-highest mb-space-sm"></div></div>'
    + innerHTML
    + '</div></div>';
  document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);
  if(onMount) onMount();
}
function closeDrawer(){
  if(drawerLocked) return;
  document.getElementById('drawer-root').innerHTML = '';
}
function lockDrawer(v){ drawerLocked = !!v; }
window.closeDrawer = closeDrawer;

/* ---------------- DATE / MISC HELPERS ---------------- */

function domainOf(url){
  try{ return url.replace(/^https?:\/\//,'').replace(/\/.*$/,''); }catch(e){ return url; }
}
function dayForDate(date){
  var found = null;
  STORE.days.forEach(function(d){ if(d.date === date) found = d; });
  return found;
}
function cityForDate(date){
  var d = dayForDate(date);
  if(!d) return '';
  return DATA.DAY_CITY[d.day] || '';
}
function relatedItineraryLabel(date){
  var d = dayForDate(date);
  if(!d) return '';
  return 'Day '+d.day+'・'+(DATA.DAY_CITY[d.day]||'');
}
function pad2(n){ return (n<10?'0':'')+n; }
function nowTimeStr(){
  var now = new Date();
  return pad2(now.getHours())+':'+pad2(now.getMinutes());
}
function findDayByNum(n){
  var found = null;
  STORE.days.forEach(function(d){ if(d.day === n) found = d; });
  return found;
}
function findItemLocation(itemId){
  var result = null;
  STORE.days.forEach(function(d){
    d.items.forEach(function(it){ if(it.id === itemId){ result = { day:d, item:it }; } });
  });
  return result;
}
function timeSortKey(timeStr){
  var m = /^(\d{1,2}):(\d{2})/.exec(timeStr||'');
  if(!m) return 9999;
  return parseInt(m[1],10)*60+parseInt(m[2],10);
}
function insertItemByTime(day, item){
  if(!item.time){ day.items.push(item); return; }
  var t = timeSortKey(item.time);
  var insertIdx = day.items.length;
  for(var i=0;i<day.items.length;i++){
    var other = day.items[i];
    if(!other.time) continue;
    if(timeSortKey(other.time) > t){ insertIdx = i; break; }
  }
  day.items.splice(insertIdx, 0, item);
}
function genId(prefix){ return prefix+'-'+Date.now()+'-'+Math.floor(Math.random()*1000); }

/* ---------------- SPOT LIBRARY (built-in + custom) ---------------- */

function allSpots(){ return DATA.spots.concat(STORE.customSpots); }
function findSpotById(id){
  var found = null;
  allSpots().forEach(function(s){ if(s.id === id) found = s; });
  return found;
}
function amapForSpot(spot){
  if(!spot) return { kw:'', city:'' };
  var known = AMAP_KEYWORDS[spot.id];
  if(known) return known;
  return { kw: spot.amapKeyword || spot.fullName || spot.name, city: cityName(spot.city) };
}
/* Due-date label for checklist items, based on the device's real current date */
function dueLabel(dueISO){
  if(!dueISO) return null;
  var today = new Date(); today.setHours(0,0,0,0);
  var due = new Date(dueISO+'T00:00:00');
  var days = Math.round((due - today) / 86400000);
  if(days < 0) return {text:'已過期', cls:'text-outline'};
  if(days <= 3) return {text: days===0 ? '剩 0 天' : ('剩 '+days+' 天'), cls:'text-error font-bold'};
  return {text:'D-'+days, cls:'text-outline'};
}

function isSpotVisited(spotId){
  var visited = false;
  STORE.days.forEach(function(d){
    d.items.forEach(function(it){
      if(it.spotId === spotId && it.done){ visited = true; }
    });
  });
  return visited;
}

/* ---------------- TODAY ---------------- */

var TODAY_DONE_BTN_CLASS = "today-checkbox-trigger shrink-0 w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center transition-all active:scale-90";
var TODAY_UNDONE_BTN_CLASS = "today-checkbox-trigger shrink-0 w-8 h-8 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center transition-all active:scale-90";
var TODAY_DONE_BULLET_CLASS = "node-bullet absolute -left-[27px] top-3.5 w-6 h-6 rounded-full bg-secondary text-on-secondary flex items-center justify-center shadow-sm z-10 transition-transform group-hover:scale-110";
var TODAY_UNDONE_BULLET_CLASS = "node-bullet absolute -left-[27px] top-3.5 w-6 h-6 rounded-full bg-surface-variant text-on-surface-variant flex items-center justify-center shadow-sm z-10 transition-transform group-hover:scale-110";
var TODAY_ACTIVE_BULLET_CLASS = "node-bullet absolute -left-[27px] top-3.5 w-6 h-6 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-md z-10 animate-bounce";
var TODAY_PLAIN_CARD_CLASS = "w-full rounded-2xl bg-surface-container-lowest p-space-sm shadow-sm flex items-center justify-between gap-space-sm transition-all hover:shadow-md";
var TODAY_ACTIVE_CARD_CLASS = "w-full rounded-2xl bg-surface-container-lowest p-space-sm shadow-md flex items-center justify-between gap-space-sm relative overflow-hidden bg-gradient-to-r from-primary-fixed/30 to-surface-container-lowest";
var TODAY_ACTIVE_BOX_CLASS = "w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center text-on-primary-container shrink-0 shadow-sm";

var TYPE_TODAY_ICON = { '交通':'train', '餐食':'ramen_dining', '景點':'temple_buddhist', '住宿':'bed', '其他':'event' };
var TYPE_TODAY_BULLET_ICON = { '交通':'train', '餐食':'ramen_dining', '景點':'tour', '住宿':'hotel', '其他':'event' };
var TYPE_TODAY_ICON_COLOR = { '交通':'text-secondary', '餐食':'text-primary-container', '景點':'text-on-primary-container', '住宿':'text-secondary', '其他':'text-tertiary' };
var TYPE_TODAY_BADGE_CLASS = { '交通':'bg-secondary-fixed text-on-secondary-fixed-variant', '餐食':'bg-primary-fixed text-on-primary-fixed', '景點':'bg-tertiary-fixed text-on-tertiary-fixed', '住宿':'bg-surface-container text-on-surface-variant', '其他':'bg-surface-container text-on-surface-variant' };
var ALT_TODAY_BADGE_CLASS = 'bg-surface-container text-on-surface-variant';

function computeAutoTodayDay(){
  var today = new Date(); today.setHours(0,0,0,0);
  var start = new Date(2026,11,24);
  var end = new Date(2027,0,3);
  if(today < start) return 0;
  if(today > end) return 10;
  var diffDays = Math.round((today-start)/86400000);
  return Math.min(10, Math.max(0, diffDays));
}
function currentTodayDay(){
  return (STORE.todaySelectedDay !== null && STORE.todaySelectedDay !== undefined) ? STORE.todaySelectedDay : computeAutoTodayDay();
}
function todayDayData(){
  return findDayByNum(currentTodayDay());
}

function todayFirstSpotItem(day){
  var found = null;
  day.items.forEach(function(it){ if(!found && it.type === '景點') found = it; });
  return found;
}
function todayBubbleTitle(day){
  var item = todayFirstSpotItem(day);
  if(item){
    var spot = item.spotId ? findSpotById(item.spotId) : null;
    return '今天去看'+(spot ? spot.name : item.title)+'！';
  }
  return day.title;
}
function todayNextItem(day){
  var found = null;
  day.items.forEach(function(it){
    if(found) return;
    if((it.type === '景點' || it.type === '交通') && !it.done){ found = it; }
  });
  return found;
}
function todayTipText(day){
  var item = null;
  day.items.forEach(function(it){ if(!item && it.type === '景點' && it.spotId) item = it; });
  if(item){
    var r = DATA.reminders[item.spotId];
    if(r){
      var noteRow = null;
      (r.rows||[]).forEach(function(row){ if(!noteRow && (row.type==='note' || row.type==='simple')) noteRow = row; });
      if(noteRow){
        return noteRow.type==='note' ? noteRow.note : (noteRow.label+'：'+noteRow.value);
      }
      if(r.winterTips && r.winterTips.length) return r.winterTips[0].text;
      if(r.rows && r.rows.length) return r.rows[0].label;
    }
  }
  return '出發前檢查好證件與常備藥。';
}

function todayActiveItemId(items){
  var found = null;
  items.forEach(function(it){
    if(found) return;
    if(it.type === '景點' && !it.alt && !it.done){ found = it.id; }
  });
  return found;
}

function todayItemHTML(item, isActive, doneState){
  var icon = TYPE_TODAY_ICON[item.type] || 'event';
  var bulletIcon0 = TYPE_TODAY_BULLET_ICON[item.type] || 'event';
  var iconColor = TYPE_TODAY_ICON_COLOR[item.type] || 'text-tertiary';
  var badgeClass = item.alt ? ALT_TODAY_BADGE_CLASS : (TYPE_TODAY_BADGE_CLASS[item.type] || 'bg-surface-container text-on-surface-variant');
  var badgeText = item.alt ? '備案' : item.type;
  var boxCls = isActive ? TODAY_ACTIVE_BOX_CLASS : ('w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center ' + iconColor + ' shrink-0');
  var cardCls = isActive ? TODAY_ACTIVE_CARD_CLASS : TODAY_PLAIN_CARD_CLASS;
  var bulletCls, bulletIcon, bulletFill = '';
  if(doneState){ bulletCls = TODAY_DONE_BULLET_CLASS; bulletIcon = 'check'; }
  else if(isActive){ bulletCls = TODAY_ACTIVE_BULLET_CLASS; bulletIcon = 'tour'; bulletFill = " style=\"font-variation-settings: 'FILL' 1;\""; }
  else { bulletCls = TODAY_UNDONE_BULLET_CLASS; bulletIcon = bulletIcon0; }
  var bulletSize = 14;
  var badgeHTML = isActive
    ? '<span class="font-label-sm text-label-sm px-1.5 py-0.2 rounded-full bg-primary-container text-on-primary-container font-bold">進行中</span>'
    : '<span class="font-label-sm text-label-sm px-1.5 py-0.2 rounded '+badgeClass+'">'+badgeText+'</span>';
  var timeCls = isActive ? 'font-label-md text-label-md text-primary font-bold' : 'font-label-md text-label-md text-on-surface-variant';
  var titleCls = 'font-body-lg text-body-lg font-bold text-on-surface truncate' + (doneState ? ' line-through opacity-70' : '');
  var checkBtnCls = doneState ? TODAY_DONE_BTN_CLASS : TODAY_UNDONE_BTN_CLASS;
  var checkIcon = doneState ? 'check_box' : 'check_box_outline_blank';
  return '<div class="timeline-node relative flex items-start group" data-item="'+item.id+'">'
    +'<div class="'+bulletCls+'"><span class="material-symbols-outlined text-['+bulletSize+'px]"'+bulletFill+'>'+bulletIcon+'</span></div>'
    +'<div class="'+cardCls+'">'
    +'<button class="flex items-center gap-3 min-w-0 flex-1 text-left today-item-open" data-item="'+item.id+'" type="button">'
    +'<div class="'+boxCls+'"><span class="material-symbols-outlined text-[20px]">'+icon+'</span></div>'
    +'<div class="flex flex-col min-w-0">'
    +'<div class="flex items-center gap-1.5">'+badgeHTML+'<span class="'+timeCls+'">'+(item.time||'')+'</span></div>'
    +'<h4 class="'+titleCls+'">'+item.title+'</h4>'
    +'<p class="font-body-sm text-body-sm text-on-surface-variant truncate">'+(item.note||'')+'</p>'
    +'</div></button>'
    +'<button aria-label="標記完成狀態" class="'+checkBtnCls+'" data-item="'+item.id+'" type="button"><span class="material-symbols-outlined text-[18px]">'+checkIcon+'</span></button>'
    +'</div></div>';
}

function renderTodayPage(){
  var day = todayDayData();
  if(!day) return;
  var city = DATA.DAY_CITY[day.day] || '';
  var bubbleEl = document.getElementById('today-bubble-title');
  if(bubbleEl) bubbleEl.textContent = todayBubbleTitle(day);
  var subEl = document.getElementById('today-subtitle');
  if(subEl) subEl.textContent = day.subtitle || '';
  var badgeTextEl = document.getElementById('today-day-badge-text');
  if(badgeTextEl) badgeTextEl.textContent = 'Day '+day.day+'・'+city;
  var weatherEl = document.getElementById('today-weather-text');
  if(weatherEl){
    var w = DATA.weatherAvg[city];
    weatherEl.textContent = w ? (city+' 12 月均溫 '+w.lo+'~'+w.hi+'°C・記得毛帽 🧣') : (city+' 記得注意保暖');
  }
  var tipEl = document.getElementById('today-tip-text');
  if(tipEl) tipEl.textContent = todayTipText(day);

  var nextSection = document.getElementById('today-next-section');
  var nextItem = todayNextItem(day);
  if(nextSection){
    nextSection.hidden = !nextItem;
    if(nextItem){
      var spot = nextItem.spotId ? findSpotById(nextItem.spotId) : null;
      document.getElementById('today-next-time').textContent = (nextItem.time||'')+' 出發';
      document.getElementById('today-next-title').textContent = spot ? spot.name : nextItem.title;
      document.getElementById('today-next-note').textContent = nextItem.note || nextItem.title;
      var kw = nextItem.loc || (spot ? amapForSpot(spot).kw : nextItem.title);
      var kwCity = spot ? amapForSpot(spot).city : city;
      document.getElementById('btn-navigate').href = 'https://uri.amap.com/search?keyword='+encodeURIComponent(kw)+'&city='+encodeURIComponent(kwCity)+'&src=bibo&callnative=1';
      var guideBtn = document.getElementById('btn-guide');
      if(spot){ guideBtn.hidden = false; guideBtn.href = '#spot/'+spot.id; guideBtn.closest('#today-next-actions').className = 'grid grid-cols-2 gap-space-sm mt-space-md relative z-10'; }
      else { guideBtn.hidden = true; guideBtn.closest('#today-next-actions').className = 'grid grid-cols-1 gap-space-sm mt-space-md relative z-10'; }
    }
  }
  renderTodayItems();
  bindTodayDayBadge();
}

function renderTodayItems(){
  var day = todayDayData();
  if(!day) return;
  var activeId = todayActiveItemId(day.items);
  var html = day.items.map(function(it){
    var isActive = (it.id === activeId);
    return todayItemHTML(it, isActive, !!it.done);
  }).join('');
  document.getElementById('today-items').innerHTML = html;
  updateTodayProgress(day);
  document.querySelectorAll('.today-checkbox-trigger').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var itemId = btn.getAttribute('data-item');
      var it = null;
      day.items.forEach(function(x){ if(x.id===itemId) it=x; });
      if(it){ it.done = !it.done; persist(); renderTodayPage(); }
    });
  });
  document.querySelectorAll('.today-item-open').forEach(function(btn){
    btn.addEventListener('click', function(){
      openItemEditDrawer(day.day, btn.getAttribute('data-item'));
    });
  });
}

function updateTodayProgress(day){
  var progressChip = document.getElementById('progress-chip');
  if(!progressChip) return;
  var total = day.items.length;
  var count = day.items.filter(function(it){ return !!it.done; }).length;
  if(total>0 && count === total){ progressChip.className = "px-2 py-0.5 rounded-full bg-primary text-on-primary font-label-sm text-label-sm"; progressChip.textContent = "全數完成！"; }
  else { progressChip.className = "px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm"; progressChip.textContent = count + " / " + total + " 已完成"; }
}

function todayDayPickerDrawerHTML(){
  var current = currentTodayDay();
  var isManual = (STORE.todaySelectedDay !== null && STORE.todaySelectedDay !== undefined);
  var rows = STORE.days.map(function(d){
    var active = d.day === current;
    var cls = active
      ? 'w-full flex items-center justify-between p-space-sm rounded-xl bg-primary-container text-on-primary-container shadow-sm today-daypick-row'
      : 'w-full flex items-center justify-between p-space-sm rounded-xl bg-surface-container-lowest text-on-surface hover:bg-surface-container-low shadow-sm today-daypick-row';
    return '<button class="'+cls+'" data-day="'+d.day+'" type="button">'
      +'<span class="font-body-lg text-body-lg font-bold">Day '+d.day+'・'+d.date+' '+(WEEKDAY[d.date]||'')+'</span>'
      +'<span class="font-label-sm text-label-sm">'+(d.title||'')+'</span>'
      +'</button>';
  }).join('');
  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">calendar_month</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">選擇要看哪一天</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +(isManual ? '<button class="w-full py-2.5 rounded-full bg-secondary-container text-on-secondary-container font-label-lg text-label-lg font-bold shadow-sm" id="today-back-to-today" type="button">回到今天</button>' : '')
    +'<div class="flex flex-col gap-space-xs">'+rows+'</div>';
}
function bindTodayDayBadge(){
  var badge = document.getElementById('today-day-badge');
  if(!badge) return;
  badge.onclick = function(){
    openDrawer(todayDayPickerDrawerHTML(), function(){
      document.querySelectorAll('.today-daypick-row').forEach(function(btn){
        btn.addEventListener('click', function(){
          STORE.todaySelectedDay = parseInt(btn.getAttribute('data-day'),10);
          persist(); closeDrawer(); renderTodayPage();
        });
      });
      var backBtn = document.getElementById('today-back-to-today');
      if(backBtn){ backBtn.addEventListener('click', function(){ STORE.todaySelectedDay = null; persist(); closeDrawer(); renderTodayPage(); }); }
    });
  };
}

document.addEventListener('DOMContentLoaded', function(){
  var dismissBtn = document.getElementById('dismiss-tip');
  if(dismissBtn){ dismissBtn.addEventListener('click', function(){ var card = dismissBtn.closest('section'); if(card) card.hidden = true; }); }
  var addBtn = document.getElementById('quick-add-btn');
  if(addBtn){
    addBtn.addEventListener('click', function(){
      openItemEditDrawer(currentTodayDay(), null, '其他');
    });
  }
});

/* ---------------- ITINERARY (plan) ---------------- */

var TYPE_CLASS = {
  '其他':'bg-surface-container-high text-on-surface-variant',
  '住宿':'bg-surface-container-high text-on-surface-variant',
  '景點':'bg-tertiary-fixed text-on-tertiary-fixed',
  '餐食':'bg-primary-fixed text-on-primary-fixed',
  '交通':'bg-secondary-fixed text-on-secondary-fixed'
};

function isDone(dayNum, itemId){
  var day = findDayByNum(dayNum);
  if(!day) return false;
  var found = false;
  day.items.forEach(function(it){ if(it.id===itemId) found = !!it.done; });
  return found;
}

function moveItemUpDown(dayNum, itemId, dir){
  var day = findDayByNum(dayNum);
  if(!day) return;
  var idx = day.items.findIndex(function(it){ return it.id === itemId; });
  var newIdx = idx + dir;
  if(idx === -1 || newIdx < 0 || newIdx >= day.items.length) return;
  var tmp = day.items[idx]; day.items[idx] = day.items[newIdx]; day.items[newIdx] = tmp;
  persist();
}
function moveItemToDay(itemId, fromDayNum, toDayNum){
  if(fromDayNum === toDayNum) return;
  var fromDay = findDayByNum(fromDayNum);
  var toDay = findDayByNum(toDayNum);
  if(!fromDay || !toDay) return;
  var idx = fromDay.items.findIndex(function(it){ return it.id === itemId; });
  if(idx === -1) return;
  var moved = fromDay.items.splice(idx,1)[0];
  insertItemByTime(toDay, moved);
  persist();
}

function rerenderCurrentItineraryViews(){
  var hash = (location.hash || '#today').replace('#','');
  var view = hash.split('/')[0];
  if(view === 'today'){ renderTodayPage(); }
  else if(view === 'plan'){ renderDay(); }
}

function datePillsHTML(){
  return STORE.days.map(function(d){
    var sel = d.day === state.selectedDay;
    if(sel){
      return '<button class="date-pill relative flex flex-col items-center justify-center w-16 py-2.5 rounded-xl bg-primary-container text-on-primary-container shadow-md font-bold transition-all scale-105" data-day="'+d.day+'"><span class="font-label-sm text-label-sm tracking-wide">Day '+d.day+'</span><span class="font-headline-md text-headline-md font-extrabold leading-none mt-0.5">'+d.date+'</span><span class="absolute -bottom-1 w-2.5 h-1 rounded-full bg-primary"></span><span class="material-symbols-outlined absolute -top-1.5 -right-1 text-primary text-[14px]">pets</span></button>';
    }
    return '<button class="date-pill flex flex-col items-center justify-center w-14 py-2 rounded-xl bg-surface-container-low text-on-surface-variant hover:bg-surface-container transition-all" data-day="'+d.day+'"><span class="font-label-sm text-label-sm opacity-80">Day '+d.day+'</span><span class="font-headline-md text-headline-md font-bold mt-0.5">'+d.date+'</span></button>';
  }).join('');
}

function dayHeaderHTML(d){
  return '<div class="relative w-full rounded-2xl bg-surface-container-lowest p-space-md shadow-md overflow-hidden">'
    +'<div class="absolute -right-3 -top-3 w-20 h-20 bg-secondary-container/40 rounded-full blur-xl pointer-events-none"></div>'
    +'<div class="flex items-start justify-between relative z-10">'
    +'<div class="space-y-1 min-w-0 flex-1 pr-2">'
    +'<div class="flex items-center gap-space-xs text-on-surface-variant font-label-md text-label-md">'
    +'<span class="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-bold">'+d.tag+'</span>'
    +'<span>Day '+d.day+'・'+d.date+' '+WEEKDAY[d.date]+'</span>'
    +'</div>'
    +'<h2 class="font-headline-xl-mobile text-headline-xl-mobile text-on-surface font-black tracking-tight pt-1 line-clamp-2">'+d.title+'</h2>'
    +'<p class="font-body-sm text-body-sm text-on-surface-variant flex items-start gap-1 pt-0.5"><span class="material-symbols-outlined text-[16px] text-primary shrink-0">lightbulb</span><span class="line-clamp-2">'+d.subtitle+'</span></p>'
    +'</div>'
    +'<div class="flex flex-col items-end gap-1 shrink-0">'
    +'<span class="px-2 py-1 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>'+d.items.length+' 個項目</span>'
    +'</div></div></div>';
}

function itemCardHTML(d, item){
  var checked = isDone(d.day, item.id);
  var isAlt = !!item.alt;
  var cardCls = isAlt
    ? 'relative flex items-center gap-space-xs p-3.5 rounded-xl bg-surface-container-low shadow-none hover:shadow-sm transition-shadow opacity-90'
    : 'relative flex items-center gap-space-xs p-3.5 rounded-xl bg-surface-container-lowest shadow-sm hover:shadow transition-shadow';
  var timeCls = isAlt ? 'font-headline-md text-headline-md font-bold text-on-surface-variant' : 'font-headline-md text-headline-md font-bold text-on-surface';
  var pillCls = isAlt
    ? 'px-1.5 py-0.2 rounded bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm mt-0.5'
    : 'px-2 py-0.5 rounded-full '+TYPE_CLASS[item.type]+' font-label-sm text-label-sm mt-0.5';
  var titleInner = item.spotId
    ? '<a href="#spot/'+item.spotId+'" class="hover:underline decoration-dotted underline-offset-2">'+item.title+'</a>'
    : item.title;
  var altBadge = isAlt ? '<span class="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm shrink-0">備案</span>' : '';
  var checkBtnCls = checked
    ? 'w-6 h-6 rounded-md bg-secondary-container flex items-center justify-center text-on-secondary-container'
    : 'w-6 h-6 rounded-md bg-surface-container-high flex items-center justify-center text-transparent hover:text-on-surface-variant';
  return '<div class="itin-card '+cardCls+'" draggable="true" data-item-id="'+item.id+'">'
    +'<button class="drag-handle text-outline cursor-grab touch-none p-1 flex items-center justify-center" aria-label="拖曳排序"><span class="material-symbols-outlined text-[20px]">drag_indicator</span></button>'
    +'<div class="flex flex-col items-start w-16 shrink-0">'
    +'<span class="'+timeCls+'">'+item.time+'</span>'
    +'<span class="'+pillCls+'">'+item.type+'</span>'
    +'</div>'
    +'<div class="flex-1 min-w-0 px-1">'
    +'<div class="flex items-start gap-1.5"><div class="font-body-lg text-body-lg text-on-surface font-bold line-clamp-2 flex-1 min-w-0">'+titleInner+'</div>'+altBadge+'</div>'
    +(item.note ? '<div class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-0.5">'+item.note+'</div>' : '')
    +'</div>'
    +'<div class="flex items-center gap-1 shrink-0">'
    +'<button class="checkbox-trigger '+checkBtnCls+'" data-day="'+d.day+'" data-item="'+item.id+'" aria-label="標記完成"><span class="material-symbols-outlined text-[16px] font-bold">check</span></button>'
    +'<button class="item-more-btn w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface" data-day="'+d.day+'" data-item="'+item.id+'" aria-label="更多"><span class="material-symbols-outlined text-[20px]">more_vert</span></button>'
    +'</div></div>';
}

function renderDay(){
  var d = findDayByNum(state.selectedDay);
  document.getElementById('day-header-card').innerHTML = dayHeaderHTML(d);
  renderDayItems();
  document.getElementById('date-pills').innerHTML = datePillsHTML();
  bindDatePills();
}

function renderDayItems(){
  var d = findDayByNum(state.selectedDay);
  var wrap = document.getElementById('day-items');
  wrap.innerHTML = d.items.map(function(it){ return itemCardHTML(d, it); }).join('');
  bindItemEvents(d);
}

function bindDatePills(){
  document.querySelectorAll('.date-pill').forEach(function(btn){
    btn.addEventListener('click', function(){
      state.selectedDay = parseInt(btn.getAttribute('data-day'), 10);
      renderDay();
    });
  });
}

function bindItemEvents(d){
  document.querySelectorAll('#day-items .checkbox-trigger').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var dayNum = parseInt(btn.getAttribute('data-day'),10);
      var itemId = btn.getAttribute('data-item');
      var day = findDayByNum(dayNum);
      var it = null;
      day.items.forEach(function(x){ if(x.id===itemId) it=x; });
      if(it){ it.done = !it.done; persist(); renderDayItems(); }
    });
  });
  document.querySelectorAll('#day-items .item-more-btn').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var dayNum = parseInt(btn.getAttribute('data-day'),10);
      openItemEditDrawer(dayNum, btn.getAttribute('data-item'));
    });
  });
  bindDrag(d);
}

/* Drag & drop reordering */
var dragState = { id:null, tipEl:null };
function bindDrag(d){
  var wrap = document.getElementById('day-items');
  var cards = Array.prototype.slice.call(wrap.querySelectorAll('.itin-card'));
  cards.forEach(function(card){
    card.addEventListener('dragstart', function(e){
      dragState.id = card.getAttribute('data-item-id');
      e.dataTransfer.effectAllowed = 'move';
      try{ e.dataTransfer.setData('text/plain', dragState.id); }catch(err){}
      card.classList.add('drag-over-active');
      var pin = document.createElement('div');
      pin.className = 'drag-tip absolute -top-3.5 right-6 px-2 py-0.5 rounded-full bg-primary text-on-primary font-label-sm text-label-sm shadow flex items-center gap-1 z-20';
      pin.innerHTML = '<span class="material-symbols-outlined text-[12px]">touch_app</span><span>正在移動順序...</span>';
      card.style.position = 'relative';
      card.appendChild(pin);
      dragState.tipEl = pin;
    });
    card.addEventListener('dragend', function(){
      card.classList.remove('drag-over-active');
      if(dragState.tipEl){ dragState.tipEl.remove(); dragState.tipEl = null; }
      document.querySelectorAll('.drop-indicator').forEach(function(x){ x.remove(); });
      dragState.id = null;
    });
    card.addEventListener('dragover', function(e){
      e.preventDefault();
      document.querySelectorAll('.drop-indicator').forEach(function(x){ x.remove(); });
      if(card.getAttribute('data-item-id') === dragState.id) return;
      var rect = card.getBoundingClientRect();
      var before = (e.clientY - rect.top) < rect.height/2;
      var indicator = document.createElement('div');
      indicator.className = 'drop-indicator relative py-1 flex items-center justify-center';
      indicator.innerHTML = '<div class="w-full h-1 bg-primary-container rounded-full shadow-[0_0_8px_rgba(242,142,43,0.8)]"></div><div class="absolute left-2 w-3 h-3 rounded-full bg-primary-container ring-2 ring-surface"></div><div class="absolute right-2 w-3 h-3 rounded-full bg-primary-container ring-2 ring-surface"></div>';
      if(before){ card.parentNode.insertBefore(indicator, card); } else { card.parentNode.insertBefore(indicator, card.nextSibling); }
    });
    card.addEventListener('drop', function(e){
      e.preventDefault();
      var draggedId = dragState.id;
      if(!draggedId || draggedId === card.getAttribute('data-item-id')) return;
      var rect = card.getBoundingClientRect();
      var before = (e.clientY - rect.top) < rect.height/2;
      var day = d;
      var fromIdx = day.items.findIndex(function(it){ return it.id === draggedId; });
      var moved = day.items.splice(fromIdx, 1)[0];
      var toIdx = day.items.findIndex(function(it){ return it.id === card.getAttribute('data-item-id'); });
      if(!before) toIdx += 1;
      day.items.splice(toIdx, 0, moved);
      persist();
      renderDayItems();
    });
  });
}

/* ---------------- ITEM EDIT / ADD DRAWER ---------------- */

var ITEM_TYPES = ['其他','景點','餐食','交通','住宿'];

function itemTypeChipHTML(t, active){
  var cls = active
    ? 'ie-type-btn px-3 py-1.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95'
    : 'ie-type-btn px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95';
  return '<button class="'+cls+'" type="button" data-type="'+t+'">'+t+'</button>';
}

function itemEditDrawerHTML(dayNum, item, defaultType){
  var isEdit = !!item;
  var title = isEdit ? item.title : '';
  var time = isEdit ? (item.time||'') : '';
  var type = isEdit ? item.type : (defaultType||'其他');
  var note = isEdit ? (item.note||'') : '';
  var link = isEdit ? (item.link||'') : '';
  var loc = isEdit ? (item.loc||'') : '';
  var spotId = isEdit ? (item.spotId||'') : '';
  var alt = isEdit ? !!item.alt : false;

  var typeChips = ITEM_TYPES.map(function(t){ return itemTypeChipHTML(t, t===type); }).join('');

  var spotOptions = '<option value="">（無關聯景點）</option>' + allSpots().map(function(s){
    return '<option value="'+s.id+'"'+(s.id===spotId?' selected':'')+'>'+cityName(s.city)+'・'+s.name+'</option>';
  }).join('');

  var actionsHTML = '';
  if(isEdit){
    var dayOptions = '<option value="">移到其他天</option>' + STORE.days.map(function(d){
      return d.day===dayNum ? '' : '<option value="'+d.day+'">Day '+d.day+'・'+d.date+'</option>';
    }).join('');
    actionsHTML = ''
      +'<div class="space-y-space-xs">'
      +'<span class="font-label-md text-label-md text-on-surface font-bold">動作</span>'
      +'<div class="flex items-center gap-space-xs flex-wrap">'
      +'<button class="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md shadow-sm active:translate-y-0.5 transition-all" id="ie-up" type="button"><span class="material-symbols-outlined text-[16px]">arrow_upward</span><span>上移</span></button>'
      +'<button class="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md shadow-sm active:translate-y-0.5 transition-all" id="ie-down" type="button"><span class="material-symbols-outlined text-[16px]">arrow_downward</span><span>下移</span></button>'
      +(dayNum<10 ? '<button class="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md shadow-sm active:translate-y-0.5 transition-all" id="ie-tomorrow" type="button"><span class="material-symbols-outlined text-[16px]">redo</span><span>延到明天</span></button>' : '')
      +'</div>'
      +'<select id="ie-moveday" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none">'+dayOptions+'</select>'
      +'</div>'
      +'<div id="ie-delete-wrap">'
      +'<button class="w-full py-2.5 rounded-full bg-error-container text-on-error-container font-label-lg text-label-lg font-bold flex items-center justify-center gap-1" id="ie-delete" type="button"><span class="material-symbols-outlined text-[18px]">delete</span><span>刪除這個項目</span></button>'
      +'</div>';
  }

  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">edit_note</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">'+(isEdit?'編輯行程':'新增行程項目')+'</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm flex items-center gap-space-xs shadow-sm"><span class="material-symbols-outlined text-on-surface-variant text-[20px]">sticky_note_2</span><input class="w-full bg-transparent font-body-lg text-body-lg text-on-surface focus:outline-none placeholder:text-surface-container-highest font-medium" id="ie-title" placeholder="項目名稱" type="text" value="'+title.replace(/"/g,'&quot;')+'"></div>'
    +'<div id="ie-title-err" class="text-error font-label-sm text-label-sm px-1 hidden">請輸入項目名稱</div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm flex items-center gap-space-xs shadow-sm"><span class="material-symbols-outlined text-on-surface-variant text-[20px]">schedule</span><input class="w-full bg-transparent font-body-lg text-body-lg text-on-surface focus:outline-none placeholder:text-surface-container-highest font-medium" id="ie-time" placeholder="09:00 或 09:00–10:30（可留空）" type="text" value="'+time+'"></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">類型</span><div class="flex items-center gap-space-xs overflow-x-auto no-scrollbar py-0.5">'+typeChips+'</div></div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm flex items-center gap-space-xs shadow-sm"><span class="material-symbols-outlined text-on-surface-variant text-[20px]">notes</span><input class="w-full bg-transparent font-body-md text-body-md text-on-surface focus:outline-none placeholder:text-surface-container-highest" id="ie-note" placeholder="備註" type="text" value="'+note.replace(/"/g,'&quot;')+'"></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">連結</span><input type="url" id="ie-link" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" placeholder="https://" value="'+link+'"><div id="ie-link-err" class="text-error font-label-sm text-label-sm px-1 hidden">連結需以 http:// 或 https:// 開頭</div></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">地點關鍵字（高德用）</span><input type="text" id="ie-loc" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" placeholder="例如：龍門石窟" value="'+loc.replace(/"/g,'&quot;')+'"></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">關聯景點</span><select id="ie-spot" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none">'+spotOptions+'</select></div>'
    +'<div class="flex items-center justify-between bg-surface-container-low rounded-xl px-space-md py-space-sm">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-on-surface-variant text-[18px]">alt_route</span><span class="font-body-md text-body-md text-on-surface font-medium">備案項目</span></div>'
    +'<label class="relative inline-flex items-center cursor-pointer"><input class="sr-only peer" id="ie-alt" type="checkbox"'+(alt?' checked':'')+'><div class="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-container-lowest after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-container"></div></label>'
    +'</div>'
    +'<button class="w-full py-3.5 px-space-md rounded-full bg-primary-container text-on-primary font-headline-lg text-headline-lg font-black shadow-lg flex items-center justify-center gap-space-xs transition-transform active:scale-[0.98]" id="ie-submit" type="button"><span class="material-symbols-outlined text-[24px]">bookmark_added</span><span>'+(isEdit?'儲存':'加入行程')+'</span></button>'
    +actionsHTML;
}

function openItemEditDrawer(dayNum, itemId, defaultType){
  var loc = itemId ? findItemLocation(itemId) : null;
  var item = loc ? loc.item : null;
  var actualDayNum = loc ? loc.day.day : dayNum;
  openDrawer(itemEditDrawerHTML(actualDayNum, item, defaultType), function(){
    document.querySelectorAll('.ie-type-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('.ie-type-btn').forEach(function(b){ b.className = 'ie-type-btn px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95'; });
        btn.className = 'ie-type-btn px-3 py-1.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95';
      });
    });

    document.getElementById('ie-submit').addEventListener('click', function(){
      var title = document.getElementById('ie-title').value.trim();
      var titleErr = document.getElementById('ie-title-err');
      var link = document.getElementById('ie-link').value.trim();
      var linkErr = document.getElementById('ie-link-err');
      titleErr.classList.add('hidden'); linkErr.classList.add('hidden');
      var valid = true;
      if(!title){ titleErr.classList.remove('hidden'); valid = false; }
      if(link && !/^https?:\/\//.test(link)){ linkErr.classList.remove('hidden'); valid = false; }
      if(!valid) return;
      var typeBtn = document.querySelector('.ie-type-btn.bg-primary-fixed');
      var type = typeBtn ? typeBtn.getAttribute('data-type') : '其他';
      var time = document.getElementById('ie-time').value.trim();
      var note = document.getElementById('ie-note').value.trim();
      var locVal = document.getElementById('ie-loc').value.trim();
      var spotIdVal = document.getElementById('ie-spot').value;
      var altVal = document.getElementById('ie-alt').checked;
      if(item){
        item.title = title; item.time = time; item.type = type; item.note = note;
        if(link) item.link = link; else delete item.link;
        if(locVal) item.loc = locVal; else delete item.loc;
        if(spotIdVal) item.spotId = spotIdVal; else delete item.spotId;
        if(altVal) item.alt = true; else delete item.alt;
        var hostDay = findDayByNum(actualDayNum);
        var curIdx = hostDay.items.findIndex(function(x){ return x.id === item.id; });
        if(curIdx !== -1) hostDay.items.splice(curIdx,1);
        insertItemByTime(hostDay, item);
        persist();
        closeDrawer();
        rerenderCurrentItineraryViews();
        showToast('已儲存');
      } else {
        var newItem = { id: genId('c'), title:title, time:time, type:type, note:note };
        if(link) newItem.link = link;
        if(locVal) newItem.loc = locVal;
        if(spotIdVal) newItem.spotId = spotIdVal;
        if(altVal) newItem.alt = true;
        var targetDay = findDayByNum(actualDayNum);
        insertItemByTime(targetDay, newItem);
        persist();
        closeDrawer();
        rerenderCurrentItineraryViews();
        showToast('已加入 Day '+targetDay.day);
      }
    });

    if(item){
      document.getElementById('ie-up').addEventListener('click', function(){
        moveItemUpDown(actualDayNum, item.id, -1);
        rerenderCurrentItineraryViews();
        closeDrawer(); openItemEditDrawer(actualDayNum, item.id);
      });
      document.getElementById('ie-down').addEventListener('click', function(){
        moveItemUpDown(actualDayNum, item.id, 1);
        rerenderCurrentItineraryViews();
        closeDrawer(); openItemEditDrawer(actualDayNum, item.id);
      });
      var tomorrowBtn = document.getElementById('ie-tomorrow');
      if(tomorrowBtn){
        tomorrowBtn.addEventListener('click', function(){
          moveItemToDay(item.id, actualDayNum, actualDayNum+1);
          closeDrawer();
          rerenderCurrentItineraryViews();
          showToast('已延到 Day '+(actualDayNum+1));
        });
      }
      document.getElementById('ie-moveday').addEventListener('change', function(e){
        var v = parseInt(e.target.value,10);
        if(!isNaN(v)){
          moveItemToDay(item.id, actualDayNum, v);
          closeDrawer();
          rerenderCurrentItineraryViews();
          showToast('已移到 Day '+v);
        }
      });
      document.getElementById('ie-delete').addEventListener('click', function(){
        var wrap = document.getElementById('ie-delete-wrap');
        wrap.innerHTML = '<div class="bg-error-container rounded-2xl p-3.5 flex items-center justify-between shadow-sm gap-2">'
          +'<span class="font-body-md text-body-md text-on-error-container font-bold truncate">刪除「'+item.title+'」？</span>'
          +'<div class="flex items-center gap-2 shrink-0"><button class="px-3 py-1.5 rounded-full bg-surface-container-lowest text-on-surface font-label-sm text-label-sm" id="ie-delete-cancel" type="button">取消</button><button class="px-3 py-1.5 rounded-full bg-error text-on-error font-label-sm text-label-sm" id="ie-delete-confirm" type="button">刪除</button></div>'
          +'</div>';
        document.getElementById('ie-delete-cancel').addEventListener('click', function(){
          closeDrawer(); openItemEditDrawer(actualDayNum, item.id);
        });
        document.getElementById('ie-delete-confirm').addEventListener('click', function(){
          var day = findDayByNum(actualDayNum);
          var idx = day.items.findIndex(function(x){ return x.id === item.id; });
          var removed = day.items.splice(idx,1)[0];
          persist();
          closeDrawer();
          rerenderCurrentItineraryViews();
          showUndoToast('已刪除「'+removed.title+'」', function(){
            day.items.splice(idx,0,removed);
            persist();
            rerenderCurrentItineraryViews();
          });
        });
      });
    }
  });
}

/* ---------------- PASTE-TEXT DRAWER ---------------- */

function parsePasteLines(text){
  return text.split('\n').map(function(line){ return line.trim(); }).filter(function(l){ return l.length>0; }).map(function(line){
    var m = /^(\d{1,2}:\d{2}(?:[–-]\d{1,2}:\d{2})?)\s*(.*)$/.exec(line);
    if(m){ return { time:m[1], title: m[2] || m[1] }; }
    return { time:'', title:line };
  });
}
function pasteRowHTML(row){
  return '<div class="flex items-center gap-space-sm bg-surface-container-lowest rounded-xl p-2.5 shadow-sm">'
    +'<span class="font-label-md text-label-md font-bold text-on-surface w-16 shrink-0">'+(row.time||'—')+'</span>'
    +'<span class="font-body-md text-body-md text-on-surface truncate">'+row.title+'</span>'
    +'</div>';
}
function pasteTextDrawerHTML(){
  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">content_paste</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">貼上文字</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm shadow-sm"><textarea id="pt-input" rows="5" class="w-full bg-transparent font-body-md text-body-md text-on-surface focus:outline-none placeholder:text-outline" placeholder="09:30 徐州東站\n10:30–12:00 高鐵到南京南 注意月台"></textarea></div>'
    +'<button class="w-full py-2.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-label-lg text-label-lg font-bold shadow-sm" id="pt-preview-btn" type="button">預覽</button>'
    +'<div class="flex flex-col gap-space-xs" id="pt-preview-list"></div>'
    +'<button class="w-full py-3.5 px-space-md rounded-full bg-primary-container text-on-primary font-headline-lg text-headline-lg font-black shadow-lg flex items-center justify-center gap-space-xs transition-transform active:scale-[0.98] hidden" id="pt-confirm-btn" type="button"><span class="material-symbols-outlined text-[24px]">bookmark_added</span><span>加入 Day '+state.selectedDay+'</span></button>';
}
function openPasteTextDrawer(){
  var parsed = [];
  openDrawer(pasteTextDrawerHTML(), function(){
    document.getElementById('pt-preview-btn').addEventListener('click', function(){
      var text = document.getElementById('pt-input').value;
      parsed = parsePasteLines(text);
      document.getElementById('pt-preview-list').innerHTML = parsed.length ? parsed.map(pasteRowHTML).join('') : '<div class="text-center text-on-surface-variant font-body-sm text-body-sm py-space-sm">沒有解析到內容</div>';
      document.getElementById('pt-confirm-btn').classList.toggle('hidden', parsed.length===0);
    });
    document.getElementById('pt-confirm-btn').addEventListener('click', function(){
      var day = findDayByNum(state.selectedDay);
      parsed.forEach(function(row){
        insertItemByTime(day, { id: genId('p'), title: row.title, time: row.time, type:'其他', note:'' });
      });
      persist();
      closeDrawer();
      renderDay();
      showToast('已加入 Day '+day.day);
    });
  });
}

/* ---------------- SPOT-LIBRARY DRAWER (add spot to itinerary from plan page) ---------------- */

function spotThumbHTML(spot){
  if(spot.img) return '<img class="w-full h-full object-cover" src="'+spot.img+'" alt="'+spot.name+'">';
  return '<div class="w-full h-full flex items-center justify-center text-outline"><span class="material-symbols-outlined text-[20px]">add_location_alt</span></div>';
}
function spotLibraryDrawerHTML(){
  var cityOrder = ['xian','luoyang','xuzhou','nanjing','shanghai'];
  var groups = cityOrder.map(function(c){
    var list = allSpots().filter(function(s){ return s.city===c; });
    if(!list.length) return '';
    var rows = list.map(function(s){
      return '<div class="flex items-center gap-space-sm bg-surface-container-lowest rounded-xl p-2 shadow-sm">'
        +'<div class="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-surface-container">'+spotThumbHTML(s)+'</div>'
        +'<div class="flex-1 min-w-0"><span class="font-body-lg text-body-lg font-bold text-on-surface truncate block">'+s.name+'</span><span class="font-label-sm text-label-sm text-on-surface-variant truncate block">'+(s.oneLiner||'')+'</span></div>'
        +'<input type="text" class="lib-time w-14 bg-surface-container rounded px-1.5 py-1 font-label-sm text-label-sm text-on-surface" placeholder="時間" data-spot="'+s.id+'">'
        +'<button class="lib-add-btn w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center shrink-0" type="button" data-spot="'+s.id+'" aria-label="加入行程"><span class="material-symbols-outlined text-[18px]">add</span></button>'
        +'</div>';
    }).join('');
    return '<div class="flex flex-col gap-space-xs"><span class="font-label-lg text-label-lg text-on-surface font-bold px-1">'+(CITY_LABEL[c]||cityName(c))+'</span>'+rows+'</div>';
  }).join('');
  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">bookmark_add</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">從景點庫加入 Day '+state.selectedDay+'</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="flex flex-col gap-space-md">'+groups+'</div>';
}
function openSpotLibraryDrawer(){
  openDrawer(spotLibraryDrawerHTML(), function(){
    document.querySelectorAll('.lib-add-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var spotId = btn.getAttribute('data-spot');
        var spot = findSpotById(spotId);
        var timeInput = document.querySelector('.lib-time[data-spot="'+spotId+'"]');
        var time = timeInput ? timeInput.value.trim() : '';
        var day = findDayByNum(state.selectedDay);
        insertItemByTime(day, { id: genId('lib'), title: spot.name, time:time, type:'景點', note: spot.oneLiner||'', spotId: spot.id });
        persist();
        rerenderCurrentItineraryViews();
        showToast('已加到 Day '+day.day);
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', function(){
  var pasteBtn = document.getElementById('plan-paste-btn');
  if(pasteBtn) pasteBtn.addEventListener('click', openPasteTextDrawer);
  var libBtn = document.getElementById('plan-library-btn');
  if(libBtn) libBtn.addEventListener('click', openSpotLibraryDrawer);
  var planAddBtn = document.getElementById('plan-add-btn');
  if(planAddBtn) planAddBtn.addEventListener('click', function(){ openItemEditDrawer(state.selectedDay, null, '其他'); });
});

/* ---------------- SPOTS ---------------- */

var CITY_LABEL = { xian:'西安．古都長安', luoyang:'洛陽．神都風華', nanjing:'南京．金陵風雅', xuzhou:'徐州．漢風古韻', shanghai:'上海．轉機一瞥' };
var CITY_BAR = { xian:'bg-primary-container', luoyang:'bg-secondary', nanjing:'bg-tertiary-container', xuzhou:'bg-outline', shanghai:'bg-secondary-container' };
var CITY_COUNT_CLASS = { xian:'bg-primary-fixed text-on-primary-fixed', luoyang:'bg-secondary-fixed text-on-secondary-fixed-variant', nanjing:'bg-tertiary-fixed text-on-tertiary-fixed-variant', xuzhou:'bg-surface-container-high text-on-surface-variant', shanghai:'bg-secondary-container text-on-secondary-container' };

function spotCardHTML(spot){
  var visited = isSpotVisited(spot.id);
  var stampHTML = visited ? '<div class="absolute -top-1 -right-1 flex items-center justify-center w-12 h-12 rounded-full bg-secondary text-on-secondary shadow-[1.5px_2px_0px_#1b1b1c] rotate-12 pointer-events-none"><div class="flex flex-col items-center justify-center leading-none text-center"><span class="material-symbols-outlined text-[14px]">done_all</span><span class="font-label-sm text-[9px] font-extrabold tracking-tighter">去過了</span></div></div>' : '';
  var dayBadgeClass = spot.dayBadgeClass || 'bg-surface-container-high text-on-surface-variant';
  var dayLabel = (spot.day || spot.day === 0) ? ('Day '+spot.day) : '未排入行程';
  var dayBadge = spot.alt
    ? '<div class="absolute top-2 left-2 flex items-center gap-1"><span class="px-2 py-0.5 rounded-full '+dayBadgeClass+' font-label-sm text-label-sm shadow-[1px_1px_0px_#1b1b1c]">'+dayLabel+'</span><span class="px-1.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm font-bold shadow-[1px_1px_0px_#1b1b1c]">備案</span></div>'
    : '<div class="absolute top-2 left-2 px-2 py-0.5 rounded-full '+dayBadgeClass+' font-label-sm text-label-sm shadow-[1px_1px_0px_#1b1b1c]">'+dayLabel+'</div>';
  return '<article class="spot-card relative flex flex-col bg-surface-container-lowest rounded-xl overflow-hidden shadow-[2px_3px_0px_#1b1b1c] transition-transform active:scale-[0.98] cursor-pointer" data-spot-id="'+spot.id+'">'
    +'<div class="relative w-full h-28 bg-surface-container overflow-hidden">'+spotThumbHTML(spot)
    +dayBadge
    +stampHTML
    +'</div>'
    +'<div class="p-space-sm flex flex-col justify-between flex-grow bg-surface-container-lowest">'
    +'<div><span class="inline-block px-1.5 py-0.5 rounded '+spot.eraClass+' font-label-sm text-label-sm font-semibold mb-1">'+spot.era+'</span>'
    +'<h3 class="font-headline-md text-headline-md text-on-surface truncate">'+spot.name+'</h3></div>'
    +'<div class="flex items-center text-outline text-body-sm mt-2"><span class="material-symbols-outlined text-[14px] mr-0.5 text-primary">'+spot.icon+'</span><span class="truncate">'+spot.oneLiner+'</span></div>'
    +'</div></article>';
}

var EMPTY_SLOT_HTML = '<div class="flex flex-col items-center justify-center p-space-md rounded-xl bg-surface-container-low text-center shadow-[1px_2px_0px_#1b1b1c]">'
  +'<div class="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary mb-2 shadow-[1px_1px_0px_#1b1b1c]"><span class="material-symbols-outlined text-[22px]">add_location_alt</span></div>'
  +'<span class="font-headline-md text-[15px] text-on-surface">探索更多南京</span>'
  +'<span class="font-body-sm text-body-sm text-outline mt-1">秦淮河畔・玄武湖...</span>'
  +'<button class="spot-add-trigger mt-space-sm px-3 py-1 rounded-full bg-primary-container text-on-surface font-label-sm text-label-sm font-bold shadow-[1px_1px_0px_#1b1b1c] active:translate-y-0.5" type="button">新增景點</button>'
  +'</div>';

function renderSpots(){
  var spots = allSpots();
  document.getElementById('spot-total-count').textContent = spots.length + ' 處打卡點';
  var cities = ['xian','luoyang','xuzhou','nanjing','shanghai'];
  var html = cities.map(function(cityKey){
    var list = spots.filter(function(s){ return s.city === cityKey; });
    if(list.length === 0) return '';
    var cards = list.map(spotCardHTML).join('') + (cityKey === 'nanjing' ? EMPTY_SLOT_HTML : '');
    return '<section class="city-group flex flex-col" data-city-name="'+cityKey+'">'
      +'<div class="flex items-center justify-between mb-space-sm pb-1"><div class="flex items-center gap-space-xs"><span class="w-3 h-6 '+CITY_BAR[cityKey]+' rounded-sm shadow-[1px_1px_0px_#1b1b1c]"></span><h2 class="font-headline-lg text-headline-lg text-on-surface tracking-tight">'+CITY_LABEL[cityKey]+'</h2></div><span class="font-label-sm text-label-sm px-2 py-0.5 rounded-full '+CITY_COUNT_CLASS[cityKey]+' font-bold">'+list.length+' 個足跡</span></div>'
      +'<div class="grid grid-cols-2 gap-space-sm">'+cards+'</div></section>';
  }).join('');
  document.getElementById('spots-container').innerHTML = html;
  document.querySelectorAll('.spot-card').forEach(function(card){
    card.addEventListener('click', function(){ location.hash = '#spot/'+card.getAttribute('data-spot-id'); });
  });
  document.querySelectorAll('.spot-add-trigger').forEach(function(btn){
    btn.addEventListener('click', function(){ openNewSpotDrawer(); });
  });
  applySpotFilters();
  bindSpotFilters();
}

function applySpotFilters(){
  var query = (state.spotQuery||'').trim().toLowerCase();
  document.querySelectorAll('.city-group').forEach(function(group){
    var groupCity = group.getAttribute('data-city-name');
    var matchesCity = (state.spotCity === 'all' || state.spotCity === groupCity);
    if(!matchesCity){ group.style.display = 'none'; return; }
    var visible = 0;
    group.querySelectorAll('.spot-card').forEach(function(card){
      var matches = query === '' || card.innerText.toLowerCase().indexOf(query) !== -1;
      card.style.display = matches ? 'flex' : 'none';
      if(matches) visible++;
    });
    group.style.display = (visible > 0 || query === '') ? 'flex' : 'none';
  });
}

function bindSpotFilters(){
  document.querySelectorAll('.city-filter-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.city-filter-btn').forEach(function(b){
        b.classList.remove('bg-primary-container','shadow-[2px_2px_0px_#1b1b1c]','font-bold');
        b.classList.add('bg-surface-container-low','shadow-[1.5px_1.5px_0px_#1b1b1c]');
      });
      btn.classList.add('bg-primary-container','shadow-[2px_2px_0px_#1b1b1c]','font-bold');
      btn.classList.remove('bg-surface-container-low','shadow-[1.5px_1.5px_0px_#1b1b1c]');
      state.spotCity = btn.getAttribute('data-city');
      applySpotFilters();
    });
  });
  var input = document.getElementById('spot-search');
  if(input){ input.addEventListener('input', function(){ state.spotQuery = input.value; applySpotFilters(); }); }
}

document.addEventListener('DOMContentLoaded', function(){
  var headerAddBtn = document.getElementById('spot-add-btn');
  if(headerAddBtn) headerAddBtn.addEventListener('click', function(){ openNewSpotDrawer(); });
});

/* ---------------- NEW / EDIT CUSTOM SPOT DRAWER ---------------- */

var CITY_KEYS = [{key:'xian',label:'西安'},{key:'luoyang',label:'洛陽'},{key:'xuzhou',label:'徐州'},{key:'nanjing',label:'南京'},{key:'shanghai',label:'上海'}];

function spotEditDrawerHTML(spot){
  var isEdit = !!spot;
  var name = isEdit ? spot.name : '';
  var city = isEdit ? spot.city : 'xian';
  var era = isEdit ? (spot.era||'') : '';
  var oneLiner = isEdit ? (spot.oneLiner||'') : '';
  var amapKw = isEdit ? (spot.amapKeyword||spot.name) : '';
  var day = isEdit && (spot.day || spot.day === 0) ? spot.day : '';
  var link = isEdit ? (spot.link||'') : '';
  var note = isEdit ? (spot.tips||'') : '';
  var cityChips = CITY_KEYS.map(function(c){
    var active = c.key===city;
    var cls = active ? 'se-city-btn px-3 py-1.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95' : 'se-city-btn px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95';
    return '<button class="'+cls+'" type="button" data-city="'+c.key+'">'+c.label+'</button>';
  }).join('');
  var dayOptions = '<option value=""'+(day===''?' selected':'')+'>不指定</option>' + STORE.days.map(function(d){
    return '<option value="'+d.day+'"'+(day===d.day?' selected':'')+'>Day '+d.day+'・'+d.date+'</option>';
  }).join('');
  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">add_location_alt</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">'+(isEdit?'編輯景點':'新增景點')+'</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm flex items-center gap-space-xs shadow-sm"><span class="material-symbols-outlined text-on-surface-variant text-[20px]">sticky_note_2</span><input class="w-full bg-transparent font-body-lg text-body-lg text-on-surface focus:outline-none placeholder:text-surface-container-highest font-medium" id="se-name" placeholder="景點名稱" type="text" value="'+name.replace(/"/g,'&quot;')+'"></div>'
    +'<div id="se-name-err" class="text-error font-label-sm text-label-sm px-1 hidden">請輸入景點名稱</div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">城市</span><div class="flex items-center gap-space-xs overflow-x-auto no-scrollbar py-0.5">'+cityChips+'</div></div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm flex items-center gap-space-xs shadow-sm"><span class="material-symbols-outlined text-on-surface-variant text-[20px]">history_edu</span><input class="w-full bg-transparent font-body-md text-body-md text-on-surface focus:outline-none placeholder:text-surface-container-highest" id="se-era" placeholder="類型或朝代，例如：市井美食" type="text" value="'+era.replace(/"/g,'&quot;')+'"></div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm flex items-center gap-space-xs shadow-sm"><span class="material-symbols-outlined text-on-surface-variant text-[20px]">format_quote</span><input class="w-full bg-transparent font-body-md text-body-md text-on-surface focus:outline-none placeholder:text-surface-container-highest" id="se-oneliner" placeholder="一句話介紹" type="text" value="'+oneLiner.replace(/"/g,'&quot;')+'"></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">高德搜尋關鍵字</span><input type="text" id="se-amapkw" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" placeholder="預設同名稱" value="'+amapKw.replace(/"/g,'&quot;')+'"></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">排入哪一天</span><select id="se-day" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none">'+dayOptions+'</select></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">連結</span><input type="url" id="se-link" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" placeholder="https://" value="'+link+'"><div id="se-link-err" class="text-error font-label-sm text-label-sm px-1 hidden">連結需以 http:// 或 https:// 開頭</div></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">備註</span><input type="text" id="se-note" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" value="'+note.replace(/"/g,'&quot;')+'"></div>'
    +'<button class="w-full py-3.5 px-space-md rounded-full bg-primary-container text-on-primary font-headline-lg text-headline-lg font-black shadow-lg flex items-center justify-center gap-space-xs transition-transform active:scale-[0.98]" id="se-submit" type="button"><span class="material-symbols-outlined text-[24px]">bookmark_added</span><span>'+(isEdit?'儲存':'新增景點')+'</span></button>';
}

function bindSpotEditDrawer(spot, afterSave){
  document.querySelectorAll('.se-city-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.se-city-btn').forEach(function(b){ b.className = 'se-city-btn px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95'; });
      btn.className = 'se-city-btn px-3 py-1.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95';
    });
  });
  document.getElementById('se-submit').addEventListener('click', function(){
    var name = document.getElementById('se-name').value.trim();
    var nameErr = document.getElementById('se-name-err');
    var link = document.getElementById('se-link').value.trim();
    var linkErr = document.getElementById('se-link-err');
    nameErr.classList.add('hidden'); linkErr.classList.add('hidden');
    var valid = true;
    if(!name){ nameErr.classList.remove('hidden'); valid=false; }
    if(link && !/^https?:\/\//.test(link)){ linkErr.classList.remove('hidden'); valid=false; }
    if(!valid) return;
    var cityBtn = document.querySelector('.se-city-btn.bg-primary-fixed');
    var city = cityBtn ? cityBtn.getAttribute('data-city') : 'xian';
    var era = document.getElementById('se-era').value.trim();
    var oneLiner = document.getElementById('se-oneliner').value.trim();
    var amapKw = document.getElementById('se-amapkw').value.trim();
    var dayVal = document.getElementById('se-day').value;
    var note = document.getElementById('se-note').value.trim();
    if(spot){
      spot.name = name; spot.fullName = name; spot.city = city;
      spot.era = era || '自訂景點'; spot.oneLiner = oneLiner; spot.quote = oneLiner;
      spot.amapKeyword = amapKw || name;
      spot.day = dayVal ? parseInt(dayVal,10) : undefined;
      if(link) spot.link = link; else delete spot.link;
      spot.tips = note; spot.intro = [note || oneLiner || '自訂景點，之後補上介紹。'];
      persist(); closeDrawer();
      showToast('已儲存');
      if(afterSave) afterSave(spot);
    } else {
      var newSpot = {
        id: genId('spot'), name:name, fullName:name, city:city,
        day: dayVal ? parseInt(dayVal,10) : undefined, time:'',
        era: era || '自訂景點', eraClass:'bg-surface-container-high text-primary',
        icon:'add_location_alt', oneLiner: oneLiner, quote: oneLiner,
        img:null, dayBadgeClass:'bg-surface-container-high text-on-surface-variant',
        amapKeyword: amapKw || name, tips: note,
        intro: [note || oneLiner || '自訂景點，之後補上介紹。'],
        isCustom: true
      };
      if(link) newSpot.link = link;
      STORE.customSpots.push(newSpot);
      persist(); closeDrawer();
      showToast('已新增景點');
      if(afterSave) afterSave(newSpot);
    }
  });
}
function openNewSpotDrawer(){
  openDrawer(spotEditDrawerHTML(null), function(){
    bindSpotEditDrawer(null, function(){
      if((location.hash||'').indexOf('#spots')===0) renderSpots();
    });
  });
}
function openSpotEditDrawer(spot){
  openDrawer(spotEditDrawerHTML(spot), function(){
    bindSpotEditDrawer(spot, function(){ renderSpotDetail(spot.id); });
  });
}

/* ---------------- SPLIT EXPENSE ---------------- */

function computeSplit(){
  var net = { Lena:0, Key:0 };
  var netNT = { Lena:0, Key:0 };
  var total = 0, totalNT = 0, todayTotal = 0;
  var byDate = {};
  STORE.expenses.forEach(function(e){
    var rate = e.rateOverride || fxRateFor(e.date);
    if(e.kind === 'settle'){
      var settleNt = e.amount * rate;
      e._nt = settleNt;
      net[e.from] += e.amount; net[e.to] -= e.amount;
      netNT[e.from] += settleNt; netNT[e.to] -= settleNt;
      if(!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
      return;
    }
    var feeMul = e.feeApplied ? feeMultiplier() : 1;
    var amt = e.amount;
    var nt = amt * rate * feeMul;
    e._nt = nt;
    var oweLena, oweKey;
    if(e.split === 'custom'){ oweLena = e.customLena||0; oweKey = e.customKey||0; }
    else if(e.split === 'other'){ if(e.payer==='Lena'){ oweLena=0; oweKey=amt; } else { oweKey=0; oweLena=amt; } }
    else { oweLena = amt/2; oweKey = amt/2; }
    e._cnyPerPerson = e.payer==='Lena' ? oweKey : oweLena;
    var paidLena = e.payer==='Lena' ? amt : 0, paidKey = e.payer==='Key' ? amt : 0;
    net.Lena += paidLena - oweLena;
    net.Key += paidKey - oweKey;
    var paidLenaNT = e.payer==='Lena' ? nt : 0, paidKeyNT = e.payer==='Key' ? nt : 0;
    netNT.Lena += paidLenaNT - (oweLena*rate*feeMul);
    netNT.Key += paidKeyNT - (oweKey*rate*feeMul);
    total += amt; totalNT += nt;
    if(e.date === DATA.today) todayTotal += amt;
    if(!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });
  var diff = net.Lena; // positive => Key owes Lena
  var diffNT = netNT.Lena;
  var payer = diff >= 0 ? 'Key' : 'Lena';
  var payee = diff >= 0 ? 'Lena' : 'Key';
  return {
    total: total, todayTotal: todayTotal,
    settleFrom: payer, settleTo: payee,
    settleCNY: Math.round(Math.abs(diff)),
    settleNT: Math.round(Math.abs(diffNT)),
    byDate: byDate
  };
}

var pendingDeleteExpenseId = null;

function expenseItemHTML(e){
  var isLena = e.payer === 'Lena' || (e.kind==='settle' && e.from === 'Lena');
  var avatarCls = isLena ? 'bg-secondary-fixed text-secondary' : 'bg-primary-fixed text-primary';
  var initial = memberName(isLena ? 'Lena' : 'Key').charAt(0);
  if(pendingDeleteExpenseId !== null && String(pendingDeleteExpenseId) === String(e.id)){
    return '<div class="bg-error-container rounded-2xl p-3.5 flex items-center justify-between shadow-sm gap-2">'
      +'<span class="font-body-md text-body-md text-on-error-container font-bold truncate">刪除「'+e.title+'」？</span>'
      +'<div class="flex items-center gap-2 shrink-0"><button class="expense-cancel-del px-3 py-1.5 rounded-full bg-surface-container-lowest text-on-surface font-label-sm text-label-sm" data-id="'+e.id+'" type="button">取消</button><button class="expense-confirm-del px-3 py-1.5 rounded-full bg-error text-on-error font-label-sm text-label-sm" data-id="'+e.id+'" type="button">刪除</button></div>'
      +'</div>';
  }
  if(e.kind === 'settle'){
    return '<div class="expense-row bg-surface-container-lowest rounded-2xl p-3.5 flex items-center justify-between shadow-sm hover:shadow transition-shadow cursor-pointer" data-id="'+e.id+'">'
      +'<div class="flex items-center gap-3 min-w-0">'
      +'<div class="w-10 h-10 rounded-full '+avatarCls+' flex items-center justify-center font-headline-md text-headline-md font-bold flex-shrink-0">'+initial+'</div>'
      +'<div class="flex flex-col min-w-0"><span class="font-body-lg text-body-lg text-on-surface font-bold truncate">'+memberName(e.from)+' 付給 '+memberName(e.to)+'</span>'
      +'<div class="flex items-center gap-1.5 mt-0.5 flex-wrap"><span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold">結清</span></div>'
      +'</div></div>'
      +'<div class="text-right flex-shrink-0 pl-2"><div class="font-headline-md text-headline-md text-on-surface font-black">¥ '+e.amount+'</div>'
      +'<div class="font-body-sm text-body-sm text-outline">共 NT$ '+fmtNum(e._nt)+'</div></div>'
      +'</div>';
  }
  var splitLabel = e.split==='other' ? '全由對方' : (e.split==='custom' ? '自訂金額' : '平分');
  var feeBadge = e.feeApplied ? '<span class="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-bold">+1.5%</span>' : '';
  return '<div class="expense-row bg-surface-container-lowest rounded-2xl p-3.5 flex items-center justify-between shadow-sm hover:shadow transition-shadow cursor-pointer" data-id="'+e.id+'">'
    +'<div class="flex items-center gap-3 min-w-0">'
    +'<div class="w-10 h-10 rounded-full '+avatarCls+' flex items-center justify-center font-headline-md text-headline-md font-bold flex-shrink-0">'+initial+'</div>'
    +'<div class="flex flex-col min-w-0"><span class="font-body-lg text-body-lg text-on-surface font-bold truncate">'+e.title+'</span>'
    +'<div class="flex items-center gap-1.5 mt-0.5 flex-wrap"><span class="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm font-medium">'+e.method+'</span><span class="px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-container font-label-sm text-label-sm font-bold">'+splitLabel+'</span>'+feeBadge+'</div>'
    +'</div></div>'
    +'<div class="text-right flex-shrink-0 pl-2"><div class="font-headline-md text-headline-md text-on-surface font-black">¥ '+e.amount+'</div>'
    +'<div class="font-body-sm text-body-sm text-outline">共 NT$ '+fmtNum(e._nt)+'</div></div>'
    +'</div>';
}

function renderSplit(){
  var s = computeSplit();
  var dates = Object.keys(s.byDate).sort(function(a,b){ return b.localeCompare(a); });

  var groupsHTML = dates.map(function(date){
    var items = s.byDate[date];
    var subtotal = items.reduce(function(sum,e){ return sum+e.amount; }, 0);
    return '<div class="mb-space-md" data-date-group="'+date+'">'
      +'<div class="flex items-center justify-between py-1 mb-space-xs"><div class="flex items-center gap-2"><span class="font-label-lg text-label-lg text-on-surface font-extrabold tracking-wide">'+date+' '+WEEKDAY[date]+'</span><span class="text-label-sm font-label-sm text-outline-variant">•</span><span class="font-body-sm text-body-sm text-on-surface-variant">當日 '+items.length+' 筆</span></div><span class="font-label-md text-label-md text-on-surface-variant font-bold">小計 ¥ '+subtotal+'</span></div>'
      +'<div class="flex flex-col gap-2">'+items.map(expenseItemHTML).join('')+'</div>'
      +'</div>';
  }).join('');

  var html = ''
    +'<div class="flex items-center justify-between pt-space-xs pb-space-sm">'
    +'<div class="flex items-center gap-space-xs"><span class="inline-block w-2.5 h-6 bg-primary-container rounded-full"></span><h1 class="font-headline-xl-mobile text-headline-xl-mobile text-on-surface tracking-tight">分帳</h1><span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm ml-1">CNY ⇄ TWD</span></div>'
    +'<button class="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-transform active:scale-95 shadow-sm" id="split-settings-btn" type="button"><span class="material-symbols-outlined text-[22px]">settings</span></button>'
    +'</div>'
    +'<div class="relative w-full rounded-2xl bg-amber-50/90 p-space-md shadow-sm mb-space-md overflow-hidden">'
    +'<div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-primary-container/10 pointer-events-none"></div>'
    +'<div class="flex items-center gap-space-md">'
    +'<div class="relative w-24 h-28 flex-shrink-0 flex items-end justify-center"><img src="assets/stitch/bibo-calculator.png" alt="BIBO 記帳計算中" class="w-full h-full object-contain drop-shadow-sm [mix-blend-mode:multiply]"></div>'
    +'<div class="flex-1 min-w-0">'
    +'<div class="flex items-center gap-1.5 mb-1"><span class="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span><span class="font-label-md text-label-md text-on-surface-variant font-bold">待結算帳目</span></div>'
    +(s.settleCNY === 0
      ? '<div class="font-headline-lg text-headline-lg text-primary tracking-tight font-extrabold">目前兩人帳目已結清</div>'
      : '<div class="font-headline-lg text-headline-lg text-primary tracking-tight font-extrabold truncate">'+memberName(s.settleFrom)+' <span class="font-body-md text-body-md text-on-surface-variant font-normal">應付</span> '+memberName(s.settleTo)+'</div>'
        +'<div class="flex items-baseline gap-1 my-0.5"><span class="font-headline-xl text-headline-xl text-primary font-black tracking-tight">¥ '+s.settleCNY+'</span></div>'
        +'<p class="font-body-sm text-body-sm text-outline mb-3">約 NT$ '+s.settleNT+'<span class="mx-1">•</span>依各筆匯率換算</p>')
    +(s.settleCNY === 0
      ? '<button class="px-4 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md font-bold opacity-70 cursor-not-allowed" type="button" disabled>已結清</button>'
      : '<button class="px-4 py-1.5 rounded-full bg-primary-container text-on-primary font-label-md text-label-md font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all" id="split-settle-btn" type="button">結清帳款</button>')
    +'</div></div></div>'
    +'<div class="grid grid-cols-2 gap-space-sm mb-space-md">'
    +'<div class="bg-surface-container-low rounded-2xl p-space-sm flex items-center gap-space-sm shadow-sm"><div class="w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center text-primary-container flex-shrink-0"><span class="material-symbols-outlined text-[20px]">account_balance_wallet</span></div><div class="min-w-0"><span class="font-label-sm text-label-sm text-on-surface-variant block">旅程總花費</span><span class="font-headline-md text-headline-md text-on-surface truncate block font-bold">¥ '+s.total+'</span></div></div>'
    +'<div class="bg-surface-container-low rounded-2xl p-space-sm flex items-center gap-space-sm shadow-sm"><div class="w-10 h-10 rounded-xl bg-secondary-fixed flex items-center justify-center text-secondary flex-shrink-0"><span class="material-symbols-outlined text-[20px]">today</span></div><div class="min-w-0"><span class="font-label-sm text-label-sm text-on-surface-variant block">今日花費</span><span class="font-headline-md text-headline-md text-on-surface truncate block font-bold">¥ '+s.todayTotal+'</span></div></div>'
    +'</div>'
    +(groupsHTML || '<div class="text-center text-on-surface-variant font-body-sm text-body-sm py-space-lg">還沒有任何紀錄</div>')
    +'<div class="h-24"></div>'
    +'<div class="fixed right-5 bottom-20 z-40 max-w-[430px] mx-auto"><button class="flex items-center gap-2 px-5 py-3 rounded-full bg-primary-container text-on-primary font-label-lg text-label-lg font-bold shadow-lg hover:shadow-xl active:scale-95 transition-transform duration-150" id="split-add-btn" type="button"><span class="material-symbols-outlined text-[20px]">add</span><span>記一筆</span></button></div>';

  document.getElementById('split-root').innerHTML = html;
  bindSplitEvents();
}

function bindSplitEvents(){
  var addBtn = document.getElementById('split-add-btn');
  if(addBtn) addBtn.addEventListener('click', function(){ openExpenseDrawer(null); });
  var settleBtn = document.getElementById('split-settle-btn');
  if(settleBtn) settleBtn.addEventListener('click', function(){ openSettleDrawer(); });
  var settingsBtn = document.getElementById('split-settings-btn');
  if(settingsBtn) settingsBtn.addEventListener('click', function(){ openSplitSettingsDrawer(); });
  document.querySelectorAll('.expense-row').forEach(function(row){
    row.addEventListener('click', function(){
      pendingDeleteExpenseId = row.getAttribute('data-id');
      renderSplit();
    });
  });
  document.querySelectorAll('.expense-cancel-del').forEach(function(btn){
    btn.addEventListener('click', function(e){ e.stopPropagation(); pendingDeleteExpenseId = null; renderSplit(); });
  });
  document.querySelectorAll('.expense-confirm-del').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var id = btn.getAttribute('data-id');
      var idx = STORE.expenses.findIndex(function(x){ return String(x.id)===String(id); });
      if(idx !== -1){ STORE.expenses.splice(idx,1); persist(); }
      pendingDeleteExpenseId = null;
      renderSplit();
    });
  });
}

/* ---------------- SETTLE-UP DRAWER ---------------- */

function settleDrawerHTML(s){
  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">payments</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">結清帳款</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col items-center gap-1 text-center">'
    +'<span class="font-headline-md text-headline-md text-on-surface font-bold">'+memberName(s.settleFrom)+' 付給 '+memberName(s.settleTo)+'</span>'
    +'<span class="font-headline-xl text-headline-xl text-primary font-black">¥ '+s.settleCNY+'</span>'
    +'<span class="font-body-sm text-body-sm text-outline">約 NT$ '+s.settleNT+'</span>'
    +'</div>'
    +'<div class="flex items-center gap-space-xs text-on-surface-variant"><span class="material-symbols-outlined text-[18px]">calendar_month</span><select id="st-date" class="bg-transparent font-label-md text-label-md font-medium focus:outline-none">'+STORE.days.map(function(d){ return '<option value="'+d.date+'"'+(d.date===DATA.today?' selected':'')+'>'+d.date+' '+WEEKDAY[d.date]+'</option>'; }).join('')+'</select></div>'
    +'<button class="w-full py-3.5 px-space-md rounded-full bg-primary-container text-on-primary font-headline-lg text-headline-lg font-black shadow-lg flex items-center justify-center gap-space-xs transition-transform active:scale-[0.98]" id="st-submit" type="button"><span class="material-symbols-outlined text-[24px]">bookmark_added</span><span>確認結清</span></button>';
}
function openSettleDrawer(){
  var s = computeSplit();
  if(s.settleCNY === 0) return;
  openDrawer(settleDrawerHTML(s), function(){
    document.getElementById('st-submit').addEventListener('click', function(){
      var date = document.getElementById('st-date').value;
      STORE.expenses.push({
        id: genId('e'), kind:'settle', date:date, title:'結清',
        from: s.settleFrom, to: s.settleTo, amount: s.settleCNY,
        rateOverride: fxRateFor(date)
      });
      persist();
      closeDrawer();
      renderSplit();
      showToast('已記錄結清');
    });
  });
}

/* ---------------- SPLIT SETTINGS DRAWER ---------------- */

function splitSettingsDrawerHTML(){
  var fxRows = STORE.days.map(function(d){
    return '<div class="flex items-center justify-between gap-space-xs"><span class="font-body-sm text-body-sm text-on-surface-variant w-16 shrink-0">'+d.date+' '+WEEKDAY[d.date]+'</span><input type="number" step="0.01" class="fx-rate-input flex-1 bg-surface-container-lowest rounded-lg px-2 py-1.5 font-body-md text-body-md text-on-surface shadow-sm" data-date="'+d.date+'" value="'+fxRateFor(d.date)+'"></div>';
  }).join('');
  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">settings</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">分帳設定</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">成員名稱</span>'
    +'<div class="grid grid-cols-2 gap-space-sm">'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm shadow-sm"><span class="font-label-sm text-label-sm text-on-surface-variant">成員 A</span><input type="text" id="ss-name-lena" class="w-full bg-transparent font-body-lg text-body-lg text-on-surface font-bold focus:outline-none" value="'+STORE.memberNames.Lena+'"></div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm shadow-sm"><span class="font-label-sm text-label-sm text-on-surface-variant">成員 B</span><input type="text" id="ss-name-key" class="w-full bg-transparent font-body-lg text-body-lg text-on-surface font-bold focus:outline-none" value="'+STORE.memberNames.Key+'"></div>'
    +'</div></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">刷卡手續費預設（%）</span><input type="number" step="0.1" id="ss-fee" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" value="'+STORE.feePercent+'"></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">每日匯率（1 人民幣＝？台幣）</span><div class="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">'+fxRows+'</div></div>'
    +'<button class="w-full py-2.5 rounded-full bg-primary-container text-on-primary font-label-lg text-label-lg font-bold shadow-sm" id="ss-save" type="button">儲存設定</button>'
    +(SyncUI ? SyncUI.settingsSectionHTML() : '')
    +'<div class="pt-space-sm border-t border-outline-variant/40 space-y-space-sm">'
    +'<button class="w-full py-2.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-bold shadow-sm flex items-center justify-center gap-1.5" id="ss-copy" type="button"><span class="material-symbols-outlined text-[18px]">content_copy</span><span>複製帳本文字</span></button>'
    +'<div id="ss-clear-samples-wrap"><button class="w-full py-2.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-bold shadow-sm flex items-center justify-center gap-1.5" id="ss-clear-samples" type="button"><span class="material-symbols-outlined text-[18px]">delete_sweep</span><span>清除範例支出</span></button></div>'
    +'<div id="ss-reset-wrap"><button class="w-full py-2.5 rounded-full bg-error-container text-on-error-container font-label-md text-label-md font-bold flex items-center justify-center gap-1.5" id="ss-reset" type="button"><span class="material-symbols-outlined text-[18px]">restart_alt</span><span>重設所有原型資料</span></button></div>'
    +'</div>';
}
function twoKeyConfirm(wrapId, msg, onConfirm){
  var wrap = document.getElementById(wrapId);
  wrap.innerHTML = '<div class="bg-error-container rounded-2xl p-3.5 flex items-center justify-between shadow-sm gap-2">'
    +'<span class="font-body-md text-body-md text-on-error-container font-bold truncate">'+msg+'</span>'
    +'<div class="flex items-center gap-2 shrink-0"><button class="px-3 py-1.5 rounded-full bg-surface-container-lowest text-on-surface font-label-sm text-label-sm" id="'+wrapId+'-cancel" type="button">取消</button><button class="px-3 py-1.5 rounded-full bg-error text-on-error font-label-sm text-label-sm" id="'+wrapId+'-confirm" type="button">確定</button></div>'
    +'</div>';
  document.getElementById(wrapId+'-cancel').addEventListener('click', function(){ closeDrawer(); openSplitSettingsDrawer(); });
  document.getElementById(wrapId+'-confirm').addEventListener('click', onConfirm);
}
function openSplitSettingsDrawer(){
  openDrawer(splitSettingsDrawerHTML(), function(){
    if(SyncUI) SyncUI.bindSettingsSection();
    document.getElementById('ss-save').addEventListener('click', function(){
      var nameA = document.getElementById('ss-name-lena').value.trim();
      var nameB = document.getElementById('ss-name-key').value.trim();
      if(nameA) STORE.memberNames.Lena = nameA;
      if(nameB) STORE.memberNames.Key = nameB;
      var fee = parseFloat(document.getElementById('ss-fee').value);
      if(!isNaN(fee) && fee>=0) STORE.feePercent = fee;
      document.querySelectorAll('.fx-rate-input').forEach(function(inp){
        var v = parseFloat(inp.value);
        var dk = inp.getAttribute('data-date');
        /* 沒改過、也沒有手動設定的列不要存成覆寫（否則自動帶入的當日匯率會被凍住） */
        if(!isNaN(v) && v>0 && (STORE.fxRatesOverride[dk] !== undefined || v !== parseFloat(inp.defaultValue))) STORE.fxRatesOverride[dk] = v;
      });
      persist();
      closeDrawer();
      rerenderCurrentItineraryViews();
      if((location.hash||'').indexOf('#split')===0) renderSplit();
      showToast('已儲存設定');
    });
    document.getElementById('ss-copy').addEventListener('click', function(){
      var s = computeSplit();
      var dates = Object.keys(s.byDate).sort();
      var lines = ['日期｜項目｜付款人｜¥｜NT$｜分法'];
      dates.forEach(function(date){
        s.byDate[date].forEach(function(e){
          if(e.kind==='settle'){
            lines.push(date+'｜結清｜'+memberName(e.from)+'→'+memberName(e.to)+'｜¥'+e.amount+'｜NT$'+fmtNum(e._nt)+'｜－');
          } else {
            var splitLabel = e.split==='other' ? '全由對方' : (e.split==='custom' ? '自訂金額' : '平分');
            lines.push(date+'｜'+e.title+'｜'+memberName(e.payer)+'｜¥'+e.amount+'｜NT$'+fmtNum(e._nt)+'｜'+splitLabel);
          }
        });
      });
      lines.push('結算：'+memberName(s.settleFrom)+' 付給 '+memberName(s.settleTo)+' ¥'+s.settleCNY+'（約 NT$'+s.settleNT+'）');
      var text = lines.join('\n');
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){ showToast('已複製帳本文字'); }, function(){ openShareFallbackDrawer(text); });
      } else { openShareFallbackDrawer(text); }
    });
    document.getElementById('ss-clear-samples').addEventListener('click', function(){
      twoKeyConfirm('ss-clear-samples-wrap', '確定要刪除範例支出？', function(){
        STORE.expenses = STORE.expenses.filter(function(e){ return !e.sample; });
        persist();
        closeDrawer();
        if((location.hash||'').indexOf('#split')===0) renderSplit();
        showToast('已清除範例支出');
      });
    });
    document.getElementById('ss-reset').addEventListener('click', function(){
      twoKeyConfirm('ss-reset-wrap', '確定要重設所有原型資料？此動作無法復原', function(){
        try{ localStorage.removeItem('bibo-v3-store'); }catch(e){}
        location.reload();
      });
    });
  });
}

/* ---------------- RECORD-EXPENSE DRAWER ---------------- */

function expenseDrawerHTML(editExpense){
  var isEdit = !!editExpense;
  var amount = isEdit ? editExpense.amount : '';
  var title = isEdit ? editExpense.title : '';
  var payer = isEdit ? editExpense.payer : 'Lena';
  var method = isEdit ? editExpense.method : '微信支付';
  var split = isEdit ? (editExpense.split||'even') : 'even';
  var feeApplied = isEdit ? !!editExpense.feeApplied : false;
  var date = isEdit ? editExpense.date : DATA.today;
  var rate = (isEdit && editExpense.rateOverride) ? editExpense.rateOverride : fxRateFor(date);
  var customLena = (isEdit && editExpense.customLena!=null) ? editExpense.customLena : '';
  var customKey = (isEdit && editExpense.customKey!=null) ? editExpense.customKey : '';

  var dateOptions = STORE.days.map(function(d){
    return '<option value="'+d.date+'"'+(d.date===date?' selected':'')+'>'+d.date+' '+WEEKDAY[d.date]+(d.date===DATA.today?'（今天）':'')+'</option>';
  }).join('');

  var categoryChips = ['早餐','午餐','晚餐','交通','門票','伴手禮'].map(function(c){
    var active = (title===c);
    var cls = active ? 'category-chip px-3 py-1.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95' : 'category-chip px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95';
    return '<button class="'+cls+'" type="button" data-cat="'+c+'">'+c+'</button>';
  }).join('');

  function payerBtnHTML(name){
    var active = payer===name;
    var cls = active
      ? 'relative flex items-center justify-center gap-space-sm p-space-sm rounded-xl bg-primary-container text-on-primary font-bold shadow-md transition-all payer-btn'
      : 'flex items-center justify-center gap-space-sm p-space-sm rounded-xl bg-surface-container text-on-surface-variant font-bold transition-all hover:bg-surface-container-high payer-btn';
    var badge = active ? '<div class="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-surface-container-lowest text-primary flex items-center justify-center shadow-sm"><span class="material-symbols-outlined text-[16px] font-bold">check</span></div>' : '';
    var circleCls = active ? 'w-8 h-8 rounded-full bg-on-primary text-primary-container flex items-center justify-center font-headline-md text-headline-md font-black' : 'w-8 h-8 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center font-headline-md text-headline-md';
    var displayName = memberName(name);
    return '<button class="'+cls+'" type="button" data-payer="'+name+'"><div class="'+circleCls+'">'+displayName.charAt(0)+'</div><span class="font-headline-md text-headline-md">'+displayName+' 付的</span>'+badge+'</button>';
  }
  function methodBtnHTML(name, icon){
    var active = method===name;
    var cls = active
      ? 'flex items-center justify-center gap-space-xs p-space-sm rounded-xl bg-secondary-container text-on-secondary-container font-headline-md text-headline-md font-bold shadow-sm method-btn'
      : 'flex items-center justify-center gap-space-xs p-space-sm rounded-xl bg-surface-container text-on-surface-variant font-headline-md text-headline-md font-bold hover:bg-surface-container-high method-btn';
    return '<button class="'+cls+'" type="button" data-method="'+name+'"><span class="material-symbols-outlined text-[20px]">'+icon+'</span><span>'+name+'</span></button>';
  }
  function splitBtnHTML(key,label){
    var active = split===key;
    var cls = active ? 'py-2 rounded-lg bg-primary text-on-primary font-headline-md text-headline-md font-bold text-center shadow-sm split-btn' : 'py-2 rounded-lg bg-transparent text-on-surface-variant font-body-lg text-body-lg font-bold text-center hover:bg-surface-container-high split-btn';
    return '<button class="'+cls+'" type="button" data-split="'+key+'">'+label+'</button>';
  }

  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">edit_note</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">'+(isEdit?'編輯這筆':'記一筆')+'</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-xs">'
    +'<span class="font-label-sm text-label-sm text-on-surface-variant font-bold tracking-wide">輸入金額</span>'
    +'<div class="flex items-baseline justify-between"><div class="flex items-baseline gap-space-xs"><span class="font-headline-xl text-headline-xl text-primary font-black">¥</span><input class="w-28 bg-transparent font-headline-xl text-headline-xl text-on-surface font-black focus:outline-none placeholder:text-surface-container-highest" id="ex-amount" inputmode="decimal" placeholder="0" type="number" value="'+amount+'"></div>'
    +'<div class="flex items-center gap-1 font-body-sm text-body-sm text-on-surface-variant"><span class="font-bold">≈ NT$</span><span class="font-headline-md text-headline-md text-on-surface font-bold" id="ex-converted">0</span></div></div>'
    +'<div id="ex-amount-err" class="text-error font-label-sm text-label-sm hidden">請輸入金額</div>'
    +'<div class="flex items-center gap-space-xs pt-1 flex-wrap"><span class="material-symbols-outlined text-tertiary text-[14px]">currency_exchange</span><span class="font-label-sm text-label-sm text-tertiary">1 人民幣 =</span><input type="number" step="0.01" id="ex-rate" class="w-16 bg-surface-container-low rounded font-label-sm text-label-sm text-on-surface px-1" value="'+rate+'"><span class="font-label-sm text-label-sm text-tertiary">台幣・自動帶入可改</span></div>'
    +'</div>'
    +'<div class="space-y-space-xs">'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm flex items-center gap-space-xs shadow-sm"><span class="material-symbols-outlined text-on-surface-variant text-[20px]">sticky_note_2</span><input class="w-full bg-transparent font-body-lg text-body-lg text-on-surface focus:outline-none placeholder:text-surface-container-highest font-medium" id="ex-title" placeholder="例如：早餐、門票、伴手禮..." type="text" value="'+title.replace(/"/g,'&quot;')+'"></div>'
    +'<div id="ex-title-err" class="text-error font-label-sm text-label-sm px-1 hidden">請輸入項目名稱</div>'
    +'<div class="flex items-center gap-space-xs overflow-x-auto no-scrollbar py-0.5">'+categoryChips+'</div>'
    +'</div>'
    +'<div class="space-y-space-xs"><div class="flex items-center justify-between"><span class="font-label-md text-label-md text-on-surface font-bold">誰付的？</span><span class="font-label-sm text-label-sm text-on-surface-variant">點選付款夥伴</span></div><div class="grid grid-cols-2 gap-space-sm">'+payerBtnHTML('Lena')+payerBtnHTML('Key')+'</div></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">支付方式</span><div class="grid grid-cols-2 gap-space-sm">'+methodBtnHTML('微信支付','qr_code_2')+methodBtnHTML('刷卡','credit_card')+'</div>'
    +'<div class="flex items-center justify-between bg-surface-container-low rounded-xl px-space-md py-space-sm mt-space-xs" id="ex-fee-row"'+(method==='刷卡'?'':' hidden')+'>'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-on-surface-variant text-[18px]">percent</span><span class="font-body-md text-body-md text-on-surface font-medium">海外刷卡 '+STORE.feePercent+'% 手續費</span></div>'
    +'<label class="relative inline-flex items-center cursor-pointer"><input class="sr-only peer" id="ex-fee-switch" type="checkbox"'+(feeApplied?' checked':'')+'><div class="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-container-lowest after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-container"></div></label>'
    +'</div></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">怎麼分？</span><div class="grid grid-cols-3 gap-space-xs bg-surface-container rounded-xl p-1">'+splitBtnHTML('even','平分')+splitBtnHTML('other','全由對方')+splitBtnHTML('custom','自訂金額')+'</div>'
    +'<div class="grid grid-cols-2 gap-space-sm pt-1" id="ex-custom-row"'+(split==='custom'?'':' hidden')+'>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm shadow-sm"><span class="font-label-sm text-label-sm text-on-surface-variant">'+memberName('Lena')+' 金額</span><div class="flex items-baseline gap-1"><span class="text-primary font-bold">¥</span><input type="number" id="ex-custom-lena" class="w-full bg-transparent font-headline-md text-headline-md text-on-surface font-bold focus:outline-none" value="'+customLena+'"></div></div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm shadow-sm"><span class="font-label-sm text-label-sm text-on-surface-variant">'+memberName('Key')+' 金額</span><div class="flex items-baseline gap-1"><span class="text-primary font-bold">¥</span><input type="number" id="ex-custom-key" class="w-full bg-transparent font-headline-md text-headline-md text-on-surface font-bold focus:outline-none" value="'+customKey+'"></div></div>'
    +'</div>'
    +'<div id="ex-split-err" class="text-error font-label-sm text-label-sm px-1 hidden">'+memberName('Lena')+' ＋ '+memberName('Key')+' 金額合計需等於總金額</div>'
    +'</div>'
    +'<div class="flex items-center justify-between pt-1 flex-wrap gap-2"><div class="flex items-center gap-space-xs text-on-surface-variant"><span class="material-symbols-outlined text-[18px]">calendar_month</span><select id="ex-date" class="bg-transparent font-label-md text-label-md font-medium focus:outline-none">'+dateOptions+'</select></div><div class="flex items-center gap-1 text-primary"><span class="material-symbols-outlined text-[16px]">map</span><span class="font-label-sm text-label-sm font-bold" id="ex-related">關聯行程：'+relatedItineraryLabel(date)+'</span></div></div>'
    +'<button class="w-full py-3.5 px-space-md rounded-full bg-primary-container text-on-primary font-headline-lg text-headline-lg font-black shadow-lg flex items-center justify-center gap-space-xs transition-transform active:scale-[0.98]" id="ex-submit" type="button"><span class="material-symbols-outlined text-[24px]">bookmark_added</span><span>'+(isEdit?'儲存':'記下來')+'</span></button>';
}

function openExpenseDrawer(editId){
  var editExpense = editId ? STORE.expenses.find(function(e){ return String(e.id)===String(editId); }) : null;
  openDrawer(expenseDrawerHTML(editExpense), function(){
    var amountEl = document.getElementById('ex-amount');
    var rateEl = document.getElementById('ex-rate');
    var convertedEl = document.getElementById('ex-converted');
    function updateConverted(){
      var amt = parseFloat(amountEl.value) || 0;
      var rate = parseFloat(rateEl.value) || 0;
      var feeSwitchEl = document.getElementById('ex-fee-switch');
      var feeRow = document.getElementById('ex-fee-row');
      var mul = (feeSwitchEl && feeRow && !feeRow.hidden && feeSwitchEl.checked) ? feeMultiplier() : 1;
      convertedEl.textContent = fmtNum(amt*rate*mul);
    }
    amountEl.addEventListener('input', updateConverted);
    rateEl.addEventListener('input', updateConverted);
    updateConverted();

    document.querySelectorAll('.category-chip').forEach(function(chip){
      chip.addEventListener('click', function(){
        document.querySelectorAll('.category-chip').forEach(function(c){ c.className = 'category-chip px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95'; });
        chip.className = 'category-chip px-3 py-1.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95';
        document.getElementById('ex-title').value = chip.getAttribute('data-cat');
      });
    });

    document.querySelectorAll('.payer-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('.payer-btn').forEach(function(b){
          b.className = 'flex items-center justify-center gap-space-sm p-space-sm rounded-xl bg-surface-container text-on-surface-variant font-bold transition-all hover:bg-surface-container-high payer-btn';
          var circ = b.querySelector('div'); if(circ) circ.className = 'w-8 h-8 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center font-headline-md text-headline-md';
          var badge = b.querySelector('.absolute'); if(badge) badge.remove();
        });
        btn.className = 'relative flex items-center justify-center gap-space-sm p-space-sm rounded-xl bg-primary-container text-on-primary font-bold shadow-md transition-all payer-btn';
        var circ2 = btn.querySelector('div'); if(circ2) circ2.className = 'w-8 h-8 rounded-full bg-on-primary text-primary-container flex items-center justify-center font-headline-md text-headline-md font-black';
        var badgeEl = document.createElement('div');
        badgeEl.className = 'absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-surface-container-lowest text-primary flex items-center justify-center shadow-sm';
        badgeEl.innerHTML = '<span class="material-symbols-outlined text-[16px] font-bold">check</span>';
        btn.appendChild(badgeEl);
      });
    });

    document.querySelectorAll('.method-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('.method-btn').forEach(function(b){ b.className = 'flex items-center justify-center gap-space-xs p-space-sm rounded-xl bg-surface-container text-on-surface-variant font-headline-md text-headline-md font-bold hover:bg-surface-container-high method-btn'; });
        btn.className = 'flex items-center justify-center gap-space-xs p-space-sm rounded-xl bg-secondary-container text-on-secondary-container font-headline-md text-headline-md font-bold shadow-sm method-btn';
        var feeRow = document.getElementById('ex-fee-row');
        var isCard = btn.getAttribute('data-method') === '刷卡';
        feeRow.hidden = !isCard;
        if(!isCard){ var fs = document.getElementById('ex-fee-switch'); if(fs) fs.checked = false; }
        updateConverted();
      });
    });
    var feeSwitch = document.getElementById('ex-fee-switch');
    if(feeSwitch) feeSwitch.addEventListener('change', updateConverted);

    document.querySelectorAll('.split-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('.split-btn').forEach(function(b){ b.className = 'py-2 rounded-lg bg-transparent text-on-surface-variant font-body-lg text-body-lg font-bold text-center hover:bg-surface-container-high split-btn'; });
        btn.className = 'py-2 rounded-lg bg-primary text-on-primary font-headline-md text-headline-md font-bold text-center shadow-sm split-btn';
        var isCustom = btn.getAttribute('data-split') === 'custom';
        document.getElementById('ex-custom-row').hidden = !isCustom;
        document.getElementById('ex-split-err').classList.add('hidden');
      });
    });

    var dateSel = document.getElementById('ex-date');
    dateSel.addEventListener('change', function(){
      var d = dateSel.value;
      document.getElementById('ex-related').textContent = '關聯行程：'+relatedItineraryLabel(d);
      if(!editExpense){ rateEl.value = fxRateFor(d); updateConverted(); }
    });

    document.getElementById('ex-submit').addEventListener('click', function(){
      var amt = parseFloat(amountEl.value);
      var title = document.getElementById('ex-title').value.trim();
      var amountErr = document.getElementById('ex-amount-err');
      var titleErr = document.getElementById('ex-title-err');
      amountErr.classList.add('hidden'); titleErr.classList.add('hidden');
      var valid = true;
      if(!amt || amt <= 0){ amountErr.classList.remove('hidden'); valid = false; }
      if(!title){ titleErr.classList.remove('hidden'); valid = false; }
      var payerBtnEl = document.querySelector('.payer-btn.bg-primary-container');
      var payer = payerBtnEl ? payerBtnEl.getAttribute('data-payer') : 'Lena';
      var methodBtnEl = document.querySelector('.method-btn.bg-secondary-container');
      var method = methodBtnEl ? methodBtnEl.getAttribute('data-method') : '微信支付';
      var splitBtnEl = document.querySelector('.split-btn.bg-primary');
      var split = splitBtnEl ? splitBtnEl.getAttribute('data-split') : 'even';
      var customLena = null, customKey = null;
      if(split === 'custom'){
        customLena = parseFloat(document.getElementById('ex-custom-lena').value) || 0;
        customKey = parseFloat(document.getElementById('ex-custom-key').value) || 0;
        var splitErr = document.getElementById('ex-split-err');
        if(!amt || Math.abs((customLena+customKey) - amt) > 0.01){
          splitErr.classList.remove('hidden');
          valid = false;
        } else {
          splitErr.classList.add('hidden');
        }
      }
      if(!valid) return;
      var feeSwitchEl = document.getElementById('ex-fee-switch');
      var feeApplied = method==='刷卡' && feeSwitchEl && feeSwitchEl.checked;
      var rateVal = parseFloat(rateEl.value) || (DATA.fxRates[dateSel.value]||4.4);
      var payload = {
        date: dateSel.value, title: title, amount: amt, payer: payer, method: method,
        split: split, feeApplied: feeApplied, rateOverride: rateVal
      };
      if(split === 'custom'){ payload.customLena = customLena; payload.customKey = customKey; }
      if(editExpense){
        for(var k in payload){ editExpense[k] = payload[k]; }
        if(split !== 'custom'){ delete editExpense.customLena; delete editExpense.customKey; }
      } else {
        payload.id = 'e-'+Date.now();
        STORE.expenses.push(payload);
      }
      persist();
      closeDrawer();
      renderSplit();
    });
  });
}

/* ---------------- SPOT DETAIL ---------------- */

var spotTab = 'intro';

function highlightCardHTML(h){
  var badgeCls = h.badgeClass || 'bg-surface-container-high text-on-surface-variant';
  var img = h.img
    ? '<div class="w-16 h-16 rounded-lg bg-surface-container overflow-hidden shrink-0 shadow-inner"><img class="w-full h-full object-cover" src="'+h.img+'" alt="'+h.title+'"></div>'
    : '<div class="w-16 h-16 rounded-lg bg-surface-container overflow-hidden shrink-0 shadow-inner flex items-center justify-center text-primary-container"><span class="material-symbols-outlined text-[28px]">auto_awesome</span></div>';
  return '<div class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-center gap-space-md active:bg-surface-container-low transition-colors">'
    +img
    +'<div class="flex flex-col flex-1 min-w-0">'
    +'<div class="flex items-center justify-between gap-1"><h3 class="font-headline-md text-headline-md text-on-surface truncate">'+h.title+'</h3><span class="px-2 py-0.5 rounded-full '+badgeCls+' font-label-sm text-label-sm shrink-0">'+h.badge+'</span></div>'
    +'<p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-1 mt-0.5">'+h.detail+'</p>'
    +'<div class="flex items-center gap-1 text-primary mt-1"><span class="material-symbols-outlined text-[14px]">location_on</span><span class="font-label-sm text-label-sm text-on-surface-variant truncate">'+h.where+'</span></div>'
    +'</div></div>';
}

function reminderRowHTML(row){
  var badgeHTML = row.badge ? '<span class="bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm px-2 py-0.5 rounded-full font-bold shrink-0">'+row.badge+'</span>' : '';
  if(row.type === 'simple'){
    return '<div class="flex items-center justify-between bg-surface-container-low p-2.5 rounded-lg gap-2">'
      +'<div class="flex items-center gap-1.5"><span class="font-bold text-on-surface">'+row.label+'</span><span class="text-primary font-bold text-body-lg">'+row.value+'</span></div>'
      +badgeHTML+'</div>';
  }
  if(row.type === 'grid'){
    var cells = row.cells.map(function(c){
      var valCls = c.accent === 'error' ? 'text-error font-bold text-body-sm' : 'text-on-surface font-bold text-body-sm';
      return '<div class="bg-surface p-1.5 rounded"><span class="text-on-surface-variant block">'+c.label+'</span><span class="'+valCls+'">'+c.value+'</span></div>';
    }).join('');
    return '<div class="flex flex-col gap-1 bg-surface-container-low p-2.5 rounded-lg">'
      +'<div class="flex items-center justify-between gap-2"><span class="font-bold text-on-surface">'+row.label+'</span>'+badgeHTML+'</div>'
      +'<div class="grid grid-cols-3 gap-1 mt-1 text-center font-label-sm">'+cells+'</div>'
      +'</div>';
  }
  /* note */
  return '<div class="flex flex-col gap-1 bg-surface-container-low p-2.5 rounded-lg">'
    +'<div class="flex items-center justify-between gap-2"><span class="font-bold text-on-surface">'+row.label+'</span>'+badgeHTML+'</div>'
    +'<p class="text-body-sm text-on-surface-variant leading-relaxed">'+row.note+'</p>'
    +'</div>';
}

function buildReminderTabHTML(spot){
  if(spot.isCustom){
    return '<div class="relative bg-surface-container-lowest rounded-xl p-space-md shadow-sm mt-space-sm">'
      +'<div class="absolute -top-10 right-4 z-20 flex items-end">'
      +'<div class="bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm px-2.5 py-1 rounded-xl shadow-sm mb-6 mr-1 whitespace-nowrap transform -rotate-3">出發前再確認！</div>'
      +'<div class="w-16 h-auto"><img alt="BIBO" class="w-full h-auto drop-shadow-sm" src="assets/stitch/tip-dog.png"></div>'
      +'</div>'
      +'<div class="flex items-center gap-space-xs mb-space-sm"><div class="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-primary"><span class="material-symbols-outlined text-[18px]">info</span></div><h2 class="font-headline-md text-headline-md text-on-surface font-bold">自訂景點</h2></div>'
      +'<p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">這是你自己新增的景點，詳細資訊出發前再確認。</p>'
      +'</div>';
  }
  var r = DATA.reminders[spot.id];
  if(!r){
    return '<div class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm text-center text-on-surface-variant font-body-sm text-body-sm">提醒資料整理中，之後補上。</div>';
  }
  var bubble = r.bubble || '出發前再確認！';
  var ticketCard = (r.rows && r.rows.length) ? (
    '<div class="relative bg-surface-container-lowest rounded-xl p-space-md shadow-sm">'
    +'<div class="absolute -top-10 right-4 z-20 flex items-end">'
    +'<div class="bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm px-2.5 py-1 rounded-xl shadow-sm mb-6 mr-1 whitespace-nowrap transform -rotate-3">'+bubble+'</div>'
    +'<div class="w-16 h-auto"><img alt="BIBO" class="w-full h-auto drop-shadow-sm" src="assets/stitch/tip-dog.png"></div>'
    +'</div>'
    +'<div class="flex items-center gap-space-xs mb-space-sm"><div class="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-primary"><span class="material-symbols-outlined text-[18px]">confirmation_number</span></div><h2 class="font-headline-md text-headline-md text-on-surface font-bold">門票與預約</h2></div>'
    +'<div class="flex flex-col gap-space-sm text-body-sm text-on-surface-variant">'+r.rows.map(reminderRowHTML).join('')+'</div>'
    +'</div>'
  ) : '';
  var winterCard = (r.winterTips && r.winterTips.length) ? (
    '<div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm">'
    +'<div class="flex items-center gap-space-xs mb-space-sm"><div class="w-8 h-8 rounded-full bg-secondary-fixed flex items-center justify-center text-secondary"><span class="material-symbols-outlined text-[18px]">ac_unit</span></div><h2 class="font-headline-md text-headline-md text-on-surface font-bold">冬天小提醒</h2></div>'
    +'<div class="flex flex-col gap-space-sm text-body-sm">'
    +r.winterTips.map(function(t,i){
      return '<div class="flex items-start gap-space-sm bg-surface-container-low p-space-sm rounded-lg">'
        +'<div class="w-6 h-6 rounded-full bg-primary-fixed-dim text-on-primary-fixed flex items-center justify-center font-bold text-label-sm shrink-0 mt-0.5">'+(i+1)+'</div>'
        +'<div class="flex flex-col"><span class="font-bold text-on-surface">'+t.title+'</span><p class="text-on-surface-variant leading-relaxed">'+t.text+'</p></div>'
        +'</div>';
    }).join('')
    +'</div></div>'
  ) : '';
  var uncertainCard = (r.uncertain && r.uncertain.length) ? (
    '<div class="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden transition-all">'
    +'<button aria-expanded="false" class="w-full p-space-md flex items-center justify-between text-left focus:outline-none" id="toggle-unverified">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[20px]">help_outline</span><span class="font-headline-md text-headline-md text-on-surface font-bold">待查證事項</span><span class="bg-surface-container-high text-on-surface-variant text-label-sm font-bold px-2 py-0.5 rounded-full">'+r.uncertain.length+'</span></div>'
    +'<span class="material-symbols-outlined text-on-surface-variant transition-transform" id="unverified-icon">expand_more</span>'
    +'</button>'
    +'<div class="hidden px-space-md pb-space-md flex flex-col gap-2" id="unverified-content">'
    +r.uncertain.map(function(u){
      return '<div class="bg-surface-container-low p-2.5 rounded-lg flex items-start gap-2"><span class="material-symbols-outlined text-[18px] text-tertiary mt-0.5">pending_actions</span><div class="text-body-sm text-on-surface-variant">'+u+'</div></div>';
    }).join('')
    +'</div></div>'
  ) : '';
  var cards = [ticketCard, winterCard, uncertainCard].filter(Boolean).join('');
  if(!cards){
    return '<div class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm text-center text-on-surface-variant font-body-sm text-body-sm">提醒資料整理中，之後補上。</div>';
  }
  return '<div class="flex flex-col gap-space-md mt-space-sm">'+cards+'</div>';
}

function bindReminderTabEvents(){
  var toggleBtn = document.getElementById('toggle-unverified');
  var content = document.getElementById('unverified-content');
  var icon = document.getElementById('unverified-icon');
  if(toggleBtn && content && icon){
    toggleBtn.addEventListener('click', function(){
      var isHidden = content.classList.contains('hidden');
      if(isHidden){ content.classList.remove('hidden'); icon.style.transform = 'rotate(180deg)'; toggleBtn.setAttribute('aria-expanded','true'); }
      else { content.classList.add('hidden'); icon.style.transform = 'rotate(0deg)'; toggleBtn.setAttribute('aria-expanded','false'); }
    });
  }
}

function renderSpotDetail(id){
  var spot = findSpotById(id) || allSpots()[0];
  var amap = amapForSpot(spot);
  var amapUrl = 'https://uri.amap.com/search?keyword='+encodeURIComponent(amap.kw)+'&city='+encodeURIComponent(amap.city)+'&src=bibo&callnative=1';
  var hero = spot.hero || spot.img;
  var tag2 = spot.tag2 || spot.era;
  var quote = spot.quote || spot.oneLiner;
  spotTab = 'intro';

  var introParas = (spot.intro||[]).map(function(p){ return '<p class="font-body-md text-body-md text-on-surface leading-relaxed">'+p+'</p>'; }).join('');
  var introCard = '<div class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm relative overflow-hidden"><div class="absolute top-0 right-0 w-16 h-16 bg-primary-fixed/20 rounded-bl-full pointer-events-none"></div>'+introParas+'</div>';

  var storyCard = spot.story ? '<div class="bg-tertiary-fixed/30 p-space-md rounded-xl shadow-sm relative flex flex-col gap-space-xs"><div class="flex items-center gap-space-xs text-on-tertiary-fixed"><span class="material-symbols-outlined text-[20px] text-tertiary">history_edu</span><span class="font-headline-md text-headline-md text-on-tertiary-fixed">一則故事</span></div><div class="flex gap-2"><span class="material-symbols-outlined text-[26px] text-tertiary/70 shrink-0">format_quote</span><p class="font-body-md text-body-md text-on-tertiary-fixed-variant leading-relaxed">'+spot.story+'</p></div></div>' : '';

  var connCard = spot.connections ? '<div class="bg-secondary-container/40 p-space-md rounded-xl shadow-sm flex items-start gap-space-sm"><div class="w-9 h-9 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0 mt-0.5 shadow-sm"><span class="material-symbols-outlined text-[20px]">alt_route</span></div><div class="flex flex-col gap-1 min-w-0"><div class="flex items-center gap-1.5"><span class="font-headline-md text-headline-md text-on-secondary-container">跨景點關聯</span><span class="px-2 py-0.2 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm">文脈探索</span></div><p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">'+spot.connections+'</p></div></div>' : '';

  var hasHighlights = spot.highlights && spot.highlights.length;
  var highlightsPreview = '';
  if(hasHighlights){
    var preview = spot.highlights.slice(0,3).map(highlightCardHTML).join('');
    highlightsPreview = '<div class="flex flex-col gap-space-sm pt-space-xs"><div class="flex items-center justify-between"><div class="flex items-center gap-space-xs"><span class="w-2.5 h-2.5 rounded-full bg-primary-container"></span><h2 class="font-headline-md text-headline-md text-on-surface">精選看點</h2></div><button class="font-label-sm text-label-sm text-primary flex items-center gap-0.5" onclick="switchSpotTab(\'highlights\')">查看全部<span class="material-symbols-outlined text-[14px]">arrow_forward</span></button></div>'+preview+'</div>';
  }

  var bibotip = spot.bibotip || (spot.tips ? spot.tips.replace(/（請再確認）/,'') + '，請再確認汪！' : '相關資訊還在整理，請再確認汪！');
  var tipBanner = '<div class="bg-surface-container-low p-space-md rounded-xl shadow-sm flex items-center gap-space-sm mb-space-lg"><div class="w-10 h-10 rounded-full bg-primary-fixed-dim/60 flex items-center justify-center text-on-primary-fixed shrink-0"><span class="material-symbols-outlined text-[20px]">pets</span></div><div class="flex flex-col flex-1 min-w-0"><p class="font-label-md text-label-md text-primary font-bold">BIBO 的探訪小提醒</p><p class="font-body-sm text-body-sm text-on-surface-variant">'+bibotip+'</p></div></div>';

  var routeSection = (spot.route && spot.route.length) ? (
    '<div class="flex flex-col gap-space-sm pt-space-xs"><div class="flex items-center gap-space-xs"><span class="w-2.5 h-2.5 rounded-full bg-primary-container"></span><h2 class="font-headline-md text-headline-md text-on-surface">建議路線</h2></div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm"><div class="flex flex-col gap-space-sm text-body-sm">'
    +spot.route.map(function(step,i){
      return '<div class="flex items-start gap-space-sm bg-surface-container-low p-space-sm rounded-lg">'
        +'<div class="w-6 h-6 rounded-full bg-primary-fixed-dim text-on-primary-fixed flex items-center justify-center font-bold text-label-sm shrink-0 mt-0.5">'+(i+1)+'</div>'
        +'<p class="text-on-surface-variant leading-relaxed">'+step+'</p></div>';
    }).join('')
    +'</div></div></div>'
  ) : '';
  var triviaSection = (spot.trivia && spot.trivia.length) ? (
    '<div class="flex flex-col gap-space-sm pt-space-xs"><div class="flex items-center gap-space-xs"><span class="w-2.5 h-2.5 rounded-full bg-primary-container"></span><h2 class="font-headline-md text-headline-md text-on-surface">冷知識</h2></div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm"><div class="flex flex-col gap-space-sm">'
    +spot.trivia.map(function(t){
      return '<div class="bg-surface-container-low p-2.5 rounded-lg flex items-start gap-2"><span class="material-symbols-outlined text-[18px] text-tertiary mt-0.5">lightbulb</span><div class="text-body-sm text-on-surface-variant leading-relaxed">'+t+'</div></div>';
    }).join('')
    +'</div></div></div>'
  ) : '';

  var contentIntro = introCard + storyCard + connCard + routeSection + triviaSection + highlightsPreview;

  var contentHighlights = hasHighlights
    ? '<div class="flex flex-col gap-space-sm">'+spot.highlights.map(highlightCardHTML).join('')+'</div>'
    : '<div class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm text-center text-on-surface-variant font-body-sm text-body-sm">看點資料整理中，之後補上。</div>';

  var contentTips = buildReminderTabHTML(spot);

  var contentMap = '<div class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col items-center gap-space-sm text-center">'
    +'<a class="h-12 w-full rounded-full bg-primary-container text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-xs shadow-md active:scale-98 transition-all" href="'+amapUrl+'" target="_blank" rel="noopener"><span class="material-symbols-outlined text-[20px]">near_me</span>高德地圖打開</a>'
    +'<p class="font-body-sm text-body-sm text-on-surface-variant">Android 有裝高德會直接開 App</p>'
    +'</div>';

  var heroInner = hero
    ? '<div class="w-full h-full bg-cover bg-center" style="background-image:url(\''+hero+'\')"></div>'
    : '<div class="w-full h-full flex items-center justify-center bg-surface-container-high text-outline"><span class="material-symbols-outlined text-[64px]">add_location_alt</span></div>';
  var dayTimeLabel = (spot.day || spot.day === 0) ? ('Day '+spot.day+(spot.time?(' '+spot.time):'')) : '未排入行程';

  var html = ''
    +'<div class="relative">'
    +'<div class="relative w-full h-64 bg-surface-container overflow-hidden rounded-b-xl shadow-md">'
    +heroInner
    +'<div class="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-black/25 pointer-events-none"></div>'
    +'<div class="absolute top-4 right-4 z-20"><button aria-label="收藏景點" class="w-10 h-10 rounded-full bg-surface-container-lowest/90 backdrop-blur-sm flex items-center justify-center text-primary-container shadow-sm active:scale-95 transition-transform" id="fav-btn" onclick="toggleSpotFav()"><span class="material-symbols-outlined text-[22px]" id="fav-icon">favorite_border</span></button></div>'
    +'</div>'
    +'<div class="absolute right-4 w-36 h-44 z-10 pointer-events-none select-none" style="bottom:16px;filter:drop-shadow(0 4px 6px rgba(0,0,0,.18))"><img alt="BIBO 黑狗吉祥物" class="w-full h-full object-contain object-bottom" src="assets/stitch/hero-bibo.png"></div>'
    +'</div>'
    +'<div class="relative z-20 -mt-6 bg-background rounded-t-[28px] px-gutter pt-space-lg flex flex-col gap-space-lg" style="box-shadow:0 -6px 16px rgba(0,0,0,.06)">'
    +'<div class="flex flex-col gap-space-xs">'
    +'<div class="flex items-center gap-space-xs flex-wrap">'
    +'<span class="px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm flex items-center gap-1 shadow-sm"><span class="material-symbols-outlined text-[13px]">location_on</span>'+cityName(spot.city)+'</span>'
    +'<span class="px-2.5 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm shadow-sm">'+tag2+'</span>'
    +'<span class="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">schedule</span>'+dayTimeLabel+'</span>'
    +'</div>'
    +'<h1 class="font-headline-xl-mobile text-headline-xl-mobile text-primary tracking-tight mt-1">'+spot.fullName+'</h1>'
    +'<div class="flex items-start gap-1.5 text-on-surface-variant pt-0.5"><span class="material-symbols-outlined text-[18px] text-primary-container shrink-0 mt-0.5">format_quote</span><p class="font-body-md text-body-md italic font-medium leading-snug">'+quote+'</p></div>'
    +'</div>'
    +'<div class="grid grid-cols-2 gap-space-sm">'
    +'<a class="h-12 w-full rounded-full bg-primary-container text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-xs shadow-md active:scale-98 transition-all" href="'+amapUrl+'" target="_blank" rel="noopener"><span class="material-symbols-outlined text-[20px]">near_me</span>高德地圖打開</a>'
    +'<button class="h-12 w-full rounded-full bg-surface-container-lowest text-primary font-label-lg text-label-lg flex items-center justify-center gap-space-xs shadow-sm hover:bg-surface-container-low active:scale-98 transition-all" id="spot-add-to-plan-btn" type="button"><span class="material-symbols-outlined text-[20px] text-primary-container">bookmark_add</span>加到行程</button>'
    +'</div>'
    +'<div class="w-full flex items-center bg-surface-container-low p-1 rounded-full shadow-inner" id="spot-tabs">'
    +'<button class="spot-tab-btn flex-1 py-2 rounded-full font-label-md text-label-md text-center transition-all" data-tab="intro">介紹</button>'
    +'<button class="spot-tab-btn flex-1 py-2 rounded-full font-label-md text-label-md text-center transition-all" data-tab="highlights">看點</button>'
    +'<button class="spot-tab-btn flex-1 py-2 rounded-full font-label-md text-label-md text-center transition-all" data-tab="tips">提醒</button>'
    +'<button class="spot-tab-btn flex-1 py-2 rounded-full font-label-md text-label-md text-center transition-all" data-tab="map">地圖</button>'
    +'</div>'
    +'<div class="flex flex-col gap-space-md" id="spot-content-intro">'+contentIntro+'</div>'
    +'<div class="flex flex-col gap-space-md" id="spot-content-highlights" hidden>'+contentHighlights+'</div>'
    +'<div class="flex flex-col gap-space-md" id="spot-content-tips" hidden>'+contentTips+'</div>'
    +'<div class="flex flex-col gap-space-md" id="spot-content-map" hidden>'+contentMap+'</div>'
    +tipBanner
    +'</div>';

  document.getElementById('spot-detail-root').innerHTML = html;
  applySpotTabStyles();
  document.querySelectorAll('.spot-tab-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ switchSpotTab(btn.getAttribute('data-tab')); });
  });
  bindReminderTabEvents();

  var addToPlanBtn = document.getElementById('spot-add-to-plan-btn');
  if(addToPlanBtn) addToPlanBtn.onclick = function(){ openAddToItineraryDrawer(spot); };
  var shareBtn = document.getElementById('spot-share-btn');
  if(shareBtn) shareBtn.onclick = function(){ shareSpot(spot); };
  var editBtn = document.getElementById('spot-edit-btn');
  var delBtn = document.getElementById('spot-delete-btn');
  if(editBtn && delBtn){
    editBtn.hidden = !spot.isCustom;
    delBtn.hidden = !spot.isCustom;
    if(spot.isCustom){
      editBtn.onclick = function(){ openSpotEditDrawer(spot); };
      delBtn.onclick = function(){ openSpotDeleteConfirmDrawer(spot); };
    }
  }
}

/* ---------------- ADD-TO-ITINERARY DRAWER (from spot detail) ---------------- */

function addToItineraryDrawerHTML(spot){
  var dayOptions = STORE.days.map(function(d){
    return '<option value="'+d.day+'"'+(d.day===spot.day?' selected':'')+'>Day '+d.day+'・'+d.date+'</option>';
  }).join('');
  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">bookmark_add</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">加到行程</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">選擇 Day</span><select id="at-day" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none">'+dayOptions+'</select></div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm flex items-center gap-space-xs shadow-sm"><span class="material-symbols-outlined text-on-surface-variant text-[20px]">schedule</span><input class="w-full bg-transparent font-body-lg text-body-lg text-on-surface focus:outline-none placeholder:text-surface-container-highest font-medium" id="at-time" placeholder="時間（可留空）" type="text" value="'+(spot.time||'')+'"></div>'
    +'<button class="w-full py-3.5 px-space-md rounded-full bg-primary-container text-on-primary font-headline-lg text-headline-lg font-black shadow-lg flex items-center justify-center gap-space-xs transition-transform active:scale-[0.98]" id="at-submit" type="button"><span class="material-symbols-outlined text-[24px]">bookmark_added</span><span>加入行程</span></button>';
}
function openAddToItineraryDrawer(spot){
  openDrawer(addToItineraryDrawerHTML(spot), function(){
    document.getElementById('at-submit').addEventListener('click', function(){
      var dayNum = parseInt(document.getElementById('at-day').value,10);
      var time = document.getElementById('at-time').value.trim();
      var day = findDayByNum(dayNum);
      insertItemByTime(day, { id: genId('at'), title: spot.name, time:time, type:'景點', note: spot.oneLiner||'', spotId: spot.id });
      persist();
      closeDrawer();
      showToast('已加到 Day '+dayNum);
    });
  });
}

/* ---------------- DELETE CUSTOM SPOT ---------------- */

function spotDeleteConfirmDrawerHTML(spot){
  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-error text-[22px]">delete</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">刪除景點</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="bg-error-container rounded-2xl p-3.5 flex items-center justify-between shadow-sm gap-2">'
    +'<span class="font-body-md text-body-md text-on-error-container font-bold truncate">確定要刪除「'+spot.name+'」？</span>'
    +'<div class="flex items-center gap-2 shrink-0"><button class="px-3 py-1.5 rounded-full bg-surface-container-lowest text-on-surface font-label-sm text-label-sm" id="sd-cancel" type="button">取消</button><button class="px-3 py-1.5 rounded-full bg-error text-on-error font-label-sm text-label-sm" id="sd-confirm" type="button">刪除</button></div>'
    +'</div>';
}
function openSpotDeleteConfirmDrawer(spot){
  openDrawer(spotDeleteConfirmDrawerHTML(spot), function(){
    document.getElementById('sd-cancel').addEventListener('click', function(){ closeDrawer(); });
    document.getElementById('sd-confirm').addEventListener('click', function(){
      var idx = STORE.customSpots.findIndex(function(s){ return s.id===spot.id; });
      if(idx !== -1) STORE.customSpots.splice(idx,1);
      persist();
      closeDrawer();
      location.hash = '#spots';
      showToast('已刪除景點');
    });
  });
}

/* ---------------- SHARE SPOT (clipboard + fallback) ---------------- */

function shareSpot(spot){
  var amap = amapForSpot(spot);
  var amapUrl = 'https://uri.amap.com/search?keyword='+encodeURIComponent(amap.kw)+'&city='+encodeURIComponent(amap.city)+'&src=bibo&callnative=1';
  var text = (spot.fullName||spot.name)+'｜'+cityName(spot.city)+'\n高德：'+amapUrl;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){
      showToast('已複製景點資訊');
    }, function(){
      openShareFallbackDrawer(text);
    });
  } else {
    openShareFallbackDrawer(text);
  }
}
function openShareFallbackDrawer(text){
  var safeText = String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  openDrawer(
    '<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">content_copy</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">複製這段文字</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm shadow-sm"><textarea readonly id="share-fallback-text" rows="4" class="w-full bg-transparent font-body-md text-body-md text-on-surface focus:outline-none">'+safeText+'</textarea></div>'
    +'<p class="font-body-sm text-body-sm text-on-surface-variant px-1">請長按選取上方文字手動複製</p>',
    function(){ var ta = document.getElementById('share-fallback-text'); if(ta){ ta.focus(); ta.select(); } }
  );
}

function cityName(cityKey){
  var map = { xian:'西安', luoyang:'洛陽', nanjing:'南京', xuzhou:'徐州', shanghai:'上海' };
  return map[cityKey] || cityKey;
}

window.switchSpotTab = function(tab){
  spotTab = tab;
  applySpotTabStyles();
  ['intro','highlights','tips','map'].forEach(function(t){
    var el = document.getElementById('spot-content-'+t);
    if(el) el.hidden = (t !== tab);
  });
  window.scrollTo({top:0, behavior:'smooth'});
};

function applySpotTabStyles(){
  document.querySelectorAll('.spot-tab-btn').forEach(function(btn){
    var active = btn.getAttribute('data-tab') === spotTab;
    btn.className = active
      ? 'spot-tab-btn flex-1 py-2 rounded-full bg-primary-container text-on-primary font-label-md text-label-md text-center transition-all shadow-sm'
      : 'spot-tab-btn flex-1 py-2 rounded-full text-on-surface-variant font-label-md text-label-md text-center hover:text-on-surface transition-all';
  });
}

window.toggleSpotFav = function(){
  var icon = document.getElementById('fav-icon');
  if(!icon) return;
  var isFav = icon.textContent === 'favorite';
  icon.textContent = isFav ? 'favorite_border' : 'favorite';
  if(!isFav){ icon.style.fontVariationSettings = "'FILL' 1"; icon.classList.add('text-error'); }
  else { icon.style.fontVariationSettings = "'FILL' 0"; icon.classList.remove('text-error'); }
};

/* ---------------- TICKETS ---------------- */

function ticketStatusOf(t){ return STORE.ticketStatus[t.id] || 'unpurchased'; }

function cycleTicketStatus(id){
  var order = ['unpurchased','purchased','ticketed'];
  var cur = STORE.ticketStatus[id] || 'unpurchased';
  var idx = order.indexOf(cur);
  STORE.ticketStatus[id] = order[(idx+1)%order.length];
  persist();
  renderTickets();
}

function parseTripDate(mdStr){
  var m = /^(\d{1,2})\/(\d{1,2})/.exec(mdStr||'');
  if(!m) return new Date(2099,0,1);
  var mo = parseInt(m[1],10), da = parseInt(m[2],10);
  var year = mo===1 ? 2027 : 2026;
  return new Date(year, mo-1, da);
}
function sortTicketsByDate(){
  STORE.tickets.sort(function(a,b){ return parseTripDate(a.date) - parseTripDate(b.date); });
}

function ticketStatusBadgeHTML(t){
  var status = ticketStatusOf(t);
  if(status === 'unpurchased' && t.warn){
    return '<button class="ticket-status-btn px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container text-label-sm font-label-sm flex items-center gap-1" data-id="'+t.id+'" type="button"><span class="material-symbols-outlined text-[14px]">warning</span>'+(t.warnBadge||'未購')+'</button>';
  }
  if(status === 'unpurchased'){
    return '<button class="ticket-status-btn px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container text-label-sm font-label-sm flex items-center gap-1" data-id="'+t.id+'" type="button"><span class="material-symbols-outlined text-[14px]">error</span>未購</button>';
  }
  if(status === 'purchased'){
    return '<button class="ticket-status-btn px-2.5 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed text-label-sm font-label-sm flex items-center gap-1" data-id="'+t.id+'" type="button"><span class="material-symbols-outlined text-[14px]">check</span>已購</button>';
  }
  return '<button class="ticket-status-btn px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-label-sm font-label-sm flex items-center gap-1" data-id="'+t.id+'" type="button"><span class="material-symbols-outlined text-[14px]">check_circle</span>已取票</button>';
}

function ticketDocCTA(t, label){
  if(t.ticketLink){
    return '<a class="shrink-0 px-3 py-1 bg-surface-container-highest text-on-surface rounded-full text-label-sm font-label-sm active:scale-95 transition-transform ticket-cta-stop" href="'+t.ticketLink+'" target="_blank" rel="noopener">'+label+'</a>';
  }
  return '<button class="shrink-0 px-3 py-1 bg-surface-container-highest text-on-surface rounded-full text-label-sm font-label-sm active:scale-95 transition-transform ticket-open-doclink" data-id="'+t.id+'" type="button">'+label+'</button>';
}

function ticketCTAHTML(t){
  var status = ticketStatusOf(t);
  if(t.type === 'flight'){
    return ticketDocCTA(t, status==='ticketed' ? '查看憑證' : '查看機票');
  }
  if(t.type === 'metro'){
    var kw = (t.to.name||'').replace(/\s+/g,'');
    return '<a class="shrink-0 px-3 py-1 bg-surface-container-highest text-on-surface rounded-full text-label-sm font-label-sm active:scale-95 transition-transform ticket-cta-stop" href="https://uri.amap.com/search?keyword='+encodeURIComponent(kw)+'&city='+encodeURIComponent('上海')+'&src=bibo&callnative=1" target="_blank" rel="noopener">查看路線</a>';
  }
  if(status !== 'unpurchased'){
    return ticketDocCTA(t, '查看憑證');
  }
  if(t.id === 't4'){
    return '<button class="shrink-0 px-3 py-1 bg-error text-on-error rounded-full text-label-sm font-label-sm flex items-center gap-1 active:scale-95 transition-transform shadow-sm ticket-open-rush" data-id="'+t.id+'" type="button"><span>搶票設定</span><span class="material-symbols-outlined text-[14px]">alarm</span></button>';
  }
  var cls = t.warn
    ? 'shrink-0 px-3 py-1 bg-error text-on-error rounded-full text-label-sm font-label-sm flex items-center gap-1 active:scale-95 transition-transform shadow-sm ticket-cta-stop'
    : 'shrink-0 px-3 py-1 bg-primary-container text-on-primary-container rounded-full text-label-sm font-label-sm flex items-center gap-1 active:scale-95 transition-transform shadow-sm ticket-cta-stop';
  var icon = t.id==='t6' ? 'arrow_outward' : (t.id==='t2' ? 'open_in_new' : 'chevron_right');
  return '<a class="'+cls+'" href="https://www.12306.cn/" target="_blank" rel="noopener"><span>'+(t.buyLabel||'購票')+'</span><span class="material-symbols-outlined text-[14px]">'+icon+'</span></a>';
}

/* Booking codes + itinerary file buttons shown under the dashed line of flight cards.
   Data comes from STORE.ticketPrivate[t.id] ({ bookingCodes, files:[{label, path}] }), synced read-only from Supabase;
   the files live in the private Storage bucket and are opened through a short-lived signed URL. */
function ticketEsc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function ticketExtraHTML(t){
  var priv = (STORE.ticketPrivate && STORE.ticketPrivate[t.id]) || {};
  var codes = priv.bookingCodes || [], files = priv.files || [];
  if(!codes.length && !files.length) return '';
  var bg = t.warn ? 'bg-error-container/40' : 'bg-surface-container-low';
  var h = '<div class="p-3 px-4 pb-0 '+bg+' flex flex-col gap-2 text-body-sm font-body-sm">';
  if(codes.length){
    h += '<div class="flex items-start gap-1 text-on-surface-variant"><span class="material-symbols-outlined text-[16px]">confirmation_number</span><span>訂位代號　'
      + codes.map(function(c){ return ticketEsc(c.code) + (c.holder ? '（'+ticketEsc(c.holder)+'）' : ''); }).join('、')
      + '</span></div>';
  }
  if(files.length){
    h += '<div class="flex flex-wrap items-center gap-2">'
      + files.map(function(p){
          return '<button class="shrink-0 px-3 py-1 bg-surface-container-highest text-on-surface rounded-full text-label-sm font-label-sm flex items-center gap-1 active:scale-95 transition-transform ticket-cta-stop ticket-private-file" data-path="'+ticketEsc(p.path)+'" type="button"><span>'+ticketEsc(p.label)+'</span><span class="material-symbols-outlined text-[14px]">open_in_new</span></button>';
        }).join('')
      + '</div>';
  }
  return h + '</div>';
}
function openPrivateFile(path){
  if(!Sync || navigator.onLine === false || window.__biboOffline){ showToast('現在沒網路，無法開啟'); return; }
  /* 先同步開一個空白分頁（避免被擋彈出視窗），簽好網址再導過去 */
  var w = null;
  try{ w = window.open('', '_blank'); }catch(e){}
  Sync.signFile(path, 600).then(function(res){
    if(res && res.url){
      if(w){ w.location.href = res.url; }
      else { window.location.href = res.url; }
    } else {
      if(w){ try{ w.close(); }catch(e){} }
      showToast(res && res.error && res.error.kind === 'offline' ? '現在沒網路，無法開啟' : '無法開啟檔案');
    }
  });
}

function ticketCardHTML(t){
  var iconColorCls = t.type==='flight' ? 'text-primary' : 'text-tertiary';
  var bottomCls = t.warn ? 'p-3 px-4 bg-error-container/40 flex items-center justify-between text-body-sm font-body-sm gap-2' : 'p-3 px-4 bg-surface-container-low flex items-center justify-between text-body-sm font-body-sm gap-2';
  var noteTextCls = t.warn ? 'flex items-center gap-1 text-error truncate mr-2' : 'flex items-center gap-1 text-on-surface-variant truncate mr-2';
  return '<div class="ticket-card relative bg-surface-container-lowest rounded-xl shadow-md overflow-hidden cursor-pointer" data-id="'+t.id+'">'
    +'<div class="absolute -left-3 top-28 w-6 h-6 rounded-full bg-surface"></div>'
    +'<div class="absolute -right-3 top-28 w-6 h-6 rounded-full bg-surface"></div>'
    +'<div class="p-4 pb-3 flex flex-col gap-2">'
    +'<div class="flex items-center justify-between gap-2">'
    +'<div class="flex items-center gap-1.5 bg-surface-container-high px-2.5 py-1 rounded-full text-on-surface"><span class="material-symbols-outlined text-[16px] '+iconColorCls+'">'+t.icon+'</span><span class="font-label-sm text-label-sm font-bold">'+t.badge+'</span></div>'
    +ticketStatusBadgeHTML(t)
    +'</div>'
    +'<div class="flex items-center justify-between my-2">'
    +'<div class="flex flex-col"><span class="font-headline-lg text-headline-lg text-on-surface">'+t.from.name+'</span><span class="font-label-sm text-label-sm text-on-surface-variant">'+(t.from.sub||'')+'</span></div>'
    +'<div class="flex flex-col items-center px-2"><span class="font-label-sm text-label-sm text-tertiary font-bold">'+(t.duration||'')+'</span><div class="flex items-center gap-1 text-tertiary"><span class="w-8 h-[2px] bg-outline-variant"></span><span class="material-symbols-outlined text-[16px]">arrow_forward</span></div><span class="font-label-sm text-label-sm text-on-surface-variant">'+(t.mode||'')+'</span></div>'
    +'<div class="flex flex-col items-end"><span class="font-headline-lg text-headline-lg text-on-surface">'+t.to.name+'</span><span class="font-label-sm text-label-sm text-on-surface-variant">'+(t.to.sub||'')+'</span></div>'
    +'</div></div>'
    +'<div class="relative w-full px-6 flex items-center justify-between"><div class="w-full border-t border-dashed border-outline-variant/60 my-1"></div></div>'
    +ticketExtraHTML(t)
    +'<div class="'+bottomCls+'">'
    +'<div class="'+noteTextCls+'"><span class="material-symbols-outlined text-[16px]">'+(t.noteIcon||'info')+'</span><span class="truncate">'+(t.note||'')+'</span></div>'
    +ticketCTAHTML(t)
    +'</div></div>';
}

function renderTickets(){
  var unpurchased = STORE.tickets.filter(function(t){ return ticketStatusOf(t) === 'unpurchased'; }).length;
  var cardsHTML = STORE.tickets.map(ticketCardHTML).join('');
  var html = ''
    +'<div class="relative flex items-center justify-between pt-2">'
    +'<div class="flex flex-col"><div class="flex items-center gap-space-xs"><span class="font-headline-xl-mobile text-headline-xl-mobile text-on-surface">交通票券</span><span class="text-xs px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-bold tracking-wider">'+STORE.tickets.length+' 段</span></div><p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">11 天探險旅程票券存摺</p></div>'
    +'<div class="relative flex items-end"><img alt="BIBO" class="w-14 h-12 object-contain absolute -top-8 right-1 pointer-events-none drop-shadow-sm select-none" src="assets/stitch/tip-dog.png"><button class="flex items-center gap-1 bg-surface-container-highest active:bg-primary-fixed text-on-surface px-3 py-2 rounded-full shadow-sm transition-transform active:scale-95 text-label-md font-label-md" id="ticket-add-btn" type="button"><span class="material-symbols-outlined text-[16px] text-primary">add</span><span>新增票券</span></button></div>'
    +'</div>'
    +'<div class="bg-surface-container-low rounded-xl p-3 flex items-center justify-between shadow-sm">'
    +'<div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center"><span class="material-symbols-outlined text-[20px]">confirmation_number</span></div><div><p class="font-label-md text-label-md text-on-surface">搶票倒數警示</p><p class="font-body-sm text-body-sm text-on-surface-variant">'+unpurchased+' 段待購・跨年返程易售罄</p></div></div>'
    +'<div class="text-right"><span class="inline-flex items-center px-2 py-1 rounded-full bg-error-container text-on-error-container text-label-sm font-label-sm">'+unpurchased+' 待購</span></div>'
    +'</div>'
    +'<div class="flex flex-col gap-space-md">'+cardsHTML+'</div>'
    +'<div class="flex flex-col items-center justify-center pt-4 pb-2 text-center gap-2"><img alt="BIBO" class="w-24 h-36 object-contain drop-shadow-sm select-none" src="assets/stitch/bibo-sit-think.png"><span class="font-label-sm text-label-sm text-on-surface-variant">旅程票券已同步至離線手帳！</span></div>';
  document.getElementById('tickets-root').innerHTML = html;
  document.querySelectorAll('.ticket-status-btn').forEach(function(btn){
    btn.addEventListener('click', function(e){ e.stopPropagation(); cycleTicketStatus(btn.getAttribute('data-id')); });
  });
  document.querySelectorAll('.ticket-cta-stop').forEach(function(el){
    el.addEventListener('click', function(e){ e.stopPropagation(); });
  });
  document.querySelectorAll('.ticket-private-file').forEach(function(btn){
    btn.addEventListener('click', function(e){ e.stopPropagation(); openPrivateFile(btn.getAttribute('data-path')); });
  });
  document.querySelectorAll('.ticket-open-doclink').forEach(function(btn){
    btn.addEventListener('click', function(e){ e.stopPropagation(); openTicketEditDrawer(btn.getAttribute('data-id'), true); });
  });
  document.querySelectorAll('.ticket-open-rush').forEach(function(btn){
    btn.addEventListener('click', function(e){ e.stopPropagation(); openRushDrawer(btn.getAttribute('data-id')); });
  });
  document.querySelectorAll('.ticket-card').forEach(function(card){
    card.addEventListener('click', function(){ openTicketEditDrawer(card.getAttribute('data-id'), false); });
  });
  var addBtn = document.getElementById('ticket-add-btn');
  if(addBtn) addBtn.addEventListener('click', function(){ openTicketEditDrawer(null, false); });
}

/* ---------------- TICKET EDIT / ADD DRAWER ---------------- */

var TICKET_TYPES = [{key:'flight',label:'機票'},{key:'train',label:'高鐵'},{key:'metro',label:'地鐵'},{key:'other',label:'其他'}];
var TICKET_TYPE_ICON = { flight:'flight_takeoff', train:'train', metro:'subway', other:'confirmation_number' };

function ticketEditDrawerHTML(t){
  var isEdit = !!t;
  var badge = isEdit ? (t.badge||'') : '';
  var type = isEdit ? t.type : 'train';
  var date = isEdit ? (t.date||'') : '';
  var fromName = isEdit ? (t.from.name||'') : '';
  var fromSub = isEdit ? (t.from.sub||'') : '';
  var toName = isEdit ? (t.to.name||'') : '';
  var toSub = isEdit ? (t.to.sub||'') : '';
  var carriage = isEdit ? (t.carriage||'') : '';
  var orderLink = isEdit ? (t.orderLink||'') : '';
  var ticketLink = isEdit ? (t.ticketLink||'') : '';
  var note = isEdit ? (t.note||'') : '';
  var status = isEdit ? ticketStatusOf(t) : 'unpurchased';

  var typeChips = TICKET_TYPES.map(function(o){
    var active = o.key===type;
    var cls = active ? 'te-type-btn px-3 py-1.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95' : 'te-type-btn px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95';
    return '<button class="'+cls+'" type="button" data-type="'+o.key+'">'+o.label+'</button>';
  }).join('');
  var statusOpts = [{key:'unpurchased',label:'未購'},{key:'purchased',label:'已購'},{key:'ticketed',label:'已取票'}].map(function(o){
    var active = o.key===status;
    var cls = active ? 'te-status-btn py-2 rounded-lg bg-primary text-on-primary font-headline-md text-headline-md font-bold text-center shadow-sm' : 'te-status-btn py-2 rounded-lg bg-transparent text-on-surface-variant font-body-lg text-body-lg font-bold text-center hover:bg-surface-container-high';
    return '<button class="'+cls+'" type="button" data-status="'+o.key+'">'+o.label+'</button>';
  }).join('');

  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">confirmation_number</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">'+(isEdit?'編輯票券':'新增票券')+'</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">類型</span><div class="flex items-center gap-space-xs overflow-x-auto no-scrollbar py-0.5">'+typeChips+'</div></div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm flex items-center gap-space-xs shadow-sm"><span class="material-symbols-outlined text-on-surface-variant text-[20px]">sticky_note_2</span><input class="w-full bg-transparent font-body-lg text-body-lg text-on-surface focus:outline-none placeholder:text-surface-container-highest font-medium" id="te-badge" placeholder="標題／車次／航班" type="text" value="'+badge.replace(/"/g,'&quot;')+'"></div>'
    +'<div id="te-badge-err" class="text-error font-label-sm text-label-sm px-1 hidden">請輸入標題</div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm flex items-center gap-space-xs shadow-sm"><span class="material-symbols-outlined text-on-surface-variant text-[20px]">calendar_month</span><input class="w-full bg-transparent font-body-lg text-body-lg text-on-surface focus:outline-none placeholder:text-surface-container-highest font-medium" id="te-date" placeholder="日期，例如 12/25" type="text" value="'+date+'"></div>'
    +'<div class="grid grid-cols-2 gap-space-sm">'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm shadow-sm space-y-1"><span class="font-label-sm text-label-sm text-on-surface-variant">出發站</span><input type="text" id="te-from-name" class="w-full bg-transparent font-body-md text-body-md text-on-surface font-bold focus:outline-none" value="'+fromName.replace(/"/g,'&quot;')+'"><input type="text" id="te-from-sub" class="w-full bg-transparent font-body-sm text-body-sm text-on-surface-variant focus:outline-none" placeholder="出發時間" value="'+fromSub.replace(/"/g,'&quot;')+'"></div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm shadow-sm space-y-1"><span class="font-label-sm text-label-sm text-on-surface-variant">抵達站</span><input type="text" id="te-to-name" class="w-full bg-transparent font-body-md text-body-md text-on-surface font-bold focus:outline-none" value="'+toName.replace(/"/g,'&quot;')+'"><input type="text" id="te-to-sub" class="w-full bg-transparent font-body-sm text-body-sm text-on-surface-variant focus:outline-none" placeholder="抵達時間" value="'+toSub.replace(/"/g,'&quot;')+'"></div>'
    +'</div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">車廂座位</span><input type="text" id="te-carriage" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" value="'+carriage.replace(/"/g,'&quot;')+'"></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">訂單連結</span><input type="url" id="te-order-link" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" placeholder="https://" value="'+orderLink+'"><div id="te-order-link-err" class="text-error font-label-sm text-label-sm px-1 hidden">連結需以 http:// 或 https:// 開頭</div></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">憑證連結</span><input type="url" id="te-ticket-link" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" placeholder="https://" value="'+ticketLink+'"><div id="te-ticket-link-err" class="text-error font-label-sm text-label-sm px-1 hidden">連結需以 http:// 或 https:// 開頭</div></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">備註</span><input type="text" id="te-note" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" value="'+note.replace(/"/g,'&quot;')+'"></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">狀態</span><div class="grid grid-cols-3 gap-space-xs bg-surface-container rounded-xl p-1">'+statusOpts+'</div></div>'
    +'<button class="w-full py-3.5 px-space-md rounded-full bg-primary-container text-on-primary font-headline-lg text-headline-lg font-black shadow-lg flex items-center justify-center gap-space-xs transition-transform active:scale-[0.98]" id="te-submit" type="button"><span class="material-symbols-outlined text-[24px]">bookmark_added</span><span>'+(isEdit?'儲存':'新增票券')+'</span></button>';
}

function openTicketEditDrawer(id, focusTicketLink){
  var t = id ? STORE.tickets.find(function(x){ return x.id===id; }) : null;
  openDrawer(ticketEditDrawerHTML(t), function(){
    document.querySelectorAll('.te-type-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('.te-type-btn').forEach(function(b){ b.className = 'te-type-btn px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95'; });
        btn.className = 'te-type-btn px-3 py-1.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md font-bold whitespace-nowrap transition-transform active:scale-95';
      });
    });
    document.querySelectorAll('.te-status-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('.te-status-btn').forEach(function(b){ b.className = 'te-status-btn py-2 rounded-lg bg-transparent text-on-surface-variant font-body-lg text-body-lg font-bold text-center hover:bg-surface-container-high'; });
        btn.className = 'te-status-btn py-2 rounded-lg bg-primary text-on-primary font-headline-md text-headline-md font-bold text-center shadow-sm';
      });
    });
    if(focusTicketLink){
      var tl = document.getElementById('te-ticket-link');
      if(tl) tl.focus();
    }
    document.getElementById('te-submit').addEventListener('click', function(){
      var badge = document.getElementById('te-badge').value.trim();
      var badgeErr = document.getElementById('te-badge-err');
      var orderLink = document.getElementById('te-order-link').value.trim();
      var orderErr = document.getElementById('te-order-link-err');
      var ticketLink = document.getElementById('te-ticket-link').value.trim();
      var ticketErr = document.getElementById('te-ticket-link-err');
      badgeErr.classList.add('hidden'); orderErr.classList.add('hidden'); ticketErr.classList.add('hidden');
      var valid = true;
      if(!badge){ badgeErr.classList.remove('hidden'); valid = false; }
      if(orderLink && !/^https?:\/\//.test(orderLink)){ orderErr.classList.remove('hidden'); valid = false; }
      if(ticketLink && !/^https?:\/\//.test(ticketLink)){ ticketErr.classList.remove('hidden'); valid = false; }
      if(!valid) return;
      var typeBtn = document.querySelector('.te-type-btn.bg-primary-fixed');
      var type = typeBtn ? typeBtn.getAttribute('data-type') : 'train';
      var date = document.getElementById('te-date').value.trim();
      var fromName = document.getElementById('te-from-name').value.trim();
      var fromSub = document.getElementById('te-from-sub').value.trim();
      var toName = document.getElementById('te-to-name').value.trim();
      var toSub = document.getElementById('te-to-sub').value.trim();
      var carriage = document.getElementById('te-carriage').value.trim();
      var note = document.getElementById('te-note').value.trim();
      var statusBtn = document.querySelector('.te-status-btn.bg-primary');
      var status = statusBtn ? statusBtn.getAttribute('data-status') : 'unpurchased';
      if(t){
        t.type = type; t.badge = badge; t.date = date;
        t.from = { name:fromName, sub:fromSub }; t.to = { name:toName, sub:toSub };
        t.carriage = carriage; t.note = note;
        t.icon = TICKET_TYPE_ICON[type] || t.icon;
        if(orderLink) t.orderLink = orderLink; else delete t.orderLink;
        if(ticketLink) t.ticketLink = ticketLink; else delete t.ticketLink;
        STORE.ticketStatus[t.id] = status;
        sortTicketsByDate();
        persist();
        closeDrawer();
        renderTickets();
        showToast('已儲存');
      } else {
        var newTicket = {
          id: genId('tk'), type:type, date:date, badge:badge, icon: TICKET_TYPE_ICON[type],
          from:{name:fromName, sub:fromSub}, to:{name:toName, sub:toSub},
          duration:'', mode:'', note:note, noteIcon:'info', warn:false, carriage:carriage
        };
        if(orderLink) newTicket.orderLink = orderLink;
        if(ticketLink) newTicket.ticketLink = ticketLink;
        STORE.tickets.push(newTicket);
        STORE.ticketStatus[newTicket.id] = status;
        sortTicketsByDate();
        persist();
        closeDrawer();
        renderTickets();
        showToast('已新增票券');
      }
    });
  });
}

/* ---------------- RUSH-TICKET (搶票設定) DRAWER ---------------- */

function rushDrawerHTML(t){
  var dep = parseTripDate(t.date);
  var saleDate = new Date(dep.getTime() - 14*86400000);
  var saleLabel = (saleDate.getMonth()+1)+'/'+saleDate.getDate();
  var today = new Date(); today.setHours(0,0,0,0);
  var diffDays = Math.round((saleDate - today)/86400000);
  var countdownLabel = diffDays > 0 ? ('還有 '+diffDays+' 天開賣') : '已經開賣囉';
  var alertOn = !!STORE.ticketAlerts[t.id];
  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">alarm</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">搶票設定</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-1 text-center">'
    +'<span class="font-body-sm text-body-sm text-on-surface-variant">開賣日＝乘車日（'+t.date+'）前 14 天</span>'
    +'<span class="font-headline-xl text-headline-xl text-primary font-black">'+saleLabel+'</span>'
    +'<span class="font-label-md text-label-md text-on-surface-variant font-bold">'+countdownLabel+'</span>'
    +'</div>'
    +'<a class="w-full h-11 rounded-full bg-primary-container text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-1.5 shadow-sm" href="https://www.12306.cn/" target="_blank" rel="noopener"><span class="material-symbols-outlined text-[18px]">open_in_new</span>去 12306</a>'
    +'<div class="flex items-center justify-between bg-surface-container-low rounded-xl px-space-md py-space-sm">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-on-surface-variant text-[18px]">notifications</span><span class="font-body-md text-body-md text-on-surface font-medium">開賣提醒</span></div>'
    +'<label class="relative inline-flex items-center cursor-pointer"><input class="sr-only peer" id="rd-alert-switch" type="checkbox"'+(alertOn?' checked':'')+'><div class="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-container-lowest after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-container"></div></label>'
    +'</div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm flex items-center gap-space-xs shadow-sm"><span class="material-symbols-outlined text-on-surface-variant text-[20px]">notes</span><input class="w-full bg-transparent font-body-md text-body-md text-on-surface focus:outline-none placeholder:text-surface-container-highest" id="rd-note" placeholder="備註" type="text" value="'+(t.rushNote||'').replace(/"/g,'&quot;')+'"></div>'
    +'<button class="w-full py-3 px-space-md rounded-full bg-primary-container text-on-primary font-headline-md text-headline-md font-black shadow-lg" id="rd-save" type="button">儲存</button>';
}
function openRushDrawer(id){
  var t = STORE.tickets.find(function(x){ return x.id===id; });
  if(!t) return;
  openDrawer(rushDrawerHTML(t), function(){
    document.getElementById('rd-save').addEventListener('click', function(){
      STORE.ticketAlerts[t.id] = document.getElementById('rd-alert-switch').checked;
      t.rushNote = document.getElementById('rd-note').value.trim();
      persist();
      closeDrawer();
      renderTickets();
      if((location.hash||'').indexOf('#lists')===0) renderLists();
      showToast('已儲存');
    });
  });
}

/* ---------------- CHECKLIST ---------------- */

var listsState = { tab: 'prep' };
var swipeOpenRow = null;

var GROUP_ICON_BG = {
  transport:'bg-primary-fixed text-on-primary-fixed', ticket:'bg-tertiary-fixed text-on-tertiary-fixed',
  hotel:'bg-secondary-fixed text-on-secondary-fixed', network:'bg-primary-fixed-dim text-on-primary-fixed-variant',
  insurance:'bg-secondary-container text-on-secondary-container', other:'bg-surface-container-high text-on-surface-variant',
  docs:'bg-primary-fixed text-on-primary-fixed', gadgets:'bg-secondary-fixed text-on-secondary-fixed',
  care:'bg-tertiary-fixed text-on-tertiary-fixed', clothes:'bg-primary-fixed-dim text-on-primary-fixed-variant'
};

function checklistItemHTML(tab, item){
  var checked = !!item.done;
  var checkBtnCls = checked ? 'w-6 h-6 rounded-lg bg-secondary text-on-secondary flex items-center justify-center shadow-sm shrink-0 checklist-check' : 'w-6 h-6 rounded-lg bg-surface-container-high text-transparent flex items-center justify-center shadow-inner shrink-0 checklist-check';
  var titleCls = checked ? 'font-body-md text-body-md text-on-surface-variant line-through truncate' : 'font-body-lg text-body-lg text-on-surface truncate';
  var titleInner = item.link
    ? '<a href="'+item.link+'" target="_blank" rel="noopener" class="hover:underline decoration-dotted underline-offset-2">'+item.title+'</a><span class="material-symbols-outlined text-[14px] text-primary align-middle ml-0.5">open_in_new</span>'
    : item.title;
  var sub = '';
  if(tab === 'prep'){
    var dl = dueLabel(item.due);
    var parts = [];
    if(dl) parts.push('<span class="'+dl.cls+'">'+dl.text+'</span>');
    if(item.link) parts.push('<span class="text-on-surface-variant">'+domainOf(item.link)+'</span>');
    else if(item.note) parts.push('<span class="text-on-surface-variant">'+item.note+'</span>');
    if(parts.length) sub = parts.join('<span class="mx-1 text-outline-variant">・</span>');
  }
  var tagBadge = item.tag ? '<span class="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm flex items-center gap-0.5 shrink-0"><span class="material-symbols-outlined text-[12px]">local_fire_department</span>'+item.tag+'</span>' : '';
  var alertBadge = (item.ticketId && STORE.ticketAlerts[item.ticketId]) ? '<span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm flex items-center gap-0.5 shrink-0"><span class="material-symbols-outlined text-[12px]">notifications_active</span>已設提醒</span>' : '';
  var doneBadge = (!tagBadge && !alertBadge && checked) ? '<span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm shrink-0">已完成</span>' : '';
  return ''
    +'<div class="relative overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm swipe-row" data-id="'+item.id+'">'
    +'<div class="absolute inset-y-0 right-0 flex items-stretch">'
    +'<button class="w-14 bg-primary-container text-on-primary-container flex flex-col items-center justify-center swipe-edit" data-id="'+item.id+'" type="button"><span class="material-symbols-outlined text-[18px]">edit</span><span class="font-label-sm text-label-sm">編輯</span></button>'
    +'<button class="w-14 bg-error text-on-error flex flex-col items-center justify-center swipe-delete" data-id="'+item.id+'" type="button"><span class="material-symbols-outlined text-[18px]">delete</span><span class="font-label-sm text-label-sm">刪除</span></button>'
    +'</div>'
    +'<div class="relative p-space-sm bg-surface-container-lowest flex items-center gap-space-sm swipe-front" style="transform:translateX(0px);transition:transform .2s ease;touch-action:pan-y;">'
    +'<button class="'+checkBtnCls+'" data-id="'+item.id+'" type="button"><span class="material-symbols-outlined text-[18px]">check</span></button>'
    +'<div class="flex-1 min-w-0">'
    +'<p class="'+titleCls+'">'+titleInner+'</p>'
    +(sub ? '<span class="font-label-sm text-label-sm text-outline">'+sub+'</span>' : '')
    +'</div>'
    +(tagBadge+alertBadge||doneBadge)
    +'</div></div>';
}

function checklistGroupHTML(tab, group){
  var items = STORE.checklist[tab].filter(function(it){ return it.group === group.id; });
  if(!items.length) return '';
  var done = items.filter(function(it){ return it.done; }).length;
  var linkHTML = (tab==='prep' && group.id==='transport')
    ? '<a href="#tickets" class="font-label-sm text-label-sm text-primary flex items-center gap-0.5 ml-2">查看全部票券<span class="material-symbols-outlined text-[14px]">arrow_forward</span></a>'
    : '';
  var iconBg = GROUP_ICON_BG[group.id] || 'bg-surface-container-high text-on-surface-variant';
  return '<div class="mt-space-lg flex flex-col gap-space-sm" data-group="'+group.id+'">'
    +'<div class="flex items-center justify-between px-space-xs gap-2">'
    +'<div class="flex items-center gap-space-xs min-w-0"><div class="w-7 h-7 rounded-lg '+iconBg+' flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[18px]">'+group.icon+'</span></div><span class="font-headline-md text-headline-md text-on-surface truncate">'+group.label+'</span>'+linkHTML+'</div>'
    +'<span class="font-label-sm text-label-sm text-on-surface-variant shrink-0">'+done+' / '+items.length+' 完成</span>'
    +'</div>'
    +items.map(function(it){ return checklistItemHTML(tab, it); }).join('')
    +'</div>';
}

function checklistProgressCardHTML(tab){
  var items = STORE.checklist[tab];
  var total = items.length;
  var done = items.filter(function(it){ return it.done; }).length;
  var pct = total ? Math.round(done/total*100) : 0;
  var pinPct = Math.min(92, Math.max(6, pct));
  var label = tab==='prep' ? '前置任務進度' : '打包進度';
  var statusText = pct===0 ? '起跑！準備出發' : (pct===100 ? '全部完成！汪！' : '穩穩前進中');
  return '<div class="relative mt-space-md p-space-md rounded-xl bg-surface-container-lowest shadow-md overflow-hidden">'
    +'<div class="flex items-center justify-between mb-2"><div class="flex items-center gap-2"><div class="w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center"><span class="material-symbols-outlined text-[16px]">task_alt</span></div><span class="font-headline-md text-headline-md text-on-surface">'+label+'</span></div><span class="font-label-lg text-label-lg text-secondary">已完成 '+done+' / '+total+'</span></div>'
    +'<div class="relative pt-6 pb-2">'
    +'<div class="absolute -top-1 flex flex-col items-center z-10" style="left:'+pinPct+'%;transform:translateX(-50%);"><div class="w-8 h-8 rounded-full overflow-hidden bg-primary-container shadow-md"><img alt="BIBO" class="w-full h-full object-cover" src="assets/stitch/bibo-face-icon.png"></div><div class="w-1.5 h-1.5 rotate-45 bg-primary-container -mt-0.5"></div></div>'
    +'<div class="w-full h-3 rounded-full bg-surface-container-high overflow-hidden"><div class="h-full bg-secondary rounded-full transition-all duration-500 shadow-sm" style="width:'+pct+'%;"></div></div>'
    +'</div>'
    +'<div class="flex justify-between items-center mt-1 text-on-surface-variant font-label-sm text-label-sm"><span>'+statusText+'</span><span class="font-bold text-on-surface">'+pct+'% 完成</span></div>'
    +'</div>';
}

function renderLists(){
  var tab = listsState.tab;
  var groups = tab==='prep' ? DATA.checklistPrepGroups : DATA.checklistPackingGroups;
  var groupsHTML = groups.map(function(g){ return checklistGroupHTML(tab,g); }).join('');
  var prepActive = tab==='prep';
  var tabBtnCls = function(active){ return active
    ? 'checklist-tab-btn flex-1 py-2 rounded-full bg-primary-container text-on-primary-container font-label-lg text-label-lg shadow-sm flex items-center justify-center gap-1.5 transition-all'
    : 'checklist-tab-btn flex-1 py-2 rounded-full text-on-surface-variant hover:text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-1.5 transition-all'; };
  var html = ''
    +'<div class="flex items-center justify-between py-space-sm">'
    +'<div class="flex items-center gap-space-xs"><span class="font-headline-xl-mobile text-headline-xl-mobile text-on-surface">清單</span><button id="notes-btn" class="flex items-center gap-1 font-label-sm text-label-sm px-space-xs py-0.5 rounded-full bg-secondary-container text-on-secondary-container shadow-sm" type="button"><span>備忘記事</span>'+(STORE.notes && STORE.notes.trim() ? '<span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>' : '')+'</button></div>'
    +'<div class="flex items-center gap-space-sm">'
    +'<button id="checklist-template-btn" class="flex items-center gap-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface px-space-sm py-1.5 rounded-full shadow-sm active:scale-95 transition-all" type="button"><span class="material-symbols-outlined text-[18px] text-primary">auto_stories</span><span class="font-label-md text-label-md">帶入範本</span></button>'
    +'<button id="checklist-add-btn" class="w-9 h-9 rounded-full bg-primary-container text-on-primary-container shadow-md flex items-center justify-center active:scale-90 transition-transform" type="button"><span class="material-symbols-outlined text-[22px]">add</span></button>'
    +'</div></div>'
    +'<div class="w-full bg-surface-container-low p-1 rounded-full shadow-sm flex items-center mt-space-xs">'
    +'<button class="'+tabBtnCls(prepActive)+'" data-tab="prep" type="button"><span class="material-symbols-outlined text-[18px]">checklist</span><span>前置作業</span></button>'
    +'<button class="'+tabBtnCls(!prepActive)+'" data-tab="packing" type="button"><span class="material-symbols-outlined text-[18px]">luggage</span><span>行李清單</span></button>'
    +'</div>'
    +checklistProgressCardHTML(tab)
    +groupsHTML
    +'<div class="mt-space-xl relative p-space-md rounded-2xl bg-primary-fixed/30 overflow-visible flex items-center gap-space-sm">'
    +'<div class="flex-1 pr-2"><div class="inline-block px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm mb-1 shadow-sm">BIBO 悄悄話</div><p class="font-headline-md text-headline-md text-primary leading-tight">出發前檢查好裝備！汪！</p><p class="font-body-sm text-body-sm text-on-surface-variant mt-1">記得把證件與常備藥放在隨身小包包。</p></div>'
    +'<div class="w-20 h-24 shrink-0 -mt-6"><img alt="BIBO" class="w-full h-full object-contain drop-shadow-md" src="assets/stitch/hero-bibo.png"></div>'
    +'</div>';
  document.getElementById('lists-root').innerHTML = html;
  bindListsEvents();
}

/* ---------------- NOTES DRAWER ---------------- */

function notesDrawerHTML(){
  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">sticky_note_2</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">備忘記事</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm shadow-sm"><textarea id="notes-textarea" rows="6" class="w-full bg-transparent font-body-md text-body-md text-on-surface focus:outline-none placeholder:text-outline" placeholder="寫點什麼備忘...">'+(STORE.notes||'').replace(/</g,'&lt;')+'</textarea></div>'
    +'<button class="w-full py-3.5 px-space-md rounded-full bg-primary-container text-on-primary font-headline-lg text-headline-lg font-black shadow-lg flex items-center justify-center gap-space-xs transition-transform active:scale-[0.98]" id="notes-submit" type="button"><span class="material-symbols-outlined text-[24px]">bookmark_added</span><span>儲存</span></button>';
}
function openNotesDrawer(){
  openDrawer(notesDrawerHTML(), function(){
    document.getElementById('notes-submit').addEventListener('click', function(){
      STORE.notes = document.getElementById('notes-textarea').value;
      persist();
      closeDrawer();
      renderLists();
      showToast('已儲存備忘');
    });
  });
}

function deleteChecklistItem(tab, id){
  var idx = STORE.checklist[tab].findIndex(function(it){ return it.id===id; });
  if(idx === -1) return;
  var removed = STORE.checklist[tab].splice(idx,1)[0];
  persist();
  renderLists();
  showUndoToast('已刪除「'+removed.title+'」', function(){
    STORE.checklist[tab].splice(idx,0,removed);
    persist();
    renderLists();
  });
}

function importChecklistTemplate(tab){
  var defaults = tab==='prep' ? DATA.checklistPrep : DATA.checklistPacking;
  var existingTitles = {};
  STORE.checklist[tab].forEach(function(it){ existingTitles[it.title] = true; });
  var added = 0;
  defaults.forEach(function(def){
    if(!existingTitles[def.title]){
      var c = {}; for(var k in def){ c[k]=def[k]; } c.done = false;
      STORE.checklist[tab].push(c);
      added++;
    }
  });
  persist();
  renderLists();
  showToast(added>0 ? ('已補上 '+added+' 項缺少的項目') : '已經是完整清單囉');
}

function checklistDrawerHTML(tab, item){
  var groups = tab==='prep' ? DATA.checklistPrepGroups : DATA.checklistPackingGroups;
  var groupOptions = groups.map(function(g){ return '<option value="'+g.id+'"'+(item && item.group===g.id?' selected':'')+'>'+g.label+'</option>'; }).join('');
  var isEdit = !!item;
  var dueRow = tab==='prep' ? (
    '<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">到期日</span>'
    +'<input type="date" id="cl-due" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" value="'+(item&&item.due?item.due:'')+'"></div>'
  ) : '';
  return ''
    +'<div class="flex items-center justify-between w-full">'
    +'<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">'+(isEdit?'edit':'playlist_add')+'</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">'+(isEdit?'編輯項目':'新增項目')+'</h2></div>'
    +'<button aria-label="關閉" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" type="button" onclick="closeDrawer()"><span class="material-symbols-outlined text-[18px]">close</span></button>'
    +'</div>'
    +'<div class="bg-surface-container-lowest rounded-xl p-space-sm flex items-center gap-space-xs shadow-sm"><span class="material-symbols-outlined text-on-surface-variant text-[20px]">sticky_note_2</span><input class="w-full bg-transparent font-body-lg text-body-lg text-on-surface focus:outline-none placeholder:text-surface-container-highest font-medium" id="cl-title" placeholder="項目名稱" type="text" value="'+(item?item.title.replace(/"/g,'&quot;'):'')+'"></div>'
    +'<div id="cl-title-err" class="text-error font-label-sm text-label-sm px-1 hidden">請輸入項目名稱</div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">分類</span><select id="cl-group" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none">'+groupOptions+'</select></div>'
    +dueRow
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">連結</span><input type="url" id="cl-link" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" placeholder="https://" value="'+(item&&item.link?item.link:'')+'"><div id="cl-link-err" class="text-error font-label-sm text-label-sm px-1 hidden">連結需以 http:// 或 https:// 開頭</div></div>'
    +'<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">備註</span><input type="text" id="cl-note" class="w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none" value="'+(item&&item.note?item.note.replace(/"/g,'&quot;'):'')+'"></div>'
    +'<button class="w-full py-3.5 px-space-md rounded-full bg-primary-container text-on-primary font-headline-lg text-headline-lg font-black shadow-lg flex items-center justify-center gap-space-xs transition-transform active:scale-[0.98]" id="cl-submit" type="button"><span class="material-symbols-outlined text-[24px]">bookmark_added</span><span>'+(isEdit?'儲存':'加入清單')+'</span></button>'
    +(isEdit ? '<button class="w-full py-2.5 rounded-full bg-error-container text-on-error-container font-label-lg text-label-lg font-bold flex items-center justify-center gap-1" id="cl-delete" type="button"><span class="material-symbols-outlined text-[18px]">delete</span><span>刪除這個項目</span></button>' : '');
}

function openChecklistDrawer(tab, itemId){
  var item = itemId ? STORE.checklist[tab].find(function(it){ return it.id===itemId; }) : null;
  openDrawer(checklistDrawerHTML(tab, item), function(){
    var delBtn = document.getElementById('cl-delete');
    if(delBtn) delBtn.addEventListener('click', function(){
      closeDrawer();
      deleteChecklistItem(tab, itemId);
    });
    document.getElementById('cl-submit').addEventListener('click', function(){
      var title = document.getElementById('cl-title').value.trim();
      var titleErr = document.getElementById('cl-title-err');
      var link = document.getElementById('cl-link').value.trim();
      var linkErr = document.getElementById('cl-link-err');
      titleErr.classList.add('hidden'); linkErr.classList.add('hidden');
      var valid = true;
      if(!title){ titleErr.classList.remove('hidden'); valid = false; }
      if(link && !/^https?:\/\//.test(link)){ linkErr.classList.remove('hidden'); valid = false; }
      if(!valid) return;
      var group = document.getElementById('cl-group').value;
      var dueEl = document.getElementById('cl-due');
      var due = dueEl ? dueEl.value : '';
      var note = document.getElementById('cl-note').value.trim();
      if(item){
        item.title = title; item.group = group;
        if(dueEl){ if(due) item.due = due; else delete item.due; }
        if(link) item.link = link; else delete item.link;
        if(note) item.note = note; else delete item.note;
      } else {
        var newItem = { id: tab+'-custom-'+Date.now(), title: title, group: group, done:false };
        if(due) newItem.due = due;
        if(link) newItem.link = link;
        if(note) newItem.note = note;
        STORE.checklist[tab].push(newItem);
      }
      persist();
      closeDrawer();
      renderLists();
    });
  });
}

function bindSwipeRows(){
  swipeOpenRow = null;
  document.querySelectorAll('.swipe-row').forEach(function(row){
    var front = row.querySelector('.swipe-front');
    var startX=0, startTx=0, dragging=false, moved=false, captured=false, startOnLink=false;
    front.addEventListener('pointerdown', function(e){
      if(e.target.closest('.checklist-check')) return;
      startX = e.clientX; startTx = 0; dragging = true; moved = false; captured = false;
      startOnLink = !!e.target.closest('a');
      front.style.transition = 'none';
    });
    front.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var dx = e.clientX - startX;
      if(!moved && Math.abs(dx) > 6){
        moved = true;
        try{ front.setPointerCapture(e.pointerId); captured = true; }catch(err){}
      }
      if(!moved) return;
      var tx = Math.min(0, Math.max(-112, startTx + dx));
      front.style.transform = 'translateX('+tx+'px)';
    });
    function endDrag(){
      if(!dragging) return;
      dragging = false;
      front.style.transition = 'transform .2s ease';
      var m = /translateX\((-?\d+(\.\d+)?)px\)/.exec(front.style.transform);
      var tx = m ? parseFloat(m[1]) : 0;
      if(tx < -56){ front.style.transform = 'translateX(-112px)'; swipeOpenRow = row; }
      else { front.style.transform = 'translateX(0px)'; if(swipeOpenRow===row) swipeOpenRow = null; }
    }
    front.addEventListener('pointerup', endDrag);
    front.addEventListener('pointercancel', endDrag);
    /* Tap on the text area (not the check button) opens the edit drawer; a drag does not count as a tap */
    front.addEventListener('click', function(e){
      if(e.target.closest('.checklist-check')) return;
      if(moved){ moved = false; return; }
      if(startOnLink) return;
      if(swipeOpenRow === row){
        front.style.transition = 'transform .2s ease'; front.style.transform = 'translateX(0px)'; swipeOpenRow = null;
        return;
      }
      openChecklistDrawer(listsState.tab, row.getAttribute('data-id'));
    });
  });
}

function closeOpenSwipeOnOutsideClick(e){
  if(!swipeOpenRow) return;
  if(swipeOpenRow.contains(e.target)) return;
  var front = swipeOpenRow.querySelector('.swipe-front');
  if(front){ front.style.transition = 'transform .2s ease'; front.style.transform = 'translateX(0px)'; }
  swipeOpenRow = null;
}
document.addEventListener('click', closeOpenSwipeOnOutsideClick);

function bindListsEvents(){
  document.querySelectorAll('.checklist-tab-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ listsState.tab = btn.getAttribute('data-tab'); renderLists(); });
  });
  var addBtn = document.getElementById('checklist-add-btn');
  if(addBtn) addBtn.addEventListener('click', function(){ openChecklistDrawer(listsState.tab, null); });
  var templBtn = document.getElementById('checklist-template-btn');
  if(templBtn) templBtn.addEventListener('click', function(){ importChecklistTemplate(listsState.tab); });
  var notesBtn = document.getElementById('notes-btn');
  if(notesBtn) notesBtn.addEventListener('click', function(){ openNotesDrawer(); });
  document.querySelectorAll('.checklist-check').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var id = btn.getAttribute('data-id');
      var tab = listsState.tab;
      var item = STORE.checklist[tab].find(function(it){ return it.id===id; });
      if(item){ item.done = !item.done; persist(); renderLists(); }
    });
  });
  document.querySelectorAll('.swipe-edit').forEach(function(btn){
    btn.addEventListener('click', function(e){ e.stopPropagation(); openChecklistDrawer(listsState.tab, btn.getAttribute('data-id')); });
  });
  document.querySelectorAll('.swipe-delete').forEach(function(btn){
    btn.addEventListener('click', function(e){ e.stopPropagation(); deleteChecklistItem(listsState.tab, btn.getAttribute('data-id')); });
  });
  bindSwipeRows();
}

/* ---------------- ASK BIBO ---------------- */

function seedChatIfNeeded(){
  if(STORE.chat === null){
    STORE.chat = [
      {role:'divider', text:'今天 14:20'},
      {role:'bot', kind:'text', text:'汪！我是你的隨行導遊 BIBO。旅途上有任何歷史典故、在地美食吃法或交通搭乘疑惑，隨時問我！', time:'14:20'},
      {role:'user', text: DATA.askLongmenQ, time:'14:22'},
      {role:'bot', kind:'card', title:DATA.askLongmenA.title, text:DATA.askLongmenA.text, tip:DATA.askLongmenA.tip, time:'14:23'}
    ];
    persist();
  }
}

function chatBubbleHTML(msg){
  if(msg.role === 'divider'){
    return '<div class="flex items-center justify-center"><span class="px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">'+msg.text+'</span></div>';
  }
  if(msg.role === 'user'){
    return '<div class="flex flex-col items-end max-w-[85%] self-end gap-1">'
      +'<div class="bg-primary-container text-on-primary-container font-body-md text-body-md p-space-md rounded-2xl rounded-tr-sm shadow-sm leading-relaxed">'+msg.text+'</div>'
      +'<div class="flex items-center gap-1 pr-1 text-on-surface-variant font-label-sm text-label-sm"><span>'+msg.time+'</span><span class="material-symbols-outlined text-[14px] text-secondary">done_all</span></div>'
      +'</div>';
  }
  if(msg.kind === 'card'){
    return '<div class="flex items-start gap-space-sm max-w-[92%] self-start">'
      +'<div class="w-11 h-14 shrink-0 flex items-end justify-center"><img alt="BIBO" class="w-full h-full object-contain" src="assets/stitch/hero-bibo.png"></div>'
      +'<div class="flex flex-col gap-1.5 min-w-0">'
      +'<div class="bg-surface-container-lowest p-space-md rounded-2xl rounded-tl-sm shadow-sm text-on-surface flex flex-col gap-2">'
      +'<div class="flex items-center gap-1 text-primary"><span class="material-symbols-outlined text-[18px]">verified</span><span class="font-headline-md text-body-lg">'+msg.title+'</span></div>'
      +'<p class="font-body-md text-body-md leading-relaxed text-on-surface">'+msg.text+'</p>'
      +'<div class="bg-surface-container-low rounded-lg p-2.5 flex items-start gap-2 text-on-surface-variant"><span class="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">tips_and_updates</span><p class="font-body-sm text-body-sm leading-normal">建議路線：'+msg.tip+'</p></div>'
      +'</div>'
      +'<div class="flex items-center gap-1 pl-1 text-on-surface-variant font-label-sm text-label-sm opacity-80"><span class="material-symbols-outlined text-[13px] text-tertiary">auto_awesome</span><span>AI 回答，重要資訊請再確認</span></div>'
      +'</div></div>';
  }
  return '<div class="flex items-start gap-space-sm max-w-[90%] self-start">'
    +'<div class="w-10 h-10 rounded-full bg-surface-container-lowest shrink-0 overflow-hidden shadow-sm flex items-center justify-center"><img alt="BIBO" class="w-full h-full object-cover" src="assets/stitch/bibo-avatar-round.png"></div>'
    +'<div class="flex flex-col gap-1"><div class="bg-surface-container-lowest rounded-2xl rounded-tl-sm p-space-md shadow-sm text-on-surface"><p class="font-body-md text-body-md leading-relaxed">'+msg.text+'</p></div></div>'
    +'</div>';
}

function escHtml(t){
  return String(t == null ? '' : t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function plainToHtml(t){ return escHtml(t).replace(/\r?\n/g,'<br>'); }

var askPending = null;   /* 正在等 DeepSeek 回答的氣泡（只存在記憶體，不進對話紀錄） */

function askDayHint(){
  var key = fxTodayKey(), hit = null;
  (STORE.days || []).forEach(function(d){ if(d.date === key) hit = d; });
  return hit ? ('Day '+hit.day+'（'+hit.date+'）'+(hit.title||'')) : '';
}

function askErrorText(err){
  if(!err) return '暫時無法連線，請稍後再試';
  if(err.kind === 'offline') return '現在沒網路，等連上再問我';
  if(err.kind === 'not_joined') return '先加入行程，我才能回答你';
  if(err.kind === 'http'){
    if(err.code === 'no_key') return '尚未設定 DeepSeek 金鑰';
    if(err.status === 429 && err.code === 'rate_limited') return '問太多次了，休息一下';
    if(err.status === 403 || err.status === 401) return '先加入行程，我才能回答你';
    if(err.status === 400 && err.message) return err.message;
    if(err.status === 503 || err.status === 504) return err.message || '暫時無法連線，請稍後再試';
  }
  return '暫時無法連線，請稍後再試';
}

function sendChatMessage(text){
  text = (text||'').trim();
  if(!text) return;
  if(askPending){ showToast('BIBO 還在想上一題'); return; }
  if(text.length > 500){ showToast('問題太長了，請縮短到 500 字以內'); return; }
  STORE.chat.push({role:'user', text:escHtml(text), time: nowTimeStr()});
  persist();
  askPending = { role:'bot', kind:'text', text:'BIBO 想一下…', time: nowTimeStr() };
  renderAsk();
  var body = { question: text };
  var hint = askDayHint();
  if(hint) body.dayHint = hint;
  Sync.callFunction('ask-bibo', body).then(function(res){
    askPending = null;
    var answer = res && res.data && typeof res.data.answer === 'string' ? res.data.answer.trim() : '';
    if(answer){ STORE.chat.push({role:'bot', kind:'text', text:plainToHtml(answer), time: nowTimeStr()}); }
    else { STORE.chat.push({role:'bot', kind:'text', text:escHtml(askErrorText(res && res.error)), time: nowTimeStr()}); }
    persist();
    renderAsk();
  });
}

function renderAsk(){
  seedChatIfNeeded();
  var quickHTML = DATA.askQuick.map(function(q){
    return '<button class="ask-quick-chip shrink-0 px-3.5 py-2 rounded-full bg-surface-container-lowest hover:bg-primary-fixed shadow-sm text-on-surface font-body-sm text-body-sm transition-all text-left flex items-center gap-1.5 active:scale-95" data-question="'+q.q.replace(/"/g,'&quot;')+'" type="button"><span class="material-symbols-outlined text-[16px] '+q.iconColor+'">'+q.icon+'</span><span>'+q.q+'</span></button>';
  }).join('');
  var messagesHTML = STORE.chat.map(chatBubbleHTML).join('') + (askPending ? chatBubbleHTML(askPending) : '');
  var html = ''
    +'<div class="relative bg-surface-container-lowest rounded-xl p-space-md shadow-sm overflow-hidden flex items-center justify-between">'
    +'<div class="flex items-center gap-space-sm z-10 min-w-0 pr-2"><div class="w-14 h-14 rounded-full bg-primary-fixed flex items-center justify-center shrink-0 overflow-hidden shadow-sm"><img alt="BIBO" class="w-full h-full object-cover" src="assets/stitch/hero-bibo.png"></div>'
    +'<div class="flex flex-col min-w-0"><div class="flex items-center gap-1.5"><span class="font-headline-md text-headline-md text-primary tracking-tight">BIBO 隨身導遊</span><span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm">AI 在線</span></div><p class="font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5">票價、班次、開放時間請以官方為準</p></div></div>'
    +'<div class="hidden sm:flex items-center justify-center w-12 h-12 rounded-full bg-surface-container-high text-primary shrink-0"><span class="material-symbols-outlined text-[24px]">forum</span></div>'
    +'</div>'
    +'<div class="flex flex-col gap-1.5">'
    +'<div class="flex items-center gap-1 text-on-surface-variant px-1"><span class="material-symbols-outlined text-[16px] text-primary-container">lightbulb</span><span class="font-label-sm text-label-sm">大家都在問：</span></div>'
    +'<div class="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">'+quickHTML+'</div>'
    +'</div>'
    +'<div class="flex flex-col gap-space-md pt-2 flex-1" id="chat-messages">'+messagesHTML+'</div>'
    +'<div class="sticky bottom-0 pt-2 pb-1 bg-surface/95 backdrop-blur-md">'
    +'<div class="bg-surface-container-lowest rounded-full p-1.5 pl-4 shadow-md flex items-center gap-2">'
    +'<button aria-label="語音發問" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors shrink-0" type="button" id="ask-mic-btn"><span class="material-symbols-outlined text-[20px]">mic</span></button>'
    +'<input autocomplete="off" class="w-full bg-transparent border-0 outline-none font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60" id="chat-input" placeholder="問 BIBO 任何問題..." type="text">'
    +'<button aria-label="發送" class="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0 shadow-sm active:scale-90 transition-transform" id="chat-send-btn" type="button"><span class="material-symbols-outlined text-[20px]">pets</span></button>'
    +'</div></div>';
  document.getElementById('ask-root').innerHTML = html;
  bindAskEvents();
  var msgs = document.getElementById('chat-messages');
  if(msgs) msgs.scrollTop = msgs.scrollHeight;
}

function bindAskEvents(){
  var input = document.getElementById('chat-input');
  var sendBtn = document.getElementById('chat-send-btn');
  if(sendBtn) sendBtn.addEventListener('click', function(){ sendChatMessage(input.value); input.value=''; });
  if(input) input.addEventListener('keypress', function(e){ if(e.key==='Enter'){ sendChatMessage(input.value); input.value=''; } });
  document.querySelectorAll('.ask-quick-chip').forEach(function(chip){
    chip.addEventListener('click', function(){ sendChatMessage(chip.getAttribute('data-question')); });
  });
  var micBtn = document.getElementById('ask-mic-btn');
  if(micBtn) micBtn.addEventListener('click', function(){ showToast('語音輸入等正式版'); });
}

/* ---------------- ROUTER ---------------- */

var VIEWS = ['today','plan','spots','spot','split','lists','tickets','ask'];
var PAGE_NAMES = { today:'Today', plan:'Itinerary', spots:'Spots', split:'Split Expense', lists:'Checklist', tickets:'Tickets', ask:'Ask BIBO' };
var NAV_PATH_MAP = { today:'today', plan:'plan', spots:'spots', split:'split', spot:'spots', lists:'today', tickets:'today', ask:'today' };

var NAV_ACTIVE = "nav-link flex flex-col items-center justify-center gap-space-xs min-w-[56px] min-h-[44px] px-space-sm py-1 rounded-full transition-all bg-primary-container text-on-primary-container font-bold shadow-[2px_2px_0px_#1b1b1c]";
var NAV_INACTIVE = "nav-link flex flex-col items-center justify-center gap-space-xs min-w-[56px] min-h-[44px] px-space-sm py-1 rounded-full transition-all text-on-surface-variant";

function updateNavActive(view){
  var path = NAV_PATH_MAP[view] || 'today';
  document.querySelectorAll('#bottom-nav .nav-link').forEach(function(a){
    a.className = (a.getAttribute('data-path') === path && view !== 'spot') ? NAV_ACTIVE : NAV_INACTIVE;
  });
}

function route(){
  closeDrawer();
  pendingDeleteExpenseId = null;
  var hash = (location.hash || '#today').replace('#','');
  var parts = hash.split('/');
  var view = parts[0] || 'today';
  if(VIEWS.indexOf(view) === -1) view = 'today';

  document.querySelectorAll('main [data-view]').forEach(function(sec){
    sec.hidden = (sec.getAttribute('data-view') !== view);
  });

  var isSpot = view === 'spot';
  document.getElementById('main-header').hidden = isSpot;
  document.getElementById('spot-header').hidden = !isSpot;
  document.getElementById('bottom-nav').hidden = isSpot;

  if(view === 'today'){ document.getElementById('header-pagename').textContent = PAGE_NAMES.today; renderTodayPage(); }
  else if(view === 'plan'){ document.getElementById('header-pagename').textContent = PAGE_NAMES.plan; renderDay(); }
  else if(view === 'spots'){ document.getElementById('header-pagename').textContent = PAGE_NAMES.spots; renderSpots(); }
  else if(view === 'split'){ document.getElementById('header-pagename').textContent = PAGE_NAMES.split; renderSplit(); }
  else if(view === 'lists'){ document.getElementById('header-pagename').textContent = PAGE_NAMES.lists; renderLists(); }
  else if(view === 'tickets'){ document.getElementById('header-pagename').textContent = PAGE_NAMES.tickets; renderTickets(); }
  else if(view === 'ask'){ document.getElementById('header-pagename').textContent = PAGE_NAMES.ask; renderAsk(); }
  else if(view === 'spot'){ renderSpotDetail(parts[1]); }

  updateNavActive(view);
  window.scrollTo(0,0);
}

/* 遠端資料套用後重畫目前畫面（不能呼叫 route()，它會關掉正在編輯的視窗） */
function refreshCurrentView(){
  try{
    var parts = (location.hash || '#today').replace('#','').split('/');
    var view = parts[0] || 'today';
    if(view === 'today') renderTodayPage();
    else if(view === 'plan') renderDay();
    else if(view === 'spots') renderSpots();
    else if(view === 'split') renderSplit();
    else if(view === 'lists') renderLists();
    else if(view === 'tickets') renderTickets();
    else if(view === 'spot' && parts[1] && findSpotById(parts[1])) renderSpotDetail(parts[1]);
  }catch(e){ if(window.console) console.warn('refresh failed', e); }
}

window.addEventListener('hashchange', route);
document.addEventListener('DOMContentLoaded', route);

/* ---------------- SYNC (Supabase) ---------------- */
Sync = createSync({
  store: STORE, DATA: DATA, storage: window.localStorage,
  getClient: makeClient,
  isOnline: function(){ return navigator.onLine !== false && !window.__biboOffline; },
  ui: {
    toast: showToast,
    refresh: refreshCurrentView,
    persistRaw: persistRaw,
    sortTickets: sortTicketsByDate,
    joined: function(){ refreshFx(); },
    needJoin: function(){ SyncUI.showJoin(); }
  },
  seed: {
    get version(){ return SEED_VERSION; },
    currentIds: currentSeedIds,
    run: function(){ syncSeedAllowed = true; try{ seedSync(false); }finally{ syncSeedAllowed = false; } }
  },
  env: {
    on: function(ev, fn){
      if(ev === 'online') window.addEventListener('online', fn);
      else if(ev === 'offline') window.addEventListener('offline', fn);
      else if(ev === 'visible') document.addEventListener('visibilitychange', function(){ if(!document.hidden) fn(); });
    },
    setInterval: function(fn, ms){ return window.setInterval(fn, ms); },
    isHidden: function(){ return document.hidden; }
  }
});
SyncUI = createSyncUI({
  openDrawer: openDrawer, closeDrawer: closeDrawer, lockDrawer: lockDrawer,
  showToast: showToast, twoKeyConfirm: twoKeyConfirm, sync: Sync
});
window.__biboSync = Sync;
window.__biboFx = { refresh: refreshFx, todayKey: fxTodayKey };
fxLoadCache();
function bootSync(){ Sync.start({ hadStore: HAD_STORE }); refreshFx(); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSync);
else bootSync();

})();
