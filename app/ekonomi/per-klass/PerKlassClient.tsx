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
  EkonomiSida, Periodvaxlare, Hero, MetaRad, Lista, ListRad, EnhetsFot, SektionsTitel,
  Laddar, FelRuta, Tomt, GRON, ROD,
} from '../delade/mall';

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

function fmtDiff(n: number) { return `${n < 0 ? '−' : '+'}${Math.round(Math.abs(n)).toLocaleString('sv-SE')}`; }
function fmtKlass(k: number) { return k.toFixed(2).replace('.', ',').replace(/0$/, ''); }
function diffColor(n: number) { return n >= 0 ? `rgba(${GRON},0.9)` : `rgba(${ROD},0.9)`; }

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

  const krPerM3 = (k: { diff: number; volym: number }) => k.volym > 0 ? k.diff / k.volym : 0;
  const maxAbs = klasser.reduce((mx, k) => Math.max(mx, Math.abs(krPerM3(k))), 0);
  const bast = klasser[0];
  const arOsaker = (k: KlassAgg) => k.timmar < OSAKER_TIM;

  const s = {
    sheetH: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 4 } as const,
  };

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
        <div style={{ padding: '0 16px' }}>
          {klasser.length === 0 ? (
            /* Ärligt tomt — inte en tom lista som ser trasig ut */
            <Tomt>
              Inga {ejJamforbara.length > 0 ? 'jämförbara ' : ''}avräknade objekt i {getPeriodLabel(period, periodOffset)}
            </Tomt>
          ) : (
            /* Hero — klassen som går bäst. Klassnamnet är INTE ett signerat tal
               → benvitt; bara kr/m³-raden bär grönt/rött. */
            <Hero
              etikett="Bäst mot timpeng"
              varde={`${fmtKlass(bast.klass)}-klassen`}
              storlek={40}
              under={<>
                <div style={{ fontSize: 15, color: diffColor(krPerM3(bast)), marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtDiff(krPerM3(bast))} kr/m³ mot timpeng
                </div>
                <div style={{ fontSize: 12, color: '#7a7a72', marginTop: 8 }}>
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
              <SektionsTitel>Per medelstamklass</SektionsTitel>
              <Lista>
                {klasser.map((k, i) => {
                  const kr = krPerM3(k);
                  const andel = maxAbs > 0 ? Math.abs(kr) / maxAbs : 0;
                  const oppen = oppenKlass === k.klass;
                  const delKr = (d: DelAgg) => d.volym > 0 ? (d.ackord - d.timpeng) / d.volym : null;
                  return (
                    <ListRad key={k.klass}
                      rubrik={<>
                        {fmtKlass(k.klass)}
                        <span style={{ color: '#7a7a72', fontWeight: 400, fontSize: 12 }}> medelstam</span>
                      </>}
                      detalj={<>
                        {Math.round(k.volym).toLocaleString('sv-SE')} m³fub · {k.antal} objekt
                        {arOsaker(k) && ' · få timmar — osäkert'}
                      </>}
                      tal={fmtDiff(kr)}
                      talFarg={diffColor(kr)}
                      /* |kr/m³| relativt största klassen — på RADENS bredd så
                         längderna är jämförbara mellan rader */
                      stapelAndel={andel}
                      chevron
                      oppen={oppen}
                      onClick={() => setOppenKlass(oppen ? null : k.klass)}
                      sista={i === klasser.length - 1}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
                        <span style={{ color: '#7a7a72' }}>Ackord mot timpeng</span>
                        <span style={{ color: '#e8e8e4', fontVariantNumeric: 'tabular-nums' }}>
                          {k.volym > 0 ? Math.round(k.ackord / k.volym) : '—'} · {k.volym > 0 ? Math.round(k.timpeng / k.volym) : '—'} kr/m³
                        </span>
                      </div>
                      {([['Skördare', k.skord], ['Skotare', k.skot]] as [string, DelAgg][]).map(([namn, d]) => (
                        <div key={namn} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
                          <span style={{ color: '#7a7a72' }}>{namn} · {Math.round(d.volym).toLocaleString('sv-SE')} m³fub</span>
                          {delKr(d) != null ? (
                            <span style={{ color: diffColor(delKr(d)!), fontVariantNumeric: 'tabular-nums' }}>{fmtDiff(delKr(d)!)} kr/m³</span>
                          ) : (
                            <span style={{ color: '#7a7a72' }}>—</span>
                          )}
                        </div>
                      ))}
                    </ListRad>
                  );
                })}
              </Lista>
              <EnhetsFot>kr/m³ mot timpeng</EnhetsFot>
            </>
          )}
        </div>
      )}

      {/* (i)-sheet */}
      {infoOpen && (
        <>
          <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
            background: '#1a1a18', borderRadius: '20px 20px 0 0',
            padding: '12px 20px calc(28px + env(safe-area-inset-bottom))', maxHeight: '80vh', overflowY: 'auto',
            borderTop: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
            fontFamily: "'Geist', system-ui, sans-serif", color: '#e8e8e4',
          }}>
            <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '4px auto 18px' }} />
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Per klass — hur räknas det?</div>
            <div style={{ fontSize: 12, color: '#7a7a72', marginBottom: 18 }}>I vilken medelstamklass lönar sig ackordet bäst mot timpeng.</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#bfcab9', display: 'grid', gap: 14 }}>
              <div>
                <div style={s.sheetH}>Samma tal som Mot ackord</div>
                Exakt samma per-objekt-jämförelse (ackord med alla tillägg mot timpeng, bara avräknade objekt, samma ärlighetsregler) — här grupperad per medelstamklass. En klass total är summan av dess objekt i Mot ackord; skiljer de sig är det en bugg.
              </div>
              <div>
                <div style={s.sheetH}>Klassningen</div>
                Varje objekt klassas på sin medelstam (volym / stammar, manuellt värde när satt) till närmaste klass i ackordprislistan — samma avrundning som prisuppslaget använder.
              </div>
              <div>
                <div style={s.sheetH}>Talet</div>
                Klassens (ackord − timpeng) / volym, i kr/m³fub. Grönt = ackordet ger mer än timpeng i den skogen, rött = mindre. Uppfällningen visar skördare och skotare var för sig eftersom de prissätts olika per klass.
              </div>
              <div>
                <div style={s.sheetH}>Osäkert-märkningen</div>
                En klass som vilar på färre än {OSAKER_TIM} G15-timmar är brus, inte mönster — den märks &quot;få timmar — osäkert&quot;.
              </div>
            </div>
            <button onClick={() => setInfoOpen(false)} style={{
              marginTop: 22, width: '100%', background: '#000', color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
              padding: '12px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            }}>Stäng</button>
          </div>
        </>
      )}
    </EkonomiSida>
  );
}
