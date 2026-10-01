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
export type Rutt = { km: number | null; geom: [number, number][] | null };
/** Vägrutt (km + ORS-geometri) via /api/routing?withGeometry=1. km knyts till geometrin: finns ingen
 *  geometri (ORS-miss/fallback) → km null OCH geom null, så kartans siffra och linje ALLTID stämmer. */
async function vagRutt(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Rutt> {
  try {
    const r = await fetch(`/api/routing?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}&withGeometry=1`);
    const j = await r.json();
    const geom: [number, number][] | null = Array.isArray(j.geometry) ? j.geometry : null;
    if (!geom) console.warn(`[oversikt-v2] ingen väggeometri ${from.lat.toFixed(3)},${from.lng.toFixed(3)}→${to.lat.toFixed(3)},${to.lng.toFixed(3)}: ${j.orsError ?? j.source}`); // skäl i konsolen
    return { km: geom && typeof j.km === 'number' ? j.km : null, geom };
  } catch { return { km: null, geom: null }; }
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

// Prick/ring per objekt. form:'ring' = väntar (planerad OCH otilldelad). 'fill' = fylld.
// utzoom = visas även utzoomad. Utzoomat göms BARA avslutade → allt annat (pågår/planerad/kö/ring) = true.
// namnbar = får namn-etikett vid inzoomning (pågår/planerad/väntar). Avslutade aldrig.
// halo = vit ytterkant + mörk kontur för att lyfta från ljus topografi (ej avslutade).
interface DotDesc { form: 'ring' | 'fill'; color: string; opacity: number; size: number; utzoom: boolean; namnbar: boolean; halo: boolean }
// iKo = objektet ligger i någon maskins maskin_ko → räknas som tilldelat (grå prick, aldrig ring).
function dotDesc(o: OversiktObjekt, iKo: boolean): DotDesc | null {
  if (STATUS_AKTIV.includes(o.status)) return { form: 'fill', color: FARG.gron, opacity: 1, size: 18, utzoom: true, namnbar: true, halo: true }; // pågår = grön
  if (o.status === 'planerad') {
    return (harMaskin(o) || iKo)
      ? { form: 'fill', color: GRAY_DOT, opacity: 0.95, size: 16, utzoom: true, namnbar: true, halo: true }  // tilldelad (maskin el. kö) = grå, syns även utzoomat
      : { form: 'ring', color: GRAY_DOT, opacity: 1, size: 18, utzoom: true, namnbar: true, halo: true };  // väntar = ihålig ring
  }
  if (STATUS_AVSLUTADE.includes(o.status)) {
    const d = (o as any).avslutad_timestamp || o.faktisk_slut || null;
    if (!d) return null;
    const age = dagarSedan(d);
    if (age > 180) return null;
    return { form: 'fill', color: GRAY_DOT, opacity: Math.max(0.1, 0.42 - (age / 180) * 0.32), size: 13, utzoom: false, namnbar: false, halo: false }; // avslutad, bleknar — orörd
  }
  return null;
}

const nastaAv = (f: MaskinForslag) => f.ko[0]?.objekt ?? null;
// En rad i '+ Lägg till objekt'-väljaren.
type LaggKand = { id: string; namn: string; atgard: string; m3: number | null; lat: number; lng: number; koMaskinNamn: string | null };
// Routing-ORIGO: står maskinen på ett känt objekt → rutta från OBJEKTETS koordinat (stabil, nära väg),
// inte stam-GPS:en mitt i beståndet. Markören står kvar på f.koordinat. Fallback: positionen.
function ruttStart(f: MaskinForslag): { lat: number; lng: number } | null {
  const o = f.nuObjekt;
  if (o && o.lat != null && o.lng != null) return { lat: o.lat, lng: o.lng };
  return f.koordinat ?? null;
}

export default function OversiktV2Page() {
  const { medarbetare, loading: rollLaddar } = useCurrentMedarbetare();

  const [objekt, setObjekt] = useState<OversiktObjekt[]>([]);
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [maskinKo, setMaskinKo] = useState<MaskinKoItem[]>([]);
  const [warnings, setWarnings] = useState<Record<string, ObjWarn>>({});
  const [skord, setSkord] = useState<Record<string, SkordAggV2>>({});
  const [positions, setPositions] = useState<Map<string, PlatsForslag>>(new Map());
  const [telByMaskin, setTelByMaskin] = useState<Record<string, string>>({});
  const [ruttVersion, setRuttVersion] = useState(0); // bumpas när rutt-cachen fyllts → rita om km/linjer
  const [highlightObjekt, setHighlightObjekt] = useState<string | null>(null); // prick som markeras under fingret i '+ Lägg till objekt'

  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState(false);
  const [selMaskin, setSelMaskin] = useState<string | null>(null);
  const [selObjekt, setSelObjekt] = useState<string | null>(null); // förman tryckte på en prick
  const [zoomNiva, setZoomNiva] = useState(9);
  const [koPreview, setKoPreview] = useState<OversiktObjekt[] | null>(null); // live drag-ordning för vald maskin

  // Klient-cache av vägrutt (km + geometri) per koordinatpar. Under drag läses BARA härifrån
  // (inga routing-anrop mitt i ett drag); vagRuttCached fyller den, legKm/legGeom slår upp synkront.
  const ruttCacheRef = useRef<Map<string, Rutt>>(new Map());
  const cacheKey = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => `${a.lat.toFixed(3)},${a.lng.toFixed(3)};${b.lat.toFixed(3)},${b.lng.toFixed(3)}`;
  const vagRuttCached = useCallback(async (from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Rutt> => {
    const k = cacheKey(from, to); const c = ruttCacheRef.current;
    const have = c.get(k); if (have && have.geom) return have; // bara geometri-träff är en riktig träff
    const rutt = await vagRutt(from, to); c.set(k, rutt); return rutt;
  }, []);
  const legKmCache = useCallback((from: { lat: number; lng: number } | null, to: { lat: number; lng: number } | null): number | null => (from && to ? ruttCacheRef.current.get(cacheKey(from, to))?.km ?? null : null), []);
  const legGeomCache = useCallback((from: { lat: number; lng: number } | null, to: { lat: number; lng: number } | null): [number, number][] | null => (from && to ? ruttCacheRef.current.get(cacheKey(from, to))?.geom ?? null : null), []);

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
  const koObjektIds = useMemo(() => new Set(maskinKo.map((k) => k.objekt_id)), [maskinKo]); // objekt som ligger i någon kö = tilldelade
  const todayISO = useMemo(() => new Date().toLocaleDateString('sv-SE'), []);
  const aktivaMaskiner = useMemo(
    () => maskiner.filter((m) => maskinAktiv(m as MaskinRad, todayISO) && (positions.get(m.maskin_id)?.koordinat != null || maskinKoIds.has(m.maskin_id))),
    [maskiner, positions, maskinKoIds, todayISO],
  );

  const forslag = useMemo(() => {
    if (!aktivaMaskiner.length) return new Map<string, MaskinForslag>();
    return beraknaForslag({ maskiner: aktivaMaskiner as MaskinRad[], objekt, maskinKo, skord, positions, avstandKm: (a, b) => haversineKm(a, b) });
  }, [aktivaMaskiner, objekt, maskinKo, skord, positions]);

  // Vägrutt (km + geometri) hämtas BARA för vald maskins fasta kö-ordning. Etiketten visar inga km
  // (behöver inga anrop för hela flottan). Beror på [selMaskin, forslag] — inte koPreview → inga
  // anrop under drag; en ny ordning hämtas vid släpp (forslag uppdateras då). Fyller rutt-cachen.
  useEffect(() => {
    if (!selMaskin) return;
    const f = forslag.get(selMaskin); if (!f?.koordinat || !f.ko.length) return;
    let cancelled = false;
    (async () => {
      const punkter = [ruttStart(f), ...f.ko.map((p) => (p.objekt.lat != null && p.objekt.lng != null ? { lat: p.objekt.lat, lng: p.objekt.lng } : null))];
      for (let i = 1; i < punkter.length; i++) { const a = punkter[i - 1], b = punkter[i]; if (a && b) await vagRuttCached(a, b); }
      if (!cancelled) setRuttVersion((v) => v + 1);
    })();
    return () => { cancelled = true; };
  }, [selMaskin, forslag, vagRuttCached]);

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
  const clusterMarkersRef = useRef<any[]>([]); // ihopslagna maskin-markörer ("N maskiner")
  const highlightMarkerRef = useRef<any>(null); // prick under fingret i '+ Lägg till objekt'-väljaren
  const didFitRef = useRef(false);
  const forslagRef = useRef(forslag); forslagRef.current = forslag;
  const selRef = useRef(selMaskin); selRef.current = selMaskin;
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

  // Etiketten är en SKYLT, inte en mening: maskinnamnet (name-div) + "→ nästa". Inga km (de bor i arket).
  const sublabelText = useCallback((f: MaskinForslag): string => {
    const nasta = nastaAv(f);
    return nasta ? `→ ${nasta.namn}` : '· inget planerat';
  }, []);

  const layoutLabels = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    const items: { label: HTMLDivElement; x: number; y: number }[] = [];
    machMarkersRef.current.forEach((mm, mid) => {
      if (mm.label.style.display === 'none') return; // ihopslagen/dold maskin — hoppa över
      const f = forslagRef.current.get(mid); if (!f?.koordinat) return;
      const p = map.project([f.koordinat.lng, f.koordinat.lat]); items.push({ label: mm.label, x: p.x, y: p.y });
    });
    items.sort((a, b) => a.y - b.y);
    const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const LW = 200, LH = 28, GAP = 6, LEFT = 16;
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

  // Maskin-markörernas synlighet + skärm-klustring. Körs på move/zoom (positionerna ändras i
  // skärmrummet) + vid urval. Vald maskin klustras aldrig och får full etikett. Utan vald maskin:
  // etiketten krymper under z11 (bara namn), och markörer närmare än ~40 px slås ihop till "N".
  const layoutMachines = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    clusterMarkersRef.current.forEach((m) => m.remove()); clusterMarkersRef.current = [];
    const S = selRef.current; const z = map.getZoom();
    type E = { mid: string; mm: { square: HTMLDivElement; label: HTMLDivElement; sub: HTMLDivElement }; f: MaskinForslag; x: number; y: number };
    const entries: E[] = [];
    machMarkersRef.current.forEach((mm, mid) => {
      const f = forslagRef.current.get(mid); if (!f?.koordinat) return;
      const p = map.project([f.koordinat.lng, f.koordinat.lat]); entries.push({ mid, mm, f, x: p.x, y: p.y });
    });
    if (S) { // vald maskin: ingen klustring. Vald → full etikett; övriga → dold etikett (men syns dämpat).
      entries.forEach((e) => { e.mm.square.style.display = 'block'; const sel = e.mid === S; e.mm.label.style.display = sel ? 'flex' : 'none'; e.mm.sub.style.display = 'block'; });
      return;
    }
    const CL = 40; const used = new Set<number>();
    entries.forEach((e, i) => {
      if (used.has(i)) return;
      const group = [e]; used.add(i);
      for (let j = i + 1; j < entries.length; j++) { if (used.has(j)) continue; if (Math.hypot(e.x - entries[j].x, e.y - entries[j].y) < CL) { group.push(entries[j]); used.add(j); } }
      if (group.length === 1) {
        e.mm.square.style.display = 'block'; e.mm.label.style.display = 'flex';
        e.mm.sub.style.display = z >= THRESHOLD_ZOOM ? 'block' : 'none'; // < z11: bara maskinnamnet
        return;
      }
      group.forEach((g) => { g.mm.square.style.display = 'none'; g.mm.label.style.display = 'none'; });
      const cx = group.reduce((s, g) => s + g.x, 0) / group.length, cy = group.reduce((s, g) => s + g.y, 0) / group.length;
      const center = map.unproject([cx, cy]);
      const saknarNasta = group.some((g) => !nastaAv(g.f));
      const el = document.createElement('div'); el.style.cssText = 'position:relative;width:0;height:0;cursor:pointer';
      const sq = document.createElement('div');
      sq.style.cssText = `position:absolute;left:-16px;top:-16px;width:32px;height:32px;border-radius:7px;background:${FARG.bla};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;box-shadow:0 1px 5px rgba(0,0,0,0.45)`;
      sq.textContent = String(group.length); el.appendChild(sq);
      if (saknarNasta) { const dot = document.createElement('div'); dot.style.cssText = `position:absolute;left:12px;top:-17px;width:9px;height:9px;border-radius:50%;background:${FARG.orange};box-shadow:0 0 0 1.5px #000`; el.appendChild(dot); } // någon i klustret saknar nästa
      el.addEventListener('click', (ev) => { ev.stopPropagation(); map.easeTo({ center: [center.lng, center.lat], zoom: Math.min(16, map.getZoom() + 2.5), duration: 450 }); }); // zooma in → de delar på sig
      clusterMarkersRef.current.push(new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([center.lng, center.lat]).addTo(map));
    });
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
    map.on('move', () => { layoutMachines(); layoutLabels(); }); map.on('zoom', () => { layoutMachines(); layoutLabels(); setZoomNiva(map.getZoom()); });
    map.on('click', () => { setSelMaskin(null); setSelObjekt(null); });
    return () => {
      machMarkersRef.current.forEach((m) => m.marker.remove()); machMarkersRef.current.clear();
      dotsRef.current.forEach((d) => d.marker.remove()); dotsRef.current.clear();
      stopMarkersRef.current.forEach((m) => m.remove()); stopMarkersRef.current = [];
      clusterMarkersRef.current.forEach((m) => m.remove()); clusterMarkersRef.current = [];
      if (highlightMarkerRef.current) { highlightMarkerRef.current.remove(); highlightMarkerRef.current = null; }
      map.remove(); mapRef.current = null; setMapStyleLoaded(false);
    };
  }, [mapReady, layoutLabels, layoutMachines]);

  // Rutt-linjer ritas ENBART för vald maskin (hela kön nu→1→2→…). Översiktsläget har
  // inga linjer alls — fem korsande rutter var brus.
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    const src = map.getSource('routes'); if (!src) return;
    const features: any[] = [];
    const f = selMaskin ? forslag.get(selMaskin) : null;
    if (f?.koordinat) {
      const koObj = koPreview ?? f.ko.map((p) => p.objekt); // live drag-ordning om aktiv
      const troligtSet = new Set(f.ko.filter((p) => p.troligt).map((p) => p.objekt.id)); // tentativ 2:a (förslag) → dämpad
      const pts: ({ lat: number; lng: number } | null)[] = [ruttStart(f), ...koObj.map((o) => (o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : null))];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]; if (!a || !b) continue;
        const dimmed = troligtSet.has(koObj[i - 1]?.id); // kö + förslagets 1:a fasta; tentativ 2:a dämpad
        const geom = legGeomCache(a, b);
        if (geom && geom.length > 1) {
          features.push({ type: 'Feature', properties: { clr: LIT_LINE, op: dimmed ? 0.5 : 1, w: dimmed ? 2 : 3 }, geometry: { type: 'LineString', coordinates: geom } }); // väggeometri ur ORS
        } else {
          features.push({ type: 'Feature', properties: { clr: '#8e8e93', op: 0.5, w: 1.5 }, geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } }); // geometri saknas → tunn rak grå, aldrig påhittad väg
        }
      }
    }
    try { src.setData({ type: 'FeatureCollection', features }); } catch { /* race */ }
  }, [forslag, mapStyleLoaded, selMaskin, koPreview, ruttVersion, legGeomCache]);

  // Objekt-prickar/ringar
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    const want = new Map<string, DotDesc>();
    for (const o of objekt) { if (o.lat == null || o.lng == null) continue; const d = dotDesc(o, koObjektIds.has(o.id)); if (d) want.set(o.id, d); }
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
  }, [objekt, koObjektIds, mapStyleLoaded]);

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
        label.style.cssText = `position:absolute;left:16px;top:-16px;display:flex;flex-direction:row;align-items:baseline;gap:4px;padding:6px 11px;background:${CHIP_BG};border-radius:10px;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.35)`;
        const name = document.createElement('div'); name.style.cssText = `font-size:14px;font-weight:600;color:${FARG.text}`; name.textContent = namn;
        const sub = document.createElement('div'); sub.style.cssText = 'font-size:13px';
        label.appendChild(name); label.appendChild(sub);
        const onClick = (e: Event) => { e.stopPropagation(); setSelObjekt(null); setSelMaskin((prev) => (prev === mid ? null : mid)); };
        square.addEventListener('click', onClick); label.addEventListener('click', onClick);
        container.appendChild(square); container.appendChild(label);
        const marker = new window.maplibregl.Marker({ element: container, anchor: 'center' }).setLngLat([f.koordinat.lng, f.koordinat.lat]).addTo(map);
        entry = { marker, square, label, sub }; machMarkersRef.current.set(mid, entry);
      } else { (entry.label.firstChild as HTMLDivElement).textContent = namn; entry.marker.setLngLat([f.koordinat.lng, f.koordinat.lat]); }
      entry.sub.textContent = sublabelText(f); // bara "→ nästa" / "· inget planerat"; km finns i arket
      entry.sub.style.color = nastaAv(f) ? '#a1a1a6' : FARG.text2;
    });
    restyleSelection(); layoutLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forslag, maskiner, mapStyleLoaded, sublabelText, layoutLabels]);

  // Auto-fit en gång (flott-översikt). Hoppas över om en maskin redan är vald → urvals-fit äger kameran (förarläge).
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded || didFitRef.current) return;
    if (selRef.current) { didFitRef.current = true; return; }
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
    const troligtSet = new Set(forslagKo.filter((p) => p.troligt).map((p) => p.objekt.id)); // tentativ 2:a dämpas, även under drag
    const koIds = new Set<string>(koObj.map((o) => o.id));

    machMarkersRef.current.forEach((mm, mid) => {
      const sel = mid === S;
      mm.square.style.width = sel ? '28px' : '24px'; mm.square.style.height = sel ? '28px' : '24px';
      mm.square.style.left = sel ? '-14px' : '-12px'; mm.square.style.top = sel ? '-14px' : '-12px';
      mm.square.style.opacity = (!S || sel) ? '1' : '0.28';
      mm.square.style.boxShadow = sel ? `0 0 0 4px rgba(10,132,255,0.28), 0 1px 4px rgba(0,0,0,0.4)` : '0 1px 4px rgba(0,0,0,0.4)';
    }); // etikett-/klustersynlighet ägs av layoutMachines (anropas sist)
    dotsRef.current.forEach((d, id) => {
      const desc = d.desc; const dimNarVald = S && !koIds.has(id);
      const op = dimNarVald ? 0.1 : desc.opacity;
      const px = desc.size;
      const base = `position:absolute;box-sizing:border-box;left:${-px / 2}px;top:${-px / 2}px;width:${px}px;height:${px}px;border-radius:50%;`;
      // Halo = 1,5 px vit ytterkant + mjuk skugga så prickarna lyfter från ljus topografi. Avslutade orörda.
      const halo = desc.halo ? `0 0 0 1.5px rgba(255,255,255,0.95), 0 1px 3px rgba(0,0,0,0.35)` : `0 0 0 1px rgba(0,0,0,0.25)`;
      if (desc.form === 'ring') d.circle.style.cssText = base + `background:transparent;border:3px solid ${LIT_LINE};opacity:${op};box-shadow:${halo}`; // ihålig ring: 18 px, 3 px mörk kontur, vit halo
      else d.circle.style.cssText = base + `background:${desc.color};opacity:${op};box-shadow:${halo}`;
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
        const prev = i === 0 ? (f ? ruttStart(f) : null) : (koObj[i - 1].lat != null ? { lat: koObj[i - 1].lat!, lng: koObj[i - 1].lng! } : null);
        const to = { lat: o.lat, lng: o.lng };
        if (prev) {
          const km = legKmCache(prev, to); const geom = legGeomCache(prev, to); const kmChip = document.createElement('div');
          kmChip.style.cssText = `padding:2px 7px;background:${CHIP_BG};border-radius:8px;font-size:12px;font-weight:600;color:${FARG.text};white-space:nowrap;pointer-events:none;opacity:${troligt ? 0.8 : 1}`;
          kmChip.textContent = km != null ? `${Math.round(km)} km` : '–';
          const mid = geom && geom.length > 1 ? geom[Math.floor(geom.length / 2)] : [(prev.lng + o.lng) / 2, (prev.lat + o.lat) / 2]; // på vägen om geometri finns
          stopMarkersRef.current.push(new window.maplibregl.Marker({ element: kmChip, anchor: 'center' }).setLngLat(mid as [number, number]).addTo(map));
        }
      });
    }
    layoutMachines(); // klustring + etikettsynlighet speglar urvalet
  }, []);

  useEffect(() => {
    restyleSelection(); layoutLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMaskin, ruttVersion, forslag, restyleSelection, layoutLabels]);

  // Tryck på maskin → passa in maskin + alla kö-objekt EN gång (padding så allt ligger ovanför arket).
  // Rör sig aldrig igen förrän användaren zoomar/panorerar eller väljer annan maskin. Ryms allt redan: ingen rörelse.
  const fitSelRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    if (!selMaskin) { fitSelRef.current = null; return; }
    if (fitSelRef.current === selMaskin || ordnaRef.current) return; // redan inpassad, el. redigering äger kameran
    const f = forslag.get(selMaskin); if (!f) return;
    const pts: [number, number][] = [];
    if (f.koordinat) pts.push([f.koordinat.lng, f.koordinat.lat]); // markören (stammen)
    f.ko.forEach((p) => { if (p.objekt.lat != null && p.objekt.lng != null) pts.push([p.objekt.lng, p.objekt.lat]); });
    if (!pts.length) return;
    fitSelRef.current = selMaskin;
    const C = map.getContainer(); const W = C.clientWidth, H = C.clientHeight;
    const padT = 80, padSide = 40, padBot = Math.round(H * 0.42); // botten = arkets höjd (route ovanför)
    const inside = pts.every((p) => { const s = map.project(p); return s.x >= padSide && s.x <= W - padSide && s.y >= padT && s.y <= H - padBot; });
    if (inside) return; // ryms redan ovanför arket → rör inte kameran
    if (pts.length === 1) map.easeTo({ center: pts[0], zoom: Math.max(map.getZoom(), 12), duration: 500 });
    else { const b = new window.maplibregl.LngLatBounds(); pts.forEach((p) => b.extend(p)); map.fitBounds(b, { padding: { top: padT, left: padSide, right: padSide, bottom: padBot }, maxZoom: 14, duration: 500 }); }
  }, [selMaskin, forslag, mapStyleLoaded]);

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
    const koObjs = koIds.map((koId) => { const k = maskinKo.find((x) => x.id === koId); return k ? objekt.find((o) => o.id === k.objekt_id) ?? null : null; }).filter((o): o is OversiktObjekt => !!o);
    const S = selRef.current; // behåll förslagen efter kön på kartans rutt under drag
    const forslagObjs = S ? (forslagRef.current.get(S)?.ko ?? []).filter((p) => p.kalla === 'forslag').map((p) => p.objekt) : [];
    setKoPreview([...koObjs, ...forslagObjs]);
  }, [maskinKo, objekt]);
  // Redigeringsläge på/av: sätt preview, förhämta par-ben till km-cachen, krymp arket-fit på kartan.
  const hanteraOrdnaLage = useCallback((active: boolean) => {
    const map = mapRef.current;
    const f = selMaskin ? forslag.get(selMaskin) : null;
    if (!active || !f?.koordinat) { ordnaRef.current = false; setKoPreview(null); return; }
    ordnaRef.current = true; // hädanefter rör kartan sig inte av sig själv förrän Klar
    const koObj = f.ko.map((p) => p.objekt);
    setKoPreview(koObj);
    const punkter = [ruttStart(f)!, ...koObj.filter((o) => o.lat != null && o.lng != null).map((o) => ({ lat: o.lat!, lng: o.lng! }))];
    // Förhämta ALLA par-ben (väggeometri + km) så en ny drag-ordning kan rita riktig vägrutt direkt;
    // det som inte hunnit cachas ritas som rak grå tills släpp. Inga anrop sker sedan mitt i draget.
    (async () => { for (let i = 0; i < punkter.length; i++) for (let j = 0; j < punkter.length; j++) if (i !== j) await vagRuttCached(punkter[i], punkter[j]); setRuttVersion((v) => v + 1); })();
    if (map && punkter.length) {
      const b = new window.maplibregl.LngLatBounds(); punkter.forEach((p) => b.extend([p.lng, p.lat]));
      const h = mapContainerRef.current?.offsetHeight ?? 600;
      map.fitBounds(b, { padding: { top: 80, left: 50, right: 50, bottom: Math.round(h * 0.45) + 48 }, maxZoom: 14, duration: 500 });
    }
  }, [selMaskin, forslag, vagRuttCached]);
  useEffect(() => { ordnaRef.current = false; setKoPreview(null); setHighlightObjekt(null); }, [selMaskin]); // byte/stängning av maskin nollar preview + redigeringslås
  useEffect(() => { restyleSelection(); }, [koPreview, restyleSelection]); // rita om numren live

  // Highlight-prick för picker-raden under fingret. Panorerar in objektet BARA om det är dolt (bakom arket/utanför vyn).
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    if (highlightMarkerRef.current) { highlightMarkerRef.current.remove(); highlightMarkerRef.current = null; }
    if (!highlightObjekt) return;
    const o = objekt.find((x) => x.id === highlightObjekt); if (!o || o.lat == null || o.lng == null) return;
    const el = document.createElement('div'); el.className = 'puls';
    el.style.cssText = `width:30px;height:30px;border-radius:50%;background:rgba(10,132,255,0.3);border:3px solid ${FARG.bla};box-shadow:0 0 0 2px #fff,0 2px 10px rgba(0,0,0,0.45);pointer-events:none`;
    highlightMarkerRef.current = new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([o.lng, o.lat]).addTo(map);
    const C = map.getContainer(); const W = C.clientWidth, H = C.clientHeight; const s = map.project([o.lng, o.lat]);
    const doltBakomArk = s.x < 30 || s.x > W - 30 || s.y < 60 || s.y > H * 0.5; // synlig map-yta = ovanför ~halva skärmen (arket täcker nedre)
    if (doltBakomArk) map.easeTo({ center: [o.lng, o.lat], offset: [0, -Math.round(H * 0.22)], duration: 300 });
  }, [highlightObjekt, objekt, mapStyleLoaded]);

  // härlett
  const utanPosition = useMemo(() => aktivaMaskiner.filter((m) => !positions.get(m.maskin_id)?.koordinat), [aktivaMaskiner, positions]);
  const utanKoord = useMemo(() => objekt.filter((o) => (o.status === 'planerad' || STATUS_AKTIV.includes(o.status)) && (o.lat == null || o.lng == null)).length, [objekt]);
  const valt = selMaskin ? forslag.get(selMaskin) ?? null : null;
  const arForareVy = !!(isDriver && selMaskin && selMaskin === driverMaskinId);
  const objektValt = selObjekt ? objekt.find((o) => o.id === selObjekt) ?? null : null;
  const aktivaSkordare = useMemo(() => aktivaMaskiner.filter((m) => !arSkotare(m as MaskinRad)), [aktivaMaskiner]);

  // '+ Lägg till objekt'-väljaren: kandidater för vald maskin (highlightObjekt-state deklareras ovan).
  const laggKandidater = useMemo<LaggKand[]>(() => {
    if (!valt || !selMaskin) return [];
    const m = maskiner.find((x) => x.maskin_id === selMaskin);
    const skotare = arSkotare(m as MaskinRad);
    const klarT = (m as any)?.klarar_typ ?? null; const roll = (m as any)?.skotar_roll ?? null;
    const start = ruttStart(valt); const nuId = valt.nuObjekt?.id ?? null;
    const koByObjekt = new Map(maskinKo.map((k) => [k.objekt_id, k] as const));
    const rows: LaggKand[] = [];
    for (const o of objekt) {
      if (o.lat == null || o.lng == null || o.id === nuId || STATUS_AVSLUTADE.includes(o.status)) continue;
      let m3: number | null = null;
      if (skotare) {
        if (!rollMatcharTyp(roll, o.typ)) continue;
        const agg = o.vo_nummer ? skord[o.vo_nummer] : undefined;
        const backen = agg && agg.skordat > 0 ? paBackenKvar(agg.skordat, agg.skotat, agg.egenSkotning) : 0;
        if (!backen || backen <= 0) continue; // bara objekt med virke på backen
        m3 = backen;
      } else {
        if (o.status !== 'planerad' || !klararObjekt(klarT, o.typ)) continue; // planerade som klarar_typ
        m3 = o.volym_planerad ?? (o.volym || null);
      }
      const ko = koByObjekt.get(o.id);
      rows.push({ id: o.id, namn: o.namn, atgard: o.atgard || (o.typ === 'gallring' ? 'Gallring' : 'Slutavverkning'), m3, lat: o.lat, lng: o.lng, koMaskinNamn: ko ? (maskinVisningsnamn(maskiner.find((x) => x.maskin_id === ko.maskin_id)) || ko.maskin_id) : null });
    }
    const avst = (r: LaggKand) => start ? (legKmCache(start, { lat: r.lat, lng: r.lng }) ?? haversineKm(start, { lat: r.lat, lng: r.lng })) : Infinity; // väg om cachat, annars fågelväg
    return [...rows].sort((a, b) => avst(a) - avst(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valt, selMaskin, maskiner, objekt, skord, maskinKo, ruttVersion]);
  const laggKmTill = useCallback((k: LaggKand): number | null => { const f = selMaskin ? forslag.get(selMaskin) : null; const start = f ? ruttStart(f) : null; return start ? legKmCache(start, { lat: k.lat, lng: k.lng }) : null; }, [selMaskin, forslag, legKmCache]);
  const hanteraLaggLage = useCallback((active: boolean) => {
    if (!active) { setHighlightObjekt(null); return; }
    const f = selMaskin ? forslag.get(selMaskin) : null; const start = f ? ruttStart(f) : null; if (!start) return;
    const mal = laggKandidater.slice(0, 40).map((k) => ({ lat: k.lat, lng: k.lng })); // förhämta vägavstånd (väg-km + omsortering)
    (async () => { let n = 0; for (const t of mal) { await vagRuttCached(start, t); if (++n % 8 === 0) setRuttVersion((v) => v + 1); } setRuttVersion((v) => v + 1); })(); // bumpa i klump, inte per anrop
  }, [selMaskin, forslag, laggKandidater, vagRuttCached]);
  const valjLaggObjekt = useCallback((objektId: string) => { if (selMaskin) laggIKo(selMaskin, objektId); setHighlightObjekt(null); }, [selMaskin, laggIKo]);
  // Arkets km per ben (vald maskins fasta kö) ur rutt-cachen; miss → null ("–"). ruttVersion → uppdateras när ORS svarat.
  const selLegs = useMemo(() => {
    if (!valt?.koordinat) return [] as (number | null)[];
    const pts: ({ lat: number; lng: number } | null)[] = [ruttStart(valt), ...valt.ko.map((p) => (p.objekt.lat != null && p.objekt.lng != null ? { lat: p.objekt.lat, lng: p.objekt.lng } : null))];
    const out: (number | null)[] = [];
    for (let i = 1; i < pts.length; i++) out.push(legKmCache(pts[i - 1], pts[i]));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valt, ruttVersion, legKmCache]);

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
          legs={selLegs} skord={skord} warnings={warnings}
          telefon={arForareVy ? null : (telByMaskin[selMaskin!] ?? null)}
          forare={arForareVy}
          onClose={() => setSelMaskin(null)}
          onReorder={(ids) => skrivOrdning(selMaskin!, ids)}
          onOrdnaLage={hanteraOrdnaLage}
          onOrderChange={hanteraOrderChange}
          koRader={maskinKo.filter((k) => k.maskin_id === selMaskin).sort((a, b) => a.ordning - b.ordning)}
          kandidater={laggKandidater} kmTill={laggKmTill} onValjObjekt={valjLaggObjekt} onHighlight={setHighlightObjekt} onLaggLage={hanteraLaggLage}
        />
      )}

      {/* OBJEKT-ARK (förman tryckte på en prick) */}
      {!laddar && !fel && !valt && objektValt && (
        <ObjektArk o={objektValt} skord={skord} warn={warnings[objektValt.id]}
          skordare={aktivaSkordare.map((m) => ({ id: m.maskin_id, namn: maskinVisningsnamn(m) || m.maskin_id, koordinat: positions.get(m.maskin_id)?.koordinat ?? null, klararTyp: (m as any).klarar_typ ?? null }))}
          skotare={aktivaMaskiner.filter((m) => arSkotare(m as MaskinRad)).map((m) => ({ id: m.maskin_id, namn: maskinVisningsnamn(m) || m.maskin_id, skotarRoll: (m as any).skotar_roll ?? null }))}
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

function MaskinArk({ f, namn, legs, skord, warnings, telefon, forare, onClose, onReorder, onOrdnaLage, onOrderChange, koRader, kandidater, kmTill, onValjObjekt, onHighlight, onLaggLage }: {
  f: MaskinForslag; namn: string; legs: (number | null)[]; skord: Record<string, SkordAggV2>; warnings: Record<string, ObjWarn>;
  telefon: string | null; forare: boolean; onClose: () => void;
  onReorder: (orderedKoIds: string[]) => void; onOrdnaLage: (active: boolean) => void; onOrderChange: (koIds: string[]) => void; koRader: MaskinKoItem[];
  kandidater: LaggKand[]; kmTill: (k: LaggKand) => number | null; onValjObjekt: (objektId: string) => void; onHighlight: (objektId: string | null) => void; onLaggLage: (active: boolean) => void;
}) {
  const [ordnaLage, setOrdnaLage] = useState(false);
  const [laggLage, setLaggLage] = useState(false);
  const [sok, setSok] = useState('');
  const nuAgg = aggFor(f.nuObjekt, skord);
  const rollLabel = f.typ === 'skotare' ? 'skotare' : 'skördare';
  const nuKvar = f.nuObjekt && nuAgg && nuAgg.skordat > 0 ? paBackenKvar(nuAgg.skordat, nuAgg.skotat, nuAgg.egenSkotning) : null;
  const nuVarde = f.typ === 'skotare' && nuKvar != null ? `${fmt(nuKvar)} m³ kvar` : '';
  const nasta = f.ko[0]?.objekt ?? null;
  const koPoster = f.ko.filter((p) => p.kalla === 'ko');          // kö: numrerad 1,2,…, ordningsbar
  const forslagPoster = f.ko.filter((p) => p.kalla === 'forslag'); // automatikens förslag: dämpad, ej ordningsbar
  const kanOrdna = koPoster.length > 1;                            // 'Ändra ordning' gäller BARA kö-raderna
  const koIdForObjekt = (objId: string) => koRader.find((k) => k.objekt_id === objId)?.id ?? null;
  const hogerFor = (p: KoPost, i: number) => { const agg = aggFor(p.objekt, skord); const vol = volFor(f, p.objekt, agg); const km = legs[i]; return [vol != null ? `${fmt(vol)} m³` : null, km != null ? `${Math.round(km)} km` : '–'].filter(Boolean).join(' · '); };
  const dragRader = koPoster.map((p, i) => ({ koId: koIdForObjekt(p.objekt.id) || '', namn: p.objekt.namn, hoger: hogerFor(p, i) })).filter((r) => r.koId); // kö-rader (= f.ko[0..koPoster.length])

  const toggleOrdna = () => setOrdnaLage((v) => { const nv = !v; onOrdnaLage(nv); return nv; });
  const oppnaLagg = () => { setSok(''); setLaggLage(true); onLaggLage(true); };
  const stangLagg = () => { setLaggLage(false); onLaggLage(false); };
  const filtrerade = sok.trim() ? kandidater.filter((k) => k.namn.toLowerCase().includes(sok.trim().toLowerCase())) : kandidater;

  return (
    <div className="sheet-upp" style={{ ...SheetBas, ...((ordnaLage || laggLage) ? { maxHeight: '55vh', overflowY: 'auto' } : null) }}>
      <Grabber onClose={onClose} />
      {laggLage ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ ...TYP.rubrik }}>Lägg till objekt</div>
            <button onClick={stangLagg} style={{ background: 'none', border: 'none', color: FARG.bla, ...TYP.text, cursor: 'pointer', padding: 0 }}>Avbryt</button>
          </div>
          {kandidater.length > 8 && (
            <input value={sok} onChange={(e) => setSok(e.target.value)} placeholder="Sök objekt…" style={{ ...TYP.text, padding: `0 ${AVSTAND.m}px`, height: 44, boxSizing: 'border-box', borderRadius: RADIE.rad, border: '1px solid #48484a', background: FARG.upphojt, color: FARG.text, outline: 'none' }} />
          )}
          {filtrerade.length === 0 ? (
            <div style={{ ...TYP.meta, color: FARG.text2 }}>Inga objekt att lägga till.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtrerade.map((k) => {
                const iKo = !!k.koMaskinNamn; const km = kmTill(k);
                return (
                  <div key={k.id}
                    onPointerEnter={iKo ? undefined : () => onHighlight(k.id)}
                    onPointerLeave={iKo ? undefined : () => onHighlight(null)}
                    onClick={iKo ? undefined : () => { onValjObjekt(k.id); stangLagg(); }}
                    style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: AVSTAND.m, rowGap: 2, padding: `${AVSTAND.s}px`, borderRadius: RADIE.rad, background: FARG.upphojt, opacity: iKo ? 0.5 : 1, cursor: iKo ? 'default' : 'pointer', ...TYP.text, ...TNUM }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.namn}</div>
                    <div style={{ color: FARG.text2, whiteSpace: 'nowrap' }}>{km != null ? `${Math.round(km)} km` : '–'}</div>
                    <div style={{ ...TYP.meta, color: FARG.text2, gridColumn: '1 / 3' }}>{k.atgard}{k.m3 != null ? ` · ${fmt(k.m3)} m³` : ''}{iKo ? ` · i kö för ${k.koMaskinNamn}` : ''}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (<>
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

      {/* Kö (numrerad, ordningsbar) + Förslag (dämpad) */}
      {f.ko.length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr)', columnGap: AVSTAND.m, ...TYP.text }}><div style={{ color: FARG.text2 }}>Nästa</div><div style={{ color: FARG.text2 }}>inget planerat</div></div>
      ) : (ordnaLage && kanOrdna) ? (
        <ReorderLista rows={dragRader} onDrop={onReorder} onOrderChange={onOrderChange} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', columnGap: AVSTAND.m, rowGap: AVSTAND.s, ...TYP.text, ...TNUM }}>
          {f.ko.map((p, i) => {
            const v = varnText(warnings[p.objekt.id]); const meta = rowMeta(aggFor(p.objekt, skord));
            const forstaForslag = p.kalla === 'forslag' && i === koPoster.length && koPoster.length > 0; // 'Förslag'-rubrik bara när kö finns ovanför
            return (
              <React.Fragment key={p.objekt.id}>
                {forstaForslag && <div style={{ ...TYP.micro, color: FARG.text2, gridColumn: '1 / 4', marginTop: AVSTAND.xs }}>Förslag</div>}
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
        <div style={{ display: 'flex', gap: AVSTAND.s, flexWrap: 'wrap' }}>
          {kanOrdna && (
            <button onClick={toggleOrdna} style={{ ...KNAPP_LITEN, borderColor: ordnaLage ? FARG.bla : '#48484a', color: ordnaLage ? FARG.bla : FARG.text }}>{ordnaLage ? 'Klar' : 'Ändra ordning'}</button>
          )}
          <button onClick={oppnaLagg} style={{ ...KNAPP_LITEN, borderColor: '#48484a', color: FARG.text }}>+ Lägg till objekt</button>
        </div>
        <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.xs }}>
          {telefon && <a href={`tel:${telefon}`} style={KNAPP}><SvgRing />Ring</a>}
          {mapsHref(nasta) && <a href={mapsHref(nasta)!} target="_blank" rel="noopener noreferrer" style={KNAPP}><SvgVag />Vägbeskrivning</a>}
        </div>
      </>)}
      </>)}
    </div>
  );
}

// ══════════════════════════════ OBJEKT-ARK ═══════════════════════════════════
function klararObjekt(klararTyp: string | null, typ: string | undefined): boolean {
  const k = (klararTyp || 'bada').toLowerCase();
  return k === 'bada' || k === typ; // 'bada' klarar allt, annars måste typ matcha
}
// Skotarens roll mot objekttyp (speglar nasta-v2 rollMatchar): 'allt' tar allt, annars typ===roll.
function rollMatcharTyp(roll: string | null, typ: string | undefined): boolean {
  if (roll === 'allt') return true;
  return (roll === 'slutavverkning' || roll === 'gallring') && roll === typ;
}
function ObjektArk({ o, skord, warn, skordare, skotare, koRad, maskinNamn, maskinKo, forare, onLaggIKo, onFlytta, onTaBort, onClose }: {
  o: OversiktObjekt; skord: Record<string, SkordAggV2>; warn: ObjWarn | undefined;
  skordare: { id: string; namn: string; koordinat: { lat: number; lng: number } | null; klararTyp: string | null }[];
  skotare: { id: string; namn: string; skotarRoll: string | null }[];
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
  // Lägg-i-kö-kandidater: skördare (klarar_typ) + skotare (skotar_roll mot objekttyp).
  const eligible: { id: string; namn: string }[] = [
    ...skordare.filter((s) => klararObjekt(s.klararTyp, o.typ)).map((s) => ({ id: s.id, namn: s.namn })),
    ...skotare.filter((s) => rollMatcharTyp(s.skotarRoll, o.typ)).map((s) => ({ id: s.id, namn: s.namn })),
  ];

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
        ) : <div style={{ ...TYP.meta, color: FARG.text2 }}>Ingen maskin passar den här åtgärden.</div>
      )}
    </div>
  );
}
