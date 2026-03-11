'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface LogEntry {
  id: string;
  maskin_id: string;
  datum: string;
  atgard: string;
  skapad_vid: string;
}

interface Maskin {
  maskin_id: string;
  modell: string;
}

interface DailyProd {
  datum: string;
  volym: number;
  g15h: number;
}

const ff = "'Geist', system-ui, sans-serif";
const C = {
  bg: '#111110', surface: '#1a1a18', surface2: '#222220',
  border: 'rgba(255,255,255,0.07)', border2: 'rgba(255,255,255,0.12)',
  t1: '#e8e8e4', t3: '#7a7a72', t4: '#3a3a36',
  accent: '#5aff8c', accent2: '#1a4a2e', blue: '#5b8fff', warn: '#ffb340',
};

export default function MaskinLogg({ mode }: { mode: 'skordare' | 'skotare' }) {
  const [open, setOpen] = useState(false);
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [selectedMaskin, setSelectedMaskin] = useState('');
  const [logg, setLogg] = useState<LogEntry[]>([]);
  const [dailyProd, setDailyProd] = useState<DailyProd[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [formDatum, setFormDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [formAtgard, setFormAtgard] = useState('');
  const [saving, setSaving] = useState(false);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  // Load machines
  useEffect(() => {
    supabase.from('dim_maskin').select('maskin_id, modell').order('modell').then(({ data }) => {
      if (data) {
        setMaskiner(data);
        if (data.length > 0 && !selectedMaskin) {
          setSelectedMaskin(data[0].maskin_id);
        }
      }
    });
  }, []);

  // Load logg + production when machine changes
  const loadData = useCallback(async () => {
    if (!selectedMaskin) return;
    const [loggRes, tidRes] = await Promise.all([
      supabase.from('maskin_logg').select('*').eq('maskin_id', selectedMaskin).order('datum', { ascending: false }),
      supabase.from('fakt_tid').select('datum, processing_sek, terrain_sek, other_work_sek')
        .eq('maskin_id', selectedMaskin).order('datum'),
    ]);
    if (loggRes.data) setLogg(loggRes.data);

    // Aggregate production per day
    if (tidRes.data) {
      const byDay: Record<string, { g15: number }> = {};
      for (const r of tidRes.data) {
        if (!byDay[r.datum]) byDay[r.datum] = { g15: 0 };
        byDay[r.datum].g15 += (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0);
      }
      // Also get production volumes
      const prodRes = await supabase.from('fakt_produktion').select('datum, volym_m3sub')
        .eq('maskin_id', selectedMaskin).order('datum');
      if (prodRes.data) {
        for (const r of prodRes.data) {
          if (!byDay[r.datum]) byDay[r.datum] = { g15: 0 };
        }
        const volByDay: Record<string, number> = {};
        for (const r of prodRes.data) {
          volByDay[r.datum] = (volByDay[r.datum] || 0) + (r.volym_m3sub || 0);
        }
        const days = Object.keys(byDay).sort();
        setDailyProd(days.map(d => ({
          datum: d,
          volym: volByDay[d] || 0,
          g15h: byDay[d].g15 / 3600,
        })));
      }
    }
  }, [selectedMaskin]);

  useEffect(() => { loadData(); }, [loadData]);

  // Draw chart
  useEffect(() => {
    if (!open || !chartRef.current || dailyProd.length === 0) return;
    const Chart = (window as any).Chart;
    if (!Chart) return;

    if (chartInstance.current) chartInstance.current.destroy();

    const last30 = dailyProd.slice(-30);
    const labels = last30.map(d => d.datum.slice(5));
    const m3g15 = last30.map(d => d.g15h > 0 ? d.volym / d.g15h : 0);

    // Find log entries that fall within the date range
    const dateSet = new Set(last30.map(d => d.datum));
    const annotations: Record<string, any> = {};
    logg.forEach((entry, i) => {
      if (dateSet.has(entry.datum)) {
        const idx = last30.findIndex(d => d.datum === entry.datum);
        if (idx >= 0) {
          annotations['line' + i] = {
            type: 'line',
            xMin: idx, xMax: idx,
            borderColor: 'rgba(255,179,64,0.7)',
            borderWidth: 2,
            borderDash: [4, 3],
            label: {
              display: true,
              content: entry.atgard.length > 30 ? entry.atgard.slice(0, 30) + '…' : entry.atgard,
              position: 'start',
              backgroundColor: 'rgba(26,26,24,0.95)',
              color: C.warn,
              font: { size: 10, family: ff },
              padding: 4,
              borderRadius: 4,
            }
          };
        }
      }
    });

    const hasAnnotationPlugin = Chart.registry?.plugins?.get('annotation');

    chartInstance.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'm³fub/G15h',
          data: m3g15,
          backgroundColor: m3g15.map((v: number) => v === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(90,255,140,0.5)'),
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: C.surface,
            titleColor: C.t1,
            bodyColor: C.t3,
            borderColor: C.border2,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (c: any) => ` ${c.parsed.y.toFixed(1)} m³fub/G15h`,
              afterLabel: (c: any) => {
                const d = last30[c.dataIndex];
                const entry = logg.find(l => l.datum === d.datum);
                return entry ? `\n⚡ ${entry.atgard}` : '';
              }
            }
          },
          ...(hasAnnotationPlugin ? { annotation: { annotations } } : {}),
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: C.t3, font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: C.t3, font: { size: 10 } }, beginAtZero: true,
            title: { display: true, text: 'm³fub/G15h', color: C.t3, font: { size: 10 } } },
        },
      },
    });

    // Draw annotation lines manually if plugin not available
    if (!hasAnnotationPlugin && logg.length > 0) {
      const origDraw = chartInstance.current.draw.bind(chartInstance.current);
      chartInstance.current.draw = function() {
        origDraw();
        const ctx = chartInstance.current.ctx;
        const xScale = chartInstance.current.scales.x;
        const yScale = chartInstance.current.scales.y;
        logg.forEach(entry => {
          const idx = last30.findIndex(d => d.datum === entry.datum);
          if (idx < 0) return;
          const x = xScale.getPixelForValue(idx);
          ctx.save();
          ctx.strokeStyle = 'rgba(255,179,64,0.7)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(x, yScale.top);
          ctx.lineTo(x, yScale.bottom);
          ctx.stroke();
          // Label
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(26,26,24,0.95)';
          const txt = entry.atgard.length > 25 ? entry.atgard.slice(0, 25) + '…' : entry.atgard;
          const tw = ctx.measureText(txt).width + 8;
          ctx.fillRect(x - tw / 2, yScale.top - 18, tw, 16);
          ctx.fillStyle = C.warn;
          ctx.font = `10px ${ff}`;
          ctx.textAlign = 'center';
          ctx.fillText(txt, x, yScale.top - 6);
          ctx.restore();
        });
      };
      chartInstance.current.draw();
    }

    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [open, dailyProd, logg]);

  const handleSave = async () => {
    if (!formAtgard.trim() || !selectedMaskin) return;
    setSaving(true);
    await supabase.from('maskin_logg').insert({
      maskin_id: selectedMaskin,
      datum: formDatum,
      atgard: formAtgard.trim(),
    });
    setFormAtgard('');
    setFormOpen(false);
    setSaving(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('maskin_logg').delete().eq('id', id);
    loadData();
  };

  const maskinNamn = maskiner.find(m => m.maskin_id === selectedMaskin)?.modell || '';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 80, right: 20, zIndex: 70,
          padding: '10px 18px', border: `1px solid ${C.border2}`, borderRadius: 12,
          background: 'rgba(17,17,16,0.95)', backdropFilter: 'blur(20px)',
          color: C.t1, fontFamily: ff, fontSize: 13, fontWeight: 500,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
      >
        <span style={{ fontSize: 16 }}>🔧</span> Maskinlogg
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Backdrop */}
      <div onClick={() => setOpen(false)} style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
      }} />

      {/* Panel */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        maxHeight: '85vh', background: C.bg, borderTop: `1px solid ${C.border2}`,
        borderRadius: '16px 16px 0 0', overflow: 'auto',
        fontFamily: ff, color: C.t1,
      }}>
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(17,17,16,0.95)', backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${C.border}`, padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>🔧</span>
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.3 }}>Maskinlogg</span>
          </div>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: C.t3, fontSize: 20, cursor: 'pointer',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8,
          }}>✕</button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* Machine selector */}
          <div style={{ marginBottom: 16 }}>
            <select
              value={selectedMaskin}
              onChange={e => setSelectedMaskin(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                background: C.surface2, border: `1px solid ${C.border2}`,
                color: C.t1, fontSize: 14, fontFamily: ff, outline: 'none',
                appearance: 'none' as const, WebkitAppearance: 'none' as const,
              }}
            >
              {maskiner.map(m => (
                <option key={m.maskin_id} value={m.maskin_id} style={{ background: C.bg }}>
                  {m.modell} ({m.maskin_id})
                </option>
              ))}
            </select>
          </div>

          {/* Production chart with log annotations */}
          <div style={{
            background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
            padding: 16, marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: C.t3, marginBottom: 12 }}>
              Produktion & åtgärder – {maskinNamn}
            </div>
            <div style={{ height: 200, position: 'relative' }}>
              {dailyProd.length > 0 ? (
                <canvas ref={chartRef} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.t3, fontSize: 13 }}>
                  Ingen produktionsdata
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 10, color: C.t3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(90,255,140,0.5)' }} />
                m³fub/G15h
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 16, height: 2, background: C.warn, borderRadius: 1 }} />
                Loggad åtgärd
              </div>
            </div>
          </div>

          {/* Add action button */}
          {!formOpen ? (
            <button
              onClick={() => setFormOpen(true)}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 10,
                background: C.accent2, border: `1px solid rgba(90,255,140,0.2)`,
                color: C.accent, fontFamily: ff, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', marginBottom: 16, letterSpacing: -0.2,
              }}
            >
              + Logga åtgärd
            </button>
          ) : (
            <div style={{
              background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: C.t3, marginBottom: 12 }}>
                Ny åtgärd
              </div>
              <input
                type="date"
                value={formDatum}
                onChange={e => setFormDatum(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 10,
                  background: C.surface2, border: `1px solid ${C.border2}`,
                  color: C.t1, fontSize: 14, fontFamily: ff, outline: 'none',
                  colorScheme: 'dark',
                }}
              />
              <input
                type="text"
                placeholder="T.ex. Bytte matarhjul, Justerade aggregat..."
                value={formAtgard}
                onChange={e => setFormAtgard(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                autoFocus
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                  background: C.surface2, border: `1px solid ${C.border2}`,
                  color: C.t1, fontSize: 14, fontFamily: ff, outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleSave}
                  disabled={saving || !formAtgard.trim()}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10,
                    background: C.accent2, border: `1px solid rgba(90,255,140,0.2)`,
                    color: C.accent, fontFamily: ff, fontSize: 13, fontWeight: 600,
                    cursor: saving ? 'wait' : 'pointer',
                    opacity: !formAtgard.trim() ? 0.4 : 1,
                  }}
                >
                  {saving ? 'Sparar...' : 'Spara'}
                </button>
                <button
                  onClick={() => { setFormOpen(false); setFormAtgard(''); }}
                  style={{
                    padding: '10px 18px', borderRadius: 10,
                    background: 'transparent', border: `1px solid ${C.border2}`,
                    color: C.t3, fontFamily: ff, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}

          {/* Log list */}
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: C.t3, marginBottom: 10 }}>
            Loggade åtgärder ({logg.length})
          </div>
          {logg.length === 0 ? (
            <div style={{
              background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
              padding: '24px 16px', textAlign: 'center' as const, color: C.t3, fontSize: 13,
            }}>
              Inga åtgärder loggade för denna maskin
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 1 }}>
              {logg.map((entry) => {
                // Find production before and after
                const idx = dailyProd.findIndex(d => d.datum >= entry.datum);
                const before = idx > 0 ? dailyProd.slice(Math.max(0, idx - 5), idx) : [];
                const after = idx >= 0 ? dailyProd.slice(idx, idx + 5) : [];
                const avgBefore = before.length > 0 ? before.reduce((s, d) => s + (d.g15h > 0 ? d.volym / d.g15h : 0), 0) / before.length : null;
                const avgAfter = after.length > 0 ? after.reduce((s, d) => s + (d.g15h > 0 ? d.volym / d.g15h : 0), 0) / after.length : null;
                const delta = avgBefore !== null && avgAfter !== null ? avgAfter - avgBefore : null;

                return (
                  <div key={entry.id} style={{
                    background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
                    padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12,
                  }}>
                    <div style={{
                      width: 4, height: 36, borderRadius: 2, flexShrink: 0, marginTop: 2,
                      background: C.warn,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.t1, marginBottom: 2 }}>
                        {entry.atgard}
                      </div>
                      <div style={{ fontSize: 11, color: C.t3 }}>
                        {entry.datum}
                        {delta !== null && (
                          <span style={{
                            marginLeft: 10,
                            color: delta >= 0 ? C.accent : '#ff5f57',
                            fontWeight: 600,
                          }}>
                            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)} m³fub/G15h
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      style={{
                        background: 'none', border: 'none', color: C.t4, fontSize: 14,
                        cursor: 'pointer', padding: '4px 6px', borderRadius: 6,
                        flexShrink: 0,
                      }}
                      title="Ta bort"
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
