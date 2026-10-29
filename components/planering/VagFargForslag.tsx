'use client';

// FÖRSLAGET VÄGSYMBOLER → VÄGFÄRG (Planeringsvyn, Martin 2026-10-28): EN fråga nertill, samma mönster som "Göra om de gröna pilarna till träd?".
// Texten överst ("Ge 2 vägar färg från symbolerna?"), under den EN rad om det som inte rörs, sedan Godkänn — och "Inte nu" som smal rad längst ner.
// Allt som räknas bor i lib/vagSymbolFarg; komponenten ritar bara.

import React from 'react';
import { KorvyNertillList } from './KorvyNertillList';
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import { vagForslagText, type VagForslag } from '@/lib/vagSymbolFarg';

export function VagFargForslag({ forslag, smal, onGodkann, onInteNu }: {
  forslag: VagForslag;
  smal: boolean;
  onGodkann: () => void;
  onInteNu: () => void;
}) {
  const t = vagForslagText(forslag);
  return (
    <KorvyNertillList
      testid="vagfarg-forslag-list"
      smal={smal}
      stapla
      text={<>{t.fraga}{t.orort && <div data-testid="vagfarg-forslag-orort" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{t.orort}</div>}</>}
      knappar={[
        { etikett: 'Inte nu', onClick: onInteNu, testid: 'vagfarg-forslag-nej' },
        { etikett: 'Godkänn', primar: true, onClick: onGodkann, testid: 'vagfarg-forslag-ja' },
      ]}
    />
  );
}
