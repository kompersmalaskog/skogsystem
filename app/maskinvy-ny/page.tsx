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

type NavItem = 'oversikt' | 'produktion' | 'tradslag' | 'objekt'

export default function MaskinvyNyPage() {
  const [maskiner, setMaskiner] = useState<Maskin[]>([])
  const [valdMaskin, setValdMaskin] = useState<string>('')
  const [activeNav, setActiveNav] = useState<NavItem>('oversikt')
  const [daily, setDaily] = useState<DailyData[]>([])
  const [kpi, setKpi] = useState<KPIData>({
    totalVolym: 0, totalStammar: 0, prodPerG15h: 0, medelstam: 0,
    branslePerM3: 0, effektivitet: 0, processingPct: 0, terrainPct: 0,
    otherPct: 0, idlePct: 0
  })
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const dailyChartRef = useRef<any>(null)
  const dailyCanvasRef = useRef<HTMLCanvasElement>(null)

  // Load machines
  useEffect(() => {
    supabase.from('dim_maskin').select('maskin_id,modell,tillverkare,typ')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setMaskiner(data)
          const skordare = data.find(m => m.typ === 'Skördare') || data[0]
          setValdMaskin(skordare.maskin_id.toString())
        }
      })
  }, [])

  // Load production data when machine changes
  const loadData = useCallback(async (maskinId: string) => {
    if (!maskinId) return
    setLoading(true)

    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const fromDate = thirtyDaysAgo.toISOString().slice(0, 10)

    const [prodRes, tidRes] = await Promise.all([
      supabase.from('fakt_produktion')
        .select('datum,volym_m3sub,antal_stammar')
        .eq('maskin_id', maskinId)
        .gte('datum', fromDate)
        .order('datum'),
      supabase.from('fakt_tid')
        .select('datum,processing_sek,terrain_sek,other_work_sek,bransle_liter')
        .eq('maskin_id', maskinId)
        .gte('datum', fromDate)
        .order('datum')
    ])

    const prodByDay: Record<string, { volym: number; stammar: number }> = {}
    const tidByDay: Record<string, { proc: number; terr: number; other: number; bransle: number }> = {}

    if (prodRes.data) {
      for (const r of prodRes.data) {
        if (!prodByDay[r.datum]) prodByDay[r.datum] = { volym: 0, stammar: 0 }
        prodByDay[r.datum].volym += r.volym_m3sub || 0
        prodByDay[r.datum].stammar += r.antal_stammar || 0
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
      const g15h = totalSek / 3600
      return { datum: d, volym: p.volym, stammar: p.stammar, g15h, bransle: t.bransle }
    })

    setDaily(dailyArr)

    // Calculate KPIs
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
    const estTotal = totTime > 0 ? totTime / 0.85 : 1 // Estimate idle as 15%

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

    setLoading(false)
  }, [])

  useEffect(() => {
    if (valdMaskin) loadData(valdMaskin)
  }, [valdMaskin, loadData])

  // Chart.js daily production chart
  useEffect(() => {
    if (!dailyCanvasRef.current || daily.length === 0) return
    const loadChart = async () => {
      if (!(window as any).Chart) {
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
        document.head.appendChild(script)
        await new Promise(r => script.onload = r)
      }
      const Chart = (window as any).Chart
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
            tooltip: {
              backgroundColor: '#1a1a18',
              titleColor: '#e5e2e1',
              bodyColor: '#85948b',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
            },
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#85948b', font: { size: 10 } } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#85948b' }, title: { display: true, text: 'm\u00B3', color: '#85948b', font: { size: 10 } } },
            y2: { position: 'right' as const, grid: { drawOnChartArea: false }, ticks: { color: '#3fdfa5' }, title: { display: true, text: 'Stammar', color: '#3fdfa5', font: { size: 10 } } },
          },
        },
      })
    }
    loadChart()
    return () => { if (dailyChartRef.current) dailyChartRef.current.destroy() }
  }, [daily])

  const currentMaskin = maskiner.find(m => m.maskin_id.toString() === valdMaskin)
  const fmt = (n: number, d = 1) => n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

  return (
    <div className="dark" style={{ fontFamily: "'Inter', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />

      <style>{`
        .sf-body { background: #111110; color: #e5e2e1; min-height: 100vh; }
        .sf-card { background: #161614; border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; }
        .sf-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #85948b; font-weight: 600; font-family: 'Inter', sans-serif; }
        .sf-value { font-size: 32px; font-weight: 800; color: #e5e2e1; font-family: 'Manrope', sans-serif; line-height: 1.2; }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .sf-sidebar { transition: width 0.3s ease; }
        @media (max-width: 1024px) {
          .sf-sidebar-desktop { display: none !important; }
          .sf-main { margin-left: 0 !important; }
        }
        @media (min-width: 1025px) {
          .sf-mobile-toggle { display: none !important; }
        }
      `}</style>

      <div className="sf-body">
        {/* Desktop Sidebar */}
        <aside className="sf-sidebar sf-sidebar-desktop h-full fixed left-0 top-0 z-40 flex flex-col py-6 items-center overflow-hidden group"
          style={{
            width: sidebarOpen ? 256 : 80,
            background: '#0e0e0e',
            boxShadow: '1px 0 0 0 rgba(255,255,255,0.05)',
            fontFamily: "'Manrope', sans-serif",
            transition: 'width 0.3s ease',
          }}
          onMouseEnter={() => setSidebarOpen(true)}
          onMouseLeave={() => setSidebarOpen(false)}
        >
          <div className="mb-10 flex items-center gap-3 px-4 w-full" style={{ minHeight: 32 }}>
            <span style={{ color: '#00c48c', fontWeight: 900, letterSpacing: '-0.05em', fontSize: 20, textTransform: 'uppercase', flexShrink: 0 }}>SF</span>
            <span style={{
              fontWeight: 900, letterSpacing: '-0.05em', fontSize: 20, textTransform: 'uppercase',
              color: '#00c48c', whiteSpace: 'nowrap',
              opacity: sidebarOpen ? 1 : 0, transition: 'opacity 0.2s',
            }}>Synthetic Forest</span>
          </div>

          <nav className="flex flex-col w-full gap-1">
            {([
              { id: 'oversikt' as NavItem, icon: 'dashboard', label: 'Översikt' },
              { id: 'produktion' as NavItem, icon: 'bar_chart', label: 'Produktion' },
              { id: 'tradslag' as NavItem, icon: 'forest', label: 'Trädslag' },
              { id: 'objekt' as NavItem, icon: 'location_on', label: 'Objekt' },
            ]).map(item => (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className="flex items-center gap-4 py-3 w-full text-left"
                style={{
                  paddingLeft: sidebarOpen ? 16 : 24,
                  paddingRight: 16,
                  background: activeNav === item.id ? 'rgba(0,196,140,0.1)' : 'transparent',
                  color: activeNav === item.id ? '#00c48c' : '#6b7280',
                  borderRight: activeNav === item.id ? '4px solid #00c48c' : '4px solid transparent',
                  fontWeight: activeNav === item.id ? 700 : 400,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  transition: 'all 0.2s',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{item.icon}</span>
                <span style={{
                  opacity: sidebarOpen ? 1 : 0,
                  transition: 'opacity 0.2s',
                  whiteSpace: 'nowrap',
                }}>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Machine selector at bottom */}
          <div className="mt-auto w-full px-4">
            <div className="sf-card p-3" style={{ opacity: sidebarOpen ? 1 : 0, transition: 'opacity 0.2s' }}>
              <p className="sf-label mb-1">Maskin</p>
              <select
                value={valdMaskin}
                onChange={e => setValdMaskin(e.target.value)}
                style={{
                  width: '100%',
                  background: '#201f1f',
                  border: 'none',
                  borderRadius: 8,
                  color: '#e5e2e1',
                  padding: '6px 8px',
                  fontSize: 13,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {maskiner.map(m => (
                  <option key={m.maskin_id} value={m.maskin_id}>{m.modell}</option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex items-center gap-2 px-1" style={{ opacity: sidebarOpen ? 1 : 0, transition: 'opacity 0.2s' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00c48c', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#e5e2e1' }}>ONLINE</span>
            </div>
          </div>
        </aside>

        {/* Top Header */}
        <header className="fixed top-0 right-0 z-30 flex items-center justify-between px-6 md:px-8"
          style={{
            width: 'calc(100% - 5rem)',
            height: 76,
            background: 'rgba(19,19,19,0.8)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {/* Mobile menu button */}
          <button className="sf-mobile-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: 'none', border: 'none', color: '#85948b', cursor: 'pointer', marginRight: 12 }}>
            <span className="material-symbols-outlined">menu</span>
          </button>

          <div className="flex items-center gap-3">
            <h1 style={{
              fontFamily: "'Manrope', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              fontSize: 11,
              fontWeight: 700,
              color: '#00c48c',
            }}>
              {activeNav === 'oversikt' ? 'Skördare' : activeNav === 'produktion' ? 'Produktion' : activeNav === 'tradslag' ? 'Trädslag' : 'Objekt'}
            </h1>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
            <span style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700, fontSize: 16, color: '#e5e2e1' }}>
              {currentMaskin?.modell || 'Laddar...'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div style={{
              background: 'rgba(0,196,140,0.1)',
              color: '#00c48c',
              padding: '6px 16px',
              borderRadius: 9999,
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontFamily: "'Manrope', sans-serif",
            }}>
              Maskinstatus: Live
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="sf-main" style={{ marginLeft: 80, paddingTop: 76, minHeight: '100vh' }}>
          <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, color: '#85948b' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite', marginRight: 12 }}>progress_activity</span>
                Laddar data...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                  <KPICard label="Dagsvolym (30d)" value={fmt(kpi.totalVolym)} unit="m\u00B3fub" accent={false} />
                  <KPICard label="Effektivitet" value={fmt(kpi.effektivitet, 0)} unit="%" accent={true} />
                  <KPICard label="Snittvolym" value={fmt(kpi.medelstam, 2)} unit="m\u00B3/stam" accent={false} />
                  <KPICard label="Bränsle" value={fmt(kpi.branslePerM3)} unit="l/m\u00B3" accent={false} border />
                </div>

                {/* Main Charts Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
                  {/* Daily Production Chart */}
                  <div className="sf-card" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                      <div>
                        <p className="sf-label">Daglig produktion</p>
                        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Senaste 30 dagarna</p>
                      </div>
                      <div style={{ display: 'flex', gap: 16 }}>
                        <LegendDot color="#00c48c" label="m\u00B3fub" />
                        <LegendDot color="#3fdfa5" label="Stammar" />
                      </div>
                    </div>
                    <div style={{ height: 280 }}>
                      <canvas ref={dailyCanvasRef} />
                    </div>
                  </div>
                </div>

                {/* Time Distribution + Production Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
                  {/* Time Distribution */}
                  <div className="sf-card" style={{ padding: 24 }}>
                    <div style={{ marginBottom: 24 }}>
                      <p className="sf-label">Tidsfördelning</p>
                      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Driftstatus senaste 30 dagarna</p>
                    </div>

                    {/* Stacked bar */}
                    <div style={{ height: 48, width: '100%', display: 'flex', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
                      <div style={{ width: `${kpi.processingPct}%`, background: '#00c48c', transition: 'width 0.5s' }} />
                      <div style={{ width: `${kpi.terrainPct}%`, background: 'rgba(0,196,140,0.4)', transition: 'width 0.5s' }} />
                      <div style={{ width: `${kpi.otherPct}%`, background: '#353534', transition: 'width 0.5s' }} />
                      <div style={{ width: `${kpi.idlePct}%`, background: 'rgba(255,180,171,0.4)', transition: 'width 0.5s' }} />
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <TimeLegend color="#00c48c" label="Processing" pct={kpi.processingPct} />
                      <TimeLegend color="rgba(0,196,140,0.4)" label="Terrängkörning" pct={kpi.terrainPct} />
                      <TimeLegend color="#353534" label="Övrigt arbete" pct={kpi.otherPct} />
                      <TimeLegend color="rgba(255,180,171,0.4)" label="Stillestånd" pct={kpi.idlePct} />
                    </div>
                  </div>

                  {/* Production Summary */}
                  <div className="sf-card" style={{ padding: 24 }}>
                    <div style={{ marginBottom: 24 }}>
                      <p className="sf-label">Produktionssammanfattning</p>
                      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Period: 30 dagar</p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      <StatRow label="Total volym" value={`${fmt(kpi.totalVolym)} m\u00B3fub`} />
                      <StatRow label="Totalt stammar" value={fmt(kpi.totalStammar, 0)} />
                      <StatRow label="Produktivitet" value={`${fmt(kpi.prodPerG15h)} m\u00B3/G15h`} highlight />
                      <StatRow label="Medelstam" value={`${fmt(kpi.medelstam, 3)} m\u00B3`} />
                      <StatRow label="Bränsleförbrukning" value={`${fmt(kpi.branslePerM3)} l/m\u00B3`} />
                      <StatRow label="Antal dagar med data" value={`${daily.filter(d => d.volym > 0).length}`} />
                    </div>
                  </div>
                </div>

                {/* Daily Production Table */}
                <div className="sf-card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700, color: '#e5e2e1' }}>Dagsdata</p>
                    <p style={{ fontSize: 11, color: '#85948b' }}>{daily.length} dagar</p>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <th style={thStyle}>Datum</th>
                          <th style={thStyle}>Volym m\u00B3</th>
                          <th style={thStyle}>Stammar</th>
                          <th style={thStyle}>G15h</th>
                          <th style={thStyle}>m\u00B3/G15h</th>
                          <th style={thStyle}>Bränsle (l)</th>
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
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <Link href="/maskinvy" style={{ color: '#85948b', fontSize: 13, textDecoration: 'none' }}>
                    &larr; Tillbaka till klassisk maskinvy
                  </Link>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// --- Sub-components ---

function KPICard({ label, value, unit, accent, border }: { label: string; value: string; unit: string; accent: boolean; border?: boolean }) {
  return (
    <div className="sf-card" style={{
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      height: 128,
      borderLeft: border ? '4px solid #00c48c' : undefined,
    }}>
      <p className="sf-label">{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="sf-value" style={{ color: accent ? '#00c48c' : '#e5e2e1' }}>{value}</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>{unit}</span>
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
        <p style={{ fontSize: 12, color: '#e5e2e1', fontWeight: 500 }}>{label}</p>
        <p style={{ fontSize: 11, color: '#85948b' }}>{pct.toFixed(0)}%</p>
      </div>
    </div>
  )
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ fontSize: 13, color: '#85948b' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: highlight ? '#00c48c' : '#e5e2e1', fontFamily: "'Manrope', sans-serif" }}>{value}</span>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#85948b',
  fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
  color: '#e5e2e1',
}
