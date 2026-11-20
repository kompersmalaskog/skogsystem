'use client';

// "Nytt avlägg här?" — frågan efter + › Registrera lass när maskinen står där inget avlägg finns. Den ställs ALDRIG av sig själv: föraren har tryckt Registrera lass.
// Ja lägger ett eget avlägg mitt på stoppet och öppnar lasskortet där; Nej gör ingenting.

import React from 'react';
import { AVSTAND, TYP } from '@/lib/design/tokens';
import type { NyttAvlaggFraga } from '@/lib/hooks/useSkotarLass';
import { knappPrimar, knappStor, meta, nertillKort } from './stil';

export function NyttAvlaggKort({ fraga, nummer, onSvar }: { fraga: NyttAvlaggFraga; nummer: string; onSvar: (ja: boolean) => void }) {
  return (
    <div data-testid="nytt-avlagg-kort" data-nertill-kort="" data-ts={fraga.ts} role="alertdialog" aria-label="Nytt avlägg här?" style={nertillKort}>
      <div style={{ padding: AVSTAND.l }}>
        <div style={{ ...TYP.listtitel }}>Nytt avlägg här?</div>
        <div style={meta}>Du står en bit från alla avlägg. Det blir Avlägg {nummer}.</div>
        <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.m }}>
          <button type="button" data-testid="nytt-avlagg-ja" onClick={() => onSvar(true)} style={{ ...knappPrimar, flex: 1 }}>Ja, nytt avlägg</button>
          <button type="button" data-testid="nytt-avlagg-nej" onClick={() => onSvar(false)} style={{ ...knappStor, flex: 1 }}>Nej</button>
        </div>
      </div>
    </div>
  );
}
