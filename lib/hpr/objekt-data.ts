/**
 * objekt-data.ts — läser ETT objekts samlade fördelningsdata ur databasen och
 * bygger tillbaka parserns typer, så att fordelning.ts-beräkningarna kan köras
 * mot hela objektet (alla filer), inte mot en enskild fil.
 *
 * En källa för "hela objektets stockar": används av
 *  - importrouten (snapshot räknas ur DB, inte ur filens delmängd — annars ger
 *    delfiler efter 4000-stammarstaket falska snapshots), och
 *  - fördelningsvyn (alla siffror live ur logs/matrix_cells, aldrig ur snapshots).
 *
 * VIKTIGT: paginering MÅSTE sortera. PostgREST garanterar ingen stabil
 * radordning mellan .range()-sidor utan ORDER BY — utan den kan sidor
 * överlappa/hoppa rader och totalen bli fel (verifierat: samma logs-fråga gav
 * 6 475 vs 6 666 för Brokamåla). Varje hämtning nedan sorterar på unik nyckel.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HprProduct, HprLog, MatrixCell } from "./hpr-parser";

export interface ObjektData {
  objectKey: string;
  produkter: HprProduct[];
  stockar: HprLog[];
}

// PostgREST kapar svaret vid max-rows (1000). Sidstorleken MÅSTE matcha taket,
// annars signalerar "data.length < PAGE" slut för tidigt. Produkter (~15/objekt)
// och celler (~några hundra/objekt) ryms gott; stockarna hämtas via RPC nedan.
const PAGE = 1000;

async function hamtaAlla<T>(
  build: () => any,
  sortering: string[]
): Promise<T[]> {
  const ut: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = build();
    for (const kol of sortering) q = q.order(kol);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    ut.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return ut;
}

/** Läs alla produkter, matrisceller och stockar för ett objekt och bygg parserns typer. */
export async function hamtaObjektData(
  supabase: SupabaseClient,
  objectKey: string
): Promise<ObjektData> {
  const prodRader = await hamtaAlla<any>(
    () => supabase.from("products").select("*").eq("object_key", objectKey),
    ["product_key"]
  );
  const prodIds = prodRader.map((p) => p.id);
  const cellRader = prodIds.length
    ? await hamtaAlla<any>(
        () => supabase.from("matrix_cells").select("*").in("product_id", prodIds),
        ["product_id", "dia_lower", "len_lower"]
      )
    : [];
  // Stockarna via RPC (hpr_objekt_logs) — en jsonb-array i ETT anrop, förbi
  // PostgREST:s 1000-radstak. Sorteras deterministiskt i funktionen.
  const { data: logJson, error: logErr } = await supabase.rpc("hpr_objekt_logs", {
    p_object_key: objectKey,
  });
  if (logErr) throw new Error(`hpr_objekt_logs: ${logErr.message}`);
  const logRader: any[] = (logJson as any[]) ?? [];

  const produkter: HprProduct[] = prodRader.map((p) => ({
    productKey: p.product_key,
    name: p.name,
    group: p.product_group,
    speciesGroupKey: p.species_group_key,
    classified: true,
    diaClassCategory: p.dia_class_category,
    diameterUnderBark: p.diameter_under_bark,
    diaLimits: p.dia_limits,
    diaMax: p.dia_max,
    lenLimits: p.len_limits,
    lenMax: p.len_max,
    distributionAllowed: p.distribution_allowed,
    distributionCategory: p.distribution_category,
    maxDeviation: p.max_deviation == null ? null : Number(p.max_deviation),
    cells: cellRader
      .filter((c) => c.product_id === p.id)
      .map((c): MatrixCell => ({
        diaLower: c.dia_lower,
        lenLower: c.len_lower,
        price: Number(c.price),
        distribution: Number(c.distribution),
        limitation: Number(c.limitation),
        buckingCriteria: c.bucking_criteria,
      })),
  }));

  const stockar: HprLog[] = logRader.map((l) => ({
    stemKey: l.stem_key,
    logKey: l.log_key,
    productKey: l.product_key,
    harvestDate: l.harvest_date,
    lengthCm: l.length_cm,
    diaTopObMm: l.dia_top_ob_mm,
    diaTopUbMm: l.dia_top_ub_mm,
    volPriceM3: l.vol_price_m3 == null ? null : Number(l.vol_price_m3),
    volSobM3: l.vol_sob_m3 == null ? null : Number(l.vol_sob_m3),
    volSubM3: l.vol_sub_m3 == null ? null : Number(l.vol_sub_m3),
    cuttingReason: l.cutting_reason,
  }));

  return { objectKey, produkter, stockar };
}
