'use client';

// Läget för flyttarna i EN runda, bara för admin (ekonomidata: fakturaunderlag_flytt har admin-RLS och en
// förare skulle få en tom lista utan fel — därför skickas frågorna aldrig utan `aktiv`):
//   - redigerad? (maskin_flytt.redigerad_tid/-av)
//   - underlagets läge: ogodkänt / godkänt / fakturerat / struket → LÅST eller inte
//   - spåret (maskin_flytt_rattning): vad som rättats förut, med originalet på äldsta raden
//
// Läses i arket, inte i listan: Körningar ska fungera utan de nya kolumnerna, och ett läsfel här stänger bara
// rättningen ("Kunde inte läsa flyttarnas läge") — det gör aldrig att något ser rättbart ut som inte är det.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import type { UnderlagLage } from '@/lib/flytt/fakturerbar';

export interface Rattning {
  id: string;
  flytt_id: string;
  tid: string;
  av: string;
  anledning: string;
  slag: 'rattning' | 'stryk';
  fore: Record<string, any>;
  efter: Record<string, any>;
  underlag_atgard: string;
  position_atgard: string;
}

export interface BenStatus {
  redigerad: boolean;
  redigeradAv: string | null;
  /** Underlagets id (för "Lämna tillbaka till Att godkänna") och läge; null = flytten har inget underlag. */
  underlagId: string | null;
  underlag: UnderlagLage | null;
  historik: Rattning[];
}

export type BenStatusLage =
  | { lage: 'av' | 'laddar' | 'fel' }
  | { lage: 'klar'; status: Map<string, BenStatus> };

const ms = (v: string | null | undefined) => (v ? Date.parse(v) : NaN);

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
      const [fl, un, sp] = await Promise.all([
        medAbortRetry(() => supabase.from('maskin_flytt').select('id, redigerad_tid, redigerad_av').in('id', benIds as string[]) as any),
        medAbortRetry(() => supabase.from('fakturaunderlag_flytt')
          .select('id, flytt_id, status, godkand_tid, fakturerad_tid, struken_tid, struken_anledning').in('flytt_id', benIds as string[]) as any),
        medAbortRetry(() => supabase.from('maskin_flytt_rattning')
          .select('id, flytt_id, tid, av, anledning, slag, fore, efter, underlag_atgard, position_atgard')
          .in('flytt_id', benIds as string[]).order('tid') as any),
      ]);
      if (avbruten) return;
      if (fl.error || un.error || sp.error) {
        console.error('[lastbil] flyttarnas läge: läsfel', fl.error ?? un.error ?? sp.error);
        setLage(l => (l.lage === 'klar' ? l : { lage: 'fel' }));
        return;
      }
      const historik = new Map<string, Rattning[]>();
      for (const r of (sp.data ?? []) as Rattning[]) historik.set(r.flytt_id, [...(historik.get(r.flytt_id) ?? []), r]);
      const underlag = new Map<string, any>((un.data ?? []).map((u: any) => [u.flytt_id, u]));
      const status = new Map<string, BenStatus>();
      for (const f of (fl.data ?? []) as any[]) {
        const u = underlag.get(f.id) ?? null;
        const h = historik.get(f.id) ?? [];
        status.set(f.id, {
          redigerad: f.redigerad_tid != null, redigeradAv: f.redigerad_av ?? null,
          underlagId: u?.id ?? null,
          underlag: u ? {
            status: u.status, godkand: u.godkand_tid != null, fakturerad: u.fakturerad_tid != null,
            // Strukits av en rättning av den här flytten: samma tidpunkt som en av rättningarna (samma transaktion).
            strukenAvRattning: u.status === 'struken' && h.some(r => r.underlag_atgard === 'struket' && ms(r.tid) === ms(u.struken_tid)),
            strykAnledning: u.struken_anledning ?? null,
          } : null,
          historik: h,
        });
      }
      setLage({ lage: 'klar', status });
     } catch (e) {
      console.error('[lastbil] flyttarnas läge: undantag', e);
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
