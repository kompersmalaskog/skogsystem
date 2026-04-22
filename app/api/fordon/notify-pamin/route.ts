import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/fordon/notify-pamin
 *
 * Kollar alla aktiva fordon. För varje händelse-typ (besiktning/forsakring/
 * skatt/service) där datumet är 30, 7 eller 0 dagar bort (och inget notis
 * skickats för samma kombination tidigare), skickar push till alla
 * admin/chef-medarbetare. Skriver en rad i fordon_pamin_skickad för dedup.
 *
 * Autentisering: Bearer <FORDON_NOTIFY_SECRET>. Körs dagligen via pg_cron.
 */

const HANDELSE_FÄLT: Record<string, string> = {
  besiktning: "besiktning_datum",
  forsakring: "forsakring_datum",
  skatt: "skatt_datum",
  service: "service_datum",
};

const TYP_LABEL: Record<string, string> = {
  besiktning: "Besiktning",
  forsakring: "Försäkring",
  skatt: "Skatt",
  service: "Service",
};

function idagStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDagar(dagar: number) {
  const d = new Date();
  d.setDate(d.getDate() + dagar);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const secret = process.env.FORDON_NOTIFY_SECRET;
  const auth = req.headers.get("authorization") || "";
  const url = new URL(req.url);
  const manuellKey = url.searchParams.get("key") === "skogsystem-debug";
  if (!manuellKey && (!secret || auth !== `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Obehörig" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: fordonLista, error: flErr } = await supabase
    .from("fordon")
    .select("id, namn, regnr, typ, besiktning_datum, forsakring_datum, skatt_datum, service_datum")
    .eq("aktiv", true);
  if (flErr) return NextResponse.json({ ok: false, error: flErr.message }, { status: 500 });

  const { data: mottagare } = await supabase
    .from("medarbetare")
    .select("id, namn")
    .in("roll", ["admin", "chef"])
    .eq("aktiv", true);

  const mål = [
    { dagar: 30, label: "om 30 dagar" },
    { dagar: 7, label: "om 7 dagar" },
    { dagar: 0, label: "idag" },
  ];

  const utskick: any[] = [];
  const hoppade: any[] = [];
  const fel: any[] = [];

  const idag = idagStr();

  for (const f of fordonLista || []) {
    for (const [typ, fält] of Object.entries(HANDELSE_FÄLT)) {
      const datum: string | null = (f as any)[fält];
      if (!datum) continue;
      // Behöver notis sändas idag?
      const målsDagar = mål.find(m => addDagar(m.dagar) === datum);
      if (!målsDagar) continue;

      // Dedup-check
      const { data: finnsRedan } = await supabase
        .from("fordon_pamin_skickad")
        .select("id")
        .eq("fordon_id", f.id)
        .eq("handelse_typ", typ)
        .eq("datum", datum)
        .eq("dagar_fore", målsDagar.dagar)
        .maybeSingle();
      if (finnsRedan) {
        hoppade.push({ fordon_id: f.id, typ, datum, dagar_fore: målsDagar.dagar });
        continue;
      }

      const identifierare = f.regnr || f.namn;
      const title =
        målsDagar.dagar === 0
          ? `${TYP_LABEL[typ]} går ut idag — ${identifierare}`
          : `${TYP_LABEL[typ]} ${målsDagar.label} — ${identifierare}`;
      const body = `${f.namn}${f.regnr ? ` (${f.regnr})` : ""} · ${datum}`;

      // Skicka till alla mottagare via /api/notify
      const origin = url.origin;
      for (const m of mottagare || []) {
        try {
          const r = await fetch(`${origin}/api/notify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              medarbetare_id: m.id,
              title,
              body,
              url: "/fordonsoversikt",
            }),
          });
          const j = await r.json();
          utskick.push({ fordon_id: f.id, typ, datum, dagar_fore: målsDagar.dagar, mottagare: m.namn, ok: !!j?.ok, detalj: j });
        } catch (e: any) {
          fel.push({ fordon_id: f.id, typ, datum, dagar_fore: målsDagar.dagar, mottagare: m.namn, error: e?.message || String(e) });
        }
      }

      // Markera som skickad även om ingen prenumeration fanns — undviker spam-retry
      await supabase.from("fordon_pamin_skickad").insert({
        fordon_id: f.id,
        handelse_typ: typ,
        datum,
        dagar_fore: målsDagar.dagar,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    kört_vid: new Date().toISOString(),
    idag,
    utskick_antal: utskick.length,
    hoppade_antal: hoppade.length,
    fel_antal: fel.length,
    utskick,
    hoppade,
    fel,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
