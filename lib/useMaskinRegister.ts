'use client';

// Hämtar maskinregistret (dim_maskin) för skärmar utanför planeringsvyn (startvakten). Status 'laddar' | 'ok' | 'fel' —
// ett läsfel är ett FEL (visas som text + "Försök igen"), aldrig ett tomt register som ser ut som "inga maskiner".

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MaskinRegisterRad, RegisterStatus } from '@/lib/maskinFraga';

export function useMaskinRegister(aktiv: boolean): { register: MaskinRegisterRad[]; status: RegisterStatus; laddaOm: () => void } {
  const [register, setRegister] = useState<MaskinRegisterRad[]>([]);
  const [status, setStatus] = useState<RegisterStatus>('laddar');
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    setStatus('laddar');
    (async () => {
      try {
        const { data, error } = await supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell, maskin_typ, aktiv_till');
        if (avbruten) return;
        if (error || !Array.isArray(data)) { setStatus('fel'); return; }
        setRegister(data as MaskinRegisterRad[]);
        setStatus('ok');
      } catch {
        if (!avbruten) setStatus('fel');
      }
    })();
    return () => { avbruten = true; };
  }, [aktiv, n]);

  const laddaOm = useCallback(() => setN((x) => x + 1), []);
  return { register, status, laddaOm };
}
