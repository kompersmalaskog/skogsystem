// Sidolistan i maskinvyn (?ny=1) på stor skärm — ren logik, ingen hämtning.
//
// På en bred skärm ersätter en lista till vänster rullgardinen "namn ▾" som sitter i varje vy: alla maskiner syns
// samtidigt, grupperade Skördare / Skotare, och varje rad säger två saker utan att man öppnar något:
//   · lever maskinen nu?   (prick + en kort rad: "Aktiv nu" · "För 35 min sedan" · "Inget sedan 11:40")
//   · vad har den gjort idag?   (skördare: "142 m³ · 38 m³/G15h", skotare: "96 m³ · 11 lass")
//
// Reglerna för "lever nu" är de som redan gäller i Idag och Översikt (lib/maskinvy/aktivNu: grön < 20 min, gul 20–60 min,
// grå > 60 min) — samma maskin säger aldrig olika saker i olika vyer. Färgen bär aldrig ensam, raden säger samma sak med ord.
//
// Ärligt: ett tal som inte gick att läsa är ett fel som sägs, aldrig 0. En maskin utan körning idag säger det.
// m³/G15h är SUM(volym) / SUM(G15-timmar) — viktat, via lib/g15.ts, och visas bara när G15-tid finns.

import { aktivNuStatus, relativTid, type AktivNiva } from './aktivNu'
import { datumKort, dagarMellan, stockholmDag } from './livestatus'
import { g15Sek } from '../g15'

/** Under den här fönsterbredden finns ingen sidolista — rullgardinen i varje vy gäller som förut. */
export const SIDOLISTA_MIN_SKARM = 1100
/** Listans bredd. Innehållet till höger är kolumnen (KOLUMN.smal) centrerad i resten. */
export const SIDOLISTA_BREDD = 320

export type SidoRoll = 'skordare' | 'skotare'

/**
 * Avslutad maskin = `dim_maskin.aktiv_till` är satt och ligger före idag (sista dagen räknas som aktiv). Den hamnar i den
 * hopfällda gruppen "Tidigare" längst ner i listan: bara namnet, ingen prick och inga dagssiffror. Styrs av datan — en
 * framtida avslutad maskin (som gamla Elephant King) hamnar där utan kodändring.
 * Ett kombo-val ("H8E (båda)") är avslutat först när ALLA maskinerna i det är det. Okänd maskin (saknas i `aktivTill`) räknas
 * aldrig som avslutad.
 */
export function arAvslutad(ids: string[], aktivTill: Readonly<Record<string, string | null | undefined>>, idag: string): boolean {
  return ids.length > 0 && ids.every(id => { const t = aktivTill[id]; return !!t && t < idag })
}

export type SidoGrupp = { roll: SidoRoll; rubrik: string }
export const SIDO_GRUPPER: SidoGrupp[] = [
  { roll: 'skordare', rubrik: 'Skördare' },
  { roll: 'skotare', rubrik: 'Skotare' },
]

/** Det som läses per maskin. `idag` är dagens summor, eller null när maskinen inte har någon rad idag. */
export type SidoData = {
  /** Datum för senaste produktionsrad ('YYYY-MM-DD'), null = maskinen har aldrig någon data. */
  signalDatum: string | null
  /** Ögonblicket för senaste signal (skördarens `skapad_tid`, skotarens `lossnings_tid`), null = saknas. */
  signalIso: string | null
  idag: SidoIdag | null
}
export type SidoIdag = { volym: number; lass: number | null; g15Sek: number | null }

export type SidoNiva = AktivNiva | 'idag-ej' | 'ingen' | 'fel' | 'laser'

export type SidoRad = {
  niva: SidoNiva
  /** Radens statusord, kort. */
  status: string
  /** Dagens siffror som text, eller null när det inte finns något att visa. */
  siffror: string | null
}

const fmt = (v: number, dec: number): string => v.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec })

/** Dagens volym: hela m³, men under 10 m³ en decimal så en liten dag inte blir "0 m³". */
function fmtVolym(v: number): string { return `${fmt(v, v < 10 && v > 0 ? 1 : 0)} m³` }

/**
 * Summerar dagens rader till `SidoIdag`. Produktion och tid kommer från var sin hämtning och slås ihop HÄR (aldrig i SQL):
 * `fakt_produktion` har många rader per dag, `fakt_tid` en per förare. Skotarens lass räknas som antal rader i `fakt_lass`.
 */
export function summeraIdag(
  roll: SidoRoll,
  rader: { volym_m3sub?: number | null }[],
  tid: { processing_sek?: number | null; terrain_sek?: number | null; other_work_sek?: number | null }[] | null,
): SidoIdag {
  const volym = rader.reduce((s, r) => s + (r.volym_m3sub || 0), 0)
  if (roll === 'skotare') return { volym, lass: rader.length, g15Sek: null }
  const g15 = tid ? tid.reduce((s, r) => s + g15Sek(r.processing_sek, r.terrain_sek, r.other_work_sek), 0) : null
  return { volym, lass: null, g15Sek: g15 }
}

/** En rad i listan. `data` är 'fel' när något inte gick att läsa, 'laser' medan det läses, null = ingen data i databasen. */
export function sidoRad(
  roll: SidoRoll, data: SidoData | 'fel' | 'laser' | null, nuMs: number, klockslag: (iso: string) => string,
): SidoRad {
  if (data === 'laser') return { niva: 'laser', status: 'Läser …', siffror: null }
  if (data === 'fel') return { niva: 'fel', status: 'Kunde inte läsas', siffror: null }
  if (!data || !data.signalDatum) return { niva: 'ingen', status: 'Ingen data', siffror: null }

  const dagar = dagarMellan(data.signalDatum, stockholmDag(nuMs))
  if (dagar !== 0) {
    const nar = dagar === 1 ? 'igår' : `${dagar} dagar sedan`
    return { niva: 'idag-ej', status: `Senast ${datumKort(data.signalDatum)} · ${nar}`, siffror: 'Ingen körning idag' }
  }

  const s = aktivNuStatus(data.signalIso, nuMs, klockslag)
  const t = data.signalIso ? new Date(data.signalIso).getTime() : NaN
  const sedan = isFinite(t) ? relativTid(Math.max(0, nuMs - t)) : ''
  const status =
    s.niva === 'aktiv' ? 'Aktiv nu'
    : s.niva === 'sen' ? (sedan === 'nyss' ? 'Nyss' : `För ${sedan} sedan`)
    : s.niva === 'inget' ? `Inget sedan ${klockslag(data.signalIso as string)}`
    : 'Tid för senaste signal saknas'

  const i = data.idag
  let siffror: string | null = null
  if (i) {
    const delar = [fmtVolym(i.volym)]
    if (roll === 'skotare' && i.lass != null) delar.push(`${fmt(i.lass, 0)} lass`)
    if (roll === 'skordare' && i.g15Sek != null && i.g15Sek > 0 && i.volym > 0) delar.push(`${fmt(i.volym / (i.g15Sek / 3600), 1)} m³/G15h`)
    siffror = delar.join(' · ')
  }
  return { niva: s.niva, status, siffror }
}
