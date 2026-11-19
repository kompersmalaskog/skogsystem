'use client';
// LÄGET › VAR SITTER FELET? — klena, mellangrova eller grova stockar, och rotstocken per trädslag, i ord ("4 mm för grovt"). Ingen justering föreslås:
// appen visar var felet sitter, maskinen räknar ut justeringen. Växeln styr BARA den här delen — domen och Vidas krav bygger alltid på 90 dagar.
// Räknandet bor i lib/kalibrering/felet (samma regler som Över tid › Per grovlek).
import { useEffect, useState } from 'react';
import Flikkontroll from '@/components/design/Flikkontroll';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, KNAPP } from '@/lib/design/tokens';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { fmtDagMan } from '@/lib/kalibrering/datum';
import { varSitterFelet, type FeletPeriod } from '@/lib/kalibrering/felet';
import { Fyll, Lugn, TonVarde } from './delar';

export default function VarSitterFelet({ d }: { d: KalibreringData }) {
  const [period, setPeriod] = useState<FeletPeriod>('fonster');
  const { effektiv, laddaFelet, feletData, feletFel, bedomning } = d;
  useEffect(() => { if (effektiv) laddaFelet(effektiv); }, [effektiv, laddaFelet]);
  // Byter man maskin börjar delen om på 90 dagar.
  useEffect(() => { setPeriod('fonster'); }, [effektiv]);

  if (feletFel) {
    return (
    <Sektion rubrik="Var sitter felet?">
      <Fyll>
        <Lugn ikon="error" marginTop={0}>{feletFel}</Lugn>
        <button type="button" onClick={d.forsokIgen} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>Försök igen</button>
      </Fyll>
      </Sektion>
    );
  }
  if (!feletData || !bedomning) {
    return <Sektion rubrik="Var sitter felet?"><Fyll><Lugn ikon="hourglass_empty" marginTop={0}>Läser stammarna…</Lugn></Fyll></Sektion>;
  }

  const kal = feletData.senasteKalibrering;
  const vald: FeletPeriod = kal ? period : 'fonster';
  const vy = varSitterFelet({ resp: feletData, period: vald, fonster: bedomning.fonster, trosklar: bedomning.trosklar });

  return (
    <Sektion rubrik="Var sitter felet?" not={vy.mening && !vy.tom ? <span>{vy.mening}<br />{vy.not}</span> : vy.tom ? null : vy.not}>
      {kal && (
        <div style={{ padding: `${AVSTAND.m}px 0` }}>
          <Flikkontroll flikar={[['fonster', '90 dagar'], ['kalibrering', `Sedan kalibrering ${fmtDagMan(kal)}`]] as const} aktiv={vald} onVal={setPeriod} />
        </div>
      )}
      {vy.tom ? (
        <Fyll><Lugn marginTop={0}>{vy.tom}</Lugn></Fyll>
      ) : (
        vy.rader.map((r, i) => (
          <Rad key={r.key} sista={i === vy.rader.length - 1 && !vy.langdRad} titel={r.titel} under={r.under}
            hoger={<TonVarde ton={r.ton} dampadOk>{r.varde}</TonVarde>} hogerUnder={r.ord || undefined} />
        ))
      )}
      {vy.langdRad && (
        <div data-rad="langd">
          <Rad sista titel={vy.langdRad.titel} under={vy.langdRad.under}
            hoger={<TonVarde ton={vy.langdRad.ton} dampadOk>{vy.langdRad.varde}</TonVarde>} hogerUnder={vy.langdRad.ord || undefined} />
        </div>
      )}
      </Sektion>
  );
}
