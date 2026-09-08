'use client'

// Flik 3 — Uppföljning. Exakt fem rader per spår:
//   1 rubrik · 2 stort tal · 3 en mening · 4 stapel (skotat mot beställt) · 5 Veckor › / Per bolag ›
// Inga objekt i månaden → "Inga objekt" (grått), ingen stapel, "Planera objekt ›".
import { useState } from 'react'
import { T } from '@/lib/utbildning'
import { PROGNOS_FRAN_ARBETSDAG, prognosPerBolag, type ManadStatus, type SparLage } from '../_lib/berakningar'
import { MANAD_NAMN, fmt, fmtDag } from '../_lib/format'
import type { Arbetsdagar, BolagRad, Typ } from '../_lib/queries'
import { Kort, KortLank, SparRubrik, StapelEnkel, StortTal, TON_FARG, type Ton } from './SparKort'
import BolagSheet from './BolagSheet'

type Props = {
  spar: SparLage[]
  status: ManadStatus
  dagar: Arbetsdagar
  bolag: BolagRad[] | null
  bolagFel: string | null
  onRetryBolag: () => void
  antalPlanerade: Record<Typ, number>
  ar: number
  manad: number
}

export default function UppfoljningFlik({ spar, status, dagar, bolag, bolagFel, onRetryBolag, antalPlanerade, ar, manad }: Props) {
  const [oppen, setOppen] = useState<Typ | null>(null)
  return (
    <>
      {spar.map(s => (
        <UppfoljningKort key={s.typ} s={s} status={status} antalPlanerade={antalPlanerade[s.typ]} ar={ar} manad={manad} onOppnaBolag={() => setOppen(s.typ)} />
      ))}
      {oppen && (
        <BolagSheet
          open
          onClose={() => setOppen(null)}
          typ={oppen}
          rader={(bolag ?? []).filter(b => b.typ === oppen)}
          laddar={bolag == null && !bolagFel}
          fel={bolagFel}
          onRetry={onRetryBolag}
          kvar={status === 'pagaende' ? dagar.kvar : 0}
          harPrognos={status === 'pagaende' && (spar.find(s => s.typ === oppen)?.harPrognos ?? false)}
          ar={ar}
          manad={manad}
        />
      )}
    </>
  )
}

function UppfoljningKort({ s, status, antalPlanerade, ar, manad, onOppnaBolag }: {
  s: SparLage; status: ManadStatus; antalPlanerade: number; ar: number; manad: number; onOppnaBolag: () => void
}) {
  const manadNamn = MANAD_NAMN[manad - 1]
  const ingenPlan = status !== 'avslutad' && antalPlanerade === 0
  const ingenBest = s.bestallt <= 0
  const veckorHref = `/helikopter/veckor?typ=${s.typ}&ar=${ar}&manad=${manad}`
  const planeraHref = `/helikopter?flik=planering&ar=${ar}&manad=${manad}`

  let stort: { text: string; ton: Ton; liten?: boolean }
  let mening: string
  let stapel: { farg: string; plan: number | null } | null = null

  if (ingenPlan) {
    stort = { text: 'Inga objekt', ton: 'dampad' }
    mening = `Skotat ${fmt(s.skotat)} · inget planerat i ${manadNamn}`
  } else if (ingenBest) {
    stort = { text: fmt(s.skotat), ton: 'neutral' }
    mening = `Skotat ${fmt(s.skotat)} · ingen beställning`
  } else if (status === 'avslutad') {
    const diff = s.skotat - s.bestallt
    stort = diff >= 0 ? { text: 'Klart', ton: 'gron' } : { text: fmt(diff), ton: 'orange' }
    mening = `Skotat ${fmt(s.skotat)} av ${fmt(s.bestallt)}`
    stapel = { farg: TON_FARG[stort.ton], plan: null }
  } else if (status === 'kommande') {
    stort = { text: 'Inte startad', ton: 'dampad', liten: true }
    mening = `Plan ${fmt(s.bestallt)} m³fub`
  } else if (!s.harPrognos || s.prognosSkotat == null) {
    stort = { text: `Prognos från dag ${PROGNOS_FRAN_ARBETSDAG}`, ton: 'dampad', liten: true }
    mening = `Skotat ${fmt(s.skotat)} · prognos från arbetsdag ${PROGNOS_FRAN_ARBETSDAG}`
    stapel = { farg: 'rgba(255,255,255,0.6)', plan: s.plan }
  } else {
    const diff = s.prognosSkotat - s.bestallt
    stort = diff >= 0
      ? { text: s.klartDatumSkotat ? `Klart ${fmtDag(s.klartDatumSkotat)}` : 'Klart i tid', ton: 'gron' }
      : { text: fmt(diff), ton: 'orange' }
    // Relationen skördare/skotare: mer än en dags skotning oskotat i månaden = skotaren är flaskhals.
    const flaskhals = s.oskotat > (s.taktSkotat ?? 0)
    const landar = `Landar ${fmt(s.prognosSkotat)}`
    mening = flaskhals
      ? `${landar} · skotaren är flaskhals`
      : s.klartDatumSkordat
        ? `${landar} · skördaren klar ${fmtDag(s.klartDatumSkordat)}`
        : `${landar} · i takt`
    stapel = { farg: TON_FARG[stort.ton], plan: s.plan }
  }

  return (
    <Kort>
      <SparRubrik typ={s.typ} bestallt={s.bestallt} bolag={s.bolag} />
      <StortTal text={stort.text} ton={stort.ton} liten={stort.liten} />
      <div style={{ fontSize: 15, color: T.t1, fontFamily: T.ff, fontVariantNumeric: 'tabular-nums', marginTop: -4 }}>{mening}</div>
      {stapel && <StapelEnkel bestallt={s.bestallt} skotat={s.skotat} plan={stapel.plan} farg={stapel.farg} />}
      <div style={{ marginTop: 12 }}>
        {ingenPlan ? (
          <KortLank text="Planera objekt" href={planeraHref} />
        ) : (
          <>
            <KortLank text="Veckor" href={veckorHref} />
            <KortLank text="Per bolag" onClick={onOppnaBolag} />
          </>
        )}
      </div>
    </Kort>
  )
}

export { prognosPerBolag }
