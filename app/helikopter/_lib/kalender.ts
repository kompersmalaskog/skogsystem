// Kalendern (Helikopter › Kalender, 2026-11-25, Martin: "bygg bara på data vi kan lita på, annars är det bättre att vara utan").
// Ren logik — Rutnat (components/design) ritar. Tre saker, och bara de:
//   1. MÄTT: dagarna som varit, per maskin och trakt, rakt ur data (helikopter_kalender_matt). Heldraget block.
//   2. NUVARANDE TRAKT FRAMÅT: bara trakten maskinen är på nu (senaste arbetet ligger där) fortsätter framåt, med maskinens egen takt. Streckat block ("plan").
//   3. RESTEN: inget block och inget datum — bara hur många trakter som står därefter. Ett datum längre ner i kön är ett antagande.
// Maskin som kör annat (GROT, energiklippning) får bara det mätta.
import type { RutnatRad, RutnatSegment } from '@/components/design/Rutnat'
import { kortNamn } from './format'
import type { KlarData, MaskinPlan } from './klar'
import { arHelgEllerRod, maskinSegment } from './klarRutnat'
import type { KalenderMatt } from './queries'

const plusDag = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

/** Mätta block för EN maskin: dagens största trakt per dag; samma trakt på följande arbetsdagar är ett block (helger och röda dagar ligger inuti). */
export function mattSegment(maskinId: string, matt: KalenderMatt[], idag: string): RutnatSegment[] {
  const perDag = new Map<string, { objekt: string; namn: string | null; volym: number }>()
  const volymPer = new Map<string, number>()
  for (const r of matt) {
    if (r.maskin_id !== maskinId || r.datum > idag) continue
    const nyckel = `${r.datum}|${r.objekt_id ?? ''}`
    volymPer.set(nyckel, (volymPer.get(nyckel) ?? 0) + r.volym)
    const nu = perDag.get(r.datum)
    if (!nu || (volymPer.get(nyckel) ?? 0) > nu.volym) perDag.set(r.datum, { objekt: r.objekt_id ?? '', namn: r.namn, volym: volymPer.get(nyckel) ?? 0 })
  }
  const dagar = [...perDag.keys()].sort()
  const ut: RutnatSegment[] = []
  let bit: { fran: string; till: string; objekt: string; namn: string | null } | null = null
  const stang = () => {
    if (!bit) return
    const titel = kortNamn(bit.namn ?? 'Okänt objekt')
    ut.push({ id: `${maskinId}:matt:${bit.fran}`, fran: bit.fran, till: bit.till, text: titel, ton: 'normal', ariaLabel: `${titel}, mätt` })
    bit = null
  }
  const luckaBara = (a: string, b: string) => { for (let d = plusDag(a, 1); d < b; d = plusDag(d, 1)) if (!arHelgEllerRod(d)) return false; return true }
  for (const dag of dagar) {
    const p = perDag.get(dag)!
    if (bit && bit.objekt === p.objekt && luckaBara(bit.till, dag)) bit.till = dag
    else { stang(); bit = { fran: dag, till: dag, objekt: p.objekt, namn: p.namn } }
  }
  stang()
  return ut
}

export type KalenderIndata = {
  klar: KlarData
  planer: Record<string, MaskinPlan>
  matt: KalenderMatt[]
  idag: string
  /** Köns trakt-id:n maskinen arbetat på de senaste dagarna (hamtaSenasteArbete). Okänt = ingen framåtblick. */
  senaste: { maskin_id: string; pa: string[] }[] | undefined
  /** Maskiner som kör annat i alla sina spår (arKorAnnat i lage.ts). */
  korAnnat: ReadonlySet<string>
}

export function kalenderRader(d: KalenderIndata): RutnatRad[] {
  return d.klar.maskiner.map((m): RutnatRad => {
    const segment = mattSegment(m.maskin_id, d.matt, d.idag)
    const plan = d.planer[m.maskin_id]
    const pa = d.senaste?.find(x => x.maskin_id === m.maskin_id)?.pa
    const kor = d.korAnnat.has(m.maskin_id)
    const rader = plan?.rader ?? []
    const forsta = rader[0]
    const darNu = !kor && forsta != null && pa != null && pa.includes(forsta.trakt.objekt_id)
    if (darNu && forsta.fran != null && forsta.till != null) {
      const fran = forsta.fran > d.idag ? forsta.fran : plusDag(d.idag, 1)
      if (fran <= forsta.till) {
        for (const s of maskinSegment(m, { ...plan, rader: [{ ...forsta, fran }] }, d.klar.sista_arbetsdag)) {
          segment.push({ ...s, id: `${s.id}:plan`, ton: s.ton === 'orange' ? 'orange' : 'plan', ariaLabel: `${s.ariaLabel ?? ''}, prognos` })
        }
      }
    }
    const kvar = rader.length - (darNu ? 1 : 0)
    const hoger = kor ? { text: 'Kör annat', ton: 'muted' as const } : kvar > 0 ? { text: `${kvar} ${darNu ? 'därefter' : 'i kön'}`, ton: 'muted' as const } : undefined
    return { id: m.maskin_id, namn: m.namn, segment, hoger }
  })
}
