'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { DIM_MASKIN_NAMN_KOLUMNER, maskinVisningsnamn } from '@/lib/maskinNamn';
import { lasUtkast, type Utkast } from './flode';
import { harledPagaende, oppenFlyttGaller, type OppenFlytt, type Pagaende } from './pagaende';

export type PagaendeLage =
  | { lage: 'laddar' }
  /** Läsfel: knappen är den vanliga. Aldrig en gissning att något pågår eller inte pågår. */
  | { lage: 'fel' }
  | { lage: 'klar'; pagaende: Pagaende | null };

/**
 * Pågår en hämtning för den här föraren? Databasen styr: förarens öppna flytt (Lassat inom 12 h). Utkastet på enheten
 * visar bara rätt steg. Läses varje gång `aktiv` blir sann (alltså också när flödet stängts och man är tillbaka på sidan).
 * Ingenting skrivs och flödet öppnas aldrig av det här.
 */
export function usePagaendeHamtning(forareId: string | null, aktiv: boolean): PagaendeLage {
  const [lage, setLage] = useState<PagaendeLage>({ lage: 'laddar' });

  useEffect(() => {
    if (!aktiv || !forareId) return;
    let avbruten = false;
    (async () => {
      const utkast: Utkast | null = lasUtkast();
      const f = await medAbortRetry(() => supabase.from('maskin_flytt')
        .select('id, maskin_id, extern_maskin, starttid, hamtad_tid')
        .is('sluttid', null).eq('avbruten', false).eq('medarbetare_id', forareId)
        .order('starttid', { ascending: false }).limit(1) as any);
      if (avbruten) return;
      if (f.error) { console.error('[lastbil] pågående hämtning: läsfel', f.error); setLage({ lage: 'fel' }); return; }
      const flytt = ((f.data as OppenFlytt[] | null) ?? [])[0] ?? null;

      // Maskinnamnen ur dim_maskin (ett namn i hela appen) — bara de maskiner som kan bli aktuella.
      const nuMs = Date.now();
      const ider = [flytt && oppenFlyttGaller(flytt, nuMs) ? flytt.maskin_id : null, utkast?.maskinId ?? null].filter((x): x is string => !!x);
      const namn = new Map<string, string>();
      if (ider.length) {
        const m = await medAbortRetry(() => supabase.from('dim_maskin').select(DIM_MASKIN_NAMN_KOLUMNER).in('maskin_id', ider) as any);
        if (avbruten) return;
        if (m.error) { console.error('[lastbil] pågående hämtning: maskinnamn', m.error); setLage({ lage: 'fel' }); return; }
        for (const r of (m.data as any[] | null) ?? []) namn.set(r.maskin_id, maskinVisningsnamn(r));
      }
      setLage({ lage: 'klar', pagaende: harledPagaende({ utkast, flytt, namnFor: id => namn.get(id) ?? null, nuMs }) });
    })();
    return () => { avbruten = true; };
  }, [aktiv, forareId]);

  return lage;
}
