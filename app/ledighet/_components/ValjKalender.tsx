'use client';

import React, { useState } from 'react';
import { C, ff } from './tema';
import { MANADSNAMN, arHelg, arRodDag, toISO } from './datum';

const VECKODAGAR = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

/**
 * Tryck-kalender för periodval. Ingen dold fas-logik:
 * - tryck 1 = startdag (och därmed en endagsperiod tills vidare)
 * - tryck 2 = slutdag → spannet fylls (tryck före starten byter håll)
 * - tryck efter färdigt spann = nytt val börjar
 * - "Rensa" (synlig knapp i föräldern) nollställer via onValj(null, null)
 * Helger/röda dagar går att ta med i spannet men exkluderas ur
 * arbetsdagsräkningen (samma logik som steg 4 — bara kopplad till tryck).
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

  const navKnapp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
    borderRadius: 10, width: 34, height: 34, color: C.t2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontSize: 16, fontFamily: ff,
  };

  return (
    <div style={{ fontFamily: ff }}>
      {/* Månadsnavigering */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 2px' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.t1, textTransform: 'capitalize' }}>
          {MANADSNAMN[manad]} <span style={{ fontWeight: 400, color: C.t3 }}>{ar}</span>
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => bytManad(-1)} style={navKnapp}>‹</button>
          <button type="button" onClick={() => bytManad(1)} style={navKnapp}>›</button>
        </div>
      </div>

      {/* Veckodagsrubriker */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
        {VECKODAGAR.map((v, i) => (
          <div key={v} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 500, padding: '4px 0',
            color: i >= 5 ? 'rgba(239,68,68,0.7)' : C.t3,
          }}>
            {v}
          </div>
        ))}
      </div>

      {/* Dagrutor */}
      {rader.map((rad, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {rad.map((dag, ci) => {
            if (dag === null) return <div key={`t${ci}`} style={{ aspectRatio: '1' }} />;

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
                onClick={() => tryck(iso)}
                style={{
                  aspectRatio: '1', background: 'transparent', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', padding: 0, fontFamily: ff, position: 'relative',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: iSpann ? (arKant ? C.blue : C.blueDim) : 'transparent',
                  border: arIdag && !iSpann ? `1.5px solid ${C.blue}` : 'none',
                }}>
                  <span style={{
                    fontSize: 13,
                    fontWeight: arKant ? 700 : 400,
                    color: iSpann
                      ? (arKant ? '#fff' : C.t1)
                      : ledigDag ? 'rgba(239,68,68,0.55)' : C.t1,
                  }}>
                    {dag}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
