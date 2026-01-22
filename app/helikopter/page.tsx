import { useState, useEffect } from 'react'

// Demo-data med bolagsuppdelning
const DEMO_DATA = {
  '2025-11': {
    bestallning: { slut_m3: 7200, gallring_m3: 900 },
    produktion: { skordare_slut: 7200, skordare_gallring: 900, skotare_slut: 7200, skotare_gallring: 900 },
    oskotat: [],
    bolag: {
      slut: [
        { namn: 'Södra', bestallning: 4000, skordare: 4000, skotare: 4000 },
        { namn: 'Vida', bestallning: 2500, skordare: 2500, skotare: 2500 },
        { namn: 'ATA', bestallning: 700, skordare: 700, skotare: 700 }
      ],
      gallring: [
        { namn: 'Södra', bestallning: 600, skordare: 600, skotare: 600 },
        { namn: 'Vida', bestallning: 300, skordare: 300, skotare: 300 }
      ]
    }
  },
  '2025-12': {
    bestallning: { slut_m3: 6800, gallring_m3: 850 },
    produktion: { skordare_slut: 6800, skordare_gallring: 850, skotare_slut: 6750, skotare_gallring: 820 },
    oskotat: [{ id: 1, namn: 'Älgamo 1:5', m3: 50, dagar: 1, typ: 'slut' }],
    bolag: {
      slut: [
        { namn: 'Södra', bestallning: 3800, skordare: 3800, skotare: 3800 },
        { namn: 'Vida', bestallning: 2200, skordare: 2200, skotare: 2150 },
        { namn: 'ATA', bestallning: 800, skordare: 800, skotare: 800 }
      ],
      gallring: [
        { namn: 'Södra', bestallning: 550, skordare: 550, skotare: 520 },
        { namn: 'Vida', bestallning: 300, skordare: 300, skotare: 300 }
      ]
    }
  },
  '2026-01': {
    bestallning: { slut_m3: 7500, gallring_m3: 1000 },
    produktion: { skordare_slut: 4800, skordare_gallring: 620, skotare_slut: 4350, skotare_gallring: 590 },
    oskotat: [
      { id: 1, namn: 'Bjällerhult 2:3', m3: 187, dagar: 5, typ: 'slut' },
      { id: 2, namn: 'Stensnäs 4:1', m3: 145, dagar: 3, typ: 'slut' },
      { id: 3, namn: 'Kroksjö 1:8', m3: 78, dagar: 2, typ: 'gallring' },
      { id: 4, namn: 'Gässemåla 3:2', m3: 40, dagar: 1, typ: 'slut' }
    ],
    bolag: {
      slut: [
        { namn: 'Södra', bestallning: 4000, skordare: 2600, skotare: 2350 },
        { namn: 'Vida', bestallning: 2500, skordare: 1600, skotare: 1450 },
        { namn: 'ATA', bestallning: 1000, skordare: 600, skotare: 550 }
      ],
      gallring: [
        { namn: 'Södra', bestallning: 650, skordare: 400, skotare: 380 },
        { namn: 'Vida', bestallning: 350, skordare: 220, skotare: 210 }
      ]
    }
  },
  '2026-02': {
    bestallning: { slut_m3: 7800, gallring_m3: 1100 },
    produktion: { skordare_slut: 2100, skordare_gallring: 280, skotare_slut: 1800, skotare_gallring: 250 },
    oskotat: [
      { id: 1, namn: 'Hällevik 3:2', m3: 210, dagar: 2, typ: 'slut' },
      { id: 2, namn: 'Rockneby 1:4', m3: 90, dagar: 1, typ: 'gallring' }
    ],
    bolag: {
      slut: [
        { namn: 'Södra', bestallning: 4200, skordare: 1100, skotare: 950 },
        { namn: 'Vida', bestallning: 2600, skordare: 700, skotare: 600 },
        { namn: 'ATA', bestallning: 1000, skordare: 300, skotare: 250 }
      ],
      gallring: [
        { namn: 'Södra', bestallning: 700, skordare: 180, skotare: 160 },
        { namn: 'Vida', bestallning: 400, skordare: 100, skotare: 90 }
      ]
    }
  }
}

const MANAD = ['', 'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 
               'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

function getArbetsdagar(ar, manad) {
  let dagar = 0
  const sistaDag = new Date(ar, manad, 0).getDate()
  for (let d = 1; d <= sistaDag; d++) {
    const datum = new Date(ar, manad - 1, d)
    const dag = datum.getDay()
    if (dag >= 1 && dag <= 5) dagar++
  }
  return dagar
}

function getDagarGatt(ar, manad, idag) {
  let dagar = 0
  for (let d = 1; d <= idag; d++) {
    const datum = new Date(ar, manad - 1, d)
    const dag = datum.getDay()
    if (dag >= 1 && dag <= 5) dagar++
  }
  return dagar
}

function CountUp({ value, duration = 1000 }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(eased * value))
      if (progress < 1) requestAnimationFrame(tick)
    }
    tick()
  }, [value, duration])
  return <>{count.toLocaleString()}</>
}

function Ring({ procent, size = 100, stroke = 6, color, delay = 0, onClick, active }) {
  const [anim, setAnim] = useState(0)
  const radius = (size - stroke) / 2
  const circ = radius * 2 * Math.PI
  const offset = circ - (anim / 100) * circ

  useEffect(() => {
    const timer = setTimeout(() => {
      const start = Date.now()
      const tick = () => {
        const elapsed = Date.now() - start
        const progress = Math.min(elapsed / 1000, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setAnim(Math.round(eased * Math.min(procent, 100)))
        if (progress < 1) requestAnimationFrame(tick)
      }
      tick()
    }, delay)
    return () => clearTimeout(timer)
  }, [procent, delay])

  return (
    <div 
      onClick={onClick}
      style={{
        position: 'relative',
        width: size,
        height: size,
        cursor: 'pointer',
        transform: active ? 'scale(1.05)' : 'scale(1)',
        transition: 'transform 0.3s ease'
      }}
    >
      <svg width={size} height={size} style={{ 
        transform: 'rotate(-90deg)',
        filter: `drop-shadow(0 0 ${active ? 15 : 8}px ${color}${active ? '90' : '50'})`
      }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" 
          stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" 
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" />
      </svg>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{anim}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: -2 }}>%</div>
      </div>
    </div>
  )
}

// Mini progress bar för bolag
function BolagProgress({ procent, color }) {
  const [anim, setAnim] = useState(0)
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnim(Math.min(procent, 100))
    }, 100)
    return () => clearTimeout(timer)
  }, [procent])

  return (
    <div style={{ 
      width: '100%', 
      height: 3, 
      background: 'rgba(255,255,255,0.08)', 
      borderRadius: 2,
      overflow: 'hidden'
    }}>
      <div style={{ 
        width: `${anim}%`, 
        height: '100%', 
        background: color,
        borderRadius: 2,
        transition: 'width 0.8s ease-out'
      }} />
    </div>
  )
}

export default function HelikopterPage() {
  const idag = new Date()
  const [ar, setAr] = useState(2026)
  const [manad, setManad] = useState(1)
  const [data, setData] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [closing, setClosing] = useState(false)
  const [activeRing, setActiveRing] = useState(null)

  useEffect(() => {
    const key = `${ar}-${String(manad).padStart(2, '0')}`
    setData(DEMO_DATA[key] || null)
    setSheet(null)
    setActiveRing(null)
  }, [ar, manad])

  const arbetsdagar = getArbetsdagar(ar, manad)
  const arNu = ar === idag.getFullYear() && manad === idag.getMonth() + 1
  const dagNu = arNu ? idag.getDate() : new Date(ar, manad, 0).getDate()
  const gatt = getDagarGatt(ar, manad, dagNu)
  const kvar = Math.max(1, arbetsdagar - gatt)
  const procGatt = gatt / arbetsdagar

  const byt = (dir) => {
    let m = manad + dir, a = ar
    if (m > 12) { m = 1; a++ }
    if (m < 1) { m = 12; a-- }
    setManad(m); setAr(a)
  }

  if (!data) {
    return (
      <div style={styles.container}>
        <Header manad={manad} byt={byt} kvar={kvar} />
        <div style={{ textAlign: 'center', padding: 80, color: 'rgba(255,255,255,0.3)' }}>
          Ingen data för {MANAD[manad]}
        </div>
      </div>
    )
  }

  const calc = (best, skord, skot) => {
    const borde = Math.round(procGatt * best)
    return {
      skordProc: Math.round((skord / best) * 100),
      skotProc: Math.round((skot / best) * 100),
      skordLev: skord, skotLev: skot,
      skordKvar: best - skord, skotKvar: best - skot,
      skordPerDag: Math.ceil((best - skord) / kvar),
      skotPerDag: Math.ceil((best - skot) / kvar),
      skordDiff: skord - borde, skotDiff: skot - borde,
      best
    }
  }

  const slut = calc(data.bestallning.slut_m3, data.produktion.skordare_slut, data.produktion.skotare_slut)
  const gall = calc(data.bestallning.gallring_m3, data.produktion.skordare_gallring, data.produktion.skotare_gallring)
  const totalOskotat = data.oskotat.reduce((s, o) => s + o.m3, 0)

  const openSheet = (typ, maskin) => {
    setActiveRing(`${typ}-${maskin}`)
    setTimeout(() => setSheet({ typ, maskin }), 150)
  }

  const closeSheet = () => {
    setClosing(true)
    setTimeout(() => {
      setSheet(null)
      setActiveRing(null)
      setClosing(false)
    }, 250)
  }

  const getSheetData = () => {
    if (!sheet || sheet === 'oskotat') return null
    const d = sheet.typ === 'slut' ? slut : gall
    const isSkord = sheet.maskin === 'skordare'
    const levererat = isSkord ? d.skordLev : d.skotLev
    const diff = levererat - d.best
    
    const nu = new Date()
    const manadSlut = ar < nu.getFullYear() || (ar === nu.getFullYear() && manad < nu.getMonth() + 1)
    
    // Hämta bolagsdata
    const bolagTyp = sheet.typ === 'slut' ? 'slut' : 'gallring'
    const bolagData = data.bolag?.[bolagTyp] || []
    
    // Färg baserat på typ (samma som ringen)
    const color = sheet.typ === 'slut' ? '#FF9F0A' : '#30D158'
    
    return {
      titel: `${isSkord ? 'Skördare' : 'Skotare'} ${sheet.typ === 'slut' ? 'Slutavverkning' : 'Gallring'}`,
      emoji: isSkord ? '🪓' : '🚛',
      procent: isSkord ? d.skordProc : d.skotProc,
      levererat,
      kvar: isSkord ? d.skordKvar : d.skotKvar,
      perDag: isSkord ? d.skordPerDag : d.skotPerDag,
      tidplanDiff: isSkord ? d.skordDiff : d.skotDiff,
      best: d.best,
      color,
      manadSlut,
      naddemal: diff >= 0,
      slutDiff: diff,
      bolag: bolagData.map(b => ({
        ...b,
        levererat: isSkord ? b.skordare : b.skotare,
        procent: Math.round(((isSkord ? b.skordare : b.skotare) / b.bestallning) * 100)
      })),
      isSkord
    }
  }

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      <Header manad={manad} byt={byt} kvar={kvar} />

      {/* Slutavverkning */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={{ fontSize: 22 }}>🪵</span>
          <span style={styles.sectionTitel}>Slutavverkning</span>
          <span style={styles.sectionBest}>{slut.best.toLocaleString()} m³</span>
        </div>
        <div style={styles.ringsRow}>
          <div style={styles.ringBox}>
            <Ring procent={slut.skordProc} color="#FF9F0A" delay={0}
              onClick={() => openSheet('slut', 'skordare')}
              active={activeRing === 'slut-skordare'} />
            <div style={styles.ringLabel}>Skördare</div>
          </div>
          <div style={styles.ringBox}>
            <Ring procent={slut.skotProc} color="#FF9F0A" delay={100}
              onClick={() => openSheet('slut', 'skotare')}
              active={activeRing === 'slut-skotare'} />
            <div style={styles.ringLabel}>Skotare</div>
          </div>
        </div>
      </div>

      {/* Gallring */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={{ fontSize: 22 }}>🌲</span>
          <span style={styles.sectionTitel}>Gallring</span>
          <span style={styles.sectionBest}>{gall.best.toLocaleString()} m³</span>
        </div>
        <div style={styles.ringsRow}>
          <div style={styles.ringBox}>
            <Ring procent={gall.skordProc} color="#30D158" delay={200}
              onClick={() => openSheet('gall', 'skordare')}
              active={activeRing === 'gall-skordare'} />
            <div style={styles.ringLabel}>Skördare</div>
          </div>
          <div style={styles.ringBox}>
            <Ring procent={gall.skotProc} color="#30D158" delay={300}
              onClick={() => openSheet('gall', 'skotare')}
              active={activeRing === 'gall-skotare'} />
            <div style={styles.ringLabel}>Skotare</div>
          </div>
        </div>
      </div>

      {/* Oskotat */}
      {data.oskotat.length > 0 && (
        <button onClick={() => setSheet('oskotat')} style={styles.oskotadBtn}>
          <span style={styles.oskotadText}>Oskotat i skogen</span>
          <div style={styles.oskotadRight}>
            <span style={styles.oskotadM3}>{totalOskotat} m³</span>
            <span style={styles.oskotadPil}>›</span>
          </div>
        </button>
      )}

      {/* Sheet overlay */}
      {sheet && (
        <>
          <div style={{
            ...styles.overlay,
            animation: closing ? 'fadeOut 0.25s ease forwards' : 'fadeIn 0.2s ease'
          }} onClick={closeSheet} />
          
          {/* Maskin-detaljer sheet */}
          {sheet !== 'oskotat' && (() => {
            const d = getSheetData()
            
            return (
              <div style={{
                ...styles.sheet,
                animation: closing ? 'slideDown 0.25s ease forwards' : 'slideUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
              }}>
                <div style={styles.sheetHandle} onClick={closeSheet}>
                  <div style={styles.sheetBar} />
                </div>
                
                <div style={styles.detailHeader}>
                  <span style={{ fontSize: 32 }}>{d.emoji}</span>
                  <span style={styles.detailTitel}>{d.titel}</span>
                </div>

                <div style={styles.detailRingWrap}>
                  <Ring procent={d.procent} size={140} stroke={10} color={d.color} delay={0} onClick={() => {}} />
                </div>

                {/* Totalt */}
                <div style={styles.detailStats}>
                  <div style={styles.detailStat}>
                    <div style={styles.detailStatValue}>
                      <CountUp value={d.levererat} />
                    </div>
                    <div style={styles.detailStatLabel}>levererat m³</div>
                  </div>
                  <div style={styles.detailDivider} />
                  <div style={styles.detailStat}>
                    <div style={styles.detailStatValue}>
                      {d.best.toLocaleString()}
                    </div>
                    <div style={styles.detailStatLabel}>beställt m³</div>
                  </div>
                </div>

                {/* Bolagsuppdelning */}
                <div style={styles.bolagSection}>
                  <div style={styles.bolagHeader}>Per bolag</div>
                  {d.bolag.map((b, i) => {
                    const klart = b.levererat >= b.bestallning
                    return (
                      <div key={i} style={styles.bolagRow}>
                        <div style={styles.bolagLeft}>
                          <span style={styles.bolagNamn}>{b.namn}</span>
                        </div>
                        <div style={styles.bolagRight}>
                          <span style={{ 
                            ...styles.bolagVolym,
                            color: klart ? '#30D158' : '#fff'
                          }}>
                            {b.levererat.toLocaleString()}
                          </span>
                          <span style={styles.bolagAv}>/ {b.bestallning.toLocaleString()}</span>
                          {klart && <span style={styles.bolagCheck}>✓</span>}
                        </div>
                        <div style={styles.bolagProgressWrap}>
                          <BolagProgress procent={b.procent} color={d.color} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Status */}
                {d.manadSlut ? (
                  <div style={{
                    ...styles.detailStatus,
                    background: d.naddemal ? 'rgba(48,209,88,0.1)' : 'rgba(255,69,58,0.1)',
                    borderColor: d.naddemal ? 'rgba(48,209,88,0.3)' : 'rgba(255,69,58,0.3)'
                  }}>
                    <div style={{ 
                      fontSize: 16, 
                      fontWeight: 600,
                      color: d.naddemal ? '#30D158' : '#FF453A',
                      marginBottom: 4
                    }}>
                      {d.naddemal ? '✓ Nådde målet' : '✗ Missade målet'}
                    </div>
                    <div style={{ 
                      fontSize: 24, 
                      fontWeight: 700,
                      color: d.naddemal ? '#30D158' : '#FF453A'
                    }}>
                      {d.slutDiff >= 0 ? '+' : ''}{d.slutDiff} m³
                    </div>
                  </div>
                ) : (
                  <div style={{
                    ...styles.detailStatus,
                    background: d.tidplanDiff >= 0 ? 'rgba(48,209,88,0.1)' : 'rgba(255,69,58,0.1)',
                    borderColor: d.tidplanDiff >= 0 ? 'rgba(48,209,88,0.3)' : 'rgba(255,69,58,0.3)'
                  }}>
                    <div style={{ 
                      fontSize: 24, 
                      fontWeight: 700,
                      color: d.tidplanDiff >= 0 ? '#30D158' : '#FF453A'
                    }}>
                      {d.tidplanDiff >= 0 ? '+' : ''}{d.tidplanDiff} m³
                    </div>
                    <div style={{ 
                      fontSize: 13, 
                      color: d.tidplanDiff >= 0 ? '#30D158' : '#FF453A',
                      marginTop: 2
                    }}>
                      {d.tidplanDiff >= 0 ? 'före tidplan' : 'efter tidplan'}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Oskotat sheet */}
          {sheet === 'oskotat' && (() => {
            const slutObj = data.oskotat.filter(o => o.typ === 'slut').sort((a, b) => b.dagar - a.dagar)
            const gallObj = data.oskotat.filter(o => o.typ === 'gallring').sort((a, b) => b.dagar - a.dagar)
            const slutTotal = slutObj.reduce((s, o) => s + o.m3, 0)
            const gallTotal = gallObj.reduce((s, o) => s + o.m3, 0)
            
            return (
              <div style={{
                ...styles.sheet,
                animation: closing ? 'slideDown 0.25s ease forwards' : 'slideUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
              }}>
                <div style={styles.sheetHandle} onClick={closeSheet}>
                  <div style={styles.sheetBar} />
                </div>
                <div style={styles.oskotadHeader}>
                  <span style={styles.oskotadSheetTitel}>Oskotat i skogen</span>
                  <span style={styles.oskotadSheetTotal}>{totalOskotat} m³</span>
                </div>
                
                <div style={styles.oskotadList}>
                  {slutObj.length > 0 && (
                    <div style={styles.oskotadGroup}>
                      <div style={styles.oskotadGroupHeader}>
                        <span style={{ fontSize: 18 }}>🪵</span>
                        <span style={styles.oskotadGroupTitel}>Slutavverkning</span>
                        <span style={styles.oskotadGroupTotal}>{slutTotal} m³</span>
                      </div>
                      {slutObj.map((obj) => (
                        <div key={obj.id} style={styles.oskotadItem}>
                          <div style={styles.oskotadItemLeft}>
                            <div style={{
                              width: 8, height: 8, borderRadius: 4,
                              background: obj.dagar >= 5 ? '#FF453A' : obj.dagar >= 3 ? '#FF9F0A' : '#30D158'
                            }} />
                            <span style={styles.oskotadItemNamn}>{obj.namn}</span>
                          </div>
                          <div style={styles.oskotadItemRight}>
                            <span style={styles.oskotadItemM3}>{obj.m3} m³</span>
                            <span style={styles.oskotadItemDagar}>{obj.dagar} d</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {gallObj.length > 0 && (
                    <div style={styles.oskotadGroup}>
                      <div style={styles.oskotadGroupHeader}>
                        <span style={{ fontSize: 18 }}>🌲</span>
                        <span style={styles.oskotadGroupTitel}>Gallring</span>
                        <span style={styles.oskotadGroupTotal}>{gallTotal} m³</span>
                      </div>
                      {gallObj.map((obj) => (
                        <div key={obj.id} style={styles.oskotadItem}>
                          <div style={styles.oskotadItemLeft}>
                            <div style={{
                              width: 8, height: 8, borderRadius: 4,
                              background: obj.dagar >= 5 ? '#FF453A' : obj.dagar >= 3 ? '#FF9F0A' : '#30D158'
                            }} />
                            <span style={styles.oskotadItemNamn}>{obj.namn}</span>
                          </div>
                          <div style={styles.oskotadItemRight}>
                            <span style={styles.oskotadItemM3}>{obj.m3} m³</span>
                            <span style={styles.oskotadItemDagar}>{obj.dagar} d</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

function Header({ manad, byt, kvar }) {
  return (
    <div style={styles.header}>
      <button onClick={() => byt(-1)} style={styles.navBtn}>‹</button>
      <div style={styles.headerCenter}>
        <div style={styles.manadText}>{MANAD[manad]}</div>
        <div style={styles.dagarText}>{kvar} arbetsdagar kvar</div>
      </div>
      <button onClick={() => byt(1)} style={styles.navBtn}>›</button>
    </div>
  )
}

const styles = {
  container: { 
    minHeight: '100vh', 
    background: '#000', 
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif', 
    color: '#fff', 
    padding: '16px 20px 100px',
    WebkitFontSmoothing: 'antialiased'
  },
  header: { 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 40 
  },
  navBtn: { 
    width: 48, height: 48, 
    borderRadius: 24, 
    background: 'rgba(255,255,255,0.06)', 
    border: '1px solid rgba(255,255,255,0.1)', 
    color: 'rgba(255,255,255,0.6)', 
    fontSize: 24, 
    cursor: 'pointer' 
  },
  headerCenter: { textAlign: 'center' },
  manadText: { fontSize: 32, fontWeight: 700 },
  dagarText: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 },

  section: { marginBottom: 32 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  sectionTitel: { fontSize: 18, fontWeight: 600, flex: 1 },
  sectionBest: { fontSize: 14, color: 'rgba(255,255,255,0.35)' },

  ringsRow: { display: 'flex', justifyContent: 'center', gap: 40 },
  ringBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  ringLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 500 },

  oskotadBtn: { 
    width: '100%', 
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'transparent', 
    border: 'none',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    padding: '24px 4px', 
    cursor: 'pointer', 
    color: '#fff',
    marginTop: 20
  },
  oskotadText: { fontSize: 15, color: 'rgba(255,255,255,0.5)' },
  oskotadRight: { display: 'flex', alignItems: 'center', gap: 10 },
  oskotadM3: { fontSize: 18, fontWeight: 600 },
  oskotadPil: { fontSize: 18, color: 'rgba(255,255,255,0.3)' },

  overlay: { 
    position: 'fixed', 
    top: 0, left: 0, right: 0, bottom: 0, 
    background: 'rgba(0,0,0,0.85)', 
    zIndex: 100
  },
  sheet: { 
    position: 'fixed', 
    bottom: 0, left: 0, right: 0, 
    background: '#1c1c1e', 
    borderRadius: '24px 24px 0 0', 
    zIndex: 101,
    paddingBottom: 40,
    maxHeight: '85vh',
    overflowY: 'auto'
  },
  sheetHandle: { 
    padding: '14px 0 10px', 
    cursor: 'pointer', 
    display: 'flex', 
    justifyContent: 'center' 
  },
  sheetBar: { width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' },

  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '10px 24px 20px'
  },
  detailTitel: { fontSize: 20, fontWeight: 600 },
  detailRingWrap: { display: 'flex', justifyContent: 'center', marginBottom: 24 },
  detailStats: { display: 'flex', justifyContent: 'center', gap: 0, padding: '0 40px', marginBottom: 20 },
  detailStat: { flex: 1, textAlign: 'center' },
  detailStatValue: { fontSize: 26, fontWeight: 700 },
  detailStatLabel: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  detailDivider: { width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 24px' },
  detailStatus: { margin: '16px 24px 0', padding: '16px', borderRadius: 16, textAlign: 'center', border: '1px solid' },

  // Bolag styles - renare design
  bolagSection: {
    padding: '0 24px',
    marginBottom: 8
  },
  bolagHeader: {
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  bolagRow: {
    padding: '14px 0',
    borderBottom: '1px solid rgba(255,255,255,0.06)'
  },
  bolagLeft: {
    marginBottom: 8
  },
  bolagNamn: {
    fontSize: 15,
    fontWeight: 500
  },
  bolagRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10
  },
  bolagVolym: {
    fontSize: 20,
    fontWeight: 700
  },
  bolagAv: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)'
  },
  bolagCheck: {
    fontSize: 14,
    color: '#30D158',
    marginLeft: 6
  },
  bolagProgressWrap: {
    width: '100%'
  },

  oskotadHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 24px 24px' },
  oskotadSheetTitel: { fontSize: 20, fontWeight: 700 },
  oskotadSheetTotal: { fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.4)' },
  oskotadList: { padding: '0 24px 20px', maxHeight: '60vh', overflowY: 'auto' },
  oskotadGroup: { marginBottom: 24 },
  oskotadGroupHeader: { display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 8 },
  oskotadGroupTitel: { flex: 1, fontSize: 16, fontWeight: 600 },
  oskotadGroupTotal: { fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.5)' },
  oskotadItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', paddingLeft: 28 },
  oskotadItemLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  oskotadItemNamn: { fontSize: 15 },
  oskotadItemRight: { display: 'flex', alignItems: 'center', gap: 16 },
  oskotadItemM3: { fontSize: 15, fontWeight: 600, minWidth: 60, textAlign: 'right' },
  oskotadItemDagar: { fontSize: 13, color: 'rgba(255,255,255,0.35)', minWidth: 30 }
}
