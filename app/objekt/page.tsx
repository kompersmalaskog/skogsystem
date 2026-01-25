'use client'

import { useState, useEffect } from 'react'

const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

const SUPABASE_URL = 'https://mxydghzfacbenbgpodex.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWRnaHpmYWNiZW5iZ3BvZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NzU2MjMsImV4cCI6MjA4NDQ1MTYyM30.NRBG5HcAtEXRTyf4YTp71A3iATk6U3DGhfdJ5EYlMyo'

interface Koordinater {
  typ: 'sweref99' | 'wgs84'
  x: number | null
  y: number | null
}

interface Objekt {
  id: string
  ar: number
  manad: number
  vo_nummer: string
  namn: string
  bolag: string
  typ: string
  atgard: string
  volym: number
  status: string
  maskiner: string[]
  koordinater: Koordinater
  ordning: number
}

interface Bestallning {
  id: string
  ar: number
  manad: number
  typ: string
  bolag: string
  volym: number
}

interface FormData {
  voNummer: string
  namn: string
  bolag: string
  typ: 'slut' | 'gallring'
  atgard: string
  volym: string
  maskiner: string[]
  koordinatTyp: 'sweref99' | 'wgs84'
  koordinatX: string
  koordinatY: string
}

const statusCycle: Record<string, string> = { 
  planerad: 'skordning', 
  skordning: 'skotning', 
  skotning: 'klar', 
  klar: 'planerad' 
}

const statusColor: Record<string, string> = { 
  planerad: '#444', 
  skordning: '#eab308', 
  skotning: '#3b82f6', 
  klar: '#22c55e' 
}

export default function ObjektPage() {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [animated, setAnimated] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const [objekt, setObjekt] = useState<Objekt[]>([])
  const [bestallningar, setBestallningar] = useState<Bestallning[]>([])

  const [form, setForm] = useState<FormData>({ 
    voNummer: '', 
    namn: '', 
    bolag: '', 
    typ: 'slut', 
    atgard: '', 
    volym: '', 
    maskiner: [], 
    koordinatTyp: 'sweref99', 
    koordinatX: '', 
    koordinatY: '' 
  })

  const [sparadeBolag] = useState(['Vida', 'Södra', 'ATA'])
  const [sparadeMaskiner] = useState(['Ponsse Scorpion', 'Ponsse Buffalo', 'Extern skotare'])
  const [sparadeAtgarder] = useState<Record<string, string[]>>({ 
    slut: ['Rp', 'Lrk', 'Au', 'VF/BarkB'], 
    gallring: ['Första gallring', 'Andra gallring', 'Gallring'] 
  })

  const [showBestallningar, setShowBestallningar] = useState(false)

  // Hämta data med fetch (samma som helikopter-vyn)
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      
      try {
        // Hämta beställningar
        const bestRes = await fetch(
          `${SUPABASE_URL}/rest/v1/bestallningar?select=*`,
          {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          }
        )
        if (bestRes.ok) {
          const bestData = await bestRes.json()
          setBestallningar(bestData)
        }
        
        // Hämta objekt
        const objRes = await fetch(
          `${SUPABASE_URL}/rest/v1/objekt?select=*`,
          {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          }
        )
        if (objRes.ok) {
          const objData = await objRes.json()
          setObjekt(objData)
        }
      } catch (err) {
        console.error('Fetch error:', err)
      }
      
      setLoading(false)
    }
    fetchData()
  }, [])

  useEffect(() => {
    setAnimated(false)
    setShowBestallningar(false)
    const timer = setTimeout(() => setAnimated(true), 100)
    return () => clearTimeout(timer)
  }, [month, year])

  // Filtrera för intern användning (manad 1-12 i DB, 0-11 i UI)
  const manadsBestallningar = bestallningar.filter(b => b.ar === year && b.manad === month + 1)
  const aktuella = objekt.filter(o => o.ar === year && o.manad === month + 1)
  
  const slutObj = aktuella.filter(o => o.typ === 'slutavverkning')
  const gallObj = aktuella.filter(o => o.typ === 'gallring')
  const slutTotal = slutObj.reduce((s, o) => s + (o.volym || 0), 0)
  const gallTotal = gallObj.reduce((s, o) => s + (o.volym || 0), 0)
  
  const slutBest = manadsBestallningar.filter(b => b.typ === 'slutavverkning').reduce((s, b) => s + b.volym, 0)
  const gallBest = manadsBestallningar.filter(b => b.typ === 'gallring').reduce((s, b) => s + b.volym, 0)

  const bytManad = (dir: number) => {
    let m = month + dir, y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  const toggleStatus = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const obj = objekt.find(o => o.id === id)
    if (!obj) return
    const newStatus = statusCycle[obj.status] || 'planerad'
    
    setObjekt(objekt.map(o => o.id === id ? { ...o, status: newStatus } : o))
    
    // Uppdatera i Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/objekt?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: newStatus })
    })
  }
  
  const deleteObj = async (id: string) => {
    setObjekt(objekt.filter(o => o.id !== id))
    
    await fetch(`${SUPABASE_URL}/rest/v1/objekt?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    })
  }

  const openFormWithType = (typ: 'slut' | 'gallring') => {
    setShowForm(true)
    setEditingId(null)
    setForm({ voNummer: '', namn: '', bolag: '', typ, atgard: '', volym: '', maskiner: [], koordinatTyp: 'sweref99', koordinatX: '', koordinatY: '' })
  }

  const saveObj = async () => {
    if (!form.voNummer || !form.namn || !form.bolag || !form.volym) return
    
    const koordinater: Koordinater = { 
      typ: form.koordinatTyp, 
      x: form.koordinatX ? parseFloat(form.koordinatX) : null, 
      y: form.koordinatY ? parseFloat(form.koordinatY) : null 
    }
    
    const supabaseTyp = form.typ === 'slut' ? 'slutavverkning' : 'gallring'
    
    if (editingId) {
      const updated = { 
        vo_nummer: form.voNummer, 
        namn: form.namn, 
        bolag: form.bolag, 
        typ: supabaseTyp, 
        atgard: form.atgard, 
        volym: parseInt(form.volym), 
        maskiner: form.maskiner, 
        koordinater 
      }
      
      setObjekt(objekt.map(o => o.id === editingId ? { ...o, ...updated } : o))
      
      await fetch(`${SUPABASE_URL}/rest/v1/objekt?id=eq.${editingId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(updated)
      })
    } else {
      const newObj = { 
        ar: year, 
        manad: month + 1,
        vo_nummer: form.voNummer, 
        namn: form.namn, 
        bolag: form.bolag, 
        typ: supabaseTyp, 
        atgard: form.atgard, 
        volym: parseInt(form.volym), 
        status: 'planerad', 
        maskiner: form.maskiner, 
        koordinater, 
        ordning: aktuella.filter(o => o.typ === supabaseTyp).length + 1 
      }
      
      const res = await fetch(`${SUPABASE_URL}/rest/v1/objekt`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(newObj)
      })
      
      if (res.ok) {
        const [data] = await res.json()
        if (data) setObjekt([...objekt, data])
      }
    }
    setShowForm(false)
    setEditingId(null)
  }

  const editObj = (obj: Objekt) => {
    setForm({ 
      voNummer: obj.vo_nummer || '', 
      namn: obj.namn, 
      bolag: obj.bolag, 
      typ: obj.typ === 'slutavverkning' ? 'slut' : 'gallring', 
      atgard: obj.atgard || '', 
      volym: obj.volym?.toString() || '', 
      maskiner: obj.maskiner || [], 
      koordinatTyp: obj.koordinater?.typ || 'sweref99', 
      koordinatX: obj.koordinater?.x?.toString() || '', 
      koordinatY: obj.koordinater?.y?.toString() || '' 
    })
    setEditingId(obj.id)
    setShowForm(true)
  }

  const toggleMaskin = (maskin: string) => {
    if (form.maskiner.includes(maskin)) setForm({ ...form, maskiner: form.maskiner.filter(m => m !== maskin) })
    else setForm({ ...form, maskiner: [...form.maskiner, maskin] })
  }

  const Arc = ({ percent, size = 110, color }: { percent: number, size?: number, color: string }) => {
    const stroke = 6
    const r = (size - stroke) / 2
    const circ = r * 2 * Math.PI
    const animatedPercent = animated ? Math.min(percent, 100) : 0
    const offset = circ - (animatedPercent / 100) * circ
    const isComplete = percent >= 100
    const id = Math.random().toString(36).substr(2, 9)
    
    return (
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
        <defs>
          <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={isComplete ? 6 : 3} result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" filter={`url(#glow-${id})`} style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
        {isComplete && <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke + 4} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" opacity={0.3} style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />}
      </svg>
    )
  }

  const AnimatedNumber = ({ value }: { value: number }) => {
    const [displayValue, setDisplayValue] = useState(0)
    useEffect(() => {
      if (!animated) { setDisplayValue(0); return }
      const startTime = Date.now()
      const animate = () => {
        const progress = Math.min((Date.now() - startTime) / 1500, 1)
        setDisplayValue(Math.round(value * (1 - Math.pow(1 - progress, 3))))
        if (progress < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    }, [animated, value])
    return <>{displayValue}</>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      
      <div style={{ padding: '20px 24px 12px' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: '600', letterSpacing: '1px' }}>KOMPERSMÅLA SKOG</div>
        <div style={{ fontSize: '32px', fontWeight: '700', color: '#fff', marginTop: '4px', letterSpacing: '-1px' }}>Objekt</div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Laddar...</div>
        </div>
      ) : (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 24px 16px', gap: '24px' }}>
          <button onClick={() => bytManad(-1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '20px', cursor: 'pointer', padding: '8px' }}>‹</button>
          <button onClick={() => manadsBestallningar.length > 0 && setShowBestallningar(true)} style={{ background: 'none', border: 'none', cursor: manadsBestallningar.length > 0 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>{MANADER[month]} {year}</span>
            {manadsBestallningar.length > 0 && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>▼</span>}
          </button>
          <button onClick={() => bytManad(1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '20px', cursor: 'pointer', padding: '8px' }}>›</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', padding: '16px 24px 48px' }}>
          {[{ typ: 'slut' as const, label: 'Slutavverkning', total: slutTotal, best: slutBest, color: '#eab308' }, { typ: 'gallring' as const, label: 'Gallring', total: gallTotal, best: gallBest, color: '#22c55e' }].map(item => {
            const percent = item.best ? (item.total / item.best) * 100 : 0
            const isComplete = percent >= 100
            return (
              <div key={item.typ} onClick={() => openFormWithType(item.typ)} style={{ textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ position: 'relative', display: 'inline-block', filter: isComplete ? `drop-shadow(0 0 20px ${item.color})` : 'none' }}>
                  <Arc percent={percent} color={item.color} />
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#fff', textShadow: isComplete ? `0 0 20px ${item.color}` : 'none' }}><AnimatedNumber value={Math.round(percent)} /></div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '-2px' }}>%</div>
                  </div>
                </div>
                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontWeight: '500' }}>{item.label}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}><AnimatedNumber value={item.total} /> / {item.best} m³</div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '0 24px', maxWidth: '600px', margin: '0 auto' }}>
          {aktuella.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>Tryck på en ring för att lägga till</div>
          ) : aktuella.map((obj, i) => (
            <div key={obj.id} onClick={() => editObj(obj)} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 0', borderTop: i === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div onClick={(e) => toggleStatus(e, obj.id)} style={{ width: '10px', height: '10px', borderRadius: '50%', background: statusColor[obj.status] || '#444', boxShadow: obj.status !== 'planerad' ? `0 0 12px ${statusColor[obj.status]}` : 'none', cursor: 'pointer' }} />
                <div style={{ width: '4px', height: '36px', borderRadius: '2px', background: obj.typ === 'slutavverkning' ? '#eab308' : '#22c55e', opacity: (obj.koordinater?.x && obj.koordinater?.y) ? 1 : 0.25, boxShadow: (obj.koordinater?.x && obj.koordinater?.y) ? `0 0 8px ${obj.typ === 'slutavverkning' ? '#eab308' : '#22c55e'}` : 'none' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>{obj.namn}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>{obj.bolag}{obj.atgard && ` · ${obj.atgard}`}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '20px', fontWeight: '600', color: '#fff' }}>{obj.volym}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>m³</div>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '18px', marginLeft: '8px' }}>›</div>
            </div>
          ))}
        </div>
      </>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowForm(false)}>
          <div style={{ background: '#161616', width: '100%', maxWidth: '500px', borderRadius: '20px 20px 0 0', padding: '24px', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px', margin: '0 auto 24px' }} />
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: '32px' }}>{editingId ? 'Redigera objekt' : (form.typ === 'slut' ? 'Ny slutavverkning' : 'Ny gallring')}</h2>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: '600' }}>VO-NUMMER</label>
              <input value={form.voNummer} onChange={e => setForm({ ...form, voNummer: e.target.value })} style={{ width: '100%', padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '12px', fontSize: '16px', color: '#fff', boxSizing: 'border-box' }} />
            </div>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: '600' }}>NAMN</label>
              <input value={form.namn} onChange={e => setForm({ ...form, namn: e.target.value })} style={{ width: '100%', padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '12px', fontSize: '16px', color: '#fff', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: '600' }}>ÅTGÄRD</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {sparadeAtgarder[form.typ].map(a => (
                  <button key={a} onClick={() => setForm({ ...form, atgard: a })} style={{ padding: '10px 18px', borderRadius: '20px', border: 'none', background: form.atgard === a ? '#fff' : 'rgba(255,255,255,0.08)', color: form.atgard === a ? '#000' : 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>{a}</button>
                ))}
              </div>
            </div>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: '600' }}>BOLAG</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {sparadeBolag.map(b => (
                  <button key={b} onClick={() => setForm({ ...form, bolag: b })} style={{ padding: '10px 18px', borderRadius: '20px', border: 'none', background: form.bolag === b ? '#fff' : 'rgba(255,255,255,0.08)', color: form.bolag === b ? '#000' : 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>{b}</button>
                ))}
              </div>
            </div>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: '600' }}>VOLYM M³</label>
              <input type="number" value={form.volym} onChange={e => setForm({ ...form, volym: e.target.value })} style={{ width: '100%', padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '12px', fontSize: '24px', color: '#fff', fontWeight: '600', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: '600' }}>MASKINER</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {sparadeMaskiner.map(m => (
                  <button key={m} onClick={() => toggleMaskin(m)} style={{ padding: '10px 18px', borderRadius: '20px', border: 'none', background: form.maskiner.includes(m) ? '#fff' : 'rgba(255,255,255,0.08)', color: form.maskiner.includes(m) ? '#000' : 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>{m}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '12px', fontWeight: '600' }}>KOORDINATER</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {(['sweref99', 'wgs84'] as const).map(t => (
                  <button key={t} onClick={() => setForm({ ...form, koordinatTyp: t })} style={{ padding: '10px 18px', borderRadius: '20px', border: 'none', background: form.koordinatTyp === t ? '#fff' : 'rgba(255,255,255,0.08)', color: form.koordinatTyp === t ? '#000' : 'rgba(255,255,255,0.5)', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>{t === 'sweref99' ? 'SWEREF99' : 'WGS84'}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input value={form.koordinatX} onChange={e => setForm({ ...form, koordinatX: e.target.value })} placeholder={form.koordinatTyp === 'sweref99' ? 'X (N)' : 'Lat'} style={{ flex: 1, padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '12px', fontSize: '14px', color: '#fff' }} />
                <input value={form.koordinatY} onChange={e => setForm({ ...form, koordinatY: e.target.value })} placeholder={form.koordinatTyp === 'sweref99' ? 'Y (E)' : 'Lng'} style={{ flex: 1, padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '12px', fontSize: '14px', color: '#fff' }} />
              </div>
            </div>

            <button onClick={saveObj} style={{ width: '100%', padding: '18px', border: 'none', borderRadius: '14px', background: '#fff', color: '#000', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px' }}>Spara</button>
            {editingId && (
              <button onClick={() => { deleteObj(editingId); setShowForm(false) }} style={{ width: '100%', padding: '16px', border: 'none', borderRadius: '14px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '16px', fontWeight: '500', cursor: 'pointer', marginBottom: '12px' }}>Ta bort</button>
            )}
            <button onClick={() => setShowForm(false)} style={{ width: '100%', padding: '16px', border: 'none', borderRadius: '14px', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: '16px', cursor: 'pointer' }}>Avbryt</button>
          </div>
        </div>
      )}

      {showBestallningar && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease' }} onClick={() => setShowBestallningar(false)}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#161616', borderRadius: '20px 20px 0 0', padding: '12px 24px 40px', animation: 'slideUp 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}><div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px' }} /></div>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#fff' }}>Beställningar</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>{MANADER[month]} {year}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(() => {
                const perBolag: Record<string, { slut: number, gallring: number }> = {}
                manadsBestallningar.forEach(b => {
                  if (!perBolag[b.bolag]) perBolag[b.bolag] = { slut: 0, gallring: 0 }
                  if (b.typ === 'slutavverkning') perBolag[b.bolag].slut += b.volym
                  else perBolag[b.bolag].gallring += b.volym
                })
                return Object.entries(perBolag).map(([bolag, volymer]) => {
                  const inplaneratSlut = aktuella.filter(o => o.typ === 'slutavverkning' && o.bolag === bolag).reduce((s, o) => s + (o.volym || 0), 0)
                  const inplaneratGall = aktuella.filter(o => o.typ === 'gallring' && o.bolag === bolag).reduce((s, o) => s + (o.volym || 0), 0)
                  return (
                    <div key={bolag} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '16px', padding: '16px 20px' }}>
                      <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '14px' }}>{bolag}</div>
                      {volymer.slut > 0 && (
                        <div style={{ marginBottom: volymer.gallring > 0 ? '12px' : 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Slutavverkning</span>
                            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', fontWeight: '500' }}>{inplaneratSlut} / {volymer.slut} m³{inplaneratSlut >= volymer.slut && <span style={{ color: '#22c55e' }}> ✓</span>}</span>
                          </div>
                          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min((inplaneratSlut / volymer.slut) * 100, 100)}%`, height: '100%', background: '#eab308', borderRadius: '2px', boxShadow: inplaneratSlut >= volymer.slut ? '0 0 12px #eab308' : 'none' }} />
                          </div>
                        </div>
                      )}
                      {volymer.gallring > 0 && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Gallring</span>
                            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', fontWeight: '500' }}>{inplaneratGall} / {volymer.gallring} m³{inplaneratGall >= volymer.gallring && <span style={{ color: '#22c55e' }}> ✓</span>}</span>
                          </div>
                          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min((inplaneratGall / volymer.gallring) * 100, 100)}%`, height: '100%', background: '#22c55e', borderRadius: '2px', boxShadow: inplaneratGall >= volymer.gallring ? '0 0 12px #22c55e' : 'none' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
