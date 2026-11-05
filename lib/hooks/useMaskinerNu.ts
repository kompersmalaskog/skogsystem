'use client';

// Läser maskinernas senaste position (RPC maskin_senaste_position) och maskinregistret, var 60:e sekund medan sidan syns,
// och ritar prickarna på kartan (lib/maskinerNu). Ett läsfel lämnar förra prickarna kvar och loggas — kartan påstår aldrig
// att en maskin står någon annanstans än den senast hördes. `utan` = den egna maskinen (maskinläget), som inte ritas.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { byggMaskinerNu, ritaMaskinerNu, MASKINER_NU_TRAFF, tryckText, type MaskinNu, type MaskinPosRad, type MaskinRegister } from '@/lib/maskinerNu';

export const MASKINER_NU_UPPDATERA_MS = 60_000;

export function useMaskinerNu({ map, aktiv, utan = null, onTryck }: { map: any; aktiv: boolean; utan?: string | null; onTryck?: (text: string, m: MaskinNu) => void }) {
  const [rader, setRader] = useState<MaskinPosRad[] | null>(null);
  const [register, setRegister] = useState<MaskinRegister[] | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    const las = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const [pos, reg] = await Promise.all([
        supabase.rpc('maskin_senaste_position'),
        supabase.from('dim_maskin').select('maskin_id, visningsnamn, maskin_typ, aktiv_till'),
      ]);
      if (avbruten) return;
      if (pos.error) { console.error('[MaskinerNu] positionerna kunde inte läsas:', pos.error); } else setRader((pos.data ?? []) as MaskinPosRad[]);
      if (reg.error) console.error('[MaskinerNu] maskinregistret kunde inte läsas:', reg.error); else setRegister((reg.data ?? []) as MaskinRegister[]);
      setTick((t) => t + 1);
    };
    void las();
    const id = setInterval(() => { void las(); }, MASKINER_NU_UPPDATERA_MS);
    const synlig = () => { if (document.visibilityState === 'visible') void las(); };
    document.addEventListener('visibilitychange', synlig);
    return () => { avbruten = true; clearInterval(id); document.removeEventListener('visibilitychange', synlig); };
  }, [aktiv]);

  // Färskheten räknas om vid varje läsning (tick), så en maskin som tystnat blir grå. Inga prickar förrän registret är läst
  // (annars står maskin-id:t i stället för namnet — 2026-11-05: "PONS20SDJAA270231" på kartan).
  const maskiner = useMemo(() => (aktiv && rader && register ? byggMaskinerNu(rader, register, new Date(), utan) : []), [aktiv, rader, register, utan, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map) return;
    ritaMaskinerNu(map, maskiner);
  }, [map, maskiner]);

  useEffect(() => {
    if (!map || !onTryck) return;
    const klick = (e: any) => {
      const f = e?.features?.[0]; const id = f?.properties?.maskinId;
      const m = maskiner.find((x) => x.maskinId === id);
      if (m) onTryck(tryckText(m), m);
    };
    try { map.on('click', MASKINER_NU_TRAFF, klick); } catch { return; }
    return () => { try { map.off('click', MASKINER_NU_TRAFF, klick); } catch { /* */ } };
  }, [map, maskiner, onTryck]);

  return maskiner;
}
