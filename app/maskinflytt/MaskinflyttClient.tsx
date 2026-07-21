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

// Dagmodellen: en flyttdag (hemifrån → n flyttar → hem) äger tillkörning och
// hemresa; varje flytt äger flytt_km (fakturerbar-styrande) och mellankörning
// (tomkörning från förra flyttens slutpunkt). Mätt och beräknat blandas aldrig.
type Steg = 'maskin' | 'franObjekt' | 'hamta' | 'transport' | 'bekrafta' | 'klart' | 'dagKlart'
type KoordKalla = 'larmkoordinat' | 'objekt' | 'dim_objekt' | 'karta' | 'gps' | 'flyttplats'
type FlyttTyp = 'produktion' | 'service' | 'kunduppdrag' | 'annat'
type PlatsTyp = 'verkstad' | 'uppstallning' | 'gard' | 'kund' | 'annat'

interface Flyttplats {
  id: string
  namn: string
  typ: PlatsTyp
  lat: number | null
  lng: number | null
  aktiv: boolean
}

export const PLATS_TYP_LABEL: Record<PlatsTyp, string> = {
  verkstad: 'Verkstad', uppstallning: 'Uppställning', gard: 'Gård', kund: 'Kund', annat: 'Annat',
}

const FLYTT_TYP_LABEL: Record<FlyttTyp, string> = {
  produktion: 'Produktion', service: 'Service', kunduppdrag: 'Kunduppdrag', annat: 'Annat',
}

/** ENDA stället fakturerbar-regeln finns (DB-constraints vaktar värdena):
 *  produktion = km-gränsen, service = aldrig (egen kostnad),
 *  kunduppdrag = alltid (vi kör åt någon annan), annat = aldrig automatiskt. */
function beraknaFakturerbar(typ: FlyttTyp, flyttKm: number): boolean {
  if (typ === 'produktion') return flyttKm >= 30
  if (typ === 'kunduppdrag') return true
  return false
}

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

interface Flyttdag {
  id: string
  starttid: string
  start_lat: number | null
  start_lng: number | null
  start_kalla: string | null
  tillkorning_km: number | null
}

interface PagaendeFlytt {
  id: string
  maskin_id: string | null
  extern_maskin: string | null
  flytt_typ: string | null
  kund: string | null
  fran_plats_id: string | null
  till_plats_id: string | null
  flyttdag_id: string | null
  fran_lat: number
  fran_lng: number
  till_objekt_id: string | null
  till_lat: number | null
  till_lng: number | null
  koord_kalla: string | null
  starttid: string
  hamtad_tid: string | null
  mellankorning_km: number | null
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
  flyttplats: 'Flyttplats',
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
const MAX_TID_TILL_MASKIN_MIN = 180  // bas→A över 3 tim = föraren gjorde annat
const MAX_TID_FLYTT_MIN = 360        // A→B över 6 tim = appen låg öppen
const MAX_DAG_MIN = 960              // dag över 16 tim = aldrig avslutad på riktigt

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

/** Väder vid avslut via Open-Meteo. Fel/timeout → null överallt. */
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

/** Objektets koordinat via fallback-kedjan: larmkoordinat (bekräftad) →
 *  objekt.lat/lng → dim_objekt (exakta nycklar, aldrig LIKE). null = saknas helt. */
async function objektKoordinat(o: ObjektRad): Promise<Destination | null> {
  if (o.larmkoordinat_bekraftad && o.larmkoordinat_lat != null && o.larmkoordinat_lng != null) {
    return { lat: o.larmkoordinat_lat, lng: o.larmkoordinat_lng, kalla: 'larmkoordinat' }
  }
  if (o.lat != null && o.lng != null) {
    return { lat: o.lat, lng: o.lng, kalla: 'objekt' }
  }
  const nyckel = o.dim_objekt_id || o.vo_nummer
  if (nyckel) {
    const villkor = [`objekt_id.eq.${nyckel}`]
    if (o.vo_nummer) villkor.push(`vo_nummer.eq.${o.vo_nummer}`)
    const { data } = await supabase.from('dim_objekt')
      .select('latitude, longitude')
      .or(villkor.join(','))
      .not('latitude', 'is', null).not('longitude', 'is', null)
      .limit(1)
    if (data?.length) return { lat: data[0].latitude, lng: data[0].longitude, kalla: 'dim_objekt' }
  }
  return null
}

const OBJEKT_FALT = 'id, namn, vo_nummer, dim_objekt_id, status, lat, lng, larmkoordinat_lat, larmkoordinat_lng, larmkoordinat_bekraftad, barighet, transport_trailer_in, transport_kommentar'
const FLYTT_FALT = 'id, maskin_id, extern_maskin, flytt_typ, kund, flyttdag_id, fran_lat, fran_lng, till_objekt_id, till_lat, till_lng, fran_plats_id, till_plats_id, koord_kalla, starttid, hamtad_tid, mellankorning_km'

const STEG_NR: Record<Steg, number> = { maskin: 1, franObjekt: 2, hamta: 3, transport: 4, bekrafta: 5, klart: 5, dagKlart: 5 }

export default function MaskinflyttClient() {
  const [steg, setSteg] = useState<Steg>('maskin')

  // Grunddata
  const [maskiner, setMaskiner] = useState<Maskin[]>([])
  const [medarb, setMedarb] = useState<Medarb | null>(null)
  const [pagaende, setPagaende] = useState<PagaendeFlytt[]>([])
  const [laddar, setLaddar] = useState(true)
  const [laddFel, setLaddFel] = useState<string | null>(null)
  const [tabellSaknas, setTabellSaknas] = useState<string | null>(null)

  // Dagen
  const [dag, setDag] = useState<Flyttdag | null>(null)
  const dagRef = useRef<Flyttdag | null>(null)
  dagRef.current = dag
  const [dagFlyttAntal, setDagFlyttAntal] = useState(0)
  const [forraB, setForraB] = useState<{ lat: number; lng: number } | null>(null) // senaste flyttens slutpunkt
  const [dagNotis, setDagNotis] = useState<string | null>(null)

  // Flyttens tillstånd
  const [maskin, setMaskin] = useState<Maskin | null>(null)
  const [externMaskin, setExternMaskin] = useState<string | null>(null) // främmande maskin (fritext)
  const [externFalt, setExternFalt] = useState(false)                    // visar inline-fältet på steg 1
  const [externNamn, setExternNamn] = useState('')
  const [flyttplatser, setFlyttplatser] = useState<Flyttplats[]>([])
  const [franPlats, setFranPlats] = useState<Flyttplats | null>(null)
  const [tillPlats, setTillPlats] = useState<Flyttplats | null>(null)
  const [flyttTyp, setFlyttTyp] = useState<FlyttTyp>('produktion')
  const [kund, setKund] = useState('')
  const [nyPlatsFor, setNyPlatsFor] = useState<'fran' | 'till' | null>(null)
  const [flyttId, setFlyttId] = useState<string | null>(null)
  const [startPos, setStartPos] = useState<Pos | null>(null)   // GPS vid maskinvalet (dagstart-fallback)
  const [aPos, setAPos] = useState<Pos | null>(null)           // A: hämtplatsen
  const [franObjekt, setFranObjekt] = useState<ObjektRad | null>(null)
  const [valtObjekt, setValtObjekt] = useState<ObjektRad | null>(null)
  const [dest, setDest] = useState<Destination | null>(null)   // B (preliminär tills lämnad)
  const [flodesStart, setFlodesStart] = useState<string | null>(null)
  const [hamtadTid, setHamtadTid] = useState<string | null>(null)

  // Navigering till maskinen (Hämta-steget)
  const [navMaskin, setNavMaskin] = useState<{ lat: number; lng: number; etikett: string } | null>(null)

  // GPS-läge för Hämta-steget
  const [gpsPos, setGpsPos] = useState<Pos | null>(null)
  const [gpsFel, setGpsFel] = useState<string | null>(null)
  const [gpsHamtar, setGpsHamtar] = useState(false)

  // Objektlistor (delas av franObjekt- och transport-stegen)
  const [objektLista, setObjektLista] = useState<ObjektRad[] | null>(null)
  const [objektFel, setObjektFel] = useState<string | null>(null)
  const [sok, setSok] = useState('')
  const [kartaOppen, setKartaOppen] = useState(false)
  const [destHamtar, setDestHamtar] = useState(false)

  // Sparande
  const [sparar, setSparar] = useState(false)
  const [sparFel, setSparFel] = useState<string | null>(null)

  // Resultat (Klart-steget — per flytt; dagens ben ligger på dagKlart)
  const [resultat, setResultat] = useState<{
    flyttKm: number; mellankorningKm: number | null; fakturerbar: boolean; positionSparad: boolean
    typ: FlyttTyp; kundNamn: string | null
    tidTillMaskinMin: number | null; tillMaskinOgiltig: boolean
    tidFlyttMin: number | null; flyttOgiltig: boolean
    vaderTemp: number | null; vaderKod: number | null
  } | null>(null)

  // Resultat (dagKlart)
  const [dagResultat, setDagResultat] = useState<{
    antalFlyttar: number; tillkorningKm: number | null
    flyttKmSumma: number; mellankorningKmSumma: number
    hemKm: number | null; tidHemMin: number | null
    totalKm: number; totalTidMin: number | null; dagOgiltig: boolean
  } | null>(null)
  const [hembasSparar, setHembasSparar] = useState(false)
  const [hembasFel, setHembasFel] = useState<string | null>(null)

  // ── Grunddata ──
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
            .select(FLYTT_FALT)
            .is('sluttid', null)
            .order('starttid', { ascending: false }),
          supabase.auth.getUser(),
        ])

        if (mRes.error) { setLaddFel(`Kunde inte läsa maskiner: ${mRes.error.message}`); setLaddar(false); return }
        setMaskiner(mRes.data || [])

        supabase.from('flyttplats')
          .select('id, namn, typ, lat, lng, aktiv')
          .eq('aktiv', true).order('namn')
          .then(({ data }) => { if (data) setFlyttplatser(data as Flyttplats[]) })

        if (fRes.error) {
          if (/maskin_flytt|mellankorning|flyttdag/.test(fRes.error.message)) setTabellSaknas(fRes.error.message)
          else setLaddFel(`Kunde inte läsa pågående flyttar: ${fRes.error.message}`)
        } else {
          setPagaende(fRes.data || [])
        }

        let m: Medarb | null = null
        if (user?.email) {
          const { data } = await supabase.from('medarbetare')
            .select('id, namn, hem_lat, hem_lng').eq('epost', user.email).single()
          if (data) { m = data; setMedarb(data) }
        }
        await laddaDag(m)
      } catch (e: any) {
        setLaddFel(`Nätverksfel: ${e?.message || String(e)}`)
      }
      setLaddar(false)
    })()
  }, [])

  /** Hämta pågående flyttdag. En dag från ett tidigare dygn auto-stängs —
   *  nästa dags flytt får aldrig hamna i gårdagens dag. */
  async function laddaDag(m: Medarb | null) {
    const bas = supabase.from('flyttdag')
      .select('id, starttid, start_lat, start_lng, start_kalla, tillkorning_km')
      .is('sluttid', null).order('starttid', { ascending: false }).limit(1)
    const { data, error } = m ? await bas.eq('medarbetare_id', m.id) : await bas.is('medarbetare_id', null)
    if (error) {
      if (error.message.includes('flyttdag')) setTabellSaknas(error.message)
      return
    }
    if (!data?.length) return
    const d = data[0] as Flyttdag

    const idagLokal = new Date().toLocaleDateString('sv-SE')
    const dagLokal = new Date(d.starttid).toLocaleDateString('sv-SE')
    if (dagLokal !== idagLokal) {
      await autoStangDag(d)
      setDagNotis(`Dagen från ${dagLokal} var aldrig avslutad — den stängdes automatiskt utan hemresa.`)
      return
    }
    setDag(d)
    const { data: fl } = await supabase.from('maskin_flytt')
      .select('till_lat, till_lng, sluttid')
      .eq('flyttdag_id', d.id).not('sluttid', 'is', null).eq('avbruten', false)
      .order('sluttid', { ascending: false })
    if (fl?.length) {
      setDagFlyttAntal(fl.length)
      if (fl[0].till_lat != null && fl[0].till_lng != null) setForraB({ lat: fl[0].till_lat, lng: fl[0].till_lng })
    }
  }

  /** Stäng en kvarglömd dag i efterhand: sluttid = sista flyttens sluttid,
   *  ingen hemresa (den kördes okänt), mätt tid bara om den är rimlig. */
  async function autoStangDag(d: Flyttdag) {
    const { data: fl } = await supabase.from('maskin_flytt')
      .select('sluttid, flytt_km, mellankorning_km')
      .eq('flyttdag_id', d.id).not('sluttid', 'is', null).eq('avbruten', false)
      .order('sluttid', { ascending: false })
    const sista = fl?.[0]?.sluttid ?? d.starttid
    const raMin = Math.round((new Date(sista).getTime() - new Date(d.starttid).getTime()) / 60000)
    const totalKm = (d.tillkorning_km ?? 0)
      + (fl || []).reduce((s, f) => s + (f.flytt_km ?? 0) + (f.mellankorning_km ?? 0), 0)
    await supabase.from('flyttdag').update({
      sluttid: sista,
      total_km: totalKm,
      total_tid_min: raMin >= 0 && raMin <= MAX_DAG_MIN ? raMin : null,
      status: 'auto_avslutad',
    }).eq('id', d.id).select('id')
  }

  // ── Objektlistan (aktiva trakter ur objekt-tabellen — dim_objekt är ALDRIG valbar) ──
  const laddaObjekt = useCallback(async () => {
    setObjektFel(null)
    const { data, error } = await supabase.from('objekt')
      .select(OBJEKT_FALT)
      .in('status', ['planerad', 'pagaende'])
      .order('namn')
    if (error) { setObjektFel(`Kunde inte läsa objekt: ${error.message}`); return }
    setObjektLista(data || [])
  }, [])

  useEffect(() => {
    if ((steg === 'transport' || steg === 'franObjekt') && objektLista === null) laddaObjekt()
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

  // ── Steg 1: välj maskin — klockan startar HÄR ──
  function valjMaskin(m: Maskin) {
    setMaskin(m)
    setExternMaskin(null); setExternFalt(false); setExternNamn('')
    setFlyttTyp('produktion'); setKund('')
    setSparFel(null)
    setFlodesStart(new Date().toISOString())
    getGps().then(setStartPos).catch(() => { /* startpos är valfri — ingen gissning */ })
    // Senast kända maskinposition — förstahandsförslag för navigering till maskinen
    supabase.from('maskin_position')
      .select('lat, lng, tidpunkt')
      .eq('maskin_id', m.maskin_id)
      .order('tidpunkt', { ascending: false }).limit(1)
      .then(({ data }) => {
        if (data?.length) {
          const nar = new Date(data[0].tidpunkt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
          setNavMaskin({ lat: data[0].lat, lng: data[0].lng, etikett: `Senast kända maskinposition · ${nar}` })
        }
      })
    setSok('')
    setSteg('franObjekt')
  }

  // ── Steg 1b: annans maskin — fritext, kunduppdrag förvalt (går att byta) ──
  function valjExternMaskin() {
    const namn = externNamn.trim()
    if (!namn) return
    setExternMaskin(namn)
    setMaskin(null)
    setNavMaskin(null) // ingen maskin_position för främmande maskiner
    setFlyttTyp('kunduppdrag'); setKund('')
    setSparFel(null)
    setFlodesStart(new Date().toISOString())
    getGps().then(setStartPos).catch(() => { /* valfri */ })
    setSok('')
    setSteg('franObjekt')
  }

  // ── Steg 2: var står maskinen? (valfritt — styr navigeringen dit) ──
  async function valjFranObjekt(o: ObjektRad | null) {
    setFranObjekt(o)
    setFranPlats(null) // aldrig objekt och plats i samma ände (DB-spärr finns också)
    setSok('')
    if (o && !navMaskin) {
      // Ingen känd maskinposition → navigera mot objektets koordinat i stället
      const k = await objektKoordinat(o)
      if (k) setNavMaskin({ lat: k.lat, lng: k.lng, etikett: KALLA_LABEL[k.kalla] })
    }
    setSteg('hamta')
  }

  function valjFranPlats(pl: Flyttplats) {
    setFranPlats(pl)
    setFranObjekt(null)
    if (pl.lat != null && pl.lng != null) {
      setNavMaskin({ lat: pl.lat, lng: pl.lng, etikett: `${PLATS_TYP_LABEL[pl.typ]} · ${pl.namn}` })
    }
    setSok('')
    setSteg('hamta')
  }

  /** Dagen skapas lazy vid dagens första "Hämta här" — hembasen som startpunkt
   *  om den finns, annars GPS från maskinvalet. Ärligt null om ingen finns. */
  async function ensureDag(): Promise<Flyttdag | null> {
    if (dagRef.current) return dagRef.current
    const start = medarb?.hem_lat != null && medarb?.hem_lng != null
      ? { lat: medarb.hem_lat, lng: medarb.hem_lng, kalla: 'hembas' }
      : startPos ? { lat: startPos.lat, lng: startPos.lng, kalla: 'gps' } : null
    const { data, error } = await supabase.from('flyttdag').insert({
      forare: medarb?.namn ?? null,
      medarbetare_id: medarb?.id ?? null,
      starttid: flodesStart ?? new Date().toISOString(),
      start_lat: start?.lat ?? null,
      start_lng: start?.lng ?? null,
      start_kalla: start?.kalla ?? null,
    }).select('id, starttid, start_lat, start_lng, start_kalla, tillkorning_km')
    if (error || !data?.length) {
      setSparFel(`Kunde inte starta dagen: ${error?.message || 'inga rader sparades'}`)
      return null
    }
    const d = data[0] as Flyttdag
    setDag(d)
    setDagFlyttAntal(0)
    return d
  }

  // ── Steg 3: "Hämta här" → skapa flyttraden ──
  async function hamtaHar() {
    if ((!maskin && !externMaskin) || !gpsPos || sparar) return
    setSparar(true); setSparFel(null)
    const d = await ensureDag()
    if (!d) { setSparar(false); return }

    // Tomkörning: förra flyttens slutpunkt → den här maskinen. Null för dagens första.
    const mellankorning = forraB ? (await korRutt(forraB, gpsPos)).km : null

    const nu = new Date().toISOString()
    const { data, error } = await supabase.from('maskin_flytt').insert({
      maskin_id: maskin?.maskin_id ?? null,
      extern_maskin: externMaskin,
      flyttdag_id: d.id,
      fran_objekt_id: franObjekt?.id ?? null,
      fran_plats_id: franPlats?.id ?? null,
      mellankorning_km: mellankorning,
      fran_lat: gpsPos.lat,
      fran_lng: gpsPos.lng,
      starttid: flodesStart ?? nu,
      hamtad_tid: nu,
      forare: medarb?.namn ?? null,
      medarbetare_id: medarb?.id ?? null,
    }).select('id')
    if (error || !data?.length) {
      setSparar(false)
      setSparFel(`Kunde inte spara flytten: ${error?.message || 'inga rader sparades'}`)
      return
    }

    // Dagens tillkörning: hem/start → dagens första maskin (en gång per dag)
    if (!forraB && d.tillkorning_km == null && d.start_lat != null && d.start_lng != null) {
      const t = await korRutt({ lat: d.start_lat, lng: d.start_lng }, gpsPos)
      const { data: du } = await supabase.from('flyttdag')
        .update({ tillkorning_km: t.km }).eq('id', d.id).select('id')
      if (du?.length) setDag({ ...d, tillkorning_km: t.km })
    }

    setSparar(false)
    setFlyttId(data[0].id)
    setAPos(gpsPos)
    setHamtadTid(nu)
    setSok('')
    setSteg('transport')
  }

  // ── Steg 4: välj destination ──
  async function valjObjekt(o: ObjektRad) {
    setValtObjekt(o); setTillPlats(null); setSparFel(null); setDestHamtar(true)
    const d = await objektKoordinat(o)
    setDestHamtar(false)
    if (d) setDest(d)
    else { setDest(null); setKartaOppen(true) } // saknas allt → peka på karta
  }

  function valjTillPlats(pl: Flyttplats) {
    setTillPlats(pl)
    setValtObjekt(null)
    setSparFel(null)
    if (pl.lat != null && pl.lng != null) setDest({ lat: pl.lat, lng: pl.lng, kalla: 'flyttplats' })
    else { setDest(null); setKartaOppen(true) }
  }

  // ── Steg 4 → 5: spara preliminär destination (för resume) ──
  async function startaTransport() {
    if (!flyttId || (!valtObjekt && !tillPlats) || !dest || sparar) return
    setSparar(true); setSparFel(null)
    const { data, error } = await supabase.from('maskin_flytt').update({
      till_objekt_id: valtObjekt?.id ?? null,
      till_plats_id: tillPlats?.id ?? null,
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

  // ── Steg 5: "Ja, lämnad här" ──
  async function lamnadHar() {
    if (!flyttId || (!maskin && !externMaskin) || !aPos || !dest || sparar) return
    if (flyttTyp === 'kunduppdrag' && !kund.trim()) { setSparFel('Kunduppdrag kräver kund — fyll i kundnamnet.'); return }
    setSparar(true); setSparFel(null)

    let b: Destination = dest
    try {
      const p = await getGps()
      if (p.accuracy <= 150) b = { lat: p.lat, lng: p.lng, kalla: 'gps' }
    } catch { /* behåll vald koordinat */ }

    const [flytt, vader] = await Promise.all([
      korRutt(aPos, b),
      hamtaVader(b.lat, b.lng),
    ])
    const flyttKm = flytt.km
    // fakturerbar: EN regel, per typ (produktion=km-gräns, service=aldrig,
    // kunduppdrag=alltid, annat=aldrig). Tomkörning/tillkörning aldrig.
    const fakturerbar = beraknaFakturerbar(flyttTyp, flyttKm)
    const nu = new Date().toISOString()

    const minMellan = (fran: string | null, till: string) =>
      fran ? Math.round((new Date(till).getTime() - new Date(fran).getTime()) / 60000) : null
    const raTillMaskin = minMellan(flodesStart, hamtadTid ?? nu)
    const raFlytt = minMellan(hamtadTid, nu)
    const tillMaskinOgiltig = raTillMaskin != null && (raTillMaskin < 0 || raTillMaskin > MAX_TID_TILL_MASKIN_MIN)
    const flyttOgiltig = raFlytt != null && (raFlytt < 0 || raFlytt > MAX_TID_FLYTT_MIN)

    // OBS: dagnivån äger tillkörning/hem/total — de skrivs INTE här längre
    const { data, error } = await supabase.from('maskin_flytt').update({
      till_lat: b.lat,
      till_lng: b.lng,
      koord_kalla: b.kalla,
      flytt_km: flyttKm,
      fakturerbar,
      flytt_typ: flyttTyp,
      kund: kund.trim() || null,
      tid_till_maskin_min: tillMaskinOgiltig ? null : raTillMaskin,
      tid_flytt_min: flyttOgiltig ? null : raFlytt,
      vader_temp_c: vader.temp,
      vader_kod: vader.kod,
      vader_nederbord_mm: vader.nederbord,
      sluttid: nu,
    }).eq('id', flyttId).select('id, mellankorning_km')

    if (error || !data?.length) {
      setSparar(false)
      setSparFel(`Kunde inte avsluta flytten: ${error?.message || 'inga rader sparades'}`)
      return
    }

    // Maskinens nya position — bara EGNA maskiner; andras spåras aldrig.
    let positionSparad = true
    if (maskin) {
      const posRes = await supabase.from('maskin_position')
        .insert({ maskin_id: maskin.maskin_id, lat: b.lat, lng: b.lng, tidpunkt: nu })
        .select('maskin_id')
      positionSparad = !posRes.error && (posRes.data?.length ?? 0) > 0
    }

    setSparar(false)
    setPagaende(prev => prev.filter(f => f.id !== flyttId))
    setForraB({ lat: b.lat, lng: b.lng })
    setDagFlyttAntal(n => n + 1)
    setResultat({
      flyttKm, mellankorningKm: data[0].mellankorning_km, fakturerbar, positionSparad,
      typ: flyttTyp, kundNamn: kund.trim() || null,
      tidTillMaskinMin: tillMaskinOgiltig ? null : raTillMaskin, tillMaskinOgiltig,
      tidFlyttMin: flyttOgiltig ? null : raFlytt, flyttOgiltig,
      vaderTemp: vader.temp, vaderKod: vader.kod,
    })
    setSteg('klart')
  }

  // ── "Nästa flytt" — dagen fortsätter ──
  function nastaFlytt() {
    setMaskin(null); setExternMaskin(null); setExternFalt(false); setExternNamn('')
    setFlyttId(null); setAPos(null); setFranObjekt(null); setFranPlats(null)
    setValtObjekt(null); setTillPlats(null); setDest(null); setGpsPos(null); setGpsFel(null)
    setResultat(null); setSparFel(null); setSok(''); setNavMaskin(null)
    setFlyttTyp('produktion'); setKund(''); setNyPlatsFor(null)
    setFlodesStart(null); setHamtadTid(null)
    setSteg('maskin')
  }

  // ── "Kör hem — avsluta dagen" ──
  async function korHem() {
    const d = dagRef.current
    if (!d || sparar) return
    setSparar(true); setSparFel(null)

    const { data: fl, error: flErr } = await supabase.from('maskin_flytt')
      .select('flytt_km, mellankorning_km, till_lat, till_lng, sluttid')
      .eq('flyttdag_id', d.id).not('sluttid', 'is', null).eq('avbruten', false)
      .order('sluttid', { ascending: false })
    if (flErr) {
      setSparar(false)
      setSparFel(`Kunde inte läsa dagens flyttar: ${flErr.message}`)
      return
    }
    const flyttKmSumma = (fl || []).reduce((s, f) => s + (f.flytt_km ?? 0), 0)
    const mellanSumma = (fl || []).reduce((s, f) => s + (f.mellankorning_km ?? 0), 0)
    const sistaB = forraB ?? (fl?.length && fl[0].till_lat != null && fl[0].till_lng != null
      ? { lat: fl[0].till_lat, lng: fl[0].till_lng } : null)

    // Hemresa: bara med hembas OCH en känd slutpunkt — annars ärligt tomt
    const hem = medarb?.hem_lat != null && medarb?.hem_lng != null && sistaB
      ? await korRutt(sistaB, { lat: medarb.hem_lat, lng: medarb.hem_lng }, true)
      : null

    const nu = new Date()
    const raMin = Math.round((nu.getTime() - new Date(d.starttid).getTime()) / 60000)
    const dagOgiltig = raMin < 0 || raMin > MAX_DAG_MIN
    const totalKm = (d.tillkorning_km ?? 0) + flyttKmSumma + mellanSumma + (hem?.km ?? 0)

    const { data, error } = await supabase.from('flyttdag').update({
      sluttid: nu.toISOString(),
      slut_lat: medarb?.hem_lat ?? null,
      slut_lng: medarb?.hem_lng ?? null,
      hem_km: hem?.km ?? null,
      tid_hem_min: hem?.minutes ?? null,
      total_km: totalKm,
      total_tid_min: dagOgiltig ? null : raMin,
      status: 'avslutad',
    }).eq('id', d.id).select('id')
    setSparar(false)
    if (error || !data?.length) {
      setSparFel(`Kunde inte avsluta dagen: ${error?.message || 'inga rader sparades'}`)
      return
    }
    setDagResultat({
      antalFlyttar: fl?.length ?? 0,
      tillkorningKm: d.tillkorning_km,
      flyttKmSumma, mellankorningKmSumma: mellanSumma,
      hemKm: hem?.km ?? null, tidHemMin: hem?.minutes ?? null,
      totalKm, totalTidMin: dagOgiltig ? null : raMin, dagOgiltig,
    })
    setDag(null); setForraB(null); setDagFlyttAntal(0)
    setSteg('dagKlart')
  }

  // ── Hembas saknas → spara nuvarande plats (för nästa dag) ──
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
    } catch (e: any) {
      setHembasFel(`Kunde inte spara hembas: ${e?.message || String(e)}`)
    }
    setHembasSparar(false)
  }

  // ── Banner: fortsätt/avbryt pågående flytt ──
  async function fortsattFlytt(f: PagaendeFlytt) {
    const m = f.maskin_id ? maskiner.find(x => x.maskin_id === f.maskin_id) : null
    if (f.maskin_id && !m) return
    setMaskin(m ?? null)
    setExternMaskin(f.extern_maskin)
    setFlyttTyp(f.extern_maskin ? 'kunduppdrag' : ((f.flytt_typ as FlyttTyp) || 'produktion'))
    setKund(f.kund ?? '')
    if (f.till_plats_id) {
      supabase.from('flyttplats').select('id, namn, typ, lat, lng, aktiv').eq('id', f.till_plats_id).single()
        .then(({ data }) => { if (data) setTillPlats(data as Flyttplats) })
    }
    setFlyttId(f.id)
    setAPos({ lat: f.fran_lat, lng: f.fran_lng, accuracy: 0 })
    setFlodesStart(f.starttid)
    setHamtadTid(f.hamtad_tid)
    setSparFel(null)
    // Flyttens dag återupptas också om den inte redan är laddad
    if (f.flyttdag_id && dagRef.current?.id !== f.flyttdag_id) {
      const { data } = await supabase.from('flyttdag')
        .select('id, starttid, start_lat, start_lng, start_kalla, tillkorning_km')
        .eq('id', f.flyttdag_id).single()
      if (data) setDag(data as Flyttdag)
    }
    if (f.till_objekt_id && f.till_lat != null && f.till_lng != null) {
      setDest({ lat: f.till_lat, lng: f.till_lng, kalla: (f.koord_kalla as KoordKalla) || 'objekt' })
      supabase.from('objekt').select(OBJEKT_FALT).eq('id', f.till_objekt_id).single()
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

  function nyDag() {
    nastaFlytt()
    setDagResultat(null); setDagNotis(null); setHembasFel(null)
  }

  const filtreradeObjekt = useMemo(() => {
    if (!objektLista) return []
    if (!sok.trim()) return objektLista
    const t = sok.toLowerCase()
    return objektLista.filter(o =>
      o.namn.toLowerCase().includes(t) || (o.vo_nummer || '').toLowerCase().includes(t))
  }, [objektLista, sok])

  const aktivMaskinNamn = maskin ? maskinNamn(maskin) : (externMaskin ?? '—')
  const destNamn = valtObjekt?.namn ?? tillPlats?.namn ?? 'Vald plats'

  const filtreradePlatser = useMemo(() => {
    const aktiva = flyttplatser.filter(pl => pl.aktiv)
    if (!sok.trim()) return aktiva
    const t = sok.toLowerCase()
    return aktiva.filter(pl => pl.namn.toLowerCase().includes(t))
  }, [flyttplatser, sok])

  function tillbaka() {
    setSparFel(null)
    if (steg === 'franObjekt') { setMaskin(null); setNavMaskin(null); setSteg('maskin') }
    else if (steg === 'hamta') setSteg('franObjekt')
    else if (steg === 'transport') setSteg('hamta')
    else if (steg === 'bekrafta') setSteg('transport')
  }

  // Mellansteg har egen bakåtpil → dölj TopBar:s hemknapp (appens mönster)
  const harBakat = steg === 'franObjekt' || steg === 'hamta' || steg === 'transport' || steg === 'bekrafta'
  useEffect(() => {
    if (harBakat) document.body.setAttribute('data-hide-home', '1')
    else document.body.removeAttribute('data-hide-home')
    return () => document.body.removeAttribute('data-hide-home')
  }, [harBakat])

  const storKnapp = (bg: string, fg: string): React.CSSProperties => ({
    width: '100%', background: bg, color: fg, border: 'none', borderRadius: 16,
    padding: '20px 0', fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: ff,
  })

  const platsLista = (valj: (pl: Flyttplats) => void, nyFor: 'fran' | 'till') => (
    <>
      {filtreradePlatser.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: C.t3, fontWeight: 700, margin: '14px 0 8px' }}>FLYTTPLATSER</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtreradePlatser.map(pl => (
              <button key={pl.id} onClick={() => valj(pl)} style={{
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                padding: '14px 14px', cursor: 'pointer', fontFamily: ff, color: C.t1, width: '100%',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.orange }}>
                  {pl.typ === 'verkstad' ? 'build' : 'location_on'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{pl.namn}</div>
                  <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{PLATS_TYP_LABEL[pl.typ]}</div>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.t3 }}>chevron_right</span>
              </button>
            ))}
          </div>
        </>
      )}
      <button onClick={() => setNyPlatsFor(nyFor)} style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        background: 'transparent', border: `1px dashed ${C.border}`, borderRadius: 12,
        padding: '13px 14px', cursor: 'pointer', fontFamily: ff, color: C.t2, fontSize: 14,
        fontWeight: 600, marginTop: 10,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.t3 }}>add_location_alt</span>
        Ny plats …
      </button>
    </>
  )

  const navLank = (lat: number, lng: number, namn: string, etikett: string, marginBottom = 10) => (
    <a href={navUrl(lat, lng, namn)} target="_blank" rel="noopener noreferrer" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      width: '100%', boxSizing: 'border-box', background: C.card, color: C.t1,
      border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 0',
      fontSize: 15, fontWeight: 700, fontFamily: ff, textDecoration: 'none', marginBottom,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.blue }}>near_me</span>
      {etikett}
    </a>
  )

  // ─────────────────────────── Render ───────────────────────────

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg, fontFamily: ff,
      WebkitFontSmoothing: 'antialiased', color: C.t1,
    }}>
      <style>{`.material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }`}</style>

      <main style={{ maxWidth: 500, margin: '0 auto', padding: '12px 16px calc(48px + env(safe-area-inset-bottom))' }}>

        {/* Bakåtpil + stegindikator */}
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
          {steg !== 'klart' && steg !== 'dagKlart' && (
            <div style={{ fontSize: 12, color: C.t3, fontWeight: 600 }}>Steg {STEG_NR[steg]} av 5</div>
          )}
        </div>

        {sparFel && (
          <div style={{
            background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.4)',
            borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 14,
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
                Databasen saknar dagmodellens kolumner — migrationen är inte körd. ({tabellSaknas})
              </div>
            )}
            {dagNotis && !laddar && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13, color: C.t2 }}>
                {dagNotis}
              </div>
            )}

            {/* Pågående dag (utan pågående flytt) */}
            {!laddar && dag && pagaende.length === 0 && (
              <div style={{
                background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.35)',
                borderRadius: 14, padding: 14, marginBottom: 16,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  Dag pågår — {dagFlyttAntal} {dagFlyttAntal === 1 ? 'flytt' : 'flyttar'}
                  <span style={{ color: C.t3, fontWeight: 400 }}> · startad {new Date(dag.starttid).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ fontSize: 13, color: C.t3, marginBottom: 10 }}>
                  Välj maskin nedan för nästa flytt, eller avsluta dagen.
                </div>
                <button onClick={korHem} disabled={sparar} style={{
                  width: '100%', background: 'transparent', color: C.blue, border: '1px solid rgba(59,130,246,0.5)',
                  borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: ff,
                  opacity: sparar ? 0.5 : 1,
                }}>{sparar ? 'Avslutar …' : 'Kör hem — avsluta dagen'}</button>
              </div>
            )}

            {/* Pågående flytt-banner */}
            {!laddar && pagaende.map(f => {
              const m = f.maskin_id ? maskiner.find(x => x.maskin_id === f.maskin_id) : null
              const namn = m ? maskinNamn(m) : (f.extern_maskin || f.maskin_id || '—')
              const start = new Date(f.starttid)
              return (
                <div key={f.id} style={{
                  background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.4)',
                  borderRadius: 14, padding: 14, marginBottom: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.orange }}>delivery_truck_speed</span>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      Flytt pågår: {namn}
                      <span style={{ color: C.t3, fontWeight: 400 }}> — startad {start.toLocaleString('sv-SE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => fortsattFlytt(f)} disabled={!!f.maskin_id && !m} style={{
                      flex: 1, background: C.orange, color: '#000', border: 'none', borderRadius: 10,
                      padding: '10px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: ff, opacity: (!f.maskin_id || m) ? 1 : 0.5,
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
                <p style={{ fontSize: 14, color: C.t3, margin: '0 0 16px' }}>
                  {dag ? 'Nästa flytt läggs på dagens körning.' : 'Dagen startar med första flytten.'}
                </p>
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

                  {/* Främmande maskin — snabbt: ett tryck + namn, kunduppdrag förvalt */}
                  {!externFalt ? (
                    <button onClick={() => setExternFalt(true)} style={{
                      display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
                      background: 'transparent', border: `1px dashed ${C.border}`, borderRadius: 14,
                      padding: '14px 16px', cursor: 'pointer', fontFamily: ff, color: C.t2, width: '100%',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 24, color: C.t3 }}>add_circle</span>
                      <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Annans maskin …</div>
                    </button>
                  ) : (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
                      <div style={{ fontSize: 13, color: C.t3, marginBottom: 8 }}>Vems maskin? Skriv fritt, t.ex. "Kalles John Deere 1210".</div>
                      <input
                        value={externNamn} onChange={e => setExternNamn(e.target.value)} autoFocus
                        placeholder="Maskin och ägare …"
                        style={{
                          width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`,
                          borderRadius: 10, padding: '11px 12px', fontSize: 15, color: C.t1, fontFamily: ff,
                          marginBottom: 10, outline: 'none',
                        }}
                      />
                      <button onClick={valjExternMaskin} disabled={!externNamn.trim()} style={{
                        width: '100%', background: C.blue, color: '#fff', border: 'none', borderRadius: 10,
                        padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: ff,
                        opacity: externNamn.trim() ? 1 : 0.4,
                      }}>Fortsätt med denna maskin</button>
                    </div>
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

        {/* ── Steg 2: Var står maskinen? ── */}
        {steg === 'franObjekt' && (maskin || externMaskin) && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>Var står {aktivMaskinNamn}?</h2>
            <p style={{ fontSize: 14, color: C.t3, margin: '0 0 16px' }}>
              Objektet maskinen hämtas från — styr navigeringen dit.
            </p>
            {navMaskin && (
              <div style={{ fontSize: 13, color: C.t2, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.blue }}>location_on</span>
                {navMaskin.etikett}
              </div>
            )}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtreradeObjekt.map(o => (
                <button key={o.id} onClick={() => valjFranObjekt(o)} style={{
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
            {platsLista(valjFranPlats, 'fran')}
            <button onClick={() => valjFranObjekt(null)} style={{
              width: '100%', background: 'transparent', color: C.t2, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: '13px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: ff, marginTop: 12,
            }}>Objekt och plats okänd — hoppa över</button>
          </>
        )}

        {/* ── Steg 3: Hämta (A via telefonens GPS) ── */}
        {steg === 'hamta' && (maskin || externMaskin) && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>Hämta {aktivMaskinNamn}</h2>
            <p style={{ fontSize: 14, color: C.t3, margin: '0 0 20px' }}>
              Ställ dig vid maskinen och tryck på knappen — hämtplatsen tas från telefonens GPS.
            </p>

            {navMaskin && (
              <>
                {navLank(navMaskin.lat, navMaskin.lng, franObjekt?.namn || franPlats?.namn || aktivMaskinNamn, 'Navigera till maskinen', 4)}
                <p style={{ fontSize: 12, color: C.t3, margin: '0 0 16px', textAlign: 'center' }}>{navMaskin.etikett}</p>
              </>
            )}

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{
                  fontSize: 22,
                  color: gpsPos ? C.green : gpsFel ? C.red : C.t3,
                }}>my_location</span>
                <div style={{ flex: 1, fontSize: 14 }}>
                  {gpsHamtar && <span style={{ color: C.t3 }}>Hämtar GPS-position …</span>}
                  {!gpsHamtar && gpsPos && (
                    <span>Position hittad <span style={{ color: C.t3 }}>(±{Math.round(gpsPos.accuracy)} m)</span></span>
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

            <button onClick={hamtaHar} disabled={!gpsPos || sparar || !!tabellSaknas} style={{
              ...storKnapp(C.green, '#000'),
              opacity: !gpsPos || sparar || tabellSaknas ? 0.4 : 1,
            }}>
              {sparar ? 'Sparar …' : 'Hämta här'}
            </button>
            {tabellSaknas && (
              <p style={{ fontSize: 13, color: C.orange, marginTop: 10, textAlign: 'center' }}>
                Kan inte spara — migrationen är inte körd.
              </p>
            )}
          </>
        )}

        {/* ── Steg 4: Transport — vart ska maskinen? ── */}
        {steg === 'transport' && (maskin || externMaskin) && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>Vart ska {aktivMaskinNamn}?</h2>
            <p style={{ fontSize: 14, color: C.t3, margin: '0 0 16px' }}>Välj trakten maskinen lämnas på.</p>

            {!valtObjekt && !tillPlats && (
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
                {platsLista(valjTillPlats, 'till')}
              </>
            )}

            {valtObjekt && destHamtar && (
              <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Hämtar koordinat …</div>
            )}

            {(valtObjekt || tillPlats) && !destHamtar && dest && (
              <div>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{destNamn}</div>
                  <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>
                    {valtObjekt ? (valtObjekt.vo_nummer || '—') : tillPlats ? PLATS_TYP_LABEL[tillPlats.typ] : '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.blue }}>location_on</span>
                    <span style={{ fontSize: 13, color: C.t2 }}>{dest.lat.toFixed(5)}, {dest.lng.toFixed(5)}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: C.blue, border: '1px solid rgba(59,130,246,0.5)',
                      borderRadius: 6, padding: '1px 6px',
                    }}>{KALLA_LABEL[dest.kalla]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                    <button onClick={() => { setValtObjekt(null); setTillPlats(null); setDest(null) }} style={{
                      background: 'transparent', color: C.t2, border: 'none', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', fontFamily: ff, padding: 0,
                    }}>Byt destination</button>
                    <button onClick={() => setKartaOppen(true)} style={{
                      background: 'transparent', color: C.blue, border: 'none', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', fontFamily: ff, padding: 0,
                    }}>Justera på karta</button>
                  </div>
                </div>

                {/* Före avfärd: det föraren behöver veta om trakten */}
                {valtObjekt && (valtObjekt.barighet || valtObjekt.transport_kommentar || valtObjekt.transport_trailer_in != null) && (
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

                {navLank(dest.lat, dest.lng, destNamn, 'Navigera dit')}
                <button onClick={startaTransport} disabled={sparar} style={{
                  ...storKnapp(C.blue, '#fff'),
                  opacity: sparar ? 0.4 : 1,
                }}>
                  {sparar ? 'Sparar …' : 'Starta transport'}
                </button>
              </div>
            )}

            {(valtObjekt || tillPlats) && !destHamtar && !dest && !kartaOppen && (
              <div style={{ background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.4)', borderRadius: 12, padding: 14, fontSize: 14 }}>
                {destNamn} saknar koordinat i alla källor.
                <button onClick={() => setKartaOppen(true)} style={{
                  display: 'block', marginTop: 8, background: 'transparent', color: C.blue, border: 'none',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: ff, padding: 0,
                }}>Peka ut platsen på kartan</button>
              </div>
            )}
          </>
        )}

        {/* ── Steg 5: Bekräfta lämnad ── */}
        {steg === 'bekrafta' && (maskin || externMaskin) && dest && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>Transport pågår</h2>
            <p style={{ fontSize: 14, color: C.t3, margin: '0 0 20px' }}>
              Tryck när {aktivMaskinNamn} står avlastad på plats.
            </p>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: C.t3 }}>Destination</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{destNamn}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.blue }}>location_on</span>
                <span style={{ fontSize: 13, color: C.t2 }}>{dest.lat.toFixed(5)}, {dest.lng.toFixed(5)}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: C.blue, border: '1px solid rgba(59,130,246,0.5)',
                  borderRadius: 6, padding: '1px 6px',
                }}>{KALLA_LABEL[dest.kalla]}</span>
              </div>
              <a href={navUrl(dest.lat, dest.lng, destNamn)} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12,
                  color: C.blue, fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: ff,
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>near_me</span>
                Navigera dit
              </a>
            </div>

            {/* Typ av flytt — Produktion förvald (noll extra tryck i vanligaste fallet).
                Kunduppdrag förvalt för extern maskin. Styr ENBART fakturerbar-flaggan. */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: C.t3, fontWeight: 700, marginBottom: 8 }}>TYP AV FLYTT</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['produktion', 'service', 'kunduppdrag', 'annat'] as FlyttTyp[]).map(t => (
                  <button key={t} onClick={() => setFlyttTyp(t)} style={{
                    background: flyttTyp === t ? 'rgba(59,130,246,0.18)' : C.card,
                    color: flyttTyp === t ? C.blue : C.t2,
                    border: `1px solid ${flyttTyp === t ? 'rgba(59,130,246,0.6)' : C.border}`,
                    borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', fontFamily: ff,
                  }}>{FLYTT_TYP_LABEL[t]}</button>
                ))}
              </div>
              {flyttTyp === 'service' && (
                <div style={{ fontSize: 12, color: C.t3, marginTop: 8 }}>Service faktureras aldrig — egen kostnad.</div>
              )}
              {flyttTyp === 'kunduppdrag' && (
                <input
                  value={kund} onChange={e => setKund(e.target.value)} placeholder="Kund (krävs) …"
                  style={{
                    width: '100%', boxSizing: 'border-box', background: C.card, border: `1px solid ${kund.trim() ? C.border : 'rgba(255,159,10,0.5)'}`,
                    borderRadius: 10, padding: '11px 12px', fontSize: 15, color: C.t1, fontFamily: ff,
                    marginTop: 10, outline: 'none',
                  }}
                />
              )}
            </div>

            <button onClick={lamnadHar} disabled={sparar || (flyttTyp === 'kunduppdrag' && !kund.trim())} style={{
              ...storKnapp(C.green, '#000'),
              opacity: sparar || (flyttTyp === 'kunduppdrag' && !kund.trim()) ? 0.4 : 1,
            }}>
              {sparar ? 'Sparar …' : 'Ja, lämnad här'}
            </button>
            {flyttTyp === 'kunduppdrag' && !kund.trim() && (
              <p style={{ fontSize: 13, color: C.orange, marginTop: 8, textAlign: 'center' }}>Kunduppdrag kräver kundnamn.</p>
            )}
            <p style={{ fontSize: 13, color: C.t3, marginTop: 10, textAlign: 'center' }}>
              Positionen finjusteras med telefonens GPS om möjligt.
            </p>
          </>
        )}

        {/* ── Klart (per flytt) — dagen fortsätter eller avslutas ── */}
        {steg === 'klart' && (maskin || externMaskin) && resultat && (
          <>
            <div style={{ textAlign: 'center', margin: '12px 0 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 56, color: C.green }}>check_circle</span>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 0' }}>Flytt klar</h2>
              <p style={{ fontSize: 13, color: C.t3, margin: '4px 0 0' }}>
                Dagens flytt {dagFlyttAntal} · tillkörning och hemresa räknas på dagen
              </p>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
              {[
                ['Maskin', aktivMaskinNamn + (externMaskin ? ' (extern)' : '')],
                ['Till', valtObjekt?.namn ?? tillPlats?.namn ?? '—'],
                ...(resultat.mellankorningKm != null
                  ? [['Mellankörning (tomkörning)', `${resultat.mellankorningKm} km`]]
                  : []),
                ['Flyttsträcka (A → B)',
                  `${resultat.flyttKm} km${
                    resultat.flyttOgiltig ? ' · tid ej sparad (över 6 tim)' :
                    resultat.tidFlyttMin != null ? ` · ${fmtMin(resultat.tidFlyttMin)}` : ''}`],
                ['Tid till maskinen',
                  resultat.tillMaskinOgiltig ? 'ej sparad (över 3 tim)' : fmtMin(resultat.tidTillMaskinMin)],
                ...(resultat.typ !== 'produktion'
                  ? [['Typ', FLYTT_TYP_LABEL[resultat.typ] + (resultat.kundNamn ? ` · ${resultat.kundNamn}` : '')]]
                  : []),
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
                  {resultat.fakturerbar
                    ? (resultat.typ === 'kunduppdrag' ? 'JA — kunduppdrag' : 'JA — ≥ 3 mil')
                    : (resultat.typ === 'service' ? 'Nej — service' :
                       resultat.typ === 'annat' ? 'Nej — annat' : 'Nej — under 3 mil')}
                </span>
              </div>
            </div>

            {!resultat.positionSparad && (
              <div style={{ background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.4)', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13 }}>
                Flytten sparades, men maskinens position kunde inte skrivas till maskin_position.
              </div>
            )}

            <button onClick={nastaFlytt} style={{ ...storKnapp(C.green, '#000'), marginBottom: 10 }}>
              Nästa flytt
            </button>
            <button onClick={korHem} disabled={sparar} style={{
              ...storKnapp(C.blue, '#fff'),
              opacity: sparar ? 0.4 : 1,
            }}>
              {sparar ? 'Avslutar …' : 'Kör hem — avsluta dagen'}
            </button>
            <Link href="/" style={{
              display: 'block', textAlign: 'center', marginTop: 14, color: C.t3,
              fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: ff,
            }}>Till startsidan (dagen fortsätter)</Link>
          </>
        )}

        {/* ── Dag avslutad ── */}
        {steg === 'dagKlart' && dagResultat && (
          <>
            <div style={{ textAlign: 'center', margin: '12px 0 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 56, color: C.blue }}>check_circle</span>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 0' }}>Dag avslutad</h2>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
              {[
                ['Flyttar', String(dagResultat.antalFlyttar)],
                ['Tillkörning (hem → första maskinen)', dagResultat.tillkorningKm != null ? `${dagResultat.tillkorningKm} km` : '—'],
                ['Flyttsträckor', `${dagResultat.flyttKmSumma} km`],
                ['Mellankörning (tomkörning)', `${dagResultat.mellankorningKmSumma} km`],
                ['Hemresa (beräknad)', dagResultat.hemKm != null
                  ? `${dagResultat.hemKm} km${dagResultat.tidHemMin != null ? ` · ~${fmtMin(dagResultat.tidHemMin)}` : ''}`
                  : 'hembas saknas'],
                ['Total körsträcka', `${dagResultat.totalKm} km`],
                ['Tid (mätt, exkl. hemresa)',
                  dagResultat.dagOgiltig ? 'ej sparad (över 16 tim)' : fmtMin(dagResultat.totalTidMin)],
              ].map(([label, varde]) => (
                <div key={label as string} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0',
                  borderBottom: `1px solid ${C.border}`, fontSize: 14,
                }}>
                  <span style={{ color: C.t3 }}>{label}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right' }}>{varde}</span>
                </div>
              ))}
            </div>

            {dagResultat.hemKm == null && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13 }}>
                {medarb ? (
                  <>
                    Hemresan kunde inte räknas utan hembas. Sätt den för nästa gång:
                    <button onClick={sattHembas} disabled={hembasSparar} style={{
                      display: 'block', marginTop: 8, background: 'transparent', color: C.blue, border: 'none',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: ff, padding: 0,
                      opacity: hembasSparar ? 0.5 : 1,
                    }}>{hembasSparar ? 'Sparar …' : 'Sätt hembas till min nuvarande plats'}</button>
                    {hembasFel && <div style={{ color: C.red, marginTop: 6 }}>{hembasFel}</div>}
                  </>
                ) : (
                  <>Hemresan kunde inte räknas — inloggningen saknar medarbetarkoppling.</>
                )}
              </div>
            )}

            {medarb?.hem_lat != null && medarb?.hem_lng != null && (
              navLank(medarb.hem_lat, medarb.hem_lng, 'Hem', 'Navigera hem')
            )}

            <button onClick={nyDag} style={{ ...storKnapp(C.card, C.t1), border: `1px solid ${C.border}` }}>
              Klart
            </button>
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

      {nyPlatsFor && (
        <NyPlatsForm
          skapadAv={medarb?.namn ?? null}
          onSparad={pl => {
            setFlyttplatser(prev => [...prev, pl].sort((a, b) => a.namn.localeCompare(b.namn, 'sv')))
            if (nyPlatsFor === 'fran') valjFranPlats(pl)
            else valjTillPlats(pl)
            setNyPlatsFor(null)
          }}
          onStang={() => setNyPlatsFor(null)}
        />
      )}
    </div>
  )
}

// ── Ny flyttplats: namn + typ + koordinat (GPS eller karta). Sparas i
//    flyttplats-tabellen och blir snabbval för alla framöver. ──
function NyPlatsForm({ skapadAv, onSparad, onStang }: {
  skapadAv: string | null
  onSparad: (pl: Flyttplats) => void
  onStang: () => void
}) {
  const [namn, setNamn] = useState('')
  const [typ, setTyp] = useState<PlatsTyp>('verkstad')
  const [koord, setKoord] = useState<{ lat: number; lng: number } | null>(null)
  const [koordKalla, setKoordKalla] = useState<'gps' | 'karta' | null>(null)
  const [kartaOppen, setKartaOppen] = useState(false)
  const [gpsHamtar, setGpsHamtar] = useState(false)
  const [sparar, setSparar] = useState(false)
  const [fel, setFel] = useState<string | null>(null)

  function minPosition() {
    setGpsHamtar(true); setFel(null)
    getGps()
      .then(p => { setKoord({ lat: p.lat, lng: p.lng }); setKoordKalla('gps') })
      .catch(e => setFel(e.message))
      .finally(() => setGpsHamtar(false))
  }

  async function spara() {
    if (!namn.trim() || sparar) return
    setSparar(true); setFel(null)
    const { data, error } = await supabase.from('flyttplats').insert({
      namn: namn.trim(),
      typ,
      lat: koord?.lat ?? null,
      lng: koord?.lng ?? null,
      skapad_av: skapadAv,
    }).select('id, namn, typ, lat, lng, aktiv')
    setSparar(false)
    if (error || !data?.length) {
      setFel(`Kunde inte spara platsen: ${error?.message || 'inga rader sparades'}`)
      return
    }
    onSparad(data[0] as Flyttplats)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: C.bg, overflow: 'auto' }}>
      <div style={{
        padding: 'calc(10px + env(safe-area-inset-top)) 16px 10px',
        display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.border}`,
      }}>
        <button onClick={onStang} aria-label="Stäng" style={{ background: 'none', border: 'none', color: C.t2, padding: 6, cursor: 'pointer', display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>close</span>
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.t1, fontFamily: ff }}>Ny flyttplats</div>
      </div>
      <div style={{ maxWidth: 500, margin: '0 auto', padding: '16px 16px calc(32px + env(safe-area-inset-bottom))', fontFamily: ff, color: C.t1 }}>
        {fel && (
          <div style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.4)', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13 }}>{fel}</div>
        )}
        <input
          value={namn} onChange={e => setNamn(e.target.value)} autoFocus placeholder="Namn, t.ex. Svängsta Maskinservice …"
          style={{
            width: '100%', boxSizing: 'border-box', background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '12px 14px', fontSize: 15, color: C.t1, fontFamily: ff,
            marginBottom: 12, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {(Object.keys(PLATS_TYP_LABEL) as PlatsTyp[]).map(t => (
            <button key={t} onClick={() => setTyp(t)} style={{
              background: typ === t ? 'rgba(59,130,246,0.18)' : C.card,
              color: typ === t ? C.blue : C.t2,
              border: `1px solid ${typ === t ? 'rgba(59,130,246,0.6)' : C.border}`,
              borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: ff,
            }}>{PLATS_TYP_LABEL[t]}</button>
          ))}
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13 }}>
          {koord
            ? <span>Position: {koord.lat.toFixed(5)}, {koord.lng.toFixed(5)} <span style={{ color: C.t3 }}>({koordKalla === 'gps' ? 'min position' : 'karta'})</span></span>
            : <span style={{ color: C.t3 }}>Ingen position vald ännu — utan koordinat måste platsen pekas ut på kartan vid varje flytt.</span>}
          <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
            <button onClick={minPosition} disabled={gpsHamtar} style={{
              background: 'transparent', color: C.blue, border: 'none', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: ff, padding: 0, opacity: gpsHamtar ? 0.5 : 1,
            }}>{gpsHamtar ? 'Hämtar …' : 'Min position'}</button>
            <button onClick={() => setKartaOppen(true)} style={{
              background: 'transparent', color: C.blue, border: 'none', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: ff, padding: 0,
            }}>Peka på karta</button>
          </div>
        </div>
        <button onClick={spara} disabled={!namn.trim() || sparar} style={{
          width: '100%', background: C.blue, color: '#fff', border: 'none', borderRadius: 14,
          padding: '15px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: ff,
          opacity: !namn.trim() || sparar ? 0.4 : 1,
        }}>{sparar ? 'Sparar …' : 'Spara platsen'}</button>
      </div>
      {kartaOppen && (
        <KartPicker
          start={koord ?? { lat: 56.5, lng: 14.7 }}
          onValj={(lat, lng) => { setKoord({ lat, lng }); setKoordKalla('karta'); setKartaOppen(false) }}
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
