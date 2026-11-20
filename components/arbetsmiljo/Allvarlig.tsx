'use client';

// ALLVARLIG ELLER MINDRE ALLVARLIG — AFS 2023:1 11 §: av riskbedömningen ska det framgå vilka riskerna är OCH om de är allvarliga.
// En komponent för trakternas riskbedömning (components/planering/Risker) och maskinernas (MaskinRisker), så orden och färgen är desamma.

import Flikkontroll from '@/components/design/Flikkontroll';
import { FARG } from '@/lib/design/tokens';

export const ALLVARLIG_TEXT = { ja: 'Allvarlig', nej: 'Mindre allvarlig' } as const;

/** "Allvarlig · Från kartan" — allvarlig i orange, mindre allvarlig dämpad. Ordet bär betydelsen, färgen förstärker. */
export function AllvarligText({ allvarlig, efter }: { allvarlig: boolean; efter?: string }) {
  return (
    <span data-testid="risk-allvarlig">
      <span style={{ color: allvarlig ? FARG.orange : FARG.text2 }}>{allvarlig ? ALLVARLIG_TEXT.ja : ALLVARLIG_TEXT.nej}</span>
      {efter ? <span style={{ color: FARG.text3 }}>{` · ${efter}`}</span> : null}
    </span>
  );
}

/** Ett tryck: Allvarlig | Mindre allvarlig. */
export function AllvarligVal({ allvarlig, onVal }: { allvarlig: boolean; onVal: (allvarlig: boolean) => void }) {
  return (
    <Flikkontroll flikar={[['ja', ALLVARLIG_TEXT.ja], ['nej', ALLVARLIG_TEXT.nej]] as const} aktiv={allvarlig ? 'ja' : 'nej'}
      onVal={(v) => { if ((v === 'ja') !== allvarlig) onVal(v === 'ja'); }} />
  );
}
