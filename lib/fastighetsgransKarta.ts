// FASTIGHETSGRÄNSENS KARTLAGER — EN källa för sidan (app/planering/page.tsx) och mätningen i riktig Chromium (lib/fastighetsgransKarta.hytt.test.ts).
// Vad som ritas och varför (Martin 2026-10-22, "Fastighetsgräns supertydlig" + de sex ändringarna efter hans test på Stänkelsmåla 2025):
//   • Rågången är en VIT linje med mörk kant, bred, så den syns på både flygfoto och vit karta. Ingen röd linje och inga röda gränspinnar: rött betyder fara.
//   • SAMMA utseende oavsett källa: Vidas fastighetsdata (vektor, nedan) går före; finns den inte ritas Lantmäteriets rasterlager i samma stil (vit kärna, mörk kant,
//     lmGransLager) — föraren ser aldrig två olika stilar för fastighetsgräns.
//   • Styrka efter närhet: stycken som berör trakten eller ligger inom ~50 m från den ritas i full styrka, övriga hälften så breda och svagare.
//   • Traktgränsen (röd/gul snitsel) ligger SMAL OVANPÅ rågången. Där de sammanfaller blir det ett vitt band med snitselstreck, där de skiljer sig syns båda.
//   • Vems mark: fastigheter som trakten överlappar får ett svagt ljust skimmer, ALLA övriga tonas ned något (vägar, hus och diken syns fortfarande) — appen vet inte
//     vem som äger vad, så det som räknas är om marken ingår i trakten. Saknas fastighetsdata helt tonas ingenting.
//   • Beteckningen står längs gränsen på båda sidor (bara beteckningen, aldrig "granne").
//   • Allt här hör till lagret "Fastighetsgränser": släckt lager = vanlig karta. Undantaget är fällningsvarningen i skördaren, som gäller alltid (säkerhet).
// Lagren heter trakt-ragang-* så att körvyns lager-whitelist (prefixet trakt-) släpper igenom dem.

import { LEGEND } from './kartstil';

export const RAGANG_KALLOR = {
  yta: 'trakt-ragang-yta-source',
  linje: 'trakt-ragang-linje-source',
  etikett: 'trakt-ragang-etikett-source',
} as const;

export const RAGANG_LAGER = {
  ytaTrakt: 'trakt-ragang-yta-trakt',
  ytaUtanfor: 'trakt-ragang-yta-utanfor',
  kantSvag: 'trakt-ragang-kant-svag',
  kant: 'trakt-ragang-kant',
  linjeSvag: 'trakt-ragang-linje-svag',
  linje: 'trakt-ragang-linje',
  hit: 'trakt-ragang-hit',
  etikett: 'trakt-ragang-etikett',
} as const;

/** Alla lagren i den ordning de ska ligga (underst först). Tryck-lagret ligger sist bland linjerna och syns inte. */
export const RAGANG_LAGER_ORDNING: readonly string[] = [
  RAGANG_LAGER.ytaTrakt, RAGANG_LAGER.ytaUtanfor, RAGANG_LAGER.kantSvag, RAGANG_LAGER.kant, RAGANG_LAGER.linjeSvag, RAGANG_LAGER.linje, RAGANG_LAGER.hit, RAGANG_LAGER.etikett,
];

// -- färger -------------------------------------------------------------------------------------------------------------------------
export const RAGANG_FARG = '#ffffff';
export const RAGANG_KANT_FARG = 'rgba(0,0,0,0.85)';
/** Fastigheter som trakten överlappar: svagt ljust skimmer. Övriga fastigheter: nedtonade (~26 % mörkare — vägar, hus och diken syns genom). */
export const SKIMMER_TRAKT = { color: '#ffffff', opacity: 0.1 } as const;
export const NEDTONING_UTANFOR = { color: '#000000', opacity: 0.26 } as const;
/** Svaga stycken (långt från trakten): lägre opacitet på både kärna och kant. */
export const SVAG_OPACITET = 0.5;

// -- bredder (px per zoom) ----------------------------------------------------------------------------------------------------------
/** Rågångens vita kärna. Bred: den ska synas på flygfoto i en maskin som skakar, OCH ligga kvar som ett vitt band på båda sidor om traktgränsen när de sammanfaller (mätt: 8 px åts upp helt av traktgränsens kant). */
export const RAGANG_BREDD = ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 8, 17, 12, 19, 16] as const;
/** Mörk kant: kärnan + 1,5 px på varje sida. */
export const RAGANG_KANT_BREDD = ['interpolate', ['linear'], ['zoom'], 10, 7, 14, 11, 17, 15, 19, 19] as const;
/** Svaga stycken: hälften så breda. */
export const RAGANG_BREDD_SVAG = ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 4, 17, 6, 19, 8] as const;
export const RAGANG_KANT_BREDD_SVAG = ['interpolate', ['linear'], ['zoom'], 10, 3.5, 14, 5.5, 17, 7.5, 19, 9.5] as const;
/** Osynlig tryckyta runt rågången (±11 px). */
export const RAGANG_TRYCK_BREDD = 22;
/** Beteckningen syns först från den zoom där den får plats bredvid rågången (inskjutningen är 14 m). */
export const ETIKETT_MIN_ZOOM = 16;

/** Traktgränsen OVANPÅ rågången: smal och utan bred kant. Före: 3/5/8 px med en svart kant 5/8/12 px som täckte allt under. */
export const TRAKTGRANS_BREDD = ['interpolate', ['linear'], ['zoom'], 8, 1.5, 14, 2.5, 17, 4] as const;
export const TRAKTGRANS_KANT_BREDD = ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 3.5, 17, 5.5] as const;
/** Kanten runt traktgränsen är bara en tunn mörk linje (0,75–1 px per sida), aldrig ett svart band. */
export const TRAKTGRANS_KANT_FARG = 'rgba(0,0,0,0.55)';

const sidaFilter = (sida: string) => ['==', ['get', 'sida'], sida];
const styrkaFilter = (styrka: 'full' | 'svag') => ['==', ['get', 'styrka'], styrka];

/** Källorna, alla tomma tills sidan pumpar in data (ur lib/fastighetsgrans byggRagang). */
export function ragangKallor(): [string, { type: 'geojson'; data: { type: 'FeatureCollection'; features: never[] } }][] {
  return Object.values(RAGANG_KALLOR).map((id) => [id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }]);
}

/** Lagerspecarna (alla börjar osynliga — sidans synlighetseffekt tänder dem). `nedre` = ska ligga UNDER alla andra vektorlager (skimret). */
export function ragangLager(): { spec: any; nedre: boolean }[] {
  const dold = { visibility: 'none' as const };
  const rund = { ...dold, 'line-cap': 'round' as const, 'line-join': 'round' as const };
  return [
    { nedre: true, spec: { id: RAGANG_LAGER.ytaTrakt, type: 'fill', source: RAGANG_KALLOR.yta, filter: sidaFilter('trakt'), paint: { 'fill-color': SKIMMER_TRAKT.color, 'fill-opacity': SKIMMER_TRAKT.opacity, 'fill-antialias': false }, layout: dold } },
    { nedre: true, spec: { id: RAGANG_LAGER.ytaUtanfor, type: 'fill', source: RAGANG_KALLOR.yta, filter: sidaFilter('utanfor'), paint: { 'fill-color': NEDTONING_UTANFOR.color, 'fill-opacity': NEDTONING_UTANFOR.opacity, 'fill-antialias': false }, layout: dold } },
    { nedre: false, spec: { id: RAGANG_LAGER.kantSvag, type: 'line', source: RAGANG_KALLOR.linje, filter: styrkaFilter('svag'), paint: { 'line-color': RAGANG_KANT_FARG, 'line-width': RAGANG_KANT_BREDD_SVAG, 'line-opacity': SVAG_OPACITET }, layout: rund } },
    { nedre: false, spec: { id: RAGANG_LAGER.kant, type: 'line', source: RAGANG_KALLOR.linje, filter: styrkaFilter('full'), paint: { 'line-color': RAGANG_KANT_FARG, 'line-width': RAGANG_KANT_BREDD }, layout: rund } },
    { nedre: false, spec: { id: RAGANG_LAGER.linjeSvag, type: 'line', source: RAGANG_KALLOR.linje, filter: styrkaFilter('svag'), paint: { 'line-color': RAGANG_FARG, 'line-width': RAGANG_BREDD_SVAG, 'line-opacity': SVAG_OPACITET }, layout: rund } },
    { nedre: false, spec: { id: RAGANG_LAGER.linje, type: 'line', source: RAGANG_KALLOR.linje, filter: styrkaFilter('full'), paint: { 'line-color': RAGANG_FARG, 'line-width': RAGANG_BREDD }, layout: rund } },
    { nedre: false, spec: { id: RAGANG_LAGER.hit, type: 'line', source: RAGANG_KALLOR.linje, paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': RAGANG_TRYCK_BREDD }, layout: dold } },
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

// -- Lantmäteriets rasterlager i SAMMA stil (när Vida inte levererat fastighetsytor) ---------------------------------------------------
// Lantmäteriets WMS (LAYERS=granser) ger en färdig bild med gula linjer. Samma utseende som Vidas vektorlinje får vi genom att rita samma bild två gånger: underst
// SVART och kraftigt uppförstorad (tileSize 512 med WIDTH 64 → servern ritar linjen i 64 px över 512 skärmpixlar, alltså 8 × så bred och mjuk = den mörka kanten), överst
// VIT och 4 × så bred (WIDTH 128 över 512 = kärnan). MapLibres raster-brightness ersätter färgen utan att röra bildens alfa. Bredden på kärnan och kanten ligger i
// LM_GRANS: servern bestämmer linjens egen tjocklek, så siffrorna är en uppskattning att justera efter en titt på riktig bakgrund.
export const LM_GRANS_URL = (w: number) => `https://minkarta.lantmateriet.se/map/fastighetsindelning/wms/v1.3?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=granser&STYLES=morkbakgrund&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=${w}&HEIGHT=${w}`;
export const LM_GRANS = {
  kantKalla: 'wms-fastighetsgranser-kant',
  kantLager: 'wms-layer-fastighetsgranser-kant',
  linjeKalla: 'wms-fastighetsgranser',
  linjeLager: 'wms-layer-fastighetsgranser',
  /** Lantmäteriets gränser hela landet runt är brus på översiktsnivå: lagret börjar där en trakt syns som en trakt. */
  minzoom: 12,
  tileSize: 512,
  kantWidth: 64,
  linjeWidth: 128,
  kantOpacitet: 0.85,
} as const;

/** Källa + lager för Lantmäteri-gränsen i Vidas stil, kant först (underst) och sedan kärnan. Båda börjar osynliga. */
export function lmGransLager(): { kallor: [string, any][]; lager: any[] } {
  const kalla = (w: number) => ({ type: 'raster', tiles: [LM_GRANS_URL(w)], tileSize: LM_GRANS.tileSize });
  const dold = { visibility: 'none' as const };
  return {
    kallor: [[LM_GRANS.kantKalla, kalla(LM_GRANS.kantWidth)], [LM_GRANS.linjeKalla, kalla(LM_GRANS.linjeWidth)]],
    lager: [
      { id: LM_GRANS.kantLager, type: 'raster', source: LM_GRANS.kantKalla, minzoom: LM_GRANS.minzoom, paint: { 'raster-brightness-min': 0, 'raster-brightness-max': 0, 'raster-opacity': LM_GRANS.kantOpacitet }, layout: dold },
      { id: LM_GRANS.linjeLager, type: 'raster', source: LM_GRANS.linjeKalla, minzoom: LM_GRANS.minzoom, paint: { 'raster-brightness-min': 1, 'raster-brightness-max': 1, 'raster-opacity': 1 }, layout: dold },
    ],
  };
}

/** Fällningscirkeln när rågången är inom 30 m (och inget annat skyddsvärt är det): VIT, streckad, tydlig. Neutral cirkel är samma färg men svag (30 %, 2 px). */
export function fastighetsCirkelPaint(visa: boolean): Record<string, any> {
  return { 'line-color': '#ffffff', 'line-opacity': visa ? 0.95 : 0, 'line-width': 3, 'line-dasharray': [2, 2] };
}

/** Första vektorlagret i stilen (allt utom bakgrund och raster): skimret läggs under det, så det tonar bara kartan och aldrig täcker en markering. */
export function forstaVektorLagerId(lager: ReadonlyArray<{ id: string; type: string }>): string | undefined {
  return lager.find((l) => l.type !== 'background' && l.type !== 'raster' && l.type !== 'hillshade' && l.type !== 'color-relief')?.id;
}
