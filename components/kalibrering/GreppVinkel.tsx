'use client';
// GREPPET — "Släpper greppet oftare?" Hur ofta maskinens egen diameter står still över 30 cm (samma definition som stamvyn), per trädslag och månad, räknat på ALLA stammar
// maskinen har kapat — ingen klave, inga kontrollstammar. Ersätter tryckmätaren. Färgen är FÖRÄNDRING mot radens första ruta, inte nivå: trädslagen har olika form från
// början (björk ligger alltid högre än gran), så det som ska läsas är hur varje rad rör sig, i sidled. Räkningen bor i databasen (cache per objekt) och lib/kalibrering/greppTid.
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import { AVSTAND, FARG, KNAPP } from '@/lib/design/tokens';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import type { KalibreringVy } from '@/lib/hooks/useKalibreringVy';
import { fmtAntal } from '@/lib/kalibrering/format';
import { GREPP_FORANDRING_ORANGE, GREPP_FORANDRING_ROD, GREPP_MIN_CM, GREPP_MIN_STAMMAR, greppRutnat, type GreppRuta } from '@/lib/kalibrering/greppTid';
import { fmtPeriod, rundaMedTecken } from '@/lib/kalibrering/rutnat';
import { Fyll, Lugn, Meta } from './delar';
import Rutnat, { Teckenforklaring, type RutCell } from './Rutnat';

const MINUS = '−';
const signerat = (x: number): string => { const r = rundaMedTecken(x); return `${r > 0 ? '+' : r < 0 ? MINUS : ''}${Math.abs(r)}`; };

export default function GreppVinkel({ d, v }: { d: KalibreringData; v: KalibreringVy }) {
  const data = d.greppData;
  if (!data) {
    return d.greppFel ? (
      <>
        <Svarsrad rubrik="Greppet kunde inte läsas" rad="Kontrollerna finns kvar. Försök igen om en stund." fri avvikelse />
        <button type="button" onClick={d.forsokIgen} style={KNAPP.sekundar}>Försök igen</button>
      </>
    ) : <Lugn ikon="hourglass_empty" marginTop={0}>Läser greppet…</Lugn>;
  }
  if (!data.tillganglig) {
    return <Svarsrad rubrik="Greppet är inte aktiverat än" rad="Databasen saknar beräkningen (migrationen är inte körd). Träff och Spridning fungerar som vanligt." fri />;
  }
  if (data.rader.length === 0 && data.kvar === 0) return <Fyll><Lugn marginTop={0}>Maskinens stamprofiler finns inte för den här maskinen ännu.</Lugn></Fyll>;

  const r = greppRutnat(data.rader, v.lagetSteg);
  const cell = (rad: { etikett: string }, c: GreppRuta | null): RutCell | null => {
    if (!c) return null;
    const namn = `${rad.etikett}, ${fmtPeriod(c.period, v.lagetSteg)}`;
    if (c.tunn) return { huvud: '–', ton: 'tunn', beskrivning: `${namn}: för få stammar (${c.stammar}, minst ${GREPP_MIN_STAMMAR})` };
    const forandring = c.forandring == null ? 'startpunkt för raden' : `${signerat(c.forandring)} procentenheter mot första rutan`;
    return {
      huvud: `${Math.round(c.pct)} %`, liten: c.forandring == null ? 'start' : `${signerat(c.forandring)} pp`, ton: c.ton,
      beskrivning: `${namn}: greppet står still ${Math.round(c.pct)} % av stegen i snitt över ${fmtAntal(c.stammar)} stammar, ${forandring}`,
    };
  };

  return (
    <Sektion rubrik="Släpper greppet oftare?" not={(
      <span>
        Andel av stammens 10 cm-steg där maskinens diameter står still i minst {GREPP_MIN_CM} cm — alla stammar, utan klave. Färgen är förändringen mot radens första ruta, inte nivån.
      </span>
    )}>
      <Fyll>
        {data.kvar > 0 && <div style={{ marginBottom: AVSTAND.l }}><Lugn ikon="hourglass_empty" marginTop={0}>Räknas om — {data.kvar === 1 ? '1 objekt ligger' : `${data.kvar} objekt ligger`} efter. Siffrorna kompletteras av sig själva.</Lugn></div>}
        {r.perioder.length === 0 ? <Lugn marginTop={0}>Inget underlag ännu.</Lugn> : (
          <>
            <Rutnat
              perioder={r.perioder} etiketter={r.perioder.map(p => fmtPeriod(p, v.lagetSteg))}
              rader={r.rader.map(rad => ({ id: rad.id, etikett: rad.etikett, sub: rad.sub, skild: rad.id === '300+', celler: rad.celler.map(c => cell(rad, c)) }))} />
            <Meta style={{ marginTop: AVSTAND.m }}>Jämför i sidled. Grova och krokiga stammar står still oftare även när allt är rätt.</Meta>
            <Teckenforklaring poster={[
              { farg: FARG.rod, ord: `Mer greppfel · ${GREPP_FORANDRING_ROD} procentenheter eller mer` },
              { farg: FARG.orange, ord: `${GREPP_FORANDRING_ORANGE}–${GREPP_FORANDRING_ROD - 1} procentenheter mer` },
              { farg: FARG.gron, ord: `Mindre greppfel · ${GREPP_FORANDRING_ORANGE} procentenheter eller mer` },
              { farg: FARG.text3, ord: `Grå, – · färre än ${GREPP_MIN_STAMMAR} stammar` },
            ]} />
            {data.stammarTotalt > data.stammarRaknade && (
              <Meta style={{ marginTop: AVSTAND.s }}>{fmtAntal(data.stammarRaknade)} av {fmtAntal(data.stammarTotalt)} stammar ingår — resten saknar trädslag eller tid i stamfilen.</Meta>
            )}
          </>
        )}
      </Fyll>
    </Sektion>
  );
}
