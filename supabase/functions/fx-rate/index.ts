import { adminClient, corsHeaders, json, requireMember } from "./common.ts";

const BOT_URL = "https://rate.bot.com.tw/xrt/flcsv/0/day";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function taipeiDate(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const v = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
}

// Bank of Taiwan CSV header: 幣別, 匯率(買入), 現金, 即期, 遠期 x7, 匯率(賣出), 現金, 即期, 遠期 x7 ...
async function fromBot(): Promise<{ rate: number; source: string }> {
  const r = await fetch(BOT_URL, { headers: { "User-Agent": UA, "Accept": "text/csv,text/plain,*/*", "Accept-Language": "zh-TW,zh;q=0.9" } });
  if (!r.ok) throw new Error("bot_http_" + r.status);
  const buf = new Uint8Array(await r.arrayBuffer());
  let text = new TextDecoder("utf-8").decode(buf);
  if (/^\s*</.test(text)) throw new Error("bot_blocked");
  if (text.includes("�")) {
    try { text = new TextDecoder("big5").decode(buf); } catch { /* keep utf-8 */ }
  }
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsvLine(lines[0] || "");
  const spotIdx: number[] = [];
  const cashIdx: number[] = [];
  header.forEach((h, i) => {
    if (h === "即期") spotIdx.push(i);
    if (h === "現金") cashIdx.push(i);
  });
  const sellSpot = spotIdx.length >= 2 ? spotIdx[1] : 13;
  const sellCash = cashIdx.length >= 2 ? cashIdx[1] : 12;
  const row = lines.map(splitCsvLine).find((c) => /^CNY/i.test(c[0]));
  if (!row) throw new Error("bot_no_cny");
  const spot = num(row[sellSpot]);
  if (spot) return { rate: spot, source: "臺灣銀行牌告 即期賣出" };
  const cash = num(row[sellCash]);
  if (cash) return { rate: cash, source: "臺灣銀行牌告 現金賣出" };
  throw new Error("bot_no_rate");
}

// Backup source when the bank site is unreachable or blocks the request (mid-market rate).
async function fromBackup(): Promise<{ rate: number; source: string }> {
  const r = await fetch("https://open.er-api.com/v6/latest/CNY", { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("backup_http_" + r.status);
  const j = await r.json();
  const v = num(String(j?.rates?.TWD ?? ""));
  if (!v) throw new Error("backup_no_rate");
  return { rate: Math.round(v * 10000) / 10000, source: "open.er-api.com 中間價（備援）" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST" && req.method !== "GET") return json(req, 405, { error: "method_not_allowed", message: "不支援這種請求" });

  const admin = adminClient();
  const who = await requireMember(req, admin);
  if ("res" in who) return who.res;

  const today = taipeiDate();
  const ex = await admin.from("fx_rates").select("date,rate,source").eq("date", today).maybeSingle();
  if (ex.data) return json(req, 200, { date: ex.data.date, rate: Number(ex.data.rate), source: ex.data.source });

  let got: { rate: number; source: string } | null = null;
  const errs: string[] = [];
  try { got = await fromBot(); } catch (e) { errs.push(String((e as Error).message)); }
  if (!got) {
    try { got = await fromBackup(); } catch (e) { errs.push(String((e as Error).message)); }
  }
  if (!got || got.rate < 3 || got.rate > 7) {
    console.error("fx-rate failed", errs.join(","));
    return json(req, 502, { error: "fx_unavailable", message: "暫時抓不到今天的匯率，先用預設值" });
  }
  if (errs.length) console.log("fx-rate used backup; bot error:", errs.join(","));
  const up = await admin.from("fx_rates").upsert(
    { date: today, rate: got.rate, source: got.source, fetched_at: new Date().toISOString() },
    { onConflict: "date" },
  );
  if (up.error) console.error("fx-rate upsert failed", up.error.message);
  return json(req, 200, { date: today, rate: got.rate, source: got.source });
});
