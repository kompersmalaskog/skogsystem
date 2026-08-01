'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { haversine } from '@/utils/geo'
import { vaderIkon } from './vader'
import {
  hamtaSenastePlatser, tillampaSparrar, relativTid, rimligGpsPunkt,
  type PlatsForslag,
} from './senastePlats'

// ── Tema — samma palett som starta-jobb/förarvyerna ──
const C = {
  bg: '#09090b', card: '#131315', border: 'rgba(255,255,255,0.06)',
  t1: '#fafafa', t2: 'rgba(255,255,255,0.7)', t3: 'rgba(255,255,255,0.45)',
  green: '#22c55e', blue: '#3b82f6', orange: '#ff9f0a', red: '#ff453a',
}
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif"

// Appen föreslår, föraren bekräftar. Maskinlistan är startsidan och bär redan
// varje maskins senast kända plats (senastePlats.ts) — "Var står maskinen?"-
// steget är borta, för det var en fråga appen kunde svara på själv.
//
// Dagmodellen är oförändrad: en flyttdag (hemifrån → n flyttar → hem) äger
// tillkörning och hemresa; varje flytt äger flytt_km (fakturerbar-styrande) och
// mellankörning (tomkörning från förra flyttens slutpunkt). Mätt och beräknat
// blandas aldrig.
type Steg = 'maskin' | 'starta' | 'hamta' | 'transport' | 'bekrafta' | 'klart' | 'dagKlart'
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
interface Pos { lat: number; lng: number; accuracy: number; tid: number }
interface Destination { lat: number; lng: number; kalla: KoordKalla }

interface Flyttdag {
  id: string
  starttid: string
  start_lat: number | null
  start_lng: number | null
  start_kalla: string | null
  tillkorning_km: number | null
  start_odometer_m: number | null
  start_odometer_tid: string | null
  odometer_stale: boolean | null
}

const FLYTTDAG_FALT = 'id, starttid, start_lat, start_lng, start_kalla, tillkorning_km, start_odometer_m, start_odometer_tid, odometer_stale'

/** Lastbilens odometer just nu via /api/scania/odometer (nycklar server-side).
 *  Scania får ALDRIG blockera — fel/timeout ger null och dagen sparas utan
 *  mätarvärde. Samma princip som vädret. */
async function hamtaOdometer(): Promise<{ odometer_m: number; tid: string | null; stale: boolean } | null> {
  try {
    const r = await fetch('/api/scania/odometer', { cache: 'no-store' })
    if (!r.ok) return null
    const b = await r.json()
    return b?.ok && Number.isFinite(b.odometer_m)
      ? { odometer_m: b.odometer_m, tid: b.tid ?? null, stale: !!b.stale }
      : null
  } catch { return null }
}

/** Mätta ben: lastbilens senast LOGGADE odometer (ur lastbil_logg). Närmaste
 *  punkt i tid = den senaste. `farsk` = punkten ligger inom NARBEN_TID_MIN av
 *  nu; annars är odometern för gammal för att märka ett enskilt ben. Rådata
 *  (fran/till_odometer_m) sparas ändå — visningen gate:ar på färsk + benlängd. */
async function narmasteOdometer(vin: string | null): Promise<{ odometer_m: number; tid: string; farsk: boolean } | null> {
  if (!vin) return null
  try {
    const { data } = await supabase.from('lastbil_logg')
      .select('odometer_m, tidpunkt').eq('vin', vin)
      .order('tidpunkt', { ascending: false }).limit(1)
    const p = data?.[0]
    if (!p || p.odometer_m == null) return null
    return { odometer_m: p.odometer_m, tid: p.tidpunkt, farsk: (Date.now() - Date.parse(p.tidpunkt)) <= NARBEN_TID_MIN * 60_000 }
  } catch { return null }
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

/** En rad i STEG 5:s sammanfattning — en flytt så som föraren minns den. */
interface DagFlyttRad {
  maskin: string
  fran: string
  till: string
  km: number | null
  tidMin: number | null
  fakturerbar: boolean
  typ: FlyttTyp
}

function typLabel(t: string | null): string {
  if (t === 'Harvester') return 'Skördare'
  if (t === 'Forwarder') return 'Skotare'
  return t || ''
}

function maskinNamn(m: Maskin): string {
  return m.visningsnamn || m.modell || m.maskin_id
}

/** En GPS-fix som promise. `farsk` tvingar en NY mätning (maximumAge:0) — för
 *  punkter som styr pengar får en cachad position aldrig accepteras. Avvisar
 *  vid nekad behörighet eller timeout. */
function getGps(farsk = false): Promise<Pos> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('GPS stöds inte i den här webbläsaren'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, tid: p.timestamp }),
      e => reject(new Error(e.code === 1 ? 'Platsåtkomst nekad — tillåt i webbläsarens inställningar' : e.message)),
      { enableHighAccuracy: true, maximumAge: farsk ? 0 : 15000, timeout: farsk ? 25000 : 15000 },
    )
  })
}

/** Hur gammal en "färsk" fix får vara. maximumAge:0 ska ge en ny mätning, men
 *  iOS-PWA ignorerar det ibland och lämnar en gammal cachad punkt (exakt det
 *  som gav tillkörning 0 / fel fakturerbar 2026-07-24). Därför verifieras
 *  tidsstämpeln, och en gammal fix avvisas efter ett nytt försök. */
const FARSK_MAX_ALDER_MS = 15000

/** Färsk fix för pengapunkter (Hämtat/Lämnat/dagstart). Kastar hellre ett
 *  ärligt fel än att returnera en position från 40 minuter sedan. */
async function getFarskGps(): Promise<Pos> {
  let p = await getGps(true)
  if (Date.now() - p.tid > FARSK_MAX_ALDER_MS) {
    p = await getGps(true)  // en till chans att tvinga ett nytt sampel
    if (Date.now() - p.tid > FARSK_MAX_ALDER_MS) {
      throw new Error('GPS gav en gammal cachad position — gå ut i det fria och tryck igen')
    }
  }
  return p
}

/** Hur långt förarens GPS-punkt får ligga från maskinens förväntade plats
 *  innan appen frågar (blockerar aldrig — föraren beslutar). */
const RIMLIG_AVSTAND_KM = 2

// Mätta ben (del 4): loggpunkt inom NARBEN_TID_MIN av händelsen = tillförlitligt;
// ben kortare än NARBEN_MIN_KM visar bara rutt-km (odometerdiffen blir grövre än
// benet självt). MATCH_RADIE_KM = "Lassat av" matchar närmaste objekt/plats inom.
const NARBEN_TID_MIN = 3
const NARBEN_MIN_KM = 2
const MATCH_RADIE_KM = 1

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

// Tröskelvärden för lastbilens tankvarning — konstanter så de enkelt justeras
// efter verklig användning. Under NÅGON av dem → varningsläge (orange kort som
// flyttar upp till toppen). Diskret grönt annars.
const BRANSLE_MIN = 25    // %
const ADBLUE_MIN = 20     // %
const RACKVIDD_MIN_KM = 150

/** "nyss" / "för X min sedan" / "för X tim sedan" — så föraren ser att
 *  tankdatan inte är realtid. */
function tankAlder(iso: string | null): string {
  if (!iso) return ''
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (!Number.isFinite(min) || min < 0) return ''
  if (min < 1) return 'nyss'
  if (min < 60) return `för ${min} min sedan`
  return `för ${Math.floor(min / 60)} tim sedan`
}

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

const STEG_NR: Record<Steg, number> = { maskin: 1, starta: 2, hamta: 2, transport: 3, bekrafta: 4, klart: 4, dagKlart: 4 }

export default function MaskinflyttClient() {
  const [steg, setSteg] = useState<Steg>('maskin')

  // Grunddata
  const [maskiner, setMaskiner] = useState<Maskin[]>([])
  const [medarb, setMedarb] = useState<Medarb | null>(null)
  const [lastbilVin, setLastbilVin] = useState<string | null>(null)  // aktiv lastbil — sätts på rundan för dubbelskyddet
  const [lastbilUte, setLastbilUte] = useState<string | null>(null)  // öppen auto-rundas starttid → "Lastbilen är ute"
  const [pagaende, setPagaende] = useState<PagaendeFlytt[]>([])
  const [laddar, setLaddar] = useState(true)
  const [laddFel, setLaddFel] = useState<string | null>(null)
  const [tabellSaknas, setTabellSaknas] = useState<string | null>(null)

  // Maskinernas senast kända platser (STEG 0) — laddas separat så listan
  // kan ritas direkt; per maskin: laddar / förslag / inget förslag
  const [platser, setPlatser] = useState<Map<string, PlatsForslag>>(new Map())
  const [platserLaddar, setPlatserLaddar] = useState(true)
  const [platserFel, setPlatserFel] = useState<string | null>(null)

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
  const [externOppen, setExternOppen] = useState(false)                 // "Annat …"-raden utfälld
  const [externNamn, setExternNamn] = useState('')
  const [flyttplatser, setFlyttplatser] = useState<Flyttplats[]>([])
  const [franPlats, setFranPlats] = useState<Flyttplats | null>(null)
  const [tillPlats, setTillPlats] = useState<Flyttplats | null>(null)
  const [flyttTyp, setFlyttTyp] = useState<FlyttTyp>('produktion')
  const [kund, setKund] = useState('')
  const [typOppen, setTypOppen] = useState(false)      // typväljaren bakom "Ändra"
  const [nyPlatsFor, setNyPlatsFor] = useState<'fran' | 'till' | null>(null)
  const [flyttId, setFlyttId] = useState<string | null>(null)
  const [startPos, setStartPos] = useState<Pos | null>(null)   // GPS vid "Starta körning"
  const [startPosFel, setStartPosFel] = useState<string | null>(null)
  const startPosLoppet = useRef<Promise<Pos | null> | null>(null)
  const [aPos, setAPos] = useState<{ lat: number; lng: number } | null>(null)  // A: hämtplatsen
  const [franObjekt, setFranObjekt] = useState<ObjektRad | null>(null)
  const [valtObjekt, setValtObjekt] = useState<ObjektRad | null>(null)
  const [dest, setDest] = useState<Destination | null>(null)   // B (preliminär tills lämnad)
  const [flodesStart, setFlodesStart] = useState<string | null>(null)
  const [hamtadTid, setHamtadTid] = useState<string | null>(null)

  // STEG 1: maskinens plats — förslaget, eller förarens egen ändring
  const [forslag, setForslag] = useState<PlatsForslag | null>(null)
  const [andradPlats, setAndradPlats] = useState<PlatsForslag | null>(null)
  const [andraOppen, setAndraOppen] = useState(false)

  // GPS-läge för Hämta-steget
  const [gpsPos, setGpsPos] = useState<Pos | null>(null)
  const [gpsFel, setGpsFel] = useState<string | null>(null)
  const [gpsHamtar, setGpsHamtar] = useState(false)

  // Lastbilens tankstatus (Scania) — null tills hämtad; förblir null vid fel
  // så kortet bara inte visas. Blockerar aldrig maskinlistan.
  const [tank, setTank] = useState<{
    namn: string | null; fuel: number | null; adblue: number | null
    rackvidd_km: number | null; tid: string | null
  } | null>(null)

  // Rimlighetsvakt: GPS-punkten ligger långt från maskinens förväntade plats.
  // Blockerar aldrig — föraren väljer mellan sin GPS och den kända platsen.
  const [posVarning, setPosVarning] = useState<{
    steg: 'hamta' | 'lamnat'; namn: string; avstandKm: number
    gps: { lat: number; lng: number }; forvantad: { lat: number; lng: number }
  } | null>(null)

  // Objektlistor (delas av platsväljaren och transport-steget)
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
    flyttKm: number; flyttMatareKm: number | null; mellankorningKm: number | null; fakturerbar: boolean; positionSparad: boolean
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
    fakturerbarKm: number; fakturerbarAntal: number
    matareKm: number | null; odometerStale: boolean
    rader: DagFlyttRad[]
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

        if (mRes.error) { setLaddFel(`Kunde inte läsa maskiner: ${mRes.error.message}`); setLaddar(false); setPlatserLaddar(false); return }
        setMaskiner(mRes.data || [])

        // Platsuppslaget blockerar inte listan — den ritas direkt, platsen fylls i
        hamtaSenastePlatser((mRes.data || []).map(m => m.maskin_id))
          .then(({ platser, fel }) => { setPlatser(platser); setPlatserFel(fel) })
          .catch(e => setPlatserFel(`Kunde inte slå upp maskinernas platser: ${e?.message || String(e)}`))
          .finally(() => setPlatserLaddar(false))

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
        setPlatserLaddar(false)
      }
      setLaddar(false)
    })()
  }, [])

  // Aktiv lastbils vin — sätts på rundan vid manuell start/övertagning så
  // dubbelskydds-indexet (en öppen runda per vin) griper. Fel → null (degradera).
  useEffect(() => {
    supabase.from('lastbil').select('vin').eq('aktiv', true).limit(1).maybeSingle()
      .then(({ data }) => { if (data?.vin) setLastbilVin(data.vin) })
  }, [])

  // "Lastbilen är ute": en öppen AUTO-runda (cron öppnade när bilen lämnade
  // basen) som ingen tagit över manuellt. Diskret info, inte en väntande flytt.
  useEffect(() => {
    supabase.from('flyttdag').select('starttid')
      .is('sluttid', null).eq('auto_skapad', true)
      .order('starttid', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data?.starttid) setLastbilUte(data.starttid) })
  }, [])

  // Lastbilens tankstatus — en gång vid mount, serverside-cachad. Fel/timeout
  // låter tank förbli null → kortet visas inte. Scania blockerar aldrig listan.
  useEffect(() => {
    fetch('/api/scania/tank', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(b => {
        if (b?.ok) setTank({ namn: b.namn ?? null, fuel: b.fuel_pct ?? null, adblue: b.adblue_pct ?? null, rackvidd_km: b.rackvidd_km ?? null, tid: b.tid ?? null })
      })
      .catch(() => { /* tyst — kortet bara uteblir */ })
  }, [])

  /** Hämta pågående flyttdag. En dag från ett tidigare dygn auto-stängs —
   *  nästa dags flytt får aldrig hamna i gårdagens dag. */
  async function laddaDag(m: Medarb | null) {
    const bas = supabase.from('flyttdag')
      .select(FLYTTDAG_FALT)
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
    // Ladda även inför bekrafta — "Lassat av" matchar mot objektLista/flyttplatser
    if ((steg === 'transport' || steg === 'bekrafta' || andraOppen) && objektLista === null) laddaObjekt()
  }, [steg, andraOppen, objektLista, laddaObjekt])

  // ── Färsk GPS-fix när Hämta-steget öppnas (styr pengar → aldrig cachad) ──
  const hamtaGps = useCallback(() => {
    setGpsHamtar(true); setGpsFel(null)
    getFarskGps()
      .then(p => { setGpsPos(p); setGpsFel(null) })
      // Rensa ev. gammal punkt vid fel — knappen ska aldrig kunna spara en stale
      .catch(e => { setGpsPos(null); setGpsFel(e.message) })
      .finally(() => setGpsHamtar(false))
  }, [])

  useEffect(() => {
    if (steg === 'hamta') hamtaGps()
  }, [steg, hamtaGps])

  /** Maskinens plats just nu: förarens ändring vinner över appens förslag. */
  const hamtplats = andradPlats ?? forslag

  // ── STEG 0: välj maskin — klockan startar HÄR ──
  function valjMaskin(m: Maskin) {
    setMaskin(m)
    setExternMaskin(null); setExternOppen(false); setExternNamn('')
    setFlyttTyp('produktion'); setKund(''); setTypOppen(false)
    setSparFel(null)
    setFlodesStart(new Date().toISOString())
    setForslag(platser.get(m.maskin_id) ?? null)
    setAndradPlats(null)
    startaGpsLoppet()
    setSok('')
    setSteg('hamta')   // direkt till Lassat-skärmen (starta+hamta ihopslagna)
  }

  // ── STEG 0b: "Annat …" — extern maskin + kund (constrainten kräver kunden) ──
  function valjExternMaskin() {
    const namn = externNamn.trim()
    if (!namn || !kund.trim()) return
    setExternMaskin(namn)
    setMaskin(null)
    setForslag(null); setAndradPlats(null)  // ingen historik för främmande maskiner
    setFlyttTyp('kunduppdrag'); setTypOppen(false)
    setSparFel(null)
    setFlodesStart(new Date().toISOString())
    startaGpsLoppet()
    setSok('')
    setSteg('hamta')   // direkt till Lassat-skärmen
  }

  /** GPS-fixen till dagens startpunkt hämtas så fort maskinen valts, så den
   *  hunnit landa när föraren trycker "Starta körning". */
  function startaGpsLoppet() {
    setStartPos(null); setStartPosFel(null)
    // Färsk fix även här — dagstarten styr tillkörningen
    startPosLoppet.current = getFarskGps()
      .then(p => { setStartPos(p); return p })
      .catch(e => { setStartPosFel(e?.message || 'Platsen kunde inte hämtas'); return null })
  }

  /** Vad tillkörningen faktiskt kommer räknas från. "Hämtar …" får bara stå
   *  medan den hämtas — en misslyckad GPS ska säga att den misslyckades. */
  function tillkorningsText(): string {
    const harHembas = rimligGpsPunkt(medarb?.hem_lat ?? null, medarb?.hem_lng ?? null)
    if (startPos && rimligGpsPunkt(startPos.lat, startPos.lng)) return 'Tillkörningen räknas från din plats nu.'
    const orsak = startPos ? 'GPS-punkten ser trasig ut' : startPosFel ? 'Din plats kunde inte hämtas' : null
    if (!orsak) return 'Hämtar din plats för tillkörningen …'
    return harHembas
      ? `${orsak} — tillkörningen räknas från din hembas i stället.`
      : `${orsak} — tillkörningen kan inte räknas den här dagen.`
  }

  /** Dagen skapas vid "Starta körning". Startpunkten är förarens nuvarande
   *  GPS — men bara om den är rimlig; en trasig fix (null-ön, utanför Norden)
   *  får aldrig bli en tillkörning. Hembas är fallback; saknas båda startar
   *  dagen utan startpunkt och tillkörningen redovisas ärligt som oräknad. */
  async function ensureDag(): Promise<Flyttdag | null> {
    if (dagRef.current) return dagRef.current

    // Dubbelskydd: finns redan en öppen runda för bilen (auto övrig-körning
    // som cron:en öppnat, eller en manuell) — TA ÖVER den i stället för att
    // skapa en andra öppen runda. auto_skapad=false gör att cron:en slutar
    // röra den (manuellt vinner alltid). Odometern är redan satt av cron:en.
    const { data: oppna } = await supabase.from('flyttdag')
      .select(FLYTTDAG_FALT).is('sluttid', null).order('starttid', { ascending: false }).limit(1)
    if (oppna?.length) {
      const d = oppna[0] as Flyttdag
      await supabase.from('flyttdag').update({
        forare: medarb?.namn ?? null,
        medarbetare_id: medarb?.id ?? null,
        vin: lastbilVin ?? null,
        auto_skapad: false,
      }).eq('id', d.id)
      setDag(d)
      const { count } = await supabase.from('maskin_flytt')
        .select('id', { count: 'exact', head: true })
        .eq('flyttdag_id', d.id).not('sluttid', 'is', null).eq('avbruten', false)
      setDagFlyttAntal(count ?? 0)
      return d
    }

    const gps = startPos ?? (startPosLoppet.current ? await startPosLoppet.current : null)
    const start =
      gps && rimligGpsPunkt(gps.lat, gps.lng)
        ? { lat: gps.lat, lng: gps.lng, kalla: 'gps' }
        : rimligGpsPunkt(medarb?.hem_lat ?? null, medarb?.hem_lng ?? null)
          ? { lat: medarb!.hem_lat!, lng: medarb!.hem_lng!, kalla: 'hembas' }
          : null
    const { data, error } = await supabase.from('flyttdag').insert({
      forare: medarb?.namn ?? null,
      medarbetare_id: medarb?.id ?? null,
      vin: lastbilVin ?? null,        // engagerar dubbelskydds-indexet flyttdag_en_oppen_per_vin
      starttid: flodesStart ?? new Date().toISOString(),
      start_lat: start?.lat ?? null,
      start_lng: start?.lng ?? null,
      start_kalla: start?.kalla ?? null,
    }).select(FLYTTDAG_FALT)
    if (error || !data?.length) {
      setSparFel(`Kunde inte starta dagen: ${error?.message || 'inga rader sparades'}`)
      return null
    }
    const d = data[0] as Flyttdag
    setDag(d)
    setDagFlyttAntal(0)

    // Lastbilens odometer vid dagstart — fire-and-forget så Scania aldrig
    // fördröjer "Starta körning". Landar den skrivs start_odometer på dagen;
    // gör den inte det förblir mätaren bara oräknad (matare_km null).
    hamtaOdometer().then(odo => {
      if (!odo) return
      supabase.from('flyttdag').update({
        start_odometer_m: odo.odometer_m,
        start_odometer_tid: odo.tid,
        odometer_stale: odo.stale,
      }).eq('id', d.id).then(() => {
        setDag(prev => prev && prev.id === d.id
          ? { ...prev, start_odometer_m: odo.odometer_m, start_odometer_tid: odo.tid, odometer_stale: odo.stale }
          : prev)
      })
    })

    return d
  }

  // ── Fallback: öppna rundan manuellt utan att lasta (kör ut tom först) ──
  //    Nedtonad länk; Lassat är huvudvägen och öppnar rundan ändå. Kräver inte
  //    att automatiken funkar — ensureDag tar över/skapar en runda.
  async function oppnaRundaUtanLast() {
    if (sparar) return
    setSparar(true); setSparFel(null)
    const d = await ensureDag()
    setSparar(false)
    if (d) nastaFlytt()   // rundan öppen → tillbaka till listan (visar "Dag pågår")
  }

  // ── STEG 1: "Ändra" — föraren pekar ut var maskinen faktiskt står ──
  function andraTillObjekt(o: ObjektRad) {
    setAndraOppen(false); setSok('')
    setFranObjekt(o); setFranPlats(null)
    objektKoordinat(o).then(k => {
      setAndradPlats(tillampaSparrar({
        namn: o.namn,
        koordinat: k ? { lat: k.lat, lng: k.lng } : null,
        objektId: o.id, platsId: null, tidpunkt: null, kalla: 'manuell',
      }))
    })
  }

  function andraTillPlats(pl: Flyttplats) {
    setAndraOppen(false); setSok('')
    setFranPlats(pl); setFranObjekt(null)
    setAndradPlats(tillampaSparrar({
      namn: pl.namn,
      koordinat: pl.lat != null && pl.lng != null ? { lat: pl.lat, lng: pl.lng } : null,
      objektId: null, platsId: pl.id, tidpunkt: null, kalla: 'manuell',
    }))
  }

  // ── STEG 2: "Hämtat" — rimlighetsvakt innan spar ──
  function hamtatTryck() {
    if ((!maskin && !externMaskin) || !gpsPos || sparar) return
    // Står föraren verkligen vid maskinen? Fråga om GPS-punkten ligger långt
    // från maskinens kända plats — men blockera aldrig, föraren beslutar.
    if (hamtplats?.koordinat) {
      const avstand = haversine(gpsPos.lat, gpsPos.lng, hamtplats.koordinat.lat, hamtplats.koordinat.lng)
      if (avstand > RIMLIG_AVSTAND_KM) {
        setPosVarning({
          steg: 'hamta', namn: hamtplats.namn, avstandKm: Math.round(avstand),
          gps: { lat: gpsPos.lat, lng: gpsPos.lng }, forvantad: hamtplats.koordinat,
        })
        return
      }
    }
    hamtaHar({ lat: gpsPos.lat, lng: gpsPos.lng })
  }

  // ── STEG 2: skapa flyttraden. `punkt` = förarens valda hämtpunkt — färsk GPS,
  //    eller (via rimlighetsvakten) maskinens kända plats. Alla A-beroende
  //    beräkningar (fran, tomkörning, tillkörning) använder SAMMA punkt. ──
  async function hamtaHar(punkt: { lat: number; lng: number }) {
    if ((!maskin && !externMaskin) || sparar) return
    setPosVarning(null)
    setSparar(true); setSparFel(null)
    const d = await ensureDag()
    if (!d) { setSparar(false); return }

    // Tomkörning: förra flyttens slutpunkt → den här maskinen. Null för dagens första.
    const mellankorning = forraB ? (await korRutt(forraB, punkt)).km : null

    const nu = new Date().toISOString()
    const { data, error } = await supabase.from('maskin_flytt').insert({
      maskin_id: maskin?.maskin_id ?? null,
      extern_maskin: externMaskin,
      flyttdag_id: d.id,
      fran_objekt_id: franObjekt?.id ?? hamtplats?.objektId ?? null,
      fran_plats_id: franObjekt ? null : (franPlats?.id ?? hamtplats?.platsId ?? null),
      mellankorning_km: mellankorning,
      fran_lat: punkt.lat,
      fran_lng: punkt.lng,
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

    // Dagens tillkörning: start → dagens första maskin. Villkoret tar bara den
    // FÖRSTA flytten (mellankörning ägs av senare flyttar), inte "är km null" —
    // en felaktig 0:a från ett tidigare försök får inte blockera omräkningen.
    if (!forraB && d.start_lat != null && d.start_lng != null) {
      const t = await korRutt({ lat: d.start_lat, lng: d.start_lng }, punkt)
      const { data: du } = await supabase.from('flyttdag')
        .update({ tillkorning_km: t.km }).eq('id', d.id).select('id')
      if (du?.length) setDag({ ...d, tillkorning_km: t.km })
    }

    // Mätt ben: lastbilens odometer vid Lassat (fire-and-forget — blockerar aldrig)
    narmasteOdometer(lastbilVin).then(o => {
      if (o) supabase.from('maskin_flytt').update({ fran_odometer_m: o.odometer_m }).eq('id', data[0].id)
    })

    setSparar(false)
    setFlyttId(data[0].id)
    setAPos(punkt)
    setHamtadTid(nu)
    setSok('')
    setSteg('transport')
  }

  // ── STEG 3: välj destination ──
  async function valjObjekt(o: ObjektRad) {
    setValtObjekt(o); setTillPlats(null); setSparFel(null); setDestHamtar(true)
    // Objekt är aldrig service — typen faller tillbaka till grundläget
    if (!externMaskin) { setFlyttTyp('produktion'); setKund('') }
    const d = await objektKoordinat(o)
    setDestHamtar(false)
    if (d) setDest(d)
    else { setDest(null); setKartaOppen(true) } // saknas allt → peka på karta
  }

  function valjTillPlats(pl: Flyttplats) {
    setTillPlats(pl)
    setValtObjekt(null)
    setSparFel(null)
    // Verkstad → serviceflytt. Skrivs ut i klartext på destinationskortet och
    // går att ändra där; inga typ-chips i flödet.
    if (!externMaskin) {
      setFlyttTyp(pl.typ === 'verkstad' ? 'service' : 'produktion')
      setKund('')
    }
    if (pl.lat != null && pl.lng != null) setDest({ lat: pl.lat, lng: pl.lng, kalla: 'flyttplats' })
    else { setDest(null); setKartaOppen(true) }
  }

  // ── STEG 3 → 4: spara preliminär destination (för resume) ──
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

  /** Närmaste objekt/flyttplats inom MATCH_RADIE_KM av en punkt (för "Lassat av"
   *  när ingen destination valts i förväg). null = inget inom radien. */
  function narmasteMatchning(lat: number, lng: number): { objekt: ObjektRad | null; plats: Flyttplats | null; avstandKm: number } | null {
    let bast: { objekt: ObjektRad | null; plats: Flyttplats | null; avstandKm: number } | null = null
    for (const o of objektLista ?? []) {
      const k = o.larmkoordinat_bekraftad && o.larmkoordinat_lat != null && o.larmkoordinat_lng != null
        ? { lat: o.larmkoordinat_lat, lng: o.larmkoordinat_lng }
        : (o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : null)
      if (!k) continue
      const d = haversine(lat, lng, k.lat, k.lng)
      if (d <= MATCH_RADIE_KM && (!bast || d < bast.avstandKm)) bast = { objekt: o, plats: null, avstandKm: d }
    }
    for (const p of flyttplatser) {
      if (p.lat == null || p.lng == null) continue
      const d = haversine(lat, lng, p.lat, p.lng)
      if (d <= MATCH_RADIE_KM && (!bast || d < bast.avstandKm)) bast = { objekt: null, plats: p, avstandKm: d }
    }
    return bast
  }

  // ── STEG 4: "Lassat av" — färsk fix, matcha/vakta destination innan spar ──
  async function lamnatTryck() {
    if (!flyttId || (!maskin && !externMaskin) || !aPos || sparar) return
    if (flyttTyp === 'kunduppdrag' && !kund.trim()) { setSparFel('Kunduppdrag kräver kund — fyll i kundnamnet.'); return }
    setSparar(true); setSparFel(null)
    let gps: Pos | null = null
    try { gps = await getFarskGps() } catch { /* GPS kan saknas — faller tillbaka på vald destination */ }
    const punkt = gps && gps.accuracy <= 150 ? { lat: gps.lat, lng: gps.lng } : null

    // Ingen destination vald i förväg → matcha närmaste trakt/plats inom 1 km
    // vid GPS-punkten och VISA den (sätts som dest); föraren bekräftar/ändrar
    // och trycker igen för att spara. Aldrig tyst.
    if (!dest) {
      if (!punkt) { setSparar(false); setSparFel('Ingen brukbar GPS — försök igen, eller välj plats via "Vart ska den?".'); return }
      const match = narmasteMatchning(punkt.lat, punkt.lng)
      setSparar(false)
      if (match?.objekt) valjObjekt(match.objekt)
      else if (match?.plats) valjTillPlats(match.plats)
      else setDest({ lat: punkt.lat, lng: punkt.lng, kalla: 'gps' })  // inget inom 1 km → ren koordinat
      return
    }

    // Destination satt → rimlighetsvakt mot den (som förr)
    if (punkt) {
      const avstand = haversine(punkt.lat, punkt.lng, dest.lat, dest.lng)
      if (avstand > RIMLIG_AVSTAND_KM) {
        setSparar(false)
        setPosVarning({
          steg: 'lamnat', namn: destNamn, avstandKm: Math.round(avstand),
          gps: { lat: punkt.lat, lng: punkt.lng }, forvantad: { lat: dest.lat, lng: dest.lng },
        })
        return
      }
      lamnadHar({ lat: punkt.lat, lng: punkt.lng, kalla: 'gps' })
    } else {
      lamnadHar(dest)  // ingen brukbar fix → behåll vald koordinat
    }
  }

  // ── Avsluta flytten mot slutpunkten `b` (färsk GPS eller vald destination). ──
  async function lamnadHar(b: Destination) {
    if (!flyttId || (!maskin && !externMaskin) || !aPos) return
    setPosVarning(null)
    setSparar(true); setSparFel(null)

    const [flytt, vader, tillOdo] = await Promise.all([
      korRutt(aPos, b),
      hamtaVader(b.lat, b.lng),
      narmasteOdometer(lastbilVin),   // mätt ben: odometer vid Lassat av
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

    // OBS: dagnivån äger tillkörning/hem/total — de skrivs INTE här längre.
    // till_objekt/plats skrivs HÄR (inte bara i startaTransport) — det krympta
    // flödet hoppar över startaTransport när destinationen matchas vid Lassat av.
    const { data, error } = await supabase.from('maskin_flytt').update({
      till_objekt_id: valtObjekt?.id ?? null,
      till_plats_id: tillPlats?.id ?? null,
      till_lat: b.lat,
      till_lng: b.lng,
      koord_kalla: b.kalla,
      flytt_km: flyttKm,
      fakturerbar,
      flytt_typ: flyttTyp,
      kund: kund.trim() || null,
      tid_till_maskin_min: tillMaskinOgiltig ? null : raTillMaskin,
      tid_flytt_min: flyttOgiltig ? null : raFlytt,
      till_odometer_m: tillOdo?.odometer_m ?? null,
      vader_temp_c: vader.temp,
      vader_kod: vader.kod,
      vader_nederbord_mm: vader.nederbord,
      sluttid: nu,
    }).eq('id', flyttId).select('id, mellankorning_km, fran_odometer_m')

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

      // Maskinlistan ska visa den NYA platsen direkt — flytten är den
      // starkaste signalen om var maskinen står, och den vet vi just nu.
      const nyPlats = tillampaSparrar({
        namn: valtObjekt?.namn ?? tillPlats?.namn ?? 'Senast lämnad plats',
        koordinat: { lat: b.lat, lng: b.lng },
        objektId: valtObjekt?.id ?? null,
        platsId: tillPlats?.id ?? null,
        tidpunkt: nu,
        kalla: 'flytt',
      })
      setPlatser(prev => new Map(prev).set(maskin.maskin_id, nyPlats))
    }

    // Mätt ben (visning): (till − fran)/1000. Gate:as på färsk loggpunkt + ben
    // ≥ 2 km — annars är odometerdiffen grövre än benet självt (rutt-km räcker).
    const franOdo: number | null = data[0].fran_odometer_m ?? null
    const flyttMatareKm: number | null = tillOdo?.farsk && flyttKm >= NARBEN_MIN_KM && franOdo != null && tillOdo.odometer_m != null
      ? Math.round(((tillOdo.odometer_m - franOdo) / 1000) * 10) / 10 : null

    setSparar(false)
    setPagaende(prev => prev.filter(f => f.id !== flyttId))
    setForraB({ lat: b.lat, lng: b.lng })
    setDagFlyttAntal(n => n + 1)
    setResultat({
      flyttKm, flyttMatareKm, mellankorningKm: data[0].mellankorning_km, fakturerbar, positionSparad,
      typ: flyttTyp, kundNamn: kund.trim() || null,
      tidTillMaskinMin: tillMaskinOgiltig ? null : raTillMaskin, tillMaskinOgiltig,
      tidFlyttMin: flyttOgiltig ? null : raFlytt, flyttOgiltig,
      vaderTemp: vader.temp, vaderKod: vader.kod,
    })
    setSteg('klart')
  }

  /** Förarens val i rimlighetsvarningen: sin egen GPS eller maskinens/
   *  destinationens kända plats. Går vidare till samma spar-väg med den
   *  valda punkten. */
  function valjPosVarning(val: 'gps' | 'forvantad') {
    const v = posVarning
    if (!v) return
    setPosVarning(null)
    if (v.steg === 'hamta') {
      hamtaHar(val === 'gps' ? v.gps : v.forvantad)
    } else if (dest) {
      lamnadHar(val === 'gps' ? { lat: v.gps.lat, lng: v.gps.lng, kalla: 'gps' } : dest)
    }
  }

  // ── "Nästa flytt" — dagen fortsätter ──
  function nastaFlytt() {
    setMaskin(null); setExternMaskin(null); setExternOppen(false); setExternNamn('')
    setFlyttId(null); setAPos(null); setFranObjekt(null); setFranPlats(null)
    setValtObjekt(null); setTillPlats(null); setDest(null); setGpsPos(null); setGpsFel(null)
    setResultat(null); setSparFel(null); setSok(''); setPosVarning(null)
    setForslag(null); setAndradPlats(null); setAndraOppen(false)
    setFlyttTyp('produktion'); setKund(''); setTypOppen(false); setNyPlatsFor(null)
    setFlodesStart(null); setHamtadTid(null)
    setSteg('maskin')
  }

  // ── "Kör hem — avsluta dagen" ──
  async function korHem() {
    const d = dagRef.current
    if (!d || sparar) return
    setSparar(true); setSparFel(null)

    const { data: fl, error: flErr } = await supabase.from('maskin_flytt')
      .select('maskin_id, extern_maskin, flytt_km, mellankorning_km, tid_flytt_min, fakturerbar, flytt_typ, fran_objekt_id, fran_plats_id, till_objekt_id, till_plats_id, till_lat, till_lng, sluttid')
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

    // Namn till sammanfattningens rader — en läsning per tabell, inga N+1
    const objektIds = Array.from(new Set((fl || []).flatMap(f => [f.fran_objekt_id, f.till_objekt_id]).filter(Boolean))) as string[]
    const platsIds = Array.from(new Set((fl || []).flatMap(f => [f.fran_plats_id, f.till_plats_id]).filter(Boolean))) as string[]
    const [objNamn, platsNamn, hem, slutOdo, dagFarsk] = await Promise.all([
      objektIds.length ? supabase.from('objekt').select('id, namn').in('id', objektIds) : Promise.resolve({ data: [] as any[] }),
      platsIds.length ? supabase.from('flyttplats').select('id, namn').in('id', platsIds) : Promise.resolve({ data: [] as any[] }),
      // Hemresa: bara med hembas OCH en känd slutpunkt — annars ärligt tomt
      medarb?.hem_lat != null && medarb?.hem_lng != null && sistaB
        ? korRutt(sistaB, { lat: medarb.hem_lat, lng: medarb.hem_lng }, true)
        : Promise.resolve(null),
      // Lastbilens odometer nu (slut) + färsk start-avläsning från dagen
      hamtaOdometer(),
      supabase.from('flyttdag').select('start_odometer_m, start_odometer_tid, odometer_stale').eq('id', d.id).single(),
    ])

    // Mätarställning: (slut − start) / 1000, en decimal. Saknas endera → null.
    // Odometern är lastbilens totalsträcka — vid sidan av rutt-km, aldrig i stället.
    const startOdoM: number | null = dagFarsk.data?.start_odometer_m ?? d.start_odometer_m ?? null
    const startStale: boolean = !!(dagFarsk.data?.odometer_stale ?? d.odometer_stale)
    const slutOdoM: number | null = slutOdo?.odometer_m ?? null
    const matareKm: number | null = startOdoM != null && slutOdoM != null
      ? Math.round(((slutOdoM - startOdoM) / 1000) * 10) / 10 : null
    const odometerStale: boolean = startStale || !!slutOdo?.stale
    const namnFor = (objektId: string | null, platsId: string | null) =>
      (objektId && (objNamn.data || []).find((o: any) => o.id === objektId)?.namn)
      || (platsId && (platsNamn.data || []).find((p: any) => p.id === platsId)?.namn)
      || '—'
    const maskinEtikett = (id: string | null, extern: string | null) =>
      extern || (id && maskiner.find(m => m.maskin_id === id) ? maskinNamn(maskiner.find(m => m.maskin_id === id)!) : id) || '—'

    // Äldst först — dagen läses uppifrån och ner
    const rader: DagFlyttRad[] = [...(fl || [])].reverse().map(f => ({
      maskin: maskinEtikett(f.maskin_id, f.extern_maskin),
      fran: namnFor(f.fran_objekt_id, f.fran_plats_id),
      till: namnFor(f.till_objekt_id, f.till_plats_id),
      km: f.flytt_km ?? null,
      tidMin: f.tid_flytt_min ?? null,
      fakturerbar: !!f.fakturerbar,
      typ: (f.flytt_typ as FlyttTyp) || 'produktion',
    }))

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
      slut_odometer_m: slutOdoM,
      slut_odometer_tid: slutOdo?.tid ?? null,
      matare_km: matareKm,
      odometer_stale: odometerStale,
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
      fakturerbarKm: (fl || []).reduce((s, f) => s + (f.fakturerbar ? (f.flytt_km ?? 0) : 0), 0),
      fakturerbarAntal: (fl || []).filter(f => f.fakturerbar).length,
      matareKm, odometerStale,
      rader,
    })
    setDag(null); setForraB(null); setDagFlyttAntal(0)
    setSteg('dagKlart')
  }

  // ── Hembas saknas → spara nuvarande plats (för nästa dag) ──
  async function sattHembas() {
    if (!medarb || hembasSparar) return
    setHembasSparar(true); setHembasFel(null)
    try {
      const p = await getFarskGps()
      if (!rimligGpsPunkt(p.lat, p.lng)) throw new Error('GPS-punkten ser trasig ut — försök igen utomhus')
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
    setAPos({ lat: f.fran_lat, lng: f.fran_lng })
    setFlodesStart(f.starttid)
    setHamtadTid(f.hamtad_tid)
    setSparFel(null)
    // Flyttens dag återupptas också om den inte redan är laddad
    if (f.flyttdag_id && dagRef.current?.id !== f.flyttdag_id) {
      const { data } = await supabase.from('flyttdag')
        .select(FLYTTDAG_FALT)
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

  const aktivMaskinNamn = maskin ? maskinNamn(maskin) : (externMaskin ?? '—')
  const destNamn = valtObjekt?.namn ?? tillPlats?.namn ?? 'Vald plats'

  function tillbaka() {
    setSparFel(null)
    if (steg === 'hamta') { setMaskin(null); setExternMaskin(null); setForslag(null); setAndradPlats(null); setSteg('maskin') }
    else if (steg === 'transport') setSteg('hamta')
    else if (steg === 'bekrafta') setSteg('transport')
  }

  // Mellansteg har egen bakåtpil → dölj TopBar:s hemknapp (appens mönster)
  const harBakat = steg === 'hamta' || steg === 'transport' || steg === 'bekrafta'
  useEffect(() => {
    if (harBakat) document.body.setAttribute('data-hide-home', '1')
    else document.body.removeAttribute('data-hide-home')
    return () => document.body.removeAttribute('data-hide-home')
  }, [harBakat])

  const storKnapp = (bg: string, fg: string): React.CSSProperties => ({
    width: '100%', background: bg, color: fg, border: 'none', borderRadius: 16,
    padding: '20px 0', fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: ff,
  })

  /** Stor knapp som ÄR navigeringen: länken öppnar Maps direkt ur förarens
   *  tryck (ingen popup-blockering), onClick driver flödet vidare. */
  const mapsKnapp = (
    lat: number, lng: number, namn: string, etikett: string,
    onClick: () => void, bg = C.green, fg = '#000',
  ) => {
    const url = navUrl(lat, lng, namn)
    return (
      <a
        href={url}
        {...(url.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        onClick={onClick}
        style={{
          ...storKnapp(bg, fg), display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, textDecoration: 'none', boxSizing: 'border-box',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 24 }}>near_me</span>
        {etikett}
      </a>
    )
  }

  const navLank = (lat: number, lng: number, namn: string, etikett: string, marginBottom = 10) => {
    const url = navUrl(lat, lng, namn)
    return (
      <a href={url} {...(url.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: '100%', boxSizing: 'border-box', background: C.card, color: C.t1,
        border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 0',
        fontSize: 15, fontWeight: 700, fontFamily: ff, textDecoration: 'none', marginBottom,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.blue }}>near_me</span>
        {etikett}
      </a>
    )
  }

  const lankStil: React.CSSProperties = {
    background: 'transparent', color: C.blue, border: 'none', fontSize: 13,
    fontWeight: 600, cursor: 'pointer', fontFamily: ff, padding: 0,
  }

  // Varningsläge när någon nivå är under tröskel → kortet flyttar upp till
  // toppen (ett beslut föraren ska fatta INNAN han väljer maskin).
  const tankVarning = !!tank && (
    (tank.fuel != null && tank.fuel < BRANSLE_MIN) ||
    (tank.adblue != null && tank.adblue < ADBLUE_MIN) ||
    (tank.rackvidd_km != null && tank.rackvidd_km < RACKVIDD_MIN_KM)
  )

  /** Lastbilskort på maskinlistan: diskret när allt är ok, orange "Planera
   *  tankning" i varningsläge. Ålder alltid utskriven — datan är inte realtid. */
  function tankKort() {
    if (!tank) return null
    const v = tankVarning
    const varde = (label: string, val: number | null, enhet: string, under: boolean) =>
      val == null ? null : (
        <span style={{ color: under ? C.orange : C.t2, fontWeight: under ? 700 : 400 }}>
          {label} {Math.round(val)}{enhet}
        </span>
      )
    return (
      <div style={{
        background: v ? 'rgba(255,159,10,0.12)' : C.card,
        border: `1px solid ${v ? 'rgba(255,159,10,0.5)' : C.border}`,
        borderRadius: 14, padding: 14, marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: v ? C.orange : C.t3 }}>local_shipping</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              Lastbil{tank.namn ? ` ${tank.namn}` : ''}
              {v && <span style={{ color: C.orange }}> · Planera tankning</span>}
            </div>
            <div style={{ fontSize: 13, marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {varde('Diesel', tank.fuel, '%', tank.fuel != null && tank.fuel < BRANSLE_MIN)}
              {varde('AdBlue', tank.adblue, '%', tank.adblue != null && tank.adblue < ADBLUE_MIN)}
              {tank.rackvidd_km != null && (
                <span style={{ color: tank.rackvidd_km < RACKVIDD_MIN_KM ? C.orange : C.t2, fontWeight: tank.rackvidd_km < RACKVIDD_MIN_KM ? 700 : 400 }}>
                  Räckvidd ~{tank.rackvidd_km} km
                </span>
              )}
            </div>
          </div>
        </div>
        {tank.tid && (
          <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>Uppdaterad {tankAlder(tank.tid)}</div>
        )}
      </div>
    )
  }

  /** Platsraden under maskinnamnet i listan — tre ärliga tillstånd. */
  function platsRad(m: Maskin) {
    const f = platser.get(m.maskin_id)
    if (!f) {
      return (
        <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>
          {typLabel(m.maskin_typ)}
          {platserLaddar ? ' · hämtar plats …' : ' · Välj plats själv'}
        </div>
      )
    }
    const dampad = !!f.osaker
    return (
      <div style={{ fontSize: 13, color: dampad ? C.t3 : C.t2, marginTop: 2 }}>
        {f.namn} · {f.tidpunkt ? relativTid(f.tidpunkt) : 'vald plats'}
        {f.osaker === 'koordinat_orimlig' && <span style={{ color: C.orange }}> · plats osäker</span>}
        {f.osaker === 'gammal' && <span style={{ color: C.orange }}> · plats osäker</span>}
      </div>
    )
  }

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
            <div style={{ fontSize: 12, color: C.t3, fontWeight: 600 }}>Steg {STEG_NR[steg]} av 4</div>
          )}
        </div>

        {sparFel && (
          <div style={{
            background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.4)',
            borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 14,
          }}>{sparFel}</div>
        )}

        {/* ── STEG 0: Maskinlistan är startsidan ── */}
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

            {/* "Lastbilen är ute" — öppen auto-runda utan manuell övertagning.
                Diskret grå, inte en väntande flytt. Tar över när föraren lassar. */}
            {!laddar && lastbilUte && !dag && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 12px',
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13, color: C.t3,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>local_shipping</span>
                Lastbilen är ute — sedan {new Date(lastbilUte).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
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
                {/* Varning ska synas INNAN maskinvalet → kortet upp till toppen */}
                {tankVarning && tankKort()}
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>Vilken maskin flyttas?</h2>
                <p style={{ fontSize: 14, color: C.t3, margin: '0 0 16px' }}>
                  {dag ? 'Nästa flytt läggs på dagens körning.' : 'Dagen startar med första flytten.'}
                </p>

                {platserFel && (
                  <div style={{ background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.4)', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13 }}>
                    {platserFel} — välj plats manuellt i nästa steg.
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {maskiner.map(m => {
                    const f = platser.get(m.maskin_id)
                    const dampad = !f || !!f.osaker
                    return (
                      <button key={m.maskin_id} onClick={() => valjMaskin(m)} style={{
                        display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
                        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
                        padding: '16px 16px', cursor: 'pointer', fontFamily: ff, color: C.t1, width: '100%',
                        opacity: dampad ? 0.72 : 1,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 26, color: m.maskin_typ === 'Harvester' ? C.green : C.blue }}>
                          {m.maskin_typ === 'Harvester' ? 'forest' : 'local_shipping'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {maskinNamn(m)}
                            {m.extramaskin && (
                              <span style={{
                                fontSize: 11, fontWeight: 700, color: C.orange, border: `1px solid ${C.orange}`,
                                borderRadius: 6, padding: '1px 6px',
                              }}>Extra</span>
                            )}
                          </div>
                          {platsRad(m)}
                        </div>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.t3 }}>chevron_right</span>
                      </button>
                    )
                  })}
                  {maskiner.length === 0 && (
                    <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Inga aktiva maskiner i registret.</div>
                  )}
                </div>

                {/* Annat … — extern maskin/kunduppdrag. Diskret rad, inte en knapp
                    bland maskinerna. Kund samlas in här: DB-spärren kräver den. */}
                {!externOppen ? (
                  <button onClick={() => { setExternOppen(true); setKund('') }} style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginTop: 18,
                    background: 'transparent', border: 'none', padding: 0,
                    color: C.t3, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: ff,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
                    Annat …
                  </button>
                ) : (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginTop: 18 }}>
                    <div style={{ fontSize: 13, color: C.t3, marginBottom: 10 }}>
                      Annans maskin eller kunduppdrag — flytten faktureras.
                    </div>
                    <input
                      value={externNamn} onChange={e => setExternNamn(e.target.value)} autoFocus
                      placeholder='Maskin, t.ex. "Kalles John Deere 1210"'
                      style={{
                        width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`,
                        borderRadius: 10, padding: '11px 12px', fontSize: 15, color: C.t1, fontFamily: ff,
                        marginBottom: 8, outline: 'none',
                      }}
                    />
                    <input
                      value={kund} onChange={e => setKund(e.target.value)}
                      placeholder="Kund (krävs) …"
                      style={{
                        width: '100%', boxSizing: 'border-box', background: C.bg,
                        border: `1px solid ${kund.trim() ? C.border : 'rgba(255,159,10,0.5)'}`,
                        borderRadius: 10, padding: '11px 12px', fontSize: 15, color: C.t1, fontFamily: ff,
                        marginBottom: 10, outline: 'none',
                      }}
                    />
                    <button onClick={valjExternMaskin} disabled={!externNamn.trim() || !kund.trim()} style={{
                      width: '100%', background: C.blue, color: '#fff', border: 'none', borderRadius: 10,
                      padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: ff,
                      opacity: externNamn.trim() && kund.trim() ? 1 : 0.4,
                    }}>Fortsätt med denna maskin</button>
                  </div>
                )}

                {/* Fallback: öppna rundan manuellt utan att lasta (nedtonad — Lassat
                    öppnar rundan ändå; auto-rundan öppnas när bilen lämnar basen) */}
                {!dag && (
                  <button onClick={oppnaRundaUtanLast} disabled={sparar || !!tabellSaknas} style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, background: 'transparent',
                    border: 'none', padding: 0, color: C.t3, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    fontFamily: ff, opacity: sparar || tabellSaknas ? 0.5 : 1,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_circle</span>
                    Öppna runda utan att lasta
                  </button>
                )}

                {/* Tankstatus diskret nederst när allt är ok — bakgrundsinfo, inte ett beslut */}
                {!tankVarning && (
                  <div style={{ marginTop: 20 }}>{tankKort()}</div>
                )}

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

        {/* ── Lassat [maskin] — starta+hamta ihopslagna: kör dit, lasta, tryck ── */}
        {steg === 'hamta' && (maskin || externMaskin) && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>Lassa {aktivMaskinNamn}</h2>
            <p style={{ fontSize: 14, color: C.t3, margin: '0 0 16px' }}>
              Kör till maskinen, lasta den på flaket, och tryck Lassat — platsen tas från din GPS.
            </p>

            {/* Var maskinen står + Ändra */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: hamtplats?.koordinat && !hamtplats.osaker ? C.blue : C.t3 }}>location_on</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {hamtplats ? (
                    <>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{hamtplats.namn}</div>
                      <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>{hamtplats.tidpunkt ? `Här ${relativTid(hamtplats.tidpunkt)}` : 'Vald plats'}</div>
                    </>
                  ) : (<div style={{ fontSize: 15, fontWeight: 600, color: C.t2 }}>Ingen plats vald</div>)}
                </div>
                <button onClick={() => { setSok(''); setAndraOppen(true) }} style={lankStil}>Ändra</button>
              </div>
              {hamtplats?.osaker && (
                <div style={{ fontSize: 13, color: C.orange, marginTop: 10, display: 'flex', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
                  <span>{hamtplats.osaker === 'koordinat_orimlig'
                    ? 'Plats osäker — den sparade punkten ligger långt utanför området. Välj plats själv.'
                    : `Plats osäker — maskinen sågs här senast ${relativTid(hamtplats.tidpunkt!)}.`}</span>
                </div>
              )}
              {hamtplats && !hamtplats.koordinat && !hamtplats.osaker && (
                <div style={{ fontSize: 13, color: C.t3, marginTop: 10 }}>Platsen saknar koordinat — välj plats själv för vägbeskrivning.</div>
              )}
            </div>

            {hamtplats?.koordinat && <KartRuta lat={hamtplats.koordinat.lat} lng={hamtplats.koordinat.lng} />}
            {hamtplats?.koordinat && !hamtplats.osaker && navLank(hamtplats.koordinat.lat, hamtplats.koordinat.lng, hamtplats.namn, 'Navigera till maskinen')}

            {/* GPS-status + var appen tror du är (innan spar) */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, margin: '14px 0 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: gpsPos ? C.green : gpsFel ? C.red : C.t3 }}>my_location</span>
                <div style={{ flex: 1, fontSize: 14 }}>
                  {gpsHamtar && <span style={{ color: C.t3 }}>Hämtar färsk GPS-position …</span>}
                  {!gpsHamtar && gpsPos && <span>Position hittad <span style={{ color: C.t3 }}>(±{Math.round(gpsPos.accuracy)} m)</span></span>}
                  {!gpsHamtar && !gpsPos && gpsFel && <span style={{ color: C.red }}>{gpsFel}</span>}
                </div>
                {!gpsHamtar && <button onClick={hamtaGps} style={lankStil}>{gpsPos ? 'Uppdatera' : 'Försök igen'}</button>}
              </div>
              {!gpsHamtar && gpsPos && (
                <div style={{ fontSize: 12, marginTop: 10, paddingLeft: 32 }}>
                  <span style={{ color: C.t3 }}>{gpsPos.lat.toFixed(5)}, {gpsPos.lng.toFixed(5)}</span>
                  {hamtplats?.koordinat && (() => {
                    const avst = haversine(gpsPos.lat, gpsPos.lng, hamtplats.koordinat.lat, hamtplats.koordinat.lng)
                    const langt = avst > RIMLIG_AVSTAND_KM
                    return (<span style={{ color: langt ? C.orange : C.t3, fontWeight: langt ? 700 : 400 }}>{' · '}{avst < 1 ? '< 1' : `≈ ${Math.round(avst)}`} km från {hamtplats.namn}</span>)
                  })()}
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, color: C.t3, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>local_shipping</span>
              {tillkorningsText()}
            </div>

            <button onClick={hamtatTryck} disabled={!gpsPos || sparar || !!tabellSaknas} style={{
              ...storKnapp(C.green, '#000'), opacity: !gpsPos || sparar || tabellSaknas ? 0.4 : 1,
            }}>
              {sparar ? 'Sparar …' : `Lassat ${aktivMaskinNamn}`}
            </button>
            {tabellSaknas && (
              <p style={{ fontSize: 13, color: C.orange, marginTop: 10, textAlign: 'center' }}>Kan inte spara — migrationen är inte körd.</p>
            )}
          </>
        )}

        {/* ── STEG 3: Vart ska den? ── */}
        {steg === 'transport' && (maskin || externMaskin) && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>Vart ska {aktivMaskinNamn}?</h2>
            <p style={{ fontSize: 14, color: C.t3, margin: '0 0 14px' }}>
              Valfritt — välj för navigering och före avfärd-varning. Hoppar du över matchas platsen mot närmaste trakt när du lassar av.
            </p>

            {!valtObjekt && !tillPlats && (
              <>
                {/* Hoppbart: känd trakt = snabbt flöde, okänd = navigering + varning */}
                <button onClick={() => { setDest(null); setValtObjekt(null); setTillPlats(null); setSok(''); setSteg('bekrafta') }} style={{
                  ...storKnapp(C.card, C.t1), border: `1px solid ${C.border}`, fontSize: 15, padding: '14px 0', marginBottom: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.t3 }}>bolt</span>
                  Lasta av direkt — matcha vid framkomst
                </button>
                <PlatsValjare
                  sok={sok} setSok={setSok}
                  objekt={objektLista} objektFel={objektFel} omLaddaOm={laddaObjekt}
                  platser={flyttplatser}
                  onValjObjekt={valjObjekt} onValjPlats={valjTillPlats}
                  onNyPlats={() => setNyPlatsFor('till')}
                />
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

                  {/* Typen i klartext — ingen chip-rad i flödet */}
                  <div style={{ fontSize: 13, color: C.t3, marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span>
                      {flyttTyp === 'service' ? 'Blir serviceflytt — faktureras inte.'
                        : flyttTyp === 'kunduppdrag' ? `Kunduppdrag${kund.trim() ? ` för ${kund.trim()}` : ''} — faktureras.`
                        : flyttTyp === 'annat' ? 'Annat — faktureras inte.'
                        : 'Produktionsflytt.'}
                    </span>
                    <button onClick={() => setTypOppen(o => !o)} style={lankStil}>{typOppen ? 'Klar' : 'Ändra'}</button>
                  </div>

                  {typOppen && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(['produktion', 'service', 'kunduppdrag', 'annat'] as FlyttTyp[]).map(t => (
                          <button key={t} onClick={() => setFlyttTyp(t)} style={{
                            background: flyttTyp === t ? 'rgba(59,130,246,0.18)' : C.bg,
                            color: flyttTyp === t ? C.blue : C.t2,
                            border: `1px solid ${flyttTyp === t ? 'rgba(59,130,246,0.6)' : C.border}`,
                            borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700,
                            cursor: 'pointer', fontFamily: ff,
                          }}>{FLYTT_TYP_LABEL[t]}</button>
                        ))}
                      </div>
                      {flyttTyp === 'kunduppdrag' && (
                        <input
                          value={kund} onChange={e => setKund(e.target.value)} placeholder="Kund (krävs) …"
                          style={{
                            width: '100%', boxSizing: 'border-box', background: C.bg,
                            border: `1px solid ${kund.trim() ? C.border : 'rgba(255,159,10,0.5)'}`,
                            borderRadius: 10, padding: '11px 12px', fontSize: 15, color: C.t1, fontFamily: ff,
                            marginTop: 10, outline: 'none',
                          }}
                        />
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                    <button onClick={() => { setValtObjekt(null); setTillPlats(null); setDest(null); setTypOppen(false) }} style={{ ...lankStil, color: C.t2 }}>
                      Byt destination
                    </button>
                    <button onClick={() => setKartaOppen(true)} style={lankStil}>Justera på karta</button>
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

                {mapsKnapp(dest.lat, dest.lng, destNamn,
                  sparar ? 'Sparar …' : 'Starta transport', startaTransport, C.blue, '#fff')}
                {flyttTyp === 'kunduppdrag' && !kund.trim() && (
                  <p style={{ fontSize: 13, color: C.orange, marginTop: 8, textAlign: 'center' }}>
                    Kunduppdrag kräver kundnamn — fyll i det under &quot;Ändra&quot;.
                  </p>
                )}
              </div>
            )}

            {(valtObjekt || tillPlats) && !destHamtar && !dest && !kartaOppen && (
              <div style={{ background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.4)', borderRadius: 12, padding: 14, fontSize: 14 }}>
                {destNamn} saknar koordinat i alla källor.
                <button onClick={() => setKartaOppen(true)} style={{ ...lankStil, display: 'block', marginTop: 8 }}>
                  Peka ut platsen på kartan
                </button>
              </div>
            )}
          </>
        )}

        {/* ── STEG 4: Lassat av (matchar destination om ingen valts) ── */}
        {steg === 'bekrafta' && (maskin || externMaskin) && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>Lassat av {aktivMaskinNamn}?</h2>
            <p style={{ fontSize: 14, color: C.t3, margin: '0 0 20px' }}>
              Tryck när maskinen står avlastad — platsen tas från din GPS.
            </p>

            {dest ? (
              /* Destination vald (planerad ELLER matchad) — alltid synlig, ändringsbar */
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 13, color: C.t3 }}>Lämnad vid</div>
                  <button onClick={() => { setValtObjekt(null); setTillPlats(null); setDest(null); setSok(''); setSteg('transport') }} style={lankStil}>Ändra</button>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{destNamn}</div>
                {flyttTyp !== 'produktion' && (
                  <div style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
                    {flyttTyp === 'service' ? 'Serviceflytt — faktureras inte.'
                      : flyttTyp === 'kunduppdrag' ? `Kunduppdrag${kund.trim() ? ` för ${kund.trim()}` : ''} — faktureras.`
                      : 'Annat — faktureras inte.'}
                  </div>
                )}
                <a href={navUrl(dest.lat, dest.lng, destNamn)}
                  {...(navUrl(dest.lat, dest.lng, destNamn).startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, color: C.blue, fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: ff }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>near_me</span>
                  Öppna kartan igen
                </a>
              </div>
            ) : (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 20, fontSize: 14, color: C.t2 }}>
                Ingen destination vald — matchas mot närmaste trakt/plats inom 1 km när du trycker.
                Hittas ingen sparas den rå GPS-punkten (ändringsbar).
              </div>
            )}

            <button onClick={lamnatTryck} disabled={sparar || (flyttTyp === 'kunduppdrag' && !kund.trim())} style={{
              ...storKnapp(C.green, '#000'),
              opacity: sparar || (flyttTyp === 'kunduppdrag' && !kund.trim()) ? 0.4 : 1,
            }}>
              {sparar ? (dest ? 'Sparar …' : 'Matchar …') : 'Lassat av'}
            </button>
            {flyttTyp === 'kunduppdrag' && !kund.trim() && (
              <p style={{ fontSize: 13, color: C.orange, marginTop: 8, textAlign: 'center' }}>Kunduppdrag kräver kundnamn.</p>
            )}
            <p style={{ fontSize: 13, color: C.t3, marginTop: 10, textAlign: 'center' }}>
              Positionen tas från telefonens färska GPS.
            </p>
          </>
        )}

        {/* ── Flyttkortet — dagen fortsätter eller avslutas ── */}
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
                ['Flyttsträcka',
                  `${resultat.flyttKm} km (rutt)${resultat.flyttMatareKm != null ? ` · ${resultat.flyttMatareKm} km (mätare)` : ''}${
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
              {sparar ? 'Avslutar …' : 'Kör hem — avsluta'}
            </button>
            <Link href="/" style={{
              display: 'block', textAlign: 'center', marginTop: 14, color: C.t3,
              fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: ff,
            }}>Till startsidan (dagen fortsätter)</Link>
          </>
        )}

        {/* ── STEG 5: Sammanfattningen (ersätter pappret) ── */}
        {steg === 'dagKlart' && dagResultat && (
          <>
            <div style={{ textAlign: 'center', margin: '12px 0 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 56, color: C.blue }}>check_circle</span>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 0' }}>Dagen är klar</h2>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 12, color: C.t3, fontWeight: 700 }}>HELA KÖRNINGEN</div>
                <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{dagResultat.totalKm} km</div>
                <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>
                  {dagResultat.dagOgiltig ? 'tid ej sparad (över 16 tim)' : fmtMin(dagResultat.totalTidMin)}
                </div>
                {dagResultat.matareKm != null && (
                  <div style={{ fontSize: 13, color: C.t3, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>speed</span>
                    Mätare {dagResultat.odometerStale ? '~' : ''}{dagResultat.matareKm.toLocaleString('sv-SE')} km
                  </div>
                )}
              </div>
              <div style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 12, color: C.t3, fontWeight: 700 }}>FAKTURERBART</div>
                <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: dagResultat.fakturerbarKm > 0 ? C.green : C.t1 }}>
                  {dagResultat.fakturerbarKm} km
                </div>
                <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>
                  {dagResultat.fakturerbarAntal} av {dagResultat.antalFlyttar} {dagResultat.antalFlyttar === 1 ? 'flytt' : 'flyttar'}
                </div>
              </div>
            </div>

            {dagResultat.rader.length > 0 ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '4px 16px', marginBottom: 14 }}>
                {dagResultat.rader.map((r, i) => (
                  <div key={i} style={{
                    padding: '12px 0',
                    borderBottom: i < dagResultat.rader.length - 1 ? `1px solid ${C.border}` : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{r.maskin}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {r.km != null ? `${r.km} km` : '—'}
                        {r.tidMin != null && <span style={{ color: C.t3, fontWeight: 400 }}> · {fmtMin(r.tidMin)}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 3, alignItems: 'baseline' }}>
                      <div style={{ fontSize: 13, color: C.t3 }}>{r.fran} → {r.till}</div>
                      <div style={{
                        fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                        color: r.fakturerbar ? C.green : C.t3,
                      }}>
                        {r.fakturerbar ? 'Fakturerbar' : r.typ === 'service' ? 'Service' : r.typ === 'annat' ? 'Annat' : 'Ej fakturerbar'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: C.t3, fontSize: 14, padding: '8px 0 16px', textAlign: 'center' }}>
                Inga avslutade flyttar den här dagen.
              </div>
            )}

            <div style={{ fontSize: 13, color: C.t3, marginBottom: 16, lineHeight: 1.6 }}>
              Tillkörning {dagResultat.tillkorningKm != null ? `${dagResultat.tillkorningKm} km` : 'ej räknad'}
              {' · '}
              Hemresa {dagResultat.hemKm != null ? `${dagResultat.hemKm} km (beräknad)` : 'ej räknad'}
              {dagResultat.mellankorningKmSumma > 0 && ` · Mellankörning ${dagResultat.mellankorningKmSumma} km`}
            </div>

            {dagResultat.hemKm == null && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13 }}>
                {medarb ? (
                  <>
                    Hemresan kunde inte räknas utan hembas. Sätt den för nästa gång:
                    <button onClick={sattHembas} disabled={hembasSparar} style={{
                      ...lankStil, display: 'block', marginTop: 8, opacity: hembasSparar ? 0.5 : 1,
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

      {/* Rimlighetsvarning: GPS långt från förväntad plats. Blockerar aldrig —
          föraren väljer sin GPS eller den kända platsen. */}
      {posVarning && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1700, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: 20, maxWidth: 380, width: '100%', fontFamily: ff }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: C.orange }}>warning</span>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Är du på rätt plats?</div>
            </div>
            <div style={{ fontSize: 14, color: C.t2, lineHeight: 1.5, marginBottom: 18 }}>
              Din GPS-punkt ligger <b style={{ color: C.t1 }}>{posVarning.avstandKm} km</b> från {posVarning.namn}.
              {posVarning.steg === 'hamta' ? ' Står du vid maskinen?' : ' Är maskinen lämnad här?'}
            </div>
            <button onClick={() => valjPosVarning('gps')} style={{
              ...storKnapp(C.green, '#000'), fontSize: 15, padding: '15px 0', marginBottom: 10,
            }}>Använd min GPS-punkt</button>
            <button onClick={() => valjPosVarning('forvantad')} style={{
              ...storKnapp(C.card, C.t1), border: `1px solid ${C.border}`, fontSize: 15, padding: '15px 0',
            }}>Använd {posVarning.namn}s plats</button>
            <button onClick={() => setPosVarning(null)} style={{ ...lankStil, display: 'block', margin: '14px auto 0' }}>
              Avbryt
            </button>
          </div>
        </div>
      )}

      {/* "Ändra" på STEG 1 — samma sökbara lista som destinationsvalet */}
      {andraOppen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1400, background: C.bg, overflow: 'auto' }}>
          <div style={{
            padding: 'calc(10px + env(safe-area-inset-top)) 16px 10px',
            display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.border}`,
          }}>
            <button onClick={() => { setAndraOppen(false); setSok('') }} aria-label="Stäng" style={{ background: 'none', border: 'none', color: C.t2, padding: 6, cursor: 'pointer', display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>close</span>
            </button>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.t1, fontFamily: ff }}>Var står {aktivMaskinNamn}?</div>
          </div>
          <div style={{ maxWidth: 500, margin: '0 auto', padding: '16px 16px calc(32px + env(safe-area-inset-bottom))' }}>
            <PlatsValjare
              sok={sok} setSok={setSok}
              objekt={objektLista} objektFel={objektFel} omLaddaOm={laddaObjekt}
              platser={flyttplatser}
              onValjObjekt={andraTillObjekt} onValjPlats={andraTillPlats}
              onNyPlats={() => setNyPlatsFor('fran')}
            />
          </div>
        </div>
      )}

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
            if (nyPlatsFor === 'fran') andraTillPlats(pl)
            else valjTillPlats(pl)
            setNyPlatsFor(null)
          }}
          onStang={() => setNyPlatsFor(null)}
        />
      )}
    </div>
  )
}

// ── Objekt och flyttplatser i EN sökbar lista. Platser bär sin typ som tagg;
//    föraren ser platser, inte vilken tabell de kommer ur. ──
function PlatsValjare({ sok, setSok, objekt, objektFel, omLaddaOm, platser, onValjObjekt, onValjPlats, onNyPlats }: {
  sok: string
  setSok: (s: string) => void
  objekt: ObjektRad[] | null
  objektFel: string | null
  omLaddaOm: () => void
  platser: Flyttplats[]
  onValjObjekt: (o: ObjektRad) => void
  onValjPlats: (pl: Flyttplats) => void
  onNyPlats: () => void
}) {
  const rader = useMemo(() => {
    const t = sok.trim().toLowerCase()
    const o = (objekt || [])
      .filter(x => !t || x.namn.toLowerCase().includes(t) || (x.vo_nummer || '').toLowerCase().includes(t))
      .map(x => ({ sortNamn: x.namn, nod: 'objekt' as const, o: x }))
    const p = platser
      .filter(x => x.aktiv && (!t || x.namn.toLowerCase().includes(t)))
      .map(x => ({ sortNamn: x.namn, nod: 'plats' as const, pl: x }))
    return [...o, ...p].sort((a, b) => a.sortNamn.localeCompare(b.sortNamn, 'sv'))
  }, [objekt, platser, sok])

  return (
    <>
      <input
        value={sok} onChange={e => setSok(e.target.value)} placeholder="Sök objekt eller plats …"
        style={{
          width: '100%', boxSizing: 'border-box', background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: '12px 14px', fontSize: 15, color: C.t1, fontFamily: ff,
          marginBottom: 12, outline: 'none',
        }}
      />
      {objekt === null && !objektFel && (
        <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Laddar objekt …</div>
      )}
      {objektFel && (
        <div style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.4)', borderRadius: 12, padding: 14, fontSize: 14, marginBottom: 12 }}>
          {objektFel}
          <button onClick={omLaddaOm} style={{
            display: 'block', marginTop: 8, background: 'transparent', color: C.blue, border: 'none',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: ff, padding: 0,
          }}>Försök igen</button>
        </div>
      )}
      {objekt !== null && !objektFel && rader.length === 0 && (
        <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>
          {sok.trim() ? 'Inget matchar sökningen.' : 'Inga aktiva objekt eller sparade platser.'}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rader.map(r => r.nod === 'objekt' ? (
          <button key={`o-${r.o.id}`} onClick={() => onValjObjekt(r.o)} style={{
            display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: '14px 14px', cursor: 'pointer', fontFamily: ff, color: C.t1, width: '100%',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{r.o.namn}</div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
                {r.o.vo_nummer || '—'} · {r.o.status === 'pagaende' ? 'Pågående' : 'Planerad'}
              </div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.t3 }}>chevron_right</span>
          </button>
        ) : (
          <button key={`p-${r.pl.id}`} onClick={() => onValjPlats(r.pl)} style={{
            display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: '14px 14px', cursor: 'pointer', fontFamily: ff, color: C.t1, width: '100%',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.orange }}>
              {r.pl.typ === 'verkstad' ? 'build' : 'location_on'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{r.pl.namn}</div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{PLATS_TYP_LABEL[r.pl.typ]}</div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.t3 }}>chevron_right</span>
          </button>
        ))}
      </div>
      <button onClick={onNyPlats} style={{
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
}

// ── Liten kartruta: var maskinen står, innan föraren startar. Egen
//    LM-ortofotoproxy — ingen extern kart-embed (CSP + licens). ──
function KartRuta({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

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
              tiles: ['/api/forarkarta?layer=ortofoto&z={z}&x={x}&y={y}'],
              tileSize: 256,
              attribution: '© Lantmäteriet',
            },
          },
          layers: [{ id: 'sat-layer', type: 'raster', source: 'sat' }],
        },
        center: [lng, lat],
        zoom: 13,
        interactive: false,
        attributionControl: false,
      })
      mapRef.current = map
      new mlbre.Marker({ color: '#ff9f0a' }).setLngLat([lng, lat]).addTo(map)
    })
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [lat, lng])

  return (
    <div ref={containerRef} style={{
      height: 150, borderRadius: 14, overflow: 'hidden', marginBottom: 14,
      border: `1px solid ${C.border}`, background: C.card,
    }} />
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
            // Flygfoto: LM ortofoto via egen proxy. Esri borttagen (kräver ArcGIS-licens).
            sat: {
              type: 'raster',
              tiles: ['/api/forarkarta?layer=ortofoto&z={z}&x={x}&y={y}'],
              tileSize: 256,
              attribution: '© Lantmäteriet',
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
