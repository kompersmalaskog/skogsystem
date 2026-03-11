'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EK_ID = 'A110148';
const WI_ID = 'A030353';

const DIST_LABELS = ['0–100', '100–200', '200–300', '300–400', '400+'];
const DIST_EDGES = [0, 100, 200, 300, 400, Infinity];

type MetricId = 'm3fub_g15h' | 'm3fub_100m' | 'lass_g15h' | 'bransle_m3';
const METRICS: { id: MetricId; label: string; unit: string }[] = [
  { id: 'm3fub_g15h', label: 'm³fub/G15h', unit: 'm³fub/G15h' },
  { id: 'm3fub_100m', label: 'm³fub / 100m', unit: 'm³fub/100m' },
  { id: 'lass_g15h', label: 'Lass/G15h', unit: 'lass/G15h' },
  { id: 'bransle_m3', label: 'Bränsle/m³', unit: 'l/m³' },
];

const ff = "'Geist', system-ui, sans-serif";
const C = {
  bg: '#111110', surface: '#1a1a18', surface2: '#222220',
  border: 'rgba(255,255,255,0.07)', border2: 'rgba(255,255,255,0.12)',
  t1: '#e8e8e4', t3: '#7a7a72', t4: '#3a3a36',
  accent: '#5aff8c', accent2: '#1a4a2e', blue: '#5b8fff', warn: '#ffb340',
};

// Colors per series
const EK_BRED = 'rgba(30,80,180,0.7)';    // dark blue
const EK_SMAL = 'rgba(255,160,50,0.7)';   // orange
const WI_COLOR = 'rgba(90,255,140,0.5)';   // green

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

export default function Jamforelse() {
  const [metric, setMetric] = useState<MetricId>('m3fub_g15h');
  const [loading, setLoading] = useState(true);
  const [ekBred, setEkBred] = useState<ClassData[]>([]);
  const [ekSmal, setEkSmal] = useState<ClassData[]>([]);
  const [wi, setWi] = useState<ClassData[]>([]);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    // Fetch all data in parallel
    const [tidRes, prodRes, dimRes, objektRes] = await Promise.all([
      supabase.from('fakt_tid')
        .select('maskin_id, objekt_id, datum, terrain_korstracka_m, processing_sek, terrain_sek, other_work_sek, bransle_liter')
        .in('maskin_id', [EK_ID, WI_ID]),
      supabase.from('fakt_produktion')
        .select('objekt_id, volym_m3sub'),
      supabase.from('dim_objekt')
        .select('objekt_id, vo_nummer'),
      supabase.from('objekt')
        .select('vo_nummer, skotare_konfiguration'),
    ]);

    if (!tidRes.data || !prodRes.data) { setLoading(false); return; }

    // Build konfiguration map: dim_objekt.objekt_id → bred/smal
    const voToKonfig: Record<string, string> = {};
    if (objektRes.data) {
      for (const r of objektRes.data) {
        if (r.vo_nummer) voToKonfig[r.vo_nummer] = r.skotare_konfiguration || 'bred';
      }
    }
    const objIdToKonfig: Record<string, string> = {};
    if (dimRes.data) {
      for (const r of dimRes.data) {
        if (r.vo_nummer && voToKonfig[r.vo_nummer] !== undefined) {
          objIdToKonfig[r.objekt_id] = voToKonfig[r.vo_nummer];
        }
      }
    }

    // Aggregate production volume per objekt_id
    const volByObj: Record<string, number> = {};
    for (const r of prodRes.data) {
      if (!r.objekt_id) continue;
      volByObj[r.objekt_id] = (volByObj[r.objekt_id] || 0) + (r.volym_m3sub || 0);
    }

    // Aggregate fakt_tid per (maskin_id, objekt_id): avg distance, total G15, total fuel, shift count
    type ObjAgg = { distSum: number; distCount: number; g15Sek: number; bransle: number; skift: Set<string> };
    const agg: Record<string, Record<string, ObjAgg>> = { [EK_ID]: {}, [WI_ID]: {} };

    for (const r of tidRes.data) {
      if (!r.objekt_id || r.terrain_korstracka_m == null) continue;
      const mId = r.maskin_id;
      if (!agg[mId]) continue;
      if (!agg[mId][r.objekt_id]) {
        agg[mId][r.objekt_id] = { distSum: 0, distCount: 0, g15Sek: 0, bransle: 0, skift: new Set() };
      }
      const o = agg[mId][r.objekt_id];
      o.distSum += r.terrain_korstracka_m;
      o.distCount += 1;
      o.g15Sek += (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0);
      o.bransle += (r.bransle_liter || 0);
      if (r.datum) o.skift.add(r.datum);
    }

    // Build class data for each series
    const newEkBred = DIST_LABELS.map(() => emptyClass());
    const newEkSmal = DIST_LABELS.map(() => emptyClass());
    const newWi = DIST_LABELS.map(() => emptyClass());

    // Process Elephant King
    for (const [objId, o] of Object.entries(agg[EK_ID])) {
      if (o.distCount === 0 || o.g15Sek === 0) continue;
      const vol = volByObj[objId] || 0;
      const avgDist = o.distSum / o.distCount;
      const ci = getClassIndex(avgDist);
      const konfig = objIdToKonfig[objId] || 'bred';
      const target = konfig === 'smal' ? newEkSmal : newEkBred;
      target[ci].volym += vol;
      target[ci].g15h += o.g15Sek / 3600;
      target[ci].distM += o.distSum;
      target[ci].bransle += o.bransle;
      target[ci].skift += o.skift.size;
    }

    // Process Wisent
    for (const [objId, o] of Object.entries(agg[WI_ID])) {
      if (o.distCount === 0 || o.g15Sek === 0) continue;
      const vol = volByObj[objId] || 0;
      const avgDist = o.distSum / o.distCount;
      const ci = getClassIndex(avgDist);
      newWi[ci].volym += vol;
      newWi[ci].g15h += o.g15Sek / 3600;
      newWi[ci].distM += o.distSum;
      newWi[ci].bransle += o.bransle;
      newWi[ci].skift += o.skift.size;
    }

    setEkBred(newEkBred);
    setEkSmal(newEkSmal);
    setWi(newWi);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Compute metric values
  const computeValues = useCallback((data: ClassData[]): number[] => {
    return data.map(d => {
      switch (metric) {
        case 'm3fub_g15h':
          return d.g15h > 0 ? d.volym / d.g15h : 0;
        case 'm3fub_100m':
          return d.distM > 0 ? d.volym / (d.distM / 100) : 0;
        case 'lass_g15h': {
          const lass = d.volym / 7.5; // estimated avg load ~7.5 m³
          return d.g15h > 0 ? lass / d.g15h : 0;
        }
        case 'bransle_m3':
          return d.volym > 0 ? d.bransle / d.volym : 0;
        default: return 0;
      }
    });
  }, [metric]);

  // Draw chart
  useEffect(() => {
    if (loading || !chartRef.current) return;
    const Chart = (window as any).Chart;
    if (!Chart) return;

    if (chartInstance.current) chartInstance.current.destroy();

    const ekBredVals = computeValues(ekBred);
    const ekSmalVals = computeValues(ekSmal);
    const wiVals = computeValues(wi);

    const currentMetric = METRICS.find(m => m.id === metric)!;

    chartInstance.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: DIST_LABELS,
        datasets: [
          {
            label: 'Elephant King – bred',
            data: ekBredVals,
            backgroundColor: EK_BRED,
            borderRadius: 4,
          },
          {
            label: 'Elephant King – smal',
            data: ekSmalVals,
            backgroundColor: EK_SMAL,
            borderRadius: 4,
          },
          {
            label: 'Wisent',
            data: wiVals,
            backgroundColor: WI_COLOR,
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
              boxWidth: 10, borderRadius: 2, padding: 14, color: C.t3,
            },
          },
          tooltip: {
            backgroundColor: C.surface,
            titleColor: C.t1,
            bodyColor: C.t3,
            borderColor: C.border2,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (c: any) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)} ${currentMetric.unit}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: C.t3, font: { size: 11 } },
            title: { display: true, text: 'Medelköravstånd (m)', color: C.t3, font: { size: 10 } },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: C.t3, font: { size: 11 } },
            beginAtZero: true,
            title: { display: true, text: currentMetric.unit, color: C.t3, font: { size: 10 } },
          },
        },
      },
      plugins: [{
        id: 'shiftLabels',
        afterDraw: (chart: any) => {
          const ctx = chart.ctx;
          const xScale = chart.scales.x;
          const yScale = chart.scales.y;
          ctx.save();
          ctx.font = `9px ${ff}`;
          ctx.fillStyle = C.t4;
          ctx.textAlign = 'center';

          DIST_LABELS.forEach((_: string, i: number) => {
            const x = xScale.getPixelForValue(i);
            const y = yScale.bottom + 28;
            const counts = [ekBred[i].skift, ekSmal[i].skift, wi[i].skift];
            const total = counts.reduce((a, b) => a + b, 0);
            if (total > 0) {
              ctx.fillText(`${total} skift`, x, y);
            }
          });
          ctx.restore();
        },
      }],
    });

    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [loading, metric, ekBred, ekSmal, wi, computeValues]);

  return (
    <div style={{
      position: 'fixed', top: 100, left: 0, right: 0, bottom: 0,
      overflow: 'auto', WebkitOverflowScrolling: 'touch',
      background: C.bg, fontFamily: ff, color: C.t1, zIndex: 1,
    }}>
      <div style={{ padding: '24px 20px 40px', maxWidth: 900, margin: '0 auto' }}>
        {/* Title */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, marginBottom: 4 }}>
            Elephant King vs Wisent
          </div>
          <div style={{ fontSize: 13, color: C.t3 }}>
            Jämförelse per avståndsklass baserat på terrain_korstracka_m
          </div>
        </div>

        {/* Metric tabs */}
        <div style={{
          display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)',
          borderRadius: 8, padding: 3, marginBottom: 20,
        }}>
          {METRICS.map(m => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              style={{
                flex: 1, padding: '7px 8px', border: 'none',
                background: metric === m.id ? C.surface2 : 'transparent',
                borderRadius: 6, fontFamily: ff, fontSize: 12, fontWeight: 500,
                color: metric === m.id ? C.t1 : C.t3,
                cursor: 'pointer', transition: 'all 0.15s',
                letterSpacing: -0.2,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: C.t3 }}>
            Laddar data...
          </div>
        ) : (
          <>
            {/* Chart */}
            <div style={{
              background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ height: 320, position: 'relative' }}>
                <canvas ref={chartRef} />
              </div>
            </div>

            {/* Data table */}
            <div style={{
              background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
              padding: 16,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: 0.8, color: C.t3, marginBottom: 12,
              }}>
                Detaljer per avståndsklass
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: C.t3, fontWeight: 500 }}>Klass</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', color: C.t3, fontWeight: 500 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: EK_BRED, marginRight: 4, verticalAlign: 'middle' }} />
                        EK bred
                      </th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', color: C.t3, fontWeight: 500 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: EK_SMAL, marginRight: 4, verticalAlign: 'middle' }} />
                        EK smal
                      </th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', color: C.t3, fontWeight: 500 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: WI_COLOR, marginRight: 4, verticalAlign: 'middle' }} />
                        Wisent
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {DIST_LABELS.map((label, i) => {
                      const ekBredVal = computeValues(ekBred)[i];
                      const ekSmalVal = computeValues(ekSmal)[i];
                      const wiVal = computeValues(wi)[i];
                      const currentUnit = METRICS.find(m => m.id === metric)!.unit;
                      const totalSkift = ekBred[i].skift + ekSmal[i].skift + wi[i].skift;
                      return (
                        <tr key={label} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: '10px 10px', color: C.t1, fontWeight: 500 }}>
                            {label} m
                            <div style={{ fontSize: 10, color: C.t4, marginTop: 1 }}>{totalSkift} skift</div>
                          </td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ekBredVal > 0 ? C.t1 : C.t4 }}>
                            {ekBredVal > 0 ? ekBredVal.toFixed(1) : '–'}
                            {ekBredVal > 0 && <span style={{ fontSize: 10, color: C.t3, marginLeft: 3 }}>{currentUnit}</span>}
                            {ekBred[i].skift > 0 && <div style={{ fontSize: 10, color: C.t4 }}>{ekBred[i].skift} skift</div>}
                          </td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ekSmalVal > 0 ? C.t1 : C.t4 }}>
                            {ekSmalVal > 0 ? ekSmalVal.toFixed(1) : '–'}
                            {ekSmalVal > 0 && <span style={{ fontSize: 10, color: C.t3, marginLeft: 3 }}>{currentUnit}</span>}
                            {ekSmal[i].skift > 0 && <div style={{ fontSize: 10, color: C.t4 }}>{ekSmal[i].skift} skift</div>}
                          </td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: wiVal > 0 ? C.t1 : C.t4 }}>
                            {wiVal > 0 ? wiVal.toFixed(1) : '–'}
                            {wiVal > 0 && <span style={{ fontSize: 10, color: C.t3, marginLeft: 3 }}>{currentUnit}</span>}
                            {wi[i].skift > 0 && <div style={{ fontSize: 10, color: C.t4 }}>{wi[i].skift} skift</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
