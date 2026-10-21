// Special-objekt (dim_objekt.special / special_skal) i maskinvyn.
//
// Ett special-objekt är ett som inte går att jämföra med vanliga (vindfällor, stormskadat). Flaggan sätts av admin i
// Redigering och visas som en diskret badge där objektet listas. DEN ÄNDRAR INGEN BERÄKNING — den finns för att
// framtida prestandajämförelser ska kunna utesluta objekten. Skild från `exkludera` (döljer ett objekt helt).
//
// Läsningen är ett TILLÄGG till vyn och får aldrig fälla den: går det inte att läsa (kolumnerna finns inte förrän
// migrationen 20261021164434_dim_objekt_special.sql är körd, eller nätet/RLS ger fel) visas ingen badge och vyn
// fungerar som förut. Felet loggas — det sägs inte tyst att "inga objekt är special".

import { supabase } from '@/lib/supabase'

/** objekt_id → skälet (null = flaggat men inget skäl skrivet). Tom = inga flaggade, eller kunde inte läsas. */
export type SpecialObjekt = Map<string, string | null>

export async function hamtaSpecialObjekt(): Promise<SpecialObjekt> {
  const ut: SpecialObjekt = new Map()
  try {
    // Flaggan är sällsynt (en handfull objekt) — långt under PostgREST:s 1 000-radersgräns.
    const { data, error } = await supabase.from('dim_objekt').select('objekt_id, special_skal').eq('special', true)
    if (error) {
      console.warn('Special-objekt kunde inte läsas — ingen badge visas:', error.message)
      return ut
    }
    for (const r of (data || []) as { objekt_id: string; special_skal: string | null }[]) {
      ut.set(r.objekt_id, r.special_skal?.trim() ? r.special_skal.trim() : null)
    }
  } catch (e) {
    console.warn('Special-objekt kunde inte läsas — ingen badge visas:', e)
  }
  return ut
}

/** Skäl från flera rader i samma grupp: första skrivna skälet vinner. */
export function forstaSkal(a: string | null | undefined, b: string | null | undefined): string | null {
  return a || b || null
}

/** Maskinvyns objektlistor visar NAMN (flera objekt_id kan dela namn) — namn → skäl för de special-objekt som finns bland idn. */
export function specialPerNamn(
  objektIds: Iterable<string>, namnAv: Record<string, string | null | undefined>, special: SpecialObjekt,
): Record<string, string | null> {
  const ut: Record<string, string | null> = {}
  for (const id of Array.from(objektIds)) {
    if (!special.has(id)) continue
    const namn = namnAv[id] || id
    ut[namn] = forstaSkal(ut[namn], special.get(id))
  }
  return ut
}
