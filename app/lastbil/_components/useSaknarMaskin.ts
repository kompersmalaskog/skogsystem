'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { fragaGarUtFore } from '@/lib/lastbil/lass/vantar';
import { maskinVisningsnamn, DIM_MASKIN_NAMN_KOLUMNER } from '@/lib/maskinNamn';
import { LASS_KOLUMNER, type LassRad } from './lass';

export type SaknarLage =
  | { lage: 'laddar' }
  | { lage: 'fel' }
  | { lage: 'klar'; rader: LassRad[] };

/**
 * Lassen som väntar på ett svar (äldst först). Bara admin (`aktiv`): lastbil_lass läses av admin. Ett läsfel är ett fel —
 * aldrig "inget väntar". Räknar bara lass som frågan kan ha gått ut för (samma gräns som märket på startsidan).
 */
export function useSaknarMaskin(aktiv: boolean) {
  const [lage, setLage] = useState<SaknarLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);
  const [tystOm, setTystOm] = useState(0);
  const senasteTyst = useRef(0);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    const tyst = tystOm !== senasteTyst.current;
    senasteTyst.current = tystOm;
    if (!tyst) setLage({ lage: 'laddar' });
    (async () => {
      const r = await medAbortRetry(() => supabase.from('lastbil_lass').select(LASS_KOLUMNER)
        .eq('status', 'vantar_maskin').lte('lossning_tid', fragaGarUtFore(Date.now())).order('lassning_tid', { ascending: true }).limit(50) as any);
      if (avbruten) return;
      if (r.error) {
        console.error('[lastbil] lass som saknar maskin: läsfel', r.error);
        if (!tyst) setLage({ lage: 'fel' });
        return;
      }
      setLage({ lage: 'klar', rader: (r.data ?? []) as LassRad[] });
    })();
    return () => { avbruten = true; };
  }, [aktiv, omforsok, tystOm]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  const laddaOmTyst = useCallback(() => setTystOm(n => n + 1), []);
  return { lage, forsokIgen, laddaOmTyst };
}

export type EttLassLage =
  | { lage: 'laddar' }
  | { lage: 'fel' }
  | { lage: 'saknas' }
  | { lage: 'klar'; rad: LassRad };

/** Ett lass, oavsett status — för länken i notisen (/lastbil?lass=<id>): ett redan besvarat lass ska säga det, inte bara försvinna. */
export function useEttLass(id: string | null) {
  const [lage, setLage] = useState<EttLassLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);

  useEffect(() => {
    if (!id) return;
    let avbruten = false;
    setLage({ lage: 'laddar' });
    (async () => {
      const r = await medAbortRetry(() => supabase.from('lastbil_lass').select(LASS_KOLUMNER).eq('id', id).maybeSingle() as any);
      if (avbruten) return;
      if (r.error) { console.error('[lastbil] lass: läsfel', r.error); setLage({ lage: 'fel' }); return; }
      setLage(r.data ? { lage: 'klar', rad: r.data as LassRad } : { lage: 'saknas' });
    })();
    return () => { avbruten = true; };
  }, [id, omforsok]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  return { lage, forsokIgen };
}

export interface MaskinVal { maskin_id: string; namn: string }
export type MaskinerLage = { lage: 'laddar' } | { lage: 'fel' } | { lage: 'klar'; maskiner: MaskinVal[] };

/** Våra aktiva maskiner (dim_maskin, namn via maskinVisningsnamn). Läses när arket öppnas. */
export function useAktivaMaskiner(aktiv: boolean) {
  const [lage, setLage] = useState<MaskinerLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    setLage({ lage: 'laddar' });
    (async () => {
      const r = await medAbortRetry(() => supabase.from('dim_maskin').select(`${DIM_MASKIN_NAMN_KOLUMNER}, aktiv_till`).order('maskin_typ').order('maskin_id') as any);
      if (avbruten) return;
      if (r.error) { console.error('[lastbil] maskiner: läsfel', r.error); setLage({ lage: 'fel' }); return; }
      const idag = new Date().toISOString().slice(0, 10);
      const maskiner = ((r.data ?? []) as any[])
        .filter(m => !m.aktiv_till || m.aktiv_till >= idag)
        .map(m => ({ maskin_id: m.maskin_id as string, namn: maskinVisningsnamn(m) }));
      setLage({ lage: 'klar', maskiner });
    })();
    return () => { avbruten = true; };
  }, [aktiv, omforsok]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  return { lage, forsokIgen };
}
