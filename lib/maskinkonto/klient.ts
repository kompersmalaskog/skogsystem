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

/** Svaret på "skicka notisen om att välja kod": vad arket ska visa. vantarTill = när "Skicka igen" går att trycka på (serverns klocka). */
export type KodNotisSvar =
  | { typ: 'harKod' }
  | { typ: 'ingen_push' }
  | { typ: 'skickad' | 'vantar'; vantarTill: string | null }
  | { typ: 'fel' }

/** Personen har tryckt på sitt namn och har ingen kod: be servern skicka en notis till hens telefon. Skickar aldrig något annat än id:t. */
export async function begarKodNotis(p: Person): Promise<KodNotisSvar> {
  try {
    const r = await fetch('/api/maskin/kod-notis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ medarbetare_id: p.id }) })
    const j = await r.json().catch(() => ({})) as { ok?: boolean; harKod?: boolean; harPush?: boolean; skickad?: boolean; vantarTill?: string | null }
    if (!r.ok || !j.ok) return { typ: 'fel' }
    if (j.harKod) return { typ: 'harKod' }
    if (j.harPush === false) return { typ: 'ingen_push' }
    return { typ: j.skickad ? 'skickad' : 'vantar', vantarTill: j.vantarTill ?? null }
  } catch { return { typ: 'fel' } }
}

/** Har personen valt sin kod än? null = gick inte att läsa. Läsning — låser aldrig upp något. */
export async function hamtaHarKod(id: string): Promise<boolean | null> {
  try {
    const r = await fetch(`/api/maskin/kod-notis?medarbetare_id=${encodeURIComponent(id)}`, { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json() as { harKod?: boolean }
    return typeof j.harKod === 'boolean' ? j.harKod : null
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
  // Upplåsningen skrivs FÖRE bytet: finns personens session i webbläsaren finns också minnet av att den ska kastas (aldrig en personlig session utan spår).
  sattUpplast({ id: p.id, namn: p.namn, roll: p.roll, aktivitet: Date.now() })
  const v = await supabase.auth.verifyOtp({ token_hash: j.token_hash, type: 'magiclink' })
  if (v.error) { sattUpplast(null); sattMaskinSession(null); return { ok: false, fel: 'annat' } }
  return { ok: true }
}

/** Rensar allt Supabase lagrat i webbläsaren (sessionen i localStorage och i cookies). Sista utvägen när ett vanligt signOut inte gick. */
export function rensaSupabaseLagring(): void {
  try { Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k)) } catch { /* */ }
  try { sessionStorage && Object.keys(sessionStorage).filter(k => k.startsWith('sb-')).forEach(k => sessionStorage.removeItem(k)) } catch { /* */ }
  try { document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => n.startsWith('sb-')).forEach(n => { document.cookie = `${n}=; Max-Age=0; path=/` }) } catch { /* */ }
}

/** Personens session ska ALDRIG ligga kvar: utloggad lokalt (och på servern), och om inte ens det går rensas lagringen för hand. */
async function loggaUtLokalt(): Promise<void> {
  try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* nästa steg tar det */ }
  rensaSupabaseLagring()
}

/**
 * Spärrar personens session på servern (best effort) och sätter tillbaka maskinkontots. Returnerar true om maskinkontot är tillbaka.
 * GÅR DET INTE (maskinkontots sparade session saknas eller setSession misslyckas) loggas personen ut lokalt innan något annat händer — oavsett utfall
 * ligger aldrig personens session kvar i webbläsaren.
 */
async function aterMaskin(): Promise<boolean> {
  const ms = lasMaskinSession()
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) void fetch('/api/maskin/las', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, keepalive: true }).catch(() => undefined)
  } catch { /* */ }
  sattUpplast(null)
  let tillbaka = false
  if (ms) {
    try { tillbaka = !(await supabase.auth.setSession({ access_token: ms.access_token, refresh_token: ms.refresh_token })).error } catch { tillbaka = false }
  }
  sattMaskinSession(null)
  if (!tillbaka) await loggaUtLokalt()
  return tillbaka
}

/** Maskinen låser sig: tillbaka till kartan som maskin. Går maskinkontot inte att få tillbaka: utloggad och till inloggningen. */
export async function lasMaskinen(): Promise<void> {
  const ok = await aterMaskin()
  window.location.assign(ok ? '/planering' : '/login')
}

/** Admin loggar ut hela maskinen (maskinkontot också) — till inloggningssidan. */
export async function loggaUtMaskinen(): Promise<void> {
  await aterMaskin()
  await loggaUtLokalt()
  window.location.assign('/login')
}

export { lasUpplast }
