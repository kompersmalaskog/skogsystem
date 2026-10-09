// Kartstil for markeringar: linjetyper, zoner, symboler, pilar och nummer.
//
// SAMMA UTSEENDE SOM PLANERINGSVYN. Egenkontrollens karta ska visa trakten sa
// som den planerades - en evighetstrad, en basvag, ett dike ska se ut som de
// gjorde nar de ritades.
//
// VARFOR DEN HAR FILEN FINNS: planeringsvyn ritar sina linjer, zoner och pilar
// INLINE i app/planering/page.tsx (lineTypeDefs i handleMapReady, LEGEND pa
// modulniva, ritaPilIkon, zonlagren). Inget av det ar exporterat, och att
// bryta ut det kraver att page.tsx andras. Det ar planeringsvyn forarna
// anvander varje dag, och den ror vi inte i samma PR som egenkontrollen far
// sina symboler.
//
// DARFOR AR VARDENA HAR KOPIERADE - och det ar en medveten, vaktad kopia:
// lib/kartstil.test.ts laser page.tsx och jamfor varje varde har mot kallan.
// Andrar nagon planeringens linjebredder, farger eller streckning utan att
// andra den har filen faller testet med ett meddelande som sager vilken sida
// som glidit. Att peka om planeringsvyn hit ar ett eget, senare steg.
//
// SYMBOLERNA AR REDAN DELADE: lib/marker-icons.ts (planering + Cesium-korvyn)
// och zonfargerna i lib/zone-colors.ts. De anvands har rakt av.
//
// INGA TEXTLAGER. Kartstilen i egenkontrollen har ingen glyphs-kalla, och ett
// externt typsnittsberoende ar ett till att halla ordning pa. Nummer ritas
// darfor som genererade ikoner (canvas -> addImage), samma teknik som
// planeringen redan anvander for pilikonen och avlaggsikonen.
//
// Allt har ar rena specifikationer (ingen MapLibre-instans behovs), sa att
// testet kan validera varje lager mot MapLibres egen stil-spec. Ett lager med
// ogiltigt uttryck avvisas annars TYST av MapLibre - bygget ar gront, tsc ar
// gront och lagret ar bara borta (feedback_verifiera_kartlager_i_riktig_motor).

import { ZONE_COLORS } from './zone-colors';
import { ICON_SIZE } from './marker-icons';

// ---------------------------------------------------------------------------
// Palett - ordagrant ur LEGEND i app/planering/page.tsx
// ---------------------------------------------------------------------------

export const LEGEND = {
  fara: '#ff453a',
  gul: '#fbbf24',
  vatten: '#3b82f6',
  naturvard: '#30d158',
  naturvardKant: '#4ade80',
  kultur: '#f59e0b',
  fornlamning: '#b45309',
  brant: '#a855f7',
  dike: '#06b6d4',
  dikeKant: '#0e7490',
  vit: '#fff',
} as const;

// ---------------------------------------------------------------------------
// Zoomkurvor. EN interpolate per uttryck, aldrig nastlad i aritmetik - MapLibre
// avvisar annars lagret ("zoom expression may only be used as input to a
// top-level step or interpolate"). Variation per feature loses med SEPARATA
// LAGER, var och ett med sin egen kurva.
// ---------------------------------------------------------------------------

export type Stopp = ReadonlyArray<readonly [number, number]>;

/** Zoomkurva, skalad och/eller forskjuten. Forskjutningen sker i KOD, inte i uttrycket. */
export function zoomKurva(stopp: Stopp, faktor = 1, tillagg = 0): any[] {
  return [
    'interpolate', ['linear'], ['zoom'],
    ...stopp.flatMap(([z, v]) => [z, Math.round((v * faktor + tillagg) * 1000) / 1000]),
  ];
}

// Linjer (lw / cwLw i handleMapReady)
export const LINJE_BREDD: Stopp = [[5, 2], [8, 2], [11, 3], [13, 4], [15, 6], [17, 7]];
export const LINJE_BREDD_GRANS: Stopp = [[5, 3], [8, 4], [11, 5], [13, 5], [15, 7], [17, 8]];
export const LINJE_KANT_BREDD: Stopp = [[5, 4], [8, 4], [11, 5], [13, 6], [15, 8], [17, 9]];
export const LINJE_KANT_BREDD_GRANS: Stopp = [[5, 5], [8, 6], [11, 7], [13, 7], [15, 9], [17, 10]];
export const STENMUR_BREDD: Stopp = [[5, 3], [8, 4], [11, 5], [13, 6], [15, 7], [17, 9]];
export const STENMUR_FARG = '#5f5e5a';

// Streckning. Konstanter, inte litteraler i byggarna, sa att driftvakten kan
// jamfora DEN HAR sidan mot planeringen - inte bara planeringen mot en text.
export const STRECK_DASHED = [3, 2] as const;
export const STRECK_VANLIG = [2.5, 1.5] as const;
export const STRECK_RANDAD = [2, 2] as const;
export const STRECK_STENMUR = [2, 0.85] as const;
export const STRECK_ZON = [2, 2] as const;
export const KANT_SVART_STARK = 'rgba(0,0,0,0.9)';
export const KANT_SVART_MJUK = 'rgba(0,0,0,0.5)';

// Zoner (zoneWidth / zoneCasingWidth)
export const ZON_BREDD: Stopp = [[10, 1.5], [13, 3], [15, 5], [17, 6]];
export const ZON_KANT_BREDD: Stopp = [[10, 3], [13, 5], [15, 7], [17, 8]];
export const ZON_KANT_FARG = 'rgba(0,0,0,0.6)';
export const ZON_FYLLNING_OPACITET = 0.2;
/** Zontyp utan egen farg (t.ex. gallring i kontextlagret) - neutral, aldrig en gissad farg. */
export const ZON_OKAND = '#8e8e93';

// Symboler och pilar (markers-layer / arrows-layer)
export const IKON_STORLEK: Stopp = [[10, 0.15], [12, 0.2], [13, 0.3], [14, 0.4], [15, 0.5], [16, 0.6], [17, 0.75]];

/** Textstorleken i planeringens basvagsetikett, 11/14/17 px - som ikonstorlek mot ett 40 px-typsnitt. */
export const NUMMER_FONT_PX = 40;
export const NUMMER_STORLEK: Stopp = [[12, 11 / NUMMER_FONT_PX], [15, 14 / NUMMER_FONT_PX], [17, 17 / NUMMER_FONT_PX]];

// ---------------------------------------------------------------------------
// Linjetyper - ordagrant ur lineTypeDefs i handleMapReady
// ---------------------------------------------------------------------------

export type LinjeStil = {
  id: string;
  color: string;
  color2?: string;
  striped?: boolean;
  dashed?: boolean;
  stonewall?: boolean;
};

export const LINJE_STIL: LinjeStil[] = [
  { id: 'boundary', color: LEGEND.fara, color2: LEGEND.gul, striped: true },
  { id: 'mainRoad', color: LEGEND.vatten, color2: LEGEND.gul, striped: true },
  { id: 'backRoadRed', color: LEGEND.fara },
  { id: 'backRoadYellow', color: LEGEND.gul },
  { id: 'backRoadBlue', color: LEGEND.vatten },
  { id: 'sideRoadRed', color: LEGEND.fara },
  { id: 'sideRoadYellow', color: LEGEND.gul },
  { id: 'sideRoadBlue', color: LEGEND.vatten },
  { id: 'nature', color: LEGEND.naturvard, color2: LEGEND.fara, striped: true },
  { id: 'ditch', color: LEGEND.dike, color2: LEGEND.dikeKant, striped: true },
  { id: 'trail', color: LEGEND.vit, dashed: true },
  { id: 'stonewall', color: STENMUR_FARG, stonewall: true },
];

export const LINJE_TYP_IDN: string[] = LINJE_STIL.map((l) => l.id);

/** Pilar (arrowTypes) - id och farg ur planeringen. */
export const PIL_STIL: { id: string; color: string }[] = [
  { id: 'fellingdirection', color: LEGEND.naturvard },
  { id: 'drivedirection', color: LEGEND.vatten },
];

// ---------------------------------------------------------------------------
// Status - ENDA som sager vad som ar bockat av
// ---------------------------------------------------------------------------

/**
 * Status pa kartan: en bredare underlinje / ring i statusfarg, som LAGGS RUNT
 * typens egen symbol eller linje - aldrig i stallet for den. Obesvarad har
 * ingen ring.
 *
 * TJOCKLEKEN skiljer ocksa, inte bara fargen: OK ar tunn, avvikelse ar tjock.
 * Farg ar aldrig ensam informationsbarare, och pa kartan finns ingen text.
 */
export const STATUS_STIL = [
  { status: 'ok', farg: '#30D158', ringBredd: 2, linjeExtra: 4 },
  { status: 'avvikelse', farg: '#FF453A', ringBredd: 4.5, linjeExtra: 9 },
] as const;

// ---------------------------------------------------------------------------
// Lagerbyggare
// ---------------------------------------------------------------------------

/** Nedtoning for kontextlagret: tunnare och genomskinligare, aldrig tryckbart. */
export type Dimning = { opacitet: number; breddFaktor: number; utanKant?: boolean };

function och(...delar: any[]): any[] {
  return ['all', ...delar.filter(Boolean)];
}
const ar = (nyckel: string, varde: string) => ['==', ['get', nyckel], varde];

/**
 * Vilka linjetyper ett anrop ritar. Utan urval: alla, plus den okanda fallbacken.
 * `endast` ritar bara de typerna (och ingen fallback); `utom` hoppar over typer.
 * Lagrens id:n ar desamma oavsett urval - ett lager ritas av EXAKT ETT anrop.
 */
export type LinjeUrval = { endast?: readonly string[]; utom?: readonly string[] };

/** Linjetyperna, ett lager-set per typ: kant, grund och eventuell strackning. */
export function linjeLager(kalla: string, prefix: string, bas: any[] | null, dim?: Dimning, urval?: LinjeUrval): any[] {
  const lager: any[] = [];
  const op = dim ? { 'line-opacity': dim.opacitet } : {};
  const bf = dim?.breddFaktor ?? 1;

  for (const lt of LINJE_STIL) {
    if (urval?.endast && !urval.endast.includes(lt.id)) continue;
    if (urval?.utom?.includes(lt.id)) continue;
    const filter = och(ar('kind', 'linje'), ar('typ', lt.id), bas);

    if (lt.stonewall) {
      lager.push({
        id: `${prefix}-lin-${lt.id}`, type: 'line', source: kalla, filter,
        paint: { 'line-color': STENMUR_FARG, 'line-width': zoomKurva(STENMUR_BREDD, bf), 'line-dasharray': [...STRECK_STENMUR], ...op },
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
      });
      continue;
    }

    const grans = lt.id === 'boundary';
    const stark = grans || lt.id === 'mainRoad' || lt.id === 'trail';
    const bredd = grans ? LINJE_BREDD_GRANS : LINJE_BREDD;
    const kant = grans ? LINJE_KANT_BREDD_GRANS : LINJE_KANT_BREDD;

    if (!dim?.utanKant) {
      lager.push({
        id: `${prefix}-lin-${lt.id}-kant`, type: 'line', source: kalla, filter,
        paint: { 'line-color': stark ? KANT_SVART_STARK : KANT_SVART_MJUK, 'line-width': zoomKurva(kant, bf), ...op },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }
    lager.push({
      id: `${prefix}-lin-${lt.id}`, type: 'line', source: kalla, filter,
      paint: {
        'line-color': lt.color,
        'line-width': zoomKurva(bredd, bf),
        ...(lt.dashed ? { 'line-dasharray': [...STRECK_DASHED] } : {}),
        ...(!lt.striped && !lt.dashed ? { 'line-dasharray': [...STRECK_VANLIG] } : {}),
        ...op,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    if (lt.striped && lt.color2) {
      lager.push({
        id: `${prefix}-lin-${lt.id}-streck`, type: 'line', source: kalla, filter,
        paint: { 'line-color': lt.color2, 'line-width': zoomKurva(bredd, bf), 'line-dasharray': [...STRECK_RANDAD], ...op },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }
  }

  // Okand linjetyp: neutral och synlig. Utan det forsvinner den tyst.
  if (urval?.endast) return lager;
  lager.push({
    id: `${prefix}-lin-okand`, type: 'line', source: kalla,
    filter: och(ar('kind', 'linje'), ['!', ['in', ['get', 'typ'], ['literal', LINJE_TYP_IDN]]], bas),
    paint: { 'line-color': 'rgba(255,255,255,0.7)', 'line-width': zoomKurva(LINJE_BREDD, bf), ...op },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  return lager;
}

/** Fargen for en zontyp. ZONE_COLORS ar planeringens egen kalla. */
export function zonFargUttryck(): any[] {
  return ['match', ['get', 'typ'], ...Object.entries(ZONE_COLORS).flat(), ZON_OKAND];
}

/** Zonernas fyllning. Ligger UNDER statusbandet och zonens kant. */
export function zonFyllLager(kalla: string, prefix: string, bas: any[] | null, dim?: Dimning): any[] {
  return [{
    id: `${prefix}-zon-fyll`, type: 'fill', source: kalla,
    filter: och(ar('kind', 'zon'), bas),
    paint: { 'fill-color': zonFargUttryck(), 'fill-opacity': ZON_FYLLNING_OPACITET * (dim?.opacitet ?? 1) },
  }];
}

/**
 * Zonernas kant: mork kant, typfarg och vit streckning. Ligger OVER
 * statusbandet - annars doljer det bredare statusbandet zonens typfarg.
 */
export function zonKantLager(kalla: string, prefix: string, bas: any[] | null, dim?: Dimning): any[] {
  const filter = och(ar('kind', 'zon'), bas);
  const op = dim ? { 'line-opacity': dim.opacitet } : {};
  const bf = dim?.breddFaktor ?? 1;
  const farg = zonFargUttryck();
  return [
    ...(dim?.utanKant ? [] : [{
      id: `${prefix}-zon-kant`, type: 'line', source: kalla, filter,
      paint: { 'line-color': ZON_KANT_FARG, 'line-width': zoomKurva(ZON_KANT_BREDD, bf), ...op },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    }]),
    {
      id: `${prefix}-zon-linje`, type: 'line', source: kalla, filter,
      paint: { 'line-color': farg, 'line-width': zoomKurva(ZON_BREDD, bf), ...op },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    },
    {
      id: `${prefix}-zon-streck`, type: 'line', source: kalla, filter,
      paint: { 'line-color': '#fff', 'line-width': zoomKurva(ZON_BREDD, bf), 'line-dasharray': [...STRECK_ZON], ...op },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    },
  ];
}

/**
 * Statusunderlinjen for linjer och zoner: en bredare linje i statusfarg UNDER
 * typens egen linje. Typens farg och form syns kvar ovanpa.
 *
 * Fyra lager, inte tva: linjer och zoner har olika grundbredd, och status
 * (ok/avvikelse) ger olika kurva. En kurva per lager - se zoomKurva.
 */
export function statusLinjeLager(kalla: string, prefix: string): any[] {
  const lager: any[] = [];
  for (const [kind, kant] of [['linje', LINJE_KANT_BREDD], ['zon', ZON_KANT_BREDD]] as const) {
    for (const s of STATUS_STIL) {
      lager.push({
        id: `${prefix}-status-${kind}-${s.status}`, type: 'line', source: kalla,
        filter: och(ar('kind', kind), ar('status', s.status)),
        paint: { 'line-color': s.farg, 'line-width': zoomKurva(kant, 1, s.linjeExtra) },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }
  }
  return lager;
}

/** Ikonens synliga radie i pixlar vid en given ikonstorlek (cirkeln i buildMarkerSvg). */
export function ikonRadie(storlek: number): number {
  return (ICON_SIZE / 2 - 2) * storlek;
}

/** Statusringen runt en symbol. Obesvarad: ingen ring. */
export function statusRingLager(kalla: string, prefix: string): any[] {
  return STATUS_STIL.map((s) => ({
    id: `${prefix}-ring-${s.status}`, type: 'circle', source: kalla,
    filter: och(ar('kind', 'symbol'), ar('status', s.status)),
    paint: {
      // Ringen mitt i sin egen bredd, strax utanfor ikonens kant.
      'circle-radius': zoomKurva(IKON_STORLEK.map(([z, st]) => [z, ikonRadie(st) + s.ringBredd / 2 + 1.5] as const)),
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': s.farg,
      'circle-stroke-width': s.ringBredd,
      'circle-pitch-alignment': 'viewport',
    },
  }));
}

/** Symbolerna, ur lib/marker-icons.ts. Bilden heter marker-<ikon>. */
export function symbolLager(kalla: string, prefix: string, bas: any[] | null, dim?: Dimning): any {
  return {
    id: `${prefix}-sym`, type: 'symbol', source: kalla,
    filter: och(ar('kind', 'symbol'), bas),
    layout: {
      'icon-image': ['concat', 'marker-', ['get', 'ikon']],
      'icon-size': zoomKurva(IKON_STORLEK, dim?.breddFaktor ?? 1),
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-padding': 2,
      'icon-pitch-alignment': 'viewport',
      'icon-rotation-alignment': 'viewport',
      'icon-anchor': 'center',
      'symbol-placement': 'point',
      'symbol-z-order': 'source',
    },
    paint: dim ? { 'icon-opacity': dim.opacitet } : {},
  };
}

/** Pilarna (kontextlagret). Roterar med sin riktning och behaller den nar kartan roterar. */
export function pilLager(kalla: string, prefix: string, dim: Dimning): any {
  return {
    id: `${prefix}-pil`, type: 'symbol', source: kalla,
    filter: ar('kind', 'pil'),
    layout: {
      'icon-image': ['concat', 'arrow-', ['get', 'typ']],
      'icon-size': zoomKurva(IKON_STORLEK, dim.breddFaktor),
      'icon-rotate': ['number', ['get', 'rotation'], 0],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'viewport',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-anchor': 'center',
    },
    paint: { 'icon-opacity': dim.opacitet },
  };
}

/** Basvagsnumret som ikon. Bilden heter nr-<nummer>. */
export function nummerLager(kalla: string, prefix: string): any {
  return {
    id: `${prefix}-nummer`, type: 'symbol', source: kalla,
    layout: {
      'icon-image': ['concat', 'nr-', ['to-string', ['get', 'nr']]],
      'icon-size': zoomKurva(NUMMER_STORLEK),
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-anchor': 'center',
    },
  };
}

// ---------------------------------------------------------------------------
// Ikoner (canvas) - kraver DOM, anropas bara fran webblasaren
// ---------------------------------------------------------------------------

/**
 * Pilikonen: skaft + spets, pekar UPP (norr) vid rotation 0. Ordagrant ur
 * ritaPilIkon i app/planering/page.tsx.
 */
export function ritaPilIkon(farg: string, px = 80): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const mx = px / 2, my = px / 2, s = px / 56;
  ctx.strokeStyle = farg; ctx.fillStyle = farg; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.moveTo(mx, my + 20 * s); ctx.lineTo(mx, my - 10 * s); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mx, my - 20 * s);
  ctx.lineTo(mx + 10 * s, my - 5 * s);
  ctx.lineTo(mx, my - 10 * s);
  ctx.lineTo(mx - 10 * s, my - 5 * s);
  ctx.closePath(); ctx.fill();
  ctx.lineWidth = 1 * s; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
  return c;
}

/**
 * Ett nummer som ikon: vit siffra med morkt sken, som planeringens etikett
 * (text-color #fff, halo rgba(0,0,0,0.85)). Ritas med canvas sa ingen
 * glyph-kalla behovs.
 *
 * Siffrorna krymps sa att aven tresiffriga nummer ryms inom ikonen.
 */
export function ritaNummerIkon(nr: number, px = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const text = String(Math.trunc(nr));
  const typsnitt = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  let fontPx = NUMMER_FONT_PX * (px / 64);
  ctx.font = `700 ${fontPx}px ${typsnitt}`;
  const bredd = ctx.measureText(text).width;
  const rymd = px - 10;
  if (bredd > rymd) {
    fontPx *= rymd / bredd;
    ctx.font = `700 ${fontPx}px ${typsnitt}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = fontPx * 0.24;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, px / 2, px / 2 + fontPx * 0.04);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, px / 2, px / 2 + fontPx * 0.04);
  return c;
}
