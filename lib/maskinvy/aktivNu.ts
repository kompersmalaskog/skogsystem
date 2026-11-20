// "Aktiv nu" i Idag-vyerna (skördare och skotare): grön betyder att en signal kom NYSS.
// Förut låg den gröna pricken kvar hela dagen så länge senaste signalen var från idag — också
// när den var flera timmar gammal. Nu avgör signalens ålder (relativ tid, aldrig bara ett klockslag):
//
//   < 20 min   grön   "Aktiv nu · senaste signal för X min sedan"
//   20–60 min  gul    "Senaste signal för X min sedan"
//   > 60 min   grå    "Inget sedan HH:MM"
//   tid saknas grå    "Data från idag – tid för senaste signal saknas" (påstår aldrig "Aktiv nu")
//
// Färgen bär aldrig ensam — texten säger samma sak.

export const AKTIV_NU_MAX_MIN = 20
export const SENT_SIGNAL_MAX_MIN = 60

export type AktivNiva = 'aktiv' | 'sen' | 'inget' | 'saknas'

/** "nyss" under en minut, annars "X min"; från 60 min "1 h 5 min". */
export function relativTid(diffMs: number): string {
  const min = Math.max(0, Math.floor(diffMs / 60000))
  if (min < 1) return 'nyss'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function aktivNuStatus(
  signalIso: string | null | undefined,
  nuMs: number,
  klockslag: (iso: string) => string,
): { niva: AktivNiva; text: string } {
  const t = signalIso ? new Date(signalIso).getTime() : NaN
  if (!isFinite(t)) return { niva: 'saknas', text: 'Data från idag – tid för senaste signal saknas' }
  const diff = Math.max(0, nuMs - t)   // en signal kan inte komma från framtiden (klockskillnad)
  const rel = relativTid(diff)
  const sedan = rel === 'nyss' ? 'nyss' : `för ${rel} sedan`
  if (diff < AKTIV_NU_MAX_MIN * 60000) return { niva: 'aktiv', text: `Aktiv nu · senaste signal ${sedan}` }
  if (diff <= SENT_SIGNAL_MAX_MIN * 60000) return { niva: 'sen', text: `Senaste signal ${sedan}` }
  return { niva: 'inget', text: `Inget sedan ${klockslag(signalIso as string)}` }
}
