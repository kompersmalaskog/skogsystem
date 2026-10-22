// FASTIGHETSGRÄNSENS KARTLAGER — EN källa för sidan (app/planering/page.tsx) och mätningen i riktig Chromium (lib/fastighetsgransKarta.hytt.test.ts).
// Vad som ritas och varför (Martin 2026-10-22, "Fastighetsgräns supertydlig"):
//   • Rågången är en VIT linje med mörk kant, bred, så den syns på både flygfoto och vit karta. Den ersätter den gula Lantmäteri-rasterlinjen som krockade med
//     basvägens gula snitsel. Ingen röd linje: rött betyder fara.
//   • Gränspinnarna är röda prickar med vit kant längs linjen, som röda pinnar i fält.
//   • Traktgränsen (röd/gul snitsel) ligger SMAL OVANPÅ rågången. Där de sammanfaller blir det ett vitt band med snitselstreck, där de skiljer sig syns båda — ingen
//     döljer den andra (därför har traktgränsen ingen bred svart kant som skulle täcka det vita).
//   • Vems mark: fastigheten trakten ligger på får ett svagt ljust skimmer, grannarnas mark tonas ned något. Vet appen inte vilken fastighet det är (trakten på två,
//     eller delvis utanför det Vida levererat) ritas ingen av dem — hellre lika än fel (lib/fastighetsgrans: bedomAgare).
//   • Beteckningen står längs gränsen på båda sidor.
// Lagren heter trakt-ragang-* så att körvyns lager-whitelist (prefixet trakt-) släpper igenom dem.

import { LEGEND } from './kartstil';

export const RAGANG_KALLOR = {
  yta: 'trakt-ragang-yta-source',
  linje: 'trakt-ragang-linje-source',
  pinne: 'trakt-ragang-pinne-source',
  etikett: 'trakt-ragang-etikett-source',
} as const;

export const RAGANG_LAGER = {
  ytaEgen: 'trakt-ragang-yta-egen',
  ytaGranne: 'trakt-ragang-yta-granne',
  kant: 'trakt-ragang-kant',
  linje: 'trakt-ragang-linje',
  hit: 'trakt-ragang-hit',
  pinne: 'trakt-ragang-pinne',
  etikett: 'trakt-ragang-etikett',
} as const;

/** Alla lagren i den ordning de ska ligga (underst först). Tryck-lagret ligger sist bland linjerna och syns inte. */
export const RAGANG_LAGER_ORDNING: readonly string[] = [
  RAGANG_LAGER.ytaEgen, RAGANG_LAGER.ytaGranne, RAGANG_LAGER.kant, RAGANG_LAGER.linje, RAGANG_LAGER.hit, RAGANG_LAGER.pinne, RAGANG_LAGER.etikett,
];

// -- färger -------------------------------------------------------------------------------------------------------------------------
export const RAGANG_FARG = '#ffffff';
export const RAGANG_KANT_FARG = 'rgba(0,0,0,0.85)';
/** Pinnen är röd (som en röd pinne i fält) med vit kant. */
export const PINNE_FARG = LEGEND.fara;
export const PINNE_KANT_FARG = '#ffffff';
/** Svagt ljust skimmer på trakten egen fastighet; grannarnas mark något nedtonad. */
export const SKIMMER_EGEN = { color: '#ffffff', opacity: 0.1 } as const;
export const NEDTONING_GRANNE = { color: '#000000', opacity: 0.26 } as const;

// -- bredder (px per zoom) ----------------------------------------------------------------------------------------------------------
/** Rågångens vita kärna. Bred: den ska synas på flygfoto i en maskin som skakar, OCH ligga kvar som ett vitt band på båda sidor om traktgränsen när de sammanfaller (mätt: 8 px åts upp helt av traktgränsens kant). */
export const RAGANG_BREDD = ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 8, 17, 12, 19, 16] as const;
/** Mörk kant: kärnan + 1,5 px på varje sida. */
export const RAGANG_KANT_BREDD = ['interpolate', ['linear'], ['zoom'], 10, 7, 14, 11, 17, 15, 19, 19] as const;
/** Osynlig tryckyta runt rågången (±11 px). */
export const RAGANG_TRYCK_BREDD = 22;
/** Pinnen är större än rågångens kärna, så den syns som en röd prick på det vita bandet. */
export const PINNE_RADIE = ['interpolate', ['linear'], ['zoom'], 12, 3.5, 15, 5.5, 17, 8, 19, 10] as const;
export const PINNE_KANT_BREDD = ['interpolate', ['linear'], ['zoom'], 12, 1, 17, 1.6, 19, 2] as const;
/** Beteckningen syns först från den zoom där den får plats bredvid rågången (inskjutningen är 14 m). */
export const ETIKETT_MIN_ZOOM = 16;

/** Traktgränsen OVANPÅ rågången: smal och utan bred kant. Före: 3/5/8 px med en svart kant 5/8/12 px som täckte allt under. */
export const TRAKTGRANS_BREDD = ['interpolate', ['linear'], ['zoom'], 8, 1.5, 14, 2.5, 17, 4] as const;
export const TRAKTGRANS_KANT_BREDD = ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 3.5, 17, 5.5] as const;
/** Kanten runt traktgränsen är bara en tunn mörk linje (0,75–1 px per sida), aldrig ett svart band. */
export const TRAKTGRANS_KANT_FARG = 'rgba(0,0,0,0.55)';

const sidaFilter = (sida: string) => ['==', ['get', 'sida'], sida];

/** Källorna, alla tomma tills sidan pumpar in data (ur lib/fastighetsgrans byggRagang). */
export function ragangKallor(): [string, { type: 'geojson'; data: { type: 'FeatureCollection'; features: never[] } }][] {
  return Object.values(RAGANG_KALLOR).map((id) => [id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }]);
}

/** Lagerspecarna (alla börjar osynliga — sidans synlighetseffekt tänder dem). `nedre` = ska ligga UNDER alla andra vektorlager (skimret). */
export function ragangLager(): { spec: any; nedre: boolean }[] {
  const dold = { visibility: 'none' as const };
  return [
    { nedre: true, spec: { id: RAGANG_LAGER.ytaEgen, type: 'fill', source: RAGANG_KALLOR.yta, filter: sidaFilter('egen'), paint: { 'fill-color': SKIMMER_EGEN.color, 'fill-opacity': SKIMMER_EGEN.opacity, 'fill-antialias': false }, layout: dold } },
    { nedre: true, spec: { id: RAGANG_LAGER.ytaGranne, type: 'fill', source: RAGANG_KALLOR.yta, filter: sidaFilter('granne'), paint: { 'fill-color': NEDTONING_GRANNE.color, 'fill-opacity': NEDTONING_GRANNE.opacity, 'fill-antialias': false }, layout: dold } },
    { nedre: false, spec: { id: RAGANG_LAGER.kant, type: 'line', source: RAGANG_KALLOR.linje, paint: { 'line-color': RAGANG_KANT_FARG, 'line-width': RAGANG_KANT_BREDD }, layout: { ...dold, 'line-cap': 'round', 'line-join': 'round' } } },
    { nedre: false, spec: { id: RAGANG_LAGER.linje, type: 'line', source: RAGANG_KALLOR.linje, paint: { 'line-color': RAGANG_FARG, 'line-width': RAGANG_BREDD }, layout: { ...dold, 'line-cap': 'round', 'line-join': 'round' } } },
    { nedre: false, spec: { id: RAGANG_LAGER.hit, type: 'line', source: RAGANG_KALLOR.linje, paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': RAGANG_TRYCK_BREDD }, layout: dold } },
    { nedre: false, spec: { id: RAGANG_LAGER.pinne, type: 'circle', source: RAGANG_KALLOR.pinne, paint: { 'circle-radius': PINNE_RADIE, 'circle-color': PINNE_FARG, 'circle-stroke-color': PINNE_KANT_FARG, 'circle-stroke-width': PINNE_KANT_BREDD, 'circle-pitch-alignment': 'map' }, layout: dold } },
    { nedre: false, spec: {
      id: RAGANG_LAGER.etikett, type: 'symbol', source: RAGANG_KALLOR.etikett, minzoom: ETIKETT_MIN_ZOOM,
      layout: {
        ...dold, 'symbol-placement': 'line', 'symbol-spacing': 400, 'text-field': ['get', 'text'], 'text-font': ['Open Sans Semibold', 'Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 16, 12, 18, 14, 19, 16], 'text-keep-upright': true, 'text-max-angle': 40, 'text-padding': 2, 'text-letter-spacing': 0.02,
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.8 },
    } },
  ];
}

/** Fällningscirkeln när rågången är inom 30 m (och inget annat skyddsvärt är det): VIT, streckad, tydlig. Neutral cirkel är samma färg men svag (30 %, 2 px). */
export function fastighetsCirkelPaint(visa: boolean): Record<string, any> {
  return { 'line-color': '#ffffff', 'line-opacity': visa ? 0.95 : 0, 'line-width': 3, 'line-dasharray': [2, 2] };
}

/** Första vektorlagret i stilen (allt utom bakgrund och raster): skimret läggs under det, så det tonar bara kartan och aldrig täcker en markering. */
export function forstaVektorLagerId(lager: ReadonlyArray<{ id: string; type: string }>): string | undefined {
  return lager.find((l) => l.type !== 'background' && l.type !== 'raster' && l.type !== 'hillshade' && l.type !== 'color-relief')?.id;
}
