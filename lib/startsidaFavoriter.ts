// Startsidans egna favoriter — läs och spara (tabellen startsida_favoriter, en rad per användare, RLS på auth.uid()).
// Läsfel är ett FEL, aldrig "inga favoriter": då visas rollens förinställda och sidan säger inget falskt om att
// något sparats. Ingen rad = användaren har inte valt själv → förinställda.

import { MAX_FAVORITER } from './vyer'

type Svar<T> = { data: T | null; error: { message?: string; code?: string } | null }

/** Det minsta av supabase-klienten som behövs — så testerna kan ge en fejk. */
export type FavoritKlient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }
  from: (tabell: string) => any
}

export type LastaFavoriter =
  | { status: 'egna'; ids: string[] }
  | { status: 'standard' }
  | { status: 'fel'; meddelande: string }

export async function lasFavoriter(klient: FavoritKlient): Promise<LastaFavoriter> {
  try {
    const { data: { user } } = await klient.auth.getUser()
    if (!user?.id) return { status: 'fel', meddelande: 'Inte inloggad' }
    const svar: Svar<{ vyer: unknown }> = await klient.from('startsida_favoriter').select('vyer').eq('user_id', user.id).maybeSingle()
    if (svar.error) return { status: 'fel', meddelande: svar.error.message ?? 'Kunde inte läsa favoriterna' }
    if (!svar.data) return { status: 'standard' }
    const vyer = svar.data.vyer
    if (!Array.isArray(vyer) || !vyer.every(v => typeof v === 'string')) return { status: 'fel', meddelande: 'Ogiltigt svar' }
    return { status: 'egna', ids: vyer as string[] }
  } catch (e) {
    return { status: 'fel', meddelande: e instanceof Error ? e.message : 'Kunde inte läsa favoriterna' }
  }
}

/** Sparar (upsert på user_id) och läser tillbaka det som faktiskt landade. `null` = sparningen gick inte. */
export async function sparaFavoriter(klient: FavoritKlient, ids: string[]): Promise<string[] | null> {
  try {
    const { data: { user } } = await klient.auth.getUser()
    if (!user?.id) return null
    const vyer = Array.from(new Set(ids)).slice(0, MAX_FAVORITER)
    const svar: Svar<{ vyer: unknown }> = await klient.from('startsida_favoriter')
      .upsert({ user_id: user.id, vyer, uppdaterad_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select('vyer').single()
    if (svar.error || !svar.data || !Array.isArray(svar.data.vyer)) return null
    const landat = svar.data.vyer as string[]
    // Verifiera på innehåll: det som står i databasen ska vara det vi skickade.
    return landat.length === vyer.length && landat.every((v, i) => v === vyer[i]) ? landat : null
  } catch {
    return null
  }
}
