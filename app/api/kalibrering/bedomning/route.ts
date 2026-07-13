import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
 *   - Diameter: MÄTPUNKTSNIVÅ (detalj_kontroll_stock_matpunkt,
 *     diameter_maskin_mm vs diameter_operator_mm)
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

export type VariabelStat = {
  n: number;
  traffPct: number | null;
  systematisk: number | null;
  standardavv: number | null;
  grovPct: number | null;
  tolerans: number | null;
  grovTolerans: number | null;
};

export type BedomningResponse = {
  ok: true;
  maskin_id: string;
  profil: string | null;
  fonster: { fran: string; till: string; dagar: number } | null;
  diameter: VariabelStat | null;
  langd: VariabelStat | null;
  trosklar: KravRow[];
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

function popStd(vals: number[], mean: number): number {
  if (vals.length < 2) return 0;
  const v = vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length;
  return Math.sqrt(v);
}

function statistik(avvik: number[], tolerans: number | null, grovTolerans: number | null): VariabelStat {
  const n = avvik.length;
  if (n === 0) {
    return { n: 0, traffPct: null, systematisk: null, standardavv: null, grovPct: null, tolerans, grovTolerans };
  }
  const systematisk = avvik.reduce((a, b) => a + b, 0) / n;
  const standardavv = popStd(avvik, systematisk);
  const traffPct = tolerans == null ? null : (100 * avvik.filter((v) => Math.abs(v) <= tolerans).length) / n;
  const grovPct = grovTolerans == null ? null : (100 * avvik.filter((v) => Math.abs(v) > grovTolerans).length) / n;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    n,
    traffPct: traffPct == null ? null : r2(traffPct),
    systematisk: r2(systematisk),
    standardavv: r2(standardavv),
    grovPct: grovPct == null ? null : r2(grovPct),
    tolerans,
    grovTolerans,
  };
}

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
      ok: true, maskin_id: maskinId, profil, fonster: null, diameter: null, langd: null, trosklar,
    } satisfies BedomningResponse);
  }
  const till = String(senaste[0].kontroll_datum).slice(0, 10);
  const tillD = new Date(`${till}T00:00:00Z`);
  const fran = new Date(tillD.getTime() - (FONSTER_DAGAR - 1) * 86400000).toISOString().slice(0, 10);
  // Inklusive hela `till`-dagen oavsett om kolumnen är date eller timestamp.
  const tillExkl = new Date(tillD.getTime() + 86400000).toISOString().slice(0, 10);

  // === 4) Stockar i fönstret (längd + join-nycklar för diameter) ===
  type StockRow = { id: number; maskin_langd_cm: number | null; operator_langd_cm: number | null };
  const stockRes = await fetchAllRows<StockRow>((from, to) =>
    supabase
      .from("detalj_kontroll_stock")
      .select("id,maskin_langd_cm,operator_langd_cm")
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

  // === 5) Matpunkter för fönstrets stockar (diameter) ===
  const stockIds = stockRes.data.map((s) => s.id);
  const diaAvvik: number[] = [];
  const CHUNK = 1000;
  for (let i = 0; i < stockIds.length; i += CHUNK) {
    const chunk = stockIds.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const mpRes = await fetchAllRows<{ diameter_maskin_mm: number | null; diameter_operator_mm: number | null }>((from, to) =>
      supabase
        .from("detalj_kontroll_stock_matpunkt")
        .select("diameter_maskin_mm,diameter_operator_mm")
        .in("detalj_kontroll_stock_id", chunk)
        .range(from, to),
    );
    if (mpRes.error) {
      const e = mpRes.error as { message?: string };
      return NextResponse.json({ ok: false, error: `matpunkt: ${e.message}` }, { status: 500 });
    }
    for (const m of mpRes.data) {
      if (m.diameter_maskin_mm == null) continue;
      // OMÄTT-filter: operator-diameter NULL/0 exkluderas
      if (m.diameter_operator_mm == null || m.diameter_operator_mm === 0) continue;
      diaAvvik.push(m.diameter_maskin_mm - m.diameter_operator_mm);
    }
  }
  const diameter = statistik(diaAvvik, tolFor("diameter", "traffprocent"), tolFor("diameter", "grov_avvikelse"));

  const response: BedomningResponse = {
    ok: true,
    maskin_id: maskinId,
    profil,
    fonster: { fran, till, dagar: FONSTER_DAGAR },
    diameter: diameter.n > 0 ? diameter : null,
    langd: langd.n > 0 ? langd : null,
    trosklar,
  };
  return NextResponse.json(response);
}
