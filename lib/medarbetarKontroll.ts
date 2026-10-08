// ─────────────────────────────────────────────────────────────
// KONTROLLER PÅ DET SOM BARA ADMIN-FORMULÄRET SÄTTER. Tre saker har orsakat
// tyst dataförlust för att ingen kontrollerade dem:
//   * operatörskopplingen — Daniel (aug, fem dagar) och Martin (19–27 sep,
//     fyra dagar, 25 timmar) låg utanför lönen tills operatör-id kopplades
//   * maskinen på medarbetarraden — ingen varnade när den saknades
//   * user_id — Oscar fastnade i "Laddar..." (löst i databasen, 20260929)
// Kontrollen FÖRESLÅR bara: ett operatörsnamn som matchar en medarbetare
// visas för ett klick i admin, aldrig automatisk koppling — ett namn kan vara
// fel. Ren logik + en hämtare. Används av admin (/api/medarbetare/kontroller)
// och nattjobbet (/api/km/nattjobb, rapporteras i svaret och loggen).
// ─────────────────────────────────────────────────────────────
import { arObekraftad } from "./hempunkt"

export type OkandOperator = {
  operator_id: string
  maskin_id: string | null
  operator_namn: string
  datum: string[]           // dagar med skift, stigande
  medarbetare: { id: string; namn: string }
}

export type ForareUtanMaskin = { id: string; namn: string }
export type SaknarHem = { id: string; namn: string; orsak: "ingen_adress" | "vantar" | "osaker" | "misslyckad" }

/** Namn jämförs utan skiftläge och med blanksteg hopslagna. */
export const normNamn = (s: string | null | undefined) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim()

/**
 * Skift vars operatör inte är kopplad, men vars operatörsnamn matchar EXAKT EN
 * medarbetare. Operatörer utan namnmatch ("Service Service") tas inte med —
 * de är inte en förare som saknas i lönen.
 */
export function okandaOperatorer(
  skift: { operator_id: string | null; maskin_id: string | null; datum: string }[],
  kopplade: Set<string>,
  dimOperator: { operator_id: string; operator_namn: string | null }[],
  medarbetare: { id: string; namn: string | null; aktiv?: boolean | null }[],
): OkandOperator[] {
  const namnPerOp = new Map(dimOperator.map(d => [d.operator_id, d.operator_namn || ""]))
  const perNamn = new Map<string, { id: string; namn: string }[]>()
  for (const m of medarbetare) {
    if (m.aktiv === false || !m.namn) continue
    const k = normNamn(m.namn)
    if (!perNamn.has(k)) perNamn.set(k, [])
    perNamn.get(k)!.push({ id: m.id, namn: m.namn })
  }
  const per = new Map<string, OkandOperator>()
  for (const s of skift) {
    if (!s.operator_id || kopplade.has(s.operator_id)) continue
    const opNamn = namnPerOp.get(s.operator_id) || ""
    const traffar = perNamn.get(normNamn(opNamn)) || []
    if (!opNamn || traffar.length !== 1) continue
    let o = per.get(s.operator_id)
    if (!o) {
      o = { operator_id: s.operator_id, maskin_id: s.maskin_id, operator_namn: opNamn, datum: [], medarbetare: traffar[0] }
      per.set(s.operator_id, o)
    }
    if (!o.datum.includes(s.datum)) o.datum.push(s.datum)
  }
  return Array.from(per.values())
    .map(o => ({ ...o, datum: o.datum.sort() }))
    .sort((a, b) => (b.datum[b.datum.length - 1] || "").localeCompare(a.datum[a.datum.length - 1] || ""))
}

/** Aktiva förare utan maskin — MOM kan inte skapa deras dagar, Dag-vyn vet inte maskinen. */
export function forareUtanMaskin(
  medarbetare: { id: string; namn: string | null; roll: string | null; maskin_id: string | null; aktiv?: boolean | null }[],
): ForareUtanMaskin[] {
  return medarbetare
    .filter(m => m.roll === "forare" && m.aktiv !== false && !m.maskin_id)
    .map(m => ({ id: m.id, namn: m.namn || "Namnlös" }))
}

/** Aktiva medarbetare som saknar användbar hempunkt — km räknas inte för dem. */
export function saknarHempunkt(
  medarbetare: { id: string; namn: string | null; aktiv?: boolean | null; hemadress: string | null; hem_lat: number | null; hem_lng: number | null; hem_geokod_status?: string | null }[],
): SaknarHem[] {
  const ut: SaknarHem[] = []
  for (const m of medarbetare) {
    if (m.aktiv === false) continue
    if (m.hem_lat != null && m.hem_lng != null) continue
    const namn = m.namn || "Namnlös"
    if (!m.hemadress || !m.hemadress.trim()) { ut.push({ id: m.id, namn, orsak: "ingen_adress" }); continue }
    const s = m.hem_geokod_status
    ut.push({ id: m.id, namn, orsak: s === "osaker" ? "osaker" : s === "misslyckad" ? "misslyckad" : "vantar" })
  }
  return ut
}

/** Aktiva medarbetare vars hempunkt kommer från geokodningen och som ingen har bekräftat eller flyttat på kartan. */
export function obekraftadeHempunkter(
  medarbetare: { id: string; namn: string | null; aktiv?: boolean | null; hem_lat: number | null; hem_lng: number | null; hem_koord_kalla?: string | null; hem_bekraftad_tid?: string | null; hem_geokod_precision?: string | null }[],
): { id: string; namn: string }[] {
  return medarbetare
    .filter(m => m.aktiv !== false && arObekraftad(m as any))
    .map(m => ({ id: m.id, namn: m.namn || "Namnlös" }))
}

export type MedarbetarKontroller = {
  okandaOperatorer: OkandOperator[]
  forareUtanMaskin: ForareUtanMaskin[]
  saknarHempunkt: SaknarHem[]
  /** Geokodade hempunkter som ingen bekräftat — km räknas, men punkten är inte kontrollerad. */
  obekraftadHempunkt: { id: string; namn: string }[]
}

/** Hämta och räkna kontrollerna. Service-klient (fakt_skift/operator_medarbetare är RLS-låsta). */
export async function hamtaMedarbetarKontroller(supabase: any, dagar = 42): Promise<MedarbetarKontroller> {
  const fran = new Date(Date.now() - dagar * 86400_000).toISOString().slice(0, 10)
  const [skiftRes, omRes, dimRes, medRes] = await Promise.all([
    supabase.from("fakt_skift").select("operator_id, maskin_id, datum").gte("datum", fran).order("datum", { ascending: true }).order("id", { ascending: true }).range(0, 4999),
    supabase.from("operator_medarbetare").select("operator_id"),
    supabase.from("dim_operator").select("operator_id, operator_namn"),
    supabase.from("medarbetare").select("id, namn, roll, maskin_id, aktiv, hemadress, hem_lat, hem_lng, hem_geokod_status, hem_koord_kalla, hem_bekraftad_tid, hem_geokod_precision"),
  ])
  for (const r of [skiftRes, omRes, dimRes, medRes]) if (r.error) throw new Error(r.error.message)
  const kopplade = new Set<string>((omRes.data || []).map((r: any) => String(r.operator_id)))
  return {
    okandaOperatorer: okandaOperatorer(skiftRes.data || [], kopplade, dimRes.data || [], medRes.data || []),
    forareUtanMaskin: forareUtanMaskin(medRes.data || []),
    saknarHempunkt: saknarHempunkt(medRes.data || []),
    obekraftadHempunkt: obekraftadeHempunkter(medRes.data || []),
  }
}
