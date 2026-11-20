// Hyttspårets SPARNING, utbruten ur app/planering/page.tsx så att den går att pröva (2026-11-16).
//
// FELET (Martin 15 nov, Oskar 16 nov): bytte man trakt medan spåret loggades — bekräftelsekortet "Börja avverka här?" — ritades och sparades
// ingenting på den nya trakten förrän appen stängts och öppnats. Avslutet av det GAMLA spåret gick mot servern (0,5–1 s) och nollställde
// loggningen EFTER svaret. Då hade det NYA spåret redan startat, och det var dess loggning som nollställdes. R64428 16 nov: 46 min utan spår.
//
// REGELN: ett avslut tar det det behöver ur minnet och nollställer SYNKRONT, före första anropet mot servern. Efter ett svar från servern
// rör sparningen aldrig minnet om loggningen bytts under tiden (ny `ctx`) — varken vid avslut eller vid en vanlig mellansparning.

export interface HyttsparPunkt { lat: number; lng: number; tid: string }
type Ref<T> = { current: T }
export interface HyttsparRefs {
  rowId: Ref<string | null>
  points: Ref<HyttsparPunkt[]>
  lastFix: Ref<any>
  datum: Ref<string | null>
  ctx: Ref<any>
  initKlar: Ref<boolean>
  synced: Ref<number>
  dirty: Ref<boolean>
}
type Db = { rpc: (namn: string, arg: any) => PromiseLike<{ error: any }>; from: (tabell: string) => any }
type Tunna = (p: HyttsparPunkt[], epsM: number) => HyttsparPunkt[]

/** Loggningen står still tills körvyn öppnar den igen. */
export function nollstallHyttspar(r: HyttsparRefs): void {
  r.rowId.current = null; r.points.current = []; r.lastFix.current = null; r.datum.current = null
  r.ctx.current = null; r.initKlar.current = false; r.synced.current = 0
}

/**
 * Skickar de punkter som inte är sparade (`hyttspar_append`). `final` = spåret avslutas (status completed) och loggningen nollställs.
 * En misslyckad mellansparning flyttar inte fram `synced` — punkterna skickas igen nästa gång.
 */
export async function sparaHyttsparSession(r: HyttsparRefs, db: Db, final: boolean, tunna: Tunna, nu: () => string = () => new Date().toISOString()): Promise<void> {
  const id = r.rowId.current
  if (!id) {
    // Ingen rad skapades (öppna-och-stäng utan GPS-punkter).
    if (final) nollstallHyttspar(r)
    return
  }
  const ctx = r.ctx.current
  const raw = r.points.current
  const syncedVid = r.synced.current
  const consumed = raw.length - syncedVid
  // AVSLUT: nollställ NU, innan något await. Nästa spår (objektbytet) startar i samma ögonblick och får aldrig röras av det här avslutet.
  if (final) nollstallHyttspar(r)
  /** Sant så länge det är samma loggning som när sparningen började. */
  const samma = () => !final && r.ctx.current === ctx && r.rowId.current === id
  if (consumed > 0) {
    const osynkade = raw.slice(syncedVid)
    const ankar = syncedVid > 0 ? raw[syncedVid - 1] : null
    const tunnad = ankar ? tunna([ankar, ...osynkade], 3).slice(1) : tunna(osynkade, 3)
    if (tunnad.length > 0) {
      try {
        const { error } = await db.rpc('hyttspar_append', { p_id: id, p_punkter: tunnad })
        if (error) console.error('[Hyttspår] append-fel:', error.message)
        else if (samma()) r.synced.current += consumed
      } catch (e) { console.error('[Hyttspår] append-undantag:', e) }
    } else if (samma()) {
      r.synced.current += consumed   // allt bortgallrat (kollinjärt)
    }
  }
  if (samma()) r.dirty.current = false
  if (final) {
    try { await db.from('hyttspar').update({ status: 'completed', avslutad_at: nu(), uppdaterad_at: nu() }).eq('id', id) }
    catch (e) { console.error('[Hyttspår] final-status-fel:', e) }
  }
}
