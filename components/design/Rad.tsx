'use client';
// Rad: EN rad i ett kort (Sektion), alltid på samma sätt — namn (TYP.listtitel) och en rad under (TYP.meta) till vänster, ett värde till höger,
// en chevron när raden går att trycka. Minst TRAFFYTA.min hög, en linje under (utom sista raden). Ingen ram, ingen hover.
//
// Tidigare fanns raden i fyra egna varianter (utbildning/ui, admin/ui, lastbil/RundaRad, lastbil/RundaArk). Den här är den gemensamma; de
// andra flyttar över av sina egna spår.
//
// `under` är en ReactNode så att en del av raden kan vara orange (det som saknas) — färg är aldrig ensam, ordet står alltid i texten.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AVSTAND, FARG, IKON, RAD, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Ikon from './Ikon';

type Props = {
  titel: ReactNode;
  under?: ReactNode;
  /** Till höger om namnet: ett tal eller kort text (TYP.listtitel, tabulära siffror). */
  hoger?: ReactNode;
  hogerUnder?: ReactNode;
  /** Skriv ut chevron även utan tryckyta (t.ex. när hela raden ändå är inuti en tryckbar sektion). Default: chevron när raden går att trycka. */
  pil?: boolean;
  onTryck?: () => void;
  href?: string;
  /** Sista raden i kortet ritar ingen linje under sig. */
  sista?: boolean;
  /** Klart/avslutat: samma text, svagare (skillen: status visas med styrka, inte egen färg). */
  dampad?: boolean;
  /** Test- och spårnyckel. */
  attr?: Record<string, string>;
};

export default function Rad({ titel, under, hoger, hogerUnder, pil, onTryck, href, sista, dampad, attr }: Props) {
  const tryckbar = !!(onTryck || href);
  const visaPil = pil ?? tryckbar;
  const stil = { ...RAD, borderBottom: sista ? 'none' : RAD.borderBottom, width: '100%', boxSizing: 'border-box', textAlign: 'left', color: FARG.text, font: 'inherit' } as const;

  const innehall = (
    <>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYP.listtitel, color: dampad ? FARG.text2 : FARG.text, overflowWrap: 'anywhere' }}>{titel}</div>
        {under != null && under !== '' && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{under}</div>}
      </div>
      {(hoger != null || hogerUnder != null) && (
        <div style={{ textAlign: 'right', flexShrink: 0, ...TNUM }}>
          {hoger != null && <div style={{ ...TYP.listtitel, color: dampad ? FARG.text2 : FARG.text }}>{hoger}</div>}
          {hogerUnder != null && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{hogerUnder}</div>}
        </div>
      )}
      {visaPil && <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />}
    </>
  );

  if (href) {
    return <Link href={href} {...(attr ?? {})} style={{ ...stil, textDecoration: 'none', cursor: 'pointer' }}>{innehall}</Link>;
  }
  if (onTryck) {
    return (
      // `border: 'none'` FÖRE spridningen: nollställer knappens egen ram, men raden behåller sin linje under. (Står den efter spridningen
      // — även med borderBottom omskriven — vinner den, eftersom en nyckel som redan finns i objektet behåller sin ursprungliga plats.)
      <button type="button" onClick={onTryck} {...(attr ?? {})}
        style={{ border: 'none', ...stil, background: 'none', cursor: 'pointer', fontFamily: 'inherit', minHeight: TRAFFYTA.min }}>
      {innehall}
      </button>
    );
  }
  return <div {...(attr ?? {})} style={stil}>{innehall}</div>;
}
