'use client'

// Flik 1 — Läge. Per spår: ETT stort tal (dagar efter/före eller på plan), sedan
// takt, skördare, skotare och en tunn stapel. När allt är grönt: inget mer. Tyst.
import { Axe, Truck } from 'lucide-react'
import { T } from '@/lib/utbildning'
import { PROGNOS_FRAN_ARBETSDAG, SKORDARE_FORE_VARNING_DAGAR, type ManadStatus, type SparLage } from '../_lib/berakningar'
import { MANAD_NAMN as MANAD_NAMN_LOKAL, dagarText, fmt, fmtDag } from '../_lib/format'
import type { Arbetsdagar, MaskinLage, Typ } from '../_lib/queries'
import { Kort, KortLank, Rad, SparRubrik, Stapel, StortTal, type Ton } from './SparKort'
import DinMaskin from './DinMaskin'

type Props = {
  spar: SparLage[]
  status: ManadStatus
  dagar: Arbetsdagar
  ar: number
  manad: number
  antalPlanerade: Record<Typ, number>
  dinMaskin: { maskinNamn: string; lage: MaskinLage | null; fel: string | null; onRetry: () => void } | null
}

export default function LageFlik({ spar, status, dagar, ar, manad, antalPlanerade, dinMaskin }: Props) {
  return (
    <>
      {spar.map(s => <LageKort key={s.typ} s={s} status={status} dagar={dagar} ar={ar} manad={manad} antalPlanerade={antalPlanerade[s.typ]} />)}
      {dinMaskin && <DinMaskin {...dinMaskin} />}
    </>
  )
}

function LageKort({ s, status, dagar, ar, manad, antalPlanerade }: { s: SparLage; status: ManadStatus; dagar: Arbetsdagar; ar: number; manad: number; antalPlanerade: number }) {
  const ingenBestallning = s.bestallt <= 0
  const bestLank = `/bestallningar?ar=${ar}&manad=${manad}`
  // Utan planerade objekt finns inget att ligga före eller efter på — grått, aldrig grönt.
  const ingenPlan = status !== 'avslutad' && antalPlanerade === 0

  // Det stora talet — ett per spår.
  let stort: { text: string; ton: Ton; under?: string; liten?: boolean }
  if (ingenBestallning) {
    stort = { text: `${fmt(s.skotat)} m³fub`, ton: 'neutral', under: 'skotat · ingen beställning' }
  } else if (status === 'avslutad') {
    const diff = s.skotat - s.bestallt
    stort = diff >= 0
      ? { text: 'Klart', ton: 'gron', under: `${fmt(s.skotat)} av ${fmt(s.bestallt)} m³fub skotat` }
      : { text: `${fmt(diff)} m³fub`, ton: 'orange', under: `${fmt(s.skotat)} av ${fmt(s.bestallt)} skotat` }
  } else if (ingenPlan) {
    stort = { text: 'Inga objekt planerade', ton: 'dampad', liten: true, under: `inget objekt lagt på ${MANAD_NAMN_LOKAL[manad - 1]}` }
  } else if (status === 'kommande') {
    stort = { text: 'Inte startad', ton: 'dampad', liten: true }
  } else if (!s.harPrognos || !s.lage) {
    stort = { text: `Prognos från dag ${PROGNOS_FRAN_ARBETSDAG}`, ton: 'dampad', liten: true, under: `arbetsdag ${dagar.gangna + 1} av ${dagar.totalt}` }
  } else if (s.lage.status === 'pa_plan') {
    stort = { text: 'På plan', ton: 'gron' }
  } else if (s.lage.status === 'efter') {
    stort = { text: `${dagarText(s.lage.dagar)} efter`, ton: 'orange' }
  } else {
    stort = { text: `${dagarText(s.lage.dagar)} före`, ton: 'gron' }
  }

  const gront = s.lage != null && s.lage.status !== 'efter'
  const visaTakt = status === 'pagaende' && !ingenBestallning && s.harPrognos && !ingenPlan
  const taktText = gront && s.klartDatumSkotat
    ? `Klart omkring ${fmtDag(s.klartDatumSkotat)}`
    : `Kör ${fmt(s.taktSkotat ?? 0)} m³fub/dag · behöver ${fmt(s.behovPerDag ?? 0)}`

  // Skördare: hur långt före skotaren.
  let skordareVarde = ''
  if (status === 'pagaende' && s.harPrognos && s.skordareDagarFore != null) {
    skordareVarde = `${dagarText(s.skordareDagarFore)} före skotaren`
    if (s.skordareDagarFore > SKORDARE_FORE_VARNING_DAGAR) skordareVarde += ' · dra ner eller byt trakt'
  }

  // Skotare: oskotat och riktning.
  let skotareVarde = ''
  let skotareTon: Ton = 'dampad'
  if (s.oskotat > 0) {
    skotareVarde = `Oskotat ${fmt(s.oskotat)}`
    if (s.oskotatStatus === 'vaxer') { skotareVarde += ` · växer ${fmt(s.oskotatForandring ?? 0)}/dag`; skotareTon = 'orange' }
    else if (s.oskotatStatus === 'minskar') skotareVarde += ` · minskar ${fmt(-(s.oskotatForandring ?? 0))}/dag`
    else if (s.oskotatStatus === 'i_takt') skotareVarde += ' · i takt'
  }

  return (
    <Kort>
      <SparRubrik typ={s.typ} bestallt={s.bestallt} bolag={s.bolag} />
      <StortTal text={stort.text} ton={stort.ton} under={stort.under} liten={stort.liten} />
      {visaTakt && <Rad text={taktText} />}
      <Rad ikon={<Axe size={16} color={T.t2} aria-hidden="true" />} text={`Skördat ${fmt(s.skordat)} m³fub`} varde={skordareVarde} />
      <Rad ikon={<Truck size={16} color={T.t2} aria-hidden="true" />} text={`Skotat ${fmt(s.skotat)} m³fub`} varde={skotareVarde} vardeTon={skotareTon} />
      <Stapel bestallt={s.bestallt} skordat={s.skordat} skotat={s.skotat} />
      {ingenBestallning && status !== 'avslutad' && <KortLank text="Lägg in beställning" href={bestLank} />}
    </Kort>
  )
}
