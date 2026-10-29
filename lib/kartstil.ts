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
import { FARG_FARA, FARG_KULTUR, FARG_NATUR, FARG_STENMUR } from './larm/grupper';
import { FORBJUDNA_ZONTYPER, SNEDSTRECK_GRUPPER, snedstreckId } from './ytaStil';

// ---------------------------------------------------------------------------
// Palett - ordagrant ur LEGEND i app/planering/page.tsx
// ---------------------------------------------------------------------------

export const LEGEND = {
  fara: FARG_FARA,
  gul: '#fbbf24',
  vatten: '#3b82f6',
  naturvard: FARG_NATUR,
  naturvardKant: '#4ade80',
  kultur: FARG_KULTUR,
  fornlamning: FARG_KULTUR,
  brant: FARG_FARA,
  dike: '#06b6d4',
  dikeKant: '#0e7490',
  vit: '#fff',
} as const;

/**
 * Basvägens färg (röd/gul/blå) ur egenskapen `farg` — heldragen i färgen. Utan färg (allt som ritades före färgvalet): blå med gula streck, som förut.
 * Samma uttryck som planeringsvyn använder (lib/basvag återexporterar dem).
 */
export const BASVAG_FARG_UTTRYCK: any[] = ['match', ['get', 'farg'], 'red', LEGEND.fara, 'yellow', LEGEND.gul, 'blue', LEGEND.vatten, LEGEND.vatten];
export const BASVAG_UTAN_FARG: any[] = ['!', ['has', 'farg']];

/** Den mörka kanten bakom en väg (basväg, stickväg) och traktgräns/stig. Vägarna behåller sin snitselfärg; kanten får dem att synas mot ett foto (Kartan lugnare). */
export const VAG_KANT_FARG = 'rgba(0,0,0,0.9)';
/** Stickvägarna (sideRoadRed/Yellow/Blue) — vägtyper utöver basvägen som ska ha samma kraftiga kant. */
export const arStickvag = (lineType: string): boolean => lineType.startsWith('sideRoad');

/**
 * Blå/gul basväg = snitselband i fält: LIKA långa blå och gula streck. Det gula strecket ritas ovanpå en heldragen blå linje med dasharray [2, 2] (enheter av linjebredden),
 * och med PLATTA ändar blir det exakt hälften gult och hälften blått. Med rundade ändar växer varje streck med en halv linjebredd åt båda håll och äter luckorna:
 * 75 % gult, 25 % blått (uppmätt 2026-10-21 i riktig MapLibre). Gäller bara basvägen — traktgränsens och övriga randade linjers streck är oförändrade.
 */
export const BASVAG_STRECK_DASH = [2, 2] as const;
export const BASVAG_STRECK_LAYOUT = { 'line-cap': 'butt', 'line-join': 'miter' } as const;

/**
 * Körvyns sken runt basvägar nära maskinen (≤ 200 m). Det ska bara LYFTA FRAM de närmaste vägarna — aldrig ändra vägens färg. Därför vitt och svagt, och det läggs UNDER
 * väglagren (se `forstaVagLagerId`). Förut: gult #ffd60a, 40 %, ritat OVANPÅ vägen — det färgade blått grågrönt, rött orange och blå/gul helt gul.
 */
export const BASVAG_SKEN_ID = 'lines-korvy-mainroad-glow';
export const BASVAG_SKEN_FARG = '#ffffff';
export const BASVAG_SKEN_OPACITET = 0.28;
export function basvagSkenLager(kalla: string): any {
  return {
    id: BASVAG_SKEN_ID,
    type: 'line',
    source: kalla,
    filter: ['all', ['==', ['get', 'lineType'], 'mainRoad'], ['==', ['get', 'nearby'], true]],
    paint: {
      'line-color': BASVAG_SKEN_FARG,
      'line-opacity': BASVAG_SKEN_OPACITET,
      // Smalare (2026-10-28, röran): ungefär dubbla vägbredden i stället för en bred vit väg — det ska bara lyfta fram vägen.
      'line-width': ['interpolate', ['linear'], ['zoom'], 14, 8, 17, 16, 19, 22],
      'line-blur': 3,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
  };
}
/** Lagret skenet ska ligga precis UNDER: det lägsta väglagret (`line-…`) i stilens ordning. undefined = inget väglager finns än. */
export function forstaVagLagerId(lagerIdn: ReadonlyArray<string>): string | undefined {
  return lagerIdn.find((id) => id.startsWith('line-'));
}

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
/** Naturvård: tunn heldragen grön linje (Martin 2026-10-28) — ungefär halva vägarnas bredd, en smal mörk kant. */
export const NATURVARD_BREDD_STOPP: Stopp = [[5, 1.5], [11, 2], [15, 3], [17, 3.5]];
export const NATURVARD_KANT_STOPP: Stopp = [[5, 3], [11, 3.5], [15, 4.5], [17, 5]];
export const NATURVARD_BREDD = zoomKurva(NATURVARD_BREDD_STOPP);
export const NATURVARD_KANT_BREDD = zoomKurva(NATURVARD_KANT_STOPP);
export const STENMUR_BREDD: Stopp = [[5, 3], [8, 4], [11, 5], [13, 6], [15, 7], [17, 9]];
/** Stenmur = gruppens färg (Kultur, brun) med KRAFTIG mörk kant — ingen egen nyans. Kanten är bredare än muren med så här många px (2,5 px per sida). */
export const STENMUR_FARG = FARG_STENMUR;
export const STENMUR_KANT_EXTRA = 5;

// Streckning. Konstanter, inte litteraler i byggarna, sa att driftvakten kan
// jamfora DEN HAR sidan mot planeringen - inte bara planeringen mot en text.
export const STRECK_DASHED = [3, 2] as const;
export const STRECK_VANLIG = [2.5, 1.5] as const;
export const STRECK_RANDAD = [2, 2] as const;
export const STRECK_STENMUR = [2, 0.85] as const;
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
  /** Heldragen (inget streck). */
  solid?: boolean;
  /** Tunn linje (NATURVARD_BREDD) i stället för vägarnas bredd. */
  tunn?: boolean;
  stonewall?: boolean;
  /** El-ledning ritad som linje: ritas som en ledning (kraftledningLager) — samma utseende som Vidas Kraftledning. */
  kraftledning?: boolean;
};

export const LINJE_STIL: LinjeStil[] = [
  { id: 'boundary', color: LEGEND.fara, color2: LEGEND.gul, striped: true },
  { id: 'mainRoad', color: LEGEND.vatten, color2: LEGEND.gul, striped: true },
  { id: 'sideRoadRed', color: LEGEND.fara },
  { id: 'sideRoadYellow', color: LEGEND.gul },
  { id: 'sideRoadBlue', color: LEGEND.vatten },
  // Naturvård: tunn, heldragen grön — ingen röd rand (rött betyder fara, Martin 2026-10-28).
  { id: 'nature', color: LEGEND.naturvard, solid: true, tunn: true },
  { id: 'ditch', color: LEGEND.dike, color2: LEGEND.dikeKant, striped: true },
  { id: 'trail', color: LEGEND.vit, dashed: true },
  { id: 'stonewall', color: STENMUR_FARG, stonewall: true },
  { id: 'powerline', color: FARG_FARA, kraftledning: true },
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

    // El-ledning som linje: ledningsutseendet (röd, mörk kant, stolpar, farosymbol) — samma funktion som Vidas Kraftledning.
    if (lt.kraftledning) { lager.push(...kraftledningLager(kalla, `${prefix}-lin-${lt.id}`, filter, true, dim)); continue; }

    if (lt.stonewall) {
      if (!dim?.utanKant) {
        lager.push({
          id: `${prefix}-lin-${lt.id}-kant`, type: 'line', source: kalla, filter,
          paint: { 'line-color': KANT_SVART_STARK, 'line-width': zoomKurva(STENMUR_BREDD, bf, STENMUR_KANT_EXTRA), 'line-opacity': 1 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }
      lager.push({
        id: `${prefix}-lin-${lt.id}`, type: 'line', source: kalla, filter,
        paint: { 'line-color': STENMUR_FARG, 'line-width': zoomKurva(STENMUR_BREDD, bf), 'line-dasharray': [...STRECK_STENMUR], ...op },
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
      });
      continue;
    }

    const grans = lt.id === 'boundary';
    const stark = grans || lt.id === 'mainRoad' || lt.id === 'trail' || arStickvag(lt.id);   // vägarna (basväg + stickväg) har samma kraftiga mörka kant som planeringsvyn (Kartan lugnare)
    const bredd = grans ? LINJE_BREDD_GRANS : lt.tunn ? NATURVARD_BREDD_STOPP : LINJE_BREDD;
    const kant = grans ? LINJE_KANT_BREDD_GRANS : lt.tunn ? NATURVARD_KANT_STOPP : LINJE_KANT_BREDD;

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
        'line-color': lt.id === 'mainRoad' ? BASVAG_FARG_UTTRYCK : lt.color,
        'line-width': zoomKurva(bredd, bf),
        ...(lt.dashed ? { 'line-dasharray': [...STRECK_DASHED] } : {}),
        ...(!lt.striped && !lt.dashed && !lt.solid ? { 'line-dasharray': [...STRECK_VANLIG] } : {}),
        ...op,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    if (lt.striped && lt.color2) {
      lager.push({
        // Basväg MED färg är heldragen i färgen: de gula strecken ritas bara på basväg utan färg.
        id: `${prefix}-lin-${lt.id}-streck`, type: 'line', source: kalla, filter: lt.id === 'mainRoad' ? och(filter, BASVAG_UTAN_FARG) : filter,
        paint: { 'line-color': lt.color2, 'line-width': zoomKurva(bredd, bf), 'line-dasharray': [...(lt.id === 'mainRoad' ? BASVAG_STRECK_DASH : STRECK_RANDAD)], ...op },
        layout: lt.id === 'mainRoad' ? { ...BASVAG_STRECK_LAYOUT } : { 'line-cap': 'round', 'line-join': 'round' },
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

/** Snedstreckningen på ytor man inte får köra in i (lib/ytaStil: Hänsyn, Fornlämning, Ej framkomlig) — ett lager per grupp, ovanpå fyllningen. Bilderna `snedstreck-<grupp>` laddas av kartan. */
export function zonSnedstreckLager(kalla: string, prefix: string, bas: any[] | null, dim?: Dimning): any[] {
  return SNEDSTRECK_GRUPPER.map((grupp) => ({
    id: `${prefix}-zon-snedstreck-${grupp}`, type: 'fill', source: kalla,
    filter: och(ar('kind', 'zon'), bas, ['in', ['get', 'typ'], ['literal', FORBJUDNA_ZONTYPER(grupp)]]),
    paint: { 'fill-pattern': snedstreckId(grupp), 'fill-opacity': dim?.opacitet ?? 1 },
  }));
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
// Backvag: DUBBLA tvarstreck (‖) i hinderanden av en vag (lib/backvag). Vagen behaller sin farg och sitt utseende - strecken ar en egen punkt-feature
// (en liten ikon, roterad tvars over vagen) i vagens egen farg med morkt kant, sa den syns pa flygfoto och pa vit karta.
// ---------------------------------------------------------------------------

/** Ikonerna heter backvag-streck-<farg>: red, yellow, blue, blagul (basvag utan farg: blatt med gula streck). */
export const BACKVAG_IKON_PREFIX = 'backvag-streck-';
export const backvagIkonNamn = (farg: string): string => `${BACKVAG_IKON_PREFIX}${farg}`;

/** Storleken mot zoom: staplarna ska vara ett par ganger vagens bredd (2-7 px) sa de lases som tvarstreck, inte en prick. */
export const BACKVAG_IKON_STORLEK: Stopp = [[8, 0.22], [11, 0.3], [13, 0.38], [15, 0.5], [17, 0.62]];

/**
 * Symbollagret for de dubbla tvarstrecken. Ikonen ar tva vagrata staplar; 'icon-rotate' = riktningen UT ur vagen, saa staplen hamnar tvars over vagen.
 * Rotation och lutning foljer kartan (som vagen), inte skarmen. Ligger over vaglinjerna men under symboler.
 */
export function backvagStreckLager(kalla: string, prefix: string, filter?: any[] | null, opacitet?: any): any {
  return {
    id: `${prefix}-backvag`, type: 'symbol', source: kalla,
    ...(filter ? { filter } : {}),
    ...(opacitet != null ? { paint: { 'icon-opacity': opacitet } } : {}),
    layout: {
      'icon-image': ['concat', BACKVAG_IKON_PREFIX, ['get', 'streck']],
      'icon-size': zoomKurva(BACKVAG_IKON_STORLEK),
      'icon-rotate': ['number', ['get', 'riktning'], 0],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-anchor': 'center',
    },
  };
}

// ---------------------------------------------------------------------------
// KRAFTLEDNINGEN: ser ut som en ledning. Röd linje (gruppens röd) med mörk kant, korta STOLPAR (tvärstreck vinkelräta mot linjen) ungefär var 40:e px,
// och farosymbolen (röd triangel med blixt, ur lib/symboler — bilden `marker-powerline`) EN gång per ledningsbit på kartan (mitt på; 2026-10-28 — förut var 250:e px).
// A4-rapporten upprepar fortfarande symbolen var 250:e px (KRAFTLEDNING_SYMBOL_AVSTAND_PX) — den har ingen kartruta att räkna mitten i. Vidas Kraftledning och en egen
// ledning som linje ritas EXAKT likadant (samma funktion). Teckenförklaringen och A4 visar samma linje (VadBetyderKartan, egenkontrollRapportKartaPdf).
// ---------------------------------------------------------------------------

/** Önskat avstånd på SKÄRMEN (css-px) mellan två stolpar resp. två farosymboler. */
export const KRAFTLEDNING_STOLPE_AVSTAND_PX = 40;
export const KRAFTLEDNING_SYMBOL_AVSTAND_PX = 250;
/**
 * MapLibres `symbol-spacing` blir ~1,2 gånger så långt på skärmen som värdet säger (mätt 2026-10-20 i riktig MapLibre 5, DPR 1 och 2, flera zoomnivåer: 40 gav
 * ~48 px mellan stolparna). Värdet som skickas till kartan delas därför med faktorn, så stolparna hamnar ungefär var 40:e px på skärmen.
 */
export const MAPLIBRE_SPACING_FAKTOR = 1.2;
export const KRAFTLEDNING_STOLPE_SPACING = Math.round(KRAFTLEDNING_STOLPE_AVSTAND_PX / MAPLIBRE_SPACING_FAKTOR);
export const KRAFTLEDNING_SYMBOL_SPACING = Math.round(KRAFTLEDNING_SYMBOL_AVSTAND_PX / MAPLIBRE_SPACING_FAKTOR);
export const KRAFTLEDNING_BREDD: Stopp = [[5, 2], [8, 2.5], [11, 3], [13, 3.5], [15, 4], [17, 5]];
/** Kanten är bredare än linjen med så här många px (kraftig, som Stenmurens). */
export const KRAFTLEDNING_KANT_EXTRA = 3;
export const KRAFTLEDNING_STOLPE_BILD = 'kraftledning-stolpe';
/** Farosymbolens bild i kartan (samma som El-ledning-symbolen: form, glyf och färg ur symbolkällan). */
export const KRAFTLEDNING_SYMBOL_BILD = 'marker-powerline';
export const KRAFTLEDNING_STOLPE_STORLEK: Stopp = [[8, 0.5], [11, 0.6], [13, 0.7], [15, 0.85], [17, 1]];
export const KRAFTLEDNING_SYMBOL_STORLEK: Stopp = [[8, 0.3], [11, 0.36], [13, 0.42], [15, 0.5], [17, 0.62]];

/**
 * Lagren för en kraftledning på `kalla` (ids `${prefix}-casing`, `-line`, `-stolpar`, `-symbol`; underst till överst). `filter` väljer ledningens features.
 * `synlig` = false → lagren startar dolda (sidan tänder dem med övriga Kör & fara-lager). Stolpar och symboler är symbollager med `symbol-placement: line`
 * (avståndet är i pixlar och följer inte zoomen, så stolparna ligger lika tätt på skärmen).
 */
export function kraftledningLager(kalla: string, prefix: string, filter: any[] | null, synlig = true, dim?: Dimning): any[] {
  const vis = { visibility: synlig ? 'visible' : 'none' } as const;
  const bas = { source: kalla, ...(filter ? { filter } : {}) };
  const bf = dim?.breddFaktor ?? 1;
  const op = dim ? { 'line-opacity': dim.opacitet } : {};
  const ikonOp = dim ? { paint: { 'icon-opacity': dim.opacitet } } : {};
  return [
    ...(dim?.utanKant ? [] : [{ id: `${prefix}-casing`, type: 'line', ...bas, paint: { 'line-color': KANT_SVART_STARK, 'line-width': zoomKurva(KRAFTLEDNING_BREDD, bf, KRAFTLEDNING_KANT_EXTRA), 'line-opacity': dim ? dim.opacitet : 1 }, layout: { ...vis, 'line-cap': 'round', 'line-join': 'round' } }]),
    { id: `${prefix}-line`, type: 'line', ...bas, paint: { 'line-color': FARG_FARA, 'line-width': zoomKurva(KRAFTLEDNING_BREDD, bf), ...op }, layout: { ...vis, 'line-cap': 'round', 'line-join': 'round' } },
    {
      id: `${prefix}-stolpar`, type: 'symbol', ...bas, ...ikonOp,
      layout: {
        ...vis, 'symbol-placement': 'line', 'symbol-spacing': KRAFTLEDNING_STOLPE_SPACING, 'icon-image': KRAFTLEDNING_STOLPE_BILD, 'icon-size': zoomKurva(KRAFTLEDNING_STOLPE_STORLEK, bf),
        'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-keep-upright': false, 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      },
    },
    {
      id: `${prefix}-symbol`, type: 'symbol', ...bas, ...ikonOp,
      layout: {
        // EN farosymbol per synlig ledningsbit (mitt på), inte en rad trianglar (Martin 2026-10-28: röran). Linjen och stolparna är kvar i full styrka.
        ...vis, 'symbol-placement': 'line-center', 'icon-image': KRAFTLEDNING_SYMBOL_BILD, 'icon-size': zoomKurva(KRAFTLEDNING_SYMBOL_STORLEK, bf),
        'icon-rotation-alignment': 'viewport', 'icon-pitch-alignment': 'viewport', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      },
    },
  ];
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

/**
 * De dubbla tvarstrecken (‖): TVA vagrata staplar efter varandra (mitt i bilden) med morkt kant, i vagens egen farg - som dubbel snitsel i skogen.
 * 'blagul' = blatt med gula delar (basvag utan farg). Staplarna ar vagrata vid rotation 0, dvs. tvars over en vag som gar norrut; ikonen roteras
 * med riktningen ut ur vagen. Mellanrummet mellan dem ar morkt (kanten) sa de lases som TVA streck, ocksa pa en gul vag pa ljus karta.
 */
export function ritaBackvagStreck(farg: 'red' | 'yellow' | 'blue' | 'blagul', px = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const s = px / 64;
  const langd = 46 * s, tjock = 10 * s, inre = 5.5 * s, avstand = 18 * s;   // avstand = mellan strackens mittlinjer
  const x0 = (px - langd) / 2;
  const mitt = px / 2;
  const rund = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  };
  for (const dy of [-avstand / 2, avstand / 2]) {
    const y0 = mitt + dy - tjock / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.9)';                        // morkt kant: syns pa ljus karta och pa flygfoto
    rund(x0, y0, langd, tjock, 2.5 * s); ctx.fill();
    const ix = x0 + 2 * s, iy = mitt + dy - inre / 2, ilangd = langd - 4 * s;
    if (farg === 'blagul') {                                  // blatt med gula delar, som basvagen utan farg
      const delar = 4, w = ilangd / delar;
      for (let i = 0; i < delar; i++) { ctx.fillStyle = i % 2 === 0 ? LEGEND.vatten : LEGEND.gul; ctx.fillRect(ix + i * w, iy, w + (i < delar - 1 ? 0.5 : 0), inre); }
    } else {
      ctx.fillStyle = farg === 'red' ? LEGEND.fara : farg === 'yellow' ? LEGEND.gul : LEGEND.vatten;
      ctx.fillRect(ix, iy, ilangd, inre);
    }
  }
  return c;
}

/**
 * Stolpen: ETT tvärstreck — vertikalt i bilden, och `symbol-placement: line` lägger ikonens x-axel längs linjen, så strecket står vinkelrätt mot ledningen.
 * Gruppens röd med mörk kant (syns på flygfoto och på vit karta). Bilden är symmetrisk, så den behöver inte vändas.
 */
export function ritaStolpeIkon(farg: string = FARG_FARA, px = 40): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const s = px / 40;
  const langd = 30 * s, tjock = 9 * s, inre = 4.5 * s;
  const x0 = (px - tjock) / 2, y0 = (px - langd) / 2;
  const rund = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  };
  ctx.fillStyle = KANT_SVART_STARK;
  rund(x0, y0, tjock, langd, 2.5 * s); ctx.fill();
  ctx.fillStyle = farg;
  ctx.fillRect(x0 + (tjock - inre) / 2, y0 + 2 * s, inre, langd - 4 * s);
  return c;
}

/** Vidas basväg (en linje i leveransen som inte är kraftledning) ritas brun när Vida inte gett en egen färg — samma som planeringsvyns trakt-basvag-line. */
export const VIDA_BASVAG_FARG = '#a16207';
