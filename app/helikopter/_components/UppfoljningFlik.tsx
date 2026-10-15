'use client'

// Flik 3 — Uppföljning. Exakt fem rader per spår (stort tal: "Skotat klart 25 sep" grönt bara när både skotat och skördat når beställt):
//   1 rubrik · 2 stort tal · 3 en mening · 4 stapel (skotat mot beställt) · 5 Veckor › / Per bolag ›
// Inga objekt i månaden → "Inga objekt" (grått), ingen stapel, "Planera objekt ›".
import { useState } from 'react'
import { AVSTAND, FARG, KNAPP, TNUM, TYP, INAKTIV } from '@/lib/design/tokens'
import { PROGNOS_FRAN_ARBETSDAG, prognosPerBolag, type ManadStatus, type SparLage } from '../_lib/berakningar'
import { MANAD_NAMN, fmt, fmtDag, kortNamn } from '../_lib/format'
import type { Arbetsdagar, BolagRad, MaskinManad, Typ } from '../_lib/queries'
import { SparRubrik, StapelEnkel, StortTal, TON_FARG, type Ton } from './SparKort'
import { Kort, ListRad, Sektion } from './Lista'
import { RadGrupp, RadLank } from '@/components/ui/RadGrupp'
import { Sheet } from '@/components/Sheet'
import BolagSheet from './BolagSheet'
import HistorikInnehall from './HistorikInnehall'
import { usePanelVal } from './PanelVal'
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
  /** admin ser "Skicka veckoläge nu" (onsdagsnotisen). */
  arAdmin: boolean
  /** Maskiner med manuell datakälla — "manuell" i text-muted efter volymen. */
  manuella: Set<string>
  /** Stor skärm har tre kolumner och ingen Historik-flik: raden "Tidigare månader ›" nederst öppnar den som panel. */
  visaHistorikRad?: boolean
}

export default function UppfoljningFlik({ spar, status, dagar, bolag, bolagFel, onRetryBolag, maskiner, maskinerFel, onRetryMaskiner, antalPlanerade, ar, manad, arAdmin, manuella, visaHistorikRad }: Props) {
  const [oppen, setOppen] = usePanelVal<Typ | 'historik'>('uppfoljning')
  return (
    <>
      {spar.map(s => (
        <UppfoljningKort key={s.typ} s={s} status={status} antalPlanerade={antalPlanerade[s.typ]} ar={ar} manad={manad} onOppnaBolag={() => setOppen(s.typ)} />
      ))}
      <MaskinSektion maskiner={maskiner} fel={maskinerFel} onRetry={onRetryMaskiner} manadNamn={MANAD_NAMN[manad - 1]} manuella={manuella} />
      {arAdmin && <VeckoNotisSektion />}
      {visaHistorikRad && (
        <RadGrupp>
          <RadLank text="Tidigare månader" onClick={() => setOppen('historik')} />
        </RadGrupp>
      )}
      {oppen === 'historik' && (
        <Sheet open onClose={() => setOppen(null)} title="Historik">
          <HistorikInnehall yta={FARG.upphojt} />
        </Sheet>
      )}
      {oppen && oppen !== 'historik' && (
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

  // Skotaren når beställt (skotar ut föregående månad) fast inget är planerat: visa det, dämpat — inte "Inga objekt".
  const skotatKlart = status === 'pagaende' && !ingenBest && s.harPrognos && s.prognosSkotat != null && s.prognosSkotat >= s.bestallt

  if (ingenPlan && !skotatKlart) {
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
    stapel = { farg: FARG.text2, plan: s.plan }
  } else {
    const diff = s.prognosSkotat - s.bestallt
    if (diff >= 0) {
      // Skotat klart. Grönt bara när även skördaren når beställt — annars dämpat: det är
      // inte grönt när skördaren saknar objekt. Raden under = skördarens läge.
      const skordarenKlar = s.prognosSkordat != null && s.prognosSkordat >= s.bestallt
      stort = { text: s.klartDatumSkotat ? `Skotat klart ${fmtDag(s.klartDatumSkotat)}` : 'Skotat klart i tid', ton: skordarenKlar ? 'gron' : 'dampad' }
      mening = `Skördaren ${fmt(s.skordat)} av ${fmt(s.bestallt)}${antalPlanerade === 0 ? ' · inget planerat' : ''}`
    } else {
      stort = { text: fmt(diff), ton: 'orange' }
      // Relationen skördare/skotare: mer än en dags skotning oskotat i månaden = skotaren är flaskhals.
      const flaskhals = s.oskotat > (s.taktSkotat ?? 0)
      const landar = `Landar ${fmt(s.prognosSkotat)}`
      mening = flaskhals
        ? `${landar} · skotaren är flaskhals`
        : s.klartDatumSkordat
          ? `${landar} · skördaren klar ${fmtDag(s.klartDatumSkordat)}`
          : `${landar} · i takt`
    }
    stapel = { farg: TON_FARG[stort.ton], plan: s.plan }
  }

  return (
    <>
      <Kort>
        <SparRubrik typ={s.typ} bestallt={s.bestallt} bolag={s.bolag} />
        <StortTal text={stort.text} ton={stort.ton} liten={stort.liten} />
        <div style={{ ...TYP.text, ...TNUM, color: FARG.text }}>{mening}</div>
        {stapel && <StapelEnkel bestallt={s.bestallt} skotat={s.skotat} plan={stapel.plan} farg={stapel.farg} />}
      </Kort>
      <RadGrupp>
        {ingenPlan ? (
          <RadLank text="Planera objekt" href={planeraHref} />
        ) : (
          <>
            <RadLank text="Veckor" href={veckorHref} />
            <RadLank text="Per bolag" onClick={onOppnaBolag} />
          </>
        )}
      </RadGrupp>
    </>
  )
}

/** MASKINER: en rad per aktiv maskin — månadens volym, var den senast producerade, takt, oskotat på objektet. Ingen stapel, ingen färg. */
function MaskinSektion({ maskiner, fel, onRetry, manadNamn, manuella }: { maskiner: MaskinManad[] | null; fel: string | null; onRetry: () => void; manadNamn: string; manuella: Set<string> }) {
  const rubrik = manadNamn.toUpperCase()
  if (fel) {
    return (
      <Sektion rubrik={`Maskiner · ${rubrik}`}>
        <RadLank orange text="Kunde inte läsa maskinerna" smakprov="försök igen" onClick={onRetry} />
      </Sektion>
    )
  }
  return (
    <>
      {(['skordare', 'skotare'] as const).map(roll => (
        <Sektion key={roll} rubrik={`${roll === 'skordare' ? 'Skördare' : 'Skotare'} · ${rubrik}`}>
          {maskiner == null ? (
            <div className="hk-rad" style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Laddar maskiner…</div>
          ) : maskiner.filter(m => m.roll === roll).length === 0 ? (
            <div className="hk-rad" style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga aktiva maskiner</div>
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
                  tal={har ? <>{fmt(m.volym_manad)}<span style={{ ...TYP.meta, color: FARG.text2 }}> m³fub</span>{manuella.has(m.maskin_id) && <span style={{ ...TYP.meta, color: FARG.text3 }}> · manuell</span>}</> : '–'}
                  talTon={har ? 'normal' : 'muted'}
                  under={har ? delar.join(' · ') : `Ingen produktion i ${manadNamn}`}
                  underMuted={!har}
                />
              )
            })
          )}
        </Sektion>
      ))}
    </>
  )
}

/**
 * ONSDAGSNOTIS (admin): manuell utlösare för veckoläget som pushas onsdagar 12:00
 * (helikopter_notis_vecka + notis_kö). Knappen köar och tömmer kön direkt; texten
 * är samma som den automatiska. Tillståndet står under knappen, aldrig i en dialogruta.
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
    <Sektion rubrik="Onsdagsnotis">
      <div className="hk-rad" style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0`, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
        <span>Veckoläget pushas onsdagar 12:00. Samma text kan skickas nu.</span>
        <button
          type="button"
          onClick={skicka}
          disabled={skickar}
          aria-busy={skickar}
          style={{ ...KNAPP.sekundar, ...(skickar ? INAKTIV : null) }}
        >
          {skickar ? 'Skickar…' : 'Skicka veckoläge nu'}
        </button>
        {lage.text && (
          <span role="status" style={{ ...TYP.meta, ...TNUM, color: lage.status === 'fel' ? FARG.orange : FARG.text2 }}>
            {lage.text}
          </span>
        )}
      </div>
    </Sektion>
  )
}
