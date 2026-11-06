// Gallring: det som är gallrat syns som en ljusare yta, som hygget på slutavverkning (Martin 2026-11-06).
// Skogen står kvar efter en gallring och laserdatan är från före, så kartan är lika grön överallt. Skördarens spår med ett
// brett, svagt band (kranens räckvidd åt varje håll) visar var det är gallrat. Bara ritning — ytan räknas inte här.

export const GALLRAT_BREDD_M = 20;           // ca 10 m åt varje håll från stråket
export const GALLRAT_FARG = '#d9f2cc';
export const GALLRAT_OPACITET = 0.22;
/** Lager (ett per källa som bär skördarens spår). Prefixen följer källornas så att körvyns whitelist och lagerordningen tar dem. */
export const GALLRAT_LAGER = { plan: 'planspar-skordare-gallrat', andras: 'hyttspar-andras-gallrat', egen: 'hyttspar-egen-gallrat', hist: 'hyttspar-hist-gallrat' } as const;

/** Linjebredd i px som motsvarar `meter` på marken vid latituden (MapLibre, 512 px rutor). */
export function bandBredd(meter: number, lat: number): any[] {
  const mPerPx = (z: number) => (40_075_016 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z);
  const px = (z: number) => +(meter / mPerPx(z)).toFixed(2);
  return ['interpolate', ['exponential', 2], ['zoom'], 10, px(10), 22, px(22)];
}

/** Är objektet en gallring? */
export function arGallring(o: { typ?: string | null; huvudtyp?: string | null } | null | undefined): boolean {
  return /gallring/i.test(String(o?.huvudtyp ?? o?.typ ?? ''));
}
