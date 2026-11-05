// Var på kartan syns det som kortet handlar om? (Martin 2026-11-05: "när jag trycker i listan … kommer kortet upp men då ser jag inte symbolen")
// Kartkortet ligger nerifrån och kan täcka det mesta av en låg skärm. Den här funktionen väljer den största fria biten av kartan
// — höger om kortet, vänster om det eller ovanför det — och ger kamerans padding så att platsen hamnar mitt i den biten. Ren och testad.

export interface Ruta { left: number; top: number; right: number; bottom: number }
export interface Padding { top: number; bottom: number; left: number; right: number }

/** Minsta bredd/höjd en fri bit måste ha för att räknas. */
export const FRI_MIN_PX = 160;

/**
 * kartan = kartans ruta, kort = kortets ruta (båda i skärmkoordinater), luft = marginal runt platsen, topp = det som ligger överst (namnfältet).
 * Den bit som är störst vinner. Ryms ingen bit: platsen läggs ovanför kortet ändå (bättre än bakom).
 */
export function friYtaPadding(kartan: Ruta, kort: Ruta | null, luft: number, topp: number): Padding {
  const bas = { top: topp + luft, bottom: luft, left: luft, right: luft };
  if (!kort) return bas;
  const k = {
    left: Math.max(kartan.left, kort.left), right: Math.min(kartan.right, kort.right),
    top: Math.max(kartan.top, kort.top), bottom: Math.min(kartan.bottom, kort.bottom),
  };
  if (k.left >= k.right || k.top >= k.bottom) return bas;   // kortet ligger inte över kartan
  const H = kartan.bottom - kartan.top;
  const hoger = kartan.right - k.right;
  const vanster = k.left - kartan.left;
  const ovan = k.top - kartan.top - topp;
  const kandidater: Array<{ yta: number; p: Padding }> = [];
  if (hoger >= FRI_MIN_PX) kandidater.push({ yta: hoger * H, p: { ...bas, left: k.right - kartan.left + luft } });
  if (vanster >= FRI_MIN_PX) kandidater.push({ yta: vanster * H, p: { ...bas, right: kartan.right - k.left + luft } });
  if (ovan >= FRI_MIN_PX / 2) kandidater.push({ yta: ovan * (kartan.right - kartan.left), p: { ...bas, bottom: kartan.bottom - k.top + luft } });
  if (kandidater.length === 0) return { ...bas, bottom: Math.max(luft, kartan.bottom - k.top + luft / 2), top: topp };
  kandidater.sort((a, b) => b.yta - a.yta);
  return kandidater[0].p;
}

export type Granser = [[number, number], [number, number]];

/**
 * Vad kameran ska rymma när en rad i listan trycks (Martin 2026-11-05: "kommer inte till rätt ställe"). En symbol: bara den.
 * En linje eller yta: den OCH trakten — en stig eller väg utanför trakten visas annars utan sammanhang och man vet inte var man är.
 */
export function kameraGranser(sak: Granser | null, trakt: Granser | null, slag: 'symbol' | 'linje' | 'zon'): Granser | null {
  if (!sak) return null;
  if (slag === 'symbol' || !trakt) return sak;
  return [[Math.min(sak[0][0], trakt[0][0]), Math.min(sak[0][1], trakt[0][1])], [Math.max(sak[1][0], trakt[1][0]), Math.max(sak[1][1], trakt[1][1])]];
}
