// Startsidans roll och favoriter, ihågkomna per enhet och användare.
//
// Varför: Hem frågade databasen om rollen varje gång (två anrop över nätet) och visade den GAMLA startsidan om
// svaret inte kom inom 1,5 s — i skogen med dålig täckning hände det ofta (Martin 2026-11-09). Den gamla sidan
// är borttagen; den här filen gör att den nya sidan med rätt roll kan visas direkt, utan att vänta på nätet.
//
// Regler:
//  - Rollen sparas bara med användarens e-post och används bara för SAMMA e-post (maskindatorn delas av flera:
//    en annan förares roll följer aldrig med).
//  - Bara 'admin' och 'forare' finns. Allt annat (okänt, trasigt minne) ger null.
//  - Det sparade är en förhandsvisning: databasens svar gäller alltid och skriver över det.
//  - Minnet ger inga rättigheter: varje adminvy kontrollerar själv behörigheten. Det avgör bara vilka rutor
//    som visas på startsidan.
//  - localStorage kan kasta (privat läge) — då finns inget minne, aldrig ett fel.

import type { Roll } from '@/lib/vyer'

export const SPARAD_ROLL_NYCKEL = 'startsida_roll_v1'

type Post = { epost: string; roll: Roll; favoriter?: string[] }

const normEpost = (e: string) => e.trim().toLowerCase()

/** Rollen enheten minns för just den här e-posten, annars null. */
export function lasSparadRoll(epost: string | null | undefined): Roll | null {
  return lasPost(epost)?.roll ?? null
}

function lasPost(epost: string | null | undefined): Post | null {
  if (!epost) return null
  try {
    const ra = localStorage.getItem(SPARAD_ROLL_NYCKEL)
    if (!ra) return null
    const p = JSON.parse(ra) as Partial<Post>
    if (typeof p?.epost !== 'string' || normEpost(p.epost) !== normEpost(epost)) return null
    if (p.roll !== 'admin' && p.roll !== 'forare') return null
    const favoriter = Array.isArray(p.favoriter) && p.favoriter.every(f => typeof f === 'string') ? p.favoriter : undefined
    return { epost: p.epost, roll: p.roll, favoriter }
  } catch {
    return null
  }
}

/** Spara rollen databasen gav. En roll som inte är admin/förare rensar minnet i stället. Sparade favoriter behålls. */
export function sparaRoll(epost: string, roll: string | null): void {
  try {
    if (roll === 'admin' || roll === 'forare') {
      const fore = lasPost(epost)
      const post: Post = { epost: normEpost(epost), roll, ...(fore?.favoriter ? { favoriter: fore.favoriter } : {}) }
      localStorage.setItem(SPARAD_ROLL_NYCKEL, JSON.stringify(post))
    } else {
      localStorage.removeItem(SPARAD_ROLL_NYCKEL)
    }
  } catch { /* inget minne — då väntar startsidan på databasen som förut */ }
}

/** Favoriterna enheten minns för e-posten: undefined = inget sparat, null = rollens förinställda. */
export function lasSparadeFavoriter(epost: string | null | undefined): string[] | null | undefined {
  const p = lasPost(epost)
  if (!p) return undefined
  return p.favoriter ?? null
}

/** Spara favoriterna (null = förinställda). Kräver att rollen redan är sparad för samma e-post. */
export function sparaFavoriterLokalt(epost: string, favoriter: string[] | null): void {
  try {
    const p = lasPost(epost)
    if (!p) return
    const post: Post = { epost: p.epost, roll: p.roll, ...(favoriter ? { favoriter } : {}) }
    localStorage.setItem(SPARAD_ROLL_NYCKEL, JSON.stringify(post))
  } catch { /* inget minne */ }
}

/** Vid utloggning: nästa person på enheten ska aldrig se den här personens rutor. */
export function rensaSparadRoll(): void {
  try { localStorage.removeItem(SPARAD_ROLL_NYCKEL) } catch { /* ingenting att rensa */ }
}

/** Den roll startsidan visar: bara admin är admin, allt annat (också okänd) får förarens vyer. */
export function visadRoll(roll: string | null): Roll {
  return roll === 'admin' ? 'admin' : 'forare'
}
