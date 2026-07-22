// Var står maskinen? — appen slår upp det, föraren bekräftar.
//
// Två källor, ingen av dem ny: senaste AVSLUTADE flytt (där lastbilen faktiskt
// ställde maskinen) och senaste produktionsdagen i fakt_tid. Den senaste av dem
// vinner; lika dag → flytten, för den är den starkaste signalen.
//
// Två spärrar, båda dämpar men tystar aldrig — ett fel förslag är värre än
// inget förslag, men ett bortgömt förslag är också en lögn:
//   • koordinat längre bort än MAX_AVSTAND_KM från verksamheten behandlas som
//     saknad (dim_objekt innehåller punkter som pekar helt fel — t.ex.
//     "Hushållningssällskapet 2" på 60.61/16.69, 52 mil bort)
//   • objekt äldre än FARSK_DAGAR märks som osäkert med datum i klartext,
//     koordinaten finns kvar men föraren får trycka själv

import { supabase } from '@/lib/supabase'
import { haversine } from '@/utils/geo'

/** Verksamhetens mittpunkt (Kompersmåla) och hur långt bort en koordinat får
 *  ligga innan den är ett fel i stället för ett förslag. 15 mil — objekten
 *  ligger i Småland/Blekinge, och en felkoordinat i Skåne är lika oanvändbar
 *  för en lastbilskörning som en i Gävleborg. */
export const VERKSAMHET = { lat: 56.50, lng: 14.72 }
export const MAX_AVSTAND_KM = 150
export const FARSK_DAGAR = 30

export type PlatsKalla = 'flytt' | 'produktion' | 'manuell'
export type PlatsOsakerhet = 'gammal' | 'koordinat_orimlig'

export interface PlatsForslag {
  namn: string
  koordinat: { lat: number; lng: number } | null
  objektId: string | null   // objekt.id (uuid) → fran_objekt_id
  platsId: string | null    // flyttplats.id → fran_plats_id
  tidpunkt: string | null   // ISO-tid eller YYYY-MM-DD; null för manuellt val
  kalla: PlatsKalla
  osaker: PlatsOsakerhet | null
}

/** Ligger koordinaten inom räckhåll för en lastbilskörning härifrån? */
export function rimligKoordinat(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return haversine(VERKSAMHET.lat, VERKSAMHET.lng, lat, lng) <= MAX_AVSTAND_KM
}

/** Grovsållning av en GPS-fix: null-ön och punkter utanför Norden är trasiga
 *  mätningar, inte platser. Används för dagens startpunkt — hellre ingen
 *  tillkörning än en tillkörning räknad från en spökpunkt. */
export function rimligGpsPunkt(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat === 0 && lng === 0) return false
  return lat >= 54 && lat <= 71 && lng >= 4 && lng <= 32
}

/** YYYY-MM-DD i lokal tid — jämförbart som text. */
function dagAv(tidpunkt: string): string {
  return tidpunkt.length <= 10 ? tidpunkt : new Date(tidpunkt).toLocaleDateString('sv-SE')
}

export function dagarSedan(tidpunkt: string): number {
  const then = new Date(`${dagAv(tidpunkt)}T00:00:00`)
  const nu = new Date()
  const idag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate())
  return Math.round((idag.getTime() - then.getTime()) / 86400000)
}

/** "idag" / "igår" / "för 4 dagar sedan" / "11 mars" / "11 mars 2025". */
export function relativTid(tidpunkt: string): string {
  const d = dagarSedan(tidpunkt)
  if (d <= 0) return 'idag'
  if (d === 1) return 'igår'
  if (d < 7) return `för ${d} dagar sedan`
  const dt = new Date(`${dagAv(tidpunkt)}T00:00:00`)
  const format: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
  if (dt.getFullYear() !== new Date().getFullYear()) format.year = 'numeric'
  return dt.toLocaleDateString('sv-SE', format)
}

interface ObjektKoordRad {
  id: string
  namn: string
  vo_nummer: string | null
  dim_objekt_id: string | null
  lat: number | null
  lng: number | null
  larmkoordinat_lat: number | null
  larmkoordinat_lng: number | null
  larmkoordinat_bekraftad: boolean
}

const OBJEKT_KOORD_FALT =
  'id, namn, vo_nummer, dim_objekt_id, lat, lng, larmkoordinat_lat, larmkoordinat_lng, larmkoordinat_bekraftad'

/** Samma fallback-kedja som flödet redan använder, utan extra rundtur:
 *  bekräftad larmkoordinat → objektets egen punkt → dim_objekt. */
function koordinatFor(o: ObjektKoordRad, dim: { latitude: number | null; longitude: number | null } | undefined) {
  if (o.larmkoordinat_bekraftad && o.larmkoordinat_lat != null && o.larmkoordinat_lng != null) {
    return { lat: o.larmkoordinat_lat, lng: o.larmkoordinat_lng }
  }
  if (o.lat != null && o.lng != null) return { lat: o.lat, lng: o.lng }
  if (dim?.latitude != null && dim?.longitude != null) return { lat: dim.latitude, lng: dim.longitude }
  return null
}

/** Lägger på de två spärrarna. Koordinatspärren väger tyngst — en punkt som
 *  pekar fel ska aldrig nå en Maps-knapp, hur färsk den än är. */
export function tillampaSparrar(f: Omit<PlatsForslag, 'osaker'>): PlatsForslag {
  if (f.koordinat && !rimligKoordinat(f.koordinat.lat, f.koordinat.lng)) {
    return { ...f, koordinat: null, osaker: 'koordinat_orimlig' }
  }
  if (f.tidpunkt && dagarSedan(f.tidpunkt) > FARSK_DAGAR) return { ...f, osaker: 'gammal' }
  return { ...f, osaker: null }
}

/**
 * Senast kända plats per maskin. Returnerar bara maskiner där något gick att
 * slå upp — övriga får välja plats själva i vyn.
 *
 * `fel` är satt när uppslaget inte kunde göras alls (nätverk/RLS). Tomt
 * resultat utan `fel` betyder "vi vet inte var de står", vilket är en giltig
 * och helt annan sak.
 */
export async function hamtaSenastePlatser(
  maskinIds: string[],
): Promise<{ platser: Map<string, PlatsForslag>; fel: string | null }> {
  const platser = new Map<string, PlatsForslag>()
  if (maskinIds.length === 0) return { platser, fel: null }

  const [flyttRes, ...tidRes] = await Promise.all([
    supabase.from('maskin_flytt')
      .select('maskin_id, sluttid, till_objekt_id, till_plats_id, till_lat, till_lng')
      .in('maskin_id', maskinIds)
      .not('sluttid', 'is', null).eq('avbruten', false)
      .order('sluttid', { ascending: false })
      .limit(200),
    ...maskinIds.map(id => supabase.from('fakt_tid')
      .select('datum, objekt_id, processing_sek, terrain_sek')
      .eq('maskin_id', id).not('objekt_id', 'is', null)
      .order('datum', { ascending: false })
      .limit(20)),
  ])

  const fel = [flyttRes.error, ...tidRes.map(r => r.error)].find(Boolean)
  if (fel && !flyttRes.data && tidRes.every(r => !r.data)) {
    return { platser, fel: `Kunde inte slå upp maskinernas platser: ${fel.message}` }
  }

  // Senaste avslutade flytt per maskin (listan är redan sorterad fallande)
  const sensteFlytt = new Map<string, any>()
  for (const r of flyttRes.data || []) {
    if (r.maskin_id && !sensteFlytt.has(r.maskin_id)) sensteFlytt.set(r.maskin_id, r)
  }

  // Senaste produktionsdag per maskin — bland dagens rader vinner den med mest
  // G15-tid, aldrig "första raden vi råkade få"
  const senasteProd = new Map<string, { datum: string; objekt_id: string }>()
  maskinIds.forEach((id, i) => {
    const rader = tidRes[i].data || []
    if (!rader.length) return
    const datum = rader[0].datum
    let bast = rader[0]
    for (const r of rader) {
      if (r.datum !== datum) break
      if ((r.processing_sek || 0) + (r.terrain_sek || 0) > (bast.processing_sek || 0) + (bast.terrain_sek || 0)) bast = r
    }
    senasteProd.set(id, { datum, objekt_id: String(bast.objekt_id) })
  })

  const objektUuids = Array.from(new Set((flyttRes.data || []).map(r => r.till_objekt_id).filter(Boolean))) as string[]
  const platsUuids = Array.from(new Set((flyttRes.data || []).map(r => r.till_plats_id).filter(Boolean))) as string[]
  const prodNycklar = Array.from(new Set(Array.from(senasteProd.values()).map(p => p.objekt_id)))

  const [objDirekt, platsRes, objViaDim, objViaVo, dimRes] = await Promise.all([
    objektUuids.length
      ? supabase.from('objekt').select(OBJEKT_KOORD_FALT).in('id', objektUuids)
      : Promise.resolve({ data: [] as any[] }),
    platsUuids.length
      ? supabase.from('flyttplats').select('id, namn, typ, lat, lng').in('id', platsUuids)
      : Promise.resolve({ data: [] as any[] }),
    prodNycklar.length
      ? supabase.from('objekt').select(OBJEKT_KOORD_FALT).in('dim_objekt_id', prodNycklar)
      : Promise.resolve({ data: [] as any[] }),
    prodNycklar.length
      ? supabase.from('objekt').select(OBJEKT_KOORD_FALT).in('vo_nummer', prodNycklar)
      : Promise.resolve({ data: [] as any[] }),
    prodNycklar.length
      ? supabase.from('dim_objekt').select('objekt_id, object_name, latitude, longitude').in('objekt_id', prodNycklar)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const objPerId = new Map<string, ObjektKoordRad>((objDirekt.data || []).map((o: any) => [o.id, o]))
  const platsPerId = new Map<string, any>((platsRes.data || []).map((p: any) => [p.id, p]))
  const dimPerNyckel = new Map<string, any>((dimRes.data || []).map((d: any) => [String(d.objekt_id), d]))
  // dim_objekt_id är den exakta kopplingen; vo_nummer är fallback när den saknas
  const objPerNyckel = new Map<string, ObjektKoordRad>()
  for (const o of (objViaVo.data || []) as ObjektKoordRad[]) if (o.vo_nummer) objPerNyckel.set(o.vo_nummer, o)
  for (const o of (objViaDim.data || []) as ObjektKoordRad[]) if (o.dim_objekt_id) objPerNyckel.set(o.dim_objekt_id, o)

  for (const maskinId of maskinIds) {
    const f = sensteFlytt.get(maskinId)
    const p = senasteProd.get(maskinId)

    // Lika dag → flytten vinner: det är där lastbilen faktiskt ställde maskinen
    const flyttVinner = f && (!p || dagAv(f.sluttid) >= p.datum)

    if (flyttVinner) {
      const o = f.till_objekt_id ? objPerId.get(f.till_objekt_id) : undefined
      const pl = f.till_plats_id ? platsPerId.get(f.till_plats_id) : undefined
      platser.set(maskinId, tillampaSparrar({
        namn: o?.namn ?? pl?.namn ?? 'Senast lämnad plats',
        koordinat: f.till_lat != null && f.till_lng != null ? { lat: f.till_lat, lng: f.till_lng } : null,
        objektId: f.till_objekt_id ?? null,
        platsId: f.till_plats_id ?? null,
        tidpunkt: f.sluttid,
        kalla: 'flytt',
      }))
      continue
    }

    if (!p) continue
    const o = objPerNyckel.get(p.objekt_id)
    const dim = dimPerNyckel.get(p.objekt_id)
    if (o) {
      platser.set(maskinId, tillampaSparrar({
        namn: o.namn,
        koordinat: koordinatFor(o, dim),
        objektId: o.id,
        platsId: null,
        tidpunkt: p.datum,
        kalla: 'produktion',
      }))
    } else if (dim?.object_name) {
      // Objektet finns bara i maskindatan — namnet duger, men det finns ingen
      // objekt-rad att koppla flytten till (fran_objekt_id förblir null)
      platser.set(maskinId, tillampaSparrar({
        namn: dim.object_name,
        koordinat: dim.latitude != null && dim.longitude != null
          ? { lat: dim.latitude, lng: dim.longitude } : null,
        objektId: null,
        platsId: null,
        tidpunkt: p.datum,
        kalla: 'produktion',
      }))
    }
  }

  return { platser, fel: null }
}
