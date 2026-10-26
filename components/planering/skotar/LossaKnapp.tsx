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

export function LossaKnapp({ avlagg, vidTryck }: { avlagg: Avlagg; vidTryck: () => void }) {
  const hojd = useNertillHojd();
  return (
    <div data-testid="skotar-nedre-rad" style={{
      position: 'fixed', left: AVSTAND.l, right: 96, zIndex: 215, display: 'flex',
      bottom: `calc(${medSafeBotten(AVSTAND.l)} + ${hojd > 0 ? hojd + AVSTAND.s : 0}px)`,
    }}>
      <button type="button" data-testid="lossa-knapp" data-avlagg={avlagg.id} onClick={vidTryck}
        style={{ ...knappPrimar, flex: '0 1 auto', maxWidth: '100%', paddingLeft: AVSTAND.xl, paddingRight: AVSTAND.xl, border: `1px solid ${FARG.linje}` }}>
        {lossaText(avlagg)}
      </button>
    </div>
  );
}
