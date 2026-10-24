'use client';

// Besöken i hytten (maskinläget, alla maskiner på trakten): läser aktiva anmälningar för objektet var 4:e sekund (kravet är ≤ 5 s), spelar EN ton när ett nytt besök dyker upp och sparar
// "Uppfattat" med servertid och förare (objekt_besok_kvittens; tiden sätts av databasen). Passiv (ingen läsning) utanför maskinläget.
// Saknas tabellerna (migrationen ej körd) är hooken tyst: inget kort, ingen ring, felet loggas.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { HYTT_POLL_MS, BESOK_EFTERTID_MIN } from '@/lib/besok/konstanter';
import { aktivaBesok, ejKvitterade, type HyttBesok, type HyttKvittens } from '@/lib/besok/hytt';
import { spelaLarmLjud } from '@/lib/larm/ljud';

export function useBesokHytt(a: {
  aktiv: boolean;
  objektId: string | null;
  maskinId: string | null;
  roll: 'skordare' | 'skotare' | null;
  forareId: string | null;
  /** admin som provar i testläget (/maskin?som=…): kvittensen sparas på riktigt men märks `testlage` i loggen */
  testlage: boolean;
  ljudCtx?: () => AudioContext | null;
}) {
  const [besok, setBesok] = useState<HyttBesok[]>([]);
  const [kvitt, setKvitt] = useState<HyttKvittens[]>([]);
  const [sparar, setSparar] = useState<string | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const sett = useRef<Set<string>>(new Set());
  const forstaLasning = useRef(true);
  const ljudRef = useRef(a.ljudCtx);
  ljudRef.current = a.ljudCtx;
  const maskinRef = useRef(a.maskinId);
  maskinRef.current = a.maskinId;

  const las = useCallback(async () => {
    if (!a.objektId) return;
    const fran = new Date(Date.now() - BESOK_EFTERTID_MIN * 60000).toISOString();
    const b = await supabase.from('objekt_besok').select('id, namn, telefon, besokstid').eq('objekt_id', a.objektId).gte('besokstid', fran).order('besokstid', { ascending: true });
    if (b.error) { console.warn('[Besök] läsning:', b.error.message); return; }
    const rader = (b.data ?? []) as HyttBesok[];
    const k = rader.length ? await supabase.from('objekt_besok_kvittens').select('besok_id, maskin_id').in('besok_id', rader.map((x) => x.id)) : { data: [], error: null };
    if (k.error) { console.warn('[Besök] kvittenser:', k.error.message); return; }
    const kv = (k.data ?? []) as HyttKvittens[];
    // EN ton per nytt besök som den här maskinen inte redan kvitterat. Första läsningen räknas också (ett besök som väntade när hytten öppnades ska höras).
    const nya = rader.filter((x) => !sett.current.has(x.id) && !kv.some((y) => y.besok_id === x.id && y.maskin_id === maskinRef.current));
    rader.forEach((x) => sett.current.add(x.id));
    if (nya.length && ljudRef.current) { try { spelaLarmLjud(ljudRef.current(), 'nara'); } catch { /* ljud kräver ett tryck först */ } }
    forstaLasning.current = false;
    setBesok(rader); setKvitt(kv); setFel(null);
  }, [a.objektId]);

  useEffect(() => {
    if (!a.aktiv || !a.objektId) { setBesok([]); setKvitt([]); sett.current = new Set(); return; }
    sett.current = new Set();
    las();
    const t = setInterval(() => { if (document.visibilityState === 'visible') las(); }, HYTT_POLL_MS);
    const synlig = () => { if (document.visibilityState === 'visible') las(); };
    document.addEventListener('visibilitychange', synlig);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', synlig); };
  }, [a.aktiv, a.objektId, las]);

  /** Tryck på "Uppfattat". Sparas med servertid och förare; kortet försvinner först när det är sparat. */
  const kvittera = useCallback(async (besokId: string): Promise<boolean> => {
    if (!a.maskinId || !a.forareId) { setFel('Kunde inte spara — maskin eller förare saknas.'); return false; }
    setSparar(besokId); setFel(null);
    const r = await supabase.from('objekt_besok_kvittens').upsert(
      { besok_id: besokId, maskin_id: a.maskinId, roll: a.roll, forare_id: a.forareId, testlage: a.testlage },
      { onConflict: 'besok_id,maskin_id', ignoreDuplicates: true },
    );
    setSparar(null);
    if (r.error) { setFel('Kunde inte spara — försök igen.'); return false; }
    setKvitt((p) => (p.some((x) => x.besok_id === besokId && x.maskin_id === a.maskinId) ? p : [...p, { besok_id: besokId, maskin_id: a.maskinId! }]));
    return true;
  }, [a.maskinId, a.forareId, a.roll, a.testlage]);

  const aktiva = useMemo(() => aktivaBesok(besok), [besok]);
  const vantar = useMemo(() => ejKvitterade(aktiva, kvitt, a.maskinId), [aktiva, kvitt, a.maskinId]);
  return { aktiva, vantar, kvittera, sparar, fel };
}
