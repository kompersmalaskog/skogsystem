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
// Inparametrarna bor i dim_maskin (inkopspris, avskrivning_procent) och
// sätts i /ekonomi/installningar. inkopspris NULL/0 → null tillbaka:
// ingen värdeminskning räknas för maskinen (ärligt, aldrig en 0-gissning).

export const AVSKRIVNING_PROCENT_FORVAL = 20;

/**
 * Årets värdeminskning i kr, degressivt: procent av kvarvarande värde.
 * 5 000 000 kr, 20 %: år 1 = 1 000 000, år 2 = 800 000, år 3 = 640 000 …
 * `alderAr` är 1-baserat (år 1 = första året). Okänd ålder → år 1
 * (försiktigt: högsta årskostnaden, ingen dold nedräkning).
 */
export function vardeminskningPerAr(
  inkopspris: number | null | undefined,
  procent?: number | null,
  alderAr: number = 1,
): number | null {
  const pris = Number(inkopspris);
  if (!(pris > 0)) return null;
  const p = (Number(procent) > 0 ? Number(procent) : AVSKRIVNING_PROCENT_FORVAL) / 100;
  const n = Math.max(1, Math.floor(alderAr));
  return pris * Math.pow(1 - p, n - 1) * p;
}

/**
 * Värdeminskning i kr per G15-timme: årets värdeminskning delat på
 * maskinens G15-timmar samma period. null när inköpspris saknas eller
 * timmarna är 0 (kr/0h är inte ett tal — visas som streck, aldrig 0).
 */
export function vardeminskningPerG15h(
  inkopspris: number | null | undefined,
  procent: number | null | undefined,
  arstimmar: number,
  alderAr: number = 1,
): number | null {
  const perAr = vardeminskningPerAr(inkopspris, procent, alderAr);
  if (perAr == null || !(arstimmar > 0)) return null;
  return perAr / arstimmar;
}
