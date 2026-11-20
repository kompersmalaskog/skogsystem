'use client';

// "GPS saknas" för Windows-notisen (lib/hytt/notiser): ingen giltig position på över GPS_SAKNAS_NOTIS_MS (30 s) medan `aktiv`. Räknar utan polling:
// varje giltig fix (`vidFix`, anropad från GPS-hanteraren) nollar tillståndet och armar EN timer; den går bara av om ingen fix hinner komma. Timern sätts av ett GPS-anrop (ström/promise),
// inte av en annan timer — Chrome stryper kedjade timers i ett dolt fönster till ~60 s men inte en sådan, så notisen kommer inom ~1 s efter gränsen även med minimerat fönster.
// Ingen fix alls sedan `aktiv` blev sann (porten aldrig ansluten) räknas från att den blev aktiv.

import { useCallback, useEffect, useRef, useState } from 'react';
import { GPS_SAKNAS_NOTIS_MS } from '@/lib/gpsSaknas';

export function useGpsSaknasLang(aktiv: boolean): { saknas: boolean; vidFix: () => void } {
  const [saknas, setSaknas] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aktivRef = useRef(aktiv);
  aktivRef.current = aktiv;

  const arma = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; if (aktivRef.current) setSaknas(true); }, GPS_SAKNAS_NOTIS_MS);
  }, []);

  useEffect(() => {
    if (!aktiv) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      setSaknas(false);
      return;
    }
    arma();
    return () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  }, [aktiv, arma]);

  const vidFix = useCallback(() => {
    if (!aktivRef.current) return;
    setSaknas(false);   // samma värde → ingen omrendering (kallas vid varje fix)
    arma();
  }, [arma]);

  return { saknas, vidFix };
}
