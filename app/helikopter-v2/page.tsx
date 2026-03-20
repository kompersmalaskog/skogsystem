'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

// ============================================================
// Types
// ============================================================

interface ObjektRow {
  objekt_id: string
  object_name: string | null
  vo_nummer: string | null
  bolag: string | null
  huvudtyp: string | null
  inkopare: string | null
  skogsagare: string | null
  skordat_m3: number
  skotat_m3: number
  oskotat_m3: number
  skordare_klar: string | null
  skotare_start: string | null
  dagar_vantar: number | null
}

interface Bestallning {
  id: string
  ar: number
  manad: number
  bolag: string
  typ: 'slutavverkning' | 'gallring'
  volym: number
}

type TypFilter = 'alla' | 'slutavverkning' | 'gallring'

// ============================================================
// Constants & Design tokens (matching uppfoljning)
// ============================================================

const bg = '#000'
const text = '#fff'
const muted = 'rgba(255,255,255,0.4)'
const divider = 'rgba(255,255,255,0.08)'
const ff = 'system-ui, sans-serif'

// Card style matching UppfoljningVy card3d
const card: React.CSSProperties = {
  background: 'linear-gradient(160deg, #1a1a1c 0%, #0f0f10 100%)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderTopColor: 'rgba(255,255,255,0.18)',
  borderRadius: 16,
  padding: '1.25rem',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.7)',
  position: 'relative',
  overflow: 'hidden',
}

const SUPABASE_URL = 'https://mxydghzfacbenbgpodex.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWRnaHpmYWNiZW5iZ3BvZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NzU2MjMsImV4cCI6MjA4NDQ1MTYyM30.NRBG5HcAtEXRTyf4YTp71A3iATk6U3DGhfdJ5EYlMyo'
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }

const MANAD = ['', 'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

// ============================================================
// Helpers
// ============================================================

function normalizeBolag(b: string | null): string {
  if (!b || b.trim() === '') return 'Okant'
  const lower = b.trim().toLowerCase()
  if (lower === 'vida') return 'Vida'
  if (lower === 'ata') return 'ATA'
  return b.trim()
}

function arbetsdagarKvar(ar: number, manad: number): number {
  const idag = new Date()
  const sistaDag = new Date(ar, manad, 0).getDate()
  if (ar < idag.getFullYear() || (ar === idag.getFullYear() && manad < idag.getMonth() + 1)) return 0
  const start = (ar === idag.getFullYear() && manad === idag.getMonth() + 1) ? idag.getDate() + 1 : 1
  let count = 0
  for (let d = start; d <= sistaDag; d++) {
    const day = new Date(ar, manad - 1, d).getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

function dagarSedan(datum: string | null): number {
  if (!datum) return 0
  const d = new Date(datum)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function statusColor(dagar: number): string {
  if (dagar > 3) return '#ef4444'
  if (dagar >= 1) return '#f59e0b'
  return '#22c55e'
}

function procentColor(p: number): string {
  if (p >= 90) return '#22c55e'
  if (p >= 60) return '#f59e0b'
  return '#ef4444'
}

function daysInMonth(ar: number, manad: number): { date: Date; label: string; isWeekend: boolean }[] {
  const days: { date: Date; label: string; isWeekend: boolean }[] = []
  const last = new Date(ar, manad, 0).getDate()
  for (let d = 1; d <= last; d++) {
    const dt = new Date(ar, manad - 1, d)
    const dow = dt.getDay()
    days.push({ date: dt, label: `${d}`, isWeekend: dow === 0 || dow === 6 })
  }
  return days
}

// ============================================================
// Small components
// ============================================================

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 0', fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer',
      background: 'transparent',
      color: active ? text : muted,
      border: 'none', borderBottom: active ? `2px solid ${text}` : '2px solid transparent',
      fontFamily: ff, transition: 'all 0.2s',
    }}>{label}</button>
  )
}

function KpiCard({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: string }) {
  return (
    <div style={{ ...card, padding: '14px 16px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: muted, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || text, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>{unit}</div>
    </div>
  )
}

// ============================================================
// Main page
// ============================================================

export default function HelikopterV2Page() {
  const [data, setData] = useState<ObjektRow[]>([])
  const [bestallningar, setBestallningar] = useState<Bestallning[]>([])
  const [loading, setLoading] = useState(true)
  const [ar, setAr] = useState(() => new Date().getFullYear())
  const [manad, setManad] = useState(() => new Date().getMonth() + 1)
  const [bolagFilter, setBolagFilter] = useState<TypFilter>('alla')
  const [oskotatFilter, setOskotatFilter] = useState<TypFilter>('alla')

  // Fetch data
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [hRes, bRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/helikopter_vy?select=*`, { headers: HEADERS }),
          fetch(`${SUPABASE_URL}/rest/v1/bestallningar?select=*&ar=eq.${ar}&manad=eq.${manad}`, { headers: HEADERS }),
        ])
        if (hRes.ok) setData(await hRes.json())
        if (bRes.ok) setBestallningar(await bRes.json())
      } catch { /* use empty */ }
      setLoading(false)
    }
    load()
  }, [ar, manad])

  const manadAvslutad = useMemo(() => {
    const now = new Date()
    return ar < now.getFullYear() || (ar === now.getFullYear() && manad < now.getMonth() + 1)
  }, [ar, manad])

  // Filter for selected month
  const manadData = useMemo(() => {
    const start = `${ar}-${String(manad).padStart(2, '0')}-01`
    const end = manad === 12 ? `${ar + 1}-01-01` : `${ar}-${String(manad + 1).padStart(2, '0')}-01`
    return data.filter(o => o.skordare_klar && o.skordare_klar >= start && o.skordare_klar < end)
  }, [data, ar, manad])

  // KPI totals
  const kpi = useMemo(() => {
    const skordat = manadData.reduce((s, o) => s + (o.skordat_m3 || 0), 0)
    const skotat = manadData.reduce((s, o) => s + (o.skotat_m3 || 0), 0)
    const oskotat = manadData.reduce((s, o) => s + (o.oskotat_m3 || 0), 0)
    // Takt: skördat per arbetsdag hittills i månaden
    const now = new Date()
    let passedWorkdays = 0
    if (ar === now.getFullYear() && manad === now.getMonth() + 1) {
      for (let d = 1; d <= now.getDate(); d++) {
        const dow = new Date(ar, manad - 1, d).getDay()
        if (dow !== 0 && dow !== 6) passedWorkdays++
      }
    } else if (manadAvslutad) {
      const last = new Date(ar, manad, 0).getDate()
      for (let d = 1; d <= last; d++) {
        const dow = new Date(ar, manad - 1, d).getDay()
        if (dow !== 0 && dow !== 6) passedWorkdays++
      }
    }
    const takt = passedWorkdays > 0 ? skordat / passedWorkdays : 0
    return { skordat, skotat, oskotat, takt }
  }, [manadData, ar, manad, manadAvslutad])

  // Beställning defaults
  const slutBest = useMemo(() => {
    const v = bestallningar.filter(b => b.typ === 'slutavverkning').reduce((s, b) => s + (b.volym || 0), 0)
    return v || 2000
  }, [bestallningar])
  const gallBest = useMemo(() => {
    const v = bestallningar.filter(b => b.typ === 'gallring').reduce((s, b) => s + (b.volym || 0), 0)
    return v || 500
  }, [bestallningar])

  // ============================================================
  // Section 2: Bolag — levererat vs lovat
  // ============================================================

  const bolagRows = useMemo(() => {
    const filtered = bolagFilter === 'alla' ? manadData
      : manadData.filter(o => (o.huvudtyp || '').toLowerCase() === (bolagFilter === 'slutavverkning' ? 'slutavverkning' : 'gallring'))

    const byBolag: Record<string, { skordat: number; skotat: number }> = {}
    for (const o of filtered) {
      const b = normalizeBolag(o.bolag)
      if (!byBolag[b]) byBolag[b] = { skordat: 0, skotat: 0 }
      byBolag[b].skordat += o.skordat_m3 || 0
      byBolag[b].skotat += o.skotat_m3 || 0
    }

    // Beställningar per bolag
    const bestTypFilter = bolagFilter === 'alla' ? null : bolagFilter
    const bestByBolag: Record<string, number> = {}
    for (const b of bestallningar) {
      if (bestTypFilter && b.typ !== bestTypFilter) continue
      const key = normalizeBolag(b.bolag)
      bestByBolag[key] = (bestByBolag[key] || 0) + (b.volym || 0)
    }

    // Total beställning for default
    const totalBest = bolagFilter === 'gallring' ? gallBest : bolagFilter === 'slutavverkning' ? slutBest : slutBest + gallBest

    return Object.entries(byBolag).map(([namn, d]) => {
      const best = bestByBolag[namn] || 0
      const levererat = d.skotat
      const procent = best > 0 ? Math.round((levererat / best) * 100) : 0
      return { namn, skordat: d.skordat, skotat: d.skotat, best, procent }
    }).sort((a, b) => a.procent - b.procent)
  }, [manadData, bolagFilter, bestallningar, slutBest, gallBest])

  // ============================================================
  // Section 3: Trend chart data
  // ============================================================

  const chartData = useMemo(() => {
    const days = daysInMonth(ar, manad)
    let cumSkordare = 0
    let cumSkotare = 0
    const skordareAcc: (number | null)[] = []
    const skotareAcc: (number | null)[] = []
    const labels: string[] = []

    const now = new Date()
    const isCurrentMonth = ar === now.getFullYear() && manad === now.getMonth() + 1

    for (const day of days) {
      const ds = day.date.toISOString().slice(0, 10)
      labels.push(day.label)

      // Only plot up to today for current month
      if (isCurrentMonth && day.date > now) {
        skordareAcc.push(null)
        skotareAcc.push(null)
        continue
      }

      for (const o of manadData) {
        if (o.skordare_klar === ds) cumSkordare += o.skordat_m3 || 0
        if (o.skotare_start === ds) cumSkotare += o.skotat_m3 || 0
      }
      skordareAcc.push(Math.round(cumSkordare))
      skotareAcc.push(Math.round(cumSkotare))
    }

    return {
      labels,
      datasets: [
        {
          label: 'Skordare (ack.)',
          data: skordareAcc,
          borderColor: '#FF9F0A',
          backgroundColor: 'rgba(255,159,10,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
          spanGaps: false,
        },
        {
          label: 'Skotare (ack.)',
          data: skotareAcc,
          borderColor: '#30D158',
          backgroundColor: 'rgba(48,209,88,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
          spanGaps: false,
        },
      ],
    }
  }, [manadData, ar, manad])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: { color: muted, font: { size: 9 }, boxWidth: 8, padding: 6 },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString()} m\u00B3`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: muted, font: { size: 10 }, maxTicksLimit: 10 },
        grid: { color: divider },
      },
      y: {
        ticks: { color: muted, font: { size: 10 }, callback: (v: any) => `${v}` },
        grid: { color: divider },
      },
    },
  }), [])

  // ============================================================
  // Section 4: Oskotat virke
  // ============================================================

  const oskotatLista = useMemo(() => {
    return data
      .filter(o => o.oskotat_m3 > 0 && !o.skotare_start)
      .filter(o => oskotatFilter === 'alla' || (o.huvudtyp || '').toLowerCase() === oskotatFilter)
      .map(o => ({ ...o, dagarLive: dagarSedan(o.skordare_klar) }))
      .sort((a, b) => b.dagarLive - a.dagarLive)
  }, [data, oskotatFilter])

  const totalOskotat = oskotatLista.reduce((s, o) => s + (o.oskotat_m3 || 0), 0)

  // ============================================================
  // Section 5: Dagsmal resterande manad
  // ============================================================

  const dagsmal = useMemo(() => {
    const kvar = arbetsdagarKvar(ar, manad)
    if (kvar === 0) return null

    const slutData = manadData.filter(o => (o.huvudtyp || '').toLowerCase() === 'slutavverkning')
    const gallData = manadData.filter(o => (o.huvudtyp || '').toLowerCase() === 'gallring')

    const slutSkordat = slutData.reduce((s, o) => s + (o.skordat_m3 || 0), 0)
    const slutSkotat = slutData.reduce((s, o) => s + (o.skotat_m3 || 0), 0)
    const gallSkordat = gallData.reduce((s, o) => s + (o.skordat_m3 || 0), 0)
    const gallSkotat = gallData.reduce((s, o) => s + (o.skotat_m3 || 0), 0)

    return {
      kvar,
      rows: [
        { label: 'Skordare slutavverkning', kvar: Math.max(0, slutBest - slutSkordat), perDag: kvar > 0 ? Math.max(0, slutBest - slutSkordat) / kvar : 0 },
        { label: 'Skordare gallring', kvar: Math.max(0, gallBest - gallSkordat), perDag: kvar > 0 ? Math.max(0, gallBest - gallSkordat) / kvar : 0 },
        { label: 'Skotare slutavverkning', kvar: Math.max(0, slutBest - slutSkotat), perDag: kvar > 0 ? Math.max(0, slutBest - slutSkotat) / kvar : 0 },
        { label: 'Skotare gallring', kvar: Math.max(0, gallBest - gallSkotat), perDag: kvar > 0 ? Math.max(0, gallBest - gallSkotat) / kvar : 0 },
      ],
    }
  }, [manadData, ar, manad, slutBest, gallBest])

  // ============================================================
  // Month navigation
  // ============================================================

  const bytManad = (dir: 'prev' | 'next') => {
    if (dir === 'prev') {
      if (manad === 1) { setManad(12); setAr(ar - 1) }
      else setManad(manad - 1)
    } else {
      if (manad === 12) { setManad(1); setAr(ar + 1) }
      else setManad(manad + 1)
    }
  }

  const kvarDagar = arbetsdagarKvar(ar, manad)

  // ============================================================
  // Render
  // ============================================================

  return (
    <div style={{
      position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
      background: bg, color: text, fontFamily: ff,
      WebkitFontSmoothing: 'antialiased', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: '32px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <button onClick={() => bytManad('prev')} style={{
            width: 36, height: 36, borderRadius: 18, background: 'transparent',
            border: `1px solid ${divider}`, color: muted,
            fontSize: 20, cursor: 'pointer', fontFamily: ff,
          }}>&#8249;</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}>{MANAD[manad]} {ar}</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
              {manadAvslutad ? 'Avslutad' : `${kvarDagar} arbetsdagar kvar`}
            </div>
          </div>
          <button onClick={() => bytManad('next')} style={{
            width: 36, height: 36, borderRadius: 18, background: 'transparent',
            border: `1px solid ${divider}`, color: muted,
            fontSize: 20, cursor: 'pointer', fontFamily: ff,
          }}>&#8250;</button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: muted }}>Laddar...</div>
      )}

      {!loading && (
        <div style={{ padding: '0 24px 120px' }}>
          {/* ============================================================ */}
          {/* Section 1: KPI-kort */}
          {/* ============================================================ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <KpiCard label="Skordat" value={Math.round(kpi.skordat).toLocaleString()} unit="m\u00B3" accent="#FF9F0A" />
            <KpiCard label="Skotat" value={Math.round(kpi.skotat).toLocaleString()} unit="m\u00B3" accent="#30D158" />
            <KpiCard label="Oskotat" value={Math.round(kpi.oskotat).toLocaleString()} unit="m\u00B3" accent={kpi.oskotat > 500 ? '#ef4444' : '#f59e0b'} />
            <KpiCard label="Takt" value={Math.round(kpi.takt).toLocaleString()} unit="m\u00B3/dag" />
          </div>

          {/* ============================================================ */}
          {/* Section 2: Bolag */}
          {/* ============================================================ */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Bolag - levererat vs lovat</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <Tab label="Alla" active={bolagFilter === 'alla'} onClick={() => setBolagFilter('alla')} />
              <Tab label="Slutavverkning" active={bolagFilter === 'slutavverkning'} onClick={() => setBolagFilter('slutavverkning')} />
              <Tab label="Gallring" active={bolagFilter === 'gallring'} onClick={() => setBolagFilter('gallring')} />
            </div>

            {bolagRows.length === 0 && (
              <div style={{ padding: '16px 0', textAlign: 'center', color: muted, fontSize: 12 }}>Ingen data</div>
            )}

            {bolagRows.slice(0, 4).map((row, i) => (
              <div key={row.namn} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${divider}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{row.namn}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {row.best > 0 ? (
                      <>
                        <span style={{ fontSize: 12, color: muted }}>
                          {Math.round(row.skotat).toLocaleString()} / {Math.round(row.best).toLocaleString()}
                        </span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: procentColor(row.procent), fontVariantNumeric: 'tabular-nums' }}>
                          {row.procent}%
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Ej planerat</span>
                    )}
                  </div>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${Math.min(100, row.best > 0 ? row.procent : (row.skotat > 0 ? 30 : 0))}%`,
                    background: row.best > 0 ? procentColor(row.procent) : 'rgba(255,255,255,0.15)',
                    transition: 'width 0.8s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* ============================================================ */}
          {/* Section 3: Trend-graf */}
          {/* ============================================================ */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Trend - ackumulerat</div>
            <div style={{ height: 120 }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* ============================================================ */}
          {/* Section 4: Oskotat virke */}
          {/* ============================================================ */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Oskotat virke</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: muted, fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(totalOskotat).toLocaleString()} m&sup3;
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <Tab label="Alla" active={oskotatFilter === 'alla'} onClick={() => setOskotatFilter('alla')} />
              <Tab label="Slutavverkning" active={oskotatFilter === 'slutavverkning'} onClick={() => setOskotatFilter('slutavverkning')} />
              <Tab label="Gallring" active={oskotatFilter === 'gallring'} onClick={() => setOskotatFilter('gallring')} />
            </div>

            {oskotatLista.length === 0 && (
              <div style={{ padding: '16px 0', textAlign: 'center', color: muted, fontSize: 12 }}>Inget oskotat</div>
            )}

            {oskotatLista.slice(0, 3).map((o) => (
              <div key={o.objekt_id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0', borderBottom: `1px solid ${divider}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.object_name || o.objekt_id}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
                    {normalizeBolag(o.bolag)} {o.huvudtyp ? `\u00B7 ${o.huvudtyp}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Math.round(o.oskotat_m3)} m&sup3;</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                    background: `${statusColor(o.dagarLive)}20`,
                    color: statusColor(o.dagarLive),
                  }}>
                    {o.dagarLive}d
                  </span>
                </div>
              </div>
            ))}
            {oskotatLista.length > 3 && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', padding: '10px 0' }}>
                +{oskotatLista.length - 3} till
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* Section 5: Dagsmal resterande manad */}
          {/* ============================================================ */}
          {dagsmal && dagsmal.kvar > 0 && (
            <div style={{ ...card, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Dagsmal resterande</span>
                <span style={{ fontSize: 12, color: muted }}>{dagsmal.kvar} arbetsdagar</span>
              </div>

              {dagsmal.rows.map((row, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: i < dagsmal.rows.length - 1 ? `1px solid ${divider}` : 'none',
                }}>
                  <span style={{ fontSize: 12, color: muted }}>{row.label}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                      {Math.round(row.kvar).toLocaleString()} m&sup3;
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(row.perDag)} m&sup3;/d
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {manadAvslutad && dagsmal === null && (
            <div style={{ ...card, marginBottom: 20, textAlign: 'center', color: muted, fontSize: 12 }}>
              Manaden ar avslutad
            </div>
          )}
        </div>
      )}
    </div>
  )
}
