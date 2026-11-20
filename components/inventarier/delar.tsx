'use client';

// Inventarievyns små delar. Allt mått-, färg- och typvärde kommer ur lib/design/tokens — inga egna literaler.
// Sektion, Rad, Ark, Falt, TalRad och Ikon är appens gemensamma (components/design); här finns bara det som är vyns eget.

import type { ReactNode } from 'react';
import Link from 'next/link';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import {
  AVSTAND, FARG, FONT, IKON, KNAPP, KOLUMN_CSS, ROT_MIN_HOJD, TRAFFYTA, TYP, designCss, kolumnRot,
} from '@/lib/design/tokens';

/** Vyns rot: svart, EN kolumn, sidmarginal, rörelse-CSS. Som Arbetsrapportens: kolumnRot + ROT_MIN_HOJD + KOLUMN_CSS. */
export function InvVy({ children }: { children: ReactNode }) {
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

/** Blå "‹ Inventarier" — bara navigering. */
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
export function FelLage({ fel, onForsok }: { fel: string; onForsok: () => void }) {
  return (
    <div style={{ margin: `${AVSTAND.xl}px 0` }}>
      <p role="alert" style={{ ...TYP.text, color: FARG.text, margin: 0 }}>Kunde inte läsa inventarierna.</p>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px` }}>{fel}</p>
      <button type="button" onClick={onForsok} style={KNAPP.sekundar}>Försök igen</button>
    </div>
  );
}

/** Ett val i en lista i ett ark (typ, maskin, plats). Valet visas med en bock till höger — ordet står alltid i titeln. */
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

/** Ett fel från databasen i ett ark — visas som det är (funktionerna svarar på svenska). */
export function ArkFel({ fel }: { fel: string | null }) {
  if (!fel) return null;
  return <p role="alert" style={{ ...TYP.meta, color: FARG.orange, margin: `${AVSTAND.s}px 0 0` }}>{fel}</p>;
}

/** En rad text under en sektion, när något behöver förklaras en gång. */
export function Not({ children }: { children: ReactNode }) {
  return <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0` }}>{children}</p>;
}
