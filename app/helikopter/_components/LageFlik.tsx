'use client'

// Flik 1 — Läge, i liststil: svarsrad överst, MOT BESTÄLLNING (en rad per spår),
// DIN MASKIN, två listrader som öppnar sheets. Inga stora tal, färg bara vid avvikelse.
import { useState } from 'react'
import { kapacitetsMaskiner, lageSvar, motBestallningRad, TYP_NAMN, type ManadStatus, type SparLage } from '../_lib/berakningar'
import { MANAD_NAMN, dagarText, fmt, kortNamn } from '../_lib/format'
import type { Arbetsdagar, BestallningRad, Maskin, MaskinLage, Typ } from '../_lib/queries'
import { ListLank, ListRad, Lista, Sektion, Svarsrad } from './Lista'
import { knapp } from './Tillstand'
import VarVirketSheet from './VarVirketSheet'
import MaskinerSheet from './MaskinerSheet'
import { T } from '@/lib/utbildning'

type Props = {
  spar: SparLage[]
  status: ManadStatus
  dagar: Arbetsdagar
  ar: number
  manad: number
  idag: string
  maskiner: Maskin[]
  bestallningar: BestallningRad[]
  antalPlanerade: Record<Typ, number>
  dinMaskin: { maskinNamn: string; lage: MaskinLage | null; fel: string | null; onRetry: () => void } | null
}

export default function LageFlik({ spar, status, dagar, ar, manad, idag, maskiner, bestallningar, antalPlanerade, dinMaskin }: Props) {
  const [sheet, setSheet] = useState<'virke' | 'maskiner' | null>(null)
  const svar = lageSvar(spar, antalPlanerade, status, dagar)
  const manadNamn = MANAD_NAMN[manad - 1]

  // Smakprov "Var virket ligger": topp två över båda spåren.
  const topp = spar.flatMap(s => s.oskotatObjekt).sort((a, b) => b.oskotat - a.oskotat).slice(0, 2)
  const smakprov = topp.length > 0 ? topp.map(o => `${kortNamn(o.namn)} ${fmt(o.oskotat)}`).join(', ') : undefined

  return (
    <>
      <Svarsrad svar={svar} />
      <Lista>
        <Sektion rubrik="Mot beställning">
          {spar.map(s => {
            const efter = s.lage?.status === 'efter' && (s.lage.dagar ?? 0) >= 1
            const rad = motBestallningRad(s, antalPlanerade[s.typ], status, manadNamn)
            const harBest = s.bestallt > 0
            // Fler än ett bolag: "· Vida 4 000, Södra 1 000" (störst först) i text-secondary efter spårnamnet.
            const bolagen = bestallningar.filter(b => b.typ === s.typ).sort((a, b) => b.volym - a.volym)
            const bolagText = bolagen.length > 1 ? bolagen.map(b => `${b.bolag} ${fmt(b.volym)}`).join(', ') : null
            return (
              <ListRad
                key={s.typ}
                namn={bolagText ? <>{TYP_NAMN[s.typ]}<span style={{ fontSize: 13, fontWeight: 400, color: T.t2 }}> · {bolagText}</span></> : TYP_NAMN[s.typ]}
                tal={fmt(s.skotat)}
                talTon={efter ? 'orange' : 'normal'}
                av={harBest ? fmt(s.bestallt) : undefined}
                andel={harBest ? s.skotat / s.bestallt : undefined}
                planAndel={harBest && status === 'pagaende' && s.plan > 0 ? s.plan / s.bestallt : null}
                orange={efter}
                under={rad.text}
                underMuted={rad.muted}
              />
            )
          })}
        </Sektion>

        {dinMaskin && (
          <Sektion rubrik="Din maskin">
            <DinMaskinRad {...dinMaskin} />
          </Sektion>
        )}

        <div style={{ marginTop: 6 }}>
          <ListLank text="Var virket ligger" smakprov={smakprov} onClick={() => setSheet('virke')} />
          <ListLank text="Skördare och skotare" onClick={() => setSheet('maskiner')} />
        </div>
      </Lista>

      <VarVirketSheet open={sheet === 'virke'} onClose={() => setSheet(null)} ar={ar} manad={manad} />
      <MaskinerSheet open={sheet === 'maskiner'} onClose={() => setSheet(null)} spar={spar} status={status} maskiner={kapacitetsMaskiner(maskiner, idag)} idag={idag} />
    </>
  )
}

function DinMaskinRad({ maskinNamn, lage, fel, onRetry }: { maskinNamn: string; lage: MaskinLage | null; fel: string | null; onRetry: () => void }) {
  if (fel) {
    return (
      <ListRad
        namn={maskinNamn}
        tal=""
        under={<span>Kunde inte läsa maskinen – <button type="button" onClick={onRetry} style={{ ...knapp, minHeight: 32, padding: '0 12px', fontSize: 13, background: 'transparent', color: T.blue }}>försök igen</button></span>}
      />
    )
  }
  if (!lage) return <ListRad namn={maskinNamn} tal="–" talTon="muted" under="Ingen produktion registrerad på maskinen än" underMuted />
  const totalt = lage.gjort + (lage.kvar ?? 0)
  const dagarKvar = lage.kvar != null && lage.takt_per_dag != null && lage.takt_per_dag > 0 ? Math.round(lage.kvar / lage.takt_per_dag) : null
  const gjortOrd = lage.roll === 'skordare' ? 'Skördat' : 'Skotat'
  const under = `${gjortOrd} ${fmt(lage.gjort)}${lage.kvar != null ? ` av ${fmt(totalt)}` : ''}${lage.planerad_namn ? ` · planerad: ${kortNamn(lage.planerad_namn)}` : ''}`
  return (
    <ListRad
      namn={`${maskinNamn} · ${kortNamn(lage.namn)}`}
      tal={dagarKvar != null ? `ca ${dagarText(dagarKvar)} kvar` : '–'}
      talTon={dagarKvar != null ? 'normal' : 'muted'}
      andel={lage.kvar != null && totalt > 0 ? lage.gjort / totalt : undefined}
      under={under}
    />
  )
}
