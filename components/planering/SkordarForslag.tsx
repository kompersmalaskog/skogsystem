'use client';

// "Skördaren har kört här: Gallring Vällust · 644 stammar · 5–6 okt  [Koppla]" — ett tryck, inget att leta efter.
// Visas på ett jobb utan Vida-nummer (Starta jobb) som ännu saknar skördardata. Reglerna och texterna: lib/skordarForslag.ts.
// Efter kopplingen läser sidan om högarna och skotarens Kvar (onKopplad) — då försvinner frågan av sig själv (RPC:n ger inget förslag längre).

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { KorvyNertillList } from './KorvyNertillList';
import { arAvvisat, avvisa, forslagText, hamtaSkordarForslag, kopplaSkordarObjekt, type SkordarForslag as Forslag } from '@/lib/skordarForslag';

export function SkordarForslag({ objektId, aktiv, smal, onKopplad }: {
  objektId: string | null;
  /** false = rendera inget och fråga inget (annan list är uppe, ingen behörighet …) */
  aktiv: boolean;
  smal: boolean;
  onKopplad: () => void;
}) {
  const [forslag, setForslag] = useState<Forslag | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);

  useEffect(() => {
    setForslag(null); setFel(null);
    if (!objektId) return;
    let avbruten = false;
    (async () => {
      const lista = await hamtaSkordarForslag(supabase, objektId);
      if (avbruten) return;
      setForslag(lista.find((f) => !arAvvisat(objektId, f.stamObjektId)) ?? null);
    })();
    return () => { avbruten = true; };
  }, [objektId]);

  if (!aktiv || !objektId || !forslag) return null;
  const t = forslagText(forslag);
  const koppla = async () => {
    if (sparar) return;
    setSparar(true); setFel(null);
    const r = await kopplaSkordarObjekt(supabase, objektId, forslag.stamObjektId);
    setSparar(false);
    if (!r.ok) { setFel('Det gick inte att koppla. Försök igen.'); return; }
    setForslag(null);
    onKopplad();
  };
  return (
    <KorvyNertillList
      testid="skordar-forslag"
      smal={smal}
      stapla
      text={fel ?? t.fraga}
      knappar={[
        { etikett: 'Inte nu', onClick: () => { avvisa(objektId, forslag.stamObjektId); setForslag(null); }, testid: 'skordar-forslag-nej' },
        { etikett: sparar ? 'Kopplar …' : t.svar, onClick: koppla, av: sparar, primar: true, testid: 'skordar-forslag-ja' },
      ]}
    />
  );
}
