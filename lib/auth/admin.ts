// Service-klienten för inbjudningar — ENDAST på servern. Nyckeln (SUPABASE_SERVICE_ROLE_KEY) har ingen NEXT_PUBLIC-
// prefix och får aldrig importeras från en klientfil ('use client', components/, app/**/page.tsx): vakten
// lib/personal/inbjudan.vakter.test.ts läser källan och larmar. Den kringgår RLS, så varje route som använder den
// måste börja med kravRoll(ADMIN_ROLLER) (lib/auth/server.ts).
import { createClient } from "@supabase/supabase-js";

export function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
