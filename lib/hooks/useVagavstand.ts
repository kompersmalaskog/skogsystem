'use client';

// Vägavstånd (OSRM) från en position till de närmaste objekten, ett i taget. Fågelvägen visas av anroparen (med ~) tills vägavståndet kommit.
//
// FLYTTAD OFÖRÄNDRAD ur components/planering/ObjektLista.tsx (2026-10-20, egenkontrollens stickprov): samma urval, samma cache, samma
// ett-i-taget-hämtning, samma tysta fallback till fågelväg. Objektlistan och egenkontrollens lista delar alltså EN väg till OSRM.
//
//   aktiv      effekten kör bara när listan är öppen / vyn syns (objektlistans `oppen`)
//   pos        var man är; null = inget avstånd alls (ingen gissad position)
//   objekt     alla objekt; de utan koordinat hoppas över
//   urval      vilka som får vägavstånd (objektlistan: de som inte är avslutade)
//   urvalNyckel  det urvalet läser (objektlistan: skotning-kvar-mängden) — ändras den räknas urvalet om
//   max        så många närmaste (fågelväg) får vägavstånd

import { useEffect, useState } from 'react';
import { fagelKm } from '@/lib/objektVal';
import { harKoordinat } from '@/lib/navigera';

export type VagPos = { lat: number; lng: number };
export type VagObjekt = { id: string; lat?: number | null; lng?: number | null };

export const ANTAL_VAGAVSTAND = 30;

// Vägavstånd (km) per objekt och ungefärlig position — överlever att listan stängs och öppnas.
const vagCache = new Map<string, number>();
const posNyckel = (p: VagPos) => `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;

export function useVagavstand<T extends VagObjekt>(args: {
  aktiv: boolean;
  pos: VagPos | null;
  objekt: readonly T[];
  urval: (o: T) => boolean;
  urvalNyckel?: unknown;
  max?: number;
}): Record<string, number> {
  const { aktiv, pos, objekt, urval, urvalNyckel, max = ANTAL_VAGAVSTAND } = args;
  const [vag, setVag] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!aktiv || !pos || objekt.length === 0) return;
    let avbruten = false;
    const pk = posNyckel(pos);
    const kandidater = objekt
      .filter((o) => harKoordinat(o) && urval(o))
      .sort((a, b) => fagelKm(pos.lat, pos.lng, a.lat!, a.lng!) - fagelKm(pos.lat, pos.lng, b.lat!, b.lng!))
      .slice(0, max);
    const fran: Record<string, number> = {};
    for (const o of kandidater) { const c = vagCache.get(`${o.id}@${pk}`); if (c != null) fran[o.id] = c; }
    if (Object.keys(fran).length) setVag((v) => ({ ...v, ...fran }));
    (async () => {
      for (const o of kandidater) {
        if (avbruten) break;
        if (vagCache.has(`${o.id}@${pk}`)) continue;
        try {
          const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${pos.lng},${pos.lat};${o.lng},${o.lat}?overview=false`);
          const d = await res.json();
          if (avbruten) break;
          const m = d?.routes?.[0]?.distance;
          if (typeof m === 'number') {
            const km = Math.round(m / 100) / 10;
            vagCache.set(`${o.id}@${pk}`, km);
            setVag((v) => ({ ...v, [o.id]: km }));
          }
        } catch { /* fågelvägen står kvar */ }
      }
    })();
    return () => { avbruten = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `urval` läser urvalNyckel (objektlistan: skotKvar) som är med
  }, [aktiv, pos, objekt, urvalNyckel]);

  return vag;
}
