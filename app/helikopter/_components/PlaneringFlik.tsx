'use client'

// Flik 2 — Planering. Per spår: det som är FEL som stort tal ("Saknas 150 m³fub",
// "22 h kort" eller "Klart att köra"), två kontrollrader (volym, timmar), åtgärd,
// knapp till objektlistan. Objekt utan volym/bolag räknas inte men visas.
import { Check, TriangleAlert } from 'lucide-react'
import { T } from '@/lib/utbildning'
import {
  atgardForTyp, belaggning, otilldelade, planeratPerTyp, timmarForTyp, TYPER,
  type ManadStatus, type SparLage,
} from '../_lib/berakningar'
import { fmt } from '../_lib/format'
import type { Arbetsdagar, FastData, Manadsdata, Typ } from '../_lib/queries'
import { AtgardRuta, Kort, KortLank, Rad, SparRubrik, StortTal, type Ton } from './SparKort'
import { Tomt } from './Tillstand'

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
  if (status === 'avslutad') {
    return <Tomt rubrik="Månaden är avslutad" text="Planering gäller innevarande och kommande månader. Utfallet finns under Uppföljning." />
  }
  const bel = belaggning(manadsdata.planering, fast.maskiner, manadsdata.arbetsdagar, idag, status === 'pagaende')
  const kvarDagar = status === 'pagaende' ? dagar.kvar : dagar.totalt
  return (
    <>
      {TYPER.map(typ => (
        <PlaneringKort key={typ} typ={typ} s={spar.find(x => x.typ === typ) ?? null} manadsdata={manadsdata} fast={fast} bel={bel} kvarDagar={kvarDagar} ar={ar} manad={manad} />
      ))}
    </>
  )
}

function Ikon({ varning }: { varning: boolean }) {
  return varning
    ? <TriangleAlert size={16} color={T.orange} aria-label="varning" />
    : <Check size={16} color={T.green} aria-label="ok" />
}

function PlaneringKort({ typ, s, manadsdata, fast, bel, kvarDagar, ar, manad }: {
  typ: Typ; s: SparLage | null; manadsdata: Manadsdata; fast: FastData
  bel: ReturnType<typeof belaggning>; kvarDagar: number; ar: number; manad: number
}) {
  const bestallt = s?.bestallt ?? 0
  const bolag = s?.bolag ?? []
  const objektHref = `/objekt?ar=${ar}&manad=${manad}&typ=${typ}`
  const plan = planeratPerTyp(manadsdata.planering, typ, bestallt, fast.avvikelse)
  const tim = timmarForTyp(bel, typ)
  const atgard = atgardForTyp(typ, plan, tim, bel, kvarDagar, objektHref, fmt)
  const utanMaskin = otilldelade(manadsdata.planering, typ).length

  let stort: { text: string; ton: Ton; under?: string }
  if (plan.saknas > 0) stort = { text: `Saknas ${fmt(plan.saknas)} m³fub`, ton: 'orange' }
  else if (tim.luft < 0) stort = { text: `${fmt(-tim.luft)} h kort`, ton: 'orange' }
  else if (bestallt <= 0) stort = plan.antalObjekt > 0
    ? { text: `${fmt(plan.korrigerat)} m³fub`, ton: 'neutral', under: 'planerat · ingen beställning' }
    : { text: 'Inget planerat', ton: 'dampad', under: 'ingen beställning' }
  else stort = { text: 'Klart att köra', ton: 'gron' }

  const just = plan.justeringProcent
  const volymText = `Planerat ca ${fmt(plan.korrigerat)} m³fub · ${plan.antalObjekt} objekt${just != null ? ` · justerad ${just > 0 ? '+' : ''}${just} %` : ''}`
  const timText = tim.maskiner.length === 0
    ? 'Timmar – inga objekt på våra maskiner'
    : `Timmar ${fmt(tim.timmar)} h av ${fmt(tim.kapacitet)} h · ${tim.luft >= 0 ? `${fmt(tim.luft)} h luft` : `${fmt(-tim.luft)} h kort`}`

  return (
    <Kort>
      <SparRubrik typ={typ} bestallt={bestallt} bolag={bolag} />
      <StortTal text={stort.text} ton={stort.ton} under={stort.under} />
      <Rad ikon={<Ikon varning={plan.saknas > 0} />} text={volymText} />
      <Rad ikon={<Ikon varning={tim.luft < 0 || tim.saknarPrognos > 0} />} text={timText} dampad={tim.maskiner.length === 0} />
      {atgard && <AtgardRuta atgard={atgard} />}
      {plan.utanVolym > 0 && <KortLank text={`${plan.utanVolym} objekt saknar volym`} href={objektHref} />}
      {plan.utanBolag > 0 && <KortLank text={`${plan.utanBolag} objekt saknar bolag`} href={objektHref} />}
      {utanMaskin > 0 && <KortLank text={`${utanMaskin} objekt saknar maskin`} href={objektHref} />}
      <KortLank text="Objekt" href={objektHref} />
    </Kort>
  )
}
