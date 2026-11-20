// PLANERINGSVYNS KÖRSPÅR — av och på i + › Lager (Martin 2026-10-29: "jag vill kunna tända och släcka dom hela tiden").
// Planeringen ritar båda rollernas spår (lagren planspar-skordare-* och planspar-skotare-*). De är PÅ från start:
// bara ett uttryckligt false i den sparade lagerlistan (mapLayers_v4) släcker. Körvyn har egna rader (Mitt spår / den andres)
// och rörs inte av detta.
export type PlanSparRoll = 'skordare' | 'skotare';

export const PLANSPAR_NYCKEL: Readonly<Record<PlanSparRoll, string>> = { skordare: 'planSparSkordare', skotare: 'planSparSkotare' };

export const PLANSPAR_LAGER: ReadonlyArray<{ id: string; roll: PlanSparRoll; namn: string }> = [
  { id: PLANSPAR_NYCKEL.skordare, roll: 'skordare', namn: 'Skördarens spår' },
  { id: PLANSPAR_NYCKEL.skotare, roll: 'skotare', namn: 'Skotarens spår' },
];

/** På om ingen valt något — bara ett uttryckligt false släcker. */
export const planSparPa = (overlays: Record<string, unknown> | null | undefined, roll: PlanSparRoll): boolean =>
  (overlays ?? {})[PLANSPAR_NYCKEL[roll]] !== false;

/** Växla: på → false, av → true (skrivs alltid uttryckligt så valet sparas). */
export const vaxlaPlanSpar = <T extends Record<string, unknown>>(overlays: T, roll: PlanSparRoll): T =>
  ({ ...overlays, [PLANSPAR_NYCKEL[roll]]: !planSparPa(overlays, roll) });
