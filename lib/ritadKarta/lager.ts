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

import { BAKGRUND, RELIEF_KALLA, RELIEF_PAINT, VAG_FARG, VAG_KANT, VAG_KANT_EXTRA, VEKTOR_KALLA, VEKTOR_LAGER, vagBredd, DIKE_FARG, DIKE_KANT, DIKE_KANT_EXTRA, dikeBredd } from './stil';
import { OSM_TILL_ZOOM } from './vagar';
import { SNEDSTRECK_PERIOD, snedstreckBild, snedstreckId } from '../ytaStil';
import { NARA_TRAKT_M, avstandTillTrakt, traktModell } from '../traktNara';

export const RITAD_KALLA = { vektor: 'ritad-vektor', relief: 'ritad-relief', skog: 'ritad-skog', brant: 'ritad-brant', blott: 'ritad-blott', nvdb: 'ritad-nvdb', diken: 'ritad-diken' } as const;

export const RITAD_ID = {
  bakgrund: 'ritad-bakgrund',
  skog: 'ritad-skog',
  relief: 'ritad-relief',
  brant: 'ritad-brant',
  brantLite: 'ritad-brant-lite',
  blottGles: 'ritad-blott-gles',
  blottTat: 'ritad-blott-tat',
} as const;

/** Vatten, vägar och hus: stilens vektorlager med egna id:n (ritad-*) och egen källa. */
export const RITAD_VEKTOR_LAGER = VEKTOR_LAGER.map((l) => ({ ...l, id: l.id.replace(/^rk-/, 'ritad-'), source: RITAD_KALLA.vektor }));

/**
 * Trafikverkets vägar (NVDB, lib/ritadKarta/vagar) per trakt, i SAMMA stil som OpenStreetMaps: grusfärg med mörk kant. Kanterna ligger under
 * alla vägfyllningar (lib/lagerOrdning), så där båda källorna har vägen blir det EN väg, inte två.
 */
export const RITAD_NVDB_ID = { kant: 'ritad-nvdb-kant', vag: 'ritad-nvdb' } as const;
export const RITAD_NVDB_LAGER = [
  { id: RITAD_NVDB_ID.kant, type: 'line', source: RITAD_KALLA.nvdb, minzoom: OSM_TILL_ZOOM, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': VAG_KANT, 'line-width': vagBredd(['get', 'k'], VAG_KANT_EXTRA) } },
  { id: RITAD_NVDB_ID.vag, type: 'line', source: RITAD_KALLA.nvdb, minzoom: OSM_TILL_ZOOM, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['match', ['get', 'k'], 'stor', VAG_FARG.stor, VAG_FARG.skog], 'line-width': vagBredd(['get', 'k'], 0) } },
];

/** Dikena (lib/ritadKarta/diken): ovanpå blött och vattendrag, under brant och vägar. */
export const RITAD_DIKE_ID = { kant: 'ritad-dike-kant', dike: 'ritad-dike' } as const;
export const RITAD_DIKE_LAGER = [
  { id: RITAD_DIKE_ID.kant, type: 'line', source: RITAD_KALLA.diken, minzoom: 12, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': DIKE_KANT, 'line-width': dikeBredd(DIKE_KANT_EXTRA), 'line-opacity': 0.8 } },
  { id: RITAD_DIKE_ID.dike, type: 'line', source: RITAD_KALLA.diken, minzoom: 12, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': DIKE_FARG, 'line-width': dikeBredd(0) } },
];

/** OpenStreetMaps väglager (göms nära när Trafikverkets vägar finns, lib/ritadKarta/vagar `OSM_TILL_ZOOM`). */
export const RITAD_OSM_VAG_ID = ['ritad-vag-kant', 'ritad-vag'] as const;

/** Alla lager-id:n den ritade kartan använder, nerifrån och upp. */
export const RITAD_LAGER: string[] = [RITAD_ID.bakgrund, RITAD_ID.skog, RITAD_ID.relief, RITAD_ID.blottGles, RITAD_ID.blottTat, ...RITAD_VEKTOR_LAGER.map((l) => l.id), RITAD_DIKE_ID.kant, RITAD_DIKE_ID.dike, RITAD_NVDB_ID.kant, RITAD_NVDB_ID.vag, RITAD_ID.brantLite, RITAD_ID.brant];

/** Lagren som alltid finns när Ritad är vald (inget objekt behövs). */
export function grundLager(): any[] {
  return [
    { id: RITAD_ID.bakgrund, type: 'background', paint: { 'background-color': BAKGRUND } },
    { id: RITAD_ID.relief, type: 'hillshade', source: RITAD_KALLA.relief, paint: RELIEF_PAINT },
    ...RITAD_VEKTOR_LAGER,
    ...RITAD_DIKE_LAGER,
    ...RITAD_NVDB_LAGER,
  ];
}

export const grundKallor = () => ({
  [RITAD_KALLA.vektor]: VEKTOR_KALLA,
  [RITAD_KALLA.relief]: RELIEF_KALLA,
  [RITAD_KALLA.nvdb]: { type: 'geojson' as const, data: { type: 'FeatureCollection' as const, features: [] as unknown[] } },
  [RITAD_KALLA.diken]: { type: 'geojson' as const, data: { type: 'FeatureCollection' as const, features: [] as unknown[] } },
});

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
export const BLOTT_STRECK = { gles: 12, tat: 6, tjockGles: 1, tjockTat: 2 } as const;   // tunnare streck 2026-11-06, samma gradering
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

/** Full styrka inne i trakten och 50 m runt den; längre ut tonas strecken (Martin 2026-11-06: kartan lugn runt omkring). `_ute` sätts av `blottMedTrakt`. */
export const BLOTT_UTE_OPACITET = 0.25;
export const BLOTT_OPACITET: any[] = ['case', ['==', ['get', '_ute'], true], BLOTT_UTE_OPACITET, 0.9];

/** Märker blöta ytor som ligger mer än 50 m från trakten (`_ute: true`). Utan trakt: oförändrat (allt full styrka). */
export function blottMedTrakt<T extends { features?: any[] }>(fc: T, trakt: [number, number][][] | null | undefined): T {
  if (!fc || !Array.isArray(fc.features) || !trakt?.length) return fc;
  const modell = traktModell({ features: trakt.map((r) => ({ type: 'Feature', properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [r] } })) });
  if (!modell) return fc;
  return { ...fc, features: fc.features.map((f) => (f?.geometry && avstandTillTrakt(f.geometry, modell, NARA_TRAKT_M) > NARA_TRAKT_M ? { ...f, properties: { ...f.properties, _ute: true } } : f)) };
}

export const blottLager = () => [
  { id: RITAD_ID.blottGles, type: 'fill', source: RITAD_KALLA.blott, filter: ['==', ['get', 'k'], 'fuktig'], paint: { 'fill-pattern': BLOTT_MONSTER.gles, 'fill-opacity': BLOTT_OPACITET } },
  { id: RITAD_ID.blottTat, type: 'fill', source: RITAD_KALLA.blott, filter: ['==', ['get', 'k'], 'blot'], paint: { 'fill-pattern': BLOTT_MONSTER.tat, 'fill-opacity': BLOTT_OPACITET } },
];

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
