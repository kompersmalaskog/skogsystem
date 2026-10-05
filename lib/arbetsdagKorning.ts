// Körningens delar för en arbetsdag, ur km-kedjan (/api/km-chain): första benet är
// morgonen (hem → första objektet), sista kvällen (sista objektet → hem), allt
// däremellan är Flytt (mellan objekt). Reseersättningen räknas på pendlingen
// (morgon + kväll = Körning-talet); Flytt ingår INTE i det talet och visas därför
// som en egen rad utanför summan, aldrig som en del av den (design 2026-10-05:
// summan ska vara summan av det som visas — annars läses totalen som ett räknefel).

export type KorningBen = { km: number };

export type KorningDelar = {
  morgon: number;
  kvall: number;
  /** Summan av benen mellan objekten. 0 = ingen flytt den dagen. */
  flytt: number;
};

/** Delar ur kedjan, eller null när kedjan inte säger något (färre än två ben). */
export function delaKorning(ben: KorningBen[] | null | undefined): KorningDelar | null {
  if (!ben || ben.length < 2) return null;
  const km = (b: KorningBen) => Math.round(Number(b.km) || 0);
  return {
    morgon: km(ben[0]),
    kvall: km(ben[ben.length - 1]),
    flytt: ben.slice(1, -1).reduce((a, b) => a + km(b), 0),
  };
}

/** "Morgon 33 · Kväll 33" — bara det som ingår i Körning-talet. */
export function korningDelarText(d: KorningDelar): string {
  return `Morgon ${d.morgon} · Kväll ${d.kvall}`;
}
