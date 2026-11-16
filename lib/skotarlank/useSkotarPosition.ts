'use client';

// Skotarlänken: telefonen som GPS (Martin 2026-11-11 — "det är det lättaste": ingen USB-GPS, inga drivrutiner, inget som rör TimberMatic).
// På TELEFONEN trycker föraren "Använd telefonen som GPS": positionen filtreras (lib/telefonGps, samma som appens telefon-GPS) och skickas
// till servern några gånger i minuten. På MASKINDATORN hämtas den senaste var 5:e sekund och ritas som en prick.
// Valet minns per enhet och länk, så telefonen fortsätter skicka efter en omladdning. iPhone slutar skicka när skärmen låses — därför
// håller sidan skärmen vaken och raden säger när positionen är gammal.

import { useCallback, useEffect, useRef, useState } from 'react';
import { filtreraFix, type FilterState } from '@/lib/telefonGps';
import { arFarsk, type Position } from './positionRegler';

/** Telefonen skickar högst så här ofta (ms). */
export const SKICKA_MS = 5_000;
/** Datorn hämtar så här ofta (ms) medan sidan syns. */
export const HAMTA_MS = 5_000;
const LAGRING = 'skotarlank_telefon_gps_v1';

export type TelefonLage =
  | { typ: 'av' }
  | { typ: 'soker' }
  | { typ: 'skickar'; noggrannhet: number | null; sist: number | null }
  | { typ: 'langt' }
  | { typ: 'nekad' }
  | { typ: 'saknas' }
  | { typ: 'fel' };

const lasPa = (token: string): boolean => { try { return localStorage.getItem(`${LAGRING}:${token}`) === 'pa'; } catch { return false; } };
const sparaPa = (token: string, pa: boolean) => { try { if (pa) localStorage.setItem(`${LAGRING}:${token}`, 'pa'); else localStorage.removeItem(`${LAGRING}:${token}`); } catch { /* bara bekvämlighet */ } };

export function useSkotarPosition(token: string) {
  const [telefon, setTelefon] = useState<TelefonLage>({ typ: 'av' });
  const [egen, setEgen] = useState<Position | null>(null);       // den här telefonens position (när den skickar)
  const [server, setServer] = useState<Position | null>(null);   // den senaste som servern har
  const [nu, setNu] = useState(() => Date.now());
  const pa = telefon.typ !== 'av';

  // --- Telefonen: följ positionen och skicka.
  const filter = useRef<FilterState | null>(null);
  const senast = useRef<{ lat: number; lng: number; noggrannhet: number | null; kurs: number | null } | null>(null);
  const skickad = useRef(0);
  const skicka = useCallback(async (p: { lat: number; lng: number; noggrannhet: number | null; kurs: number | null }) => {
    skickad.current = Date.now();
    try {
      const r = await fetch(`/api/skotare/${token}/position`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setTelefon((t) => (t.typ === 'av' ? t : { typ: 'fel' })); return; }
      setTelefon((t) => (t.typ === 'av' ? t : j.langt ? { typ: 'langt' } : { typ: 'skickar', noggrannhet: p.noggrannhet, sist: Date.now() }));
    } catch { setTelefon((t) => (t.typ === 'av' ? t : { typ: 'fel' })); }
  }, [token]);

  useEffect(() => {
    if (!pa) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setTelefon({ typ: 'saknas' }); return; }
    filter.current = null;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const r = filtreraFix(filter.current, { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, fart: pos.coords.speed, tid: pos.timestamp });
        filter.current = r.state;
        if (!r.fix) return;
        const kurs = pos.coords.heading != null && Number.isFinite(pos.coords.heading) && (pos.coords.speed ?? 0) > 0.5 ? pos.coords.heading : null;
        const p = { lat: r.fix.lat, lng: r.fix.lng, noggrannhet: Math.round(r.fix.noggrannhetM), kurs };
        senast.current = p;
        setEgen({ ...p, tid: new Date().toISOString() });
        setTelefon((t) => (t.typ === 'soker' ? { typ: 'skickar', noggrannhet: p.noggrannhet, sist: null } : t));
        if (Date.now() - skickad.current >= SKICKA_MS) void skicka(p);
      },
      (e) => setTelefon(e.code === e.PERMISSION_DENIED ? { typ: 'nekad' } : { typ: 'soker' }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
    // Står telefonen still kommer inga nya fixar — skicka ändå den senaste så datorn ser att den lever.
    const t = setInterval(() => { if (senast.current && Date.now() - skickad.current >= SKICKA_MS) void skicka(senast.current); }, SKICKA_MS);
    return () => { navigator.geolocation.clearWatch(id); clearInterval(t); };
  }, [pa, skicka]);

  // Valet minns per enhet och länk.
  useEffect(() => { if (lasPa(token)) setTelefon({ typ: 'soker' }); }, [token]);
  const sattPa = useCallback((p: boolean) => {
    sparaPa(token, p);
    // Frågan om plats ska komma i trycket (iPhone visar den inte alltid annars).
    if (p) { try { navigator.geolocation?.getCurrentPosition(() => undefined, () => undefined, { enableHighAccuracy: true }); } catch { /* */ } }
    setTelefon(p ? { typ: 'soker' } : { typ: 'av' });
    if (!p) { setEgen(null); senast.current = null; }
  }, [token]);

  // --- Datorn (och telefonen): hämta den senaste positionen medan sidan syns.
  const hamta = useCallback(async () => {
    try {
      const r = await fetch(`/api/skotare/${token}/position`, { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.ok) setServer((j.position as Position | null) ?? null);
    } catch { /* nästa försök om en stund — den gamla pricken står kvar */ }
  }, [token]);
  useEffect(() => {
    if (pa) return;   // telefonen visar sin egen position direkt
    void hamta();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void hamta(); }, HAMTA_MS);
    const synlig = () => { if (document.visibilityState === 'visible') void hamta(); };
    document.addEventListener('visibilitychange', synlig);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', synlig); };
  }, [pa, hamta]);

  // Klockan för "senast 14:32" och grå prick.
  useEffect(() => { const t = setInterval(() => setNu(Date.now()), 15_000); return () => clearInterval(t); }, []);

  const position = pa ? egen : server;
  const farsk = position ? arFarsk(position.tid, nu) : false;
  return { telefon, sattPa, position, farsk };
}

/** Raden under menyvalet och statusraden på telefonen. */
export function telefonText(t: TelefonLage): string {
  switch (t.typ) {
    case 'av': return 'Öppna länken på telefonen och tryck här';
    case 'soker': return 'Söker position …';
    case 'skickar': return t.noggrannhet != null ? `Skickar position · ±${t.noggrannhet} m` : 'Skickar position';
    case 'langt': return 'Du är långt från trakten — skickas när du är närmare';
    case 'nekad': return 'Platsen är blockerad — tillåt plats för sidan i telefonens inställningar';
    case 'saknas': return 'Den här enheten har ingen GPS';
    case 'fel': return 'Kunde inte skicka — försöker igen';
  }
}
