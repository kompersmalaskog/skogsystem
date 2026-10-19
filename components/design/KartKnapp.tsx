'use client';

// KARTKNAPP — en knapp som ligger på en karta: täckt (FARG.kort, inte genomskinlig), ikon OCH ord (en symbol ensam är inte nog i en hytt),
// 48 px hög. Ligger i nedre delen av skärmen, där tummen når — aldrig i ett hörn uppe. Står still: tonar varken in eller ut.
// Ingen ram: kortet bär sin form med bakgrunden. Inte planeringsvyns genomskinliga cirkelknapp: den bär ett ord och ska vara läsbar i solljus.

import { AVSTAND, FARG, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Ikon from './Ikon';

export type KartKnappProps = {
  ikon: string;
  etikett: string;
  onClick: () => void;
  /** Standard = etiketten. Sätt den när knappen behöver ett längre namn för skärmläsare. */
  ariaLabel?: string;
  /** 52 px i stället för 48: knappen man trycker på med handske i skogen ("Notera här", fältbekräftat). Allt annat är 48. */
  stor?: boolean;
};

export default function KartKnapp({ ikon, etikett, onClick, ariaLabel, stor = false }: KartKnappProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? etikett}
      style={{
        display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: stor ? TRAFFYTA.primar + AVSTAND.xs : TRAFFYTA.primar, minWidth: TRAFFYTA.primar,
        padding: `0 ${AVSTAND.l}px`, borderRadius: TRAFFYTA.primar / 2, border: 'none', background: FARG.kort,
        color: FARG.text, fontFamily: 'inherit', ...TYP.listtitel, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Ikon namn={ikon} farg="inherit" />
      {etikett}
    </button>
  );
}
