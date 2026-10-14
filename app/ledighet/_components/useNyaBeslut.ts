'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaLedighetPrick, markeraLedighetSett } from '@/lib/ledighet/prick';

/**
 * Egna beslut (godkänd/nekad) som personen inte sett — ids, så att Mig-vyn kan visa dem överst
 * ("Nytt besked"). En NEKAD ansökan hamnar annars i den hopfällda Historiken, och då skulle pricken
 * försvinna utan att beslutet setts.
 *
 * Kvitteringen (ledighet_markera_sett) sker FÖRST när:
 *  - ansökningarna är lästa utan fel (`lasta`), och
 *  - serverns lista över nya beslut kunde läsas, och
 *  - listan har satts att visas.
 * Går något fel ligger pricken kvar — rätt: ett beslut som inte visats är inte sett. Kvitteringen avgränsas
 * till det senaste beslutet som visades (nya_beslut_till), så ett beslut som kommer in mellan läsningen och
 * kvitteringen aldrig kvitteras osett.
 *
 * `klar` = serverns svar är inne (med eller utan nya beslut, eller att det inte gick att läsa). Beskedsvyn måste
 * skilja "inga nya beslut" från "vet inte än" — annars visar den listan först och byter sedan skärm.
 */
export function useNyaBeslut(lasta: boolean): { ids: string[]; klar: boolean } {
  const [ids, setIds] = useState<string[]>([]);
  const [klar, setKlar] = useState(false);

  useEffect(() => {
    if (!lasta) return;
    let avbruten = false;
    (async () => {
      const p = await hamtaLedighetPrick(supabase);
      if (avbruten) return;
      if (!p || p.nyaBeslutIds.length === 0 || !p.nyaBeslutTill) { setKlar(true); return; }
      setIds(p.nyaBeslutIds);
      setKlar(true);
      await markeraLedighetSett(supabase, p.nyaBeslutTill);
    })();
    return () => { avbruten = true; };
  }, [lasta]);

  return { ids, klar };
}
