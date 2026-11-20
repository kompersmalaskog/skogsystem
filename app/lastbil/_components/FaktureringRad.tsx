'use client';

import { FelRad, TryckRad } from './AttGoraKort';
import { periodKort, type Manad } from './period';
import type { FakturerbartStatus } from './useFakturerbart';

/**
 * Svaret på "Vad ska faktureras?": "216 km i oktober ›" (bara admin). Talet är fakturerbart-talet (pengatalet) för vald period;
 * det byter värde bara när PERIODEN byts. Ett tryck öppnar fakturasidan. Ett läsfel är ett fel ("Kunde inte läsa … · Försök igen"),
 * aldrig 0 km. Summan är summan av avrundade flyttar och räknar bara godkända (`summeraFakturerbart`, samma läsning som fakturasidan).
 */
export default function FaktureringRad({ period, status, onOppna, onForsokIgen }: {
  period: Manad; status: FakturerbartStatus; onOppna: () => void; onForsokIgen: () => void;
}) {
  const manad = periodKort(period);
  if (status.lage === 'fel') {
    return <FelRad attr={{ 'data-fakturering-rad': '' }} sista text={`Kunde inte läsa faktureringen för ${manad}`} onForsokIgen={onForsokIgen} />;
  }
  const text = status.lage === 'klar' ? `${status.summa.km.toLocaleString('sv-SE')} km i ${manad}` : `Läser ${manad} …`;
  return <TryckRad attr={{ 'data-fakturering-rad': '' }} sista text={text} onTryck={onOppna} />;
}
