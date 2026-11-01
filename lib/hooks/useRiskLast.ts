'use client';

// Förarnas kvitton på riskbedömningen (tabellen trakt_risk_last). Admin läser alla kvitton för trakten (planerarens "Läst av …"), en förare bara sina egna
// (RLS). Ett kvitto gäller ett fingeravtryck av listan (lib/riskbedomning riskUnderlag): ändras listan gäller inte ett gammalt "Jag har läst".
// Tiden sätts av databasen. Läsfel är ett läge, aldrig "ingen har läst".

import { useCallback, useEffect, useRef, useState } from 'react';

export interface RiskKvitto { medarbetareId: string; underlag: string; lastAt: string }
export type RiskLastLage = 'laddar' | 'ok' | 'fel';

export interface RiskLastHook {
  kvitton: RiskKvitto[];
  lage: RiskLastLage;
  /** true = sparat (eller redan läst). I testläget sparas inget men kvittot syns. */
  kvittera: (underlag: string, maskinId: string | null) => Promise<boolean>;
}

export function useRiskLast(supabase: any, objektId: string | null, medarbetareId: string | null, testlage = false): RiskLastHook {
  const [kvitton, setKvitton] = useState<RiskKvitto[]>([]);
  const [lage, setLage] = useState<RiskLastLage>('laddar');
  const idRef = useRef(objektId);
  idRef.current = objektId;

  useEffect(() => {
    setKvitton([]);
    if (!objektId) { setLage('laddar'); return; }
    setLage('laddar');
    let avbruten = false;
    (async () => {
      try {
        const { data, error } = await supabase.from('trakt_risk_last').select('medarbetare_id, underlag, last_at').eq('objekt_id', objektId);
        if (avbruten) return;
        if (error || !Array.isArray(data)) { setLage('fel'); return; }
        setKvitton(data.map((r: any) => ({ medarbetareId: String(r.medarbetare_id), underlag: String(r.underlag), lastAt: String(r.last_at) })));
        setLage('ok');
      } catch {
        if (!avbruten) setLage('fel');
      }
    })();
    return () => { avbruten = true; };
  }, [supabase, objektId]);

  const kvittera = useCallback(async (underlag: string, maskinId: string | null): Promise<boolean> => {
    const id = idRef.current;
    if (!id || !medarbetareId) return false;
    const lokal: RiskKvitto = { medarbetareId, underlag, lastAt: new Date().toISOString() };
    if (testlage) { setKvitton((k) => [...k, lokal]); return true; }
    try {
      const { error } = await supabase.from('trakt_risk_last')
        .upsert({ objekt_id: id, medarbetare_id: medarbetareId, underlag, maskin_id: maskinId }, { onConflict: 'objekt_id,medarbetare_id,underlag', ignoreDuplicates: true });
      if (error) return false;
    } catch { return false; }
    if (idRef.current === id) setKvitton((k) => (k.some((x) => x.medarbetareId === medarbetareId && x.underlag === underlag) ? k : [...k, lokal]));
    return true;
  }, [supabase, medarbetareId, testlage]);

  return { kvitton, lage, kvittera };
}
