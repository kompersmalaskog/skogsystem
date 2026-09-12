'use client'

// Flik 3 — Uppföljning. Exakt fem rader per spår:
//   1 rubrik · 2 stort tal · 3 en mening · 4 stapel (skotat mot beställt) · 5 Veckor › / Per bolag ›
// Inga objekt i månaden → "Inga objekt" (grått), ingen stapel, "Planera objekt ›".
import { useState } from 'react'
import { T } from '@/lib/utbildning'
import { PROGNOS_FRAN_ARBETSDAG, prognosPerBolag, type ManadStatus, type SparLage } from '../_lib/berakningar'
import { MANAD_NAMN, fmt, fmtDag, kortNamn } from '../_lib/format'
import type { Arbetsdagar, BolagRad, MaskinManad, Typ } from '../_lib/queries'
import { Kort, KortLank, SparRubrik, StapelEnkel, StortTal, TON_FARG, type Ton } from './SparKort'
import { ListRad, Lista, Sektion } from './Lista'
import { knapp } from './Tillstand'
import BolagSheet from './BolagSheet'
import { skickaVeckoNotis } from '../_lib/queries'

type Props = {
  spar: SparLage[]
  status: ManadStatus
  dagar: Arbetsdagar
  bolag: BolagRad[] | null
  bolagFel: string | null
  onRetryBolag: () => void
  maskiner: MaskinManad[] | null
  maskinerFel: string | null
  onRetryMaskiner: () => void
  antalPlanerade: Record<Typ, number>
  ar: number
  manad: number
  /** Admin/chef ser "Skicka veckoläge nu" (onsdagsnotisen). */
  arAdmin: boolean
}

export default function UppfoljningFlik({ spar, status, dagar, bolag, bolagFel, onRetryBolag, maskiner, maskinerFel, onRetryMaskiner, antalPlanerade, ar, manad, arAdmin }: Props) {
  const [oppen, setOppen] = useState<Typ | null>(null)
  return (
    <>
      {spar.map(s => (
        <UppfoljningKort key={s.typ} s={s} status={status} antalPlanerade={antalPlanerade[s.typ]} ar={ar} manad={manad} onOppnaBolag={() => setOppen(s.typ)} />
      ))}
      <MaskinSektion maskiner={maskiner} fel={maskinerFel} onRetry={onRetryMaskiner} manadNamn={MANAD_NAMN[manad - 1]} />
      {arAdmin && <VeckoNotisSektion />}
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

/** MASKINER: en rad per aktiv maskin — månadens volym, var den senast producerade, takt, oskotat på objektet. Ingen stapel, ingen färg. */
function MaskinSektion({ maskiner, fel, onRetry, manadNamn }: { maskiner: MaskinManad[] | null; fel: string | null; onRetry: () => void; manadNamn: string }) {
  const rubrik = manadNamn.toUpperCase()
  if (fel) {
    return (
      <Lista>
        <Sektion rubrik={`Maskiner · ${rubrik}`}>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.t1, marginBottom: 12 }}>Kunde inte läsa maskinerna – försök igen</div>
            <button type="button" onClick={onRetry} style={knapp}>Försök igen</button>
          </div>
        </Sektion>
      </Lista>
    )
  }
  return (
    <Lista>
      {(['skordare', 'skotare'] as const).map(roll => (
        <Sektion key={roll} rubrik={`${roll === 'skordare' ? 'Skördare' : 'Skotare'} · ${rubrik}`}>
          {maskiner == null ? (
            <div style={{ fontSize: 14, color: T.t2, padding: '10px 0 12px' }}>Laddar maskiner…</div>
          ) : maskiner.filter(m => m.roll === roll).length === 0 ? (
            <div style={{ fontSize: 14, color: T.t2, padding: '10px 0 12px' }}>Inga aktiva maskiner</div>
          ) : (
            maskiner.filter(m => m.roll === roll).map(m => {
              const har = m.volym_manad > 0
              const delar: string[] = []
              if (har) {
                if (m.objekt_namn) delar.push(kortNamn(m.objekt_namn))
                if (m.takt_per_dag != null) delar.push(`${fmt(m.takt_per_dag)}/dag`)
                if (roll === 'skotare' && m.oskotat_objekt != null) delar.push(`oskotat på objektet ${fmt(m.oskotat_objekt)}`)
              }
              return (
                <ListRad
                  key={m.maskin_id}
                  namn={m.namn}
                  tal={har ? <>{fmt(m.volym_manad)}<span style={{ color: T.t2 }}> m³fub</span></> : '–'}
                  talTon={har ? 'normal' : 'muted'}
                  under={har ? delar.join(' · ') : `Ingen produktion i ${manadNamn}`}
                  underMuted={!har}
                />
              )
            })
          )}
        </Sektion>
      ))}
    </Lista>
  )
}

/**
 * ONSDAGSNOTIS (admin): manuell utlösare för veckoläget som pushas onsdagar 12:00
 * (helikopter_notis_vecka + notis_kö). Knappen köar och tömmer kön direkt; texten
 * är samma som den automatiska. Tillståndet står under knappen — aldrig alert().
 */
function VeckoNotisSektion() {
  const [lage, setLage] = useState<{ status: 'vila' | 'skickar' | 'klar' | 'fel'; text: string | null }>({ status: 'vila', text: null })
  const skickar = lage.status === 'skickar'
  async function skicka() {
    setLage({ status: 'skickar', text: null })
    const r = await skickaVeckoNotis()
    if (r.error !== null || r.data == null) { setLage({ status: 'fel', text: 'Kunde inte skicka – försök igen' }); return }
    if (r.data.antal === 0) { setLage({ status: 'fel', text: 'Ingen mottagare hittades' }); return }
    const vem = r.data.antal === 1 ? '1 mottagare' : `${r.data.antal} mottagare`
    setLage({ status: 'klar', text: r.data.skickadNu ? `Skickad till ${vem}` : `Köad till ${vem} – går inom 5 minuter` })
  }
  return (
    <Lista>
      <Sektion rubrik="Onsdagsnotis">
        <div style={{ fontSize: 14, color: T.t2, fontFamily: T.ff, padding: '8px 0 12px' }}>
          Veckoläget pushas onsdagar 12:00. Samma text kan skickas nu.
        </div>
        <button
          type="button"
          onClick={skicka}
          disabled={skickar}
          aria-busy={skickar}
          style={{ ...knapp, width: '100%', opacity: skickar ? 0.4 : 1, cursor: skickar ? 'default' : 'pointer' }}
        >
          {skickar ? 'Skickar…' : 'Skicka veckoläge nu'}
        </button>
        {lage.text && (
          <div role="status" style={{ fontSize: 14, color: lage.status === 'fel' ? T.orange : T.t2, fontFamily: T.ff, fontVariantNumeric: 'tabular-nums', padding: '10px 0 4px' }}>
            {lage.text}
          </div>
        )}
      </Sektion>
    </Lista>
  )
}

export { prognosPerBolag }
