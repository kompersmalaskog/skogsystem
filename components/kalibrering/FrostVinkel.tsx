'use client';
// FROST — "Flyttar frosten hela kurvan?" Maskinens fel mot klaven per grovlek och virkets läge (varmt / fruset / sträng kyla, dygnet före kontrollen), och svaret i ord:
// ändras felet lika mycket i alla grovlekar när det fryser (då räcker det att flytta hela kurvan) eller olika mycket (då gör det inte det). Appen föreslår ingen justering.
// Räkningen i lib/kalibrering/frost.ts, underlaget /api/kalibrering/frost (hela maskinens historik, ERA5 för dygnet före).
import { useEffect, useState } from 'react';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import { AVSTAND, FARG, KNAPP, TNUM, TYP, VIKT } from '@/lib/design/tokens';
import { frostCellText, frostVy, type FrostResp } from '@/lib/kalibrering/frost';
import { GROVLEK_MIN_STAMMAR } from '@/lib/kalibrering/grovlek';
import type { VaderKlass } from '@/lib/kalibrering/vaderOmslag';
import { Fyll, Lugn, Meta } from './delar';

const LAGEN: readonly (readonly [VaderKlass, string])[] = [['varmt', 'Varmt'], ['fruset', 'Fruset'], ['kallt', 'Sträng kyla']];
const GRUPP: Record<string, { titel: string; under: string }> = {
  klen: { titel: 'Klena', under: 'under 150 mm' },
  mellan: { titel: 'Mellangrova', under: '150–249 mm' },
  grov: { titel: 'Grova', under: 'över 250 mm' },
};

export default function FrostVinkel({ maskin }: { maskin: string | null }) {
  const [svar, setSvar] = useState<FrostResp | 'laser' | 'fel'>('laser');
  const [forsok, setForsok] = useState(0);
  useEffect(() => {
    if (!maskin) return;
    let aktiv = true;
    setSvar('laser');
    fetch(`/api/kalibrering/frost?maskin_id=${encodeURIComponent(maskin)}`)
      .then(r => r.json() as Promise<FrostResp | { ok: false }>)
      .then(j => { if (aktiv) setSvar(j.ok ? j : 'fel'); })
      .catch(() => { if (aktiv) setSvar('fel'); });
    return () => { aktiv = false; };
  }, [maskin, forsok]);

  if (svar === 'laser') return <Lugn ikon="hourglass_empty" marginTop={0}>Läser vädret vid kontrollerna…</Lugn>;
  if (svar === 'fel') {
    return (
      <>
        <Svarsrad rubrik="Frosten kunde inte läsas" rad="Kontrollerna finns kvar. Försök igen om en stund." fri avvikelse />
        <button type="button" onClick={() => setForsok(f => f + 1)} style={KNAPP.sekundar}>Försök igen</button>
      </>
    );
  }
  const vy = frostVy(svar.rader);
  const visa = LAGEN.filter(([l]) => l !== 'kallt' || vy.stammar.kallt > 0);
  return (
    <Sektion rubrik="Flyttar frosten hela kurvan?" not={(
      <span>
        Maskinen minus klaven, snitt per stam. Läget är virkets: snittet av dygnet före kontrollen — varmt över 0 °C, fruset 0 till −7, sträng kyla −7 och kallare.
        {' '}Under {GROVLEK_MIN_STAMMAR} stammar visas –.
        {svar.utanVader > 0 && ` ${svar.utanVader === 1 ? '1 stam' : `${svar.utanVader} stammar`} har inget väder än (arkivet ligger ca 5 dygn efter) och räknas inte.`}
      </span>
    )}>
      <Fyll>
        <div data-frost-svar style={{ ...TYP.listtitel, color: FARG.text }}>{vy.fruset}</div>
        {vy.kallt && <div data-frost-kallt style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>{vy.kallt}</div>}
        <div role="table" style={{ display: 'grid', gridTemplateColumns: `minmax(0, 1.3fr) repeat(${visa.length}, minmax(0, 1fr))`, columnGap: AVSTAND.s, rowGap: AVSTAND.m, marginTop: AVSTAND.l, ...TNUM }}>
          <div role="columnheader" />
          {visa.map(([l, namn]) => <div key={l} role="columnheader" style={{ ...TYP.meta, color: FARG.text2, textAlign: 'right' }}>{namn}</div>)}
          {vy.tabell.map(rad => (
            <div key={rad.grupp} role="row" style={{ display: 'contents' }}>
              <div role="rowheader">
                <div style={{ ...TYP.text, color: FARG.text, fontWeight: VIKT.halvfet }}>{GRUPP[rad.grupp].titel}</div>
                <Meta>{GRUPP[rad.grupp].under}</Meta>
              </div>
              {visa.map(([l]) => {
                const c = rad.celler[l];
                return (
                  <div key={l} role="cell" data-frost-cell={`${rad.grupp}-${l}`} style={{ textAlign: 'right' }}>
                    <div style={{ ...TYP.text, color: c.snittMm == null ? FARG.text3 : FARG.text }}>{frostCellText(c)}</div>
                    <Meta>{c.stammar} st</Meta>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Fyll>
    </Sektion>
  );
}
