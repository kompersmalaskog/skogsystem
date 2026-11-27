'use client';

// "Den här har en kommentar – radera ändå?" (Martin 2026-11-26). Ett ark som visas INNAN en markering med kommentar (eller Viktigt-rad) tas bort, med kommentarens text synlig —
// så att ingen råkar ta bort något som någon skrivit till föraren. Avbryt är förvalt (vit, stor, fokuserad); Radera är röd text (KNAPP.destruktiv). Utan kommentar frågar appen inte.
// Den rena delen — vad som räknas som en kommentar på en markering — är `kommentarerForRadering` i lib/kartkommentar.

import React from 'react';
import Ark from '@/components/design/Ark';
import { KNAPP, TYP, AVSTAND, FARG } from '@/lib/design/tokens';
import { KommentarVisning } from './KommentarRuta';
import type { KommentarRaderingsRad } from '@/lib/kartkommentar';

export default function RaderaKommentarFraga({ rader, onAvbryt, onRadera }: { rader: readonly KommentarRaderingsRad[]; onAvbryt: () => void; onRadera: () => void }) {
  return (
    <Ark rubrik="Radera markeringen?" onStang={onAvbryt}
      fot={(
        <>
          <button type="button" autoFocus data-testid="radera-kommentar-avbryt" onClick={onAvbryt} style={KNAPP.primar}>Avbryt</button>
          <button type="button" data-testid="radera-kommentar-ja" onClick={onRadera} style={KNAPP.destruktiv}>Radera ändå</button>
        </>
      )}>
      <div data-testid="radera-kommentar-fraga" style={{ ...TYP.text, color: FARG.text, marginBottom: AVSTAND.m }}>Den här har en kommentar – radera ändå?</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
        {rader.map((r) => <KommentarVisning key={r.id} text={r.text} viktigt={r.viktigt} forfattare={r.forfattare} />)}
      </div>
    </Ark>
  );
}
