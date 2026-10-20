'use client';

import { FelRad, TryckRad } from './AttGoraKort';
import { periodKort, type Period } from './period';
import type { FakturerbartStatus } from './useFakturerbart';

/**
 * "Fakturering · oktober   36 km ›" — sista raden i "Att göra" (bara admin). Summan är fakturerbart-talet (pengatalet) för vald period;
 * den byter värde bara när PERIODEN byts. Ett tryck öppnar fakturasidan. Ett läsfel är ett fel ("Kunde inte läsa · Försök igen"),
 * aldrig 0 km. Summan är summan av avrundade flyttar och räknar bara godkända (`summeraFakturerbart`, samma läsning som fakturasidan).
 */
export default function FaktureringRad({ period, status, onOppna, onForsokIgen }: {
  period: Period; status: FakturerbartStatus; onOppna: () => void; onForsokIgen: () => void;
}) {
  const text = `Fakturering · ${periodKort(period)}`;
  if (status.lage === 'fel') {
    return <FelRad attr={{ 'data-fakturering-rad': '' }} sista text={`${text} · Kunde inte läsa`} onForsokIgen={onForsokIgen} />;
  }
  const hoger = status.lage === 'klar' ? `${status.summa.km.toLocaleString('sv-SE')} km` : 'Läser …';
  return <TryckRad attr={{ 'data-fakturering-rad': '' }} sista text={text} hoger={hoger} onTryck={onOppna} />;
}
