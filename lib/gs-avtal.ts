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

/**
 * Kolumnerna i prod-tabellen gs_avtal (information_schema 2026-10-14). EN källa: typen nedan, vyn Mitt avtal och
 * vakten `lib/gsAvtalKolumner.test.ts` utgår från den. Ett fält som inte står här finns inte — ett namn som bara
 * liknar en kolumn (`atk_ledig_tim` för `atk_ledig_tid_h`, `skifttillagg_kr` för `skift_tillagg_kr`, `bortovaro_kr`
 * för `bortovaro_12h_kr`, `timlon_kr` som aldrig funnits) ger `undefined`, och en `??`-reserv bakom det blev "avtalet"
 * för föraren (Mitt avtal i Arbetsrapport, 2026-10-14). Lägg till kolumnen här när en migration lagt till den i prod.
 */
export const GS_AVTAL_KOLUMNER = [
  "id", "namn", "giltigt_fran", "giltigt_till", "skapad",
  // Ordinarie tid & övertid
  "ordinarie_vecka_h", "overtid_vardag_pct", "overtid_helg_pct", "overtid_faktor", "max_overtid_ar_h", "overtid_vardag_kr", "overtid_helg_kr",
  // OB & tillägg
  "ob_kvall_kr", "ob_natt_kr", "ob_helg_kr", "ob_sondag_kr", "skift_tillagg_kr", "bortovaro_12h_kr",
  // Färdmedel & färdtid & traktamente
  // km_grans_per_dag är den kolumn appen läser (fri pendling km/dag). km_fri_pendling är en äldre kolumn med samma
  // innebörd som finns kvar i prod; ingen kod i appen läser den.
  "km_grans_per_dag", "km_fri_pendling", "km_ersattning_kr", "fardmedel_kr_per_mil", "fardtid_kr_per_mil",
  "traktamente_hel_kr", "traktamente_halv_kr",
  // ATK, pension, sjuklön, semester, helglön
  "atk_procent", "atk_procent_nasta", "atk_ledig_tid_h", "pension_tillagg_pct", "sjuklon_pct",
  "semester_dagar_ar", "semester_ersattning_pct", "helglon_dagar",
  // Avtalets PDF: sökvägen i den privata bucketen `avtal` (lib/avtalPdf). Kolumnen kommer med migrationen
  // 20261014101036_avtal_pdf_bucket.sql — före den finns den inte i prod, och ett avtal utan sökväg är "inte uppladdat än".
  "avtal_pdf_path",
  // Vila-trösklar (20260520-migrationen). NOT NULL i DB med defaults.
  "dygnsvila_krav_h", "dygnsvila_varning_h", "veckovila_krav_h", "veckovila_fonster_dagar", "kompensation_deadline_dagar",
] as const;

export type GsAvtalKolumn = (typeof GS_AVTAL_KOLUMNER)[number];

/**
 * En rad ur gs_avtal. Bara riktiga kolumner (se GS_AVTAL_KOLUMNER): ingen index-signatur, så ett felstavat fältnamn är
 * ett kompileringsfel i stället för `undefined` som någon senare ersätter med ett påhittat värde. Allt utom id är
 * nullable i DB; numeric kommer som tal från PostgREST.
 *
 * Reseersättning = EN rad: fardtid_kr_per_mil per påbörjad mil per dag över km_grans_per_dag. Alla har firmabil.
 * fardmedel_kr_per_mil finns i prod-tabellen men är OANVÄND av appen (COMMENT ON COLUMN satt i prod 2026-09-10, beslut
 * löneansvariga). Beslutet måste tas om ifall firmabil någon gång inte gäller alla.
 */
export type GsAvtal = { id: string } & {
  [K in Exclude<GsAvtalKolumn, "id" | "namn" | "giltigt_fran" | "giltigt_till" | "skapad" | "helglon_dagar" | "avtal_pdf_path">]?: number | null;
} & {
  namn?: string | null;
  giltigt_fran?: string | null;
  giltigt_till?: string | null;
  skapad?: string | null;
  /** Avtalets dagar, kommaseparerade ("Nyårsdagen,Trettondagen,…"). */
  helglon_dagar?: string | null;
  /** Sökväg i bucketen `avtal` ("<avtalets id>.pdf"). null/saknas = inte uppladdat. */
  avtal_pdf_path?: string | null;
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
      throw new Error(`gs_avtal.${key} är ogiltig: ${String((avtal as Record<string, unknown>)[key])}`);
    }
  }
  return t;
}
