// ─────────────────────────────────────────────────────────────
// HEMPUNKTEN PÅ KARTAN — vad kartan ska visa, vad som är obekräftat och skrivningen när admin svarar.
//
// En geokodad punkt är OBEKRÄFTAD tills admin sett den på kartan och tryckt "Stämmer" (källan förblir 'geokod', stämpel i
// hem_bekraftad_tid) eller flyttat den (källan blir 'manuell'). En punkt som en människa redan satt (manuell, GPS) är
// bekräftad utan stämpel. Km-beräkningen får använda en obekräftad punkt, men den märks.
//
// Byns mittpunkt får aldrig bli en "bekräftad" geokodad punkt: precision grövre än adress betyder att admin måste sätta
// punkten på huset. Annars vore en kryssad ruta falsk precision (Kompersmåla Gård 362 96 → byn, ca 1 km från gården).
// Ren logik + en tunn skrivning. Testas i lib/hempunkt.test.ts.
// ─────────────────────────────────────────────────────────────
import { EXAKTA_LAGER } from "./geokod"

export const HITTADE_BARA_BYN = "Hittade bara byn. Tryck på huset."

export type HemPunktRad = {
  hem_lat: number | null
  hem_lng: number | null
  hem_koord_kalla: string | null
  hem_bekraftad_tid?: string | null
  hem_geokod_status?: string | null
  hem_geokod_etikett?: string | null
  hem_geokod_precision?: string | null
  hem_geokod_lat?: number | null
  hem_geokod_lng?: number | null
}

export type HempunktLage =
  | { typ: "ingen" }
  /** Ingen punkt än, men geokodaren gav ett förslag (bara byn/orten). Admin sätter punkten på huset. */
  | { typ: "forslag"; lat: number; lng: number; etikett: string; grov: true }
  | { typ: "punkt"; lat: number; lng: number; etikett: string; kalla: string; grov: boolean; bekraftad: boolean }

/**
 * Geokodarens etikett som människor läser den: utan landskod (länet "KR") och engelska ("Sweden").
 * "Kompersmåla, Almundsryd, KR, Sweden" → "Kompersmåla, Almundsryd".
 */
export function rensaEtikett(etikett: string | null | undefined): string {
  const delar = String(etikett ?? "").split(",").map(d => d.trim()).filter(Boolean)
  if (delar.length && /^(sweden|sverige)$/i.test(delar[delar.length - 1])) delar.pop()
  if (delar.length > 1 && /^[A-ZÅÄÖ]{1,3}$/.test(delar[delar.length - 1])) delar.pop()
  return delar.join(", ")
}

/** Är precisionen grövre än adressnivå? Ingen precision alls (satt för hand) är inte grov. */
export function arGrovPrecision(precision: string | null | undefined): boolean {
  return !!precision && !(EXAKTA_LAGER as readonly string[]).includes(precision)
}

export function hempunktLage(r: HemPunktRad): HempunktLage {
  const geokodEtikett = rensaEtikett(r.hem_geokod_etikett)
  if (r.hem_lat != null && r.hem_lng != null) {
    const kalla = r.hem_koord_kalla || "manuell"
    const geokodad = kalla === "geokod"
    // Etiketten är geokodarens GISSNING: den visas bara när punkten kommer från geokodningen. Raden behåller förslaget
    // även sedan admin satt punkten för hand, och då är det inte längre sant att punkten ligger där.
    const etikett = geokodad ? geokodEtikett : ""
    const grov = geokodad && arGrovPrecision(r.hem_geokod_precision)
    // En grov geokodad punkt kan aldrig vara bekräftad: stämpeln gäller bara en punkt admin faktiskt kunde stämma av.
    const bekraftad = geokodad ? !!r.hem_bekraftad_tid && !grov : true
    return { typ: "punkt", lat: r.hem_lat, lng: r.hem_lng, etikett, kalla, grov, bekraftad }
  }
  if (r.hem_geokod_lat != null && r.hem_geokod_lng != null) {
    return { typ: "forslag", lat: r.hem_geokod_lat, lng: r.hem_geokod_lng, etikett: geokodEtikett, grov: true }
  }
  return { typ: "ingen" }
}

/** Geokodad punkt som ingen har bekräftat eller flyttat. Det som hamnar i Att åtgärda. */
export function arObekraftad(r: HemPunktRad): boolean {
  const l = hempunktLage(r)
  return l.typ === "punkt" && l.kalla === "geokod" && !l.bekraftad
}

/** Bara en punkt inom Sverige sparas (grov ram, fångar 0,0 och omkastade värden). */
export function validerPunkt(lat: unknown, lng: unknown): boolean {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= 55 && lat <= 69.5 && lng >= 10.5 && lng <= 24.5
}

export type BekraftaAtgard = { atgard: "stammer" } | { atgard: "flytta"; lat: number; lng: number }
export type BekraftaSvar = { ok: true } | { ok: false; fel: string }

/**
 * Admin svarar på kartan. `stammer` stämplar den geokodade punkten; `flytta` sätter en ny punkt (manuell, bekräftad).
 * Klienten måste kunna skriva raden (service-roll i routen). Skrivningen läses tillbaka: 0 rader är ett fel.
 */
export async function bekraftaHempunkt(supabase: any, id: string, a: BekraftaAtgard, nu: string): Promise<BekraftaSvar> {
  let upd: Record<string, unknown>
  if (a.atgard === "flytta") {
    if (!validerPunkt(a.lat, a.lng)) return { ok: false, fel: "Punkten ligger inte i Sverige. Tryck på kartan där huset ligger." }
    upd = { hem_lat: a.lat, hem_lng: a.lng, hem_koord_kalla: "manuell", hem_bekraftad_tid: nu, hem_geokod_status: null }
  } else {
    const { data: rad, error } = await supabase.from("medarbetare")
      .select("hem_lat, hem_lng, hem_koord_kalla, hem_geokod_precision").eq("id", id).maybeSingle()
    if (error) return { ok: false, fel: error.message }
    if (!rad) return { ok: false, fel: "Medarbetaren finns inte" }
    if (rad.hem_lat == null || rad.hem_lng == null) return { ok: false, fel: "Det finns ingen punkt att bekräfta." }
    if (rad.hem_koord_kalla === "geokod" && arGrovPrecision(rad.hem_geokod_precision)) return { ok: false, fel: HITTADE_BARA_BYN }
    upd = { hem_bekraftad_tid: nu }
  }
  const { data, error } = await supabase.from("medarbetare").update(upd).eq("id", id).select("id").maybeSingle()
  if (error) return { ok: false, fel: error.message }
  if (!data) return { ok: false, fel: "Inget sparades (raden träffades inte)" }
  return { ok: true }
}
