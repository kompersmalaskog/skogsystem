import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { målMedarbetareId } from "@/lib/auth/server";
import { arMaskinId } from "@/lib/besok/hyttserver";

/**
 * POST /api/push/subscribe
 * Body: { medarbetare_id?: string, subscription: PushSubscriptionJSON, device_name?: string }
 * Ägaren är den inloggade (sessionen) — bodyns medarbetare_id får inte avvika
 * (var öppen: en enhet kunde registreras som vilken medarbetare som helst).
 *
 * Upsert på endpoint — samma enhet kan re-registreras utan dubbletter, och
 * byter ägare om en annan medarbetare loggar in på samma enhet.
 */
export async function POST(req: NextRequest) {
  try {
    const kropp = await req.json();
    const { medarbetare_id: begart, subscription, device_name, maskin_id: begartMaskin } = kropp;
    const mål = await målMedarbetareId(begart);
    if (!mål.ok) return mål.res;
    const medarbetare_id = mål.id;

    if (!subscription?.endpoint) {
      return NextResponse.json(
        { ok: false, error: "subscription.endpoint krävs" },
        { status: 400 },
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          medarbetare_id,
          endpoint: subscription.endpoint,
          subscription,
          device_name: device_name || null,
          last_used: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Närvaro: när appen öppnades på enheten — väljer vem som får "Vilken maskin?" (lib/lastbil/lass/notis.ts). En SEPARAT
    // skrivning och best effort: saknas kolumnen (migrationen ej körd) eller faller den får registreringen aldrig ett fel.
    try {
      await supabase.from("push_subscriptions").update({ senast_oppnad: new Date().toISOString() }).eq("endpoint", subscription.endpoint);
    } catch { /* närvaron är en bonus, aldrig ett villkor */ }

    // Maskindator: prenumerationen hör till MASKINEN (hyttnotiser, lib/hytt/maskinPush) och inte till den som råkar vara inloggad. En enhet som inte längre är maskin
    // (maskin_id saknas) nollas, så förarens telefon aldrig får hyttnotiserna. Kolumnen kommer med migrationen 20261026090000 – saknas den får registreringen aldrig ett fel.
    // maskin_id måste vara en riktig maskin i registret: ett påhittat id gör inget, men en prenumeration ska inte kunna utge sig för en maskin som inte finns.
    // Bara när klienten uttryckligen skickar fältet (en äldre appversion som inte gör det rör inte kopplingen).
    if (kropp && typeof kropp === "object" && "maskin_id" in kropp) try {
      let maskinId: string | null = null;
      if (arMaskinId(begartMaskin)) {
        const d = await supabase.from("dim_maskin").select("maskin_id").eq("maskin_id", begartMaskin).maybeSingle();
        if (d.data) maskinId = begartMaskin;
      }
      await supabase.from("push_subscriptions").update({ maskin_id: maskinId }).eq("endpoint", subscription.endpoint);
    } catch { /* maskinkopplingen är en bonus tills migrationen är körd */ }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message || String(e) },
      { status: 500 },
    );
  }
}
