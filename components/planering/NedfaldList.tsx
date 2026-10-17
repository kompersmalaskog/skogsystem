'use client';

// ARKET SOM EN LIST NERTILL — det gemensamma mönstret när ett ark (Klar med trakten?, Om trakten …) ger plats åt kartan: arket stängs, kartan syns hel och
// EN smal list längst ner säger vad som visas/görs ("Tryck där avlägget ska ligga", "Basväg · 329 m") med vägen TILLBAKA som första knapp ("‹ Klar med trakten?",
// "‹ Lista"). Ett tryck på tillbaka öppnar arket igen där man var. Bygger på KorvyNertillList (samma mått, samma plats bredvid/ovanför plusknappen).

import React from 'react';
import { KorvyNertillList, type NertillKnapp } from './KorvyNertillList';

/** "‹ Lista"-knappen: första knappen i listen, alltid med vänsterpil. */
export const tillbakaKnapp = (etikett: string, onClick: () => void, testid: string): NertillKnapp => ({ etikett: etikett.startsWith('‹') ? etikett : `‹ ${etikett}`, onClick, testid });

export function NedfaldList({ testid, text, tillbaka, extra = [], smal }: {
  testid: string;
  /** vad som visas eller ska göras */
  text: React.ReactNode;
  /** vägen tillbaka till arket: etikett + vad som händer */
  tillbaka: { etikett: string; onClick: () => void; testid: string };
  /** fler knappar efter tillbaka (t.ex. × som släpper valet) */
  extra?: NertillKnapp[];
  smal: boolean;
}) {
  return <KorvyNertillList testid={testid} smal={smal} text={text} knappar={[tillbakaKnapp(tillbaka.etikett, tillbaka.onClick, tillbaka.testid), ...extra]} />;
}
