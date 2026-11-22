// Maskinvyns navigering och webbläsarens historik (2026-11-22).
//
// FELET: flik, maskin, läge och öppna djupvyer låg i useState och skrevs aldrig till historiken (flikbytet gjorde
// `history.replaceState`). Systemets backa (gest / webbläsarknapp) lämnade därför hela vyn i ett enda steg: Produktion → Analys
// → backa gick till sidan man kom ifrån.
//
// REGELN HÄR: URL:en är den enda källan till vad som visas. Allt som är ett NYTT STÄLLE att vara på skrivs med pushState, allt
// som bara är en justering av samma ställe med replaceState, och vyn läser alltid sitt läge ur adressen — så backa, framåt och
// omladdning landar på samma flik och maskin utan någon extra kod.
//
//   flik (vy), läge (skördare/skotare/jämförelse), maskin   → 'push'
//   period (V/M/K/Å) och månadspilarna                      → 'replace' (annars blir backa ett tjat genom varje månadsklick)
//   djupvy/panel                                            → en marköms-post i historiken (`useDjupvyHistorik`)
//
// Parametrarna lever bredvid de som redan fanns (`ny`, `vy`); alla andra parametrar i adressen lämnas orörda.

import { useEffect, useSyncExternalStore } from 'react'

export type NavParam = 'vy' | 'lage' | 'skordare' | 'skotare' | 'per' | 'off'
export type Metod = 'push' | 'replace'
export type NavAndringar = Partial<Record<NavParam, string | null>>

/** Nyckeln i history.state som märker en post som en öppen djupvy (id = vilken). */
export const DJUP_MARKOR = 'mvDjup'
/** Antal poster maskinvyn själv lagt i historiken ovanpå ingången. 0 = vi står på ingången (där backa lämnar vyn). */
export const NIVA_NYCKEL = 'mvNiva'

const HAENDELSE = 'mv-nav'

// ── Ren del: adressen ────────────────────────────────────────────────────────────────────────────────────────

/** Sökdelen med ändringarna gjorda. null tar bort parametern, andra parametrar lämnas orörda. Sorteras inte om. */
export function byggSok(sok: string, andringar: NavAndringar): string {
  const p = new URLSearchParams(sok)
  for (const [k, v] of Object.entries(andringar)) {
    if (v === undefined) continue
    if (v === null || v === '') p.delete(k)
    else p.set(k, v)
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

export type SkrivBeslut =
  | { atgard: 'ingen' }
  | { atgard: 'skriv'; metod: Metod; url: string; niva: number; /** posten var en djupvy som navigeringen lämnar */ ersattDjup: boolean }

/**
 * Vad ska hända med historiken när vyn vill ändra adressen?
 *  - samma adress → ingenting (ett tryck på redan vald flik ska inte lägga en post som gör att backa "inte gör något")
 *  - push från en öppen djupvy → ERSÄTT djupvyns post: man navigerar bort från den, så den ska inte ligga kvar som en död
 *    backa-post (annars ser nästa backa ut att inte göra något)
 *  - push → ny post, en nivå upp
 */
export function beslutaSkrivning(
  nu: { pathname: string; search: string; hash: string; state: unknown },
  andringar: NavAndringar,
  metod: Metod,
): SkrivBeslut {
  const nySok = byggSok(nu.search, andringar)
  if (nySok === nu.search) return { atgard: 'ingen' }
  const url = `${nu.pathname}${nySok}${nu.hash}`
  const nivaNu = nivaUr(nu.state)
  if (metod === 'replace') return { atgard: 'skriv', metod: 'replace', url, niva: nivaNu, ersattDjup: false }
  if (arDjupPost(nu.state)) return { atgard: 'skriv', metod: 'replace', url, niva: nivaNu, ersattDjup: true }
  return { atgard: 'skriv', metod: 'push', url, niva: nivaNu + 1, ersattDjup: false }
}

export function nivaUr(state: unknown): number {
  const n = (state as Record<string, unknown> | null)?.[NIVA_NYCKEL]
  return typeof n === 'number' && n > 0 ? n : 0
}

export function arDjupPost(state: unknown): boolean {
  const v = (state as Record<string, unknown> | null)?.[DJUP_MARKOR]
  return v !== undefined && v !== null
}

// ── Webbläsardelen ─────────────────────────────────────────────────────────────────────────────────────────

/** Skriv ändringarna till adressen. Bara i webbläsaren; kastar aldrig (en historik som inte går att skriva ska inte fälla vyn). */
export function skrivNavigering(andringar: NavAndringar, metod: Metod): void {
  if (typeof window === 'undefined') return
  try {
    const l = window.location
    const b = beslutaSkrivning({ pathname: l.pathname, search: l.search, hash: l.hash, state: window.history.state }, andringar, metod)
    if (b.atgard === 'ingen') return
    // En replace behåller postens övriga state (bl.a. Nexts egna) och en djupvys markör (en periodändring får inte ta bort
    // djupvyns post); lämnar man en djupvy genom att navigera strippas markören — posten är inte längre en djupvy.
    // Nexts egna nycklar (__NA m.fl.) skickas INTE med: Nexts omslag kopierar dem själv, och bara då synkar routern sin adress med
    // den nya (en state som redan bär __NA tolkas som "Next gjorde det här" och hoppar över synken).
    const { [DJUP_MARKOR]: djup, ...allt } = (window.history.state ?? {}) as Record<string, unknown>
    const rest = Object.fromEntries(Object.entries(allt).filter(([k]) => k !== '_N' && !k.startsWith('__')))
    const state = {
      ...(b.metod === 'replace' ? rest : {}),
      ...(b.metod === 'replace' && !b.ersattDjup && djup !== undefined ? { [DJUP_MARKOR]: djup } : {}),
      [NIVA_NYCKEL]: b.niva,
    }
    if (b.metod === 'push') window.history.pushState(state, '', b.url)
    else window.history.replaceState(state, '', b.url)
    window.dispatchEvent(new Event(HAENDELSE))
  } catch { /* ingen historik — vyn fungerar ändå, bara utan backa-steg */ }
}

/** Låter alla som lyssnar (useNavSok, useNavNiva) läsa om adressen/historiken — efter en egen pushState som inte går genom skrivNavigering. */
export function signalera(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(HAENDELSE))
}

/** ETT steg bakåt i historiken — exakt vad systemets backa (gest/webbläsarknapp) gör. Toppfältets tillbaka-knapp anropar den. */
export function backaEttSteg(): void {
  try { window.history.back() } catch { /* ingen historik */ }
}

/** Kroken som toppfältet (components/TopBar.tsx) läser: finns attributet visas en blå tillbaka-knapp i stället för hem-ikonen. */
export const TILLBAKA_ATTR = 'data-topbar-tillbaka'

function prenumerera(cb: () => void): () => void {
  window.addEventListener('popstate', cb)
  window.addEventListener(HAENDELSE, cb)
  return () => {
    window.removeEventListener('popstate', cb)
    window.removeEventListener(HAENDELSE, cb)
  }
}
const lasSok = () => window.location.search
const serverSok = () => ''
const lasNiva = () => nivaUr(window.history.state)

/** Sökdelen i adressen som React-state: ritas om vid backa/framåt och vid varje skrivning ovan. */
export function useNavSok(): string {
  return useSyncExternalStore(prenumerera, lasSok, serverSok)
}

/** Hur många steg (flik, maskin, djupvy …) maskinvyn själv har lagt i historiken. 0 = vi står på ingången. */
export function useNavNiva(): number {
  return useSyncExternalStore(prenumerera, lasNiva, () => 0)
}

/**
 * Knappen uppe till vänster följer historiken (Martin 2026-11-22): på ingången är den appens hem-ikon, så fort vyn lagt ett steg
 * (ny flik, ny maskin, öppen djupvy eller panel) blir den en blå tillbaka-knapp som backar ETT steg — samma steg som systemets backa.
 * Det här är den enda som avgör läget; toppfältet bara ritar det.
 */
export function useHornknapp(): void {
  const niva = useNavNiva()
  useEffect(() => {
    if (niva > 0) document.body.setAttribute(TILLBAKA_ATTR, '')
    else document.body.removeAttribute(TILLBAKA_ATTR)
  }, [niva])
  useEffect(() => () => document.body.removeAttribute(TILLBAKA_ATTR), [])
}

export function navParam(sok: string, nyckel: NavParam | 'ny'): string | null {
  return new URLSearchParams(sok).get(nyckel)
}

// ── Periodparametrarna (gamla vyerna): V/M/K/Å + antal steg bakåt ─────────────────────────────────────────

export type PeriodTyp = 'V' | 'M' | 'K' | 'Å'
const PERIODER: readonly PeriodTyp[] = ['V', 'M', 'K', 'Å']

export function lasPeriod(sok: string): PeriodTyp {
  const v = navParam(sok, 'per')
  return PERIODER.find(p => p === v) ?? 'M'
}

/** Steg bakåt från innevarande period: 0 eller negativt. Ogiltigt eller positivt värde = 0. */
export function lasOffset(sok: string): number {
  const n = Number(navParam(sok, 'off'))
  return Number.isInteger(n) && n < 0 ? n : 0
}

export const periodAndring = (p: PeriodTyp): NavAndringar => ({ per: p === 'M' ? null : p, off: null })
export const offsetAndring = (o: number): NavAndringar => ({ off: o < 0 ? String(o) : null })
