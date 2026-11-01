'use client';

// RISKBEDÖMNINGEN — planerarens steg i "Klar med trakten?" och förarens lista i ⓘ (lib/riskbedomning).
//
//   Planeraren (RiskerBody): appens förslag + egna risker, en rad per risk: vad (fet) och vad man gör (vanlig text), källan dämpad.
//     Ett förslag som inte gäller tas bort med "Gäller inte" (ligger kvar längst ner med "Ta tillbaka"); en egen risk läggs till med två fält.
//     Stämmer-knappen ligger i stegets fot (KlarMedTrakten).
//   Föraren (ForarRisker): samma lista, bara att läsa, och EN knapp "Jag har läst" tills den här listan är läst.
//
// Ren presentation: sidan räknar listan och sparar.

import React, { useState } from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { KALLA_TEXT, riskAntalText, type Risk } from '@/lib/riskbedomning';
import { Huvud } from './infoDelar';
import { Etikett, Falt } from './klarDelar';
import { SettKnapp } from './InstruktionKort';

export interface RiskerProps {
  /** listan som gäller (förslag utom borttagna + egna) */
  lista: Risk[];
  /** förslag planeraren sagt "Gäller inte" om */
  borttagna: Risk[];
  /** planeraren har godkänt exakt den här listan */
  godkand: boolean;
  /** "Martin 2 nov" — senaste godkännandet; null = aldrig */
  godkandText: string | null;
  /** förarna som läst den här listan: "Stefan 3 nov" */
  lasta: string[];
  /** kvittona gick inte att läsa (då säger vi det i stället för "ingen har läst") */
  lastaFel: boolean;
  onTaBort: (nyckel: string) => void;
  onAterstall: (nyckel: string) => void;
  onLaggTill: (risk: string, atgard: string) => void;
}

const knappStil: React.CSSProperties = { ...KNAPP.tertiar, minHeight: TRAFFYTA.min, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', flexShrink: 0 };

/** En risk: vad, vad man gör, och varifrån den kom. */
export function RiskRad({ r, forst, hoger }: { r: Risk; forst: boolean; hoger?: React.ReactNode }) {
  return (
    <div data-testid={`risk-${r.nyckel}`} style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: forst ? 'none' : `1px solid ${FARG.linje}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYP.listtitel, color: FARG.text, overflowWrap: 'anywhere' }}>{r.risk}</div>
        <div data-testid={`risk-${r.nyckel}-atgard`} style={{ ...TYP.text, color: FARG.text, marginTop: AVSTAND.xs, overflowWrap: 'anywhere' }}>{r.atgard}</div>
        <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.xs }}>{KALLA_TEXT[r.kalla]}</div>
      </div>
      {hoger}
    </div>
  );
}

const Kort = ({ children, testid }: { children: React.ReactNode; testid?: string }) => (
  <div data-testid={testid} style={{ background: FARG.upphojt, borderRadius: RADIE.kort, overflow: 'hidden' }}>{children}</div>
);

export function RiskerBody({ r }: { r: RiskerProps }) {
  const [ny, setNy] = useState(false);
  const [risk, setRisk] = useState('');
  const [atgard, setAtgard] = useState('');
  const kanLagga = risk.trim() !== '' && atgard.trim() !== '';

  return (
    <div data-testid="klar-risker">
      {r.lista.length === 0 ? (
        <div data-testid="risker-tom" style={{ ...TYP.text, color: FARG.text2, margin: `0 ${AVSTAND.xs}px ${AVSTAND.l}px` }}>Appen hittar inga särskilda risker på trakten. Lägg till om du vet något.</div>
      ) : (
        <Kort testid="risker-lista">
          {r.lista.map((x, k) => (
            <RiskRad key={x.nyckel} r={x} forst={k === 0} hoger={
              <button type="button" data-testid={`risk-${x.nyckel}-bort`} onClick={() => r.onTaBort(x.nyckel)} className="press-dim" style={knappStil}>
                {x.kalla === 'planerare' ? 'Ta bort' : 'Gäller inte'}
              </button>
            } />
          ))}
        </Kort>
      )}

      <div style={{ marginTop: AVSTAND.l }}>
        {ny ? (
          <Kort testid="risker-ny">
            <div style={{ padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.l}px` }}>
              <Etikett>Vad är risken?</Etikett>
              <Falt testid="risker-ny-risk" label="Vad är risken?" placeholder="t.ex. Allmän väg vid avlägget" value={risk} onChange={setRisk} />
              <Etikett>Vad gör man?</Etikett>
              <Falt testid="risker-ny-atgard" label="Vad gör man?" placeholder="t.ex. Varningsskylt när vi lastar" value={atgard} onChange={setAtgard} />
              <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.m }}>
                <button type="button" data-testid="risker-ny-avbryt" onClick={() => { setNy(false); setRisk(''); setAtgard(''); }} className="press-dim"
                  style={{ ...KNAPP.sekundar, flex: 1, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>Avbryt</button>
                <button type="button" data-testid="risker-ny-lagg" disabled={!kanLagga} onClick={() => { r.onLaggTill(risk, atgard); setNy(false); setRisk(''); setAtgard(''); }} className="press-scale"
                  style={{ ...KNAPP.sekundar, flex: 1, cursor: kanLagga ? 'pointer' : 'default', fontFamily: 'inherit', touchAction: 'manipulation', ...(kanLagga ? null : { opacity: 0.4 }) }}>Lägg till</button>
              </div>
            </div>
          </Kort>
        ) : (
          <button type="button" data-testid="risker-lagg-till" onClick={() => setNy(true)} className="press-dim"
            style={{ ...KNAPP.lank, minHeight: TRAFFYTA.min, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>+ Lägg till en risk</button>
        )}
      </div>

      {r.borttagna.length > 0 && (
        <div style={{ marginTop: AVSTAND.sektion }}>
          <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.xs}px ${AVSTAND.s}px` }}>GÄLLER INTE HÄR</div>
          <Kort testid="risker-borttagna">
            {r.borttagna.map((x, k) => (
              <div key={x.nyckel} data-testid={`risk-bort-${x.nyckel}`} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, borderTop: k === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                <span style={{ flex: 1, minWidth: 0, ...TYP.text, color: FARG.text2 }}>{x.risk}</span>
                <button type="button" data-testid={`risk-bort-${x.nyckel}-tillbaka`} onClick={() => r.onAterstall(x.nyckel)} className="press-dim" style={knappStil}>Ta tillbaka</button>
              </div>
            ))}
          </Kort>
        </div>
      )}
    </div>
  );
}

/** Raden i sammanställningen och kvittona under den. */
export function lastaText(r: Pick<RiskerProps, 'lasta' | 'lastaFel'>): string {
  if (r.lastaFel) return 'Kunde inte läsa vilka förare som läst';
  return r.lasta.length === 0 ? 'Ingen förare har läst den än' : `Läst av ${r.lasta.join(', ')}`;
}

// ── Föraren ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ForarRiskerProps {
  objektNamn: string;
  risker: Risk[];
  last: boolean;
  sparFel: boolean;
  onLast: () => void;
  onTillbaka: () => void;
  onStang: () => void;
}

/** Förarens lista: läs, tryck "Jag har läst". Efteråt står "Läst ✓" i stället för knappen. */
export function ForarRisker(p: ForarRiskerProps) {
  return (
    <>
      <Huvud titel="Risker på trakten" undertitel={`${p.objektNamn} · ${riskAntalText(p.risker.length)}`} tillbaka={p.objektNamn} onTillbaka={p.onTillbaka} onStang={p.onStang} />
      <div data-testid="forar-risker" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xxl}px` }}>
        {p.risker.length === 0 ? (
          <div style={{ ...TYP.text, color: FARG.text2, marginBottom: AVSTAND.l }}>Planeraren har inte hittat några särskilda risker här. Ta det lugnt ändå.</div>
        ) : (
          <Kort testid="forar-risker-lista">
            {p.risker.map((x, k) => <RiskRad key={x.nyckel} r={x} forst={k === 0} />)}
          </Kort>
        )}
        <div style={{ marginTop: AVSTAND.l }}>
          {p.last ? (
            <div data-testid="forar-risker-last" style={{ ...TYP.listtitel, color: FARG.gron, textAlign: 'center', padding: `${AVSTAND.m}px 0` }}>Läst ✓</div>
          ) : (
            <SettKnapp testid="forar-risker-las" etikett="Jag har läst" onSett={p.onLast} />
          )}
          {p.sparFel && <div role="alert" data-testid="forar-risker-fel" style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.s }}>Kunde inte spara. Försök igen.</div>}
        </div>
      </div>
    </>
  );
}

/** Raden på förarens ⓘ-kort: "Risker på trakten · 3 risker" och "Läs innan du börjar" (orange) eller "Läst ✓". null-lista = bedömningen är inte gjord. */
export function riskRadUnder(risker: Risk[] | null, last: boolean): { text: string; ton: 'orange' | 'gron' | 'dampad' } {
  if (risker == null) return { text: 'Riskbedömningen är inte gjord än', ton: 'dampad' };
  return last ? { text: `${riskAntalText(risker.length)} · Läst ✓`, ton: 'gron' } : { text: `${riskAntalText(risker.length)} · Läs innan du börjar`, ton: 'orange' };
}
