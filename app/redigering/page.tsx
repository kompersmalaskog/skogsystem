"use client"

import { useState, useEffect, useRef, Fragment, Children } from 'react'

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

const EGENSKAPER_SKOGSBRUK = [
  { key: 'grot_anpassad', label: 'GROT-anpassad' },
  { key: 'klippning', label: 'Klippning' },
  { key: 'risskotning', label: 'Risskotning' },
  { key: 'stubbbehandling', label: 'Stubbbehandling' }
]

const EGENSKAPER_LOGISTIK = [
  { key: 'egen_skotning', label: 'Egen skotning' },
  { key: 'extra_vagn', label: 'Extra vagn' }
]

// === SUPABASE-KOPPLING ===
const SUPABASE_URL = 'https://mxydghzfacbenbgpodex.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWRnaHpmYWNiZW5iZ3BvZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NzU2MjMsImV4cCI6MjA4NDQ1MTYyM30.NRBG5HcAtEXRTyf4YTp71A3iATk6U3DGhfdJ5EYlMyo'

async function hamtaObjektFranSupabase() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dim_objekt?select=*&order=object_name.asc.nullsfirst`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  })
  if (!res.ok) throw new Error('Kunde inte hämta data')
  return res.json()
}

async function hamtaMaskinerFranSupabase() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dim_maskin?select=maskin_id,modell,maskin_typ`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  })
  if (!res.ok) throw new Error('Kunde inte hämta maskiner')
  return res.json()
}

async function hamtaPrisscenarier() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/objekt_prisscenario?select=*&aktiv=eq.true&order=namn.asc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  })
  if (!res.ok) return []
  return res.json()
}

async function sparaObjektTillSupabase(obj) {
  // Build ovrigt_info JSON from extern skotning fields
  let ovrigtInfo = null;
  if (obj._extern_skotning) {
    ovrigtInfo = JSON.stringify({
      extern_skotning: true,
      extern_foretag: obj._extern_foretag || '',
      extern_pris_typ: obj._extern_pris_typ || 'm3',
      extern_pris: obj._extern_pris || 0,
      extern_antal: obj._extern_antal || 0,
    });
  } else if (obj.ovrigt_info) {
    // If extern was turned off but there was old ovrigt_info, clear extern fields
    try {
      const parsed = JSON.parse(obj.ovrigt_info);
      if (parsed.extern_skotning) {
        delete parsed.extern_skotning;
        delete parsed.extern_foretag;
        delete parsed.extern_pris_typ;
        delete parsed.extern_pris;
        delete parsed.extern_antal;
        ovrigtInfo = Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : null;
      } else {
        ovrigtInfo = obj.ovrigt_info;
      }
    } catch { ovrigtInfo = obj.ovrigt_info; }
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/dim_objekt?objekt_id=eq.${obj.objekt_id}`, {
    method: 'PATCH',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      object_name: obj.object_name, vo_nummer: obj.vo_nummer, skogsagare: obj.skogsagare,
      bolag: obj.bolag, huvudtyp: obj.huvudtyp, atgard: obj.atgard, inkopare: obj.inkopare,
      exkludera: obj.exkludera,
      grot_anpassad: obj.grot_anpassad || false,
      egen_skotning: obj.egen_skotning || false,
      klippning: obj.klippning || false,
      risskotning: obj.risskotning || false,
      stubbbehandling: obj.stubbbehandling || false,
      extra_vagn: obj.extra_vagn || false,
      timpeng: obj.timpeng || false,
      prisscenario_id: obj.prisscenario_id ?? null,
      skordning_avslutad: obj.skordning_avslutad || null,
      skotning_avslutad: obj.skotning_avslutad || null,
      ovrigt_info: ovrigtInfo,
    })
  })
  return res.ok
}
// === SLUT SUPABASE ===

function parseExternSkotning(obj) {
  const copy = { ...obj };
  try {
    if (obj.ovrigt_info) {
      const parsed = JSON.parse(obj.ovrigt_info);
      if (parsed.extern_skotning) {
        copy._extern_skotning = true;
        copy._extern_foretag = parsed.extern_foretag || '';
        copy._extern_pris_typ = parsed.extern_pris_typ || 'm3';
        copy._extern_pris = parsed.extern_pris || 0;
        copy._extern_antal = parsed.extern_antal || 0;
      }
    }
  } catch {}
  return copy;
}

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

// "Ser ut som autogenererat datum" — heltalssträng, t.ex. 20260408 eller 80426
function looksLikeAutoDate(name) {
  if (!name) return false
  return /^\d+$/.test(String(name).trim())
}

// Vilket avslutsfält som hör till maskintypen
function avslutadFieldFor(maskin_typ) {
  if (maskin_typ === 'Harvester') return { field: 'skordning_avslutad', label: 'skördning' }
  if (maskin_typ === 'Forwarder') return { field: 'skotning_avslutad', label: 'skotning' }
  return null
}

// Antal dagar sedan en ISO-tidsstämpel, eller null om ogiltig
function daysSinceISO(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

// Formatera ISO-tidsstämpel till YYYY-MM-DD (för date-input + display)
function formatYMD(iso) {
  if (!iso) return null
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// Användarvänlig tidsstämpel: "2026-04-27 17:12"
function formatEndDateDisplay(iso) {
  if (!iso) return null
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`
}

// Versaliserar första bokstaven
function capFirst(s) { return s ? s[0].toUpperCase() + s.slice(1) : s }

// Konkreta varningar för fält som behöver fixas (oftast import-fel)
function getWarnings(obj) {
  if (!obj || obj.exkludera) return []
  const w = []
  if (!obj.huvudtyp) w.push({ key: 'huvudtyp', text: 'Saknar huvudtyp', target: 'huvudtyp-section' })
  if (obj.huvudtyp && !obj.atgard) w.push({ key: 'atgard', text: 'Saknar åtgärd', target: 'atgard-section' })
  if (looksLikeAutoDate(obj.object_name)) w.push({ key: 'autoname', text: 'Autogenererat namn', target: 'object_name-section' })
  if (!obj.skogsagare) w.push({ key: 'skogsagare', text: 'Saknar markägare', target: 'skogsagare-section' })
  if (!obj.bolag) w.push({ key: 'bolag', text: 'Saknar bolag', target: 'bolag-section' })

  // Steg J: Maskinen har EndDate i fil men användaren har inte markerat avslutad
  const av = avslutadFieldFor(obj.maskin_typ)
  if (av && obj.end_date && !obj[av.field]) {
    w.push({
      key: 'reported_end',
      text: `Maskinen rapporterar ${av.label} avslutad — ej markerad`,
      target: 'avslut-section'
    })
  }

  // Steg K: 14-dagars-heuristik (plan B när maskinen INTE rapporterat EndDate)
  if (av && !obj.end_date && !obj[av.field]) {
    const days = daysSinceISO(obj.start_date)
    if (days !== null && days >= 14) {
      w.push({
        key: 'maybe_done',
        text: `${capFirst(av.label)} verkar klar (startade för ${days} dagar sedan)`,
        target: 'avslut-section'
      })
    }
  }

  return w
}

// Smooth scroll + flash highlight i 0.6s
function scrollAndFlash(targetId) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(targetId)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('flash-highlight')
  setTimeout(() => el.classList.remove('flash-highlight'), 700)
}

// Snabbfix för Object_name — slår mot meta_importerade_filer (FPR-filer
// för objektets maskin_id) och matchar mot dim_objekt.start_date.
// Samma logik som SQL-fixet:
//   date(fil_dag) = date(d.start_date)
//   AND extract(hour from filnamnets klockslag) = extract(hour from d.start_date)
async function hamtaNamnFranFilnamn(obj) {
  const maskinId = obj?.maskin_id
  const startDate = obj?.start_date
  if (!maskinId) {
    return { ok: false, message: 'Maskin_id saknas på objektet — fyll i manuellt' }
  }
  if (!startDate) {
    return { ok: false, message: 'Start_date saknas på objektet — fyll i manuellt' }
  }

  // Parsa "YYYY-MM-DDTHH:MM:SS" eller "YYYY-MM-DD HH:MM:SS[+00]" som naive timestamp.
  // start_date är timestamp without time zone — vi tar värdet som det är lagrat,
  // ingen tz-konvertering (motsvarar SQL date()/extract() på naive timestamp).
  const sd = String(startDate).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/)
  if (!sd) {
    return { ok: false, message: 'Kunde inte tolka start_date — fyll i manuellt' }
  }
  const [, yyyy, mm, dd, hh] = sd
  const startDDMMYY = `${dd}${mm}${yyyy.slice(2)}`
  const startHour = parseInt(hh, 10)

  let res
  try {
    res = await fetch(
      `${SUPABASE_URL}/rest/v1/meta_importerade_filer` +
      `?select=filnamn&maskin_id=eq.${encodeURIComponent(maskinId)}` +
      `&filtyp=eq.FPR&status=eq.OK`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    )
  } catch {
    return { ok: false, message: 'Kunde inte ansluta — försök igen' }
  }
  if (!res.ok) return { ok: false, message: `HTTP ${res.status}` }
  const rows = await res.json()

  // Filnamnsmönster: "Skogsnamn_Mark-DDMMYY-HHMMSS.fpr"
  const re = /^(.+)-(\d{6})-(\d{6})\.fpr$/i
  const matches = []
  for (const r of rows) {
    const m = (r.filnamn || '').match(re)
    if (!m) continue
    const ddmmyy = m[2]
    const hhmmss = m[3]
    const fileHour = parseInt(hhmmss.slice(0, 2), 10)
    if (ddmmyy === startDDMMYY && fileHour === startHour) {
      matches.push(m[1].replace(/_/g, ' ').trim())
    }
  }

  const unika = Array.from(new Set(matches)).filter(Boolean)
  if (unika.length === 0) return { ok: false, message: 'Ingen FPR-fil matchade datum + timme — fyll i manuellt' }
  if (unika.length > 1) return { ok: false, message: 'Flera olika namn matchade — fyll i manuellt' }
  return { ok: true, name: unika[0] }
}

// Mini progress ring
function MiniRing({ progress, size = 32, stroke = 3 }) {
  const radius = (size - stroke) / 2
  const circ = radius * 2 * Math.PI
  const offset = circ - progress * circ
  const color = progress === 1 ? '#adc6ff' : '#FF9F0A'
  
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
        background: selected ? 'rgba(173,198,255,0.2)' : hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
        borderColor: selected ? 'rgba(173,198,255,0.4)' : hover ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
        color: '#fff',
        transform: hover ? 'scale(1.03)' : 'scale(1)',
        boxShadow: hover && !selected ? '0 0 15px rgba(255,255,255,0.1)' : selected ? '0 0 15px rgba(173,198,255,0.3)' : 'none'
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
function ChipInput({ label, value, options, setOptions, onChange, embedded = false }) {
  const [input, setInput] = useState('')
  const filtered = input.trim() ? options.filter(o => o.toLowerCase().includes(input.toLowerCase())) : options

  const handleSelect = (val) => { onChange(val); setInput('') }
  const handleCreate = () => {
    if (!input.trim()) return
    const newVal = input.trim()
    if (!options.includes(newVal)) setOptions([...options, newVal].sort())
    onChange(newVal)
    setInput('')
  }

  return (
    <div style={embedded ? styles.chipInputBoxEmbedded : styles.chipInputBox}>
      <div style={styles.chipInputHeader}>
        <span style={styles.chipInputLabel}>{label}</span>
      </div>
      {value && (
        <div style={styles.chipSelected}>
          <span>{value}</span>
          <button onClick={() => onChange('')} style={styles.chipClear}>✕</button>
        </div>
      )}
      {!value && (
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (filtered.length === 1) handleSelect(filtered[0])
            else if (input.trim() && !options.includes(input.trim())) handleCreate()
            else if (filtered.length > 0) handleSelect(filtered[0])
          }
        }} placeholder="Sök eller skriv ny …" style={styles.chipInput} />
      )}
      <div style={styles.chipGrid}>
        {filtered.map(opt => (
          <Chip
            key={opt}
            label={opt}
            selected={value === opt}
            onClick={() => handleSelect(opt)}
            editMode={false}
            onDelete={() => {}}
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
function SimpleChipSelect({ label, value, options, onChange, embedded = false }) {
  return (
    <div style={embedded ? styles.chipInputBoxEmbedded : styles.chipInputBox}>
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
  const activeColor = orange ? '#FF9F0A' : '#adc6ff'
  const activeBg = orange ? 'rgba(255,159,10,0.10)' : 'rgba(173,198,255,0.10)'
  const activeBorder = orange ? 'rgba(255,159,10,0.30)' : 'rgba(173,198,255,0.30)'
  
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

// DateToggle (för avslut-datum)
function DateToggle({ label, date, onToggle, onDateChange }) {
  const [bounce, setBounce] = useState(false)
  const [hover, setHover] = useState(false)
  const [textInput, setTextInput] = useState('')
  const active = !!date
  const activeColor = '#adc6ff'
  const activeBg = 'rgba(173,198,255,0.10)'
  const activeBorder = 'rgba(173,198,255,0.30)'

  const handleTextSave = () => {
    if (!textInput.trim()) return
    const t = textInput.trim()
    let parsed = null
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) parsed = t
    else if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(t)) {
      const parts = t.split(/[\/\-]/)
      parsed = `${parts[2]}-${parts[1]}-${parts[0]}`
    } else if (/^\d{8}$/.test(t)) {
      parsed = `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}`
    }
    if (parsed && !isNaN(new Date(parsed).getTime())) {
      onDateChange(parsed)
      setTextInput('')
    }
  }

  const handleClick = () => {
    setBounce(true)
    setTimeout(() => setBounce(false), 300)
    if (active) {
      onToggle(null)
    } else {
      onToggle(new Date().toISOString().split('T')[0])
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
      {active && (
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: 8, 
          padding: '10px 16px', marginLeft: 8, marginRight: 8,
          borderRadius: 12, background: 'rgba(173,198,255,0.08)', 
          border: '1px solid rgba(173,198,255,0.2)',
          animation: 'fadeIn 0.2s ease'
        }}>
          <input 
            type="date" 
            value={date || ''} 
            onChange={(e) => onDateChange(e.target.value)}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8,
              border: '1px solid rgba(173,198,255,0.3)', background: 'rgba(0,0,0,0.3)',
              color: '#fff', fontSize: 14, outline: 'none',
              colorScheme: 'dark'
            }}
          />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>eller</span>
          <input 
            type="text" 
            value={textInput} 
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleTextSave() }}
            placeholder=""
            style={{
              width: 110, padding: '8px 10px', borderRadius: 8,
              border: '1px solid rgba(173,198,255,0.3)', background: 'rgba(0,0,0,0.3)',
              color: '#fff', fontSize: 14, outline: 'none'
            }}
          />
          {textInput.trim() && (
            <button onClick={handleTextSave}
              style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#adc6ff', color: '#000',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              OK
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Locked Input (som VO-nummer men för vanliga fält)
// Direkt-redigerbart fält i iOS Settings-stil: label vänster, input höger.
// onChange uppdaterar state vid varje keystroke; spara till Supabase sker
// vid stora gröna Spara-knappen i footern.
function LockedInput({ label, value, onChange, placeholder, embedded = false }) {
  const [focused, setFocused] = useState(false)
  const baseStyle = embedded ? styles.directRowEmbedded : styles.directRowStandalone
  return (
    <div
      style={embedded
        ? { ...baseStyle, background: focused ? 'rgba(173,198,255,0.06)' : 'transparent' }
        : { ...baseStyle, borderColor: focused ? 'rgba(173,198,255,0.35)' : 'rgba(255,255,255,0.08)' }
      }
    >
      <span style={styles.directRowLabel}>{label}</span>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={styles.directRowInput}
      />
    </div>
  )
}

// VO-nummer — samma direkt-redigerbara mönster
function VOBox({ value, onChange, embedded = false }) {
  const [focused, setFocused] = useState(false)
  const baseStyle = embedded ? styles.directRowEmbedded : styles.directRowStandalone
  return (
    <div
      style={embedded
        ? { ...baseStyle, background: focused ? 'rgba(173,198,255,0.06)' : 'transparent' }
        : { ...baseStyle, borderColor: focused ? 'rgba(173,198,255,0.35)' : 'rgba(255,255,255,0.08)' }
      }
    >
      <span style={styles.directRowLabel}>VO-nummer</span>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Ange VO-nummer …"
        style={styles.directRowInput}
      />
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
        background: saved ? '#adc6ff' : saving ? 'rgba(173,198,255,0.5)' : '#adc6ff',
        boxShadow: pulse ? '0 0 30px rgba(173,198,255,0.8)' : '0 4px 20px rgba(173,198,255,0.3)',
        transform: pulse ? 'scale(0.98)' : 'scale(1)'
      }}
    >
      {saved ? 'Sparat!' : saving ? 'Sparar...' : 'Spara'}
    </button>
  )
}

// Confirm-dialog — Apple-stil. 2 eller 3 knappar (om discardLabel + onDiscard
// är satta visas en mellan-knapp för "destructive non-cancel"-val, t.ex.
// "Stäng utan att spara"). 3-val renderas vertikalt.
function ConfirmDialog({
  open, title, message,
  confirmLabel = 'Fortsätt', cancelLabel = 'Avbryt',
  discardLabel, onDiscard,
  onConfirm, onCancel, destructive = false,
}) {
  if (!open) return null
  const showDiscard = !!(discardLabel && onDiscard)
  const btnBase = {
    minHeight: 56, padding: '0 14px', borderRadius: 12,
    fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  }
  const confirmBtn = (
    <button onClick={onConfirm} className="tap-press" style={{
      ...btnBase, flex: showDiscard ? undefined : 1, width: showDiscard ? '100%' : undefined,
      border: 'none', background: destructive ? '#FF453A' : '#adc6ff', color: '#000',
    }}>{confirmLabel}</button>
  )
  const discardBtn = showDiscard && (
    <button onClick={onDiscard} className="tap-press" style={{
      ...btnBase, width: '100%',
      border: '1px solid rgba(255,69,58,0.35)', background: 'rgba(255,69,58,0.08)',
      color: 'rgba(255,140,140,0.95)',
    }}>{discardLabel}</button>
  )
  const cancelBtn = (
    <button onClick={onCancel} className="tap-press" style={{
      ...btnBase, flex: showDiscard ? undefined : 1, width: showDiscard ? '100%' : undefined,
      border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
      color: 'rgba(255,255,255,0.75)',
    }}>{cancelLabel}</button>
  )

  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: '#1c1c1e', borderRadius: 18, padding: '22px 22px 18px',
        width: 'calc(100% - 40px)', maxWidth: 340, zIndex: 201,
        border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        fontFamily: "'Geist', system-ui, sans-serif", color: '#fff',
        animation: 'fadeIn 0.18s ease',
      }}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.45, marginBottom: 18 }}>{message}</div>
        {showDiscard ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {confirmBtn}
            {discardBtn}
            {cancelBtn}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            {cancelBtn}
            {confirmBtn}
          </div>
        )}
      </div>
    </>
  )
}

// Prisscenario — helper + sub-komponenter
function formatScenarioGiltighet(s) {
  if (!s) return null
  const fran = s.giltig_fran ? new Date(s.giltig_fran).toLocaleDateString('sv-SE') : null
  const till = s.giltig_till ? new Date(s.giltig_till).toLocaleDateString('sv-SE') : null
  if (fran && till) return `Giltig ${fran} → ${till}`
  if (fran) return `Giltig från ${fran}`
  if (till) return `Giltig till ${till}`
  return null
}

function formatScenarioDelta(s) {
  if (!s) return null
  return `+${s.extra_skordare_kr || 0} kr/h skördare · +${s.extra_skotare_kr || 0} kr/h skotare`
}

function PrisscenarioBox({ valtScenario, onOpen }) {
  const [hover, setHover] = useState(false)
  const harScenario = !!valtScenario
  const giltighet = formatScenarioGiltighet(valtScenario)
  const delta = formatScenarioDelta(valtScenario)

  return (
    <div
      style={{
        ...styles.scenarioBox,
        borderColor: hover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={styles.scenarioContent}>
        <span style={styles.scenarioLabel}>Prisscenario</span>
        {harScenario ? (
          <>
            <div style={styles.scenarioName}>{valtScenario.namn}</div>
            <div style={styles.scenarioDelta}>{delta}</div>
            {giltighet && <div style={styles.scenarioGiltighet}>{giltighet}</div>}
          </>
        ) : (
          <>
            <div style={styles.scenarioName}>Inget valt</div>
            <div style={styles.scenarioDelta}>Standard maskin_timpris används</div>
          </>
        )}
      </div>
      <button
        onClick={onOpen}
        className="tap-press"
        style={{
          ...styles.voLockBtn,
          background: hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
        }}
      >
        <span style={styles.voLockText}>{harScenario ? 'Ändra' : 'Välj'}</span>
      </button>
    </div>
  )
}

function ScenarioRow({ valt, namn, beskrivning, giltighet, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styles.scenarioRow,
        background: valt ? 'rgba(173,198,255,0.10)' : hover ? 'rgba(255,255,255,0.04)' : 'transparent',
        borderColor: valt ? 'rgba(173,198,255,0.30)' : hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'
      }}
    >
      <div style={{
        ...styles.scenarioRowRadio,
        borderColor: valt ? '#adc6ff' : 'rgba(255,255,255,0.25)',
        background: valt ? '#adc6ff' : 'transparent'
      }}>
        {valt && <div style={{ ...styles.scenarioRowDot, background: '#000' }} />}
      </div>
      <div style={styles.scenarioRowText}>
        <div style={styles.scenarioRowName}>{namn}</div>
        <div style={styles.scenarioRowBeskrivning}>{beskrivning}</div>
        {giltighet && <div style={styles.scenarioRowGiltighet}>{giltighet}</div>}
      </div>
    </div>
  )
}

function PrisscenarioPicker({ open, scenarier, valtId, onVal, onClose }) {
  const [scrolled, setScrolled] = useState(false)
  if (!open) return null

  return (
    <>
      <div style={{ ...styles.overlay, zIndex: 102, animation: 'fadeIn 0.2s ease' }} onClick={onClose} />
      <div style={{
        ...styles.sheet, zIndex: 103,
        animation: 'slideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
      }}>
        <div style={styles.sheetHandle} onClick={onClose}><div style={styles.sheetBar} /></div>
        <div style={{
          ...styles.sheetHeader,
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent'
        }}>
          <div style={styles.sheetTitel}>Välj prisscenario</div>
        </div>
        <div style={{ ...styles.scrollFade, opacity: scrolled ? 1 : 0 }} />
        <div style={styles.sheetContent} onScroll={(e) => setScrolled(e.target.scrollTop > 10)}>
          <ScenarioRow
            valt={valtId === null}
            namn="Inget scenario"
            beskrivning="Standard maskin_timpris används"
            onClick={() => onVal(null)}
          />
          {scenarier.map(s => (
            <ScenarioRow
              key={s.id}
              valt={valtId === s.id}
              namn={s.namn}
              beskrivning={formatScenarioDelta(s)}
              giltighet={formatScenarioGiltighet(s)}
              onClick={() => onVal(s.id)}
            />
          ))}
          {scenarier.length === 0 && (
            <div style={styles.emptyState}>Inga aktiva scenarier finns</div>
          )}
        </div>
      </div>
    </>
  )
}

// Subtila text-badges på listkort med vad som saknas (max 3, +N fler)
function KortBadges({ obj }) {
  const warnings = getWarnings(obj)
  if (warnings.length === 0) return null
  const visible = warnings.slice(0, 3)
  const more = warnings.length - visible.length
  return (
    <div style={styles.kortBadges}>
      {visible.map((w, i) => (
        <span key={w.key} style={styles.kortBadge}>
          {i > 0 && <span style={{ color: 'rgba(255,255,255,0.2)', marginRight: 6 }}>·</span>}
          {w.text}
        </span>
      ))}
      {more > 0 && <span style={styles.kortBadgeMore}>+{more} fler</span>}
    </div>
  )
}

// Varningslista — listar fält som behöver fixas, klickbar scroll-till-fält
function WarningsList({ warnings, onJump }) {
  if (warnings.length === 0) {
    return (
      <div style={styles.warningsAllOk}>
        Alla fält ifyllda
      </div>
    )
  }
  return (
    <div style={styles.warningsBox}>
      <div style={styles.warningsHeader}>
        {warnings.length} {warnings.length === 1 ? 'fält behöver åtgärdas' : 'fält behöver åtgärdas'}
      </div>
      {warnings.map(w => (
        <button
          key={w.key}
          onClick={() => onJump(w.target)}
          style={styles.warningRow}
        >
          <span style={styles.warningDot} />
          <span style={styles.warningText}>{w.text}</span>
          <span style={styles.warningArrow}>›</span>
        </button>
      ))}
    </div>
  )
}

// Bottom sheet med drag-to-close, esc, spring-animation, smooth backdrop-blur.
// Föräldern äger {open, onClose}. Esc/drag/klick-utanför kallar onClose
// som intent-callback — föräldern bestämmer om setValtObjekt(null) ska
// köras (t.ex. visa dirty-dialog först). Exit-animation körs när open
// går från true → false.
function EditSheet({ open, onClose, title, footer, children }) {
  const [closing, setClosing] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(null)
  const wasOpenRef = useRef(open)

  // Trigga exit-animation när open går true → false
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      setClosing(true)
      const t = setTimeout(() => {
        setClosing(false)
        setScrolled(false)
        setDragOffset(0)
      }, 280)
      wasOpenRef.current = open
      return () => clearTimeout(t)
    }
    wasOpenRef.current = open
  }, [open])

  // Intent-callback — föräldern beslutar om stängning är OK (t.ex. dirty-check)
  const handleClose = () => {
    if (closing || !open) return
    onClose()
  }

  // Esc-tangent
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Drag-listening på document — bara aktiv under drag
  useEffect(() => {
    if (!isDragging) return
    const getY = (e) => {
      if (typeof e.clientY === 'number') return e.clientY
      if (e.touches && e.touches[0]) return e.touches[0].clientY
      if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY
      return null
    }
    const onMove = (e) => {
      if (dragStartY.current === null) return
      const y = getY(e)
      if (y === null) return
      const offset = Math.max(0, y - dragStartY.current)
      setDragOffset(offset)
    }
    const onUp = (e) => {
      const y = getY(e)
      const offset = (y !== null && dragStartY.current !== null) ? Math.max(0, y - dragStartY.current) : dragOffset
      setIsDragging(false)
      dragStartY.current = null
      // Reset offset alltid — om föräldern visar confirm-dialog vid intent-close
      // ska sheet snappa tillbaka medan dialog visas över. Om föräldern faktiskt
      // stänger (open → false) tar exit-anim över.
      setDragOffset(0)
      if (offset > 120) handleClose()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', onMove)
    document.addEventListener('touchend', onUp)
    document.addEventListener('touchcancel', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onUp)
      document.removeEventListener('touchcancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging])

  const onDragStart = (e) => {
    const y = (typeof e.clientY === 'number')
      ? e.clientY
      : (e.touches && e.touches[0] ? e.touches[0].clientY : null)
    if (y === null) return
    dragStartY.current = y
    setDragOffset(0)
    setIsDragging(true)
  }

  if (!open && !closing) return null

  // Spring: cubic-bezier(0.32, 0.72, 0, 1) — iOS-stil med liten överskjutning
  const springEasing = 'cubic-bezier(0.32, 0.72, 0, 1)'
  const exitEasing = 'cubic-bezier(0.4, 0, 1, 1)'

  return (
    <>
      <div
        onClick={handleClose}
        style={{
          ...styles.overlay,
          animation: closing ? 'fadeOut 0.28s ease forwards' : 'fadeIn 0.22s ease',
          transition: 'backdrop-filter 0.2s ease',
        }}
      />
      <div
        style={{
          ...styles.sheet,
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: isDragging ? 'none' : `transform 0.32s ${springEasing}`,
          animation: closing
            ? `slideDown 0.28s ${exitEasing} forwards`
            : (isDragging ? 'none' : `slideUp 0.42s ${springEasing}`),
        }}
      >
        <div
          style={{ ...styles.sheetHandle, cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
        >
          <div style={styles.sheetBar} />
        </div>
        <div style={{
          ...styles.sheetHeader,
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
        }}>
          <div style={styles.sheetTitel}>{title}</div>
        </div>
        <div style={{ ...styles.scrollFade, opacity: scrolled ? 1 : 0 }} />
        <div style={styles.sheetContent} onScroll={(e) => setScrolled(e.target.scrollTop > 10)}>
          {children}
        </div>
        {footer && <div style={styles.sheetFooter}>{footer}</div>}
      </div>
    </>
  )
}

// iOS Settings-stil grupp: kort med tunna avdelare mellan rader
function IosGroup({ title, children }) {
  const items = Children.toArray(children).filter(Boolean)
  if (items.length === 0) return null
  return (
    <div style={styles.iosGroupWrap}>
      {title && <div style={styles.iosGroupTitle}>{title}</div>}
      <div style={styles.iosGroupCard}>
        {items.map((child, i) => (
          <Fragment key={i}>
            {child}
            {i < items.length - 1 && <div style={styles.iosDivider} />}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// Redigerings-modal
function RedigeraObjektContent({ valtObjekt, setValtObjekt, bolag, setBolag, inkopare, setInkopare, atgarderSlut, setAtgarderSlut, atgarderGallring, setAtgarderGallring, scenarier, onOpenScenarioPicker }) {
  const isGallring = valtObjekt.huvudtyp === 'Gallring'
  const atgarder = isGallring ? atgarderGallring : atgarderSlut
  const setAtgarder = isGallring ? setAtgarderGallring : setAtgarderSlut
  const progress = getProgress(valtObjekt)
  const warnings = getWarnings(valtObjekt)
  const [pendingHuvudtyp, setPendingHuvudtyp] = useState(null)
  const [quickFixState, setQuickFixState] = useState({ status: 'idle', message: '' })

  const showQuickFixName = looksLikeAutoDate(valtObjekt.object_name)
  const runQuickFix = async () => {
    setQuickFixState({ status: 'loading', message: '' })
    const r = await hamtaNamnFranFilnamn(valtObjekt)
    if (r.ok) {
      setValtObjekt({ ...valtObjekt, object_name: r.name })
      setQuickFixState({ status: 'done', message: `Hämtat: ${r.name}` })
      setTimeout(() => setQuickFixState({ status: 'idle', message: '' }), 2200)
    } else {
      setQuickFixState({ status: 'error', message: r.message })
      setTimeout(() => setQuickFixState({ status: 'idle', message: '' }), 3500)
    }
  }

  const toggleEgenskap = (key) => {
    setValtObjekt({...valtObjekt, [key]: !valtObjekt[key]})
  }

  const requestHuvudtyp = (v) => {
    if (v === valtObjekt.huvudtyp) return
    if (valtObjekt.atgard) {
      setPendingHuvudtyp(v)
    } else {
      setValtObjekt({...valtObjekt, huvudtyp: v, atgard: ''})
    }
  }

  const skotningWarning = (() => {
    if (!valtObjekt.skotning_avslutad) return null
    if (!valtObjekt.skordning_avslutad) return 'Skördning är inte avslutad än.'
    if (valtObjekt.skotning_avslutad < valtObjekt.skordning_avslutad) return 'Skotning är satt före skördningens avslutsdatum.'
    return null
  })()

  return (
    <>
      <div style={styles.progressHeader}>
        <MiniRing progress={progress} />
        <span style={styles.progressText}>
          {progress === 1 ? 'Komplett' : `${Math.round(progress * 4)}/4 obligatoriska fält`}
        </span>
      </div>

      <WarningsList warnings={warnings} onJump={scrollAndFlash} />

      <IosGroup title="Identitet">
        <div id="vo_nummer-section">
          <VOBox embedded value={valtObjekt.vo_nummer} onChange={(v) => setValtObjekt({...valtObjekt, vo_nummer: v})} />
        </div>
        <div id="object_name-section">
          <LockedInput embedded label="Objektnamn" value={valtObjekt.object_name || ''} onChange={(v) => setValtObjekt({...valtObjekt, object_name: v})} placeholder="T.ex. Lindön AU 2025" />
          {showQuickFixName && (
            <div style={{ padding: '0 16px 14px' }}>
              <button
                onClick={runQuickFix}
                disabled={quickFixState.status === 'loading'}
                className="tap-press"
                style={{
                  ...styles.quickFixBtn,
                  opacity: quickFixState.status === 'loading' ? 0.6 : 1,
                  cursor: quickFixState.status === 'loading' ? 'wait' : 'pointer',
                }}
              >
                {quickFixState.status === 'loading' ? 'Hämtar …' : 'Hämta från filnamn'}
              </button>
              {quickFixState.message && (
                <div style={{
                  ...styles.quickFixMessage,
                  ...(quickFixState.status === 'error' ? styles.quickFixMessageError : styles.quickFixMessageOk),
                }}>
                  {quickFixState.message}
                </div>
              )}
            </div>
          )}
        </div>
        <div id="skogsagare-section">
          <LockedInput embedded label="Markägare" value={valtObjekt.skogsagare || ''} onChange={(v) => setValtObjekt({...valtObjekt, skogsagare: v})} placeholder="Skriv markägarens namn …" />
        </div>
      </IosGroup>

      <IosGroup title="Affär">
        <div id="bolag-section">
          <ChipInput embedded label="Bolag" value={valtObjekt.bolag || ''} options={bolag} setOptions={setBolag} onChange={(v) => setValtObjekt({...valtObjekt, bolag: v})} />
        </div>
        <div id="inkopare-section">
          <ChipInput embedded label="Inköpare" value={valtObjekt.inkopare || ''} options={inkopare} setOptions={setInkopare} onChange={(v) => setValtObjekt({...valtObjekt, inkopare: v})} />
        </div>
      </IosGroup>

      <IosGroup title="Klassificering">
        <div id="huvudtyp-section">
          <SimpleChipSelect embedded label="Huvudtyp" value={valtObjekt.huvudtyp || ''} options={HUVUDTYPER} onChange={requestHuvudtyp} />
        </div>
        {valtObjekt.huvudtyp && (
          <div id="atgard-section">
            <ChipInput embedded label="Åtgärd" value={valtObjekt.atgard || ''} options={atgarder} setOptions={setAtgarder} onChange={(v) => setValtObjekt({...valtObjekt, atgard: v})} />
          </div>
        )}
      </IosGroup>

      <IosGroup title="Egenskaper">
        <div style={{ padding: '14px 16px' }}>
          <div style={{ ...styles.subsectionLabel, marginTop: 0 }}>Skogsbruk</div>
          <div style={styles.switchList}>
            {EGENSKAPER_SKOGSBRUK.map(e => (
              <EgenskapSwitch key={e.key} label={e.label} active={valtObjekt[e.key] === true} onClick={() => toggleEgenskap(e.key)} />
            ))}
          </div>
          <div style={styles.subsectionLabel}>Logistik</div>
          <div style={styles.switchList}>
            {EGENSKAPER_LOGISTIK.map(e => (
              <EgenskapSwitch key={e.key} label={e.label} active={valtObjekt[e.key] === true} onClick={() => toggleEgenskap(e.key)} />
            ))}
          </div>
        </div>
      </IosGroup>

      <IosGroup title="Pris & ersättning">
        <div style={{ padding: '14px 16px 4px' }}>
          <PrisscenarioBox
            valtScenario={scenarier.find(s => s.id === valtObjekt.prisscenario_id) || null}
            onOpen={onOpenScenarioPicker}
          />
        </div>
        <div style={{ padding: '4px 16px 14px' }}>
          <div style={styles.switchList}>
            <EgenskapSwitch
              label="Räkna i timpeng-statistik"
              active={valtObjekt.timpeng === true}
              onClick={() => setValtObjekt({...valtObjekt, timpeng: !valtObjekt.timpeng})}
            />
          </div>
        </div>
        <div style={{ padding: '4px 16px 14px' }}>
          <div style={{ ...styles.subsectionLabel, marginTop: 4 }}>Extern skotning</div>
          <div style={styles.switchList}>
            <EgenskapSwitch label="Extern skotare (inlejd)" active={valtObjekt._extern_skotning === true} onClick={() => setValtObjekt({...valtObjekt, _extern_skotning: !valtObjekt._extern_skotning})} />
          </div>
          {valtObjekt._extern_skotning && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <LockedInput label="Företag / person" value={valtObjekt._extern_foretag || ''} onChange={(v) => setValtObjekt({...valtObjekt, _extern_foretag: v})} placeholder="Namn på extern skotare …" />
              <SimpleChipSelect label="Pristyp" value={valtObjekt._extern_pris_typ || 'm3'} options={['m3', 'timme']} onChange={(v) => setValtObjekt({...valtObjekt, _extern_pris_typ: v})} />
              <LockedInput label={`Pris per ${valtObjekt._extern_pris_typ === 'timme' ? 'timme' : 'm³'} (kr)`} value={valtObjekt._extern_pris ? String(valtObjekt._extern_pris) : ''} onChange={(v) => setValtObjekt({...valtObjekt, _extern_pris: parseFloat(v) || 0})} placeholder="0" />
              <LockedInput label={`Antal ${valtObjekt._extern_pris_typ === 'timme' ? 'timmar' : 'm³'}`} value={valtObjekt._extern_antal ? String(valtObjekt._extern_antal) : ''} onChange={(v) => setValtObjekt({...valtObjekt, _extern_antal: parseFloat(v) || 0})} placeholder="0" />
            </div>
          )}
        </div>
      </IosGroup>

      <IosGroup title="Avslut">
        <div id="avslut-section" style={{ padding: '12px 16px 14px' }}>
          <div style={styles.switchList}>
            <DateToggle
              label="Skördning avslutad"
              date={valtObjekt.skordning_avslutad || null}
              onToggle={(val) => setValtObjekt({...valtObjekt, skordning_avslutad: val})}
              onDateChange={(val) => setValtObjekt({...valtObjekt, skordning_avslutad: val})}
            />
            <DateToggle
              label="Skotning avslutad"
              date={valtObjekt.skotning_avslutad || null}
              onToggle={(val) => setValtObjekt({...valtObjekt, skotning_avslutad: val})}
              onDateChange={(val) => setValtObjekt({...valtObjekt, skotning_avslutad: val})}
            />
            {skotningWarning && <div style={{ ...styles.validationWarning, margin: '8px 0 0' }}>{skotningWarning}</div>}
          </div>

          {/* Steg H: Info-rad om maskinen har rapporterat EndDate i filen */}
          {valtObjekt.end_date && (() => {
            const av = avslutadFieldFor(valtObjekt.maskin_typ)
            const display = formatEndDateDisplay(valtObjekt.end_date)
            const ymd = formatYMD(valtObjekt.end_date)
            const alreadySet = av && valtObjekt[av.field]
            return (
              <div style={styles.machineEndInfo}>
                <div style={styles.machineEndLabel}>Maskinen rapporterar avslut</div>
                <div style={styles.machineEndValue}>{display}</div>
                {/* Steg I: Snabbfix — bara om vi vet maskintyp och fältet inte redan satt */}
                {av && !alreadySet && ymd && (
                  <button
                    onClick={() => setValtObjekt({ ...valtObjekt, [av.field]: ymd })}
                    className="tap-press"
                    style={styles.machineEndFixBtn}
                  >
                    Sätt {av.label} avslutad till {ymd}
                  </button>
                )}
                {av && alreadySet && (
                  <div style={styles.machineEndDone}>{capFirst(av.label)} redan markerad avslutad ({valtObjekt[av.field]})</div>
                )}
                {!av && (
                  <div style={styles.machineEndHint}>Maskintyp okänd — sätt avslutad-datum manuellt ovan om det stämmer.</div>
                )}
              </div>
            )
          })()}
        </div>
      </IosGroup>

      <IosGroup title="Statistik">
        <div style={{ padding: '12px 16px' }}>
          <EgenskapSwitch
            label="Exkludera från statistik"
            active={valtObjekt.exkludera}
            onClick={() => setValtObjekt({...valtObjekt, exkludera: !valtObjekt.exkludera})}
            orange
          />
        </div>
      </IosGroup>

      <ConfirmDialog
        open={!!pendingHuvudtyp}
        title="Byt huvudtyp?"
        message={`Detta tar bort vald åtgärd ("${valtObjekt.atgard}"). Du måste välja åtgärd på nytt.`}
        confirmLabel="Byt huvudtyp"
        cancelLabel="Avbryt"
        onConfirm={() => {
          setValtObjekt({...valtObjekt, huvudtyp: pendingHuvudtyp, atgard: ''})
          setPendingHuvudtyp(null)
        }}
        onCancel={() => setPendingHuvudtyp(null)}
      />
    </>
  )
}

export default function ObjektRedigering() {
  const [objekt, setObjekt] = useState([])
  const [maskiner, setMaskiner] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bolag, setBolag] = useState(DEMO_BOLAG)
  const [inkopare, setInkopare] = useState(DEMO_INKOPARE)
  const [atgarderSlut, setAtgarderSlut] = useState(['LRK', 'Rp', 'Au', 'Special', 'VF/Bark'])
  const [atgarderGallring, setAtgarderGallring] = useState(['Första gallring', 'Andra gallring'])
  const [valtObjekt, setValtObjekt] = useState(null)
  const [originalObjekt, setOriginalObjekt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showDirtyDialog, setShowDirtyDialog] = useState(false)
  const [closing, setClosing] = useState(false)
  const [visaAllaObjekt, setVisaAllaObjekt] = useState(false)
  const [ringHover, setRingHover] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [scenarier, setScenarier] = useState([])
  const [scenarioPickerOpen, setScenarioPickerOpen] = useState(false)
  const [barFel, setBarFel] = useState(false)

  // Öppna objekt — snapshotar original så vi kan jämföra för dirty-check
  const openObjekt = (obj) => {
    const parsed = parseExternSkotning(obj)
    setOriginalObjekt(parsed)
    setValtObjekt(parsed)
  }

  const isDirty = !!(valtObjekt && originalObjekt &&
    JSON.stringify(valtObjekt) !== JSON.stringify(originalObjekt))

  const attemptCloseModal = () => {
    if (isDirty) setShowDirtyDialog(true)
    else { setValtObjekt(null); setOriginalObjekt(null) }
  }

  const closeAndDiscard = () => {
    setShowDirtyDialog(false)
    setValtObjekt(null)
    setOriginalObjekt(null)
  }

  const saveThenClose = () => {
    setShowDirtyDialog(false)
    sparaObjekt()
  }

  // Hämta från Supabase vid start
  useEffect(() => {
    Promise.all([hamtaObjektFranSupabase(), hamtaMaskinerFranSupabase(), hamtaPrisscenarier()])
      .then(([objektData, maskinData, scenarioData]) => {
        // Skapa lookup-objekt för maskiner: { maskin_id: modell }
        const maskinLookup = {}
        const maskinTypMap = {}
        maskinData.forEach(m => {
          maskinLookup[m.maskin_id] = m.modell
          maskinTypMap[m.maskin_id] = m.maskin_typ || null
        })
        // Berika varje objekt med maskin_typ så getWarnings + UI kan läsa direkt
        const berikade = (objektData || []).map(o => ({ ...o, maskin_typ: maskinTypMap[o.maskin_id] || null }))
        setObjekt(berikade)
        setMaskiner(maskinLookup)
        setScenarier(scenarioData)
        // Extrahera unika bolag från datan
        const unikaBolag = [...new Set(objektData.map(o => o.bolag).filter(Boolean))]
        setBolag([...new Set([...DEMO_BOLAG, ...unikaBolag])].sort())
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setError('Kunde inte ansluta till databasen')
        setLoading(false)
      })
  }, [])

  const exkluderade = objekt.filter(o => o.exkludera === true)
  const aktiva = objekt.filter(o => o.exkludera !== true)
  const kompletta = aktiva.filter(isKomplett).length
  const totalt = aktiva.length
  const procent = totalt > 0 ? Math.round((kompletta / totalt) * 100) : 0
  const medFel = aktiva.filter(o => getWarnings(o).length > 0)
  const ofullstandiga = aktiva.filter(o => !isKomplett(o))
  const synliga = barFel ? medFel : ofullstandiga
  const sectionTitel = barFel ? 'Bara fel' : 'Att göra'
  const color = procent === 100 ? '#adc6ff' : '#FF9F0A'

  async function sparaObjekt() {
    if (!valtObjekt) return
    setSaving(true)
    setSaveError('')
    let ok = false
    try {
      ok = await sparaObjektTillSupabase(valtObjekt)
    } catch (err) {
      ok = false
    }
    if (ok) {
      setObjekt(objekt.map(o => o.objekt_id === valtObjekt.objekt_id ? valtObjekt : o))
      setSaved(true)
      setTimeout(() => {
        setValtObjekt(null)
        setOriginalObjekt(null)
        setSaved(false)
      }, 600)
    } else {
      setSaveError('Kunde inte spara — försök igen')
      setTimeout(() => setSaveError(''), 4500)
    }
    setSaving(false)
  }

  // Loading-vy
  if (loading) {
    return (
      <div style={{...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh'}}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>Laddar objekt …</div>
        </div>
      </div>
    )
  }

  // Error-vy
  if (error) {
    return (
      <div style={{...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh'}}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ color: 'rgba(255,140,140,0.9)', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Kunde inte ansluta</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 20 }}>{error}</div>
          <button onClick={() => window.location.reload()} style={{ minHeight: 56, padding: '0 24px', borderRadius: 14, border: 'none', background: '#adc6ff', color: '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            Försök igen
          </button>
        </div>
      </div>
    )
  }

  if (visaAllaObjekt) {
    return <AllaObjektVy objekt={objekt} setObjekt={setObjekt} bolag={bolag} setBolag={setBolag} inkopare={inkopare} setInkopare={setInkopare} atgarderSlut={atgarderSlut} setAtgarderSlut={setAtgarderSlut} atgarderGallring={atgarderGallring} setAtgarderGallring={setAtgarderGallring} maskiner={maskiner} scenarier={scenarier} onBack={() => setVisaAllaObjekt(false)} />
  }

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes flashHighlight {
          0%   { background: rgba(255,159,10,0.20); box-shadow: 0 0 0 6px rgba(255,159,10,0.15); }
          100% { background: transparent; box-shadow: 0 0 0 0 transparent; }
        }
        .flash-highlight {
          animation: flashHighlight 0.7s ease;
          border-radius: 14px;
        }
        .tap-press {
          transition: transform 0.12s ease, background 0.18s ease, opacity 0.18s ease;
        }
        .tap-press:active:not(:disabled) {
          transform: scale(0.97);
        }
        .tap-press:disabled {
          cursor: not-allowed;
        }
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

      <div style={styles.filterToggleBar}>
        <button
          onClick={() => setBarFel(false)}
          style={{...styles.filterToggleBtn, ...(!barFel ? styles.filterToggleBtnActive : {})}}
        >
          Att göra <span style={{ marginLeft: 6, opacity: 0.7 }}>{ofullstandiga.length}</span>
        </button>
        <button
          onClick={() => setBarFel(true)}
          style={{...styles.filterToggleBtn, ...(barFel ? styles.filterToggleBtnActive : {})}}
        >
          Bara fel <span style={{ marginLeft: 6, opacity: 0.7 }}>{medFel.length}</span>
        </button>
      </div>

      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitel}>{sectionTitel}</span>
        <span style={styles.sectionCount}>{synliga.length}</span>
      </div>

      {synliga.length === 0 ? (
        <div style={styles.allaDone}>
          <div style={styles.allaDoneCheck}>✓</div>
          <div>{barFel ? 'Inga objekt med fel' : 'Alla objekt kompletta'}</div>
        </div>
      ) : (
        <div style={styles.lista}>
          {synliga.map((obj, i) => (
            <AnimatedCard key={obj.objekt_id} delay={i * 60} onClick={() => openObjekt(obj)}>
              <div style={styles.kortInner}>
                <div style={styles.kortTop}>
                  <div style={{flex: 1}}>
                    <div style={styles.kortNamn}>{obj.object_name}</div>
                    <div style={styles.kortVo}>{obj.vo_nummer}</div>
                  </div>
                  <div style={styles.kortPil}>›</div>
                </div>
                <div style={styles.kortInfo}>
                  {maskiner[obj.maskin_id] && <span>{maskiner[obj.maskin_id]}</span>}
                </div>
                <KortBadges obj={obj} />
              </div>
            </AnimatedCard>
          ))}
        </div>
      )}

      {exkluderade.length > 0 && (
        <>
          <div style={{...styles.sectionHeader, marginTop: 40}}>
            <span style={{...styles.sectionTitel, color: 'rgba(255,255,255,0.4)'}}>Exkluderade</span>
            <span style={{...styles.sectionCount, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)'}}>{exkluderade.length}</span>
          </div>
          <div style={styles.lista}>
            {exkluderade.map((obj, i) => (
              <AnimatedCard key={obj.objekt_id} delay={i * 60} onClick={() => openObjekt(obj)}>
                <div style={{...styles.kortInner, opacity: 0.5}}>
                  <div style={styles.kortTop}>
                    <div style={{flex: 1}}>
                      <div style={styles.kortNamn}>{obj.object_name}</div>
                      <div style={styles.kortVo}>{obj.vo_nummer}</div>
                    </div>
                    <div style={styles.kortPil}>›</div>
                  </div>
                  <div style={styles.kortInfo}>
                    {maskiner[obj.maskin_id] && <span>{maskiner[obj.maskin_id]}</span>}
                  </div>
                </div>
              </AnimatedCard>
            ))}
          </div>
        </>
      )}

      <EditSheet
        open={!!valtObjekt}
        onClose={attemptCloseModal}
        title={valtObjekt?.object_name || ''}
        footer={valtObjekt && <SaveButton onClick={sparaObjekt} saving={saving} saved={saved} />}
      >
        {valtObjekt && (
          <RedigeraObjektContent valtObjekt={valtObjekt} setValtObjekt={setValtObjekt} bolag={bolag} setBolag={setBolag} inkopare={inkopare} setInkopare={setInkopare} atgarderSlut={atgarderSlut} setAtgarderSlut={setAtgarderSlut} atgarderGallring={atgarderGallring} setAtgarderGallring={setAtgarderGallring} scenarier={scenarier} onOpenScenarioPicker={() => setScenarioPickerOpen(true)} />
        )}
      </EditSheet>
      {valtObjekt && (
        <PrisscenarioPicker
          open={scenarioPickerOpen}
          scenarier={scenarier}
          valtId={valtObjekt.prisscenario_id ?? null}
          onVal={(id) => { setValtObjekt({...valtObjekt, prisscenario_id: id}); setScenarioPickerOpen(false) }}
          onClose={() => setScenarioPickerOpen(false)}
        />
      )}
      <ConfirmDialog
        open={showDirtyDialog}
        title="Du har osparade ändringar"
        message="Vill du spara innan du stänger?"
        confirmLabel={saving ? 'Sparar …' : 'Spara'}
        discardLabel="Stäng utan att spara"
        cancelLabel="Avbryt"
        onConfirm={saveThenClose}
        onDiscard={closeAndDiscard}
        onCancel={() => setShowDirtyDialog(false)}
      />
      {saveError && (
        <div style={styles.saveErrorToast} role="alert">{saveError}</div>
      )}
    </div>
  )
}

// VY 2 - ALLA OBJEKT
function AllaObjektVy({ objekt, setObjekt, bolag, setBolag, inkopare, setInkopare, atgarderSlut, setAtgarderSlut, atgarderGallring, setAtgarderGallring, maskiner, scenarier, onBack }) {
  const [search, setSearch] = useState('')
  const [filterBolag, setFilterBolag] = useState(null)
  const [filterHuvudtyp, setFilterHuvudtyp] = useState(null)
  const [filterInkopare, setFilterInkopare] = useState(null)
  const [showSearch, setShowSearch] = useState(false)
  const [valtObjekt, setValtObjekt] = useState(null)
  const [originalObjekt, setOriginalObjekt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showDirtyDialog, setShowDirtyDialog] = useState(false)
  const [closing, setClosing] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [backHover, setBackHover] = useState(false)
  const [titleHover, setTitleHover] = useState(false)
  const [scenarioPickerOpen, setScenarioPickerOpen] = useState(false)

  const openObjekt = (obj) => {
    const parsed = parseExternSkotning(obj)
    setOriginalObjekt(parsed)
    setValtObjekt(parsed)
  }
  const isDirty = !!(valtObjekt && originalObjekt &&
    JSON.stringify(valtObjekt) !== JSON.stringify(originalObjekt))
  const attemptCloseModal = () => {
    if (isDirty) setShowDirtyDialog(true)
    else { setValtObjekt(null); setOriginalObjekt(null) }
  }
  const closeAndDiscard = () => {
    setShowDirtyDialog(false)
    setValtObjekt(null)
    setOriginalObjekt(null)
  }
  const saveThenClose = () => {
    setShowDirtyDialog(false)
    sparaObjekt()
  }

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
    setSaveError('')
    let ok = false
    try {
      ok = await sparaObjektTillSupabase(valtObjekt)
    } catch (err) {
      ok = false
    }
    if (ok) {
      setObjekt(objekt.map(o => o.objekt_id === valtObjekt.objekt_id ? valtObjekt : o))
      setSaved(true)
      setTimeout(() => {
        setValtObjekt(null)
        setOriginalObjekt(null)
        setSaved(false)
      }, 600)
    } else {
      setSaveError('Kunde inte spara — försök igen')
      setTimeout(() => setSaveError(''), 4500)
    }
    setSaving(false)
  }

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes flashHighlight {
          0%   { background: rgba(255,159,10,0.20); box-shadow: 0 0 0 6px rgba(255,159,10,0.15); }
          100% { background: transparent; box-shadow: 0 0 0 0 transparent; }
        }
        .flash-highlight {
          animation: flashHighlight 0.7s ease;
          border-radius: 14px;
        }
        .tap-press {
          transition: transform 0.12s ease, background 0.18s ease, opacity 0.18s ease;
        }
        .tap-press:active:not(:disabled) {
          transform: scale(0.97);
        }
        .tap-press:disabled {
          cursor: not-allowed;
        }
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
          <AnimatedCard key={obj.objekt_id} delay={i * 40} onClick={() => openObjekt(obj)}>
            <div style={styles.kortInner}>
              <div style={styles.kortTop}>
                <div style={{flex: 1}}>
                  <div style={styles.kortNamn}>{obj.object_name}</div>
                  <div style={styles.kortVo}>{obj.vo_nummer}</div>
                </div>
                <div style={styles.kortPil}>›</div>
              </div>
              <div style={styles.kortInfo}>
                {maskiner[obj.maskin_id] && <span>{maskiner[obj.maskin_id]} · </span>}
                {obj.huvudtyp} · {obj.bolag} · {obj.atgard}
              </div>
              <KortBadges obj={obj} />
              <div style={styles.kortMeta}>{obj.skogsagare}</div>
            </div>
          </AnimatedCard>
        ))}
        {filtered.length === 0 && (
          <div style={styles.emptyState}>Inga objekt matchar</div>
        )}
      </div>

      <EditSheet
        open={!!valtObjekt}
        onClose={attemptCloseModal}
        title={valtObjekt?.object_name || ''}
        footer={valtObjekt && <SaveButton onClick={sparaObjekt} saving={saving} saved={saved} />}
      >
        {valtObjekt && (
          <RedigeraObjektContent valtObjekt={valtObjekt} setValtObjekt={setValtObjekt} bolag={bolag} setBolag={setBolag} inkopare={inkopare} setInkopare={setInkopare} atgarderSlut={atgarderSlut} setAtgarderSlut={setAtgarderSlut} atgarderGallring={atgarderGallring} setAtgarderGallring={setAtgarderGallring} scenarier={scenarier} onOpenScenarioPicker={() => setScenarioPickerOpen(true)} />
        )}
      </EditSheet>
      {valtObjekt && (
        <PrisscenarioPicker
          open={scenarioPickerOpen}
          scenarier={scenarier}
          valtId={valtObjekt.prisscenario_id ?? null}
          onVal={(id) => { setValtObjekt({...valtObjekt, prisscenario_id: id}); setScenarioPickerOpen(false) }}
          onClose={() => setScenarioPickerOpen(false)}
        />
      )}
      <ConfirmDialog
        open={showDirtyDialog}
        title="Du har osparade ändringar"
        message="Vill du spara innan du stänger?"
        confirmLabel={saving ? 'Sparar …' : 'Spara'}
        discardLabel="Stäng utan att spara"
        cancelLabel="Avbryt"
        onConfirm={saveThenClose}
        onDiscard={closeAndDiscard}
        onCancel={() => setShowDirtyDialog(false)}
      />
      {saveError && (
        <div style={styles.saveErrorToast} role="alert">{saveError}</div>
      )}
    </div>
  )
}

const styles = {
  container: { position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, background: '#000', fontFamily: "'Geist', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", color: '#fff', padding: '16px 20px 100px', WebkitFontSmoothing: 'antialiased', overflowY: 'auto' },
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
  sectionLabel: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2px', marginTop: 28, marginBottom: 12 },
  subsectionLabel: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.2px', marginTop: 20, marginBottom: 10 },
  scenarioBox: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px', borderRadius: 14, marginBottom: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', transition: 'all 0.2s ease', gap: 12 },
  scenarioContent: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 },
  scenarioLabel: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2px', marginBottom: 6 },
  scenarioName: { fontSize: 16, fontWeight: 500, color: '#fff' },
  scenarioDelta: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  scenarioGiltighet: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  scenarioRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, marginBottom: 8, border: '1px solid', cursor: 'pointer', transition: 'all 0.2s ease' },
  scenarioRowRadio: { width: 22, height: 22, borderRadius: 11, border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  scenarioRowDot: { width: 8, height: 8, borderRadius: 4 },
  scenarioRowText: { flex: 1, minWidth: 0 },
  scenarioRowName: { fontSize: 16, fontWeight: 500, color: '#fff' },
  scenarioRowBeskrivning: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  scenarioRowGiltighet: { fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  validationWarning: { margin: '12px 16px 4px', padding: '10px 14px', borderRadius: 12, background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.25)', color: 'rgba(255,200,120,0.95)', fontSize: 13, lineHeight: 1.4 },
  saveErrorToast: { position: 'fixed', bottom: 120, left: '50%', transform: 'translateX(-50%)', background: 'rgba(60,18,18,0.95)', color: 'rgba(255,160,160,0.98)', padding: '12px 18px', borderRadius: 12, fontSize: 14, fontWeight: 500, fontFamily: 'inherit', border: '1px solid rgba(255,69,58,0.35)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)', zIndex: 250, animation: 'fadeIn 0.2s ease', maxWidth: '90%', textAlign: 'center' },
  iosGroupWrap: { marginBottom: 24 },
  iosGroupTitle: { fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.2px', padding: '0 4px', marginBottom: 8 },
  iosGroupCard: { background: '#1c1c1e', borderRadius: 14, overflow: 'hidden' },
  iosDivider: { height: 1, background: 'rgba(255,255,255,0.06)', marginLeft: 16 },
  chipInputBoxEmbedded: { padding: '14px 16px 16px' },
  voBoxEmbedded: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'transparent', border: 'none', transition: 'background 0.2s ease', minHeight: 56, boxSizing: 'border-box' },
  voEditBoxEmbedded: { padding: '14px 16px', background: 'rgba(173,198,255,0.06)', borderTop: '1px solid rgba(173,198,255,0.2)', borderBottom: '1px solid rgba(173,198,255,0.2)' },
  // Direkt-redigerbart fält i iOS Settings-stil: label vänster, input höger
  directRowStandalone: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', minHeight: 56, gap: 14, marginBottom: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, transition: 'border-color 0.18s ease' },
  directRowEmbedded: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', minHeight: 56, gap: 14, transition: 'background 0.18s ease' },
  directRowLabel: { fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.85)', flexShrink: 0 },
  directRowInput: { background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 17, fontFamily: 'inherit', textAlign: 'right', flex: 1, minWidth: 0, padding: 0, WebkitAppearance: 'none' },
  machineEndInfo: { marginTop: 12, padding: '14px 16px', borderRadius: 14, background: 'rgba(173,198,255,0.06)', border: '1px solid rgba(173,198,255,0.2)' },
  machineEndLabel: { fontSize: 11, fontWeight: 600, color: 'rgba(173,198,255,0.7)', letterSpacing: '0.2px', marginBottom: 4 },
  machineEndValue: { fontSize: 15, fontWeight: 500, color: '#fff', fontVariantNumeric: 'tabular-nums', marginBottom: 12 },
  machineEndFixBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 56, padding: '0 18px', borderRadius: 12, border: '1px solid rgba(173,198,255,0.35)', background: 'rgba(173,198,255,0.12)', color: '#adc6ff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', width: '100%', boxSizing: 'border-box' },
  machineEndDone: { fontSize: 13, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' },
  machineEndHint: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  fieldWrap: { scrollMarginTop: 24 },
  warningsBox: { marginBottom: 20, padding: '14px 16px 6px', borderRadius: 14, background: 'rgba(255,159,10,0.07)', border: '1px solid rgba(255,159,10,0.22)' },
  warningsHeader: { fontSize: 13, fontWeight: 600, color: 'rgba(255,200,120,0.95)', marginBottom: 8, letterSpacing: '0.1px' },
  warningsAllOk: { marginBottom: 20, padding: '12px 16px', borderRadius: 14, background: 'rgba(173,198,255,0.06)', border: '1px solid rgba(173,198,255,0.18)', color: 'rgba(173,198,255,0.85)', fontSize: 13, fontWeight: 500 },
  warningRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '0 4px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'rgba(255,255,255,0.85)', fontFamily: 'inherit', fontSize: 14, transition: 'background 0.15s ease', borderRadius: 8 },
  warningDot: { width: 6, height: 6, borderRadius: 3, background: '#FF9F0A', flexShrink: 0 },
  warningText: { flex: 1 },
  warningArrow: { color: 'rgba(255,255,255,0.35)', fontSize: 18, lineHeight: 1 },
  quickFixBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 56, marginTop: 8, padding: '0 18px', borderRadius: 12, background: 'rgba(255,159,10,0.10)', border: '1px solid rgba(255,159,10,0.30)', color: 'rgba(255,200,120,0.95)', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' },
  quickFixMessage: { marginTop: 8, padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.4 },
  quickFixMessageOk: { background: 'rgba(173,198,255,0.08)', border: '1px solid rgba(173,198,255,0.25)', color: 'rgba(173,198,255,0.95)' },
  quickFixMessageError: { background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.25)', color: 'rgba(255,200,120,0.95)' },
  kortBadges: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 12, color: 'rgba(255,200,120,0.95)' },
  kortBadge: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  kortBadgeMore: { color: 'rgba(255,255,255,0.45)' },
  filterToggleBar: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 },
  filterToggleBtn: { minHeight: 40, padding: '0 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s ease' },
  filterToggleBtnActive: { background: 'rgba(173,198,255,0.12)', borderColor: 'rgba(173,198,255,0.35)', color: '#adc6ff' },
  allaDone: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, color: '#adc6ff', fontSize: 17, fontWeight: 600 },
  allaDoneCheck: { fontSize: 48, marginBottom: 16, filter: 'drop-shadow(0 0 20px rgba(173,198,255,0.5))' },
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
  filterLabel: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2px', marginBottom: 10 },
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
  saveBtn: { width: '100%', padding: '18px', borderRadius: 16, border: 'none', background: '#adc6ff', color: '#000', fontSize: 17, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease' },
  progressHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' },
  progressText: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  voBox: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderRadius: 14, marginBottom: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', transition: 'all 0.2s ease' },
  voLeft: { display: 'flex', flexDirection: 'column', gap: 6 },
  voLabel: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2px' },
  voValue: { fontSize: 16, fontWeight: 500, color: '#fff' },
  voLockBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 56, minWidth: 88, padding: '0 18px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'all 0.2s ease' },
  voLockText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  voEditBox: { padding: '16px', borderRadius: 14, marginBottom: 20, background: 'rgba(173,198,255,0.08)', border: '1px solid rgba(173,198,255,0.3)' },
  voEditHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  voEditingText: { fontSize: 12, color: '#adc6ff' },
  voInput: { width: '100%', padding: '14px', borderRadius: 12, border: '1px solid rgba(173,198,255,0.3)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box', marginBottom: 12 },
  voBtns: { display: 'flex', gap: 10 },
  voBtnSave: { flex: 1, minHeight: 56, padding: '0 16px', borderRadius: 12, border: 'none', background: '#adc6ff', color: '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  voBtnCancel: { flex: 1, minHeight: 56, padding: '0 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  chipInputBox: { marginBottom: 20 },
  chipInputHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  chipInputLabel: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2px' },
  chipEditBtn: { background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', padding: '4px 8px', transition: 'color 0.2s ease' },
  chipSelected: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 14, background: 'rgba(173,198,255,0.15)', border: '1px solid rgba(173,198,255,0.3)', marginBottom: 10, fontSize: 16, fontWeight: 500, color: '#fff' },
  chipClear: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer', padding: 4 },
  chipInput: { width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 10, transition: 'border-color 0.2s ease' },
  chipGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, border: '1px solid', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s ease' },
  chipDelete: { background: 'rgba(255,69,58,0.18)', border: 'none', color: '#FF453A', fontSize: 14, width: 32, height: 32, borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipNew: { padding: '10px 14px', borderRadius: 12, border: '1px dashed rgba(173,198,255,0.4)', background: 'rgba(173,198,255,0.08)', color: '#adc6ff', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s ease' },
  switchList: { display: 'flex', flexDirection: 'column', gap: 8 },
  switchRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 14, border: '1px solid', cursor: 'pointer', transition: 'all 0.2s ease' },
  switchLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  switch: { width: 50, height: 30, borderRadius: 15, padding: 3, transition: 'all 0.2s ease' },
  switchKnob: { width: 24, height: 24, borderRadius: 12, background: '#fff', transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }
}
