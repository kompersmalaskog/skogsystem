import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { arDagAvslutad } from "@/lib/arbetsdagStall";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { skaFragaBrandrisk } from "@/lib/ob";

/**
 * Medarbetarens notis-växlar — sätts i appen (Inställningar) men lästes ALDRIG
 * server-side före 2026-09: en förare som stängt av fick pushar ändå. Alla stod
 * på true, därför märkte ingen. Nu avgör de här, per notis:
 *   push_aktiv=false        → inga pushar alls
 *   daglig_pamin_aktiv=false → ingen dagsslut-påminnelse (andra typer går)
 * Returnerar orsak (→ fel_meddelande, som bekräftad-fallet) eller null = skicka.
 */
export function skippOrsak(
  med: { push_aktiv?: boolean | null; daglig_pamin_aktiv?: boolean | null } | null | undefined,
  typ: string,
): string | null {
  if (med && med.push_aktiv === false) return "Ej skickad — push avstängd i medarbetarens inställningar";
  if (typ === "dagsslut" && med && med.daglig_pamin_aktiv === false) return "Ej skickad — daglig påminnelse avstängd i medarbetarens inställningar";
  return null;
}

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

// Vercel cron skickar Authorization: Bearer $CRON_SECRET automatiskt. Manuell
// körning kräver admin/chef-session. (Var helt öppen — vem som helst kunde tömma kön.)
async function tillaten(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return null;
  const vakt = await kravRoll(ADMIN_ROLLER);
  return vakt.ok ? null : vakt.res;
}
export async function GET(req: NextRequest) { return (await tillaten(req)) ?? flush(); }
export async function POST(req: NextRequest) { return (await tillaten(req)) ?? flush(); }

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
  let uppskjutna = 0;

  // Växlarna läses EN gång per körning för alla mottagare i kön.
  const mottagarIds = Array.from(new Set((pendingRader || []).map((n: any) => n.mottagare_id).filter(Boolean)));
  const medRes = mottagarIds.length
    ? await supabase.from("medarbetare").select("id, push_aktiv, daglig_pamin_aktiv").in("id", mottagarIds)
    : { data: [] as any[] };
  const medMap = new Map<string, any>(((medRes.data as any[]) || []).map(m => [m.id, m]));

  for (const n of (pendingRader || [])) {
    try {
      // Medarbetarens växlar (push_aktiv / daglig_pamin_aktiv) — se skippOrsak.
      const orsak = skippOrsak(medMap.get(n.mottagare_id), n.typ);
      if (orsak) {
        await supabase.from("notis_kö").update({ skickad_at: new Date().toISOString(), fel_meddelande: orsak }).eq("id", n.id);
        skippade++;
        continue;
      }
      // Dagsslut: har föraren redan bekräftat dagen när flush kör finns
      // inget att påminna om — markera som hanterad utan utskick.
      if (n.typ === "dagsslut" && n.datum) {
        const { data: dag } = await supabase
          .from("arbetsdag")
          .select("bekraftad, slut_tid")
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
        // Stall-vakt: timvisa MOM-filer sätter slut_tid redan på morgonen —
        // skicka inte "dagen är slut" mitt i pågående dag. Raden lämnas
        // OSKICKAD (ingen markering): cronen var 5:e minut försöker igen
        // och skickar av sig själv ~STALL_MIN efter dagens sista fil.
        // Gårdagar är per definition avslutade och går direkt.
        if (dag?.slut_tid && !arDagAvslutad(n.datum, dag.slut_tid)) {
          uppskjutna++;
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
    uppskjutna,
    fel,
  });
}

const MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

export async function byggMeddelande(n: any): Promise<{ title: string; body: string; url: string; tag?: string }> {
  if (n.typ === "dagsslut" && n.datum) {
    // FÄRSK dagstotal vid utskick: maskintid + extra tid (samma formel som
    // #188) — inte det som stod när notisen köades. Kumulativa MOM-filer
    // kan ha uppdaterat dagen mellan köandet (t.ex. lunch) och 17-utskicket.
    const [dagRes, extraRes] = await Promise.all([
      supabase.from("arbetsdag")
        .select("arbetad_min, start_tid, brandrisk_beordrad")
        .eq("medarbetare_id", n.mottagare_id).eq("datum", n.datum).maybeSingle(),
      supabase.from("extra_tid")
        .select("minuter")
        .eq("medarbetare_id", n.mottagare_id).eq("datum", n.datum),
    ]);
    const dag: any = dagRes.data || {};
    const maskinMin = dag.arbetad_min || 0;
    const extraMin = (extraRes.data || []).reduce((a: number, e: any) => a + (e.minuter || 0), 0);
    const tot = maskinMin + extraMin;
    const h = Math.floor(tot / 60);
    const m = tot % 60;
    // Låsskärmstext: kort. "brandrisk?" — ett ord — när dagen startade före 05:30
    // och svaret saknas (samma regel som frågan vid bekräftelsen, lib/ob).
    const fraga = skaFragaBrandrisk({ datum: n.datum, start_tid: dag.start_tid ?? null, brandrisk_beordrad: dag.brandrisk_beordrad ?? null });
    return {
      title: "Din arbetsdag",
      body: `${h}h ${m}min${fraga ? " · brandrisk?" : ""} · Stämmer?`,
      url: "/arbetsrapport",
      tag: `dagsslut-${n.mottagare_id}-${n.datum}`,
    };
  }

  if (n.typ === "manadsskifte") {
    // Köas av /api/notis/manadsskifte (den 1:a) ur samma beräkning som
    // löneunderlaget. payload: { period: "YYYY-MM", obekraftade, obesvarade, oforklarade }.
    const p = n.payload || {};
    const [å, mm] = String(p.period || "").split("-").map(Number);
    const manad = mm ? MANADER[mm - 1] : "månaden";
    const delar: string[] = [];
    if (p.obekraftade > 0) delar.push(`${p.obekraftade} obekräftad${p.obekraftade === 1 ? "" : "e"} dag${p.obekraftade === 1 ? "" : "ar"}`);
    if (p.obesvarade > 0) delar.push(`${p.obesvarade} brandriskfråg${p.obesvarade === 1 ? "a" : "or"}`);
    if (p.oforklarade > 0) delar.push(`${p.oforklarade} tidsavvikelse${p.oforklarade === 1 ? "" : "r"}`);
    return {
      title: `${manad.charAt(0).toUpperCase()}${manad.slice(1)}${å ? ` ${å}` : ""}: fixa innan lönen`,
      body: delar.join(" · ") || "Något saknas i din månad",
      url: "/arbetsrapport",
      tag: `manadsskifte-${n.mottagare_id}-${p.period || ""}`,
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
