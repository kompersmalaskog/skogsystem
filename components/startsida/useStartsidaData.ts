'use client'

// Det startsidan behöver: roll, märken (egenkontroll, ledighet), datahälsa och egna favoriter. EN källa för
// startsidan (app/HomeClient.tsx) och maskinlådan (components/startsida/MaskinMeny.tsx), så att de två aldrig
// kan visa olika siffror eller olika favoriter.
//
// Ärlighetsreglerna som gällde förut gäller här också:
//  - Ett märke som inte går att läsa är null (inget märke), aldrig 0.
//  - Rollen som inte går att läsa är null. Startsidan visar då den gamla sidan; lådan visar förarens vyer
//    (aldrig adminvyer på en gissning).
//  - Favoriter som inte går att läsa ger rollens förinställda.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hamtaVantande } from '@/lib/egenkontroll'
import { hamtaLedighetPrick, type LedighetPrick } from '@/lib/ledighet/prick'
import { hamtaAntalVantandeLass } from '@/lib/lastbil/lass/vantar'
import { lasFavoriter, sparaFavoriter } from '@/lib/startsidaFavoriter'

// Hur länge vi väntar på rollen innan svaret räknas som okänt (läsfel får aldrig ge en tom skärm).
export const ROLL_MAX_VANTAN_MS = 1500

export type StartsidaData = {
  /** Rollen som den står i medarbetare ('admin', 'forare', …), null = okänd. */
  roll: string | null
  /** true när rollen är läst ELLER väntetiden gått ut. */
  rollKlar: boolean
  vantandeEgenkontroll: number | null
  ledighetPrick: LedighetPrick | null
  /** Lass som väntar på ett svar om maskin (bara admin ser dem). null = kunde inte läsas → inget märke, aldrig 0. */
  vantandeLass: number | null
  /** undefined = läses; null = inga egna (eller läsfel) → rollens förinställda. */
  favoritIds: string[] | null | undefined
  sparaFavoriterna: (ids: string[]) => Promise<boolean>
}

export function useStartsidaData(): StartsidaData {
  const [roll, setRoll] = useState<string | null>(null)
  const [rollKlar, setRollKlar] = useState(false)
  const [vantandeEgenkontroll, setVantandeEgenkontroll] = useState<number | null>(null)
  const [ledighetPrick, setLedighetPrick] = useState<LedighetPrick | null>(null)
  const [vantandeLass, setVantandeLass] = useState<number | null>(null)
  const [favoritIds, setFavoritIds] = useState<string[] | null | undefined>(undefined)

  // Ledighetsmärket ska stämma när man kommer tillbaka till appen (t.ex. från en push), inte bara vid första laddningen.
  useEffect(() => {
    let vid = true
    const hamta = () => { hamtaLedighetPrick(supabase).then(p => { if (vid) setLedighetPrick(p) }) }
    hamta()
    const synlig = () => { if (document.visibilityState === 'visible') hamta() }
    document.addEventListener('visibilitychange', synlig)
    return () => { vid = false; document.removeEventListener('visibilitychange', synlig) }
  }, [])

  // Lastbilens frågor ("Vilken maskin?") — samma tal som raden överst på /lastbil. Läses om när man kommer tillbaka till appen.
  useEffect(() => {
    let vid = true
    const hamta = () => { hamtaAntalVantandeLass(supabase).then(n => { if (vid) setVantandeLass(n) }) }
    hamta()
    const synlig = () => { if (document.visibilityState === 'visible') hamta() }
    document.addEventListener('visibilitychange', synlig)
    return () => { vid = false; document.removeEventListener('visibilitychange', synlig) }
  }, [])

  useEffect(() => {
    let vid = true
    const klar = setTimeout(() => { if (vid) setRollKlar(true) }, ROLL_MAX_VANTAN_MS)
    const fardig = () => { if (vid) setRollKlar(true) }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.email) { fardig(); return }
      supabase.from('medarbetare').select('roll').eq('epost', user.email).single()
        .then(({ data }) => { if (vid && data?.roll) setRoll(data.roll); fardig() }, fardig)
    }, fardig)
    // SAMMA funktion som listvyn använder ⇒ siffran på ikonen och talet överst i listan kan aldrig säga olika saker.
    hamtaVantande()
      .then(({ antalVantande }) => { if (vid) setVantandeEgenkontroll(antalVantande) })
      .catch(() => { if (vid) setVantandeEgenkontroll(null) })
    lasFavoriter(supabase).then(r => { if (vid) setFavoritIds(r.status === 'egna' ? r.ids : null) })
    return () => { vid = false; clearTimeout(klar) }
  }, [])

  const sparaFavoriterna = async (ids: string[]) => {
    const landat = await sparaFavoriter(supabase, ids)
    if (landat) setFavoritIds(landat)
    return landat != null
  }

  return { roll, rollKlar, vantandeEgenkontroll, ledighetPrick, vantandeLass, favoritIds, sparaFavoriterna }
}
