'use client';

import Flikkontroll from '@/components/design/Flikkontroll';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { bytTyp, kanGaBakat, kanGaFramat, periodEtikett, stegaPeriod, type Period } from './period';

/**
 * Perioden: växeln Månad | År och steg bakåt/framåt med periodens namn mellan. Sitter under rubriken "Körningar" och på fakturasidan
 * (egen väljare på varje, men EN period: byter man månad på fakturasidan står samma månad i Körningar när man går tillbaka).
 */
export default function Periodval({ period, onPeriod }: { period: Period; onPeriod: (p: Period) => void }) {
  const bak = kanGaBakat(period), fram = kanGaFramat(period);
  const stegKnapp = { ...KNAPP.lank, width: TRAFFYTA.min, justifyContent: 'center' } as const;
  return (
    <div data-periodval style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
      <div style={{ flex: 'none' }}>
        <Flikkontroll flikar={[['man', 'Månad'], ['ar', 'År']] as const} aktiv={period.typ} onVal={t => onPeriod(bytTyp(period, t))} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" aria-label={period.typ === 'ar' ? 'Förra året' : 'Förra månaden'} disabled={!bak}
          onClick={() => bak && onPeriod(stegaPeriod(period, -1))} style={{ ...stegKnapp, ...(bak ? {} : INAKTIV) }}>
          <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>chevron_left</span>
        </button>
        <span style={{ ...TYP.listtitel, color: FARG.text }}>{periodEtikett(period)}</span>
        <button type="button" aria-label={period.typ === 'ar' ? 'Nästa år' : 'Nästa månad'} disabled={!fram}
          onClick={() => fram && onPeriod(stegaPeriod(period, 1))} style={{ ...stegKnapp, ...(fram ? {} : INAKTIV) }}>
          <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>chevron_right</span>
        </button>
      </div>
    </div>
  );
}
