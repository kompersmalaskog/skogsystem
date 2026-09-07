'use client'

// Flik 3 — Uppföljning. Per spår: var månaden LANDAR (stort tal: "−340 m³fub" eller
// "Klart 24 okt"), skotat-prognos mot beställt, skördare/flaskhals, stapel med
// plan-idag-streck, skotat per bolag, "Per bolag ›" → sheet med CSV på samma bas.
import { useState } from 'react'
import { T } from '@/lib/utbildning'
import { PROGNOS_FRAN_ARBETSDAG, prognosPerBolag, type ManadStatus, type SparLage } from '../_lib/berakningar'
import { fmt, fmtDag } from '../_lib/format'
import type { Arbetsdagar, BolagRad, Typ } from '../_lib/queries'
import { Kort, KortLank, Rad, SparRubrik, Stapel, StortTal, type Ton } from './SparKort'
import BolagSheet from './BolagSheet'

type Props = {
  spar: SparLage[]
  status: ManadStatus
  dagar: Arbetsdagar
  bolag: BolagRad[] | null
  bolagFel: string | null
  onRetryBolag: () => void
  ar: number
  manad: number
}

export default function UppfoljningFlik({ spar, status, dagar, bolag, bolagFel, onRetryBolag, ar, manad }: Props) {
  const [oppen, setOppen] = useState<Typ | null>(null)
  return (
    <>
      {spar.map(s => (
        <UppfoljningKort key={s.typ} s={s} status={status} dagar={dagar}
          bolag={bolag ? bolag.filter(b => b.typ === s.typ) : null} bolagFel={bolagFel} onRetryBolag={onRetryBolag}
          onOppna={() => setOppen(s.typ)} />
      ))}
      {oppen && (
        <BolagSheet
          open
          onClose={() => setOppen(null)}
          typ={oppen}
          rader={(bolag ?? []).filter(b => b.typ === oppen)}
          kvar={status === 'pagaende' ? dagar.kvar : 0}
          harPrognos={status === 'pagaende' && (spar.find(s => s.typ === oppen)?.harPrognos ?? false)}
          ar={ar}
          manad={manad}
        />
      )}
    </>
  )
}

function UppfoljningKort({ s, status, dagar, bolag, bolagFel, onRetryBolag, onOppna }: {
  s: SparLage; status: ManadStatus; dagar: Arbetsdagar
  bolag: BolagRad[] | null; bolagFel: string | null; onRetryBolag: () => void; onOppna: () => void
}) {
  const ingenBestallning = s.bestallt <= 0

  let stort: { text: string; ton: Ton; under?: string; liten?: boolean }
  let landarText: string | null = null
  if (ingenBestallning) {
    stort = { text: `${fmt(s.skotat)} m³fub`, ton: 'neutral', under: 'skotat · ingen beställning' }
  } else if (status === 'avslutad') {
    const diff = s.skotat - s.bestallt
    stort = diff >= 0 ? { text: 'Klart', ton: 'gron', under: 'beställningen levererad' } : { text: `${fmt(diff)} m³fub`, ton: 'orange', under: 'mot beställt' }
    landarText = `Skotat ${fmt(s.skotat)} av ${fmt(s.bestallt)}`
  } else if (status === 'kommande') {
    stort = { text: 'Inte startad', ton: 'dampad', liten: true }
  } else if (!s.harPrognos || s.prognosSkotat == null) {
    stort = { text: `Prognos från dag ${PROGNOS_FRAN_ARBETSDAG}`, ton: 'dampad', liten: true, under: `arbetsdag ${dagar.gangna + 1} av ${dagar.totalt}` }
  } else {
    const diff = s.prognosSkotat - s.bestallt
    stort = diff >= 0
      ? { text: s.klartDatumSkotat ? `Klart ${fmtDag(s.klartDatumSkotat)}` : 'Klart i tid', ton: 'gron' }
      : { text: `${fmt(diff)} m³fub`, ton: 'orange', under: 'prognos mot beställt' }
    landarText = `Skotat landar ${fmt(s.prognosSkotat)} av ${fmt(s.bestallt)}`
  }

  // Skördaren: klar-datum, eller hur långt före — och om skotaren är flaskhalsen.
  let skordareText = `Skördat ${fmt(s.skordat)} m³fub`
  if (status === 'pagaende' && s.harPrognos) {
    if (s.klartDatumSkordat) skordareText = `Skördaren klar ${fmtDag(s.klartDatumSkordat)}`
    else if (s.oskotat > 0) {
      const flaskhals = s.taktSkotat != null && s.taktSkordat != null && s.taktSkotat < s.taktSkordat
      skordareText = `Skördaren ${fmt(s.oskotat)} före${flaskhals ? ' · skotaren är flaskhals' : ''}`
    }
  }

  // Skotat per bolag — bara bolag med beställning; resten som Övrigt.
  let bolagText: string | null = null
  if (bolag) {
    const med = bolag.filter(b => b.lovat > 0).map(b => `${b.bolag ?? 'Okänt'} ${fmt(b.skotat)}`)
    const ovrigt = bolag.filter(b => b.lovat <= 0).reduce((sum, b) => sum + b.skotat, 0)
    if (ovrigt > 0) med.push(`Övrigt ${fmt(ovrigt)}`)
    bolagText = med.length > 0 ? med.join(' · ') : null
  }

  return (
    <Kort>
      <SparRubrik typ={s.typ} bestallt={s.bestallt} bolag={s.bolag} />
      <StortTal text={stort.text} ton={stort.ton} under={stort.under} liten={stort.liten} />
      {landarText && <Rad text={landarText} />}
      <Rad text={skordareText} />
      <Stapel bestallt={s.bestallt} skordat={s.skordat} skotat={s.skotat} plan={status === 'pagaende' ? s.plan : null} />
      <div style={{ marginTop: 10 }}>
        {bolagFel ? (
          <Rad text="Kunde inte läsa bolag" varde={<button type="button" onClick={onRetryBolag} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 14, fontWeight: 600, fontFamily: T.ff, cursor: 'pointer', minHeight: 32, padding: 0 }}>Försök igen</button>} />
        ) : bolag == null ? (
          <Rad text="Laddar bolag…" dampad />
        ) : bolagText ? (
          <Rad text={bolagText} dampad />
        ) : (
          <Rad text="Inget skotat än" dampad />
        )}
      </div>
      {bolag && bolag.length > 0 && <KortLank text="Per bolag" onClick={onOppna} />}
    </Kort>
  )
}

export { prognosPerBolag }
