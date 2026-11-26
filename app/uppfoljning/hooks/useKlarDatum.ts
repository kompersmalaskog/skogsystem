'use client';
// Traktens klar-datum ur helikopterns plan (lib/klarDatum). Samma kedja som
// helikoptern: helikopter_ny_klar → medPrognoser (G15-förslag, uppmätt volym,
// följande takt) → raknaAlla. Ett läsfel ger inget datum, aldrig en gissning.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaKlar, hamtaPrognosUtfall, hamtaSkogKort } from '@/app/helikopter/_lib/queries';
import { medPrognoser, raknaAlla, type KlarRoll } from '@/app/helikopter/_lib/klar';
import { klarDatumFor, type KlarDatum } from '../lib/klarDatum';
import { svenskIdag } from '../lib/datum';

export type KlarDatumSvar = Partial<Record<KlarRoll, KlarDatum>>;

export function useKlarDatum(voNummer: string | null | undefined, aktiv: boolean): KlarDatumSvar | null {
  const [svar, setSvar] = useState<KlarDatumSvar | null>(null);
  useEffect(() => {
    setSvar(null);
    if (!aktiv || !voNummer) return;
    let avbruten = false;
    (async () => {
      try {
        const idag = svenskIdag();
        const ar = Number(idag.slice(0, 4)), manad = Number(idag.slice(5, 7));
        const [obj, klar, utfall, skog] = await Promise.all([
          supabase.from('objekt').select('id').eq('vo_nummer', voNummer).limit(2),
          hamtaKlar(ar, manad, idag),
          hamtaPrognosUtfall(),
          hamtaSkogKort(),
        ]);
        if (avbruten) return;
        // Inget eller två objekt med numret: vi vet inte vilken trakt det är.
        if (obj.error || !obj.data || obj.data.length !== 1 || klar.error || !klar.data) return;
        const planer = raknaAlla(medPrognoser(klar.data, utfall.error ? null : utfall.data, skog.error ? null : skog.data));
        setSvar(klarDatumFor(planer, String(obj.data[0].id)));
      } catch (e) {
        console.error('[uppfoljning] klar-datum ur helikoptern', e);
      }
    })();
    return () => { avbruten = true; };
  }, [voNummer, aktiv]);
  return svar;
}
