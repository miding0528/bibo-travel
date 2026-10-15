import { createSync } from '../../src/sync.js';
import { makeClient, seed } from './fake.mjs';
import assert from 'node:assert/strict';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clone = x => JSON.parse(JSON.stringify(x));
const DATA = { days: seed.days };
export function freshStore() {
  const s = { chat: null, ticketStatus: {}, ticketAlerts: {}, memberNames: { Lena: 'Lena', Key: 'Key' }, feePercent: 1.5, fxRatesOverride: {}, notes: '', customSpots: [], seedVersion: seed.seedVersion, seedIds: { days: [], prep: [], packing: [], tickets: [] }, todaySelectedDay: null, dataVersion: 2 };
  s.days = seed.days.map(d => ({ day: d.day, date: d.date, tag: d.tag, title: d.title, subtitle: d.subtitle, items: clone(d.items) }));
  s.checklist = { prep: clone(seed.checklistPrep).map(x => ({ ...x, done: false })), packing: clone(seed.checklistPacking).map(x => ({ ...x, done: false })) };
  s.tickets = clone(seed.tickets);
  s.expenses = [{ id: 1, date: '12/26', title: '碑林門票', amount: 170, payer: 'Lena', method: '刷卡', split: 'even', sample: true, rateOverride: 4.39 }, { id: 2, date: '12/26', title: '早市早餐', amount: 32, payer: 'Key', method: '微信支付', split: 'even', sample: true, rateOverride: 4.39 }];
  return s;
}
export class Phone {
  constructor(name, db, opts) {
    opts = opts || {};
    this.name = name; this.db = db; this.toasts = []; this.refreshes = 0; this.offline = { v: false };
    this.storage = opts.storage || new Map();
    const st = this.storage;
    this.ls = { getItem: k => st.has(k) ? st.get(k) : null, setItem: (k, v) => st.set(k, String(v)), removeItem: k => st.delete(k) };
    this.store = opts.store || freshStore();
    this.seedVersion = opts.seedVersion || seed.seedVersion;
    this.client = opts.client || makeClient(db, { offlineRef: this.offline });
    this.handlers = {};
    this.seedRuns = 0; this.seedFn = null;
    const self = this;
    this.sync = createSync({
      store: this.store, DATA, storage: this.ls, getClient: () => this.client,
      isOnline: () => !this.offline.v,
      ui: { toast: m => this.toasts.push(m), refresh: () => this.refreshes++, persistRaw: () => this.ls.setItem('bibo-v3-store', JSON.stringify(this.store)), sortTickets() {}, needJoin() { self.needJoin = true; } },
      seed: { get version() { return self.seedVersion; }, currentIds: () => ({ days: [], prep: [], packing: [], tickets: [] }), run() { self.seedRuns++; if (self.seedFn) self.seedFn(self.store); self.store.seedVersion = self.seedVersion; self.persist(); } },
      env: { on: (e, f) => { this.handlers[e] = f; }, setInterval: () => 0, isHidden: () => false },
    });
  }
  persist() { this.ls.setItem('bibo-v3-store', JSON.stringify(this.store)); this.sync.onPersist(); }
  day(n) { return this.store.days.find(d => d.day === n); }
  setOffline(v) { this.offline.v = v; }
  async goOnline() { this.offline.v = false; await this.handlers.online(); await sleep(50); }
}
export function proj(s) {
  return clone({ days: s.days, checklist: s.checklist, tickets: s.tickets, ticketStatus: s.ticketStatus, ticketAlerts: s.ticketAlerts, expenses: s.expenses, customSpots: s.customSpots, notes: s.notes, memberNames: s.memberNames, feePercent: s.feePercent, fxRatesOverride: s.fxRatesOverride });
}
export function same(a, b, label) { try { assert.deepEqual(proj(a.store), proj(b.store)); } catch (e) { console.log('MISMATCH', label); throw e; } }
