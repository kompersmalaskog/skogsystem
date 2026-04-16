import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

/**
 * Processar notis_kö — hämtar alla rader där skickas_at <= now() och
 * skickad_at IS NULL, bygger titel/body baserat på typ, skickar via
 * webpush till mottagarens push_subscription, markerar som skickade.
 *
 * Kan triggas av en cron (Vercel cron, Supabase pg_cron, eller extern).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

webpush.setVapidDetails(
  "mailto:info@kompersmalskog.se",
  "BGe21_FkdZWkOiaLTWE2GXADsaA08uC2eRGglHIyJ85rL35YkrkUY1L3jTJ7fGvAQlDRjJsH3AMMeX62B63hr34",
  process.env.VAPID_PRIVATE_KEY || "DUop3YJnWfPGbNF2KGz8elhEpkVRoivHzM3Xt-Y5_fA"
);

export async function GET() { return flush(); }
export async function POST() { return flush(); }

async function flush() {
  const nu = new Date().toISOString();
  const { data: pendingRader, error } = await supabase
    .from("notis_kö")
    .select("*")
    .lte("skickas_at", nu)
    .is("skickad_at", null)
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let skickade = 0;
  let fel = 0;

  for (const n of (pendingRader || [])) {
    try {
      // Hämta mottagarens push subscription
      const { data: mott } = await supabase
        .from("medarbetare")
        .select("namn, push_subscription")
        .eq("id", n.mottagare_id)
        .maybeSingle();

      if (!mott?.push_subscription) {
        await supabase.from("notis_kö").update({
          skickad_at: new Date().toISOString(),
          fel_meddelande: "Mottagaren har ingen push-prenumeration",
        }).eq("id", n.id);
        fel++;
        continue;
      }

      // Bygg titel/body baserat på typ
      const meddelande = await byggMeddelande(n);

      await webpush.sendNotification(
        mott.push_subscription as any,
        JSON.stringify(meddelande)
      );

      await supabase.from("notis_kö").update({
        skickad_at: new Date().toISOString(),
      }).eq("id", n.id);
      skickade++;
    } catch (e: any) {
      fel++;
      await supabase.from("notis_kö").update({
        skickad_at: new Date().toISOString(),
        fel_meddelande: (e?.message || String(e)).slice(0, 500),
      }).eq("id", n.id);
    }
  }

  return NextResponse.json({
    totalt: pendingRader?.length || 0,
    skickade,
    fel,
  });
}

async function byggMeddelande(n: any): Promise<{ title: string; body: string; url: string; tag?: string }> {
  if (n.typ === "atk_återställd") {
    const p = n.payload || {};
    const [medRes, andrareRes] = await Promise.all([
      supabase.from("medarbetare").select("namn").eq("id", p.medarbetare_id).maybeSingle(),
      p.andrare_id
        ? supabase.from("medarbetare").select("namn").eq("id", p.andrare_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const medNamn = (medRes.data as any)?.namn || "okänd medarbetare";
    const andrareNamn = (andrareRes.data as any)?.namn || "okänd";
    const datumStr = new Date(n.skapad_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
    const url = `/admin?flik=lon&underflik=atk&period=${encodeURIComponent(p.period || "")}&medarbetare=${encodeURIComponent(p.medarbetare_id || "")}`;
    return {
      title: `ATK-val återställt – ${medNamn}`,
      body: `${p.period} ändrades${p.andrare_id ? ` av ${andrareNamn}` : ""} (${datumStr}). Det godkända valet behöver granskas igen.`,
      url,
      tag: `atk-${p.medarbetare_id}-${p.period}`,
    };
  }

  // Generisk fallback
  return {
    title: "Notis",
    body: JSON.stringify(n.payload || {}).slice(0, 200),
    url: "/admin",
  };
}
