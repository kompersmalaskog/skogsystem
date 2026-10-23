'use client';
// LÄGET — "Är vi godkända och vad ska jag göra?" Överst profil och fönster i liten text, domen som rubrik och träffprocenten som skärmens enda stora tal.
// Det stora talet är det mått som AVGÖR domen (fäller längden: längdens träff, annars diameterns); det andra måttet står som en rad under.
// Under det: Vidas krav (diameterns tre rader + längden), Per trädslag, Åtgärder. Ersätter Senaste-förarvyn, "Visa siffrorna", "Så ligger du till" och Rapport.
// Domen bygger alltid på det rullande fönstret (90 dagar), aldrig på en enda dag. Räknandet bor i lib/kalibrering/laget.
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import Tillstand from '@/components/design/Tillstand';
import { AVSTAND, FARG, IKON, KNAPP, TNUM, TYP } from '@/lib/design/tokens';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { fmtAntal } from '@/lib/kalibrering/format';
import { andraRad, atgardRader, fonsterText, kalibreringsDom, kravRader, stortTal } from '@/lib/kalibrering/laget';
import { cap } from '@/lib/kalibrering/text';
import { Fyll, Lugn, Meta, Status, TonVarde } from './delar';
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
        {b && <div style={{ ...TYP.meta, color: FARG.text2 }}>{fonsterText(b)}</div>}
      </Rubrik>

      {/* Plats för "Justeringsförslag" — kommer i en senare ändring, bygg inte här. */}

      <Tillstand nyckel={b ? 'klar' : d.bedomningFel ? 'fel' : 'laddar'}>
        {!b ? <Laddar d={d} text="Läser läget…" /> : <Innehall d={d} ark={ark} />}
      </Tillstand>
    </>
  );
}

function Innehall({ d, ark }: { d: KalibreringData; ark: KalibreringArk }) {
  const b = d.bedomning!;
  const dom = kalibreringsDom(b);
  const tal = stortTal(b);
  const andra = andraRad(b);
  const krav = kravRader(b);
  const atgarder = atgardRader(b);
  const harProfil = dom.status !== 'ingen_profil';

  return (
    <>
      <Svarsrad rubrik={dom.titel} rad={dom.rad} fri avvikelse={dom.avvikelse} />

      {/* Skärmens ENDA stora tal. */}
      <div style={{ margin: `0 0 ${AVSTAND.xl}px` }}>
        <div style={{ ...TYP.tal, color: tal.tyst ? FARG.text2 : FARG.text }}>
          <TonVarde ton={tal.ton}>{tal.varde}</TonVarde>
        </div>
        <Meta style={{ marginTop: AVSTAND.xs }}>{tal.etikett}</Meta>
        {andra && <div style={{ marginTop: AVSTAND.s }}><TonVarde ton={andra.ton} dampadOk style={TYP.meta}>{andra.text}</TonVarde></div>}
      </div>

      {harProfil && (
        <Sektion rubrik="Vidas krav">
          {krav.map((r, i) => (
            <Rad key={r.key} sista={i === krav.length - 1} titel={r.fraga}
              under={r.ord ? `${r.term} · ${r.ord}` : r.term}
              hoger={<TonVarde ton={r.ton} dampadOk>{r.varde}</TonVarde>} hogerUnder={r.krav || undefined} />
          ))}
          <Rad sista titel="Vad betyder talen?" onTryck={ark.oppnaHjalp} />
        </Sektion>
      )}

      <PerTradslag d={d} ark={ark} />

      <Sektion rubrik="Åtgärder" not="Vad som gjorts, och hur träffen var 90 dagar före och efter.">
        {atgarder.map(r => (
          <Rad key={r.id} onTryck={() => ark.oppnaAtgard(r.id)} titel={r.titel} under={r.datumText}
            hoger={r.hoger} hogerUnder={r.riktning ? <Status farg={r.riktning === 'battre' ? FARG.gron : r.riktning === 'samre' ? FARG.rod : FARG.text3} ord={r.hogerUnder} /> : r.hogerUnder} />
        ))}
        {atgarder.length === 0 && <Fyll><Meta>Inga åtgärder markerade ännu.</Meta></Fyll>}
        <Rad sista pil={false} onTryck={ark.oppnaNyAtgard}
          titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}><Ikon namn="add" storlek={IKON.rad} farg={FARG.text} /><span>Lägg till åtgärd</span></span>} />
      </Sektion>

      {d.filteredKalib.length > 0 && (
        <div style={TNUM}>
          <Meta>{fmtAntal(d.filteredKalib.length)} kontroller · {fmtAntal(d.totalStockar)} stockar · sedan {d.reportSedan}</Meta>
        </div>
      )}
    </>
  );
}

function PerTradslag({ d, ark }: { d: KalibreringData; ark: KalibreringArk }) {
  const { trData, trRader } = d;
  return (
    <Sektion rubrik="Per trädslag" not={trRader.length > 0 ? 'Längd bedöms bara på träffprocent — stocken kapas, den driver inte gradvis. Klaven mäter hela cm.' : undefined}>
      {d.tradslagFel ? (
        <Fyll><Lugn ikon="error" marginTop={0}>{d.tradslagFel}</Lugn></Fyll>
      ) : !trData ? (
        <Fyll><Lugn ikon="hourglass_empty" marginTop={0}>Läser trädslagen…</Lugn></Fyll>
      ) : trRader.length === 0 ? (
        <Fyll><Lugn marginTop={0}>Inga trädslag med underlag.</Lugn></Fyll>
      ) : (
        trRader.map((t, i) => (
          <Rad key={t.tradslag} sista={i === trRader.length - 1} onTryck={() => ark.oppnaArt(t.tradslag.toLowerCase())} titel={cap(t.tradslag)}
            under={<>{`Längd `}<TraffText stat={t.langd} variabel="langd" trosklar={trData.trosklar} />{` · n ${t.diameter.n}`}</>}
            hoger={<TraffText stat={t.diameter} variabel="diameter" trosklar={trData.trosklar} />} hogerUnder="diameter" />
        ))
      )}
    </Sektion>
  );
}
