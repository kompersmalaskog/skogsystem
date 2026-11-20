// TVÅ TRYCK I STÄLLET FÖR ETT DRAG (Martin 2026-10-25): kör upp-pilen och fällträdet sätts med två tryck på kartan.
//   • KÖR UPP OCH BACKA: första trycket = START (snäpper till närmaste väg inom 32 px), andra trycket = SLUT (hur långt in).
//   • FÄLLTRÄD: första trycket = STUBBEN, andra trycket = ÅT VILKET HÅLL DET FALLER.
// Mellan trycken visas en tunn förhandsvisning (en linje från starten till pekaren, och för trädet ett svagt spökträd): med mus följer den pekaren, med ett finger visas den medan fingret är
// nere. Trycken är MapLibres egna 'click' — ett drag är en panorering (kartan går att flytta mellan trycken), och mus och finger ger samma sak utan egen dubbelhändelsehantering.
// Lyssnarna är märkta `tillatIRitlage`: medan ritläget är på körs bara de (lib/ritlageSparr stänger av all annan tryckning).
// Allt som kan prövas utan karta ligger i lib/fallTrad och lib/korUpp; här finns bara trycken.

import { KORUPP_MIN_M, korUppLangdM, snappaTillVag, type SnappVag } from './korUpp';
import { vinkelFranPunkt } from './fallTrad';
import { avstandPunktM, type LatLon } from './larm/geo';
import { tillatIRitlage } from './ritlageSparr';

export type TvaTryckSlag = 'trad' | 'korupp';
/** Närmare än så här är andra trycket "samma ställe": det räknas som en ny start, inte som ett slut. */
export const TRAD_MIN_M = 2;

export interface TvaStart { slag: TvaTryckSlag; start: LatLon; vagId: string | null }
export interface TvaForhandsvisning { slag: TvaTryckSlag; start: LatLon; slut: LatLon }
export type TvaKlart =
  | { slag: 'korupp'; start: LatLon; slut: LatLon; vagId: string | null }
  | { slag: 'trad'; stubbe: LatLon; vinkel: number };

export interface TvaTryckIn {
  /** Vilket läge som är på (null = av). */
  slag: TvaTryckSlag | null;
  vagarRef: { current: readonly SnappVag[] };
  /** Första trycket är gjort (eller startades om / avbröts: null). Sidan visar startpunkten och frågan "tryck där …". */
  onStart: (start: TvaStart | null) => void;
  /** Pekaren rör sig medan starten finns (null = ta bort förhandsvisningen men behåll starten). */
  onForhandsvisning: (f: TvaForhandsvisning | null) => void;
  /** Andra trycket: pilen respektive trädet är klart. */
  onKlart: (k: TvaKlart) => void;
}

/** Är andra trycket ett giltigt slut? (Annars börjar det om som en ny start.) */
export function arGiltigtSlut(slag: TvaTryckSlag, start: LatLon, slut: LatLon): boolean {
  return slag === 'korupp' ? korUppLangdM({ start, slut }) >= KORUPP_MIN_M : avstandPunktM(start, slut) >= TRAD_MIN_M;
}

/** Kopplar trycken till kartan medan ett läge är på. `hamta` ger alltid senaste läget (sidan byter funktioner varje rendering). Returnerar en avkopplare. */
export function kopplaTvaTryck(map: any, slag: TvaTryckSlag, hamta: () => TvaTryckIn): () => void {
  let start: TvaStart | null = null;

  const llFran = (e: any): LatLon => ({ lat: e.lngLat.lat, lon: e.lngLat.lng });
  const sattStart = (e: any) => {
    let pos = llFran(e);
    let vagId: string | null = null;
    if (slag === 'korupp') {
      const snapp = snappaTillVag(hamta().vagarRef.current, { x: e.point.x, y: e.point.y }, (c) => { const q = map.project([c[0], c[1]]); return { x: q.x, y: q.y }; });
      if (snapp) { pos = snapp.punkt; vagId = snapp.id; }
    }
    start = { slag, start: pos, vagId };
    hamta().onStart(start);
    hamta().onForhandsvisning(null);
  };

  const onKlick = tillatIRitlage((e: any) => {
    if (!e?.lngLat) return;
    if (!start) { sattStart(e); return; }
    const slut = llFran(e);
    if (!arGiltigtSlut(slag, start.start, slut)) { sattStart(e); return; }   // för nära: börja om här
    const s = start;
    start = null;
    hamta().onForhandsvisning(null);
    hamta().onStart(null);
    if (slag === 'korupp') hamta().onKlart({ slag: 'korupp', start: s.start, slut, vagId: s.vagId });
    else hamta().onKlart({ slag: 'trad', stubbe: s.start, vinkel: vinkelFranPunkt(s.start, slut) });
  });
  const visa = tillatIRitlage((e: any) => { if (start && e?.lngLat) hamta().onForhandsvisning({ slag, start: start.start, slut: llFran(e) }); });
  const doljVidLyft = tillatIRitlage(() => { if (start) hamta().onForhandsvisning(null); });

  // Två snabba tryck nära varandra är annars ett dubbeltryck (zoom) — samma sak som vid rita och mät.
  map.doubleClickZoom?.disable();
  map.on('click', onKlick);
  map.on('mousemove', visa);
  map.on('touchstart', visa);
  map.on('touchmove', visa);
  map.on('touchend', doljVidLyft);
  map.on('touchcancel', doljVidLyft);
  return () => {
    map.doubleClickZoom?.enable();
    map.off('click', onKlick);
    map.off('mousemove', visa);
    map.off('touchstart', visa);
    map.off('touchmove', visa);
    map.off('touchend', doljVidLyft);
    map.off('touchcancel', doljVidLyft);
    if (start) { start = null; hamta().onForhandsvisning(null); hamta().onStart(null); }
  };
}

// ── Förhandsvisningen mellan trycken ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const TVATRYCK_KALLA = 'tvatryck-source';
/** Prefixet `line-` ligger i körvyns lager-whitelist (KEEP_PREFIX). Inga symbollager: inget att klippa på zoom. */
export const TVATRYCK_KANT_LAGER = 'line-tvatryck-kant';
export const TVATRYCK_LINJE_LAGER = 'line-tvatryck-linje';
export const TVATRYCK_START_LAGER = 'line-tvatryck-start';
/** Tunn: 2 px linje med en 4 px mörk kant, fast på skärmen. */
export const TVATRYCK_LINJE_PX = 2;

export function tvaTryckData(start: LatLon | null, slut: LatLon | null) {
  const features: any[] = [];
  if (start) features.push({ type: 'Feature', properties: { slag: 'start' }, geometry: { type: 'Point', coordinates: [start.lon, start.lat] } });
  if (start && slut) features.push({ type: 'Feature', properties: { slag: 'linje' }, geometry: { type: 'LineString', coordinates: [[start.lon, start.lat], [slut.lon, slut.lat]] } });
  return { type: 'FeatureCollection' as const, features };
}

export function tvaTryckLager(kalla = TVATRYCK_KALLA): any[] {
  return [
    { id: TVATRYCK_KANT_LAGER, type: 'line', source: kalla, filter: ['==', ['get', 'slag'], 'linje'], layout: { 'line-cap': 'round' }, paint: { 'line-color': 'rgba(0,0,0,0.7)', 'line-width': TVATRYCK_LINJE_PX + 2 } },
    { id: TVATRYCK_LINJE_LAGER, type: 'line', source: kalla, filter: ['==', ['get', 'slag'], 'linje'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': TVATRYCK_LINJE_PX } },
    { id: TVATRYCK_START_LAGER, type: 'circle', source: kalla, filter: ['==', ['get', 'slag'], 'start'], paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-color': 'rgba(0,0,0,0.8)', 'circle-stroke-width': 2, 'circle-pitch-alignment': 'viewport' } },
  ];
}
