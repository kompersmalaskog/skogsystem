'use client';
// PER GROVLEK — "Var sitter felen?" Ett rutnät över historiken: grovlek × månad (eller kvartal/år), för alla trädslag eller ett. I rutan: träff mot klaven stort och snittet
// (maskin − klave) litet under. Färg: grön ≥ kravet, orange mellan golv och mål, röd under golvet, grå "–" = för få stammar. Ett tryck öppnar kontrollerna bakom rutan.
// Räkningen bor i lib/kalibrering/grovlek (en stam räknas en gång per ruta); här ritas den.
import Flikkontroll from '@/components/design/Flikkontroll';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import { AVSTAND, FARG, KNAPP } from '@/lib/design/tokens';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import type { KalibreringVy } from '@/lib/hooks/useKalibreringVy';
import { fmtKrav, fmtSig1 } from '@/lib/kalibrering/format';
import { GROVLEK_KLASSER, GROVLEK_MIN_STAMMAR, grovlekRutaKontroller, grovlekRutnat, klassEtikett, type GrovlekRuta } from '@/lib/kalibrering/grovlek';
import { fmtPeriod, periodNamn, type RutKrav } from '@/lib/kalibrering/rutnat';
import { Fyll, Lugn, Meta } from './delar';
import Rutnat, { Teckenforklaring, type RutCell } from './Rutnat';

const ALLA = 'alla';

export default function GrovlekVinkel({ d, v, ark }: { d: KalibreringData; v: KalibreringVy; ark: KalibreringArk }) {
  const data = d.grovlekData;
  if (!data) {
    return d.grovlekFel ? (
      <>
        <Svarsrad rubrik="Grovlekarna kunde inte läsas" rad="Kontrollerna finns kvar. Försök igen om en stund." fri avvikelse />
        <button type="button" onClick={d.forsokIgen} style={KNAPP.sekundar}>Försök igen</button>
      </>
    ) : <Lugn ikon="hourglass_empty" marginTop={0}>Läser grovlekarna…</Lugn>;
  }
  if (data.rader.length === 0) return <Fyll><Lugn marginTop={0}>Inget underlag ännu.</Lugn></Fyll>;

  const kravRad = d.bedomning?.trosklar.find(t => t.variabel === 'diameter' && t.metrik === 'traffprocent');
  const krav: RutKrav | null = kravRad ? { mal: Number(kravRad.mal), golv: Number(kravRad.golv) } : null;
  const alla = grovlekRutnat(data.rader, { steg: v.lagetSteg, tradslag: null, krav });
  // Ett valt trädslag som inte finns för den här maskinen är inget val: då gäller alla.
  const tradslag = v.grovlekTradslag && alla.tradslag.includes(v.grovlekTradslag) ? v.grovlekTradslag : null;
  const r = tradslag ? grovlekRutnat(data.rader, { steg: v.lagetSteg, tradslag, krav }) : alla;

  const flikar: readonly (readonly [string, string])[] = [[ALLA, 'Alla'], ...alla.tradslag.map(t => [t, t] as const)];

  const oppna = (ruta: GrovlekRuta) => ark.oppnaRuta({
    rubrik: `${tradslag ?? 'Alla trädslag'} · ${klassEtikett(ruta.klass)} mm`,
    periodNamn: periodNamn(ruta.period, v.lagetSteg),
    klass: ruta.klass, stammar: ruta.stammar, traffPct: ruta.traffPct, snittMm: ruta.snittMm, ton: ruta.ton, tunn: ruta.tunn, tolerans: data.tolerans,
    kontroller: grovlekRutaKontroller(data.rader, { klass: ruta.klass, period: ruta.period, steg: v.lagetSteg, tradslag, krav }),
  });
  const cell = (ruta: GrovlekRuta | null): RutCell | null => {
    if (!ruta) return null;
    const namn = `${tradslag ?? 'Alla trädslag'}, ${klassEtikett(ruta.klass)} mm, ${periodNamn(ruta.period, v.lagetSteg)}`;
    return ruta.tunn
      ? { huvud: '–', ton: 'tunn', beskrivning: `${namn}: för få stammar (${ruta.stammar}, minst ${GROVLEK_MIN_STAMMAR})`, onTryck: () => oppna(ruta) }
      : {
        huvud: `${Math.round(ruta.traffPct)} %`, liten: `${fmtSig1(ruta.snittMm)} mm`, ton: ruta.ton,
        beskrivning: `${namn}: ${Math.round(ruta.traffPct)} % inom ±${data.tolerans} mm, snitt ${fmtSig1(ruta.snittMm)} mm, ${ruta.stammar} stammar`, onTryck: () => oppna(ruta),
      };
  };

  const orangeFinns = krav != null && krav.mal > krav.golv;
  return (
    <Sektion rubrik="Var sitter felen?" not={(
      <span>Träff inom ±{data.tolerans} mm mot klaven, stort. Under det snittet (maskin − klave): + betyder att maskinen mäter grövre. Varje stam väger lika. Tryck på en ruta för kontrollerna bakom den.</span>
    )}>
      <Fyll>
        {flikar.length > 2 && (
          <div style={{ marginBottom: AVSTAND.l }}>
            <Flikkontroll flikar={flikar} aktiv={tradslag ?? ALLA} onVal={id => v.setGrovlekTradslag(id === ALLA ? null : id)} />
          </div>
        )}
        {r.perioder.length === 0 ? <Lugn marginTop={0}>Inget underlag för {tradslag?.toLowerCase()}.</Lugn> : (
          <>
            <Rutnat
              perioder={r.perioder} etiketter={r.perioder.map(p => fmtPeriod(p, v.lagetSteg))}
              horn="mm" rader={GROVLEK_KLASSER.map((k, i) => ({ id: k, etikett: klassEtikett(k), celler: r.rader[i].celler.map(cell) }))} />
            <Teckenforklaring poster={[
              ...(krav ? [
                { farg: FARG.gron, ord: `Når kravet · ${fmtKrav(krav.mal)} % eller mer` },
                ...(orangeFinns ? [{ farg: FARG.orange, ord: `Under målet · ${fmtKrav(krav.golv)}–${fmtKrav(krav.mal)} %` }] : []),
                { farg: FARG.rod, ord: `Under golvet · under ${fmtKrav(krav.golv)} %` },
              ] : []),
              { farg: FARG.text3, ord: `Grå, – · färre än ${GROVLEK_MIN_STAMMAR} stammar` },
            ]} />
            {d.bedomning?.profil && <Meta style={{ marginTop: AVSTAND.s }}>Kravet är {d.bedomning.profil}s.</Meta>}
          </>
        )}
      </Fyll>
    </Sektion>
  );
}
