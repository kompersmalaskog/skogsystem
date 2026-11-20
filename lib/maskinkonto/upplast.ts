// Maskinen som maskin — enhetens eget tillstånd (localStorage) och de rena reglerna. Inga beroenden på Supabase, så att TopBar, startvakten
// och push-registreringen kan fråga "är maskinen upplåst?" synkront.
//
// Läget på en enhet med ett maskinkonto:
//   last      maskinkontot är inloggat (maskinen är maskinen). Öppet: körvy, kartan, planering, objekt, uppföljning per maskin.
//             Låst (lås-ikon): förarens egna saker. Dolt: Ekonomi, Personal m.m. (bara admin efter upplåsning).
//   upplast   en person har skrivit sin kod; enhetens session ÄR personens. Lagrad: vem, när senaste tryck, och maskinkontots egen session
//             (så att maskinen kan bli maskin igen).
//   avstangd  maskinens brytare är av — kontot används inte längre; appen säger det.

export const UPPLAST_NYCKEL = 'maskin_upplast_v1'
export const MASKIN_SESSION_NYCKEL = 'maskin_session_v1'
/** Efter så här lång tid utan tryck låser maskinen sig själv. */
export const IDLE_MS = 10 * 60 * 1000

export type Upplast = { id: string; namn: string; roll: 'forare' | 'admin'; aktivitet: number }
export type MaskinSession = { access_token: string; refresh_token: string; maskin_id: string }

function lasJson<T>(nyckel: string): T | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const r = localStorage.getItem(nyckel)
    return r ? (JSON.parse(r) as T) : null
  } catch { return null }
}
function skrivJson(nyckel: string, v: unknown | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (v === null) localStorage.removeItem(nyckel); else localStorage.setItem(nyckel, JSON.stringify(v))
  } catch { /* */ }
}

export const lasUpplast = (): Upplast | null => {
  const u = lasJson<Upplast>(UPPLAST_NYCKEL)
  return u && typeof u.id === 'string' && typeof u.aktivitet === 'number' ? u : null
}
export const sattUpplast = (u: Upplast | null): void => skrivJson(UPPLAST_NYCKEL, u)
export const lasMaskinSession = (): MaskinSession | null => {
  const s = lasJson<MaskinSession>(MASKIN_SESSION_NYCKEL)
  return s && s.access_token && s.refresh_token ? s : null
}
export const sattMaskinSession = (s: MaskinSession | null): void => skrivJson(MASKIN_SESSION_NYCKEL, s)

/** Synkront: är maskinen upplåst av en person just nu? (Inte utgången.) */
export function maskinUpplast(nu = Date.now()): boolean {
  const u = lasUpplast()
  return !!u && !utgangen(u, nu) && lasMaskinSession() !== null
}

export const utgangen = (u: Pick<Upplast, 'aktivitet'>, nu: number, idle = IDLE_MS): boolean => nu - u.aktivitet >= idle

// ── Vad som är öppet, låst och dolt ───────────────────────────────────────────────────────────────────────────
/** Förarens egna saker: minst en rad med lås på maskinen. Sidorna nås först efter "Vem är du?". */
export const LASTA_SOKVAGAR = ['/arbetsrapport', '/planera', '/ledighet', '/utbildning', '/introduktion'] as const
/** Syns inte alls på maskinen — bara efter att en ADMIN låst upp. En förare som låst upp ser dem aldrig. */
export const DOLDA_SOKVAGAR = ['/ekonomi', '/admin', '/personal', '/avtal', '/affarsuppfoljning'] as const

const borjar = (path: string, lista: readonly string[]) => lista.some((p) => path === p || path.startsWith(p + '/'))
export const arLastSokvag = (path: string): boolean => borjar(path, LASTA_SOKVAGAR)
export const arDoldSokvag = (path: string): boolean => borjar(path, DOLDA_SOKVAGAR)
/** Planeringen/kartan är maskinens egen vy: att gå dit låser upp-läget. */
export const arKartSokvag = (path: string): boolean => path === '/planering' || path.startsWith('/planering/') || path === '/maskin' || path.startsWith('/maskin/')
