'use client';

import { FelRad, TryckRad } from './AttGoraKort';
import type { VantarLage } from './useVantar';
import type { Pamminnelse } from './vantar';

/**
 * Påminnelsen — som Arbetsrapportens väntar-rad: EN rad, bara när något väntar, bara admin. Trycket leder rakt till listan
 * "Att godkänna" på fakturasidan. Inget väntar → ingen rad alls (aldrig "0 väntar").
 * Ett läsfel är ett fel (aldrig "inget väntar"): raden säger det och erbjuder Försök igen.
 */
export default function VantarRad({ lage, pamminnelse, onOppna, onForsokIgen, sista }: {
  lage: VantarLage; pamminnelse: Pamminnelse | null; onOppna: (p: Pamminnelse) => void; onForsokIgen: () => void; sista?: boolean;
}) {
  if (lage.lage === 'fel') {
    return <FelRad attr={{ 'data-vantar': '' }} sista={sista} text="Kunde inte läsa vad som väntar på godkännande" onForsokIgen={onForsokIgen} />;
  }
  if (lage.lage !== 'klar' || !pamminnelse) return null;
  return <TryckRad attr={{ 'data-vantar': '' }} prick sista={sista} text={pamminnelse.text} onTryck={() => onOppna(pamminnelse)} />;
}
