// ForestLink-tillägget (FL) på timpeng — EN plats för beloppet och regeln.
// Beloppet ändras HÄR (FORESTLINK_KR_PER_TIM) och ingen annanstans.
//
// En maskin som är ansluten till ForestLink får FORESTLINK_KR_PER_TIM kr per
// timme ovanpå sitt timpris. Det gäller hela året (konstant, ingen
// datumhistorik) och styrs av dim_maskin.forestlink (default true — de flesta
// maskiner har FL; JD810E har det inte).
//
// Tillägget läggs på timpris-RADERNA direkt efter att de lästs, innan någon
// räknar — så allt som läser timpriset (timpeng-betalning i Översikten,
// timpeng-sidan i Mot ackord/Per klass, brytpunkten, timpeng-undantaget på
// ackordobjekt, fakturaunderlaget) får samma effektiva pris. Betalning och
// jämförelse kan inte drifta isär eftersom det inte finns två ställen.
//
// Prislistan (redigeraren) läser BASpriset ur maskin_timpris och använder
// aldrig medForestlink — annars skulle ett sparat pris bli bas plus FL och
// tillägget läggas på ytterligare en gång varje gång man sparar.

export const FORESTLINK_KR_PER_TIM = 10;

/**
 * Tillägget i kr/tim för en maskin. Bara ett uttryckligt true ger tillägg:
 * false (810E) = inget, och null/saknas = inget — okänt är inte "ja", och ett
 * påhittat tillägg vore en tyst prisändring (ärlig data eller ingen data).
 * Kolumnen är NOT NULL default true, så null uppstår bara om maskinen helt
 * saknas i dim_maskin.
 */
export function forestlinkKrPerTim(forestlink: boolean | null | undefined): number {
  return forestlink === true ? FORESTLINK_KR_PER_TIM : 0;
}

/**
 * Effektiva timpris-rader: varje rads timpris + maskinens FL-tillägg.
 * Returnerar NYA objekt (indata muteras aldrig) och bevarar alla andra fält
 * (giltighetsdatum, namn …) så den är en drop-in för MaskinTimpris[].
 */
export function medForestlink<T extends { maskin_id: string; timpris: number }>(
  timpriser: T[],
  maskiner: { maskin_id: string; forestlink?: boolean | null }[],
): T[] {
  const fl = new Map<string, boolean | null | undefined>();
  for (const m of maskiner) fl.set(m.maskin_id, m.forestlink);
  return timpriser.map(p => ({ ...p, timpris: Number(p.timpris) + forestlinkKrPerTim(fl.get(p.maskin_id)) }));
}
