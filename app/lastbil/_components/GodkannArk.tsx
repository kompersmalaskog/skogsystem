'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, INAKTIV, KNAPP, TNUM, TYP } from '@/lib/design/tokens';
import type { Skrivsvar } from './godkann';

/**
 * "Stämmer flytten?" — ett steg i genomgången på fakturasidan, så att ett barn förstår det:
 * vad som hände ("Giant till Bågskyttebanan"), när och varifrån, km och — för en flytt över 3 mil — tiden som sparas
 * med samma tryck. Två svar: **Ja, godkänn** eller **Nej, något är fel** (öppnar flyttens ark för att rätta eller stryka).
 * "Hoppa över" lämnar flytten som den är och går till nästa.
 */
export default function GodkannArk({ steg, vad, nar, km, tid, tidVantar, onGodkann, onFel, onHoppaOver, onStang }: {
  steg: string; vad: string; nar: string; km: string;
  /** Tidraderna (flytt över 3 mil), annars tom. */
  tid: string[];
  /** Tiden läses fortfarande: Godkänn väntar, annars sparades flytten utan tid. */
  tidVantar: boolean;
  onGodkann: () => Promise<Skrivsvar>;
  onFel: () => void; onHoppaOver: () => void; onStang: () => void;
}) {
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const kan = !sparar && !tidVantar;
  async function godkann() {
    if (!kan) return;
    setSparar(true); setFel(null);
    const svar = await onGodkann();
    setSparar(false);
    if (!svar.ok) setFel(`Kunde inte godkänna flytten: ${svar.fel}`);
  }
  return (
    <Ark rubrik="Stämmer flytten?" onStang={onStang}
      fot={(
        <>
          <button type="button" data-godkann-ja onClick={godkann} disabled={!kan} style={{ ...KNAPP.primar, ...(kan ? {} : INAKTIV) }}>
            {sparar ? 'Sparar …' : 'Ja, godkänn'}
          </button>
          <button type="button" data-godkann-nej onClick={onFel} style={KNAPP.sekundar}>Nej, något är fel</button>
        </>
      )}>
      <div data-steg style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{steg}</div>
      <div style={{ ...TYP.rubrik, color: FARG.text }}>{vad}</div>
      <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{nar}</div>
      <div style={{ ...TYP.text, ...TNUM, color: FARG.text, marginTop: AVSTAND.m }}>{km}</div>
      {tid.map(t => <div key={t} data-godkann-tid style={{ ...TYP.text, ...TNUM, color: FARG.text2, marginTop: AVSTAND.xs }}>{t}</div>)}
      {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: `${AVSTAND.m}px 0 0` }}>{fel}</p>}
      <button type="button" data-hoppa-over onClick={onHoppaOver} style={{ ...KNAPP.lank, display: 'block', margin: `${AVSTAND.l}px auto 0` }}>Hoppa över</button>
    </Ark>
  );
}
