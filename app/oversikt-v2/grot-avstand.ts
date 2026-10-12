'use client';
// Vägavstånd mellan GROT-objekten för listan i /oversikt-v2 — ORS-väg, '–' tills det är känt, aldrig fågelväg.
//
// Fågelvägen väljer bara VILKA par som är värda ett anrop (de 3 närmaste per objekt, lib/grotvy/avstand);
// siffran som visas är alltid ORS-vägavstånd. Paren går i kanonisk riktning, så de ligger redan i route_cache
// (scripts/grot-forvarm-route-cache.ts) och båda raderna i ett par visar samma siffra. Hämtas först när
// GROT-arket öppnas, med högst tre anrop samtidigt (ORS gratisplan: 40/min).

import { useEffect, useMemo, useRef, useState } from 'react';
import { hamtaVagKm, kandidatPar, korBegransat, valjKandidater, type Punkt } from '@/lib/grotvy/avstand';
import type { GrotLista } from '@/lib/grotvy/lista';

const PARALLELLA_VAGANROP = 3;

export function useGrotVagAvstand(lista: GrotLista | null, aktiv: boolean) {
  const punkter: Punkt[] = useMemo(() => (lista?.alla ?? [])
    .filter((r) => r.koordinat)
    .map((r) => ({ id: r.id, lat: r.koordinat!.lat, lng: r.koordinat!.lng })), [lista]);
  const kandidater = useMemo(() => valjKandidater(punkter), [punkter]);
  const [km, setKm] = useState<Record<string, number | null>>({});
  const begart = useRef<Set<string>>(new Set());
  const levande = useRef(true);
  useEffect(() => { levande.current = true; return () => { levande.current = false; }; }, []);

  useEffect(() => {
    if (!aktiv) return;
    const jobb: { nyckel: string; kor: () => Promise<number | null> }[] = [];
    kandidatPar(punkter).forEach((p) => {
      const nyckel = `${p.nyckel}@${p.fran.lat},${p.fran.lng};${p.till.lat},${p.till.lng}`;
      if (begart.current.has(nyckel)) return;
      begart.current.add(nyckel);
      jobb.push({ nyckel: p.nyckel, kor: () => hamtaVagKm(p.fran, p.till) });
    });
    if (!jobb.length) return;
    korBegransat(jobb.map((j) => j.kor), PARALLELLA_VAGANROP, (i, v) => {
      if (levande.current) setKm((prev) => ({ ...prev, [jobb[i].nyckel]: v }));
    });
  }, [punkter, aktiv]);

  return { kandidater, km };
}
