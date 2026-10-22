'use client';
// Trend: (1) Så ligger du till — de tre Vida-talen och om åtgärden hjälpte, (2) Läget — träff och var greppet släppte per grovlek över tid,
// (3) Flaxar den? — spridningen. Innehåll och siffror är den gamla flikens; räknandet bor i lib/kalibrering.
import Flikkontroll from '@/components/design/Flikkontroll';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import type { KalibreringVy } from '@/lib/hooks/useKalibreringVy';
import { atgardDom, bedomProfil, PROFIL_TON, type ToneToken } from '@/lib/kalibrering/bedomning';
import { fmtPeriod, flaxSlutsats, perioderAv, periodKey, platSerier, spridSerier, spridYMax, traffSerier, type LagetSteg } from '@/lib/kalibrering/diagnos';
import { fmtAbs1, fmtKrav, fmtSig1 } from '@/lib/kalibrering/format';
import { fmtDagMan } from '@/lib/kalibrering/datum';
import { MATT } from '@/lib/kalibrering/ordlista';
import { DelFel, Fyll, Lugn, Meta, Prick, Status, TonVarde } from './delar';
import MarkorForm from './MarkorForm';
import TidsDiagram from './TidsDiagram';

const STEG: readonly (readonly [LagetSteg, string])[] = [['manad', 'Månad'], ['kvartal', 'Kvartal'], ['ar', 'År']];
const DELTA_FARG = { battre: FARG.gron, samre: FARG.rod, oforandrad: FARG.text3 } as const;

/** Avsnitt 0: de tre Vida-talen mot maskinens krav, och — om en åtgärd är markerad — om den hjälpte. */
function LageTal({ d }: { d: KalibreringData }) {
  const { bedomning } = d;
  if (!bedomning) {
    return (
      <Sektion rubrik="Så ligger du till">
        <Fyll><Lugn ikon="hourglass_empty" marginTop={0}>Läser läget…</Lugn></Fyll>
      </Sektion>
    );
  }
  const stat = bedomning.diameter;
  const tr = bedomning.trosklar;
  const bed = bedomProfil(stat, 'diameter', tr);
  const golvFor = (metrik: string): number | null => {
    const r = tr.find(t => t.variabel === 'diameter' && t.metrik === metrik);
    return r ? Number(r.golv) : null;
  };
  const tonFor = (metrik: string): ToneToken => {
    if (bed.larmTyst) return 'ok';
    const dd = bed.detaljer.find(x => x.metrik === metrik);
    return dd ? PROFIL_TON[dd.status] : 'ok';
  };
  // Samma format som hjälten (1 decimal, tecken på systematiken) — ett tal, ett utseende.
  const gT = golvFor('traffprocent'), gS = golvFor('systematisk'), gStd = golvFor('standardavv');
  const rader = [
    { key: 'traffprocent', fraga: MATT.traffprocent.fraga, term: MATT.traffprocent.term,
      varde: stat?.traffPct == null ? '–' : `${Math.round(stat.traffPct)} %`, krav: gT != null ? `krav ≥ ${fmtKrav(gT)} %` : '' },
    { key: 'systematisk', fraga: MATT.systematisk.fraga, term: MATT.systematisk.term,
      varde: stat?.systematisk == null ? '–' : `${fmtSig1(stat.systematisk)} mm`, krav: gS != null ? `krav ≤ ${fmtKrav(gS)} mm` : '' },
    { key: 'standardavv', fraga: MATT.standardavv.fraga, term: MATT.standardavv.term,
      varde: stat?.standardavv == null ? '–' : `${fmtAbs1(stat.standardavv)} mm`, krav: gStd != null ? `krav ≤ ${fmtKrav(gStd)} mm` : '' },
  ];
  const a = bedomning.atgard ?? null;
  const dom = a ? atgardDom(a) : null;
  const feRader = dom ? [
    { key: 'traff', fraga: MATT.traffprocent.fraga, r: dom.traff, fmt: (x: number) => `${Math.round(x)} %`,
      dTxt: `${Math.abs(Math.round(dom.traff.delta ?? 0))}`,
      ord: dom.traff.riktning === 'battre' ? 'bättre' : dom.traff.riktning === 'samre' ? 'sämre' : 'oförändrad' },
    { key: 'syst', fraga: MATT.systematisk.fraga, r: dom.syst, fmt: (x: number) => `${fmtSig1(x)} mm`,
      dTxt: `${fmtAbs1(Math.abs(dom.syst.delta ?? 0))} mm`,
      ord: dom.syst.riktning === 'battre' ? 'rakare' : dom.syst.riktning === 'samre' ? ((dom.syst.efter ?? 0) > 0 ? 'drar grövre' : 'drar klenare') : 'oförändrad' },
    { key: 'std', fraga: MATT.standardavv.fraga, r: dom.std, fmt: (x: number) => `${fmtAbs1(x)} mm`,
      dTxt: `${fmtAbs1(Math.abs(dom.std.delta ?? 0))} mm`,
      ord: dom.std.riktning === 'battre' ? 'lugnare' : dom.std.riktning === 'samre' ? 'flaxar mer' : 'oförändrad' },
  ] : [];

  return (
    <>
      <Sektion rubrik={`Så ligger du till · ${d.heroNamn}`}
        not={`${bedomning.fonster ? `Rullande ${bedomning.fonster.dagar} dagar · ${stat?.n ?? 0} mått` : 'Inga kontroller ännu'}${bed.larmTyst && stat && stat.n > 0 ? ' · för få mått för en dom' : ''}`}>
        {rader.map((r, i) => (
          <Rad key={r.key} sista={i === rader.length - 1} titel={r.fraga} under={r.term}
            hoger={<TonVarde ton={tonFor(r.key)} dampadOk>{r.varde}</TonVarde>} hogerUnder={r.krav || undefined} />
        ))}
      </Sektion>

      {a && (
        <Sektion rubrik="Hjälpte åtgärden?" not={`${a.text} · ${fmtDagMan(a.datum)}`}>
          {(a.forTidigt || !dom) ? (
            <Fyll>
              <div style={{ ...TYP.text, color: FARG.text2 }}>För tidigt att säga — kom tillbaka när fler kontroller gjorts efter {fmtDagMan(a.datum)}.</div>
              <Meta style={{ marginTop: AVSTAND.xs }}>{a.nFore} mått före · {a.nEfter} efter · behöver 30 på varje sida.</Meta>
            </Fyll>
          ) : (
            <>
              <Fyll><Meta>90 dagar före · mot allt efter</Meta></Fyll>
              {feRader.map((f, i) => (
                <Rad key={f.key} titel={f.fraga} sista={i === feRader.length - 1}
                  hoger={<>{f.r.fore == null ? '–' : f.fmt(f.r.fore)} → <b style={{ fontWeight: TYP.rubrik.fontWeight }}>{f.r.efter == null ? '–' : f.fmt(f.r.efter)}</b></>}
                  hogerUnder={<Status farg={DELTA_FARG[f.r.riktning]}
                    ord={`${f.r.riktning === 'oforandrad' ? '→' : (f.r.delta ?? 0) > 0 ? '↑' : '↓'}${f.r.riktning === 'oforandrad' ? '' : ` ${f.dTxt}`} · ${f.ord}`} />} />
              ))}
              <Fyll>
                <div style={{ ...TYP.listtitel, color: FARG.text }}>{dom.rubrik}</div>
                {dom.tillagg.map((t, i) => <Meta key={i} style={{ marginTop: AVSTAND.s }}>{t}</Meta>)}
              </Fyll>
            </>
          )}
        </Sektion>
      )}
    </>
  );
}

/** Avsnitt 1: träff och var greppet släppte per grovlek över tid, med ett tidssteg som gäller alla tre diagrammen. */
function Laget({ d, v, onHjalp }: { d: KalibreringData; v: KalibreringVy; onHjalp: () => void }) {
  const { diagnosData } = d;
  if (!diagnosData || !diagnosData.klasser.some(k => k.traffMonthly.length)) {
    return (
      <Sektion rubrik="Läget">
        <Fyll><Lugn ikon="hourglass_empty" marginTop={0}>Läser läget…</Lugn></Fyll>
      </Sektion>
    );
  }
  const kl = diagnosData.klasser;
  const traff = traffSerier(kl, v.lagetSteg);
  const plat = platSerier(kl, v.lagetSteg);
  const kanter = { fmtX: (m: string) => fmtPeriod(m, v.lagetSteg), markorKey: (dat: string) => periodKey(dat.slice(0, 7), v.lagetSteg) };
  return (
    <>
      <Sektion rubrik={`Läget · ${d.heroNamn}`}>
        <Rad titel="Vad betyder talen?" onTryck={onHjalp} />
        <Fyll>
          <Meta style={{ marginBottom: AVSTAND.m }}>
            Träffprocent per grovlek över tid. Klena träffar bra; grova släpar — en enda kurva döljer det.{diagnosData.golvDia != null ? ` Kravlinjen är ${diagnosData.profil}s golv.` : ''}
          </Meta>
          <div style={{ marginBottom: AVSTAND.m }}><Flikkontroll flikar={STEG} aktiv={v.lagetSteg} onVal={v.setLagetSteg} /></div>
          <TidsDiagram manader={perioderAv(traff)} series={traff} yMax={100} markorer={diagnosData.markorer} {...kanter}
            kravLinje={diagnosData.golvDia != null ? { v: diagnosData.golvDia, label: `golv ${diagnosData.golvDia}%` } : undefined} />
        </Fyll>
      </Sektion>

      <Sektion rubrik="Greppet släppte per grovlek — tryckmätaren" not="Andel där maskinens mått stod still medan klavens sjönk. Ska sjunka först när trycket höjs.">
        <Fyll><TidsDiagram manader={perioderAv(plat)} series={plat} yMax={80} markorer={diagnosData.markorer} {...kanter} /></Fyll>
      </Sektion>
      <MarkorForm d={d} placeholder="t.ex. höjde trycket på knivarna" knapp="Markera" />
    </>
  );
}

/** Avsnitt 3: flaxar den? Spridningen får en egen plats, och slutsatsen räknas ut ur datan. */
function Flaxar({ d, v }: { d: KalibreringData; v: KalibreringVy }) {
  const { diagnosData, bedomning } = d;
  if (!diagnosData || !diagnosData.klasser.some(k => k.spridMonthly.length)) return null;
  const stdRow = bedomning?.trosklar.find(t => t.variabel === 'diameter' && t.metrik === 'standardavv');
  const systRow = bedomning?.trosklar.find(t => t.variabel === 'diameter' && t.metrik === 'systematisk');
  const stdGolv = stdRow ? Number(stdRow.golv) : null;
  const systMal = systRow ? Number(systRow.mal) : null;
  const sprid = spridSerier(diagnosData.klasser, v.lagetSteg);
  const slutsats = flaxSlutsats(diagnosData.klasser, stdGolv, systMal);
  const spark = (punkter: string, farg: string) => (
    <svg viewBox="0 0 90 26" aria-hidden="true" style={{ width: 64, height: 18, flexShrink: 0 }}>
      <polyline points={punkter} fill="none" stroke={farg} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
  return (
    <Sektion rubrik={MATT.standardavv.fraga}>
      <Fyll>
        <Meta style={{ marginBottom: AVSTAND.s }}>{MATT.standardavv.term}</Meta>
        <Meta style={{ marginBottom: AVSTAND.m }}>
          Hoppar maskinen fram och tillbaka, eller mäter den jämnt?{stdGolv != null ? ` ${diagnosData.profil} vill att spridningen håller sig under ${fmtKrav(stdGolv)} mm.` : ''}
        </Meta>
        <TidsDiagram manader={perioderAv(sprid)} series={sprid} yMax={spridYMax(stdGolv)} markorer={diagnosData.markorer}
          kravBand={stdGolv != null ? { till: stdGolv, label: `krav ≤${fmtKrav(stdGolv)} mm` } : undefined} riktning="↓ lägre = bättre"
          fmtX={m => fmtPeriod(m, v.lagetSteg)} markorKey={dat => periodKey(dat.slice(0, 7), v.lagetSteg)} />

        {/* Lär dig läsa kurvan — syntetisk jämförelse, inte data */}
        <div style={{ display: 'flex', gap: AVSTAND.l, flexWrap: 'wrap', marginTop: AVSTAND.l, paddingTop: AVSTAND.m, borderTop: `1px solid ${FARG.linje}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
            {spark('2,13 12,12 22,14 32,13 42,12 52,14 62,13 72,12 82,13', FARG.text2)}<span>jämn — mäter lika varje gång</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
            {spark('2,4 12,22 22,6 32,20 42,3 52,23 62,7 72,21 82,5', FARG.rod)}<span>flaxar — hoppar fram och tillbaka</span>
          </div>
        </div>

        {/* Slutsats — uträknad ur datan, inte gissad */}
        <div style={{ marginTop: AVSTAND.l, paddingTop: AVSTAND.m, borderTop: `1px solid ${FARG.linje}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.listtitel, color: slutsats.status === 'flaxar' ? FARG.text : FARG.text2 }}>
            {slutsats.status === 'flaxar' && <Prick ton="hot" />}<span>{slutsats.rubrik}</span>
          </div>
          {slutsats.atgard && <div style={{ ...TYP.text, color: slutsats.status === 'flaxar' ? FARG.text : FARG.text2, marginTop: AVSTAND.xs }}>{slutsats.atgard}</div>}
          {slutsats.tillagg && <Meta style={{ marginTop: AVSTAND.s, ...TNUM }}>{slutsats.tillagg}</Meta>}
        </div>
      </Fyll>
    </Sektion>
  );
}

export default function TrendFlik({ d, v, onHjalp }: { d: KalibreringData; v: KalibreringVy; onHjalp: () => void }) {
  return (
    <>
      {d.partialError && <DelFel text={d.partialError} />}
      <LageTal d={d} />
      <Laget d={d} v={v} onHjalp={onHjalp} />
      <Flaxar d={d} v={v} />
    </>
  );
}
