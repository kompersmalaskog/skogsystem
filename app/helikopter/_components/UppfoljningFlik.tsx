'use client'

// Flik 3 — Uppföljning. Ett KORT per spår som svarar på EN fråga: landar vi på beställningen — både skördat och skotat?
//   rubrik · rad "Skördat landar" (tal + av beställt, stapel hittills mot beställt, när det når / vad som behövs) · samma för "Skotat landar" · Veckor › / Per bolag ›
// Prognos per roll = hittills + takt (senaste 5 arbetsdagarna) × arbetsdagar kvar (landarRoller i berakningar.ts). Grönt tal när rollen landar på beställt, orange annars.
// Inga objekt i månaden → "Inga objekt" (grått), "Skotat 714 · inget planerat", ingen stapel, "Planera objekt ›".
import { useState } from 'react'
import { AVSTAND, FARG, IKON, KNAPP, TNUM, TYP, INAKTIV } from '@/lib/design/tokens'
import { PROGNOS_FRAN_ARBETSDAG, landarRoller, rollHogerText, type ManadStatus, type RollLandar, type SparLage } from '../_lib/berakningar'
import { MANAD_NAMN, fmt, fmtDag, kortNamn } from '../_lib/format'
import type { Arbetsdagar, BolagRad, MaskinManad, Typ } from '../_lib/queries'
import { SparRubrik, StapelEnkel, StortTal, TON_FARG, type Ton } from './SparKort'
import { Kort, ListRad, Matare, Sektion } from './Lista'
import { Ikon } from './Ikon'
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
  const ingenPlan = status !== 'avslutad' && antalPlanerade === 0
  const ingenBest = s.bestallt <= 0
  const veckorHref = `/helikopter/veckor?typ=${s.typ}&ar=${ar}&manad=${manad}`
  const planeraHref = `/helikopter?flik=planering&ar=${ar}&manad=${manad}`

  const lankar = (
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
  )

  // Pågående månad med beställning, objekt och prognos: två rader, "Skördat landar" och "Skotat landar".
  const roller = status === 'pagaende' && !ingenBest && !ingenPlan ? landarRoller(s) : null
  if (roller) {
    const planAndel = s.plan > 0 ? s.plan / s.bestallt : null
    return (
      <>
        <Kort>
          <SparRubrik typ={s.typ} bestallt={s.bestallt} bolag={s.bolag} />
          <div style={{ marginTop: AVSTAND.m }}>
            <RollRad r={roller[0]} planAndel={planAndel} />
            <div aria-hidden="true" style={{ borderTop: `0.5px solid ${FARG.linje}`, margin: `${AVSTAND.l}px 0` }} />
            <RollRad r={roller[1]} planAndel={planAndel} />
          </div>
        </Kort>
        {lankar}
      </>
    )
  }

  let stort: { text: string; ton: Ton; liten?: boolean }
  let mening: string
  let stapel: { farg: string; plan: number | null } | null = null

  if (ingenPlan) {
    stort = { text: 'Inga objekt', ton: 'dampad' }
    mening = `Skotat ${fmt(s.skotat)} · inget planerat`
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
  } else {
    // Pågående, men ingen prognos än (före arbetsdag 4).
    stort = { text: `Prognos från dag ${PROGNOS_FRAN_ARBETSDAG}`, ton: 'dampad', liten: true }
    mening = `Skotat ${fmt(s.skotat)} · prognos från arbetsdag ${PROGNOS_FRAN_ARBETSDAG}`
    stapel = { farg: FARG.text2, plan: s.plan }
  }

  return (
    <>
      <Kort>
        <SparRubrik typ={s.typ} bestallt={s.bestallt} bolag={s.bolag} />
        <StortTal text={stort.text} ton={stort.ton} liten={stort.liten} />
        <div style={{ ...TYP.text, ...TNUM, color: FARG.text }}>{mening}</div>
        {stapel && <StapelEnkel bestallt={s.bestallt} skotat={s.skotat} plan={stapel.plan} farg={stapel.farg} />}
      </Kort>
      {lankar}
    </>
  )
}

/**
 * En roll i spårkortet: etikett (ikon + "Skördat landar"), prognosen stor med "av beställt", stapel (hittills mot beställt, planstreck idag),
 * och under den: hittills vänster, höger "når beställt 26 okt" eller "behöver 34/dag · kör 56". Tal och stapel i samma färg: grön när rollen
 * landar på beställt, orange när den landar under.
 */
function RollRad({ r, planAndel }: { r: RollLandar; planAndel: number | null }) {
  const farg = r.under ? FARG.orange : FARG.gron
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.meta, color: FARG.text2 }}>
        <Ikon namn={r.ikon} storlek={IKON.text} />{r.namn} landar
      </div>
      <div style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>
        <span style={{ ...TYP.tal, ...TNUM, color: farg }}>{fmt(r.landar)}</span>
        <span style={{ ...TYP.text, ...TNUM, color: FARG.text2 }}> av {fmt(r.bestallt)}</span>
      </div>
      <Matare andel={r.hittills / r.bestallt} planAndel={planAndel} farg={farg} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m, marginTop: AVSTAND.s, ...TYP.meta, ...TNUM, color: FARG.text2 }}>
        <span>{r.namn.toLowerCase()} {fmt(r.hittills)} idag</span>
        <span style={{ textAlign: 'right' }}>{rollHogerText(r)}</span>
      </div>
    </div>
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
