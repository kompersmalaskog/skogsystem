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

const EMPTY_KPI: KPIData = {
  totalVolym: 0, totalStammar: 0, prodPerG15h: 0, medelstam: 0,
  branslePerM3: 0, effektivitet: 0, processingPct: 0, terrainPct: 0,
  otherPct: 0, idlePct: 0,
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
  {
    icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>),
    label: 'Översikt', target: 'section-kpi',
  },
  {
    icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>),
    label: 'Produktion', target: 'section-chart',
  },
  {
    icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>),
    label: 'Tidsfördelning', target: 'section-time',
  },
  {
    icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="17" x2="15" y2="17"/></svg>),
    label: 'Dagsdata', target: 'section-table',
  },
]

export default function MaskinvyNyPage() {
  const [maskiner, setMaskiner] = useState<Maskin[]>([])
  const [valdMaskin, setValdMaskin] = useState<string>('')
  const [daily, setDaily] = useState<DailyData[]>([])
  const [kpi, setKpi] = useState<KPIData>(EMPTY_KPI)
  const [loading, setLoading] = useState(true)
  const [timeoutError, setTimeoutError] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
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
          setLoadError('Kunde inte hämta maskiner från databasen.')
          setLoading(false)
          return
        }
        if (data && data.length > 0) {
          setMaskiner(data)
          const skordare = data.find(m => m.typ === 'Skördare') || data[0]
          setValdMaskin(skordare.maskin_id.toString())
        } else {
          setLoadError('Inga maskiner registrerade.')
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error('dim_maskin timeout/error:', err)
        setTimeoutError(true)
        setLoadError(`Databasanslutningen tog för lång tid (${SUPABASE_TIMEOUT / 1000}s timeout).`)
        setLoading(false)
      })
  }, [])

  // Load production data
  const loadData = useCallback(async (maskinId: string) => {
    if (!maskinId) return
    setLoading(true)

    setTimeoutError(false)
    setLoadError(null)
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
        setDaily([])
        setKpi(EMPTY_KPI)
        setLoading(false)
        return
      }

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
      if (err?.message?.includes('Timeout')) {
        setTimeoutError(true)
        setLoadError(`Databasanslutningen tog för lång tid (${SUPABASE_TIMEOUT / 1000}s timeout).`)
      } else {
        setLoadError('Kunde inte hämta produktionsdata.')
      }
      setDaily([])
      setKpi(EMPTY_KPI)
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
                backgroundColor: daily.map(d => d.volym === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(48,209,88,0.5)'),
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
              tooltip: { backgroundColor: '#1c1c1e', titleColor: '#ffffff', bodyColor: '#8e8e93', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 },
            },
            scales: {
              x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8e8e93', font: { size: 10 } } },
              y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8e8e93' }, title: { display: true, text: 'm\u00B3', color: '#8e8e93', font: { size: 10 } } },
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

  const SIDEBAR_W = 220

  return (
    <>

      <style>{`
        @keyframes sfSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes sfPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <div style={{ background: '#000000', color: '#ffffff', minHeight: '100vh', fontFamily: "'Geist', system-ui, sans-serif" }}>

        {/* ===== SIDEBAR ===== */}
        <aside style={{
          position: 'fixed', left: 0, top: TOPBAR_H, bottom: 0,
          width: SIDEBAR_W, background: '#0e0e0e',
          fontFamily: "'Geist', system-ui, sans-serif",
          display: 'flex', flexDirection: 'column',
          padding: '24px 0', zIndex: 40, overflowY: 'auto',
        }}>
          {/* Brand */}
          <div style={{ padding: '0 20px', marginBottom: 32 }}>
            <span style={{ color: '#30d158', fontWeight: 900, letterSpacing: '-0.05em', fontSize: 18, }}>
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
                  background: isActive ? 'rgba(48,209,88,0.1)' : 'transparent',
                  color: isActive ? '#30d158' : '#6b7280',
                  borderRight: isActive ? '3px solid #30d158' : '3px solid transparent',
                  fontWeight: isActive ? 700 : 400,
                  fontSize: 14, cursor: 'pointer',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              )
            })}
          </nav>

          {/* Machine selector */}
          <div style={{ marginTop: 'auto', padding: '0 16px' }}>
            <div style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 12 }}>
              <p style={{ fontSize: 13, color: '#8e8e93', fontWeight: 500, marginBottom: 6 }}>Maskin</p>
              <select
                value={valdMaskin}
                onChange={e => setValdMaskin(e.target.value)}
                style={{
                  width: '100%', background: '#201f1f', border: 'none', borderRadius: 8,
                  color: '#ffffff', padding: '8px 10px', fontSize: 13, fontFamily: "'Geist', system-ui, sans-serif",
                  outline: 'none',
                }}
              >
                {maskiner.length > 0
                  ? maskiner.map(m => <option key={m.maskin_id} value={m.maskin_id}>{m.modell} ({m.typ})</option>)
                  : <option value="">Inga maskiner</option>
                }
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px' }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: loading ? '#ffb340' : loadError ? '#ff453a' : '#30d158',
                animation: 'sfPulse 2s infinite',
              }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#ffffff' }}>
                {loading ? 'Laddar' : loadError ? 'Fel' : 'Live'}
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
            <span style={{ fontSize: 13, fontWeight: 500, color: '#30d158' }}>
              Skördare
            </span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
            <span style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 700, fontSize: 16, color: '#ffffff' }}>
              {currentMaskin?.modell || (loading ? 'Laddar...' : 'Ingen maskin vald')}
            </span>
          </div>
          <div style={{
            background: loading ? 'rgba(255,179,64,0.1)' : loadError ? 'rgba(255,69,58,0.12)' : 'rgba(48,209,88,0.1)',
            color: loading ? '#ffb340' : loadError ? '#ff453a' : '#30d158',
            padding: '6px 16px', borderRadius: 9999,
            fontSize: 13, fontWeight: 500,
            fontFamily: "'Geist', system-ui, sans-serif",
          }}>
            {loading ? 'Laddar' : loadError ? 'Fel' : 'Live'}
          </div>
        </header>

        {/* ===== MAIN CONTENT ===== */}
        <main style={{ marginLeft: SIDEBAR_W, paddingTop: TOPBAR_H + 64, minHeight: '100vh' }}>
          <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

            {loading ? (
              <>
                <style>{`@keyframes mvnySkel { 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } } .mvny-skel { background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 100%); background-size: 200px 100%; border-radius: 8px; animation: mvnySkel 1.4s ease-in-out infinite; display: block; }`}</style>
                {/* KPI Cards skeleton */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ ...cardStyle, padding: 22 }}>
                      <div className="mvny-skel" style={{ height: 13, width: '50%', marginBottom: 16 }} />
                      <div className="mvny-skel" style={{ height: 32, width: '70%', marginBottom: 8 }} />
                      <div className="mvny-skel" style={{ height: 11, width: '30%' }} />
                    </div>
                  ))}
                </div>
                {/* Chart skeleton */}
                <div style={{ ...cardStyle, padding: 24, marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div style={{ flex: 1 }}>
                      <div className="mvny-skel" style={{ height: 13, width: 140, marginBottom: 8 }} />
                      <div className="mvny-skel" style={{ height: 11, width: 200 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div className="mvny-skel" style={{ height: 12, width: 60 }} />
                      <div className="mvny-skel" style={{ height: 12, width: 60 }} />
                    </div>
                  </div>
                  <div className="mvny-skel" style={{ height: 280 }} />
                </div>
                {/* Tidsfördelning skeleton */}
                <div style={{ ...cardStyle, padding: 24, marginBottom: 20 }}>
                  <div className="mvny-skel" style={{ height: 13, width: 120, marginBottom: 18 }} />
                  <div className="mvny-skel" style={{ height: 18, width: '100%', marginBottom: 14 }} />
                  <div style={{ display: 'flex', gap: 12 }}>
                    {[1, 2, 3, 4].map(i => <div key={i} className="mvny-skel" style={{ height: 12, width: 80 }} />)}
                  </div>
                </div>
              </>
            ) : loadError ? (
              <div style={{
                background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)',
                borderRadius: 12, padding: '20px 24px', marginTop: 40,
                display: 'flex', alignItems: 'flex-start', gap: 14, color: '#ff453a',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4, color: '#ffffff' }}>Kunde inte hämta data</div>
                  <div style={{ fontSize: 13, color: '#8e8e93' }}>{loadError}</div>
                  <button
                    onClick={() => valdMaskin && loadData(valdMaskin)}
                    style={{
                      marginTop: 14, minHeight: 44, padding: '0 18px', borderRadius: 10,
                      background: 'rgba(48,209,88,0.12)', border: '1px solid rgba(48,209,88,0.28)',
                      color: '#30d158', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 14, fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Försök igen
                  </button>
                </div>
              </div>
            ) : daily.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 12 }}>
                <div style={{ fontSize: 17, fontWeight: 600, color: '#ffffff' }}>Ingen produktionsdata</div>
                <div style={{ fontSize: 13, color: '#8e8e93' }}>Ingen data hittades för vald maskin i databasen.</div>
              </div>
            ) : (
              <>

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
                      <LegendDot color="#30d158" label="m³fub" />
                      <LegendDot color="#3fdfa5" label="Stammar" />
                    </div>
                  </div>
                  <div style={{ height: 280 }}>
                    {chartError ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8e8e93', gap: 8 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/><path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.21"/></svg>
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
                      <div style={{ width: `${kpi.processingPct}%`, background: '#30d158', transition: 'width 0.5s' }} />
                      <div style={{ width: `${kpi.terrainPct}%`, background: 'rgba(48,209,88,0.4)', transition: 'width 0.5s' }} />
                      <div style={{ width: `${kpi.otherPct}%`, background: '#353534', transition: 'width 0.5s' }} />
                      <div style={{ width: `${kpi.idlePct}%`, background: 'rgba(255,180,171,0.4)', transition: 'width 0.5s' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <TimeLegend color="#30d158" label="Processing" pct={kpi.processingPct} />
                      <TimeLegend color="rgba(48,209,88,0.4)" label="Terrängkörning" pct={kpi.terrainPct} />
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
                    <span style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 700 }}>Dagsdata</span>
                    <span style={{ fontSize: 11, color: '#8e8e93' }}>{daily.filter(d => d.volym > 0).length} produktionsdagar</span>
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
                            <td style={{ ...tdStyle, color: '#30d158', fontWeight: 600 }}>{d.volym.toFixed(1)}</td>
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
                  <Link href="/maskinvy" style={{ color: '#8e8e93', fontSize: 13, textDecoration: 'none' }}>
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
  background: '#1c1c1e',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
}

const labelStyle: React.CSSProperties = {
  fontSize: 13, color: '#8e8e93', fontWeight: 500,
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px', textAlign: 'left' as const, fontSize: 13,
  color: '#8e8e93', fontWeight: 500,
}

const tdStyle: React.CSSProperties = {
  padding: '10px 16px', color: '#ffffff',
}

// ── Sub-components ──

function KPICard({ label, value, unit, accent, border }: { label: string; value: string; unit: string; accent?: boolean; border?: boolean }) {
  return (
    <div style={{
      ...cardStyle, padding: 24, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', height: 120,
      borderLeft: border ? '4px solid #30d158' : undefined,
    }}>
      <p style={labelStyle}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: accent ? '#30d158' : '#ffffff', fontFamily: "'Geist', system-ui, sans-serif", lineHeight: 1.2 }}>
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
      <span style={{ fontSize: 11, color: '#8e8e93' }}>{label}</span>
    </div>
  )
}

function TimeLegend({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 12, height: 12, borderRadius: 4, background: color, flexShrink: 0 }} />
      <div>
        <p style={{ fontSize: 12, color: '#ffffff', fontWeight: 500, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, color: '#8e8e93', margin: 0 }}>{pct.toFixed(0)}%</p>
      </div>
    </div>
  )
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ fontSize: 13, color: '#8e8e93' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: highlight ? '#30d158' : '#ffffff', fontFamily: "'Geist', system-ui, sans-serif" }}>{value}</span>
    </div>
  )
}
