'use client';

import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens';
import { lasUtkast, rensaUtkast } from './flode';
import { usePagaendeHamtning } from './usePagaendeHamtning';

/**
 * Sidans EN primärknapp, på samma plats alltid. "Hämta en maskin" — eller, när en hämtning pågår, "Fortsätt hämta Giant" med en rad
 * under i ord ("Lassat 12:30 · Vart ska den?"). Trycket öppnar flödet (aldrig automatiskt): flödet tar upp sparat steg, eller — när
 * databasen har en öppen flytt som utkastet inte hör till — den flytten. Läsfel eller ingen hämtning: den vanliga knappen.
 */
export default function HamtaKnapp({ forareId, aktiv, onStart }: { forareId: string | null; aktiv: boolean; onStart: () => void }) {
  const lage = usePagaendeHamtning(forareId, aktiv);
  const pagaende = lage.lage === 'klar' ? lage.pagaende : null;
  const tryck = () => {
    // Ett utkast som hör till en annan hämtning än databasens öppna flytt får inte styra flödet: rensa det, så tas flytten upp.
    if (pagaende?.kalla === 'db' && !pagaende.behallUtkast && lasUtkast()) rensaUtkast();
    onStart();
  };
  return (
    <>
      <button type="button" data-hamta-start onClick={tryck} style={KNAPP.primar}>
        {pagaende ? `Fortsätt hämta ${pagaende.namn}` : 'Hämta en maskin'}
      </button>
      {pagaende && <p data-hamta-pagar style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px ${AVSTAND.xs}px 0` }}>{pagaende.rad}</p>}
    </>
  );
}
