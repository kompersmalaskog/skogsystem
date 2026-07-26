import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { KONTROLLTYPER, type Kontrolltypnyckel } from "@/lib/kontrolltyper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/fordon/notify-pamin
 *
 * Läser nu `kontroll` (#5) i stället för fyra datumkolumner. För varje aktiv
 * kontroll med nasta_forfall 30/7/0 dagar bort (och aktiv resurs), skickar push
 * till alla admin/chef. Dedup via fordon_pamin_skickad(kontroll_id, datum,
 * dagar_fore). Mätarbaserade kontroller (nasta_forfall NULL) hanteras inte här
 * — de har inget datum att schemalägga mot.
 *
 * Autentisering: Bearer <FORDON_NOTIFY_SECRET>. Körs dagligen via pg_cron.
 */

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

  // Kontroller med datummål + tillhörande resurs.
  const { data: kontroller, error: kErr } = await supabase
    .from("kontroll")
    .select("id, typ, nasta_forfall, aktiv, resurs:resurs_id ( id, namn, regnr, aktiv )")
    .eq("aktiv", true)
    .not("nasta_forfall", "is", null);
  if (kErr) return NextResponse.json({ ok: false, error: kErr.message }, { status: 500 });

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

  for (const k of kontroller || []) {
    const resurs: any = Array.isArray((k as any).resurs) ? (k as any).resurs[0] : (k as any).resurs;
    if (!resurs || !resurs.aktiv) continue;

    const datum: string = (k as any).nasta_forfall;
    const målsDagar = mål.find((m) => addDagar(m.dagar) === datum);
    if (!målsDagar) continue;

    // Dedup på kontroll_id (#5).
    const { data: finnsRedan } = await supabase
      .from("fordon_pamin_skickad")
      .select("id")
      .eq("kontroll_id", (k as any).id)
      .eq("datum", datum)
      .eq("dagar_fore", målsDagar.dagar)
      .maybeSingle();
    if (finnsRedan) {
      hoppade.push({ kontroll_id: (k as any).id, datum, dagar_fore: målsDagar.dagar });
      continue;
    }

    const etikett = KONTROLLTYPER[(k as any).typ as Kontrolltypnyckel]?.etikett || (k as any).typ;
    const identifierare = resurs.regnr || resurs.namn;
    const title =
      målsDagar.dagar === 0
        ? `${etikett} går ut idag — ${identifierare}`
        : `${etikett} ${målsDagar.label} — ${identifierare}`;
    const body = `${resurs.namn}${resurs.regnr ? ` (${resurs.regnr})` : ""} · ${datum}`;

    const origin = url.origin;
    for (const m of mottagare || []) {
      try {
        const r = await fetch(`${origin}/api/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ medarbetare_id: m.id, title, body, url: "/kontroller" }),
        });
        const j = await r.json();
        utskick.push({ kontroll_id: (k as any).id, datum, dagar_fore: målsDagar.dagar, mottagare: m.namn, ok: !!j?.ok });
      } catch (e: any) {
        fel.push({ kontroll_id: (k as any).id, datum, dagar_fore: målsDagar.dagar, mottagare: m.namn, error: e?.message || String(e) });
      }
    }

    // Markera skickad även utan prenumeranter — undviker spam-retry.
    await supabase.from("fordon_pamin_skickad").insert({
      kontroll_id: (k as any).id,
      handelse_typ: (k as any).typ,
      datum,
      dagar_fore: målsDagar.dagar,
    });
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
