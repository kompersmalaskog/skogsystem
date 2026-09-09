'use client'

// Flik 2 — Planering, i liststil: svarsrad (värsta avvikelsen + åtgärd), SKÖRDARE,
// SKOTARE (en rad per aktiv maskin: timmar kvar mot kapacitet kvar), två listrader.
import { useState } from 'react'
import {
  belaggning, otilldelade, planeratPerTyp, planeringSvar, stoppForMaskin, maskinNamn, TYPER,
  type ManadStatus, type PlaneratResultat, type SparLage,
} from '../_lib/berakningar'
import { STOPP_ORSAK, fmt, fmtPeriod, kortNamn } from '../_lib/format'
import type { Arbetsdagar, FastData, Manadsdata, Typ } from '../_lib/queries'
import { ListLank, ListRad, Lista, Sektion, Svarsrad } from './Lista'
import { Tomt } from './Tillstand'
import EjTilldeladeSheet from './EjTilldeladeSheet'
import MotBestallningSheet from './MotBestallningSheet'

type Props = {
  manadsdata: Manadsdata
  fast: FastData
  spar: SparLage[]
  status: ManadStatus
  dagar: Arbetsdagar
  idag: string
  ar: number
  manad: number
}

export default function PlaneringFlik({ manadsdata, fast, spar, status, dagar, idag, ar, manad }: Props) {
  const [sheet, setSheet] = useState<'ej' | 'best' | null>(null)
  if (status === 'avslutad') {
    return <Tomt rubrik="Månaden är avslutad" text="Planering gäller innevarande och kommande månader. Utfallet finns under Uppföljning." />
  }
  const pagaende = status === 'pagaende'
  const bel = belaggning(manadsdata.planering, fast.maskiner, manadsdata.arbetsdagar, idag, pagaende)
  const kvarDagar = pagaende ? dagar.kvar : dagar.totalt
  const plan: Record<Typ, PlaneratResultat> = {
    gallring: planeratPerTyp(manadsdata.planering, 'gallring', spar.find(s => s.typ === 'gallring')?.bestallt ?? 0, fast.avvikelse),
    slutavverkning: planeratPerTyp(manadsdata.planering, 'slutavverkning', spar.find(s => s.typ === 'slutavverkning')?.bestallt ?? 0, fast.avvikelse),
  }
  const svar = planeringSvar(bel, plan, kvarDagar)
  const ejTilldelade = Array.from(new Set(TYPER.flatMap(t => otilldelade(manadsdata.planering, t).map(o => o.objekt_id))))
    .map(id => manadsdata.planering.find(o => o.objekt_id === id)!)
  const bestSmak = TYPER.map(t => `${t === 'slutavverkning' ? 'slut' : 'gall'} ${fmt(plan[t].korrigerat)} av ${fmt(spar.find(s => s.typ === t)?.bestallt ?? 0)}`).join(' · ')

  return (
    <>
      <Svarsrad svar={svar} />
      <Lista>
        {(['skordare', 'skotare'] as const).map(roll => (
          <Sektion key={roll} rubrik={roll === 'skordare' ? 'Skördare' : 'Skotare'}>
            {bel.filter(b => b.roll === roll).map(b => {
              const over = b.luftH < 0
              const stopp = stoppForMaskin(manadsdata.stopp, b.maskin.maskin_id)
              const tom = b.objekt.length === 0
              const under = stopp.length > 0
                ? stopp.map(s => `${STOPP_ORSAK[s.orsak] ?? s.orsak} ${fmtPeriod(s.fran_datum, s.till_datum)}`).join(' · ')
                : tom
                  ? `${fmt(b.kapacitetH)} h lediga`
                  : b.objekt.map(o => kortNamn(o.namn)).join(', ')
              return (
                <ListRad
                  key={b.maskin.maskin_id}
                  namn={maskinNamn(b.maskin)}
                  tal={tom ? 'Inga objekt' : `${fmt(b.belagtH)} h`}
                  talTon={tom ? 'muted' : over ? 'orange' : 'normal'}
                  av={tom ? undefined : `${fmt(b.kapacitetH)} h`}
                  andel={tom ? 0 : b.kapacitetH > 0 ? Math.min(b.belagtH / b.kapacitetH, 1) : (b.belagtH > 0 ? 1 : 0)}
                  orange={over}
                  under={under}
                  underMuted={tom && stopp.length === 0}
                />
              )
            })}
          </Sektion>
        ))}
        <div style={{ marginTop: 6 }}>
          <ListLank text="Ej tilldelade" smakprov={`${ejTilldelade.length} ${ejTilldelade.length === 1 ? 'objekt' : 'objekt'}`} onClick={() => setSheet('ej')} />
          <ListLank text="Mot beställning" smakprov={bestSmak} onClick={() => setSheet('best')} />
        </div>
      </Lista>

      <EjTilldeladeSheet open={sheet === 'ej'} onClose={() => setSheet(null)} objekt={ejTilldelade} ar={ar} manad={manad} />
      <MotBestallningSheet open={sheet === 'best'} onClose={() => setSheet(null)} plan={plan} spar={spar} objekt={manadsdata.planering} avvikelse={fast.avvikelse} />
    </>
  )
}
