'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EK_ID = 'A110148';
const WI_ID = 'A030353';

const DIST_LABELS = ['0–100m', '100–200m', '200–300m', '300–400m', '400+m'];
const DIST_EDGES = [0, 100, 200, 300, 400, Infinity];
const DIST_WEIGHTS = [5, 4, 3, 2, 1]; // closer = more weight

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
  distM: number;
  bransle: number;
  skift: number;
}

function emptyClass(): ClassData {
  return { volym: 0, g15h: 0, distM: 0, bransle: 0, skift: 0 };
}

function getClassIndex(dist: number): number {
  for (let i = 0; i < DIST_EDGES.length - 1; i++) {
    if (dist < DIST_EDGES[i + 1]) return i;
  }
  return DIST_EDGES.length - 2;
}

function computeMetric(d: ClassData, metric: MetricId): number {
  if (!d) return 0;
  switch (metric) {
    case 'm3fub_g15h': return d.g15h > 0 ? d.volym / d.g15h : 0;
    case 'm3fub_100m': return d.distM > 0 ? d.volym / (d.distM / 100) : 0;
    case 'lass_g15h':  return d.g15h > 0 ? (d.volym / 7.5) / d.g15h : 0;
    case 'bransle_m3': return d.volym > 0 ? d.bransle / d.volym : 0;
    default: return 0;
  }
}

function weightedAvg(data: ClassData[], metric: MetricId): number {
  let sum = 0, wSum = 0;
  data.forEach((d, i) => {
    const v = computeMetric(d, metric);
    if (v > 0) { sum += v * DIST_WEIGHTS[i]; wSum += DIST_WEIGHTS[i]; }
  });
  return wSum > 0 ? sum / wSum : 0;
}

// ── SCORE CARD ────────────────────────────────────────────────────────────────
function ScoreCard({
  name, value, unit, isWinner, pctDiff, vol, isHigherBetter,
}: {
  name: string; value: number; unit: string; isWinner: boolean;
  pctDiff: number; vol: number; isHigherBetter: boolean;
}) {
  const sign = pctDiff >= 0 ? '+' : '';
  const goodDiff = isHigherBetter ? pctDiff >= 0 : pctDiff <= 0;

  return (
    <div style={{
      flex: 1,
      background: isWinner
        ? 'linear-gradient(145deg, #1e1e1c 0%, #141412 100%)'
        : C.surface,
      border: `1px solid ${isWinner ? C.border3 : C.border}`,
      borderRadius: 12,
      padding: '22px 20px 18px',
      position: 'relative',
      overflow: 'hidden',
      transform: isWinner ? 'translateY(-3px)' : 'none',
      boxShadow: isWinner
        ? '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.5)'
        : 'none',
    }}>
      {/* Top edge glow */}
      {isWinner && (
        <div style={{
          position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
        }} />
      )}

      {/* Rank badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 4, marginBottom: 10,
        background: isWinner ? C.greenBg : 'transparent',
        border: `1px solid ${isWinner ? C.greenBorder : C.border}`,
        color: isWinner ? C.green : C.t4,
      }}>
        {isWinner ? 'Bäst' : '2:a plats'}
      </div>

      {/* Name */}
      <div style={{
        fontSize: 15, fontWeight: 600, letterSpacing: -0.3, marginBottom: 2,
        color: isWinner ? C.t1 : '#aeaeb2',
      }}>{name}</div>

      {/* Hero number */}
      <div style={{
        fontSize: 64, fontWeight: 700, lineHeight: 1, letterSpacing: -3,
        marginTop: 12, marginBottom: 4,
        color: isWinner ? C.t1 : '#d0d0d0',
        textShadow: isWinner ? '0 0 30px rgba(255,255,255,0.3)' : 'none',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value > 0 ? value.toFixed(1) : '—'}
      </div>
      <div style={{ fontSize: 11, color: isWinner ? '#666' : '#444', marginBottom: 3 }}>{unit}</div>
      <div style={{ fontSize: 9, color: C.t4, letterSpacing: '0.06em', marginBottom: 12, fontFamily: 'monospace' }}>
        viktat snitt
      </div>

      {/* Diff badge */}
      <div style={{
        fontSize: 14, fontWeight: 700, marginBottom: 16, letterSpacing: -0.3,
        color: goodDiff ? C.green : C.red,
        textShadow: goodDiff && isWinner ? '0 0 20px rgba(48,209,88,0.4)' : 'none',
      }}>
        {value > 0 ? `${sign}${pctDiff.toFixed(1)}% ${goodDiff ? 'bättre' : 'sämre'}` : '—'}
      </div>

      {/* Data volume */}
      <div style={{
        paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)',
        fontSize: 10, color: C.t4,
      }}>
        {vol > 0 ? (
          <span style={{ color: vol > 5000 ? C.t3 : C.amber }}>
            {vol.toLocaleString('sv-SE')} m³ data
          </span>
        ) : '—'}
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function Jamforelse() {
  const [metric, setMetric] = useState<MetricId>('m3fub_g15h');
  const [loading, setLoading] = useState(true);
  const [ekBred, setEkBred] = useState<ClassData[]>([]);
  const [ekSmal, setEkSmal] = useState<ClassData[]>([]);
  const [wi, setWi]         = useState<ClassData[]>([]);
  // Which EK config to show in comparison (bred or smal)
  const [ekConfig, setEkConfig] = useState<'bred' | 'smal'>('bred');
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [tidRes, prodRes, dimRes, objektRes] = await Promise.all([
      supabase.from('fakt_tid')
        .select('maskin_id, objekt_id, datum, terrain_korstracka_m, processing_sek, terrain_sek, other_work_sek, bransle_liter')
        .in('maskin_id', [EK_ID, WI_ID]),
      supabase.from('fakt_produktion').select('objekt_id, volym_m3sub'),
      supabase.from('dim_objekt').select('objekt_id, vo_nummer'),
      supabase.from('objekt').select('vo_nummer, skotare_konfiguration'),
    ]);
    if (!tidRes.data || !prodRes.data) { setLoading(false); return; }

    const voToKonfig: Record<string, string> = {};
    (objektRes.data || []).forEach(r => { if (r.vo_nummer) voToKonfig[r.vo_nummer] = r.skotare_konfiguration || 'bred'; });
    const objIdToKonfig: Record<string, string> = {};
    (dimRes.data || []).forEach(r => { if (r.vo_nummer && voToKonfig[r.vo_nummer]) objIdToKonfig[r.objekt_id] = voToKonfig[r.vo_nummer]; });

    const volByObj: Record<string, number> = {};
    for (const r of prodRes.data) {
      if (r.objekt_id) volByObj[r.objekt_id] = (volByObj[r.objekt_id] || 0) + (r.volym_m3sub || 0);
    }

    type ObjAgg = { distSum: number; distCount: number; g15Sek: number; bransle: number; skift: Set<string> };
    const agg: Record<string, Record<string, ObjAgg>> = { [EK_ID]: {}, [WI_ID]: {} };
    for (const r of tidRes.data) {
      if (!r.objekt_id || r.terrain_korstracka_m == null) continue;
      const mId = r.maskin_id;
      if (!agg[mId]) continue;
      if (!agg[mId][r.objekt_id]) agg[mId][r.objekt_id] = { distSum: 0, distCount: 0, g15Sek: 0, bransle: 0, skift: new Set() };
      const o = agg[mId][r.objekt_id];
      o.distSum += r.terrain_korstracka_m;
      o.distCount++;
      o.g15Sek += (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0);
      o.bransle += (r.bransle_liter || 0);
      if (r.datum) o.skift.add(r.datum);
    }

    const newEkBred = DIST_LABELS.map(() => emptyClass());
    const newEkSmal = DIST_LABELS.map(() => emptyClass());
    const newWi     = DIST_LABELS.map(() => emptyClass());

    for (const [objId, o] of Object.entries(agg[EK_ID])) {
      if (!o.distCount || !o.g15Sek) continue;
      const vol = volByObj[objId] || 0;
      const ci = getClassIndex(o.distSum / o.distCount);
      const target = (objIdToKonfig[objId] || 'bred') === 'smal' ? newEkSmal : newEkBred;
      target[ci].volym += vol; target[ci].g15h += o.g15Sek / 3600;
      target[ci].distM += o.distSum; target[ci].bransle += o.bransle; target[ci].skift += o.skift.size;
    }
    for (const [objId, o] of Object.entries(agg[WI_ID])) {
      if (!o.distCount || !o.g15Sek) continue;
      const vol = volByObj[objId] || 0;
      const ci = getClassIndex(o.distSum / o.distCount);
      newWi[ci].volym += vol; newWi[ci].g15h += o.g15Sek / 3600;
      newWi[ci].distM += o.distSum; newWi[ci].bransle += o.bransle; newWi[ci].skift += o.skift.size;
    }

    setEkBred(newEkBred); setEkSmal(newEkSmal); setWi(newWi);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Draw bar chart
  useEffect(() => {
    if (loading || !chartRef.current) return;
    const Chart = (window as any).Chart;
    if (!Chart) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const ekData = ekConfig === 'bred' ? ekBred : ekSmal;
    const ekVals = ekData.map(d => computeMetric(d, metric));
    const wiVals = wi.map(d => computeMetric(d, metric));
    const currentMetric = METRICS.find(m => m.id === metric)!;

    chartInstance.current = new Chart(chartRef.current, {
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
              label: (c: any) => ` ${c.dataset.label}: ${c.parsed.y > 0 ? c.parsed.y.toFixed(1) : '—'} ${currentMetric.unit}`,
              afterBody: (items: any[]) => {
                if (items.length < 2) return [];
                const v1 = items[0].parsed.y, v2 = items[1].parsed.y;
                if (!v1 || !v2) return [];
                const diff = ((v1 - v2) / v2) * 100;
                const sign = diff >= 0 ? '+' : '';
                return [`Skillnad: ${sign}${diff.toFixed(1)}%`];
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

  // Computed values
  const ekData = ekConfig === 'bred' ? ekBred : ekSmal;
  const ekAvg = weightedAvg(ekData, metric);
  const wiAvg = weightedAvg(wi, metric);
  const currentMetric = METRICS.find(m => m.id === metric)!;
  const ekVol = ekData.reduce((s, d) => s + d.volym, 0);
  const wiVol = wi.reduce((s, d) => s + d.volym, 0);

  const ekWins = currentMetric.higherIsBetter ? ekAvg >= wiAvg : ekAvg <= wiAvg;
  const ekPct = wiAvg > 0 ? ((ekAvg - wiAvg) / wiAvg) * 100 : 0;
  const wiPct = -ekPct;

  if (loading) {
    return (
      <div style={{
        position: 'fixed', top: 100, left: 0, right: 0, bottom: 0,
        background: C.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: C.t3, fontFamily: ff, fontSize: 13, zIndex: 1,
      }}>
        Laddar data...
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 100, left: 0, right: 0, bottom: 0,
      overflow: 'auto', WebkitOverflowScrolling: 'touch' as const,
      background: C.bg, fontFamily: ff, color: C.t1, zIndex: 1,
    }}>
      <div style={{ padding: '20px 20px 60px', maxWidth: 900, margin: '0 auto' }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, marginBottom: 4 }}>
          Elephant King vs Wisent
        </div>
        <div style={{ fontSize: 13, color: C.t3 }}>
          Jämförelse per avståndsklass · viktat snitt
        </div>
      </div>

      {/* ── EK CONFIG SELECTOR ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: C.t3, fontWeight: 600, letterSpacing: '0.08em', }}>
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
                padding: '5px 16px', border: 'none', borderRadius: 6, fontFamily: ff,
                fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
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
        />
        <ScoreCard
          name="Wisent"
          value={wiAvg}
          unit={currentMetric.unit}
          isWinner={!ekWins}
          pctDiff={wiPct}
          vol={wiVol}
          isHigherBetter={currentMetric.higherIsBetter}
        />
      </div>

      {/* ── BAR CHART ── */}
      <div style={{
        background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
        padding: '18px 18px 14px', marginBottom: 14,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: C.t4, marginBottom: 16,
        }}>
          {currentMetric.label} per avståndsklass
        </div>
        <div style={{ height: 280, position: 'relative' }}>
          <canvas ref={chartRef} />
        </div>
      </div>

      {/* ── DETAILS TABLE ── */}
      <div style={{
        background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
        overflow: 'hidden',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: C.t4, padding: '16px 18px 12px',
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
              const diff = wiV > 0 ? ((ekV - wiV) / wiV) * 100 : 0;
              const goodDiff = currentMetric.higherIsBetter ? diff >= 0 : diff <= 0;
              const hasData = ekV > 0 || wiV > 0;

              return (
                <tr key={label} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '12px 18px', color: C.t2, fontWeight: 500 }}>
                    {label}
                    <div style={{ fontSize: 10, color: C.t4, marginTop: 2 }}>
                      {(ekData[i].skift + wi[i].skift)} skift
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {ekV > 0 ? (
                      <>
                        <span style={{ color: C.t1, fontWeight: 600 }}>{ekV.toFixed(1)}</span>
                        <span style={{ fontSize: 10, color: C.t4, marginLeft: 3 }}>{currentMetric.unit}</span>
                      </>
                    ) : <span style={{ color: C.t4 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {wiV > 0 ? (
                      <>
                        <span style={{ color: C.t1, fontWeight: 600 }}>{wiV.toFixed(1)}</span>
                        <span style={{ fontSize: 10, color: C.t4, marginLeft: 3 }}>{currentMetric.unit}</span>
                      </>
                    ) : <span style={{ color: C.t4 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                    {hasData && ekV > 0 && wiV > 0 ? (
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px', borderRadius: 4,
                        fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        background: goodDiff ? C.greenBg : C.redBg,
                        color: goodDiff ? C.green : C.red,
                      }}>
                        {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                      </span>
                    ) : <span style={{ color: C.t4 }}>—</span>}
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
