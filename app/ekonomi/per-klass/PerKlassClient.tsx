'use client';

// Per klass — i vilken medelstamklass lönar sig ackordet bäst mot timpeng?
// Svarar på "vilken sorts skog tjänar vi mest på".
//
// INGEN EGEN RÄKNING: samma per-objekt-rader som /ekonomi/mot-ackord
// (lib/ekonomi/objektJamforelse — delad funktion, vyerna kan inte drifta
// isär), här bara GRUPPERADE per medelstamklass (prisuppslagets närmaste
// acord_priser-klass). En klass total = summan av dess objekt i Mot ackord.
//
// TRE FÄRGER: grön = över timpeng, röd = under, bärnsten = preliminärt.

import { useEffect, useState, useCallback } from 'react';
import {
  hamtaObjektJamforelse, OSAKER_TIM,
  type ObjektRad, type MaskinDel,
} from '@/lib/ekonomi/objektJamforelse';
import { type PeriodType, getPeriodDates, getPeriodLabel } from '@/lib/ekonomi/period';
import {
  EkonomiSida, Periodvaxlare, Hero, MetaRad, Lista, ListRad, SektionsTitel,
  Laddar, FelRuta, Tomt,
} from '../delade/mall';
import { FARG, TYP, TNUM, AVSTAND, RADIE, KNAPP } from '@/lib/design/tokens';

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
function fmtKlass(k: number) { return k.toFixed(2).replace('.', ',').replace(/0$/, ''); }
function diffColor(n: number) { return n >= 0 ? FARG.gron : FARG.rod; }

export default function PerKlassClient() {
  const [period, setPeriod] = useState<PeriodType>('M');
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
    return Object.values(agg).sort((a, b) => (b.diff / (b.volym || 1)) - (a.diff / (a.volym || 1)));
  })();

  // PRESENTATION — avrunda varje del FÖRST, härled sedan (skillen: summan
  // är summan av det som visas). Radens stora tal = visat ackord − visat
  // timpeng, så uppfällningen "512 · 494 kr/m³" alltid kontrollräknar mot
  // "+18" med miniräknare. Rått round(diff/volym) kan slå ±1 mot de visade
  // delarna. Sorteringen följer det VISADE talet så ordningen aldrig
  // motsäger det ögat ser (rådiff som tie-break). Beräkningen är orörd.
  const visadeKrPerM3 = (k: { ackord: number; timpeng: number; volym: number }) => {
    if (!(k.volym > 0)) return { ackord: null as number | null, timpeng: null as number | null, diff: 0 };
    const ackord = Math.round(k.ackord / k.volym);
    const timpeng = Math.round(k.timpeng / k.volym);
    return { ackord, timpeng, diff: ackord - timpeng };
  };
  klasser.sort((a, b) => visadeKrPerM3(b).diff - visadeKrPerM3(a).diff || (b.diff / (b.volym || 1)) - (a.diff / (a.volym || 1)));
  const maxAbs = klasser.reduce((mx, k) => Math.max(mx, Math.abs(visadeKrPerM3(k).diff)), 0);
  const bast = klasser[0];
  const arOsaker = (k: KlassAgg) => k.timmar < OSAKER_TIM;

  const sheetH = { ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.xs } as const;

  return (
    <EkonomiSida>
      {/* Bara Månad/Kvartal/År — inget objekt avräknas på en dag */}
      <Periodvaxlare
        perioder={['M', 'K', 'A']}
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
          {klasser.length === 0 ? (
            /* Ärligt tomt — inte en tom lista som ser trasig ut */
            <Tomt>
              Inga {ejJamforbara.length > 0 ? 'jämförbara ' : ''}avräknade objekt i {getPeriodLabel(period, periodOffset)}
            </Tomt>
          ) : (
            /* Hero — klassen som går bäst. Klassnamnet är INTE ett signerat
               tal → vitt; bara kr/m³-raden bär grönt/rött, och den bär
               alltid +/− i texten. Samma avrundade tal som radens. */
            <Hero
              etikett="Bäst mot timpeng"
              varde={`${fmtKlass(bast.klass)}-klassen`}
              under={<>
                <div style={{ ...TYP.listtitel, ...TNUM, color: diffColor(visadeKrPerM3(bast).diff), marginTop: AVSTAND.s }}>
                  {fmtDiff(visadeKrPerM3(bast).diff)} kr/m³ mot timpeng
                </div>
                <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>
                  {klasser.length} klasser · {rader.length} objekt avräknade{arOsaker(bast) && ' · bästa klassen vilar på få timmar — osäkert'}
                </div>
              </>}
            />
          )}

          {/* Metarad — prel i bärnsten, resten dämpat. Detaljer i Mot ackord. */}
          <MetaRad delar={[
            vantarAntal > 0 && { text: `${vantarAntal} preliminär${vantarAntal === 1 ? 't' : 'a'} ej med`, barnsten: true },
            ejJamforbara.length > 0 && { text: `${ejJamforbara.length} utan jämförelse` },
            timpengAntal > 0 && { text: `${timpengAntal} på timpeng` },
          ]} />

          {klasser.length > 0 && (
            <>
              <SektionsTitel>Per medelstamklass — mot timpeng</SektionsTitel>
              <Lista>
                {klasser.map((k, i) => {
                  const visad = visadeKrPerM3(k);
                  const andel = maxAbs > 0 ? Math.abs(visad.diff) / maxAbs : 0;
                  const oppen = oppenKlass === k.klass;
                  const delKr = (d: DelAgg) => d.volym > 0 ? Math.round((d.ackord - d.timpeng) / d.volym) : null;
                  return (
                    <ListRad key={k.klass}
                      rubrik={<>
                        {fmtKlass(k.klass)}
                        <span style={{ ...TYP.meta, color: FARG.text2 }}> medelstam</span>
                      </>}
                      detalj={<>
                        {Math.round(k.volym).toLocaleString('sv-SE')} m³fub · {k.antal} objekt
                        {arOsaker(k) && ' · få timmar — osäkert'}
                      </>}
                      /* Radens tal ÄR svaret — stort (mallens TYP.rubrik),
                         med tecken i texten och enheten på raden */
                      tal={fmtDiff(visad.diff)}
                      talFarg={diffColor(visad.diff)}
                      enhet="kr/m³"
                      /* |kr/m³| relativt största klassen — på RADENS bredd så
                         längderna är jämförbara mellan rader */
                      stapelAndel={andel}
                      chevron
                      oppen={oppen}
                      onClick={() => setOppenKlass(oppen ? null : k.klass)}
                      sista={i === klasser.length - 1}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', ...TYP.meta }}>
                        <span style={{ color: FARG.text2 }}>Ackord mot timpeng</span>
                        <span style={{ color: FARG.text, ...TNUM }}>
                          {visad.ackord ?? '—'} · {visad.timpeng ?? '—'} kr/m³
                        </span>
                      </div>
                      {([['Skördare', k.skord], ['Skotare', k.skot]] as [string, DelAgg][]).map(([namn, d]) => (
                        <div key={namn} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', ...TYP.meta }}>
                          <span style={{ color: FARG.text2 }}>{namn} · {Math.round(d.volym).toLocaleString('sv-SE')} m³fub</span>
                          {delKr(d) != null ? (
                            <span style={{ color: diffColor(delKr(d)!), ...TNUM }}>{fmtDiff(delKr(d)!)} kr/m³</span>
                          ) : (
                            <span style={{ color: FARG.text2 }}>—</span>
                          )}
                        </div>
                      ))}
                    </ListRad>
                  );
                })}
              </Lista>
            </>
          )}
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
            <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.l }}>I vilken medelstamklass lönar sig ackordet bäst mot timpeng.</div>
            <div style={{ ...TYP.meta, lineHeight: 1.6, color: FARG.text2, display: 'grid', gap: AVSTAND.l }}>
              <div>
                <div style={sheetH}>Samma tal som Mot ackord</div>
                Exakt samma per-objekt-jämförelse (ackord med alla tillägg mot timpeng, bara avräknade objekt, samma ärlighetsregler) — här grupperad per medelstamklass. En klass total är summan av dess objekt i Mot ackord; skiljer de sig är det en bugg.
              </div>
              <div>
                <div style={sheetH}>Klassningen</div>
                Varje objekt klassas på sin medelstam (volym / stammar, manuellt värde när satt) till närmaste klass i ackordprislistan — samma avrundning som prisuppslaget använder.
              </div>
              <div>
                <div style={sheetH}>Talet</div>
                Klassens ackord respektive timpeng i kr/m³fub, var för sig avrundade — radens stora tal är skillnaden mellan de två visade talen, så det alltid går att kontrollräkna mot uppfällningen. Plus = ackordet ger mer än timpeng i den skogen, minus = mindre (färgen förstärker bara tecknet). Uppfällningen visar skördare och skotare var för sig eftersom de prissätts olika per klass.
              </div>
              <div>
                <div style={sheetH}>Osäkert-märkningen</div>
                En klass som vilar på färre än {OSAKER_TIM} G15-timmar är brus, inte mönster — den märks &quot;få timmar — osäkert&quot;.
              </div>
            </div>
            {/* Stäng = avbryter → KNAPP.lank (skillen: blå text bara för
                navigerar/avbryter), full bredd för träffytan i hytt */}
            <button onClick={() => setInfoOpen(false)} style={{ ...KNAPP.lank, marginTop: AVSTAND.xl, width: '100%' }}>Stäng</button>
          </div>
        </>
      )}
    </EkonomiSida>
  );
}
