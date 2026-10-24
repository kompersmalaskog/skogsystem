'use client';
// Lägg till åtgärd: datum + vad som gjordes. Det ENDA stället man lägger till en åtgärd. Sparas i kalibrering_atgard (useKalibreringData › sparaMarkor);
// den grå knappen blir vit när båda fälten är ifyllda. Går sparandet inte ligger arket kvar med texten ifylld och säger det.
import { useEffect, useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import { INAKTIV, KNAPP } from '@/lib/design/tokens';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { idagStr } from '@/lib/kalibrering/datum';
import { Lugn } from './delar';

export default function NyAtgardArk({ d, onStang }: { d: KalibreringData; onStang: () => void }) {
  const [fel, setFel] = useState(false);
  const { nyMarkorDatum, setNyMarkorDatum } = d;
  useEffect(() => { if (!nyMarkorDatum) setNyMarkorDatum(idagStr()); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- dagens datum förifylls en gång när arket öppnas
  const kanSpara = !d.markorSparar && !!d.nyMarkorDatum && !!d.nyMarkorText.trim();
  const spara = async () => {
    setFel(false);
    if (await d.sparaMarkor()) onStang(); else setFel(true);
  };
  return (
    <Ark rubrik="Lägg till åtgärd" onStang={onStang}
      fot={<button type="button" onClick={spara} disabled={!kanSpara} style={{ ...KNAPP.primar, ...(kanSpara ? null : INAKTIV) }}>{d.markorSparar ? 'Sparar…' : 'Spara'}</button>}>
      <Falt etikett="Datum" typ="date" value={d.nyMarkorDatum} onChange={d.setNyMarkorDatum} />
      <Falt etikett="Vad gjorde du?" placeholder="t.ex. höjde trycket till 400 mm" value={d.nyMarkorText} onChange={d.setNyMarkorText} />
      {fel && <Lugn ikon="error">Det gick inte att spara. Försök igen.</Lugn>}
    </Ark>
  );
}
