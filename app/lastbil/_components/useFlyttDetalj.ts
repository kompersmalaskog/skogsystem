'use client';

// Flytten bakom en rad, för sheeten "Flytten" — samma läsning oavsett om sheeten öppnas från Körningar eller
// Fakturering: det människan angav (id:n — vyn visar namn), det mätta (flytt_km), flyttens läge (pågår? avbruten?),
// underlaget i fakturaunderlag_flytt om det finns, och spåret (maskin_flytt_rattning, de senaste raderna).
// Läses bara av admin (ekonomi + spår). Ett läsfel är ett fel med Försök igen — sheeten öppnas aldrig på gissade värden,
// och "inget underlag" betyder bara att frågan lyckades och inte gav någon rad.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import type { UnderlagRad } from './fakturerbart';
import { UNDERLAG_FALT } from './useFakturerbart';

/** En rad ur spåret: varje rättning och strykning, med originalet som `fore` på äldsta raden. */
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

export interface FlyttDetalj {
  id: string;
  maskin_id: string | null;
  extern_maskin: string | null;
  fran_objekt_id: string | null;
  fran_plats_id: string | null;
  till_objekt_id: string | null;
  till_plats_id: string | null;
  flytt_typ: string;
  kund: string | null;
  flytt_km: number | null;
  fakturerbar: boolean;
  avbruten: boolean;
  /** NULL = flytten pågår (inte avslutad än). */
  sluttid: string | null;
  fran_lat: number | null;
  fran_lng: number | null;
  till_lat: number | null;
  till_lng: number | null;
  /** När flytten startade — rubrikens datum. */
  starttid: string | null;
  flyttdag_id: string | null;
  /** Var koordinaterna kom ifrån ('objekt' = från den valda trakten, 'gps', 'karta', 'flyttplats' …). */
  koord_kalla: string | null;
  /** Manuellt val av fakturering: true = fakturera ändå, false = fakturera inte, null = följ regeln. */
  fakturerbar_manuell: boolean | null;
  /** false = kolumnen finns inte i databasen än (migration 20261017100000 ej körd): inget manuellt val att visa. */
  manuell_finns: boolean;
}

export type DetaljLage =
  | { lage: 'laddar' | 'fel' }
  | { lage: 'klar'; flytt: FlyttDetalj | null; underlag: UnderlagRad | null; historik: Rattning[]; forare: string | null };

const FALT_UTAN_MANUELL = 'id, maskin_id, extern_maskin, fran_objekt_id, fran_plats_id, till_objekt_id, till_plats_id, flytt_typ, kund, flytt_km, fakturerbar, avbruten, sluttid, fran_lat, fran_lng, till_lat, till_lng, starttid, flyttdag_id, koord_kalla';
const FALT = `${FALT_UTAN_MANUELL}, fakturerbar_manuell`;
export const HISTORIK_ANTAL = 5;

/** Kolumnen fakturerbar_manuell saknas i databasen (migrationen ej körd): Postgres 42703 / PostgREST 'column … does not exist'. */
const kolumnSaknas = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (e.code === '42703' || /fakturerbar_manuell/.test(e.message ?? ''));

/** Flera underlag på samma flytt (ett struket och ett nytt): det som öppnades, annars det aktiva, annars det första. */
function valjUnderlag(rader: UnderlagRad[], onskat: string | null | undefined): UnderlagRad | null {
  return rader.find(r => r.id === onskat) ?? rader.find(r => r.status === 'aktiv') ?? rader[0] ?? null;
}

export function useFlyttDetalj(flyttId: string | null | undefined, underlagId?: string | null) {
  const [lage, setLage] = useState<DetaljLage>({ lage: 'laddar' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!flyttId) { setLage({ lage: 'klar', flytt: null, underlag: null, historik: [], forare: null }); return; }
    let avbruten = false;
    setLage(l => (l.lage === 'klar' ? l : { lage: 'laddar' }));
    (async () => {
      try {
        let manuellFinns = true;
        const [fl, un, sp] = await Promise.all([
          (async () => {
            const r = await medAbortRetry(() => supabase.from('maskin_flytt').select(FALT).eq('id', flyttId) as any);
            if (!kolumnSaknas(r.error)) return r;
            // Migrationen är inte körd: sheeten öppnas ändå, utan manuellt val (och säger det), i stället för att inte öppnas alls.
            manuellFinns = false;
            return medAbortRetry(() => supabase.from('maskin_flytt').select(FALT_UTAN_MANUELL).eq('id', flyttId) as any);
          })(),
          medAbortRetry(() => supabase.from('fakturaunderlag_flytt').select(UNDERLAG_FALT).eq('flytt_id', flyttId) as any),
          medAbortRetry(() => supabase.from('maskin_flytt_rattning')
            .select('id, flytt_id, tid, av, anledning, slag, fore, efter, underlag_atgard, position_atgard')
            .eq('flytt_id', flyttId).order('tid', { ascending: false }).limit(HISTORIK_ANTAL) as any),
        ]);
        if (fl.error || un.error || sp.error) throw fl.error ?? un.error ?? sp.error;
        if (avbruten) return;
        const rad = (fl.data ?? [])[0];
        // Föraren står i rubriken: den som körde rundan flytten ingick i (flyttdag.forare). Ett läsfel är ett fel, inte "förare saknas".
        let forare: string | null = null;
        if (rad?.flyttdag_id) {
          const dag = await medAbortRetry(() => supabase.from('flyttdag').select('id, forare').eq('id', rad.flyttdag_id) as any);
          if (dag.error) throw dag.error;
          forare = ((dag.data ?? [])[0]?.forare ?? '').trim() || null;
        }
        if (avbruten) return;
        const num = (v: unknown) => (v == null ? null : Number(v));
        const underlag = valjUnderlag(((un.data ?? []) as any[]).map(u => ({ ...u, km: num(u.km), km_original: num(u.km_original) })) as UnderlagRad[], underlagId);
        setLage({
          lage: 'klar',
          flytt: rad ? {
            ...rad, flytt_km: num(rad.flytt_km), fran_lat: num(rad.fran_lat), fran_lng: num(rad.fran_lng), till_lat: num(rad.till_lat), till_lng: num(rad.till_lng),
            fakturerbar: !!rad.fakturerbar, avbruten: !!rad.avbruten, sluttid: rad.sluttid ?? null,
            starttid: rad.starttid ?? null, flyttdag_id: rad.flyttdag_id ?? null, koord_kalla: rad.koord_kalla ?? null,
            fakturerbar_manuell: typeof rad.fakturerbar_manuell === 'boolean' ? rad.fakturerbar_manuell : null, manuell_finns: manuellFinns,
          } : null,
          underlag,
          historik: (sp.data ?? []) as Rattning[],
          forare,
        });
      } catch (e) {
        console.error('[lastbil] flytten: läsfel', e);
        if (!avbruten) setLage(l => (l.lage === 'klar' ? l : { lage: 'fel' }));
      }
    })();
    return () => { avbruten = true; };
  }, [flyttId, underlagId, nonce]);

  const laddaOm = useCallback(() => setNonce(n => n + 1), []);
  return { lage, laddaOm };
}
