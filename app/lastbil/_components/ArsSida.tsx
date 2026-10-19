'use client';

import { useMemo } from 'react';
import { AVSTAND, FARG, KNAPP, LAYOUT, TYP } from '@/lib/design/tokens';
import ArsVy from './ArsVy';
import Periodval from './Periodval';
import { periodEtikett, type Manad, type Period } from './period';
import { summera } from './rundor';
import type { RundorLage } from './useRundor';

/**
 * År-vyn som en egen sida (öppnas av raden "Hela 2026 ›" längst ner i Körningar): tillbaka-pilen går till månaden man kom
 * från ("‹ Oktober 2026"), sedan "‹ 2026 ›" (året byts här, inte i Körningar) och årets körning per månad (`ArsVy`, oförändrad).
 * Den visar körning (km, rundor, l/mil, övrig %), inte fakturering. Ett tryck på en månad går till månaden i Körningar.
 */
export default function ArsSida({ ar, onAr, tillbakaTill, lage, onForsokIgen, onTillbaka, onValjManad }: {
  ar: number; onAr: (ar: number) => void;
  /** Månaden man kom från. */
  tillbakaTill: Manad;
  lage: RundorLage; onForsokIgen: () => void; onTillbaka: () => void; onValjManad: (m: Manad) => void;
}) {
  const period: Extract<Period, { typ: 'ar' }> = { typ: 'ar', ar };
  const rundor = lage.lage === 'klar' ? lage.rundor : null;
  const summa = useMemo(() => (rundor ? summera(rundor) : null), [rundor]);
  return (
    <div data-ars-sida>
      <div style={{ position: 'sticky', top: LAYOUT.topbar, zIndex: 50, background: FARG.bg, padding: `${AVSTAND.s}px 0` }}>
        <button type="button" data-tillbaka onClick={onTillbaka} style={KNAPP.lank}>‹ {periodEtikett(tillbakaTill)}</button>
      </div>
      <h1 style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.titel }}>Körningar</h1>
      <div style={{ marginBottom: AVSTAND.m }}>
        <Periodval period={period} onPeriod={p => p.typ === 'ar' && onAr(p.ar)} />
      </div>
      {lage.lage === 'laddar' && <p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Läser körningar …</p>}
      {(lage.lage === 'fel' || (lage.lage === 'klar' && (!rundor || !summa))) && (
        <div style={{ textAlign: 'center', padding: `${AVSTAND.xl}px 0` }}>
          <p role="alert" style={{ ...TYP.text, color: FARG.rod, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Kunde inte läsa körningarna just nu.</p>
          <button type="button" onClick={onForsokIgen} style={KNAPP.sekundar}>Försök igen</button>
        </div>
      )}
      {rundor && summa && <ArsVy period={period} rundor={rundor} summa={summa} onValjManad={p => p.typ === 'man' && onValjManad(p)} />}
    </div>
  );
}
