'use client';

import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens';
import { fmtAvstandKm } from './framme';

/**
 * Frågan när "Framme på LBC" trycks med bilen långt från basen. Två val, det trygga först och stort:
 * "Nej, jag kör vidare" lämnar rundan öppen (inget har sparats); "Ja, avsluta ändå" stänger den som förut.
 * Orden bär betydelsen — färgen förstärker bara.
 */
export default function FrammeVarning({ km, sparar, onKorVidare, onAvslutaAnda }: {
  km: number; sparar: boolean; onKorVidare: () => void; onAvslutaAnda: () => void;
}) {
  return (
    <div role="alertdialog" aria-label="Bilen är inte hemma än" data-framme-varning>
      <div style={{ ...TYP.listtitel, color: FARG.orange, marginBottom: AVSTAND.xs }}>Bilen är inte hemma än</div>
      <p style={{ ...TYP.text, color: FARG.text, margin: `0 0 ${AVSTAND.xs}px` }}>
        Den står ungefär {fmtAvstandKm(km)} från basen.
      </p>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.m}px` }}>
        Trycker du Framme nu stängs rundan, och när bilen kör vidare öppnas en ny. Tryck Framme när du är på basen.
      </p>
      <button type="button" onClick={onKorVidare} disabled={sparar} style={{ ...KNAPP.primar, opacity: sparar ? 0.5 : 1 }}>
        Nej, jag kör vidare
      </button>
      <button type="button" onClick={onAvslutaAnda} disabled={sparar} style={{ ...KNAPP.tertiar, width: '100%', marginTop: AVSTAND.xs }}>
        Ja, avsluta ändå
      </button>
    </div>
  );
}
