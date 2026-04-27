'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
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
const muted = '#8e8e93'
const divider = 'rgba(255,255,255,0.08)'
const ff = 'system-ui, sans-serif'

const card: React.CSSProperties = {
  background: '#1c1c1e',
  borderRadius: 12,
  padding: '1.25rem',
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
  if (!b || b.trim() === '') return 'Okänt'
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
  if (dagar > 3) return '#ff453a'
  if (dagar >= 1) return '#FF9F0A'
  return '#30d158'
}

function procentColor(p: number): string {
  if (p >= 90) return '#30d158'
  if (p >= 60) return '#FF9F0A'
  return '#ff453a'
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
      minHeight: 44, padding: '14px 0', fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer',
      background: 'transparent',
      color: active ? text : muted,
      border: 'none', borderBottom: active ? `2px solid ${text}` : '2px solid transparent',
      fontFamily: ff, transition: 'all 0.2s',
    }}>{label}</button>
  )
}

function KpiCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{ ...card, padding: '14px 16px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: muted, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: text, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>{unit}</div>
    </div>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1c1c1e', color: text, fontFamily: ff,
          width: '100%', maxHeight: '85vh',
          borderTopLeftRadius: 12, borderTopRightRadius: 12,
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${divider}`,
        }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              minHeight: 44, padding: '0 4px', fontSize: 17, color: '#0a84ff',
              background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: ff,
            }}
          >Klar</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '8px 20px 20px' }}>{children}</div>
      </div>
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
  const [kpiFilter, setKpiFilter] = useState<TypFilter>('alla')
  const [trendFilter, setTrendFilter] = useState<TypFilter>('alla')
  const [bolagFilter, setBolagFilter] = useState<TypFilter>('alla')
  const [oskotatFilter, setOskotatFilter] = useState<TypFilter>('alla')
  const [oskotatExpanded, setOskotatExpanded] = useState(false)
  const [selectedBolag, setSelectedBolag] = useState<string | null>(null)
  const [selectedObjekt, setSelectedObjekt] = useState<ObjektRow | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const touchStartY = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const [hRes, bRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/helikopter_vy?select=*`, { headers: HEADERS }),
        fetch(`${SUPABASE_URL}/rest/v1/bestallningar?select=*&ar=eq.${ar}&manad=eq.${manad}`, { headers: HEADERS }),
      ])
      if (hRes.ok) setData(await hRes.json())
      if (bRes.ok) setBestallningar(await bRes.json())
    } catch { /* use empty */ }
  }, [ar, manad])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

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

  // Helper: filter manadData by typ
  const filterByTyp = (rows: ObjektRow[], typ: TypFilter) => {
    if (typ === 'alla') return rows
    return rows.filter(o => (o.huvudtyp || '').toLowerCase() === typ)
  }

  // KPI totals
  const kpi = useMemo(() => {
    const filtered = filterByTyp(manadData, kpiFilter)
    const skordat = filtered.reduce((s, o) => s + (o.skordat_m3 || 0), 0)
    const skotat = filtered.reduce((s, o) => s + (o.skotat_m3 || 0), 0)
    const oskotat = filtered.reduce((s, o) => s + (o.oskotat_m3 || 0), 0)
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
  }, [manadData, ar, manad, manadAvslutad, kpiFilter])

  const slutBest = useMemo(() =>
    bestallningar.filter(b => b.typ === 'slutavverkning').reduce((s, b) => s + (b.volym || 0), 0),
  [bestallningar])
  const gallBest = useMemo(() =>
    bestallningar.filter(b => b.typ === 'gallring').reduce((s, b) => s + (b.volym || 0), 0),
  [bestallningar])

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

  const todayIndex = useMemo(() => {
    const now = new Date()
    if (ar === now.getFullYear() && manad === now.getMonth() + 1) return now.getDate() - 1
    return -1
  }, [ar, manad])

  const chartData = useMemo(() => {
    const trendData = filterByTyp(manadData, trendFilter)
    const days = daysInMonth(ar, manad)
    let cumSkordare = 0
    let cumSkotare = 0
    const skordareAcc: (number | null)[] = []
    const skotareAcc: (number | null)[] = []
    const labels: string[] = []

    const now = new Date()
    const isCurrentMonth = ar === now.getFullYear() && manad === now.getMonth() + 1

    let lastSkordareIdx = -1
    let lastSkotareIdx = -1
    let passedWorkdays = 0

    for (let i = 0; i < days.length; i++) {
      const day = days[i]
      const ds = day.date.toISOString().slice(0, 10)
      labels.push(day.label)

      if (isCurrentMonth && day.date > now) {
        skordareAcc.push(null)
        skotareAcc.push(null)
        continue
      }

      for (const o of trendData) {
        if (o.skordare_klar === ds) cumSkordare += o.skordat_m3 || 0
        if (o.skotare_start === ds) cumSkotare += o.skotat_m3 || 0
      }
      skordareAcc.push(Math.round(cumSkordare))
      skotareAcc.push(Math.round(cumSkotare))
      lastSkordareIdx = i
      lastSkotareIdx = i
      if (!day.isWeekend) passedWorkdays++
    }

    const skordarePointRadius = skordareAcc.map((_, i) => i === lastSkordareIdx ? 5 : 0)
    const skotarePointRadius = skotareAcc.map((_, i) => i === lastSkotareIdx ? 5 : 0)
    const skordarePointBg = skordareAcc.map((_, i) => i === lastSkordareIdx ? '#FF9F0A' : 'transparent')
    const skotarePointBg = skotareAcc.map((_, i) => i === lastSkotareIdx ? '#30D158' : 'transparent')

    // Beställningslinje (mål)
    const targetVolym =
      trendFilter === 'slutavverkning' ? slutBest :
      trendFilter === 'gallring' ? gallBest :
      slutBest + gallBest
    const malLine: (number | null)[] = targetVolym > 0
      ? days.map(() => targetVolym)
      : []

    // Prognoslinje (extrapolerad takt)
    const prognosSkordare: (number | null)[] = []
    const prognosSkotare: (number | null)[] = []
    if (isCurrentMonth && lastSkordareIdx >= 0 && lastSkordareIdx < days.length - 1 && passedWorkdays > 0) {
      const skordareRate = cumSkordare / passedWorkdays
      const skotareRate = cumSkotare / passedWorkdays
      let pSkord = cumSkordare
      let pSkot = cumSkotare
      for (let i = 0; i < days.length; i++) {
        if (i < lastSkordareIdx) {
          prognosSkordare.push(null)
          prognosSkotare.push(null)
        } else if (i === lastSkordareIdx) {
          prognosSkordare.push(Math.round(cumSkordare))
          prognosSkotare.push(Math.round(cumSkotare))
        } else {
          if (!days[i].isWeekend) {
            pSkord += skordareRate
            pSkot += skotareRate
          }
          prognosSkordare.push(Math.round(pSkord))
          prognosSkotare.push(Math.round(pSkot))
        }
      }
    }

    const datasets: any[] = [
      {
        label: 'Skördare (ack.)',
        data: skordareAcc,
        borderColor: '#FF9F0A',
        backgroundColor: (ctx: any) => {
          const chart = ctx.chart
          const { ctx: c, chartArea } = chart
          if (!chartArea) return 'rgba(255,159,10,0.15)'
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, 'rgba(255,159,10,0.25)')
          gradient.addColorStop(1, 'rgba(255,159,10,0.02)')
          return gradient
        },
        fill: true,
        tension: 0.4,
        pointRadius: skordarePointRadius,
        pointBackgroundColor: skordarePointBg,
        pointBorderColor: skordarePointBg,
        pointHoverRadius: 7,
        borderWidth: 2.5,
        spanGaps: false,
      },
      {
        label: 'Skotare (ack.)',
        data: skotareAcc,
        borderColor: '#30D158',
        backgroundColor: (ctx: any) => {
          const chart = ctx.chart
          const { ctx: c, chartArea } = chart
          if (!chartArea) return 'rgba(48,209,88,0.15)'
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, 'rgba(48,209,88,0.25)')
          gradient.addColorStop(1, 'rgba(48,209,88,0.02)')
          return gradient
        },
        fill: true,
        tension: 0.4,
        pointRadius: skotarePointRadius,
        pointBackgroundColor: skotarePointBg,
        pointBorderColor: skotarePointBg,
        pointHoverRadius: 7,
        borderWidth: 2.5,
        spanGaps: false,
      },
    ]

    if (prognosSkordare.length > 0) {
      datasets.push({
        label: 'Prognos skördare',
        data: prognosSkordare,
        borderColor: 'rgba(255,159,10,0.5)',
        backgroundColor: 'transparent',
        borderDash: [4, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0.4,
        spanGaps: false,
      })
      datasets.push({
        label: 'Prognos skotare',
        data: prognosSkotare,
        borderColor: 'rgba(48,209,88,0.5)',
        backgroundColor: 'transparent',
        borderDash: [4, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0.4,
        spanGaps: false,
      })
    }

    if (malLine.length > 0) {
      datasets.push({
        label: 'Beställning',
        data: malLine,
        borderColor: 'rgba(255,255,255,0.4)',
        backgroundColor: 'transparent',
        borderDash: [6, 4],
        borderWidth: 1,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
      })
    }

    return { labels, datasets }
  }, [manadData, ar, manad, trendFilter, slutBest, gallBest])

  // Today line plugin
  const todayLinePlugin = useMemo(() => ({
    id: 'todayLine',
    afterDraw(chart: any) {
      if (todayIndex < 0) return
      const { ctx, chartArea, scales } = chart
      const x = scales.x.getPixelForValue(todayIndex)
      if (x < chartArea.left || x > chartArea.right) return
      ctx.save()
      ctx.beginPath()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 1
      ctx.moveTo(x, chartArea.top)
      ctx.lineTo(x, chartArea.bottom)
      ctx.stroke()
      ctx.restore()
    },
  }), [todayIndex])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: { color: muted, font: { size: 11 }, boxWidth: 10, padding: 8 },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString()} m³fub`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: muted, font: { size: 11 }, maxTicksLimit: 10 },
        grid: { display: false },
      },
      y: {
        ticks: { color: muted, font: { size: 11 }, callback: (v: any) => `${v}` },
        grid: { color: 'rgba(255,255,255,0.04)' },
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
  // Section 5: Dagsmål resterande månad
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

    const rows: { label: string; kvar: number; perDag: number }[] = []
    if (slutBest > 0) {
      rows.push({ label: 'Skördare slutavverkning', kvar: Math.max(0, slutBest - slutSkordat), perDag: Math.max(0, slutBest - slutSkordat) / kvar })
      rows.push({ label: 'Skotare slutavverkning', kvar: Math.max(0, slutBest - slutSkotat), perDag: Math.max(0, slutBest - slutSkotat) / kvar })
    }
    if (gallBest > 0) {
      rows.push({ label: 'Skördare gallring', kvar: Math.max(0, gallBest - gallSkordat), perDag: Math.max(0, gallBest - gallSkordat) / kvar })
      rows.push({ label: 'Skotare gallring', kvar: Math.max(0, gallBest - gallSkotat), perDag: Math.max(0, gallBest - gallSkotat) / kvar })
    }

    return { kvar, rows }
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

  const senasteUppdaterad = useMemo(() => {
    let max: string | null = null
    for (const o of data) {
      if (o.skordare_klar && (!max || o.skordare_klar > max)) max = o.skordare_klar
      if (o.skotare_start && (!max || o.skotare_start > max)) max = o.skotare_start
    }
    return max
  }, [data])

  const workdaysInfo = useMemo(() => {
    const totalDays = new Date(ar, manad, 0).getDate()
    const now = new Date()
    let total = 0, passed = 0
    for (let d = 1; d <= totalDays; d++) {
      const dow = new Date(ar, manad - 1, d).getDay()
      if (dow !== 0 && dow !== 6) {
        total++
        const dayDate = new Date(ar, manad - 1, d)
        if (dayDate.getTime() <= now.getTime()) passed++
      }
    }
    return { total, passed }
  }, [ar, manad])

  const totalSkotat = useMemo(() =>
    manadData.reduce((s, o) => s + (o.skotat_m3 || 0), 0),
  [manadData])

  const manadsmal = useMemo(() => {
    const totalBest = slutBest + gallBest
    if (totalBest === 0) return null
    const procent = Math.round((totalSkotat / totalBest) * 100)
    const forvantadProcent = workdaysInfo.total > 0
      ? Math.round((workdaysInfo.passed / workdaysInfo.total) * 100)
      : 0
    const onTrack = procent >= forvantadProcent
    return { procent, forvantadProcent, onTrack }
  }, [slutBest, gallBest, totalSkotat, workdaysInfo])

  const prognosManad = useMemo(() => {
    if (workdaysInfo.passed === 0 || workdaysInfo.total === 0) return null
    const skotareRate = totalSkotat / workdaysInfo.passed
    const prognos = Math.round(skotareRate * workdaysInfo.total)
    const totalBest = slutBest + gallBest
    const prognosProcent = totalBest > 0 ? Math.round((prognos / totalBest) * 100) : null
    return { prognos, prognosProcent }
  }, [totalSkotat, slutBest, gallBest, workdaysInfo])

  const veckoSammanfattning = useMemo(() => {
    const now = new Date()
    if (now.getDay() !== 1) return null
    const lastMonday = new Date(now)
    lastMonday.setDate(now.getDate() - 7)
    const lastSunday = new Date(now)
    lastSunday.setDate(now.getDate() - 1)
    const fromStr = lastMonday.toISOString().slice(0, 10)
    const toStr = lastSunday.toISOString().slice(0, 10)
    let weekSkordat = 0, weekSkotat = 0
    for (const o of data) {
      if (o.skordare_klar && o.skordare_klar >= fromStr && o.skordare_klar <= toStr) {
        weekSkordat += o.skordat_m3 || 0
      }
      if (o.skotare_start && o.skotare_start >= fromStr && o.skotare_start <= toStr) {
        weekSkotat += o.skotat_m3 || 0
      }
    }
    const totalBest = slutBest + gallBest
    const procent = totalBest > 0 ? Math.round((weekSkotat / totalBest) * 100) : null
    return { weekSkordat: Math.round(weekSkordat), weekSkotat: Math.round(weekSkotat), procent }
  }, [data, slutBest, gallBest])

  const onTouchStart = (e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY
    } else {
      touchStartY.current = null
    }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    if (scrollRef.current && scrollRef.current.scrollTop > 0) {
      touchStartY.current = null
      setPullDistance(0)
      return
    }
    const dist = e.touches[0].clientY - touchStartY.current
    if (dist > 0) setPullDistance(Math.min(120, dist * 0.5))
  }

  const onTouchEnd = async () => {
    if (pullDistance > 60 && !refreshing) {
      setRefreshing(true)
      setPullDistance(50)
      await load()
      setRefreshing(false)
    }
    setPullDistance(0)
    touchStartY.current = null
  }

  const buildCsv = () => {
    const header = ['Objekt', 'VO-nummer', 'Bolag', 'Huvudtyp', 'Skogsägare', 'Inköpare', 'Skördat_m3fub', 'Skotat_m3fub', 'Oskotat_m3fub', 'Skördare_klar', 'Skotare_start']
    const escape = (v: any) => {
      const s = v == null ? '' : String(v)
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = manadData.map(o => [
      o.object_name || o.objekt_id, o.vo_nummer || '', normalizeBolag(o.bolag),
      o.huvudtyp || '', o.skogsagare || '', o.inkopare || '',
      Math.round(o.skordat_m3 || 0), Math.round(o.skotat_m3 || 0), Math.round(o.oskotat_m3 || 0),
      o.skordare_klar || '', o.skotare_start || '',
    ].map(escape).join(';'))
    return [header.join(';'), ...rows].join('\n')
  }

  const exportCsv = () => {
    const csv = buildCsv()
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `helikopter-${ar}-${String(manad).padStart(2, '0')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }

  const sharaSammanfattning = async () => {
    const totalBest = slutBest + gallBest
    const proc = manadsmal ? `${manadsmal.procent}% av månadens beställning (förväntat ${manadsmal.forvantadProcent}%)` : 'Ingen beställning satt'
    const text = `Helikopter — ${MANAD[manad]} ${ar}\n${proc}\nSkördat: ${Math.round(kpi.skordat).toLocaleString()} m³fub\nSkotat: ${Math.round(kpi.skotat).toLocaleString()} m³fub\nOskotat: ${Math.round(kpi.oskotat).toLocaleString()} m³fub`
    const navAny = navigator as any
    if (navAny.share) {
      try { await navAny.share({ title: `Helikopter ${MANAD[manad]} ${ar}`, text }) } catch { /* avbruten */ }
    } else {
      try { await navigator.clipboard.writeText(text); alert('Kopierat till urklipp') } catch { alert(text) }
    }
    setExportOpen(false)
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div
      ref={scrollRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
        background: bg, color: text, fontFamily: ff,
        WebkitFontSmoothing: 'antialiased', overflowY: 'auto',
      }}
    >
      {(pullDistance > 0 || refreshing) && (
        <div style={{
          height: pullDistance, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: muted, fontSize: 13, transition: refreshing ? 'height 0.2s' : 'none',
        }}>
          {refreshing ? 'Uppdaterar…' : pullDistance > 60 ? 'Släpp för att uppdatera' : 'Dra ned för att uppdatera'}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '32px 24px 0' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '92px 1fr 92px',
          alignItems: 'center', marginBottom: 28,
        }}>
          <div>
            <button onClick={() => bytManad('prev')} style={{
              width: 44, height: 44, borderRadius: 22, background: 'transparent',
              border: `1px solid ${divider}`, color: muted,
              fontSize: 22, cursor: 'pointer', fontFamily: ff,
            }}>&#8249;</button>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{MANAD[manad]} {ar}</div>
            <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>
              {manadAvslutad ? 'Avslutad' : `${kvarDagar} arbetsdagar kvar`}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            <button onClick={() => bytManad('next')} style={{
              width: 44, height: 44, borderRadius: 22, background: 'transparent',
              border: `1px solid ${divider}`, color: muted,
              fontSize: 22, cursor: 'pointer', fontFamily: ff,
            }}>&#8250;</button>
            <button
              onClick={() => setExportOpen(true)}
              style={{
                width: 44, height: 44, borderRadius: 22, background: 'transparent',
                border: `1px solid ${divider}`, color: muted,
                fontSize: 17, cursor: 'pointer', fontFamily: ff,
              }}
              aria-label="Exportera"
            >&#x2BAD;</button>
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: muted }}>Laddar...</div>
      )}

      {!loading && (
        <div style={{ padding: '0 24px 120px' }}>
          {/* Procent månadsmål — primärt tal */}
          {manadsmal && (
            <div style={{ textAlign: 'center', padding: '8px 0 28px' }}>
              <div style={{
                fontSize: 64, fontWeight: 700, lineHeight: 1,
                color: manadsmal.onTrack ? '#30d158' : '#ff453a',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {manadsmal.procent}%
              </div>
              <div style={{ fontSize: 13, color: muted, marginTop: 8 }}>
                av månadens beställning · förväntat {manadsmal.forvantadProcent}%
              </div>
            </div>
          )}
          {!manadsmal && !manadAvslutad && (
            <div style={{ textAlign: 'center', padding: '8px 0 28px', color: muted, fontSize: 13 }}>
              Beställning ej satt
            </div>
          )}

          {/* Veckosammanfattning (bara måndagar) */}
          {veckoSammanfattning && (
            <div style={{ ...card, marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Förra veckan</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ fontSize: 13, color: muted }}>
                  Skördat <span style={{ fontSize: 17, color: text, fontWeight: 600, marginLeft: 4 }}>{veckoSammanfattning.weekSkordat.toLocaleString()}</span> m³fub
                </div>
                <div style={{ fontSize: 13, color: muted }}>
                  Skotat <span style={{ fontSize: 17, color: text, fontWeight: 600, marginLeft: 4 }}>{veckoSammanfattning.weekSkotat.toLocaleString()}</span> m³fub
                </div>
                {veckoSammanfattning.procent !== null && (
                  <div style={{ fontSize: 13, color: muted }}>
                    <span style={{ fontSize: 17, color: text, fontWeight: 600, marginRight: 4 }}>{veckoSammanfattning.procent}%</span> av månadsmål
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* Section 1: KPI-kort */}
          {/* ============================================================ */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <Tab label="Alla" active={kpiFilter === 'alla'} onClick={() => setKpiFilter('alla')} />
            <Tab label="Slutavverkning" active={kpiFilter === 'slutavverkning'} onClick={() => setKpiFilter('slutavverkning')} />
            <Tab label="Gallring" active={kpiFilter === 'gallring'} onClick={() => setKpiFilter('gallring')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <KpiCard label="Skördat" value={Math.round(kpi.skordat).toLocaleString()} unit="m³fub" />
            <KpiCard label="Skotat" value={Math.round(kpi.skotat).toLocaleString()} unit="m³fub" />
            <KpiCard label="Oskotat" value={Math.round(kpi.oskotat).toLocaleString()} unit="m³fub" />
            <KpiCard label="Takt" value={Math.round(kpi.takt).toLocaleString()} unit="m³fub/dag" />
          </div>

          {/* ============================================================ */}
          {/* Section 2: Bolag */}
          {/* ============================================================ */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>Bolag — levererat vs lovat</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <Tab label="Alla" active={bolagFilter === 'alla'} onClick={() => setBolagFilter('alla')} />
              <Tab label="Slutavverkning" active={bolagFilter === 'slutavverkning'} onClick={() => setBolagFilter('slutavverkning')} />
              <Tab label="Gallring" active={bolagFilter === 'gallring'} onClick={() => setBolagFilter('gallring')} />
            </div>

            {bolagRows.length === 0 && (
              <div style={{ padding: '16px 0', textAlign: 'center', color: muted, fontSize: 13 }}>Ingen data</div>
            )}

            {bolagRows.map((row, i) => (
              <div
                key={row.namn}
                onClick={() => setSelectedBolag(row.namn)}
                style={{
                  paddingBottom: 12, marginBottom: 12,
                  borderBottom: `1px solid ${divider}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 17, fontWeight: 500 }}>{row.namn}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {row.best > 0 ? (
                      <>
                        <span style={{ fontSize: 13, color: muted }}>
                          {Math.round(row.skotat).toLocaleString()} / {Math.round(row.best).toLocaleString()}
                        </span>
                        <span style={{ fontSize: 17, fontWeight: 700, color: procentColor(row.procent), fontVariantNumeric: 'tabular-nums' }}>
                          {row.procent}%
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: 13, color: muted }}>
                        {Math.round(row.skotat).toLocaleString()} m³fub &middot; Ingen beställning
                      </span>
                    )}
                  </div>
                </div>
                {row.best > 0 && (
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${Math.min(100, row.procent)}%`,
                      background: procentColor(row.procent),
                      transition: 'width 0.8s ease',
                    }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ============================================================ */}
          {/* Section 3: Trend-graf */}
          {/* ============================================================ */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>Trend — ackumulerat</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <Tab label="Alla" active={trendFilter === 'alla'} onClick={() => setTrendFilter('alla')} />
              <Tab label="Slutavverkning" active={trendFilter === 'slutavverkning'} onClick={() => setTrendFilter('slutavverkning')} />
              <Tab label="Gallring" active={trendFilter === 'gallring'} onClick={() => setTrendFilter('gallring')} />
            </div>
            <div style={{ height: 280 }}>
              <Line data={chartData} options={chartOptions} plugins={[todayLinePlugin]} />
            </div>
            {prognosManad && (
              <div style={{ fontSize: 13, color: muted, marginTop: 12, textAlign: 'center' }}>
                I nuvarande takt landar månaden på <span style={{ color: text, fontWeight: 600 }}>{prognosManad.prognos.toLocaleString()}</span> m³fub
                {prognosManad.prognosProcent !== null && (
                  <> (<span style={{ color: text, fontWeight: 600 }}>{prognosManad.prognosProcent}%</span> av beställning)</>
                )}
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* Section 4: Oskotat virke */}
          {/* ============================================================ */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>Oskotat virke</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: muted, fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(totalOskotat).toLocaleString()} m³fub
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <Tab label="Alla" active={oskotatFilter === 'alla'} onClick={() => setOskotatFilter('alla')} />
              <Tab label="Slutavverkning" active={oskotatFilter === 'slutavverkning'} onClick={() => setOskotatFilter('slutavverkning')} />
              <Tab label="Gallring" active={oskotatFilter === 'gallring'} onClick={() => setOskotatFilter('gallring')} />
            </div>

            {oskotatLista.length === 0 && (
              <div style={{ padding: '16px 0', textAlign: 'center', color: muted, fontSize: 13 }}>Inget oskotat</div>
            )}

            {(oskotatExpanded ? oskotatLista : oskotatLista.slice(0, 3)).map((o) => (
              <div
                key={o.objekt_id}
                onClick={() => setSelectedObjekt(o)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 0', borderBottom: `1px solid ${divider}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.object_name || o.objekt_id}
                  </div>
                  <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>
                    {normalizeBolag(o.bolag)} {o.huvudtyp ? `\u00B7 ${o.huvudtyp}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 8 }}>
                  <span style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Math.round(o.oskotat_m3)} m³fub</span>
                  <span style={{
                    fontSize: 13, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                    background: `${statusColor(o.dagarLive)}20`,
                    color: statusColor(o.dagarLive),
                  }}>
                    {o.dagarLive}d
                  </span>
                </div>
              </div>
            ))}
            {oskotatLista.length > 3 && (
              <button
                onClick={() => setOskotatExpanded(v => !v)}
                style={{
                  display: 'block', width: '100%', minHeight: 44,
                  fontSize: 13, color: muted, textAlign: 'center', padding: '10px 0',
                  background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: ff,
                }}
              >
                {oskotatExpanded ? 'Visa färre' : `+${oskotatLista.length - 3} till`}
              </button>
            )}
          </div>

          {/* ============================================================ */}
          {/* Section 5: Dagsmål resterande månad */}
          {/* ============================================================ */}
          {dagsmal && dagsmal.kvar > 0 && dagsmal.rows.length === 0 && (
            <div style={{ ...card, marginBottom: 20, textAlign: 'center', color: muted, fontSize: 13 }}>
              Beställning ej satt
            </div>
          )}

          {dagsmal && dagsmal.kvar > 0 && dagsmal.rows.length > 0 && (
            <div style={{ ...card, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <span style={{ fontSize: 17, fontWeight: 600 }}>Dagsmål resterande</span>
                <span style={{ fontSize: 13, color: muted }}>{dagsmal.kvar} arbetsdagar</span>
              </div>

              {dagsmal.rows.map((row, i) => (
                <Link
                  key={i}
                  href="/maskinvy"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', textDecoration: 'none', color: 'inherit',
                    borderBottom: i < dagsmal.rows.length - 1 ? `1px solid ${divider}` : 'none',
                  }}
                >
                  <span style={{ fontSize: 13, color: muted }}>{row.label}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 13, color: muted }}>
                      {Math.round(row.kvar).toLocaleString()} m³fub
                    </span>
                    <span style={{ fontSize: 17, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(row.perDag)} m³fub/d
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {manadAvslutad && dagsmal === null && (
            <div style={{ ...card, marginBottom: 20, textAlign: 'center', color: muted, fontSize: 13 }}>
              Månaden är avslutad
            </div>
          )}

          {senasteUppdaterad && (
            <div style={{ textAlign: 'center', color: muted, fontSize: 13, padding: '8px 0' }}>
              Senast uppdaterad: {senasteUppdaterad}
            </div>
          )}
        </div>
      )}

      {selectedBolag && (
        <Sheet title={selectedBolag} onClose={() => setSelectedBolag(null)}>
          {(() => {
            const objekt = manadData.filter(o => normalizeBolag(o.bolag) === selectedBolag)
            if (objekt.length === 0) {
              return <div style={{ padding: '16px 0', textAlign: 'center', color: muted, fontSize: 13 }}>Inga objekt</div>
            }
            return objekt.map(o => (
              <div
                key={o.objekt_id}
                onClick={() => { setSelectedBolag(null); setSelectedObjekt(o) }}
                style={{
                  padding: '12px 0', borderBottom: `1px solid ${divider}`, cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0, marginRight: 8 }}>
                    {o.object_name || o.objekt_id}
                  </span>
                  <span style={{ fontSize: 13, color: muted }}>{o.huvudtyp || '—'}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: muted }}>
                  <span>Skördat {Math.round(o.skordat_m3 || 0).toLocaleString()}</span>
                  <span>Skotat {Math.round(o.skotat_m3 || 0).toLocaleString()}</span>
                  {(o.oskotat_m3 || 0) > 0 && (
                    <span style={{ color: '#FF9F0A' }}>Oskotat {Math.round(o.oskotat_m3).toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))
          })()}
        </Sheet>
      )}

      {selectedObjekt && (
        <Sheet title={selectedObjekt.object_name || selectedObjekt.objekt_id} onClose={() => setSelectedObjekt(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { label: 'VO-nummer', value: selectedObjekt.vo_nummer || '—' },
              { label: 'Bolag', value: normalizeBolag(selectedObjekt.bolag) },
              { label: 'Huvudtyp', value: selectedObjekt.huvudtyp || '—' },
              { label: 'Skogsägare', value: selectedObjekt.skogsagare || '—' },
              { label: 'Inköpare', value: selectedObjekt.inkopare || '—' },
              { label: 'Skördat', value: `${Math.round(selectedObjekt.skordat_m3 || 0).toLocaleString()} m³fub` },
              { label: 'Skotat', value: `${Math.round(selectedObjekt.skotat_m3 || 0).toLocaleString()} m³fub` },
              { label: 'Oskotat', value: `${Math.round(selectedObjekt.oskotat_m3 || 0).toLocaleString()} m³fub` },
              { label: 'Skördare klar', value: selectedObjekt.skordare_klar || '—' },
              { label: 'Skotare start', value: selectedObjekt.skotare_start || 'Ej startad' },
              ...(selectedObjekt.skordare_klar && !selectedObjekt.skotare_start
                ? [{ label: 'Dagar väntar', value: `${dagarSedan(selectedObjekt.skordare_klar)} d` }]
                : []),
            ].map((row, i, arr) => (
              <div
                key={row.label}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '12px 0',
                  borderBottom: i < arr.length - 1 ? `1px solid ${divider}` : 'none',
                }}
              >
                <span style={{ fontSize: 13, color: muted }}>{row.label}</span>
                <span style={{ fontSize: 17, color: text, fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </Sheet>
      )}

      {exportOpen && (
        <Sheet title="Exportera" onClose={() => setExportOpen(false)}>
          <button
            onClick={exportCsv}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', minHeight: 56, padding: '12px 0',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: text, fontFamily: ff, fontSize: 17, textAlign: 'left',
              borderBottom: `1px solid ${divider}`,
            }}
          >
            <span>Ladda ner CSV</span>
            <span style={{ fontSize: 13, color: muted }}>{`${ar}-${String(manad).padStart(2, '0')}.csv`}</span>
          </button>
          <button
            onClick={sharaSammanfattning}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', minHeight: 56, padding: '12px 0',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: text, fontFamily: ff, fontSize: 17, textAlign: 'left',
            }}
          >
            <span>Dela sammanfattning</span>
            <span style={{ fontSize: 13, color: muted }}>iOS Share / kopiera</span>
          </button>
        </Sheet>
      )}
    </div>
  )
}
