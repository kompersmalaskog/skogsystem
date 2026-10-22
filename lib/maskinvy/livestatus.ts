// Livestatus-raden i maskinvyn (Idag OCH Översikt, skördare och skotare) och maskinhälsa-raden (Översikt).
// EN uppsättning regler, så att samma maskin aldrig säger olika saker i olika flikar.
//
// Livestatus = när maskinen senast SA något (produktionssignal: skördarens `skapad_tid`, skotarens `lossnings_tid`):
//   idag:       grön < 20 min · gul 20–60 min · grå > 60 min   (lib/maskinvy/aktivNu — färgen bär aldrig ensam)
//   inte idag:  "Senaste körning: 20 okt · igår"                (ingen färgad prick — datan är inte dagsfärsk)
//
// Maskinhälsa = när senaste FIL importerades (`meta_importerade_filer.importerad_tid`) — skild från livestatus:
// en maskin kan stå still medan importen lever, och tvärtom. Samma gränser, egen text. En fil som misslyckades
// är ett fel som sägs, aldrig en tyst grå prick.

import { AKTIV_NU_MAX_MIN, SENT_SIGNAL_MAX_MIN, aktivNuStatus, relativTid, type AktivNiva } from './aktivNu'

const MAN_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

/** '2026-10-20' → '20 okt' (kalenderdatum, ingen tidszon i vägen). */
export function datumKort(datum: string): string {
  const d = new Date(datum + 'T12:00:00')
  return `${d.getDate()} ${MAN_KORT[d.getMonth()]}`
}

/** Svensk kalenderdag ('YYYY-MM-DD') för ett ögonblick — aldrig enhetens tidszon. */
export function stockholmDag(ms: number): string {
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
}

/** Hela kalenderdagar mellan två datum (12:00 mot 12:00, undviker sommartidsglapp). */
export function dagarMellan(senasteDatum: string, idagDatum: string): number {
  return Math.round((new Date(idagDatum + 'T12:00:00').getTime() - new Date(senasteDatum + 'T12:00:00').getTime()) / 86400000)
}

export type SenasteSignal = {
  /** Datumet för senaste produktionsrad, 'YYYY-MM-DD'. */
  senasteDatum: string
  /** Ögonblicket signalen kom (ISO), eller null när raden saknar tid. */
  signalIso: string | null
  /** 0 = idag, 1 = igår, … */
  daysDiff: number
}

export type Livestatus = { niva: AktivNiva | null; text: string; idag: boolean }

export function livestatus(f: SenasteSignal, nuMs: number, klockslag: (iso: string) => string): Livestatus {
  if (f.daysDiff === 0) {
    const s = aktivNuStatus(f.signalIso, nuMs, klockslag)
    return { niva: s.niva, text: s.text, idag: true }
  }
  const nar = f.daysDiff === 1 ? 'igår' : `${f.daysDiff} dagar sedan`
  return { niva: null, text: `Senaste körning: ${datumKort(f.senasteDatum)} · ${nar}`, idag: false }
}

/** Skördarens produktionsrad skrivs av samma importkörning som lägger raden i `meta_importerade_filer`, så de två tiderna
 *  ligger sekunder isär (prod 2026-10-21: Scorpion 0,1 min, R64428 0,0 min). Inom den här gränsen är de EN signal. */
export const SAMMA_SIGNAL_MAX_MIN = 5

/**
 * Bygger livestatus-raden och importraden på samma signal? Bara då räcker EN rad i Översikten (två rader med samma tid är
 * dubbelt). Alla villkor måste gälla: båda tiderna finns, importen gick bra (ett importfel ska alltid sägas för sig) och
 * tiderna ligger inom `SAMMA_SIGNAL_MAX_MIN` från varandra. Annars (importen nyare än signalen — filer kommer fast
 * maskinen står still — eller tvärtom) säger raderna olika saker och båda visas.
 */
export function arSammaSignal(
  signalIso: string | null | undefined, importIso: string | null | undefined, importStatus: string | null | undefined,
): boolean {
  const s = signalIso ? new Date(signalIso).getTime() : NaN
  const i = importIso ? new Date(importIso).getTime() : NaN
  if (!isFinite(s) || !isFinite(i)) return false
  if (importStatus != null && importStatus.toUpperCase() !== 'OK') return false
  return Math.abs(i - s) <= SAMMA_SIGNAL_MAX_MIN * 60000
}

export type Importhalsa = { niva: AktivNiva | 'fel'; text: string }

/**
 * Maskinhälsan: senaste importerade fil. `status` är radens status i meta_importerade_filer ('OK' vid lyckad import).
 * Gränserna är desamma som för livestatus.
 */
export function importhalsa(
  importIso: string | null | undefined, status: string | null | undefined, nuMs: number, klockslag: (iso: string) => string,
): Importhalsa {
  const t = importIso ? new Date(importIso).getTime() : NaN
  if (!isFinite(t)) return { niva: 'saknas', text: 'Ingen fil importerad' }
  const diff = Math.max(0, nuMs - t)
  const klart = status == null || status.toUpperCase() === 'OK'
  const sedan = relativTid(diff) === 'nyss' ? 'nyss' : `för ${relativTid(diff)} sedan`
  const nar = stockholmDag(t) === stockholmDag(nuMs) ? klockslag(importIso as string) : `${datumKort(stockholmDag(t))} ${klockslag(importIso as string)}`
  if (!klart) return { niva: 'fel', text: `Senaste filen gav importfel · ${nar}` }
  if (diff < AKTIV_NU_MAX_MIN * 60000) return { niva: 'aktiv', text: `Filer in · senaste ${sedan}` }
  if (diff <= SENT_SIGNAL_MAX_MIN * 60000) return { niva: 'sen', text: `Senaste fil ${sedan}` }
  return { niva: 'inget', text: `Ingen fil sedan ${nar}` }
}
