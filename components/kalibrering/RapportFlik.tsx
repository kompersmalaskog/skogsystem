'use client';
// Rapport: kvalitetsrapporten för valt urval — längd och diameter mot maskinens krav, träffprocent per trädslag och vilket underlag
// det bygger på. Innehåll och siffror är den gamla flikens; räknandet bor i lib/kalibrering (rapport, bedomning).
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import { AVSTAND, FARG, IKON, RAD, TNUM, TYP } from '@/lib/design/tokens';
import Ikon from '@/components/design/Ikon';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { avvikelseTon, PROFIL_TON, trCellBedom, type ToneToken } from '@/lib/kalibrering/bedomning';
import { fmtAbs1, fmtAntal, fmtAvvikelse, fmtKrav, fmtSig1 } from '@/lib/kalibrering/format';
import { MATT } from '@/lib/kalibrering/ordlista';
import type { VariabelStat } from '@/lib/kalibrering/statistik';
import { cap } from '@/lib/kalibrering/text';
import type { KravRow } from '@/lib/kalibrering/typer';
import { DelFel, Fyll, Lugn, Meta, TalGrid, TonVarde } from './delar';

/** En cell i trädslagstabellen: träff% som huvudtal (prick vid avvikelse), stödtalen under. Under 30 mått: "för tunt underlag". */
function TrCell({ stat, variabel, enhet, trosklar }: { stat: VariabelStat; variabel: 'diameter' | 'langd'; enhet: 'mm' | 'cm'; trosklar: KravRow[] }) {
  const b = trCellBedom(stat, variabel, trosklar);
  if (b.tunt) return <div style={{ minWidth: 0 }}><Meta>för tunt underlag</Meta><Meta style={{ marginTop: AVSTAND.xs }}>n {stat.n}</Meta></div>;
  const stod = variabel === 'langd'
    ? `inom ±${fmtKrav(stat.tolerans)} cm · n ${stat.n}`
    : `${MATT.systematisk.fraga} ${fmtSig1(stat.systematisk)} ${enhet} · ${MATT.standardavv.fraga} ${fmtAbs1(stat.standardavv)} ${enhet} · n ${stat.n}`;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...TYP.listtitel, color: FARG.text }}>
        <TonVarde ton={PROFIL_TON[b.status]} dampadOk>{stat.traffPct != null ? `${Math.round(stat.traffPct)}%` : '–'}</TonVarde>
      </div>
      <Meta style={{ marginTop: AVSTAND.xs }}>{stod}</Meta>
    </div>
  );
}

const KOLUMNER = '1.1fr 1fr 1fr';

export default function RapportFlik({ d, ark }: { d: KalibreringData; ark: KalibreringArk }) {
  const { reportBed, trData, trRader, effektiv } = d;
  const datum = new Date(d.allKalib[0].datum).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  const tonLen: ToneToken = reportBed && d.reportLenBed && !d.reportLenBed.larmTyst ? PROFIL_TON[d.reportLenBed.status] : 'ok';
  const tonDia: ToneToken = reportBed && d.reportDiaBed && !d.reportDiaBed.larmTyst ? PROFIL_TON[d.reportDiaBed.status] : 'ok';
  const traff = (s: VariabelStat | null | undefined) => (s?.traffPct != null ? `${Math.round(s.traffPct)} %` : '–');

  return (
    <>
      {d.partialError && <DelFel text={d.partialError} />}
      <Svarsrad rubrik="Kvalitetsrapport" rad={datum} />

      <Sektion rubrik={reportBed ? `Träffprocent · rullande ${reportBed.fonster?.dagar ?? 90} dagar${reportBed.profil ? ` · ${reportBed.profil}` : ''}` : 'Avvikelse'}>
        <Fyll>
          <TalGrid celler={reportBed ? [
            { etikett: 'Längd', varde: traff(reportBed.langd), ton: tonLen },
            { etikett: 'Diameter', varde: traff(reportBed.diameter), ton: tonDia },
          ] : [
            { etikett: 'Längd', varde: fmtAvvikelse(d.avgLenReport, 'cm'), enhet: 'cm', ton: avvikelseTon(d.avgLenReport, 'len') },
            { etikett: 'Diameter', varde: fmtAvvikelse(d.avgDiaReport, 'mm'), enhet: 'mm', ton: avvikelseTon(d.avgDiaReport, 'dia') },
          ]} />
          {d.verdictWithinTolerance
            ? <Lugn ikon="check">{reportBed ? `Inom ${reportBed.profil ? `${reportBed.profil}s` : 'profilens'} krav.` : 'Inom tolerans.'}</Lugn>
            : <Lugn ikon="info">{reportBed ? 'Under profilens krav — se per trädslag nedan.' : 'Utanför tolerans — se avvikelserna ovan.'}</Lugn>}
        </Fyll>
      </Sektion>

      <Sektion rubrik={`Träffprocent per trädslag${trData?.profil ? ` · ${trData.profil}` : ''}`}
        not={trRader.length > 0 ? 'Längd bedöms bara på träffprocent — stocken kapas, den driver inte gradvis. ±2 cm: klaven mäter hela cm.' : undefined}>
        {effektiv === 'all' ? (
          <Fyll><Lugn marginTop={0}>Välj en maskin — Gran bedöms mot olika krav på olika maskiner och kan inte slås ihop.</Lugn></Fyll>
        ) : !trData ? (
          <Fyll><Lugn ikon="hourglass_empty" marginTop={0}>Laddar per-trädslag…</Lugn></Fyll>
        ) : trRader.length === 0 ? (
          <Fyll><Lugn marginTop={0}>Inga trädslag med underlag.</Lugn></Fyll>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: KOLUMNER, gap: AVSTAND.s, padding: `${AVSTAND.s}px 0`, borderBottom: RAD.borderBottom, ...TYP.meta, color: FARG.text2 }}>
              <span>Trädslag</span><span>Diameter</span><span>Längd</span>
            </div>
            {trRader.map((t, i) => (
              <button key={t.tradslag} type="button" onClick={() => ark.oppnaArt(t.tradslag.toLowerCase())}
                style={{ ...RAD, display: 'grid', gridTemplateColumns: KOLUMNER, gap: AVSTAND.s, alignItems: 'start', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                  borderBottom: i === trRader.length - 1 ? 'none' : RAD.borderBottom, color: FARG.text, cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.listtitel }}>{cap(t.tradslag)}<Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} /></span>
                <TrCell stat={t.diameter} variabel="diameter" enhet="mm" trosklar={trData.trosklar} />
                <TrCell stat={t.langd} variabel="langd" enhet="cm" trosklar={trData.trosklar} />
              </button>
            ))}
          </>
        )}
      </Sektion>

      {d.filteredKalib.length > 0 && (
        <div style={{ ...TNUM }}>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>{d.maskinNamnFor(d.filteredKalib[0].maskin_id)}</div>
          <Meta style={{ marginTop: AVSTAND.xs }}>{fmtAntal(d.filteredKalib.length)} kontroller · {fmtAntal(d.totalStockar)} stockar · sedan {d.reportSedan}</Meta>
        </div>
      )}
    </>
  );
}
