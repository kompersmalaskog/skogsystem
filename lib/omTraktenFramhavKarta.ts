// Om trakten › "Visa ›" mot kartan (MapLibre): framhäv den valda markeringen, tona ner övriga, pulsera, och släpp vid tryck på kartan.
// Egen fil så att exakt samma kod kan köras i en riktig MapLibre-karta i en testrigg — sidan själv går inte att montera i test.
//
// Två skilda delar, med olika livslängd (sidan kopplar dem i varsin effekt):
//   • startaFramhavning  — det man SER (ring, förstorad symbol, glöd, etikett, nedtoning). Byggs om när kartans lager ändras.
//   • startaKartSlapp    — att ett tryck på kartan lämnar framhävningen. Hänger på valet, INTE på kartans lager: förut låg släppet i samma effekt som
//                          ritningen (en engångslyssnare på kartans click-händelse, efter en spärr) och startades om varje gång `markers` ändrades → tryck inom spärren, eller
//                          mot en lyssnare som hunnit byggas om, släppte aldrig i riktiga sidan.

import {
  DIMMA_FYLL_OPACITET, FRAMHAV_ETIKETT_KALLA, FRAMHAV_FARG, FRAMHAV_KALLA, FRAMHAV_KANT, FRAMHAV_LAGER, RING_BREDD_PX, RING_KANT_PX,
  arKartTryck, dimmaMal, etikettPunkt, forstoradIkonStorlek, framhavGeoJson, lika, pulsFas, ringRadieStopp, type FramhavdMarkering,
} from './omTraktenFramhav';
import { ritaFramhavEtikett, framhavEtikettBildId } from './omTraktenEtikettBild';
import { ETIKETT_PIXELRATIO } from './figurEtikettBild';

/** Den delen av kartan vi använder (MapLibre `Map`). */
export interface FramhavKarta {
  getStyle(): any;
  getSource(id: string): any;
  addSource(id: string, spec: any): any;
  removeSource(id: string): any;
  getLayer(id: string): any;
  addLayer(spec: any, before?: string): any;
  removeLayer(id: string): any;
  hasImage(id: string): boolean;
  addImage(id: string, img: any, opt?: any): any;
  removeImage(id: string): any;
  getPaintProperty(layer: string, prop: string): any;
  setPaintProperty(layer: string, prop: string, value: any): any;
  getCanvasContainer(): HTMLElement;
}

const PULS_MS = 1400;
const BILD_MS = 33;   // ~30 bilder/s

/**
 * Startar framhävningen och ger tillbaka en funktion som städar: återställer varje lager till exakt det värde det hade och tar bort sina egna
 * lager, källor och bilder.
 */
export function startaFramhavning(map: FramhavKarta, f: FramhavdMarkering, o: { minskadRorelse?: boolean } = {}): () => void {
  const sparade: { id: string; prop: string; orig: any }[] = [];
  const egnaLager: string[] = [];
  const egnaKallor: string[] = [];
  const egnaBilder: string[] = [];
  let raf = 0; let sist = 0;
  const minskad = !!o.minskadRorelse;
  const symbol = f.slag === 'symbol';
  try {
    const lager: { id: string; type?: string }[] = (map.getStyle()?.layers ?? []).map((l: any) => ({ id: l.id, type: l.type }));
    // Linjens och ytans glöd läggs UNDER markeringarnas egna lager, så den aldrig döljer linjen den framhäver; symbolens ring och etiketten ligger överst.
    const forstaEgna = lager.find((l) => l.id.startsWith('line-') || l.id.startsWith('zone-') || l.id.startsWith('markers-') || l.id.startsWith('arrows-'))?.id;
    const data: any = framhavGeoJson(f);
    const kalla = map.getSource(FRAMHAV_KALLA);
    if (kalla) kalla.setData(data); else { map.addSource(FRAMHAV_KALLA, { type: 'geojson', data }); egnaKallor.push(FRAMHAV_KALLA); }
    const lagg = (spec: any, fore?: string) => { if (!map.getLayer(spec.id)) { map.addLayer(spec, fore); egnaLager.push(spec.id); } };
    const punkt = ['==', ['geometry-type'], 'Point'];
    const ejPunkt = ['!=', ['geometry-type'], 'Point'];
    // Yta: blått fält + blå kontur med vit kant.
    lagg({ id: FRAMHAV_LAGER.fyll, type: 'fill', source: FRAMHAV_KALLA, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': FRAMHAV_FARG, 'fill-opacity': 0.25 } }, forstaEgna);
    // Linje/yta: vit kant bredast, blå glöd ovanpå (HELA linjen).
    lagg({ id: FRAMHAV_LAGER.halo, type: 'line', source: FRAMHAV_KALLA, filter: ejPunkt, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': FRAMHAV_KANT, 'line-width': 18, 'line-opacity': 0.85 } }, forstaEgna);
    lagg({ id: FRAMHAV_LAGER.glod, type: 'line', source: FRAMHAV_KALLA, filter: ejPunkt, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': FRAMHAV_FARG, 'line-width': 12, 'line-opacity': 0.95 } }, forstaEgna);
    if (symbol) {
      // Puls utanför (mjuk), vit kant, blå ring — ringen syns även utan pulsen. Alla med markeringens egen storlek (zoomstopp) och mot skärmen.
      const viewport = { 'circle-pitch-alignment': 'viewport', 'circle-pitch-scale': 'viewport' };
      lagg({ id: FRAMHAV_LAGER.puls, type: 'circle', source: FRAMHAV_KALLA, filter: punkt, paint: { 'circle-radius': ringRadieStopp(), 'circle-color': FRAMHAV_FARG, 'circle-opacity': 0.2, ...viewport } });
      lagg({ id: FRAMHAV_LAGER.ringHalo, type: 'circle', source: FRAMHAV_KALLA, filter: punkt, paint: { 'circle-radius': ringRadieStopp(), 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': FRAMHAV_KANT, 'circle-stroke-width': RING_BREDD_PX + RING_KANT_PX * 2, 'circle-stroke-opacity': 0.9, ...viewport } });
      lagg({ id: FRAMHAV_LAGER.ring, type: 'circle', source: FRAMHAV_KALLA, filter: punkt, paint: { 'circle-radius': ringRadieStopp(), 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': FRAMHAV_FARG, 'circle-stroke-width': RING_BREDD_PX, 'circle-stroke-opacity': 1, ...viewport } });
      // Symbolen själv, 1,5× större, ovanpå de andra (samma bild som kartans, ur samma källa, filtrerad på id).
      if (map.getLayer('markers-layer') && map.getSource('markers-source')) {
        lagg({
          id: FRAMHAV_LAGER.symbol, type: 'symbol', source: 'markers-source', filter: ['all', ['!=', ['get', 'prick'], true], lika(f.id)],
          layout: {
            'icon-image': ['concat', 'marker-', ['get', 'type']], 'icon-size': forstoradIkonStorlek(), 'icon-allow-overlap': true, 'icon-ignore-placement': true,
            'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport', 'icon-anchor': 'center', 'symbol-z-order': 'source',
          },
          paint: { 'icon-opacity': 1 },
        });
      }
    }
    // Etikett med kommentaren intill: symbol → ovanför ringen; linje/yta → ovanför mittpunkten.
    const ep = etikettPunkt(f);
    const bild = ep && f.etikett ? ritaFramhavEtikett(f.etikett) : null;
    if (ep && bild) {
      const bildId = framhavEtikettBildId(f.etikett);
      if (!map.hasImage(bildId)) { map.addImage(bildId, bild.bild, { pixelRatio: ETIKETT_PIXELRATIO }); egnaBilder.push(bildId); }
      const epData = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [ep.lng, ep.lat] } }] };
      const ekalla = map.getSource(FRAMHAV_ETIKETT_KALLA);
      if (ekalla) ekalla.setData(epData); else { map.addSource(FRAMHAV_ETIKETT_KALLA, { type: 'geojson', data: epData }); egnaKallor.push(FRAMHAV_ETIKETT_KALLA); }
      lagg({
        id: FRAMHAV_LAGER.etikett, type: 'symbol', source: FRAMHAV_ETIKETT_KALLA,
        layout: {
          'icon-image': bildId, 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport',
          // Ovanför: en etikett på upp till 240 px får plats i bredd även på en 390 px bred telefon (bredvid ringen skars den av vid skärmkanten).
          'icon-anchor': 'bottom',
          // icon-offset räknas i bildens px: ringens radie (zoomstopp) + luft rakt upp för en symbol, en lyfthöjd för linje/yta.
          'icon-offset': symbol
            ? ['interpolate', ['linear'], ['zoom'], ...[10, 12, 13, 14, 15, 16, 17, 19].flatMap((z) => [z, ['literal', [0, -Math.round(radieVid(z) + 10)]]])]
            : [0, -12],
        },
      });
    }
    // Tona ner alla andra markeringar (den valda behåller sitt fulla värde). Id jämförs som TEXT (`lika`): kartans id är ofta ett tal.
    for (const mal of dimmaMal(lager)) {
      try {
        const orig = map.getPaintProperty(mal.id, mal.prop);
        sparade.push({ id: mal.id, prop: mal.prop, orig });
        map.setPaintProperty(mal.id, mal.prop, ['case', lika(f.id), orig ?? 1, mal.dim]);
      } catch { /* uttrycket gick inte att linda in (t.ex. zoom-interpolering) — lagret lämnas som det är */ }
    }
  } catch { /* kartan inte redo */ }

  const stil = (s: number) => {
    try {
      if (map.getLayer(FRAMHAV_LAGER.puls)) {
        map.setPaintProperty(FRAMHAV_LAGER.puls, 'circle-radius', ringRadieStopp(RING_BREDD_PX + 16 * s));
        map.setPaintProperty(FRAMHAV_LAGER.puls, 'circle-opacity', 0.3 * (1 - s));
      }
      if (map.getLayer(FRAMHAV_LAGER.fyll)) map.setPaintProperty(FRAMHAV_LAGER.fyll, 'fill-opacity', 0.35 - 0.2 * s + DIMMA_FYLL_OPACITET);
      if (map.getLayer(FRAMHAV_LAGER.glod)) map.setPaintProperty(FRAMHAV_LAGER.glod, 'line-width', 12 + 4 * s);
    } catch { /* */ }
  };
  stil(pulsFas(0, PULS_MS, minskad));
  if (!minskad && typeof requestAnimationFrame !== 'undefined') {
    const tick = (nu: number) => { if (nu - sist >= BILD_MS) { sist = nu; stil(pulsFas(nu, PULS_MS)); } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  }

  return () => {
    if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf);
    for (const sp of sparade) { try { map.setPaintProperty(sp.id, sp.prop, sp.orig === undefined ? null : sp.orig); } catch { /* */ } }
    for (const id of egnaLager) { try { if (map.getLayer(id)) map.removeLayer(id); } catch { /* */ } }
    for (const id of egnaKallor) { try { if (map.getSource(id)) map.removeSource(id); } catch { /* */ } }
    for (const id of egnaBilder) { try { if (map.hasImage(id)) map.removeImage(id); } catch { /* */ } }
  };
}

/** Ringens radie (px) vid en viss zoom — samma stopp som i `ringRadieStopp`, avläst för etikettens avstånd. */
function radieVid(z: number): number {
  const u: any[] = ringRadieStopp();
  const stopp: [number, number][] = [];
  for (let i = 3; i + 1 < u.length; i += 2) stopp.push([u[i], u[i + 1]]);
  if (z <= stopp[0][0]) return stopp[0][1];
  for (let i = 1; i < stopp.length; i++) {
    if (z <= stopp[i][0]) { const [z0, r0] = stopp[i - 1], [z1, r1] = stopp[i]; return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0); }
  }
  return stopp[stopp.length - 1][1];
}

/**
 * Ett tryck på kartan lämnar framhävningen. Lyssnar på kartans CANVAS-behållare i infångningsfasen (pointerdown/up) — inte på MapLibres `click`
 * efter en spärr — så sidans egna kartklick-hanterare, lager som stoppar klicket och omritningar av lagren inte kan hindra det. En panorering, ett nyp
 * eller ett långt tryck räknas inte (`arKartTryck`). Returnerar en funktion som tar bort lyssnarna.
 */
export function startaKartSlapp(container: HTMLElement, onSlapp: () => void, nu: () => number = () => Date.now()): () => void {
  const ner = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number; t: number } | null = null;
  let flerFingrar = false;
  const pd = (e: PointerEvent) => {
    ner.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ner.size === 1) { start = { x: e.clientX, y: e.clientY, t: nu() }; flerFingrar = false; } else flerFingrar = true;
  };
  const pu = (e: PointerEvent) => {
    const s = start;
    ner.delete(e.pointerId);
    if (ner.size > 0 || !s) return;
    start = null;
    if (arKartTryck({ dx: e.clientX - s.x, dy: e.clientY - s.y, ms: nu() - s.t, flerFingrar })) onSlapp();
  };
  const pc = (e: PointerEvent) => { ner.delete(e.pointerId); if (ner.size === 0) start = null; };
  container.addEventListener('pointerdown', pd, true);
  container.addEventListener('pointerup', pu, true);
  container.addEventListener('pointercancel', pc, true);
  return () => {
    container.removeEventListener('pointerdown', pd, true);
    container.removeEventListener('pointerup', pu, true);
    container.removeEventListener('pointercancel', pc, true);
  };
}
