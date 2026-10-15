'use client';

import Flikkontroll from '@/components/design/Flikkontroll';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, LAYOUT, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Remsa from './Remsa';
import type { Flik } from './url';
import { bytTyp, kanGaBakat, kanGaFramat, periodEtikett, periodKort, stegaPeriod, type Period } from './period';
import type { FakturerbartStatus } from './useFakturerbart';

/**
 * Den fasta rubriken: flikarna, perioden (Månad | År) och, för admin, fakturerbart-remsan.
 * Sticky i flödet (skillen: aldrig fixed + uppmätt paddingTop) — rubriken reserverar sin egen höjd.
 * Perioden gäller Körningar och Fakturering; på Nu finns inget val att göra, men remsan visar
 * fortfarande vald period så att den aldrig byter värde bara för att man bytt flik.
 */
export default function Rubrik({
  flik, onFlik, arAdmin, period, onPeriod, remsa, onRemsaForsokIgen,
}: {
  flik: Flik; onFlik: (f: Flik) => void; arAdmin: boolean;
  period: Period; onPeriod: (p: Period) => void;
  remsa: FakturerbartStatus; onRemsaForsokIgen: () => void;
}) {
  const flikar = [
    ['korningar', 'Körningar'],
    ...(arAdmin ? [['fakturering', 'Fakturering'] as const] : []),
    ['nu', 'Nu'],
  ] as const;
  const bak = kanGaBakat(period), fram = kanGaFramat(period);
  const stegKnapp = { ...KNAPP.lank, width: TRAFFYTA.min, justifyContent: 'center' } as const;

  return (
    <div style={{ position: 'sticky', top: LAYOUT.topbar, zIndex: 50, background: FARG.bg, padding: `${AVSTAND.l}px 0 ${AVSTAND.m}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <Flikkontroll flikar={flikar} aktiv={flik} onVal={onFlik} />

      {flik !== 'nu' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
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
      )}

      {arAdmin && <Remsa etikett={periodKort(period)} status={remsa} onForsokIgen={onRemsaForsokIgen} />}
    </div>
  );
}
