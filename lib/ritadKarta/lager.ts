// RITAD KARTA SOM BAKGRUND (Martin 2026-10-31: "vi tar kartorna först och gör det färdigt"). Den ritade kartan blir det femte kartlagret, "Ritad",
// bredvid Flygfoto, Karta, Topokarta och OpenStreetMap — samma val i planeringsvyn, körvyn, skotarläget och maskinläget (lib/kartlager).
//
// Det här är lagren och reglerna, rent och testbart; hämtningen och kopplingen till kartan bor i lib/hooks/useRitadKarta.ts.
//   • Bakgrund + terrängskuggning + vatten/vägar/hus finns ALLTID när Ritad är vald (också utan objekt och innan laserdatan kommit).
//   • Skogen (bilden ur laserdatan), träden och 3D-kronorna finns när objektets laserdata är hämtad.
//   • I körvyn (maskinen) är kartan PLATT: aldrig 3D-kronor, träden som symboler. Skärmen ska vara lugn medan man kör.
//   • I planeringen ställer sig skogen upp när kartan lutas över LUTAD_PITCH (som /karta-ritad): kronorna tänds, trädsymbolerna göms.
// Utseendet (färger, symboler, vektorlager) bor i lib/ritadKarta/stil.ts — samma som /karta-ritad.

import { BAKGRUND, KRONA_FARG_UTTRYCK, LUTAD_PITCH, RELIEF_KALLA, RELIEF_PAINT, VEKTOR_KALLA, VEKTOR_LAGER } from './stil';

export const RITAD_KALLA = { vektor: 'ritad-vektor', relief: 'ritad-relief', skog: 'ritad-skog', trad: 'ritad-trad', kronor: 'ritad-kronor' } as const;

export const RITAD_ID = {
  bakgrund: 'ritad-bakgrund',
  skog: 'ritad-skog',
  relief: 'ritad-relief',
  trad: 'ritad-trad',
  kronor: 'ritad-kronor',
} as const;

/** Vatten, vägar och hus: stilens vektorlager med egna id:n (ritad-*) och egen källa. */
export const RITAD_VEKTOR_LAGER = VEKTOR_LAGER.map((l) => ({ ...l, id: l.id.replace(/^rk-/, 'ritad-'), source: RITAD_KALLA.vektor }));

/** Alla lager-id:n den ritade kartan använder, nerifrån och upp. */
export const RITAD_LAGER: string[] = [RITAD_ID.bakgrund, RITAD_ID.skog, RITAD_ID.relief, ...RITAD_VEKTOR_LAGER.map((l) => l.id), RITAD_ID.kronor, RITAD_ID.trad];

/** Lagren som alltid finns när Ritad är vald (inget objekt behövs). */
export function grundLager(): any[] {
  return [
    { id: RITAD_ID.bakgrund, type: 'background', paint: { 'background-color': BAKGRUND } },
    { id: RITAD_ID.relief, type: 'hillshade', source: RITAD_KALLA.relief, paint: RELIEF_PAINT },
    ...RITAD_VEKTOR_LAGER,
  ];
}

export const grundKallor = () => ({ [RITAD_KALLA.vektor]: VEKTOR_KALLA, [RITAD_KALLA.relief]: RELIEF_KALLA });

/** Trädsymbolerna (samma som /karta-ritad): en gran per 30 m, storlek efter höjden, bara från zoom 15. */
export const tradLager = () => ({
  id: RITAD_ID.trad, type: 'symbol', source: RITAD_KALLA.trad, minzoom: 15,
  layout: {
    'icon-image': ['concat', 'rk-gran-', ['get', 'k']],
    'icon-size': ['interpolate', ['linear'], ['zoom'], 15, ['*', ['get', 's'], 0.45], 17, ['*', ['get', 's'], 0.95], 19, ['*', ['get', 's'], 1.7]],
    'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['-', 0, ['get', 's']],
  },
  paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.6, 1] },
});

export const kronorLager = () => ({
  id: RITAD_ID.kronor, type: 'fill-extrusion', source: RITAD_KALLA.kronor,
  paint: { 'fill-extrusion-color': KRONA_FARG_UTTRYCK, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-vertical-gradient': true },
});

/** Är kartan lutad så långt att skogen ska stå upp? */
export const arLutad = (pitch: number) => Number.isFinite(pitch) && pitch > LUTAD_PITCH;

/**
 * Vilka av den ritade kartans lager som syns.
 *   vald  = användaren har valt Ritad som bakgrund
 *   korvy = körvyn / maskinen: platt, aldrig 3D-kronor
 *   lutad = kartan lutad över LUTAD_PITCH (bara planeringen bryr sig)
 */
export function ritadSynlighet({ vald, korvy, lutad }: { vald: boolean; korvy: boolean; lutad: boolean }): Record<string, boolean> {
  const tre = vald && !korvy && lutad;
  const ut: Record<string, boolean> = {};
  for (const id of RITAD_LAGER) ut[id] = vald;
  ut[RITAD_ID.kronor] = tre;
  ut[RITAD_ID.trad] = vald && !tre;
  return ut;
}

/** Lagren körvyn ska släppa igenom när Ritad är vald (allt utom 3D-kronorna). */
export const RITAD_KORVY_LAGER: string[] = RITAD_LAGER.filter((id) => id !== RITAD_ID.kronor);
