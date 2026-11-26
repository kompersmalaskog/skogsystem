'use client';
// Skördarens första dag med produktion per trakt — det appen kallar "avverkningen började".
// dim_objekt.start_date går inte att lita på (raden blandar maskiner: Bondeskog 2026 bar
// skotarens start), så den läses ur fakt_produktion, en fråga per trakt, fyra åt gången.
// Ett läsfel ger ingen dag för just den trakten (då gäller listans datum, om det är rimligt).
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { UppfoljningObjekt } from '../lib/transform';
import { kortNyckel } from '../lib/iSkogenSida';

const SAMTIDIGT = 4;

/** null medan dagarna läses; sedan nyckel → första dag ("YYYY-MM-DD"). */
export function useForstaDag(objekt: UppfoljningObjekt[]): Map<string, string> | null {
  const [dagar, setDagar] = useState<Map<string, string> | null>(null);
  const nyckel = objekt.map(o => `${kortNyckel(o)}:${(o.skordareObjektIds ?? [o.skordareObjektId]).join('+')}`).join(',');
  useEffect(() => {
    let avbruten = false;
    setDagar(null);
    const ut = new Map<string, string>();
    const ko = objekt.filter(o => (o.skordareObjektIds?.length ?? 0) > 0 || o.skordareObjektId);
    const arbetare = async () => {
      for (let o = ko.shift(); o; o = ko.shift()) {
        const ids = o.skordareObjektIds?.length ? o.skordareObjektIds : [o.skordareObjektId as string];
        try {
          const { data, error } = await supabase.from('fakt_produktion').select('datum').in('objekt_id', ids).order('datum', { ascending: true }).limit(1);
          if (error) throw error;
          const d = data?.[0]?.datum ? String(data[0].datum).slice(0, 10) : null;
          if (d) ut.set(kortNyckel(o), d);
        } catch (e) {
          console.warn('[i-skogen] kunde inte läsa första fällningsdagen', kortNyckel(o), e);
        }
      }
    };
    void Promise.all(Array.from({ length: SAMTIDIGT }, arbetare)).then(() => { if (!avbruten) setDagar(ut); });
    return () => { avbruten = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel]);
  return dagar;
}
