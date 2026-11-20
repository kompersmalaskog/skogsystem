'use client';

import React, { useState } from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TNUM, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens';
import { MANADSNAMN, arHelg, arRodDag, toISO } from './datum';
import Ikon from '@/components/design/Ikon';

const VECKODAGAR = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
/** Cirkelns diameter (layoutmått). Träffytan är HELA cellen, minst `TRAFFYTA.min` hög. */
const DAGRUTA = 40;

/**
 * Tryck-kalender för periodval. Ingen dold fas-logik:
 * - tryck 1 = startdag (och därmed en endagsperiod tills vidare)
 * - tryck 2 = slutdag → spannet fylls (tryck före starten byter håll)
 * - tryck efter färdigt spann = nytt val börjar
 * - "Rensa" (synlig knapp i föräldern) nollställer via onValj(null, null)
 * Helger/röda dagar går att ta med i spannet men exkluderas ur
 * arbetsdagsräkningen (samma logik som steg 4 — bara kopplad till tryck).
 *
 * Markering i tokens-färger (blått är aldrig vald rad): ändpunkter vit fyllning med svart
 * siffra, spannet `FARG.fyllning`, idag = blå ring (som Arbetsrapports kalender).
 * Varje dagcell är minst 44 px hög; månadspilarna 44 × 44.
 */
export default function ValjKalender({
  valdStart, valdSlut, onValj,
}: {
  valdStart: string | null;
  valdSlut: string | null;
  onValj: (start: string | null, slut: string | null) => void;
}) {
  const startDatum = valdStart ? new Date(valdStart + 'T00:00:00') : new Date();
  const [ar, setAr] = useState(startDatum.getFullYear());
  const [manad, setManad] = useState(startDatum.getMonth());

  const idagIso = toISO(new Date());

  const bytManad = (delta: number) => {
    let m = manad + delta;
    let a = ar;
    if (m < 0) { m = 11; a--; }
    if (m > 11) { m = 0; a++; }
    setManad(m);
    setAr(a);
  };

  const tryck = (iso: string) => {
    if (!valdStart || (valdStart && valdSlut)) {
      // inget val, eller färdigt spann → nytt val börjar
      onValj(iso, null);
    } else if (iso < valdStart) {
      // tryck före starten → spannet byter håll
      onValj(iso, valdStart);
    } else {
      onValj(valdStart, iso);
    }
  };

  // Bygg veckorader (måndagsstart)
  const forstaVeckodag = (new Date(ar, manad, 1).getDay() + 6) % 7;
  const antalDagar = new Date(ar, manad + 1, 0).getDate();
  const celler: (number | null)[] = [
    ...Array.from({ length: forstaVeckodag }, () => null),
    ...Array.from({ length: antalDagar }, (_, i) => i + 1),
  ];
  while (celler.length % 7 !== 0) celler.push(null);
  const rader: (number | null)[][] = [];
  for (let i = 0; i < celler.length; i += 7) rader.push(celler.slice(i, i + 7));

  const pil: React.CSSProperties = { ...KNAPP.tertiar, width: TRAFFYTA.min, justifyContent: 'center', color: FARG.text };

  return (
    <div>
      {/* Månadsnavigering */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: AVSTAND.xs }}>
        <span style={{ ...TYP.listtitel, color: FARG.text, textTransform: 'capitalize' }}>
          {MANADSNAMN[manad]} <span style={{ fontWeight: VIKT.normal, color: FARG.text2 }}>{ar}</span>
        </span>
        <div style={{ display: 'flex', gap: AVSTAND.xs }}>
          <button type="button" aria-label="Föregående månad" onClick={() => bytManad(-1)} style={pil}><Ikon namn="chevron_left" farg="inherit" /></button>
          <button type="button" aria-label="Nästa månad" onClick={() => bytManad(1)} style={pil}><Ikon namn="chevron_right" farg="inherit" /></button>
        </div>
      </div>

      {/* Veckodagsrubriker */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: AVSTAND.xs }}>
        {VECKODAGAR.map((v, i) => (
          <div key={v} style={{ textAlign: 'center', padding: `${AVSTAND.xs}px 0`, ...TYP.micro, color: i >= 5 ? FARG.rod : FARG.text2 }}>
            {v}
          </div>
        ))}
      </div>

      {/* Dagrutor */}
      {rader.map((rad, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {rad.map((dag, ci) => {
            if (dag === null) return <div key={`t${ci}`} style={{ minHeight: TRAFFYTA.min }} />;

            const iso = toISO(new Date(ar, manad, dag));
            const ledigDag = arHelg(iso) || arRodDag(iso); // räknas ej som arbetsdag
            const effektivtSlut = valdSlut ?? valdStart;
            const iSpann = !!valdStart && !!effektivtSlut && iso >= valdStart && iso <= effektivtSlut;
            const arKant = iso === valdStart || iso === effektivtSlut;
            const arIdag = iso === idagIso;

            return (
              <button
                key={dag}
                type="button"
                aria-pressed={iSpann}
                onClick={() => tryck(iso)}
                style={{
                  minHeight: TRAFFYTA.min, background: 'transparent', border: 'none', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <span style={{
                  width: DAGRUTA, height: DAGRUTA, borderRadius: RADIE.cirkel,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: iSpann ? (arKant ? FARG.text : FARG.fyllning) : 'transparent',
                  boxShadow: arIdag && !arKant ? `inset 0 0 0 2px ${FARG.text2}` : 'none', // dagens datum: ring i dämpad text + halvfet — inte navigeringsblå
                  ...TYP.text, ...TNUM,
                  fontWeight: arKant ? VIKT.fet : arIdag ? VIKT.halvfet : VIKT.normal,
                  color: arKant ? FARG.bg : ledigDag ? FARG.rod : FARG.text,
                }}>
                  {dag}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
