'use client';

// Per klass — i vilken medelstamklass lönar sig ackordet mot timpeng, och
// var ligger de STORA pengarna? Datorvy för styrning (Martin vid skärm):
// kolumntabell i Apple-stil — luft skiljer rader (inga linjer), tabulära
// siffror i raka kolumner (TAL_FONT), färg bara på signerade tal och
// alltid med +/− i texten.
//
// INGEN EGEN RÄKNING: samma per-objekt-rader som /ekonomi/mot-ackord
// (lib/ekonomi/objektJamforelse — delad funktion, vyerna kan inte drifta
// isär), här bara GRUPPERADE per medelstamklass. Presentationen avrundar
// varje rad FÖRST och summerar sedan (skillen: summan är summan av det
// som visas): Totalt kr = visad skillnad × avrundad volym (exakt heltals-
// produkt), summaraden = summor av radernas visade tal.

import { useEffect, useState, useCallback } from 'react';
import {
  hamtaObjektJamforelse, OSAKER_TIM,
  type ObjektRad, type MaskinDel,
} from '@/lib/ekonomi/objektJamforelse';
import { type PeriodType, getPeriodDates, getPeriodLabel } from '@/lib/ekonomi/period';
import {
  EkonomiSida, Periodvaxlare, MetaRad, SektionsTitel,
  Laddar, FelRuta, Tomt, MAXBREDD_BRED,
} from '../delade/mall';
import { FARG, TYP, TAL_FONT, VIKT, AVSTAND, RADIE, KNAPP } from '@/lib/design/tokens';

type DelAgg = { ackord: number; timpeng: number; volym: number };
type KlassAgg = {
  klass: number;
  antal: number;
  volym: number;          // objektvolym (skördad, skotad som fallback)
  ackord: number;
  timpeng: number;
  diff: number;
  timmar: number;         // alla maskindelars G15-timmar — osäkert-märkningen
  skord: DelAgg;
  skot: DelAgg;
};

// Signerade tal bär ALLTID sitt tecken i texten (+/−) — färgen förstärker
// bara (skillen: rött i solljus är brunt, färg aldrig ensam bärare).
function fmtDiff(n: number) { return `${n < 0 ? '−' : '+'}${Math.round(Math.abs(n)).toLocaleString('sv-SE')}`; }
function fmtHeltal(n: number) { return Math.round(n).toLocaleString('sv-SE'); }
function fmtKlass(k: number) { return k.toFixed(2).replace('.', ',').replace(/0$/, ''); }
function diffColor(n: number) { return n >= 0 ? FARG.gron : FARG.rod; }

// ── Tabellberäkningen — ren och testbar ────────────────────────────────
// Avrunda varje rad FÖRST: ackord/timpeng per m³ som heltal, skillnad =
// differensen av de VISADE talen, Totalt kr = skillnad × avrundad volym
// (heltal × heltal — exakt, kontrollräknbar med miniräknare). Summaraden
// summerar radernas visade volymer och Totalt exakt; vägd skillnad =
// summa-Totalt / summa-volym (en kvot, avrundad — märkt vägd i rubriken).
// Sortering på Totalt kr fallande: vyn styr på var pengarna ligger, inte
// bara bästa marginal per kubik.
export type TabellRad = {
  volym: number;
  ackord: number | null;
  timpeng: number | null;
  skillnad: number;
  totalt: number;
};

export function tabellRad(k: { ackord: number; timpeng: number; volym: number }): TabellRad {
  const volym = Math.round(k.volym);
  if (!(k.volym > 0)) return { volym, ackord: null, timpeng: null, skillnad: 0, totalt: 0 };
  const ackord = Math.round(k.ackord / k.volym);
  const timpeng = Math.round(k.timpeng / k.volym);
  const skillnad = ackord - timpeng;
  return { volym, ackord, timpeng, skillnad, totalt: skillnad * volym };
}

export function beraknaKlassTabell(klasser: KlassAgg[]) {
  const rader = klasser
    .map(k => ({ agg: k, ...tabellRad(k) }))
    .sort((a, b) => b.totalt - a.totalt || b.skillnad - a.skillnad);
  const volym = rader.reduce((s, r) => s + r.volym, 0);
  const totalt = rader.reduce((s, r) => s + r.totalt, 0);
  const skillnadVagd = volym > 0 ? Math.round(totalt / volym) : 0;
  return { rader, summa: { volym, totalt, skillnadVagd } };
}

// Gridkolumnerna: Klass · Volym · Ackord · Timpeng · Skillnad · Totalt.
// fr-enheter, ingen fast pixelbredd — krymper på smal skärm tills
// mobilsteget byggs. Talkolumner högerställda.
const KOLUMNER = 'minmax(0, 0.9fr) repeat(4, minmax(0, 1fr)) minmax(0, 1.3fr)';

export default function PerKlassClient() {
  // Default ÅR — strategisk vy, året ger fullast bild.
  const [period, setPeriod] = useState<PeriodType>('A');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rader, setRader] = useState<ObjektRad[]>([]);
  const [vantarAntal, setVantarAntal] = useState(0);
  const [timpengAntal, setTimpengAntal] = useState(0);
  const [ejJamforbara, setEjJamforbara] = useState<{ namn: string; orsak: string }[]>([]);
  const [oppenKlass, setOppenKlass] = useState<number | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);
      const data = await hamtaObjektJamforelse(start, end);
      setRader(data.rader);
      setVantarAntal(data.vantarNamn.length);
      setTimpengAntal(data.timpengAntal);
      setEjJamforbara(data.ejJamforbara);
    } catch (err: any) {
      console.error('PerKlass: fetch error', err);
      setError(err?.message || String(err));
      setRader([]);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Gruppering per medelstamklass — bara summering, ingen räkning ──
  const klasser: KlassAgg[] = (() => {
    const agg: Record<string, KlassAgg> = {};
    const del = (): DelAgg => ({ ackord: 0, timpeng: 0, volym: 0 });
    for (const o of rader) {
      if (o.klass == null) continue;
      const k = (agg[String(o.klass)] ||= {
        klass: o.klass, antal: 0, volym: 0, ackord: 0, timpeng: 0, diff: 0, timmar: 0,
        skord: del(), skot: del(),
      });
      k.antal += 1;
      k.volym += o.volym;
      k.ackord += o.ackord;
      k.timpeng += o.timpeng;
      k.diff += o.diff;
      for (const d of o.maskiner as MaskinDel[]) {
        k.timmar += d.timmar;
        const sida = d.roll === 'skördare' ? k.skord : k.skot;
        sida.ackord += d.ackord;
        sida.timpeng += d.timpeng;
        sida.volym += d.volym;
      }
    }
    return Object.values(agg);
  })();

  const tabell = beraknaKlassTabell(klasser);
  const arOsaker = (k: KlassAgg) => k.timmar < OSAKER_TIM;
  const harOsakra = tabell.rader.some(r => arOsaker(r.agg));

  const sheetH = { ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.xs } as const;
  // Cellstilar: rubriker små/dämpade versaler, talceller högerställda i
  // TAL_FONT (monospace + tabulära siffror — kolumner läses uppifrån ner).
  const rubrikCell = { ...TYP.micro, color: FARG.text3, textAlign: 'right' as const };
  const talCell = { ...TYP.text, ...TAL_FONT, textAlign: 'right' as const, color: FARG.text };
  const gridRad = { display: 'grid', gridTemplateColumns: KOLUMNER, columnGap: AVSTAND.l, alignItems: 'baseline' as const };

  return (
    <EkonomiSida maxBredd={MAXBREDD_BRED}>
      {/* Bara Kvartal/År — avräkning sker i klumpar: en månad har 0–4
          avräknade objekt utspridda på klasserna, så kr/m³ per klass blir
          ett enstaka objekts slump, inte ett mönster. Vyn JÄMFÖR klasser
          och kräver nog objekt per klass; kvartal (~10–15 obj) och år
          (~36) bär jämförelsen, månad ger brus/tomt. Samma logik som när
          Resultat tog bort Dag/Vecka. */}
      <Periodvaxlare
        perioder={['K', 'A']}
        period={period}
        offset={periodOffset}
        onPeriod={p => { setPeriod(p); setPeriodOffset(0); setOppenKlass(null); }}
        onOffset={o => { setPeriodOffset(o); setOppenKlass(null); }}
        onInfo={() => setInfoOpen(true)}
      />

      {loading && <Laddar />}

      {!loading && error && (
        <FelRuta titel="Kunde inte läsa ackordsdata" fel={error} onRetry={fetchData} />
      )}

      {!loading && !error && (
        <div style={{ padding: `0 ${AVSTAND.sidmarginal}px` }}>
          {tabell.rader.length === 0 ? (
            /* Ärligt tomt — inte en tom tabell som ser trasig ut */
            <Tomt>
              Inga {ejJamforbara.length > 0 ? 'jämförbara ' : ''}avräknade objekt i {getPeriodLabel(period, periodOffset)}
            </Tomt>
          ) : (
            <>
              <SektionsTitel>Per medelstamklass — ackord mot timpeng</SektionsTitel>

              {/* Rubrikrad */}
              <div style={{ ...gridRad, marginBottom: AVSTAND.s }}>
                <div style={{ ...rubrikCell, textAlign: 'left' }}>Klass</div>
                <div style={rubrikCell}>Volym m³fub</div>
                <div style={rubrikCell}>Ackord kr/m³</div>
                <div style={rubrikCell}>Timpeng kr/m³</div>
                <div style={rubrikCell}>Skillnad kr/m³</div>
                <div style={rubrikCell}>Totalt kr</div>
              </div>

              {/* Klassrader — luft skiljer dem, inga linjer. Klick fäller ut
                  skördare/skotare som dämpade subrader i samma kolumner. */}
              {tabell.rader.map(r => {
                const oppen = oppenKlass === r.agg.klass;
                return (
                  <div key={r.agg.klass} style={{ padding: `${AVSTAND.m}px 0` }}>
                    <div onClick={() => setOppenKlass(oppen ? null : r.agg.klass)} style={{ ...gridRad, cursor: 'pointer' }}>
                      <div style={{ ...TYP.listtitel, color: FARG.text, whiteSpace: 'nowrap' }}>
                        {fmtKlass(r.agg.klass)}
                        {arOsaker(r.agg) && <span style={{ color: FARG.text3 }}> *</span>}
                        <span style={{ ...TYP.meta, color: FARG.text3 }}> {oppen ? '▾' : '▸'}</span>
                      </div>
                      <div style={talCell}>{fmtHeltal(r.volym)}</div>
                      <div style={talCell}>{r.ackord ?? '—'}</div>
                      <div style={talCell}>{r.timpeng ?? '—'}</div>
                      <div style={{ ...talCell, color: diffColor(r.skillnad) }}>{fmtDiff(r.skillnad)}</div>
                      <div style={{ ...talCell, color: diffColor(r.totalt) }}>{fmtDiff(r.totalt)}</div>
                    </div>
                    {oppen && ([['Skördare', r.agg.skord], ['Skotare', r.agg.skot]] as [string, DelAgg][]).map(([namn, d]) => {
                      const del = tabellRad(d);
                      return (
                        <div key={namn} style={{ ...gridRad, marginTop: AVSTAND.s }}>
                          <div style={{ ...TYP.meta, color: FARG.text2, paddingLeft: AVSTAND.l }}>{namn}</div>
                          <div style={{ ...talCell, ...TYP.meta, color: FARG.text2 }}>{fmtHeltal(del.volym)}</div>
                          <div style={{ ...talCell, ...TYP.meta, color: FARG.text2 }}>{del.ackord ?? '—'}</div>
                          <div style={{ ...talCell, ...TYP.meta, color: FARG.text2 }}>{del.timpeng ?? '—'}</div>
                          <div style={{ ...talCell, ...TYP.meta, color: del.ackord != null ? diffColor(del.skillnad) : FARG.text2 }}>
                            {del.ackord != null ? fmtDiff(del.skillnad) : '—'}
                          </div>
                          <div style={{ ...talCell, ...TYP.meta, color: del.ackord != null ? diffColor(del.totalt) : FARG.text2 }}>
                            {del.ackord != null ? fmtDiff(del.totalt) : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Summarad — EN hårfin linje + luft, ingen Excel-ram.
                  Volym och Totalt är exakta summor av raderna ovan;
                  skillnaden är volymvägd (Totalt ÷ volym). */}
              <div style={{ ...gridRad, borderTop: `0.5px solid ${FARG.linje}`, marginTop: AVSTAND.s, paddingTop: AVSTAND.m }}>
                <div style={{ ...TYP.listtitel, color: FARG.text }}>Totalt</div>
                <div style={{ ...talCell, fontWeight: VIKT.halvfet }}>{fmtHeltal(tabell.summa.volym)}</div>
                <div style={talCell} />
                <div style={talCell} />
                <div style={{ ...talCell, fontWeight: VIKT.halvfet, color: diffColor(tabell.summa.skillnadVagd) }}>{fmtDiff(tabell.summa.skillnadVagd)}</div>
                <div style={{ ...talCell, fontWeight: VIKT.halvfet, color: diffColor(tabell.summa.totalt) }}>{fmtDiff(tabell.summa.totalt)}</div>
              </div>
              <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.s }}>
                Skillnaden på summaraden är volymvägd (Totalt ÷ volym).
                {harOsakra && <> * Få timmar ({'<'} {OSAKER_TIM} G15-h) — osäkert underlag.</>}
              </div>
            </>
          )}

          {/* Metarad — prel i orange, resten dämpat. Detaljer i Mot ackord. */}
          <MetaRad delar={[
            vantarAntal > 0 && { text: `${vantarAntal} preliminär${vantarAntal === 1 ? 't' : 'a'} ej med`, barnsten: true },
            ejJamforbara.length > 0 && { text: `${ejJamforbara.length} utan jämförelse` },
            timpengAntal > 0 && { text: `${timpengAntal} på timpeng` },
          ]} />
        </div>
      )}

      {/* (i)-sheet */}
      {infoOpen && (
        <>
          {/* Overlay-dim saknar token (lint-känd literal) — samma värde som appens övriga sheets */}
          <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100 }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
            background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`,
            padding: `${AVSTAND.m}px ${AVSTAND.xl}px calc(${AVSTAND.sektion}px + env(safe-area-inset-bottom))`,
            maxHeight: '80vh', overflowY: 'auto',
            borderTop: `1px solid ${FARG.linje}`, fontFamily: 'inherit', color: FARG.text,
          }}>
            <div style={{ width: AVSTAND.xxl + AVSTAND.s, height: AVSTAND.xs, background: FARG.fyllning, borderRadius: RADIE.stapel, margin: `${AVSTAND.xs}px auto ${AVSTAND.l}px` }} />
            <div style={{ ...TYP.rubrik, marginBottom: AVSTAND.xs }}>Per klass — hur räknas det?</div>
            <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.l }}>Var ackordet slår timpeng, och var de stora pengarna ligger.</div>
            <div style={{ ...TYP.meta, lineHeight: 1.6, color: FARG.text2, display: 'grid', gap: AVSTAND.l }}>
              <div>
                <div style={sheetH}>Samma tal som Mot ackord</div>
                Exakt samma per-objekt-jämförelse (ackord med alla tillägg mot timpeng, bara avräknade objekt, samma ärlighetsregler) — här grupperad per medelstamklass. En klass total är summan av dess objekt i Mot ackord; skiljer de sig är det en bugg.
              </div>
              <div>
                <div style={sheetH}>Kolumnerna</div>
                Ackord och Timpeng är klassens kr/m³fub, var för sig avrundade. Skillnad = de två visade talen rakt av. Totalt kr = skillnaden × klassens volym — var de stora pengarna ligger, inte bara bästa marginal per kubik: en stor klass med måttlig skillnad kan dra in mer än en liten med hög. Tabellen sorteras på Totalt. Plus = ackordet ger mer än timpeng (färgen förstärker bara tecknet).
              </div>
              <div>
                <div style={sheetH}>Summaraden</div>
                Volym och Totalt är exakta summor av radernas visade tal — de går att kontrollräkna med miniräknare. Skillnaden på summaraden är volymvägd: Totalt delat med volym.
              </div>
              <div>
                <div style={sheetH}>Skördare och skotare</div>
                Klicka på en klassrad för att dela upp den i skördare och skotare — de prissätts olika per klass.
              </div>
              <div>
                <div style={sheetH}>Osäkert-märkningen</div>
                En klass som vilar på färre än {OSAKER_TIM} G15-timmar är brus, inte mönster — den märks med * och fotnot.
              </div>
            </div>
            {/* Stäng = avbryter → KNAPP.lank (skillen: blå text bara för navigerar/avbryter) */}
            <button onClick={() => setInfoOpen(false)} style={{ ...KNAPP.lank, marginTop: AVSTAND.xl, width: '100%' }}>Stäng</button>
          </div>
        </>
      )}
    </EkonomiSida>
  );
}
