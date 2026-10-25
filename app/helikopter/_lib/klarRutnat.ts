// Rutnätet för Månadsplan-A4 (/helikopter/manadsplan): trakterna som block per maskin, byggt ur samma räkning som listan (klar.ts).
// Ren logik — Rutnat (components/design) ritar. Ett block täcker traktens från–till i kalenderdagar; helger och röda dagar ligger inuti,
// men en vardag som maskinen inte arbetar (ledighet, stopp) lämnas tom — blocket bryts där. Delen efter månadens sista arbetsdag är orange.
import type { RutnatRad, RutnatSegment } from '@/components/design/Rutnat'
import { getRödaDagar } from '@/lib/roda-dagar'
import { kortNamn } from './format'
import { KLAR_TYP_NAMN, arVirke, type KlarData, type KlarMaskin, type MaskinPlan } from './klar'

const dagIso = (d: Date) => d.toISOString().slice(0, 10)
const plusDag = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return dagIso(d) }
const veckodag = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay() // 0 = söndag

export function arHelgEllerRod(iso: string): boolean {
  const v = veckodag(iso)
  return v === 0 || v === 6 || iso in getRödaDagar(Number(iso.slice(0, 4)))
}

/** Dagarna rutnätet visar: från `fran` (standard: planens start) till månadens sista arbetsdag — eller till sista klar-datum om något blir klart efter månaden. */
export function rutnatDagar(d: KlarData, planer: Record<string, MaskinPlan>, fran: string = d.start): string[] {
  let slut = d.sista_arbetsdag
  for (const p of Object.values(planer)) if (p.klar != null && p.klar > slut) slut = p.klar
  const ut: string[] = []
  for (let iso = fran; iso <= slut && ut.length < 120; iso = plusDag(iso, 1)) ut.push(iso)
  return ut
}

/**
 * Block för EN maskin: en trakt = ett eller flera segment. Ett segment börjar och slutar på en ARBETSDAG (helger ligger bara inuti),
 * bryts vid en vardag maskinen inte arbetar (ledighet, stopp) och vid månadens slut (delen efter är orange). Text står på första biten.
 */
export function maskinSegment(m: KlarMaskin, p: MaskinPlan, sistaArbetsdag: string, onTrakt?: (objektId: string, roll: KlarMaskin['roll']) => void): RutnatSegment[] {
  const arb = new Set(m.dagar)
  const ut: RutnatSegment[] = []
  for (const r of p.rader) {
    if (r.fran == null || r.till == null) continue
    // GROT och energiklippning ligger i kön (RPC version 2) och får typen i namnet, som i Klar-kortet.
    const titel = `${arVirke(r.trakt.typ) ? '' : `${KLAR_TYP_NAMN[r.trakt.typ]} `}${kortNamn(r.trakt.namn)}`
    const klick = onTrakt ? () => onTrakt(r.trakt.objekt_id, r.trakt.roll) : undefined
    let bit: { fran: string; senast: string; ton: 'normal' | 'orange' } | null = null
    let forsta = true
    const stang = () => {
      if (!bit) return
      ut.push({ id: `${m.maskin_id}:${r.trakt.objekt_id}:${r.trakt.roll}:${bit.fran}`, fran: bit.fran, till: bit.senast, text: forsta ? titel : undefined, ton: bit.ton, ariaLabel: `${titel}, ${m.namn}`, onKlick: klick })
      forsta = false
      bit = null
    }
    for (let iso = r.fran; iso <= r.till; iso = plusDag(iso, 1)) {
      if (arb.has(iso)) {
        const ton = iso > sistaArbetsdag ? 'orange' : 'normal'
        if (bit && bit.ton !== ton) stang()
        if (!bit) bit = { fran: iso, senast: iso, ton }
        else bit.senast = iso
      } else if (!arHelgEllerRod(iso)) {
        stang() // en vanlig vardag som maskinen inte arbetar: ledighet eller stopp
      }
    }
    stang()
  }
  return ut
}

export function rutnatRader(d: KlarData, planer: Record<string, MaskinPlan>, onTrakt?: (objektId: string, roll: KlarMaskin['roll']) => void): RutnatRad[] {
  return d.maskiner.map(m => ({ id: m.maskin_id, namn: m.namn, segment: maskinSegment(m, planer[m.maskin_id], d.sista_arbetsdag, onTrakt) }))
}
