'use client';

// Läser Vidas frågemall för objektet och förarnas svar, och sparar ett svar i taget (lib/vidaEgenkontroll.ts för reglerna).
// Ett svar visas direkt (optimistiskt) och tas tillbaka om sparningen faller — då säger `fel` det. Aldrig tyst.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Roll, Svar } from '@/lib/vidaEgenkontroll';

export interface EgenkontrollVidaData {
  lage: 'laser' | 'ok' | 'fel';
  items: unknown;
  cert: string | null;
  grot: boolean | null;
  typ: string | null;
  svar: Record<string, Svar>;
  /** Senaste sparfel (visas i vyn); null = inget. */
  fel: string | null;
  svara: (nyckel: string, varde: string | null, kommentar?: string | null) => Promise<boolean>;
  lasOm: () => void;
}

export function useEgenkontrollVida(objektId: string | null, aktiv: boolean, roll: Roll | null, maskinId: string | null): EgenkontrollVidaData {
  const [lage, setLage] = useState<'laser' | 'ok' | 'fel'>('laser');
  const [obj, setObj] = useState<{ items: unknown; cert: string | null; grot: boolean | null; typ: string | null }>({ items: null, cert: null, grot: null, typ: null });
  const [svar, setSvar] = useState<Record<string, Svar>>({});
  const [fel, setFel] = useState<string | null>(null);
  const [varv, setVarv] = useState(0);
  const svarRef = useRef(svar);
  svarRef.current = svar;

  useEffect(() => {
    if (!aktiv || !objektId) return;
    let avbruten = false;
    setLage('laser');
    (async () => {
      const [o, s] = await Promise.all([
        supabase.from('objekt').select('checklist_items, cert, grot, typ').eq('id', objektId).maybeSingle(),
        supabase.from('egenkontroll_vida_svar').select('nyckel, varde, kommentar').eq('objekt_id', objektId),
      ]);
      if (avbruten) return;
      if (o.error || s.error) { console.warn('[egenkontroll] kunde inte läsa', o.error ?? s.error); setLage('fel'); return; }
      const r = (o.data ?? {}) as { checklist_items?: unknown; cert?: string | null; grot?: boolean | null; typ?: string | null };
      setObj({ items: r.checklist_items ?? null, cert: r.cert ?? null, grot: r.grot ?? null, typ: r.typ ?? null });
      const m: Record<string, Svar> = {};
      for (const rad of (s.data ?? []) as { nyckel: string; varde: string; kommentar: string | null }[]) m[rad.nyckel] = { varde: rad.varde, kommentar: rad.kommentar };
      setSvar(m);
      setLage('ok');
    })().catch((e) => { if (!avbruten) { console.warn('[egenkontroll] kunde inte läsa', e); setLage('fel'); } });
    return () => { avbruten = true; };
  }, [objektId, aktiv, varv]);

  const svara = useCallback(async (nyckel: string, varde: string | null, kommentar?: string | null): Promise<boolean> => {
    if (!objektId) return false;
    const fore = svarRef.current[nyckel];
    const nytt = { ...svarRef.current };
    if (varde == null) delete nytt[nyckel];
    else nytt[nyckel] = { varde, kommentar: kommentar ?? null };
    setSvar(nytt);
    setFel(null);
    const { error } = varde == null
      ? await supabase.from('egenkontroll_vida_svar').delete().eq('objekt_id', objektId).eq('nyckel', nyckel)
      : await supabase.from('egenkontroll_vida_svar').upsert({ objekt_id: objektId, nyckel, varde, kommentar: kommentar ?? null, roll, maskin_id: maskinId }, { onConflict: 'objekt_id,nyckel' });
    if (error) {
      console.warn('[egenkontroll] kunde inte spara', error);
      setSvar((nu) => { const t = { ...nu }; if (fore) t[nyckel] = fore; else delete t[nyckel]; return t; });
      setFel('Svaret kunde inte sparas. Försök igen.');
      return false;
    }
    return true;
  }, [objektId, roll, maskinId]);

  return { lage, ...obj, svar, fel, svara, lasOm: () => setVarv((v) => v + 1) };
}
