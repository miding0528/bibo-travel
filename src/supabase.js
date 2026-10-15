import { createClient } from '@supabase/supabase-js';

/* Supabase 專案 bibo-travel。這把是 publishable（公開）金鑰，可以放在公開 repo；
   資料靠 RLS 保護，沒有加入行程（members）就讀不到任何東西。 */
export const SUPABASE_URL = 'https://ksaluzkbeejrlmihqksq.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Y2qt8hqdTsuYsehuOqe7sQ_3lyXcNlA';

export function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'bibo-sb-auth',
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}
