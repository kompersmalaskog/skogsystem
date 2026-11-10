'use client';
// Larmplatsernas kontroller för ett objekt (tabellen larmplats_kontroll, lib/larmKontroll.ts): läs, svara, och vilka punkter man
// redan tryckt bort på den här enheten. Läsfel = `rader` null (ingen fråga ställs då). I testläget (`torr`) sparas svaren bara i minnet.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { punktNyckel, type LarmKontrollRad } from '@/lib/larmKontroll';

const AVFARDADE_NYCKEL = 'larmplats_kontroll_avfardad_v1';

function lasAvfardade(): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(AVFARDADE_NYCKEL) || '[]'); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []); }
  catch { return new Set(); }
}
function sparaAvfardade(s: Set<string>) {
  try { localStorage.setItem(AVFARDADE_NYCKEL, JSON.stringify([...s].slice(-200))); } catch { /* utan lagring gäller det bara den här stunden */ }
}

const forNamn = (n: unknown) => (typeof n === 'string' && n.trim() ? n.trim().split(/\s+/)[0] : null);

export function useLarmKontroll(o: { objektId: string | null; medarbetareId: string | null; maskinId: string | null; torr: boolean }) {
  const [rader, setRader] = useState<LarmKontrollRad[] | null>(null);
  const [avfardade, setAvfardade] = useState<Set<string>>(() => (typeof window === 'undefined' ? new Set() : lasAvfardade()));
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState(false);

  const las = useCallback(async () => {
    if (!o.objektId) { setRader(null); return; }
    const { data, error } = await supabase.from('larmplats_kontroll')
      .select('id, lat, lng, svar, kommentar, skapad_at, medarbetare:medarbetare_id(namn)')
      .eq('objekt_id', o.objektId).order('skapad_at', { ascending: false }).limit(200);
    if (error || !Array.isArray(data)) { setRader(null); return; }
    setRader((data as any[]).map((r) => ({
      id: r.id, lat: Number(r.lat), lng: Number(r.lng), svar: r.svar === 'ja' ? 'ja' : 'nej', kommentar: r.kommentar ?? null,
      vem: forNamn(r.medarbetare?.namn), skapadAt: r.skapad_at,
    })));
  }, [o.objektId]);

  useEffect(() => { void las(); }, [las]);

  const avfarda = useCallback((p: { lat: number; lng: number }) => {
    setAvfardade((s) => { const ny = new Set(s); ny.add(punktNyckel(p)); sparaAvfardade(ny); return ny; });
  }, []);

  /** Spara ett svar. true = sparat. Punkten frågas inte igen på enheten oavsett svar. */
  const svara = useCallback(async (p: { lat: number; lng: number }, svar: 'ja' | 'nej', kommentar: string | null): Promise<boolean> => {
    const text = kommentar?.trim() ? kommentar.trim().slice(0, 280) : null;
    if (o.torr || !o.objektId || !o.medarbetareId) {
      if (!o.torr) { setFel(true); return false; }
      setRader((r) => [{ id: `torr-${Date.now()}`, lat: p.lat, lng: p.lng, svar, kommentar: text, vem: 'Test', skapadAt: new Date().toISOString() }, ...(r ?? [])]);
      avfarda(p);
      return true;
    }
    setSparar(true); setFel(false);
    const { data, error } = await supabase.from('larmplats_kontroll')
      .insert({ objekt_id: o.objektId, lat: p.lat, lng: p.lng, svar, kommentar: text, medarbetare_id: o.medarbetareId, maskin_id: o.maskinId })
      .select('id, skapad_at').maybeSingle();
    setSparar(false);
    if (error || !data) { setFel(true); return false; }
    setRader((r) => [{ id: (data as any).id, lat: p.lat, lng: p.lng, svar, kommentar: text, vem: null, skapadAt: (data as any).skapad_at }, ...(r ?? [])]);
    avfarda(p);
    void las();
    return true;
  }, [o.torr, o.objektId, o.medarbetareId, o.maskinId, avfarda, las]);

  return { rader, avfardade, avfarda, svara, sparar, fel };
}
