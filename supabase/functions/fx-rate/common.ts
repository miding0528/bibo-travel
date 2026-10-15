// Shared helpers for BIBO Travel edge functions.
// This file is duplicated in supabase/functions/<name>/common.ts for each function (keep them identical).
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://miding0528.github.io",
  "http://localhost:8794",
  "http://127.0.0.1:8794",
  "http://localhost:5173",
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Returns { uid, tripId } for a caller who belongs to at least one trip, or { res } with the error response.
export async function requireMember(req: Request, admin: ReturnType<typeof adminClient>) {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return { res: json(req, 401, { error: "unauthorized", message: "請先加入行程" }) };
  const u = await admin.auth.getUser(jwt);
  const uid = u.data?.user?.id;
  if (u.error || !uid) return { res: json(req, 401, { error: "unauthorized", message: "登入已失效，請重新開啟 App" }) };
  const m = await admin.from("members").select("trip_id").eq("user_id", uid).limit(1);
  if (m.error) return { res: json(req, 500, { error: "db_error", message: "暫時無法確認身分，請稍後再試" }) };
  if (!m.data || m.data.length === 0) return { res: json(req, 403, { error: "not_member", message: "請先加入行程才能使用" }) };
  return { uid, tripId: m.data[0].trip_id as string };
}
