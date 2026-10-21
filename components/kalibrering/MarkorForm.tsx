'use client';
// Åtgärdsmarkör: förarens "vad gjorde jag, och när" — sparas i kalibrering_atgard och syns som en linje i Trend och en rad i Senaste.
// Datum + text + knapp; knappen är grå tills båda är ifyllda. Själva sparandet bor i useKalibreringData (sparaMarkor).
import Falt from '@/components/design/Falt';
import Sektion from '@/components/design/Sektion';
import { INAKTIV, KNAPP } from '@/lib/design/tokens';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';

export default function MarkorForm({ d, placeholder, knapp }: { d: KalibreringData; placeholder: string; knapp: string }) {
  const kanSpara = !d.markorSparar && !!d.nyMarkorDatum && !!d.nyMarkorText.trim();
  return (
    <Sektion rubrik="Ny markering" kort={false}>
      <Falt etikett="Datum" typ="date" value={d.nyMarkorDatum} onChange={d.setNyMarkorDatum} />
      <Falt etikett="Åtgärd" placeholder={placeholder} value={d.nyMarkorText} onChange={d.setNyMarkorText} />
      <button type="button" onClick={d.sparaMarkor} disabled={!kanSpara} style={{ ...KNAPP.sekundar, ...(kanSpara ? null : INAKTIV) }}>
        {d.markorSparar ? 'Sparar…' : knapp}
      </button>
    </Sektion>
  );
}
