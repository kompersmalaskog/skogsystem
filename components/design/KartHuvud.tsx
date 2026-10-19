'use client';

// KARTHUVUD — EN rad överst i en vy där kartan är hemmet: tillbaka-pil, vad vyn gäller, och (valfritt) hur mycket som är kvar.
// Ersätter TopBar + en egen pil + ett namnpiller + en vyväxlarknapp: "var är jag" står på ETT ställe.
//
// TVÅ UTSEENDEN, samma innehåll:
//   flytande   ett TÄCKT kort ovanpå kartan (FARG.kort, inte genomskinligt — det bär ett namn och ett antal, och rött i solljus är brunt).
//   sticky     en solid rad överst i en vanlig scrollande sida (ingen karta bakom).
//
// Byggd efter samma mått som planeringsvyns översta rad (hem, objektnamn, info) men inte samma form: täckt i stället för glas, och bara det
// man läser — inget man behöver nå med tummen ligger här (det ligger i rundvyns docka). Inga ramar: kortet bär sin form med bakgrunden.
// Planeringsvyn kan byta till den här i en egen PR.

import Link from 'next/link';
import { forwardRef, type ReactNode } from 'react';
import { AVSTAND, FARG, KOLUMN, LAYOUT, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Ikon from './Ikon';

/** Layoutmått (inte ett avstånd): det flytande huvudets höjd. Allt som ska ligga under det räknar med underKartHuvud(). */
export const KARTHUVUD_HOJD = 56;

/** `top` för något som ska ligga under det flytande huvudet, + `extraPx` luft. */
export function underKartHuvud(extraPx = 0): string {
  return `calc(${LAYOUT.safeTopp} + ${AVSTAND.s}px + ${KARTHUVUD_HOJD}px + ${extraPx}px)`;
}

export type KartHuvudProps = {
  /** Dit pilen leder (en länk, aldrig history.back — ingen webbläsare i en PWA). */
  tillbakaHref: string;
  tillbakaEtikett: string;
  titel: string;
  /** Raden under titeln, t.ex. "5 kvar". Ett ord med siffran — färg bär aldrig ensam. */
  meta?: string;
  /** Satt = titeln är en knapp (med pil ned) som öppnar vyns ark. Utelämnad = bara en text. */
  onTryck?: () => void;
  tryckEtikett?: string;
  /** Öppet ark: pilen pekar upp i stället för ned. */
  oppen?: boolean;
  /** Till höger om titeln (t.ex. en KartKnapp "Karta"). */
  hoger?: ReactNode;
  /** true = täckt kort över en karta; false (standard) = solid rad överst i en sida. */
  flytande?: boolean;
};

const KartHuvud = forwardRef<HTMLElement, KartHuvudProps>(function KartHuvud({ tillbakaHref, tillbakaEtikett, titel, meta, onTryck, tryckEtikett, oppen = false, hoger, flytande = false }, ref) {
  const innehall = (
    <>
      <span style={{ ...TYP.listtitel, color: FARG.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{titel}</span>
      {meta && <span style={{ ...TYP.meta, color: FARG.text2, flexShrink: 0, whiteSpace: 'nowrap' }}>{meta}</span>}
    </>
  );

  return (
    <header
      ref={ref}
      data-testid="kart-huvud"
      data-flytande={flytande ? '1' : '0'}
      style={{
        boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: AVSTAND.xs, fontFamily: 'inherit', color: FARG.text,
        ...(flytande
          ? {
              position: 'absolute', top: `calc(${LAYOUT.safeTopp} + ${AVSTAND.s}px)`, left: AVSTAND.l, right: AVSTAND.l, maxWidth: KOLUMN.ark, marginLeft: 'auto', marginRight: 'auto',
              height: KARTHUVUD_HOJD, zIndex: 10, padding: `0 ${AVSTAND.s}px 0 ${AVSTAND.xs}px`,
              background: FARG.kort, borderRadius: RADIE.sheet,
            }
          : {
              position: 'sticky', top: 0, zIndex: 20, height: LAYOUT.topbar, paddingTop: LAYOUT.safeTopp,
              paddingLeft: AVSTAND.xs, paddingRight: AVSTAND.l, background: FARG.bg,
            }),
      }}
    >
      <Link
        href={tillbakaHref}
        aria-label={tillbakaEtikett}
        style={{
          flexShrink: 0, width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center',
          textDecoration: 'none', WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Ikon namn="arrow_back" farg={FARG.bla} />
      </Link>

      {onTryck ? (
        <button
          type="button"
          onClick={onTryck}
          aria-label={tryckEtikett ?? titel}
          aria-expanded={oppen}
          style={{
            flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', gap: AVSTAND.s, padding: 0,
            border: 'none', background: 'none', color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          {innehall}
          <Ikon namn={oppen ? 'expand_less' : 'expand_more'} farg={FARG.text2} />
        </button>
      ) : (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>{innehall}</div>
      )}

      {hoger}
    </header>
  );
});

export default KartHuvud;
