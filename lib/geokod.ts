// ─────────────────────────────────────────────────────────────
// GEOKODNING AV HEMADRESSEN — EN väg för admin, förarens Inställningar och
// nattjobbet. Kartleverantör = OpenRouteService (samma nyckel och samma
// leverantör som km-beräkningen i lib/routing), sökning begränsad till Sverige.
//
// Tre regler (migration 20260929_medarbetare_hem_geokod):
//  1. En gps/manuell punkt skrivs ALDRIG över automatiskt (hem_koord_kalla,
//     samma skydd som arbetsdag.km_kalla). Bara `tvinga` — admin som
//     uttryckligen trycker "geokoda adressen ändå" — får göra det.
//  2. Bara en träff på ADRESSNIVÅ används automatiskt. En landsbygdsadress som
//     hamnar i tätortens mitt (Idekulla 6 → Ryd) ger fel km varje dag utan att
//     någon märker det; den blir 'osaker', förslaget sparas och visas i admin,
//     och admin väljer "använd ändå" eller sätter punkten med GPS.
//  3. Vad adressen hamnade på (etikett, precision, punkt) sparas alltid — så
//     det går att se, inte bara lita på.
//  4. En geokodad punkt är OBEKRÄFTAD tills admin sett den på kartan (lib/hempunkt:
//     "Stämmer" eller "Flytta punkten"). Km-beräkningen får använda den, men den
//     märks. Landsbygdsadresser geokodar ofta bara till byn.
// Ren beslutslogik (byggGeokodUppdatering) + tunn I/O (geokodaAdress,
// geokodaMedarbetare). Testas i lib/geokod.test.ts.
// ─────────────────────────────────────────────────────────────

export type GeokodTraff = {
  ok: true
  lat: number
  lng: number
  etikett: string
  /** ORS/Pelias-lager: address, venue, street, neighbourhood, locality, postalcode, … */
  precision: string
}
export type GeokodFel = { ok: false; fel: string }
export type GeokodSvar = GeokodTraff | GeokodFel

/** Lager som räknas som adressnivå — används automatiskt. */
export const EXAKTA_LAGER = ["address", "venue"] as const

/**
 * Källor som är ortnamnsregister, inte adresser. Deras punkter är byns/gårdsnamnets mittpunkt även när lagret heter
 * "venue" (Kompersmåla Gård 362 96 → geonames FRM, 14.78333/56.38333, ca 1 km från gården, mitt i skogen).
 */
export const ORTNAMNSKALLOR = ["geonames", "whosonfirst"] as const

/** Svenska ord för precisionen, för admin och föraren. */
export function precisionText(precision: string | null | undefined): string {
  switch (precision) {
    case "address": return "exakt adress"
    case "venue": return "exakt plats"
    case "street": return "bara gatan"
    case "neighbourhood": return "bara området"
    case "locality": case "localadmin": return "bara orten"
    case "postalcode": return "bara postnumret"
    case "county": case "region": return "bara länet"
    default: return precision ? `ungefärlig (${precision})` : "okänd precision"
  }
}

/** Tolka ORS /geocode/search-svaret (GeoJSON). Ren funktion. */
export function tolkaGeokodSvar(json: any): GeokodSvar {
  const f = json?.features?.[0]
  const c = f?.geometry?.coordinates
  if (!f || !Array.isArray(c) || c.length < 2) return { ok: false, fel: "Adressen hittades inte" }
  const lng = Number(c[0]), lat = Number(c[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, fel: "Adressen hittades inte" }
  const lager = String(f.properties?.layer || "")
  // Ett venue/address ur ett ortnamnsregister är bara orten: sparas aldrig med adressens precision.
  const fran = String(f.properties?.source || "")
  const precision = (ORTNAMNSKALLOR as readonly string[]).includes(fran) && (EXAKTA_LAGER as readonly string[]).includes(lager) ? "locality" : lager
  return { ok: true, lat, lng, etikett: String(f.properties?.label || ""), precision }
}

export type HemRad = {
  hemadress: string | null
  hem_lat: number | null
  hem_lng: number | null
  hem_koord_kalla: string | null
  hem_geokod_lat?: number | null
  hem_geokod_lng?: number | null
}

/** Är den befintliga punkten skyddad (gps/manuell, eller satt utan källa)? */
export function punktSkyddad(r: HemRad): boolean {
  return r.hem_lat != null && r.hem_lng != null && r.hem_koord_kalla !== "geokod"
}

/**
 * Vad som ska skrivas på raden efter ett geokodsvar. Ren funktion — hela
 * regelverket bor här. `svar` null = ingen geokodning gjordes (skyddad punkt).
 */
export function byggGeokodUppdatering(
  rad: HemRad,
  svar: GeokodSvar | null,
  opt: { tvinga?: boolean; nu: string },
): Record<string, unknown> {
  if (svar === null) {
    return { hem_geokod_status: "hoppad", hem_geokod_tid: opt.nu }
  }
  if (!svar.ok) {
    return { hem_geokod_status: "misslyckad", hem_geokod_etikett: svar.fel, hem_geokod_precision: null, hem_geokod_lat: null, hem_geokod_lng: null, hem_geokod_tid: opt.nu }
  }
  const bas = { hem_geokod_etikett: svar.etikett, hem_geokod_precision: svar.precision, hem_geokod_lat: svar.lat, hem_geokod_lng: svar.lng, hem_geokod_tid: opt.nu }
  const exakt = (EXAKTA_LAGER as readonly string[]).includes(svar.precision)
  const farSkriva = !punktSkyddad(rad) || !!opt.tvinga
  if (exakt && farSkriva) {
    // hem_bekraftad_tid null: en ny punkt har ingen sett, även om en tidigare var bekräftad.
    return { ...bas, hem_lat: svar.lat, hem_lng: svar.lng, hem_koord_kalla: "geokod", hem_geokod_status: "klar", hem_bekraftad_tid: null }
  }
  // Grövre än adress, eller skyddad punkt vid tvingad körning med grov träff:
  // förslaget sparas, punkten rörs inte. Admin avgör.
  return { ...bas, hem_geokod_status: "osaker" }
}

/** Anropa ORS. Fel ger { ok:false } — aldrig ett tyst tomt svar. */
export async function geokodaAdress(adress: string): Promise<GeokodSvar> {
  const key = process.env.ORS_API_KEY
  if (!key) return { ok: false, fel: "Geokodning ej konfigurerad (ORS_API_KEY saknas)" }
  const url = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(key)}&text=${encodeURIComponent(adress)}&boundary.country=SE&size=1`
  try {
    const r = await fetch(url, { cache: "no-store" })
    if (!r.ok) return { ok: false, fel: `Kartleverantören svarade ${r.status}` }
    return tolkaGeokodSvar(await r.json())
  } catch (e: any) {
    return { ok: false, fel: `Kartleverantören svarade inte (${e?.message || e})` }
  }
}

export type GeokodResultat = { status: string; etikett: string | null; precision: string | null } | { fel: string }

/**
 * Geokoda en medarbetares hemadress och skriv resultatet. Klienten måste kunna
 * skriva raden (service-roll i routes/nattjobb). Läser tillbaka det skrivna.
 */
export async function geokodaMedarbetare(
  supabase: any,
  id: string,
  opt: { tvinga?: boolean } = {},
): Promise<GeokodResultat> {
  const KOL = "id, hemadress, hem_lat, hem_lng, hem_koord_kalla"
  const { data: rad, error } = await supabase.from("medarbetare").select(KOL).eq("id", id).maybeSingle()
  if (error) return { fel: error.message }
  if (!rad) return { fel: "Medarbetaren finns inte" }
  const nu = new Date().toISOString()
  if (!rad.hemadress || !String(rad.hemadress).trim()) return { fel: "Hemadress saknas" }
  const svar = punktSkyddad(rad) && !opt.tvinga ? null : await geokodaAdress(String(rad.hemadress))
  const upd = byggGeokodUppdatering(rad, svar, { tvinga: opt.tvinga, nu })
  const { data: skrivet, error: skrivFel } = await supabase.from("medarbetare").update(upd).eq("id", id)
    .select("hem_geokod_status, hem_geokod_etikett, hem_geokod_precision").maybeSingle()
  if (skrivFel) return { fel: skrivFel.message }
  if (!skrivet) return { fel: "Inget sparades (raden träffades inte)" }
  return { status: skrivet.hem_geokod_status, etikett: skrivet.hem_geokod_etikett, precision: skrivet.hem_geokod_precision }
}
