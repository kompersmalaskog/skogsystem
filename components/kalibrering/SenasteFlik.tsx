'use client';
// Senaste: FÖRARVYN (en stam, ett band, två meningar) och SIFFRORNA bakom "Visa siffrorna" för den som felsöker.
// Innehåll och siffror är den gamla flikens; räknandet bor i lib/kalibrering (diagnos, bedomning, kontroll).
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import Tillstand from '@/components/design/Tillstand';
import { AVSTAND, FARG, KORT, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import type { KalibreringVy } from '@/lib/hooks/useKalibreringVy';
import { avvikelseTon, bedomProfil, PROFIL_TON, type ToneToken } from '@/lib/kalibrering/bedomning';
import { GRIND_MIN, stabilitetCell, stabilitetManader } from '@/lib/kalibrering/diagnos';
import { dec, fmtAbs1, fmtSig1, fmtTal } from '@/lib/kalibrering/format';
import { MATT } from '@/lib/kalibrering/ordlista';
import { cap, stockText } from '@/lib/kalibrering/text';
import type { VariabelStat } from '@/lib/kalibrering/statistik';
import { DelFel, Fyll, Lugn, Meta, Metrik, Prick, Status, Tillbaka, TON_FARG } from './delar';
import MarkorForm from './MarkorForm';

const GRUND_STAM = '12,14 308,40 308,52 12,78';
const BAND_BREDD = (308 - 12) / 5;
const MARKOR_FARG = { atgard: FARG.text, reparation: FARG.orange, kalibrering: FARG.text3 } as const;

function HjaltVariabel({ etikett, enhet, stat, variabel, d }: { etikett: string; enhet: 'cm' | 'mm'; stat: VariabelStat | null; variabel: 'diameter' | 'langd'; d: KalibreringData }) {
  const bed = d.bedomning ? bedomProfil(stat, variabel, d.bedomning.trosklar) : null;
  const ton: ToneToken = bed && !bed.larmTyst ? PROFIL_TON[bed.status] : 'ok';
  if (!stat || stat.traffPct == null) return <Metrik varde="–" etikett={etikett} hint="inget underlag" ton="ok" />;
  const tolText = stat.tolerans != null ? `inom ±${fmtTal(stat.tolerans, enhet)} ${enhet}` : '';
  // Stödtalen visas alltid med 1 decimal — std/systematik ligger ofta precis vid tröskeln (4,6 mot taket 4,5); heltal skulle dölja marginalen.
  const hint = bed?.larmTyst
    ? `för få mått i perioden (${stat.n})`
    : variabel === 'langd'
      ? `n=${stat.n} · klaven mäter hela cm`
      : `${MATT.systematisk.fraga} ${fmtSig1(stat.systematisk)} ${enhet} · ${MATT.standardavv.fraga} ${fmtAbs1(stat.standardavv)} ${enhet} · n ${stat.n}`;
  return <Metrik varde={`${Math.round(stat.traffPct)}%`} etikett={`${etikett} · ${tolText}`} hint={hint} ton={ton} />;
}

/** En rad i en stapellista: klass, ett fält som fylls till procenten, värdet. Under golvet fylls staplen röd — och värdet står som text. */
function Procentrad({ klass, pct, under, varde, n }: { klass: string; pct: number; under?: boolean; varde: string; n?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
      <span style={{ ...TYP.meta, ...TNUM, color: FARG.text, flexShrink: 0, minWidth: '5em' }}>{klass}</span>
      <span style={{ flex: 1, height: AVSTAND.s, background: FARG.fyllning, borderRadius: RADIE.stapel, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: under ? FARG.rod : FARG.text3, borderRadius: RADIE.stapel }} />
      </span>
      <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2, flexShrink: 0, textAlign: 'right', minWidth: '5em' }}>
        {under && <Prick ton="hot" />} {varde}{n != null && <span style={{ ...TYP.micro, textTransform: 'none', color: FARG.text3 }}> n{n}</span>}
      </span>
    </div>
  );
}

function Forarvy({ d, v }: { d: KalibreringData; v: KalibreringVy }) {
  const { verdikt, diagnosData, bedomning } = d;
  const bandFarg = verdikt.status === 'diagnos' ? FARG.rod : FARG.orange;
  return (
    <>
      {d.partialError && <DelFel text={d.partialError} />}
      <div style={{ textAlign: 'center' }}>
        <Meta style={{ marginBottom: AVSTAND.l }}>
          {diagnosData?.fonster ? `Senaste ${diagnosData.fonster.dagar} dagarna` : 'Kalibrering'}{diagnosData?.profil ? ` · ${diagnosData.profil}` : ''}
        </Meta>
        <svg viewBox="0 0 320 92" role="img" aria-label="Stamdiagram med felläge" style={{ width: '100%', maxWidth: 320, height: 'auto' }}>
          <defs><clipPath id="kalibstemclip"><polygon points={GRUND_STAM} /></clipPath></defs>
          <polygon points={GRUND_STAM} fill={FARG.upphojt} />
          {verdikt.bandZon != null && (
            <rect x={12 + verdikt.bandZon * BAND_BREDD} y={0} width={BAND_BREDD} height={92} clipPath="url(#kalibstemclip)" fill={bandFarg} fillOpacity={0.85} />
          )}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 320, margin: '0 auto', ...TYP.meta, color: FARG.text2 }}><span>Rot</span><span>Topp</span></div>
      </div>

      <div style={{ marginTop: AVSTAND.xl }}>
        <Tillstand nyckel={diagnosData ? 'klar' : 'laddar'}>
          {!diagnosData ? (
            <Svarsrad rubrik="Läser diagnos…" />
          ) : (
            <>
              <Svarsrad rubrik={verdikt.mening1} rad={verdikt.mening2} fri avvikelse={verdikt.status === 'diagnos'} />
              {verdikt.mening3 && <Meta style={{ marginBottom: AVSTAND.m }}>{verdikt.mening3}</Meta>}
              {/* Lugnt läge: ETT tal, inte noll — träffprocenten ur samma 90-dagarsfönster som hjälten. */}
              {verdikt.status === 'bra' && bedomning?.diameter?.traffPct != null && (
                <Meta style={{ marginBottom: AVSTAND.m, ...TNUM }}>
                  {Math.round(bedomning.diameter.traffPct)} % {MATT.traffprocent.term}{bedomning.fonster ? ` · senaste ${bedomning.fonster.dagar} dagarna` : ''}
                </Meta>
              )}
            </>
          )}
        </Tillstand>
      </div>

      <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0, marginTop: AVSTAND.xl }}>
        <Rad titel="Visa siffrorna" onTryck={() => v.setVisaSiffror(true)} sista />
      </div>
    </>
  );
}

function Siffror({ d, v, ark }: { d: KalibreringData; v: KalibreringVy; ark: KalibreringArk }) {
  const { diagnosData, bedomning, latestKalib, latestStockar } = d;
  if (!latestKalib) return null;
  const manader = diagnosData ? stabilitetManader(diagnosData.klasser) : [];
  return (
    <>
      <Tillbaka etikett="Förarvy" onTryck={() => v.setVisaSiffror(false)} />

      <Sektion rubrik="Mätnoggrannhet" not={bedomning?.profil ? `Bedöms mot ${bedomning.profil}` : 'Ingen kravprofil'}>
        <Fyll>
          {bedomning?.fonster && <Meta style={{ marginBottom: AVSTAND.m }}>Rullande {bedomning.fonster.dagar} dagar · {bedomning.fonster.fran} → {bedomning.fonster.till}</Meta>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
            <HjaltVariabel etikett="Diameter" enhet="mm" stat={bedomning?.diameter ?? null} variabel="diameter" d={d} />
            <HjaltVariabel etikett="Längd" enhet="cm" stat={bedomning?.langd ?? null} variabel="langd" d={d} />
          </div>
        </Fyll>
      </Sektion>

      {/* a) Stabilitetsrutnät — kurva vs tryck */}
      {diagnosData && diagnosData.klasser.some(k => k.systMonthly.length > 0) && (
        <Sektion rubrik="Stabilitet" not="Systematisk avvikelse (mm) per grovlek och månad. Svajar tecknet = tryck · ligger still = kurva.">
          <Fyll style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', ...TYP.meta, ...TNUM }}>
              <thead><tr><th />{manader.map(mo => <th key={mo} style={{ color: FARG.text2, fontWeight: 400, padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, textAlign: 'center' }}>{mo.slice(2).replace('-', '/')}</th>)}</tr></thead>
              <tbody>
                {diagnosData.klasser.map(k => {
                  const perManad = new Map(k.systMonthly.map(m => [m.manad, m]));
                  return (
                    <tr key={k.klass}>
                      <td style={{ color: FARG.text, padding: `${AVSTAND.xs}px ${AVSTAND.m}px ${AVSTAND.xs}px 0`, whiteSpace: 'nowrap' }}>{k.klass}</td>
                      {manader.map(mo => {
                        const c = perManad.get(mo);
                        if (!c) return <td key={mo} style={{ textAlign: 'center', color: FARG.text3 }}>·</td>;
                        const cls = stabilitetCell(c);
                        // Färgen förstärker bara talet: tunt underlag är nedtonat, 2–4 mm orange yta, över 4 mm röd yta.
                        const yta = cls === 'hot' ? FARG.rod : cls === 'hi' ? FARG.orange : null;
                        return (
                          <td key={mo} title={`n=${c.n}`}
                            style={{ padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, textAlign: 'center', borderRadius: RADIE.rad, color: cls === 'tunn' ? FARG.text3 : cls === 'ok' ? FARG.text2 : FARG.text,
                              background: yta ? `color-mix(in srgb, ${yta} 16%, transparent)` : undefined }}>
                            {fmtSig1(c.systematik)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Fyll>
        </Sektion>
      )}

      {/* b) Planområden — tryckmätaren */}
      {diagnosData && (
        <Sektion rubrik="Planområden — tryckmätaren" not="Andel mätpunkter där diametern inte sjunker (position >130 cm). Stiger med greppfel; rör sig först vid en tryckhöjning.">
          <Fyll>
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {diagnosData.klasser.map(k => <Procentrad key={k.klass} klass={k.klass} pct={k.plateauShare ?? 0} varde={k.plateauShare != null ? `${Math.round(k.plateauShare)}%` : '–'} />)}
            </div>
            <Meta style={{ margin: `${AVSTAND.m}px 0 ${AVSTAND.s}px` }}>Över tid</Meta>
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {diagnosData.plateauMonthly.map(p => <Procentrad key={p.manad} klass={p.manad.slice(2).replace('-', '/')} pct={p.share} varde={`${Math.round(p.share)}%`} />)}
            </div>
          </Fyll>
        </Sektion>
      )}

      {/* c) Träffprocent per grovlek */}
      {diagnosData && (
        <Sektion rubrik="Träffprocent per grovlek"
          not={`Inom ±4 mm · rullande ${diagnosData.fonster?.dagar ?? 90} dagar${diagnosData.golvDia != null ? ` · golv ${diagnosData.golvDia}%` : ''}`}>
          <Fyll>
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {diagnosData.klasser.map(k => {
                const under = k.traffPct != null && diagnosData.golvDia != null && k.traffPct < diagnosData.golvDia && k.n >= GRIND_MIN;
                return <Procentrad key={k.klass} klass={k.klass} pct={k.traffPct ?? 0} under={under} varde={k.traffPct != null ? `${Math.round(k.traffPct)}%` : '–'} n={k.n} />;
              })}
            </div>
          </Fyll>
        </Sektion>
      )}

      {/* Stockar — den enskilda kontrollen */}
      {latestStockar.length > 0 && (
        <Sektion rubrik="Stockar">
          <Fyll>
            <Meta style={{ marginBottom: AVSTAND.m }}>{cap(latestKalib.tradslag)} • {stockText(latestStockar.length)} • {dec(d.totalLatestLen / 100, 1)} meter{d.latestUtanfor > 0 ? ` • ${d.latestUtanfor} utanför tolerans` : ''}</Meta>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.xs }}>
              <span style={{ ...TYP.micro, color: FARG.text2, flexShrink: 0 }}>Rot</span>
              {latestStockar.map(stock => {
                const ton = avvikelseTon(stock.dia_avvikelse_mm ?? 0, 'dia');
                const hojd = Math.max(18, stock.maskin_toppdia_mm * 0.18);
                return (
                  <button key={stock.id} type="button" onClick={() => ark.oppnaSenasteStock(stock)}
                    style={{ flex: `${Math.max(1, stock.maskin_langd_cm || 1)} 1 0`, minWidth: 0, padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: FARG.text, textAlign: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: hojd, background: FARG.upphojt, borderRadius: RADIE.rad, minWidth: AVSTAND.xs,
                      border: `${ton === 'ok' ? 1 : 2}px solid ${ton === 'ok' ? FARG.linje : TON_FARG[ton]}`, ...TYP.meta, ...TNUM }}>{stock.stock_nummer}</span>
                    <span style={{ display: 'block', ...TYP.micro, textTransform: 'none', color: FARG.text2, marginTop: AVSTAND.xs }}>{stock.maskin_langd_cm} cm</span>
                    <span style={{ display: 'block', ...TYP.micro, textTransform: 'none', color: FARG.text3 }}>⌀{stock.maskin_toppdia_mm}</span>
                  </button>
                );
              })}
              <span style={{ ...TYP.micro, color: FARG.text2, flexShrink: 0 }}>Topp</span>
            </div>
          </Fyll>
          {latestStockar.length > 1 && (
            <Rad sista dampad={ark.laddarKontroll === latestKalib.filnamn} titel={ark.laddarKontroll === latestKalib.filnamn ? 'Laddar…' : 'Visa alla stockar'}
              onTryck={() => ark.oppnaKontroll(latestKalib.filnamn)} />
          )}
        </Sektion>
      )}

      {/* Åtgärder & händelser — markörer */}
      {diagnosData && (
        <Sektion rubrik="Åtgärder & händelser" not="Markera vad du gjort — se vilken siffra som svarade.">
          {diagnosData.markorer.length > 0
            ? diagnosData.markorer.map((m, i) => (
              <Rad key={i} sista={i === diagnosData.markorer.length - 1} titel={<Status farg={MARKOR_FARG[m.kalla]} ord={m.text} ljus />} under={m.datum} />
            ))
            : <Fyll><Lugn marginTop={0}>Inga markörer ännu.</Lugn></Fyll>}
        </Sektion>
      )}
      {diagnosData && <MarkorForm d={d} placeholder="t.ex. höjde trycket till 400 mm" knapp="Spara" />}
    </>
  );
}

export default function SenasteFlik({ d, v, ark }: { d: KalibreringData; v: KalibreringVy; ark: KalibreringArk }) {
  if (!d.latestKalib) return null;
  return (
    <Tillstand nyckel={v.visaSiffror ? 'siffror' : 'forare'}>
      {v.visaSiffror ? <Siffror d={d} v={v} ark={ark} /> : <Forarvy d={d} v={v} />}
    </Tillstand>
  );
}
