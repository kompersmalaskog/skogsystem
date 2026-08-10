// Verklig värdeminskning per maskin — EN KALKYL, inte bokförd avskrivning.
//
// Bokförd avskrivning (78xx i Fortnox) är skattestyrd fiktion: en maskin
// kan vara nedskriven till 50 000 kr i böckerna och värd 1,5 mkr på
// marknaden. Den ska ALDRIG användas som ägarkostnad. I stället räknas
// verklig värdeminskning degressivt — X %/år på KVARVARANDE värde —
// och slås ut per G15-timme: maskinen förbrukas när den körs.
//
// Överallt där de här talen visas ska de märkas i bärnsten (= kalkyl/
// uppskattning, inte mätt eller bokfört) — samma färgregel som övriga
// manuella/uppskattade värden i ekonomisektionen.
//
// Inparametrarna bor i dim_maskin (inkopspris, avskrivning_procent,
// inkopsar, sald, sald_datum) och sätts i /ekonomi/installningar.
// inkopspris NULL/0 → null tillbaka: ingen värdeminskning räknas för
// maskinen (ärligt, aldrig en 0-gissning).

export const AVSKRIVNING_PROCENT_FORVAL = 20;

export type MaskinVardeminskning = {
  inkopspris?: number | null;
  avskrivning_procent?: number | null;
  inkopsdatum?: string | null;   // ISO YYYY-MM-DD, dag alltid 01 (månadsupplösning)
  sald?: boolean | null;
  sald_datum?: string | null;    // ISO-datum (YYYY-MM-DD)
};

/**
 * Maskinens position i avskrivningskurvan för år `forAr`:
 * ålder = forAr − inköpsår (clampad ≥ 1). Köpt 2019 → ålder 7 i 2026 →
 * sjunde årets avskrivning = pris × (1−p)^6 × p. Okänt eller orimligt
 * inköpsår → 1 (försiktigt: högsta årskostnaden, ingen dold nedräkning).
 */
export function maskinAlderAr(inkopsdatum: string | null | undefined, forAr: number): number {
  const ar = inkopsdatum ? Number(String(inkopsdatum).slice(0, 4)) : NaN;
  if (!Number.isInteger(ar) || ar < 1900 || ar >= forAr) return 1;
  return forAr - ar;
}

/**
 * Pro rata på köpåret: en maskin köpt i juli har bara slitits ~halva året —
 * (13 − månad)/12 av årets värdeminskning (juli → 6/12, januari → 12/12).
 * Alla år därefter, och okänd månad, → 1 (helt år).
 */
export function andelAvKopAret(inkopsdatum: string | null | undefined, forAr: number): number {
  const str = String(inkopsdatum || '');
  const ar = Number(str.slice(0, 4));
  const man = Number(str.slice(5, 7));
  if (!Number.isInteger(ar) || ar !== forAr) return 1;
  if (!Number.isInteger(man) || man < 1 || man > 12) return 1;
  return (13 - man) / 12;
}

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
 * Årets värdeminskning i kr för år `forAr` (default innevarande år),
 * degressivt: procent av kvarvarande värde vid maskinens ålder det året.
 * null när inköpspris saknas eller maskinen är såld för det året.
 */
export function vardeminskningPerAr(m: MaskinVardeminskning, forAr: number = new Date().getFullYear()): number | null {
  const pris = Number(m.inkopspris);
  if (!(pris > 0)) return null;
  if (arSaldForAr(m, forAr)) return null;
  const p = (Number(m.avskrivning_procent) > 0 ? Number(m.avskrivning_procent) : AVSKRIVNING_PROCENT_FORVAL) / 100;
  const alder = maskinAlderAr(m.inkopsdatum, forAr);
  return pris * Math.pow(1 - p, alder - 1) * p * andelAvKopAret(m.inkopsdatum, forAr);
}

/**
 * Värdeminskning i kr per G15-timme: årets värdeminskning delat på
 * maskinens G15-timmar samma period. null när inköpspris saknas, maskinen
 * är såld, eller timmarna är 0 (kr/0h är inte ett tal — visas som streck).
 */
export function vardeminskningPerG15h(
  m: MaskinVardeminskning,
  arstimmar: number,
  forAr: number = new Date().getFullYear(),
): number | null {
  const perAr = vardeminskningPerAr(m, forAr);
  if (perAr == null || !(arstimmar > 0)) return null;
  return perAr / arstimmar;
}
