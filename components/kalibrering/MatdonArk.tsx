'use client';
// Klave och måttband — "Stämmer dina mätdon?". Tre steg i ord och EN knapp: "Båda stämmer". Sparas i kalibrering_matdon (tid och vem
// sätts av databasen). Efter sparandet: ett kvitto med Ångra. Går sparandet inte ligger arket kvar och säger det.
import { useState } from 'react';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { MATDON_DAGAR, MATDON_STEG, matdonLage } from '@/lib/kalibrering/matdon';
import { Lugn } from './delar';

export default function MatdonArk({ d, onStang }: { d: KalibreringData; onStang: () => void }) {
  const [sparad, setSparad] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const lage = d.matdon === undefined ? null : matdonLage(d.matdon);

  const spara = async () => {
    setFel(null);
    if (await d.sparaMatdon()) setSparad(true);
    else setFel('Det gick inte att spara. Försök igen.');
  };
  // d.matdon uppdateras efter sparandet; id:t för Ångra är den nya raden.
  const nyId = sparad ? d.matdon?.id ?? null : null;
  const angra = async () => {
    if (!nyId) return;
    if (await d.angraMatdon(nyId)) setSparad(false);
    else setFel('Det gick inte att ångra.');
  };

  const fot = sparad
    ? <button type="button" onClick={onStang} style={KNAPP.primar}>Klar</button>
    : <button type="button" onClick={spara} disabled={d.matdonSparar} style={{ ...KNAPP.primar, ...(d.matdonSparar ? INAKTIV : null) }}>
        {d.matdonSparar ? 'Sparar…' : 'Båda stämmer'}
      </button>;

  return (
    <Ark rubrik="Klave och måttband" onStang={onStang} stang={sparad ? 'Klar' : 'Avbryt'} fot={fot}>
      <div style={{ ...TYP.listtitel, color: FARG.text }}>Stämmer dina mätdon?</div>
      <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px` }}>
        Maskinen jämförs mot klaven och måttbandet. Mäter de fel blir hela kontrollen fel. Kolla dem en gång i kvartalet.
      </p>
      <ol style={{ margin: 0, paddingLeft: AVSTAND.xl }}>
        {MATDON_STEG.map(s => <li key={s} style={{ ...TYP.text, color: FARG.text, marginBottom: AVSTAND.s }}>{s}</li>)}
      </ol>
      <div data-matdon-lage="" style={{ ...TYP.meta, color: lage?.dags ? FARG.orange : FARG.text2, marginTop: AVSTAND.l }}>
        {sparad ? '✓ Kollade idag' : lage ? `${lage.varde}${lage.dags && d.matdon ? ` · mer än ${Math.floor(MATDON_DAGAR / 30)} månader sedan` : ''}` : 'Läser…'}
      </div>
      {sparad && nyId && (
        <button type="button" onClick={angra} style={{ ...KNAPP.lank, ...TYP.meta, marginTop: AVSTAND.s }}>Ångra</button>
      )}
      {fel && <Lugn ikon="error">{fel}</Lugn>}
    </Ark>
  );
}
