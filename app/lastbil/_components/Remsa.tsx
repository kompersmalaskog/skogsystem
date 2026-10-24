'use client';

import { AVSTAND, FARG, KNAPP, KORT, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { FakturerbartStatus } from './useFakturerbart';

/** "Ingen är fakturerad än" · "Alla är fakturerade" · "2 är fakturerade, 3 väntar på faktura" — läget i ord. */
export function lagesText(hos: number, fakturerad: number): string {
  if (hos + fakturerad === 0) return '';
  if (fakturerad === 0) return hos === 1 ? 'Den är inte fakturerad än' : 'Ingen är fakturerad än';
  if (hos === 0) return hos + fakturerad === 1 ? 'Den är fakturerad' : 'Alla är fakturerade';
  return `${fakturerad} ${fakturerad === 1 ? 'är fakturerad' : 'är fakturerade'}, ${hos} väntar på faktura`;
}

/**
 * Svaret överst på fakturasidan — "Vad ska faktureras i oktober?" — så att ett barn förstår (Martin 2026-10-24):
 * frågan, talet stort ("216 km", PENGATALET: samma som raden på huvudsidan), och under det i ord hur många flyttar det är och
 * hur långt de kommit ("5 flyttar · Ingen är fakturerad än"). Strukna nämns bara när de finns.
 *
 * Regler (Martin 2026-10-14): den räknar inte upp, ändras inte av filter eller scroll, och byter bara värde när PERIODEN byts.
 * Ett läsfel är ett fel (aldrig 0 km): den säger det och erbjuder "Försök igen".
 */
export default function Remsa({ etikett, status, onForsokIgen }: { etikett: string; status: FakturerbartStatus; onForsokIgen: () => void }) {
  const sum = status.lage === 'klar' ? status.summa : null;
  const antal = sum ? `${sum.antal === 0 ? 'Inga flyttar' : `${sum.antal} ${sum.antal === 1 ? 'flytt' : 'flyttar'}`}${sum.utanKm > 0 ? ` (${sum.utanKm} utan km)` : ''}` : '';
  const lage = sum ? [lagesText(sum.hos, sum.fakturerad), sum.struken > 0 ? `${sum.struken} ${sum.struken === 1 ? 'struken' : 'strukna'}` : ''].filter(Boolean).join(' · ') : '';
  return (
    <section aria-label="Fakturerbart" data-remsa
      style={{ ...KORT, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
      <span style={{ ...TYP.micro, color: FARG.text2 }}>Vad ska faktureras i {etikett}?</span>
      <span style={{ ...TYP.tal, color: FARG.text, minHeight: TRAFFYTA.min / 2 }} aria-busy={status.lage === 'laddar'}>
        {sum ? `${sum.km.toLocaleString('sv-SE')} km` : status.lage === 'laddar' ? 'Läser …' : '–'}
      </span>
      {sum && (
        <span data-remsa-lage style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{[antal, lage].filter(Boolean).join(' · ')}</span>
      )}
      {status.lage === 'fel' && (
        <span style={{ ...TYP.meta, color: FARG.text2, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
          Kunde inte läsa fakturerbart
          <button type="button" onClick={onForsokIgen} style={{ ...KNAPP.lank, ...TYP.meta }}>Försök igen</button>
        </span>
      )}
    </section>
  );
}
