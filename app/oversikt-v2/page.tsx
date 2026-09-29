'use client';
// ── Översikt v2 — kartan ÄR hela sidan ────────────────────────────────────────
// En fråga: var står maskinerna och vart ska de härnäst? Inga flikar, ingen
// filterpanel, ingen objektlista. Ett tryck på en maskin fäller upp ett ark med
// Nu / Nästa + Ring + Vägbeskrivning. Förare öppnar med sin egen maskin vald.
//
// Återanvänder: förarkartans baskarta (buildForarkartaStyle, /api/forarkarta),
// senastePlats (positioner), lib/nastaObjekt (foreslaNasta) via nasta-v2, OSRM
// körväg (/api/routing) för km. Ingen ny datakälla. Rör inte gamla /oversikt.
//
// Baskartan är den ljusa, nedtonade Lantmäteriet-topon (valt av Martin) — så
// facitens vita "tända" element blir här mörka chip/linjer för att läsas på ljust.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { maskinVisningsnamn } from '@/lib/maskinNamn';
import { buildForarkartaStyle, FORARKARTA_ATTRIBUTION } from '../oversikt/forarkarta-stil';
import { getMaskinTyp } from '../oversikt/oversikt-utils';
import { classifyMarkering, markeringSub, SUB_LABEL, prettifySub } from '../oversikt/markeringar';
import type { OversiktObjekt, Maskin, MaskinKoItem } from '../oversikt/oversikt-types';
import { STATUS_AKTIV, STATUS_AVSLUTADE } from '../oversikt/oversikt-types';
import { hamtaSenastePlatser, dagarSedan, type PlatsForslag } from '../maskinflytt/senastePlats';
import { paBackenKvar } from '@/lib/skotat';
import { hamtaSkordMapV2, type SkordAggV2 } from './skord-data';
import { beraknaForslag, type MaskinForslag } from './nasta-v2';
import { FARG, TYP, AVSTAND, RADIE, FONT, TNUM, designCss } from '@/lib/design/tokens';

declare global { interface Window { maplibregl: any } }

// Facitens mörka chip/ark ligger ovanpå den ljusa kartan.
const CHIP_BG = 'rgba(28,28,30,0.94)';
const GRAY_LINE = 'rgba(142,142,147,0.9)';
const LIT_LINE = '#1c1c1e';        // "tänd" rutt — mörk för kontrast på ljus karta (facitens vita blir mörk)
const GRAY_DOT = '#8e8e93';

// ── små format-hjälpare ───────────────────────────────────────────────────────
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

interface MarkeringRow { objekt_id: string | null; typ: string | null; data: any }
interface ObjWarn { faror: string[]; hansyn: string[] }
function buildWarnings(rows: MarkeringRow[]): { byObj: Record<string, ObjWarn>; faraSet: Set<string> } {
  const byObj: Record<string, ObjWarn> = {};
  const faraSet = new Set<string>();
  for (const m of rows) {
    if (!m.objekt_id) continue;
    const level = classifyMarkering(m.data);
    if (level !== 'fara' && level !== 'hansyn') continue;
    const subRaw = markeringSub(m.data);
    const label = subRaw ? (SUB_LABEL[subRaw] || prettifySub(subRaw)) : 'Markering';
    (byObj[m.objekt_id] ||= { faror: [], hansyn: [] });
    if (level === 'fara') { byObj[m.objekt_id].faror.push(label); faraSet.add(m.objekt_id); }
    else byObj[m.objekt_id].hansyn.push(label);
  }
  return { byObj, faraSet };
}

// avslutade tonar ut linjärt 0–180 dgr; utan datum eller >180 dgr visas de inte.
function dotOpacity(o: OversiktObjekt): number | null {
  if (o.status === 'planerad' || STATUS_AKTIV.includes(o.status)) return 0.9;
  if (STATUS_AVSLUTADE.includes(o.status)) {
    const d = (o as any).avslutad_timestamp || o.faktisk_slut || null;
    if (!d) return null;
    const age = dagarSedan(d);
    if (age > 180) return null;
    return Math.max(0.1, 0.45 - (age / 180) * 0.35);
  }
  return null; // oplanerad/importerad visas inte (håller kartan om "vart ska de")
}

export default function OversiktV2Page() {
  const { medarbetare, loading: rollLaddar } = useCurrentMedarbetare();

  const [objekt, setObjekt] = useState<OversiktObjekt[]>([]);
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [maskinKo, setMaskinKo] = useState<MaskinKoItem[]>([]);
  const [warnings, setWarnings] = useState<{ byObj: Record<string, ObjWarn>; faraSet: Set<string> }>({ byObj: {}, faraSet: new Set() });
  const [skord, setSkord] = useState<Record<string, SkordAggV2>>({});
  const [positions, setPositions] = useState<Map<string, PlatsForslag>>(new Map());
  const [telByMaskin, setTelByMaskin] = useState<Record<string, string>>({});
  const [kmByMaskin, setKmByMaskin] = useState<Record<string, number | null>>({});

  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState(false);
  const [selMaskin, setSelMaskin] = useState<string | null>(null);

  // ── datahämtning ──
  const fetchAll = useCallback(async () => {
    setFel(false); setLaddar(true);
    let objRows: OversiktObjekt[];
    let maskinRows: Maskin[];
    try {
      const [obj, maskinerRes, koRes, markRes] = await Promise.all([
        fetchAllRows<OversiktObjekt>(() => supabase.from('objekt').select('*').order('namn').order('id')),
        supabase.from('dim_maskin').select('*').order('modell'),
        supabase.from('maskin_ko').select('*').order('ordning'),
        supabase.from('planering_markeringar').select('objekt_id, typ, data'),
      ]);
      objRows = obj;
      maskinRows = (maskinerRes.data || []) as Maskin[];
      if (!objRows.length || !maskinRows.length) throw new Error('tom kärndata');
      setObjekt(objRows);
      setMaskiner(maskinRows);
      setMaskinKo((koRes.data || []) as MaskinKoItem[]);
      setWarnings(buildWarnings((markRes.data || []) as MarkeringRow[]));
    } catch (e) {
      console.error('[Översikt v2] kunde inte läsa kärndata', e);
      setFel(true); setLaddar(false);
      return;
    }
    setLaddar(false);

    // Sekundärt (mjukt): positioner + skörd/skotat + telefonnummer. Fel här tömmer aldrig kartan.
    const ids = Array.from(new Set(maskinRows.map((m) => m.maskin_id).filter(Boolean))) as string[];
    const [platserRes, skordRes, telRes] = await Promise.allSettled([
      hamtaSenastePlatser(ids),
      hamtaSkordMapV2(),
      supabase.from('medarbetare').select('maskin_id, telefon, roll').not('maskin_id', 'is', null),
    ]);
    if (platserRes.status === 'fulfilled') setPositions(platserRes.value.platser);
    if (skordRes.status === 'fulfilled') setSkord(skordRes.value);
    if (telRes.status === 'fulfilled' && telRes.value.data) {
      const t: Record<string, string> = {};
      for (const r of telRes.value.data as { maskin_id: string; telefon: string | null; roll: string | null }[]) {
        if (r.maskin_id && r.telefon && !t[r.maskin_id]) t[r.maskin_id] = r.telefon;
      }
      setTelByMaskin(t);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Aktiv flotta = maskiner vi faktiskt kör: i kön ELLER med känd plats. Håller
  // gamla/sålda maskiner (varken kö eller position) borta från kartan och listan.
  const maskinKoIds = useMemo(() => new Set(maskinKo.map((k) => k.maskin_id)), [maskinKo]);
  const aktivaMaskiner = useMemo(
    () => maskiner.filter((m) => positions.get(m.maskin_id)?.koordinat != null || maskinKoIds.has(m.maskin_id)),
    [maskiner, positions, maskinKoIds],
  );

  // ── förslag (nu + nästa per maskin), haversine för rangordning ──
  const forslag = useMemo(() => {
    if (!aktivaMaskiner.length) return new Map<string, MaskinForslag>();
    return beraknaForslag({
      maskiner: aktivaMaskiner, objekt, maskinKo, skord,
      oppenFaraByObjId: warnings.faraSet,
      positions,
      avstandKm: (a, b) => haversineKm(a, b),
    });
  }, [maskiner, objekt, maskinKo, skord, warnings, positions]);

  // ── OSRM körväg-km för varje maskins valda sträcka (position → nästa) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const jobs: Promise<[string, number | null]>[] = [];
      forslag.forEach((f, mid) => {
        if (!f.koordinat || !f.nasta || f.nasta.lat == null || f.nasta.lng == null) return;
        const from = f.koordinat, to = { lat: f.nasta.lat, lng: f.nasta.lng };
        jobs.push((async () => {
          try {
            const r = await fetch(`/api/routing?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`);
            const j = await r.json();
            return [mid, typeof j.km === 'number' ? j.km : Math.round(haversineKm(from, to) * 1.4)];
          } catch {
            return [mid, Math.round(haversineKm(from, to) * 1.4)];
          }
        })());
      });
      const res = await Promise.all(jobs);
      if (cancelled) return;
      setKmByMaskin((prev) => { const next = { ...prev }; for (const [mid, km] of res) next[mid] = km; return next; });
    })();
    return () => { cancelled = true; };
  }, [forslag]);

  // ── roll ──
  const isDriver = medarbetare?.roll === 'forare';
  const driverMaskinId = medarbetare?.maskin_id ?? null;
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (didAutoSelect.current || rollLaddar || laddar) return;
    if (isDriver && driverMaskinId && forslag.has(driverMaskinId)) {
      setSelMaskin(driverMaskinId);
      didAutoSelect.current = true;
    } else if (!isDriver && !rollLaddar) {
      didAutoSelect.current = true; // förman: hela kartan, inget valt
    }
  }, [isDriver, driverMaskinId, forslag, rollLaddar, laddar]);

  // ══════════════════════ KARTA (window.maplibregl, platt 2D) ══════════════════
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
  const machMarkersRef = useRef<Map<string, { marker: any; square: HTMLDivElement; label: HTMLDivElement; sub: HTMLDivElement }>>(new Map());
  const dotsRef = useRef<Map<string, { marker: any; el: HTMLDivElement }>>(new Map());
  const onMapRef = useRef<any[]>([]);
  const didFitRef = useRef(false);
  // refs så kart-lyssnare (move/zoom) läser färskt utan att bindas om
  const forslagRef = useRef(forslag); forslagRef.current = forslag;
  const selRef = useRef(selMaskin); selRef.current = selMaskin;
  const kmRef = useRef(kmByMaskin); kmRef.current = kmByMaskin;

  // Ladda MapLibre-CDN (samma version som /oversikt; delar global om redan laddad)
  useEffect(() => {
    if (!document.getElementById('maplibre-css-oversiktv2')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css-oversiktv2';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }
    if (!window.maplibregl) {
      const s = document.createElement('script');
      s.id = 'maplibre-js-oversiktv2';
      s.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      s.onload = () => setMapReady(true);
      document.head.appendChild(s);
    } else setMapReady(true);
  }, []);

  const sublabelText = useCallback((f: MaskinForslag, km: number | null): string => {
    if (!f.nasta) return 'inget planerat';
    return `→ ${f.nasta.namn}${km != null ? ` · ${Math.round(km)} km` : ''}`;
  }, []);

  // Etikett-kollision: skjut ned överlappande etiketter (facit: får aldrig ligga på varandra)
  const layoutLabels = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    if (selRef.current) return; // etiketter göms när en maskin är vald
    const items: { label: HTMLDivElement; x: number; y: number }[] = [];
    machMarkersRef.current.forEach((mm, mid) => {
      const f = forslagRef.current.get(mid);
      if (!f?.koordinat) return;
      const p = map.project([f.koordinat.lng, f.koordinat.lat]);
      items.push({ label: mm.label, x: p.x, y: p.y });
    });
    items.sort((a, b) => a.y - b.y);
    const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const LW = 168, LH = 40, GAP = 6, LEFT = 16;
    for (const it of items) {
      const left = it.x + LEFT;
      let top = it.y - LH / 2;
      let guard = 0;
      while (guard++ < 24) {
        const hit = placed.find((r) => !(left > r.x2 || left + LW < r.x1 || top > r.y2 || top + LH < r.y1));
        if (!hit) break;
        top = hit.y2 + GAP;
      }
      it.label.style.transform = `translateY(${Math.round(top - (it.y - LH / 2))}px)`;
      placed.push({ x1: left, y1: top, x2: left + LW, y2: top + LH });
    }
  }, []);

  // Init (en gång)
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;
    const map = new window.maplibregl.Map({
      container: mapContainerRef.current,
      style: buildForarkartaStyle(),
      center: [14.72, 56.50], zoom: 9,
      maxPitch: 0, dragRotate: false, attributionControl: false,
    });
    mapRef.current = map;
    try { map.touchZoomRotate.disableRotation(); } catch { /* äldre maplibre */ }
    map.addControl(new window.maplibregl.AttributionControl({ customAttribution: FORARKARTA_ATTRIBUTION, compact: true }));
    map.on('load', () => {
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'routes', type: 'line', source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': GRAY_LINE, 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.7 },
      });
      setMapStyleLoaded(true);
    });
    map.on('move', layoutLabels);
    map.on('zoom', layoutLabels);
    map.on('click', () => setSelMaskin(null));
    return () => {
      machMarkersRef.current.forEach((m) => m.marker.remove()); machMarkersRef.current.clear();
      dotsRef.current.forEach((d) => d.marker.remove()); dotsRef.current.clear();
      onMapRef.current.forEach((m) => m.remove()); onMapRef.current = [];
      map.remove(); mapRef.current = null; setMapStyleLoaded(false);
    };
  }, [mapReady, layoutLabels]);

  // Rutt-linjer (position → nästa) som geojson
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    const src = map.getSource('routes'); if (!src) return;
    const features: any[] = [];
    forslag.forEach((f, mid) => {
      if (!f.koordinat || !f.nasta || f.nasta.lat == null || f.nasta.lng == null) return;
      features.push({
        type: 'Feature', properties: { maskin_id: mid },
        geometry: { type: 'LineString', coordinates: [[f.koordinat.lng, f.koordinat.lat], [f.nasta.lng, f.nasta.lat]] },
      });
    });
    try { src.setData({ type: 'FeatureCollection', features }); } catch { /* setData race */ }
  }, [forslag, mapStyleLoaded]);

  // Objekt-prickar (skapa/synka)
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    const want = new Map<string, number>();
    for (const o of objekt) {
      if (o.lat == null || o.lng == null) continue;
      const op = dotOpacity(o);
      if (op == null) continue;
      want.set(o.id, op);
    }
    dotsRef.current.forEach((d, id) => { if (!want.has(id)) { d.marker.remove(); dotsRef.current.delete(id); } });
    want.forEach((op, id) => {
      const o = objekt.find((x) => x.id === id)!;
      let entry = dotsRef.current.get(id);
      if (!entry) {
        const el = document.createElement('div');
        el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${GRAY_DOT};pointer-events:none;box-shadow:0 0 0 1px rgba(0,0,0,0.2)`;
        const marker = new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([o.lng!, o.lat!]).addTo(map);
        entry = { marker, el };
        dotsRef.current.set(id, entry);
      }
      entry.el.dataset.op = String(op);
    });
    restyleSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objekt, mapStyleLoaded]);

  // Maskin-markörer (blå fyrkant + etikett) — skapa/synka
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    const want = new Set<string>();
    forslag.forEach((f, mid) => { if (f.koordinat) want.add(mid); });
    machMarkersRef.current.forEach((mm, mid) => { if (!want.has(mid)) { mm.marker.remove(); machMarkersRef.current.delete(mid); } });
    forslag.forEach((f, mid) => {
      if (!f.koordinat) return;
      const namn = maskinVisningsnamn(maskiner.find((m) => m.maskin_id === mid)) || mid;
      let entry = machMarkersRef.current.get(mid);
      if (!entry) {
        const container = document.createElement('div');
        container.style.cssText = 'position:relative;width:0;height:0';
        const square = document.createElement('div');
        square.style.cssText = `position:absolute;left:-12px;top:-12px;width:24px;height:24px;border-radius:5px;background:${FARG.bla};cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.4)`;
        const label = document.createElement('div');
        label.style.cssText = `position:absolute;left:16px;top:-20px;display:flex;flex-direction:column;gap:2px;padding:8px 12px;background:${CHIP_BG};border-radius:10px;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.35)`;
        const name = document.createElement('div');
        name.style.cssText = `font-size:14px;font-weight:600;color:${FARG.text}`;
        name.textContent = namn;
        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:13px';
        label.appendChild(name); label.appendChild(sub);
        const onClick = (e: Event) => { e.stopPropagation(); setSelMaskin((prev) => (prev === mid ? null : mid)); };
        square.addEventListener('click', onClick);
        label.addEventListener('click', onClick);
        container.appendChild(square); container.appendChild(label);
        const marker = new window.maplibregl.Marker({ element: container, anchor: 'center' }).setLngLat([f.koordinat.lng, f.koordinat.lat]).addTo(map);
        entry = { marker, square, label, sub };
        machMarkersRef.current.set(mid, entry);
      } else {
        (entry.label.firstChild as HTMLDivElement).textContent = namn;
        entry.marker.setLngLat([f.koordinat.lng, f.koordinat.lat]);
      }
      entry.sub.textContent = sublabelText(f, kmByMaskin[mid] ?? null);
      entry.sub.style.color = f.nasta ? '#a1a1a6' : FARG.text2;
    });
    restyleSelection();
    layoutLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forslag, maskiner, kmByMaskin, mapStyleLoaded, sublabelText, layoutLabels]);

  // Auto-fit en gång när positioner finns
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded || didFitRef.current) return;
    const pts: [number, number][] = [];
    forslag.forEach((f) => {
      if (f.koordinat) pts.push([f.koordinat.lng, f.koordinat.lat]);
      if (f.nasta && f.nasta.lat != null && f.nasta.lng != null) pts.push([f.nasta.lng, f.nasta.lat]);
    });
    if (!pts.length) return;
    didFitRef.current = true;
    if (pts.length === 1) map.easeTo({ center: pts[0], zoom: 12, duration: 500 });
    else {
      const b = new window.maplibregl.LngLatBounds();
      pts.forEach((p) => b.extend(p));
      map.fitBounds(b, { padding: { top: 60, left: 40, right: 40, bottom: 120 }, maxZoom: 13, duration: 500 });
    }
  }, [forslag, mapStyleLoaded]);

  // Markera vald maskin: tona ned resten, tänd rutten + nästa, lägg on-map-etiketter
  const restyleSelection = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    const S = selRef.current;
    const nastaId = S ? forslagRef.current.get(S)?.nasta?.id ?? null : null;

    machMarkersRef.current.forEach((mm, mid) => {
      const sel = mid === S;
      mm.square.style.width = sel ? '28px' : '24px';
      mm.square.style.height = sel ? '28px' : '24px';
      mm.square.style.left = sel ? '-14px' : '-12px';
      mm.square.style.top = sel ? '-14px' : '-12px';
      mm.square.style.opacity = (!S || sel) ? '1' : '0.28';
      mm.square.style.boxShadow = sel ? `0 0 0 4px rgba(10,132,255,0.28), 0 1px 4px rgba(0,0,0,0.4)` : '0 1px 4px rgba(0,0,0,0.4)';
      mm.label.style.display = S ? 'none' : 'flex';
    });
    dotsRef.current.forEach((d, id) => {
      const base = Number(d.el.dataset.op || '0.9');
      if (!S) { d.el.style.background = GRAY_DOT; d.el.style.opacity = String(base); d.el.style.width = '16px'; d.el.style.height = '16px'; }
      else if (id === nastaId) { d.el.style.background = FARG.gron; d.el.style.opacity = '1'; d.el.style.width = '22px'; d.el.style.height = '22px'; }
      else { d.el.style.background = GRAY_DOT; d.el.style.opacity = '0.12'; d.el.style.width = '16px'; d.el.style.height = '16px'; }
    });
    if (map.getLayer('routes')) {
      if (S) {
        map.setPaintProperty('routes', 'line-color', ['case', ['==', ['get', 'maskin_id'], S], LIT_LINE, GRAY_LINE]);
        map.setPaintProperty('routes', 'line-opacity', ['case', ['==', ['get', 'maskin_id'], S], 1, 0.12]);
        map.setPaintProperty('routes', 'line-width', ['case', ['==', ['get', 'maskin_id'], S], 3, 2]);
      } else {
        map.setPaintProperty('routes', 'line-color', GRAY_LINE);
        map.setPaintProperty('routes', 'line-opacity', 0.7);
        map.setPaintProperty('routes', 'line-width', 2);
      }
    }
    // on-map-etiketter (mörka chip så de läses på ljus karta)
    onMapRef.current.forEach((m) => m.remove()); onMapRef.current = [];
    if (S) {
      const f = forslagRef.current.get(S);
      if (f?.nasta && f.nasta.lat != null && f.nasta.lng != null) {
        const nameChip = document.createElement('div');
        nameChip.style.cssText = `padding:4px 9px;background:${CHIP_BG};border-radius:8px;font-size:13px;font-weight:600;color:${FARG.text};white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.35)`;
        nameChip.textContent = f.nasta.namn;
        onMapRef.current.push(new window.maplibregl.Marker({ element: nameChip, anchor: 'bottom', offset: [0, -16] }).setLngLat([f.nasta.lng, f.nasta.lat]).addTo(map));
        const km = kmRef.current[S];
        if (f.koordinat && km != null) {
          const kmChip = document.createElement('div');
          kmChip.style.cssText = `padding:3px 8px;background:${CHIP_BG};border-radius:8px;font-size:13px;font-weight:600;color:${FARG.text};white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.35)`;
          kmChip.textContent = `${Math.round(km)} km`;
          const mid: [number, number] = [(f.koordinat.lng + f.nasta.lng) / 2, (f.koordinat.lat + f.nasta.lat) / 2];
          onMapRef.current.push(new window.maplibregl.Marker({ element: kmChip, anchor: 'center' }).setLngLat(mid).addTo(map));
        }
      }
    }
  }, []);

  // kör om markeringen + centrera vald maskin över arket
  useEffect(() => {
    restyleSelection();
    layoutLabels();
    const map = mapRef.current;
    if (map && selMaskin) {
      const f = forslag.get(selMaskin);
      if (f?.koordinat) map.easeTo({ center: [f.koordinat.lng, f.koordinat.lat], offset: [0, -150], zoom: Math.max(map.getZoom(), 12), duration: 500 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMaskin, kmByMaskin, restyleSelection, layoutLabels]);

  // ── härledd data till arket ──
  const utanPosition = useMemo(
    () => maskiner.filter((m) => !positions.get(m.maskin_id)?.koordinat),
    [maskiner, positions],
  );
  const valt = selMaskin ? forslag.get(selMaskin) ?? null : null;

  // ════════════════════════════════ RENDER ════════════════════════════════════
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

      {/* Maskiner utan känd plats — lista under kartan (bara i översiktsläget) */}
      {!laddar && !fel && !selMaskin && utanPosition.length > 0 && (
        <div style={{ position: 'absolute', left: AVSTAND.l, right: AVSTAND.l, bottom: `calc(${AVSTAND.l}px + env(safe-area-inset-bottom))`, background: CHIP_BG, borderRadius: RADIE.kort, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, boxShadow: '0 4px 16px rgba(0,0,0,0.35)', zIndex: 6 }}>
          <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.s }}>Ingen känd plats</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
            {utanPosition.map((m) => (
              <div key={m.maskin_id} style={{ ...TYP.meta, color: FARG.text }}>
                {maskinVisningsnamn(m) || m.maskin_id} <span style={{ color: FARG.text2 }}>— ingen position</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ARK — en maskin tryckt */}
      {!laddar && !fel && valt && (
        <Ark
          key={selMaskin!}
          f={valt}
          namn={maskinVisningsnamn(maskiner.find((m) => m.maskin_id === selMaskin)) || selMaskin!}
          km={kmByMaskin[selMaskin!] ?? null}
          skord={skord}
          warnings={warnings.byObj}
          telefon={telByMaskin[selMaskin!] ?? null}
          onClose={() => setSelMaskin(null)}
        />
      )}
    </div>
  );
}

// ── Arket (bottom sheet) ──────────────────────────────────────────────────────
function aggFor(o: OversiktObjekt | null, skord: Record<string, SkordAggV2>): SkordAggV2 | undefined {
  return o?.vo_nummer ? skord[o.vo_nummer] : undefined;
}
const CELL_LABEL: React.CSSProperties = { color: FARG.text2 };
const rowMeta = (agg: SkordAggV2 | undefined): string => {
  if (!agg?.sista) return '';
  return `avverkat ${kortDatum(agg.sista)} · legat ${dagarSedan(agg.sista)} dgr`;
};

function Ark({ f, namn, km, skord, warnings, telefon, onClose }: {
  f: MaskinForslag; namn: string; km: number | null;
  skord: Record<string, SkordAggV2>; warnings: Record<string, ObjWarn>;
  telefon: string | null; onClose: () => void;
}) {
  const nuAgg = aggFor(f.nuObjekt, skord);
  const nastaAgg = aggFor(f.nasta, skord);
  const rollLabel = f.typ === 'skotare' ? 'skotare' : 'skördare';

  // Nu: skotare visar kvar på backen; skördare producerar (ingen tillförlitlig "kvar")
  const nuKvar = f.nuObjekt && nuAgg && nuAgg.skordat > 0
    ? paBackenKvar(nuAgg.skordat, nuAgg.skotat, nuAgg.egenSkotning) : null;
  const nuVarde = f.typ === 'skotare' && nuKvar != null ? `${fmt(nuKvar)} m³ kvar` : '';

  // Nästa: skotare → backen att köra ut; skördare → planerad volym
  const nastaVol = f.nasta
    ? (f.typ === 'skotare'
        ? (nastaAgg && nastaAgg.skordat > 0 ? paBackenKvar(nastaAgg.skordat, nastaAgg.skotat, nastaAgg.egenSkotning) : null)
        : (f.nasta.volym_planerad ?? (f.nasta.volym || null)))
    : null;
  const nastaHoger = [nastaVol != null ? `${fmt(nastaVol)} m³` : null, km != null ? `${Math.round(km)} km` : null].filter(Boolean).join(' · ');

  const w = f.nasta ? warnings[f.nasta.id] : undefined;
  const varn: { text: string; color: string } | null =
    w && w.faror.length ? { text: `fara: ${w.faror[0]}`, color: FARG.rod }
    : w && w.hansyn.length ? { text: `hänsyn: ${w.hansyn[0]}`, color: FARG.orange } : null;
  const nastaMeta = rowMeta(nastaAgg);

  const mapsHref = f.nasta && f.nasta.lat != null && f.nasta.lng != null
    ? (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
        ? `maps://maps.apple.com/?daddr=${f.nasta.lat},${f.nasta.lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${f.nasta.lat},${f.nasta.lng}`)
    : null;

  const knapp: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.s, flexGrow: 1,
    minHeight: 50, border: `0.5px solid #48484a`, borderRadius: RADIE.knapp, textDecoration: 'none',
    ...TYP.listtitel, color: FARG.text, fontFamily: 'inherit', background: 'transparent',
  };

  return (
    <div className="sheet-upp" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 8, display: 'flex', flexDirection: 'column', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px calc(${AVSTAND.xl}px + env(safe-area-inset-bottom))`, background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, boxShadow: '0 -8px 30px rgba(0,0,0,0.5)' }}>
      <button onClick={onClose} aria-label="Stäng" style={{ display: 'flex', justifyContent: 'center', border: 'none', background: 'none', padding: `${AVSTAND.xs}px 0`, cursor: 'pointer' }}>
        <div style={{ width: 36, height: 5, borderRadius: 3, background: '#48484a' }} />
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ ...TYP.rubrik }}>{namn}</div>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{rollLabel}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) auto', columnGap: AVSTAND.m, rowGap: AVSTAND.s, ...TYP.text, ...TNUM }}>
        {/* Nu */}
        <div style={CELL_LABEL}>Nu</div>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nuObjekt ? f.nuObjekt.namn : <span style={{ color: FARG.text2 }}>okänd plats</span>}</div>
        <div style={{ color: FARG.text2, whiteSpace: 'nowrap' }}>{nuVarde}</div>
        {rowMeta(nuAgg) && (<>
          <div />
          <div style={{ ...TYP.meta, color: FARG.text2, gridColumn: '2 / 4' }}>{rowMeta(nuAgg)}</div>
        </>)}

        {/* Nästa */}
        <div style={{ ...CELL_LABEL, marginTop: AVSTAND.s }}>Nästa</div>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: AVSTAND.s }}>
          {f.nasta ? f.nasta.namn : <span style={{ fontWeight: 400, color: FARG.text2 }}>inget planerat</span>}
        </div>
        <div style={{ color: FARG.text2, whiteSpace: 'nowrap', marginTop: AVSTAND.s }}>{nastaHoger}</div>
        {(nastaMeta || varn) && (<>
          <div />
          <div style={{ ...TYP.meta, color: FARG.text2, gridColumn: '2 / 4' }}>
            {nastaMeta}{nastaMeta && varn ? ' · ' : ''}{varn && <span style={{ color: varn.color }}>{varn.text}</span>}
          </div>
        </>)}
      </div>

      <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.xs }}>
        {telefon && (
          <a href={`tel:${telefon}`} style={knapp}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
            Ring
          </a>
        )}
        {mapsHref && (
          <a href={mapsHref} target="_blank" rel="noopener noreferrer" style={knapp}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>
            Vägbeskrivning
          </a>
        )}
      </div>
    </div>
  );
}
