import { supabase } from "@/lib/supabase";
import type { VilaTrosklar } from "@/lib/vilobrott";

/**
 * gs_avtal — Skogsavtalets parametrar (lön, OB, traktamente, vila-trösklar mm).
 *
 * Tabellen har en eller flera rader, en per giltighetsperiod. Frågor om vad
 * som gällde vid ett visst datum (t.ex. retroaktiv löneberäkning) ska träffa
 * den rad där `giltigt_fran <= datum AND (giltigt_till IS NULL OR giltigt_till >= datum)`.
 *
 * Använd hamtaGiltigtAvtal() — den hanterar NULL i giltigt_till för det
 * pågående avtalet. En naiv `.gte("giltigt_till", datum)`-query skulle filtrera
 * bort det öppna avtalet.
 */

// TODO: ersätt [key: string]: unknown med specifika fält när
// fler konsumenter (löneberäkning, OB) kräver det
export type GsAvtal = {
  id: string;
  namn?: string | null;
  giltigt_fran?: string | null;
  giltigt_till?: string | null;

  // Lön & övertid
  timlon_kr?: number | null;
  overtid_vardag_kr?: number | null;
  max_overtid_ar?: number | null;

  // OB
  ob_kvall_kr?: number | null;
  ob_natt_kr?: number | null;
  ob_lordag_kr?: number | null;
  ob_sondag_kr?: number | null;

  // Färdmedel & färdtid
  km_ersattning_kr?: number | null;
  km_grans_per_dag?: number | null;
  fardtid_kr?: number | null;
  fardtid_kr_per_mil?: number | null;

  // ATK
  atk_procent?: number | null;
  atk_period?: string | null;
  atk_procent_nasta?: number | null;
  atk_ledig_tim?: number | null;
  atk_faktor?: number | null;

  // Traktamente
  traktamente_hel_kr?: number | null;
  traktamente_halv_kr?: number | null;

  // Övriga tillägg
  skifttillagg_kr?: number | null;
  bortovaro_kr?: number | null;

  // Vila-trösklar (20260520-migrationen). NOT NULL i DB med defaults.
  dygnsvila_krav_h?: number | null;
  dygnsvila_varning_h?: number | null;
  veckovila_krav_h?: number | null;
  veckovila_fonster_dagar?: number | null;
  kompensation_deadline_dagar?: number | null;

  // Tillåt okända fält — så att kolumner som läggs till i DB utan att typen
  // uppdateras inte tappas vid `select("*")`. Matchar mönstret i AvtalFlik.tsx.
  [key: string]: unknown;
};

function tillIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Hämtar den gs_avtal-rad som gällde vid `datum` (default idag).
 *
 * Kastar Error om ingen giltig rad finns — tyst null leder till NaN i
 * beräkningar och buggar som visar sig långt senare.
 */
export async function hamtaGiltigtAvtal(datum?: Date): Promise<GsAvtal> {
  const ref = tillIsoDate(datum ?? new Date());
  const { data, error } = await supabase
    .from("gs_avtal")
    .select("*")
    .lte("giltigt_fran", ref)
    .or(`giltigt_till.is.null,giltigt_till.gte.${ref}`)
    .order("giltigt_fran", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Kunde inte hämta gs_avtal för ${ref}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Inget gs_avtal-rad giltigt för datum ${ref}`);
  }
  return data as GsAvtal;
}

/**
 * Plockar vila-trösklarna ur en gs_avtal-rad och validerar att de är
 * giltiga numeriska värden. Kastar Error om något fält är null/NaN —
 * hindrar tysta NaN-buggar i analyseraVilobrott().
 *
 * Använd den här istället för manuell Number()-cast på fältnivå. Samma
 * mönster bör återanvändas när vi senare läser fler grupper av fält
 * från gs_avtal (löneberäkning, OB-ersättning).
 */
export function vilaTrosklarFromAvtal(avtal: GsAvtal): VilaTrosklar {
  const t: VilaTrosklar = {
    dygnsvila_krav_h: Number(avtal.dygnsvila_krav_h),
    dygnsvila_varning_h: Number(avtal.dygnsvila_varning_h),
    veckovila_krav_h: Number(avtal.veckovila_krav_h),
    veckovila_fonster_dagar: Number(avtal.veckovila_fonster_dagar),
    kompensation_deadline_dagar: Number(avtal.kompensation_deadline_dagar),
  };
  for (const [key, value] of Object.entries(t)) {
    if (!Number.isFinite(value)) {
      throw new Error(`gs_avtal.${key} är ogiltig: ${String(avtal[key])}`);
    }
  }
  return t;
}
