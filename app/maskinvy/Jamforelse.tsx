'use client';
import { underTopbar } from '@/lib/design/tokens'; // layoutmått, inte avstånd (tokens: LAYOUT)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import TuTabell from '@/components/maskinvy/TuTabell';
import { supabase } from '@/lib/supabase';
import {
  hämtaManuellRader, fetchAllTimeLassTid,
} from '@/lib/maskinvy/skotarvolym';
import {
  KLASSER, NK, getKlassIdx, kvot, skillnadPct, valjJamforelseMaskiner,
  summeraPerMaskinObjekt, objektSkotningsavstand, volymPerObjekt,
  ORSAK_INGEN_G15, ORSAK_INGEN_MASKIN,
} from '@/lib/maskinvy/jamforelse';
import { fetchAll, getPeriodRange, fmtSv, fmtSvDelta, type Period } from './OversiktShared';
import { useJamforelseMaskinRader } from './useJamforelseMaskiner';

// Maskinerna väljs ur dim_maskin per period (lib/maskinvy/jamforelse) — inga
// hårdkodade id:n. Avståndsklasserna delas med Skotare › Jämförelse.
const DIST_LABELS = KLASSER.map(k => k.short);

// Chart.js ur paketet — inte window.Chart, som bara finns om de gamla vyerna
// råkat ladda det (grafen var tom i ?ny=1).
ChartJS.register(...registerables);

// Plats NK i varje klass-array: tid/lass som inte kan få någon avståndsklass
// (flyttobjekt utan lass, lass utan körsträcka). Ingår i totalen, inte i diagrammet.
const UTAN_KLASS = NK;

type MetricId = 'm3fub_g15h' | 'm3fub_100m' | 'lass_g15h' | 'bransle_m3';

const METRICS: { id: MetricId; label: string; sublabel: string; unit: string; higherIsBetter: boolean }[] = [
  { id: 'm3fub_g15h', label: 'Produktion',   sublabel: 'Kubikmeter virke per timme',           unit: 'm³/G15h',   higherIsBetter: true },
  { id: 'm3fub_100m', label: 'Effektivitet', sublabel: 'Kubikmeter per 100m körsträcka',       unit: 'm³/100m',   higherIsBetter: true },
  { id: 'lass_g15h',  label: 'Turer',        sublabel: 'Antal lass per timme',                  unit: 'lass/G15h', higherIsBetter: true },
  { id: 'bransle_m3', label: 'Bränsle',      sublabel: 'Liter diesel per kubikmeter virke',    unit: 'l/m³',      higherIsBetter: false },
];

const ff = "'Geist', system-ui, sans-serif";

const C = {
  bg: '#000000',
  surface: '#1c1c1e',
  surface2: '#2c2c2e',
  surface3: '#2a2a28',
  border: 'rgba(255,255,255,0.07)',
  border2: 'rgba(255,255,255,0.13)',
  border3: 'rgba(255,255,255,0.2)',
  t1: '#ffffff',
  t2: '#8e8e93',
  t3: '#8e8e93',
  t4: '#48484a',
  green: '#30d158',
  greenBg: 'rgba(48,209,88,0.08)',
  greenBorder: 'rgba(48,209,88,0.2)',
  red: '#ff453a',
  redBg: 'rgba(255,69,58,0.08)',
  amber: '#ffb340',
};

// Bar colors — white tones for EK, green for Wisent
const COLOR_EK_BRED = 'rgba(255,255,255,0.9)';
const COLOR_EK_SMAL = 'rgba(255,255,255,0.45)';
const COLOR_WI      = 'rgba(48,209,88,0.7)';

interface ClassData {
  volym: number;
  g15h: number;
  distM: number;   // summa körsträcka (tur och retur), meter
  bransle: number;
  skift: number;
  lass: number;
}

function emptyClass(): ClassData {
  return { volym: 0, g15h: 0, distM: 0, bransle: 0, skift: 0, lass: 0 };
}

function addClass(a: ClassData, b: ClassData) {
  a.volym += b.volym; a.g15h += b.g15h; a.distM += b.distM;
  a.bransle += b.bransle; a.skift += b.skift; a.lass += b.lass;
}

/** Måttet för en uppsättning data — null när nämnaren saknas (aldrig division ändå). */
function computeMetric(d: ClassData | undefined, metric: MetricId): number | null {
  if (!d) return null;
  switch (metric) {
    case 'm3fub_g15h': return kvot(d.volym, d.g15h);
    case 'm3fub_100m': return kvot(d.volym, d.distM / 100);
    case 'lass_g15h':  return kvot(d.lass, d.g15h);
    case 'bransle_m3': return kvot(d.bransle, d.volym);
    default: return null;
  }
}

/** Total över alla klasser — SUM/SUM, aldrig snitt av klassernas snitt. */
function totalData(data: ClassData[]): ClassData {
  const t = emptyClass();
  data.forEach(d => addClass(t, d));
  return t;
}

// ── SCORE CARD ────────────────────────────────────────────────────────────────
function ScoreCard({
  name, value, unit, isWinner, pctDiff, vol, isHigherBetter, orsak,
}: {
  name: string; value: number | null; unit: string; isWinner: boolean | null;
  pctDiff: number | null; vol: number; isHigherBetter: boolean; orsak: string | null;
}) {
  const goodDiff = pctDiff === null ? null : (isHigherBetter ? pctDiff >= 0 : pctDiff <= 0);
  const vinner = isWinner === true;

  return (
    <div style={{
      flex: 1,
      background: C.surface,
      border: `1px solid ${vinner ? 'rgba(48,209,88,0.28)' : C.border}`,
      borderRadius: 12,
      padding: '22px 20px 18px',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Rank badge — bara när båda maskinerna har ett värde att jämföra */}
      {isWinner !== null && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 4, marginBottom: 10,
          background: vinner ? C.greenBg : 'transparent',
          border: `1px solid ${vinner ? C.greenBorder : C.border}`,
          color: vinner ? C.green : C.t4,
        }}>
          {vinner ? 'Bäst' : '2:a plats'}
        </div>
      )}

      {/* Name */}
      <div style={{
        fontSize: 15, fontWeight: 600, letterSpacing: -0.3, marginBottom: 2,
        color: vinner ? C.t1 : '#aeaeb2',
      }}>{name}</div>

      {/* Hero number */}
      <div style={{
        fontSize: 64, fontWeight: 700, lineHeight: 1, letterSpacing: -3,
        marginTop: 12, marginBottom: 4,
        color: vinner ? C.t1 : '#d0d0d0',
        textShadow: vinner ? '0 0 30px rgba(255,255,255,0.3)' : 'none',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value !== null ? fmtSv(value, 1) : '–'}
      </div>
      <div style={{ fontSize: 11, color: vinner ? '#666' : '#444', marginBottom: 3 }}>{unit}</div>
      <div style={{ fontSize: 11, color: C.t4, marginBottom: 12 }}>
        {value !== null ? 'summa / summa' : orsak}
      </div>

      {/* Diff badge */}
      <div style={{
        fontSize: 14, fontWeight: 700, marginBottom: 16, letterSpacing: -0.3,
        color: goodDiff ? C.green : C.red,
        textShadow: goodDiff && vinner ? '0 0 20px rgba(48,209,88,0.4)' : 'none',
      }}>
        {pctDiff !== null ? `${fmtSvDelta(pctDiff)} ${goodDiff ? 'bättre' : 'sämre'}` : '–'}
      </div>

      {/* Data volume */}
      <div style={{
        paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)',
        fontSize: 10, color: C.t4,
      }}>
        {vol > 0 ? (
          <span style={{ color: C.t3 }}>
            {fmtSv(vol, 0)} m³ data
          </span>
        ) : '–'}
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function Jamforelse() {
  const [metric, setMetric] = useState<MetricId>('m3fub_g15h');
  const [period, setPeriod] = useState<Period>('M');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [laddFel, setLaddFel] = useState(false);
  const [ekBred, setEkBred] = useState<ClassData[]>([]);
  const [ekSmal, setEkSmal] = useState<ClassData[]>([]);
  const [wi, setWi]         = useState<ClassData[]>([]);
  // Which EK config to show in comparison (bred or smal)
  const [ekConfig, setEkConfig] = useState<'bred' | 'smal'>('bred');
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  const { start, end, label } = getPeriodRange(period, offset);

  // Maskinerna ur dim_maskin för perioden — inga hårdkodade id:n.
  const { rader: maskinRader } = useJamforelseMaskinRader();
  const val = useMemo(
    () => (maskinRader ? valjJamforelseMaskiner(maskinRader, start, end) : null),
    [maskinRader, start, end],
  );
  const wiIds = val?.wisent ?? [];
  const ekIds = val?.ek ?? [];
  const idNyckel = val ? `${wiIds.join(',')}|${ekIds.join(',')}` : null;

  const loadData = useCallback(async () => {
    if (idNyckel === null) return;            // dim_maskin ännu inte läst
    setLoading(true);
    setLaddFel(false);
    const ids = [...wiIds, ...ekIds];
    const tom = () => Array.from({ length: NK + 1 }, () => emptyClass());
    if (ids.length === 0) {
      setEkBred(tom()); setEkSmal(tom()); setWi(tom()); setLoading(false);
      return;
    }

    // Lass och tid hämtas SEPARAT (aldrig joinade) och möts per maskin+objekt.
    // Volym = maskinens EGNA lass (fakt_lass), inte skördarens produktion på objektet.
    const [lassRows, tidRows, dimRes, objektRes] = await Promise.all([
      fetchAll('fakt_lass', 'maskin_id, objekt_id, datum, volym_m3sub, korstracka_m', ids, start, end),
      fetchAll('fakt_tid', 'maskin_id, objekt_id, datum, processing_sek, terrain_sek, other_work_sek, bransle_liter', ids, start, end),
      supabase.from('dim_objekt').select('objekt_id, vo_nummer'),
      supabase.from('objekt').select('vo_nummer, skotare_konfiguration'),
    ]);

    // Manuell korrigering via den delade funktionen, en maskin i taget (som övriga flikar).
    const volymId: Record<string, Map<string, number>> = {};
    await Promise.all(ids.map(async id => {
      const rader = await hämtaManuellRader(id).catch(() => []);
      if (!rader.some(r => (r.volym_m3 ?? 0) > 0)) return;
      const { lassRows: allL, tidRows: allT } = await fetchAllTimeLassTid([id]);
      volymId[id] = volymPerObjekt(allL, rader, allT, id, start, end).perObjekt;
    }));

    const voToKonfig: Record<string, string> = {};
    (objektRes.data || []).forEach((r: any) => { if (r.vo_nummer) voToKonfig[r.vo_nummer] = r.skotare_konfiguration || 'bred'; });
    const objIdToKonfig: Record<string, string> = {};
    (dimRes.data || []).forEach((r: any) => { if (r.vo_nummer && voToKonfig[r.vo_nummer]) objIdToKonfig[r.objekt_id] = voToKonfig[r.vo_nummer]; });

    const newEkBred = tom();
    const newEkSmal = tom();
    const newWi     = tom();
    const ekSet = new Set(ekIds);

    for (const sum of summeraPerMaskinObjekt(lassRows, tidRows)) {
      // Objektets klass = dess skotningsavstånd (enkelriktat, ur lassens körsträcka).
      // Objekt utan lass med körsträcka (t.ex. flyttobjektet) kan inte klassas, men
      // deras G15-timmar är maskinens timmar och hamnar i UTAN_KLASS så totalen stämmer.
      const avst = objektSkotningsavstand(sum);
      const ci = avst === null ? UTAN_KLASS : getKlassIdx(avst);
      const rattad = volymId[sum.maskin_id]?.get(sum.objekt_id);
      const d: ClassData = {
        volym: rattad ?? sum.volym, g15h: sum.g15h, distM: sum.korM,
        bransle: sum.bransle, skift: sum.dagar.size, lass: sum.lass,
      };
      if (ekSet.has(sum.maskin_id)) {
        const mal = (objIdToKonfig[sum.objekt_id] || 'bred') === 'smal' ? newEkSmal : newEkBred;
        addClass(mal[ci], d);
      } else {
        addClass(newWi[ci], d);
      }
    }

    setEkBred(newEkBred); setEkSmal(newEkSmal); setWi(newWi);
    setLoading(false);
    // wiIds/ekIds härleds ur idNyckel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idNyckel, start, end]);

  useEffect(() => {
    loadData().catch(() => { setLaddFel(true); setLoading(false); });
  }, [loadData]);

  // Draw bar chart
  useEffect(() => {
    if (loading || !chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const ekData = ekConfig === 'bred' ? ekBred : ekSmal;
    const ekVals = ekData.slice(0, NK).map(d => computeMetric(d, metric));
    const wiVals = wi.slice(0, NK).map(d => computeMetric(d, metric));
    const currentMetric = METRICS.find(m => m.id === metric)!;

    chartInstance.current = new (ChartJS as any)(chartRef.current, {
      type: 'bar',
      data: {
        labels: DIST_LABELS,
        datasets: [
          {
            label: `Elephant King (${ekConfig})`,
            data: ekVals,
            backgroundColor: ekConfig === 'bred' ? COLOR_EK_BRED : COLOR_EK_SMAL,
            borderRadius: 4,
          },
          {
            label: 'Wisent',
            data: wiVals,
            backgroundColor: COLOR_WI,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
          legend: {
            position: 'top' as const,
            labels: {
              font: { family: ff, size: 11 },
              boxWidth: 10, borderRadius: 2, padding: 16, color: C.t3,
            },
          },
          tooltip: {
            backgroundColor: C.surface2,
            titleColor: C.t1,
            bodyColor: C.t3,
            borderColor: C.border2,
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (c: any) => ` ${c.dataset.label}: ${c.parsed.y > 0 ? fmtSv(c.parsed.y, 1) : '–'} ${currentMetric.unit}`,
              afterBody: (items: any[]) => {
                if (items.length < 2) return [];
                const v1 = items[0].parsed.y, v2 = items[1].parsed.y;
                if (!v1 || !v2) return [];
                const diff = skillnadPct(v1, v2);
                return diff === null ? [] : [`Skillnad: ${fmtSvDelta(diff)}`];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: C.t3, font: { size: 11, family: ff } },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: C.t3, font: { size: 11, family: ff } },
            beginAtZero: true,
            title: { display: true, text: currentMetric.unit, color: C.t3, font: { size: 10, family: ff } },
          },
        },
      },
    });

    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [loading, metric, ekConfig, ekBred, ekSmal, wi]);

  // Computed values — totalen är SUM/SUM över alla klasser, aldrig ett snitt av klassernas snitt
  const ekData = ekConfig === 'bred' ? ekBred : ekSmal;
  const ekTot = totalData(ekData);
  const wiTot = totalData(wi);
  const ekAvg = computeMetric(ekTot, metric);
  const wiAvg = computeMetric(wiTot, metric);
  const currentMetric = METRICS.find(m => m.id === metric)!;
  const ekVol = ekTot.volym;
  const wiVol = wiTot.volym;

  const bada = ekAvg !== null && wiAvg !== null;
  const ekWins: boolean | null = !bada ? null
    : (currentMetric.higherIsBetter ? ekAvg >= wiAvg : ekAvg <= wiAvg);
  const ekPct = skillnadPct(ekAvg, wiAvg);
  const wiPct = skillnadPct(wiAvg, ekAvg);

  // Tid/lass utan avståndsklass (t.ex. flyttobjekt utan lass): ingår i totalen ovan men inte i diagrammet.
  const utanKlassRader = [
    { kort: 'EK', d: ekData[UTAN_KLASS] },
    { kort: 'Wisent', d: wi[UTAN_KLASS] },
  ].filter(x => x.d && (x.d.g15h > 0 || x.d.lass > 0 || x.d.volym > 0));
  // Ett kort utan att något går att rita får aldrig stå tomt.
  const harKlassvarde = [ekData, wi].some(arr =>
    arr.slice(0, NK).some(d => { const v = computeMetric(d, metric); return v !== null && v > 0; }));

  // Orsaken när en maskin saknar värde — tomt ska aldrig vara en gåta.
  const orsakFor = (harMaskin: boolean, tot: ClassData): string | null => {
    if (!harMaskin) return ORSAK_INGEN_MASKIN;
    if (!(tot.g15h > 0) && (metric === 'm3fub_g15h' || metric === 'lass_g15h')) return ORSAK_INGEN_G15;
    if (!(tot.lass > 0)) return 'Inga lass med körsträcka i perioden';
    return 'Värde saknas i perioden';
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed', top: underTopbar(52), left: 0, right: 0, bottom: 0,
        background: C.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: C.t3, fontFamily: ff, fontSize: 13, zIndex: 1,
      }}>
        Laddar data...
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: underTopbar(52), left: 0, right: 0, bottom: 0,
      overflow: 'auto', WebkitOverflowScrolling: 'touch' as const,
      background: C.bg, fontFamily: ff, color: C.t1, zIndex: 1,
    }}>
      <div style={{ padding: '20px 20px 60px', maxWidth: 900, margin: '0 auto' }}>

      {/* TU för ALLA maskiner (skördare + skotare) — resten av fliken jämför
          bara de två skotarna. Egen komponent mot tokens (components/maskinvy). */}
      <TuTabell />

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, marginBottom: 4 }}>
          Elephant King vs Wisent
        </div>
        <div style={{ fontSize: 13, color: C.t3 }}>
          Jämförelse per avståndsklass · summa / summa
        </div>
      </div>

      {/* ── PERIOD ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, gap: 8, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['V', 'M', 'K', 'Å'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setOffset(0); }}
              style={{
                minHeight: 44, minWidth: 44, padding: '0 12px', border: 'none', borderRadius: 10,
                fontFamily: ff, fontSize: 14, cursor: 'pointer',
                background: period === p ? C.surface2 : 'transparent',
                color: period === p ? C.t1 : C.t3,
                fontWeight: period === p ? 600 : 400,
              }}
            >{p}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setOffset(o => o - 1)}
            aria-label="Föregående period"
            style={{ minHeight: 44, minWidth: 44, border: 'none', background: 'transparent', color: C.t3, fontFamily: ff, fontSize: 20, cursor: 'pointer' }}
          >‹</button>
          <span style={{ fontSize: 13, color: C.t3, minWidth: 130, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {label}
          </span>
          <button
            onClick={() => setOffset(o => o + 1)}
            aria-label="Nästa period"
            style={{ minHeight: 44, minWidth: 44, border: 'none', background: 'transparent', color: C.t3, fontFamily: ff, fontSize: 20, cursor: 'pointer' }}
          >›</button>
        </div>
      </div>

      {/* ── EK CONFIG SELECTOR ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: C.t3, fontWeight: 500 }}>
          EK konfiguration:
        </span>
        <div style={{
          display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)',
          borderRadius: 8, padding: 3,
        }}>
          {(['bred', 'smal'] as const).map(cfg => (
            <button
              key={cfg}
              onClick={() => setEkConfig(cfg)}
              style={{
                minHeight: 44, padding: '0 18px', border: 'none', borderRadius: 10, fontFamily: ff,
                fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                background: ekConfig === cfg ? C.surface2 : 'transparent',
                color: ekConfig === cfg ? C.t1 : C.t3,
                letterSpacing: -0.2,
              }}
            >
              {cfg === 'bred' ? 'Breddat lastred' : 'Smalt lastred'}
            </button>
          ))}
        </div>
      </div>

      {/* ── METRIC TABS ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: 28, gap: 0 }}>
        {METRICS.map(m => (
          <button
            key={m.id}
            onClick={() => setMetric(m.id)}
            style={{
              padding: '0 0 12px', marginRight: 28, border: 'none', background: 'none',
              fontFamily: ff, cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
              borderBottom: `1px solid ${metric === m.id ? C.t1 : 'transparent'}`,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2, color: metric === m.id ? C.t1 : C.t4, marginBottom: 3 }}>
              {m.label}
            </div>
            <div style={{ fontSize: 11, fontWeight: 400, color: metric === m.id ? C.t3 : C.t4 }}>
              {m.sublabel}
            </div>
          </button>
        ))}
      </div>

      {/* ── SCORE CARDS ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <ScoreCard
          name={`Elephant King (${ekConfig})`}
          value={ekAvg}
          unit={currentMetric.unit}
          isWinner={ekWins}
          pctDiff={ekPct}
          vol={ekVol}
          isHigherBetter={currentMetric.higherIsBetter}
          orsak={orsakFor(ekIds.length > 0, ekTot)}
        />
        <ScoreCard
          name="Wisent"
          value={wiAvg}
          unit={currentMetric.unit}
          isWinner={ekWins === null ? null : !ekWins}
          pctDiff={wiPct}
          vol={wiVol}
          isHigherBetter={currentMetric.higherIsBetter}
          orsak={orsakFor(wiIds.length > 0, wiTot)}
        />
      </div>

      {utanKlassRader.length > 0 && (
        <div data-utan-klass style={{ fontSize: 11, color: C.t4, lineHeight: 1.5, margin: '-16px 0 24px' }}>
          Ingår i totalen men i ingen avståndsklass (tid på objekt utan lass, till exempel flytt):{' '}
          {utanKlassRader.map(x => `${x.kort} ${fmtSv(x.d.g15h, 1)} h G15`).join(' · ')}
        </div>
      )}

      {/* ── BAR CHART ── */}
      <div style={{
        background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
        padding: '18px 18px 14px', marginBottom: 14,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: C.t3, marginBottom: 16,
        }}>
          {currentMetric.label} per avståndsklass
        </div>
        {harKlassvarde ? (
          <div style={{ height: 280, position: 'relative' }}>
            <canvas ref={chartRef} />
          </div>
        ) : (
          <div data-graf-tom style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: C.t3, textAlign: 'center' }}>
            Inget värde att rita för {currentMetric.label.toLowerCase()} i perioden.
          </div>
        )}
      </div>

      {/* ── DETAILS TABLE ── */}
      <div style={{
        background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
        overflow: 'hidden',
      }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: C.t3, padding: '16px 18px 12px',
          borderBottom: `1px solid ${C.border}`,
        }}>
          Detaljer per avståndsklass
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
              <th style={{ padding: '10px 18px', textAlign: 'left', color: C.t3, fontWeight: 500, fontSize: 11 }}>
                Klass
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: C.t3, fontWeight: 500, fontSize: 11 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: ekConfig === 'bred' ? COLOR_EK_BRED : COLOR_EK_SMAL, marginRight: 5, verticalAlign: 'middle' }} />
                EK {ekConfig}
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: C.t3, fontWeight: 500, fontSize: 11 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: COLOR_WI, marginRight: 5, verticalAlign: 'middle' }} />
                Wisent
              </th>
              <th style={{ padding: '10px 18px', textAlign: 'right', color: C.t3, fontWeight: 500, fontSize: 11 }}>
                Skillnad
              </th>
            </tr>
          </thead>
          <tbody>
            {DIST_LABELS.map((label, i) => {
              const ekV = computeMetric(ekData[i], metric);
              const wiV = computeMetric(wi[i], metric);
              const diff = skillnadPct(ekV, wiV);
              const goodDiff = diff !== null && (currentMetric.higherIsBetter ? diff >= 0 : diff <= 0);

              return (
                <tr key={label} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '12px 18px', color: C.t2, fontWeight: 500 }}>
                    {label}
                    <div style={{ fontSize: 10, color: C.t4, marginTop: 2 }}>
                      {(ekData[i].skift + wi[i].skift)} skift
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {ekV !== null && ekV > 0 ? (
                      <>
                        <span style={{ color: C.t1, fontWeight: 600 }}>{fmtSv(ekV, 1)}</span>
                        <span style={{ fontSize: 10, color: C.t4, marginLeft: 3 }}>{currentMetric.unit}</span>
                      </>
                    ) : <span style={{ color: C.t4 }}>–</span>}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {wiV !== null && wiV > 0 ? (
                      <>
                        <span style={{ color: C.t1, fontWeight: 600 }}>{fmtSv(wiV, 1)}</span>
                        <span style={{ fontSize: 10, color: C.t4, marginLeft: 3 }}>{currentMetric.unit}</span>
                      </>
                    ) : <span style={{ color: C.t4 }}>–</span>}
                  </td>
                  <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                    {diff !== null && ekV !== null && ekV > 0 && wiV !== null && wiV > 0 ? (
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px', borderRadius: 4,
                        fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        background: goodDiff ? C.greenBg : C.redBg,
                        color: goodDiff ? C.green : C.red,
                      }}>
                        {fmtSvDelta(diff)}
                      </span>
                    ) : <span style={{ color: C.t4 }}>–</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
