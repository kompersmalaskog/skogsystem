import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/kalibrering/kontroll?filnamn=X&key=skogsystem-debug
 *
 * Returnerar en komplett kalibreringskontroll med joinat data från:
 *  - fakt_kalibrering                 (per-fil aggregat + objekt-meta + väder)
 *  - detalj_kontroll_stock            (per stock)
 *  - detalj_kontroll_stock_matpunkt   (per mätpunkt, nästlat under varje stock)
 *  - detalj_kontroll_stam             (stem_diameter_profile per stam)
 *
 * Använd som datalager för Apple-modalen i kalibreringsvyn.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG_KEY = "skogsystem-debug";

// === TYPES (speglar Supabase-schemat efter v2_1) ===

export type WeatherJson = {
  source?: string;
  fetched_at?: string;
  harvest_time?: string;
  temperature_c?: number | null;
  precipitation_mm?: number | null;
  snowfall_cm?: number | null;
  wind_speed_ms?: number | null;
  is_freezing?: boolean;
} | null;

export type KontrollRow = {
  id: number;
  datum: string;
  maskin_id: string | null;
  operator_id: string | null;
  tradslag: string | null;
  antal_kontrollstammar: number | null;
  antal_kontrollstockar: number | null;
  langd_avvikelse_snitt_cm: number | null;
  langd_avvikelse_min_cm: number | null;
  langd_avvikelse_max_cm: number | null;
  dia_avvikelse_snitt_mm: number | null;
  dia_avvikelse_min_mm: number | null;
  dia_avvikelse_max_mm: number | null;
  status: string | null;
  filnamn: string;
  skapad_tid: string;
  application_version: string | null;
  object_name: string | null;
  object_area_ha: number | null;
  cutting_method: string | null;
  forest_certification: string | null;
  contract_number: string | null;
  butt_log_length_adjustment_mm: number | null;
  weather_at_harvest: WeatherJson;
};

export type MatpunktRow = {
  position_cm: number;
  diameter_maskin_mm: number | null;
  diameter_operator_mm: number | null;
  klave_first_mm: number | null;
  klave_second_mm: number | null;
};

export type StockRow = {
  id: number;
  stam_nummer: number;
  stock_nummer: number;
  sortiment_namn: string | null;
  sortiment_grupp: string | null;
  sortiment_kod: string | null;
  maskin_langd_cm: number | null;
  operator_langd_cm: number | null;
  langd_avvikelse_cm: number | null;
  maskin_toppdia_mm: number | null;
  operator_toppdia_mm: number | null;
  dia_avvikelse_mm: number | null;
  maskin_volym_sub: number | null;
  operator_volym_sub: number | null;
  volym_avvikelse: number | null;
  log_diameter_mid_ob_mm: number | null;
  log_diameter_butt_ob_mm: number | null;
  cutting_reason: string | null;
  machine_measurement_date: string | null;
  operator_measurement_date: string | null;
  // Per-stam-meta (redundant på varje stock i sin stam — bekvämt för UI)
  stem_lat: number | null;
  stem_lon: number | null;
  stem_alt: number | null;
  harvest_date: string | null;
  stem_dbh_mm: number | null;
  stem_selection: string | null;
  measurement_mode: string | null;
  rejected_reason: string | null;
  measurer_name: string | null;
  caliper_id: string | null;
  processing_category: string | null;
  matpunkter: MatpunktRow[];
};

export type StamRow = {
  stam_nummer: number;
  stem_diameter_profile:
    | Array<{ position_cm: number; diameter_mm: number }>
    | null;
};

export type KontrollResponse = {
  kontroll: KontrollRow;
  stockar: StockRow[];
  stammar: StamRow[];
};

// === Paginerings-helper (samma mönster som kalender-route) ===
async function fetchAllRows(
  queryFn: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<{ data: any[]; error: any | null }> {
  const PAGE = 1000;
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFn(offset, offset + PAGE - 1);
    if (error) return { data: [], error };
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

  const filnamn = url.searchParams.get("filnamn");
  if (!filnamn) {
    return NextResponse.json(
      { ok: false, error: "filnamn krävs" },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // === 1) fakt_kalibrering (1 rad — UNIQUE på filnamn) ===
  const kontrollFields =
    "id,datum,maskin_id,operator_id,tradslag," +
    "antal_kontrollstammar,antal_kontrollstockar," +
    "langd_avvikelse_snitt_cm,langd_avvikelse_min_cm,langd_avvikelse_max_cm," +
    "dia_avvikelse_snitt_mm,dia_avvikelse_min_mm,dia_avvikelse_max_mm," +
    "status,filnamn,skapad_tid," +
    "application_version,object_name,object_area_ha," +
    "cutting_method,forest_certification,contract_number," +
    "butt_log_length_adjustment_mm,weather_at_harvest";

  const kontrollRes = await supabase
    .from("fakt_kalibrering")
    .select(kontrollFields)
    .eq("filnamn", filnamn)
    .limit(1);
  if (kontrollRes.error) {
    return NextResponse.json(
      { ok: false, error: `fakt_kalibrering: ${kontrollRes.error.message}` },
      { status: 500 },
    );
  }
  const kontrollRows = (kontrollRes.data ?? []) as unknown as KontrollRow[];
  if (kontrollRows.length === 0) {
    return NextResponse.json(
      { ok: false, error: `Ingen kontroll hittades för filnamn=${filnamn}` },
      { status: 404 },
    );
  }
  const kontroll = kontrollRows[0];

  // === 2) detalj_kontroll_stock ===
  const stockFields =
    "id,stam_nummer,stock_nummer," +
    "sortiment_namn,sortiment_grupp,sortiment_kod," +
    "maskin_langd_cm,operator_langd_cm,langd_avvikelse_cm," +
    "maskin_toppdia_mm,operator_toppdia_mm,dia_avvikelse_mm," +
    "maskin_volym_sub,operator_volym_sub,volym_avvikelse," +
    "log_diameter_mid_ob_mm,log_diameter_butt_ob_mm," +
    "cutting_reason,machine_measurement_date,operator_measurement_date," +
    "stem_lat,stem_lon,stem_alt,harvest_date,stem_dbh_mm," +
    "stem_selection,measurement_mode,rejected_reason," +
    "measurer_name,caliper_id,processing_category";

  const stockRes = await fetchAllRows((from, to) =>
    supabase
      .from("detalj_kontroll_stock")
      .select(stockFields)
      .eq("filnamn", filnamn)
      .order("stam_nummer", { ascending: true })
      .order("stock_nummer", { ascending: true })
      .range(from, to),
  );
  if (stockRes.error) {
    return NextResponse.json(
      { ok: false, error: `detalj_kontroll_stock: ${stockRes.error.message}` },
      { status: 500 },
    );
  }
  const stockarRaw = stockRes.data as unknown as Array<
    Omit<StockRow, "matpunkter">
  >;

  // === 3) detalj_kontroll_stock_matpunkt (FK på stock-id, IN-filter) ===
  const stockIds = stockarRaw.map((s) => s.id);
  const matpunktByStockId = new Map<number, MatpunktRow[]>();

  if (stockIds.length > 0) {
    const matpunktRes = await fetchAllRows((from, to) =>
      supabase
        .from("detalj_kontroll_stock_matpunkt")
        .select(
          "detalj_kontroll_stock_id,position_cm,diameter_maskin_mm,diameter_operator_mm,klave_first_mm,klave_second_mm",
        )
        .in("detalj_kontroll_stock_id", stockIds)
        .order("detalj_kontroll_stock_id", { ascending: true })
        .order("position_cm", { ascending: true })
        .range(from, to),
    );
    if (matpunktRes.error) {
      return NextResponse.json(
        {
          ok: false,
          error: `detalj_kontroll_stock_matpunkt: ${matpunktRes.error.message}`,
        },
        { status: 500 },
      );
    }
    for (const m of matpunktRes.data as Array<
      MatpunktRow & { detalj_kontroll_stock_id: number }
    >) {
      const arr = matpunktByStockId.get(m.detalj_kontroll_stock_id) ?? [];
      arr.push({
        position_cm: m.position_cm,
        diameter_maskin_mm: m.diameter_maskin_mm,
        diameter_operator_mm: m.diameter_operator_mm,
        klave_first_mm: m.klave_first_mm,
        klave_second_mm: m.klave_second_mm,
      });
      matpunktByStockId.set(m.detalj_kontroll_stock_id, arr);
    }
  }

  const stockar: StockRow[] = stockarRaw.map((s) => ({
    ...s,
    matpunkter: matpunktByStockId.get(s.id) ?? [],
  }));

  // === 4) detalj_kontroll_stam ===
  const stamRes = await fetchAllRows((from, to) =>
    supabase
      .from("detalj_kontroll_stam")
      .select("stam_nummer,stem_diameter_profile")
      .eq("filnamn", filnamn)
      .order("stam_nummer", { ascending: true })
      .range(from, to),
  );
  if (stamRes.error) {
    return NextResponse.json(
      { ok: false, error: `detalj_kontroll_stam: ${stamRes.error.message}` },
      { status: 500 },
    );
  }
  const stammar = stamRes.data as unknown as StamRow[];

  const response: KontrollResponse = { kontroll, stockar, stammar };
  return NextResponse.json(response);
}
