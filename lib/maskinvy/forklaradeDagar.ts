// Förklarade tomma dagar i Produktion-kalendern (maskinvy ?ny=1).
//
// En dag utan produktion står som "Ej aktiv" i kalendern. Är orsaken känd säger vi den:
//   · registrerat maskinstopp (stopp/stopp_maskin)          → "Stopp"
//   · heldagsledighet för maskinens ordinarie förare:
//       semester                                            → "Semester"
//       allt annat (sjuk, VAB, ATK, tjänstledig …)          → "Ledig"   — typen visas aldrig för andra än den det gäller
//   · ingen känd orsak                                      → ingen förklaring (dagen står kvar som "Ej aktiv")
//
// Reglerna är HELIKOPTERNS (`helikopter_ny_maskindag`, migration 20261017100635): samma dagar räknas som arbetsdagar
// (inte helg eller röd dag), registrerat stopp går före ledighet, en dag med fil/produktion är KÖRD oavsett ledighet.
// Statusen kommer därför ur samma SQL-funktion; här läggs bara TYPEN på ledigheten till (funktionen svarar
// "ledig:Stefan", aldrig vad ledigheten är), och produktionsdagar i vyn går alltid före.
//
// Maskin med manuell datakälla (810E, `dim_maskin.datakalla = 'manuell'`) förklaras aldrig: där betyder "ingen fil"
// "ingen har rapporterat", inte "stod still".
//
// Ingen beräkning i vyn rörs av detta — det är bara en text på en dag som redan är tom.

export type Forklaring = {
  slag: 'semester' | 'ledig' | 'stopp'
  /** Ordet som visas. */
  text: 'Semester' | 'Ledig' | 'Stopp'
  /** Stoppets orsak i klartext (bara för slag 'stopp'); null annars. */
  detalj: string | null
}

/** En rad ur helikopter_ny_maskindag. */
export type MaskindagRad = { maskin_id: string; datum: string; status: string; orsak: string | null }
/** En heldagsledighet (godkänd eller registrerad) för en förare som kör maskinen. */
export type LedighetRad = { maskin_id: string; typ: string; startdatum: string; slutdatum: string }

export type ForklaringsUnderlag = {
  /** Maskinerna som visas (en maskin, eller båda H8E i kombon). */
  maskinIds: string[]
  /** Maskiner med manuell datakälla bland maskinIds. */
  manuella: string[]
  rader: MaskindagRad[]
  ledighet: LedighetRad[]
}

/** Typer av ledighet för maskinen den dagen. Tom = ingen känd. */
function ledighetsTyper(ledighet: LedighetRad[], maskinId: string, datum: string): string[] {
  const ut: string[] = []
  for (const l of ledighet) {
    if (l.maskin_id === maskinId && l.startdatum <= datum && datum <= l.slutdatum) ut.push(l.typ)
  }
  return ut
}

function stoppDetalj(orsak: string | null): string | null {
  const t = (orsak ?? '').replace(/^registrerat:/, '').trim()
  if (!t) return null
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Datum → förklaring för de tomma dagar där orsaken är känd. Dagar i `produktionsDatum` förklaras aldrig.
 * Kombon (flera maskiner) förklarar en dag bara när ALLA maskinerna som helikopterfunktionen räknar den dagen har
 * samma kända orsak — blandade orsaker eller en maskin utan orsak ger ingen förklaring (hellre tomt än fel).
 */
export function forklaraTommaDagar(u: ForklaringsUnderlag, produktionsDatum: ReadonlySet<string>): Record<string, Forklaring> {
  const ut: Record<string, Forklaring> = {}
  if (u.manuella.some(m => u.maskinIds.includes(m))) return ut

  const perDatum = new Map<string, MaskindagRad[]>()
  for (const r of u.rader) {
    if (!u.maskinIds.includes(r.maskin_id)) continue
    const lista = perDatum.get(r.datum)
    if (lista) lista.push(r)
    else perDatum.set(r.datum, [r])
  }

  for (const [datum, rader] of perDatum) {
    if (produktionsDatum.has(datum)) continue
    const per = rader.map((r): Forklaring | null => {
      if (r.status === 'registrerat') return { slag: 'stopp', text: 'Stopp', detalj: stoppDetalj(r.orsak) }
      if (r.status === 'planerat') {
        const typer = ledighetsTyper(u.ledighet, r.maskin_id, datum)
        // Bara semester när ALLA ledigheter den dagen är semester; saknas typen (borde inte hända) är det "Ledig".
        return typer.length > 0 && typer.every(t => t === 'semester')
          ? { slag: 'semester', text: 'Semester', detalj: null }
          : { slag: 'ledig', text: 'Ledig', detalj: null }
      }
      return null
    })
    if (per.some(f => f === null)) continue
    const forsta = per[0] as Forklaring
    if (per.every(f => f!.slag === forsta.slag)) ut[datum] = forsta
  }
  return ut
}

// ── Raderna under kalendern ──────────────────────────────────
// Ordet ryms inte i en cell på en telefon ("Semester" är ~49 px, cellen 39–43 px), så kalendern markerar dagen och en rad
// under den säger vad: "Semester 14–16 okt". Dagar i följd med samma förklaring blir EN rad; en helg emellan bryter inte
// (fredag och måndag hör ihop), men en dag med produktion eller utan förklaring gör det.

const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

export type ForklaringsRad = { text: Forklaring['text']; slag: Forklaring['slag']; fran: string; till: string; detalj: string | null; period: string }

function iso(d: Date): string { return d.toISOString().slice(0, 10) }
function dagEfter(datum: string): string { const d = new Date(datum + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return iso(d) }
function arHelg(datum: string): boolean { const v = new Date(datum + 'T12:00:00Z').getUTCDay(); return v === 0 || v === 6 }

/** "14 okt", "14–16 okt", "30 sep–2 okt". */
export function periodText(fran: string, till: string): string {
  const [, fm, fd] = fran.split('-').map(Number), [, tm, td] = till.split('-').map(Number)
  if (fran === till) return `${fd} ${MANAD[fm - 1]}`
  if (fm === tm) return `${fd}–${td} ${MANAD[tm - 1]}`
  return `${fd} ${MANAD[fm - 1]}–${td} ${MANAD[tm - 1]}`
}

/** Förklaringarna som rader i datumordning. `synliga` = dagarna kalendern visar (ingen rad för något utanför). */
export function forklaringsRader(forklaring: Readonly<Record<string, Forklaring>>, synliga: readonly string[]): ForklaringsRad[] {
  const dagar = synliga.filter(d => forklaring[d]).sort()
  const ut: ForklaringsRad[] = []
  for (const d of dagar) {
    const f = forklaring[d]
    const sista = ut[ut.length - 1]
    if (sista && sista.slag === f.slag && sista.detalj === f.detalj) {
      // Hänger ihop om dagen efter sista (eller, över en helg, måndagen efter fredagen) är den här.
      let n = dagEfter(sista.till)
      while (n < d && arHelg(n)) n = dagEfter(n)
      if (n === d) { sista.till = d; sista.period = periodText(sista.fran, d); continue }
    }
    ut.push({ text: f.text, slag: f.slag, fran: d, till: d, detalj: f.detalj, period: periodText(d, d) })
  }
  return ut
}
