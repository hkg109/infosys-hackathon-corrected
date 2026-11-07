import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 조회 전용 클라이언트(공개 키 + RLS). 실행 시점에 만들어서
 * 키가 없는 PC에서도 타입검사·빌드가 실패하지 않게 한다.
 */
export function getReadClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
