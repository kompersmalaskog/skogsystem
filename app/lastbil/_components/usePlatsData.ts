'use client';

// Maskiner, trakter (objekt) och flyttplatser att välja bland i Rätta flytt. Läses först när formuläret öppnas.
// Ett läsfel är ett fel (aldrig en halv lista som ser komplett ut) — formuläret säger det och erbjuder Försök igen.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { hamtaAlla } from '@/lib/supabaseAlla';

export interface MaskinVal { maskin_id: string; namn: string }
export interface PlatsKandidat { slag: 'objekt' | 'plats'; id: string; namn: string; lat: number | null; lng: number | null; sub: string }
export interface PlatsData { maskiner: MaskinVal[]; platser: PlatsKandidat[] }

export type PlatsDataLage = { lage: 'laddar' | 'fel' } | { lage: 'klar'; data: PlatsData };

export function usePlatsData(aktiv: boolean) {
  const [lage, setLage] = useState<PlatsDataLage>({ lage: 'laddar' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    setLage({ lage: 'laddar' });
    (async () => {
      try {
        const [m, o, p] = await Promise.all([
          medAbortRetry(() => supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell, maskin_typ').order('maskin_typ').order('maskin_id') as any),
          medAbortRetry(() => hamtaAlla<any>(() => supabase.from('objekt').select('id, namn, lat, lng, status') as any, 'id')),
          medAbortRetry(() => supabase.from('flyttplats').select('id, namn, typ, lat, lng, aktiv').eq('aktiv', true).order('namn') as any),
        ]);
        if (m.error) throw m.error;
        if (o.error) throw o.error;
        if (p.error) throw p.error;
        if (avbruten) return;
        const maskiner = (m.data ?? []).map((x: any) => ({ maskin_id: x.maskin_id, namn: x.visningsnamn || x.modell || 'Okänd maskin' }));
        const platser: PlatsKandidat[] = [
          ...(p.data ?? []).map((x: any) => ({ slag: 'plats' as const, id: x.id, namn: x.namn, lat: x.lat ?? null, lng: x.lng ?? null, sub: x.typ ?? 'plats' })),
          ...(o.data ?? []).filter((x: any) => x.namn).map((x: any) => ({ slag: 'objekt' as const, id: x.id, namn: x.namn, lat: x.lat ?? null, lng: x.lng ?? null, sub: x.status ?? 'trakt' })),
        ];
        setLage({ lage: 'klar', data: { maskiner, platser } });
      } catch (e) {
        console.error('[lastbil] rätta flytt: läsfel', e);
        if (!avbruten) setLage({ lage: 'fel' });
      }
    })();
    return () => { avbruten = true; };
  }, [aktiv, nonce]);

  const forsokIgen = useCallback(() => setNonce(n => n + 1), []);
  return { lage, forsokIgen };
}

/** Fågelväg i km mellan två punkter. */
export function avstandKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
