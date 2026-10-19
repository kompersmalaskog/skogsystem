'use client';

// EN BRICKA i dockan: ikon, kort namn och svaret. Ett tryck markerar den (och ger Bra om den är obesvarad) — se lib/egenkontrollBricka.ts.
//
// AVSTEG 2/7 FRÅN PLANERINGSVYN: SVARSSTATUS PÅ VARJE BRICKA.
// Planeringsvyns knappar (symbolerna i dockan) säger bara VAD man kan sätta ut; de bär ingen status, för en symbol är inte "besvarad".
// En brickas hela poäng är att man ser på en sekund, med blicken på skogen, vad som är gjort och vad som är kvar. Därför bär varje bricka
// sitt svar i ord OCH tecken (✓ Bra, ~ Godkänt, ! Bättre, Kvar) — färg bär aldrig ensam (rött i solljus är brunt), och Godkänt är
// medvetet inte blått (blått är bara "navigerar eller avbryter"). Den markerade brickan är inverterad (vit med svart text), så markeringen
// inte heller hänger på en färg.

import { AVSTAND, FARG, IKON, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Ikon from '@/components/design/Ikon';
import { BRICKSTATUS, OBESVARAD_ORD, type Bricka as BrickaData } from '@/lib/egenkontrollBricka';

export type BrickaProps = {
  bricka: BrickaData;
  markerad: boolean;
  sparar: boolean;
  onTryck: () => void;
};

export default function Bricka({ bricka, markerad, sparar, onTryck }: BrickaProps) {
  const st = bricka.status ? BRICKSTATUS[bricka.status] : undefined;
  const ord = sparar ? 'Sparar…' : st ? `${st.tecken} ${st.ord}` : OBESVARAD_ORD;
  // Markerad = inverterad. Omarkerad: svaret i sin färg (grön Bra, grå Godkänt, orange Bättre) men ordet står alltid bredvid.
  const statusFarg = markerad ? FARG.bg : st ? FARG[st.farg] : FARG.text2;
  return (
    <button
      type="button"
      onClick={onTryck}
      aria-pressed={markerad}
      aria-label={`${bricka.rubrik}, ${st ? st.ord : 'obesvarad'}`}
      data-testid="bricka"
      data-bricka-id={bricka.id}
      data-status={bricka.status ?? ''}
      style={{
        minHeight: TRAFFYTA.min, minWidth: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: AVSTAND.xs,
        padding: `0 ${AVSTAND.s}px`, border: 'none', borderRadius: RADIE.knapp, fontFamily: 'inherit', textAlign: 'left',
        background: markerad ? FARG.text : FARG.upphojt, color: markerad ? FARG.bg : FARG.text,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Ikon namn={bricka.ikon} storlek={IKON.text} farg="inherit" />
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ ...TYP.meta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bricka.namn}</span>
        <span style={{ ...TYP.micro, letterSpacing: 'normal', color: statusFarg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ord}</span>
      </span>
    </button>
  );
}
