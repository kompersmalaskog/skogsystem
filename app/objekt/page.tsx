'use client'
import { useState } from 'react'
import Link from 'next/link'

// Månadsnamn
const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

// Status-typer
const STATUS: Record<string, { label: string; färg: string; bg: string; ikon: string }> = {
  planerad: { label: 'Planerad', färg: '#94a3b8', bg: '#f1f5f9', ikon: '⬜' },
  skordning: { label: 'Skördning pågår', färg: '#f59e0b', bg: '#fef3c7', ikon: '🟡' },
  skotning: { label: 'Skotning pågår', färg: '#f97316', bg: '#ffedd5', ikon: '🟠' },
  klar: { label: 'Klar', färg: '#22c55e', bg: '#dcfce7', ikon: '✅' }
}

interface Bestallning {
  id: number
  year: number
  month: number
  typ: 'slut' | 'gallring'
  bolag: string
  volym: number
}

interface Objekt {
  id: number
  year: number
  month: number
  voNummer: string
  namn: string
  bolag: string
  typ: 'slut' | 'gallring'
  atgard: string
  volymPlanerad: number
  volymFaktisk: number | null
  status: string
  maskiner: string[]
  ordning: number
  koordinater: {
    typ: 'sweref99' | 'wgs84'
    x: number | null  // SWEREF99 X eller Latitude
    y: number | null  // SWEREF99 Y eller Longitude
  }
}

export default function ObjektPage() {
  const inloggadAnvandare = 'Erik'
  
  // Datum
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(0)

  // Beställningar (samma som förut)
  const [bestallningar] = useState([
    { id: 1, year: 2026, month: 0, typ: 'slut', bolag: 'Vida', volym: 400 },
    { id: 2, year: 2026, month: 0, typ: 'slut', bolag: 'Södra', volym: 300 },
    { id: 3, year: 2026, month: 0, typ: 'gallring', bolag: 'Vida', volym: 250 },
  ])

  // Objekt
  const [objekt, setObjekt] = useState<Objekt[]>([])

  // Modal
  const [visa, setVisa] = useState(null)
  const [redigerar, setRedigerar] = useState(null)
  const [formKey, setFormKey] = useState(0)
  const [form, setForm] = useState({
    voNummer: '',
    namn: '',
    bolag: '',
    typ: 'slut' as 'slut' | 'gallring',
    atgard: '',
    volymPlanerad: '',
    maskiner: [] as string[],
    koordinatTyp: 'sweref99' as 'sweref99' | 'wgs84',
    koordinatX: '',
    koordinatY: ''
  })

  // Sparade bolag, maskiner & åtgärder
  const [sparadeBolag, setSparadeBolag] = useState(['Vida', 'Södra', 'ATA'])
  const [sparadeMaskiner, setSparadeMaskiner] = useState(['Ponsse Scorpion', 'Ponsse Buffalo', 'Extern skotare'])
  const [sparadeAtgarder, setSparadeAtgarder] = useState({
    slut: ['Rp', 'Lrk', 'Au', 'VF/BarkB'],
    gallring: ['Första gallring', 'Andra gallring', 'Gallring']
  })
  
  // Input för nya
  const [nyttBolagInput, setNyttBolagInput] = useState('')
  const [nyMaskinInput, setNyMaskinInput] = useState('')
  const [nyAtgardInput, setNyAtgardInput] = useState('')
  const [visaNyttBolag, setVisaNyttBolag] = useState(false)
  const [visaNyMaskin, setVisaNyMaskin] = useState(false)
  const [visaNyAtgard, setVisaNyAtgard] = useState(false)
  
  // Hantera bolag/maskiner (visa ta bort)
  const [hanteraBolag, setHanteraBolag] = useState(false)
  const [hanteraMaskiner, setHanteraMaskiner] = useState(false)
  const [hanteraAtgarder, setHanteraAtgarder] = useState(false)

  // Filtrera
  const aktuellaBest = bestallningar.filter(b => b.year === year && b.month === month)
  const aktuellaObj = objekt.filter(o => o.year === year && o.month === month)
  const slutObj = aktuellaObj.filter(o => o.typ === 'slut').sort((a, b) => a.ordning - b.ordning)
  const gallObj = aktuellaObj.filter(o => o.typ === 'gallring').sort((a, b) => a.ordning - b.ordning)

  // Beräkna inplanerat per bolag
  const beraknaInplanerat = (bolag, typ) => {
    return aktuellaObj
      .filter(o => o.bolag === bolag && o.typ === typ)
      .reduce((sum, o) => sum + o.volymPlanerad, 0)
  }

  // Byt månad
  const bytManad = (dir) => {
    let m = month + dir
    let y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMonth(m)
    setYear(y)
  }

  // Ny objekt
  const nyttObjekt = () => {
    setVisa(null)
    setRedigerar(null)
    setVisaNyttBolag(false)
    setVisaNyMaskin(false)
    setVisaNyAtgard(false)
    setHanteraBolag(false)
    setHanteraMaskiner(false)
    setHanteraAtgarder(false)
    setNyttBolagInput('')
    setNyMaskinInput('')
    setNyAtgardInput('')
    setForm({ 
      voNummer: '', 
      namn: '', 
      bolag: '', 
      typ: 'slut', 
      atgard: '', 
      volymPlanerad: '', 
      maskiner: [],
      koordinatTyp: 'sweref99',
      koordinatX: '',
      koordinatY: ''
    })
    setTimeout(() => {
      setFormKey(prev => prev + 1)
      setVisa('form')
    }, 10)
  }

  // Redigera
  const redigeraObjekt = (obj: Objekt) => {
    setRedigerar(obj)
    setForm({
      voNummer: obj.voNummer,
      namn: obj.namn,
      bolag: obj.bolag,
      typ: obj.typ,
      atgard: obj.atgard || '',
      volymPlanerad: obj.volymPlanerad.toString(),
      maskiner: obj.maskiner || [],
      koordinatTyp: obj.koordinater?.typ || 'sweref99',
      koordinatX: obj.koordinater?.x?.toString() || '',
      koordinatY: obj.koordinater?.y?.toString() || ''
    })
    setVisaNyttBolag(false)
    setVisaNyMaskin(false)
    setVisaNyAtgard(false)
    setHanteraBolag(false)
    setHanteraMaskiner(false)
    setHanteraAtgarder(false)
    setNyttBolagInput('')
    setNyMaskinInput('')
    setNyAtgardInput('')
    setVisa('form')
  }

  // Lägg till nytt bolag
  const laggTillBolag = () => {
    if (nyttBolagInput.trim() && !sparadeBolag.includes(nyttBolagInput.trim())) {
      setSparadeBolag([...sparadeBolag, nyttBolagInput.trim()])
      setForm({ ...form, bolag: nyttBolagInput.trim() })
    }
    setNyttBolagInput('')
    setVisaNyttBolag(false)
  }

  // Ta bort bolag
  const taBortBolag = (bolag) => {
    setSparadeBolag(sparadeBolag.filter(b => b !== bolag))
    if (form.bolag === bolag) setForm({ ...form, bolag: '' })
  }

  // Lägg till ny maskin
  const laggTillMaskin = () => {
    if (nyMaskinInput.trim() && !sparadeMaskiner.includes(nyMaskinInput.trim())) {
      setSparadeMaskiner([...sparadeMaskiner, nyMaskinInput.trim()])
      setForm({ ...form, maskiner: [...form.maskiner, nyMaskinInput.trim()] })
    }
    setNyMaskinInput('')
    setVisaNyMaskin(false)
  }

  // Ta bort maskin från sparade
  const taBortMaskin = (maskin) => {
    setSparadeMaskiner(sparadeMaskiner.filter(m => m !== maskin))
    setForm({ ...form, maskiner: form.maskiner.filter(m => m !== maskin) })
  }

  // Toggle maskin i form
  const toggleMaskin = (maskin) => {
    if (hanteraMaskiner) return
    if (form.maskiner.includes(maskin)) {
      setForm({ ...form, maskiner: form.maskiner.filter(m => m !== maskin) })
    } else {
      setForm({ ...form, maskiner: [...form.maskiner, maskin] })
    }
  }

  // Lägg till ny åtgärd
  const laggTillAtgard = () => {
    if (nyAtgardInput.trim() && !sparadeAtgarder[form.typ].includes(nyAtgardInput.trim())) {
      setSparadeAtgarder({
        ...sparadeAtgarder,
        [form.typ]: [...sparadeAtgarder[form.typ], nyAtgardInput.trim()]
      })
      setForm({ ...form, atgard: nyAtgardInput.trim() })
    }
    setNyAtgardInput('')
    setVisaNyAtgard(false)
  }

  // Ta bort åtgärd
  const taBortAtgard = (atgard) => {
    setSparadeAtgarder({
      ...sparadeAtgarder,
      [form.typ]: sparadeAtgarder[form.typ].filter(a => a !== atgard)
    })
    if (form.atgard === atgard) setForm({ ...form, atgard: '' })
  }

  // Spara
  const spara = () => {
    if (!form.voNummer || !form.namn || !form.bolag || !form.volymPlanerad) return
    
    const koordinater = {
      typ: form.koordinatTyp,
      x: form.koordinatX ? parseFloat(form.koordinatX) : null,
      y: form.koordinatY ? parseFloat(form.koordinatY) : null
    }
    
    if (redigerar) {
      setObjekt(objekt.map(o => 
        o.id === redigerar.id 
          ? { 
              ...o, 
              voNummer: form.voNummer,
              namn: form.namn,
              bolag: form.bolag,
              typ: form.typ,
              atgard: form.atgard,
              volymPlanerad: parseInt(form.volymPlanerad),
              maskiner: form.maskiner,
              koordinater
            }
          : o
      ))
    } else {
      const nyOrdning = aktuellaObj.filter(o => o.typ === form.typ).length + 1
      setObjekt([...objekt, {
        id: Date.now(),
        year, month,
        voNummer: form.voNummer,
        namn: form.namn,
        bolag: form.bolag,
        typ: form.typ,
        atgard: form.atgard,
        volymPlanerad: parseInt(form.volymPlanerad),
        volymFaktisk: null,
        status: 'planerad',
        maskiner: form.maskiner,
        ordning: nyOrdning,
        koordinater
      }])
    }
    setVisa(null)
  }

  // Ändra status
  const andraStatus = (obj) => {
    const statusOrdning = ['planerad', 'skordning', 'skotning', 'klar']
    const nuvarande = statusOrdning.indexOf(obj.status)
    const nasta = statusOrdning[(nuvarande + 1) % statusOrdning.length]
    setObjekt(objekt.map(o => o.id === obj.id ? { ...o, status: nasta } : o))
  }

  // Ta bort
  const taBort = (id) => {
    setObjekt(objekt.filter(o => o.id !== id))
  }

  // Flytta ordning
  const flytta = (obj, dir) => {
    const samma = aktuellaObj.filter(o => o.typ === obj.typ).sort((a, b) => a.ordning - b.ordning)
    const index = samma.findIndex(o => o.id === obj.id)
    if (dir === -1 && index === 0) return
    if (dir === 1 && index === samma.length - 1) return
    
    const annan = samma[index + dir]
    setObjekt(objekt.map(o => {
      if (o.id === obj.id) return { ...o, ordning: annan.ordning }
      if (o.id === annan.id) return { ...o, ordning: obj.ordning }
      return o
    }))
  }

  // Render beställning med matchning
  const renderBestallning = (best) => {
    const inplanerat = beraknaInplanerat(best.bolag, best.typ)
    const procent = Math.min(100, Math.round((inplanerat / best.volym) * 100))
    const fylld = inplanerat >= best.volym
    
    return (
      <div key={best.id} style={{
        background: 'white',
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <span style={{ fontSize: '24px' }}>{best.typ === 'slut' ? '🪵' : '🌲'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '700', fontSize: '16px', color: '#1a1a1a' }}>{best.bolag}</div>
            <div style={{ fontSize: '13px', color: '#666' }}>
              {best.typ === 'slut' ? 'Slutavverkning' : 'Gallring'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: '700', fontSize: '18px', color: '#1a1a1a' }}>{inplanerat} / {best.volym}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>m³ inplanerat</div>
          </div>
        </div>
        
        {/* Progress bar */}
        <div style={{ 
          height: '8px', 
          background: '#e2e8f0', 
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <div style={{ 
            height: '100%', 
            width: `${procent}%`,
            background: fylld ? '#22c55e' : '#f59e0b',
            borderRadius: '4px',
            transition: 'width 0.3s'
          }} />
        </div>
        <div style={{ 
          fontSize: '12px', 
          marginTop: '6px',
          color: fylld ? '#22c55e' : '#f59e0b',
          fontWeight: '600'
        }}>
          {fylld ? '✓ Fylld' : `${procent}% - Kvar: ${best.volym - inplanerat} m³`}
        </div>
      </div>
    )
  }

  // Render objekt-kort
  const renderObjekt = (obj, index) => {
    const status = STATUS[obj.status]
    return (
      <div key={obj.id} style={{
        background: 'white',
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        borderLeft: `4px solid ${status.färg}`
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          {/* Ordning */}
          <div style={{
            width: '28px', height: '28px',
            background: '#f1f5f9',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', fontWeight: '700', color: '#64748b'
          }}>{index + 1}</div>
          
          {/* Info */}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '700', fontSize: '16px', color: '#1a1a1a' }}>{obj.namn}</div>
            <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>
              {obj.bolag} • VO: {obj.voNummer}
            </div>
            
            {/* Åtgärd */}
            {obj.atgard && (
              <div style={{ 
                display: 'inline-block',
                padding: '4px 10px',
                background: obj.typ === 'slut' ? '#fef3c7' : '#d1fae5',
                color: obj.typ === 'slut' ? '#92400e' : '#065f46',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                marginTop: '6px'
              }}>
                {obj.atgard}
              </div>
            )}
            
            {/* Status */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => andraStatus(obj)}
                style={{
                  padding: '6px 12px',
                  background: status.bg,
                  color: status.färg,
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                {status.ikon} {status.label}
              </button>
            </div>

            {/* Maskiner */}
            {obj.maskiner && obj.maskiner.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                {obj.maskiner.map((m, i) => (
                  <span key={i} style={{
                    padding: '5px 10px',
                    background: '#e0e7ff',
                    color: '#4f46e5',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    🚜 {m}
                  </span>
                ))}
              </div>
            )}
          </div>
          
          {/* Volym */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a1a' }}>
              {obj.volymFaktisk ?? obj.volymPlanerad}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>m³</div>
            {obj.volymFaktisk && obj.volymFaktisk !== obj.volymPlanerad && (
              <div style={{ fontSize: '11px', color: '#94a3b8', textDecoration: 'line-through' }}>
                ({obj.volymPlanerad})
              </div>
            )}
          </div>
        </div>
        
        {/* Knappar */}
        <div style={{ 
          display: 'flex', 
          gap: '6px', 
          marginTop: '12px', 
          paddingTop: '12px', 
          borderTop: '1px solid #f1f5f9'
        }}>
          <button onClick={() => flytta(obj, -1)} style={{ 
            padding: '8px 12px', background: '#f1f5f9', border: 'none', 
            borderRadius: '8px', fontSize: '14px', cursor: 'pointer'
          }}>↑</button>
          <button onClick={() => flytta(obj, 1)} style={{ 
            padding: '8px 12px', background: '#f1f5f9', border: 'none', 
            borderRadius: '8px', fontSize: '14px', cursor: 'pointer'
          }}>↓</button>
          <div style={{ flex: 1 }} />
          <button onClick={() => redigeraObjekt(obj)} style={{ 
            padding: '8px 14px', background: '#f1f5f9', border: 'none', 
            borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
          }}>✏️ Ändra</button>
          <button onClick={() => taBort(obj.id)} style={{ 
            padding: '8px 14px', background: '#fee2e2', border: 'none', 
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer'
          }}>🗑️</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      
      {/* HEADER */}
      <div style={{ 
        background: 'white', 
        padding: '20px', 
        borderRadius: '0 0 30px 30px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <Link href="/" style={{ 
            width: '50px', height: '50px', 
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            borderRadius: '15px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px'
          }}>🌲</Link>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '700', fontSize: '20px', color: '#1a1a1a' }}>Kompersmåla Skog</div>
            <div style={{ color: '#22c55e', fontWeight: '600' }}>Objekt</div>
          </div>
          <div style={{
            padding: '10px 16px',
            background: '#f1f5f9',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#1a1a1a'
          }}>
            👤 {inloggadAnvandare}
          </div>
        </div>

        {/* MÅNADSVÄLJARE */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: '#f8fafc',
          borderRadius: '20px',
          padding: '8px'
        }}>
          <button 
            onClick={() => bytManad(-1)}
            style={{ 
              width: '50px', height: '50px', 
              background: 'white',
              border: 'none',
              borderRadius: '15px',
              fontSize: '24px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}
          >◀</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a' }}>
              {MANADER[month]} {year}
            </div>
          </div>
          <button 
            onClick={() => bytManad(1)}
            style={{ 
              width: '50px', height: '50px', 
              background: 'white',
              border: 'none',
              borderRadius: '15px',
              fontSize: '24px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}
          >▶</button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>

        {/* BESTÄLLNINGAR ÖVERSIKT */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ 
            fontSize: '14px', 
            color: '#64748b', 
            marginBottom: '12px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>📦 Beställningar vs Inplanerat</h3>
          {aktuellaBest.map(renderBestallning)}
        </div>

        {/* NY OBJEKT KNAPP */}
        <button 
          onClick={nyttObjekt}
          style={{ 
            width: '100%',
            padding: '18px',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            border: 'none',
            borderRadius: '16px',
            fontSize: '18px',
            fontWeight: '700',
            color: 'white',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}
        >
          ➕ Lägg till objekt
        </button>

        {/* SLUTAVVERKNING */}
        {(slutObj.length > 0 || aktuellaBest.some(b => b.typ === 'slut')) && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              marginBottom: '12px'
            }}>
              <span style={{ fontSize: '24px' }}>🪵</span>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>
                Slutavverkning
              </h2>
              <span style={{ 
                marginLeft: 'auto', 
                fontSize: '16px', 
                fontWeight: '600', 
                color: '#64748b' 
              }}>
                {slutObj.reduce((s, o) => s + o.volymPlanerad, 0)} m³
              </span>
            </div>
            {slutObj.length === 0 ? (
              <div style={{ 
                background: 'white', 
                borderRadius: '16px', 
                padding: '32px', 
                textAlign: 'center',
                color: '#94a3b8'
              }}>
                Inga objekt inlagda
              </div>
            ) : (
              slutObj.map((obj, i) => renderObjekt(obj, i))
            )}
          </div>
        )}

        {/* GALLRING */}
        {(gallObj.length > 0 || aktuellaBest.some(b => b.typ === 'gallring')) && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              marginBottom: '12px'
            }}>
              <span style={{ fontSize: '24px' }}>🌲</span>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>
                Gallring
              </h2>
              <span style={{ 
                marginLeft: 'auto', 
                fontSize: '16px', 
                fontWeight: '600', 
                color: '#64748b' 
              }}>
                {gallObj.reduce((s, o) => s + o.volymPlanerad, 0)} m³
              </span>
            </div>
            {gallObj.length === 0 ? (
              <div style={{ 
                background: 'white', 
                borderRadius: '16px', 
                padding: '32px', 
                textAlign: 'center',
                color: '#94a3b8'
              }}>
                Inga objekt inlagda
              </div>
            ) : (
              gallObj.map((obj, i) => renderObjekt(obj, i))
            )}
          </div>
        )}
      </div>

      {/* MODAL - Lägg till / Redigera */}
      {visa === 'form' && (
        <div 
          key={redigerar ? `edit-${redigerar.id}` : `new-${formKey}`}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
            zIndex: 100
          }}>
          <div style={{
            background: 'white',
            borderRadius: '24px',
            padding: '28px',
            width: '100%',
            maxWidth: '400px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: '700', 
              color: '#1a1a1a', 
              marginBottom: '24px',
              textAlign: 'center'
            }}>
              {redigerar ? '✏️ Ändra objekt' : '➕ Nytt objekt'}
            </h2>

            {/* Typ */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '14px', color: '#64748b', fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                Huvudtyp
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setForm({ ...form, typ: 'slut', atgard: '' })}
                  style={{
                    flex: 1,
                    padding: '16px',
                    background: form.typ === 'slut' ? '#fef3c7' : '#f8fafc',
                    border: form.typ === 'slut' ? '2px solid #f59e0b' : '2px solid transparent',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    fontSize: '16px', fontWeight: '600'
                  }}
                >
                  🪵 Slutavverkning
                </button>
                <button
                  onClick={() => setForm({ ...form, typ: 'gallring', atgard: '' })}
                  style={{
                    flex: 1,
                    padding: '16px',
                    background: form.typ === 'gallring' ? '#d1fae5' : '#f8fafc',
                    border: form.typ === 'gallring' ? '2px solid #22c55e' : '2px solid transparent',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    fontSize: '16px', fontWeight: '600'
                  }}
                >
                  🌲 Gallring
                </button>
              </div>
            </div>

            {/* Åtgärd */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>
                  Åtgärd
                </label>
                <button
                  onClick={() => setHanteraAtgarder(!hanteraAtgarder)}
                  style={{
                    padding: '4px 8px',
                    background: hanteraAtgarder ? '#fee2e2' : 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  {hanteraAtgarder ? '✓ Klar' : '⚙️ Hantera'}
                </button>
              </div>
              {!visaNyAtgard ? (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    {sparadeAtgarder[form.typ].map(a => (
                      <div key={a} style={{ position: 'relative' }}>
                        <button
                          onClick={() => !hanteraAtgarder && setForm({ ...form, atgard: a })}
                          style={{
                            padding: '10px 16px',
                            paddingRight: hanteraAtgarder ? '32px' : '16px',
                            background: form.atgard === a ? (form.typ === 'slut' ? '#f59e0b' : '#22c55e') : '#f1f5f9',
                            color: form.atgard === a ? 'white' : '#1a1a1a',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '15px',
                            fontWeight: '600',
                            cursor: hanteraAtgarder ? 'default' : 'pointer'
                          }}
                        >
                          {a}
                        </button>
                        {hanteraAtgarder && (
                          <button
                            onClick={() => taBortAtgard(a)}
                            style={{
                              position: 'absolute',
                              right: '4px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '22px',
                              height: '22px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '50%',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setVisaNyAtgard(true)}
                    style={{
                      padding: '8px 14px',
                      background: 'transparent',
                      border: '2px dashed #d1d5db',
                      borderRadius: '10px',
                      fontSize: '14px',
                      color: '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    + Lägg till åtgärd
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={nyAtgardInput}
                    onChange={(e) => setNyAtgardInput(e.target.value)}
                    placeholder="Åtgärdsnamn..."
                    autoFocus
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: '#f8fafc',
                      border: '2px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '15px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    onClick={laggTillAtgard}
                    style={{
                      padding: '12px 16px',
                      background: form.typ === 'slut' ? '#f59e0b' : '#22c55e',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => { setVisaNyAtgard(false); setNyAtgardInput('') }}
                    style={{
                      padding: '12px 16px',
                      background: '#f1f5f9',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* VO-nummer */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '14px', color: '#64748b', fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                VO-nummer
              </label>
              <input
                key={redigerar ? `vo-${redigerar.id}` : `vo-new-${formKey}`}
                type="text"
                value={form.voNummer}
                onChange={(e) => setForm({ ...form, voNummer: e.target.value })}
                placeholder="Ange VO-nummer..."
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '14px',
                  background: form.voNummer ? 'white' : '#f8fafc',
                  border: '2px solid #e2e8f0',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: '600',
                  boxSizing: 'border-box',
                  color: '#1a1a1a'
                }}
              />
            </div>

            {/* Traktnamn */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '14px', color: '#64748b', fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                Traktnamn
              </label>
              <input
                key={redigerar ? `namn-${redigerar.id}` : `namn-new-${formKey}`}
                type="text"
                value={form.namn}
                onChange={(e) => setForm({ ...form, namn: e.target.value })}
                placeholder="Ange traktnamn..."
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '14px',
                  background: form.namn ? 'white' : '#f8fafc',
                  border: '2px solid #e2e8f0',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: '600',
                  boxSizing: 'border-box',
                  color: '#1a1a1a'
                }}
              />
            </div>

            {/* Bolag */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>
                  Bolag
                </label>
                <button
                  onClick={() => setHanteraBolag(!hanteraBolag)}
                  style={{
                    padding: '4px 8px',
                    background: hanteraBolag ? '#fee2e2' : 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  {hanteraBolag ? '✓ Klar' : '⚙️ Hantera'}
                </button>
              </div>
              {!visaNyttBolag ? (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    {sparadeBolag.map(b => (
                      <div key={b} style={{ position: 'relative' }}>
                        <button
                          onClick={() => !hanteraBolag && setForm({ ...form, bolag: b })}
                          style={{
                            padding: '10px 16px',
                            paddingRight: hanteraBolag ? '32px' : '16px',
                            background: form.bolag === b ? '#22c55e' : '#f1f5f9',
                            color: form.bolag === b ? 'white' : '#1a1a1a',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '15px',
                            fontWeight: '600',
                            cursor: hanteraBolag ? 'default' : 'pointer'
                          }}
                        >
                          {b}
                        </button>
                        {hanteraBolag && (
                          <button
                            onClick={() => taBortBolag(b)}
                            style={{
                              position: 'absolute',
                              right: '4px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '22px',
                              height: '22px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '50%',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setVisaNyttBolag(true)}
                    style={{
                      padding: '8px 14px',
                      background: 'transparent',
                      border: '2px dashed #d1d5db',
                      borderRadius: '10px',
                      fontSize: '14px',
                      color: '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    + Lägg till bolag
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={nyttBolagInput}
                    onChange={(e) => setNyttBolagInput(e.target.value)}
                    placeholder="Bolagsnamn..."
                    autoFocus
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: '#f8fafc',
                      border: '2px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '15px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    onClick={laggTillBolag}
                    style={{
                      padding: '12px 16px',
                      background: '#22c55e',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => { setVisaNyttBolag(false); setNyttBolagInput('') }}
                    style={{
                      padding: '12px 16px',
                      background: '#f1f5f9',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Volym */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '14px', color: '#64748b', fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                Volym (m³)
              </label>
              <input
                key={redigerar ? `volym-${redigerar.id}` : `volym-new-${formKey}`}
                type="number"
                value={form.volymPlanerad}
                onChange={(e) => setForm({ ...form, volymPlanerad: e.target.value })}
                placeholder="0"
                style={{
                  width: '100%',
                  padding: '14px',
                  background: '#f8fafc',
                  border: '2px solid #e2e8f0',
                  borderRadius: '12px',
                  fontSize: '24px',
                  fontWeight: '700',
                  textAlign: 'center',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Koordinater */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '14px', color: '#64748b', fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                📍 Koordinater (valfritt)
              </label>
              
              {/* Koordinat-typ */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, koordinatTyp: 'sweref99' })}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: form.koordinatTyp === 'sweref99' ? '#3b82f6' : '#f1f5f9',
                    color: form.koordinatTyp === 'sweref99' ? 'white' : '#1a1a1a',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  SWEREF99
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, koordinatTyp: 'wgs84' })}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: form.koordinatTyp === 'wgs84' ? '#3b82f6' : '#f1f5f9',
                    color: form.koordinatTyp === 'wgs84' ? 'white' : '#1a1a1a',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Lat/Long
                </button>
              </div>
              
              {/* Koordinat-fält */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    {form.koordinatTyp === 'sweref99' ? 'X (Norr)' : 'Latitude'}
                  </label>
                  <input
                    type="text"
                    value={form.koordinatX}
                    onChange={(e) => setForm({ ...form, koordinatX: e.target.value })}
                    placeholder={form.koordinatTyp === 'sweref99' ? '6254917' : '56.1234'}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: '#f8fafc',
                      border: '2px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: '600',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    {form.koordinatTyp === 'sweref99' ? 'Y (Öst)' : 'Longitude'}
                  </label>
                  <input
                    type="text"
                    value={form.koordinatY}
                    onChange={(e) => setForm({ ...form, koordinatY: e.target.value })}
                    placeholder={form.koordinatTyp === 'sweref99' ? '478380' : '14.5678'}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: '#f8fafc',
                      border: '2px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: '600',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Maskiner - FLERA VAL */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>
                  Maskiner (välj flera)
                </label>
                <button
                  onClick={() => setHanteraMaskiner(!hanteraMaskiner)}
                  style={{
                    padding: '4px 8px',
                    background: hanteraMaskiner ? '#fee2e2' : 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  {hanteraMaskiner ? '✓ Klar' : '⚙️ Hantera'}
                </button>
              </div>
              
              {/* Valda maskiner */}
              {form.maskiner.length > 0 && (
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '6px', 
                  marginBottom: '10px',
                  padding: '10px',
                  background: '#f0f9ff',
                  borderRadius: '10px'
                }}>
                  <span style={{ fontSize: '12px', color: '#64748b', width: '100%', marginBottom: '4px' }}>Valda:</span>
                  {form.maskiner.map((m, i) => (
                    <span key={i} style={{
                      padding: '6px 10px',
                      background: '#4f46e5',
                      color: 'white',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      🚜 {m}
                      <button
                        onClick={() => setForm({ ...form, maskiner: form.maskiner.filter(x => x !== m) })}
                        style={{
                          background: 'rgba(255,255,255,0.3)',
                          border: 'none',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >✕</button>
                    </span>
                  ))}
                </div>
              )}

              {!visaNyMaskin ? (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    {sparadeMaskiner.map(m => (
                      <div key={m} style={{ position: 'relative' }}>
                        <button
                          onClick={() => toggleMaskin(m)}
                          style={{
                            padding: '10px 16px',
                            paddingRight: hanteraMaskiner ? '32px' : '16px',
                            background: form.maskiner.includes(m) ? '#4f46e5' : '#f1f5f9',
                            color: form.maskiner.includes(m) ? 'white' : '#1a1a1a',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: hanteraMaskiner ? 'default' : 'pointer'
                          }}
                        >
                          🚜 {m}
                        </button>
                        {hanteraMaskiner && (
                          <button
                            onClick={() => taBortMaskin(m)}
                            style={{
                              position: 'absolute',
                              right: '4px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '22px',
                              height: '22px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '50%',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setVisaNyMaskin(true)}
                    style={{
                      padding: '8px 14px',
                      background: 'transparent',
                      border: '2px dashed #d1d5db',
                      borderRadius: '10px',
                      fontSize: '14px',
                      color: '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    + Lägg till maskin
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={nyMaskinInput}
                    onChange={(e) => setNyMaskinInput(e.target.value)}
                    placeholder="Maskinnamn..."
                    autoFocus
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: '#f8fafc',
                      border: '2px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '15px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    onClick={laggTillMaskin}
                    style={{
                      padding: '12px 16px',
                      background: '#4f46e5',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => { setVisaNyMaskin(false); setNyMaskinInput('') }}
                    style={{
                      padding: '12px 16px',
                      background: '#f1f5f9',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Saknade fält */}
            {(!form.voNummer || !form.namn || !form.bolag || !form.volymPlanerad) && (
              <div style={{
                padding: '12px',
                background: '#fef3c7',
                borderRadius: '10px',
                marginBottom: '12px',
                fontSize: '14px',
                color: '#92400e'
              }}>
                ⚠️ Fyll i: {[
                  !form.voNummer && 'VO-nummer',
                  !form.namn && 'Traktnamn',
                  !form.bolag && 'Bolag',
                  !form.volymPlanerad && 'Volym'
                ].filter(Boolean).join(', ')}
              </div>
            )}

            {/* Knappar */}
            <button
              onClick={spara}
              disabled={!form.voNummer || !form.namn || !form.bolag || !form.volymPlanerad}
              style={{
                width: '100%',
                padding: '16px',
                background: (form.voNummer && form.namn && form.bolag && form.volymPlanerad) 
                  ? 'linear-gradient(135deg, #22c55e, #16a34a)' 
                  : '#e2e8f0',
                border: 'none',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: '700',
                color: (form.voNummer && form.namn && form.bolag && form.volymPlanerad) ? 'white' : '#94a3b8',
                cursor: (form.voNummer && form.namn && form.bolag && form.volymPlanerad) ? 'pointer' : 'default',
                marginBottom: '12px'
              }}
            >
              {redigerar ? '✓ Spara ändringar' : '✓ Lägg till'}
            </button>
            
            <button
              onClick={() => setVisa(null)}
              style={{
                width: '100%',
                padding: '14px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                color: '#64748b',
                cursor: 'pointer'
              }}
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
