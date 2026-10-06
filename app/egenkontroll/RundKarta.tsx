'use client';

// Kartan i rundvyn. 180 px, sticky overst - poangen ar att se var man ar medan
// man gar, och det ar vart en tredjedel av skarmen.
//
// TVA LAGER SOM ALDRIG FAR BLANDAS IHOP:
//
//   KONTROLLPUNKTERNA ritas ur punkternas geometri_snapshot. Snapshotten ar
//   dokumentets sanning - den overlever att markeringen raderas i planeringen.
//   De bar status som farg och gar att centrera pa.
//
//   KONTEXTLAGRET (grans, diken, pilar ...) lases ur planering_markeringar och
//   ar bara orientering. Nedtonat, underordnat, INTE tryckbart. Det ar inte
//   innehall i dokumentet och ska inte se ut som det.
//
// BOUNDS KRAVS FOR MARKERINGARNA, INTE FOR POSITIONEN. Markeringar ligger i en
// SVG-rymd vars origo harleds ur kartbild_bounds. Saknas bounds ritas INGA
// markeringar - lat/lng-fallbacken anvander ett annat origo an det planeraren
// ritade mot, och den familjen har gett flera mils fel (#278, #322). GPS-
// positionen ar daremot redan WGS84 och behover ingenting.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FORARKARTA_ATTRIBUTION } from '@/app/oversikt/forarkarta-stil';
import { BASKARTOR, BASKARTA_DEFAULT, buildKartStil, wmsTileLayers, type BaskartaId } from '@/lib/mapLayers';
import type { MapLayers } from '@/lib/hooks/useMapLayers';
import { signeraKartfil } from '@/lib/kartfiler';
import { kartOrigoFranBounds } from '@/lib/kartkoordinater';
import {
  KONTEXT_KALLA, KONTROLL_KALLA, NUMMER_KALLA, PROVYTA_KALLA, VALD_LINJE_ID, VALD_SYMBOL_ID,
  geometriKoordinater, kontextFeature, kontextLager, kontextUtanKontrollpunkter,
  kontrollFeatures, kontrollLager, kontrollLagerIdn, provytaFeatures, provytaLager,
  provytaLagerIdn, valdLinjeFilter, valdSymbolFilter,
} from '@/lib/egenkontrollkarta';
import { IKON_PIXELRATIO, provytaBildNamn, ritaProvytaIkon } from '@/lib/provytaIkon';
import type { ProvytaStatus } from '@/lib/provytor';
import { PIL_STIL, ritaNummerIkon, ritaPilIkon } from '@/lib/kartstil';
import {
  TRAFF_RADIE_PX, avstandTillGeometriPx, traffIdFranEgenskaper, traffKindFranEgenskaper, valjTraff,
  type Kandidat,
} from '@/lib/egenkontrollTryck';
import { canvasToMapLibreImage, loadMarkerImageForMaplibre, markerIconDefs } from '@/lib/marker-icons';
import { T } from '@/lib/utbildning';
import type { EgenkontrollPunkt, EgenkontrollProvyta } from '@/lib/egenkontroll';
import type { LatLng } from '@/lib/provytor';

declare global {
  interface Window { maplibregl: any }
}

/** Standardhojd i rundvyn. Helskarmslaget skickar in sin egen. */
const HOJD_INLINE = 180;

export type KartObjektData = {
  lat?: number | null;
  lng?: number | null;
  kartbild_url?: string | null;
  kartbild_bounds?: unknown;
};

type Geo = { type: 'FeatureCollection'; features: any[] };
const TOM: Geo = { type: 'FeatureCollection', features: [] };

/**
 * Bilderna lagren refererar: symbolerna (lib/marker-icons.ts - samma som
 * planeringen), pilarna och basvagsnumren. Maste finnas innan lagren laggs
 * till, annars ritas ingenting tills MapLibre hunnit be om dem.
 *
 * En bild som inte gar att ladda far aldrig falla kartan - da saknas bara den
 * symbolen, och resten ritas.
 */
async function laggTillBilder(map: any, nummer: number[]): Promise<void> {
  const laddar: Promise<void>[] = [];
  for (const def of markerIconDefs) {
    const namn = `marker-${def.id}`;
    if (map.hasImage(namn)) continue;
    laddar.push((async () => {
      try {
        const bild = await loadMarkerImageForMaplibre(def.id);
        if (bild && !map.hasImage(namn)) map.addImage(namn, bild);
      } catch { /* en ikon som inte gar att ladda ska inte fa falla kartan */ }
    })());
  }
  for (const pil of PIL_STIL) {
    const namn = `arrow-${pil.id}`;
    if (map.hasImage(namn)) continue;
    try {
      const bild = canvasToMapLibreImage(ritaPilIkon(pil.color));
      if (bild) map.addImage(namn, bild);
    } catch { /* se ovan */ }
  }
  await Promise.all(laddar);
  sakraNummerBilder(map, nummer);
  sakraProvytaBilder(map);
}

/**
 * Provytornas tre ikoner (omatt, matt, overhoppad). pixelRatio 3: ritas i 3x och
 * visas i 1x - skarpt pa tatt skarm. En ikon som saknas gor att just det
 * tillstandet inte syns, sa det larmas hellre an tigs.
 */
function sakraProvytaBilder(map: any): void {
  for (const status of ['omatt', 'matt', 'overhoppad'] as ProvytaStatus[]) {
    const namn = provytaBildNamn(status);
    if (map.hasImage(namn)) continue;
    try {
      const bild = canvasToMapLibreImage(ritaProvytaIkon(status));
      if (bild) map.addImage(namn, bild, { pixelRatio: IKON_PIXELRATIO });
      else console.error('[egenkontroll] provytaikonen kunde inte ritas:', status);
    } catch (e) {
      console.error('[egenkontroll] provytaikonen kunde inte laggas till:', status, e);
    }
  }
}

/** Basvagsnumren som ikoner. Anropas aven nar data andras - nya nummer kan tillkomma. */
function sakraNummerBilder(map: any, nummer: number[]): void {
  for (const nr of nummer) {
    const namn = `nr-${nr}`;
    if (map.hasImage(namn)) continue;
    try {
      const bild = canvasToMapLibreImage(ritaNummerIkon(nr));
      if (bild) map.addImage(namn, bild);
    } catch { /* se ovan */ }
  }
}

/**
 * Laggar till ett lager och SAGER det nar MapLibre avvisat det. addLayer med ett
 * ogiltigt uttryck kastar inte - det loggar ett fel och hoppar lagret, sa
 * bygget ar gront och lagret ar bara borta. Lib-testet validerar uttrycken, och
 * den har kontrollen fangar det som anda slank igenom.
 */
function laggTillLager(map: any, spec: any, fore?: string): void {
  try {
    map.addLayer(spec, fore);
    if (!map.getLayer(spec.id)) console.error('[egenkontroll] lagret avvisades av MapLibre:', spec.id);
  } catch (e) {
    console.error('[egenkontroll] lagret kunde inte laggas till:', spec.id, e);
  }
}

export default function RundKarta({
  objekt: objektProp,
  punkter,
  kontext,
  provytor,
  valdPunktId,
  onPosition,
  position,
  onValjPunkt,
  onValjProvyta,
  hojd = HOJD_INLINE,
  centreraPa,
  stammar,
  visaStammar = false,
  baskarta = BASKARTA_DEFAULT,
  overlays,
  egnaVarden,
}: {
  objekt: KartObjektData | null;
  punkter: EgenkontrollPunkt[];
  /** Ravt data ur planering_markeringar - bara orientering. */
  kontext: { data: any; marker_id?: string | null }[];
  provytor: EgenkontrollProvyta[];
  valdPunktId: string | null;
  /** Positionen delas uppat sa avstandslistan slipper en egen GPS-prenumeration. */
  onPosition?: (p: { lat: number; lng: number; noggrannhet: number | null } | null) => void;
  /**
   * Positionen UTIFRAN. Satt (aven null) = kartan hamtar ingen egen position och
   * ritar bara det sidan ger - sidan ager en levande bevakning (useMinPosition).
   * Utelamnad = som forut: en engangslasning vid montering (gå-vyn).
   */
  position?: { lat: number; lng: number; noggrannhet: number | null } | null;
  /** Tryck pa en kontrollpunkt (id). Symbol > linje > zon, se lib/egenkontrollTryck.ts. */
  onValjPunkt?: (punktId: string) => void;
  /** Tryck pa en provyta (dess nummer). */
  onValjProvyta?: (nummer: number) => void;
  /** 180 i rundvyn, '100%' i helskarm. Ett lage i taget ar monterat. */
  hojd?: number | string;
  /** Ga-vyn centrerar pa ytan. */
  centreraPa?: { lat: number; lng: number } | null;
  /**
   * Avverkade stammar (WGS84). Skickas BARA i helskarmslaget - i den lilla
   * kartan ar 12 000 prickar brus, inte underlag.
   */
  stammar?: LatLng[];
  visaStammar?: boolean;
  /** Vald bakgrundskarta. Samma fyra som planeringsvyn. */
  baskarta?: BaskartaId;
  /** WMS-lager + vidaKartbild. Delas med planeringsvyn via mapLayers_v4. */
  overlays?: MapLayers;
  /** Egenkontrollens egna lager: punkter, provytor, stammar. */
  egnaVarden?: Record<string, boolean>;
}) {
  // Lases i map.on('load') som kor asynkront - da ar props ur forsta rendret
  // inte langre sanningen. Ref:en ger det som galler NAR lagret laggs pa.
  const overlaysRef = useRef<MapLayers | undefined>(overlays);
  overlaysRef.current = overlays;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [laddad, setLaddad] = useState(false);
  const [minPosition, setMinPosition] = useState<[number, number] | null>(null);
  const [positionsFel, setPositionsFel] = useState(false);

  // OBJEKTET STABILISERAS EFTER INNEHALL. hamtaRunda bygger ett NYTT kartObjekt-
  // objekt vid varje lasning, och kartans init-effekt beror pa det: med en tyst
  // omlasning (efter varje sparad avvikelse, provyta, stubbe) hade hela kartan
  // annars rivits och byggts om - kamera, tiles och lager borta mitt i rundan.
  // Innan omlasningen blev tyst syntes det inte: hela vyn byttes ut anda.
  const objektNyckel = objektProp
    ? JSON.stringify([objektProp.lat ?? null, objektProp.lng ?? null, objektProp.kartbild_url ?? null, objektProp.kartbild_bounds ?? null])
    : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const objekt = useMemo(() => objektProp, [objektNyckel]);
  const origo = useMemo(() => (objekt ? kartOrigoFranBounds(objekt) : null), [objekt]);
  // Ref sa hamtaPosition inte behover onPosition i sitt beroende och far ny identitet.
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;
  // Tryckhanterarna registreras EN gang vid skapandet - refs ger dem det som galler nu.
  const onValjPunktRef = useRef(onValjPunkt);
  onValjPunktRef.current = onValjPunkt;
  const onValjProvytaRef = useRef(onValjProvyta);
  onValjProvytaRef.current = onValjProvyta;
  const styrdPosition = position !== undefined;

  // --- Geometrierna ---------------------------------------------------------
  // KONTROLLPUNKTERNA: symbolen, linjen eller zonen sjalv, plus ett nummer mitt
  // pa varje numrerad basvag. Allt ur geometri_snapshot + punkt_typ.
  const kontroll = useMemo(() => {
    const punktFeatures: any[] = [];
    const nummerFeatures: any[] = [];
    if (origo) {
      for (const p of punkter) {
        const r = kontrollFeatures(p, origo);
        if (r.feature) punktFeatures.push(r.feature);
        if (r.nummer) nummerFeatures.push(r.nummer);
      }
    }
    return {
      punktGeo: { type: 'FeatureCollection', features: punktFeatures } as Geo,
      nummerGeo: { type: 'FeatureCollection', features: nummerFeatures } as Geo,
      nummer: Array.from(new Set(nummerFeatures.map((f) => f.properties.nr as number))),
    };
  }, [punkter, origo]);
  const punktGeo = kontroll.punktGeo;
  const nummerGeo = kontroll.nummerGeo;
  // Latest-varden for init-effekten, som bara kor vid mount.
  const nummerRef = useRef<number[]>(kontroll.nummer);
  nummerRef.current = kontroll.nummer;

  // KONTEXTEN: markeringar som INTE ar kontrollpunkter. De som redan ar det
  // dras bort - annars ritas varje kontrollpunkt tva ganger.
  const kontextGeo = useMemo<Geo>(() => {
    if (!origo) return TOM;
    const features = kontextUtanKontrollpunkter(kontext, punkter)
      .map((m) => kontextFeature(m?.data, origo))
      .filter(Boolean) as any[];
    return { type: 'FeatureCollection', features };
  }, [kontext, punkter, origo]);

  /**
   * Provytorna. Egen farg (bla), skild fran planens markeringar och fran
   * statusfargerna. TRE tillstand, och FORMEN skiljer dem: omatt = ihalig ring,
   * matt = fylld med bock, overhoppad = nedtonad ring med tvarstreck
   * (lib/provytaIkon.ts). Status harleds i provytaStatus - en yta som hoppats over
   * har ocksa matt satt, och ritades forr som matt.
   *
   * Ritas i FAST pixelstorlek, inte i sann skala: ytan ar 5,64 m i radie och
   * trakten ar over en kilometer bred, sa en sannskalig cirkel vore mindre an
   * en bildpunkt. Kartan ska hjalpa en att HITTA ytan - avstandslistan under
   * kartan ar det man faktiskt gar efter.
   */
  const provyteGeo = useMemo<Geo>(
    () => ({ type: 'FeatureCollection', features: provytaFeatures(provytor) }),
    [provytor],
  );

  /** Stammolnet. Sma, graa, ej tryckbara - underlag, inte innehall. */
  const stamGeo = useMemo<Geo>(() => ({
    type: 'FeatureCollection',
    features: (stammar ?? []).map((s2) => ({
      type: 'Feature', properties: {},
      geometry: { type: 'Point', coordinates: [s2.lng, s2.lat] },
    })),
  }), [stammar]);

  /** Avvikelsernas EGNA positioner - redan WGS84, ingen konvertering. */
  const avvikelseGeo = useMemo<Geo>(() => ({
    type: 'FeatureCollection',
    features: punkter
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({
        type: 'Feature', properties: { id: p.id },
        geometry: { type: 'Point', coordinates: [p.lng as number, p.lat as number] },
      })),
  }), [punkter]);

  // --- Egen position. WGS84, kraver ingen bounds. --------------------------
  const hamtaPosition = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setPositionsFel(true); return; }
    setPositionsFel(false);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setMinPosition([p.coords.longitude, p.coords.latitude]);
        onPositionRef.current?.({
          lat: p.coords.latitude, lng: p.coords.longitude,
          noggrannhet: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
        });
      },
      () => { setPositionsFel(true); onPositionRef.current?.(null); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  }, []);

  // Automatiskt forsok. I installerad PWA pa iOS ges ingen platsprompt utan en
  // riktig gest - da tystnar detta och raden nedanfor blir vagen in.
  // STYRD position (rundvyn): sidan ager bevakningen, och kartan hamtar ingen egen.
  useEffect(() => { if (!styrdPosition) hamtaPosition(); }, [hamtaPosition, styrdPosition]);

  // --- MapLibre fran CDN (samma injektion som ovriga kartvyer) -------------
  useEffect(() => {
    if (!document.getElementById('maplibre-css-egenkontroll')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css-egenkontroll';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }
    if (window.maplibregl) { setMapReady(true); return; }
    let script = document.getElementById('maplibre-js-egenkontroll') as HTMLScriptElement | null;
    const onload = () => setMapReady(true);
    if (!script) {
      script = document.createElement('script');
      script.id = 'maplibre-js-egenkontroll';
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      document.head.appendChild(script);
    }
    script.addEventListener('load', onload);
    if (window.maplibregl) setMapReady(true);
    return () => { script?.removeEventListener('load', onload); };
  }, []);

  // --- Init kartan en gang -------------------------------------------------
  useEffect(() => {
    if (!mapReady || !containerRef.current || mapRef.current || !objekt) return;
    const center: [number, number] = origo
      ? [origo.lng, origo.lat]
      : objekt.lat != null && objekt.lng != null
        ? [objekt.lng, objekt.lat]
        : [14.7, 56.5];

    const map = new window.maplibregl.Map({
      container: containerRef.current,
      style: buildKartStil(baskarta),
      center, zoom: 14, maxPitch: 0, dragRotate: false, attributionControl: false,
    });
    mapRef.current = map;
    try { map.touchZoomRotate.disableRotation(); } catch { /* aldre maplibre */ }
    // NERE TILL VANSTER, inte i default-hornet. Lagerknappen flyter nere till
    // hoger i helskarmen, och attributionen far inte hamna under den - CC-BY
    // kraver att den ar synlig.
    map.addControl(new window.maplibregl.AttributionControl({
      customAttribution: FORARKARTA_ATTRIBUTION, compact: true,
    }), 'bottom-left');

    // TRYCK. En ruta runt fingret (TRAFF_RADIE_PX per sida = 44 pt) i stallet for
    // en punkt: en basvag ar nagra pixlar bred och en tum ar det inte. Bara
    // kontrollpunkternas och provytornas lager fragas - KONTEXTEN (ek-k-*) ar
    // orientering och ska inte ga att trycka pa. Lager som ar slackta ger inga
    // traffar, sa en punkt man tagit bort ur kartan gar inte heller att tryck pa.
    map.on('click', (e: any) => {
      if (!onValjPunktRef.current && !onValjProvytaRef.current) return;
      const lagerIdn = ((map.getStyle()?.layers ?? []) as { id: string }[])
        .map((l) => l.id)
        .filter((id) => id.startsWith('ek-p-') || provytaLagerIdn().includes(id));
      if (lagerIdn.length === 0) return;
      const r = TRAFF_RADIE_PX;
      const traffar = map.queryRenderedFeatures(
        [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]],
        { layers: lagerIdn },
      ) as { properties: Record<string, unknown>; geometry: any }[];
      const kandidater: Kandidat[] = [];
      for (const f of traffar) {
        const kind = traffKindFranEgenskaper(f.properties);
        const id = traffIdFranEgenskaper(f.properties);
        if (!kind || id == null) continue;
        kandidater.push({ id, kind, dPx: avstandTillGeometriPx(f.geometry, e.point, (c) => map.project(c)) });
      }
      const traff = valjTraff(kandidater);
      if (!traff) return;
      if (traff.kind === 'provyta') onValjProvytaRef.current?.(Number(traff.id));
      else onValjPunktRef.current?.(traff.id);
    });

    // Kortet under kartan andrar hojd (kommentar, avvikelse) - da andras kartans
    // container, och MapLibre lyssnar bara pa FONSTRETS storlek. Utan detta ritas
    // kartan i fel storlek tills nagon vrider telefonen.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => { try { map.resize(); } catch { /* kartan borttagen */ } });
      ro.observe(containerRef.current);
    }

    // INIT PA style.load - INTE bara 'load'. MapLibres 'load' avfyras forst nar den
    // forsta renderingen ar klar OCH alla synliga tiles ar klara, och den avfyras
    // bara fran en renderingsram. Gar ALLA bakgrundstiles fel (ingen tackning i
    // skogen) efter den sista ramen kommer ingen ny ram, och 'load' uteblir for
    // alltid: kartan star kvar med bara sin bakgrund - inga kontrollpunkter, inga
    // lager. Matt i testselen: 5 av 30 starter. Stilen ar var egen JSON utan
    // natverkshamtning, sa style.load kommer direkt och behover inga tiles.
    // 'load' star kvar som reserv; initierad-vakten ser till att det bara sker en gang.
    let initierad = false;
    const initiera = async () => {
      if (initierad) return;
      initierad = true;
      map.resize();

      // WMS-lagren laggs pa EN gang, alla slackta. De tands sedan ur
      // overlays - samma monster som planeringsvyn, och samma data
      // (lib/mapLayers.ts) sa de tva vyerna inte kan visa olika kartor.
      for (const l of wmsTileLayers) {
        try {
          map.addSource(`wms-${l.id}`, { type: 'raster', tiles: l.tiles, tileSize: 256 });
          map.addLayer({
            id: `wms-layer-${l.id}`, type: 'raster', source: `wms-${l.id}`,
            paint: { 'raster-opacity': l.tileOpacity ?? 0.7 },
            layout: { visibility: 'none' },
          });
        } catch { /* ett trasigt lager far inte falla kartan */ }
      }

      // VIDA:s kartbild - NU ETT LAGER SOM ALLA ANDRA. Den tandes forr
      // ovillkorligt sa fort bounds fanns; nu ar den en rad i menyn. Det gor
      // att kartan duger aven pa de objekt som saknar bounds, dar den forr
      // inte hade nagon bakgrund alls att erbjuda.
      if (objekt.kartbild_url && objekt.kartbild_bounds) {
        const url = await signeraKartfil(objekt.kartbild_url);
        const b = objekt.kartbild_bounds as [[number, number], [number, number]];
        if (url) {
          map.addSource('ek-kartbild', {
            type: 'image', url,
            // [[south,west],[north,east]] -> hornen medurs fran nordvast
            coordinates: [[b[0][1], b[1][0]], [b[1][1], b[1][0]], [b[1][1], b[0][0]], [b[0][1], b[0][0]]],
          });
          map.addLayer({
            id: 'ek-kartbild', type: 'raster', source: 'ek-kartbild',
            paint: { 'raster-opacity': 0.85 },
            layout: { visibility: overlaysRef.current?.vidaKartbild ? 'visible' : 'none' },
          });
        }
      }

      // STAMMOLNET allra underst - underlag under allt annat.
      map.addSource('ek-stammar', { type: 'geojson', data: stamGeo });
      map.addLayer({
        id: 'ek-stammar', type: 'circle', source: 'ek-stammar',
        layout: { visibility: visaStammar ? 'visible' : 'none' },
        paint: {
          'circle-color': 'rgba(58,58,64,0.70)', 'circle-radius': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.55)', 'circle-stroke-width': 0.5,
        },
      });

      // BILDERNA FORE LAGREN: symboler, pilar och basvagsnummer.
      await laggTillBilder(map, nummerRef.current);
      // Kartan kan ha tagits bort medan bilderna laddades (komponenten
      // avmonterades). Da finns inget att lagga lager pa - och addSource pa en
      // borttagen karta kastar.
      if (mapRef.current !== map) return;

      // KONTEXT underst: nedtonat, tunt, ej tryckbart. Typens utseende behalls.
      map.addSource(KONTEXT_KALLA, { type: 'geojson', data: kontextGeo });
      for (const spec of kontextLager()) laggTillLager(map, spec);

      // KONTROLLPUNKTERNA over: typens eget utseende, med status som en ring
      // eller ett band RUNT - obesvarad har ingen. Se lib/kartstil.ts.
      map.addSource(KONTROLL_KALLA, { type: 'geojson', data: punktGeo });
      map.addSource(NUMMER_KALLA, { type: 'geojson', data: nummerGeo });
      for (const spec of kontrollLager()) laggTillLager(map, spec);

      // Avvikelsernas egna GPS-positioner - eget lager, egen rymd.
      map.addSource('ek-avvikelser', { type: 'geojson', data: avvikelseGeo });
      map.addLayer({
        id: 'ek-avvikelse', type: 'circle', source: 'ek-avvikelser',
        paint: {
          'circle-color': 'rgba(255,69,58,0.25)', 'circle-radius': 9,
          'circle-stroke-color': '#FF453A', 'circle-stroke-width': 2,
        },
      });

      // PROVYTORNA: en symbol per tillstand, ur en spec som listan delar.
      map.addSource(PROVYTA_KALLA, { type: 'geojson', data: provyteGeo });
      for (const spec of provytaLager()) laggTillLager(map, spec);

      map.addSource('ek-jag', { type: 'geojson', data: TOM });
      map.addLayer({
        id: 'ek-jag', type: 'circle', source: 'ek-jag',
        paint: {
          'circle-color': '#0A84FF', 'circle-radius': 6,
          'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
        },
      });

      // STARTVYN PASSAS TILL TRAKTEN, INTE TILL MARKERINGARNA.
      //
      // En enda trasig markering skulle annars sanka hela kartan. Abogen har en
      // kulturlamning vars sparade x/y ar (2854, 2418) mot +/-60 for objektets
      // ovriga tolv punkter - den hamnar 9,9 km bort. Passade vi in alla
      // features skulle trakten krympa till en prick, just pa det objekt som
      // gatts i falt. Kartbildens bounds ar traktens sanna utstrackning.
      // Avvikaren ritas anda och "visa" centrerar pa den, sa datan doljs inte -
      // den far bara inte styra startvyn.
      const b2 = new window.maplibregl.LngLatBounds();
      let nagot = false;
      const bb = objekt.kartbild_bounds as [[number, number], [number, number]] | null;
      if (bb) {
        b2.extend([bb[0][1], bb[0][0]]);
        b2.extend([bb[1][1], bb[1][0]]);
        nagot = true;
      } else {
        for (const f of [...punktGeo.features, ...kontextGeo.features]) {
          for (const q of geometriKoordinater(f.geometry)) { b2.extend(q); nagot = true; }
        }
      }
      if (nagot) map.fitBounds(b2, { padding: 24, maxZoom: 16, duration: 0 });
      setLaddad(true);
    };
    map.once('style.load', initiera);
    map.once('load', initiera);

    return () => {
      ro?.disconnect();
      try { map.remove(); } catch { /* noop */ }
      mapRef.current = null;
      setLaddad(false);
    };
  }, [mapReady, objekt, origo]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Uppdatera data nar status andras -----------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !laddad) return;
    // Nya basvagsnummer behover sin bild FORE datan, annars ritas inget nummer.
    sakraNummerBilder(map, kontroll.nummer);
    map.getSource(KONTROLL_KALLA)?.setData(punktGeo);
    map.getSource(NUMMER_KALLA)?.setData(nummerGeo);
    map.getSource(KONTEXT_KALLA)?.setData(kontextGeo);
    map.getSource('ek-avvikelser')?.setData(avvikelseGeo);
    map.getSource(PROVYTA_KALLA)?.setData(provyteGeo);
    map.getSource('ek-stammar')?.setData(stamGeo);
  }, [punktGeo, nummerGeo, kontextGeo, kontroll.nummer, avvikelseGeo, provyteGeo, stamGeo, laddad]);

  // --- Bakgrundskartan ------------------------------------------------------
  // Alla fyra ligger redan i stilen; vi tander en och slacker de andra. Att
  // bygga om stilen hade tagit bort varje lager kartan lagt till efterat.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !laddad) return;
    for (const b of BASKARTOR) {
      if (map.getLayer(b.layerId)) {
        map.setLayoutProperty(b.layerId, 'visibility', b.id === baskarta ? 'visible' : 'none');
      }
    }
  }, [baskarta, laddad]);

  // --- WMS-lagren + VIDA-bilden ---------------------------------------------
  // Ett saknat lager ar inte ett fel: kartbilden laggs bara till nar objektet
  // har en, och da ska raden i menyn helt enkelt inte gora nagot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !laddad || !overlays) return;
    for (const l of wmsTileLayers) {
      const id = `wms-layer-${l.id}`;
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', overlays[l.id] ? 'visible' : 'none');
      }
    }
    if (map.getLayer('ek-kartbild')) {
      map.setLayoutProperty('ek-kartbild', 'visibility', overlays.vidaKartbild ? 'visible' : 'none');
    }
  }, [overlays, laddad]);

  // --- Egenkontrollens egna lager -------------------------------------------
  // Punkter och provytor slacks som GRUPPER: en punkt far aldrig kunna vara
  // tand i ett lager och slackt i ett annat. Din position har ingen strombrytare
  // - den ar ankaret, och den som rakar slacka sig sjalv i skogen vinner inget.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !laddad || !egnaVarden) return;
    const satt = (lagerId: string, pa: boolean) => {
      if (map.getLayer(lagerId)) map.setLayoutProperty(lagerId, 'visibility', pa ? 'visible' : 'none');
    };
    const punkterPa = egnaVarden.ekPunkter !== false;
    for (const id of [...kontrollLagerIdn(), 'ek-avvikelse']) satt(id, punkterPa);
    const ytorPa = egnaVarden.ekProvytor !== false;
    for (const id of provytaLagerIdn()) satt(id, ytorPa);
  }, [egnaVarden, laddad]);

  // Strombrytaren tander/slacker lagret utan att rita om kartan.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !laddad) return;
    if (map.getLayer('ek-stammar')) {
      map.setLayoutProperty('ek-stammar', 'visibility', visaStammar ? 'visible' : 'none');
    }
  }, [visaStammar, laddad]);

  // Ga-vyn: centrera pa ytan, inte pa trakten.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !laddad || !centreraPa) return;
    map.easeTo({ center: [centreraPa.lng, centreraPa.lat], zoom: 17, duration: 400 });
  }, [centreraPa, laddad]);

  // Pricken. STYRD position = det sidan ger (null = ingen prick - en position som
  // inte dugar ritas inte ut, en prick pa fel plats vilseleder mer an ingen).
  const jagKoord: [number, number] | null = styrdPosition
    ? (position ? [position.lng, position.lat] : null)
    : minPosition;
  const jagLng = jagKoord ? jagKoord[0] : null;
  const jagLat = jagKoord ? jagKoord[1] : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !laddad) return;
    map.getSource('ek-jag')?.setData(
      jagLng != null && jagLat != null
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [jagLng, jagLat] } }] }
        : TOM,
    );
  }, [jagLng, jagLat, laddad]);

  // --- Centrera pa vald punkt ---------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !laddad) return;
    const id = valdPunktId ?? '';
    if (map.getLayer(VALD_LINJE_ID)) map.setFilter(VALD_LINJE_ID, valdLinjeFilter(id));
    if (map.getLayer(VALD_SYMBOL_ID)) map.setFilter(VALD_SYMBOL_ID, valdSymbolFilter(id));
    if (!valdPunktId) return;
    const f = punktGeo.features.find((x: any) => x.properties.id === valdPunktId);
    if (!f) return;
    if (f.geometry.type === 'Point') {
      map.easeTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 16), duration: 450 });
    } else {
      // Linjer och zoner: alla brytpunkter (en zon ar en Polygon - ringen ligger en niva ner).
      const b = new window.maplibregl.LngLatBounds();
      for (const c of geometriKoordinater(f.geometry)) b.extend(c);
      map.fitBounds(b, { padding: 40, maxZoom: 17, duration: 450 });
    }
  }, [valdPunktId, punktGeo, laddad]);

  // --- Tomma tillstand -----------------------------------------------------
  if (!objekt) return null;

  // FYLLER = hojd angiven som strang ('100%' fran helskarmen och ga-vyn).
  //
  // DA MASTE WRAPPERN SJALV BARA HOJDEN. Gjorde den inte det resolverade
  // containerns height:100% mot en auto-hog foralder och blev NOLL pixlar -
  // matt i Chrome: bararen 715 px, wrappern 0, kartan 0. Kartan initierades,
  // resize() kordes mot 0x0 och ingenting kastades. En nollhog container ar
  // helt tyst, sa varken typkontroll, bygge eller databaskoll kunde se den;
  // helskarmen och ga-vyn sag bara ut som knappar som inte gjorde nagot.
  //
  // Talfallet (rundvyns 180) ar orort - ett tal ger en definitiv hojd som
  // aldrig har berott pa foraldern.
  const fyller = typeof hojd === 'string';

  return (
    <div style={fyller
      ? { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }
      : { marginBottom: 12 }}>
      <div
        ref={containerRef}
        style={{
          // flex:1 i stallet for height:100% - da kommer hojden fran
          // flexlayouten och notisraderna nedan far plats utan att kartan
          // trycks utanfor.
          ...(fyller ? { flex: 1, minHeight: 0 } : { height: hojd }),
          borderRadius: fyller ? 0 : 12,
          overflow: 'hidden', background: '#ECEDE7',
        }}
      />
      {/* Sag rakt ut vad kartan INTE kan har - anvandaren ska slippa prova sig fram. */}
      {!origo && (
        <div style={{ fontSize: 12.5, color: T.orange, lineHeight: 1.4, marginTop: 6 }}>
          Planeringens markeringar kan inte placeras på kartan för det här objektet.
          Kartan visar var du är, men tryck på en punkt centrerar ingenting.
        </div>
      )}
      {origo && positionsFel && (
        <button
          onClick={hamtaPosition}
          style={{
            marginTop: 6, minHeight: 44, width: '100%', borderRadius: 10,
            border: '1.5px solid rgba(255,255,255,0.14)', background: 'transparent',
            color: T.t2, fontSize: 14, fontFamily: T.ff,
          }}
        >
          Din position kunde inte hämtas — tryck för att försöka igen
        </button>
      )}
    </div>
  );
}
