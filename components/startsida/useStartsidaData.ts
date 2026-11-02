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
import { hamtaAntalAttGodkanna } from '@/lib/lastbil/godkannVantar'
import { lasFavoriter, sparaFavoriter } from '@/lib/startsidaFavoriter'
import { hamtaMaskinkollVantar } from '@/lib/maskinkoll/data'
import { hamtaAtgardMarke } from '@/lib/arbetsmiljo/atgarder'
import { behoverDigText as introBehoverDig, hamtaKvitton as hamtaIntroKvitton, introLage } from '@/lib/arbetsmiljo/introduktion'
import { egnaUppgifterText } from '@/lib/personal'

// Hur länge vi väntar på rollen innan svaret räknas som okänt (läsfel får aldrig ge en tom skärm).
export const ROLL_MAX_VANTAN_MS = 1500

export type StartsidaData = {
  /** Rollen som den står i medarbetare ('admin', 'forare', …), null = okänd. */
  roll: string | null
  /** Den inloggade är skyddsombud. false tills det lästs (och vid läsfel) — då syns bara rollens vyer. */
  skyddsombud: boolean
  /** true när rollen är läst ELLER väntetiden gått ut. */
  rollKlar: boolean
  vantandeEgenkontroll: number | null
  ledighetPrick: LedighetPrick | null
  /** Lass som väntar på ett svar om maskin (bara admin ser dem). null = kunde inte läsas → inget märke, aldrig 0. */
  vantandeLass: number | null
  /** Flyttar som väntar på godkännande (bara admin ser dem). null = kunde inte läsas → inget märke, aldrig 0. */
  vantandeGodkannande: number | null
  /** Förarens maskinkoll: 1 = dags eller påbörjad, 0 = inte dags eller ingen maskin. null = kunde inte läsas → inget märke. */
  maskinkollVantar: number | null
  /** Öppna åtgärder (admin/skyddsombud; förare får 0) och hur många av dem som är stopp. null = kunde inte läsas → inget märke. */
  atgarder: { antal: number; stopp: number } | null
  /** Egna uppgifter som saknas (telefon, anhörig) i ord. null = inget saknas eller kunde inte läsas → ingen rad. */
  egnaUppgifter: string | null
  /** Förarens introduktion som inte är klar, i ord. null = klar, inte förare eller kunde inte läsas → ingen rad. */
  introduktion: string | null
  /** undefined = läses; null = inga egna (eller läsfel) → rollens förinställda. */
  favoritIds: string[] | null | undefined
  sparaFavoriterna: (ids: string[]) => Promise<boolean>
  /** Vem som är inloggad (kontokortet i Mer). namn null = medarbetaren kunde inte läsas; e-posten kommer från inloggningen. */
  konto: { namn: string | null; epost: string | null }
  /** Loggar ut och går till inloggningen. */
  loggaUt: () => Promise<void>
}

export function useStartsidaData(): StartsidaData {
  const [roll, setRoll] = useState<string | null>(null)
  const [skyddsombud, setSkyddsombud] = useState(false)
  const [rollKlar, setRollKlar] = useState(false)
  const [vantandeEgenkontroll, setVantandeEgenkontroll] = useState<number | null>(null)
  const [ledighetPrick, setLedighetPrick] = useState<LedighetPrick | null>(null)
  const [vantandeLass, setVantandeLass] = useState<number | null>(null)
  const [vantandeGodkannande, setVantandeGodkannande] = useState<number | null>(null)
  const [maskinkollVantar, setMaskinkollVantar] = useState<number | null>(null)
  const [atgarder, setAtgarder] = useState<{ antal: number; stopp: number } | null>(null)
  const [egnaUppgifter, setEgnaUppgifter] = useState<string | null>(null)
  const [introduktion, setIntroduktion] = useState<string | null>(null)
  const [favoritIds, setFavoritIds] = useState<string[] | null | undefined>(undefined)
  const [konto, setKonto] = useState<{ namn: string | null; epost: string | null }>({ namn: null, epost: null })

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
    const hamta = () => {
      hamtaAntalVantandeLass(supabase).then(n => { if (vid) setVantandeLass(n) })
      hamtaAntalAttGodkanna(supabase).then(n => { if (vid) setVantandeGodkannande(n) })
    }
    hamta()
    const synlig = () => { if (document.visibilityState === 'visible') hamta() }
    document.addEventListener('visibilitychange', synlig)
    return () => { vid = false; document.removeEventListener('visibilitychange', synlig) }
  }, [])

  // Maskinkollen: läses om när man kommer tillbaka till appen (märket ska försvinna när kollen är gjord).
  useEffect(() => {
    let vid = true
    const hamta = () => {
      hamtaMaskinkollVantar(supabase).then(n => { if (vid) setMaskinkollVantar(n) }, () => { if (vid) setMaskinkollVantar(null) })
      hamtaAtgardMarke(supabase).then(n => { if (vid) setAtgarder(n) }, () => { if (vid) setAtgarder(null) })
    }
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
      if (vid) setKonto(k => ({ ...k, epost: user.email ?? null }))
      supabase.from('medarbetare').select('roll, namn, skyddsombud').eq('epost', user.email).single()
        .then(({ data }) => {
          if (vid && data?.roll) setRoll(data.roll)
          if (vid) setSkyddsombud(data?.skyddsombud === true)
          if (vid && typeof data?.namn === 'string' && data.namn.trim()) setKonto(k => ({ ...k, namn: data.namn.trim() }))
          fardig()
        }, fardig)
      // Egen fråga: ett läsfel här får aldrig ta rollen med sig. Läsfel = ingen rad, aldrig en gissning.
      supabase.from('medarbetare').select('id, roll, telefon, anhorig_telefon').eq('epost', user.email).single()
        .then(async ({ data, error }) => {
          if (!vid || error || !data) return
          setEgnaUppgifter(egnaUppgifterText(data))
          // Introduktionen: bara förare. Ett läsfel ger ingen rad (aldrig "0 av 5").
          if (data.roll !== 'forare') return
          const kvitton = await hamtaIntroKvitton(supabase, data.id)
          if (vid && kvitton) setIntroduktion(introBehoverDig(introLage(data, kvitton.get(data.id) ?? [])))
        }, () => {})
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

  // Samma utloggning som Arbetsrapporten: logga ut och gå till inloggningen (hela sidan laddas om, inget gammalt tillstånd följer med).
  const loggaUt = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return { roll, skyddsombud, rollKlar, vantandeEgenkontroll, ledighetPrick, vantandeLass, vantandeGodkannande, maskinkollVantar, atgarder, egnaUppgifter, introduktion, favoritIds, sparaFavoriterna, konto, loggaUt }
}
