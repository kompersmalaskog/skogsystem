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
  let skippade = 0;

  for (const n of (pendingRader || [])) {
    try {
      // Dagsslut: har föraren redan bekräftat dagen när flush kör finns
      // inget att påminna om — markera som hanterad utan utskick.
      if (n.typ === "dagsslut" && n.datum) {
        const { data: dag } = await supabase
          .from("arbetsdag")
          .select("bekraftad")
          .eq("medarbetare_id", n.mottagare_id)
          .eq("datum", n.datum)
          .maybeSingle();
        if (dag?.bekraftad) {
          await supabase.from("notis_kö").update({
            skickad_at: new Date().toISOString(),
            fel_meddelande: "Ej skickad — dagen var redan bekräftad",
          }).eq("id", n.id);
          skippade++;
          continue;
        }
      }

      // Prenumerationer ur push_subscriptions-TABELLEN (alla enheter) — inte
      // den döda kolumnen medarbetare.push_subscription som aldrig fylls.
      // Samma 410/404-städning som /api/notify.
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("id, subscription")
        .eq("medarbetare_id", n.mottagare_id);

      if (!subs || subs.length === 0) {
        await supabase.from("notis_kö").update({
          skickad_at: new Date().toISOString(),
          fel_meddelande: "Mottagaren har inga push-prenumerationer",
        }).eq("id", n.id);
        fel++;
        continue;
      }

      // Bygg titel/body baserat på typ — FÄRSKT vid utskick
      const meddelande = await byggMeddelande(n);

      let sänt = 0;
      const döda: string[] = [];
      for (const s of subs) {
        try {
          await webpush.sendNotification(s.subscription as any, JSON.stringify(meddelande));
          sänt++;
        } catch (e: any) {
          if (e.statusCode === 410 || e.statusCode === 404) döda.push(s.id);
        }
      }
      if (döda.length > 0) {
        await supabase.from("push_subscriptions").delete().in("id", döda);
      }

      await supabase.from("notis_kö").update({
        skickad_at: new Date().toISOString(),
        fel_meddelande: sänt === 0 ? "Ingen enhet nådde fram (alla prenumerationer döda?)" : null,
      }).eq("id", n.id);
      if (sänt > 0) skickade++; else fel++;
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
    skippade,
    fel,
  });
}

async function byggMeddelande(n: any): Promise<{ title: string; body: string; url: string; tag?: string }> {
  if (n.typ === "dagsslut" && n.datum) {
    // FÄRSK dagstotal vid utskick: maskintid + extra tid (samma formel som
    // #188) — inte det som stod när notisen köades. Kumulativa MOM-filer
    // kan ha uppdaterat dagen mellan köandet (t.ex. lunch) och 17-utskicket.
    const [dagRes, extraRes] = await Promise.all([
      supabase.from("arbetsdag")
        .select("arbetad_min, km_morgon, km_kvall, km_totalt")
        .eq("medarbetare_id", n.mottagare_id).eq("datum", n.datum).maybeSingle(),
      supabase.from("extra_tid")
        .select("minuter")
        .eq("medarbetare_id", n.mottagare_id).eq("datum", n.datum),
    ]);
    const maskinMin = (dagRes.data as any)?.arbetad_min || 0;
    const extraMin = (extraRes.data || []).reduce((a: number, e: any) => a + (e.minuter || 0), 0);
    const tot = maskinMin + extraMin;
    const h = Math.floor(tot / 60);
    const m = tot % 60;
    const km = ((dagRes.data as any)?.km_morgon || 0) + ((dagRes.data as any)?.km_kvall || 0) + ((dagRes.data as any)?.km_totalt || 0);
    return {
      title: "Din arbetsdag",
      body: `${h}h ${m}min${km > 0 ? ` · ${km}km` : ""} — Stämmer?`,
      url: "/arbetsrapport",
      tag: `dagsslut-${n.mottagare_id}-${n.datum}`,
    };
  }

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
