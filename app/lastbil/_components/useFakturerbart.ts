'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { periodIntervall, periodTillText, type Period } from './period';
import { summeraFakturerbart, type FakturerbartSumma, type UnderlagRad } from './fakturerbart';

export type FakturerbartStatus =
  | { lage: 'laddar' }
  | { lage: 'klar'; summa: FakturerbartSumma; rader: UnderlagRad[] }
  | { lage: 'fel' };

const FALT = 'id, flytt_id, km, status, fakturerad_tid, kund, datum, maskin, fran_objekt_id, fran_plats_id, till_objekt_id, till_plats_id, struken_tid, struken_anledning, godkand_tid, godkand_av, km_original, kund_original, redigerad_tid, redigerad_av';

/**
 * Fakturerbart för en period, ur fakturaunderlag_flytt (ekonomidata: bara admin läser, RLS).
 * EN läsning bär både remsans summa och kvittots rader (Fakturering-fliken), så de aldrig skiljer sig åt.
 * Läses bara när `aktiv` — en förare ska aldrig skicka frågan och få en tyst tom lista.
 *
 * Ett läsfel är ett FEL, aldrig 0 km: remsan säger det och erbjuder "Försök igen". Pengatalet
 * (fakturerbart-summan) får aldrig visa en nolla för att läsningen misslyckades.
 */
export function useFakturerbart(period: Period, aktiv: boolean) {
  const [status, setStatus] = useState<FakturerbartStatus>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);
  const [tystOm, setTystOm] = useState(0);
  const nyckel = periodTillText(period);
  // Förra omläsningen visade "Läser …"; en TYST omläsning (efter Godkänn/Stryk) behåller det som
  // visas tills det nya svaret kommit — pengatalet i remsan får inte blinka till "–" av ett tryck.
  const senasteTyst = useRef(0);
  const senasteNyckel = useRef(nyckel);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    // Tyst bara när ENBART omläsningen utlöste effekten — byts perioden samtidigt visas "Läser …",
    // annars stod förra periodens tal under nya periodens rubrik.
    const tyst = tystOm !== senasteTyst.current && nyckel === senasteNyckel.current;
    senasteTyst.current = tystOm;
    senasteNyckel.current = nyckel;
    if (!tyst) setStatus({ lage: 'laddar' });
    const { fran, till } = periodIntervall(period);
    (async () => {
      const r = await medAbortRetry(() => hamtaAlla<UnderlagRad>(
        () => supabase.from('fakturaunderlag_flytt')
          .select(FALT)
          .gte('datum', fran)
          .lt('datum', till) as any,
        'id',
      ));
      if (avbruten) return;
      if (r.error) {
        console.error('[lastbil] fakturerbart: läsfel', r.error);
        // Ett fel i en tyst omläsning lämnar det som visas (det är ändå sant som det var): ett
        // Godkänn som gick igenom ska inte göra pengatalet till ett fel. Nästa omläsning rättar.
        if (!tyst) setStatus({ lage: 'fel' });
        return;
      }
      setStatus({ lage: 'klar', summa: summeraFakturerbart(r.data), rader: r.data });
    })();
    return () => { avbruten = true; };
    // period är helt bestämd av `nyckel`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel, aktiv, omforsok, tystOm]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  const laddaOmTyst = useCallback(() => setTystOm(n => n + 1), []);
  return { status, forsokIgen, laddaOmTyst };
}
