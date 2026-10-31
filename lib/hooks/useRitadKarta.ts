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
import { byggRitat, tradData, type Ritat } from '@/lib/ritadKarta/bygg';
import { RITAD_ID, RITAD_KALLA, RITAD_LAGER, grundKallor, grundLager, ritadSynlighet, tradLager } from '@/lib/ritadKarta/lager';
import { TRAD_FARG, ritaGran } from '@/lib/ritadKarta/stil';

export type RitadStatus =
  | { typ: 'av' }
  | { typ: 'inget-objekt' }
  | { typ: 'laser' }
  | { typ: 'klar'; ar: number | null; kalla: OmradesKalla }
  | { typ: 'ingen-grans' }
  | { typ: 'fel'; text: string };

type Svar = { typ: 'klar'; ritat: Ritat; ar: number | null; kalla: OmradesKalla } | { typ: 'ingen-grans' } | { typ: 'fel'; text: string };
type Objektfakta = { typ: 'ok'; vida: Ring[] | null; vo: string | null; slutavverkning: boolean } | { typ: 'fel'; text: string };

// En gång per objekt och session: Vidas gräns och laserdatan ändras inte medan man kör. Ett fel cachas aldrig (nästa öppning försöker igen).
const faktaCache = new Map<string, Promise<Objektfakta>>();
const laserCache = new Map<string, Promise<Svar>>();

async function hamtaFakta(objektId: string): Promise<Objektfakta> {
  const { data: o, error } = await supabase.from('objekt').select('vo_nummer, typ').eq('id', objektId).maybeSingle();
  if (error) return { typ: 'fel', text: 'Kunde inte läsa objektet' };
  const g = await lasVidaGrans(supabase as any, objektId);
  if (g.typ === 'fel') return { typ: 'fel', text: 'Kunde inte läsa traktgränsen' };
  return {
    typ: 'ok',
    vida: g.typ === 'ok' && g.ringar?.length ? (g.ringar as Ring[]) : null,
    vo: (o as any)?.vo_nummer ?? null,
    slutavverkning: (o as any)?.typ === 'slutavverkning',
  };
}

async function hamtaSkog(f: Extract<Objektfakta, { typ: 'ok' }>, omrade: Omrade): Promise<Svar> {
  let stammar: { lat: number; lng: number }[] = [];
  // Bara en slutavverkning ritas som avverkad: i en gallring står skogen kvar.
  if (f.slutavverkning && f.vo) {
    try { stammar = (await hamtaStammoln(f.vo)).punkter; } catch { /* utan stammar ritas inget avverkat */ }
  }
  const r = await fetch('/api/ritad-karta/laser', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ringar: omrade.ringar }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { typ: 'fel', text: (j as any)?.error || 'Kunde inte hämta laserdatan' };
  const rn = j as Rutnat;
  return { typ: 'klar', ritat: byggRitat(rn, stammar), ar: rn.ar ?? null, kalla: omrade.kalla };
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

const tom = { type: 'FeatureCollection' as const, features: [] as any[] };

function laggTillGrund(m: any) {
  for (const [id, k] of Object.entries(grundKallor())) if (!m.getSource(id)) m.addSource(id, k);
  for (const [k, f] of Object.entries(TRAD_FARG)) { const id = `rk-gran-${k}`; if (!m.hasImage?.(id)) { const im = ritaGran(f); if (im) m.addImage(id, im, { pixelRatio: 2 }); } }
  for (const l of grundLager()) if (!m.getLayer(l.id)) m.addLayer({ ...l, layout: { ...(l.layout ?? {}), visibility: 'none' } });
  if (!m.getSource(RITAD_KALLA.trad)) m.addSource(RITAD_KALLA.trad, { type: 'geojson', data: tom });
  if (!m.getLayer(RITAD_ID.trad)) { const t = tradLager(); m.addLayer({ ...t, layout: { ...t.layout, visibility: 'none' } }); }
}

function sattSkog(m: any, ritat: Ritat | null, paint: Record<string, number>) {
  if (m.getLayer(RITAD_ID.skog)) m.removeLayer(RITAD_ID.skog);
  if (m.getSource(RITAD_KALLA.skog)) m.removeSource(RITAD_KALLA.skog);
  m.getSource(RITAD_KALLA.trad)?.setData(ritat ? tradData(ritat) : tom);
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
      cachad(laserCache, objektId + '|' + omradeNyckel(omrade), () => hamtaSkog(f, omrade), { typ: 'fel', text: 'Kunde inte hämta laserdatan' } as Svar).then(klart);
    });
    return () => { stopp = true; };
  }, [vald, objektId, reservNyckel]);

  // Lägg skogen på kartan (eller ta bort den när objektet byts).
  const ritat = svar && svar.id === objektId && svar.svar.typ === 'klar' ? svar.svar.ritat : null;
  const nyckel = ritat && svar?.svar.typ === 'klar' ? `${objektId}|${svar.svar.kalla}|${svar.svar.ar}|${svar.svar.ritat.url.length}` : null;
  useEffect(() => {
    if (!map || !grundKlar) return;
    if (ritatPaKartan.current === nyckel) return;
    try { sattSkog(map, ritat, paintRef.current); ritatPaKartan.current = nyckel; } catch (e) { console.warn('[ritad] kunde inte rita skogen', e); }
  }, [map, grundKlar, nyckel, ritat]);

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

  if (!vald) return { typ: 'av' };
  if (!objektId) return { typ: 'inget-objekt' };
  if (laddar === objektId || !svar || svar.id !== objektId) return { typ: 'laser' };
  const s = svar.svar;
  return s.typ === 'klar' ? { typ: 'klar', ar: s.ar, kalla: s.kalla } : s;
}

/** Raden under "Ritad" i + › Lager: vad som syns, i ord. */
export function ritadStatusText(s: RitadStatus): string {
  switch (s.typ) {
    case 'laser': return 'Ritar skogen …';
    case 'klar': {
      const bas = s.ar ? `Skogen ur laserskanningen ${s.ar}` : 'Skogen ur laserskanningen';
      if (s.kalla === 'egen') return `${bas} · runt din traktgräns`;
      if (s.kalla === 'punkt') return `${bas} · 1 km runt objektet (ingen traktgräns)`;
      return bas;
    }
    case 'ingen-grans': return 'Objektet saknar traktgräns och position — bara vägar och vatten';
    case 'fel': return `${s.text} — bara vägar och vatten`;
    case 'inget-objekt': return 'Skogen ritas när ett objekt är öppet';
    default: return 'Skogen ritad ur laserdatan';
  }
}
