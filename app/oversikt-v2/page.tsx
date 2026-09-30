'use client';
// ── Översikt v2 (SLUTLIG) — kartan ÄR hela sidan ──────────────────────────────
// Skördare: nästa = förmannens kö (numrerad rutt 1→2). Skotare: automatiskt, roll-
// filtrerat. Förare landar på egen maskin, ser Nu + 1 + 2. Förman: hela flottan,
// tryck maskin = kön som rutt, tryck objekt = lägg i kö. Ringar = väntar. Zoom styr
// täthet. Inga flikar, inget filter, inga inställningar. Ljus förarkarta, mörka chip.
// Alla km = ORS-vägavstånd eller "–". Rör inte gamla /oversikt eller planeringen.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { maskinVisningsnamn } from '@/lib/maskinNamn';
import { buildForarkartaStyle, FORARKARTA_ATTRIBUTION } from '../oversikt/forarkarta-stil';
import { classifyMarkering, markeringSub, SUB_LABEL, prettifySub } from '../oversikt/markeringar';
import type { OversiktObjekt, Maskin, MaskinKoItem } from '../oversikt/oversikt-types';
import { STATUS_AKTIV, STATUS_AVSLUTADE } from '../oversikt/oversikt-types';
import { hamtaSenastePlatser, dagarSedan, type PlatsForslag } from '../maskinflytt/senastePlats';
import { paBackenKvar } from '@/lib/skotat';
import { hamtaSkordMapV2, type SkordAggV2 } from './skord-data';
import { beraknaForslag, arSkotare, maskinAktiv, type MaskinForslag, type MaskinRad, type KoPost } from './nasta-v2';
import { FARG, TYP, AVSTAND, RADIE, FONT, TNUM, designCss } from '@/lib/design/tokens';

declare global { interface Window { maplibregl: any } }

const CHIP_BG = 'rgba(28,28,30,0.94)';
const GRAY_LINE = 'rgba(72,72,74,0.95)';
const LIT_LINE = '#1c1c1e';
const GRAY_DOT = '#636366';
const THRESHOLD_ZOOM = 11; // < detta = översikt (bara maskiner + pågående + ringar); ≥ = allt

const fmt = (n: number) => Math.round(n).toLocaleString('sv-SE');
function kortDatum(d: string | null): string {
  if (!d) return '';
  return new Date(d.length <= 10 ? `${d}T00:00:00` : d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
async function fetchAllRows<T>(query: () => any): Promise<T[]> {
  const PAGE = 1000; const all: T[] = []; let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await query().range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}
/** ORS-vägavstånd via /api/routing. Bara source cache/ors räknas; annars null → "–". Aldrig fågelväg. */
async function vagKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<number | null> {
  try {
    const r = await fetch(`/api/routing?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`);
    const j = await r.json();
    return (typeof j.km === 'number' && (j.source === 'cache' || j.source === 'ors')) ? j.km : null;
  } catch { return null; }
}

interface MarkeringRow { objekt_id: string | null; typ: string | null; data: any }
interface ObjWarn { faror: string[]; hansyn: string[] }
function buildWarnings(rows: MarkeringRow[]): Record<string, ObjWarn> {
  const byObj: Record<string, ObjWarn> = {};
  for (const m of rows) {
    if (!m.objekt_id) continue;
    const level = classifyMarkering(m.data);
    if (level !== 'fara' && level !== 'hansyn') continue;
    const subRaw = markeringSub(m.data);
    const label = subRaw ? (SUB_LABEL[subRaw] || prettifySub(subRaw)) : 'Markering';
    (byObj[m.objekt_id] ||= { faror: [], hansyn: [] });
    if (level === 'fara') byObj[m.objekt_id].faror.push(label);
    else byObj[m.objekt_id].hansyn.push(label);
  }
  return byObj;
}
const varnText = (w: ObjWarn | undefined): { text: string; color: string } | null =>
  w && w.faror.length ? { text: `fara: ${w.faror[0]}`, color: FARG.rod }
    : w && w.hansyn.length ? { text: `hänsyn: ${w.hansyn[0]}`, color: FARG.orange } : null;

const harMaskin = (o: OversiktObjekt) => !!((o as any).skordare_maskin_id || (o as any).skotare_maskin_id);

// Prick/ring per objekt. form:'ring' = väntar (planerad utan maskin). 'fill' = fylld.
// utzoom = visas även utzoomad (maskiner-nivå: pågående + väntande ringar).
// namnbar = får namn-etikett vid inzoomning (pågår/planerad/väntar). Avslutade aldrig.
interface DotDesc { form: 'ring' | 'fill'; color: string; opacity: number; size: number; utzoom: boolean; namnbar: boolean }
function dotDesc(o: OversiktObjekt): DotDesc | null {
  if (STATUS_AKTIV.includes(o.status)) return { form: 'fill', color: FARG.gron, opacity: 1, size: 18, utzoom: true, namnbar: true }; // pågår = grön
  if (o.status === 'planerad') {
    return harMaskin(o)
      ? { form: 'fill', color: GRAY_DOT, opacity: 0.95, size: 16, utzoom: false, namnbar: true }  // planerad m. maskin = grå
      : { form: 'ring', color: GRAY_DOT, opacity: 0.95, size: 16, utzoom: true, namnbar: true };  // väntar = ihålig ring
  }
  if (STATUS_AVSLUTADE.includes(o.status)) {
    const d = (o as any).avslutad_timestamp || o.faktisk_slut || null;
    if (!d) return null;
    const age = dagarSedan(d);
    if (age > 180) return null;
    return { form: 'fill', color: GRAY_DOT, opacity: Math.max(0.1, 0.42 - (age / 180) * 0.32), size: 13, utzoom: false, namnbar: false }; // avslutad, bleknar — aldrig namn
  }
  return null;
}

const nastaAv = (f: MaskinForslag) => f.ko[0]?.objekt ?? null;

export default function OversiktV2Page() {
  const { medarbetare, loading: rollLaddar } = useCurrentMedarbetare();

  const [objekt, setObjekt] = useState<OversiktObjekt[]>([]);
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [maskinKo, setMaskinKo] = useState<MaskinKoItem[]>([]);
  const [warnings, setWarnings] = useState<Record<string, ObjWarn>>({});
  const [skord, setSkord] = useState<Record<string, SkordAggV2>>({});
  const [positions, setPositions] = useState<Map<string, PlatsForslag>>(new Map());
  const [telByMaskin, setTelByMaskin] = useState<Record<string, string>>({});
  const [kmByLeg, setKmByLeg] = useState<Record<string, (number | null)[]>>({}); // per maskin: [nu→1, 1→2, …]

  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState(false);
  const [selMaskin, setSelMaskin] = useState<string | null>(null);
  const [selObjekt, setSelObjekt] = useState<string | null>(null); // förman tryckte på en prick
  const [zoomNiva, setZoomNiva] = useState(9);
  const [koPreview, setKoPreview] = useState<OversiktObjekt[] | null>(null); // live drag-ordning för vald maskin

  // Klient-cache av vägavstånd (nyckel = avrundade koordinatpar). Under drag läses BARA härifrån
  // (inga routing-anrop mitt i ett drag); vagKmCached fyller den, legKmCache slår upp synkront.
  const kmCacheRef = useRef<Map<string, number | null>>(new Map());
  const cacheKey = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => `${a.lat.toFixed(3)},${a.lng.toFixed(3)};${b.lat.toFixed(3)},${b.lng.toFixed(3)}`;
  const vagKmCached = useCallback(async (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
    const k = cacheKey(from, to); const c = kmCacheRef.current;
    if (c.has(k)) return c.get(k) ?? null;
    const km = await vagKm(from, to); c.set(k, km); return km;
  }, []);
  const legKmCache = useCallback((from: { lat: number; lng: number } | null, to: { lat: number; lng: number } | null): number | null => (from && to ? kmCacheRef.current.get(cacheKey(from, to)) ?? null : null), []);

  const refetchKo = useCallback(async () => {
    const { data } = await supabase.from('maskin_ko').select('*').order('ordning');
    if (data) setMaskinKo(data as MaskinKoItem[]);
  }, []);

  const fetchAll = useCallback(async () => {
    setFel(false); setLaddar(true);
    let objRows: OversiktObjekt[]; let maskinRows: Maskin[];
    try {
      const [obj, maskinerRes, koRes, markRes] = await Promise.all([
        fetchAllRows<OversiktObjekt>(() => supabase.from('objekt').select('*').order('namn').order('id')),
        supabase.from('dim_maskin').select('*').order('modell'),
        supabase.from('maskin_ko').select('*').order('ordning'),
        supabase.from('planering_markeringar').select('objekt_id, typ, data'),
      ]);
      objRows = obj; maskinRows = (maskinerRes.data || []) as Maskin[];
      if (!objRows.length || !maskinRows.length) throw new Error('tom kärndata');
      setObjekt(objRows); setMaskiner(maskinRows);
      setMaskinKo((koRes.data || []) as MaskinKoItem[]);
      setWarnings(buildWarnings((markRes.data || []) as MarkeringRow[]));
    } catch (e) {
      console.error('[Översikt v2] kunde inte läsa kärndata', e);
      setFel(true); setLaddar(false); return;
    }
    setLaddar(false);
    const ids = Array.from(new Set(maskinRows.map((m) => m.maskin_id).filter(Boolean))) as string[];
    const [platserRes, skordRes, telRes] = await Promise.allSettled([
      hamtaSenastePlatser(ids), hamtaSkordMapV2(),
      supabase.from('medarbetare').select('maskin_id, telefon, roll').not('maskin_id', 'is', null),
    ]);
    if (platserRes.status === 'fulfilled') setPositions(platserRes.value.platser);
    if (skordRes.status === 'fulfilled') setSkord(skordRes.value);
    if (telRes.status === 'fulfilled' && telRes.value.data) {
      const t: Record<string, string> = {};
      for (const r of telRes.value.data as { maskin_id: string; telefon: string | null }[]) if (r.maskin_id && r.telefon && !t[r.maskin_id]) t[r.maskin_id] = r.telefon;
      setTelByMaskin(t);
    }
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const maskinKoIds = useMemo(() => new Set(maskinKo.map((k) => k.maskin_id)), [maskinKo]);
  const todayISO = useMemo(() => new Date().toLocaleDateString('sv-SE'), []);
  const aktivaMaskiner = useMemo(
    () => maskiner.filter((m) => maskinAktiv(m as MaskinRad, todayISO) && (positions.get(m.maskin_id)?.koordinat != null || maskinKoIds.has(m.maskin_id))),
    [maskiner, positions, maskinKoIds, todayISO],
  );

  const forslag = useMemo(() => {
    if (!aktivaMaskiner.length) return new Map<string, MaskinForslag>();
    return beraknaForslag({ maskiner: aktivaMaskiner as MaskinRad[], objekt, maskinKo, skord, positions, avstandKm: (a, b) => haversineKm(a, b) });
  }, [aktivaMaskiner, objekt, maskinKo, skord, positions]);

  // OSRM-vägavstånd per ben (nu→1, 1→2, …) för varje maskin.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const jobs: Promise<[string, (number | null)[]]>[] = [];
      forslag.forEach((f, mid) => {
        if (!f.koordinat || !f.ko.length) return;
        const punkter = [f.koordinat, ...f.ko.map((p) => (p.objekt.lat != null && p.objekt.lng != null ? { lat: p.objekt.lat, lng: p.objekt.lng } : null))];
        jobs.push((async () => {
          const legs: (number | null)[] = [];
          for (let i = 1; i < punkter.length; i++) { const a = punkter[i - 1], b = punkter[i]; legs.push(a && b ? await vagKmCached(a, b) : null); }
          return [mid, legs];
        })());
      });
      const res = await Promise.all(jobs);
      if (cancelled) return;
      setKmByLeg((prev) => { const next = { ...prev }; for (const [mid, legs] of res) next[mid] = legs; return next; });
    })();
    return () => { cancelled = true; };
  }, [forslag]);

  const isDriver = medarbetare?.roll === 'forare';
  const driverMaskinId = medarbetare?.maskin_id ?? null;
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (didAutoSelect.current || rollLaddar || laddar) return;
    if (isDriver && driverMaskinId && forslag.has(driverMaskinId)) { setSelMaskin(driverMaskinId); didAutoSelect.current = true; }
    else if (!isDriver && !rollLaddar) didAutoSelect.current = true;
  }, [isDriver, driverMaskinId, forslag, rollLaddar, laddar]);

  // ══ KARTA ══
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
  const machMarkersRef = useRef<Map<string, { marker: any; square: HTMLDivElement; label: HTMLDivElement; sub: HTMLDivElement }>>(new Map());
  const dotsRef = useRef<Map<string, { marker: any; el: HTMLDivElement; circle: HTMLDivElement; label: HTMLDivElement; desc: DotDesc }>>(new Map());
  const ordnaRef = useRef(false); // true medan "Ändra ordning" är öppet → kartan rör sig inte av sig själv
  const stopMarkersRef = useRef<any[]>([]); // numrerade rutt-cirklar + on-map-etiketter
  const didFitRef = useRef(false);
  const forslagRef = useRef(forslag); forslagRef.current = forslag;
  const selRef = useRef(selMaskin); selRef.current = selMaskin;
  const kmLegRef = useRef(kmByLeg); kmLegRef.current = kmByLeg;
  const zoomRef = useRef(zoomNiva); zoomRef.current = zoomNiva;
  const koPreviewRef = useRef(koPreview); koPreviewRef.current = koPreview;
  // Vald maskins kö-objekt — live-preview under drag, annars ur forslag.
  const valdKoObjekt = useCallback((mid: string | null): OversiktObjekt[] => {
    if (!mid) return [];
    if (koPreviewRef.current) return koPreviewRef.current;
    return (forslagRef.current.get(mid)?.ko ?? []).map((p) => p.objekt);
  }, []);

  useEffect(() => {
    if (!document.getElementById('maplibre-css-oversiktv2')) {
      const link = document.createElement('link'); link.id = 'maplibre-css-oversiktv2'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'; document.head.appendChild(link);
    }
    if (!window.maplibregl) {
      const s = document.createElement('script'); s.id = 'maplibre-js-oversiktv2';
      s.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'; s.onload = () => setMapReady(true); document.head.appendChild(s);
    } else setMapReady(true);
  }, []);

  const sublabelText = useCallback((f: MaskinForslag, km: number | null): string => {
    const nu = f.nuObjekt?.namn ?? '?';
    const nasta = nastaAv(f);
    if (!nasta) return `${nu} · inget planerat`;
    return `${nu} → ${nasta.namn} · ${km != null ? `${Math.round(km)} km` : '–'}`;
  }, []);

  const layoutLabels = useCallback(() => {
    const map = mapRef.current; if (!map || selRef.current) return;
    const items: { label: HTMLDivElement; x: number; y: number }[] = [];
    machMarkersRef.current.forEach((mm, mid) => {
      const f = forslagRef.current.get(mid); if (!f?.koordinat) return;
      const p = map.project([f.koordinat.lng, f.koordinat.lat]); items.push({ label: mm.label, x: p.x, y: p.y });
    });
    items.sort((a, b) => a.y - b.y);
    const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const LW = 190, LH = 40, GAP = 6, LEFT = 16;
    for (const it of items) {
      const left = it.x + LEFT; let top = it.y - LH / 2; let guard = 0;
      while (guard++ < 24) { const hit = placed.find((r) => !(left > r.x2 || left + LW < r.x1 || top > r.y2 || top + LH < r.y1)); if (!hit) break; top = hit.y2 + GAP; }
      it.label.style.transform = `translateY(${Math.round(top - (it.y - LH / 2))}px)`;
      placed.push({ x1: left, y1: top, x2: left + LW, y2: top + LH });
    }
    // Objekt-namn placeras EFTER maskin-etiketterna (som därmed vinner en kollision → ett dot-namn
    // hamnar aldrig ovanpå en maskinetikett). Bara synliga namn, de-överlappas vertikalt mot varandra.
    const DLEFT = 12, DH = 18, DGAP = 4;
    const dotItems: { label: HTMLDivElement; x: number; y: number; w: number }[] = [];
    dotsRef.current.forEach((d) => {
      if (d.label.style.display === 'none') return;
      const p = map.project(d.marker.getLngLat());
      dotItems.push({ label: d.label, x: p.x, y: p.y, w: d.label.offsetWidth || 90 });
    });
    dotItems.sort((a, b) => a.y - b.y);
    for (const it of dotItems) {
      const left = it.x + DLEFT; const natTop = it.y - DH / 2; let top = natTop; let guard = 0;
      while (guard++ < 20) { const hit = placed.find((r) => !(left > r.x2 || left + it.w < r.x1 || top > r.y2 || top + DH < r.y1)); if (!hit) break; top = hit.y2 + DGAP; }
      it.label.style.transform = `translateY(${Math.round(top - natTop)}px)`;
      placed.push({ x1: left, y1: top, x2: left + it.w, y2: top + DH });
    }
  }, []);

  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;
    const map = new window.maplibregl.Map({
      container: mapContainerRef.current, style: buildForarkartaStyle(),
      center: [14.72, 56.50], zoom: 9, maxPitch: 0, dragRotate: false, attributionControl: false,
    });
    mapRef.current = map;
    try { map.touchZoomRotate.disableRotation(); } catch { /* äldre */ }
    map.addControl(new window.maplibregl.AttributionControl({ customAttribution: FORARKARTA_ATTRIBUTION, compact: true }));
    map.on('load', () => {
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'routes', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'clr'], 'line-width': ['get', 'w'], 'line-dasharray': [2, 2], 'line-opacity': ['get', 'op'] } });
      setMapStyleLoaded(true);
    });
    map.on('move', layoutLabels); map.on('zoom', () => { layoutLabels(); setZoomNiva(map.getZoom()); });
    map.on('click', () => { setSelMaskin(null); setSelObjekt(null); });
    return () => {
      machMarkersRef.current.forEach((m) => m.marker.remove()); machMarkersRef.current.clear();
      dotsRef.current.forEach((d) => d.marker.remove()); dotsRef.current.clear();
      stopMarkersRef.current.forEach((m) => m.remove()); stopMarkersRef.current = [];
      map.remove(); mapRef.current = null; setMapStyleLoaded(false);
    };
  }, [mapReady, layoutLabels]);

  // Rutt-linjer ritas ENBART för vald maskin (hela kön nu→1→2→…). Översiktsläget har
  // inga linjer alls — fem korsande rutter var brus.
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    const src = map.getSource('routes'); if (!src) return;
    const features: any[] = [];
    const f = selMaskin ? forslag.get(selMaskin) : null;
    if (f?.koordinat) {
      const koObj = koPreview ?? f.ko.map((p) => p.objekt); // live drag-ordning om aktiv
      const pts: ([number, number] | null)[] = [[f.koordinat.lng, f.koordinat.lat], ...koObj.map((o) => (o.lat != null && o.lng != null ? [o.lng, o.lat] as [number, number] : null))];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]; if (!a || !b) continue;
        const dimmed = i > 1; // ben 1 (nu→1) fast, ben 2+ dämpat
        features.push({ type: 'Feature', properties: { clr: LIT_LINE, op: dimmed ? 0.5 : 1, w: dimmed ? 2 : 3 }, geometry: { type: 'LineString', coordinates: [a, b] } });
      }
    }
    try { src.setData({ type: 'FeatureCollection', features }); } catch { /* race */ }
  }, [forslag, mapStyleLoaded, selMaskin, koPreview]);

  // Objekt-prickar/ringar
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    const want = new Map<string, DotDesc>();
    for (const o of objekt) { if (o.lat == null || o.lng == null) continue; const d = dotDesc(o); if (d) want.set(o.id, d); }
    dotsRef.current.forEach((d, id) => { if (!want.has(id)) { d.marker.remove(); dotsRef.current.delete(id); } });
    want.forEach((desc, id) => {
      const o = objekt.find((x) => x.id === id)!;
      let entry = dotsRef.current.get(id);
      if (!entry) {
        const el = document.createElement('div'); el.style.cssText = 'position:relative;width:0;height:0;cursor:pointer';
        const circle = document.createElement('div'); circle.style.position = 'absolute';
        const label = document.createElement('div');
        label.style.cssText = `position:absolute;padding:2px 6px;background:${CHIP_BG};border-radius:6px;font-size:12px;font-weight:600;color:${FARG.text};white-space:nowrap;pointer-events:none;box-shadow:0 1px 5px rgba(0,0,0,0.3);display:none`;
        el.appendChild(circle); el.appendChild(label);
        const marker = new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([o.lng!, o.lat!]).addTo(map);
        el.addEventListener('click', (e) => { e.stopPropagation(); if (!selRef.current) setSelObjekt((p) => (p === id ? null : id)); });
        entry = { marker, el, circle, label, desc };
        dotsRef.current.set(id, entry);
      }
      entry.desc = desc; entry.label.textContent = o.namn;
    });
    restyleSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objekt, mapStyleLoaded]);

  // Maskin-markörer + etikett (nu → 1:a · km)
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    const want = new Set<string>(); forslag.forEach((f, mid) => { if (f.koordinat) want.add(mid); });
    machMarkersRef.current.forEach((mm, mid) => { if (!want.has(mid)) { mm.marker.remove(); machMarkersRef.current.delete(mid); } });
    forslag.forEach((f, mid) => {
      if (!f.koordinat) return;
      const namn = maskinVisningsnamn(maskiner.find((m) => m.maskin_id === mid)) || mid;
      let entry = machMarkersRef.current.get(mid);
      if (!entry) {
        const container = document.createElement('div'); container.style.cssText = 'position:relative;width:0;height:0';
        const square = document.createElement('div');
        square.style.cssText = `position:absolute;left:-12px;top:-12px;width:24px;height:24px;border-radius:5px;background:${FARG.bla};cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.4)`;
        const label = document.createElement('div');
        label.style.cssText = `position:absolute;left:16px;top:-20px;display:flex;flex-direction:column;gap:2px;padding:8px 12px;background:${CHIP_BG};border-radius:10px;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.35)`;
        const name = document.createElement('div'); name.style.cssText = `font-size:14px;font-weight:600;color:${FARG.text}`; name.textContent = namn;
        const sub = document.createElement('div'); sub.style.cssText = 'font-size:13px';
        label.appendChild(name); label.appendChild(sub);
        const onClick = (e: Event) => { e.stopPropagation(); setSelObjekt(null); setSelMaskin((prev) => (prev === mid ? null : mid)); };
        square.addEventListener('click', onClick); label.addEventListener('click', onClick);
        container.appendChild(square); container.appendChild(label);
        const marker = new window.maplibregl.Marker({ element: container, anchor: 'center' }).setLngLat([f.koordinat.lng, f.koordinat.lat]).addTo(map);
        entry = { marker, square, label, sub }; machMarkersRef.current.set(mid, entry);
      } else { (entry.label.firstChild as HTMLDivElement).textContent = namn; entry.marker.setLngLat([f.koordinat.lng, f.koordinat.lat]); }
      entry.sub.textContent = sublabelText(f, kmByLeg[mid]?.[0] ?? null);
      entry.sub.style.color = nastaAv(f) ? '#a1a1a6' : FARG.text2;
    });
    restyleSelection(); layoutLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forslag, maskiner, kmByLeg, mapStyleLoaded, sublabelText, layoutLabels]);

  // Auto-fit en gång
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded || didFitRef.current) return;
    const pts: [number, number][] = [];
    forslag.forEach((f) => { if (f.koordinat) pts.push([f.koordinat.lng, f.koordinat.lat]); const n = nastaAv(f); if (n && n.lat != null && n.lng != null) pts.push([n.lng, n.lat]); });
    if (!pts.length) return; didFitRef.current = true;
    if (pts.length === 1) map.easeTo({ center: pts[0], zoom: 12, duration: 500 });
    else { const b = new window.maplibregl.LngLatBounds(); pts.forEach((p) => b.extend(p)); map.fitBounds(b, { padding: { top: 60, left: 40, right: 40, bottom: 140 }, maxZoom: 13, duration: 500 }); }
  }, [forslag, mapStyleLoaded]);

  // Zoom-/urvals-styrd synlighet. Prick: visas om inzoomad ELLER utzoom-flagga. Namn-etikett:
  // bara utan vald maskin (då sköter rutt-chips namnen), bara namnbara (ej avslutade), bara ≥ tröskel.
  const syncDotVisibility = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    const z = map.getZoom(); const S = selRef.current;
    dotsRef.current.forEach((d) => {
      const dotVisible = z >= THRESHOLD_ZOOM || d.desc.utzoom;
      d.el.style.display = dotVisible ? 'block' : 'none';
      d.label.style.display = (dotVisible && !S && d.desc.namnbar && z >= THRESHOLD_ZOOM) ? 'block' : 'none';
    });
  }, []);
  useEffect(() => { syncDotVisibility(); layoutLabels(); }, [zoomNiva, syncDotVisibility, layoutLabels]);

  const restyleSelection = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    const S = selRef.current;
    const koObj = valdKoObjekt(S); // live preview under drag, annars ur forslag
    const forslagKo = S ? (forslagRef.current.get(S)?.ko ?? []) : [];
    const troligtSet = new Set(koPreviewRef.current ? [] : forslagKo.filter((p) => p.troligt).map((p) => p.objekt.id));
    const koIds = new Set<string>(koObj.map((o) => o.id));

    machMarkersRef.current.forEach((mm, mid) => {
      const sel = mid === S;
      mm.square.style.width = sel ? '28px' : '24px'; mm.square.style.height = sel ? '28px' : '24px';
      mm.square.style.left = sel ? '-14px' : '-12px'; mm.square.style.top = sel ? '-14px' : '-12px';
      mm.square.style.opacity = (!S || sel) ? '1' : '0.28';
      mm.square.style.boxShadow = sel ? `0 0 0 4px rgba(10,132,255,0.28), 0 1px 4px rgba(0,0,0,0.4)` : '0 1px 4px rgba(0,0,0,0.4)';
      mm.label.style.display = S ? 'none' : 'flex';
    });
    dotsRef.current.forEach((d, id) => {
      const desc = d.desc; const dimNarVald = S && !koIds.has(id);
      const op = dimNarVald ? 0.1 : desc.opacity;
      const px = desc.size;
      const base = `position:absolute;left:${-px / 2}px;top:${-px / 2}px;width:${px}px;height:${px}px;border-radius:50%;`;
      if (desc.form === 'ring') d.circle.style.cssText = base + `background:transparent;border:2px solid ${desc.color};opacity:${op};box-shadow:0 0 0 1px rgba(255,255,255,0.5)`;
      else d.circle.style.cssText = base + `background:${desc.color};opacity:${op};box-shadow:0 0 0 1px rgba(0,0,0,0.25)`;
      d.label.style.left = `${Math.round(px / 2) + 4}px`; d.label.style.top = '-9px'; d.label.style.opacity = String(op);
    });
    syncDotVisibility();
    if (map.getLayer('routes')) map.getSource('routes'); // paint är data-driven (uppdateras i rutt-effekten)

    stopMarkersRef.current.forEach((m) => m.remove()); stopMarkersRef.current = [];
    if (S) {
      const f = forslagRef.current.get(S);
      koObj.forEach((o, i) => {
        if (o.lat == null || o.lng == null) return;
        const troligt = troligtSet.has(o.id);
        const circ = document.createElement('div');
        circ.style.cssText = `width:26px;height:26px;border-radius:50%;background:${FARG.gron};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;opacity:${troligt ? 0.6 : 1};pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.4)`;
        circ.textContent = String(i + 1);
        stopMarkersRef.current.push(new window.maplibregl.Marker({ element: circ, anchor: 'center' }).setLngLat([o.lng, o.lat]).addTo(map));
        const nameChip = document.createElement('div');
        nameChip.style.cssText = `padding:3px 8px;background:${CHIP_BG};border-radius:8px;font-size:12px;font-weight:600;color:${FARG.text};white-space:nowrap;pointer-events:none;opacity:${troligt ? 0.8 : 1};box-shadow:0 2px 8px rgba(0,0,0,0.35)`;
        nameChip.textContent = o.namn;
        stopMarkersRef.current.push(new window.maplibregl.Marker({ element: nameChip, anchor: 'bottom', offset: [0, -18] }).setLngLat([o.lng, o.lat]).addTo(map));
        // km ur klient-cachen (route-cache); miss → '–' (inga routing-anrop mitt i ett drag)
        const prev = i === 0 ? (f?.koordinat ?? null) : (koObj[i - 1].lat != null ? { lat: koObj[i - 1].lat!, lng: koObj[i - 1].lng! } : null);
        const to = { lat: o.lat, lng: o.lng };
        if (prev) {
          const km = legKmCache(prev, to); const kmChip = document.createElement('div');
          kmChip.style.cssText = `padding:2px 7px;background:${CHIP_BG};border-radius:8px;font-size:12px;font-weight:600;color:${FARG.text};white-space:nowrap;pointer-events:none;opacity:${troligt ? 0.8 : 1}`;
          kmChip.textContent = km != null ? `${Math.round(km)} km` : '–';
          stopMarkersRef.current.push(new window.maplibregl.Marker({ element: kmChip, anchor: 'center' }).setLngLat([(prev.lng + o.lng) / 2, (prev.lat + o.lat) / 2]).addTo(map));
        }
      });
    }
  }, []);

  useEffect(() => {
    restyleSelection(); layoutLabels();
    const map = mapRef.current;
    if (map && selMaskin && !ordnaRef.current) { const f = forslag.get(selMaskin); if (f?.koordinat) map.easeTo({ center: [f.koordinat.lng, f.koordinat.lat], offset: [0, -150], zoom: Math.max(map.getZoom(), 12), duration: 500 }); } // aldrig auto-flytt medan ordningen redigeras
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMaskin, kmByLeg, forslag, restyleSelection, layoutLabels]);

  // ── kö-skrivningar (v2:s egna; rör aldrig OversiktMaskiner) ──
  const laggIKo = useCallback(async (maskinId: string, objektId: string) => {
    const egna = maskinKo.filter((k) => k.maskin_id === maskinId);
    const maxOrd = egna.reduce((m, k) => Math.max(m, k.ordning), -1);
    await supabase.from('maskin_ko').insert({ maskin_id: maskinId, objekt_id: objektId, ordning: maxOrd + 1 });
    await refetchKo();
  }, [maskinKo, refetchKo]);
  const flyttaKo = useCallback(async (koId: string, tillMaskin: string) => {
    const maxOrd = maskinKo.filter((k) => k.maskin_id === tillMaskin).reduce((m, k) => Math.max(m, k.ordning), -1);
    await supabase.from('maskin_ko').update({ maskin_id: tillMaskin, ordning: maxOrd + 1 }).eq('id', koId);
    await refetchKo();
  }, [maskinKo, refetchKo]);
  const taBortKo = useCallback(async (koId: string) => { await supabase.from('maskin_ko').delete().eq('id', koId); await refetchKo(); }, [refetchKo]);
  // Varje släpp sparar: skriv om ordning (0..n). De synliga i ny ordning först, dolda
  // (avslutade/nu) läggs efter så gamla vyns kö inte tappar rader. Ingen Spara-knapp.
  const skrivOrdning = useCallback(async (maskinId: string, orderedVisibleKoIds: string[]) => {
    const rest = maskinKo.filter((k) => k.maskin_id === maskinId && !orderedVisibleKoIds.includes(k.id)).sort((a, b) => a.ordning - b.ordning).map((k) => k.id);
    const full = [...orderedVisibleKoIds, ...rest];
    await Promise.all(full.map((id, i) => supabase.from('maskin_ko').update({ ordning: i }).eq('id', id)));
    await refetchKo();
  }, [maskinKo, refetchKo]);

  // Live-preview under drag: koId-ordning → objekt → koPreview (kartan ritar om direkt, ingen skrivning).
  const hanteraOrderChange = useCallback((koIds: string[]) => {
    const objs = koIds.map((koId) => { const k = maskinKo.find((x) => x.id === koId); return k ? objekt.find((o) => o.id === k.objekt_id) ?? null : null; }).filter((o): o is OversiktObjekt => !!o);
    setKoPreview(objs);
  }, [maskinKo, objekt]);
  // Redigeringsläge på/av: sätt preview, förhämta par-ben till km-cachen, krymp arket-fit på kartan.
  const hanteraOrdnaLage = useCallback((active: boolean) => {
    const map = mapRef.current;
    const f = selMaskin ? forslag.get(selMaskin) : null;
    if (!active || !f?.koordinat) { ordnaRef.current = false; setKoPreview(null); return; }
    ordnaRef.current = true; // hädanefter rör kartan sig inte av sig själv förrän Klar
    const koObj = f.ko.map((p) => p.objekt);
    setKoPreview(koObj);
    const punkter = [f.koordinat, ...koObj.filter((o) => o.lat != null && o.lng != null).map((o) => ({ lat: o.lat!, lng: o.lng! }))];
    (async () => { for (let i = 0; i < punkter.length; i++) for (let j = 0; j < punkter.length; j++) if (i !== j) await vagKmCached(punkter[i], punkter[j]); })();
    if (map && punkter.length) {
      const b = new window.maplibregl.LngLatBounds(); punkter.forEach((p) => b.extend([p.lng, p.lat]));
      const h = mapContainerRef.current?.offsetHeight ?? 600;
      map.fitBounds(b, { padding: { top: 80, left: 50, right: 50, bottom: Math.round(h * 0.45) + 48 }, maxZoom: 14, duration: 500 });
    }
  }, [selMaskin, forslag, vagKmCached]);
  useEffect(() => { ordnaRef.current = false; setKoPreview(null); }, [selMaskin]); // byte/stängning av maskin nollar preview + redigeringslås
  useEffect(() => { restyleSelection(); }, [koPreview, restyleSelection]); // rita om numren live

  // härlett
  const utanPosition = useMemo(() => aktivaMaskiner.filter((m) => !positions.get(m.maskin_id)?.koordinat), [aktivaMaskiner, positions]);
  const utanKoord = useMemo(() => objekt.filter((o) => (o.status === 'planerad' || STATUS_AKTIV.includes(o.status)) && (o.lat == null || o.lng == null)).length, [objekt]);
  const valt = selMaskin ? forslag.get(selMaskin) ?? null : null;
  const arForareVy = !!(isDriver && selMaskin && selMaskin === driverMaskinId);
  const objektValt = selObjekt ? objekt.find((o) => o.id === selObjekt) ?? null : null;
  const aktivaSkordare = useMemo(() => aktivaMaskiner.filter((m) => !arSkotare(m as MaskinRad)), [aktivaMaskiner]);

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 56px - env(safe-area-inset-top))', width: '100%', background: FARG.bg, color: FARG.text, fontFamily: FONT, overflow: 'hidden', WebkitFontSmoothing: 'antialiased' }}>
      <style>{designCss}</style>
      <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />

      {laddar && (
        <div style={{ position: 'absolute', inset: 0, background: FARG.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.m, zIndex: 10 }}>
          <div className="puls" style={{ ...TYP.rubrik, color: FARG.text2 }}>Laddar kartan…</div>
          <div style={{ ...TYP.meta, color: FARG.text3 }}>Hämtar maskiner och objekt</div>
        </div>
      )}
      {fel && (
        <div style={{ position: 'absolute', inset: 0, background: FARG.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.l, padding: `0 ${AVSTAND.xxl}px`, textAlign: 'center', zIndex: 10 }}>
          <div style={{ ...TYP.rubrik }}>Kunde inte läsa</div>
          <div style={{ ...TYP.meta, color: FARG.text2, maxWidth: 260, lineHeight: 1.5 }}>Kontrollera uppkopplingen och försök igen.</div>
          <button onClick={() => fetchAll()} style={{ minHeight: 48, padding: `0 ${AVSTAND.xl}px`, borderRadius: RADIE.knapp, border: 'none', cursor: 'pointer', fontFamily: 'inherit', ...TYP.listtitel, color: FARG.bg, background: FARG.text }}>Försök igen</button>
        </div>
      )}

      {/* Maskiner utan plats + N objekt utan plats — samma strip (översiktsläge) */}
      {!laddar && !fel && !selMaskin && !objektValt && (utanPosition.length > 0 || utanKoord > 0) && (
        <div style={{ position: 'absolute', left: AVSTAND.l, right: AVSTAND.l, bottom: `calc(${AVSTAND.l}px + env(safe-area-inset-bottom))`, background: CHIP_BG, borderRadius: RADIE.kort, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, boxShadow: '0 4px 16px rgba(0,0,0,0.35)', zIndex: 6 }}>
          <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.s }}>Utanför kartan</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
            {utanPosition.map((m) => (
              <div key={m.maskin_id} style={{ ...TYP.meta, color: FARG.text }}>{maskinVisningsnamn(m) || m.maskin_id} <span style={{ color: FARG.text2 }}>— ingen position</span></div>
            ))}
            {utanKoord > 0 && <div style={{ ...TYP.meta, color: FARG.text2 }}>{utanKoord} objekt utan plats — syns inte på kartan</div>}
          </div>
        </div>
      )}

      {/* MASKIN-ARK */}
      {!laddar && !fel && valt && (
        <MaskinArk key={selMaskin!} f={valt} namn={maskinVisningsnamn(maskiner.find((m) => m.maskin_id === selMaskin)) || selMaskin!}
          legs={kmByLeg[selMaskin!] ?? []} skord={skord} warnings={warnings}
          telefon={arForareVy ? null : (telByMaskin[selMaskin!] ?? null)}
          forare={arForareVy}
          onClose={() => setSelMaskin(null)}
          onReorder={(ids) => skrivOrdning(selMaskin!, ids)}
          onOrdnaLage={hanteraOrdnaLage}
          onOrderChange={hanteraOrderChange}
          koRader={maskinKo.filter((k) => k.maskin_id === selMaskin).sort((a, b) => a.ordning - b.ordning)}
        />
      )}

      {/* OBJEKT-ARK (förman tryckte på en prick) */}
      {!laddar && !fel && !valt && objektValt && (
        <ObjektArk o={objektValt} skord={skord} warn={warnings[objektValt.id]}
          skordare={aktivaSkordare.map((m) => ({ id: m.maskin_id, namn: maskinVisningsnamn(m) || m.maskin_id, koordinat: positions.get(m.maskin_id)?.koordinat ?? null, klararTyp: (m as any).klarar_typ ?? null }))}
          koRad={maskinKo.find((k) => k.objekt_id === objektValt.id) ?? null}
          maskinNamn={(id) => maskinVisningsnamn(maskiner.find((m) => m.maskin_id === id)) || id}
          maskinKo={maskinKo}
          forare={isDriver}
          onLaggIKo={laggIKo} onFlytta={flyttaKo} onTaBort={taBortKo}
          onClose={() => setSelObjekt(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════ MASKIN-ARK ═══════════════════════════════════
function aggFor(o: OversiktObjekt | null | undefined, skord: Record<string, SkordAggV2>): SkordAggV2 | undefined {
  return o?.vo_nummer ? skord[o.vo_nummer] : undefined;
}
const rowMeta = (agg: SkordAggV2 | undefined): string => agg?.sista ? `avverkat ${kortDatum(agg.sista)} · legat ${dagarSedan(agg.sista)} dgr` : '';
function volFor(f: MaskinForslag, o: OversiktObjekt, agg: SkordAggV2 | undefined): number | null {
  if (f.typ === 'skotare') return agg && agg.skordat > 0 ? paBackenKvar(agg.skordat, agg.skotat, agg.egenSkotning) : null;
  return o.volym_planerad ?? (o.volym || null);
}
const mapsHref = (o: OversiktObjekt | null): string | null => !o || o.lat == null || o.lng == null ? null
  : (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) ? `maps://maps.apple.com/?daddr=${o.lat},${o.lng}` : `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`);

const KNAPP: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.s, flexGrow: 1, minHeight: 50, border: `0.5px solid #48484a`, borderRadius: RADIE.knapp, textDecoration: 'none', ...TYP.listtitel, color: FARG.text, fontFamily: 'inherit', background: 'transparent', cursor: 'pointer' };
const KNAPP_LITEN: React.CSSProperties = { ...KNAPP, minHeight: 44, ...TYP.text };
const SvgVag = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>;
const SvgRing = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>;

const SheetBas: React.CSSProperties = { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 8, display: 'flex', flexDirection: 'column', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px calc(${AVSTAND.xl}px + env(safe-area-inset-bottom))`, background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, boxShadow: '0 -8px 30px rgba(0,0,0,0.5)' };
function Grabber({ onClose }: { onClose: () => void }) {
  return <button onClick={onClose} aria-label="Stäng" style={{ display: 'flex', justifyContent: 'center', border: 'none', background: 'none', padding: `${AVSTAND.xs}px 0`, cursor: 'pointer' }}><div style={{ width: 36, height: 5, borderRadius: 3, background: '#48484a' }} /></button>;
}

const HROW = 60; // px per rad i drag-listan
function ReorderLista({ rows, onDrop, onOrderChange }: { rows: { koId: string; namn: string; hoger: string }[]; onDrop: (order: string[]) => void; onOrderChange?: (order: string[]) => void }) {
  const nyckel = rows.map((r) => r.koId).join(',');
  const [order, setOrder] = useState<string[]>(() => rows.map((r) => r.koId));
  useEffect(() => { setOrder(rows.map((r) => r.koId)); }, [nyckel]); // eslint-disable-line react-hooks/exhaustive-deps
  const orderRef = useRef(order); orderRef.current = order;
  const [dragId, setDragId] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);
  const [relY, setRelY] = useState(0);
  const contRef = useRef<HTMLDivElement>(null);
  const byId = new Map(rows.map((r) => [r.koId, r]));

  const move = (clientY: number) => {
    const id = dragRef.current; const cont = contRef.current; if (!id || !cont) return;
    const y = clientY - cont.getBoundingClientRect().top; setRelY(y);
    const cur = orderRef.current; const target = Math.max(0, Math.min(cur.length - 1, Math.floor(y / HROW)));
    const d = cur.indexOf(id);
    if (d >= 0 && d !== target) { const n = cur.filter((x) => x !== id); n.splice(target, 0, id); setOrder(n); onOrderChange?.(n); }
  };
  const start = (e: React.PointerEvent, koId: string) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); dragRef.current = koId; setDragId(koId); const cont = contRef.current; if (cont) setRelY(e.clientY - cont.getBoundingClientRect().top); };
  const end = () => { const id = dragRef.current; if (!id) return; dragRef.current = null; setDragId(null); onDrop(orderRef.current); };

  return (
    <div ref={contRef} style={{ position: 'relative', height: order.length * HROW, touchAction: 'none' }}>
      {order.map((koId, i) => {
        const r = byId.get(koId); if (!r) return null;
        const dragged = koId === dragId;
        const top = dragged ? Math.max(0, Math.min((order.length - 1) * HROW, relY - (HROW - 8) / 2)) : i * HROW;
        return (
          <div key={koId} style={{ position: 'absolute', left: 0, right: 0, top, height: HROW - 8, display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `0 ${AVSTAND.s}px`, boxSizing: 'border-box', background: FARG.upphojt, borderRadius: RADIE.rad, boxShadow: dragged ? '0 8px 22px rgba(0,0,0,0.55)' : 'none', transform: dragged ? 'scale(1.03)' : 'none', zIndex: dragged ? 2 : 1, transition: dragged ? 'none' : 'top 180ms cubic-bezier(0.2,0,0,1)', ...TYP.text, ...TNUM }}>
            <div style={{ width: 20, color: FARG.text2, fontWeight: 600 }}>{i + 1}</div>
            <div style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.namn}</div>
            <div style={{ ...TYP.meta, color: FARG.text2, whiteSpace: 'nowrap' }}>{r.hoger}</div>
            <div onPointerDown={(e) => start(e, koId)} onPointerMove={(e) => move(e.clientY)} onPointerUp={end} onPointerCancel={end}
              role="button" aria-label="Dra för att ändra ordning"
              style={{ width: 44, height: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none', color: FARG.text2, marginRight: -AVSTAND.s }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MaskinArk({ f, namn, legs, skord, warnings, telefon, forare, onClose, onReorder, onOrdnaLage, onOrderChange, koRader }: {
  f: MaskinForslag; namn: string; legs: (number | null)[]; skord: Record<string, SkordAggV2>; warnings: Record<string, ObjWarn>;
  telefon: string | null; forare: boolean; onClose: () => void;
  onReorder: (orderedKoIds: string[]) => void; onOrdnaLage: (active: boolean) => void; onOrderChange: (koIds: string[]) => void; koRader: MaskinKoItem[];
}) {
  const [ordnaLage, setOrdnaLage] = useState(false);
  const nuAgg = aggFor(f.nuObjekt, skord);
  const rollLabel = f.typ === 'skotare' ? 'skotare' : 'skördare';
  const nuKvar = f.nuObjekt && nuAgg && nuAgg.skordat > 0 ? paBackenKvar(nuAgg.skordat, nuAgg.skotat, nuAgg.egenSkotning) : null;
  const nuVarde = f.typ === 'skotare' && nuKvar != null ? `${fmt(nuKvar)} m³ kvar` : '';
  const nasta = f.ko[0]?.objekt ?? null;
  const arSkordare = f.typ === 'skordare';
  const koIdForObjekt = (objId: string) => koRader.find((k) => k.objekt_id === objId)?.id ?? null;
  const hogerFor = (p: KoPost, i: number) => { const agg = aggFor(p.objekt, skord); const vol = volFor(f, p.objekt, agg); const km = legs[i]; return [vol != null ? `${fmt(vol)} m³` : null, km != null ? `${Math.round(km)} km` : '–'].filter(Boolean).join(' · '); };
  const dragRader = arSkordare ? f.ko.map((p, i) => ({ koId: koIdForObjekt(p.objekt.id) || '', namn: p.objekt.namn, hoger: hogerFor(p, i) })).filter((r) => r.koId) : [];

  const toggleOrdna = () => setOrdnaLage((v) => { const nv = !v; onOrdnaLage(nv); return nv; });

  return (
    <div className="sheet-upp" style={{ ...SheetBas, ...(ordnaLage ? { maxHeight: '45vh', overflowY: 'auto' } : null) }}>
      <Grabber onClose={onClose} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ ...TYP.rubrik }}>{namn}</div>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{forare ? 'din maskin · ' : ''}{rollLabel}{f.manuellKo ? ' · manuell kö' : ''}</div>
      </div>

      {/* Nu */}
      <div style={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr) auto', columnGap: AVSTAND.m, rowGap: AVSTAND.s, ...TYP.text, ...TNUM }}>
        <div style={{ color: FARG.text2 }}>Nu</div>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nuObjekt ? f.nuObjekt.namn : <span style={{ color: FARG.text2 }}>okänd plats</span>}</div>
        <div style={{ color: FARG.text2, whiteSpace: 'nowrap' }}>{nuVarde}</div>
        {rowMeta(nuAgg) && (<><div /><div style={{ ...TYP.meta, color: FARG.text2, gridColumn: '2 / 4' }}>{rowMeta(nuAgg)}</div></>)}
      </div>

      {/* Kö */}
      {f.ko.length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr)', columnGap: AVSTAND.m, ...TYP.text }}><div style={{ color: FARG.text2 }}>Nästa</div><div style={{ color: FARG.text2 }}>inget planerat</div></div>
      ) : (ordnaLage && arSkordare) ? (
        <ReorderLista rows={dragRader} onDrop={onReorder} onOrderChange={onOrderChange} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', columnGap: AVSTAND.m, rowGap: AVSTAND.s, ...TYP.text, ...TNUM }}>
          {f.ko.map((p, i) => {
            const v = varnText(warnings[p.objekt.id]); const meta = rowMeta(aggFor(p.objekt, skord));
            return (
              <React.Fragment key={p.objekt.id}>
                <div style={{ color: FARG.text2 }}>{i + 1}</div>
                <div style={{ fontWeight: p.troligt ? 400 : 600, color: p.troligt ? FARG.text2 : FARG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.objekt.namn}</div>
                <div style={{ color: FARG.text2, whiteSpace: 'nowrap' }}>{hogerFor(p, i)}</div>
                {(meta || v || p.troligt) && (<><div /><div style={{ ...TYP.meta, color: FARG.text2, gridColumn: '2 / 4' }}>
                  {p.troligt ? 'troligt — kan ändras' : <>{meta}{meta && v ? ' · ' : ''}{v && <span style={{ color: v.color }}>{v.text}</span>}</>}
                </div></>)}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Knappar */}
      {forare ? (
        mapsHref(nasta) && <a href={mapsHref(nasta)!} target="_blank" rel="noopener noreferrer" style={{ ...KNAPP, marginTop: AVSTAND.xs }}><SvgVag />Vägbeskrivning{nasta ? ` till ${nasta.namn}` : ''}</a>
      ) : (<>
        {arSkordare && f.ko.length > 1 && (
          <button onClick={toggleOrdna} style={{ ...KNAPP_LITEN, borderColor: ordnaLage ? FARG.bla : '#48484a', color: ordnaLage ? FARG.bla : FARG.text }}>{ordnaLage ? 'Klar' : 'Ändra ordning'}</button>
        )}
        <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.xs }}>
          {telefon && <a href={`tel:${telefon}`} style={KNAPP}><SvgRing />Ring</a>}
          {mapsHref(nasta) && <a href={mapsHref(nasta)!} target="_blank" rel="noopener noreferrer" style={KNAPP}><SvgVag />Vägbeskrivning</a>}
        </div>
      </>)}
    </div>
  );
}

// ══════════════════════════════ OBJEKT-ARK ═══════════════════════════════════
function klararObjekt(klararTyp: string | null, typ: string | undefined): boolean {
  const k = (klararTyp || 'bada').toLowerCase();
  return k === 'bada' || k === typ; // 'bada' klarar allt, annars måste typ matcha
}
function ObjektArk({ o, skord, warn, skordare, koRad, maskinNamn, maskinKo, forare, onLaggIKo, onFlytta, onTaBort, onClose }: {
  o: OversiktObjekt; skord: Record<string, SkordAggV2>; warn: ObjWarn | undefined;
  skordare: { id: string; namn: string; koordinat: { lat: number; lng: number } | null; klararTyp: string | null }[];
  koRad: MaskinKoItem | null; maskinNamn: (id: string) => string; maskinKo: MaskinKoItem[]; forare: boolean;
  onLaggIKo: (maskinId: string, objektId: string) => void; onFlytta: (koId: string, tillMaskin: string) => void; onTaBort: (koId: string) => void; onClose: () => void;
}) {
  const [avstand, setAvstand] = useState<Record<string, number | null>>({});
  const [valjMaskin, setValjMaskin] = useState(false);
  const agg = aggFor(o, skord);
  const areal = o.areal ? `${o.areal.toLocaleString('sv-SE')} ha` : null;
  const atgard = o.atgard || (o.typ === 'gallring' ? 'Gallring' : 'Slutavverkning');
  const vol = o.volym_planerad ?? (o.volym || null);
  const v = varnText(warn);
  const vantatDatum = (o as any).klar_skickad_timestamp || (o as any).created_at || null;
  const eligible = skordare.filter((s) => klararObjekt(s.klararTyp, o.typ));

  useEffect(() => {
    let c = false;
    (async () => {
      if (o.lat == null || o.lng == null) return;
      const r: Record<string, number | null> = {};
      for (const s of skordare) { if (s.koordinat) r[s.id] = await vagKm(s.koordinat, { lat: o.lat!, lng: o.lng! }); }
      if (!c) setAvstand(r);
    })();
    return () => { c = true; };
  }, [o.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const avstText = skordare.filter((s) => s.koordinat).map((s) => `${avstand[s.id] != null ? Math.round(avstand[s.id]!) : '–'} km från ${s.namn}`).join(' · ') || '–';
  const rad = (label: string, val: React.ReactNode) => (<><div style={{ color: FARG.text2 }}>{label}</div><div>{val}</div></>);

  return (
    <div className="sheet-upp" style={SheetBas}>
      <Grabber onClose={onClose} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: AVSTAND.s }}>
        <a href={`/planering?valt=${o.id}`} style={{ ...TYP.rubrik, color: FARG.text, textDecoration: 'none' }}>{o.namn} <span style={{ ...TYP.meta, color: FARG.text2 }}>›</span></a>
        <div style={{ ...TYP.meta, color: FARG.text2, whiteSpace: 'nowrap' }}>{koRad ? `i kö` : harMaskin(o) ? 'planerad' : 'väntar · ingen maskin'}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', columnGap: AVSTAND.m, rowGap: AVSTAND.s, ...TYP.text }}>
        {rad('Åtgärd', `${atgard}${areal ? ` · ${areal}` : ''}`)}
        {rad('Volym', vol != null ? `${fmt(vol)} m³ planerat` : '–')}
        {rad('Hänsyn', v ? <span style={{ color: v.color }}>{v.text.replace(/^(fara|hänsyn): /, '')}</span> : <span style={{ color: FARG.text2 }}>ingen</span>)}
        {rad('Avstånd', <span style={{ color: FARG.text2 }}>{avstText}</span>)}
        {rad('Väntat', <span style={{ color: FARG.text2 }}>{vantatDatum ? `sedan ${kortDatum(vantatDatum)} · ${dagarSedan(vantatDatum)} dgr` : '–'}</span>)}
      </div>

      {!forare && (
        koRad ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>I kö för {maskinNamn(koRad.maskin_id)} · {maskinKo.filter((k) => k.maskin_id === koRad.maskin_id).sort((a, b) => a.ordning - b.ordning).findIndex((k) => k.id === koRad.id) + 1}:a</div>
            <div style={{ display: 'flex', gap: AVSTAND.s }}>
              <button onClick={() => setValjMaskin((x) => !x)} style={KNAPP_LITEN}>Flytta till …</button>
              <button onClick={() => onTaBort(koRad.id)} style={{ ...KNAPP_LITEN, color: FARG.rod }}>Ta bort ur kön</button>
            </div>
            {valjMaskin && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s }}>
                {eligible.filter((s) => s.id !== koRad.maskin_id).map((s) => (
                  <button key={s.id} onClick={() => { onFlytta(koRad.id, s.id); setValjMaskin(false); }} style={{ ...KNAPP_LITEN, flexGrow: 0, padding: `0 ${AVSTAND.l}px` }}>{s.namn}</button>
                ))}
              </div>
            )}
          </div>
        ) : eligible.length ? (
          eligible.length === 1 ? (
            <button onClick={() => onLaggIKo(eligible[0].id, o.id)} style={{ ...KNAPP, marginTop: AVSTAND.xs }}>+ Lägg i kö för {eligible[0].namn}</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              <div style={{ ...TYP.micro, color: FARG.text2 }}>Lägg i kö för</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s }}>
                {eligible.map((s) => <button key={s.id} onClick={() => onLaggIKo(s.id, o.id)} style={{ ...KNAPP_LITEN, flexGrow: 0, padding: `0 ${AVSTAND.l}px` }}>+ {s.namn}</button>)}
              </div>
            </div>
          )
        ) : <div style={{ ...TYP.meta, color: FARG.text2 }}>Ingen skördare klarar den här åtgärden.</div>
      )}
    </div>
  );
}
