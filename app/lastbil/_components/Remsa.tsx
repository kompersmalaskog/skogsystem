'use client';

import { AVSTAND, FARG, KNAPP, KORT, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { FakturerbartStatus } from './useFakturerbart';

/**
 * PENGATALET på fakturasidan: fakturerbart-summan med uppdelningen hos faktureringen / fakturerade / strukna, överst på sidan
 * (Lastbilen är sedan 2026-10-19 EN sida utan flikar; talet står också under "Vad ska faktureras?" på huvudsidan).
 *
 * Regler (Martin 2026-10-14): den räknar inte upp, ändras inte av filter eller scroll, och byter bara värde när PERIODEN byts. Ett läsfel är ett fel (aldrig 0 km): remsan säger det och
 * erbjuder "Försök igen".
 */
export default function Remsa({ etikett, status, onForsokIgen }: { etikett: string; status: FakturerbartStatus; onForsokIgen: () => void }) {
  const sum = status.lage === 'klar' ? status.summa : null;
  return (
    <section aria-label="Fakturerbart" data-remsa
      style={{ ...KORT, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
      {/* Rad 1: vad och hur många. Rad 2: talet och var det står. Två rader i stället för två kolumner,
          så den håller sig kort och ändrar aldrig höjd mellan lägena på en telefon (390 px). */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.m }}>
        <span style={{ ...TYP.micro, color: FARG.text2 }}>Vad ska faktureras i {etikett}?</span>
        <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>
          {sum ? `${sum.antal} ${sum.antal === 1 ? 'flytt' : 'flyttar'}${sum.utanKm > 0 ? ` (${sum.utanKm} utan km)` : ''}` : status.lage === 'laddar' ? 'Läser …' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min / 2 }}>
        <span style={{ ...TYP.rubrik, ...TNUM, color: FARG.text }} aria-busy={status.lage === 'laddar'}>
          {sum ? `${sum.km.toLocaleString('sv-SE')} km` : '–'}
        </span>
        {sum && (
          <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2, textAlign: 'right' }}>
            {sum.hos} hos faktureringen · {sum.fakturerad} fakturerade{sum.struken > 0 ? ` · ${sum.struken} strukna` : ''}
          </span>
        )}
        {status.lage === 'fel' && (
          <span style={{ ...TYP.meta, color: FARG.text2, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
            Kunde inte läsa fakturerbart
            <button type="button" onClick={onForsokIgen} style={{ ...KNAPP.lank, ...TYP.meta }}>Försök igen</button>
          </span>
        )}
      </div>
    </section>
  );
}
