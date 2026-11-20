'use client';
// Hela-skärmens tillstånd i kalibreringsvyn: laddar, kunde inte ladda (med Försök igen) och ingen data än.
import type { ReactNode } from 'react';
import Ikon from '@/components/design/Ikon';
import { AVSTAND, FARG, IKON, KNAPP, ROT_MIN_HOJD, TYP } from '@/lib/design/tokens';

function Mitt({ ikon, titel, text, atgard }: { ikon: string; titel: string; text?: string; atgard?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: ROT_MIN_HOJD, padding: AVSTAND.xl, gap: AVSTAND.s }}>
      <Ikon namn={ikon} storlek={IKON.stor} farg={FARG.text3} />
      <div style={{ ...TYP.rubrik, color: FARG.text }}>{titel}</div>
      {text && <div style={{ ...TYP.text, color: FARG.text2, maxWidth: 320 }}>{text}</div>}
      {atgard && <div style={{ marginTop: AVSTAND.l, width: '100%', maxWidth: 320 }}>{atgard}</div>}
    </div>
  );
}

export const LaddarSkarm = () => <Mitt ikon="hourglass_empty" titel="Laddar kontrolldata…" />;

export const FelSkarm = ({ text, onForsok }: { text: string; onForsok: () => void }) => (
  <Mitt ikon="error" titel="Kunde inte ladda kontrolldata" text={text}
    atgard={<button type="button" onClick={onForsok} style={KNAPP.sekundar}>Försök igen</button>} />
);

export const TomSkarm = () => (
  <Mitt ikon="straighten" titel="Inga kontrollmätningar" text="När HQC-filer importeras visas kontrolldata här med jämförelser och statistik." />
);
