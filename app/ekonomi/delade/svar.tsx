'use client';

// Ekonomins gemensamma "svar först"-delar — samma form som markägarvyn
// (components/markagarrapport/Rapport.tsx): frågan i vanliga ord, svaret
// som skärmens enda stora tal, en rad under, och en orange rad bara för
// det som väntar. Raderna under är appens egna (components/design: Sektion
// och Rad); här finns bara det ekonomin behöver utöver dem — stapeln från
// en mittlinje och beloppet med sitt ord.

import type { ReactNode } from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { krText } from '@/lib/ekonomi/ackordVy';

export function SvarHuvud({ fraga, svar, under, vantar }: {
  fraga: string;
  svar: string;
  under?: ReactNode;
  /** Det som väntar (orange) — bara när något faktiskt väntar. */
  vantar?: string | null;
}) {
  return (
    <header style={{ margin: `${AVSTAND.xl}px 0 ${AVSTAND.xl}px` }} data-svar="">
      <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>{fraga}</p>
      <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.tal, color: FARG.text }}>{svar}</p>
      {under != null && <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.text, ...TNUM, color: FARG.text }}>{under}</p>}
      {vantar && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.orange }}>{vantar}</p>}
    </header>
  );
}

/** "33 156 kr mer" i grönt / "6 160 kr mindre" i rött. Ordet bär riktningen — färgen förstärker bara. */
export function Belopp({ kr }: { kr: number }) {
  return <span style={{ ...TNUM, color: kr > 0 ? FARG.gron : kr < 0 ? FARG.rod : FARG.text2 }}>{krText(kr)}</span>;
}

/**
 * Stapel från en mittlinje: grön åt höger = mer, röd åt vänster = mindre.
 * Längden är andel av den största raden (0–1). Färg är aldrig ensam: raden
 * bredvid säger "mer" eller "mindre" i ord.
 */
export function MittStapel({ kr, andel }: { kr: number; andel: number }) {
  const bredd = `${Math.max(0, Math.min(1, andel)) * 50}%`;
  return (
    <div aria-hidden="true" style={{ position: 'relative', height: AVSTAND.s, marginTop: AVSTAND.s }}>
      <div style={{ position: 'absolute', left: '50%', top: -AVSTAND.xs / 2, bottom: -AVSTAND.xs / 2, width: 1, background: FARG.text3 }} />
      <div style={{
        position: 'absolute', top: 0, height: AVSTAND.s, borderRadius: RADIE.stapel, width: bredd,
        background: kr < 0 ? FARG.rod : FARG.gron,
        ...(kr < 0 ? { right: '50%' } : { left: '50%' }),
      }} />
    </div>
  );
}
