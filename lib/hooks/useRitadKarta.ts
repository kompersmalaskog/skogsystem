'use client';

// Kopplar "Ritad" (det femte kartlagret) till planeringssidans karta: planeringsvyn, körvyn, skotarläget och maskinläget.
// Lagren och reglerna: lib/ritadKarta/lager.ts. Skogen: lib/ritadKarta/bygg.ts (samma som /karta-ritad).
//
//   • Inget hämtas och inget läggs till förrän någon väljer Ritad.
//   • Grunden (bakgrund, terrängskuggning, vatten, vägar, hus) läggs till direkt — också utan objekt.
//   • Skogen hämtas per objekt (laserdatan runt Vidas traktgräns) en gång per session och läggs ovanpå. Saknas traktgränsen eller laserdatan
//     syns grunden ändå, och status säger varför (raden i + › Lager). Aldrig en gissad skog.
//   • Körvyn är platt (inga 3D-kronor); i planeringen står skogen upp när kartan lutas.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { lasVidaGrans } from '@/lib/egenkontrollOrigo';
import { hamtaStammoln } from '@/lib/egenkontroll';
import type { Rutnat } from '@/lib/ritadKarta/skog';
import { byggRitat, kronorData, tradData, type Ritat } from '@/lib/ritadKarta/bygg';
import { RITAD_ID, RITAD_KALLA, RITAD_LAGER, arLutad, grundKallor, grundLager, kronorLager, ritadSynlighet, tradLager } from '@/lib/ritadKarta/lager';
import { TRAD_FARG, ritaGran } from '@/lib/ritadKarta/stil';

export type RitadStatus =
  | { typ: 'av' }
  | { typ: 'inget-objekt' }
  | { typ: 'laser' }
  | { typ: 'klar'; ar: number | null }
  | { typ: 'ingen-grans' }
  | { typ: 'fel'; text: string };

type Svar = { typ: 'klar'; ritat: Ritat; ar: number | null } | { typ: 'ingen-grans' } | { typ: 'fel'; text: string };

// En gång per objekt och session: laserdatan ändras inte medan man kör.
const cache = new Map<string, Promise<Svar>>();

async function hamtaSkog(objektId: string): Promise<Svar> {
  const { data: o, error } = await supabase.from('objekt').select('vo_nummer, typ').eq('id', objektId).maybeSingle();
  if (error) return { typ: 'fel', text: 'Kunde inte läsa objektet' };
  const g = await lasVidaGrans(supabase as any, objektId);
  if (g.typ === 'fel') return { typ: 'fel', text: 'Kunde inte läsa traktgränsen' };
  if (g.typ !== 'ok' || !g.ringar?.length) return { typ: 'ingen-grans' };
  let stammar: { lat: number; lng: number }[] = [];
  // Bara en slutavverkning ritas som avverkad: i en gallring står skogen kvar.
  if ((o as any)?.typ === 'slutavverkning' && (o as any)?.vo_nummer) {
    try { stammar = (await hamtaStammoln((o as any).vo_nummer)).punkter; } catch { /* utan stammar ritas inget avverkat */ }
  }
  const r = await fetch('/api/ritad-karta/laser', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ringar: g.ringar }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { typ: 'fel', text: (j as any)?.error || 'Kunde inte hämta laserdatan' };
  const rn = j as Rutnat;
  return { typ: 'klar', ritat: byggRitat(rn, stammar), ar: rn.ar ?? null };
}

const tom = { type: 'FeatureCollection' as const, features: [] as any[] };

function laggTillGrund(m: any) {
  for (const [id, k] of Object.entries(grundKallor())) if (!m.getSource(id)) m.addSource(id, k);
  for (const [k, f] of Object.entries(TRAD_FARG)) { const id = `rk-gran-${k}`; if (!m.hasImage?.(id)) { const im = ritaGran(f); if (im) m.addImage(id, im, { pixelRatio: 2 }); } }
  for (const l of grundLager()) if (!m.getLayer(l.id)) m.addLayer({ ...l, layout: { ...(l.layout ?? {}), visibility: 'none' } });
  if (!m.getSource(RITAD_KALLA.trad)) m.addSource(RITAD_KALLA.trad, { type: 'geojson', data: tom });
  if (!m.getSource(RITAD_KALLA.kronor)) m.addSource(RITAD_KALLA.kronor, { type: 'geojson', data: tom });
  if (!m.getLayer(RITAD_ID.kronor)) m.addLayer({ ...kronorLager(), layout: { visibility: 'none' } });
  if (!m.getLayer(RITAD_ID.trad)) { const t = tradLager(); m.addLayer({ ...t, layout: { ...t.layout, visibility: 'none' } }); }
}

function sattSkog(m: any, ritat: Ritat | null, paint: Record<string, number>) {
  if (m.getLayer(RITAD_ID.skog)) m.removeLayer(RITAD_ID.skog);
  if (m.getSource(RITAD_KALLA.skog)) m.removeSource(RITAD_KALLA.skog);
  m.getSource(RITAD_KALLA.trad)?.setData(ritat ? tradData(ritat) : tom);
  m.getSource(RITAD_KALLA.kronor)?.setData(ritat ? kronorData(ritat) : tom);
  if (!ritat) return;
  m.addSource(RITAD_KALLA.skog, { type: 'image', url: ritat.url, coordinates: ritat.horn });
  m.addLayer({ id: RITAD_ID.skog, type: 'raster', source: RITAD_KALLA.skog, paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0, ...paint }, layout: { visibility: 'none' } });
}

export function useRitadKarta({ map, klar, vald, korvy, objektId, skogPaint }: {
  map: any | null; klar: boolean; vald: boolean; korvy: boolean; objektId: string | null; skogPaint: Record<string, number>;
}): RitadStatus {
  const [svar, setSvar] = useState<{ id: string; svar: Svar } | null>(null);
  const [laddar, setLaddar] = useState<string | null>(null);
  const [lutad, setLutad] = useState(false);
  const [grundKlar, setGrundKlar] = useState(false);
  const ritatPaKartan = useRef<string | null>(null);
  const paintRef = useRef(skogPaint);
  paintRef.current = skogPaint;

  // Grunden: först när Ritad väljs.
  useEffect(() => {
    if (!map || !klar || !vald || grundKlar) return;
    try { laggTillGrund(map); setGrundKlar(true); } catch (e) { console.warn('[ritad] kunde inte lägga grunden', e); }
  }, [map, klar, vald, grundKlar]);

  // Skogen: hämtas när Ritad är vald och ett objekt är öppet.
  useEffect(() => {
    if (!vald || !objektId) return;
    let stopp = false;
    let p = cache.get(objektId);
    if (!p) {
      p = hamtaSkog(objektId).catch(() => ({ typ: 'fel', text: 'Kunde inte hämta laserdatan' }) as Svar);
      cache.set(objektId, p);
      // Ett fel ska gå att försöka igen nästa gång (inte fastna i cachen).
      p.then((s) => { if (s.typ === 'fel') cache.delete(objektId); });
    }
    setLaddar(objektId);
    p.then((s) => { if (!stopp) { setSvar({ id: objektId, svar: s }); setLaddar(null); } });
    return () => { stopp = true; };
  }, [vald, objektId]);

  // Lägg skogen på kartan (eller ta bort den när objektet byts).
  const ritat = svar && svar.id === objektId && svar.svar.typ === 'klar' ? svar.svar.ritat : null;
  const nyckel = ritat ? objektId : null;
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

  // Lutningen (bara planeringen): skogen står upp över LUTAD_PITCH.
  useEffect(() => {
    if (!map || !vald || korvy) { setLutad(false); return; }
    const kolla = () => setLutad(arLutad(map.getPitch?.() ?? 0));
    map.on('pitch', kolla);
    kolla();
    return () => { map.off('pitch', kolla); };
  }, [map, vald, korvy]);

  // Synligheten — körvyns whitelist släpper igenom RITAD_KORVY_LAGER (page.tsx), så den här effekten kan sätta allt.
  useEffect(() => {
    if (!map || !grundKlar) return;
    const syn = ritadSynlighet({ vald, korvy, lutad });
    for (const id of RITAD_LAGER) {
      try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', syn[id] ? 'visible' : 'none'); } catch { /* */ }
    }
  }, [map, grundKlar, vald, korvy, lutad, nyckel]);

  if (!vald) return { typ: 'av' };
  if (!objektId) return { typ: 'inget-objekt' };
  if (laddar === objektId || !svar || svar.id !== objektId) return { typ: 'laser' };
  const s = svar.svar;
  return s.typ === 'klar' ? { typ: 'klar', ar: s.ar } : s;
}

/** Raden under "Ritad" i + › Lager: vad som syns, i ord. */
export function ritadStatusText(s: RitadStatus): string {
  switch (s.typ) {
    case 'laser': return 'Ritar skogen …';
    case 'klar': return s.ar ? `Skogen ur laserskanningen ${s.ar}` : 'Skogen ur laserskanningen';
    case 'ingen-grans': return 'Trakten har ingen traktgräns från Vida — bara vägar och vatten';
    case 'fel': return `${s.text} — bara vägar och vatten`;
    case 'inget-objekt': return 'Skogen ritas när ett objekt är öppet';
    default: return 'Skogen ritad ur laserdatan';
  }
}
