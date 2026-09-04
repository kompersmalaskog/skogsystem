import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hamtaDiameterPunkter, TOPPDIA_COLS } from "@/lib/kalibrering/diameterpunkter";
import { statistik, type VariabelStat } from "@/lib/kalibrering/statistik";

/**
 * GET /api/kalibrering/bedomning?key=skogsystem-debug&maskin_id=X
 *
 * Bedömer en maskins mätnoggrannhet mot dess KRAVPROFIL (VIDA/BIOMETRIA)
 * över ett rullande 90-DAGARSFÖNSTER t.o.m. maskinens senaste kontroll.
 *
 * Varför 90 dagar och inte 14: med 14-dagarsfönster når varken PONSSE eller
 * R64428 larm-grinden (150 diametermått / 40 längdmått) → båda blir tysta.
 * R64428 kör ~6,8 mått/dag och behöver ~22 dagar bara för att nå 150. Ett
 * kvartal fångar ihållande problem men glömmer gamla synder när maskinen
 * faktiskt förbättrats (till skillnad från hela-historiken, som aldrig
 * nollställs). Se beslutslogg i PR.
 *
 * KRITISKT — OMÄTT ≠ AVVIKELSE: rader där operatörsvärdet är NULL eller 0
 * exkluderas INNAN något räknas. 193 stammar är aldrig kontrollmätta och 57
 * toppstockar har NULL toppdia; räknas de med blir systematiken nonsens
 * (~+20 cm i stället för ~0). Filtret sitter här, på ett ställe.
 *
 * Beräkningsnivå:
 *   - Diameter: MÄTPUNKTSNIVÅ — både ControlLogDiameter längs stocken OCH
 *     toppdiametern vid kapsnittet. Båda källorna hämtas via
 *     lib/kalibrering/diameterpunkter (där OMÄTT-filtret bor).
 *   - Längd: STOCKNIVÅ (detalj_kontroll_stock, maskin_langd_cm vs operator_langd_cm)
 *
 * Endpointen returnerar RÅA metriker + profilens trösklar. Själva
 * färg-/statusbedömningen (sämsta-styr + larm-grind) görs i klienten
 * (bedomProfil i app/kalibrering/page.tsx) där tonskalan bor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG_KEY = "skogsystem-debug";
const FONSTER_DAGAR = 90;

export type KravRow = {
  variabel: string; // 'diameter' | 'langd'
  metrik: string; // 'traffprocent' | 'systematisk' | 'standardavv' | 'grov_avvikelse'
  riktning: string; // 'hog_bra' | 'lag_bra'
  tolerans: number | null;
  mal: number;
  golv: number;
  enhet: string;
  larm_min_matt: number | null;
};

export type { VariabelStat };

/**
 * "Hjälpte åtgärden?" — de tre diametertalen FÖRE och EFTER maskinens senaste
 * förar-markör (kalibrering_atgard), var för sig.
 *   fore  = 90 dagar före markören (samma fönsterbegrepp som nuläget — ett
 *           begrepp i appen, inte "hela historiken" som döljer att maskinen
 *           kan ha drivit precis före åtgärden)
 *   efter = från markörens datum t.o.m. senaste kontroll
 * Underlagsgrind: < ATGARD_GRIND mått på NÅGON sida → fore/efter = null,
 * forTidigt = true. Talen lämnar inte servern under grinden — ingen falsk
 * förbättring kan råka visas.
 * kalibreringarEfter: datum då diameterkurvan kalibrerats EFTER markören
 * (fakt_kalibrering_historik, typ=diameter). Finns sådana kan förbättringen
 * inte tillskrivas åtgärden — klienten dämpar domen.
 */
export type AtgardEffekt = {
  datum: string;
  text: string;
  fore: VariabelStat | null;
  efter: VariabelStat | null;
  forTidigt: boolean;
  nFore: number;
  nEfter: number;
  kalibreringarEfter: string[];
};

export type BedomningResponse = {
  ok: true;
  maskin_id: string;
  profil: string | null;
  fonster: { fran: string; till: string; dagar: number } | null;
  diameter: VariabelStat | null;
  langd: VariabelStat | null;
  trosklar: KravRow[];
  atgard: AtgardEffekt | null;
};

// PostgREST tar max 1000 rader åt gången — paginera tills tomt.
async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const PAGE = 1000;
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await query(offset, offset + PAGE - 1);
    if (error) return { data: all, error };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return { data: all, error: null };
}

// Före/efter-grind: 30 mått på varje sida om markören. Under det säger vyn
// "för tidigt" — aldrig ett tal som kan läsas som förbättring.
const ATGARD_GRIND = 30;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== DEBUG_KEY) {
    return new NextResponse("Ogiltig nyckel", { status: 401 });
  }
  const maskinId = url.searchParams.get("maskin_id");
  if (!maskinId) {
    return NextResponse.json({ ok: false, error: "maskin_id krävs" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // === 1) Profil för maskinen ===
  const { data: maskinRows, error: maskinErr } = await supabase
    .from("dim_maskin")
    .select("kravprofil")
    .eq("maskin_id", maskinId)
    .limit(1);
  if (maskinErr) {
    return NextResponse.json({ ok: false, error: `dim_maskin: ${maskinErr.message}` }, { status: 500 });
  }
  const profil: string | null = maskinRows?.[0]?.kravprofil ?? null;

  // === 2) Kravprofilens trösklar ===
  let trosklar: KravRow[] = [];
  if (profil) {
    const { data: kravRows, error: kravErr } = await supabase
      .from("kravprofil")
      .select("variabel,metrik,riktning,tolerans,mal,golv,enhet,larm_min_matt")
      .eq("profil", profil);
    if (kravErr) {
      return NextResponse.json({ ok: false, error: `kravprofil: ${kravErr.message}` }, { status: 500 });
    }
    trosklar = (kravRows ?? []) as KravRow[];
  }
  const tolFor = (variabel: string, metrik: string): number | null => {
    const r = trosklar.find((t) => t.variabel === variabel && t.metrik === metrik);
    return r && r.tolerans != null ? Number(r.tolerans) : null;
  };

  // === 3) Fönster: 90 dagar t.o.m. maskinens senaste kontroll ===
  const { data: senaste, error: senasteErr } = await supabase
    .from("detalj_kontroll_stock")
    .select("kontroll_datum")
    .eq("maskin_id", maskinId)
    .order("kontroll_datum", { ascending: false })
    .limit(1);
  if (senasteErr) {
    return NextResponse.json({ ok: false, error: `senaste kontroll: ${senasteErr.message}` }, { status: 500 });
  }
  if (!senaste || senaste.length === 0) {
    return NextResponse.json({
      ok: true, maskin_id: maskinId, profil, fonster: null, diameter: null, langd: null, trosklar, atgard: null,
    } satisfies BedomningResponse);
  }
  const till = String(senaste[0].kontroll_datum).slice(0, 10);
  const tillD = new Date(`${till}T00:00:00Z`);
  const fran = new Date(tillD.getTime() - (FONSTER_DAGAR - 1) * 86400000).toISOString().slice(0, 10);
  // Inklusive hela `till`-dagen oavsett om kolumnen är date eller timestamp.
  const tillExkl = new Date(tillD.getTime() + 86400000).toISOString().slice(0, 10);

  // === 4) Stockar i fönstret (längd + join-nycklar för diameter) ===
  type StockRow = {
    id: number;
    maskin_langd_cm: number | null;
    operator_langd_cm: number | null;
    maskin_toppdia_mm: number | null;
    operator_toppdia_mm: number | null;
  };
  const stockRes = await fetchAllRows<StockRow>((from, to) =>
    supabase
      .from("detalj_kontroll_stock")
      .select(`id,maskin_langd_cm,operator_langd_cm,${TOPPDIA_COLS}`)
      .eq("maskin_id", maskinId)
      .gte("kontroll_datum", fran)
      .lt("kontroll_datum", tillExkl)
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (stockRes.error) {
    const e = stockRes.error as { message?: string };
    return NextResponse.json({ ok: false, error: `stockar: ${e.message}` }, { status: 500 });
  }

  // LÄNGD (stocknivå) — OMÄTT-filter: operator_langd_cm NULL/0 exkluderas
  const lenAvvik: number[] = [];
  for (const s of stockRes.data) {
    if (s.maskin_langd_cm == null) continue;
    if (s.operator_langd_cm == null || s.operator_langd_cm === 0) continue;
    lenAvvik.push(s.maskin_langd_cm - s.operator_langd_cm);
  }
  const langd = statistik(lenAvvik, tolFor("langd", "traffprocent"), tolFor("langd", "grov_avvikelse"));

  // === 5) Diametermätpunkter för fönstrets stockar ===
  // Mätpunkter längs stocken + toppdiametern vid kapsnittet. OMÄTT-filtret
  // ligger i hjälparen, gemensamt för båda källorna.
  const punktRes = await hamtaDiameterPunkter(supabase, stockRes.data);
  if (punktRes.error) {
    return NextResponse.json({ ok: false, error: `matpunkt: ${punktRes.error.message}` }, { status: 500 });
  }
  const diaAvvik = punktRes.data.map((p) => p.avvik);
  const diameter = statistik(diaAvvik, tolFor("diameter", "traffprocent"), tolFor("diameter", "grov_avvikelse"));

  // === 6) Hjälpte åtgärden? — före/efter senaste förar-markören ===
  let atgard: AtgardEffekt | null = null;
  const { data: atgRows, error: atgErr } = await supabase
    .from("kalibrering_atgard")
    .select("datum,text")
    .eq("maskin_id", maskinId)
    .order("datum", { ascending: false })
    .limit(1);
  if (atgErr) {
    return NextResponse.json({ ok: false, error: `kalibrering_atgard: ${atgErr.message}` }, { status: 500 });
  }
  if (atgRows && atgRows.length > 0) {
    const bryt = String(atgRows[0].datum).slice(0, 10);
    const brytD = new Date(`${bryt}T00:00:00Z`);
    const foreFran = new Date(brytD.getTime() - FONSTER_DAGAR * 86400000).toISOString().slice(0, 10);

    type AtgStock = { id: number; kontroll_datum: string; maskin_toppdia_mm: number | null; operator_toppdia_mm: number | null };
    const atgStock = await fetchAllRows<AtgStock>((from, to) =>
      supabase
        .from("detalj_kontroll_stock")
        .select(`id,kontroll_datum,${TOPPDIA_COLS}`)
        .eq("maskin_id", maskinId)
        .gte("kontroll_datum", foreFran)
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (atgStock.error) {
      const e = atgStock.error as { message?: string };
      return NextResponse.json({ ok: false, error: `stockar (åtgärd): ${e.message}` }, { status: 500 });
    }
    const datumAv = new Map(atgStock.data.map((s) => [s.id, String(s.kontroll_datum).slice(0, 10)]));
    const atgPunkter = await hamtaDiameterPunkter(supabase, atgStock.data);
    if (atgPunkter.error) {
      return NextResponse.json({ ok: false, error: `matpunkt (åtgärd): ${atgPunkter.error.message}` }, { status: 500 });
    }
    const foreAv: number[] = [];
    const efterAv: number[] = [];
    for (const p of atgPunkter.data) {
      const d = datumAv.get(p.stockId) ?? "";
      if (d < bryt) foreAv.push(p.avvik);
      else efterAv.push(p.avvik);
    }
    const tolT = tolFor("diameter", "traffprocent");
    const tolG = tolFor("diameter", "grov_avvikelse");
    const fore = statistik(foreAv, tolT, tolG);
    const efter = statistik(efterAv, tolT, tolG);
    const forTidigt = fore.n < ATGARD_GRIND || efter.n < ATGARD_GRIND;

    // Diameterkalibreringar efter markören — de konkurrerar om förklaringen.
    const { data: kal, error: kalErr } = await supabase
      .from("fakt_kalibrering_historik")
      .select("datum")
      .eq("maskin_id", maskinId)
      .eq("typ", "diameter")
      .gte("datum", bryt)
      .order("datum", { ascending: true });
    if (kalErr) {
      return NextResponse.json({ ok: false, error: `fakt_kalibrering_historik: ${kalErr.message}` }, { status: 500 });
    }
    const kalibreringarEfter = Array.from(new Set((kal ?? []).map((k) => String(k.datum).slice(0, 10))));

    atgard = {
      datum: bryt,
      text: String(atgRows[0].text ?? ""),
      fore: forTidigt ? null : fore,
      efter: forTidigt ? null : efter,
      forTidigt,
      nFore: fore.n,
      nEfter: efter.n,
      kalibreringarEfter,
    };
  }

  const response: BedomningResponse = {
    ok: true,
    maskin_id: maskinId,
    profil,
    fonster: { fran, till, dagar: FONSTER_DAGAR },
    diameter: diameter.n > 0 ? diameter : null,
    langd: langd.n > 0 ? langd : null,
    trosklar,
    atgard,
  };
  return NextResponse.json(response);
}
