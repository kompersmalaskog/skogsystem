'use client';

// Fordonsvyns små delar. Allt mått-, färg- och typvärde kommer ur lib/design/tokens — inga egna literaler.
// Sektion, Rad, Ark, Falt och Ikon är appens gemensamma (components/design); här finns bara det som är vyns eget.

import type { ReactNode } from 'react';
import Link from 'next/link';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import {
  AVSTAND, FARG, FONT, IKON, KNAPP, KOLUMN_CSS, ROT_MIN_HOJD, TRAFFYTA, TYP, designCss, kolumnRot,
} from '@/lib/design/tokens';
import type { Ton } from '@/lib/fordon/vy';

/** Vyns rot: svart, EN kolumn, sidmarginal, rörelse-CSS. Samma som Arbetsrapport och Inventarier. */
export function FordonVy({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: ROT_MIN_HOJD,
        ...kolumnRot('smal'),
        background: FARG.bg,
        color: FARG.text,
        fontFamily: FONT,
        WebkitFontSmoothing: 'antialiased',
        padding: `${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl}px`,
        boxSizing: 'border-box',
      }}
    >
      <style>{designCss}{KOLUMN_CSS}</style>
      {children}
    </div>
  );
}

/** Blå "‹ Fordon" — bara navigering. */
export function Tillbaka({ href, text }: { href: string; text: string }) {
  return (
    <div style={{ minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center' }}>
      <Link href={href} style={{ ...KNAPP.lank, textDecoration: 'none', marginLeft: -AVSTAND.s }}>
        <Ikon namn="chevron_left" storlek={IKON.rad} farg={FARG.bla} />
        {text}
      </Link>
    </div>
  );
}

/** Vad som laddas — aldrig en spinner utan text. */
export function Laddar({ text }: { text: string }) {
  return <p role="status" style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.xl}px 0` }}>{text}</p>;
}

/** Ett fel säger vad man ska göra, och har en knapp för det. */
export function FelLage({ rubrik, fel, onForsok }: { rubrik: string; fel: string; onForsok: () => void }) {
  return (
    <div style={{ margin: `${AVSTAND.xl}px 0` }}>
      <p role="alert" style={{ ...TYP.text, color: FARG.text, margin: 0 }}>{rubrik}</p>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px` }}>Kontrollera täckningen och försök igen. ({fel})</p>
      <button type="button" onClick={onForsok} style={KNAPP.sekundar}>Försök igen</button>
    </div>
  );
}

const TON_FARG: Record<Ton, string> = { rod: FARG.rod, orange: FARG.orange, dampad: FARG.text3 };

/** Prick + ord: "● Försenad". Ordet bär betydelsen, pricken förstärker (färg är aldrig ensam). */
export function StatusOrd({ ord, ton }: { ord: string; ton: Ton }) {
  return (
    <span data-status={ton} style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.inuti, ...TYP.meta, color: ton === 'dampad' ? FARG.text2 : FARG.text, whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ display: 'inline-block', width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: TON_FARG[ton], flexShrink: 0 }} />
      {ord}
    </span>
  );
}

/** Ett val i en lista i ett ark. Valet visas med en bock till höger — ordet står alltid i titeln. */
export function ValRad({ titel, under, vald, onTryck, sista, attr }: {
  titel: ReactNode; under?: ReactNode; vald?: boolean; onTryck: () => void; sista?: boolean; attr?: Record<string, string>;
}) {
  return (
    <Rad
      titel={titel}
      under={under}
      onTryck={onTryck}
      pil={false}
      sista={sista}
      hoger={vald ? <Ikon namn="check" storlek={IKON.rad} farg={FARG.text} /> : undefined}
      attr={{ role: 'radio', 'aria-checked': vald ? 'true' : 'false', ...(attr ?? {}) }}
    />
  );
}

/** Ett fel i ett ark — säger vad som hände, knappen ligger kvar. */
export function ArkFel({ fel }: { fel: string | null }) {
  if (!fel) return null;
  return <p role="alert" style={{ ...TYP.meta, color: FARG.orange, margin: `${AVSTAND.s}px 0 0` }}>{fel}</p>;
}

/** Dagens datum i svensk tid (YYYY-MM-DD) — aldrig UTC, annars blir det i går efter midnatt sommartid. */
export function idagLokal(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}
