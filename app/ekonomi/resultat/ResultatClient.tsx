'use client';

// Resultat — BOKFÖRD vinst ur Fortnox: fakturerad intäkt minus bokförda
// kostnader för perioden. OBS: detta är INTE samma tal som Översiktens
// "vi körde in" (producerad ackordintäkt räknad på volym) — skillnaden
// står i (i)-sheeten så ingen tror att de två flikarna säger emot varandra.
//
// Layout via delade mallen (app/ekonomi/delade/mall.tsx). Bara Månad/
// Kvartal/År — kostnader bokförs inte per dag, en dagsvinst vore en lögn.
//
// FÄRGREGELN: resultatet är ett signerat tal → grönt/rött. Kostnader är
// neutrala/dämpade — ALDRIG bärnsten (bärnsten = preliminärt i sektionen).

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { g15Sek } from '@/lib/g15';
import { type PeriodType, getPeriodDates, getPeriodLabel, fetchAllRows } from '@/lib/ekonomi/period';
import {
  EkonomiSida, Periodvaxlare, Hero, MetaRad, Lista, ListRad, SektionsTitel,
  Laddar, FelRuta, Tomt, GRON, ROD, BARNSTEN,
} from '../delade/mall';
import { vardeminskningPeriod, type MaskinVardeminskning } from '@/lib/ekonomi/vardeminskning';

type Kostnader = { drivmedel: number; drift_service: number; loner: number; avskrivning: number; ovrigt: number; total: number };

type MaskinResult = {
  maskin_id: string;
  maskin_namn: string;
  maskin_typ: string | null;
  kostnadsstalle: { kod: string; namn?: string };
  kostnadsstallen?: { kod: string; namn?: string }[];
  ok: boolean;
  fel?: string;
  intakter?: number;
  kostnader?: Kostnader;
  resultat?: number;
  vardeminskning_grund?: MaskinVardeminskning;  // rådata — helpern räknar
};

type Sammanfattning = {
  ok: boolean;
  intakter: number;
  kostnader: Kostnader;
  resultat: number;
};

type OvrigtCc = {
  kod: string;
  namn?: string;
  intakter: number;
  kostnader: Kostnader;
  resultat: number;
};

const KATEGORIER: [keyof Kostnader, string][] = [
  ['drivmedel', 'Drivmedel'],
  ['drift_service', 'Drift & service'],
  ['loner', 'Lön'],
  ['avskrivning', 'Avskrivning'],
  ['ovrigt', 'Övrigt'],
];

function formatKr(n: number) { return `${Math.round(n).toLocaleString('sv-SE')} kr`; }
function fmtSign(n: number) { return `${n < 0 ? '−' : '+'}${Math.round(Math.abs(n)).toLocaleString('sv-SE')}`; }
function resFarg(n: number) { return n >= 0 ? `rgba(${GRON},0.9)` : `rgba(${ROD},0.9)`; }

export default function ResultatClient() {
  const [period, setPeriod] = useState<PeriodType>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maskiner, setMaskiner] = useState<MaskinResult[]>([]);
  const [foretagetTotalt, setForetagetTotalt] = useState<Sammanfattning | null>(null);
  const [utanKost, setUtanKost] = useState<Sammanfattning | null>(null);
  const [ovriga, setOvriga] = useState<OvrigtCc[]>([]);
  const [antalRader, setAntalRader] = useState(0);   // ärligt tomt: 0 bokförda rader ≠ 0 kr vinst
  const [ccOpen, setCcOpen] = useState(false);       // per kostnadsställe-sektionen uppfälld
  const [infoOpen, setInfoOpen] = useState(false);
  // Periodens G15-timmar per maskin (fakt_tid via g15Sek) — grunden för
  // värdeminskningen: kr/G15-tim × faktiskt körda timmar. null = kunde inte
  // läsas (ärligt: då visas ingen värdeminskning, aldrig en gissad nolla).
  const [g15PerMaskin, setG15PerMaskin] = useState<Record<string, number> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);
      // Fortnox-rapporten + periodens G15-timmar parallellt. Timmarna får
      // inte fälla hela vyn — fel där ger g15PerMaskin=null (värdeminskning
      // visas inte) medan bokföringen renderas som vanligt.
      const [r, g15Res] = await Promise.all([
        fetch(`/api/fortnox/result-per-costcenter?fromdate=${start}&todate=${end}`, { cache: 'no-store' }),
        (async () => {
          try {
            const rows = await fetchAllRows((from, to) =>
              supabase.from('fakt_tid')
                .select('maskin_id, processing_sek, terrain_sek, other_work_sek')
                .gte('datum', start).lte('datum', end)
                .order('id')  // unik tiebreaker — .range() kräver total ordning
                .range(from, to)
            );
            const agg: Record<string, number> = {};
            for (const rad of rows) {
              agg[rad.maskin_id] = (agg[rad.maskin_id] || 0)
                + g15Sek(rad.processing_sek, rad.terrain_sek, rad.other_work_sek) / 3600;
            }
            return agg;
          } catch {
            return null;
          }
        })(),
      ]);
      setG15PerMaskin(g15Res);
      const body = await r.json();
      if (!r.ok || !body.ok) {
        setMaskiner([]);
        setForetagetTotalt(null);
        setUtanKost(null);
        setOvriga([]);
        setAntalRader(0);
        setError(body.meddelande || `HTTP ${r.status}`);
        return;
      }
      setMaskiner(body.maskiner || []);
      setForetagetTotalt(body.foretaget_totalt || null);
      setUtanKost(body.utan_kostnadsstalle || null);
      setOvriga(body.ovriga_kostnadsstallen || []);
      setAntalRader(Number(body.antal_rader_i_period) || 0);
    } catch (e: any) {
      setError(e?.message || String(e));
      setMaskiner([]);
      setForetagetTotalt(null);
      setUtanKost(null);
      setOvriga([]);
      setAntalRader(0);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const tot = foretagetTotalt;
  const harData = tot != null && antalRader > 0;
  const utanKostAktiv = utanKost != null && (utanKost.intakter !== 0 || utanKost.kostnader.total !== 0);
  const ccAntal = maskiner.length + ovriga.length + (utanKostAktiv ? 1 : 0);
  const sheetH = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 4 } as const;
  const barnstenFarg = `rgba(${BARNSTEN},0.9)`;

  // ── Verklig värdeminskning (KALKYL — alltid bärnsten, aldrig som en
  // Fortnox-siffra). Ponsse-modellen: kr/G15-tim × maskinens FAKTISKA
  // G15-timmar i perioden — självjusterande och självperiodiserande.
  // Sålda maskiner och saknat kr/tim får null av helpern → ingen rad.
  // g15PerMaskin === null (kunde inte läsas) → ingen värdeminskning visas,
  // aldrig en gissad nolla.
  const { start: periodStart } = getPeriodDates(period, periodOffset);
  const forAr = Number(periodStart.slice(0, 4));
  const vmForMaskin = (m: MaskinResult): number | null => {
    if (g15PerMaskin == null) return null;
    return vardeminskningPeriod(m.vardeminskning_grund || {}, g15PerMaskin[m.maskin_id] || 0, forAr);
  };
  const sumVm = maskiner.reduce((s2, m) => s2 + (vmForMaskin(m) || 0), 0);
  // Dubbelräkningsvakt: bokförs 78xx (vid bokslut) mäter den SAMMA sak som
  // kalkylen — båda samtidigt vore dubbel kostnad. Varna, räkna aldrig ihop.
  const dubbelRisk = sumVm > 0 && tot != null && Math.abs(tot.kostnader.avskrivning) > 0.5;

  // En rad i per kostnadsställe-uppfällningen — maskin, övrigt CC eller utan CC
  const ccRad = (key: string, rubrik: React.ReactNode, koder: string | null, intakter: number, kostnader: number, resultat: number, vmPeriod: number | null, sista: boolean) => (
    <ListRad key={key}
      rubrik={<>{rubrik}{koder && <span style={{ color: '#7a7a72', fontWeight: 400 }}> · {koder}</span>}</>}
      detalj={<>
        intäkt {formatKr(intakter)} · kostnad {formatKr(kostnader)}
        {vmPeriod != null && <span style={{ color: barnstenFarg }}> · värdeminskning {formatKr(vmPeriod)} (kalkyl)</span>}
      </>}
      tal={fmtSign(resultat)}
      talFarg={resFarg(resultat)}
      undertal={vmPeriod != null ? <span style={{ color: barnstenFarg }}>{fmtSign(resultat - vmPeriod)} efter värdem.</span> : undefined}
      sista={sista}
    />
  );

  return (
    <EkonomiSida>
      {/* Bara Månad/Kvartal/År — kostnader landar inte per dag */}
      <Periodvaxlare
        perioder={['M', 'K', 'A']}
        period={period}
        offset={periodOffset}
        onPeriod={p => { setPeriod(p); setPeriodOffset(0); }}
        onOffset={setPeriodOffset}
        onInfo={() => setInfoOpen(true)}
      />

      {loading && <Laddar />}

      {!loading && error && (
        <>
          <FelRuta titel="Kunde inte hämta resultat" fel={error} onRetry={fetchData} />
          {(error.includes('costcenter') || error.toLowerCase().includes('404')) && (
            <div style={{ margin: '0 16px', fontSize: 11, color: '#7a7a72', lineHeight: 1.5 }}>
              Kontrollera att Fortnox är anslutet (Admin → Lönesystem) och att kostnadsställe-mappningen är ifylld i Inställningar.
            </div>
          )}
        </>
      )}

      {!loading && !error && !harData && (
        /* Ärligt tomt — inga bokförda rader i perioden är inte "0 kr vinst" */
        <Tomt>Ingen bokförd data i {getPeriodLabel(period, periodOffset)}</Tomt>
      )}

      {!loading && !error && harData && tot && (
        <div style={{ padding: '0 16px' }}>
          {/* Hero — BOKFÖRT resultat (Fortnox). Under: den sanna ägar-
              ekonomin efter verklig värdeminskning — tydligt skild rad,
              kalkyl-ordet i bärnsten så den aldrig läses som bokförd. */}
          <Hero
            etikett={tot.resultat >= 0 ? 'Vinst (bokfört)' : 'Förlust (bokfört)'}
            varde={`${fmtSign(tot.resultat)} kr`}
            vardeFarg={resFarg(tot.resultat)}
            under={<>
              <div style={{ fontSize: 13, color: '#bfcab9', marginTop: 10 }}>
                Intäkt {formatKr(tot.intakter)} · Kostnad {formatKr(tot.kostnader.total)}
              </div>
              {sumVm > 0 && (
                <div style={{ fontSize: 15, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: resFarg(tot.resultat - sumVm) }}>{fmtSign(tot.resultat - sumVm)} kr</span>
                  <span style={{ color: '#7a7a72' }}> efter verklig värdeminskning</span>
                  <span style={{ color: barnstenFarg }}> · kalkyl</span>
                </div>
              )}
            </>}
          />
          <MetaRad delar={[{ text: 'bokfört ur Fortnox — inte samma tal som Översiktens "vi körde in"' }]} />

          {/* Kostnader per kategori — neutralt/dämpat, ingen kategorifärg.
              Stapeln = andel av totalkostnaden, på radens bredd. */}
          <SektionsTitel>Kostnader</SektionsTitel>
          <Lista>
            {KATEGORIER.map(([nyckel, namn], i) => {
              const v = tot.kostnader[nyckel];
              const andel = tot.kostnader.total > 0 ? v / tot.kostnader.total : 0;
              return (
                <ListRad key={nyckel}
                  rubrik={namn}
                  tal={formatKr(v)}
                  stapelAndel={andel}
                  sista={i === KATEGORIER.length - 1 && !(sumVm > 0)}
                />
              );
            })}
            {/* Värdeminskningen är en KALKYL — bärnsten rakt igenom, ingen
                stapel (den ingår inte i den bokförda totalen ovan) */}
            {sumVm > 0 && (
              <ListRad
                rubrik={<>Värdeminskning<span style={{ color: barnstenFarg, fontWeight: 400, fontSize: 11 }}> · kalkyl, ej bokförd</span></>}
                tal={formatKr(sumVm)}
                talFarg={barnstenFarg}
                sista
              />
            )}
          </Lista>
          {dubbelRisk && (
            <div style={{ fontSize: 11, color: barnstenFarg, marginTop: 10, padding: '0 4px', textAlign: 'center', lineHeight: 1.5 }}>
              Bokförd avskrivning (78xx) finns i perioden — den och värdeminskningen (kalkyl) mäter samma sak. Räkna inte båda.
            </div>
          )}

          {/* Per kostnadsställe — kollapsad sektion, samma mönster som
              Mot ackords "Per maskin". Maskiner + övriga CC + utan CC. */}
          {ccAntal > 0 && (
            <Lista style={{ marginTop: 24 }}>
              <div onClick={() => setCcOpen(v => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0', cursor: 'pointer',
              }}>
                <span style={{ fontSize: 13, color: '#7a7a72', flex: 1 }}>Per kostnadsställe</span>
                <span style={{ fontSize: 13, color: '#7a7a72', fontVariantNumeric: 'tabular-nums' }}>{ccAntal}</span>
                <span style={{ fontSize: 11, color: '#7a7a72', transform: ccOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
              </div>
              {ccOpen && (
                <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
                  {maskiner.map((m, i) => ccRad(
                    m.maskin_id,
                    m.maskin_namn,
                    (m.kostnadsstallen && m.kostnadsstallen.length > 0 ? m.kostnadsstallen : [m.kostnadsstalle]).map(cc => cc.kod).join(' '),
                    m.intakter || 0,
                    m.kostnader?.total || 0,
                    m.resultat || 0,
                    vmForMaskin(m),
                    i === maskiner.length - 1 && ovriga.length === 0 && !utanKostAktiv,
                  ))}
                  {ovriga.map((o, i) => ccRad(
                    o.kod,
                    o.namn || o.kod,
                    o.namn ? o.kod : null,
                    o.intakter,
                    o.kostnader.total,
                    o.resultat,
                    null,
                    i === ovriga.length - 1 && !utanKostAktiv,
                  ))}
                  {utanKostAktiv && utanKost && ccRad(
                    'utan-cc',
                    'Utan kostnadsställe',
                    null,
                    utanKost.intakter,
                    utanKost.kostnader.total,
                    utanKost.resultat,
                    null,
                    true,
                  )}
                </div>
              )}
            </Lista>
          )}

          {maskiner.length === 0 && (
            <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 16, padding: '0 4px', textAlign: 'center', lineHeight: 1.5 }}>
              Inga kostnadsställe-mappningar — lägg till i Inställningar → Kostnadsställe per maskin.
            </div>
          )}
        </div>
      )}

      {/* (i)-sheet — vad talet är och inte är, plus BAS-grupperingen */}
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
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Resultat — hur räknas det?</div>
            <div style={{ fontSize: 12, color: '#7a7a72', marginBottom: 18 }}>Bokförd vinst ur Fortnox för perioden.</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#bfcab9', display: 'grid', gap: 14 }}>
              <div>
                <div style={sheetH}>Bokfört — inte producerat</div>
                Talet är Fortnox-fakturerad intäkt minus bokförda kostnader. Översiktens &quot;vi körde in&quot; är något annat: producerad ackordintäkt räknad på volym, innan fakturering. De två talen mäter olika saker och ska inte stämma överens — fakturering släpar efter produktionen.
              </div>
              <div>
                <div style={sheetH}>Kostnadskategorierna (BAS-plan)</div>
                Intäkter = 3xxx · Drivmedel = 56xx · Drift &amp; service = 50–55 + 57–59 · Lön = 7xxx utom 78 · Avskrivning = 78xx · Övrigt = 4/6/8xxx. Avskrivningen redovisas separat — den låg tidigare gömd inne i lön.
              </div>
              <div>
                <div style={sheetH}>Per kostnadsställe</div>
                Varje maskin är mappad till sina Fortnox-kostnadsställen (Inställningar). Rader utan kostnadsställe och kostnadsställen som inte är maskiner (lastbil, trailer m.fl.) visas som egna rader så att inget belopp försvinner tyst.
              </div>
              <div>
                <div style={sheetH}>Bara månad och uppåt</div>
                Kostnader bokförs inte per dag — en dags- eller veckovinst vore brus, inte fakta.
              </div>
              <div>
                <div style={{ ...sheetH, color: barnstenFarg }}>Verklig värdeminskning — kalkyl</div>
                Bokförd avskrivning (78xx) är skattestyrd och bokas vid bokslut — en maskin kan stå nedskriven till nästan noll fast den är värd miljoner. Värdeminskningen här är vår egen kalkyl med maskinsäljarens modell: kr per G15-timme (skördare ~300–500, skotare ~250–350 första ~4000 h; sätts per maskin i Inställningar) × maskinens faktiskt körda G15-timmar i perioden. Självjusterande — mer körning betyder mer slitage, en stillastående maskin kostar inget. Den visas alltid i bärnsten och blandas aldrig in i de bokförda talen. &quot;Efter verklig värdeminskning&quot; = bokfört resultat minus kalkylen — den sanna ägarekonomin. Sålda maskiner bär ingen värdeminskning framåt. Skulle bokförd avskrivning (78xx) dyka upp i en period varnar vyn — de två mäter samma sak och får aldrig räknas ihop.
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
