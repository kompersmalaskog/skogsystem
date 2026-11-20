// Maskinen som maskin — webbläsarens sida: hämta namnen, låsa upp med kod, låsa igen. Sessionerna byts, aldrig delas:
//   upplåsning  servern kontrollerar koden → engångstoken → enhetens session ÄR personens (verifyOtp). Maskinkontots egen session sparas
//               på enheten (localStorage) så att maskinen kan bli maskin igen.
//   låsning     personens session spärras på servern (best effort), maskinkontots session sätts tillbaka, personens spår på enheten rensas.
// Efter varje byte laddas sidan om: inget som hämtats som personen får ligga kvar i minnet när maskinen är maskin igen.
import { supabase } from '@/lib/supabase'
import { hamtaEnhetMaskin } from '@/lib/enhetMaskin'
import { lasMaskinSession, lasUpplast, sattMaskinSession, sattUpplast } from '@/lib/maskinkonto/upplast'

export type Person = { id: string; namn: string; roll: 'forare' | 'admin'; harKod: boolean }

export async function hamtaPersoner(): Promise<Person[] | null> {
  try {
    const r = await fetch('/api/maskin/vem', { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json() as { personer?: Person[] }
    return j.personer ?? null
  } catch { return null }
}

export type LasUppSvar =
  | { ok: true }
  | { ok: false; fel: 'fel_kod' | 'vantar' | 'ingen_kod' | 'natverk' | 'annat'; vantarTill?: string | null }

export async function lasUppMedKod(p: Person, kod: string): Promise<LasUppSvar> {
  let r: Response
  try {
    r = await fetch('/api/maskin/las-upp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ medarbetare_id: p.id, kod }) })
  } catch { return { ok: false, fel: 'natverk' } }
  const j = await r.json().catch(() => ({})) as { ok?: boolean; fel?: string; vantar_till?: string | null; token_hash?: string; namn?: string; roll?: string }
  if (!r.ok || !j.ok || !j.token_hash) {
    if (j.fel === 'fel_kod' || j.fel === 'vantar' || j.fel === 'ingen_kod') return { ok: false, fel: j.fel, vantarTill: j.vantar_till ?? null }
    return { ok: false, fel: 'annat' }
  }
  // Maskinkontots egen session sparas FÖRE bytet.
  const { data: { session } } = await supabase.auth.getSession()
  const maskinId = hamtaEnhetMaskin()
  if (!session || !maskinId) return { ok: false, fel: 'annat' }
  sattMaskinSession({ access_token: session.access_token, refresh_token: session.refresh_token, maskin_id: maskinId })
  const v = await supabase.auth.verifyOtp({ token_hash: j.token_hash, type: 'magiclink' })
  if (v.error) { sattMaskinSession(null); return { ok: false, fel: 'annat' } }
  sattUpplast({ id: p.id, namn: p.namn, roll: p.roll, aktivitet: Date.now() })
  return { ok: true }
}

/** Spärrar personens session på servern (best effort) och sätter tillbaka maskinkontots. Returnerar false om maskinkontot inte gick att få tillbaka. */
async function aterMaskin(): Promise<boolean> {
  const ms = lasMaskinSession()
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) void fetch('/api/maskin/las', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, keepalive: true }).catch(() => undefined)
  } catch { /* */ }
  sattUpplast(null)
  if (!ms) return false
  const r = await supabase.auth.setSession({ access_token: ms.access_token, refresh_token: ms.refresh_token })
  sattMaskinSession(null)
  return !r.error
}

/** Maskinen låser sig: tillbaka till kartan som maskin. */
export async function lasMaskinen(): Promise<void> {
  const ok = await aterMaskin()
  window.location.assign(ok ? '/planering' : '/login')
}

/** Admin loggar ut hela maskinen (maskinkontot också) — till inloggningssidan. */
export async function loggaUtMaskinen(): Promise<void> {
  await aterMaskin()
  try { await supabase.auth.signOut() } catch { /* */ }
  window.location.assign('/login')
}

export { lasUpplast }
