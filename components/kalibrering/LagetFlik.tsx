'use client';
// LÄGET — "Är vi godkända?" Så enkelt att den läses på tre sekunder: svaret, Vidas krav (sämst först), var felet sitter och trädslagen. Inget annat.
// Appen visar läget; maskinen (Opti) föreslår kalibreringen. Kortet "Gör så här", det stora talet och åtgärderna är borta härifrån (2026-10-25,
// Martin: "plocka bort det … bygg så man kan kolla på datan, sen säger maskinen vad du ska göra"). Åtgärderna bor i Över tid, under kurvorna.
// Sist "Kontrollerna" (2026-11-18, Skogforsk): hur många, hur många slumpvalda, hur många i sträng kyla — och när klaven och måttbandet kollades.
// Domen bygger alltid på det rullande fönstret (90 dagar), aldrig på en enda dag. Räknandet bor i lib/kalibrering/laget — siffrorna är desamma som förut.
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import Tillstand from '@/components/design/Tillstand';
import { FARG, KNAPP, TYP } from '@/lib/design/tokens';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { fmtDagMan } from '@/lib/kalibrering/datum';
import { KALL_GRANS_C, grader, kontrollSammanfattning } from '@/lib/kalibrering/kontrollLista';
import { fonsterKort, kalibreringsDom, kravRader, kravSorterade } from '@/lib/kalibrering/laget';
import { matdonLage } from '@/lib/kalibrering/matdon';
import { cap } from '@/lib/kalibrering/text';
import { Fyll, Lugn, TonVarde } from './delar';
import Rubrik from './Rubrik';
import TraffText from './TraffText';
import VarSitterFelet from './VarSitterFelet';

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

      {harProfil && <VarSitterFelet d={d} />}

      <PerTradslag d={d} ark={ark} />

      <Kontrollerna d={d} ark={ark} />
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

function Kontrollerna({ d, ark }: { d: KalibreringData; ark: KalibreringArk }) {
  const b = d.bedomning!;
  const s = b.fonster ? kontrollSammanfattning(d.filteredKalib, d.tider, b.fonster.fran) : null;
  const m = d.matdon === undefined ? null : matdonLage(d.matdon);
  return (
    <Sektion rubrik="Kontrollerna">
      {s && s.senaste && (
        <Rad titel="Senaste kontrollen" pil={false} hoger={fmtDagMan(s.senaste)} attr={{ 'data-rad': 'senaste' }} />
      )}
      {s && b.fonster && (
        <Rad titel={`Senaste ${b.fonster.dagar} dagarna`} pil={false} attr={{ 'data-rad': 'antal' }}
          hoger={`${s.antal} ${s.antal === 1 ? 'kontroll' : 'kontroller'}`}
          hogerUnder={s.slump == null ? undefined : `${s.slump} slumpvalda`} />
      )}
      {s && s.kalla > 0 && (
        <Rad titel="I sträng kyla" under={`Under ${grader(KALL_GRANS_C)} mäter maskinen ofta annorlunda`} pil={false} attr={{ 'data-rad': 'kyla' }}
          hoger={<span style={{ color: FARG.orange }}>{`${s.kalla} av ${s.antal}`}</span>} />
      )}
      <Rad sista titel="Klave och måttband" onTryck={ark.oppnaMatdon} attr={{ 'data-rad': 'matdon' }}
        hoger={d.matdonFel ? <span style={{ color: FARG.text3 }}>Kunde inte läsas</span> : m ? <span style={{ color: m.dags ? FARG.orange : FARG.text2 }}>{m.varde}</span> : <span style={{ color: FARG.text3 }}>Läser…</span>}
        hogerUnder={m?.under ?? undefined} />
    </Sektion>
  );
}
