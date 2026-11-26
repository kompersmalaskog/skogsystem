'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import { AVSTAND, FARG, FONT, RADIE, TRAFFYTA, TYP, VIKT, medSafeBotten } from '@/lib/design/tokens';
import { useDjupvyHistorik } from '@/lib/hooks/useDjupvyHistorik';
import { supabase } from '@/lib/supabase';
import { tint } from './OversiktShared';

// Chart.js ur paketet — inte window.Chart: den gamla maskinvyn som laddade det globalt är borttagen.
ChartJS.register(...registerables);

interface LogEntry {
  id: string;
  maskin_id: string;
  datum: string;
  atgard: string;
  skapad_vid: string;
}

interface Maskin {
  maskin_id: string;
  namn: string; // visningsnamn, annars modell, annars id
}

interface DailyProd {
  datum: string;
  volym: number;
  g15h: number;
}

export default function MaskinLogg() {
  const [open, setOpen] = useState(false);
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [selectedMaskin, setSelectedMaskin] = useState('');
  const [logg, setLogg] = useState<LogEntry[]>([]);
  const [dailyProd, setDailyProd] = useState<DailyProd[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [formDatum, setFormDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [formAtgard, setFormAtgard] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Load machines
  useEffect(() => {
    // Ett maskinnamn i hela appen: visningsnamn före modell (samma som useMaskinvyMaskiner).
    supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell').order('visningsnamn', { nullsFirst: false }).then(({ data }) => {
      if (data) {
        setMaskiner(data.map((m: any) => ({ maskin_id: m.maskin_id, namn: (m.visningsnamn && String(m.visningsnamn).trim()) || m.modell || m.maskin_id })));
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
      supabase.rpc('maskindata_tid', { p_maskin_ids: [selectedMaskin] }),
    ]);
    if (loggRes.data) setLogg(loggRes.data);

    // Aggregate production per day
    if (tidRes.data) {
      const byDay: Record<string, { g15: number }> = {};
      for (const r of tidRes.data) {
        if (!byDay[r.datum]) byDay[r.datum] = { g15: 0 };
        // G15 = processing + terrain + other_work (validerat mot 5 tillverkarrapporter).
        byDay[r.datum].g15 += (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0);
      }
      // Also get production volumes
      const prodRes = await supabase.rpc('maskindata_produktion', { p_maskin_ids: [selectedMaskin] });
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
    const Chart = ChartJS as any;

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
            borderColor: FARG.orange,
            borderWidth: 2,
            borderDash: [AVSTAND.xs, AVSTAND.xs],
            label: {
              display: true,
              content: entry.atgard.length > 30 ? entry.atgard.slice(0, 30) + '…' : entry.atgard,
              position: 'start',
              backgroundColor: FARG.kort,
              color: FARG.orange,
              font: { size: TYP.micro.fontSize, family: FONT },
              padding: AVSTAND.xs,
              borderRadius: RADIE.stapel,
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
          backgroundColor: m3g15.map((v: number) => v === 0 ? FARG.tonad : FARG.gron),
          borderRadius: RADIE.stapel,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: FARG.kort,
            titleColor: FARG.text,
            bodyColor: FARG.text2,
            borderColor: FARG.linje,
            borderWidth: 1,
            padding: AVSTAND.m,
            callbacks: {
              label: (c: any) => ` ${c.parsed.y.toFixed(1)} m³fub/G15h`,
              afterLabel: (c: any) => {
                const d = last30[c.dataIndex];
                const entry = logg.find(l => l.datum === d.datum);
                return entry ? `\n${entry.atgard}` : '';
              }
            }
          },
          ...(hasAnnotationPlugin ? { annotation: { annotations } } : {}),
        },
        scales: {
          x: { grid: { color: FARG.tonad }, ticks: { color: FARG.text2, font: { size: TYP.micro.fontSize, family: FONT } } },
          y: { grid: { color: FARG.tonad }, ticks: { color: FARG.text2, font: { size: TYP.micro.fontSize, family: FONT } }, beginAtZero: true,
            title: { display: true, text: 'm³fub/G15h', color: FARG.text2, font: { size: TYP.micro.fontSize, family: FONT } } },
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
          ctx.strokeStyle = FARG.orange;
          ctx.lineWidth = 2;
          ctx.setLineDash([AVSTAND.xs, AVSTAND.xs]);
          ctx.beginPath();
          ctx.moveTo(x, yScale.top);
          ctx.lineTo(x, yScale.bottom);
          ctx.stroke();
          // Label
          ctx.setLineDash([]);
          ctx.fillStyle = FARG.kort;
          const txt = entry.atgard.length > 25 ? entry.atgard.slice(0, 25) + '…' : entry.atgard;
          const tw = ctx.measureText(txt).width + 8;
          ctx.fillRect(x - tw / 2, yScale.top - 18, tw, 16);
          ctx.fillStyle = FARG.orange;
          ctx.font = `${TYP.micro.fontSize}px ${FONT}`;
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
    if (!formAtgard.trim()) { setToast({ msg: 'Beskrivning krävs', kind: 'err' }); return; }
    if (!selectedMaskin) { setToast({ msg: 'Välj maskin först', kind: 'err' }); return; }
    if (!formDatum) { setToast({ msg: 'Datum krävs', kind: 'err' }); return; }
    setSaving(true);
    const { error } = await supabase.from('maskin_logg').insert({
      maskin_id: selectedMaskin,
      datum: formDatum,
      atgard: formAtgard.trim(),
    });
    setSaving(false);
    if (error) {
      setToast({ msg: 'Kunde inte spara: ' + error.message, kind: 'err' });
      return;
    }
    setFormAtgard('');
    setFormOpen(false);
    setToast({ msg: 'Åtgärd loggad', kind: 'ok' });
    loadData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('maskin_logg').delete().eq('id', id);
    if (error) { setToast({ msg: 'Kunde inte ta bort', kind: 'err' }); return; }
    setToast({ msg: 'Åtgärd borttagen', kind: 'ok' });
    loadData();
  };

  const maskinNamn = maskiner.find(m => m.maskin_id === selectedMaskin)?.namn || '';

  // Maskinloggen är ett steg i historiken: backa stänger den i stället för att lämna vyn.
  useDjupvyHistorik(open, () => setOpen(false));

  // Öppnas utifrån via window.__openMaskinLogg (ingen ingång finns i vyn i dag; kommer som djupvy från Översikt)
  useEffect(() => {
    (window as any).__openMaskinLogg = () => setOpen(true);
    return () => { delete (window as any).__openMaskinLogg; };
  }, []);

  if (!open && !toast) {
    return null;
  }

  const falt = {
    width: '100%', padding: `${AVSTAND.m}px ${AVSTAND.m}px`, borderRadius: RADIE.rad,
    background: FARG.upphojt, border: `1px solid ${FARG.linje}`,
    color: FARG.text, ...TYP.meta, fontFamily: 'inherit', outline: 'none',
  } as const;
  const gronKnapp = {
    minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.rad,
    background: tint(FARG.gron, 16), border: `1px solid ${tint(FARG.gron, 20)}`,
    color: FARG.gron, fontFamily: 'inherit', ...TYP.listtitel, cursor: 'pointer',
  } as const;
  const kort = { background: FARG.kort, borderRadius: RADIE.kort, border: `1px solid ${FARG.linje}` } as const;
  const sektionsrubrik = { ...TYP.meta, fontWeight: VIKT.halvfet, color: FARG.text2 } as const;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: open ? 'flex' : 'block', flexDirection: 'column',
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* Toast — synligt även när panelen stängs */}
      {toast && (
        <div style={{
          position: 'fixed', left: '50%', bottom: AVSTAND.xl, transform: 'translateX(-50%)',
          background: tint(toast.kind === 'ok' ? FARG.gron : FARG.rod, 16),
          border: `1px solid ${tint(toast.kind === 'ok' ? FARG.gron : FARG.rod, 38)}`,
          color: toast.kind === 'ok' ? FARG.gron : FARG.rod,
          padding: `${AVSTAND.m}px ${AVSTAND.xl}px`, borderRadius: RADIE.kort, ...TYP.text, fontFamily: FONT,
          backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          zIndex: 1100, maxWidth: `calc(100vw - ${2 * AVSTAND.l}px)`, pointerEvents: 'auto',
        }}>{toast.msg}</div>
      )}

      {!open && null}
      {open && (<>
      {/* Backdrop */}
      <div onClick={() => setOpen(false)} style={{
        position: 'absolute', inset: 0, background: tint(FARG.bg, 60),
      }} />

      {/* Panel */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        maxHeight: '85vh', background: FARG.bg, borderTop: `1px solid ${FARG.linje}`,
        borderRadius: `${RADIE.kort}px ${RADIE.kort}px 0 0`, overflow: 'auto',
        fontFamily: FONT, color: FARG.text,
      }}>
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: tint(FARG.bg, 95), backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${FARG.linje}`, padding: `${AVSTAND.s}px ${AVSTAND.l}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
            <span style={TYP.listtitel}>Maskinlogg</span>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Stäng" style={{
            background: 'none', border: 'none', color: FARG.text2, ...TYP.rubrik, cursor: 'pointer',
            width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: RADIE.rad,
          }}>✕</button>
        </div>

        <div style={{ padding: `${AVSTAND.l}px ${AVSTAND.l}px`, paddingBottom: medSafeBotten(AVSTAND.l) }}>
          {/* Machine selector */}
          <div style={{ marginBottom: AVSTAND.l }}>
            <select
              value={selectedMaskin}
              onChange={e => setSelectedMaskin(e.target.value)}
              style={{
                ...falt,
                appearance: 'none' as const, WebkitAppearance: 'none' as const,
              }}
            >
              {maskiner.map(m => (
                <option key={m.maskin_id} value={m.maskin_id} style={{ background: FARG.bg }}>
                  {m.namn} ({m.maskin_id})
                </option>
              ))}
            </select>
          </div>

          {/* Production chart with log annotations */}
          <div style={{ ...kort, padding: AVSTAND.l, marginBottom: AVSTAND.l }}>
            <div style={{ ...sektionsrubrik, marginBottom: AVSTAND.m }}>
              Produktion & åtgärder – {maskinNamn}
            </div>
            <div style={{ height: AVSTAND.xxl * 6, position: 'relative' }}>
              {dailyProd.length > 0 ? (
                <canvas ref={chartRef} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: FARG.text2, ...TYP.meta }}>
                  Ingen produktionsdata
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: AVSTAND.l, marginTop: AVSTAND.m, ...TYP.meta, color: FARG.text2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
                <div style={{ width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.stapel, background: FARG.gron }} />
                m³fub/G15h
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
                <div style={{ width: AVSTAND.l, height: AVSTAND.xs, background: FARG.orange, borderRadius: RADIE.stapel }} />
                Loggad åtgärd
              </div>
            </div>
          </div>

          {/* Add action button */}
          {!formOpen ? (
            <button
              onClick={() => setFormOpen(true)}
              style={{ ...gronKnapp, width: '100%', marginBottom: AVSTAND.l }}
            >
              + Logga åtgärd
            </button>
          ) : (
            <div style={{ ...kort, padding: AVSTAND.l, marginBottom: AVSTAND.l }}>
              <div style={{ ...sektionsrubrik, marginBottom: AVSTAND.m }}>
                Ny åtgärd
              </div>
              <input
                type="date"
                value={formDatum}
                onChange={e => setFormDatum(e.target.value)}
                style={{ ...falt, marginBottom: AVSTAND.m, colorScheme: 'dark' }}
              />
              <input
                type="text"
                placeholder="T.ex. Bytte matarhjul, Justerade aggregat..."
                value={formAtgard}
                onChange={e => setFormAtgard(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                autoFocus
                style={{ ...falt, marginBottom: AVSTAND.m }}
              />
              <div style={{ display: 'flex', gap: AVSTAND.s }}>
                <button
                  onClick={handleSave}
                  disabled={saving || !formAtgard.trim()}
                  style={{
                    ...gronKnapp, flex: 1,
                    cursor: saving ? 'wait' : 'pointer',
                    opacity: !formAtgard.trim() ? 0.4 : 1,
                  }}
                >
                  {saving ? 'Sparar...' : 'Spara'}
                </button>
                <button
                  onClick={() => { setFormOpen(false); setFormAtgard(''); }}
                  style={{
                    minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.xl}px`, borderRadius: RADIE.rad,
                    background: 'transparent', border: `1px solid ${FARG.linje}`,
                    color: FARG.text2, fontFamily: 'inherit', ...TYP.text, cursor: 'pointer',
                  }}
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}

          {/* Log list */}
          <div style={{ ...sektionsrubrik, marginBottom: AVSTAND.m }}>
            Loggade åtgärder ({logg.length})
          </div>
          {logg.length === 0 ? (
            <div style={{
              ...kort, padding: `${AVSTAND.xl}px ${AVSTAND.l}px`, textAlign: 'center' as const, color: FARG.text2, ...TYP.meta,
            }}>
              Inga åtgärder loggade för denna maskin
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: AVSTAND.xs }}>
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
                    ...kort, padding: AVSTAND.m, display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m,
                  }}>
                    <div style={{
                      width: AVSTAND.xs, height: AVSTAND.xl + AVSTAND.m, borderRadius: RADIE.stapel, flexShrink: 0, marginTop: AVSTAND.xs,
                      background: FARG.orange,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...TYP.meta, fontWeight: VIKT.halvfet, color: FARG.text, marginBottom: AVSTAND.xs }}>
                        {entry.atgard}
                      </div>
                      <div style={{ ...TYP.meta, color: FARG.text2 }}>
                        {entry.datum}
                        {delta !== null && (
                          <span style={{
                            marginLeft: AVSTAND.m,
                            color: delta >= 0 ? FARG.gron : FARG.rod,
                            fontWeight: VIKT.halvfet,
                          }}>
                            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)} m³fub/G15h
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      style={{
                        background: 'none', border: 'none', color: FARG.text3, ...TYP.meta,
                        cursor: 'pointer', minWidth: TRAFFYTA.min, minHeight: TRAFFYTA.min, borderRadius: RADIE.rad,
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
      </>)}
    </div>
  );
}
