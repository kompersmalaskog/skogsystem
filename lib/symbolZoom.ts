// Symboler och etiketter på planeringskartan tonas bort när trakten är för liten på skärmen för att de ska gå att läsa, och kommer tillbaka vid
// inzoomning. Bara planeringsvyn (objektListaVal) — körvyn och /maskin rörs inte. Rena funktioner + en liten kartfunktion, inget React.
//
// TRÖSKELN: symbolerna syns när HELA TRAKTEN fyller ungefär halva skärmen (den kortare sidan). Tröskeln är alltså en zoomnivå som räknas ur
//   (1) traktens längsta sida i meter — den öppna traktens riktiga gräns (L_TRAKTDEL) när den är läst, annars en TYPISK trakt (430 m = medianen av
//       de åtta traktgränserna i fixturen lib/__fixtures__/trestensdal_almehult_2026-10-07.json: 284–684 m, en avvikare på 3 km),
//   (2) kartans kortare sida i pixlar (telefon 390 px, maskindator/dator 800 px),
//   (3) latituden (meter per pixel krymper med cos(lat)).
//   MapLibre-zoom 0 = 512 px för hela jorden → meter/px = 40 075 017 / 512 / 2^zoom · cos(lat).
//   För en typisk trakt (430 m) vid lat 56,4: telefon (390 px) → z 14,3; dator (800 px) → z 15,3. En 3 km-trakt → 11,5 / 12,5; en 100 m-trakt → klipps av taket.
//   TAK: aldrig högre än 15,5 — objektets egen öppningsvy (svepet, högst zoom 17) ska ALLTID visa symbolerna, även för en liten trakt som aldrig
//   fyller halva skärmen. GOLV: 8 = kartans eget minZoom (inget ligger lägre) — INTE högre: ett golv på 11 dolde symbolerna på en 8 km-trakt som fyllde skärmen
//   (svepets slutzoom 10,5 låg under golvet; hittat av testet 'markeringarna ska synas när svepet är klart').
//
// KLIPPET är hårt (MapLibres minzoom per lager), inte en genomskinlig övergång: markers-layer styr sin icon-opacity ur briefinglägets och körvyns
// uttag, och ett eget opacitetsuttryck ovanpå skulle krocka med dem. Lagrens ursprungliga zoomintervall sparas och återställs exakt.

export const SYMBOL_TYPISK_TRAKT_M = 430;
export const SYMBOL_HALVA_SKARMEN = 0.5;
export const SYMBOL_TAK_ZOOM = 15.5;
export const SYMBOL_GOLV_ZOOM = 8;
const METER_PER_PX_ZOOM0 = 40075016.686 / 512;

/** Lagren som bär symboler och etiketter (och deras osynliga träffytor, så ett tryck inte öppnar ett kort för något man inte ser). */
export const SYMBOL_LAGER: readonly string[] = [
  'markers-layer', 'markers-hit',            // symboler (avlägg, högstubbe, fara …)
  'arrows-layer', 'arrows-hit',              // pilar
  'trakt-punkt-circle', 'trakt-punkt-label', // Vidas punkter (avlägg, larm) och deras etiketter
  'trakt-hansyn-label', 'trakt-nb-label', 'trakt-raa-label', 'yta-nr-label', 'yta-nr-hit', 'zone-label', 'line-mainroad-label',
  'hogar-circle', 'hogar-cluster-label', 'hogar-hit',   // produktionshögar
  'grot-circle', 'grot-label',
  'larm-pin', 'larm-pin-hit',
  'trail-footprints',
];

/** Symbollager som medvetet INTE klipps: verktyg (rita/mät), maskinens position, körvyns egen etikett (körvy-bara), skotarens avläggsrutor (körvy-bara, ska alltid synas), backvägens tvärstreck (en del av vägens linje, ska synas på alla zoomnivåer). Varje `type: 'symbol'`-lager i page.tsx måste stå i någon av listorna. */
export const SYMBOL_UNDANTAG: readonly string[] = ['figur-etikett', 'hornedit-nr', 'maskin-symbol', 'markers-korvy-label', 'skotar-avlagg-ruta', 'line-backvag', 'trakt-kraftledning-stolpar', 'trakt-kraftledning-symbol', 'line-powerline-stolpar', 'line-powerline-symbol'];

const rad = (g: number) => (g * Math.PI) / 180;

/** Traktens längsta sida i meter ur ett FeatureCollection (L_TRAKTDEL-ytor); null om det saknas. */
export function traktStorlekM(fc: { features?: any[] } | null | undefined): number | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const scan = (c: any): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      if (c[0] < minLng) minLng = c[0]; if (c[0] > maxLng) maxLng = c[0];
      if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1];
    } else for (const x of c) scan(x);
  };
  for (const f of fc?.features ?? []) {
    if (f?.properties?._lager === 'L_TRAKTDEL' && f?.geometry?.coordinates) scan(f.geometry.coordinates);
  }
  if (!Number.isFinite(minLng)) return null;
  const lat0 = (minLat + maxLat) / 2;
  const w = (maxLng - minLng) * 111320 * Math.cos(rad(lat0));
  const h = (maxLat - minLat) * 110540;
  const m = Math.max(w, h);
  return m > 0 ? m : null;
}

/** Meter per pixel vid en MapLibre-zoom och latitud. */
export const meterPerPx = (zoom: number, lat: number) => (METER_PER_PX_ZOOM0 * Math.cos(rad(lat))) / 2 ** zoom;

/** Zoomnivån under vilken symbolerna göms: trakten (traktM, annars en typisk) fyller `SYMBOL_HALVA_SKARMEN` av kartans kortare sida (kortsidaPx). */
export function symbolTroskel(o: { traktM: number | null | undefined; lat: number; kortsidaPx: number }): number {
  const L = Math.min(20000, Math.max(50, o.traktM && o.traktM > 0 ? o.traktM : SYMBOL_TYPISK_TRAKT_M));
  const px = Math.max(100, o.kortsidaPx);
  const z = Math.log2((METER_PER_PX_ZOOM0 * Math.cos(rad(o.lat)) * SYMBOL_HALVA_SKARMEN * px) / L);
  return Math.min(SYMBOL_TAK_ZOOM, Math.max(SYMBOL_GOLV_ZOOM, z));
}

// Lagrens ursprungliga zoomintervall per karta — återställs exakt (aldrig ett gissat 0–24).
const ursprung = new WeakMap<object, Map<string, { min: number; max: number }>>();

/**
 * Klipper symbollagren under `troskel` (zoom), eller återställer dem (troskel = null). Idempotent; lager som inte finns (ännu) hoppas över och tas
 * när de skapats (anropa igen vid 'styledata'). Rör aldrig något annat lager. Returnerar antalet lager som sattes.
 */
export function tillampaSymbolZoom(map: any, troskel: number | null): number {
  let antal = 0;
  const sparade = ursprung.get(map) ?? new Map<string, { min: number; max: number }>();
  ursprung.set(map, sparade);
  for (const id of SYMBOL_LAGER) {
    let lager: any;
    try { lager = map.getLayer(id); } catch { lager = null; }
    if (!lager) continue;
    if (!sparade.has(id)) {
      if (troskel == null) continue;                       // inget att återställa: lagret har aldrig klippts
      sparade.set(id, { min: typeof lager.minzoom === 'number' ? lager.minzoom : 0, max: typeof lager.maxzoom === 'number' ? lager.maxzoom : 24 });
    }
    const o = sparade.get(id)!;
    const min = troskel == null ? o.min : Math.max(o.min, troskel);
    if (lager.minzoom === min && lager.maxzoom === o.max) { if (troskel == null) sparade.delete(id); continue; }
    try { map.setLayerZoomRange(id, min, o.max); antal++; } catch { /* stilen laddas om */ }
    if (troskel == null) sparade.delete(id);
  }
  return antal;
}
