/**
 * Lagrens kartrutor — färre och sparade (Martin 2026-11-13: "kartan är jävligt seg i maskinen om man byter lager").
 * Mätt med fartmätaren: Markfuktighet = 54 rutor à ~100 kB = över 5 MB, 6,6 s på en lina med 6,9 Mbit/s. Sidan själv tog 0,18 s.
 *
 * 1. TAK PÅ ZOOMEN: ett lager hämtas aldrig skarpare än det är. Över taket förstorar kartan rutan den redan har (en fjärdedel så många
 *    rutor per zoomsteg, och samma rutor återanvänds när man zoomar in). Taket = den zoom där en ruta ungefär har datans egen upplösning.
 * 2. SPARADE RUTOR: public/sw.js sparar lagrens rutor på enheten (LAGER_CACHE) — andra gången kommer lagret direkt, också utan täckning.
 */

/** Rasterdata med känd upplösning: hämtas inte skarpare än så. z15 ≈ 2,7 m per bildpunkt på våra breddgrader, z14 ≈ 5 m, z16 ≈ 1,3 m. */
const TAK: Record<string, number> = {
  sks_markfuktighet: 15,   // SLU markfuktighet, 2 m
  sks_virkesvolym: 14,     // skogliga grunddata, 10–12,5 m
  sks_tradhojd: 15,
  sks_lutning: 15,
  sks_gallringsindex: 14,
  nmd_tradslag: 14,        // 10 m
  jordarter: 14,           // 1:25 000
  hydrografi: 15,
  lm_skuggning: 16,        // 1 m
  fornlamningar: 14,       // som förut (RAÄ ritar inget skarpare)
}
/** Flygbilderna har sin egen upplösning och får inget tak här. */
const UTAN_TAK: ReadonlySet<string> = new Set(['lm_ortofoto', 'lm_ortofoto_ir'])
/** Övriga lager är ritade gränser och ytor: skarpa nog på z16, därefter förstoras de. */
export const LAGER_STANDARD_TAK = 16

export function lagerMaxZoom(id: string): number | null {
  if (UTAN_TAK.has(id)) return null
  return TAK[id] ?? LAGER_STANDARD_TAK
}

/** Namnet på enhetens sparade lagerrutor — måste vara ordagrant samma som i public/sw.js (vaktas av ett test). */
export const LAGER_CACHE = 'lagerrutor-v1'
