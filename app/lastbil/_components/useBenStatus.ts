'use client';

// Märkningarna på flyttraderna i rundans ark, bara för admin (ekonomidata: fakturaunderlag_flytt har admin-RLS och en
// förare skulle få en tom lista utan fel — därför skickas frågorna aldrig utan `aktiv`):
//   - "Rättad av …" (maskin_flytt.redigerad_tid/-av)
//   - "Låst · godkänd för fakturering" / "Låst · fakturerad" (underlagets läge)
//
// Själva rättningen läser sheeten "Flytten" för sig (useFlyttDetalj) — den här läsningen behövs bara för raderna.
// Ett läsfel tar bara märkningarna, aldrig möjligheten att öppna flytten: sheeten visar läget själv.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';

export interface BenStatus {
  redigerad: boolean;
  redigeradAv: string | null;
  godkand: boolean;
  fakturerad: boolean;
}

export type BenStatusLage =
  | { lage: 'av' | 'laddar' | 'fel' }
  | { lage: 'klar'; status: Map<string, BenStatus> };

export function useBenStatus(benIds: readonly string[], aktiv: boolean) {
  const [lage, setLage] = useState<BenStatusLage>({ lage: aktiv ? 'laddar' : 'av' });
  const [nonce, setNonce] = useState(0);
  const nyckel = benIds.join(',');

  useEffect(() => {
    if (!aktiv || benIds.length === 0) { setLage({ lage: 'av' }); return; }
    let avbruten = false;
    setLage(l => (l.lage === 'klar' ? l : { lage: 'laddar' }));   // en omläsning efter en rättning blinkar inte
    (async () => {
     try {
      const [fl, un] = await Promise.all([
        medAbortRetry(() => supabase.from('maskin_flytt').select('id, redigerad_tid, redigerad_av').in('id', benIds as string[]) as any),
        medAbortRetry(() => supabase.from('fakturaunderlag_flytt').select('flytt_id, godkand_tid, fakturerad_tid').in('flytt_id', benIds as string[]) as any),
      ]);
      if (avbruten) return;
      if (fl.error || un.error) {
        console.error('[lastbil] flyttarnas märkning: läsfel', fl.error ?? un.error);
        setLage(l => (l.lage === 'klar' ? l : { lage: 'fel' }));
        return;
      }
      const underlag = new Map<string, any>((un.data ?? []).map((u: any) => [u.flytt_id, u]));
      const status = new Map<string, BenStatus>();
      for (const f of (fl.data ?? []) as any[]) {
        const u = underlag.get(f.id) ?? null;
        status.set(f.id, { redigerad: f.redigerad_tid != null, redigeradAv: f.redigerad_av ?? null, godkand: u?.godkand_tid != null, fakturerad: u?.fakturerad_tid != null });
      }
      setLage({ lage: 'klar', status });
     } catch (e) {
      console.error('[lastbil] flyttarnas märkning: undantag', e);
      if (!avbruten) setLage(l => (l.lage === 'klar' ? l : { lage: 'fel' }));
     }
    })();
    return () => { avbruten = true; };
    // benIds är helt bestämd av `nyckel`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel, aktiv, nonce]);

  const laddaOm = useCallback(() => setNonce(n => n + 1), []);
  return { lage, laddaOm };
}
