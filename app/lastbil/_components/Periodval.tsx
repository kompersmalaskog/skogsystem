'use client';

import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { kanGaBakat, kanGaFramat, periodEtikett, stegaPeriod, type Period } from './period';

/**
 * Perioden: "‹ Oktober 2026 ›" — steg bakåt/framåt med periodens namn mellan, och inget annat. Det finns EN väg att byta period
 * (Martin 2026-10-19): ingen Månad | År-växel. Körningar och fakturasidan har var sin väljare men perioden är EN (byter man månad på
 * fakturasidan står samma månad i Körningar när man går tillbaka). Uppföljningen har samma steg för året ("‹ 2026 ›").
 */
export default function Periodval({ period, onPeriod }: { period: Period; onPeriod: (p: Period) => void }) {
  const bak = kanGaBakat(period), fram = kanGaFramat(period);
  const stegKnapp = { ...KNAPP.lank, width: TRAFFYTA.min, justifyContent: 'center' } as const;
  return (
    <div data-periodval style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
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
