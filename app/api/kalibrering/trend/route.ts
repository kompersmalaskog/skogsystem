import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/kalibrering/trend?key=skogsystem-debug[&maskin_id=X]
 *
 * Returnerar aggregerad trenddata för Trend-fliken:
 *   - Per trädslag: antal kontroller + per-mätställe-aggregat
 *     (snitt + stddev av diameteravvikelse, n)
 *   - Lista av enskilda kontroller per trädslag för tidslinjen
 *   - Kalibreringshändelser (fakt_kalibrering_historik) för markörer
 *
 * Server-side aggregat eftersom matpunkter-datasetet är för stort att
 * hämta till klienten (~30k rader). Stddev = populationens stddev
 * (delas på N, inte N-1 — vi har hela populationen, inte ett urval).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG_KEY = "skogsystem-debug";

export type TrendMatstalle = {
  position_cm: number;
  snitt_mm: number;
  stddev_mm: number;
  n: number;
};

export type TrendKontroll = {
  filnamn: string;
  datum: string;
  dia_snitt_mm: number;
  antal_stockar: number;
  object_name: string | null;
};

export type TrendKalibrering = {
  datum: string;
  maskin_id: string;
  tradslag: string | null;
  typ: string | null;
  orsak: string | null;
};

export type TrendTradslag = {
  antal_kontroller: number;
  matstallen: TrendMatstalle[];
  kontroller: TrendKontroll[];
};

export type TrendResponse = {
  ok: true;
  per_tradslag: Record<string, TrendTradslag>;
  kalibreringar: TrendKalibrering[];
  // Aggregerad statistik för "samlat över alla trädslag" om vi vill visa
  totalt: { antal_kontroller: number; antal_matpunkter: number };
};

// PostgREST tar max 1000 rader åt gången — paginera tills tomt.
async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: Error | null }>,
): Promise<{ data: T[]; error: Error | null }> {
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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key !== DEBUG_KEY) {
    return new NextResponse("Ogiltig nyckel", { status: 401 });
  }
  const maskinId = url.searchParams.get("maskin_id");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // === 1) Kontroller: filnamn → tradslag, datum, antal_stockar, dia_snitt ===
  type KontrollMin = {
    filnamn: string;
    datum: string;
    maskin_id: string | null;
    tradslag: string | null;
    antal_kontrollstockar: number | null;
    dia_avvikelse_snitt_mm: number | null;
    object_name: string | null;
  };
  let kontrQuery = supabase
    .from("fakt_kalibrering")
    .select(
      "filnamn,datum,maskin_id,tradslag,antal_kontrollstockar,dia_avvikelse_snitt_mm,object_name",
    );
  if (maskinId) kontrQuery = kontrQuery.eq("maskin_id", maskinId);

  const kontrRes = await fetchAllRows<KontrollMin>((from, to) =>
    kontrQuery.order("datum", { ascending: false }).range(from, to),
  );
  if (kontrRes.error) {
    return NextResponse.json(
      { ok: false, error: `fakt_kalibrering: ${kontrRes.error.message}` },
      { status: 500 },
    );
  }
  const kontroller = kontrRes.data;
  const filnamnToKontroll = new Map<string, KontrollMin>();
  for (const k of kontroller) filnamnToKontroll.set(k.filnamn, k);

  // === 2) Stocks: id → filnamn (för att kunna joina matpunkter mot kontroll) ===
  let stockQuery = supabase.from("detalj_kontroll_stock").select("id,filnamn");
  if (maskinId) {
    // Filtrera via filnamn-set från redan-filtrerade kontroller
    const filnamnSet = Array.from(filnamnToKontroll.keys());
    if (filnamnSet.length === 0) {
      // Inga kontroller alls för denna maskin
      return NextResponse.json({
        ok: true,
        per_tradslag: {},
        kalibreringar: [],
        totalt: { antal_kontroller: 0, antal_matpunkter: 0 },
      } satisfies TrendResponse);
    }
    stockQuery = stockQuery.in("filnamn", filnamnSet);
  }
  const stockRes = await fetchAllRows<{ id: number; filnamn: string }>((from, to) =>
    stockQuery.order("id", { ascending: true }).range(from, to),
  );
  if (stockRes.error) {
    return NextResponse.json(
      { ok: false, error: `detalj_kontroll_stock: ${stockRes.error.message}` },
      { status: 500 },
    );
  }
  const stockIdToFilnamn = new Map<number, string>();
  for (const s of stockRes.data) stockIdToFilnamn.set(s.id, s.filnamn);

  // === 3) Matpunkter: aggregera per (tradslag, position_cm) ===
  type MpRow = {
    detalj_kontroll_stock_id: number;
    position_cm: number;
    diameter_maskin_mm: number | null;
    diameter_operator_mm: number | null;
  };
  const stockIds = Array.from(stockIdToFilnamn.keys());
  // Aggregat-buckets: tradslag → position_cm → samlade avvikelser
  const buckets = new Map<string, Map<number, number[]>>();
  let totalMp = 0;

  // Chunka IN-filtret — Postgres tar max ~1000 i en IN-lista innan det blir trögt.
  const CHUNK = 1000;
  for (let i = 0; i < stockIds.length; i += CHUNK) {
    const chunk = stockIds.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const mpRes = await fetchAllRows<MpRow>((from, to) =>
      supabase
        .from("detalj_kontroll_stock_matpunkt")
        .select(
          "detalj_kontroll_stock_id,position_cm,diameter_maskin_mm,diameter_operator_mm",
        )
        .in("detalj_kontroll_stock_id", chunk)
        .order("detalj_kontroll_stock_id", { ascending: true })
        .range(from, to),
    );
    if (mpRes.error) {
      return NextResponse.json(
        { ok: false, error: `matpunkt: ${mpRes.error.message}` },
        { status: 500 },
      );
    }
    for (const m of mpRes.data) {
      if (m.diameter_maskin_mm == null || m.diameter_operator_mm == null) continue;
      const filnamn = stockIdToFilnamn.get(m.detalj_kontroll_stock_id);
      if (!filnamn) continue;
      const k = filnamnToKontroll.get(filnamn);
      if (!k || !k.tradslag) continue;
      const tradslag = k.tradslag.toLowerCase();
      const avvik = m.diameter_maskin_mm - m.diameter_operator_mm;
      let byPos = buckets.get(tradslag);
      if (!byPos) {
        byPos = new Map();
        buckets.set(tradslag, byPos);
      }
      let arr = byPos.get(m.position_cm);
      if (!arr) {
        arr = [];
        byPos.set(m.position_cm, arr);
      }
      arr.push(avvik);
      totalMp++;
    }
  }

  // === 4) Räkna snitt + populations-stddev per mätställe ===
  const per_tradslag: Record<string, TrendTradslag> = {};
  buckets.forEach((byPos, tradslag) => {
    const matstallen: TrendMatstalle[] = [];
    byPos.forEach((vals: number[], pos: number) => {
      const n = vals.length;
      const snitt = vals.reduce((a: number, b: number) => a + b, 0) / n;
      const varians =
        vals.reduce((a: number, b: number) => a + (b - snitt) * (b - snitt), 0) / n;
      const stddev = Math.sqrt(varians);
      matstallen.push({
        position_cm: pos,
        snitt_mm: Math.round(snitt * 100) / 100,
        stddev_mm: Math.round(stddev * 100) / 100,
        n,
      });
    });
    matstallen.sort((a, b) => a.position_cm - b.position_cm);

    // Kontroll-listan per trädslag — för tidslinjen
    const kontrollerTr = kontroller
      .filter((k) => (k.tradslag ?? "").toLowerCase() === tradslag)
      .map<TrendKontroll>((k) => ({
        filnamn: k.filnamn,
        datum: k.datum,
        dia_snitt_mm: k.dia_avvikelse_snitt_mm ?? 0,
        antal_stockar: k.antal_kontrollstockar ?? 0,
        object_name: k.object_name,
      }));

    per_tradslag[tradslag] = {
      antal_kontroller: kontrollerTr.length,
      matstallen,
      kontroller: kontrollerTr,
    };
  });

  // === 5) Kalibreringshändelser ===
  let histQuery = supabase
    .from("fakt_kalibrering_historik")
    .select("datum,maskin_id,tradslag,typ,orsak");
  if (maskinId) histQuery = histQuery.eq("maskin_id", maskinId);
  const histRes = await fetchAllRows<TrendKalibrering>((from, to) =>
    histQuery.order("datum", { ascending: false }).range(from, to),
  );
  const kalibreringar = histRes.error ? [] : histRes.data;

  const response: TrendResponse = {
    ok: true,
    per_tradslag,
    kalibreringar,
    totalt: {
      antal_kontroller: kontroller.length,
      antal_matpunkter: totalMp,
    },
  };
  return NextResponse.json(response);
}
