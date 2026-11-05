'use client';

// Läser var maskinerna står — SAMMA källa som Översikten (app/maskinflytt/maskinPlatser: flytt, produktion och appens GPS, nyast
// vinner; regeln i lib/maskinPlats) — och maskinregistret, var 60:e sekund medan sidan syns,
// och ritar prickarna på kartan (lib/maskinerNu). Ett läsfel lämnar förra prickarna kvar och loggas — kartan påstår aldrig
// att en maskin står någon annanstans än den senast hördes. `utan` = den egna maskinen (maskinläget), som inte ritas.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaMaskinPlatser } from '@/app/maskinflytt/maskinPlatser';
import { byggMaskinerNu, ritaMaskinerNu, MASKINER_NU_TRAFF, tryckText, type MaskinNu, type MaskinPosRad, type MaskinRegister } from '@/lib/maskinerNu';

export const MASKINER_NU_UPPDATERA_MS = 60_000;

/** En plats per maskin → raderna prickarna ritas ur. Klockslaget följer bara med när källan har ett (GPS, flytt); en
 *  produktionsdag är ett datum, och då står dagen bredvid namnet (lib/maskinerNu narText). */
export function platserTillRader(platser: ReadonlyMap<string, { namn: string; koordinat: { lat: number; lng: number } | null; objektId: string | null; tidpunkt: string | null }>): MaskinPosRad[] {
  const ut: MaskinPosRad[] = [];
  platser.forEach((p, maskin_id) => {
    if (!p.koordinat) return;
    const t = p.tidpunkt;
    ut.push({ maskin_id, roll: null, objekt_id: p.objektId, objekt_namn: p.namn, datum: t ? (t.length <= 10 ? t : new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })) : null, lat: p.koordinat.lat, lng: p.koordinat.lng, tid: t && t.length > 10 ? t : null });
  });
  return ut;
}

export function useMaskinerNu({ map, aktiv, utan = null, onTryck }: { map: any; aktiv: boolean; utan?: string | null; onTryck?: (text: string, m: MaskinNu) => void }) {
  const [rader, setRader] = useState<MaskinPosRad[] | null>(null);
  const [register, setRegister] = useState<MaskinRegister[] | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    const las = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const reg = await supabase.from('dim_maskin').select('maskin_id, visningsnamn, maskin_typ, aktiv_till');
        if (avbruten) return;
        if (reg.error) { console.error('[MaskinerNu] maskinregistret kunde inte läsas:', reg.error); return; }
        const register = (reg.data ?? []) as MaskinRegister[];
        setRegister(register);
        const pos = await hamtaMaskinPlatser(register.map((m) => m.maskin_id).filter(Boolean));
        if (avbruten) return;
        if (pos.fel) { console.error('[MaskinerNu] positionerna kunde inte läsas:', pos.fel); }
        else {
          if (pos.delvisFel) console.error('[MaskinerNu] positionerna: delfel', pos.delvisFel);
          setRader(platserTillRader(pos.platser));
        }
      } catch (e) { console.error('[MaskinerNu] kunde inte läsas:', e); return; }   // ett tillägg som aldrig får fälla kartan
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
