'use client';

// Kopplar "Ritad" (det femte kartlagret) till planeringssidans karta: planeringsvyn, körvyn, skotarläget och maskinläget.
// Lagren och reglerna: lib/ritadKarta/lager.ts. Skogen: lib/ritadKarta/bygg.ts (samma som /karta-ritad).
//
//   • Inget hämtas och inget läggs till förrän någon väljer Ritad.
//   • Grunden (bakgrund, terrängskuggning, vatten, vägar, hus) läggs till direkt — också utan objekt.
//   • Skogen hämtas per objekt en gång per session och läggs ovanpå. Området: Vidas traktgräns, annars planerarens egen, annars 1 km runt
//     objektets punkt (lib/ritadKarta/omrade.ts). Faller laserdatan syns grunden ändå och raden i + › Lager säger varför. Aldrig en gissad skog.
//   • Kartan är platt överallt (inga 3D-kronor): skogen ligger under allt man planerar och kör efter.

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { lasVidaGrans } from '@/lib/egenkontrollOrigo';
import { hamtaStammoln } from '@/lib/egenkontroll';
import type { Rutnat } from '@/lib/ritadKarta/skog';
import { omradeNyckel, valjOmrade, type Omrade, type OmradesKalla, type Ring } from '@/lib/ritadKarta/omrade';
import { byggRitat, type Ritat } from '@/lib/ritadKarta/bygg';
import { blottMedTrakt, BLOTT_MONSTER, BLOTT_STRECK, BRANT_MONSTER, BRANT_LITE_MONSTER, brantLiteBild, RITAD_DOLJ_FYLLNING, blottLager, blottMonsterBild, RITAD_ID, RITAD_KALLA, RITAD_LAGER, RITAD_OSM_VAG_ID, brantLager, grundKallor, grundLager, ritadSynlighet } from '@/lib/ritadKarta/lager';
import { franBase64, type MarkRutnat } from '@/lib/ritadKarta/mark';
import { snedstreckBild } from '@/lib/ytaStil';
import { medReserv } from '@/lib/ritadKarta/reserv';
import { OSM_TILL_ZOOM, arVagFC, type VagFC } from '@/lib/ritadKarta/vagar';
import { arDikeFC, type DikeFC } from '@/lib/ritadKarta/diken';

export type RitadStatus =
  | { typ: 'av' }
  | { typ: 'inget-objekt' }
  | { typ: 'laser' }
  | { typ: 'klar'; ar: number | null; kalla: OmradesKalla; saknas: string[] }
  | { typ: 'ingen-grans' }
  | { typ: 'fel'; text: string };

type Svar = { typ: 'klar'; ritat: Ritat; vagar: VagFC | null; diken: DikeFC | null; ar: number | null; kalla: OmradesKalla; saknas: string[] } | { typ: 'ingen-grans' } | { typ: 'fel'; text: string };
type Objektfakta = { typ: 'ok'; vida: Ring[] | null; vo: string | null; slutavverkning: boolean } | { typ: 'fel'; text: string };

// En gång per objekt och session: Vidas gräns och laserdatan ändras inte medan man kör. Ett fel cachas aldrig (nästa öppning försöker igen).
const faktaCache = new Map<string, Promise<Objektfakta>>();
const laserCache = new Map<string, Promise<Svar>>();

// Allt som hämtas går via lib/ritadKarta/reserv: nät först, det som sparats i enheten när nätet inte går — Ritad fungerar utan täckning.
type FaktaOk = Extract<Objektfakta, { typ: 'ok' }>;

async function hamtaFaktaNat(objektId: string): Promise<{ ok: true; varde: FaktaOk } | { ok: false }> {
  const { data: o, error } = await supabase.from('objekt').select('vo_nummer, typ').eq('id', objektId).maybeSingle();
  if (error) return { ok: false };
  const g = await lasVidaGrans(supabase as any, objektId);
  if (g.typ === 'fel') return { ok: false };
  return {
    ok: true,
    varde: {
      typ: 'ok',
      vida: g.typ === 'ok' && g.ringar?.length ? (g.ringar as Ring[]) : null,
      vo: (o as any)?.vo_nummer ?? null,
      slutavverkning: (o as any)?.typ === 'slutavverkning',
    },
  };
}

async function hamtaFakta(objektId: string): Promise<Objektfakta> {
  const r = await medReserv<FaktaOk>(`fakta/${objektId}`, () => hamtaFaktaNat(objektId));
  return r ? r.varde : { typ: 'fel', text: 'Kunde inte läsa traktgränsen' };
}

/** Rådata för ett område: laser, blött/brant och stammarna — hämtade (eller ur det sparade) men inte ritade. Också bakgrundsnedladdningen använder den. */
async function hamtaRadata(f: FaktaOk, omrade: Omrade): Promise<{ laser: Rutnat | null; laserFel: string; mark: any | null; stammar: { lat: number; lng: number }[]; vagar: VagFC | null; diken: DikeFC | null }> {
  const nyck = omradeNyckel(omrade);
  const kropp = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ringar: omrade.ringar }) };
  let laserFel = 'Kunde inte hämta laserdatan';
  const jsonFran = async (url: string, felText?: (j: any) => void) => {
    const r = await fetch(url, kropp);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) { felText?.(j); return { ok: false as const }; }
    return { ok: true as const, varde: j };
  };
  // Bara en slutavverkning ritas som avverkad: i en gallring står skogen kvar.
  const stammarP = f.slutavverkning && f.vo
    ? medReserv<{ lat: number; lng: number }[]>(`stammar/${f.vo}`, async () => ({ ok: true, varde: (await hamtaStammoln(f.vo)).punkter }))
    : Promise.resolve(null);
  const [laser, mark, stammar, vagar, diken] = await Promise.all([
    medReserv<Rutnat>(`laser/${nyck}`, () => jsonFran('/api/ritad-karta/laser', (j) => { if (j?.error) laserFel = j.error; })),
    medReserv<any>(`mark/${nyck}`, () => jsonFran('/api/ritad-karta/mark')),
    stammarP,
    // Trafikverkets vägar (lib/ritadKarta/vagar): faller de syns OpenStreetMaps vägar ändå.
    medReserv<VagFC>(`vagar/${nyck}`, async () => {
      const r = await jsonFran('/api/ritad-karta/vagar');
      return r.ok && arVagFC(r.varde) ? r : { ok: false };
    }),
    // Dikena (lib/ritadKarta/diken): faller de ritas resten ändå.
    medReserv<DikeFC>(`diken/${nyck}`, async () => {
      const r = await jsonFran('/api/ritad-karta/diken');
      return r.ok && arDikeFC(r.varde) ? r : { ok: false };
    }),
  ]);
  return { laser: laser?.varde ?? null, laserFel, mark: mark?.varde ?? null, stammar: stammar?.varde ?? [], vagar: vagar && arVagFC(vagar.varde) ? vagar.varde : null, diken: diken && arDikeFC(diken.varde) ? diken.varde : null };
}

async function hamtaSkog(f: FaktaOk, omrade: Omrade): Promise<Svar> {
  const d = await hamtaRadata(f, omrade);
  if (!d.laser) return { typ: 'fel', text: d.laserFel };
  const mark = await tolkaMark(d.mark);
  const saknas = [...mark.saknas, ...(d.vagar ? [] : ['Trafikverkets vägar']), ...(d.diken ? [] : ['diken'])];
  return { typ: 'klar', ritat: byggRitat(d.laser, d.stammar, mark.rutnat, mark.skugga), vagar: d.vagar, diken: d.diken, ar: d.laser.ar ?? null, kalla: omrade.kalla, saknas };
}

/**
 * Bakgrundsnedladdningen: hämta allt Ritad behöver för objektet till enheten, utan att rita något. Ytan = Vidas traktgräns, annars objektets
 * punkt (planerarens egen gräns finns bara på sidan). `true` = hämtat (eller fanns), `false` = gick inte.
 */
export async function forladdaRitad(objektId: string, punkt: { lat: number; lng: number } | null): Promise<boolean> {
  const f = await hamtaFakta(objektId);
  if (f.typ !== 'ok') return false;
  const omrade = valjOmrade({ vida: f.vida, egna: null, punkt });
  if (!omrade) return false;
  const d = await hamtaRadata(f, omrade);
  return !!d.laser;
}

/** Blött, brant och skuggning (lib/ritadKarta/mark.ts) ur serverns svar. Saknas något ritas skogen ändå och `saknas` säger vad. */
export async function tolkaMark(j: any | null): Promise<{ rutnat: MarkRutnat | null; skugga: CanvasImageSource | null; saknas: string[] }> {
  if (!j) return { rutnat: null, skugga: null, saknas: ['blött och brant'] };
  try {
    const rutnat: MarkRutnat = { minX: j.minX, maxY: j.maxY, bredd: j.bredd, hojd: j.hojd, rutaM: j.rutaM, fukt: franBase64(j.fukt), lutning: franBase64(j.lutning) };
    let skugga: CanvasImageSource | null = null;
    if (j.skugga) {
      const im = new Image();
      im.src = j.skugga;
      try { await im.decode(); skugga = im; } catch { /* utan skuggning */ }
    }
    const saknas: string[] = [];
    const fel: string[] = Array.isArray(j.fel) ? j.fel : [];
    if (fel.includes('markfuktighet')) saknas.push(j.fuktFel ? `blött (${j.fuktFel})` : 'blött');
    if (fel.includes('lutning')) saknas.push('brant');
    if (!skugga) saknas.push('skuggning');
    return { rutnat, skugga, saknas };
  } catch {
    return { rutnat: null, skugga: null, saknas: ['blött och brant'] };
  }
}

function cachad<T extends { typ: string }>(cache: Map<string, Promise<T>>, nyckel: string, hamta: () => Promise<T>, vidFel: T): Promise<T> {
  let p = cache.get(nyckel);
  if (!p) {
    p = hamta().catch(() => vidFel);
    cache.set(nyckel, p);
    p.then((s) => { if (s.typ === 'fel') cache.delete(nyckel); });
  }
  return p;
}


export function laggTillGrund(m: any) {
  for (const [id, k] of Object.entries(grundKallor())) if (!m.getSource(id)) m.addSource(id, k);
  for (const l of grundLager()) if (!m.getLayer(l.id)) m.addLayer({ ...l, layout: { ...(l.layout ?? {}), visibility: 'none' } });
  if (!m.hasImage?.(BRANT_MONSTER)) m.addImage?.(BRANT_MONSTER, snedstreckBild('fara'));
  if (!m.getSource(RITAD_KALLA.brant)) m.addSource(RITAD_KALLA.brant, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  if (!m.hasImage?.(BRANT_LITE_MONSTER)) m.addImage?.(BRANT_LITE_MONSTER, brantLiteBild());
  for (const l of brantLager()) if (!m.getLayer(l.id)) m.addLayer({ ...l, layout: { visibility: 'none' } });
  if (!m.hasImage?.(BLOTT_MONSTER.gles)) m.addImage?.(BLOTT_MONSTER.gles, blottMonsterBild(BLOTT_STRECK.gles));
  if (!m.hasImage?.(BLOTT_MONSTER.tat)) m.addImage?.(BLOTT_MONSTER.tat, blottMonsterBild(BLOTT_STRECK.tat));
  if (!m.getSource(RITAD_KALLA.blott)) m.addSource(RITAD_KALLA.blott, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  for (const l of blottLager()) if (!m.getLayer(l.id)) m.addLayer({ ...l, layout: { visibility: 'none' } });
}

const TOM = { type: 'FeatureCollection', features: [] };
export function sattSkog(m: any, ritat: Ritat | null, vagar: VagFC | null, diken: DikeFC | null, paint: Record<string, number>, trakt?: [number, number][][] | null) {
  m.getSource(RITAD_KALLA.nvdb)?.setData(vagar ?? TOM);
  m.getSource(RITAD_KALLA.diken)?.setData(diken ?? TOM);
  // Finns Trafikverkets vägar ritas OpenStreetMaps bara längre ut än OSM_TILL_ZOOM — annars blir samma väg två parallella vägar.
  const medNvdb = !!vagar?.features.length;
  for (const id of RITAD_OSM_VAG_ID) if (m.getLayer(id)) m.setLayerZoomRange?.(id, 0, medNvdb ? OSM_TILL_ZOOM : 24);
  if (m.getLayer(RITAD_ID.skog)) m.removeLayer(RITAD_ID.skog);
  if (m.getSource(RITAD_KALLA.skog)) m.removeSource(RITAD_KALLA.skog);
  m.getSource(RITAD_KALLA.brant)?.setData(ritat ? ritat.brant : { type: 'FeatureCollection', features: [] });
  m.getSource(RITAD_KALLA.blott)?.setData(ritat ? blottMedTrakt(ritat.blott, trakt) : { type: 'FeatureCollection', features: [] });
  if (!ritat) return;
  m.addSource(RITAD_KALLA.skog, { type: 'image', url: ritat.url, coordinates: ritat.horn });
  m.addLayer({ id: RITAD_ID.skog, type: 'raster', source: RITAD_KALLA.skog, paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0, ...paint }, layout: { visibility: 'none' } });
}

export function useRitadKarta({ map, klar, vald, objektId, skogPaint, egnaRingar, punkt }: {
  map: any | null; klar: boolean; vald: boolean; objektId: string | null; skogPaint: Record<string, number>;
  /** Traktgränser planeraren ritat själv ([lng, lat][]); används när Vida saknar traktgräns. */
  egnaRingar?: Ring[] | null;
  /** Objektets punkt; ruta runt den när ingen gräns finns. */
  punkt?: { lat: number; lng: number } | null;
}): RitadStatus {
  const [svar, setSvar] = useState<{ id: string; svar: Svar } | null>(null);
  const [laddar, setLaddar] = useState<string | null>(null);
  const [grundKlar, setGrundKlar] = useState(false);
  const ritatPaKartan = useRef<string | null>(null);
  const paintRef = useRef(skogPaint);
  const traktRef = useRef<[number, number][][] | null>(null);
  paintRef.current = skogPaint;

  // Grunden: först när Ritad väljs.
  useEffect(() => {
    if (!map || !klar || !vald || grundKlar) return;
    try { laggTillGrund(map); setGrundKlar(true); } catch (e) { console.warn('[ritad] kunde inte lägga grunden', e); }
  }, [map, klar, vald, grundKlar]);

  // Reservområdet som en stabil nyckel: effekten körs bara om när gränsen/punkten faktiskt ändras.
  const egnaRef = useRef(egnaRingar); egnaRef.current = egnaRingar;
  const punktRef = useRef(punkt); punktRef.current = punkt;
  const reservNyckel = useMemo(() => {
    const o = valjOmrade({ vida: null, egna: egnaRingar, punkt });
    return o ? omradeNyckel(o) : '';
  }, [egnaRingar, punkt]);

  // Skogen: hämtas när Ritad är vald och ett objekt är öppet.
  useEffect(() => {
    if (!vald || !objektId) return;
    let stopp = false;
    setLaddar(objektId);
    const klart = (s: Svar) => { if (!stopp) { setSvar({ id: objektId, svar: s }); setLaddar(null); } };
    cachad(faktaCache, objektId, () => hamtaFakta(objektId), { typ: 'fel', text: 'Kunde inte läsa traktgränsen' } as Objektfakta).then((f) => {
      if (stopp) return;
      if (f.typ === 'fel') return klart(f);
      const omrade = valjOmrade({ vida: f.vida, egna: egnaRef.current, punkt: punktRef.current });
      if (!omrade) return klart({ typ: 'ingen-grans' });
      traktRef.current = omrade.kalla === 'punkt' ? null : omrade.ringar;   // blött tonas utanför trakten — inte runt en gissad ruta
      cachad(laserCache, objektId + '|' + omradeNyckel(omrade), () => hamtaSkog(f, omrade), { typ: 'fel', text: 'Kunde inte hämta laserdatan' } as Svar).then(klart);
    });
    return () => { stopp = true; };
  }, [vald, objektId, reservNyckel]);

  // Lägg skogen på kartan (eller ta bort den när objektet byts).
  const ritat = svar && svar.id === objektId && svar.svar.typ === 'klar' ? svar.svar.ritat : null;
  const vagarPaKartan = svar && svar.id === objektId && svar.svar.typ === 'klar' ? svar.svar.vagar : null;
  const dikenPaKartan = svar && svar.id === objektId && svar.svar.typ === 'klar' ? svar.svar.diken : null;
  const nyckel = ritat && svar?.svar.typ === 'klar' ? `${objektId}|${svar.svar.kalla}|${svar.svar.ar}|${svar.svar.ritat.url.length}|${vagarPaKartan?.features.length ?? -1}|${dikenPaKartan?.features.length ?? -1}` : null;
  useEffect(() => {
    if (!map || !grundKlar) return;
    if (ritatPaKartan.current === nyckel) return;
    try { sattSkog(map, ritat, vagarPaKartan, dikenPaKartan, paintRef.current, traktRef.current); ritatPaKartan.current = nyckel; } catch (e) { console.warn('[ritad] kunde inte rita skogen', e); }
  }, [map, grundKlar, nyckel, ritat, vagarPaKartan, dikenPaKartan]);

  // Reglaget Dämpad ↔ Skarp gäller skogsbilden.
  useEffect(() => {
    if (!map || !map.getLayer?.(RITAD_ID.skog)) return;
    for (const [k, v] of Object.entries(skogPaint)) { try { map.setPaintProperty(RITAD_ID.skog, k, v); } catch { /* */ } }
  }, [map, skogPaint, nyckel]);

  // Synligheten — körvyns whitelist släpper igenom RITAD_KORVY_LAGER (page.tsx), så den här effekten kan sätta allt.
  useEffect(() => {
    if (!map || !grundKlar) return;
    const syn = ritadSynlighet({ vald });
    for (const id of RITAD_LAGER) {
      try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', syn[id] ? 'visible' : 'none'); } catch { /* */ }
    }
  }, [map, grundKlar, vald, nyckel]);

  // Planeringens röda tona över trakten släcks medan Ritad är vald (RITAD_DOLJ_FYLLNING); det ursprungliga värdet sätts tillbaka.
  const fyllningRef = useRef<Map<string, unknown>>(new Map());
  useEffect(() => {
    if (!map || !klar) return;
    for (const id of RITAD_DOLJ_FYLLNING) {
      try {
        if (!map.getLayer?.(id)) continue;
        if (vald) {
          if (!fyllningRef.current.has(id)) fyllningRef.current.set(id, map.getPaintProperty(id, 'fill-opacity'));
          map.setPaintProperty(id, 'fill-opacity', 0);
        } else if (fyllningRef.current.has(id)) {
          map.setPaintProperty(id, 'fill-opacity', fyllningRef.current.get(id));
          fyllningRef.current.delete(id);
        }
      } catch { /* lagret borta */ }
    }
  }, [map, klar, vald]);

  if (!vald) return { typ: 'av' };
  if (!objektId) return { typ: 'inget-objekt' };
  if (laddar === objektId || !svar || svar.id !== objektId) return { typ: 'laser' };
  const s = svar.svar;
  return s.typ === 'klar' ? { typ: 'klar', ar: s.ar, kalla: s.kalla, saknas: s.saknas } : s;
}

/** Raden under "Ritad" i + › Lager: vad som syns, i ord. */
export function ritadStatusText(s: RitadStatus): string {
  switch (s.typ) {
    case 'laser': return 'Ritar skogen …';
    case 'klar': {
      let t = s.ar ? `Skogen ur laserskanningen ${s.ar}` : 'Skogen ur laserskanningen';
      if (s.kalla === 'egen') t += ' · runt din traktgräns';
      if (s.kalla === 'punkt') t += ' · 1 km runt objektet (ingen traktgräns)';
      if (s.saknas?.length) t += ` · ${s.saknas.join(', ')} kunde inte hämtas`;
      return t;
    }
    case 'ingen-grans': return 'Objektet saknar traktgräns och position — bara vägar och vatten';
    case 'fel': return `${s.text} — bara vägar och vatten`;
    case 'inget-objekt': return 'Skogen ritas när ett objekt är öppet';
    default: return 'Skogen ritad ur laserdatan';
  }
}
