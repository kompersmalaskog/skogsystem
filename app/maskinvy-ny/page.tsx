'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Maskin = { maskin_id: number; modell: string; tillverkare: string; typ: string }

interface DailyData {
  datum: string
  volym: number
  stammar: number
  g15h: number
  bransle: number
}

interface KPIData {
  totalVolym: number
  totalStammar: number
  prodPerG15h: number
  medelstam: number
  branslePerM3: number
  effektivitet: number
  processingPct: number
  terrainPct: number
  otherPct: number
  idlePct: number
}

// Fallback demo data
const FALLBACK_DAILY: DailyData[] = [
  { datum: '2026-03-18', volym: 155.2, stammar: 640, g15h: 6.5, bransle: 70 },
  { datum: '2026-03-19', volym: 178.0, stammar: 730, g15h: 7.3, bransle: 76 },
  { datum: '2026-03-20', volym: 142.8, stammar: 620, g15h: 6.2, bransle: 68 },
  { datum: '2026-03-21', volym: 168.3, stammar: 710, g15h: 7.1, bransle: 74 },
  { datum: '2026-03-24', volym: 188.1, stammar: 780, g15h: 7.8, bransle: 82 },
  { datum: '2026-03-25', volym: 195.4, stammar: 820, g15h: 8.0, bransle: 85 },
  { datum: '2026-03-26', volym: 172.0, stammar: 700, g15h: 7.0, bransle: 75 },
]
const FALLBACK_KPI: KPIData = {
  totalVolym: 1199.8, totalStammar: 5000, prodPerG15h: 23.5, medelstam: 0.240,
  branslePerM3: 0.44, effektivitet: 72, processingPct: 55, terrainPct: 18,
  otherPct: 12, idlePct: 15,
}

const TOPBAR_H = 56 // pixels, from layout.tsx TopBar

const SUPABASE_TIMEOUT = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout efter ${ms / 1000}s — ingen respons från databasen.`)), ms)
    ),
  ])
}

const NAV_SECTIONS = [
  { icon: 'dashboard', label: 'Översikt', target: 'section-kpi' },
  { icon: 'bar_chart', label: 'Produktion', target: 'section-chart' },
  { icon: 'schedule', label: 'Tidsfördelning', target: 'section-time' },
  { icon: 'table_chart', label: 'Dagsdata', target: 'section-table' },
]

export default function MaskinvyNyPage() {
  const [maskiner, setMaskiner] = useState<Maskin[]>([])
  const [valdMaskin, setValdMaskin] = useState<string>('')
  const [daily, setDaily] = useState<DailyData[]>([])
  const [kpi, setKpi] = useState<KPIData>(FALLBACK_KPI)
  const [loading, setLoading] = useState(true)
  const [usingFallback, setUsingFallback] = useState(false)
  const [timeoutError, setTimeoutError] = useState(false)
  const [activeNav, setActiveNav] = useState('section-kpi')
  const dailyChartRef = useRef<any>(null)
  const dailyCanvasRef = useRef<HTMLCanvasElement>(null)
  const [chartError, setChartError] = useState(false)

  // Load machines
  useEffect(() => {
    withTimeout(
      supabase.from('dim_maskin').select('maskin_id,modell,tillverkare,typ'),
      SUPABASE_TIMEOUT
    )
      .then(({ data, error }) => {
        if (error) {
          console.error('dim_maskin error:', error)
          setUsingFallback(true)
          setDaily(FALLBACK_DAILY)
          setKpi(FALLBACK_KPI)
          setLoading(false)
          return
        }
        if (data && data.length > 0) {
          setMaskiner(data)
          const skordare = data.find(m => m.typ === 'Skördare') || data[0]
          setValdMaskin(skordare.maskin_id.toString())
        } else {
          setUsingFallback(true)
          setDaily(FALLBACK_DAILY)
          setKpi(FALLBACK_KPI)
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error('dim_maskin timeout/error:', err)
        setTimeoutError(true)
        setUsingFallback(true)
        setDaily(FALLBACK_DAILY)
        setKpi(FALLBACK_KPI)
        setLoading(false)
      })
  }, [])

  // Load production data
  const loadData = useCallback(async (maskinId: string) => {
    if (!maskinId) return
    setLoading(true)

    setTimeoutError(false)
    try {
      const [prodRes, tidRes] = await withTimeout(
        Promise.all([
          supabase.from('fakt_produktion')
            .select('datum,volym_m3sub,stammar')
            .eq('maskin_id', maskinId)
            .order('datum', { ascending: false })
            .limit(500),
          supabase.from('fakt_tid')
            .select('datum,processing_sek,terrain_sek,other_work_sek,bransle_liter')
            .eq('maskin_id', maskinId)
            .order('datum', { ascending: false })
            .limit(500)
        ]),
        SUPABASE_TIMEOUT
      )

      if (prodRes.error) console.error('fakt_produktion error:', prodRes.error)
      if (tidRes.error) console.error('fakt_tid error:', tidRes.error)

      const hasData = (prodRes.data && prodRes.data.length > 0) || (tidRes.data && tidRes.data.length > 0)

      if (!hasData) {
        setUsingFallback(true)
        setDaily(FALLBACK_DAILY)
        setKpi(FALLBACK_KPI)
        setLoading(false)
        return
      }

      setUsingFallback(false)

      const prodByDay: Record<string, { volym: number; stammar: number }> = {}
      const tidByDay: Record<string, { proc: number; terr: number; other: number; bransle: number }> = {}

      if (prodRes.data) {
        for (const r of prodRes.data) {
          if (!prodByDay[r.datum]) prodByDay[r.datum] = { volym: 0, stammar: 0 }
          prodByDay[r.datum].volym += r.volym_m3sub || 0
          prodByDay[r.datum].stammar += r.stammar || 0
        }
      }

      if (tidRes.data) {
        for (const r of tidRes.data) {
          if (!tidByDay[r.datum]) tidByDay[r.datum] = { proc: 0, terr: 0, other: 0, bransle: 0 }
          tidByDay[r.datum].proc += r.processing_sek || 0
          tidByDay[r.datum].terr += r.terrain_sek || 0
          tidByDay[r.datum].other += r.other_work_sek || 0
          tidByDay[r.datum].bransle += r.bransle_liter || 0
        }
      }

      const allDates = new Set([...Object.keys(prodByDay), ...Object.keys(tidByDay)])
      const dailyArr: DailyData[] = Array.from(allDates).sort().map(d => {
        const p = prodByDay[d] || { volym: 0, stammar: 0 }
        const t = tidByDay[d] || { proc: 0, terr: 0, other: 0, bransle: 0 }
        const totalSek = t.proc + t.terr + t.other
        return { datum: d, volym: p.volym, stammar: p.stammar, g15h: totalSek / 3600, bransle: t.bransle }
      })

      setDaily(dailyArr)

      const totVol = dailyArr.reduce((s, d) => s + d.volym, 0)
      const totSt = dailyArr.reduce((s, d) => s + d.stammar, 0)
      const totG15h = dailyArr.reduce((s, d) => s + d.g15h, 0)
      const totBr = dailyArr.reduce((s, d) => s + d.bransle, 0)

      let totProc = 0, totTerr = 0, totOther = 0
      if (tidRes.data) {
        for (const r of tidRes.data) {
          totProc += r.processing_sek || 0
          totTerr += r.terrain_sek || 0
          totOther += r.other_work_sek || 0
        }
      }
      const totTime = totProc + totTerr + totOther
      const estTotal = totTime > 0 ? totTime / 0.85 : 1

      setKpi({
        totalVolym: totVol,
        totalStammar: totSt,
        prodPerG15h: totG15h > 0 ? totVol / totG15h : 0,
        medelstam: totSt > 0 ? totVol / totSt : 0,
        branslePerM3: totVol > 0 ? totBr / totVol : 0,
        effektivitet: totTime > 0 ? (totProc / totTime) * 100 : 0,
        processingPct: totTime > 0 ? (totProc / estTotal) * 100 : 0,
        terrainPct: totTime > 0 ? (totTerr / estTotal) * 100 : 0,
        otherPct: totTime > 0 ? (totOther / estTotal) * 100 : 0,
        idlePct: 15,
      })
    } catch (err: any) {
      console.error('loadData error:', err)
      if (err?.message?.includes('Timeout')) setTimeoutError(true)
      setUsingFallback(true)
      setDaily(FALLBACK_DAILY)
      setKpi(FALLBACK_KPI)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    if (valdMaskin) loadData(valdMaskin)
  }, [valdMaskin, loadData])

  // Chart.js
  useEffect(() => {
    if (!dailyCanvasRef.current || daily.length === 0) return
    const loadChart = async () => {
      try {
        if (!(window as any).Chart) {
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
          document.head.appendChild(script)
          await new Promise<void>((resolve, reject) => {
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('Chart.js CDN failed'))
          })
        }
        const Chart = (window as any).Chart
        if (!Chart) throw new Error('Chart.js not available')
        if (dailyChartRef.current) dailyChartRef.current.destroy()

        const labels = daily.map(d => {
          const dt = new Date(d.datum)
          return `${dt.getDate()}/${dt.getMonth() + 1}`
        })

        dailyChartRef.current = new Chart(dailyCanvasRef.current, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'm\u00B3fub/dag',
                data: daily.map(d => d.volym),
                backgroundColor: daily.map(d => d.volym === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,196,140,0.5)'),
                borderRadius: 4,
                yAxisID: 'y',
                order: 1,
              },
              {
                label: 'Stammar',
                data: daily.map(d => d.stammar),
                type: 'line' as const,
                borderColor: 'rgba(63,223,165,0.6)',
                backgroundColor: 'rgba(63,223,165,0.05)',
                pointBackgroundColor: daily.map(d => d.stammar > 0 ? '#3fdfa5' : 'transparent'),
                pointRadius: daily.map(d => d.stammar > 0 ? 3 : 0),
                tension: 0.3,
                yAxisID: 'y2',
                order: 0,
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index' as const, intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: { backgroundColor: '#1a1a18', titleColor: '#e5e2e1', bodyColor: '#85948b', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 },
            },
            scales: {
              x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#85948b', font: { size: 10 } } },
              y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#85948b' }, title: { display: true, text: 'm\u00B3', color: '#85948b', font: { size: 10 } } },
              y2: { position: 'right' as const, grid: { drawOnChartArea: false }, ticks: { color: '#3fdfa5' }, title: { display: true, text: 'Stammar', color: '#3fdfa5', font: { size: 10 } } },
            },
          },
        })
        setChartError(false)
      } catch (err) {
        console.error('Chart.js load error:', err)
        setChartError(true)
      }
    }
    loadChart()
    return () => { if (dailyChartRef.current) dailyChartRef.current.destroy() }
  }, [daily])

  const currentMaskin = maskiner.find(m => m.maskin_id.toString() === valdMaskin)
  const fmt = (n: number, d = 1) => n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

  const SIDEBAR_W = 240

  return (
    <>
      {/* Google Fonts for Manrope + Material Symbols */}
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />

      <style>{`
        .msym { font-family: 'Material Symbols Outlined'; font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; font-size: 24px; }
        @keyframes sfSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes sfPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <div style={{ background: '#111110', color: '#e5e2e1', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>

        {/* ===== SIDEBAR ===== */}
        <aside style={{
          position: 'fixed', left: 0, top: TOPBAR_H, bottom: 0,
          width: SIDEBAR_W, background: '#0e0e0e',
          boxShadow: '1px 0 0 0 rgba(255,255,255,0.05)',
          fontFamily: "'Manrope', sans-serif",
          display: 'flex', flexDirection: 'column',
          padding: '24px 0', zIndex: 40, overflowY: 'auto',
        }}>
          {/* Brand */}
          <div style={{ padding: '0 20px', marginBottom: 32 }}>
            <span style={{ color: '#00c48c', fontWeight: 900, letterSpacing: '-0.05em', fontSize: 18, textTransform: 'uppercase' }}>
              Synthetic Forest
            </span>
          </div>

          {/* Nav items */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV_SECTIONS.map(item => {
              const isActive = activeNav === item.target
              return (
                <div key={item.label} onClick={() => {
                  setActiveNav(item.target)
                  document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 20px',
                  background: isActive ? 'rgba(0,196,140,0.1)' : 'transparent',
                  color: isActive ? '#00c48c' : '#6b7280',
                  borderRight: isActive ? '3px solid #00c48c' : '3px solid transparent',
                  fontWeight: isActive ? 700 : 400,
                  fontSize: 14, cursor: 'pointer',
                }}>
                  <span className="msym">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              )
            })}
          </nav>

          {/* Machine selector */}
          <div style={{ marginTop: 'auto', padding: '0 16px' }}>
            <div style={{ background: '#161614', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 12 }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#85948b', fontWeight: 600, marginBottom: 6 }}>Maskin</p>
              <select
                value={valdMaskin}
                onChange={e => setValdMaskin(e.target.value)}
                style={{
                  width: '100%', background: '#201f1f', border: 'none', borderRadius: 8,
                  color: '#e5e2e1', padding: '8px 10px', fontSize: 13, fontFamily: "'Inter', sans-serif",
                  outline: 'none',
                }}
              >
                {maskiner.length > 0
                  ? maskiner.map(m => <option key={m.maskin_id} value={m.maskin_id}>{m.modell} ({m.typ})</option>)
                  : <option value="">Demodata</option>
                }
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px' }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: loading ? '#ffb340' : timeoutError ? '#ff5555' : usingFallback ? '#ffb340' : '#00c48c',
                animation: 'sfPulse 2s infinite',
              }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#e5e2e1', letterSpacing: '0.05em' }}>
                {loading ? 'LADDAR...' : timeoutError ? 'TIMEOUT' : usingFallback ? 'DEMO' : 'ONLINE'}
              </span>
            </div>
          </div>
        </aside>

        {/* ===== HEADER ===== */}
        <header style={{
          position: 'fixed', top: TOPBAR_H, right: 0,
          width: `calc(100% - ${SIDEBAR_W}px)`,
          height: 64, background: 'rgba(19,19,19,0.85)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px', zIndex: 30,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: "'Manrope', sans-serif", textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: 11, fontWeight: 700, color: '#00c48c' }}>
              Skördare
            </span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
            <span style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700, fontSize: 16, color: '#e5e2e1' }}>
              {currentMaskin?.modell || (usingFallback ? 'Demomaskin' : 'Laddar...')}
            </span>
          </div>
          <div style={{
            background: loading ? 'rgba(255,179,64,0.1)' : usingFallback ? 'rgba(255,179,64,0.1)' : 'rgba(0,196,140,0.1)',
            color: loading ? '#ffb340' : usingFallback ? '#ffb340' : '#00c48c',
            padding: '6px 16px', borderRadius: 9999,
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
            fontFamily: "'Manrope', sans-serif",
          }}>
            {loading ? 'Laddar...' : timeoutError ? 'Timeout' : usingFallback ? 'Demodata' : 'Live'}
          </div>
        </header>

        {/* ===== MAIN CONTENT ===== */}
        <main style={{ marginLeft: SIDEBAR_W, paddingTop: TOPBAR_H + 64, minHeight: '100vh' }}>
          <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, color: '#85948b', gap: 12 }}>
                <span className="msym" style={{ animation: 'sfSpin 1s linear infinite' }}>progress_activity</span>
                Laddar data...
              </div>
            ) : (
              <>
                {/* Timeout banner */}
                {timeoutError && (
                  <div style={{
                    background: 'rgba(255,85,85,0.1)', border: '1px solid rgba(255,85,85,0.3)',
                    borderRadius: 12, padding: '12px 20px', marginBottom: 20,
                    display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#ff5555',
                  }}>
                    <span className="msym" style={{ fontSize: 20 }}>error</span>
                    Databasanslutningen tog för lång tid (10s timeout). Visar demodata istället.
                  </div>
                )}

                {/* Fallback banner */}
                {usingFallback && !timeoutError && (
                  <div style={{
                    background: 'rgba(255,179,64,0.1)', border: '1px solid rgba(255,179,64,0.3)',
                    borderRadius: 12, padding: '12px 20px', marginBottom: 20,
                    display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#ffb340',
                  }}>
                    <span className="msym" style={{ fontSize: 20 }}>info</span>
                    Visar demodata — ingen produktionsdata hittades i databasen.
                  </div>
                )}

                {/* KPI Cards */}
                <div id="section-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20, scrollMarginTop: TOPBAR_H + 64 + 16 }}>
                  <KPICard label="Total volym" value={fmt(kpi.totalVolym)} unit="m³fub" />
                  <KPICard label="Effektivitet" value={fmt(kpi.effektivitet, 0)} unit="%" accent />
                  <KPICard label="Medelstam" value={fmt(kpi.medelstam, 3)} unit="m³/st" />
                  <KPICard label="Bränsle" value={fmt(kpi.branslePerM3, 2)} unit="l/m³" border />
                </div>

                {/* Chart */}
                <div id="section-chart" style={{ ...cardStyle, padding: 24, marginBottom: 20, scrollMarginTop: TOPBAR_H + 64 + 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                      <p style={labelStyle}>Daglig produktion</p>
                      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        {daily.length} dagar | {daily.filter(d => d.volym > 0).length} med produktion
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <LegendDot color="#00c48c" label="m³fub" />
                      <LegendDot color="#3fdfa5" label="Stammar" />
                    </div>
                  </div>
                  <div style={{ height: 280 }}>
                    {chartError ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#85948b', gap: 8 }}>
                        <span className="msym" style={{ fontSize: 20 }}>cloud_off</span>
                        Kunde inte ladda diagram — Chart.js ej tillgänglig.
                      </div>
                    ) : (
                      <canvas ref={dailyCanvasRef} />
                    )}
                  </div>
                </div>

                {/* Time + Stats row */}
                <div id="section-time" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, scrollMarginTop: TOPBAR_H + 64 + 16 }}>
                  {/* Time Distribution */}
                  <div style={{ ...cardStyle, padding: 24 }}>
                    <p style={labelStyle}>Tidsfördelning</p>
                    <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4, marginBottom: 20 }}>Driftstatus</p>

                    {/* Stacked bar */}
                    <div style={{ height: 40, width: '100%', display: 'flex', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                      <div style={{ width: `${kpi.processingPct}%`, background: '#00c48c', transition: 'width 0.5s' }} />
                      <div style={{ width: `${kpi.terrainPct}%`, background: 'rgba(0,196,140,0.4)', transition: 'width 0.5s' }} />
                      <div style={{ width: `${kpi.otherPct}%`, background: '#353534', transition: 'width 0.5s' }} />
                      <div style={{ width: `${kpi.idlePct}%`, background: 'rgba(255,180,171,0.4)', transition: 'width 0.5s' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <TimeLegend color="#00c48c" label="Processing" pct={kpi.processingPct} />
                      <TimeLegend color="rgba(0,196,140,0.4)" label="Terrängkörning" pct={kpi.terrainPct} />
                      <TimeLegend color="#353534" label="Övrigt arbete" pct={kpi.otherPct} />
                      <TimeLegend color="rgba(255,180,171,0.4)" label="Stillestånd" pct={kpi.idlePct} />
                    </div>
                  </div>

                  {/* Production Summary */}
                  <div style={{ ...cardStyle, padding: 24 }}>
                    <p style={labelStyle}>Produktionssammanfattning</p>
                    <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4, marginBottom: 20 }}>Alla dagar</p>

                    <StatRow label="Total volym" value={`${fmt(kpi.totalVolym)} m³fub`} />
                    <StatRow label="Totalt stammar" value={fmt(kpi.totalStammar, 0)} />
                    <StatRow label="Produktivitet" value={`${fmt(kpi.prodPerG15h)} m³/G15h`} highlight />
                    <StatRow label="Medelstam" value={`${fmt(kpi.medelstam, 3)} m³`} />
                    <StatRow label="Bränsleförbrukning" value={`${fmt(kpi.branslePerM3, 2)} l/m³`} />
                    <StatRow label="Dagar med data" value={`${daily.filter(d => d.volym > 0).length}`} />
                  </div>
                </div>

                {/* Table */}
                <div id="section-table" style={{ ...cardStyle, overflow: 'hidden', marginBottom: 20, scrollMarginTop: TOPBAR_H + 64 + 16 }}>
                  <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>Dagsdata</span>
                    <span style={{ fontSize: 11, color: '#85948b' }}>{daily.filter(d => d.volym > 0).length} produktionsdagar</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          {['Datum', 'Volym m³', 'Stammar', 'G15h', 'm³/G15h', 'Bränsle (l)'].map(h => (
                            <th key={h} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...daily].reverse().filter(d => d.volym > 0).slice(0, 20).map((d, i) => (
                          <tr key={d.datum} style={{
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                          }}>
                            <td style={tdStyle}>{d.datum}</td>
                            <td style={{ ...tdStyle, color: '#00c48c', fontWeight: 600 }}>{d.volym.toFixed(1)}</td>
                            <td style={tdStyle}>{Math.round(d.stammar)}</td>
                            <td style={tdStyle}>{d.g15h.toFixed(1)}</td>
                            <td style={tdStyle}>{d.g15h > 0 ? (d.volym / d.g15h).toFixed(1) : '-'}</td>
                            <td style={tdStyle}>{d.bransle.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Back link */}
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <Link href="/maskinvy" style={{ color: '#85948b', fontSize: 13, textDecoration: 'none' }}>
                    &larr; Tillbaka till klassisk maskinvy
                  </Link>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </>
  )
}

// ── Shared styles ──

const cardStyle: React.CSSProperties = {
  background: '#161614',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em',
  color: '#85948b', fontWeight: 600,
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px', textAlign: 'left' as const, fontSize: 11,
  textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#85948b', fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '10px 16px', color: '#e5e2e1',
}

// ── Sub-components ──

function KPICard({ label, value, unit, accent, border }: { label: string; value: string; unit: string; accent?: boolean; border?: boolean }) {
  return (
    <div style={{
      ...cardStyle, padding: 24, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', height: 120,
      borderLeft: border ? '4px solid #00c48c' : undefined,
    }}>
      <p style={labelStyle}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: accent ? '#00c48c' : '#e5e2e1', fontFamily: "'Manrope', sans-serif", lineHeight: 1.2 }}>
          {value}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>{unit}</span>
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 11, color: '#85948b' }}>{label}</span>
    </div>
  )
}

function TimeLegend({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 12, height: 12, borderRadius: 4, background: color, flexShrink: 0 }} />
      <div>
        <p style={{ fontSize: 12, color: '#e5e2e1', fontWeight: 500, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, color: '#85948b', margin: 0 }}>{pct.toFixed(0)}%</p>
      </div>
    </div>
  )
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ fontSize: 13, color: '#85948b' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: highlight ? '#00c48c' : '#e5e2e1', fontFamily: "'Manrope', sans-serif" }}>{value}</span>
    </div>
  )
}
