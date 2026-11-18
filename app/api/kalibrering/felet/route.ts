import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravInloggad } from "@/lib/auth/server";
import { hamtaDiameterPunkter, TOPPDIA_COLS } from "@/lib/kalibrering/diameterpunkter";
import { byggFeletUnderlag, type FeletResp, type FeletStock } from "@/lib/kalibrering/felet";

/**
 * GET /api/kalibrering/felet?maskin_id=X — underlaget till Läget › "Var sitter felet?".
 * Alla inloggade (kravInloggad), som Per grovlek. Ingen nyckel i adressen.
 *
 * En rad per stam och grovlek (diameter mot klaven) och en per stam (rotstockens längd), med kontrollens datum, för hela maskinens historik — klienten väljer
 * period (90 dagar eller sedan senaste kalibreringen). Samma punkter, samma OMÄTT-filter och samma stamidentitet som Per grovlek (lib/kalibrering/felet).
 * `senasteKalibrering` = senaste raden i fakt_kalibrering_historik för maskinen (längd eller diameter), som svensk dag. Bara datumet läses — justeringens värde
 * tolkas bara av lib/kalibrering/historik.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_DIA = 4;
const FALLBACK_LANGD = 2;

async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const PAGE = 1000; const all: T[] = []; let offset = 0;
  for (;;) {
    const { data, error } = await query(offset, offset + PAGE - 1);
    if (error) return { data: all, error };
    const batch = data ?? []; all.push(...batch);
    if (batch.length < PAGE) break; offset += PAGE;
  }
  return { data: all, error: null };
}

const fel = (text: string) => NextResponse.json({ ok: false, error: text }, { status: 500 });
const svenskDag = (iso: string): string => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date(iso));

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  const maskinId = url.searchParams.get("maskin_id");
  if (!maskinId) return NextResponse.json({ ok: false, error: "maskin_id krävs" }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Toleranserna ur maskinens kravprofil (träffprocent). Saknas profilen gäller ±4 mm och ±2 cm, som Per grovlek.
  const { data: maskinRows, error: mErr } = await supabase.from("dim_maskin").select("kravprofil").eq("maskin_id", maskinId).limit(1);
  if (mErr) return fel(`dim_maskin: ${mErr.message}`);
  const profil: string | null = maskinRows?.[0]?.kravprofil ?? null;
  let tolDia = FALLBACK_DIA;
  let tolLangd = FALLBACK_LANGD;
  if (profil) {
    const { data: kr, error: kErr } = await supabase.from("kravprofil").select("variabel,tolerans").eq("profil", profil).eq("metrik", "traffprocent");
    if (kErr) return fel(`kravprofil: ${kErr.message}`);
    for (const r of kr ?? []) {
      if (r.tolerans == null) continue;
      if (r.variabel === "diameter") tolDia = Number(r.tolerans);
      if (r.variabel === "langd") tolLangd = Number(r.tolerans);
    }
  }

  const fk = await fetchAllRows<{ filnamn: string; tradslag: string | null }>((f, t) =>
    supabase.from("fakt_kalibrering").select("filnamn,tradslag").eq("maskin_id", maskinId).order("id").range(f, t));
  if (fk.error) return fel(`fakt_kalibrering: ${(fk.error as { message?: string }).message}`);
  const filTradslag = new Map<string, string>();
  for (const r of fk.data) if (r.tradslag) filTradslag.set(r.filnamn, r.tradslag.trim());

  const stockRes = await fetchAllRows<FeletStock & { maskin_toppdia_mm: number | null; operator_toppdia_mm: number | null }>((f, t) =>
    supabase.from("detalj_kontroll_stock")
      .select(`id,filnamn,kontroll_datum,harvest_date,stam_nummer,stock_nummer,machine_measurement_date,operator_measurement_date,maskin_langd_cm,operator_langd_cm,${TOPPDIA_COLS}`)
      .eq("maskin_id", maskinId).order("id", { ascending: true }).range(f, t));
  if (stockRes.error) return fel(`stockar: ${(stockRes.error as { message?: string }).message}`);

  const punktRes = await hamtaDiameterPunkter(supabase, stockRes.data);
  if (punktRes.error) return fel(`matpunkt: ${punktRes.error.message}`);

  const { data: kal, error: kalErr } = await supabase.from("fakt_kalibrering_historik").select("datum")
    .eq("maskin_id", maskinId).order("datum", { ascending: false }).limit(1);
  if (kalErr) return fel(`fakt_kalibrering_historik: ${kalErr.message}`);

  const stockar: FeletStock[] = stockRes.data.map(s => ({
    id: s.id, filnamn: s.filnamn, kontroll_datum: String(s.kontroll_datum).slice(0, 10), harvest_date: s.harvest_date ? String(s.harvest_date) : null,
    stam_nummer: s.stam_nummer, stock_nummer: s.stock_nummer, machine_measurement_date: s.machine_measurement_date ?? null,
    operator_measurement_date: s.operator_measurement_date ?? null, maskin_langd_cm: s.maskin_langd_cm, operator_langd_cm: s.operator_langd_cm,
  }));
  const { dia, rot } = byggFeletUnderlag({ stockar, punkter: punktRes.data, filTradslag, tolDia });

  return NextResponse.json({
    ok: true, maskin_id: maskinId, tolDia, tolLangd, dia, rot,
    senasteKalibrering: kal?.[0]?.datum ? svenskDag(String(kal[0].datum)) : null,
  } satisfies FeletResp);
}
