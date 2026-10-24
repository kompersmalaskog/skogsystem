'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { FLYTT_TIMDEBITERING_KM } from '@/lib/faktura/radbyggare';
import { traillertid, type TidBen, type TidForslag } from '@/lib/flytt/traillertid';
import type { UnderlagRad } from './fakturerbart';

/** En flytt över 3 mil faktureras på tid (artikel 3) — samma gräns som radbyggaren, på underlagets km. */
export const fakturerasPaTid = (r: Pick<UnderlagRad, 'km' | 'status'>): boolean =>
  r.status !== 'struken' && r.km != null && Number(r.km) > FLYTT_TIMDEBITERING_KM;

export type TidLage =
  | { lage: 'laddar' }
  | { lage: 'klar'; forslag: Map<string, TidForslag> }   // nyckel: underlagets id
  | { lage: 'fel' };

const BIT = 100;
const bitar = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / BIT) }, (_, i) => a.slice(i * BIT, (i + 1) * BIT));

/**
 * Förslaget på traillertid (regel A, `lib/flytt/traillertid.ts`) för varje underlagsrad som faktureras på tid.
 * Läser flyttens runda och ALLA flyttar på rundan (avbrutna räknas inte), så delningen vid lossningarna blir rätt.
 * Ett läsfel är ett fel — raden säger "Kunde inte läsa rundan", aldrig ett påhittat förslag och aldrig 0.
 * Läsningen fäller aldrig listan: den visas som förut, bara utan förslag.
 */
export function useTraillertid(rader: UnderlagRad[] | null) {
  const aktuella = useMemo(() => (rader ?? []).filter(r => fakturerasPaTid(r) && r.flytt_id), [rader]);
  const nyckel = aktuella.map(r => `${r.id}:${r.flytt_id}`).join(',');
  const [lage, setLage] = useState<TidLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);

  useEffect(() => {
    if (!rader) return;
    let avbruten = false;
    if (aktuella.length === 0) { setLage({ lage: 'klar', forslag: new Map() }); return; }
    setLage({ lage: 'laddar' });
    (async () => {
      try {
        const flyttIds = aktuella.map(r => r.flytt_id!) as string[];
        const flyttTillDag = new Map<string, string | null>();
        for (const b of bitar(flyttIds)) {
          const r = await medAbortRetry(() => supabase.from('maskin_flytt').select('id, flyttdag_id').in('id', b) as any);
          if (r.error) throw r.error;
          for (const f of (r.data ?? []) as { id: string; flyttdag_id: string | null }[]) flyttTillDag.set(f.id, f.flyttdag_id);
        }
        const dagIds = Array.from(new Set(Array.from(flyttTillDag.values()).filter(Boolean))) as string[];
        const rundor = new Map<string, { start: string | null; slut: string | null; autoAv: string | null }>();
        const ben = new Map<string, TidBen[]>();
        for (const b of bitar(dagIds)) {
          const [d, f] = await Promise.all([
            medAbortRetry(() => supabase.from('flyttdag').select('id, starttid, sluttid, auto_avslutad_av').in('id', b) as any),
            medAbortRetry(() => supabase.from('maskin_flytt').select('id, flyttdag_id, sluttid, avbruten').in('flyttdag_id', b) as any),
          ]);
          if (d.error) throw d.error;
          if (f.error) throw f.error;
          for (const r of (d.data ?? []) as any[]) rundor.set(r.id, { start: r.starttid, slut: r.sluttid, autoAv: r.auto_avslutad_av });
          for (const r of (f.data ?? []) as any[]) {
            if (r.avbruten) continue;
            const lista = ben.get(r.flyttdag_id) ?? [];
            lista.push({ id: r.id, sluttid: r.sluttid });
            ben.set(r.flyttdag_id, lista);
          }
        }
        const forslag = new Map<string, TidForslag>();
        for (const u of aktuella) {
          const dag = flyttTillDag.get(u.flytt_id!);
          const runda = dag ? rundor.get(dag) : undefined;
          forslag.set(u.id, !dag || !runda
            ? { lage: 'saknas', orsak: 'Flytten hör inte till någon runda' }
            : traillertid(u.flytt_id!, runda, ben.get(dag) ?? []));
        }
        if (!avbruten) setLage({ lage: 'klar', forslag });
      } catch (e) {
        console.error('[lastbil] traillertid: läsfel', e);
        if (!avbruten) setLage({ lage: 'fel' });
      }
    })();
    return () => { avbruten = true; };
    // aktuella bestäms helt av nyckel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel, !!rader, omforsok]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  return { lage, forsokIgen };
}
