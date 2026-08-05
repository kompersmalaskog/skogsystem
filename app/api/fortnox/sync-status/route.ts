import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverSupabase } from "@/lib/lonesystem/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fortnox/sync-status
 *
 * När synkade voucher- och fakturasynken senast? Läser fortnox_sync_state
 * via service-role — RLS släpper inte igenom klienten, och en synk-status
 * som tyst blir tom är exakt det larmet ska avslöja. Admin/chef-gated som
 * övriga fortnox-rutter.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
        },
      },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ ok: false, meddelande: "Ej inloggad" }, { status: 401 });
    }
    const { data: med } = await authClient
      .from("medarbetare")
      .select("roll")
      .eq("epost", user.email)
      .single();
    if (!med || (med.roll !== "admin" && med.roll !== "chef")) {
      return NextResponse.json({ ok: false, meddelande: "Kräver admin-roll" }, { status: 403 });
    }

    const { data, error } = await serverSupabase()
      .from("fortnox_sync_state")
      .select("last_sync_at, last_success_at, last_status, last_error, invoice_last_sync_at, invoice_last_status, invoice_last_error")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ ok: false, meddelande: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, meddelande: "fortnox_sync_state saknar rad 1" }, { status: 500 });
    }
    // Timeout-ärlighet: dödas synken av maxDuration hinner den aldrig skriva
    // "fel" — last_status fastnar på "pågår". En "pågår" äldre än 15 min ÄR
    // en avbruten körning och rapporteras så (härlett i läsvägen, eftersom
    // skrivvägen per definition inte finns kvar när Vercel dödat funktionen).
    const AVBRUTEN_EFTER_MS = 15 * 60 * 1000;
    let lastStatus = data.last_status;
    if (lastStatus === "pågår" && data.last_sync_at
        && Date.now() - new Date(data.last_sync_at).getTime() > AVBRUTEN_EFTER_MS) {
      lastStatus = "avbruten";
    }
    return NextResponse.json({ ok: true, ...data, last_status: lastStatus });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e?.message || String(e) }, { status: 500 });
  }
}
