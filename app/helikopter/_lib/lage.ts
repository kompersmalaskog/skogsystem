// LÄGET NU (2026-11-23, Martin: "snyggt, kör på detta"): EN mening som svar, fyra rutor mot beställningen och en tidslinje — vem gör vad, dag för dag, med månadens slut som en linje.
// En stapel som korsar linjen hinner inte; ingen behöver läsa datum. Allt här är ren logik ur tavlan (tavla.ts) och köerna (koerFor) — ingen ny prognos.
// Det enda som läggs till är tidslinjens EGNA stapellängder, och de är sagda i klartext:
//  · skotaren: längden räknas på det som är FÄLLT (skördat − skotat), inte på hela traktens volym — en trakt där inget är fällt än (Brokamåla 23 nov: 2 av 4 314 m³) har inget att köra
//    och får en rad "väntar på skördaren", inte 25 dagar i kön. Tavlans egen kö räknar fortfarande på hela volymen; den är orörd.
//  · skördaren: längden är den del av trakten som BEHÖVS för beställningen (tavlans behov), så Giant på Brokamåla visar "1 dag" för de 220 m³ som fattas, inte 20.
// Prognos saknas = streckad stapel ("tid saknas"), aldrig en påhittad längd. Inga imports av React eller Supabase.
import { fmt } from './format'
import type { KlarRoll } from './klar'
import { koerFor, MIN_SKOTBART_M3, traktVy, type Tavla, type TavlaBlock, type TavlaIndata, type TavlaSpar } from './tavla'

export { MIN_SKOTBART_M3 }
/** Så många arbetsdagar framåt ritas tidslinjen. */
export const TIDSLINJE_DAGAR = 10

// ── Svaret ──────────────────────────────────────────────────────────────────
export type Svar = { rad1: string; rad2: string | null; under: string; avvikelse: boolean }

/** EN mening (två rader) + en förklaring. Skotningen är det som levereras, så den nämns först. */
export function lageSvar(tavla: Tavla, status: 'kommande' | 'pagaende' | 'avslutad'): Svar {
  const med = tavla.spar.filter(s => s.bestallt > 0)
  if (med.length === 0) return { rad1: 'Ingen beställning inlagd', rad2: null, under: '', avvikelse: false }
  const fattas = med.flatMap(s => s.block.filter(b => b.ton === 'orange' && b.diff != null && b.diff < 0).map(b => ({ s, b })))
  if (status === 'avslutad') return { rad1: fattas.length === 0 ? 'Beställningen blev klar.' : 'Beställningen blev inte klar.', rad2: null, under: '', avvikelse: fattas.length > 0 }
  if (fattas.length === 0) {
    const allaKlara = med.every(s => s.block.every(b => b.ord === 'Klar'))
    return { rad1: allaKlara ? 'Beställningen är klar.' : 'Vi hinner med beställningen.', rad2: null, under: '', avvikelse: false }
  }
  const skot = fattas.some(f => f.b.roll === 'skotare')
  const skord = fattas.some(f => f.b.roll === 'skordare')
  const rad2 = skot && skord ? 'Skotning och skördning fattas.' : skot ? 'Skotningen fattas.' : 'Skördningen fattas.'
  // Förklaringen: det som fattas per spår, skotning före skördning — "Fattas: slutavverkning 2 997 m³ skotning · gallring 1 000 m³ skotning och 758 m³ skördning." "ca" när prognosen är osäker.
  const delar = med.flatMap(s => {
    const f = [...s.block].sort((a, b) => Number(b.roll === 'skotare') - Number(a.roll === 'skotare')).filter(b => fattas.some(x => x.b === b))
    if (f.length === 0) return []
    return [`${s.namn.toLowerCase()} ${f.map(b => `${b.ca ? 'ca ' : ''}${fmt(-(b.diff as number))} m³ ${b.roll === 'skotare' ? 'skotning' : 'skördning'}`).join(' och ')}`]
  })
  return { rad1: 'Vi hinner inte allt.', rad2, under: `Fattas: ${delar.join(' · ')}.`, avvikelse: true }
}

// ── Rutorna ─────────────────────────────────────────────────────────────────
export type Ruta = {
  typ: TavlaSpar['typ']
  roll: KlarRoll
  /** "Slutavverkning · skördat" */
  rubrik: string
  /** Det stora ordet: Hinner · Fattas · Klar · Över */
  ord: string
  /** Under ordet: "ca 1 400 m³" · "841 över" · "" */
  tal: string
  ton: TavlaBlock['ton']
  nu: number
  landar: number | null
  bestallt: number
  /** "2 750 av 5 000" */
  rad: string
  /** Bara skotaren, när markägaren skotar en del själv. */
  markagare: number | null
  /** Maskiner som arbetat de senaste dagarna bara på annat än spårets trakter: ingen prognos läggs på dem, och det ska stå. */
  korAnnat: string[]
}

export function lageRutor(tavla: Tavla): Ruta[] {
  return tavla.spar.filter(s => s.bestallt > 0).flatMap(s => s.block.map((b): Ruta => {
    const ca = b.ca && b.landar != null ? 'ca ' : ''
    const diff = b.diff
    let ord = b.ord
    let tal = ''
    if (b.ord === 'Klar') { ord = 'Klar' }
    else if (diff != null && diff < 0) { ord = 'Fattas'; tal = `${ca}${fmt(-diff)} m³` }
    else if (diff != null && diff > 0 && b.ton === 'orange') { ord = 'Över'; tal = `${ca}${fmt(diff)} m³ över beställt` }
    else if (diff != null && diff > 0) { ord = 'Hinner'; tal = `${fmt(diff)} över` }
    return {
      typ: s.typ, roll: b.roll, rubrik: `${s.namn} · ${b.rubrik.toLowerCase()}`, ord, tal, ton: b.ton, nu: b.nu, landar: b.landar, bestallt: s.bestallt,
      rad: `${fmt(b.nu)} av ${fmt(s.bestallt)}`, markagare: b.markagare ? b.markagare.nu : null, korAnnat: b.korAnnat,
    }
  }))
}

// ── Tidslinjen ──────────────────────────────────────────────────────────────
export type TidsBar = {
  id: string
  namn: string
  /** Startdag och längd i arbetsdagar från idag (0 = första arbetsdagen kvar). */
  start: number
  langd: number
  /** klar = inom månaden · efter = korsar månadens slut · saknas = prognos saknas (streckad) */
  stil: 'klar' | 'efter' | 'saknas' | 'nasta' | 'darefter'
  /** Del av stapeln som ligger före månadens slut, 0–1 (bara 'efter'). */
  fore: number
  /** Kort text i stapeln. */
  text: string
  /** Inget är fällt än på trakten (skotare): den väntar på skördaren. */
  vantar?: boolean
}
export type TidsRad = {
  maskin_id: string
  namn: string
  roll: KlarRoll
  barer: TidsBar[]
  /** Maskinen kör annat just nu (GROT, energiklippning …): kortet säger bara det, ingen kö och ingen prognos. */
  korAnnat?: boolean
  /** Trakter som står efter en trakt utan prognos (starten går inte att räkna), eller väntar på skördaren — i ord under raden. */
  not: string | null
}
export type Tidslinje = {
  /** Dagarna som ritas: "24" och "mån". */
  dagar: { dag: string; vdag: string }[]
  /** Antal ritade arbetsdagar som ligger före månadens slut — linjen står efter dem. */
  slut: number
  rader: TidsRad[]
}

/** Ett svar i ord per trakt: hur länge och när den är klar. "tid saknas" när prognosen saknas — aldrig en gissad dag. */
export type BarSvar = { langd: string; klar: string; ton: TidsBar['stil'] }
export function barSvar(b: TidsBar, t: Tidslinje): BarSvar {
  if (b.stil === 'saknas') return { langd: '', klar: 'tid saknas', ton: 'saknas' }
  // Maskinen är inte på trakten än: inget datum (det vore ett antagande om när den hinner dit), bara ordningen.
  if (b.stil === 'nasta') return { langd: '', klar: 'nästa', ton: 'saknas' }
  if (b.stil === 'darefter') return { langd: '', klar: 'därefter', ton: 'saknas' }
  const langd = b.langd < 1 ? 'under 1 dag' : b.langd < 1.5 ? '1 dag' : `${Math.round(b.langd)} dagar`
  // Efter månadens slut är det enda som räknas — datumet därefter är ingen nytta för den som läser.
  if (b.stil === 'efter') return { langd, klar: 'klar efter månadens slut', ton: 'efter' }
  const d = t.dagar[Math.min(Math.max(0, Math.ceil(b.start + b.langd - 1e-9) - 1), t.dagar.length - 1)]
  return { langd, klar: `klar ${d.vdag} ${d.dag}`, ton: 'klar' }
}

const VDAG = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör']
const MAN = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec']
function dagEtikett(iso: string, forra: string | null): { dag: string; vdag: string } {
  const d = new Date(`${iso}T12:00:00Z`)
  const ny = forra == null || forra.slice(5, 7) !== iso.slice(5, 7)
  return { dag: ny && forra != null ? `${d.getUTCDate()} ${MAN[d.getUTCMonth()]}` : `${d.getUTCDate()}`, vdag: VDAG[d.getUTCDay()] }
}

/** Maskinen kör annat i ALLA spår där den har trakter (GROT, energiklippning, annan trakt): ingen kö, ingen prognos. */
export function arKorAnnat(tavla: Tavla, m: { roll: KlarRoll; namn: string }): boolean {
  const mx = tavla.spar.flatMap(s => s.block).filter(b => b.roll === m.roll).flatMap(b => b.maskiner).filter(x => x.namn === m.namn)
  return mx.length > 0 && mx.every(x => x.korAnnat)
}

export function byggTidslinje(d: TavlaIndata, tavla: Tavla): Tidslinje | null {
  const klar = d.klar
  if (!klar || d.status !== 'pagaende') return null
  const { koer, sista } = koerFor(d)
  const kalender = klar.maskiner.map(m => m.dagar).sort((a, b) => b.length - a.length)[0] ?? []
  const dagar = kalender.slice(0, TIDSLINJE_DAGAR)
  if (dagar.length === 0) return null
  const slut = dagar.filter(x => x <= sista).length

  const skordat = new Map<string, number>()
  const skotat = new Map<string, number>()
  for (const t of klar.trakter) (t.roll === 'skordare' ? skordat : skotat).set(t.objekt_id, t.utfort_volym)
  // Tavlans behov för skördaren: hur mycket av varje trakt som behövs för beställningen.
  const behovs = new Map<string, { behovs: number; kvar: number }>()
  const inteBehovs = new Set<string>()
  for (const s of tavla.spar) {
    const b = s.racker.find(r => r.roll === 'skordare')?.behov
    for (const r of b?.behovs ?? []) behovs.set(r.objekt_id, { behovs: r.behovs, kvar: r.kvar })
    for (const r of b?.inte ?? []) inteBehovs.add(r.objekt_id)
  }

  const rader: TidsRad[] = []
  for (const m of [...klar.maskiner].sort((a, b) => Number(b.roll === 'skotare') - Number(a.roll === 'skotare'))) {
    const ko = koer.get(m.maskin_id) ?? []
    // Kör annat i alla spår där maskinen har trakter: kortet visar bara vad den kör, inte en kö som prognosen ändå inte räknar på.
    if (arKorAnnat(tavla, m)) { rader.push({ maskin_id: m.maskin_id, namn: m.namn, roll: m.roll, barer: [], not: null, korAnnat: true }); continue }
    const barer: TidsBar[] = []
    const efterOkand: string[] = []
    let start = 0
    let okand = false
    for (const r of ko) {
      const t = r.trakt
      // Inget kvar att köra på trakten (t.ex. GROT som redan är utkört): ingen stapel.
      if (r.kvar <= 0) continue
      const namn = traktVy(r, null, sista).namn
      // Skotaren: längden är redan räknad på det som är fällt (och hinner fällas) i tavlans kö. Inget fällt än = väntar på skördaren.
      let faktor = 1
      const vantar = m.roll === 'skotare' && r.kvar > 0 && skordat.has(t.objekt_id) && Math.max(0, (skordat.get(t.objekt_id) ?? 0) - (skotat.get(t.objekt_id) ?? 0)) < MIN_SKOTBART_M3
      // Skördaren: bara den del som behövs. En trakt som inte behövs ritas inte.
      if (m.roll === 'skordare') {
        if (inteBehovs.has(t.objekt_id)) continue
        const b = behovs.get(t.objekt_id)
        if (b && b.kvar > 0) faktor = Math.min(1, b.behovs / b.kvar)
      }
      if (okand) { efterOkand.push(namn); continue }
      if (r.dagar == null) {
        barer.push({ id: `${t.objekt_id}:${t.roll}`, namn, start, langd: Math.max(TIDSLINJE_DAGAR - start, 0), stil: 'saknas', fore: 0, text: `${namn} · tid saknas`, vantar })
        okand = true
        continue
      }
      const langd = r.dagar * faktor
      const slutDag = start + langd
      const stil = slutDag <= slut + 1e-9 ? 'klar' : 'efter'
      barer.push({ id: `${t.objekt_id}:${t.roll}`, namn, start, langd, stil, fore: stil === 'efter' && langd > 0 ? Math.max(0, Math.min(1, (slut - start) / langd)) : 0, text: namn, vantar })
      start = slutDag
    }
    // BARA DATA: bara trakten maskinen faktiskt är på nu (senaste arbetet ligger där) får ett klar-datum. De andra står som nästa / därefter —
    // en uträkning som förutsätter att maskinen hinner dit i tid är ett antagande, inte data. Okänt vad maskinen gör = inget datum alls.
    const pa = d.senaste?.find(x => x.maskin_id === m.maskin_id)?.pa
    barer.forEach((b, i) => {
      const harDar = i === 0 && pa != null && pa.includes(b.id.split(':')[0])
      if (harDar || b.stil === 'saknas') return
      b.stil = i === 0 ? 'nasta' : 'darefter'
    })
    const not = [...(efterOkand.length > 0 ? [`Sedan: ${efterOkand.join(', ')}`] : [])].join(' · ') || null
    if (barer.length > 0 || not) rader.push({ maskin_id: m.maskin_id, namn: m.namn, roll: m.roll, barer, not })
  }
  return { dagar: dagar.map((x, i) => dagEtikett(x, i === 0 ? null : dagar[i - 1])), slut, rader }
}
