'use client';
// LÄGET — "Är vi godkända?" Så enkelt att den läses på tre sekunder: svaret, sedan tre delar — Idag (det enda föraren ska GÖRA: dagens kontrollstam,
// vädret, klaven när den ska kollas), Vidas krav (sämst först) och Var sitter felet? Trädslagen och kontrollernas antal ligger bakom raden "Fler siffror"
// (Martin 2026-11-25: Läget var ca 20 rader i fem sektioner).
// Appen visar läget; maskinen (Opti) föreslår kalibreringen. Kortet "Gör så här", det stora talet och åtgärderna är borta härifrån (2026-10-25,
// Martin: "plocka bort det … bygg så man kan kolla på datan, sen säger maskinen vad du ska göra"). Åtgärderna bor i Över tid, under kurvorna.
// Sist "Kontrollerna" (2026-11-18, Skogforsk): hur många, hur många slumpvalda, hur många i sträng kyla, vädret nu mot vid senaste kontrollen
// (SMHI, VaderRad) — och när klaven och måttbandet kollades. Överst "Idag · Gjord / Inte än" (lib/kalibrering/idag): en kontrollstam om dagen.
// Domen bygger alltid på det rullande fönstret (90 dagar), aldrig på en enda dag. Räknandet bor i lib/kalibrering/laget — siffrorna är desamma som förut.
import { useState } from 'react';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import Tillstand from '@/components/design/Tillstand';
import { AVSTAND, FARG, KNAPP, KORT, TYP } from '@/lib/design/tokens';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { fmtDagMan } from '@/lib/kalibrering/datum';
import { kontrollerIdag } from '@/lib/kalibrering/idag';
import { KALL_GRANS_C, grader, kontrollSammanfattning } from '@/lib/kalibrering/kontrollLista';
import { fonsterKort, kalibreringsDom, kravRader, kravSorterade } from '@/lib/kalibrering/laget';
import { matdonLage } from '@/lib/kalibrering/matdon';
import { cap } from '@/lib/kalibrering/text';
import { Fyll, Lugn, TonVarde } from './delar';
import Rubrik from './Rubrik';
import TraffText from './TraffText';
import VaderRad from './VaderRad';
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
  const [fler, setFler] = useState(false);
  const m = d.matdon === undefined ? null : matdonLage(d.matdon);
  // Klaven och måttbandet är något att GÖRA bara när de ska kollas (eller inte gick att läsa); annars är raden en siffra bland de andra.
  const klaveIdag = !!d.matdonFel || !!m?.dags;

  return (
    <>
      <Svarsrad rubrik={dom.titel} rad={dom.rad} fri avvikelse={dom.avvikelse} />

      <Idag d={d} ark={ark} klave={klaveIdag} />

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

      <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0, marginBottom: AVSTAND.xl }}>
        <Rad sista titel="Fler siffror" under={fler ? undefined : 'Per trädslag och kontrollerna'} pil={false} onTryck={() => setFler(f => !f)}
          attr={{ 'data-rad': 'fler', 'aria-expanded': fler ? 'true' : 'false' }}
          hoger={<span style={{ color: FARG.text2 }}>{fler ? 'Dölj' : 'Visa'}</span>} />
      </div>

      {fler && (
        <>
          <PerTradslag d={d} ark={ark} />
          <Kontrollerna d={d} ark={ark} klave={!klaveIdag} />
        </>
      )}
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

/** Klave och måttband: "Kollade 3 sep" eller orange "Aldrig kollade · Dags att kolla". Ett tryck öppnar arket med de tre stegen. */
function KlaveRad({ d, ark, sista }: { d: KalibreringData; ark: KalibreringArk; sista: boolean }) {
  const m = d.matdon === undefined ? null : matdonLage(d.matdon);
  return (
    <Rad sista={sista} titel="Klave och måttband" onTryck={ark.oppnaMatdon} attr={{ 'data-rad': 'matdon' }}
      hoger={d.matdonFel ? <span style={{ color: FARG.text3 }}>Kunde inte läsas</span> : m ? <span style={{ color: m.dags ? FARG.orange : FARG.text2 }}>{m.varde}</span> : <span style={{ color: FARG.text3 }}>Läser…</span>}
      hogerUnder={m?.under ?? undefined} />
  );
}

/** IDAG — det enda föraren ska göra: dagens kontrollstam, vädret (när det har slagit om säger raden det) och klaven när den ska kollas. */
function Idag({ d, ark, klave }: { d: KalibreringData; ark: KalibreringArk; klave: boolean }) {
  const idag = kontrollerIdag(d.filteredKalib, d.tider, new Date());
  return (
    <Sektion rubrik="Idag" className="kal-utan-sista-linje">
      <Rad titel="Dagens kontrollstam" under="En om dagen" pil={false} attr={{ 'data-rad': 'idag' }}
        hoger={<span style={{ color: idag.sen ? FARG.orange : idag.antal > 0 ? FARG.gron : FARG.text2 }}>{idag.text}</span>}
        hogerUnder={idag.under ?? undefined} />
      <VaderRad maskin={d.effektiv} sista={!klave} />
      {klave && <KlaveRad d={d} ark={ark} sista />}
    </Sektion>
  );
}

function Kontrollerna({ d, ark, klave }: { d: KalibreringData; ark: KalibreringArk; klave: boolean }) {
  const b = d.bedomning!;
  const s = b.fonster ? kontrollSammanfattning(d.filteredKalib, d.tider, b.fonster.fran) : null;
  if (!s && !klave) return null;
  return (
    <Sektion rubrik="Kontrollerna" className="kal-utan-sista-linje">
      {s && s.senaste && (
        <Rad titel="Senaste kontrollen" pil={false} hoger={fmtDagMan(s.senaste)} attr={{ 'data-rad': 'senaste' }} />
      )}
      {s && b.fonster && (
        <Rad titel={`Senaste ${b.fonster.dagar} dagarna`} pil={false} attr={{ 'data-rad': 'antal' }} sista={!klave && !(s.kalla > 0)}
          hoger={`${s.antal} ${s.antal === 1 ? 'kontroll' : 'kontroller'}`}
          hogerUnder={s.slump == null ? undefined : `${s.slump} slumpvalda`} />
      )}
      {s && s.kalla > 0 && (
        <Rad titel="I sträng kyla" under={`Under ${grader(KALL_GRANS_C)} mäter maskinen ofta annorlunda`} pil={false} attr={{ 'data-rad': 'kyla' }} sista={!klave}
          hoger={<span style={{ color: FARG.orange }}>{`${s.kalla} av ${s.antal}`}</span>} />
      )}
      {klave && <KlaveRad d={d} ark={ark} sista />}
    </Sektion>
  );
}
