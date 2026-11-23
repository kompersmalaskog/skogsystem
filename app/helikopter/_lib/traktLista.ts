// TRAKTERNA SOM SKA KÖRAS (Martin 2026-11-23: "jag vill se objekten som vi måste köra denna månad, hur ligger vi till, kommer vi hinna, vad säger prognosen").
// En rad per inlagd trakt, i körordning, med skördaren och skotaren var för sig: vem som har den, vad som är kvar och när den är klar.
// Ingen ny beräkning: allt kommer ur tavlan (racker.behov / racker.skot / block.maskiner.trakter) — den här filen sätter bara ihop raderna per trakt.
// Det enda som läggs till är "skotbart nu" (skördat − skotat): en skotare kan inte skota virke som ännu inte är fällt. Det visas, det ändrar ingen prognos.
// Inga imports av React eller Supabase.
import type { Ton } from './kort'
import type { KlarRoll, KlarTrakt } from './klar'
import type { TavlaSpar } from './tavla'

/** Under så här mycket skördat och inte skotat (ungefär ett lass) finns det inget att köra: raden säger "Inget fällt än" i stället för ett klar-datum. */
export const MIN_SKOTBART_M3 = 20

/** Namnet tavlan ger raden för markägarens egen skotning (tavla.ts racker). */
export const EGEN_SKOTNING_NAMN = 'Egen skotning'

export type TraktStatus =
  | 'klar'            // klar-datum finns och ligger i månaden
  | 'efter'           // klar-datum ligger efter månadens sista arbetsdag
  | 'prognos_saknas'  // maskin finns men ingen prognos → ingen tid kan räknas
  | 'ingen_maskin'    // ingen maskin för rollen
  | 'egen'            // markägaren skotar själv
  | 'inget_skordat'   // skotare finns men inget är fällt än att skota

export type TraktRoll = {
  roll: KlarRoll
  maskin: string | null
  /** Kvar att göra för rollen (hela trakten). */
  kvar: number
  /** Hur mycket av trakten som behövs för beställningen (0 = behövs inte för rollen). */
  behovs: number
  /** "ca 2 dec" eller null. */
  till: string | null
  /** Bara skotaren: skördat − skotat på trakten, aldrig under 0. null = okänt (egen skotning eller trakten saknas i underlaget). */
  skotbart: number | null
  status: TraktStatus
}

export type TraktListaRad = {
  objekt_id: string
  namn: string
  skordare: TraktRoll | null
  skotare: TraktRoll | null
}

export type TraktLista = {
  rader: TraktListaRad[]
}

/** Orden på raden för en roll. Ordet bär betydelsen, tonen förstärker. */
export function traktRollOrd(r: TraktRoll): { ord: string; ton: Ton } {
  switch (r.status) {
    case 'egen': return { ord: 'Markägaren skotar', ton: 'dampad' }
    case 'ingen_maskin': return { ord: r.roll === 'skordare' ? 'Ingen skördare' : 'Ingen skotare', ton: 'orange' }
    case 'inget_skordat': return { ord: 'Inget fällt än att skota', ton: 'orange' }
    case 'prognos_saknas': return { ord: 'Prognos saknas', ton: 'orange' }
    case 'efter': return { ord: `Klar ${r.till ?? '?'} · efter månadens slut`, ton: 'orange' }
    case 'klar': return { ord: `Klar ${r.till ?? '?'}`, ton: 'gron' }
  }
}

function status(roll: KlarRoll, maskin: string | null, till: string | null, efter: boolean, skotbart: number | null): TraktStatus {
  if (maskin == null) return 'ingen_maskin'
  if (maskin === EGEN_SKOTNING_NAMN) return 'egen'
  if (roll === 'skotare' && skotbart != null && skotbart < MIN_SKOTBART_M3) return 'inget_skordat'
  if (till == null) return 'prognos_saknas'
  return efter ? 'efter' : 'klar'
}

/** Raderna för ett spår. `klarTrakter` = klar.trakter (underlaget med skördat/skotat per trakt och roll, och körordningen sortn). */
export function byggTraktLista(spar: TavlaSpar, klarTrakter: KlarTrakt[]): TraktLista {
  const behov = spar.racker.find(r => r.roll === 'skordare')?.behov ?? null
  const skot = spar.racker.find(r => r.roll === 'skotare')?.skot ?? null

  const efterSet = new Set<string>()
  for (const b of spar.block) for (const m of b.maskiner) for (const t of m.trakter) if (t.efter) efterSet.add(`${t.roll}:${t.objekt_id}`)

  const sortn = new Map<string, number>()
  const skordat = new Map<string, number>()
  const skotat = new Map<string, number>()
  for (const t of klarTrakter) {
    if (!sortn.has(t.objekt_id) || t.sortn < (sortn.get(t.objekt_id) as number)) sortn.set(t.objekt_id, t.sortn)
    if (t.roll === 'skordare') skordat.set(t.objekt_id, t.utfort_volym)
    else skotat.set(t.objekt_id, t.utfort_volym)
  }

  const rader = new Map<string, TraktListaRad>()
  const rad = (id: string, namn: string): TraktListaRad => {
    const f = rader.get(id)
    if (f) return f
    const n: TraktListaRad = { objekt_id: id, namn, skordare: null, skotare: null }
    rader.set(id, n)
    return n
  }

  // ALLA inlagda trakter med något kvar — inte bara de som "behövs": tavlans behov fylls i körordning, så en trakt som ännu inte är fälld (Brokamåla, 4 314 m³ kvar att skota
  // men 2 m³ fällt) täcker hela skotarens behov och gör de skotbara trakterna "behövs inte". Frågan är vad som går att få klart, inte vad som råkar stå först.
  for (const t of [...(behov?.behovs ?? []), ...(behov?.inte ?? [])]) {
    rad(t.objekt_id, t.namn).skordare = { roll: 'skordare', maskin: t.maskin, kvar: t.kvar, behovs: t.behovs, till: t.till, skotbart: null, status: status('skordare', t.maskin, t.till, efterSet.has(`skordare:${t.objekt_id}`), null) }
  }
  // Skotaren: de som behövs, och de utan skotare (de skotas inte om ingen väljs — det ska synas).
  for (const t of skot?.rader ?? []) {
    const egen = t.maskin === EGEN_SKOTNING_NAMN
    const sb = egen || !skordat.has(t.objekt_id) ? null : Math.max(0, Math.round((skordat.get(t.objekt_id) ?? 0) - (skotat.get(t.objekt_id) ?? 0)))
    rad(t.objekt_id, t.namn).skotare = { roll: 'skotare', maskin: t.maskin, kvar: t.kvar, behovs: t.behovs, till: t.till, skotbart: sb, status: status('skotare', t.maskin, t.till, efterSet.has(`skotare:${t.objekt_id}`), sb) }
  }

  const lista = [...rader.values()].sort((a, b) => (sortn.get(a.objekt_id) ?? 1e9) - (sortn.get(b.objekt_id) ?? 1e9))
  return { rader: lista }
}
