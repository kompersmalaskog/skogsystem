'use client'

// Flik 2 — Planering: "räcker månaden?" som DATUM. Svarsrad (en prioriterad mening), MOT BESTÄLLNING (en mätare per typ),
// KLAR / JOBB TILL (klar-datum per maskin — tryck på en maskin för dess trakter, tryck på en trakt för att byta maskin), och på bred skärm
// ett rutnät med trakterna som block. Prognosen per trakt sätts i planeringsverktyget; här görs den bara till datum (helikopter_ny_klar).
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens'
import { TYP_NAMN, type ManadStatus, type SparLage } from '../_lib/berakningar'
import { MANAD_NAMN, fmt, kortNamn } from '../_lib/format'
import {
  ROLL_NAMN, klarSvar, maskinHoger, maskinUnderrad, otilldelade, raknaAlla,
  type ForraBestallning, type KlarRoll,
} from '../_lib/klar'
import { arHelgEllerRod, rutnatDagar, rutnatRader } from '../_lib/klarRutnat'
import { markeraBestallningKopierad } from '../_lib/bestKopierad'
import { hamtaForraBestallning, kopieraForraBestallning, tilldelaMaskin, type Arbetsdagar, type FastData, type Manadsdata } from '../_lib/queries'
import { useFonsterBredd } from '../_lib/useFonsterBredd'
import { useKlar } from '../_lib/useKlar'
import { ListRad } from './Lista'
import KlarRad from './KlarRad'
import MaskinKlarSheet from './MaskinKlarSheet'
import ByttMaskinSheet from './ByttMaskinSheet'
import Sektion from '@/components/design/Sektion'
import Rutnat from '@/components/design/Rutnat'
import Svarsrad from '@/components/design/Svarsrad'
import { RadGrupp, RadLank } from '@/components/ui/RadGrupp'
import { Fel, Laddar, Tomt } from './Tillstand'
import { usePanelVal } from './PanelVal'

/** Rutnätet visas från den här fönsterbredden (iPad och dator); på telefon bara listan. */
export const RUTNAT_MIN_PX = 728

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

// Panelvärden: `maskin|<maskin_id>` eller `byt|<objekt_id>|<roll>|<maskin_id den kom från, eller tomt>`.
const delaVal = (v: string | null) => (v ? v.split('|') : [])

export default function PlaneringFlik({ status, idag, ar, manad }: Props) {
  const avslutad = status === 'avslutad'
  const { data, fel, laddar, ladda } = useKlar(ar, manad, idag, !avslutad)
  const [val, setVal] = usePanelVal<string>('planering')
  const bred = useFonsterBredd() >= RUTNAT_MIN_PX

  // Förra månadens beställning hämtas bara när den här månaden saknar en (knappen "Samma som oktober · 5 000 · 1 000").
  const [forra, setForra] = useState<ForraBestallning | null | undefined>(undefined)
  const saknarBest = data != null && !data.har_bestallning
  useEffect(() => {
    if (!saknarBest) { setForra(undefined); return }
    let avbruten = false
    void hamtaForraBestallning(ar, manad, m => MANAD_NAMN[m - 1] ?? '').then(r => { if (!avbruten) setForra(r.error ? null : r.data) })
    return () => { avbruten = true }
  }, [saknarBest, ar, manad])

  const [kopierar, setKopierar] = useState(false)
  const [kopieraFel, setKopieraFel] = useState<string | null>(null)
  const kopiera = useCallback(async () => {
    setKopierar(true)
    setKopieraFel(null)
    const r = await kopieraForraBestallning(ar, manad)
    setKopierar(false)
    if (r.error) { setKopieraFel(r.error); return }
    markeraBestallningKopierad(ar, manad)
    await ladda()
  }, [ar, manad, ladda])

  const planer = useMemo(() => (data ? raknaAlla(data) : null), [data])
  const utanMaskin = useMemo(() => (data ? otilldelade(data) : []), [data])

  if (avslutad) {
    return <Tomt rubrik="Månaden är avslutad" text="Planering gäller innevarande och kommande månader. Utfallet finns under Uppföljning." />
  }
  if (fel) return <Fel onRetry={() => void ladda()} />
  if (laddar || !data || !planer) return <Laddar vad="planeringen" />

  const svar = klarSvar(data, forra === undefined ? null : forra)
  const [vad, a1, a2, a3] = delaVal(val)
  const oppnaTrakt = (objektId: string, roll: KlarRoll, fran = '') => setVal(`byt|${objektId}|${roll}|${fran}`)

  const valjMaskin = async (objektId: string, roll: KlarRoll, maskinId: string): Promise<string | null> => {
    const r = await tilldelaMaskin(objektId, roll, maskinId)
    if (r.error) return r.error
    await ladda()
    setVal(null)
    return null
  }

  // Utan uppmätt G15 (för få dagar, eller mätningen gick inte att läsa) räknar SQL med 8 h/dag — det ska stå, inte se uppmätt ut.
  const ejMatta = data.maskiner.filter(m => m.ej_matt && !m.manuell)
  const kapacitetsNot = `Dagar räknas på uppmätt G15 per arbetsdag, 12 mån.${ejMatta.length > 0 ? ` ${ejMatta.map(m => m.namn).join(', ')}: ej mätt, räknas på 8 h/dag.` : ''}`
  const rubrikKlar = status === 'pagaende' ? 'Klar' : `Jobb till ${MANAD_NAMN[manad - 1] ?? ''}`
  const dagarRutnat = bred ? rutnatDagar(data, planer) : []

  return (
    <>
      <Svarsrad rubrik={svar.rubrik} rad={svar.rad} avvikelse={svar.avvikelse} />
      {svar.atgard && (forra !== undefined || svar.atgard.slag === 'lagg_in') && (
        <div style={{ marginBottom: AVSTAND.xl }}>
          {svar.atgard.slag === 'kopiera' ? (
            <button type="button" disabled={kopierar} onClick={() => void kopiera()} style={KNAPP.primar}>{kopierar ? 'Lägger in…' : svar.atgard.text}</button>
          ) : (
            <Link href={`/bestallningar?ar=${ar}&manad=${manad}`} style={{ ...KNAPP.primar, textDecoration: 'none' }}>{svar.atgard.text}</Link>
          )}
          {kopieraFel && <div role="alert" style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.s }}>Kunde inte lägga in beställningen: {kopieraFel}</div>}
        </div>
      )}

      <Sektion className="hk-grupp" rubrik="Mot beställning">
        {data.spar.map(s => {
          const harBest = s.bestallt > 0
          return (
            <ListRad
              key={s.typ}
              namn={TYP_NAMN[s.typ]}
              tal={fmt(s.trakt_volym)}
              av={harBest ? fmt(s.bestallt) : undefined}
              andel={harBest ? Math.min(s.trakt_volym / s.bestallt, 1) : undefined}
              orange={harBest && s.trakt_volym < s.bestallt}
            />
          )
        })}
      </Sektion>

      <Sektion className="hk-grupp" rubrik={rubrikKlar} not={<span style={{ color: FARG.text3 }}>{kapacitetsNot}</span>}>
        {data.maskiner.map(m => {
          const p = planer[m.maskin_id]
          const h = maskinHoger(p)
          return <KlarRad key={m.maskin_id} namn={m.namn} under={maskinUnderrad(p)} hoger={h.text} hogerTon={h.ton} onClick={() => setVal(`maskin|${m.maskin_id}`)} />
        })}
        {utanMaskin.map(t => (
          <KlarRad
            key={`${t.objekt_id}:${t.roll}`}
            namn={kortNamn(t.namn)}
            under={`${ROLL_NAMN[t.roll]} · ${t.maskin_id == null ? 'ingen maskin' : 'maskinen ingår inte i planen'}`}
            underTon="orange"
            hoger="–"
            hogerTon="muted"
            onClick={() => oppnaTrakt(t.objekt_id, t.roll)}
          />
        ))}
      </Sektion>

      {bred && dagarRutnat.length > 0 && (
        <div style={{ marginBottom: AVSTAND.xl }}>
          <Rutnat dagar={dagarRutnat} idagIso={idag} rader={rutnatRader(data, planer, (objektId, roll) => oppnaTrakt(objektId, roll))} tonadDag={arHelgEllerRod} avdelare="Maskiner" />
        </div>
      )}

      <RadGrupp>
        <RadLank text="Månadsplan" href={`/helikopter/manadsplan?ar=${ar}&manad=${manad}`} />
      </RadGrupp>

      <MaskinKlarSheet
        open={vad === 'maskin'}
        onClose={() => setVal(null)}
        plan={vad === 'maskin' ? (planer[a1] ?? null) : null}
        onTrakt={(objektId, roll) => oppnaTrakt(objektId, roll, a1)}
      />
      {vad === 'byt' && (
        <ByttMaskinSheet
          open
          onClose={() => (a3 ? setVal(`maskin|${a3}`) : setVal(null))}
          data={data}
          objektId={a1}
          roll={a2 as KlarRoll}
          onValj={maskinId => valjMaskin(a1, a2 as KlarRoll, maskinId)}
        />
      )}
    </>
  )
}
