'use client';

// Besöken i hytten (maskinläget, alla maskiner på trakten): läser aktiva anmälningar för objektet var 4:e sekund (kravet är ≤ 5 s), spelar EN ton när ett nytt besök dyker upp och
// sparar "Uppfattat". ALLT går via serverrutterna /api/besok/hytt och /api/besok/hytt/kvittera — hytten läser aldrig tabellerna själv. Servern kontrollerar att maskinen är kopplad till
// objektet, och avgör roll, förare och testläge; klienten skickar bara vilket besök och vilken maskin (och, i "Visar som maskin", att det är ett test – bara admin får det att gälla).
// Passiv (ingen läsning) utanför maskinläget. Går servern inte att nå (eller saknas tabellerna) är hooken tyst: inget kort, ingen ring, felet loggas.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HYTT_POLL_MS } from '@/lib/besok/konstanter';
import { aktivaBesok, ejKvitterade, type HyttBesok, type HyttKvittens } from '@/lib/besok/hytt';
import { spelaLarmLjud } from '@/lib/larm/ljud';

type LasSvar = { ok?: boolean; besok?: HyttBesok[]; kvitterade?: string[] };

// Ringen kan stängas av för ett besök ("Stäng av när du ser hen"). Minnet är per enhet och per besök; ett nytt besök får alltid sin ring.
const RING_AV_NYCKEL = 'besok_ring_av_v1';
const lasRingAv = (): string[] => { try { const j = JSON.parse(localStorage.getItem(RING_AV_NYCKEL) ?? '[]'); return Array.isArray(j) ? j.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const sparaRingAv = (ids: string[]) => { try { localStorage.setItem(RING_AV_NYCKEL, JSON.stringify(ids.slice(-50))); } catch { /* minnet är en bekvämlighet */ } };

export function useBesokHytt(a: {
  aktiv: boolean;
  objektId: string | null;
  maskinId: string | null;
  /** admin som provar i testläget (/maskin?som=…): kvittensen sparas på riktigt men märks `testlage` i loggen. Servern godtar det bara för en admin. */
  testlage: boolean;
  ljudCtx?: () => AudioContext | null;
}) {
  const [besok, setBesok] = useState<HyttBesok[]>([]);
  const [kvitt, setKvitt] = useState<HyttKvittens[]>([]);
  const [sparar, setSparar] = useState<string | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const sett = useRef<Set<string>>(new Set());
  const [ringAv, setRingAv] = useState<string[]>(() => lasRingAv());
  const ljudRef = useRef(a.ljudCtx);
  ljudRef.current = a.ljudCtx;
  const maskinRef = useRef(a.maskinId);
  maskinRef.current = a.maskinId;
  const testRef = useRef(a.testlage);
  testRef.current = a.testlage;

  const las = useCallback(async () => {
    const objekt = a.objektId, maskin = maskinRef.current;
    if (!objekt || !maskin) return;
    try {
      const url = `/api/besok/hytt?objekt=${encodeURIComponent(objekt)}&maskin=${encodeURIComponent(maskin)}${testRef.current ? '&test=1' : ''}`;
      const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if (r.status === 403) { setBesok([]); setKvitt([]); setFel(null); return; }   // maskinen är inte kopplad till objektet: inga besök att visa
      const j = (await r.json().catch(() => null)) as LasSvar | null;
      if (!r.ok || !j?.ok) { console.warn('[Besök] läsning:', r.status); return; }
      const rader = Array.isArray(j.besok) ? j.besok : [];
      const kvittade = new Set(Array.isArray(j.kvitterade) ? j.kvitterade : []);
      // EN ton per nytt besök som den här maskinen inte redan kvitterat. Första läsningen räknas också (ett besök som väntade när hytten öppnades ska höras).
      const nya = rader.filter((x) => !sett.current.has(x.id) && !kvittade.has(x.id));
      rader.forEach((x) => sett.current.add(x.id));
      if (nya.length && ljudRef.current) { try { spelaLarmLjud(ljudRef.current(), 'nara'); } catch { /* ljud kräver ett tryck först */ } }
      setBesok(rader);
      setKvitt(Array.from(kvittade).map((besok_id) => ({ besok_id, maskin_id: maskin })));
      setFel(null);
    } catch (e) {
      console.warn('[Besök] läsning:', e instanceof Error ? e.message : e);
    }
  }, [a.objektId]);

  useEffect(() => {
    if (!a.aktiv || !a.objektId || !a.maskinId) { setBesok([]); setKvitt([]); sett.current = new Set(); return; }
    sett.current = new Set();
    las();
    const t = setInterval(() => { if (document.visibilityState === 'visible') las(); }, HYTT_POLL_MS);
    const synlig = () => { if (document.visibilityState === 'visible') las(); };
    document.addEventListener('visibilitychange', synlig);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', synlig); };
  }, [a.aktiv, a.objektId, a.maskinId, a.testlage, las]);

  /** Tryck på "Uppfattat". Servern sparar med maskin, roll, förare och servertid; kortet försvinner först när det är sparat. */
  const kvittera = useCallback(async (besokId: string): Promise<boolean> => {
    const maskin = maskinRef.current;
    if (!maskin) { setFel('Kunde inte spara — maskinen saknas.'); return false; }
    setSparar(besokId); setFel(null);
    try {
      const r = await fetch('/api/besok/hytt/kvittera', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ besok_id: besokId, maskin_id: maskin, ...(testRef.current ? { testlage: true } : {}) }),
      });
      const j = await r.json().catch(() => null);
      setSparar(null);
      if (!r.ok || !j?.ok) { setFel('Kunde inte spara — försök igen.'); return false; }
      setKvitt((p) => (p.some((x) => x.besok_id === besokId && x.maskin_id === maskin) ? p : [...p, { besok_id: besokId, maskin_id: maskin }]));
      return true;
    } catch {
      setSparar(null); setFel('Kunde inte spara — försök igen.');
      return false;
    }
  }, []);

  /** Tryck på "Stäng av när du ser hen": räknas som Uppfattat (sparas på servern) OCH stänger av 70 m-ringen för det besöket på den här enheten. */
  const stangAv = useCallback(async (besokId: string): Promise<boolean> => {
    const ok = await kvittera(besokId);
    if (!ok) return false;
    setRingAv((p) => { const n = p.includes(besokId) ? p : [...p, besokId]; sparaRingAv(n); return n; });
    return true;
  }, [kvittera]);

  const aktiva = useMemo(() => aktivaBesok(besok), [besok]);
  /** Besöken som ska ge en ring runt maskinen: aktiva, utom de föraren stängt av. */
  const ringBesok = useMemo(() => aktiva.filter((x) => !ringAv.includes(x.id)), [aktiva, ringAv]);
  const vantar = useMemo(() => ejKvitterade(aktiva, kvitt, a.maskinId), [aktiva, kvitt, a.maskinId]);
  return { aktiva, ringBesok, vantar, kvittera, stangAv, sparar, fel };
}
