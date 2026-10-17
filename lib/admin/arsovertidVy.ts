// ─────────────────────────────────────────────────────────────
// ÅRSÖVERTID I ADMIN — EN FRÅGA: hur nära taket (250 tim/år) är varje förare?
//
// Vyn visar BARA avtalets modell (Skogsavtalet §5 mom 2: genomsnitt över en beräkningsperiod om högst 16 veckor, fältet
// `modeller.genomsnitt`). De tre andra modellerna (Vardagar × 8, Arbetade dagar × 8, Över 40 tim/vecka) finns kvar i
// lib/lonesystem/arsovertid och i API-svaret, men visas inte: de svarade på andra frågor och fick siffrorna att se ut som
// tre olika svar på samma sak. Talen här är EXAKT kolumnen "Genomsnitt" som kortet visade förut (Stefan 74,5, övriga 0).
//
// Ren uppbyggnad: Löne-fliken (kortet) och Översikten (raden vid 200 tim) läser samma funktion.
// ─────────────────────────────────────────────────────────────
import { isoVecka } from "@/lib/vilobrott"

export const STANDARD_TAK_H = 250
/** Orange börjar så här många timmar under taket (taket 250 → över 200). */
export const VARNING_UNDER_TAK_H = 50

export type ArsovertidSvar = {
  ok: boolean
  meddelande?: string
  ar?: number
  tak?: number
  tomDatum?: string
  medarbetare?: { medarbetare_id: string; namn: string | null; timmar: number; modeller: Record<string, number>; perioder?: any[]; basavdrag?: { franvaroTimmar: number; rodaTimmar: number } }[]
  utjamning?: { startdatum: string; slutdatum: string; medarbetare_id?: string | null; anteckning?: string | null }[]
  utjamning_fel?: string | null
  /** Frånvaron kunde inte läsas: basen drogs inte för frånvaro, så talen räknades utan den och är för LÅGA. */
  franvaro_fel?: string | null
}

/** Kortet visar bara förare som kommit halvvägs till taket. Sju rader "0 av 250 tim" svarade inte på frågan "vem närmar sig taket?". */
export const VISA_FRAN_ANDEL = 0.5

export type Niva = "noll" | "lugn" | "varning" | "over"

export type ArsovertidRad = {
  id: string
  namn: string
  /** Avtalets modell: timmar övertid hittills i år. */
  timmar: number
  tak: number
  /** 0–1, kapad vid 1: stapelns längd. */
  andel: number
  niva: Niva
}

/** Grå normalt, orange över (tak − 50), röd över taket. Noll visas dämpad. */
export function arsovertidNiva(timmar: number, tak: number = STANDARD_TAK_H): Niva {
  if (!(timmar > 0)) return "noll"
  if (timmar > tak) return "over"
  if (timmar > tak - VARNING_UNDER_TAK_H) return "varning"
  return "lugn"
}

/** "74,5", "0", "200": svensk decimalkomma, en decimal, ingen avslutande ",0". */
export function timmarText(timmar: number): string {
  return String(Math.round(timmar * 10) / 10).replace(".", ",")
}

export function arsovertidRader(svar: ArsovertidSvar | null | undefined): ArsovertidRad[] {
  if (!svar || !svar.ok) return []
  const tak = Number(svar.tak || STANDARD_TAK_H)
  return (svar.medarbetare || [])
    .map(m => {
      const timmar = Number(m.modeller?.genomsnitt || 0)
      return {
        id: m.medarbetare_id, namn: m.namn || "Namnlös", timmar, tak,
        andel: tak > 0 ? Math.min(1, Math.max(0, timmar / tak)) : 0,
        niva: arsovertidNiva(timmar, tak),
      }
    })
    .sort((a, b) => b.timmar - a.timmar || a.namn.localeCompare(b.namn, "sv"))
}

/** De rader som ska synas: halvvägs till taket eller mer. */
export function narmarTaket(rader: ArsovertidRad[]): ArsovertidRad[] {
  return rader.filter(r => r.andel >= VISA_FRAN_ANDEL)
}

/** Överlappar en markerad period arbetsmånaden (YYYY-MM)? En utjämning i april–juli säger ingenting om december. */
export function overlapparManad(u: { startdatum: string; slutdatum: string }, manad: string): boolean {
  return u.startdatum.slice(0, 10) <= `${manad}-31` && u.slutdatum.slice(0, 10) >= `${manad}-01`
}

const dagUtanTid = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d)
}

type Utjamning = { startdatum: string; slutdatum: string; anteckning?: string | null; medarbetare_id?: string | null }

const dagarIPeriod = (u: Utjamning) =>
  Math.round((dagUtanTid(u.slutdatum).getTime() - dagUtanTid(u.startdatum).getTime()) / 86400000) + 1

/**
 * EN rad per period. Tabellen utjamningsperiod har en rad för alla OCH en per förare med samma datum (prod 2026-10-17: v17–27
 * som fem rader), så en lista som ritas rakt av säger samma sak fem gånger. Samma start och slut är samma period; platsen
 * tas från första raden som har en anteckning. Sorterad på startdatum.
 */
export function unikaUtjamningar<T extends Utjamning>(lista: T[] | null | undefined): T[] {
  const per = new Map<string, T>()
  for (const u of lista || []) {
    const k = `${u.startdatum.slice(0, 10)}|${u.slutdatum.slice(0, 10)}`
    const finns = per.get(k)
    if (!finns) per.set(k, u)
    else if (!String(finns.anteckning || "").trim() && String(u.anteckning || "").trim()) per.set(k, u)
  }
  return Array.from(per.values()).sort((a, b) => a.startdatum.localeCompare(b.startdatum))
}

/** "Utjämningsperiod v17–27 (Gavle/Hedemora-Sandviken), 77 dagar — räknas som genomsnitt" — en grå rad per markerad period. */
export function utjamningsRad(u: Utjamning): string {
  const fran = isoVecka(dagUtanTid(u.startdatum)).vecka
  const till = isoVecka(dagUtanTid(u.slutdatum)).vecka
  const veckor = fran === till ? `v${fran}` : `v${fran}–${till}`
  // Platsen = anteckningens början, före första siffra eller parentes ("Gavle/Hedemora-Sandviken 22 apr …").
  const plats = String(u.anteckning || "").split(/[0-9(]/)[0].trim().slice(0, 40).trim()
  return `Utjämningsperiod ${veckor}${plats ? ` (${plats})` : ""}, ${dagarIPeriod(u)} dagar — räknas som genomsnitt`
}
