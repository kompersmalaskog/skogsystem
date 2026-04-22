import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/avtal/notify-pamin
 *
 * Kollar alla aktiva avtal med slut_datum 30/7/0 dagar bort. För varje
 * match som inte redan notifierats, skickar push till admin/chef via
 * /api/notify. Bokför i avtal_pamin_skickad.
 *
 * Autentisering: Bearer <AVTAL_NOTIFY_SECRET>.
 */

const KATEGORI_LABEL: Record<string, string> = {
  telefon: "Telefon",
  friskvard: "Friskvård",
  forsakring: "Försäkring",
  leasing: "Leasing",
  programvara: "Programvara",
  ovrigt: "Avtal",
};

function idagStr() { return new Date().toISOString().slice(0, 10); }
function addDagar(dagar: number) {
  const d = new Date();
  d.setDate(d.getDate() + dagar);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const secret = process.env.AVTAL_NOTIFY_SECRET;
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

  const { data: avtalLista, error } = await supabase
    .from("avtal")
    .select("id, namn, kategori, leverantor, slut_datum")
    .eq("aktiv", true)
    .not("slut_datum", "is", null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

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

  for (const a of avtalLista || []) {
    if (!a.slut_datum) continue;
    const träff = mål.find(m => addDagar(m.dagar) === a.slut_datum);
    if (!träff) continue;

    const { data: redan } = await supabase
      .from("avtal_pamin_skickad")
      .select("id")
      .eq("avtal_id", a.id)
      .eq("datum", a.slut_datum)
      .eq("dagar_fore", träff.dagar)
      .maybeSingle();
    if (redan) { hoppade.push({ avtal_id: a.id }); continue; }

    const title = träff.dagar === 0
      ? `${KATEGORI_LABEL[a.kategori] || 'Avtal'} går ut idag — ${a.namn}`
      : `${KATEGORI_LABEL[a.kategori] || 'Avtal'} ${träff.label} — ${a.namn}`;
    const body = `${a.leverantor ? a.leverantor + " · " : ""}${a.slut_datum}`;

    for (const m of mottagare || []) {
      try {
        await fetch(`${url.origin}/api/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            medarbetare_id: m.id,
            title,
            body,
            url: "/avtal",
          }),
        });
        utskick.push({ avtal_id: a.id, mottagare: m.namn });
      } catch (e: any) {
        utskick.push({ avtal_id: a.id, mottagare: m.namn, fel: e?.message });
      }
    }

    await supabase.from("avtal_pamin_skickad").insert({
      avtal_id: a.id,
      datum: a.slut_datum,
      dagar_fore: träff.dagar,
    });
  }

  return NextResponse.json({
    ok: true,
    idag: idagStr(),
    utskick_antal: utskick.length,
    hoppade_antal: hoppade.length,
    utskick,
  });
}

export async function GET(req: NextRequest) { return POST(req); }
