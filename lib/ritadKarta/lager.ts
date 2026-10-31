// RITAD KARTA SOM BAKGRUND (Martin 2026-10-31: "vi tar kartorna först och gör det färdigt"). Den ritade kartan blir det femte kartlagret, "Ritad",
// bredvid Flygfoto, Karta, Topokarta och OpenStreetMap — samma val i planeringsvyn, körvyn, skotarläget och maskinläget (lib/kartlager).
//
// Det här är lagren och reglerna, rent och testbart; hämtningen och kopplingen till kartan bor i lib/hooks/useRitadKarta.ts.
//   • Bakgrund + terrängskuggning + vatten/vägar/hus finns ALLTID när Ritad är vald (också utan objekt och innan laserdatan kommit).
//   • Skogen (bilden ur laserdatan) finns när objektets laserdata är hämtad. Inga trädsymboler (Martin 2026-10-31: de stod jämnt utströdda och sa
//     inget färgen inte redan sa — kartan ska vara lugn). Trädsymbolerna finns kvar på provsidan /karta-ritad.
//   • Kartan är PLATT överallt här — aldrig 3D-kronor, inte heller i planeringen när kartan lutas (Martin 2026-10-31, Kompersmåla väggata: kronorna
//     reser sig över terrängen och döljer traktgräns, vägar och symboler — "ska allt hamna under så?"). Skogen ligger UNDER allt man planerar.
//     3D-skogen finns kvar på provsidan /karta-ritad.
// Utseendet (färger, symboler, vektorlager) bor i lib/ritadKarta/stil.ts — samma som /karta-ritad.

import { BAKGRUND, RELIEF_KALLA, RELIEF_PAINT, VEKTOR_KALLA, VEKTOR_LAGER } from './stil';
import { snedstreckId } from '../ytaStil';

export const RITAD_KALLA = { vektor: 'ritad-vektor', relief: 'ritad-relief', skog: 'ritad-skog', brant: 'ritad-brant' } as const;

export const RITAD_ID = {
  bakgrund: 'ritad-bakgrund',
  skog: 'ritad-skog',
  relief: 'ritad-relief',
  brant: 'ritad-brant',
} as const;

/** Vatten, vägar och hus: stilens vektorlager med egna id:n (ritad-*) och egen källa. */
export const RITAD_VEKTOR_LAGER = VEKTOR_LAGER.map((l) => ({ ...l, id: l.id.replace(/^rk-/, 'ritad-'), source: RITAD_KALLA.vektor }));

/** Alla lager-id:n den ritade kartan använder, nerifrån och upp. */
export const RITAD_LAGER: string[] = [RITAD_ID.bakgrund, RITAD_ID.skog, RITAD_ID.relief, ...RITAD_VEKTOR_LAGER.map((l) => l.id), RITAD_ID.brant];

/** Lagren som alltid finns när Ritad är vald (inget objekt behövs). */
export function grundLager(): any[] {
  return [
    { id: RITAD_ID.bakgrund, type: 'background', paint: { 'background-color': BAKGRUND } },
    { id: RITAD_ID.relief, type: 'hillshade', source: RITAD_KALLA.relief, paint: RELIEF_PAINT },
    ...RITAD_VEKTOR_LAGER,
  ];
}

export const grundKallor = () => ({ [RITAD_KALLA.vektor]: VEKTOR_KALLA, [RITAD_KALLA.relief]: RELIEF_KALLA });

/** Brant mark (lib/ritadKarta/mark.ts): röda snedstreck — samma tecken som Brant-ytan i appen. Ligger under vägar och allt man planerar. */
export const BRANT_MONSTER = snedstreckId('fara');
export const brantLager = () => ({ id: RITAD_ID.brant, type: 'fill', source: RITAD_KALLA.brant, paint: { 'fill-pattern': BRANT_MONSTER, 'fill-opacity': 0.9 } });

/**
 * Planeringens egna fyllningar som tonar trakten (röd 5 % över traktgränsen): på flygfoto syns de knappt, men på den ritade skogen gör de
 * trakten mörkare än skogen runt om — fel håll (trakten ska vara ljusast). De släcks medan Ritad är vald; kanten och allt annat ligger kvar.
 */
export const RITAD_DOLJ_FYLLNING = ['grans-fill', 'trakt-gr-fill'] as const;

/** Vilka av den ritade kartans lager som syns: alla när Ritad är vald, inga annars. */
export function ritadSynlighet({ vald }: { vald: boolean }): Record<string, boolean> {
  const ut: Record<string, boolean> = {};
  for (const id of RITAD_LAGER) ut[id] = vald;
  return ut;
}
