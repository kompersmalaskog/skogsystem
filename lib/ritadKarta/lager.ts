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
import { SNEDSTRECK_PERIOD, snedstreckBild, snedstreckId } from '../ytaStil';

export const RITAD_KALLA = { vektor: 'ritad-vektor', relief: 'ritad-relief', skog: 'ritad-skog', brant: 'ritad-brant', blott: 'ritad-blott', kurvor: 'ritad-kurvor' } as const;

export const RITAD_ID = {
  bakgrund: 'ritad-bakgrund',
  skog: 'ritad-skog',
  relief: 'ritad-relief',
  brant: 'ritad-brant',
  brantLite: 'ritad-brant-lite',
  blottGles: 'ritad-blott-gles',
  blottTat: 'ritad-blott-tat',
  kurvor: 'ritad-kurvor',
} as const;

/** Vatten, vägar och hus: stilens vektorlager med egna id:n (ritad-*) och egen källa. */
export const RITAD_VEKTOR_LAGER = VEKTOR_LAGER.map((l) => ({ ...l, id: l.id.replace(/^rk-/, 'ritad-'), source: RITAD_KALLA.vektor }));

/** Alla lager-id:n den ritade kartan använder, nerifrån och upp. */
export const RITAD_LAGER: string[] = [RITAD_ID.bakgrund, RITAD_ID.skog, RITAD_ID.relief, RITAD_ID.blottGles, RITAD_ID.blottTat, RITAD_ID.kurvor, ...RITAD_VEKTOR_LAGER.map((l) => l.id), RITAD_ID.brantLite, RITAD_ID.brant];

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
/** Mycket brant = appens Brant-mönster (täta röda snedstreck); lite brant = samma röda men glesare (varannat streck). */
export const BRANT_MONSTER = snedstreckId('fara');
export const BRANT_LITE_MONSTER = 'ritad-brant-lite';
/** Glesa röda snedstreck: samma bild som Brant-ytan med vartannat streck borta (dubbelt så långt mellan strecken). */
export function brantLiteBild(): { width: number; height: number; data: Uint8ClampedArray } {
  const b = snedstreckBild('fara');
  const data = new Uint8ClampedArray(b.data.length * 4);
  const W = b.width * 2;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if ((x + y) % (2 * SNEDSTRECK_PERIOD) >= SNEDSTRECK_PERIOD) continue;
    const s = ((y % b.height) * b.width + (x % b.width)) * 4, o = (y * W + x) * 4;
    for (let j = 0; j < 4; j++) data[o + j] = b.data[s + j];
  }
  return { width: W, height: W, data };
}
export const brantLager = () => [
  { id: RITAD_ID.brantLite, type: 'fill', source: RITAD_KALLA.brant, filter: ['==', ['get', 'k'], 'lite'], paint: { 'fill-pattern': BRANT_LITE_MONSTER, 'fill-opacity': 0.9 } },
  { id: RITAD_ID.brant, type: 'fill', source: RITAD_KALLA.brant, filter: ['==', ['get', 'k'], 'mycket'], paint: { 'fill-pattern': BRANT_MONSTER, 'fill-opacity': 0.9 } },
];

/**
 * Blöt mark (lib/ritadKarta/mark.ts): blå vågräta streck som orienteringskartans myr — glesa = fuktigt, täta = blött (Martin 2026-10-31: "så lätt
 * att ett barn förstår det direkt"). Strecken syns ovanpå all skog utan att färga om den. Det täta mönstret har varannan rad på samma plats som
 * det glesa, så där båda ligger ser det ut som bara täta streck.
 */
export const BLOTT_MONSTER = { gles: 'ritad-blott-gles', tat: 'ritad-blott-tat' } as const;
/** Strecken i pixlar: period (avstånd mellan strecken) och tjocklek för glest resp. tätt. Tätt = dubbelt så många och lite tjockare. */
export const BLOTT_STRECK = { gles: 12, tat: 6, tjockGles: 2, tjockTat: 3 } as const;
/** Myrens blå (samma som Blött-gruppen i appen). */
export const BLOTT_FARG: readonly [number, number, number] = [10, 132, 255];

/** Mönsterbild: blå vågräta streck över hela bredden, `period` px mellan strecken. */
export function blottMonsterBild(period: number): { width: number; height: number; data: Uint8ClampedArray } {
  const tjock = period === BLOTT_STRECK.tat ? BLOTT_STRECK.tjockTat : BLOTT_STRECK.tjockGles;
  const w = 24, h = BLOTT_STRECK.gles * 2;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    if (y % period >= tjock) continue;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = BLOTT_FARG[0]; data[i + 1] = BLOTT_FARG[1]; data[i + 2] = BLOTT_FARG[2]; data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

export const blottLager = () => [
  { id: RITAD_ID.blottGles, type: 'fill', source: RITAD_KALLA.blott, filter: ['==', ['get', 'k'], 'fuktig'], paint: { 'fill-pattern': BLOTT_MONSTER.gles, 'fill-opacity': 0.9 } },
  { id: RITAD_ID.blottTat, type: 'fill', source: RITAD_KALLA.blott, filter: ['==', ['get', 'k'], 'blot'], paint: { 'fill-pattern': BLOTT_MONSTER.tat, 'fill-opacity': 0.9 } },
];

/**
 * Höjdkurvor (lib/ritadKarta/hojd.ts) som på orienteringskartan: tunna bruna linjer, var 5:e (stödkurvan, `s` = 1) lite tjockare. De tonar in från
 * zoom 13 — utzoomat blir de ett brus. Ingen text på kurvorna. Ligger ovanpå skogen och blött, under vatten, vägar och allt man planerar.
 */
export const KURVA_FARG = '#c99a62';
export const kurvLager = () => ({
  id: RITAD_ID.kurvor, type: 'line', source: RITAD_KALLA.kurvor, minzoom: 13,
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: {
    'line-color': KURVA_FARG,
    'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, ['case', ['==', ['get', 's'], 1], 0.75, 0.55]],
    'line-width': ['interpolate', ['linear'], ['zoom'], 13, ['case', ['==', ['get', 's'], 1], 0.8, 0.4], 17, ['case', ['==', ['get', 's'], 1], 2.2, 1.2]],
  },
});

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
