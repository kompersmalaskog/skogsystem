'use client';
// Objektöversiktens karta: "Var körde maskinerna?" (Martin och kollegan 2026-10-24).
//
// Samma bild som planeringsvyn, utan att man skickas dit: körspår (skördare lila heldragen, skotare grön streckad),
// produktionshögar (skördarens stammar klustrade, samma algoritm som planeringen — lib/produktionshogar), planerarens
// vägar, symboler och ytor (samma ritregler som planeringen och egenkontrollen — lib/kartstil, lib/egenkontrollkarta),
// Vidas traktgräns och maskinerna där de senast var. Varje sak går att tända och släcka (Lager).
//
// "Hur mycket avverkades här?": tryck runt ett område → m³fub, träd och ha inne i det, räknat på skördarens stammar
// (lib/objektoversikt/karta: iOmradet). Sträcka går också att mäta. Inget sparas.
//
// Bara läsning: kartan ändrar ingenting i databasen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AVSTAND, FARG, KNAPP, KORT, RADIE, TNUM, TRAFFYTA, TYP, underTopbar } from '@/lib/design/tokens';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import Ark from '@/components/design/Ark';
import Flikkontroll from '@/components/design/Flikkontroll';
import { buildKartStil, type BaskartaId } from '@/lib/mapLayers';
import { FORARKARTA_ATTRIBUTION } from '@/app/oversikt/forarkarta-stil';
import {
  BACKVAG_KALLA, SPAR_KALLA, VIDA_GRANS_KALLA, backvagFeatureUrData, backvagLager, kontextFeature, sparFeatures, sparLager,
  vidaGransFeatures, vidaGransLager,
} from '@/lib/egenkontrollkarta';
import { linjeLager, pilLager, symbolLager, zonFyllLager, zonKantLager, zonSnedstreckLager, PIL_STIL, backvagIkonNamn, ritaBackvagStreck, ritaPilIkon, ritaStolpeIkon } from '@/lib/kartstil';
import { VAG_LINJETYPER, BACKVAG_STRECK_FARGER } from '@/lib/backvag';
import { snedstreckBild, snedstreckId, SNEDSTRECK_GRUPPER } from '@/lib/ytaStil';
import { canvasToMapLibreImage, loadMarkerImageForMaplibre, markerIconDefs } from '@/lib/marker-icons';
import { rollFarg } from '@/lib/sparStil';
import { arDubbeltryck, type TryckPunkt } from '@/lib/ritaPunkter';
import { formatLength, pathMeters } from '@/lib/geoMat';
import { lasKartdata, type KartData, type KartMaskin } from '@/lib/objektoversikt/lasKarta';
import { hogFeatures, hogText, iOmradet, maskinRad, omradeSvar, omradeUnder, rutaRunt, type LngLat } from '@/lib/objektoversikt/karta';

declare global { interface Window { maplibregl: any } }

export const KARTA_HOJD = 360;
export const KARTA_HOJD_BRED = 520;

export type Lager = 'skordare' | 'skotare' | 'hogar' | 'vagar' | 'symboler' | 'grans' | 'maskiner';
export const LAGER: readonly { id: Lager; namn: string }[] = [
  { id: 'skordare', namn: 'Körspår skördare' },
  { id: 'skotare', namn: 'Körspår skotare' },
  { id: 'hogar', namn: 'Produktionshögar' },
  { id: 'vagar', namn: 'Basvägar och stickvägar' },
  { id: 'symboler', namn: 'Symboler och ytor' },
  { id: 'grans', namn: 'Traktgräns' },
  { id: 'maskiner', namn: 'Maskinerna' },
];
const ALLA_PA: Record<Lager, boolean> = { skordare: true, skotare: true, hogar: true, vagar: true, symboler: true, grans: true, maskiner: true };
const LAGRING = 'oo_karta_lager_v1';

const KALLA = 'oo-mark';
const HOG_KALLA = 'oo-hogar';
const MAT_KALLA = 'oo-mat';
const PREFIX_GRANS = 'oo-g';
const PREFIX_VAG = 'oo-v';
const PREFIX_OVR = 'oo-o';
const HEL: { opacitet: number; breddFaktor: number } = { opacitet: 1, breddFaktor: 1 };

/** Lagren per lagerval — id:n ur samma byggare som ritar dem. */
function lagerSpec() {
  const grans = [...vidaGransLager(), ...linjeLager(KALLA, PREFIX_GRANS, null, undefined, { endast: ['boundary'] })];
  const vagar = [...linjeLager(KALLA, PREFIX_VAG, null, undefined, { endast: VAG_LINJETYPER }), ...backvagLager()];
  const ovrigaFyll = [...zonFyllLager(KALLA, PREFIX_OVR, null), ...zonSnedstreckLager(KALLA, PREFIX_OVR, null)];
  const ovrigaLinjer = [...zonKantLager(KALLA, PREFIX_OVR, null), ...linjeLager(KALLA, PREFIX_OVR, null, undefined, { utom: [...VAG_LINJETYPER, 'boundary'] })];
  const ovrigaSymboler = [pilLager(KALLA, PREFIX_OVR, HEL), symbolLager(KALLA, PREFIX_OVR, null)];
  const hogar = [{
    id: 'oo-hogar', type: 'circle', source: HOG_KALLA,
    paint: {
      'circle-color': ['get', 'farg'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        13, ['interpolate', ['linear'], ['sqrt', ['get', 'volym']], 0, 2, 5, 5],
        17, ['interpolate', ['linear'], ['sqrt', ['get', 'volym']], 0, 3, 5, 12]],
      'circle-stroke-color': 'rgba(0,0,0,0.6)', 'circle-stroke-width': 1, 'circle-opacity': 0.9,
    },
  }];
  const skordare = sparLager('skordare');
  const skotare = sparLager('skotare');
  return { grans, vagar, ovrigaFyll, ovrigaLinjer, ovrigaSymboler, hogar, skordare, skotare };
}

/** Vilka lager-id som hör till vilket val. */
function lagerIdn(): Record<Exclude<Lager, 'maskiner'>, string[]> {
  const s = lagerSpec();
  const id = (l: any[]) => l.map(x => x.id as string);
  return {
    grans: id(s.grans), vagar: id(s.vagar), symboler: [...id(s.ovrigaFyll), ...id(s.ovrigaLinjer), ...id(s.ovrigaSymboler)],
    hogar: id(s.hogar), skordare: id(s.skordare), skotare: id(s.skotare),
  };
}

function lasLager(): Record<Lager, boolean> {
  try {
    const r = JSON.parse(localStorage.getItem(LAGRING) || 'null');
    if (r && typeof r === 'object') return { ...ALLA_PA, ...Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'boolean')) };
  } catch { /* minnet går inte att läsa: standarden */ }
  return { ...ALLA_PA };
}

async function laggTillBilder(map: any): Promise<void> {
  const laddar: Promise<void>[] = [];
  for (const def of markerIconDefs) {
    const namn = `marker-${def.id}`;
    if (map.hasImage(namn)) continue;
    laddar.push((async () => { try { const b = await loadMarkerImageForMaplibre(def.id); if (b && !map.hasImage(namn)) map.addImage(namn, b); } catch { /* en ikon som saknas fäller inte kartan */ } })());
  }
  for (const pil of PIL_STIL) {
    const namn = `arrow-${pil.id}`;
    if (!map.hasImage(namn)) { try { const b = canvasToMapLibreImage(ritaPilIkon(pil.color)); if (b) map.addImage(namn, b); } catch { /* */ } }
  }
  for (const f of BACKVAG_STRECK_FARGER) {
    const namn = backvagIkonNamn(f);
    if (!map.hasImage(namn)) { try { const b = canvasToMapLibreImage(ritaBackvagStreck(f)); if (b) map.addImage(namn, b); } catch { /* */ } }
  }
  for (const g of SNEDSTRECK_GRUPPER) {
    if (!map.hasImage(snedstreckId(g))) { try { map.addImage(snedstreckId(g), snedstreckBild(g)); } catch { /* */ } }
  }
  if (!map.hasImage('kraftledning-stolpe')) { try { const b = canvasToMapLibreImage(ritaStolpeIkon()); if (b) map.addImage('kraftledning-stolpe', b); } catch { /* */ } }
  await Promise.all(laddar);
}

type Mat = null | 'yta' | 'linje';

export default function ObjektKarta({ objektUuid, ids, maskiner, jobbade }: {
  objektUuid: string;
  /** Objektets alla nummer (objektIds) — stammarna ligger under dem. */
  ids: string[];
  /** Alla maskiner med namn och roll (dim_maskin). */
  maskiner: KartMaskin[];
  /** Maskinerna som jobbat på objektet (tid, produktion eller tilldelning). */
  jobbade: string[];
}) {
  const [data, setData] = useState<KartData | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [forsok, setForsok] = useState(0);
  const [lager, setLager] = useState<Record<Lager, boolean>>(ALLA_PA);
  const [baskarta, setBaskarta] = useState<BaskartaId>('satellite');
  const [lagerOppen, setLagerOppen] = useState(false);
  const [helskarm, setHelskarm] = useState(false);
  const [mat, setMat] = useState<Mat>(null);
  const [tryck, setTryck] = useState<LngLat[]>([]);
  const [valdHog, setValdHog] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [mapLaddad, setMapLaddad] = useState(false);
  const [cdnKlar, setCdnKlar] = useState(false);
  const matRef = useRef<Mat>(null);
  matRef.current = mat;
  const senasteTryck = useRef<TryckPunkt | null>(null);
  const markorer = useRef<any[]>([]);

  useEffect(() => { setLager(lasLager()); }, []);
  const sattLager = (id: Lager, pa: boolean) => {
    setLager(l => {
      const ny = { ...l, [id]: pa };
      try { localStorage.setItem(LAGRING, JSON.stringify(ny)); } catch { /* bara bekvämlighet */ }
      return ny;
    });
  };

  // --- Datan ---------------------------------------------------------------------------------------------------------
  const idsNyckel = ids.join(',');
  const jobbadeNyckel = jobbade.join(',');
  useEffect(() => {
    let avbruten = false;
    setLaddar(true);
    lasKartdata(supabase as any, { objektUuid, ids, maskiner, jobbade }).then(d => {
      if (!avbruten) { setData(d); setLaddar(false); }
    });
    return () => { avbruten = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objektUuid, idsNyckel, jobbadeNyckel, forsok]);

  // --- MapLibre från CDN (samma som egenkontrollens karta) ----------------------------------------------------------
  useEffect(() => {
    if (!document.getElementById('maplibre-css-egenkontroll')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css-egenkontroll'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }
    if (window.maplibregl) { setCdnKlar(true); return; }
    let script = document.getElementById('maplibre-js-egenkontroll') as HTMLScriptElement | null;
    const onload = () => setCdnKlar(true);
    if (!script) {
      script = document.createElement('script');
      script.id = 'maplibre-js-egenkontroll';
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      document.head.appendChild(script);
    }
    script.addEventListener('load', onload);
    if (window.maplibregl) setCdnKlar(true);
    return () => { script?.removeEventListener('load', onload); };
  }, []);

  // --- Geometrierna ----------------------------------------------------------------------------------------------------
  const geo = useMemo(() => {
    const tom = { type: 'FeatureCollection', features: [] as any[] };
    if (!data) return null;
    const mark = data.origo ? data.markeringar.map(m => kontextFeature(m.data, data.origo!)).filter(Boolean) : [];
    const backvag = data.origo ? data.markeringar.map(m => backvagFeatureUrData(m.data, data.origo!, undefined, false)).filter(Boolean) : [];
    const sparOf = (roll: 'skordare' | 'skotare') => ({ ...tom, features: sparFeatures(data.spar.filter(s => s.roll === roll).flatMap(s => s.linjer.map(l => l.map(([lng, lat]) => ({ lat, lng }))))) });
    return {
      mark: { ...tom, features: mark as any[] },
      backvag: { ...tom, features: backvag as any[] },
      vida: { ...tom, features: vidaGransFeatures(data.vidaRingar) },
      skordare: sparOf('skordare'),
      skotare: sparOf('skotare'),
      hogar: { ...tom, features: hogFeatures(data.stammar) },
    };
  }, [data]);

  // --- Kartan skapas en gång -----------------------------------------------------------------------------------------
  useEffect(() => {
    if (!cdnKlar || !containerRef.current || mapRef.current) return;
    const map = new window.maplibregl.Map({
      container: containerRef.current, style: buildKartStil(baskarta), center: [14.7, 56.5], zoom: 13,
      maxPitch: 0, dragRotate: false, attributionControl: false,
    });
    mapRef.current = map;
    try { map.touchZoomRotate.disableRotation(); } catch { /* */ }
    map.addControl(new window.maplibregl.AttributionControl({ customAttribution: FORARKARTA_ATTRIBUTION, compact: true }), 'bottom-left');
    map.on('load', async () => { await laggTillBilder(map); setMapLaddad(true); });
    map.on('click', (e: any) => {
      if (matRef.current) {
        const nytt = { x: e.point.x, y: e.point.y, tid: Date.now() };
        if (arDubbeltryck(senasteTryck.current, nytt)) return;
        senasteTryck.current = nytt;
        setTryck(t => [...t, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }
      const r = 22;
      const traffar = map.getLayer('oo-hogar') ? map.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]], { layers: ['oo-hogar'] }) : [];
      setValdHog(traffar[0] ? hogText(traffar[0].properties) : null);
    });
    return () => { try { map.remove(); } catch { /* */ } mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cdnKlar]);

  // Bakgrunden byts: stilen laddas om, och våra lager läggs på igen (mapLaddad → effekten nedan).
  const forstaStil = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (forstaStil.current) { forstaStil.current = false; return; }
    setMapLaddad(false);
    map.setStyle(buildKartStil(baskarta));
    map.once('style.load', async () => { await laggTillBilder(map); setMapLaddad(true); });
  }, [baskarta]);

  // --- Källor och lager ----------------------------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLaddad || !geo) return;
    const satt = (id: string, d: any) => { const s = map.getSource(id); if (s) s.setData(d); else map.addSource(id, { type: 'geojson', data: d }); };
    satt(KALLA, geo.mark);
    satt(BACKVAG_KALLA, geo.backvag);
    satt(VIDA_GRANS_KALLA, geo.vida);
    satt(SPAR_KALLA.skordare, geo.skordare);
    satt(SPAR_KALLA.skotare, geo.skotare);
    satt(HOG_KALLA, geo.hogar);
    satt(MAT_KALLA, { type: 'FeatureCollection', features: [] });
    const s = lagerSpec();
    const ordning = [...s.ovrigaFyll, ...s.grans, ...s.ovrigaLinjer, ...s.vagar, ...s.skordare, ...s.skotare, ...s.hogar, ...s.ovrigaSymboler];
    for (const spec of ordning) { if (!map.getLayer(spec.id)) { try { map.addLayer(spec); } catch (e) { console.error('[objektkarta] lagret kunde inte läggas till', spec.id, e); } } }
    if (!map.getLayer('oo-mat-fyll')) {
      map.addLayer({ id: 'oo-mat-fyll', type: 'fill', source: MAT_KALLA, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': FARG.bla, 'fill-opacity': 0.18 } });
      map.addLayer({ id: 'oo-mat-linje', type: 'line', source: MAT_KALLA, filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': '#ffffff', 'line-width': 3 } });
      map.addLayer({ id: 'oo-mat-punkt', type: 'circle', source: MAT_KALLA, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': FARG.bla, 'circle-stroke-width': 2 } });
    }
  }, [geo, mapLaddad]);

  // Kameran: en gång, när datan kommit — trakten, stammarna och spåren i bild.
  const kameraSatt = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLaddad || !data || kameraSatt.current) return;
    const ruta = rutaRunt([
      ...data.vidaRingar.flat(),
      ...data.stammar.map(st => [st.lng, st.lat] as LngLat),
      ...data.spar.flatMap(sp => sp.linjer.flat()),
      ...data.maskiner.filter(m => m.har).map(m => [m.lng, m.lat] as LngLat),
    ]);
    if (!ruta) return;
    kameraSatt.current = true;
    map.fitBounds([[ruta.minLng, ruta.minLat], [ruta.maxLng, ruta.maxLat]], { padding: { top: AVSTAND.xxl, bottom: AVSTAND.xxl, left: AVSTAND.xxl, right: AVSTAND.xxl * 3 }, duration: 0, maxZoom: 17 });
  }, [data, mapLaddad]);

  // Synligheten följer lagervalen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLaddad) return;
    const idn = lagerIdn();
    for (const [val, lista] of Object.entries(idn) as [Exclude<Lager, 'maskiner'>, string[]][]) {
      for (const id of lista) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', lager[val] ? 'visible' : 'none'); }
    }
  }, [lager, mapLaddad, geo]);

  // Maskinerna: HTML-markörer (få, och namnet ska alltid gå att läsa).
  useEffect(() => {
    const map = mapRef.current;
    for (const m of markorer.current) m.remove();
    markorer.current = [];
    if (!map || !mapLaddad || !data || !lager.maskiner) return;
    for (const m of data.maskiner) {
      const el = document.createElement('div');
      el.setAttribute('data-maskin-prick', m.maskin_id);
      el.style.cssText = `display:flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border-radius:999px;background:${FARG.kort};color:${FARG.text};font:600 13px/1.2 -apple-system,system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.5)`;
      const prick = document.createElement('span');
      prick.style.cssText = `width:14px;height:14px;border-radius:50%;background:${rollFarg(m.roll)};border:2px solid #fff;flex-shrink:0`;
      const text = document.createElement('span');
      text.textContent = m.nar === 'nu' ? m.namn : `${m.namn} · ${m.nar}`;
      el.append(prick, text);
      markorer.current.push(new window.maplibregl.Marker({ element: el, anchor: 'left', offset: [-11, 0] }).setLngLat([m.lng, m.lat]).addTo(map));
    }
  }, [data, lager.maskiner, mapLaddad]);

  // Mätningen ritas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLaddad) return;
    const src = map.getSource(MAT_KALLA);
    if (!src) return;
    const f: any[] = tryck.map(p => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }));
    if (mat === 'yta' && tryck.length >= 3) f.unshift({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...tryck, tryck[0]]] } });
    else if (tryck.length >= 2) f.unshift({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: tryck } });
    src.setData({ type: 'FeatureCollection', features: f });
  }, [tryck, mat, mapLaddad, geo]);

  // Helskärm: kartan får en ny storlek.
  useEffect(() => { const t = setTimeout(() => { try { mapRef.current?.resize(); } catch { /* */ } }, 0); return () => clearTimeout(t); }, [helskarm]);
  useEffect(() => {
    if (!helskarm) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelskarm(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [helskarm]);

  const flygTill = useCallback((lng: number, lat: number) => {
    try { mapRef.current?.flyTo({ center: [lng, lat], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 600 }); } catch { /* */ }
  }, []);

  const borjaMata = (vad: Exclude<Mat, null>) => { setValdHog(null); setTryck([]); senasteTryck.current = null; setMat(vad); };
  const slutaMata = () => { setMat(null); setTryck([]); };

  const hogTradslag = useMemo(() => {
    const sett = new Map<string, string>();
    for (const f of geo?.hogar.features ?? []) if (!sett.has(f.properties.tradslag)) sett.set(f.properties.tradslag, f.properties.farg);
    return [...sett].map(([namn, farg]) => ({ namn, farg }));
  }, [geo]);

  const omrade = mat === 'yta' && data ? iOmradet(data.stammar, tryck) : null;
  const langd = mat === 'linje' && tryck.length >= 2 ? pathMeters(tryck) : null;

  const finns: Record<Lager, boolean> = {
    skordare: !!data?.spar.some(s => s.roll === 'skordare'),
    skotare: !!data?.spar.some(s => s.roll === 'skotare'),
    hogar: (data?.stammar.length ?? 0) > 0,
    vagar: !!geo?.mark.features.some((f: any) => f.properties.kind === 'linje' && VAG_LINJETYPER.includes(f.properties.typ)),
    symboler: !!geo?.mark.features.some((f: any) => f.properties.kind !== 'linje' || (!VAG_LINJETYPER.includes(f.properties.typ) && f.properties.typ !== 'boundary')),
    grans: (data?.vidaRingar.length ?? 0) > 0 || !!geo?.mark.features.some((f: any) => f.properties.typ === 'boundary'),
    maskiner: (data?.maskiner.length ?? 0) > 0,
  };
  const saknasText: Record<Lager, string> = {
    skordare: 'Inget spår – appen var inte igång i hytten', skotare: 'Inget spår – appen var inte igång i hytten', hogar: 'Inga stammar med position',
    vagar: data?.origoText ? 'Kan inte placeras på kartan' : 'Planeraren har inte ritat några vägar',
    symboler: data?.origoText ? 'Kan inte placeras på kartan' : 'Inga symboler eller ytor', grans: 'Ingen traktgräns',
    maskiner: 'Ingen maskin har skickat en position',
  };

  return (
    <section aria-label="Var körde maskinerna?" style={{ marginBottom: AVSTAND.xxl }} data-objekt-karta="">
      <style>{`.oo-karta-yta { height: ${KARTA_HOJD}px; } @container (min-width: 640px) { .oo-karta-yta { height: ${KARTA_HOJD_BRED}px; } }`}</style>
      <h2 style={{ margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px`, ...TYP.rubrik }}>Var körde maskinerna?</h2>
      <div style={helskarm
        ? { position: 'fixed', top: underTopbar(), left: 0, right: 0, bottom: 0, zIndex: 1500, background: FARG.bg, display: 'flex', flexDirection: 'column' }
        : { ...KORT, padding: 0, overflow: 'hidden' }}
        data-helskarm={helskarm ? '' : undefined}>
        <div style={{ position: 'relative', flex: helskarm ? '1 1 auto' : undefined }} className={helskarm ? undefined : 'oo-karta-yta'}>
          <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} data-karta="" />
          {laddar && (
            <div style={{ position: 'absolute', top: AVSTAND.m, left: AVSTAND.m, padding: `${AVSTAND.xs}px ${AVSTAND.m}px`, borderRadius: RADIE.knapp, background: FARG.kort, ...TYP.meta, color: FARG.text2 }}>
              Hämtar kartan …
            </div>
          )}
          <div style={{ position: 'absolute', right: AVSTAND.s, top: AVSTAND.s, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            <RundKnapp ikon="layers" text="Lager" onClick={() => setLagerOppen(true)} attr="lager" />
            <RundKnapp ikon={helskarm ? 'close_fullscreen' : 'open_in_full'} text={helskarm ? 'Mindre karta' : 'Större karta'} onClick={() => setHelskarm(h => !h)} attr="helskarm" />
          </div>
        </div>

        {/* Under kartan: mätningen, eller den tryckta högen. */}
        {mat ? (
          <div style={{ padding: AVSTAND.l, background: FARG.kort }} data-matning="">
            <Flikkontroll flikar={[['yta', 'Område'], ['linje', 'Sträcka']] as const} aktiv={mat} onVal={v => borjaMata(v)} />
            <div style={{ marginTop: AVSTAND.m, minHeight: 72 }}>
              {mat === 'yta' && !omrade && (
                <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }} data-mat-hjalp="">
                  Tryck på kartan runt området. {tryck.length > 0 ? `${tryck.length} av minst 3 punkter.` : ''}
                </p>
              )}
              {omrade && (
                <div data-omrade="">
                  <div style={{ ...TYP.meta, color: FARG.text2 }}>Avverkat i området</div>
                  <div style={{ ...TYP.tal }} data-omrade-svar="">{omradeSvar(omrade)}</div>
                  <div style={{ ...TYP.text, ...TNUM }}>{omradeUnder(omrade)}</div>
                  {omrade.tradslag.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${AVSTAND.xs}px ${AVSTAND.m}px`, marginTop: AVSTAND.xs, ...TYP.meta, ...TNUM, color: FARG.text2 }}>
                      {omrade.tradslag.map(t => (
                        <span key={t.namn} style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}>
                          <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: t.farg }} />
                          {t.namn} {t.m3.toLocaleString('sv-SE')}
                        </span>
                      ))}
                    </div>
                  )}
                  {(data?.utanPosition ?? 0) > 0 && (
                    <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
                      {data!.utanPosition.toLocaleString('sv-SE')} träd saknar position och räknas inte.
                    </div>
                  )}
                </div>
              )}
              {mat === 'linje' && langd === null && (
                <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Tryck på kartan där sträckan börjar och slutar.</p>
              )}
              {langd !== null && (
                <div data-langd="">
                  <div style={{ ...TYP.meta, color: FARG.text2 }}>Sträcka</div>
                  <div style={{ ...TYP.tal }}>{formatLength(langd)}</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.m }}>
              <button type="button" onClick={() => setTryck(t => t.slice(0, -1))} disabled={tryck.length === 0}
                style={{ ...KNAPP.sekundar, flex: 1, opacity: tryck.length === 0 ? 0.4 : 1 }} data-mat-angra="">
                Ta bort punkt
              </button>
              <button type="button" onClick={slutaMata} style={{ ...KNAPP.sekundar, flex: 1 }} data-mat-klar="">
                Klar
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: AVSTAND.m, background: FARG.kort }}>
            {valdHog
              ? <div style={{ padding: `0 ${AVSTAND.xs}px ${AVSTAND.m}px`, ...TYP.text, ...TNUM }} data-vald-hog="">{valdHog}</div>
              : lager.hogar && hogTradslag.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: `${AVSTAND.xs}px ${AVSTAND.m}px`, padding: `0 ${AVSTAND.xs}px ${AVSTAND.m}px`, ...TYP.meta, color: FARG.text2 }} data-forklaring-hogar="">
                  {hogTradslag.map(t => (
                    <span key={t.namn} style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}>
                      <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: t.farg }} />{t.namn}
                    </span>
                  ))}
                  <span>· Prickarna är skördarens högar. Tryck på en.</span>
                </div>
              )}
            <button type="button" onClick={() => borjaMata('yta')} data-kartknapp="mat"
              style={{ ...KNAPP.sekundar, width: '100%', gap: AVSTAND.s }}>
              <Ikon namn="pentagon" farg="inherit" />Mät ett område
            </button>
          </div>
        )}
      </div>

      {/* Maskinerna och det som inte gick att läsa. */}
      {data && (data.maskiner.length > 0 || data.utanPlats.length > 0) && (
        <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0, marginTop: AVSTAND.m }} data-maskiner="">
          {data.maskiner.map((m, i) => {
            const r = maskinRad(m);
            return (
              <Rad key={m.maskin_id} titel={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.m }}>
                  <span aria-hidden="true" style={{ width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.cirkel, background: rollFarg(m.roll), boxShadow: '0 0 0 2px #fff', flexShrink: 0 }} />
                  {r.titel}
                </span>}
                under={r.under}
                onTryck={() => flygTill(m.lng, m.lat)}
                sista={i === data.maskiner.length - 1 && data.utanPlats.length === 0}
                attr={{ 'data-maskin-rad': m.maskin_id }} />
            );
          })}
          {data.utanPlats.length > 0 && (
            <p style={{ margin: 0, padding: `${AVSTAND.m}px 0`, ...TYP.meta, color: FARG.text2 }}>
              {data.utanPlats.join(', ')} har inte skickat någon position.
            </p>
          )}
        </div>
      )}
      {data?.origoText && <p style={{ margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0`, ...TYP.meta, color: FARG.text2 }}>{data.origoText}</p>}
      {data && data.fel.length > 0 && (
        <p style={{ margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0`, ...TYP.meta, color: FARG.orange }} data-kartfel="">
          Kunde inte läsa {data.fel.join(', ')}.{' '}
          <button type="button" onClick={() => setForsok(f => f + 1)} style={{ ...KNAPP.lank, display: 'inline', minHeight: 0, padding: 0 }}>Försök igen</button>
        </p>
      )}

      {lagerOppen && (
        <Ark rubrik="Visa på kartan" stang="Klar" onStang={() => setLagerOppen(false)}>
          <div style={{ marginBottom: AVSTAND.l }}>
            <Flikkontroll flikar={[['satellite', 'Flygfoto'], ['lantmateriet', 'Karta']] as const} aktiv={baskarta === 'satellite' ? 'satellite' : 'lantmateriet'} onVal={v => setBaskarta(v)} />
          </div>
          {LAGER.map((l, i) => (
            <Brytare key={l.id} namn={l.namn} pa={lager[l.id] && finns[l.id]} kan={finns[l.id]}
              under={finns[l.id] ? undefined : saknasText[l.id]} sista={i === LAGER.length - 1}
              onVaxla={() => sattLager(l.id, !lager[l.id])} id={l.id} />
          ))}
        </Ark>
      )}
    </section>
  );
}

/** Rund knapp i kartans hörn (som Apple Kartor): bara ikonen, namnet för skärmläsare. */
function RundKnapp({ ikon, text, onClick, attr }: { ikon: string; text: string; onClick: () => void; attr: string }) {
  return (
    <button type="button" onClick={onClick} data-kartknapp={attr} aria-label={text} title={text}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: TRAFFYTA.min, height: TRAFFYTA.min, padding: 0,
        borderRadius: RADIE.cirkel, border: 'none', background: FARG.kort, color: FARG.text, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
      }}>
      <Ikon namn={ikon} farg="inherit" />
    </button>
  );
}

/** En rad med en brytare (på/av). En sak som inte finns går inte att slå på, och raden säger varför. */
function Brytare({ namn, pa, kan, under, sista, onVaxla, id }: { namn: string; pa: boolean; kan: boolean; under?: string; sista: boolean; onVaxla: () => void; id: string }) {
  return (
    <button type="button" role="switch" aria-checked={pa} disabled={!kan} onClick={onVaxla} data-lager={id}
      style={{
        display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.min + AVSTAND.s, padding: `${AVSTAND.s}px 0`,
        background: 'none', border: 'none', borderBottom: sista ? 'none' : `1px solid ${FARG.linje}`, color: FARG.text, font: 'inherit',
        textAlign: 'left', cursor: kan ? 'pointer' : 'default',
      }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', ...TYP.listtitel, color: kan ? FARG.text : FARG.text2 }}>{namn}</span>
        {under && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{under}</span>}
      </span>
      <span aria-hidden="true" style={{
        width: 51, height: 31, borderRadius: 16, padding: AVSTAND.xs / 2, boxSizing: 'border-box', flexShrink: 0,
        background: pa ? FARG.gron : FARG.upphojt, opacity: kan ? 1 : 0.4, display: 'flex', justifyContent: pa ? 'flex-end' : 'flex-start',
        transition: 'background 150ms',
      }}>
        <span style={{ width: 27, height: 27, borderRadius: '50%', background: '#fff' }} />
      </span>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{pa ? 'På' : 'Av'}</span>
    </button>
  );
}
