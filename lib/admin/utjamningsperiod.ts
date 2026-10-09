// ─────────────────────────────────────────────────────────────
// UTJÄMNINGSPERIODER I ADMIN (Admin → Avtal). Ren logik: veckor, validering, sortering och regeln om exporterad lön.
//
// Tabellen utjamningsperiod (migration 20260918100000): startdatum (måndag), slutdatum (söndag) — samma CHECK som tabellen —
// medarbetare_id (NULL = alla), anteckning, skapad_av. Årsövertiden läser den (lib/lonesystem/arsovertid).
// En period väljs i HELA ISO-veckor: formuläret erbjuder bara måndagar, så en period som bryter tabellens CHECK inte går
// att skapa.
// ─────────────────────────────────────────────────────────────
import { isoVecka } from "@/lib/vilobrott"
import { anledningGiltig } from "@/lib/redigeraAnledning"

/** Längre än så kräver lokal överenskommelse (§5 mom 2). En varning, ingen spärr. */
export const MAX_VECKOR_UTAN_ÖVERENSKOMMELSE = 16

const MAN_KORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]

type Datumpar = { startdatum: string; slutdatum: string }

const lokal = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d) }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const dagar = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }

/** "v17–27", "v17", eller över årsskifte "v51 2026 – v3 2027". */
export function veckoText(p: Datumpar): string {
  const a = isoVecka(lokal(p.startdatum)), b = isoVecka(lokal(p.slutdatum))
  if (a.år !== b.år) return `v${a.vecka} ${a.år} – v${b.vecka} ${b.år}`
  return a.vecka === b.vecka ? `v${a.vecka}` : `v${a.vecka}–${b.vecka}`
}

/** Hela veckor från måndagen till söndagen (båda inräknade). */
export function antalVeckor(p: Datumpar): number {
  return Math.round((lokal(p.slutdatum).getTime() + 86400000 - lokal(p.startdatum).getTime()) / (7 * 86400000))
}

export const arLangPeriod = (p: Datumpar) => antalVeckor(p) > MAX_VECKOR_UTAN_ÖVERENSKOMMELSE

/** Söndagen i veckan som börjar på måndagen `mandag`. */
export const slutFranMandag = (mandag: string) => iso(dagar(lokal(mandag), 6))

/** Måndagen i veckan som slutar på söndagen `slut` (för att fylla formuläret ur en sparad period). */
export const mandagFranSlut = (slut: string) => iso(dagar(lokal(slut), -6))

/** Veckorna från ISO-vecka 1 året före `ar` till sista veckan året efter: värdet är måndagen, etiketten läsbar. */
export function veckoAlternativ(ar: number): { value: string; label: string }[] {
  const v1 = new Date(ar - 1, 0, 4)
  v1.setDate(v1.getDate() - ((v1.getDay() + 6) % 7))
  const slut = new Date(ar + 1, 11, 31)
  const ut: { value: string; label: string }[] = []
  for (let m = v1; m <= slut; m = dagar(m, 7)) {
    const s = dagar(m, 6)
    const v = isoVecka(m)
    const dagText = m.getMonth() === s.getMonth() ? `${m.getDate()}–${s.getDate()} ${MAN_KORT[m.getMonth()]}` : `${m.getDate()} ${MAN_KORT[m.getMonth()]}–${s.getDate()} ${MAN_KORT[s.getMonth()]}`
    ut.push({ value: iso(m), label: `v${v.vecka} ${v.år} · ${dagText}` })
  }
  return ut
}

/** Det som spärrar Spara. Null = går att spara. */
export function kontrolleraPeriod(p: { forsta: string; sista: string; anteckning: string }): string | null {
  if (!p.forsta) return "Välj första veckan."
  if (!p.sista) return "Välj sista veckan."
  if (p.sista < p.forsta) return "Sista veckan ligger före den första."
  if (!anledningGiltig(p.anteckning)) return "Skriv en anteckning: minst 3 tecken, vad som gjordes."
  return null
}

/** Kommande och pågående (efter start, tidigast först) överst; avslutade (senast slut först) under. En period som slutar idag pågår. */
export function delaUpp<T extends Datumpar>(rader: T[], idag: string): { kommande: T[]; avslutade: T[] } {
  const kommande = rader.filter(r => r.slutdatum >= idag).sort((a, b) => a.startdatum.localeCompare(b.startdatum))
  const avslutade = rader.filter(r => r.slutdatum < idag).sort((a, b) => b.slutdatum.localeCompare(a.slutdatum))
  return { kommande, avslutade }
}

/** Löneperioderna (YYYY-MM) som perioden berör: varje arbetsmånad från start till slut, löneperiod = arbetsmånad + 1. */
export function loneperioderBerorda(p: Datumpar): string[] {
  const s = lokal(p.startdatum), e = lokal(p.slutdatum)
  const ut: string[] = []
  for (let y = s.getFullYear(), m = s.getMonth(); y < e.getFullYear() || (y === e.getFullYear() && m <= e.getMonth()); m++) {
    if (m > 11) { m = 0; y++ }
    const lone = new Date(y, m + 1, 1)
    ut.push(`${lone.getFullYear()}-${String(lone.getMonth() + 1).padStart(2, "0")}`)
  }
  return ut
}

/**
 * Har perioden påverkat en redan EXPORTERAD löneperiod? Skickad lön (fortnox_export_logg.status = 'skickat') för en
 * berörd löneperiod: för vem som helst om perioden gäller alla, annars för just den personen.
 */
export function arExporterad(p: Datumpar & { medarbetare_id?: string | null }, logg: { period: string; medarbetare_id: string; status: string }[]): boolean {
  const berorda = new Set(loneperioderBerorda(p))
  return logg.some(l => l.status === "skickat" && berorda.has(l.period) && (!p.medarbetare_id || l.medarbetare_id === p.medarbetare_id))
}
