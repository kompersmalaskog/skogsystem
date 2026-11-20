'use client'

// Hem: ALLTID den nya startsidan (Martin 2026-11-09). Den gamla startsidan med gröna och blå rutor är borttagen —
// den visades när rollen inte gick att läsa inom 1,5 s, och i skogen med dålig täckning hände det ofta.
//
// Rollen styr bara vilka rutor som syns: admin får admins vyer, alla andra (också okänd roll) förarens.
// Adminvyerna skyddar sig själva, så en okänd roll öppnar ingenting. Rollen minns per enhet och e-post
// (`lib/sparadRoll`), så sidan visas direkt; tills den är känd första gången visas bara bakgrunden, högst 1,5 s.
// Vyregistret (`lib/vyer.ts`) är det enda stället vyerna står.

import { useDatahalsa } from './datahalsa/useDatahalsa'
import Startsida from '@/components/startsida/Startsida'
import { useStartsidaData } from '@/components/startsida/useStartsidaData'
import { visadRoll } from '@/lib/sparadRoll'
import { FARG } from '@/lib/design/tokens'

export default function HomeClient() {
  const data = useStartsidaData()
  const { besked } = useDatahalsa()

  if (!data.rollKlar) return <div style={{ position: 'fixed', inset: 0, background: FARG.bg }} />

  return (
    <Startsida roll={visadRoll(data.roll)} skyddsombud={data.skyddsombud}
      marken={{ egenkontroll: data.vantandeEgenkontroll, ledighet: data.ledighetPrick?.antal ?? null, lass: data.vantandeLass, godkann: data.vantandeGodkannande, maskinkoll: data.maskinkollVantar, atgarder: data.atgarder?.antal ?? null, atgardStopp: data.atgarder?.stopp ?? null, personal: data.egnaUppgifter ? 1 : null, arbetsmiljo: data.arbetsmiljoMarke }}
      egnaUppgifter={data.egnaUppgifter} introduktion={data.introduktion} arbetsmiljo={data.arbetsmiljo}
      datahalsa={besked} favoritIds={data.favoritIds} onSparaFavoriter={data.sparaFavoriterna}
      konto={data.konto} onLoggaUt={data.loggaUt} />
  )
}
