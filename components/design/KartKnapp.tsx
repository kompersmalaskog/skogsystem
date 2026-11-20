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
  /**
   * Tre knappar på en rad (Notera här, Rita, Lager) ryms inte på en telefon med 16 px sidopadding: under 400 px skärmbredd är sidopaddingen 12 i stället för 16
   * (390 px: 340 av 358 px). Standard: 16.
   */
  smalt?: boolean;
  /**
   * Ordet göms på en SMAL skärm (under 370 px) och knappen blir bara sin ikon — ariaLabel kvar, samma 48 px träffyta. Bara för en knapp som delar rad med två
   * andra och inte ryms ens med smalt (360 px). Standard: ordet står alltid. Implicerar smalt.
   */
  ordSmalt?: boolean;
};

export default function KartKnapp({ ikon, etikett, onClick, ariaLabel, stor = false, smalt = false, ordSmalt = false }: KartKnappProps) {
  const tight = smalt || ordSmalt;
  return (
    <>
      {tight && <style>{'@media (max-width: 399px) { .kartknapp-smalt { padding: 0 12px !important; } } @media (max-width: 369px) { .kartknapp-ord-smalt { display: none; } }'}</style>}
    <button
      type="button"
      className={tight ? 'kartknapp-smalt' : undefined}
      onClick={onClick}
      aria-label={ariaLabel ?? etikett}
      style={{
        display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: stor ? TRAFFYTA.primar + AVSTAND.xs : TRAFFYTA.primar, minWidth: TRAFFYTA.primar,
        padding: `0 ${AVSTAND.l}px`, borderRadius: TRAFFYTA.primar / 2, border: 'none', background: FARG.kort,
        color: FARG.text, fontFamily: 'inherit', ...TYP.listtitel, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', whiteSpace: 'nowrap',
      }}
    >
      <Ikon namn={ikon} farg="inherit" />
      {ordSmalt ? <span className="kartknapp-ord-smalt">{etikett}</span> : etikett}
    </button>
    </>
  );
}
