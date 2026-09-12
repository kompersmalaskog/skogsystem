'use client'

// Flik 1 — Läge, i liststil: svarsrad överst, MOT BESTÄLLNING (per spår: rubrikrad +
// mätarrad Skördat + mätarrad Skotat + förklaringsrad), DIN MASKIN, två listrader som
// öppnar sheets. Inga stora tal, färg bara på en stapel som ligger under plan idag.
import { useState } from 'react'
import { Trees, Truck } from 'lucide-react'
import { kapacitetsMaskiner, lageSvar, motBestallningRad, TYP_NAMN, type ManadStatus, type SparLage } from '../_lib/berakningar'
import { MANAD_NAMN, dagarText, fmt, kortNamn } from '../_lib/format'
import type { Arbetsdagar, BestallningRad, Maskin, MaskinLage, Typ, UtanTypRad } from '../_lib/queries'
import { KANT, ListLank, ListRad, Lista, MatarRad, Sektion, Svarsrad, TEXT_MUTED } from './Lista'
import { knapp } from './Tillstand'
import MaskinerSheet from './MaskinerSheet'
import UtanTypSheet from './UtanTypSheet'
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
  utanTyp: UtanTypRad[] | null
  antalPlanerade: Record<Typ, number>
  dinMaskin: { maskinNamn: string; lage: MaskinLage | null; fel: string | null; onRetry: () => void } | null
}

export default function LageFlik({ spar, status, dagar, ar, manad, idag, maskiner, bestallningar, utanTyp, antalPlanerade, dinMaskin }: Props) {
  const [sheet, setSheet] = useState<'maskiner' | 'utan' | null>(null)
  const manadNamn = MANAD_NAMN[manad - 1]
  const svar = lageSvar(spar, antalPlanerade, status, dagar, manadNamn)
  const utanSumma = (utanTyp ?? []).reduce((s, r) => s + r.volym, 0)

  return (
    <>
      <Svarsrad svar={svar} />
      <Lista>
        <Sektion rubrik="Mot beställning">
          {spar.map(s => {
            const rad = motBestallningRad(s, antalPlanerade[s.typ], status, manadNamn)
            const harBest = s.bestallt > 0
            const ingenPlan = status !== 'avslutad' && antalPlanerade[s.typ] === 0
            // Staplar bara när det finns både beställning och objekt att mäta mot.
            const visaStapel = harBest && !ingenPlan
            const planAndel = visaStapel && s.plan > 0 ? s.plan / s.bestallt : null
            // Fler än ett bolag: "· Vida 4 000, Södra 1 000" (störst först) i text-secondary efter spårnamnet.
            const bolagen = bestallningar.filter(b => b.typ === s.typ).sort((a, b) => b.volym - a.volym)
            const bolagText = bolagen.length > 1 ? bolagen.map(b => `${b.bolag} ${fmt(b.volym)}`).join(', ') : null
            return (
              <div key={s.typ} style={{ padding: '12px 0', borderTop: KANT }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: T.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {TYP_NAMN[s.typ]}
                  {bolagText && <span style={{ fontSize: 13, fontWeight: 400, color: T.t2 }}> · {bolagText}</span>}
                </div>
                <MatarRad
                  forsta
                  ikon={<Trees size={16} color={T.t2} aria-hidden="true" />}
                  label="Skördat"
                  varde={fmt(s.skordat)}
                  av={harBest ? fmt(s.bestallt) : undefined}
                  andel={visaStapel ? s.skordat / s.bestallt : undefined}
                  planAndel={planAndel}
                  orange={visaStapel && s.plan > 0 && s.skordat < s.plan}
                />
                <MatarRad
                  ikon={<Truck size={16} color={T.t2} aria-hidden="true" />}
                  label="Skotat"
                  varde={fmt(s.skotat)}
                  av={harBest ? fmt(s.bestallt) : undefined}
                  andel={visaStapel ? s.skotat / s.bestallt : undefined}
                  planAndel={planAndel}
                  orange={visaStapel && s.plan > 0 && s.skotat < s.plan}
                />
                <div style={{ fontSize: 13, color: rad.muted ? TEXT_MUTED : T.t2, marginTop: 8, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' }}>{rad.text}</div>
              </div>
            )
          })}
        </Sektion>

        {dinMaskin && (
          <Sektion rubrik="Din maskin">
            <DinMaskinRad {...dinMaskin} />
          </Sektion>
        )}

        <div style={{ marginTop: 6 }}>
          <ListLank text="Skördare och skotare" onClick={() => setSheet('maskiner')} />
          {/* Produktion som inte räknas på något spår — syns samma dag, inte när talen inte stämmer. */}
          {utanTyp == null ? (
            <ListLank orange text="Objekt utan typ eller bolag kunde inte läsas" smakprov="ladda om" onClick={() => window.location.reload()} />
          ) : utanTyp.length > 0 && (
            <ListLank orange text={`${fmt(utanSumma)} m³fub på objekt utan typ eller bolag`} onClick={() => setSheet('utan')} />
          )}
        </div>
      </Lista>

      <UtanTypSheet open={sheet === 'utan'} onClose={() => setSheet(null)} rader={utanTyp ?? []} manadNamn={manadNamn} />
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
