'use client'
import { useState, useEffect } from 'react'

const SUPABASE_URL = 'https://mxydghzfacbenbgpodex.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWRnaHpmYWNiZW5iZ3BvZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTExNjgsImV4cCI6MjA1Mjc4NzE2OH0.AqZhsIhhcrAXoVdPTzTCTBWwT-LNt1V8nUT8aJAqzfA'

const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

function CountUp({ value, duration = 1000 }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(0)
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
    setAnim(0)
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
    <div onClick={onClick} style={{
      position: 'relative', width: size, height: size,
      cursor: onClick ? 'pointer' : 'default',
      transform: active ? 'scale(1.05)' : 'scale(1)',
      transition: 'transform 0.3s ease'
    }}>
      <svg width={size} height={size} style={{ 
        transform: 'rotate(-90deg)',
        filter: `drop-shadow(0 0 ${active ? 20 : 12}px ${color}${active ? '90' : '60'})`
      }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        {children}
      </div>
    </div>
  )
}

function ProgressBar({ procent, color, delay = 0 }) {
  const [anim, setAnim] = useState(0)
  useEffect(() => {
    setAnim(0)
    const timer = setTimeout(() => {
      const start = Date.now()
      const tick = () => {
        const elapsed = Date.now() - start
        const progress = Math.min(elapsed / 800, 1)
        setAnim((1 - Math.pow(1 - progress, 3)) * Math.min(procent, 100))
        if (progress < 1) requestAnimationFrame(tick)
      }
      tick()
    }, delay)
    return () => clearTimeout(timer)
  }, [procent, delay])

  return (
    <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${anim}%`, height: '100%', background: color, borderRadius: 2, boxShadow: `0 0 8px ${color}60` }} />
    </div>
  )
}

export default function Bestallningar() {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(0)
  const [bestallningar, setBestallningar] = useState([])
  const [sparadeBolag, setSparadeBolag] = useState(['Vida', 'Södra', 'ATA'])
  const [loading, setLoading] = useState(true)
  const [sheet, setSheet] = useState(null)
  const [closing, setClosing] = useState(false)
  const [steg, setSteg] = useState(1)
  const [valdTyp, setValdTyp] = useState(null)
  const [valtBolag, setValtBolag] = useState('')
  const [valdVolym, setValdVolym] = useState('')
  const [activeSection, setActiveSection] = useState(null)
  const [redigerar, setRedigerar] = useState(null)
  const [visaInfo, setVisaInfo] = useState(null)
  const [nyttBolagNamn, setNyttBolagNamn] = useState('')
  const [visaNyttBolag, setVisaNyttBolag] = useState(false)

  useEffect(() => {
    fetchBestallningar()
  }, [])

  const fetchBestallningar = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/bestallningar?select=*&order=created_at.desc`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      })
      if (res.ok) {
        const data = await res.json()
        setBestallningar(data)
        const bolag = [...new Set(data.map(b => b.bolag))].filter(Boolean)
        if (bolag.length > 0) setSparadeBolag(prev => [...new Set([...prev, ...bolag])])
      }
    } catch (err) {
      console.error('Fel:', err)
    }
    setLoading(false)
  }

const aktuella = bestallningar.filter(b => Number(b.ar) === year && Number(b.manad) === month + 1)
  const slutBest = aktuella.filter(b => b.typ === 'slut')
  const gallBest = aktuella.filter(b => b.typ === 'gallring')
  const slutSum = slutBest.reduce((s, b) => s + b.volym, 0)
  const gallSum = gallBest.reduce((s, b) => s + b.volym, 0)
  const totalSum = slutSum + gallSum
  const slutProc = Math.round((slutSum / 10000) * 100)
  const gallProc = Math.round((gallSum / 2000) * 100)

  const bytManad = (dir) => {
    let m = month + dir, y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  const closeSheet = () => {
    setClosing(true)
    setTimeout(() => { 
      setSheet(null)
      setVisaInfo(null)
      setClosing(false)
      setActiveSection(null)
      setVisaNyttBolag(false)
      setNyttBolagNamn('')
    }, 250)
  }

  const openTypSheet = (typ) => { 
    setActiveSection(typ)
    setTimeout(() => setSheet(typ), 150) 
  }

  const openNySheet = () => {
    setSheet('ny')
    setSteg(1)
    setValdTyp(null)
    setValtBolag('')
    setValdVolym('')
    setRedigerar(null)
    setVisaNyttBolag(false)
    setNyttBolagNamn('')
  }

  const spara = async () => {
    if (!valdTyp || !valtBolag || !valdVolym) return
    
    const volymNr = parseFloat(valdVolym)
    
    try {
      if (redigerar) {
        // Redigerar befintlig - ersätt volymen
        await fetch(`${SUPABASE_URL}/rest/v1/bestallningar?id=eq.${redigerar.id}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ volym: volymNr })
        })
      } else {
        // Kolla om det redan finns en beställning för samma bolag+typ+månad
        const befintlig = bestallningar.find(b => 
          b.ar === year && 
          b.manad === month + 1 && 
          b.typ === valdTyp && 
          b.bolag === valtBolag
        )
        
        if (befintlig) {
          // Addera till befintlig beställning
          await fetch(`${SUPABASE_URL}/rest/v1/bestallningar?id=eq.${befintlig.id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ volym: befintlig.volym + volymNr })
          })
        } else {
          // Skapa ny beställning
          await fetch(`${SUPABASE_URL}/rest/v1/bestallningar`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ar: year, manad: month + 1, typ: valdTyp, bolag: valtBolag, volym: volymNr })
          })
        }
      }
      
      await fetchBestallningar()
    } catch (err) {
      console.error('Fel:', err)
    }
    
    setTimeout(() => closeSheet(), 50)
  }

  const laggTillNyttBolag = () => {
    if (nyttBolagNamn.trim() && !sparadeBolag.includes(nyttBolagNamn.trim())) {
      setSparadeBolag(prev => [...prev, nyttBolagNamn.trim()])
      setValtBolag(nyttBolagNamn.trim())
      setSteg(3)
      setVisaNyttBolag(false)
      setNyttBolagNamn('')
    }
  }

  const taBortBestallning = async (id) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/bestallningar?id=eq.${id}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      })
      await fetchBestallningar()
    } catch (err) {
      console.error('Fel:', err)
    }
    setTimeout(() => closeSheet(), 50)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}>
        Laddar...
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', color: '#fff', padding: '16px 20px 120px' }}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
        <button onClick={() => bytManad(-1)} style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 24, cursor: 'pointer' }}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{MANADER[month]}</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{year}</div>
        </div>
        <button onClick={() => bytManad(1)} style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 24, cursor: 'pointer' }}>›</button>
      </div>

      {/* Ringar */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 50, marginBottom: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Ring procent={slutProc} size={120} stroke={8} color="#FF9F0A" delay={0} onClick={() => openTypSheet('slut')} active={activeSection === 'slut'}>
            <div style={{ fontSize: 28, fontWeight: 700 }}><CountUp value={slutSum} duration={1200} /></div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: -2 }}>m³</div>
          </Ring>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>🪵 Slutavverkning</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Ring procent={gallProc} size={120} stroke={8} color="#30D158" delay={150} onClick={() => openTypSheet('gallring')} active={activeSection === 'gallring'}>
            <div style={{ fontSize: 28, fontWeight: 700 }}><CountUp value={gallSum} duration={1200} /></div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: -2 }}>m³</div>
          </Ring>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>🌲 Gallring</div>
        </div>
      </div>

      {/* Total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 24 }}>
        <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)' }}>Totalt beställt</span>
        <span style={{ fontSize: 20, fontWeight: 700 }}><CountUp value={totalSum} /> m³</span>
      </div>

      {/* Lägg till knapp */}
      <button onClick={openNySheet} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 18, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
        <span style={{ fontSize: 24, fontWeight: 300 }}>+</span>
        <span>Lägg till beställning</span>
      </button>

      {/* Sheet overlay */}
      {sheet && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, animation: closing ? 'fadeOut 0.25s ease forwards' : 'fadeIn 0.2s ease' }} onClick={closeSheet} />
          
          {/* Typ-detaljer (slut/gallring) */}
          {(sheet === 'slut' || sheet === 'gallring') && (
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1c1c1e', borderRadius: '24px 24px 0 0', zIndex: 101, paddingBottom: 40, maxHeight: '85vh', overflowY: 'auto', animation: closing ? 'slideDown 0.25s ease forwards' : 'slideUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
              <div onClick={closeSheet} style={{ padding: '14px 0 10px', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
              </div>
              <div style={{ padding: '0 24px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '10px 0 24px' }}>
                  <span style={{ fontSize: 36 }}>{sheet === 'slut' ? '🪵' : '🌲'}</span>
                  <span style={{ fontSize: 22, fontWeight: 600 }}>{sheet === 'slut' ? 'Slutavverkning' : 'Gallring'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
                  <Ring procent={sheet === 'slut' ? slutProc : gallProc} size={160} stroke={10} color={sheet === 'slut' ? '#FF9F0A' : '#30D158'} delay={0}>
                    <div style={{ fontSize: 36, fontWeight: 700 }}><CountUp value={sheet === 'slut' ? slutSum : gallSum} /></div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>m³</div>
                  </Ring>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Per bolag</div>
                  {(sheet === 'slut' ? slutBest : gallBest).length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.3)', padding: '20px 0', textAlign: 'center' }}>Inga beställningar</div>
                  ) : (
                    (sheet === 'slut' ? slutBest : gallBest).map((b, i) => (
                      <button key={b.id} onClick={() => { setVisaInfo(b); setSheet('info') }} style={{ width: '100%', display: 'block', padding: '14px 0', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ display: 'block', fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{b.bolag}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <span style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(b.volym).toLocaleString()}</span>
                          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>m³</span>
                          <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>›</span>
                        </div>
                        <ProgressBar procent={(b.volym / (sheet === 'slut' ? slutSum : gallSum)) * 100} color={sheet === 'slut' ? '#FF9F0A' : '#30D158'} delay={i * 100} />
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Ny beställning */}
          {sheet === 'ny' && (
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1c1c1e', borderRadius: '24px 24px 0 0', zIndex: 101, paddingBottom: 40, animation: closing ? 'slideDown 0.25s ease forwards' : 'slideUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
              <div onClick={closeSheet} style={{ padding: '14px 0 10px', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
              </div>
              <div style={{ padding: '0 24px 20px' }}>
                
                {steg === 1 && (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 24 }}>Välj typ</div>
                    <button onClick={() => { setValdTyp('slut'); setSteg(2) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '22px 24px', background: 'rgba(255,159,10,0.1)', border: '1px solid rgba(255,159,10,0.3)', borderRadius: 18, cursor: 'pointer', marginBottom: 14 }}>
                      <span style={{ fontSize: 36 }}>🪵</span>
                      <span style={{ fontSize: 20, fontWeight: 600, color: '#FF9F0A' }}>Slutavverkning</span>
                    </button>
                    <button onClick={() => { setValdTyp('gallring'); setSteg(2) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '22px 24px', background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.3)', borderRadius: 18, cursor: 'pointer' }}>
                      <span style={{ fontSize: 36 }}>🌲</span>
                      <span style={{ fontSize: 20, fontWeight: 600, color: '#30D158' }}>Gallring</span>
                    </button>
                  </>
                )}

                {steg === 2 && !visaNyttBolag && (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 24 }}>Välj bolag</div>
                    {sparadeBolag.map(b => (
                      <button key={b} onClick={() => { setValtBolag(b); setSteg(3) }} style={{ width: '100%', padding: 18, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, color: '#fff', fontSize: 18, fontWeight: 500, cursor: 'pointer', marginBottom: 10 }}>{b}</button>
                    ))}
                    <button onClick={() => setVisaNyttBolag(true)} style={{ width: '100%', padding: 18, background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 14, color: 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer', marginTop: 8 }}>+ Nytt bolag</button>
                    <button onClick={() => setSteg(1)} style={{ width: '100%', padding: 16, background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 12, color: 'rgba(255,255,255,0.6)', fontSize: 16, cursor: 'pointer', marginTop: 16 }}>← Tillbaka</button>
                  </>
                )}

                {steg === 2 && visaNyttBolag && (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 24 }}>Nytt bolag</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <input type="text" value={nyttBolagNamn} onChange={e => setNyttBolagNamn(e.target.value)} placeholder="Bolagsnamn" autoFocus style={{ flex: 1, padding: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 18, outline: 'none' }} />
                      <button onClick={laggTillNyttBolag} style={{ padding: '16px 24px', background: '#30D158', border: 'none', borderRadius: 12, color: '#000', fontSize: 20, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                    </div>
                    <button onClick={() => setVisaNyttBolag(false)} style={{ width: '100%', padding: 16, background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 12, color: 'rgba(255,255,255,0.6)', fontSize: 16, cursor: 'pointer', marginTop: 16 }}>← Tillbaka</button>
                  </>
                )}

                {steg === 3 && (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>{redigerar ? 'Ändra volym' : 'Ange volym'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24, color: 'rgba(255,255,255,0.6)', fontSize: 18 }}>
                      <span style={{ fontSize: 28 }}>{valdTyp === 'slut' ? '🪵' : '🌲'}</span>
                      <span>{valtBolag}</span>
                    </div>
                    <input type="number" value={valdVolym} onChange={e => setValdVolym(e.target.value)} placeholder="0" autoFocus style={{ width: '100%', padding: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, color: '#fff', fontSize: 48, fontWeight: 700, textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
                    <div style={{ textAlign: 'center', fontSize: 18, color: 'rgba(255,255,255,0.4)', marginTop: 8, marginBottom: 24 }}>m³</div>
                    <button onClick={spara} disabled={!valdVolym} style={{ width: '100%', padding: 18, border: 'none', borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: valdVolym ? 'pointer' : 'default', background: valdVolym ? (valdTyp === 'slut' ? '#FF9F0A' : '#30D158') : 'rgba(255,255,255,0.1)', color: valdVolym ? '#000' : 'rgba(255,255,255,0.3)' }}>{redigerar ? 'Spara ändring' : 'Lägg till'}</button>
                    <button onClick={() => redigerar ? closeSheet() : setSteg(2)} style={{ width: '100%', padding: 16, background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 12, color: 'rgba(255,255,255,0.6)', fontSize: 16, cursor: 'pointer', marginTop: 16 }}>{redigerar ? 'Avbryt' : '← Tillbaka'}</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Info om enskild beställning */}
          {sheet === 'info' && visaInfo && (
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1c1c1e', borderRadius: '24px 24px 0 0', zIndex: 101, paddingBottom: 40, animation: closing ? 'slideDown 0.25s ease forwards' : 'slideUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
              <div onClick={closeSheet} style={{ padding: '14px 0 10px', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
              </div>
              <div style={{ padding: '0 24px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                  <span style={{ fontSize: 48 }}>{visaInfo.typ === 'slut' ? '🪵' : '🌲'}</span>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{visaInfo.bolag}</div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{visaInfo.typ === 'slut' ? 'Slutavverkning' : 'Gallring'}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontSize: 64, fontWeight: 700, marginBottom: 8 }}>
                  <CountUp value={visaInfo.volym} /><span style={{ fontSize: 24, fontWeight: 400, color: 'rgba(255,255,255,0.5)', marginLeft: 8 }}>m³</span>
                </div>
                <div style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.35)', marginBottom: 32 }}>Skapad {new Date(visaInfo.created_at).toLocaleDateString('sv-SE')}</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => { setRedigerar(visaInfo); setValdTyp(visaInfo.typ); setValtBolag(visaInfo.bolag); setValdVolym(visaInfo.volym.toString()); setSteg(3); setSheet('ny') }} style={{ flex: 1, padding: 16, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>✏️ Ändra</button>
                  <button onClick={() => taBortBestallning(visaInfo.id)} style={{ flex: 1, padding: 16, background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 14, color: '#FF453A', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>🗑️ Ta bort</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
