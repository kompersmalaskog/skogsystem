// Delad kärna för Jämförelse Elephant King mot Wisent — toppfliken
// (app/maskinvy/Jamforelse.tsx) och Skotare › Jämförelse
// (app/maskinvy/SkotareJamforelseNy.tsx) bygger på samma tre saker:
//
//  1. Vilka maskiner som jämförs — ur dim_maskin, aldrig hårdkodade id:n.
//     Elephant King byttes 2026: A110148 (aktiv_till 2026-07-08) → A130743
//     (aktiv_fran 2026-08-13). Med ett hårdkodat id läste vyn den gamla
//     maskinen och visade "0 lass · 0 m³" för oktober.
//  2. Avståndsklasserna — GRÄNSERNA BOR HÄR OCH INGEN ANNANSTANS.
//  3. Skyddsreglerna: saknas nämnaren (G15h) är svaret null och vyn skriver "–"
//     med orsak. Aldrig division ändå, aldrig 0.
//
// Volym kommer från lib/maskinvy/skotarvolym (fakt_lass + manuell korrigering),
// G15 från lib/g15 (g15Sek: processing + terrain + other_work).

import { g15Sek } from '@/lib/g15'
import { skotningsavstandM } from '@/lib/skotningsavstand'
import {
  byggVolymPerDag, sumPerDag, type LassRad, type ManuellRad, type TidRad,
} from '@/lib/maskinvy/skotarvolym'

// ── Maskinval ─────────────────────────────────────────────────

export type DimMaskinRad = {
  maskin_id: string
  visningsnamn?: string | null
  modell?: string | null
  maskin_typ?: string | null
  aktiv_fran?: string | null
  aktiv_till?: string | null
  bekraftad?: boolean | null
}

export type JamforelseMaskiner = { wisent: string[]; ek: string[] }

const arSkotare = (typ: string | null | undefined) => {
  const t = (typ || '').toLowerCase()
  return t === 'forwarder' || t.includes('skot')
}

/**
 * Skotarna som jämförs i en period: bekräftade skotare i dim_maskin som är
 * aktiva någon gång under [start, end]. Sidan avgörs av modellen (Wisent /
 * Elephant King) — id:n ligger aldrig i koden. Spänner perioden över bytet
 * (ett år, ett kvartal) hamnar båda Elephant King-maskinerna på EK-sidan.
 * 810E (manuell, ingen fakt_tid) hör till ingen av sidorna.
 */
export function valjJamforelseMaskiner(
  rader: DimMaskinRad[], start: string, end: string,
): JamforelseMaskiner {
  const aktiva = rader
    .filter(m => m.bekraftad === true && arSkotare(m.maskin_typ))
    .filter(m => (!m.aktiv_fran || m.aktiv_fran <= end) && (!m.aktiv_till || m.aktiv_till >= start))
    .sort((a, b) => String(a.aktiv_fran || '').localeCompare(String(b.aktiv_fran || '')))
  const text = (m: DimMaskinRad) => `${m.modell ?? ''} ${m.visningsnamn ?? ''}`.toLowerCase()
  return {
    wisent: aktiva.filter(m => /wisent/.test(text(m))).map(m => m.maskin_id),
    ek:     aktiva.filter(m => /elephant|elefant/.test(text(m))).map(m => m.maskin_id),
  }
}

// ── Skyddade kvoter ───────────────────────────────────────────

/** täljare / nämnare — null när nämnaren saknas eller inte är > 0. */
export function kvot(taljare: number | null | undefined, namnare: number | null | undefined): number | null {
  if (taljare == null || namnare == null) return null
  if (!isFinite(taljare) || !isFinite(namnare) || namnare <= 0) return null
  return taljare / namnare
}

/** (a − b) / b i procent — null när någon sida saknas eller b inte är > 0. */
export function skillnadPct(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !isFinite(a) || !isFinite(b) || b <= 0) return null
  return ((a - b) / b) * 100
}

export const ORSAK_INGEN_G15 = 'Ingen G15-tid registrerad i perioden'
export const ORSAK_INGEN_MASKIN = 'Ingen maskin av den här sorten är aktiv i perioden'

// ── Avståndsklasser ───────────────────────────────────────────
// Följer ACKORDSTRAPPAN: grundavstånd 200 m, sedan steg om 100 m. Klassas på
// SKOTNINGSAVSTÅND (enkelriktat, lib/skotningsavstand), inte på
// fakt_lass.korstracka_m som är tur och retur. Översta klassen slår ihop två
// prissteg (600–900 och 900+) av läsbarhetsskäl i hytt. Satta mot augusti 2026
// (198 lass, fem objekt) — justera här när mer underlag finns.
export const KLASSER = [
  { label: '0–200 m',   short: '0–200',   min: 0,   max: 200      },
  { label: '200–300 m', short: '200–300', min: 200, max: 300      },
  { label: '300–400 m', short: '300–400', min: 300, max: 400      },
  { label: '400–600 m', short: '400–600', min: 400, max: 600      },
  { label: '600 m+',    short: '600+',    min: 600, max: Infinity },
]
export const NK = KLASSER.length

export function getKlassIdx(skotningsavstand: number): number {
  for (let i = 0; i < NK; i++) if (skotningsavstand < KLASSER[i].max) return i
  return NK - 1
}

// ── Aggregering per maskin och objekt (toppfliken) ────────────

export type JLass = {
  maskin_id: string; objekt_id: string | null | undefined; datum?: string | null
  volym_m3sub: number | null; korstracka_m: number | null
}
export type JTid = {
  maskin_id: string; objekt_id: string | null | undefined; datum?: string | null
  processing_sek: number | null; terrain_sek: number | null; other_work_sek: number | null
  bransle_liter: number | string | null
}

export type MaskinObjektSumma = {
  maskin_id: string
  objekt_id: string
  lass: number
  volym: number          // m³sub, rå ur fakt_lass — korrigeras av anroparen
  korM: number           // summa korstracka_m (tur och retur) över lass som har den
  lassMedKor: number
  g15h: number           // g15Sek / 3600
  bransle: number
  dagar: Set<string>     // dagar med tid — "skift"
}

/** Lass och tid hämtas separat och möts här per (maskin, objekt) — aldrig joinade. */
export function summeraPerMaskinObjekt(lass: JLass[], tid: JTid[]): MaskinObjektSumma[] {
  const m = new Map<string, MaskinObjektSumma>()
  const hamta = (maskin_id: string, objekt_id: string) => {
    const k = `${maskin_id}|${objekt_id}`
    let s = m.get(k)
    if (!s) {
      s = { maskin_id, objekt_id, lass: 0, volym: 0, korM: 0, lassMedKor: 0, g15h: 0, bransle: 0, dagar: new Set() }
      m.set(k, s)
    }
    return s
  }
  for (const r of lass) {
    if (!r.objekt_id) continue
    const s = hamta(r.maskin_id, r.objekt_id)
    s.lass++
    s.volym += r.volym_m3sub || 0
    if (r.korstracka_m != null) { s.korM += Number(r.korstracka_m) || 0; s.lassMedKor++ }
  }
  for (const r of tid) {
    if (!r.objekt_id) continue
    const s = hamta(r.maskin_id, r.objekt_id)
    s.g15h += g15Sek(r.processing_sek, r.terrain_sek, r.other_work_sek) / 3600
    s.bransle += parseFloat(String(r.bransle_liter)) || 0
    if (r.datum) s.dagar.add(r.datum)
  }
  return Array.from(m.values())
}

/** Objektets skotningsavstånd (enkelriktat), eller null när inget lass har körsträcka. */
export function objektSkotningsavstand(s: MaskinObjektSumma): number | null {
  return s.lassMedKor > 0 ? skotningsavstandM(s.korM / s.lassMedKor) : null
}

/**
 * Korrigerad volym per objekt för EN maskin i perioden, via den delade
 * byggVolymPerDag (samma kodväg som övriga skotarflikar). Tar all-time-rader
 * (manuell korrigering fördelar objektets totalvolym över hela historiken).
 * Objekt utan manuell volym får sin råa lass-volym. Nyckel = objekt_id.
 */
export function volymPerObjekt(
  alltidLass: LassRad[], manuell: ManuellRad[], alltidTid: TidRad[],
  maskinId: string, start: string, end: string,
): { perObjekt: Map<string, number>; harManuell: boolean } {
  const objekt = new Set<string>()
  for (const r of alltidLass) {
    if (r.objekt_id && r.maskin_id === maskinId && r.datum >= start && r.datum <= end) objekt.add(r.objekt_id)
  }
  const perObjekt = new Map<string, number>()
  let harManuell = false
  for (const oid of Array.from(objekt)) {
    const res = byggVolymPerDag(
      alltidLass.filter(r => r.objekt_id === oid && r.maskin_id === maskinId),
      manuell.filter(r => r.objekt_id === oid),
      alltidTid.filter(r => r.objekt_id === oid && r.maskin_id === maskinId),
      maskinId, start, end,
    )
    perObjekt.set(oid, sumPerDag(res.perDag))
    if (res.harManuell) harManuell = true
  }
  return { perObjekt, harManuell }
}
