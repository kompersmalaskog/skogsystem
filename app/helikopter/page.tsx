import { useState, useEffect } from 'react'

// Demo-data med bolagsuppdelning
const DEMO_DATA = {
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
  }
}

const MANAD = ['', 'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 
               'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

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

function Ring({ procent, size = 100, stroke = 6, color, delay = 0, onClick, active, children }) {
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
        cursor: onClick ? 'pointer' : 'default',
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
        {children || (
          <>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{anim}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: -2 }}>%</div>
          </>
        )}
      </div>
    </div>
  )
}

function BolagProgress({ procent, color }) {
  const [anim, setAnim] = useState(0)
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnim(Math.min(procent, 100))
    }, 100)
    return () => clearTimeout(timer)
  }, [procent])

  return (
    <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${anim}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.8s ease-out' }} />
    </div>
  )
}

export default function HelikopterPage() {
  const [manad, setManad] = useState(1)
  const [sheet, setSheet] = useState(null)
  const [closing, setClosing] = useState(false)
  const [activeRing, setActiveRing] = useState(null)

  const data = DEMO_DATA['2026-01']
  const arbetsdagar = 22
  const kvar = 10

  const closeSheet = () => {
    setClosing(true)
    setTimeout(() => {
      setSheet(null)
      setClosing(false)
      setActiveRing(null)
    }, 250)
  }

  const openSheet = (typ) => {
    setActiveRing(typ)
    setTimeout(() => setSheet(typ), 150)
  }

  // Beräkningar
  const slutBest = data.bestallning.slut_m3
  const slutSkordare = data.produktion.skordare_slut
  const slutSkotare = data.produktion.skotare_slut
  const slutProcent = Math.round((slutSkotare / slutBest) * 100)
  const slutKvar = slutBest - slutSkotare

  const gallBest = data.bestallning.gallring_m3
  const gallSkordare = data.produktion.skordare_gallring
  const gallSkotare = data.produktion.skotare_gallring
  const gallProcent = Math.round((gallSkotare / gallBest) * 100)
  const gallKvar = gallBest - gallSkotare

  // M³ per dag som krävs
  const slutPerDag = Math.round(slutKvar / kvar)
  const gallPerDag = Math.round(gallKvar / kvar)

  return (
    <div style={{ minHeight: '100vh', background: '#000', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', color: '#fff', padding: '16px 20px 100px' }}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
        <button style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 24, cursor: 'pointer' }}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{MANAD[manad]}</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{kvar} arbetsdagar kvar</div>
        </div>
        <button style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 24, cursor: 'pointer' }}>›</button>
      </div>

      {/* Slutavverkning */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 24 }}>🪵</span>
          <span style={{ fontSize: 18, fontWeight: 600, flex: 1 }}>Slutavverkning</span>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>{slutBest.toLocaleString()} m³</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Ring procent={Math.round((slutSkordare/slutBest)*100)} size={100} stroke={6} color="#FF9F0A" onClick={() => openSheet('slut_skordare')} active={activeRing === 'slut_skordare'} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Skördare</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Ring procent={slutProcent} size={100} stroke={6} color="#FF9F0A" onClick={() => openSheet('slut_skotare')} active={activeRing === 'slut_skotare'} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Skotare</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 20, padding: '0 20px' }}>
          <div style={{ 
            padding: 16, 
            background: 'rgba(255,255,255,0.08)', 
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.15)', 
            borderRadius: 14,
            boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
          }}>
            <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{slutKvar.toLocaleString()} m³ kvar</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}> • {slutPerDag} m³/dag</span>
          </div>
        </div>
      </div>

      {/* Gallring */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 24 }}>🌲</span>
          <span style={{ fontSize: 18, fontWeight: 600, flex: 1 }}>Gallring</span>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>{gallBest.toLocaleString()} m³</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Ring procent={Math.round((gallSkordare/gallBest)*100)} size={100} stroke={6} color="#30D158" onClick={() => openSheet('gall_skordare')} active={activeRing === 'gall_skordare'} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Skördare</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Ring procent={gallProcent} size={100} stroke={6} color="#30D158" onClick={() => openSheet('gall_skotare')} active={activeRing === 'gall_skotare'} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Skotare</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 20, padding: '0 20px' }}>
          <div style={{ 
            padding: 16, 
            background: 'rgba(255,255,255,0.08)', 
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.15)', 
            borderRadius: 14,
            boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
          }}>
            <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{gallKvar.toLocaleString()} m³ kvar</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}> • {gallPerDag} m³/dag</span>
          </div>
        </div>
      </div>

      {/* Oskotat */}
      <button onClick={() => openSheet('oskotat')} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '24px 4px', cursor: 'pointer', color: '#fff', marginTop: 20 }}>
        <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)' }}>Oskotat virke</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>450 m³</span>
          <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)' }}>›</span>
        </div>
      </button>

      {/* Overlay */}
      {sheet && (
        <div onClick={closeSheet} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100 }} />
      )}

      {/* Detail Sheet - Bolag */}
      {(sheet === 'slut_skordare' || sheet === 'slut_skotare' || sheet === 'gall_skordare' || sheet === 'gall_skotare') && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1c1c1e', borderRadius: '24px 24px 0 0', zIndex: 101, paddingBottom: 40, maxHeight: '85vh', overflowY: 'auto', animation: closing ? 'slideDown 0.25s ease forwards' : 'slideUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <div onClick={closeSheet} style={{ padding: '14px 0 10px', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
          </div>
          
          {(() => {
            const isSlut = sheet.startsWith('slut')
            const isSkordare = sheet.endsWith('skordare')
            const color = isSlut ? '#FF9F0A' : '#30D158'
            const bolagData = isSlut ? data.bolag.slut : data.bolag.gallring
            const totalBest = isSlut ? slutBest : gallBest
            const totalProd = isSkordare ? (isSlut ? slutSkordare : gallSkordare) : (isSlut ? slutSkotare : gallSkotare)
            const procent = Math.round((totalProd / totalBest) * 100)

            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 24px 20px' }}>
                  <span style={{ fontSize: 28 }}>{isSlut ? '🪵' : '🌲'}</span>
                  <span style={{ fontSize: 20, fontWeight: 600 }}>{isSlut ? 'Slutavverkning' : 'Gallring'} • {isSkordare ? 'Skördare' : 'Skotare'}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                  <Ring procent={procent} size={140} stroke={10} color={color}>
                    <div style={{ fontSize: 32, fontWeight: 700 }}>{procent}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>%</div>
                  </Ring>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 0, padding: '0 40px', marginBottom: 20 }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 700 }}>{totalProd.toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Producerat</div>
                  </div>
                  <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 24px' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 700 }}>{(totalBest - totalProd).toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Kvar</div>
                  </div>
                </div>

                <div style={{ padding: '0 24px', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Per bolag</div>
                  {bolagData.map((b, i) => {
                    const prod = isSkordare ? b.skordare : b.skotare
                    const proc = Math.round((prod / b.bestallning) * 100)
                    const klar = prod >= b.bestallning
                    return (
                      <div key={i} style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 500 }}>{b.namn}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <span style={{ fontSize: 20, fontWeight: 700 }}>{prod.toLocaleString()}</span>
                          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>/ {b.bestallning.toLocaleString()} m³</span>
                          {klar && <span style={{ fontSize: 14, color: '#30D158', marginLeft: 6 }}>✓</span>}
                        </div>
                        <BolagProgress procent={proc} color={color} />
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* Oskotat Sheet */}
      {sheet === 'oskotat' && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1c1c1e', borderRadius: '24px 24px 0 0', zIndex: 101, paddingBottom: 40, maxHeight: '85vh', overflowY: 'auto', animation: closing ? 'slideDown 0.25s ease forwards' : 'slideUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <div onClick={closeSheet} style={{ padding: '14px 0 10px', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 24px 24px' }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>Oskotat virke</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>450 m³</span>
          </div>
          <div style={{ padding: '0 24px 20px' }}>
            {data.oskotat.map((obj) => (
              <div key={obj.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 15 }}>{obj.namn}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{obj.m3} m³</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{obj.dagar} dagar</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
