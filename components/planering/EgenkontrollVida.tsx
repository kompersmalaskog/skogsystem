'use client';

// EGENKONTROLL TILL VIDA — förarens få frågor och Vidas hela formulär (lib/vidaEgenkontroll.ts).
//
// Föraren (maskinläget): svaret först ("2 av 6"), sedan bara sina frågor med två–tre knappar var. Ett tryck sparar. Bara vid en
// avvikelse skrivs en rad om vad som hände. "Skriv något till Vida" är en rad tills man trycker. Det appen svarat själv ligger
// bakom EN rad. Planeraren ser Vidas hela formulär (Till Vida) med var varje svar kommer ifrån. Ingenting skickas till Vida.

import React, { useEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { saknarKommentar, type Egenkontroll, type ForarFraga, type Roll, type Svar } from '@/lib/vidaEgenkontroll';
import { Gruppkort, Huvud, RadKnapp } from './infoDelar';

export interface EgenkontrollVidaProps {
  objektNamn: string;
  lage: 'laser' | 'ok' | 'fel';
  modell: Egenkontroll | null;
  /** Förarens roll i maskinläget; null = planeraren (ser Vidas formulär). */
  roll: Roll | null;
  svar: Record<string, Svar>;
  fel: string | null;
  onSvara: (nyckel: string, varde: string | null, kommentar?: string | null) => Promise<boolean>;
  onLasOm: () => void;
  onTillbaka: () => void;
  onStang: () => void;
}

const rollNamn = (r: Roll) => (r === 'skordare' ? 'Skördaren' : 'Skotaren');

/** Text som sparas en stund efter att man slutat skriva (och när fältet lämnas). */
function Kommentar({ id, varde, platshallare, onSpara }: { id: string; varde: string; platshallare: string; onSpara: (t: string) => void }) {
  const [text, setText] = useState(varde);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const senast = useRef(varde);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const spara = (t: string) => { if (t !== senast.current) { senast.current = t; onSpara(t); } };
  return (
    <textarea id={id} data-testid={id} value={text} placeholder={platshallare} rows={2}
      onChange={(e) => { const t = e.target.value; setText(t); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => spara(t), 800); }}
      onBlur={() => { if (timer.current) clearTimeout(timer.current); spara(text); }}
      style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.primar, borderRadius: RADIE.kort, border: 'none', background: FARG.fyllning, color: FARG.text,
        ...TYP.text, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, fontFamily: 'inherit', resize: 'vertical' }} />
  );
}

function Fraga({ f, s, onSvara, forsta }: { f: ForarFraga; s: Svar | undefined; onSvara: EgenkontrollVidaProps['onSvara']; forsta: boolean }) {
  const av = !!s && f.avvikelse(s.varde);
  return (
    <div data-testid={`ek-fraga-${f.nyckel}`} style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: forsta ? 'none' : `1px solid ${FARG.linje}`, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
      <div style={{ ...TYP.listtitel }}>{f.text}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(f.knappar.length, 3)}, minmax(0, 1fr))`, gap: AVSTAND.s }}>
        {f.knappar.map((k) => {
          const vald = s?.varde === k.varde;
          const arAv = f.avvikelse(k.varde);
          return (
            <button key={k.varde} type="button" data-testid={`ek-knapp-${f.nyckel}-${k.varde}`} aria-pressed={vald}
              onClick={() => void onSvara(f.nyckel, vald ? null : k.varde, vald ? null : (s?.kommentar ?? null))}
              style={{ ...KNAPP.sekundar, minHeight: TRAFFYTA.primar, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', overflowWrap: 'anywhere',
                background: vald ? (arAv ? FARG.orange : FARG.gron) : FARG.fyllning, color: vald ? FARG.bg : FARG.text }}>
              {k.text}
            </button>
          );
        })}
      </div>
      {av && (
        <Kommentar id={`ek-kommentar-${f.nyckel}`} varde={s?.kommentar ?? ''} platshallare="Vad hände? Skriv en rad"
          onSpara={(t) => void onSvara(f.nyckel, s!.varde, t)} />
      )}
      {av && saknarKommentar(f, s) && <div style={{ ...TYP.meta, color: FARG.orange }}>Skriv vad som hände</div>}
    </div>
  );
}

function ForarVy({ modell, roll, svar, onSvara }: { modell: Egenkontroll; roll: Roll; svar: Record<string, Svar>; onSvara: EgenkontrollVidaProps['onSvara'] }) {
  const fragor = roll === 'skordare' ? modell.skordare : modell.skotare;
  const klara = fragor.filter((f) => svar[f.nyckel] && !saknarKommentar(f, svar[f.nyckel])).length;
  const [visaAppen, setVisaAppen] = useState(false);
  const kNyckel = `kommentar:${roll}`;
  const [skriv, setSkriv] = useState(!!svar[kNyckel]?.kommentar);
  if (fragor.length === 0) return <div data-testid="ek-inga" style={{ ...TYP.text, color: FARG.text2 }}>Inga frågor till dig på den här trakten.</div>;
  const klart = klara === fragor.length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
      <div data-testid="ek-svar">
        <div style={{ ...TYP.tal, color: klart ? FARG.gron : FARG.text }}>{klart ? 'Klart' : `${klara} av ${fragor.length}`}</div>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{klart ? 'Tack! Svaren är sparade.' : fragor.length === 1 ? 'En fråga till dig' : `${fragor.length} frågor till dig`}</div>
      </div>
      <Gruppkort testid="ek-fragor">
        {fragor.map((f, i) => <Fraga key={f.nyckel} f={f} s={svar[f.nyckel]} onSvara={onSvara} forsta={i === 0} />)}
      </Gruppkort>
      <Gruppkort testid="ek-till-vida">
        {skriv ? (
          <div style={{ padding: AVSTAND.m }}>
            <Kommentar id="ek-kommentar-fri" varde={svar[kNyckel]?.kommentar ?? ''} platshallare="Skriv något till Vida"
              onSpara={(t) => void onSvara(kNyckel, t.trim() ? 'text' : null, t)} />
          </div>
        ) : (
          <RadKnapp forstaRad testid="ek-skriv" etikett="Skriv något till Vida" onTryck={() => setSkriv(true)} />
        )}
      </Gruppkort>
      {modell.appen.length > 0 && (
        <Gruppkort testid="ek-appen">
          <RadKnapp forstaRad testid="ek-appen-rad" etikett={`Appen har svarat på ${modell.appen.length} ${modell.appen.length === 1 ? 'fråga' : 'frågor'}`}
            farg={FARG.text2} onTryck={() => setVisaAppen((v) => !v)} pil={!visaAppen} />
          {visaAppen && modell.appen.map((a) => (
            <div key={a.fraga} style={{ padding: `${AVSTAND.s}px ${AVSTAND.l}px`, borderTop: `1px solid ${FARG.linje}` }}>
              <div style={{ ...TYP.text }}>{a.fraga}</div>
              <div style={{ ...TYP.listtitel, color: FARG.gron }}>{a.svar}</div>
              <div style={{ ...TYP.meta, color: FARG.text2 }}>{a.varifran}</div>
            </div>
          ))}
        </Gruppkort>
      )}
    </div>
  );
}

function VidaVy({ modell }: { modell: Egenkontroll }) {
  const vantar = modell.skordare.length + modell.skotare.length - modell.besvarade.skordare - modell.besvarade.skotare;
  let sektion = '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
      <div data-testid="ek-vida-svar">
        <div style={{ ...TYP.tal, color: modell.avvikelser ? FARG.orange : FARG.text }}>
          {modell.avvikelser ? `${modell.avvikelser} avvikelse${modell.avvikelser > 1 ? 'r' : ''}` : vantar ? 'Inte klar' : 'Inga avvikelser'}
        </div>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
          {[
            `Skördaren ${modell.besvarade.skordare} av ${modell.skordare.length}`,
            `skotaren ${modell.besvarade.skotare} av ${modell.skotare.length}`,
          ].join(' · ')} · skickas inte till Vida än
        </div>
      </div>
      <Gruppkort testid="ek-vida-formular">
        {modell.rapport.map((r, i) => {
          const ny = r.sektion !== sektion;
          sektion = r.sektion;
          return (
            <React.Fragment key={`${r.sektion}|${r.fraga}|${i}`}>
              {ny && <div style={{ ...TYP.micro, color: FARG.text2, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${AVSTAND.xs}px` }}>{r.sektion.replace(/^(\d+)(\S)/, '$1 $2')}</div>}
              <div data-testid="ek-vida-rad" style={{ padding: `${AVSTAND.s}px ${AVSTAND.l}px`, borderTop: ny ? 'none' : `1px solid ${FARG.linje}`, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: AVSTAND.m }}>
                <div style={{ ...TYP.text, minWidth: 0 }}>{r.fraga}</div>
                <div style={{ ...TYP.listtitel, textAlign: 'right', maxWidth: 160, overflowWrap: 'anywhere', color: r.svar == null ? FARG.text2 : r.avvikelse ? FARG.orange : FARG.gron }}>
                  {r.svar ?? (r.kalla === 'ingen' ? '–' : 'Väntar')}
                </div>
                <div style={{ ...TYP.meta, color: FARG.text2, gridColumn: '1 / -1' }}>{r.varifran}</div>
              </div>
            </React.Fragment>
          );
        })}
      </Gruppkort>
    </div>
  );
}

export default function EgenkontrollVida(p: EgenkontrollVidaProps) {
  return (
    <>
      <Huvud titel="Egenkontroll" undertitel={p.roll ? `${rollNamn(p.roll)} · ${p.objektNamn}` : `Till Vida · ${p.objektNamn}`} tillbaka="Trakten" onTillbaka={p.onTillbaka} onStang={p.onStang} />
      <div data-testid="ek-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `0 ${AVSTAND.l}px ${AVSTAND.xl}px` }}>
        {p.fel && <div role="alert" data-testid="ek-fel" style={{ ...TYP.text, color: FARG.orange, marginBottom: AVSTAND.m }}>{p.fel}</div>}
        {p.lage === 'laser' && <div style={{ ...TYP.text, color: FARG.text2 }}>Läser …</div>}
        {p.lage === 'fel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
            <div style={{ ...TYP.text, color: FARG.orange }}>Kunde inte läsa egenkontrollen.</div>
            <button type="button" onClick={p.onLasOm} style={{ ...KNAPP.sekundar, cursor: 'pointer', fontFamily: 'inherit' }}>Försök igen</button>
          </div>
        )}
        {p.lage === 'ok' && !p.modell && <div style={{ ...TYP.text, color: FARG.text2 }}>Vida har ingen egenkontroll för den här trakten.</div>}
        {p.lage === 'ok' && p.modell && (p.roll ? <ForarVy modell={p.modell} roll={p.roll} svar={p.svar} onSvara={p.onSvara} /> : <VidaVy modell={p.modell} />)}
      </div>
    </>
  );
}

/** Raden på ⓘ-kortet: "Egenkontroll · 2 av 6" / "✓ Klar". null = ingen rad (ingen Vida-mall). */
export function egenkontrollRad(modell: Egenkontroll | null, roll: Roll | null, svar: Record<string, Svar>): { under: string; klar: boolean } | null {
  if (!modell) return null;
  if (!roll) {
    const tot = modell.skordare.length + modell.skotare.length;
    const bes = modell.besvarade.skordare + modell.besvarade.skotare;
    return { under: modell.avvikelser ? `${modell.avvikelser} avvikelse${modell.avvikelser > 1 ? 'r' : ''}` : `${bes} av ${tot} besvarade`, klar: bes === tot };
  }
  const fragor = roll === 'skordare' ? modell.skordare : modell.skotare;
  if (fragor.length === 0) return null;
  const klara = fragor.filter((f) => svar[f.nyckel] && !saknarKommentar(f, svar[f.nyckel])).length;
  return { under: klara === fragor.length ? '✓ Klar' : `${klara} av ${fragor.length} frågor`, klar: klara === fragor.length };
}
