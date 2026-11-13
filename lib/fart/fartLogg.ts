/**
 * Tyst fartmätning hos alla (Martin 2026-11-13: "jag vill se vad det är som tar tid när medarbetarna använder appen" — och
 * "förarna ska inte se att vi gör det på skärmen"). INGENTING ritas. Fyra sorters rader samlas i minnet och skickas i klump till
 * tabellen fart_logg (components/FartLoggStartare.tsx):
 *   sida  = appen öppnad: tiden tills första sidan var ritad
 *   byte  = byte av vy: från trycket tills den nya vyn var ritad
 *   anrop = ett anrop till databasen eller servern som tog lång tid
 *   karta = byte av lager eller bakgrund i planeringen (samma tre tal som fartmätarens ruta)
 * Per ENHET och MASKIN — aldrig per person. Adresser sparas utan frågedel och utan id:n, så inget innehåll följer med.
 */
import { arKartruta, type Matning, FART_MAX_MS } from './fartMatare'

export type FartSlag = 'sida' | 'byte' | 'anrop' | 'karta'
export interface FartRad { slag: FartSlag; namn: string; ms: number; vy: string; detalj?: Record<string, number | string | null> }

/** Under den här tiden sparas ingenting (utom 'sida', som är en rad per appstart). */
export const FART_SPARA_FRAN_MS = 500
/** Så många rader får vänta på enheten; fler än så kastas de äldsta. */
export const FART_KO_MAX = 200
/** Ett tryck äldre än så här hör inte till vybytet. */
export const BYTE_TRYCK_MAX_MS = 10_000

const ID = /^(\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[A-Za-z0-9_-]{24,})$/
/** Vyn utan id:n: /gallring/11271849 → /gallring/:id. */
export function vyNamn(sokvag: string): string {
  const delar = (sokvag || '/').split('?')[0].split('/').filter(Boolean).map((d) => (ID.test(d) ? ':id' : d))
  return '/' + delar.join('/')
}

/**
 * Anropets namn utan innehåll: "db:objekt", "rpc:helikopter_ny_klar", "lagring", "/api/lon/arbetstid", annars värdnamnet.
 * null = ska inte loggas (kartrutor mäts för sig, och mätningens egen tabell).
 */
export function anropNamn(url: string, egen: string): string | null {
  let u: URL
  try { u = new URL(url, egen) } catch { return null }
  if (arKartruta(url)) return null
  const p = u.pathname
  let m = /\/rest\/v1\/rpc\/([^/?]+)/.exec(p)
  if (m) return `rpc:${m[1]}`
  m = /\/rest\/v1\/([^/?]+)/.exec(p)
  if (m) return m[1] === 'fart_logg' ? null : `db:${m[1]}`
  if (/\/storage\/v1\//.test(p)) return 'lagring'
  if (/\/auth\/v1\//.test(p)) return 'inloggning'
  if (u.origin === egen) return p.startsWith('/api/') ? vyNamn(p) : null   // sidans egna filer (js, css, bilder) är inte anrop
  return u.hostname
}

/** Kartmätningen som en rad; null när den gick fort. Kartan som aldrig blev klar räknas som FART_MAX_MS. */
export function kartRad(m: Matning, vy: string): FartRad | null {
  const ms = (m.sidanMs ?? 0) + (m.rutornaMs ?? FART_MAX_MS)
  if (ms < FART_SPARA_FRAN_MS) return null
  return { slag: 'karta', namn: m.vad, ms, vy, detalj: { sidan: m.sidanMs, rutorna: m.rutornaMs, rutor: m.rutor, langstaRuta: m.langstaRutaMs, bildruta: m.langstaBildrutaMs } }
}

/** Enheten i ord — aldrig en person. */
export function enhetNamn(bredd: number, pek: boolean): string {
  if (bredd < 700) return 'telefon'
  return pek ? 'pekskärm' : 'dator'
}

// ── Kön (bara minnet: en rad som inte hinner skickas innan appen stängs är inte värd att spara) ──────────────────────────────
const ko: FartRad[] = []
export function laggTill(rad: FartRad | null): void {
  if (!rad || !Number.isFinite(rad.ms) || rad.ms < 0) return
  ko.push({ ...rad, ms: Math.round(rad.ms) })
  if (ko.length > FART_KO_MAX) ko.splice(0, ko.length - FART_KO_MAX)
}
export function koLangd(): number { return ko.length }
/** Tar allt som väntar. Går sändningen fel läggs det tillbaka med `aterlagg`. */
export function taAllt(): FartRad[] { return ko.splice(0, ko.length) }
export function aterlagg(rader: FartRad[]): void { ko.unshift(...rader); if (ko.length > FART_KO_MAX) ko.splice(0, ko.length - FART_KO_MAX) }
