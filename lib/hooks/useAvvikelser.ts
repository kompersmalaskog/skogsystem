'use client';

// Avvikelserna på ett objekt: de som servern har + de som väntar i kön på enheten (tagna utan täckning). Läses om när kön ändras
// eller en avvikelse kommit fram. Ett läsfel är ett fel (`fel`), aldrig en tom lista — det som väntar på enheten visas ändå.

import { useCallback, useEffect, useState } from 'react';
import { AVVIKELSE_SPARAD_EVENT, hamtaAvvikelser, prenumereraAvvikelseKo, vantandeAvvikelser, type AvvikelseRad, type AvvikelseRadIn } from '../avvikelseKo';

export interface AvvikelseVisad { rad: AvvikelseRadIn & Partial<Pick<AvvikelseRad, 'skapad_at' | 'skapad_av' | 'korspar_fore'>>; vantar: boolean }

export function slaIhopAvvikelser(server: readonly AvvikelseRad[], vantande: readonly { rad: AvvikelseRadIn }[]): AvvikelseVisad[] {
  const ut: AvvikelseVisad[] = server.map((rad) => ({ rad, vantar: false }));
  const finns = new Set(server.map((r) => r.id));
  for (const v of vantande) if (!finns.has(v.rad.id)) ut.push({ rad: v.rad, vantar: true });
  return ut.sort((a, b) => Date.parse(b.rad.tagen_at) - Date.parse(a.rad.tagen_at));
}

export function useAvvikelser(objektId: string | null) {
  const [lista, setLista] = useState<AvvikelseVisad[]>([]);
  const [fel, setFel] = useState(false);
  const [version, setVersion] = useState(0);
  const lasOm = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!objektId) { setLista([]); setFel(false); return; }
    let aktiv = true;
    (async () => {
      const vant = await vantandeAvvikelser(objektId).catch(() => []);
      let server: AvvikelseRad[] = [];
      let lasFel = false;
      try { server = await hamtaAvvikelser(objektId); } catch { lasFel = true; }
      if (!aktiv) return;
      setFel(lasFel);
      setLista((forra) => {
        // Vid läsfel: behåll det servern sa senast, lägg till det som väntar.
        const bas = lasFel ? forra.filter((a) => !a.vantar).map((a) => a.rad as AvvikelseRad) : server;
        return slaIhopAvvikelser(bas, vant);
      });
    })();
    return () => { aktiv = false; };
  }, [objektId, version]);

  useEffect(() => {
    const av = prenumereraAvvikelseKo(lasOm);
    window.addEventListener(AVVIKELSE_SPARAD_EVENT, lasOm);
    return () => { av(); window.removeEventListener(AVVIKELSE_SPARAD_EVENT, lasOm); };
  }, [lasOm]);

  return { lista, fel, lasOm };
}
