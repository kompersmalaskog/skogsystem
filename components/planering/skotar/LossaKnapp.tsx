'use client';

// Knappen "Lossa · Avlägg 2" — nere vid kartan, bara medan maskinen står i ett avläggs zon (lib/skotarLass/zon) och försvinner när föraren kör därifrån.
// Det är det ENDA sättet (utöver + › Registrera lass) ett lass börjar: appen frågar aldrig av sig själv. Trycket öppnar lasskortet (AndraLassArk) med utkastet.
// Tryckytan är 56 px hög (hytten skakar, handskar).

import React, { useEffect, useState } from 'react';
import { AVSTAND, FARG, medSafeBotten } from '@/lib/design/tokens';
import { lossaText } from '@/lib/skotarLass/zon';
import type { Avlagg } from '@/lib/skotarLass/typer';
import { knappPrimar } from './stil';

/** Höjden (px) på kortet nertill just nu (0 = inget kort), så knappen lägger sig OVANFÖR det i stället för under. Kortet har data-nertill-kort. */
function useNertillHojd(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const mat = () => {
      const el = document.querySelector('[data-nertill-kort]') as HTMLElement | null;
      setH(el ? Math.ceil(el.getBoundingClientRect().height) : 0);
    };
    mat();
    const iv = window.setInterval(mat, 300);
    return () => window.clearInterval(iv);
  }, []);
  return h;
}

/** `val` = alla avlägg knappen ska erbjuda. Två eller fler (avlägg som ligger nära varandra) ger en knapp var, närmast först — aldrig en gissning. */
export function LossaKnapp({ avlagg, val, vidTryck }: { avlagg: Avlagg; val?: readonly Avlagg[]; vidTryck: (avlaggId: string) => void }) {
  const hojd = useNertillHojd();
  const knappar = val && val.length > 1 ? val : [avlagg];
  const flera = knappar.length > 1;
  return (
    <div data-testid="skotar-nedre-rad" data-val={flera ? knappar.length : undefined} style={{
      position: 'fixed', left: AVSTAND.l, right: 96, zIndex: 215, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: AVSTAND.s,
      bottom: `calc(${medSafeBotten(AVSTAND.l)} + ${hojd > 0 ? hojd + AVSTAND.s : 0}px)`,
    }}>
      {knappar.map((a) => (
        <button key={a.id} type="button" data-testid={flera ? `lossa-val-${a.id}` : 'lossa-knapp'} data-avlagg={a.id} onClick={() => vidTryck(a.id)}
          style={{ ...knappPrimar, flex: '0 1 auto', maxWidth: '100%', paddingLeft: AVSTAND.xl, paddingRight: AVSTAND.xl, border: `1px solid ${FARG.linje}` }}>
          {lossaText(a)}
        </button>
      ))}
    </div>
  );
}
