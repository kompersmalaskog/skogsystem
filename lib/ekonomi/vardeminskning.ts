// Verklig värdeminskning per maskin — EN KALKYL, inte bokförd avskrivning.
//
// MODELLEN (Ponsse-säljarens egen): kr per G15-timme. En skördare tappar
// ~300–500 kr och en skotare ~250–350 kr i värde per körd timme de första
// ~4000 timmarna. Värdeminskningen är alltså kr/tim × maskinens FAKTISKA
// G15-timmar i perioden — självjusterande (mer körning = mer slitage) och
// självperiodiserande (en månads timmar ger månadens kostnad).
//
// Bokförd avskrivning (78xx i Fortnox) är skattestyrd fiktion och ska
// ALDRIG användas som ägarkostnad. Procent-på-inköpspris-modellen som
// fanns här tidigare är BORTTAGEN (den gav ~2× för höga tal) — en modell,
// en plats, ingen drift. dim_maskins inkopspris/inkopsdatum/
// avskrivning_procent ligger kvar i databasen som referens men läses inte.
//
// Överallt där talen visas ska de märkas i bärnsten (= kalkyl, inte mätt
// eller bokfört). Tomt kr/tim (NULL) → null tillbaka: ingen värdeminskning
// räknas för maskinen (ärligt, aldrig en 0-gissning).

// Förval per maskintyp (mitten av säljarens spann) — används av
// Inställningar för förifyllnad, ALDRIG tyst i beräkningen.
export const VARDEMINSKNING_FORVAL_SKORDARE = 400;
export const VARDEMINSKNING_FORVAL_SKOTARE = 300;

export type MaskinVardeminskning = {
  vardeminskning_kr_per_g15h?: number | null;
  sald?: boolean | null;
  sald_datum?: string | null;    // ISO-datum (YYYY-MM-DD)
};

/**
 * Är maskinen såld ur driften för år `forAr`? Från och med säljåret bär
 * den ingen värdeminskning (försiktigt — ingen dubbelkostnad mellan oss
 * och köparen); åren FÖRE säljåret räknas som vanligt (historik).
 * sald=true utan datum = såld nu → ingen värdeminskning från innevarande år.
 */
export function arSaldForAr(m: MaskinVardeminskning, forAr: number, nuAr: number = new Date().getFullYear()): boolean {
  if (!m.sald) return false;
  const saldAr = m.sald_datum ? Number(String(m.sald_datum).slice(0, 4)) : NaN;
  if (!Number.isInteger(saldAr)) return forAr >= nuAr;
  return forAr >= saldAr;
}

/**
 * Periodens värdeminskning i kr: kr/G15-tim × maskinens G15-timmar i
 * perioden. null när kr/tim saknas (räknas ej — ingen 0-gissning) eller
 * maskinen är såld för periodens år. 0 timmar → 0 kr (sant i modellen:
 * en maskin som står slits inte).
 */
export function vardeminskningPeriod(
  m: MaskinVardeminskning,
  g15hIPerioden: number,
  forAr: number = new Date().getFullYear(),
): number | null {
  const kr = Number(m.vardeminskning_kr_per_g15h);
  if (!(kr > 0)) return null;
  if (arSaldForAr(m, forAr)) return null;
  return kr * Math.max(0, Number(g15hIPerioden) || 0);
}
