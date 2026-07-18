'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { haversine } from '@/utils/geo'
import { vaderIkon } from './vader'

// ── Tema — samma palett som starta-jobb/förarvyerna ──
const C = {
  bg: '#09090b', card: '#131315', border: 'rgba(255,255,255,0.06)',
  t1: '#fafafa', t2: 'rgba(255,255,255,0.7)', t3: 'rgba(255,255,255,0.45)',
  green: '#22c55e', blue: '#3b82f6', orange: '#ff9f0a', red: '#ff453a',
}
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif"

type Steg = 'maskin' | 'hamta' | 'transport' | 'bekrafta' | 'klart'
type KoordKalla = 'larmkoordinat' | 'objekt' | 'dim_objekt' | 'karta' | 'gps'

interface Maskin {
  maskin_id: string
  visningsnamn: string | null
  modell: string | null
  maskin_typ: string | null
  extramaskin: boolean
}

interface ObjektRad {
  id: string
  namn: string
  vo_nummer: string | null
  dim_objekt_id: string | null
  status: string
  lat: number | null
  lng: number | null
  larmkoordinat_lat: number | null
  larmkoordinat_lng: number | null
  larmkoordinat_bekraftad: boolean
  barighet: string | null
  transport_trailer_in: boolean | null
  transport_kommentar: string | null
}

interface Medarb { id: string; namn: string; hem_lat: number | null; hem_lng: number | null }
interface Pos { lat: number; lng: number; accuracy: number }
interface Destination { lat: number; lng: number; kalla: KoordKalla }

interface PagaendeFlytt {
  id: string
  maskin_id: string
  start_lat: number | null
  start_lng: number | null
  fran_lat: number
  fran_lng: number
  till_objekt_id: string | null
  till_lat: number | null
  till_lng: number | null
  koord_kalla: string | null
  starttid: string
  hamtad_tid: string | null
}

function typLabel(t: string | null): string {
  if (t === 'Harvester') return 'Skördare'
  if (t === 'Forwarder') return 'Skotare'
  return t || ''
}

function maskinNamn(m: Maskin): string {
  return m.visningsnamn || m.modell || m.maskin_id
}

const KALLA_LABEL: Record<KoordKalla, string> = {
  larmkoordinat: 'Larmkoordinat (bekräftad)',
  objekt: 'Objektets position',
  dim_objekt: 'Maskindata',
  karta: 'Vald på karta',
  gps: 'GPS vid lämning',
}

/** En GPS-fix som promise. Avvisar efter 15 s eller vid nekad behörighet. */
function getGps(): Promise<Pos> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('GPS stöds inte i den här webbläsaren'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      e => reject(new Error(e.code === 1 ? 'Platsåtkomst nekad — tillåt i webbläsarens inställningar' : e.message)),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    )
  })
}

/** Körsträcka (och ev. ORS-restid) via /api/routing (cache→ORS→haversine×1.4).
 *  Faller tillbaka på haversine×1.4 lokalt om själva anropet fallerar.
 *  minutes är alltid null när restiden inte kunde fås — aldrig en gissning. */
async function korRutt(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  withDuration = false,
): Promise<{ km: number; minutes: number | null }> {
  try {
    const r = await fetch(`/api/routing?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}${withDuration ? '&withDuration=1' : ''}`)
    if (r.ok) {
      const body = await r.json()
      if (Number.isFinite(body?.km)) {
        return { km: body.km, minutes: Number.isFinite(body?.minutes) ? body.minutes : null }
      }
    }
  } catch { /* fallthrough till lokal fallback */ }
  return { km: Math.round(haversine(from.lat, from.lng, to.lat, to.lng) * 1.4), minutes: null }
}

// ── Skräptidsskydd: orimliga mätben sparas som NULL, aldrig som äkta siffror ──
// Till maskinen: bas→A är normalt < 2 tim; 3 tim = föraren gjorde annat emellan.
// Flytten: A→B med maskin på trailer tar normalt < 3 tim; 6 tim = appen låg öppen.
const MAX_TID_TILL_MASKIN_MIN = 180
const MAX_TID_FLYTT_MIN = 360

function fmtMin(min: number | null): string {
  if (min == null) return '—'
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} tim ${m % 60} min`
}

/** Extern navigering — telefonens kartapp, ingen egen navigation. */
function navUrl(lat: number, lng: number, namn: string): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/iPad|iPhone|iPod/.test(ua)) return `maps://?daddr=${lat},${lng}`
  if (/Android/.test(ua)) return `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(namn)})`
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

/** Väder vid avslut via Open-Meteo. Fel/timeout → null överallt — flytten
 *  sparas alltid, vädret får aldrig blockera. */
async function hamtaVader(lat: number, lng: number): Promise<{ temp: number | null; kod: number | null; nederbord: number | null }> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,precipitation,weather_code`,
      { signal: ctrl.signal },
    )
    clearTimeout(t)
    if (r.ok) {
      const c = (await r.json())?.current
      return {
        temp: Number.isFinite(c?.temperature_2m) ? c.temperature_2m : null,
        kod: Number.isFinite(c?.weather_code) ? c.weather_code : null,
        nederbord: Number.isFinite(c?.precipitation) ? c.precipitation : null,
      }
    }
  } catch { /* väder är bonus — aldrig blockerande */ }
  return { temp: null, kod: null, nederbord: null }
}

const STEG_NR: Record<Steg, number> = { maskin: 1, hamta: 2, transport: 3, bekrafta: 4, klart: 4 }

export default function MaskinflyttClient() {
  const [steg, setSteg] = useState<Steg>('maskin')

  // Grunddata
  const [maskiner, setMaskiner] = useState<Maskin[]>([])
  const [medarb, setMedarb] = useState<Medarb | null>(null)
  const [pagaende, setPagaende] = useState<PagaendeFlytt[]>([])
  const [laddar, setLaddar] = useState(true)
  const [laddFel, setLaddFel] = useState<string | null>(null)
  const [tabellSaknas, setTabellSaknas] = useState(false)

  // Flyttens tillstånd
  const [maskin, setMaskin] = useState<Maskin | null>(null)
  const [flyttId, setFlyttId] = useState<string | null>(null)
  const [startPos, setStartPos] = useState<Pos | null>(null)   // lastbilen vid flödesstart
  const [aPos, setAPos] = useState<Pos | null>(null)           // A: hämtplatsen
  const [valtObjekt, setValtObjekt] = useState<ObjektRad | null>(null)
  const [dest, setDest] = useState<Destination | null>(null)   // B (preliminär tills lämnad)
  const [flodesStart, setFlodesStart] = useState<string | null>(null) // klockan startar vid maskinvalet
  const [hamtadTid, setHamtadTid] = useState<string | null>(null)     // när "Hämta här" trycktes

  // GPS-läge för Hämta-steget
  const [gpsPos, setGpsPos] = useState<Pos | null>(null)
  const [gpsFel, setGpsFel] = useState<string | null>(null)
  const [gpsHamtar, setGpsHamtar] = useState(false)

  // Transport-steget
  const [objektLista, setObjektLista] = useState<ObjektRad[] | null>(null)
  const [objektFel, setObjektFel] = useState<string | null>(null)
  const [sok, setSok] = useState('')
  const [kartaOppen, setKartaOppen] = useState(false)
  const [destHamtar, setDestHamtar] = useState(false)

  // Sparande
  const [sparar, setSparar] = useState(false)
  const [sparFel, setSparFel] = useState<string | null>(null)

  // Resultat (Klart-steget)
  const [resultat, setResultat] = useState<{
    tillkorningKm: number | null; flyttKm: number; hemKm: number | null
    totalKm: number; fakturerbar: boolean; positionSparad: boolean
    tidTillMaskinMin: number | null; tillMaskinOgiltig: boolean
    tidFlyttMin: number | null; flyttOgiltig: boolean
    tidHemMin: number | null
    vaderTemp: number | null; vaderKod: number | null
  } | null>(null)
  const [hembasSparar, setHembasSparar] = useState(false)
  const [hembasFel, setHembasFel] = useState<string | null>(null)

  // ── Grunddata: maskiner, inloggad medarbetare, pågående flytter ──
  useEffect(() => {
    (async () => {
      try {
        const idag = new Date().toISOString().slice(0, 10)
        const [mRes, fRes, { data: { user } }] = await Promise.all([
          supabase.from('dim_maskin')
            .select('maskin_id, visningsnamn, modell, maskin_typ, extramaskin')
            .or(`aktiv_till.is.null,aktiv_till.gte.${idag}`)
            .order('extramaskin').order('maskin_typ'),
          supabase.from('maskin_flytt')
            .select('id, maskin_id, start_lat, start_lng, fran_lat, fran_lng, till_objekt_id, till_lat, till_lng, koord_kalla, starttid, hamtad_tid')
            .is('sluttid', null)
            .order('starttid', { ascending: false }),
          supabase.auth.getUser(),
        ])

        if (mRes.error) { setLaddFel(`Kunde inte läsa maskiner: ${mRes.error.message}`); setLaddar(false); return }
        setMaskiner(mRes.data || [])

        if (fRes.error) {
          // Migrationen inte körd → tabellen saknas. Skilj det från andra fel.
          if (fRes.error.message.includes('maskin_flytt')) setTabellSaknas(true)
          else setLaddFel(`Kunde inte läsa pågående flyttar: ${fRes.error.message}`)
        } else {
          setPagaende(fRes.data || [])
        }

        if (user?.email) {
          const { data } = await supabase.from('medarbetare')
            .select('id, namn, hem_lat, hem_lng').eq('epost', user.email).single()
          if (data) setMedarb(data)
        }
      } catch (e: any) {
        setLaddFel(`Nätverksfel: ${e?.message || String(e)}`)
      }
      setLaddar(false)
    })()
  }, [])

  // ── Objektlistan (aktiva trakter ur objekt-tabellen — dim_objekt är ALDRIG valbar) ──
  const laddaObjekt = useCallback(async () => {
    setObjektFel(null)
    const { data, error } = await supabase.from('objekt')
      .select('id, namn, vo_nummer, dim_objekt_id, status, lat, lng, larmkoordinat_lat, larmkoordinat_lng, larmkoordinat_bekraftad, barighet, transport_trailer_in, transport_kommentar')
      .in('status', ['planerad', 'pagaende'])
      .order('namn')
    if (error) { setObjektFel(`Kunde inte läsa objekt: ${error.message}`); return }
    setObjektLista(data || [])
  }, [])

  useEffect(() => {
    if (steg === 'transport' && objektLista === null) laddaObjekt()
  }, [steg, objektLista, laddaObjekt])

  // ── GPS-fix när Hämta-steget öppnas ──
  const hamtaGps = useCallback(() => {
    setGpsHamtar(true); setGpsFel(null)
    getGps()
      .then(p => { setGpsPos(p); setGpsFel(null) })
      .catch(e => setGpsFel(e.message))
      .finally(() => setGpsHamtar(false))
  }, [])

  useEffect(() => {
    if (steg === 'hamta') hamtaGps()
  }, [steg, hamtaGps])

  // ── Steg 1: välj maskin — klockan startar HÄR (hela kedjan bas→A→B mäts) ──
  function valjMaskin(m: Maskin) {
    setMaskin(m)
    setSparFel(null)
    setFlodesStart(new Date().toISOString())
    getGps().then(setStartPos).catch(() => { /* startpos är valfri — ingen gissning */ })
    setSteg('hamta')
  }

  // ── Steg 2: "Hämta här" → skapa flyttraden (överlever att appen stängs) ──
  async function hamtaHar() {
    if (!maskin || !gpsPos || sparar) return
    setSparar(true); setSparFel(null)
    const nu = new Date().toISOString()
    const { data, error } = await supabase.from('maskin_flytt').insert({
      maskin_id: maskin.maskin_id,
      start_lat: startPos?.lat ?? null,
      start_lng: startPos?.lng ?? null,
      fran_lat: gpsPos.lat,
      fran_lng: gpsPos.lng,
      starttid: flodesStart ?? nu, // flödesstart, inte hämtögonblicket
      hamtad_tid: nu,
      forare: medarb?.namn ?? null,
      medarbetare_id: medarb?.id ?? null,
    }).select('id')
    setSparar(false)
    if (error || !data?.length) {
      setSparFel(`Kunde inte spara flytten: ${error?.message || 'inga rader sparades'}`)
      return
    }
    setFlyttId(data[0].id)
    setAPos(gpsPos)
    setHamtadTid(nu)
    setSteg('transport')
  }

  // ── Steg 3: välj objekt → koordinat via fallback-kedjan ──
  async function valjObjekt(o: ObjektRad) {
    setValtObjekt(o); setSparFel(null); setDestHamtar(true)
    let d: Destination | null = null
    if (o.larmkoordinat_bekraftad && o.larmkoordinat_lat != null && o.larmkoordinat_lng != null) {
      d = { lat: o.larmkoordinat_lat, lng: o.larmkoordinat_lng, kalla: 'larmkoordinat' }
    } else if (o.lat != null && o.lng != null) {
      d = { lat: o.lat, lng: o.lng, kalla: 'objekt' }
    } else {
      // Sista nivån: dim_objekt via exakta nycklar (aldrig LIKE) — objekt_id
      // matchas mot dim_objekt_id om satt, annars vo_nummer; vo_nummer mot vo_nummer.
      const nyckel = o.dim_objekt_id || o.vo_nummer
      if (nyckel) {
        const villkor = [`objekt_id.eq.${nyckel}`]
        if (o.vo_nummer) villkor.push(`vo_nummer.eq.${o.vo_nummer}`)
        const { data } = await supabase.from('dim_objekt')
          .select('latitude, longitude')
          .or(villkor.join(','))
          .not('latitude', 'is', null).not('longitude', 'is', null)
          .limit(1)
        if (data?.length) d = { lat: data[0].latitude, lng: data[0].longitude, kalla: 'dim_objekt' }
      }
    }
    setDestHamtar(false)
    if (d) setDest(d)
    else { setDest(null); setKartaOppen(true) } // saknas allt → peka på karta
  }

  // ── Steg 3 → 4: spara preliminär destination så en avbruten session kan återupptas ──
  async function startaTransport() {
    if (!flyttId || !valtObjekt || !dest || sparar) return
    setSparar(true); setSparFel(null)
    const { data, error } = await supabase.from('maskin_flytt').update({
      till_objekt_id: valtObjekt.id,
      till_lat: dest.lat,
      till_lng: dest.lng,
      koord_kalla: dest.kalla,
    }).eq('id', flyttId).select('id')
    setSparar(false)
    if (error || !data?.length) {
      setSparFel(`Kunde inte spara destinationen: ${error?.message || 'inga rader sparades'}`)
      return
    }
    setSteg('bekrafta')
  }

  // ── Steg 4: "Ja, lämnad här" → sträckor, avslut, maskin_position ──
  async function lamnadHar() {
    if (!flyttId || !maskin || !aPos || !dest || sparar) return
    setSparar(true); setSparFel(null)

    // B = färsk GPS om vi får en bra fix (maskinen står där föraren står),
    // annars den valda destinationskoordinaten.
    let b: Destination = dest
    try {
      const p = await getGps()
      if (p.accuracy <= 150) b = { lat: p.lat, lng: p.lng, kalla: 'gps' }
    } catch { /* behåll vald koordinat */ }

    const [tillkorning, flytt, hem, vader] = await Promise.all([
      startPos ? korRutt(startPos, aPos) : Promise.resolve(null),
      korRutt(aPos, b),
      medarb?.hem_lat != null && medarb?.hem_lng != null
        ? korRutt(b, { lat: medarb.hem_lat, lng: medarb.hem_lng }, true) // restid = ORS-uppskattning
        : Promise.resolve(null), // hembas saknas → ärligt tomt, ingen gissning
      hamtaVader(b.lat, b.lng),
    ])
    const tillkorningKm = tillkorning?.km ?? null
    const flyttKm = flytt.km
    const hemKm = hem?.km ?? null

    const totalKm = (tillkorningKm ?? 0) + flyttKm + (hemKm ?? 0)
    // fakturerbar styrs av ENBART flytt_km — ingen tid, inget annat ben
    const fakturerbar = flyttKm >= 30
    const nu = new Date().toISOString()

    // Mätta tidsben ur tidsstämplarna, med skräptidsskydd: en siffra över
    // gränsen sparas som NULL — hellre ärligt omätt än falskt precist.
    const minMellan = (fran: string | null, till: string) =>
      fran ? Math.round((new Date(till).getTime() - new Date(fran).getTime()) / 60000) : null
    const raTillMaskin = minMellan(flodesStart, hamtadTid ?? nu)
    const raFlytt = minMellan(hamtadTid, nu)
    const tillMaskinOgiltig = raTillMaskin != null && (raTillMaskin < 0 || raTillMaskin > MAX_TID_TILL_MASKIN_MIN)
    const flyttOgiltig = raFlytt != null && (raFlytt < 0 || raFlytt > MAX_TID_FLYTT_MIN)
    const tidTillMaskinMin = tillMaskinOgiltig ? null : raTillMaskin
    const tidFlyttMin = flyttOgiltig ? null : raFlytt
    const tidHemMin = hem?.minutes ?? null // BERÄKNAD (ORS) — summeras aldrig med mätta ben

    const { data, error } = await supabase.from('maskin_flytt').update({
      till_lat: b.lat,
      till_lng: b.lng,
      koord_kalla: b.kalla,
      tillkorning_km: tillkorningKm,
      flytt_km: flyttKm,
      hem_km: hemKm,
      total_km: totalKm,
      fakturerbar,
      tid_till_maskin_min: tidTillMaskinMin,
      tid_flytt_min: tidFlyttMin,
      tid_hem_min: tidHemMin,
      vader_temp_c: vader.temp,
      vader_kod: vader.kod,
      vader_nederbord_mm: vader.nederbord,
      sluttid: nu,
    }).eq('id', flyttId).select('id')

    if (error || !data?.length) {
      setSparar(false)
      setSparFel(`Kunde inte avsluta flytten: ${error?.message || 'inga rader sparades'}`)
      return
    }

    // Maskinens nya position. Blockerar inte flödet — men döljs aldrig heller.
    const posRes = await supabase.from('maskin_position')
      .insert({ maskin_id: maskin.maskin_id, lat: b.lat, lng: b.lng, tidpunkt: nu })
      .select('maskin_id')
    const positionSparad = !posRes.error && (posRes.data?.length ?? 0) > 0

    setSparar(false)
    setPagaende(prev => prev.filter(f => f.id !== flyttId))
    setResultat({
      tillkorningKm, flyttKm, hemKm, totalKm, fakturerbar, positionSparad,
      tidTillMaskinMin, tillMaskinOgiltig, tidFlyttMin, flyttOgiltig, tidHemMin,
      vaderTemp: vader.temp, vaderKod: vader.kod,
    })
    setSteg('klart')
  }

  // ── Hembas saknas → spara nuvarande plats på egen medarbetare-rad ──
  async function sattHembas() {
    if (!medarb || hembasSparar) return
    setHembasSparar(true); setHembasFel(null)
    try {
      const p = await getGps()
      const { data, error } = await supabase.from('medarbetare')
        .update({ hem_lat: p.lat, hem_lng: p.lng })
        .eq('id', medarb.id).select('id')
      if (error || !data?.length) throw new Error(error?.message || 'inga rader sparades')
      setMedarb({ ...medarb, hem_lat: p.lat, hem_lng: p.lng })
      // Räkna hem-benet för flytten som just avslutats, nu när hembasen finns
      if (flyttId && resultat && dest) {
        const hem = await korRutt({ lat: dest.lat, lng: dest.lng }, { lat: p.lat, lng: p.lng }, true)
        const totalKm = (resultat.tillkorningKm ?? 0) + resultat.flyttKm + hem.km
        const { data: d2, error: e2 } = await supabase.from('maskin_flytt')
          .update({ hem_km: hem.km, tid_hem_min: hem.minutes, total_km: totalKm })
          .eq('id', flyttId).select('id')
        if (!e2 && d2?.length) {
          setResultat({ ...resultat, hemKm: hem.km, tidHemMin: hem.minutes, totalKm })
        }
      }
    } catch (e: any) {
      setHembasFel(`Kunde inte spara hembas: ${e?.message || String(e)}`)
    }
    setHembasSparar(false)
  }

  // ── Banner: fortsätt/avbryt pågående flytt ──
  function fortsattFlytt(f: PagaendeFlytt) {
    const m = maskiner.find(x => x.maskin_id === f.maskin_id)
    if (!m) return
    setMaskin(m)
    setFlyttId(f.id)
    setStartPos(f.start_lat != null && f.start_lng != null ? { lat: f.start_lat, lng: f.start_lng, accuracy: 0 } : null)
    setAPos({ lat: f.fran_lat, lng: f.fran_lng, accuracy: 0 })
    setFlodesStart(f.starttid)
    setHamtadTid(f.hamtad_tid)
    setSparFel(null)
    if (f.till_objekt_id && f.till_lat != null && f.till_lng != null) {
      setDest({ lat: f.till_lat, lng: f.till_lng, kalla: (f.koord_kalla as KoordKalla) || 'objekt' })
      // Objektnamnet hämtas för sammanfattningen
      supabase.from('objekt')
        .select('id, namn, vo_nummer, dim_objekt_id, status, lat, lng, larmkoordinat_lat, larmkoordinat_lng, larmkoordinat_bekraftad, barighet, transport_trailer_in, transport_kommentar')
        .eq('id', f.till_objekt_id).single()
        .then(({ data }) => { if (data) setValtObjekt(data) })
      setSteg('bekrafta')
    } else {
      setSteg('transport')
    }
  }

  async function avbrytFlytt(f: PagaendeFlytt) {
    setSparFel(null)
    const { data, error } = await supabase.from('maskin_flytt')
      .update({ sluttid: new Date().toISOString(), avbruten: true })
      .eq('id', f.id).select('id')
    if (error || !data?.length) {
      setSparFel(`Kunde inte avbryta flytten: ${error?.message || 'inga rader sparades'}`)
      return
    }
    setPagaende(prev => prev.filter(x => x.id !== f.id))
  }

  function nyFlytt() {
    setMaskin(null); setFlyttId(null); setStartPos(null); setAPos(null)
    setValtObjekt(null); setDest(null); setGpsPos(null); setGpsFel(null)
    setResultat(null); setSparFel(null); setSok('')
    setFlodesStart(null); setHamtadTid(null); setHembasFel(null)
    setSteg('maskin')
    // Läs om pågående så bannern stämmer
    supabase.from('maskin_flytt')
      .select('id, maskin_id, start_lat, start_lng, fran_lat, fran_lng, till_objekt_id, till_lat, till_lng, koord_kalla, starttid, hamtad_tid')
      .is('sluttid', null).order('starttid', { ascending: false })
      .then(({ data }) => { if (data) setPagaende(data) })
  }

  const filtreradeObjekt = useMemo(() => {
    if (!objektLista) return []
    if (!sok.trim()) return objektLista
    const t = sok.toLowerCase()
    return objektLista.filter(o =>
      o.namn.toLowerCase().includes(t) || (o.vo_nummer || '').toLowerCase().includes(t))
  }, [objektLista, sok])

  function tillbaka() {
    setSparFel(null)
    if (steg === 'hamta') { setMaskin(null); setSteg('maskin') }
    else if (steg === 'transport') setSteg('hamta')
    else if (steg === 'bekrafta') setSteg('transport')
  }

  // Mellansteg har egen bakåtpil → dölj TopBar:s hemknapp (appens mönster,
  // se components/TopBar.tsx data-hide-home)
  const harBakat = steg === 'hamta' || steg === 'transport' || steg === 'bekrafta'
  useEffect(() => {
    if (harBakat) document.body.setAttribute('data-hide-home', '1')
    else document.body.removeAttribute('data-hide-home')
    return () => document.body.removeAttribute('data-hide-home')
  }, [harBakat])

  // ─────────────────────────── Render ───────────────────────────

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg, fontFamily: ff,
      WebkitFontSmoothing: 'antialiased', color: C.t1,
    }}>
      <style>{`.material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }`}</style>

      <main style={{ maxWidth: 500, margin: '0 auto', padding: '12px 16px calc(48px + env(safe-area-inset-bottom))' }}>

        {/* Bakåtpil + stegindikator (TopBar:n ger titel + hemknapp) */}
        <div style={{ display: 'flex', alignItems: 'center', minHeight: 32, marginBottom: 8 }}>
          {harBakat && (
            <button onClick={tillbaka} aria-label="Tillbaka" style={{
              background: 'none', border: 'none', color: C.t2, padding: '4px 8px 4px 0',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: ff, fontSize: 14,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
              Tillbaka
            </button>
          )}
          <div style={{ flex: 1 }} />
          {steg !== 'klart' && (
            <div style={{ fontSize: 12, color: C.t3, fontWeight: 600 }}>Steg {STEG_NR[steg]} av 4</div>
          )}
        </div>

        {sparFel && (
          <div style={{
            background: 'rgba(255,69,58,0.12)', border: `1px solid rgba(255,69,58,0.4)`,
            borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 14, color: C.t1,
          }}>{sparFel}</div>
        )}

        {/* ── Steg 1: Välj maskin ── */}
        {steg === 'maskin' && (
          <>
            {laddar && <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Laddar maskiner …</div>}
            {laddFel && !laddar && (
              <div style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.4)', borderRadius: 12, padding: 14, fontSize: 14 }}>
                {laddFel}
              </div>
            )}
            {tabellSaknas && !laddar && (
              <div style={{ background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.4)', borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 14 }}>
                Tabellen <code>maskin_flytt</code> finns inte ännu — migrationen är inte körd. Flyttar kan inte sparas förrän den är på plats.
              </div>
            )}

            {/* Pågående flytt-banner */}
            {!laddar && pagaende.map(f => {
              const m = maskiner.find(x => x.maskin_id === f.maskin_id)
              const start = new Date(f.starttid)
              return (
                <div key={f.id} style={{
                  background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.4)',
                  borderRadius: 14, padding: 14, marginBottom: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.orange }}>delivery_truck_speed</span>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      Flytt pågår: {m ? maskinNamn(m) : f.maskin_id}
                      <span style={{ color: C.t3, fontWeight: 400 }}> — startad {start.toLocaleString('sv-SE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => fortsattFlytt(f)} disabled={!m} style={{
                      flex: 1, background: C.orange, color: '#000', border: 'none', borderRadius: 10,
                      padding: '10px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: ff, opacity: m ? 1 : 0.5,
                    }}>Fortsätt</button>
                    <button onClick={() => avbrytFlytt(f)} style={{
                      flex: 1, background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, borderRadius: 10,
                      padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: ff,
                    }}>Avbryt flytt</button>
                  </div>
                </div>
              )
            })}

            {!laddar && !laddFel && (
              <>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>Vilken maskin flyttas?</h2>
                <p style={{ fontSize: 14, color: C.t3, margin: '0 0 16px' }}>Aktiva maskiner ur maskinregistret.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {maskiner.map(m => (
                    <button key={m.maskin_id} onClick={() => valjMaskin(m)} style={{
                      display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
                      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
                      padding: '16px 16px', cursor: 'pointer', fontFamily: ff, color: C.t1, width: '100%',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 26, color: m.maskin_typ === 'Harvester' ? C.green : C.blue }}>
                        {m.maskin_typ === 'Harvester' ? 'forest' : 'local_shipping'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {maskinNamn(m)}
                          {m.extramaskin && (
                            <span style={{
                              fontSize: 11, fontWeight: 700, color: C.orange, border: `1px solid ${C.orange}`,
                              borderRadius: 6, padding: '1px 6px',
                            }}>Extra</span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>{typLabel(m.maskin_typ)}</div>
                      </div>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.t3 }}>chevron_right</span>
                    </button>
                  ))}
                  {maskiner.length === 0 && (
                    <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Inga aktiva maskiner i registret.</div>
                  )}
                </div>

                {/* Sammanställningen — huvudvägen är startsidans ruta, detta är genvägen */}
                <Link href="/maskinflytt/sammanstallning" style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginTop: 20,
                  color: C.t3, fontSize: 14, fontWeight: 600, textDecoration: 'none', fontFamily: ff,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>list_alt</span>
                  Flyttlogg och sammanställning
                  <span className="material-symbols-outlined" style={{ fontSize: 18, marginLeft: 'auto' }}>chevron_right</span>
                </Link>
              </>
            )}
          </>
        )}

        {/* ── Steg 2: Hämta (A via telefonens GPS) ── */}
        {steg === 'hamta' && maskin && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>Hämta {maskinNamn(maskin)}</h2>
            <p style={{ fontSize: 14, color: C.t3, margin: '0 0 20px' }}>
              Ställ dig vid maskinen och tryck på knappen — hämtplatsen tas från telefonens GPS.
            </p>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{
                  fontSize: 22,
                  color: gpsPos ? C.green : gpsFel ? C.red : C.t3,
                }}>my_location</span>
                <div style={{ flex: 1, fontSize: 14 }}>
                  {gpsHamtar && <span style={{ color: C.t3 }}>Hämtar GPS-position …</span>}
                  {!gpsHamtar && gpsPos && (
                    <span>
                      Position hittad <span style={{ color: C.t3 }}>(±{Math.round(gpsPos.accuracy)} m)</span>
                    </span>
                  )}
                  {!gpsHamtar && !gpsPos && gpsFel && <span style={{ color: C.red }}>{gpsFel}</span>}
                </div>
                {!gpsHamtar && (
                  <button onClick={hamtaGps} style={{
                    background: 'transparent', color: C.blue, border: 'none', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: ff, padding: 4,
                  }}>{gpsPos ? 'Uppdatera' : 'Försök igen'}</button>
                )}
              </div>
            </div>

            <button onClick={hamtaHar} disabled={!gpsPos || sparar || tabellSaknas} style={{
              width: '100%', background: C.green, color: '#000', border: 'none', borderRadius: 16,
              padding: '20px 0', fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: ff,
              opacity: !gpsPos || sparar || tabellSaknas ? 0.4 : 1,
            }}>
              {sparar ? 'Sparar …' : 'Hämta här'}
            </button>
            {tabellSaknas && (
              <p style={{ fontSize: 13, color: C.orange, marginTop: 10, textAlign: 'center' }}>
                Kan inte spara — maskin_flytt-tabellen saknas (migration ej körd).
              </p>
            )}
          </>
        )}

        {/* ── Steg 3: Transport — vart ska maskinen? ── */}
        {steg === 'transport' && maskin && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>Vart ska {maskinNamn(maskin)}?</h2>
            <p style={{ fontSize: 14, color: C.t3, margin: '0 0 16px' }}>Välj trakten maskinen lämnas på.</p>

            {!valtObjekt && (
              <>
                <input
                  value={sok} onChange={e => setSok(e.target.value)} placeholder="Sök objekt …"
                  style={{
                    width: '100%', boxSizing: 'border-box', background: C.card, border: `1px solid ${C.border}`,
                    borderRadius: 12, padding: '12px 14px', fontSize: 15, color: C.t1, fontFamily: ff,
                    marginBottom: 12, outline: 'none',
                  }}
                />
                {objektLista === null && !objektFel && (
                  <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Laddar objekt …</div>
                )}
                {objektFel && (
                  <div style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.4)', borderRadius: 12, padding: 14, fontSize: 14 }}>
                    {objektFel}
                    <button onClick={laddaObjekt} style={{
                      display: 'block', marginTop: 8, background: 'transparent', color: C.blue, border: 'none',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: ff, padding: 0,
                    }}>Försök igen</button>
                  </div>
                )}
                {objektLista !== null && !objektFel && filtreradeObjekt.length === 0 && (
                  <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>
                    {sok.trim() ? 'Inga objekt matchar sökningen.' : 'Inga aktiva objekt (planerad/pågående) finns.'}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filtreradeObjekt.map(o => (
                    <button key={o.id} onClick={() => valjObjekt(o)} style={{
                      display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                      padding: '14px 14px', cursor: 'pointer', fontFamily: ff, color: C.t1, width: '100%',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{o.namn}</div>
                        <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
                          {o.vo_nummer || '—'} · {o.status === 'pagaende' ? 'Pågående' : 'Planerad'}
                        </div>
                      </div>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.t3 }}>chevron_right</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {valtObjekt && destHamtar && (
              <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Hämtar koordinat …</div>
            )}

            {valtObjekt && !destHamtar && dest && (
              <div>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{valtObjekt.namn}</div>
                  <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>{valtObjekt.vo_nummer || '—'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.blue }}>location_on</span>
                    <span style={{ fontSize: 13, color: C.t2 }}>{dest.lat.toFixed(5)}, {dest.lng.toFixed(5)}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: C.blue, border: `1px solid rgba(59,130,246,0.5)`,
                      borderRadius: 6, padding: '1px 6px',
                    }}>{KALLA_LABEL[dest.kalla]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                    <button onClick={() => { setValtObjekt(null); setDest(null) }} style={{
                      background: 'transparent', color: C.t2, border: 'none', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', fontFamily: ff, padding: 0,
                    }}>Byt objekt</button>
                    <button onClick={() => setKartaOppen(true)} style={{
                      background: 'transparent', color: C.blue, border: 'none', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', fontFamily: ff, padding: 0,
                    }}>Justera på karta</button>
                  </div>
                </div>

                {/* Före avfärd: det föraren behöver veta om trakten — visas
                    bara när datan finns, ingen tom ruta */}
                {(valtObjekt.barighet || valtObjekt.transport_kommentar || valtObjekt.transport_trailer_in != null) && (
                  <div style={{
                    background: 'rgba(255,159,10,0.10)', border: '1px solid rgba(255,159,10,0.35)',
                    borderRadius: 12, padding: '12px 14px', marginBottom: 16,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.orange }}>warning</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>Före avfärd</span>
                    </div>
                    {valtObjekt.transport_kommentar && (
                      <div style={{ fontSize: 14, marginBottom: 6 }}>{valtObjekt.transport_kommentar}</div>
                    )}
                    <div style={{ display: 'flex', gap: 14, fontSize: 13, color: C.t2, flexWrap: 'wrap' }}>
                      {valtObjekt.barighet && <span>Bärighet: <b style={{ color: C.t1 }}>{valtObjekt.barighet}</b></span>}
                      {valtObjekt.transport_trailer_in != null && (
                        <span>Trailer ända in: <b style={{ color: valtObjekt.transport_trailer_in ? C.t1 : C.orange }}>
                          {valtObjekt.transport_trailer_in ? 'Ja' : 'Nej'}</b></span>
                      )}
                    </div>
                  </div>
                )}

                <a
                  href={navUrl(dest.lat, dest.lng, valtObjekt.namn)}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    width: '100%', boxSizing: 'border-box', background: C.card, color: C.t1,
                    border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 0',
                    fontSize: 16, fontWeight: 700, fontFamily: ff, textDecoration: 'none', marginBottom: 10,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: C.blue }}>near_me</span>
                  Navigera dit
                </a>
                <button onClick={startaTransport} disabled={sparar} style={{
                  width: '100%', background: C.blue, color: '#fff', border: 'none', borderRadius: 16,
                  padding: '20px 0', fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: ff,
                  opacity: sparar ? 0.4 : 1,
                }}>
                  {sparar ? 'Sparar …' : 'Starta transport'}
                </button>
              </div>
            )}

            {valtObjekt && !destHamtar && !dest && !kartaOppen && (
              <div style={{ background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.4)', borderRadius: 12, padding: 14, fontSize: 14 }}>
                {valtObjekt.namn} saknar koordinat i alla källor.
                <button onClick={() => setKartaOppen(true)} style={{
                  display: 'block', marginTop: 8, background: 'transparent', color: C.blue, border: 'none',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: ff, padding: 0,
                }}>Peka ut platsen på kartan</button>
              </div>
            )}
          </>
        )}

        {/* ── Steg 4: Bekräfta lämnad ── */}
        {steg === 'bekrafta' && maskin && dest && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>Transport pågår</h2>
            <p style={{ fontSize: 14, color: C.t3, margin: '0 0 20px' }}>
              Tryck när {maskinNamn(maskin)} står avlastad på plats.
            </p>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: C.t3 }}>Destination</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{valtObjekt?.namn || 'Vald plats'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.blue }}>location_on</span>
                <span style={{ fontSize: 13, color: C.t2 }}>{dest.lat.toFixed(5)}, {dest.lng.toFixed(5)}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: C.blue, border: '1px solid rgba(59,130,246,0.5)',
                  borderRadius: 6, padding: '1px 6px',
                }}>{KALLA_LABEL[dest.kalla]}</span>
              </div>
              <a
                href={navUrl(dest.lat, dest.lng, valtObjekt?.namn || 'Destination')}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12,
                  color: C.blue, fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: ff,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>near_me</span>
                Navigera dit
              </a>
            </div>

            <button onClick={lamnadHar} disabled={sparar} style={{
              width: '100%', background: C.green, color: '#000', border: 'none', borderRadius: 16,
              padding: '20px 0', fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: ff,
              opacity: sparar ? 0.4 : 1,
            }}>
              {sparar ? 'Sparar …' : 'Ja, lämnad här'}
            </button>
            <p style={{ fontSize: 13, color: C.t3, marginTop: 10, textAlign: 'center' }}>
              Positionen finjusteras med telefonens GPS om möjligt.
            </p>
          </>
        )}

        {/* ── Steg 5: Klart ── */}
        {steg === 'klart' && maskin && resultat && (
          <>
            <div style={{ textAlign: 'center', margin: '12px 0 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 56, color: C.green }}>check_circle</span>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 0' }}>Flytt klar</h2>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
              {[
                ['Maskin', maskinNamn(maskin)],
                ['Till objekt', valtObjekt?.namn || '—'],
                ['Tillkörning (till hämtplats)',
                  `${resultat.tillkorningKm != null ? `${resultat.tillkorningKm} km` : '—'}${
                    resultat.tillMaskinOgiltig ? ' · tid ej sparad (över 3 tim)' :
                    resultat.tidTillMaskinMin != null ? ` · ${fmtMin(resultat.tidTillMaskinMin)}` : ''}`],
                ['Flyttsträcka (A → B)',
                  `${resultat.flyttKm} km${
                    resultat.flyttOgiltig ? ' · tid ej sparad (över 6 tim)' :
                    resultat.tidFlyttMin != null ? ` · ${fmtMin(resultat.tidFlyttMin)}` : ''}`],
                ['Hemresa (beräknad)', resultat.hemKm != null
                  ? `${resultat.hemKm} km${resultat.tidHemMin != null ? ` · ~${fmtMin(resultat.tidHemMin)}` : ''}`
                  : 'hembas saknas'],
                ['Total körsträcka', `${resultat.totalKm} km`],
                ['Total tid (mätt)', fmtMin(
                  resultat.tidTillMaskinMin != null || resultat.tidFlyttMin != null
                    ? (resultat.tidTillMaskinMin ?? 0) + (resultat.tidFlyttMin ?? 0)
                    : null)],
                ...(resultat.vaderTemp != null
                  ? [['Väder vid lämning', `${vaderIkon(resultat.vaderKod)} ${Math.round(resultat.vaderTemp)}°C`]]
                  : []),
              ].map(([label, varde]) => (
                <div key={label as string} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0',
                  borderBottom: `1px solid ${C.border}`, fontSize: 14,
                }}>
                  <span style={{ color: C.t3 }}>{label}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right' }}>{varde}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0 3px', fontSize: 14, alignItems: 'center' }}>
                <span style={{ color: C.t3 }}>Fakturerbar</span>
                <span style={{
                  fontSize: 13, fontWeight: 800, borderRadius: 8, padding: '3px 10px',
                  background: resultat.fakturerbar ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                  color: resultat.fakturerbar ? C.green : C.t3,
                }}>
                  {resultat.fakturerbar ? 'JA — ≥ 3 mil' : 'Nej — under 3 mil'}
                </span>
              </div>
            </div>

            {resultat.hemKm == null && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13 }}>
                {medarb ? (
                  <>
                    Hemresan kan inte räknas utan hembas.
                    <button onClick={sattHembas} disabled={hembasSparar} style={{
                      display: 'block', marginTop: 8, background: 'transparent', color: C.blue, border: 'none',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: ff, padding: 0,
                      opacity: hembasSparar ? 0.5 : 1,
                    }}>{hembasSparar ? 'Sparar …' : 'Sätt hembas till min nuvarande plats'}</button>
                    {hembasFel && <div style={{ color: C.red, marginTop: 6 }}>{hembasFel}</div>}
                  </>
                ) : (
                  <>Hemresan kan inte räknas — inloggningen saknar medarbetarkoppling.</>
                )}
              </div>
            )}

            {!resultat.positionSparad && (
              <div style={{ background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.4)', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13 }}>
                Flytten sparades, men maskinens position kunde inte skrivas till maskin_position.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={nyFlytt} style={{
                flex: 1, background: C.card, color: C.t1, border: `1px solid ${C.border}`, borderRadius: 12,
                padding: '14px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: ff,
              }}>Ny flytt</button>
              <Link href="/" style={{ flex: 1, textDecoration: 'none' }}>
                <span style={{
                  display: 'block', background: C.blue, color: '#fff', borderRadius: 12, textAlign: 'center',
                  padding: '14px 0', fontSize: 15, fontWeight: 700, fontFamily: ff,
                }}>Till startsidan</span>
              </Link>
            </div>
          </>
        )}
      </main>

      {kartaOppen && (
        <KartPicker
          start={dest ? { lat: dest.lat, lng: dest.lng } : aPos ? { lat: aPos.lat, lng: aPos.lng } : { lat: 56.5, lng: 14.7 }}
          onValj={(lat, lng) => { setDest({ lat, lng, kalla: 'karta' }); setKartaOppen(false) }}
          onStang={() => setKartaOppen(false)}
        />
      )}
    </div>
  )
}

// ── Fullskärms kartväljare: tryck på kartan → markör → bekräfta ──
function KartPicker({ start, onValj, onStang }: {
  start: { lat: number; lng: number }
  onValj: (lat: number, lng: number) => void
  onStang: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [vald, setVald] = useState<{ lat: number; lng: number } | null>(null)
  const valdRef = useRef(vald)
  valdRef.current = vald

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    if (!document.getElementById('maplibre-css-flytt')) {
      const link = document.createElement('link')
      link.id = 'maplibre-css-flytt'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/maplibre-gl@5.18.0/dist/maplibre-gl.css'
      document.head.appendChild(link)
    }

    import('maplibre-gl').then(mlbre => {
      if (cancelled || !containerRef.current) return
      const map = new mlbre.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            sat: {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256,
              attribution: 'Esri World Imagery',
            },
          },
          layers: [{ id: 'sat-layer', type: 'raster', source: 'sat' }],
        },
        center: [start.lng, start.lat],
        zoom: 12,
      })
      mapRef.current = map
      const marker = new mlbre.Marker({ color: '#ff9f0a' })
      map.on('click', (e: any) => {
        marker.setLngLat(e.lngLat).addTo(map)
        setVald({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      })
    })
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [start.lat, start.lng])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: C.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: 'calc(10px + env(safe-area-inset-top)) 16px 10px',
        display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.border}`,
      }}>
        <button onClick={onStang} aria-label="Stäng" style={{ background: 'none', border: 'none', color: C.t2, padding: 6, cursor: 'pointer', display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>close</span>
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.t1, fontFamily: ff }}>Peka ut platsen</div>
      </div>
      <div ref={containerRef} style={{ flex: 1 }} />
      <div style={{ padding: '12px 16px calc(16px + env(safe-area-inset-bottom))' }}>
        <button
          onClick={() => { if (valdRef.current) onValj(valdRef.current.lat, valdRef.current.lng) }}
          disabled={!vald}
          style={{
            width: '100%', background: C.orange, color: '#000', border: 'none', borderRadius: 14,
            padding: '16px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: ff,
            opacity: vald ? 1 : 0.4,
          }}
        >
          {vald ? `Använd denna punkt (${vald.lat.toFixed(5)}, ${vald.lng.toFixed(5)})` : 'Tryck på kartan för att välja punkt'}
        </button>
      </div>
    </div>
  )
}
