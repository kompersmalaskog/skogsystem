'use client'

// Flik 2 — Planering, i liststil: svarsrad (värsta avvikelsen + åtgärd), SKÖRDARE,
// SKOTARE (en rad per aktiv maskin: timmar kvar mot kapacitet kvar), två listrader.
import {
  belaggning, otilldelade, planeratPerTyp, planeringSvar, planeringStoppText, stoppForMaskin, maskinNamn, TYPER,
  type ManadStatus, type PlaneratResultat, type SparLage,
} from '../_lib/berakningar'
import { g15KapacitetNot } from '@/lib/helikopterG15'
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens'
import { STOPP_ORSAK, fmt, fmtPeriod, kortNamn } from '../_lib/format'
import type { Arbetsdagar, FastData, Manadsdata, Typ } from '../_lib/queries'
import { ListRad } from './Lista'
import Sektion from '@/components/design/Sektion'
import Svarsrad from '@/components/design/Svarsrad'
import { RadGrupp, RadLank } from '@/components/ui/RadGrupp'
import { Tomt } from './Tillstand'
import EjTilldeladeSheet from './EjTilldeladeSheet'
import MotBestallningSheet from './MotBestallningSheet'
import { usePanelVal } from './PanelVal'

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
  const [sheet, setSheet] = usePanelVal<'ej' | 'best'>('planering')
  if (status === 'avslutad') {
    return <Tomt rubrik="Månaden är avslutad" text="Planering gäller innevarande och kommande månader. Utfallet finns under Uppföljning." />
  }
  const pagaende = status === 'pagaende'
  const bel = belaggning(manadsdata.planering, fast.maskiner, manadsdata.arbetsdagar, idag, pagaende, fast.g15)
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
      <Svarsrad {...svar} />
      {(['skordare', 'skotare'] as const).map(roll => (
        <Sektion className="hk-grupp" key={roll} rubrik={roll === 'skordare' ? 'Skördare' : 'Skotare'} foljdAvLankar={roll === 'skotare'}>
          {bel.filter(b => b.roll === roll).map(b => {
            const over = b.luftH < 0
            // Stopp härlett ur ledighet + filer (helikopter_ny_stopp) — registrerade stopp ingår. Kunde det inte läsas: bara registrerade, som förut.
            const harled = planeringStoppText(manadsdata.maskinStopp?.find(m => m.maskin_id === b.maskin.maskin_id))
            const stopp = manadsdata.maskinStopp != null ? [] : stoppForMaskin(manadsdata.stopp, b.maskin.maskin_id)
            const tom = b.objekt.length === 0
            const stoppText = harled ?? (stopp.length > 0 ? stopp.map(s => `${STOPP_ORSAK[s.orsak] ?? s.orsak} ${fmtPeriod(s.fran_datum, s.till_datum)}`).join(' · ') : null)
            const under = stoppText
              ? stoppText
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
                underMuted={tom && !stoppText}
              />
            )
          })}
        </Sektion>
      ))}
      <div data-testid="kapacitet-not" style={{ ...TYP.meta, color: fast.g15.lage === 'fel' ? FARG.orange : FARG.text3, margin: `${AVSTAND.m}px ${AVSTAND.l}px` }}>
        {g15KapacitetNot(fast.g15, bel.map(b => ({ maskin_id: b.maskin.maskin_id, namn: maskinNamn(b.maskin) })))}
      </div>
      <RadGrupp>
        <RadLank text="Ej tilldelade" smakprov={`${ejTilldelade.length} ${ejTilldelade.length === 1 ? 'objekt' : 'objekt'}`} onClick={() => setSheet('ej')} />
        <RadLank text="Mot beställning" smakprov={bestSmak} onClick={() => setSheet('best')} />
      </RadGrupp>

      <EjTilldeladeSheet open={sheet === 'ej'} onClose={() => setSheet(null)} objekt={ejTilldelade} ar={ar} manad={manad} />
      <MotBestallningSheet open={sheet === 'best'} onClose={() => setSheet(null)} plan={plan} spar={spar} objekt={manadsdata.planering} avvikelse={fast.avvikelse} />
    </>
  )
}
