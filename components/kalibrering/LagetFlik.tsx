'use client';
// LÄGET — "Är vi godkända?" Så enkelt att den läses på tre sekunder: svaret, Vidas krav (sämst först) och trädslagen. Inget annat.
// Appen visar läget; maskinen (Opti) föreslår kalibreringen. Kortet "Gör så här", det stora talet och åtgärderna är borta härifrån (2026-10-25,
// Martin: "plocka bort det … bygg så man kan kolla på datan, sen säger maskinen vad du ska göra"). Åtgärderna bor i Över tid, under kurvorna.
// Domen bygger alltid på det rullande fönstret (90 dagar), aldrig på en enda dag. Räknandet bor i lib/kalibrering/laget — siffrorna är desamma som förut.
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import Tillstand from '@/components/design/Tillstand';
import { FARG, KNAPP, TYP } from '@/lib/design/tokens';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { fonsterKort, kalibreringsDom, kravRader, kravSorterade } from '@/lib/kalibrering/laget';
import { cap } from '@/lib/kalibrering/text';
import { Fyll, Lugn, TonVarde } from './delar';
import Rubrik from './Rubrik';
import TraffText from './TraffText';

function Laddar({ d, text }: { d: KalibreringData; text: string }) {
  return d.bedomningFel
    ? (
      <>
        <Svarsrad rubrik="Läget kunde inte läsas" rad="Kontrollerna finns kvar. Försök igen om en stund." fri avvikelse />
        <button type="button" onClick={d.forsokIgen} style={KNAPP.sekundar}>Försök igen</button>
      </>
    )
    : <Lugn ikon="hourglass_empty" marginTop={0}>{text}</Lugn>;
}

export default function LagetFlik({ d, ark }: { d: KalibreringData; ark: KalibreringArk }) {
  const b = d.bedomning;
  return (
    <>
      <Rubrik d={d}>
        {b && <div style={{ ...TYP.meta, color: FARG.text2 }}>{fonsterKort(b)}</div>}
      </Rubrik>
      <Tillstand nyckel={b ? 'klar' : d.bedomningFel ? 'fel' : 'laddar'}>
        {!b ? <Laddar d={d} text="Läser läget…" /> : <Innehall d={d} ark={ark} />}
      </Tillstand>
    </>
  );
}

function Innehall({ d, ark }: { d: KalibreringData; ark: KalibreringArk }) {
  const b = d.bedomning!;
  const dom = kalibreringsDom(b);
  const krav = kravSorterade(kravRader(b));
  const harProfil = dom.status !== 'ingen_profil';

  return (
    <>
      <Svarsrad rubrik={dom.titel} rad={dom.rad} fri avvikelse={dom.avvikelse} />

      {/* Ett tryck på en rad: vad måttet betyder och vad Vida kräver. */}
      {harProfil && (
        <Sektion rubrik="Vidas krav">
          {krav.map((r, i) => (
            <Rad key={r.key} sista={i === krav.length - 1} titel={r.kort} onTryck={ark.oppnaHjalp}
              hoger={<TonVarde ton={r.ton} dampadOk>{r.varde}</TonVarde>} hogerUnder={r.ord ?? undefined} />
          ))}
        </Sektion>
      )}

      <PerTradslag d={d} ark={ark} />
    </>
  );
}

function PerTradslag({ d, ark }: { d: KalibreringData; ark: KalibreringArk }) {
  const { trData, trRader } = d;
  return (
    <Sektion rubrik="Per trädslag">
      {d.tradslagFel ? (
        <Fyll><Lugn ikon="error" marginTop={0}>{d.tradslagFel}</Lugn></Fyll>
      ) : !trData ? (
        <Fyll><Lugn ikon="hourglass_empty" marginTop={0}>Läser trädslagen…</Lugn></Fyll>
      ) : trRader.length === 0 ? (
        <Fyll><Lugn marginTop={0}>Inga trädslag med underlag.</Lugn></Fyll>
      ) : (
        trRader.map((t, i) => (
          <Rad key={t.tradslag} sista={i === trRader.length - 1} onTryck={() => ark.oppnaArt(t.tradslag.toLowerCase())} titel={cap(t.tradslag)}
            under={<>{'Längden '}<TraffText stat={t.langd} variabel="langd" trosklar={trData.trosklar} /></>}
            hoger={<TraffText stat={t.diameter} variabel="diameter" trosklar={trData.trosklar} />} hogerUnder="diametern" />
        ))
      )}
    </Sektion>
  );
}
