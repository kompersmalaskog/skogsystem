// Färskhetsstämpeln på planeringskartan ("Uppdaterad 07:31 · Uppdatera").
// Regeln: fast på kartan bara objektnamn, ⓘ och + (Martin 2026-10-25). Stämpeln är därför ingen
// statusrad som alltid syns — den kommer bara när något är fel och det finns något att göra.

/** Markeringarna räknas som gamla efter så här många minuter; då hämtas de om av sig själva. */
export const FARSKHET_GAMMAL_MIN = 10;

/** Syns stämpeln? Bara när datan är gammal (omhämtningen har inte lyckats) eller något väntar på servern. */
export function stampelSyns(lage: { gammal: boolean; vantar: number }): boolean {
  return lage.gammal || lage.vantar > 0;
}
