'use client'
import { useState, useEffect, MouseEvent } from 'react'
import { createClient } from '@supabase/supabase-js'

const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

const styles = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
`

// Supabase client
const supabaseUrl = 'https://mxydghzfacbenbgpodex.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWRnaHpmYWNiZW5iZ3BvZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NzU2MjMsImV4cCI6MjA4NDQ1MTYyM30.NRBG5HcAtEXRTyf4YTp71A3iATk6U3DGhfdJ5EYlMyo'
const supabase = createClient(supabaseUrl, supabaseKey)

// Types
interface Koordinater {
  typ: 'sweref99' | 'wgs84'
  x: number | null
  y: number | null
}

interface Objekt {
  id: string
  year: number
  month: number
  voNummer: string
  namn: string
  bolag: string
  typ: 'slut' | 'gallring'
  atgard: string
  volym: number
  status: 'planerad' | 'skordning' | 'skotning' | 'klar'
  maskiner: string[]
  koordinater: Koordinater
  ordning: number
}

interface Bestallning {
  id: string
  year: number
  month: number
  typ: 'slut' | 'gallring'
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

interface SparadeAtgarder {
  slut: string[]
  gallring: string[]
}

type StatusType = 'planerad' | 'skordning' | 'skotning' | 'klar'

const statusCycle: Record<StatusType, StatusType> = { 
  planerad: 'skordning', 
  skordning: 'skotning', 
  skotning: 'klar', 
  klar: 'planerad' 
}

const statusColor: Record<StatusType, string> = { 
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
  
  // Data från Supabase
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

  const [sparadeBolag, setSparadeBolag] = useState<string[]>(['Vida', 'Södra', 'ATA'])
  const [sparadeMaskiner, setSparadeMaskiner] = useState<string[]>(['Ponsse Scorpion', 'Ponsse Buffalo', 'Extern skotare'])
  const [sparadeAtgarder, setSparadeAtgarder] = useState<SparadeAtgarder>({ 
    slut: ['Rp', 'Lrk', 'Au', 'VF/BarkB'], 
    gallring: ['Första gallring', 'Andra gallring', 'Gallring'] 
  })
  
  const [showAddBolag, setShowAddBolag] = useState(false)
  const [showAddMaskin, setShowAddMaskin] = useState(false)
  const [showAddAtgard, setShowAddAtgard] = useState(false)
  const [editMode, setEditMode] = useState<string | null>(null)
  const [newBolag, setNewBolag] = useState('')
  const [newMaskin, setNewMaskin] = useState('')
  const [newAtgard, setNewAtgard] = useState('')

  const [showBestallningar, setShowBestallningar] = useState(false)

  // Hämta data från Supabase vid start
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      
      // Hämta beställningar
      const { data: bestData } = await supabase
        .from('bestallningar')
        .select('*')
      if (bestData) {
        const mapped: Bestallning[] = bestData.map((b: any) => ({
          ...b,
          year: b.ar,
          month: b.manad - 1,
          typ: b.typ === 'slutavverkning' ? 'slut' : 'gallring'
        }))
        setBestallningar(mapped)
      }
      
      // Hämta objekt
      const { data: objData } = await supabase
        .from('objekt')
        .select('*')
      if (objData) {
        const mapped: Objekt[] = objData.map((o: any) => ({
          ...o,
          year: o.ar,
          month: o.manad - 1,
          voNummer: o.vo_nummer,
          typ: o.typ === 'slutavverkning' ? 'slut' : 'gallring'
        }))
        setObjekt(mapped)
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

  // Filtrera beställningar för aktuell månad
  const manadsBestallningar = bestallningar.filter(b => b.year === year && b.month === month)
  
  const aktuella = objekt.filter(o => o.year === year && o.month === month)
  const slutObj = aktuella.filter(o => o.typ === 'slut')
  const gallObj = aktuella.filter(o => o.typ === 'gallring')
  const slutTotal = slutObj.reduce((s, o) => s + o.volym, 0)
  const gallTotal = gallObj.reduce((s, o) => s + o.volym, 0)
  
  // Beräkna totaler per typ (aggregerat från alla bolag)
  const slutBest = manadsBestallningar.filter(b => b.typ === 'slut').reduce((s, b) => s + b.volym, 0)
  const gallBest = manadsBestallningar.filter(b => b.typ === 'gallring').reduce((s, b) => s + b.volym, 0)

  const bytManad = (dir: number) => {
    let m = month + dir, y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  const toggleStatus = async (e: MouseEvent, id: string) => {
    e.stopPropagation()
    const obj = objekt.find(o => o.id === id)
    if (!obj) return
    const newStatus = statusCycle[obj.status]
    
    setObjekt(objekt.map(o => o.id === id ? { ...o, status: newStatus } : o))
    await supabase.from('objekt').update({ status: newStatus }).eq('id', id)
  }
  
  const deleteObj = async (id: string) => {
    setObjekt(objekt.filter(o => o.id !== id))
    await supabase.from('objekt').delete().eq('id', id)
  }

  const openFormWithType = (typ: 'slut' | 'gallring') => {
    setShowForm(true)
    setEditingId(null)
    setEditMode(null)
    setShowAddAtgard(false)
    setShowAddBolag(false)
    setShowAddMaskin(false)
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
      setObjekt(objekt.map(o => o.id === editingId ? { 
        ...o, 
        voNummer: form.voNummer, 
        namn: form.namn, 
        bolag: form.bolag, 
        typ: form.typ, 
        atgard: form.atgard, 
        volym: parseInt(form.volym), 
        maskiner: form.maskiner, 
        koordinater 
      } : o))
      await supabase.from('objekt').update(updated).eq('id', editingId)
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
        ordning: aktuella.filter(o => o.typ === form.typ).length + 1 
      }
      
      const { data } = await supabase.from('objekt').insert(newObj).select().single()
      if (data) {
        setObjekt([...objekt, { 
          ...data, 
          year: data.ar, 
          month: data.manad - 1, 
          voNummer: data.vo_nummer,
          typ: data.typ === 'slutavverkning' ? 'slut' : 'gallring'
        } as Objekt])
      }
    }
    setShowForm(false)
    setEditingId(null)
  }

  const editObj = (obj: Objekt) => {
    setForm({ 
      voNummer: obj.voNummer || '', 
      namn: obj.namn, 
      bolag: obj.bolag, 
      typ: obj.typ, 
      atgard: obj.atgard || '', 
      volym: obj.volym.toString(), 
      maskiner: obj.maskiner || [], 
      koordinatTyp: obj.koordinater?.typ || 'sweref99', 
      koordinatX: obj.koordinater?.x?.toString() || '', 
      koordinatY: obj.koordinater?.y?.toString() || '' 
    })
    setEditingId(obj.id)
    setEditMode(null)
    setShowAddAtgard(false)
    setShowAddBolag(false)
    setShowAddMaskin(false)
    setShowForm(true)
  }

  const toggleMaskin = (maskin: string) => {
    if (editMode === 'maskin') return
    if (form.maskiner.includes(maskin)) setForm({ ...form, maskiner: form.maskiner.filter(m => m !== maskin) })
    else setForm({ ...form, maskiner: [...form.maskiner, maskin] })
  }

  const addBolag = () => {
    if (newBolag.trim() && !sparadeBolag.includes(newBolag.trim())) {
      setSparadeBolag([...sparadeBolag, newBolag.trim()])
      setForm({ ...form, bolag: newBolag.trim() })
    }
    setNewBolag(''); setShowAddBolag(false)
  }
  
  const removeBolag = (b: string) => {
    setSparadeBolag(sparadeBolag.filter(x => x !== b))
    if (form.bolag === b) setForm({ ...form, bolag: '' })
  }

  const addMaskin = () => {
    if (newMaskin.trim() && !sparadeMaskiner.includes(newMaskin.trim())) {
      setSparadeMaskiner([...sparadeMaskiner, newMaskin.trim()])
      setForm({ ...form, maskiner: [...form.maskiner, newMaskin.trim()] })
    }
    setNewMaskin(''); setShowAddMaskin(false)
  }
  
  const removeMaskin = (m: string) => {
    setSparadeMaskiner(sparadeMaskiner.filter(x => x !== m))
    setForm({ ...form, maskiner: form.maskiner.filter(x => x !== m) })
  }

  const addAtgard = () => {
    if (newAtgard.trim() && !sparadeAtgarder[form.typ].includes(newAtgard.trim())) {
      setSparadeAtgarder({ ...sparadeAtgarder, [form.typ]: [...sparadeAtgarder[form.typ], newAtgard.trim()] })
      setForm({ ...form, atgard: newAtgard.trim() })
    }
    setNewAtgard(''); setShowAddAtgard(false)
  }
  
  const removeAtgard = (a: string) => {
    setSparadeAtgarder({ ...sparadeAtgarder, [form.typ]: sparadeAtgarder[form.typ].filter(x => x !== a) })
    if (form.atgard === a) setForm({ ...form, atgard: '' })
  }

  // Arc component
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
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle 
          cx={size/2} cy={size/2} r={r} fill="none" 
          stroke={color}
          strokeWidth={stroke} 
          strokeDasharray={circ} 
          strokeDashoffset={offset}
          strokeLinecap="round"
          filter={`url(#glow-${id})`}
          style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }} 
        />
        {isComplete && (
          <circle 
            cx={size/2} cy={size/2} r={r} fill="none" 
            stroke={color}
            strokeWidth={stroke + 4}
            strokeDasharray={circ} 
            strokeDashoffset={offset}
            strokeLinecap="round"
            opacity={0.3}
            style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }} 
          />
        )}
      </svg>
    )
  }

  // AnimatedNumber component
  const AnimatedNumber = ({ value, duration = 1500 }: { value: number, duration?: number }) => {
    const [displayValue, setDisplayValue] = useState(0)
    
    useEffect(() => {
      if (!animated) {
        setDisplayValue(0)
        return
      }
      
      const startTime = Date.now()
      const startValue = 0
      const endValue = value
      
      const animate = () => {
        const now = Date.now()
        const elapsed = now - startTime
        const progress = Math.min(elapsed / duration, 1)
        const easeOut = 1 - Math.pow(1 - progress, 3)
        const current = Math.round(startValue + (endValue - startValue) * easeOut)
        setDisplayValue(current)
        if (progress < 1) requestAnimationFrame(animate)
      }
      
      requestAnimationFrame(animate)
    }, [animated, value, duration])
    
    return <>{displayValue}</>
  }

  // ChipGroup component
  interface ChipGroupProps {
    items: string[]
    selected: string | string[]
    onSelect: (item: string) => void
    onRemove: (item: string) => void
    editModeKey: string
    showAdd: boolean
    setShowAdd: (show: boolean) => void
    newValue: string
    setNewValue: (value: string) => void
    addFn: () => void
    label: string
    multiSelect?: boolean
  }

  const ChipGroup = ({ items, selected, onSelect, onRemove, editModeKey, showAdd, setShowAdd, newValue, setNewValue, addFn, label, multiSelect }: ChipGroupProps) => {
    const isEditing = editMode === editModeKey
    const isSelected = (item: string) => multiSelect ? (selected as string[]).includes(item) : selected === item
    
    return (
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: '600', letterSpacing: '0.5px' }}>{label}</label>
          <button onClick={() => setEditMode(isEditing ? null : editModeKey)} style={{
            background: 'none', border: 'none', fontSize: '11px', 
            color: isEditing ? '#ef4444' : 'rgba(255,255,255,0.3)', cursor: 'pointer'
          }}>{isEditing ? 'Klar' : 'Ändra'}</button>
        </div>
        {!showAdd ? (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {items.map(item => (
              <button key={item} onClick={() => !isEditing && onSelect(item)} style={{
                padding: '10px 18px', borderRadius: '20px', border: 'none',
                background: isSelected(item) ? '#fff' : 'rgba(255,255,255,0.08)',
                color: isSelected(item) ? '#000' : 'rgba(255,255,255,0.6)',
                fontSize: '14px', fontWeight: '500', cursor: isEditing ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
                transition: 'all 0.2s'
              }}>
                {item}
                {isEditing && (
                  <span onClick={(e) => { e.stopPropagation(); onRemove(item) }} style={{
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', color: '#fff', cursor: 'pointer', marginLeft: '2px'
                  }}>✕</span>
                )}
              </button>
            ))}
            <button onClick={() => setShowAdd(true)} style={{
              padding: '10px 18px', borderRadius: '20px',
              border: '1.5px dashed rgba(255,255,255,0.15)',
              background: 'transparent', color: 'rgba(255,255,255,0.3)',
              fontSize: '14px', cursor: 'pointer'
            }}>+</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="" autoFocus
              style={{ flex: 1, padding: '12px 18px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '20px', fontSize: '14px', color: '#fff' }} 
              onKeyDown={e => e.key === 'Enter' && addFn()} />
            <button onClick={addFn} style={{ padding: '12px 20px', background: '#fff', color: '#000', border: 'none', borderRadius: '20px', fontWeight: '600', cursor: 'pointer' }}>✓</button>
            <button onClick={() => { setShowAdd(false); setNewValue('') }} style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer' }}>✕</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}>
      <style>{styles}</style>
      
      {/* Header */}
      <div style={{ padding: '20px 24px 12px' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: '600', letterSpacing: '1px' }}>KOMPERSMÅLA SKOG</div>
        <div style={{ fontSize: '32px', fontWeight: '700', color: '#fff', marginTop: '4px', letterSpacing: '-1px' }}>Objekt</div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 0' }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Laddar...</div>
        </div>
      ) : (
      <>
      {/* Month */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 24px 16px', gap: '24px' }}>
        <button onClick={() => bytManad(-1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '20px', cursor: 'pointer', padding: '8px' }}>‹</button>
        <button 
          onClick={() => manadsBestallningar.length > 0 && setShowBestallningar(true)}
          style={{ 
            background: 'none', 
            border: 'none', 
            cursor: manadsBestallningar.length > 0 ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span style={{ fontSize: '18px', fontWeight: '600', color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.3px' }}>
            {MANADER[month]} {year}
          </span>
          {manadsBestallningar.length > 0 && (
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>▼</span>
          )}
        </button>
        <button onClick={() => bytManad(1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '20px', cursor: 'pointer', padding: '8px' }}>›</button>
      </div>

      {/* Progress Rings */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', padding: '16px 24px 48px' }}>
        {[
          { typ: 'slut' as const, label: 'Slutavverkning', total: slutTotal, best: slutBest, color: '#eab308' },
          { typ: 'gallring' as const, label: 'Gallring', total: gallTotal, best: gallBest, color: '#22c55e' }
        ].map(item => {
          const percent = item.best ? (item.total / item.best) * 100 : 0
          const isComplete = percent >= 100
          return (
            <div 
              key={item.typ}
              onClick={() => openFormWithType(item.typ)}
              style={{ textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s ease' }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
            >
              <div style={{ 
                position: 'relative', 
                display: 'inline-block',
                filter: isComplete ? `drop-shadow(0 0 20px ${item.color})` : 'none',
                transition: 'filter 0.5s ease'
              }}>
                <Arc percent={percent} color={item.color} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                  <div style={{ 
                    fontSize: '24px', 
                    fontWeight: '700', 
                    color: '#fff',
                    textShadow: isComplete ? `0 0 20px ${item.color}` : 'none',
                    transition: 'text-shadow 0.5s ease'
                  }}>
                    <AnimatedNumber value={Math.round(percent)} />
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '-2px' }}>%</div>
                </div>
              </div>
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontWeight: '500' }}>{item.label}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>
                  <AnimatedNumber value={item.total} /> / {item.best} m³
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Object List */}
      <div style={{ padding: '0 24px', maxWidth: '600px', margin: '0 auto' }}>
        {aktuella.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>
            Tryck på en ring för att lägga till
          </div>
        ) : (
          aktuella.map((obj, index) => (
            <div 
              key={obj.id}
              onClick={() => editObj(obj)}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '16px',
                padding: '20px 0',
                borderTop: index === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseOver={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'}
              onMouseOut={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  onClick={(e) => toggleStatus(e, obj.id)}
                  style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: statusColor[obj.status],
                    boxShadow: obj.status !== 'planerad' ? `0 0 12px ${statusColor[obj.status]}` : 'none',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                />
                <div style={{
                  width: '4px', height: '36px', borderRadius: '2px',
                  background: obj.typ === 'slut' ? '#eab308' : '#22c55e',
                  opacity: (obj.koordinater?.x && obj.koordinater?.y) ? 1 : 0.25,
                  boxShadow: (obj.koordinater?.x && obj.koordinater?.y) ? `0 0 8px ${obj.typ === 'slut' ? '#eab308' : '#22c55e'}` : 'none',
                  transition: 'all 0.3s ease'
                }} />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff', letterSpacing: '-0.2px' }}>{obj.namn}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                  {obj.bolag}{obj.atgard && ` · ${obj.atgard}`}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '20px', fontWeight: '600', color: '#fff', letterSpacing: '-0.5px' }}>{obj.volym}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>m³</div>
              </div>

              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '18px', marginLeft: '8px' }}>›</div>
            </div>
          ))
        )}
      </div>
      </>
      )}

      {/* Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowForm(false)}>
          <div style={{ background: '#161616', width: '100%', maxWidth: '500px', borderRadius: '20px 20px 0 0', padding: '24px', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            
            <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px', margin: '0 auto 24px' }} />
            
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: '32px', letterSpacing: '-0.5px' }}>
              {editingId ? 'Redigera objekt' : (form.typ === 'slut' ? 'Ny slutavverkning' : 'Ny gallring')}
            </h2>

            {/* VO-nummer */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: '600', letterSpacing: '0.5px' }}>VO-NUMMER</label>
              <input value={form.voNummer} onChange={e => setForm({ ...form, voNummer: e.target.value })} placeholder=""
                style={{ width: '100%', padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '12px', fontSize: '16px', color: '#fff', boxSizing: 'border-box' }} />
            </div>

            {/* Namn */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: '600', letterSpacing: '0.5px' }}>NAMN</label>
              <input value={form.namn} onChange={e => setForm({ ...form, namn: e.target.value })} placeholder=""
                style={{ width: '100%', padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '12px', fontSize: '16px', color: '#fff', boxSizing: 'border-box' }} />
            </div>

            {/* Åtgärd */}
            <ChipGroup
              items={sparadeAtgarder[form.typ]}
              selected={form.atgard}
              onSelect={(a) => setForm({ ...form, atgard: a })}
              onRemove={removeAtgard}
              editModeKey="atgard"
              showAdd={showAddAtgard}
              setShowAdd={setShowAddAtgard}
              newValue={newAtgard}
              setNewValue={setNewAtgard}
              addFn={addAtgard}
              label="ÅTGÄRD"
            />

            {/* Bolag */}
            <ChipGroup
              items={sparadeBolag}
              selected={form.bolag}
              onSelect={(b) => setForm({ ...form, bolag: b })}
              onRemove={removeBolag}
              editModeKey="bolag"
              showAdd={showAddBolag}
              setShowAdd={setShowAddBolag}
              newValue={newBolag}
              setNewValue={setNewBolag}
              addFn={addBolag}
              label="BOLAG"
            />

            {/* Volym */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: '600', letterSpacing: '0.5px' }}>VOLYM M³</label>
              <input type="number" value={form.volym} onChange={e => setForm({ ...form, volym: e.target.value })} placeholder=""
                style={{ width: '100%', padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '12px', fontSize: '24px', color: '#fff', fontWeight: '600', boxSizing: 'border-box', letterSpacing: '-0.5px' }} />
            </div>

            {/* Maskiner */}
            <ChipGroup
              items={sparadeMaskiner}
              selected={form.maskiner}
              onSelect={toggleMaskin}
              onRemove={removeMaskin}
              editModeKey="maskin"
              showAdd={showAddMaskin}
              setShowAdd={setShowAddMaskin}
              newValue={newMaskin}
              setNewValue={setNewMaskin}
              addFn={addMaskin}
              label="MASKINER"
              multiSelect
            />

            {/* Koordinater */}
            <div style={{ marginBottom: '32px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '12px', fontWeight: '600', letterSpacing: '0.5px' }}>KOORDINATER</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {(['sweref99', 'wgs84'] as const).map(t => (
                  <button key={t} onClick={() => setForm({ ...form, koordinatTyp: t })} style={{
                    padding: '10px 18px', borderRadius: '20px', border: 'none',
                    background: form.koordinatTyp === t ? '#fff' : 'rgba(255,255,255,0.08)',
                    color: form.koordinatTyp === t ? '#000' : 'rgba(255,255,255,0.5)',
                    fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                  }}>{t === 'sweref99' ? 'SWEREF99' : 'WGS84'}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input value={form.koordinatX} onChange={e => setForm({ ...form, koordinatX: e.target.value })} placeholder={form.koordinatTyp === 'sweref99' ? 'X (N)' : 'Lat'}
                  style={{ flex: 1, padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '12px', fontSize: '14px', color: '#fff' }} />
                <input value={form.koordinatY} onChange={e => setForm({ ...form, koordinatY: e.target.value })} placeholder={form.koordinatTyp === 'sweref99' ? 'Y (E)' : 'Lng'}
                  style={{ flex: 1, padding: '14px 16px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '12px', fontSize: '14px', color: '#fff' }} />
              </div>
            </div>

            {/* Save */}
            <button onClick={saveObj} style={{
              width: '100%', padding: '18px', border: 'none', borderRadius: '14px',
              background: '#fff', color: '#000', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px'
            }}>Spara</button>

            {editingId && (
              <button onClick={() => { deleteObj(editingId); setShowForm(false) }} style={{
                width: '100%', padding: '16px', border: 'none', borderRadius: '14px',
                background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '16px', fontWeight: '500', cursor: 'pointer', marginBottom: '12px'
              }}>Ta bort</button>
            )}

            <button onClick={() => setShowForm(false)} style={{
              width: '100%', padding: '16px', border: 'none', borderRadius: '14px',
              background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: '16px', cursor: 'pointer'
            }}>Avbryt</button>
          </div>
        </div>
      )}

      {/* Beställningar Bottom Sheet */}
      {showBestallningar && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.2s ease'
        }} onClick={() => setShowBestallningar(false)}>
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: '#161616',
              borderRadius: '20px 20px 0 0',
              padding: '12px 24px 40px',
              maxHeight: '70vh',
              animation: 'slideUp 0.3s ease'
            }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px' }} />
            </div>

            {/* Title */}
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#fff' }}>Beställningar</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>{MANADER[month]} {year}</div>
            </div>

            {/* Bolag cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(() => {
                const perBolag: Record<string, { slut: number, gallring: number }> = {}
                manadsBestallningar.forEach(b => {
                  if (!perBolag[b.bolag]) perBolag[b.bolag] = { slut: 0, gallring: 0 }
                  perBolag[b.bolag][b.typ] += b.volym
                })
                
                return Object.entries(perBolag).map(([bolag, volymer]) => {
                  const inplaneratSlut = aktuella.filter(o => o.typ === 'slut' && o.bolag === bolag).reduce((s, o) => s + o.volym, 0)
                  const inplaneratGall = aktuella.filter(o => o.typ === 'gallring' && o.bolag === bolag).reduce((s, o) => s + o.volym, 0)
                  
                  return (
                    <div key={bolag} style={{
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: '16px',
                      padding: '16px 20px'
                    }}>
                      <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '14px' }}>{bolag}</div>
                      
                      {volymer.slut > 0 && (
                        <div style={{ marginBottom: volymer.gallring > 0 ? '12px' : 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Slutavverkning</span>
                            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', fontWeight: '500' }}>
                              {inplaneratSlut} / {volymer.slut} m³
                              {inplaneratSlut >= volymer.slut && <span style={{ color: '#22c55e' }}> ✓</span>}
                            </span>
                          </div>
                          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ 
                              width: `${Math.min((inplaneratSlut / volymer.slut) * 100, 100)}%`, 
                              height: '100%', 
                              background: '#eab308',
                              borderRadius: '2px',
                              transition: 'all 0.5s ease',
                              boxShadow: inplaneratSlut >= volymer.slut ? '0 0 12px #eab308' : 'none'
                            }} />
                          </div>
                        </div>
                      )}
                      
                      {volymer.gallring > 0 && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Gallring</span>
                            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', fontWeight: '500' }}>
                              {inplaneratGall} / {volymer.gallring} m³
                              {inplaneratGall >= volymer.gallring && <span style={{ color: '#22c55e' }}> ✓</span>}
                            </span>
                          </div>
                          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ 
                              width: `${Math.min((inplaneratGall / volymer.gallring) * 100, 100)}%`, 
                              height: '100%', 
                              background: '#22c55e',
                              borderRadius: '2px',
                              transition: 'all 0.5s ease',
                              boxShadow: inplaneratGall >= volymer.gallring ? '0 0 12px #22c55e' : 'none'
                            }} />
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
