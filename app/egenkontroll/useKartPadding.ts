'use client';

// Hur mycket av kartan som ligger BAKOM huvudet (uppe) och arket (nere) — mätt, aldrig gissat.
// Kartan går att passa in i den DEL som syns (MapLibre `padding`), så en vald punkt hamnar mellan huvudet och arket i stället för bakom dem.
// Safe-area (iPhones systemfält och hemindikator) är med i mätningen: elementens egna rektanglar, inte ett antagande om hur högt de är.
// ResizeObserver saknas i jsdom (och i gamla webbläsare): då mäts bara vid montering och fönsterändring.
// `omatning` är en nyckel som sidan byter när något flyttat sig utan att ändra storlek (arket byter läge, translateY): då mäts det om.

import { useCallback, useEffect, useState, type RefObject } from 'react';

export type KartPadding = {
  /** Pixlar från kartans överkant till under huvudet. */
  top: number;
  /** Pixlar från kartans nederkant till över dockan. */
  bottom: number;
  /** Dockans egen höjd (för knappar som ska ligga ovanför den). */
  dockHojd: number;
};

const NOLL: KartPadding = { top: 0, bottom: 0, dockHojd: 0 };

export function useKartPadding(huvudRef: RefObject<HTMLElement | null>, dockRef: RefObject<HTMLElement | null>, aktiv: boolean, omatning: string = ''): KartPadding {
  const [mat, setMat] = useState<KartPadding>(NOLL);

  const matOm = useCallback(() => {
    const h = huvudRef.current?.getBoundingClientRect();
    const d = dockRef.current?.getBoundingClientRect();
    const hojd = typeof window !== 'undefined' ? window.innerHeight : 0;
    const ny: KartPadding = {
      top: h ? Math.max(0, Math.round(h.bottom)) : 0,
      bottom: d && d.height > 0 ? Math.max(0, Math.round(hojd - d.top)) : 0,
      dockHojd: d ? Math.round(d.height) : 0,
    };
    setMat((g) => (g.top === ny.top && g.bottom === ny.bottom && g.dockHojd === ny.dockHojd ? g : ny));
  }, [huvudRef, dockRef]);

  useEffect(() => {
    if (!aktiv) return;
    matOm();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(matOm) : null;
    if (ro) {
      if (huvudRef.current) ro.observe(huvudRef.current);
      if (dockRef.current) ro.observe(dockRef.current);
    }
    window.addEventListener('resize', matOm);
    return () => { ro?.disconnect(); window.removeEventListener('resize', matOm); };
  }, [aktiv, matOm, huvudRef, dockRef, omatning]);

  return mat;
}
