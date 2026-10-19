'use client';

import { AVSTAND, FARG, KNAPP, KORT, LAYOUT, TYP } from '@/lib/design/tokens';
import FaktureringFlik from './FaktureringFlik';
import Periodval from './Periodval';
import Remsa from './Remsa';
import VantarRad from './VantarRad';
import { periodKort, type Manad } from './period';
import type { FakturerbartStatus } from './useFakturerbart';
import type { VantarLage } from './useVantar';
import type { Pamminnelse } from './vantar';

/**
 * Fakturasidan — en EGEN sida (bara admin) som raden "Fakturering · oktober  36 km ›" på huvudsidan öppnar, med tillbaka-pil.
 * Uppifrån: tillbaka-pilen, rubriken, periodväljaren "‹ Oktober 2026 ›" (bara månader — ingen Månad | År-växel; egen, men EN period för hela Lastbilen), summan med uppdelningen
 * hos faktureringen / fakturerade / strukna (`Remsa`: samma läsning som listan, så de aldrig kan skilja), en rad om det som
 * väntar i en ANNAN period, och kvittot (`FaktureringFlik`: Att godkänna, Hos faktureringen, Fakturerade, Strukna).
 */
export default function FaktureringSida({ period, onPeriod, status, namn, vantar, pamminnelse, onOppnaVantande, onVantarForsokIgen, onTillbaka, onForsokIgen, onAndrad }: {
  period: Manad; onPeriod: (p: Manad) => void;
  status: FakturerbartStatus;
  /** Den som godkänner (medarbetarens namn) — sparas som godkand_av. */
  namn: string;
  vantar: VantarLage; pamminnelse: Pamminnelse | null; onOppnaVantande: (p: Pamminnelse) => void; onVantarForsokIgen: () => void;
  onTillbaka: () => void; onForsokIgen: () => void; onAndrad: () => void;
}) {
  const visaVantar = vantar.lage === 'fel' || !!pamminnelse;
  return (
    <div data-fakturering-sida>
      <div style={{ position: 'sticky', top: LAYOUT.topbar, zIndex: 50, background: FARG.bg, padding: `${AVSTAND.s}px 0` }}>
        <button type="button" data-tillbaka onClick={onTillbaka} style={KNAPP.lank}>‹ Lastbilen</button>
      </div>
      <h1 style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.titel }}>Fakturering</h1>
      <div style={{ marginBottom: AVSTAND.l }}>
        <Periodval period={period} onPeriod={p => p.typ === 'man' && onPeriod(p)} />
      </div>
      <div style={{ marginBottom: AVSTAND.m }}>
        <Remsa etikett={periodKort(period)} status={status} onForsokIgen={onForsokIgen} />
      </div>
      {visaVantar && (
        <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0, marginBottom: AVSTAND.m }}>
          <VantarRad lage={vantar} pamminnelse={pamminnelse} onOppna={onOppnaVantande} onForsokIgen={onVantarForsokIgen} sista />
        </div>
      )}
      <FaktureringFlik period={period} status={status} namn={namn} onForsokIgen={onForsokIgen} onAndrad={onAndrad} />
    </div>
  );
}
