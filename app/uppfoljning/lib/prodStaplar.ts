/**
 * "Produktion per dag" — hur staplarna får plats (2026-11-26).
 *
 * Mätt i Chromium: varje stapel bar sin siffra (11 px) och sitt datum (13 px)
 * och kunde aldrig bli smalare än texten. Från 11 dagar på en telefon (390 px),
 * 10 på 360 px och 20 på 640 px sköt staplarna ut ur kortet och de sista
 * dagarna syntes inte. Prod 2026-11-26: 6 objekt har 15 dagar eller fler.
 *
 * Regeln: staplarna delar alltid på kortets bredd. Siffran ovanför står bara
 * när den ryms, datumen glesas ut till var k:te. Okänd bredd (0) = som förut.
 */
export const STAPEL_GAP = 8;
export const STAPEL_GAP_TAT = 2;
/** Smalaste kolumn där siffran (tre siffror, 11 px fet) ryms. */
export const SIFFRA_MIN_PX = 26;
/** Bredd ett datum ("10/10", 13 px) behöver inklusive luft. */
export const DATUM_PX = 38;

export type StapelLayout = {
  gap: number;
  /** Siffran ovanför varje stapel. */
  visaSiffror: boolean;
  /** Datum under var k:te stapel (1 = alla). */
  datumVarK: number;
};

export function stapelLayout(bredd: number, antal: number): StapelLayout {
  if (!(bredd > 0) || antal <= 0) return { gap: STAPEL_GAP, visaSiffror: true, datumVarK: 1 };
  const kol = (g: number) => (bredd - g * (antal - 1)) / antal;
  const gap = kol(STAPEL_GAP) >= 12 ? STAPEL_GAP : STAPEL_GAP_TAT;
  const steg = kol(gap) + gap;
  return {
    gap,
    visaSiffror: kol(gap) >= SIFFRA_MIN_PX,
    datumVarK: Math.max(1, Math.ceil(DATUM_PX / steg)),
  };
}

/** Datum visas under första stapeln och var k:te därefter. */
export function visaDatum(i: number, k: number): boolean {
  return i % k === 0;
}
