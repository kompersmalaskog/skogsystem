// "LARMA INTE" PÅ EN EGEN YTA (Martin 2026-10-29, Skälviken): planeraren ritar en Hänsyn-yta och skriver vad som ska göras i den (kommentar → instruktionskortet),
// och väljer om den ska larma. Ibland avverkas det inne i ytan (stämplade träd) och då är "kör inte här" fel varje gång maskinen kör in.
//
//  - Fältet `larmaInte: true` på markeringen (JSONB, ingen migration). Av = fältet TAS BORT, så en yta som aldrig rörts sparas som förut.
//  - Bara LARMET tystnar (larmkortet, ljudet och fällningscirkeln). Ytan ritas, instruktionen och målbilden visas som förut.
//  - Samma sak för Vidas hänsynsytor finns i lib/vidaAvverkas (där i en egen tabell, Vidas data ändras aldrig).

import { ytaDef } from './larm/grupper';

/** Brytarens text — SAMMA på Vidas hänsynsyta och på egna ytor (Martin 2026-10-29). */
export const LARMA_INTE = {
  titel: 'Larma inte',
  pa: 'Larmar inte när maskinen kör in. Instruktionen och målbilden visas som förut.',
  av: 'Slå på om det avverkas inne i ytan.',
} as const;

/** Kan ytan larma alls (och därmed stängas av)? Gallringszonen och okända typer larmar aldrig. */
export const kanStangaAvLarm = (m: { isZone?: boolean; zoneType?: string } | null | undefined): boolean => !!m?.isZone && !!ytaDef(m.zoneType);

/** Är larmet avstängt på den här egna ytan? */
export const larmarInte = (m: { isZone?: boolean; larmaInte?: unknown } | null | undefined): boolean => !!m?.isZone && m.larmaInte === true;

/** Sätt eller ta bort. Av = fältet tas bort (aldrig `false`). */
export function medLarmaInte<T extends Record<string, any>>(m: T, pa: boolean): T {
  if (pa) return { ...m, larmaInte: true };
  const { larmaInte: _bort, ...resten } = m;
  return resten as T;
}
