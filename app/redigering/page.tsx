"use client"

import { useState, useEffect } from 'react'

// Demo-data
const DEMO_OBJEKT = [
  { objekt_id: '1', object_name: 'Kompersmåla lövgallring 2025', vo_nummer: 'JD1270G-12345', huvudtyp: 'Gallring', bolag: 'Vida', skogsagare: 'Erik Lindqvist', atgard: 'Första gallring', inkopare: 'Johan Eriksson' },
  { objekt_id: '2', object_name: 'Björsamåla AU 2025', vo_nummer: 'KOM930-54321', huvudtyp: null, bolag: null, skogsagare: null, atgard: null },
  { objekt_id: '3', object_name: 'Midingstorpgallring 2025', vo_nummer: 'JD1170E-11111', huvudtyp: 'Gallring', bolag: 'Vida', skogsagare: null, atgard: null },
  { objekt_id: '4', object_name: 'Lars Norberg Dunshultt', vo_nummer: 'KOM855-22222', huvudtyp: null, bolag: 'Privat', skogsagare: 'Lars Norberg', atgard: null },
  { objekt_id: '5', object_name: 'Kompermåla Ga', vo_nummer: 'JD1070G-33333', huvudtyp: 'Gallring', bolag: 'Privat', skogsagare: 'Per Andersson', atgard: 'Andra gallring' },
  { objekt_id: '6', object_name: 'Flytt/Service', vo_nummer: 'JD1470G-44444', huvudtyp: 'Slutavverkning', bolag: 'Vida', skogsagare: 'Vida Skog AB', atgard: 'Special', exkludera: true },
  { objekt_id: '7', object_name: 'Karsemåla AU 2025', vo_nummer: 'KOM951-55555', huvudtyp: 'Slutavverkning', bolag: 'Södra', atgard: 'Au', egenskap: 'grot_anpassad', skogsagare: 'Sven Karlsson', inkopare: 'Maria Lindgren' },
  { objekt_id: '8', object_name: 'Hällevik 3:2', vo_nummer: 'JD1510G-66666', huvudtyp: 'Slutavverkning', bolag: 'Privat', skogsagare: 'Anna Svensson', atgard: null },
  { objekt_id: '9', object_name: 'Rockneby 1:4', vo_nummer: 'KOM865-77777', huvudtyp: 'Slutavverkning', bolag: 'ATA', atgard: 'Rp', skogsagare: 'Bengt Holm', inkopare: 'Johan Eriksson', egenskap: 'extra_vagn' },
  { objekt_id: '10', object_name: 'Gässemåla 3:2', vo_nummer: 'JD1070E-88888', huvudtyp: null, bolag: null, skogsagare: null, atgard: null },
]

const DEMO_BOLAG = ['Vida', 'ATA', 'Privat', 'JGA', 'Rönås', 'Södra']
const DEMO_INKOPARE = ['Johan Eriksson', 'Maria Lindgren']
const HUVUDTYPER = ['Slutavverkning', 'Gallring']

const EGENSKAPER = [
  { key: 'grot_anpassad', label: 'GROT-anpassad' },
  { key: 'egen_skotning', label: 'Egen skotning' },
  { key: 'klippning', label: 'Klippning' },
  { key: 'risskotning', label: 'Risskotning' },
  { key: 'stubbbehandling', label: 'Stubbbehandling' },
  { key: 'extra_vagn', label: 'Extra vagn' }
]

// === SUPABASE-KOPPLING ===
const SUPABASE_URL = 'https://mxydghzfacbenbgpodex.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWRnaHpmYWNiZW5iZ3BvZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY3NzU1MDIsImV4cCI6MjA1MjM1MTUwMn0.sHKDpJL0GT9TkS91DGstHN_EvMhMnO2XG13tVIFGvMw'

async function hamtaObjektFranSupabase() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dim_objekt?select=*&order=object_name.asc.nullsfirst`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  })
  if (!res.ok) throw new Error('Kunde inte hämta data')
  return res.json()
}

async function sparaObjektTillSupabase(obj) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dim_objekt?objekt_id=eq.${obj.objekt_id}`, {
    method: 'PATCH',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      object_name: obj.object_name, vo_nummer: obj.vo_nummer, skogsagare: obj.skogsagare,
      bolag: obj.bolag, huvudtyp: obj.huvudtyp, atgard: obj.atgard, inkopare: obj.inkopare,
      egenskap: obj.egenskap, exkludera: obj.exkludera
    })
  })
  return res.ok
}
// === SLUT SUPABASE ===

function getSaknas(obj) {
  if (obj.exkludera) return []
  const saknas = []
  if (!obj.huvudtyp) saknas.push('Huvudtyp')
  if (!obj.bolag) saknas.push('Bolag')
  if (!obj.skogsagare) saknas.push('Markägare')
  if (!obj.atgard) saknas.push('Åtgärd')
  return saknas
}

function isKomplett(obj) {
  return getSaknas(obj).length === 0
}

function getProgress(obj) {
  let filled = 0
  if (obj.huvudtyp) filled++
  if (obj.bolag) filled++
  if (obj.skogsagare) filled++
  if (obj.atgard) filled++
  return filled / 4
}

// Mini progress ring
function MiniRing({ progress, size = 32, stroke = 3 }) {
  const radius = (size - stroke) / 2
  const circ = radius * 2 * Math.PI
  const offset = circ - progress * circ
  const color = progress === 1 ? '#30D158' : '#FF9F0A'
  
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 8px ${color}50)` }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }} />
    </svg>
  )
}

// Main Ring
function Ring({ procent, size = 140, stroke = 10, color = '#FF9F0A', onClick, active }) {
  const [anim, setAnim] = useState(0)
  const radius = (size - stroke) / 2
  const circ = radius * 2 * Math.PI
  const offset = circ - (anim / 100) * circ

  useEffect(() => {
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / 1000, 1)
      setAnim(Math.round((1 - Math.pow(1 - progress, 3)) * Math.min(procent, 100)))
      if (progress < 1) requestAnimationFrame(tick)
    }
    tick()
  }, [procent])

  return (
    <div onClick={onClick} style={{ position: 'relative', width: size, height: size, cursor: 'pointer', transform: active ? 'scale(1.05)' : 'scale(1)', transition: 'transform 0.3s ease' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 ${active ? 20 : 12}px ${color}${active ? '90' : '50'})` }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.1s ease' }} />
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div style={{ fontSize: 36, fontWeight: 700 }}>{anim}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: -2 }}>%</div>
      </div>
    </div>
  )
}

function CountUp({ value }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / 800, 1)
      setCount(Math.round((1 - Math.pow(1 - progress, 3)) * value))
      if (progress < 1) requestAnimationFrame(tick)
    }
    tick()
  }, [value])
  return <>{count}</>
}

// Animated Card
function AnimatedCard({ children, delay, onClick }) {
  const [visible, setVisible] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [hover, setHover] = useState(false)
  
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  const handleClick = () => {
    setPressed(true)
    setTimeout(() => {
      setPressed(false)
      onClick()
    }, 150)
  }

  return (
    <div 
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styles.kort,
        opacity: visible ? 1 : 0,
        transform: visible ? (pressed ? 'scale(0.97)' : hover ? 'scale(1.01) translateY(-2px)' : 'translateY(0)') : 'translateY(20px)',
        boxShadow: hover ? '0 8px 30px rgba(0,0,0,0.3)' : 'none',
        borderColor: hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
        transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)'
      }}
    >
      {children}
    </div>
  )
}

// Chip with hover
function Chip({ label, selected, onClick, editMode, onDelete }) {
  const [hover, setHover] = useState(false)
  
  return (
    <div 
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styles.chip,
        background: selected ? 'rgba(48,209,88,0.2)' : hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
        borderColor: selected ? 'rgba(48,209,88,0.4)' : hover ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
        color: '#fff',
        transform: hover ? 'scale(1.03)' : 'scale(1)',
        boxShadow: hover && !selected ? '0 0 15px rgba(255,255,255,0.1)' : selected ? '0 0 15px rgba(48,209,88,0.3)' : 'none'
      }}
    >
      <span>{label}</span>
      {editMode && <button onClick={(e) => { e.stopPropagation(); onDelete() }} style={styles.chipDelete}>✕</button>}
    </div>
  )
}

// Filter Chip
function FilterChip({ label, active, onClick }) {
  const [hover, setHover] = useState(false)
  
  return (
    <div 
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '8px 14px',
        borderRadius: 10,
        border: '1px solid',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        background: active ? 'rgba(255,255,255,0.15)' : hover ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
        borderColor: active ? 'rgba(255,255,255,0.3)' : hover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
        color: active ? '#fff' : 'rgba(255,255,255,0.6)',
        transform: hover ? 'scale(1.03)' : 'scale(1)'
      }}
    >
      {label}
      {active && <span style={{ marginLeft: 6, opacity: 0.6 }}>✕</span>}
    </div>
  )
}

// Chip Input
function ChipInput({ label, value, options, setOptions, onChange }) {
  const [input, setInput] = useState('')
  const [editMode, setEditMode] = useState(false)
  const filtered = input.trim() ? options.filter(o => o.toLowerCase().includes(input.toLowerCase())) : options

  const handleSelect = (val) => { onChange(val); setInput('') }
  const handleCreate = () => {
    if (!input.trim()) return
    const newVal = input.trim()
    if (!options.includes(newVal)) setOptions([...options, newVal].sort())
    onChange(newVal)
    setInput('')
  }
  const handleDelete = (val) => {
    setOptions(options.filter(o => o !== val))
    if (value === val) onChange('')
  }

  return (
    <div style={styles.chipInputBox}>
      <div style={styles.chipInputHeader}>
        <span style={styles.chipInputLabel}>{label}</span>
        <button onClick={() => setEditMode(!editMode)} style={{...styles.chipEditBtn, color: editMode ? '#FF453A' : 'rgba(255,255,255,0.3)'}}>
          {editMode ? 'Klar' : 'Redigera'}
        </button>
      </div>
      {value && !editMode && (
        <div style={styles.chipSelected}>
          <span>{value}</span>
          <button onClick={() => onChange('')} style={styles.chipClear}>✕</button>
        </div>
      )}
      {(!value || editMode) && (
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (filtered.length === 1) handleSelect(filtered[0])
            else if (input.trim() && !options.includes(input.trim())) handleCreate()
            else if (filtered.length > 0) handleSelect(filtered[0])
          }
        }} placeholder="Sök eller skriv ny..." style={styles.chipInput} />
      )}
      <div style={styles.chipGrid}>
        {filtered.map(opt => (
          <Chip 
            key={opt} 
            label={opt} 
            selected={value === opt} 
            onClick={() => !editMode && handleSelect(opt)}
            editMode={editMode}
            onDelete={() => handleDelete(opt)}
          />
        ))}
        {input.trim() && !options.some(o => o.toLowerCase() === input.toLowerCase()) && (
          <div onClick={handleCreate} style={styles.chipNew}>+ {input}</div>
        )}
      </div>
    </div>
  )
}

// Simple Chip Select
function SimpleChipSelect({ label, value, options, onChange }) {
  return (
    <div style={styles.chipInputBox}>
      <div style={styles.chipInputLabel}>{label}</div>
      <div style={{...styles.chipGrid, marginTop: 10}}>
        {options.map(opt => (
          <Chip 
            key={opt} 
            label={opt} 
            selected={value === opt} 
            onClick={() => onChange(value === opt ? '' : opt)}
            editMode={false}
          />
        ))}
      </div>
    </div>
  )
}

// Egenskap Switch
function EgenskapSwitch({ label, active, onClick, orange }) {
  const [bounce, setBounce] = useState(false)
  const [hover, setHover] = useState(false)
  const activeColor = orange ? '#FF9F0A' : '#30D158'
  const activeBg = orange ? 'rgba(255,159,10,0.10)' : 'rgba(48,209,88,0.10)'
  const activeBorder = orange ? 'rgba(255,159,10,0.30)' : 'rgba(48,209,88,0.30)'
  
  const handleClick = () => {
    setBounce(true)
    setTimeout(() => setBounce(false), 300)
    onClick()
  }

  return (
    <div 
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styles.switchRow,
        background: active ? activeBg : hover ? 'rgba(255,255,255,0.03)' : 'transparent',
        borderColor: active ? activeBorder : hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
        transform: hover ? 'scale(1.01)' : 'scale(1)',
        boxShadow: active ? `0 0 20px ${activeColor}20` : 'none'
      }}
    >
      <div style={styles.switchLeft}>
        <span style={{ fontSize: 15, fontWeight: 500, color: active ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'color 0.2s ease' }}>{label}</span>
      </div>
      <div style={{
        ...styles.switch,
        background: active ? activeColor : 'rgba(255,255,255,0.15)',
        boxShadow: active ? `0 0 20px ${activeColor}90` : 'none',
        transform: bounce ? 'scale(1.1)' : 'scale(1)',
        transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}>
        <div style={{ ...styles.switchKnob, transform: active ? 'translateX(20px)' : 'translateX(0)' }} />
      </div>
    </div>
  )
}

// Locked Input (som VO-nummer men för vanliga fält)
function LockedInput({ label, value, onChange, placeholder }) {
  const [isEditing, setIsEditing] = useState(false)
  const [tempValue, setTempValue] = useState('')
  const [hover, setHover] = useState(false)

  const startEdit = () => { setTempValue(value || ''); setIsEditing(true) }
  const saveEdit = () => { onChange(tempValue); setIsEditing(false) }
  const cancelEdit = () => { setIsEditing(false) }

  if (isEditing) {
    return (
      <div style={styles.voEditBox}>
        <div style={styles.voEditHeader}>
          <span style={styles.voLabel}>{label}</span>
          <span style={styles.voEditingText}>Redigerar</span>
        </div>
        <input type="text" value={tempValue} onChange={(e) => setTempValue(e.target.value)} style={styles.voInput} autoFocus placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }} />
        <div style={styles.voBtns}>
          <button onClick={saveEdit} style={styles.voBtnSave}>Spara</button>
          <button onClick={cancelEdit} style={styles.voBtnCancel}>Avbryt</button>
        </div>
      </div>
    )
  }

  return (
    <div 
      style={{ ...styles.voBox, borderColor: hover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={styles.voLeft}>
        <span style={styles.voLabel}>{label}</span>
        <span style={styles.voValue}>{value || '—'}</span>
      </div>
      <button onClick={startEdit} style={{
        ...styles.voLockBtn,
        background: hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
        transform: hover ? 'scale(1.05)' : 'scale(1)'
      }}>
        <span style={styles.voLockText}>Ändra</span>
      </button>
    </div>
  )
}

// VO-nummer box
function VOBox({ value, onChange }) {
  const [isEditing, setIsEditing] = useState(false)
  const [tempValue, setTempValue] = useState('')
  const [hover, setHover] = useState(false)

  const startEdit = (e) => { e.preventDefault(); e.stopPropagation(); setTempValue(value || ''); setIsEditing(true) }
  const saveEdit = () => { onChange(tempValue); setIsEditing(false) }
  const cancelEdit = () => { setIsEditing(false) }

  if (isEditing) {
    return (
      <div style={styles.voEditBox}>
        <div style={styles.voEditHeader}>
          <span style={styles.voLabel}>VO-nummer</span>
          <span style={styles.voEditingText}>Redigerar</span>
        </div>
        <input type="text" value={tempValue} onChange={(e) => setTempValue(e.target.value)} style={styles.voInput} autoFocus placeholder="Ange VO-nummer..."
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }} />
        <div style={styles.voBtns}>
          <button onClick={saveEdit} style={styles.voBtnSave}>Spara</button>
          <button onClick={cancelEdit} style={styles.voBtnCancel}>Avbryt</button>
        </div>
      </div>
    )
  }

  return (
    <div 
      style={{ ...styles.voBox, borderColor: hover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={styles.voLeft}>
        <span style={styles.voLabel}>VO-nummer</span>
        <span style={styles.voValue}>{value || '—'}</span>
      </div>
      <button onClick={startEdit} style={{
        ...styles.voLockBtn,
        background: hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
        transform: hover ? 'scale(1.05)' : 'scale(1)'
      }}>
        <span style={styles.voLockText}>Ändra</span>
      </button>
    </div>
  )
}

// Save button
function SaveButton({ onClick, saving, saved }) {
  const [pulse, setPulse] = useState(false)
  
  const handleClick = () => {
    if (saving) return
    setPulse(true)
    onClick()
  }

  return (
    <button 
      onClick={handleClick} 
      disabled={saving}
      style={{
        ...styles.saveBtn,
        background: saved ? '#30D158' : saving ? 'rgba(48,209,88,0.5)' : '#30D158',
        boxShadow: pulse ? '0 0 30px rgba(48,209,88,0.8)' : '0 4px 20px rgba(48,209,88,0.3)',
        transform: pulse ? 'scale(0.98)' : 'scale(1)'
      }}
    >
      {saved ? 'Sparat!' : saving ? 'Sparar...' : 'Spara'}
    </button>
  )
}

// Redigerings-modal
function RedigeraObjektContent({ valtObjekt, setValtObjekt, bolag, setBolag, inkopare, setInkopare, atgarderSlut, setAtgarderSlut, atgarderGallring, setAtgarderGallring }) {
  const isGallring = valtObjekt.huvudtyp === 'Gallring'
  const atgarder = isGallring ? atgarderGallring : atgarderSlut
  const setAtgarder = isGallring ? setAtgarderGallring : setAtgarderSlut
  const progress = getProgress(valtObjekt)

  const handleEgenskap = (key) => {
    setValtObjekt({...valtObjekt, egenskap: valtObjekt.egenskap === key ? null : key})
  }

  return (
    <>
      <div style={styles.progressHeader}>
        <MiniRing progress={progress} />
        <span style={styles.progressText}>
          {progress === 1 ? 'Komplett' : `${Math.round(progress * 4)}/4 obligatoriska fält`}
        </span>
      </div>

      <VOBox value={valtObjekt.vo_nummer} onChange={(v) => setValtObjekt({...valtObjekt, vo_nummer: v})} />

      <LockedInput label="Markägare" value={valtObjekt.skogsagare || ''} onChange={(v) => setValtObjekt({...valtObjekt, skogsagare: v})} placeholder="Skriv markägarens namn..." />
      <ChipInput label="Bolag" value={valtObjekt.bolag || ''} options={bolag} setOptions={setBolag} onChange={(v) => setValtObjekt({...valtObjekt, bolag: v})} />
      <ChipInput label="Inköpare" value={valtObjekt.inkopare || ''} options={inkopare} setOptions={setInkopare} onChange={(v) => setValtObjekt({...valtObjekt, inkopare: v})} />
      
      <SimpleChipSelect label="Huvudtyp" value={valtObjekt.huvudtyp || ''} options={HUVUDTYPER} onChange={(v) => setValtObjekt({...valtObjekt, huvudtyp: v, atgard: ''})} />

      {valtObjekt.huvudtyp && (
        <ChipInput label="Åtgärd" value={valtObjekt.atgard || ''} options={atgarder} setOptions={setAtgarder} onChange={(v) => setValtObjekt({...valtObjekt, atgard: v})} />
      )}

      <div style={styles.sectionLabel}>Egenskap</div>
      <div style={styles.switchList}>
        {EGENSKAPER.map(e => (
          <EgenskapSwitch key={e.key} label={e.label} active={valtObjekt.egenskap === e.key} onClick={() => handleEgenskap(e.key)} />
        ))}
      </div>

      <div style={styles.sectionLabel}>Statistik</div>
      <EgenskapSwitch 
        label={valtObjekt.exkludera ? 'Exkluderad från statistik' : 'Inkluderad i statistik'} 
        active={valtObjekt.exkludera} 
        onClick={() => setValtObjekt({...valtObjekt, exkludera: !valtObjekt.exkludera})}
        orange
      />
    </>
  )
}

export default function ObjektRedigering() {
  const [objekt, setObjekt] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bolag, setBolag] = useState(DEMO_BOLAG)
  const [inkopare, setInkopare] = useState(DEMO_INKOPARE)
  const [atgarderSlut, setAtgarderSlut] = useState(['LRK', 'Rp', 'Au', 'Special', 'VF/Bark'])
  const [atgarderGallring, setAtgarderGallring] = useState(['Första gallring', 'Andra gallring'])
  const [valtObjekt, setValtObjekt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [closing, setClosing] = useState(false)
  const [visaAllaObjekt, setVisaAllaObjekt] = useState(false)
  const [ringHover, setRingHover] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Hämta från Supabase vid start
  useEffect(() => {
    hamtaObjektFranSupabase()
      .then(data => {
        setObjekt(data)
        // Extrahera unika bolag från datan
        const unikaBolag = [...new Set(data.map(o => o.bolag).filter(Boolean))]
        setBolag([...new Set([...DEMO_BOLAG, ...unikaBolag])].sort())
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setError('Kunde inte ansluta till databasen')
        setLoading(false)
      })
  }, [])

  const kompletta = objekt.filter(isKomplett).length
  const totalt = objekt.length
  const procent = totalt > 0 ? Math.round((kompletta / totalt) * 100) : 0
  const ofullstandiga = objekt.filter(o => !isKomplett(o))
  const color = procent === 100 ? '#30D158' : '#FF9F0A'

  async function sparaObjekt() {
    if (!valtObjekt) return
    setSaving(true)
    const ok = await sparaObjektTillSupabase(valtObjekt)
    if (ok) {
      setObjekt(objekt.map(o => o.objekt_id === valtObjekt.objekt_id ? valtObjekt : o))
      setSaved(true)
      setTimeout(() => { closeModal(); setSaved(false) }, 600)
    }
    setSaving(false)
  }

  function closeModal() { 
    setClosing(true)
    setScrolled(false)
    setTimeout(() => { setValtObjekt(null); setClosing(false) }, 250) 
  }

  // Loading-vy
  if (loading) {
    return (
      <div style={{...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh'}}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 17 }}>Laddar objekt...</div>
        </div>
      </div>
    )
  }

  // Error-vy
  if (error) {
    return (
      <div style={{...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh'}}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>❌</div>
          <div style={{ color: '#FF453A', fontSize: 17, marginBottom: 16 }}>{error}</div>
          <button onClick={() => window.location.reload()} style={{ padding: '14px 28px', borderRadius: 14, border: 'none', background: '#30D158', color: '#000', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
            Försök igen
          </button>
        </div>
      </div>
    )
  }

  if (visaAllaObjekt) {
    return <AllaObjektVy objekt={objekt} setObjekt={setObjekt} bolag={bolag} setBolag={setBolag} inkopare={inkopare} setInkopare={setInkopare} atgarderSlut={atgarderSlut} setAtgarderSlut={setAtgarderSlut} atgarderGallring={atgarderGallring} setAtgarderGallring={setAtgarderGallring} onBack={() => setVisaAllaObjekt(false)} />
  }

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      <div style={styles.header}>
        <div style={styles.headerCenter}>
          <div style={styles.titel}>Objekt</div>
          <div style={styles.subtitel}>{ofullstandiga.length} behöver kompletteras</div>
        </div>
      </div>

      <div style={styles.ringWrapper} onMouseEnter={() => setRingHover(true)} onMouseLeave={() => setRingHover(false)}>
        <Ring procent={procent} color={color} onClick={() => setVisaAllaObjekt(true)} active={ringHover} />
        <div style={styles.ringStats}><CountUp value={kompletta} /> av {totalt}</div>
        <div style={{...styles.ringHint, opacity: ringHover ? 1 : 0.5, transform: ringHover ? 'translateY(-2px)' : 'translateY(0)'}}>Tryck för alla objekt</div>
      </div>

      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitel}>Att göra</span>
        <span style={styles.sectionCount}>{ofullstandiga.length}</span>
      </div>

      {ofullstandiga.length === 0 ? (
        <div style={styles.allaDone}><div style={styles.allaDoneCheck}>✓</div><div>Alla objekt kompletta</div></div>
      ) : (
        <div style={styles.lista}>
          {ofullstandiga.map((obj, i) => (
            <AnimatedCard key={obj.objekt_id} delay={i * 60} onClick={() => setValtObjekt({...obj})}>
              <div style={styles.kortInner}>
                <div style={styles.kortTop}>
                  <div style={{flex: 1}}>
                    <div style={styles.kortNamn}>{obj.object_name}</div>
                    <div style={styles.kortVo}>{obj.vo_nummer}</div>
                  </div>
                  <div style={styles.kortPil}>›</div>
                </div>
                <div style={styles.kortInfo}>
                  {getSaknas(obj).length} av 4 fält saknas
                </div>
              </div>
            </AnimatedCard>
          ))}
        </div>
      )}

      {valtObjekt && (
        <>
          <div style={{...styles.overlay, animation: closing ? 'fadeOut 0.25s ease forwards' : 'fadeIn 0.2s ease'}} onClick={closeModal} />
          <div style={{...styles.sheet, animation: closing ? 'slideDown 0.25s ease forwards' : 'slideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1)'}}>
            <div style={styles.sheetHandle} onClick={closeModal}><div style={styles.sheetBar} /></div>
            <div style={{...styles.sheetHeader, borderBottom: scrolled ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent'}}>
              <div style={styles.sheetTitel}>{valtObjekt.object_name}</div>
            </div>
            <div style={{...styles.scrollFade, opacity: scrolled ? 1 : 0}} />
            <div style={styles.sheetContent} onScroll={(e) => setScrolled(e.target.scrollTop > 10)}>
              <RedigeraObjektContent valtObjekt={valtObjekt} setValtObjekt={setValtObjekt} bolag={bolag} setBolag={setBolag} inkopare={inkopare} setInkopare={setInkopare} atgarderSlut={atgarderSlut} setAtgarderSlut={setAtgarderSlut} atgarderGallring={atgarderGallring} setAtgarderGallring={setAtgarderGallring} />
            </div>
            <div style={styles.sheetFooter}>
              <SaveButton onClick={sparaObjekt} saving={saving} saved={saved} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// VY 2 - ALLA OBJEKT
function AllaObjektVy({ objekt, setObjekt, bolag, setBolag, inkopare, setInkopare, atgarderSlut, setAtgarderSlut, atgarderGallring, setAtgarderGallring, onBack }) {
  const [search, setSearch] = useState('')
  const [filterBolag, setFilterBolag] = useState(null)
  const [filterHuvudtyp, setFilterHuvudtyp] = useState(null)
  const [filterInkopare, setFilterInkopare] = useState(null)
  const [showSearch, setShowSearch] = useState(false)
  const [valtObjekt, setValtObjekt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [closing, setClosing] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [backHover, setBackHover] = useState(false)
  const [titleHover, setTitleHover] = useState(false)

  const komplettaObjekt = objekt.filter(o => isKomplett(o))
  const unikaBolag = [...new Set(komplettaObjekt.map(o => o.bolag).filter(Boolean))].sort()
  const unikaInkopare = [...new Set(komplettaObjekt.map(o => o.inkopare).filter(Boolean))].sort()

  let filtered = komplettaObjekt

  if (search.trim()) {
    const s = search.toLowerCase()
    filtered = filtered.filter(o => 
      o.object_name?.toLowerCase().includes(s) || 
      o.vo_nummer?.toLowerCase().includes(s) || 
      o.skogsagare?.toLowerCase().includes(s) ||
      o.bolag?.toLowerCase().includes(s) ||
      o.inkopare?.toLowerCase().includes(s)
    )
  }

  if (filterBolag) filtered = filtered.filter(o => o.bolag === filterBolag)
  if (filterHuvudtyp) filtered = filtered.filter(o => o.huvudtyp === filterHuvudtyp)
  if (filterInkopare) filtered = filtered.filter(o => o.inkopare === filterInkopare)

  const hasActiveFilters = filterBolag || filterHuvudtyp || filterInkopare || search.trim()

  function clearFilters() {
    setFilterBolag(null)
    setFilterHuvudtyp(null)
    setFilterInkopare(null)
    setSearch('')
  }

  async function sparaObjekt() {
    if (!valtObjekt) return
    setSaving(true)
    const ok = await sparaObjektTillSupabase(valtObjekt)
    if (ok) {
      setObjekt(objekt.map(o => o.objekt_id === valtObjekt.objekt_id ? valtObjekt : o))
      setSaved(true)
      setTimeout(() => { closeModal(); setSaved(false) }, 600)
    }
    setSaving(false)
  }

  function closeModal() { 
    setClosing(true)
    setScrolled(false)
    setTimeout(() => { setValtObjekt(null); setClosing(false) }, 250) 
  }

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      <div style={styles.header}>
        <button 
          onClick={onBack} 
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
          style={{
            ...styles.backBtn,
            background: backHover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
            transform: backHover ? 'scale(1.05)' : 'scale(1)'
          }}
        >‹</button>
        <div 
          style={{...styles.headerCenter, cursor: 'pointer'}}
          onClick={() => setShowSearch(!showSearch)}
          onMouseEnter={() => setTitleHover(true)}
          onMouseLeave={() => setTitleHover(false)}
        >
          <div style={{...styles.titel, transform: titleHover ? 'scale(1.02)' : 'scale(1)', transition: 'transform 0.2s ease'}}>Alla objekt</div>
          <div style={styles.subtitel}>
            {filtered.length} objekt {hasActiveFilters && '(filtrerat)'} 
            <span style={{ marginLeft: 8, opacity: titleHover ? 1 : 0.5, transition: 'opacity 0.2s ease' }}>
              {showSearch ? '▲' : '▼'}
            </span>
          </div>
        </div>
        <div style={{ width: 48 }} />
      </div>

      {showSearch && (
        <div style={styles.searchFilterPanel}>
          <div style={styles.searchBox}>
            <input 
              type="text" 
              placeholder="Sök objekt, markägare, bolag..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              style={styles.searchInput} 
              autoFocus
            />
            {search && <button onClick={() => setSearch('')} style={styles.searchClear}>✕</button>}
          </div>

          <div style={styles.filterSection}>
            <div style={styles.filterLabel}>Huvudtyp</div>
            <div style={styles.filterChips}>
              <FilterChip label="Slutavverkning" active={filterHuvudtyp === 'Slutavverkning'} onClick={() => setFilterHuvudtyp(filterHuvudtyp === 'Slutavverkning' ? null : 'Slutavverkning')} />
              <FilterChip label="Gallring" active={filterHuvudtyp === 'Gallring'} onClick={() => setFilterHuvudtyp(filterHuvudtyp === 'Gallring' ? null : 'Gallring')} />
            </div>
          </div>

          <div style={styles.filterSection}>
            <div style={styles.filterLabel}>Bolag</div>
            <div style={styles.filterChips}>
              {unikaBolag.map(b => (
                <FilterChip key={b} label={b} active={filterBolag === b} onClick={() => setFilterBolag(filterBolag === b ? null : b)} />
              ))}
            </div>
          </div>

          {unikaInkopare.length > 0 && (
            <div style={styles.filterSection}>
              <div style={styles.filterLabel}>Inköpare</div>
              <div style={styles.filterChips}>
                {unikaInkopare.map(i => (
                  <FilterChip key={i} label={i} active={filterInkopare === i} onClick={() => setFilterInkopare(filterInkopare === i ? null : i)} />
                ))}
              </div>
            </div>
          )}

          {hasActiveFilters && (
            <button onClick={clearFilters} style={styles.clearFiltersBtn}>
              Rensa alla filter
            </button>
          )}
        </div>
      )}

      <div style={styles.lista}>
        {filtered.map((obj, i) => (
          <AnimatedCard key={obj.objekt_id} delay={i * 40} onClick={() => setValtObjekt({...obj})}>
            <div style={styles.kortInner}>
              <div style={styles.kortTop}>
                <div style={{flex: 1}}>
                  <div style={styles.kortNamn}>{obj.object_name}</div>
                  <div style={styles.kortVo}>{obj.vo_nummer}</div>
                </div>
                <div style={styles.kortPil}>›</div>
              </div>
              <div style={styles.kortInfo}>
                {obj.huvudtyp} · {obj.bolag} · {obj.atgard}
              </div>
              <div style={styles.kortMeta}>{obj.skogsagare}</div>
            </div>
          </AnimatedCard>
        ))}
        {filtered.length === 0 && (
          <div style={styles.emptyState}>Inga objekt matchar</div>
        )}
      </div>

      {valtObjekt && (
        <>
          <div style={{...styles.overlay, animation: closing ? 'fadeOut 0.25s ease forwards' : 'fadeIn 0.2s ease'}} onClick={closeModal} />
          <div style={{...styles.sheet, animation: closing ? 'slideDown 0.25s ease forwards' : 'slideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1)'}}>
            <div style={styles.sheetHandle} onClick={closeModal}><div style={styles.sheetBar} /></div>
            <div style={{...styles.sheetHeader, borderBottom: scrolled ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent'}}>
              <div style={styles.sheetTitel}>{valtObjekt.object_name}</div>
            </div>
            <div style={{...styles.scrollFade, opacity: scrolled ? 1 : 0}} />
            <div style={styles.sheetContent} onScroll={(e) => setScrolled(e.target.scrollTop > 10)}>
              <RedigeraObjektContent valtObjekt={valtObjekt} setValtObjekt={setValtObjekt} bolag={bolag} setBolag={setBolag} inkopare={inkopare} setInkopare={setInkopare} atgarderSlut={atgarderSlut} setAtgarderSlut={setAtgarderSlut} atgarderGallring={atgarderGallring} setAtgarderGallring={setAtgarderGallring} />
            </div>
            <div style={styles.sheetFooter}>
              <SaveButton onClick={sparaObjekt} saving={saving} saved={saved} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const styles = {
  container: { minHeight: '100vh', background: '#000', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif', color: '#fff', padding: '16px 20px 100px', WebkitFontSmoothing: 'antialiased' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerCenter: { textAlign: 'center', flex: 1 },
  backBtn: { width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 24, cursor: 'pointer', transition: 'all 0.2s ease' },
  titel: { fontSize: 32, fontWeight: 700 },
  subtitel: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  ringWrapper: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 48 },
  ringStats: { fontSize: 15, color: 'rgba(255,255,255,0.5)', marginTop: 16 },
  ringHint: { fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 8, transition: 'all 0.3s ease' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  sectionTitel: { fontSize: 18, fontWeight: 600, flex: 1 },
  sectionCount: { fontSize: 14, fontWeight: 600, color: '#FF9F0A', background: 'rgba(255,159,10,0.15)', padding: '4px 12px', borderRadius: 12 },
  sectionLabel: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 28, marginBottom: 12 },
  allaDone: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, color: '#30D158', fontSize: 17, fontWeight: 600 },
  allaDoneCheck: { fontSize: 48, marginBottom: 16, filter: 'drop-shadow(0 0 20px rgba(48,209,88,0.5))' },
  lista: { display: 'flex', flexDirection: 'column', gap: 12 },
  kort: { background: 'rgba(255,255,255,0.03)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' },
  kortInner: { padding: '18px 20px' },
  kortTop: { display: 'flex', alignItems: 'center' },
  kortNamn: { fontSize: 17, fontWeight: 600, marginBottom: 4 },
  kortVo: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  kortPil: { fontSize: 24, color: 'rgba(255,255,255,0.2)', marginLeft: 12 },
  kortInfo: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 12 },
  kortMeta: { fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 4 },

  searchFilterPanel: { background: 'rgba(255,255,255,0.03)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.06)', padding: '20px', marginBottom: 24, animation: 'fadeIn 0.3s ease' },
  searchBox: { display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', padding: '14px 18px', marginBottom: 20 },
  searchInput: { flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: 16, outline: 'none' },
  searchClear: { width: 24, height: 24, borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer' },
  filterSection: { marginBottom: 16 },
  filterLabel: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 },
  filterChips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  clearFiltersBtn: { width: '100%', padding: '12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginTop: 8 },
  emptyState: { textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)', fontSize: 15 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, backdropFilter: 'blur(10px)' },
  sheet: { position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1c1c1e', borderRadius: '24px 24px 0 0', zIndex: 101, maxHeight: '92vh', display: 'flex', flexDirection: 'column' },
  sheetHandle: { padding: '14px 0 10px', cursor: 'pointer', display: 'flex', justifyContent: 'center' },
  sheetBar: { width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' },
  sheetHeader: { padding: '4px 24px 20px', transition: 'border-color 0.2s ease' },
  sheetTitel: { fontSize: 22, fontWeight: 700 },
  scrollFade: { position: 'absolute', top: 80, left: 0, right: 0, height: 30, background: 'linear-gradient(to bottom, #1c1c1e, transparent)', zIndex: 1, pointerEvents: 'none', transition: 'opacity 0.2s ease' },
  sheetContent: { flex: 1, overflowY: 'auto', padding: '0 24px 24px' },
  sheetFooter: { padding: '16px 24px 40px' },
  saveBtn: { width: '100%', padding: '18px', borderRadius: 16, border: 'none', background: '#30D158', color: '#000', fontSize: 17, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease' },
  progressHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' },
  progressText: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  voBox: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderRadius: 14, marginBottom: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', transition: 'all 0.2s ease' },
  voLeft: { display: 'flex', flexDirection: 'column', gap: 6 },
  voLabel: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  voValue: { fontSize: 16, fontWeight: 500, color: '#fff' },
  voLockBtn: { display: 'flex', alignItems: 'center', padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'all 0.2s ease' },
  voLockText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  voEditBox: { padding: '16px', borderRadius: 14, marginBottom: 20, background: 'rgba(48,209,88,0.08)', border: '1px solid rgba(48,209,88,0.3)' },
  voEditHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  voEditingText: { fontSize: 12, color: '#30D158' },
  voInput: { width: '100%', padding: '14px', borderRadius: 12, border: '1px solid rgba(48,209,88,0.3)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box', marginBottom: 12 },
  voBtns: { display: 'flex', gap: 10 },
  voBtnSave: { flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: '#30D158', color: '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  voBtnCancel: { flex: 1, padding: '12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  chipInputBox: { marginBottom: 20 },
  chipInputHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  chipInputLabel: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  chipEditBtn: { background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', padding: '4px 8px', transition: 'color 0.2s ease' },
  chipSelected: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 14, background: 'rgba(48,209,88,0.15)', border: '1px solid rgba(48,209,88,0.3)', marginBottom: 10, fontSize: 16, fontWeight: 500, color: '#fff' },
  chipClear: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer', padding: 4 },
  chipInput: { width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 10, transition: 'border-color 0.2s ease' },
  chipGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, border: '1px solid', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s ease' },
  chipDelete: { background: 'rgba(255,69,58,0.2)', border: 'none', color: '#FF453A', fontSize: 11, width: 20, height: 20, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  chipNew: { padding: '10px 14px', borderRadius: 12, border: '1px dashed rgba(48,209,88,0.4)', background: 'rgba(48,209,88,0.08)', color: '#30D158', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s ease' },
  switchList: { display: 'flex', flexDirection: 'column', gap: 8 },
  switchRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 14, border: '1px solid', cursor: 'pointer', transition: 'all 0.2s ease' },
  switchLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  switch: { width: 50, height: 30, borderRadius: 15, padding: 3, transition: 'all 0.2s ease' },
  switchKnob: { width: 24, height: 24, borderRadius: 12, background: '#fff', transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }
}
