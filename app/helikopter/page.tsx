import { useState, useEffect } from 'react'

// TypeScript interfaces
interface HardcodedObjekt {
  objekt_id: string
  object_name?: string
  vo_nummer?: string
  bolag: string
  huvudtyp: string
  skordat_m3: number
  skotat_m3: number
  oskotat_m3: number
  skordare_klar: string
  skotare_start: string | null
  dagar_vantar?: number
}

interface Bestallning {
  id: string
  ar: number
  manad: number
  bolag: string
  typ: 'slutavverkning' | 'gallring'
  volym: number
}

interface OskotatObjekt extends HardcodedObjekt {
  franTidigare: boolean
  objektManad: number
  objektAr: number
}

interface BolagData {
  skordat: number
  skotat: number
}

interface BolagMap {
  [key: string]: BolagData
}

interface BestBolagMap {
  [key: string]: number
}

const SUPABASE_URL = 'https://mxydghzfacbenbgpodex.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWRnaHpmYWNiZW5iZ3BvZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NzU2MjMsImV4cCI6MjA4NDQ1MTYyM30.NRBG5HcAtEXRTyf4YTp71A3iATk6U3DGhfdJ5EYlMyo';

// Hårdkodad data för förhandsgranskning
const HARDCODED_DATA: HardcodedObjekt[] = [
  {"objekt_id":"R64101_168","object_name":"Midingstorp gallring 2025","vo_nummer":"11024295","bolag":"Vida","huvudtyp":"Gallring","skordat_m3":157.6024,"skotat_m3":0,"oskotat_m3":157.6024,"skordare_klar":"2025-12-11","skotare_start":null,"dagar_vantar":43},
  {"objekt_id":"PONS20SDJAA270231_60","object_name":"Järnemåla Rapp Au","vo_nummer":"11065627","bolag":"Vida","huvudtyp":"Slutavverkning","skordat_m3":54.8654,"skotat_m3":0,"oskotat_m3":54.8654,"skordare_klar":"2026-01-08","skotare_start":null,"dagar_vantar":15},
  {"objekt_id":"PONS20SDJAA270231_69","object_name":"Karatorp RP 2025","vo_nummer":"11109556","bolag":"Vida","huvudtyp":"Slutavverkning","skordat_m3":154.8164,"skotat_m3":0,"oskotat_m3":154.8164,"skordare_klar":"2026-01-15","skotare_start":null,"dagar_vantar":8},
  {"objekt_id":"R64101_176","object_name":"S Rimshult lövgallring","vo_nummer":"11096407","bolag":"Vida","huvudtyp":"Gallring","skordat_m3":35.0762,"skotat_m3":0,"oskotat_m3":35.0762,"skordare_klar":"2026-01-09","skotare_start":null,"dagar_vantar":14},
  {"objekt_id":"PONS20SDJAA270231_62","object_name":"Ramsberg AU 2025","vo_nummer":"11104938","bolag":"Vida","huvudtyp":"Slutavverkning","skordat_m3":100.3043,"skotat_m3":0,"oskotat_m3":100.3043,"skordare_klar":"2026-01-09","skotare_start":null,"dagar_vantar":14},
  {"objekt_id":"PONS20SDJAA270231_65","object_name":"Santhe Dahl Tallar","vo_nummer":"O41F97_65","bolag":"Privat","huvudtyp":"Slutavverkning","skordat_m3":15.7836,"skotat_m3":0,"oskotat_m3":15.7836,"skordare_klar":"2026-01-09","skotare_start":null,"dagar_vantar":14},
  {"objekt_id":"PONS20SDJAA270231_52","object_name":"Karsemåla AU 2025","vo_nummer":"11080404","bolag":"Vida","huvudtyp":"Slutavverkning","skordat_m3":841.4996,"skotat_m3":0,"oskotat_m3":841.4996,"skordare_klar":"2025-12-11","skotare_start":null,"dagar_vantar":43},
  {"objekt_id":"PONS20SDJAA270231_56","object_name":"Stenshult AU- Del 2","vo_nummer":"11080154","bolag":"Vida","huvudtyp":"Slutavverkning","skordat_m3":138.2552,"skotat_m3":0,"oskotat_m3":138.2552,"skordare_klar":"2025-12-18","skotare_start":null,"dagar_vantar":36},
  {"objekt_id":"R64101_174","object_name":"Kompermåla Ga","vo_nummer":"1234","bolag":"Privat","huvudtyp":"Gallring","skordat_m3":53.9303,"skotat_m3":0,"oskotat_m3":53.9303,"skordare_klar":"2025-12-23","skotare_start":null,"dagar_vantar":31},
  {"objekt_id":"PONS20SDJAA270231_63","object_name":"Ramsberg svärföräldrar","vo_nummer":"O41F97_63","bolag":"Vida","huvudtyp":"Slutavverkning","skordat_m3":176.5755,"skotat_m3":0,"oskotat_m3":176.5755,"skordare_klar":"2026-01-08","skotare_start":null,"dagar_vantar":15},
  {"objekt_id":"PONS20SDJAA270231_68","object_name":"Lönsbygd AU 2025","vo_nummer":"11080935","bolag":"Vida","huvudtyp":"Slutavverkning","skordat_m3":99.4434,"skotat_m3":0,"oskotat_m3":99.4434,"skordare_klar":"2026-01-13","skotare_start":null,"dagar_vantar":10},
  {"objekt_id":"PONS20SDJAA270231_53","object_name":"Lindön AU 2026","vo_nummer":"11092342","bolag":"Vida","huvudtyp":"Slutavverkning","skordat_m3":80.7849,"skotat_m3":0,"oskotat_m3":80.7849,"skordare_klar":"2025-12-12","skotare_start":null,"dagar_vantar":42},
  {"objekt_id":"PONS20SDJAA270231_59","object_name":"Letesmåla Johannes","vo_nummer":"2025 12 25","bolag":"Privat","huvudtyp":"Slutavverkning","skordat_m3":164.8174,"skotat_m3":0,"oskotat_m3":164.8174,"skordare_klar":"2025-12-25","skotare_start":null,"dagar_vantar":29},
  {"objekt_id":"PONS20SDJAA270231_61","object_name":"Björkebråten","vo_nummer":"20260105","bolag":"Privat","huvudtyp":"Slutavverkning","skordat_m3":65.1382,"skotat_m3":0,"oskotat_m3":65.1382,"skordare_klar":"2026-01-05","skotare_start":null,"dagar_vantar":18},
  {"objekt_id":"PONS20SDJAA270231_66","object_name":"Björsamåla special","vo_nummer":"...","bolag":"Vida","huvudtyp":"Slutavverkning","skordat_m3":5.2562,"skotat_m3":0,"oskotat_m3":5.2562,"skordare_klar":"2026-01-12","skotare_start":null,"dagar_vantar":11},
  {"objekt_id":"PONS20SDJAA270231_55","object_name":"Specialavv Ålshult","vo_nummer":"11080064","bolag":"Vida","huvudtyp":"Slutavverkning","skordat_m3":27.4804,"skotat_m3":0,"oskotat_m3":27.4804,"skordare_klar":"2025-12-16","skotare_start":null,"dagar_vantar":38},
  {"objekt_id":"R64101_175","object_name":"Stefan Björkebråten","vo_nummer":"93693","bolag":"Privat","huvudtyp":"Gallring","skordat_m3":32.3689,"skotat_m3":0,"oskotat_m3":32.3689,"skordare_klar":"2026-01-08","skotare_start":null,"dagar_vantar":15},
  {"objekt_id":"PONS20SDJAA270231_49","object_name":"Björsamåla AU 2025","vo_nummer":"11081163","bolag":"Vida","huvudtyp":"Slutavverkning","skordat_m3":136.8218,"skotat_m3":0,"oskotat_m3":136.8218,"skordare_klar":"2026-01-12","skotare_start":null,"dagar_vantar":11},
  {"objekt_id":"PONS20SDJAA270231_54","object_name":"Ålshult AU 2025","vo_nummer":"11080064","bolag":"Vida","huvudtyp":"Slutavverkning","skordat_m3":180.212,"skotat_m3":0,"oskotat_m3":180.212,"skordare_klar":"2025-12-15","skotare_start":null,"dagar_vantar":39},
  {"objekt_id":"PONS20SDJAA270231_58","object_name":"Kompersmåla Lövhuggning","vo_nummer":"20251219","bolag":"Privat","huvudtyp":"Slutavverkning","skordat_m3":24.4827,"skotat_m3":0,"oskotat_m3":24.4827,"skordare_klar":"2025-12-19","skotare_start":null,"dagar_vantar":35}
]

const MANAD = ['', 'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 
               'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

const MANAD_KORT = ['', 'jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function CountUp({ value, duration = 1000 }: { value: number; duration?: number }) {
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

function AnimatedBar({ procent, color, height = 6, delay = 0 }: { procent: number; color: string; height?: number; delay?: number }) {
  const [width, setWidth] = useState(0)
  const klarade = procent >= 100
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setWidth(Math.min(100, procent))
    }, delay + 100)
    return () => clearTimeout(timer)
  }, [procent, delay])

  return (
    <div style={{ height, background: 'rgba(255,255,255,0.08)', borderRadius: height/2, overflow: 'hidden' }}>
      <div style={{ 
        height: '100%', 
        width: `${width}%`,
        background: color,
        borderRadius: height/2,
        transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: klarade ? `0 0 16px ${color}aa` : 'none'
      }} />
    </div>
  )
}

interface RingProps {
  procent: number
  size?: number
  stroke?: number
  color: string
  delay?: number
  onClick?: () => void
  active?: boolean
  children?: React.ReactNode
}

function Ring({ procent, size = 100, stroke = 6, color, delay = 0, onClick, active, children }: RingProps) {
  const [anim, setAnim] = useState(0)
  const [hover, setHover] = useState(false)
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

  const glowIntensity = active ? 20 : hover ? 12 : 8
  const glowOpacity = active ? 'aa' : hover ? '70' : '50'

  return (
    <div 
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        width: size,
        height: size,
        cursor: onClick ? 'pointer' : 'default',
        transform: active ? 'scale(1.08)' : hover ? 'scale(1.03)' : 'scale(1)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      <svg width={size} height={size} style={{ 
        transform: 'rotate(-90deg)',
        filter: `drop-shadow(0 0 ${glowIntensity}px ${color}${glowOpacity})`,
        transition: 'filter 0.3s ease'
      }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" 
          stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" 
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.1s ease-out' }} />
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

export default function HelikopterPage() {
  const [data, setData] = useState<HardcodedObjekt[]>(HARDCODED_DATA)
  const [bestallningar, setBestallningar] = useState<Bestallning[]>([])
  const [ar, setAr] = useState<number>(2026)
  const [manad, setManad] = useState<number>(1)
  const [sheet, setSheet] = useState<string | null>(null)
  const [closing, setClosing] = useState<boolean>(false)
  const [activeRing, setActiveRing] = useState<string | null>(null)
  const [animKey, setAnimKey] = useState<number>(0)

  // Kolla om månaden är avslutad
  const idag = new Date()
  const manadAvslutad = ar < idag.getFullYear() || (ar === idag.getFullYear() && manad < idag.getMonth() + 1)

  // Hämta helikopter_vy data
  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/helikopter_vy?select=*`,
          {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          }
        )
        if (response.ok) {
          const result = await response.json()
          if (result.length > 0) setData(result)
        }
      } catch (err) {
        // Använd hårdkodad data vid fel
      }
    }
    fetchData()
  }, [])

  // Hämta beställningar
  useEffect(() => {
    async function fetchBestallningar() {
      try {
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/bestallningar?select=*&ar=eq.${ar}&manad=eq.${manad}`,
          {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          }
        )
        if (response.ok) {
          const result = await response.json()
          setBestallningar(result)
        }
      } catch (err) {
        setBestallningar([])
      }
    }
    fetchBestallningar()
  }, [ar, manad])

  // Räkna arbetsdagar kvar i månaden
  const sistaManad = new Date(ar, manad, 0).getDate()
  const arbetsdagar = 22
  const kvar = manadAvslutad ? 0 : Math.max(0, Math.ceil((sistaManad - idag.getDate()) * (22/30)))

  // Filtrera data för vald månad
  const manadStart = `${ar}-${String(manad).padStart(2, '0')}-01`
  const manadSlut = manad === 12 ? `${ar + 1}-01-01` : `${ar}-${String(manad + 1).padStart(2, '0')}-01`
  
  const filtreradData = data.filter(obj => {
    if (!obj.skordare_klar) return false
    return obj.skordare_klar >= manadStart && obj.skordare_klar < manadSlut
  })

  // Beräkna per typ och bolag för månaden
  const slutData = filtreradData.filter(o => o.huvudtyp === 'Slutavverkning')
  const gallData = filtreradData.filter(o => o.huvudtyp === 'Gallring')

  const slutSkordare = slutData.reduce((s, o) => s + (o.skordat_m3 || 0), 0)
  const slutSkotare = slutData.reduce((s, o) => s + (o.skotat_m3 || 0), 0)
  const gallSkordare = gallData.reduce((s, o) => s + (o.skordat_m3 || 0), 0)
  const gallSkotare = gallData.reduce((s, o) => s + (o.skotat_m3 || 0), 0)

  // Gruppera per bolag
  const slutBolag = slutData.reduce((acc, o) => {
    const b = o.bolag || 'Okänt'
    if (!acc[b]) acc[b] = { skordat: 0, skotat: 0 }
    acc[b].skordat += o.skordat_m3 || 0
    acc[b].skotat += o.skotat_m3 || 0
    return acc
  }, {})

  const gallBolag = gallData.reduce((acc, o) => {
    const b = o.bolag || 'Okänt'
    if (!acc[b]) acc[b] = { skordat: 0, skotat: 0 }
    acc[b].skordat += o.skordat_m3 || 0
    acc[b].skotat += o.skotat_m3 || 0
    return acc
  }, {})

  // Oskotat - alltid live men markera från tidigare månader
  const oskotatLista = data
    .filter(obj => obj.oskotat_m3 > 0 && obj.skotare_start === null)
    .map(obj => {
      const datum = new Date(obj.skordare_klar)
      const objektManad = datum.getMonth() + 1
      const objektAr = datum.getFullYear()
      const franTidigare = objektAr < ar || (objektAr === ar && objektManad < manad)
      return { ...obj, franTidigare, objektManad, objektAr }
    })
    .sort((a, b) => (b.dagar_vantar || 0) - (a.dagar_vantar || 0))

  const totalOskotat = oskotatLista.reduce((sum, obj) => sum + (obj.oskotat_m3 || 0), 0)

  // Beställning från bestallningar-tabellen
  const slutBest = bestallningar
    .filter(b => b.typ === 'slutavverkning')
    .reduce((sum, b) => sum + (b.volym || 0), 0) || 2000
  const gallBest = bestallningar
    .filter(b => b.typ === 'gallring')
    .reduce((sum, b) => sum + (b.volym || 0), 0) || 500

  // Beställning per bolag
  const slutBestBolag = bestallningar
    .filter(b => b.typ === 'slutavverkning')
    .reduce((acc, b) => {
      acc[b.bolag] = (acc[b.bolag] || 0) + (b.volym || 0)
      return acc
    }, {})
  const gallBestBolag = bestallningar
    .filter(b => b.typ === 'gallring')
    .reduce((acc, b) => {
      acc[b.bolag] = (acc[b.bolag] || 0) + (b.volym || 0)
      return acc
    }, {})

  const slutProcent = slutBest > 0 ? Math.round((slutSkotare / slutBest) * 100) : 0
  const gallProcent = gallBest > 0 ? Math.round((gallSkotare / gallBest) * 100) : 0

  const closeSheet = () => {
    setClosing(true)
    setTimeout(() => {
      setSheet(null)
      setClosing(false)
      setActiveRing(null)
      setAnimKey(k => k + 1) // Trigger ring re-animation
    }, 250)
  }

  const openSheet = (typ) => {
    setActiveRing(typ)
    setTimeout(() => setSheet(typ), 150)
  }

  const bytManad = (dir) => {
    setAnimKey(k => k + 1) // Re-animate rings
    if (dir === 'prev') {
      if (manad === 1) { setManad(12); setAr(ar - 1) }
      else setManad(manad - 1)
    } else {
      if (manad === 12) { setManad(1); setAr(ar + 1) }
      else setManad(manad + 1)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', color: '#fff', padding: '16px 20px 100px' }}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .nav-btn:hover { background: rgba(255,255,255,0.12) !important; transform: scale(1.05); }
        .nav-btn:active { transform: scale(0.95); }
        .oskotat-btn:hover { background: rgba(255,255,255,0.04) !important; }
        .oskotat-btn:active { background: rgba(255,255,255,0.08) !important; }
        .oskotat-btn:hover .arrow { transform: translateX(3px); }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
        <button className="nav-btn" onClick={() => bytManad('prev')} style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 24, cursor: 'pointer', transition: 'all 0.2s ease' }}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{MANAD[manad]}</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
            {kvar} arbetsdagar kvar
          </div>
        </div>
        <button className="nav-btn" onClick={() => bytManad('next')} style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 24, cursor: 'pointer', transition: 'all 0.2s ease' }}>›</button>
      </div>

      {/* Slutavverkning */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 24 }}>🪵</span>
          <span style={{ fontSize: 18, fontWeight: 600, flex: 1 }}>Slutavverkning</span>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>{slutBest.toLocaleString()} m³ beställt</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Ring key={`slut_skordare_${animKey}`} procent={slutBest > 0 ? Math.round((slutSkordare/slutBest)*100) : 0} size={100} stroke={6} color="#FF9F0A" onClick={() => openSheet('slut_skordare')} active={activeRing === 'slut_skordare'} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Skördare</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Ring key={`slut_skotare_${animKey}`} procent={slutProcent} size={100} stroke={6} color="#FF9F0A" onClick={() => openSheet('slut_skotare')} active={activeRing === 'slut_skotare'} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Skotare</span>
          </div>
        </div>
      </div>

      {/* Gallring */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 24 }}>🌲</span>
          <span style={{ fontSize: 18, fontWeight: 600, flex: 1 }}>Gallring</span>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>{gallBest.toLocaleString()} m³ beställt</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Ring key={`gall_skordare_${animKey}`} procent={gallBest > 0 ? Math.round((gallSkordare/gallBest)*100) : 0} size={100} stroke={6} color="#30D158" onClick={() => openSheet('gall_skordare')} active={activeRing === 'gall_skordare'} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Skördare</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Ring key={`gall_skotare_${animKey}`} procent={gallProcent} size={100} stroke={6} color="#30D158" onClick={() => openSheet('gall_skotare')} active={activeRing === 'gall_skotare'} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Skotare</span>
          </div>
        </div>
      </div>

      {/* Oskotat */}
      <button className="oskotat-btn" onClick={() => openSheet('oskotat')} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '24px 4px', cursor: 'pointer', color: '#fff', marginTop: 20, borderRadius: 8, transition: 'background 0.2s ease' }}>
        <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)' }}>Oskotat virke</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{Math.round(totalOskotat).toLocaleString()} m³</span>
          <span className="arrow" style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)', transition: 'transform 0.2s ease', display: 'inline-block' }}>›</span>
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
            const bolagData = isSlut ? slutBolag : gallBolag
            const bestBolag = isSlut ? slutBestBolag : gallBestBolag
            const totalBest = isSlut ? slutBest : gallBest
            const totalProd = isSkordare ? (isSlut ? slutSkordare : gallSkordare) : (isSlut ? slutSkotare : gallSkotare)
            // Båda jämförs mot beställning
            const procent = totalBest > 0 ? Math.round((totalProd / totalBest) * 100) : 0

            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 24px 20px' }}>
                  <span style={{ fontSize: 28 }}>{isSlut ? '🪵' : '🌲'}</span>
                  <span style={{ fontSize: 20, fontWeight: 600 }}>{isSlut ? 'Slutavverkning' : 'Gallring'} • {isSkordare ? 'Skördare' : 'Skotare'}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                  <Ring procent={procent} size={140} stroke={10} color={color}>
                    <div style={{ fontSize: 32, fontWeight: 700 }}><CountUp value={procent} /></div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>%</div>
                  </Ring>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 0, padding: '0 40px', marginBottom: 28 }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 700 }}><CountUp value={Math.round(totalProd)} /></div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{isSkordare ? 'Skördat' : 'Skotat'}</div>
                  </div>
                  <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 24px' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 700 }}><CountUp value={totalBest} /></div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Beställt</div>
                  </div>
                </div>

                {/* Total progress bar */}
                <div style={{ padding: '0 24px', marginBottom: 32 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{isSkordare ? 'Skördat' : 'Skotat'} av beställt</span>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}><CountUp value={procent} duration={800} />%</span>
                  </div>
                  <AnimatedBar procent={procent} color={color} height={8} />
                </div>

                <div style={{ padding: '0 24px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Per bolag</span>
                  </div>
                  {Object.entries(bolagData).map(([namn, b], i) => {
                    const prod = isSkordare ? b.skordat : b.skotat
                    const harBestallning = bestBolag[namn] !== undefined && bestBolag[namn] > 0
                    const best = bestBolag[namn] || 0
                    const proc = best > 0 ? Math.round((prod / best) * 100) : 0
                    const klarade = proc >= 100

                    // Bolag utan beställning - visa annorlunda
                    if (!harBestallning) {
                      return (
                        <div key={i} style={{ marginBottom: 20, opacity: 0.6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 500 }}>{namn}</span>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>Ej planerat</span>
                          </div>
                          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                            {Math.round(prod).toLocaleString()} m³ {isSkordare ? 'skördat' : 'skotat'}
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={i} style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 500 }}>{namn}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {klarade && <span style={{ fontSize: 14, color }}>✓</span>}
                            <span style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}><CountUp value={proc} duration={800} />%</span>
                          </div>
                        </div>
                        <AnimatedBar procent={proc} color={color} height={6} delay={i * 100} />
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
                          {Math.round(prod).toLocaleString()} <span style={{ color: 'rgba(255,255,255,0.25)' }}>
                            {isSkordare ? 'skördat' : 'skotat'} av {best.toLocaleString()} beställt
                          </span>
                        </div>
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
            <span style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>{Math.round(totalOskotat).toLocaleString()} m³</span>
          </div>
          <div style={{ padding: '0 24px 20px' }}>
            {(() => {
              // Gruppera per månad
              const grupperat = oskotatLista.reduce((acc, obj) => {
                const key = obj.franTidigare ? 'tidigare' : 'denna'
                if (!acc[key]) acc[key] = []
                acc[key].push(obj)
                return acc
              }, {})
              
              const tidigareTotal = (grupperat.tidigare || []).reduce((s, o) => s + (o.oskotat_m3 || 0), 0)
              const dennaTotal = (grupperat.denna || []).reduce((s, o) => s + (o.oskotat_m3 || 0), 0)
              
              return (
                <>
                  {/* Tidigare månader */}
                  {grupperat.tidigare && grupperat.tidigare.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Tidigare</span>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>{Math.round(tidigareTotal).toLocaleString()} m³</span>
                      </div>
                      <div style={{ borderLeft: '2px solid rgba(255,255,255,0.15)', paddingLeft: 16 }}>
                        {grupperat.tidigare.map((obj) => (
                          <div key={obj.objekt_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 15 }}>{obj.object_name}</span>
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{obj.bolag || 'Okänt'}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                              <span style={{ fontSize: 15, fontWeight: 600 }}>{Math.round(obj.oskotat_m3)} m³</span>
                              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{obj.dagar_vantar}d</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Denna månad */}
                  {grupperat.denna && grupperat.denna.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{MANAD[manad]}</span>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>{Math.round(dennaTotal).toLocaleString()} m³</span>
                      </div>
                      <div style={{ borderLeft: '2px solid rgba(255,255,255,0.15)', paddingLeft: 16 }}>
                        {grupperat.denna.map((obj) => (
                          <div key={obj.objekt_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 15 }}>{obj.object_name}</span>
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{obj.bolag || 'Okänt'}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                              <span style={{ fontSize: 15, fontWeight: 600 }}>{Math.round(obj.oskotat_m3)} m³</span>
                              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{obj.dagar_vantar}d</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
