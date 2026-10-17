'use client'

// Flik 1 — Läge, i liststil: svarsrad överst, MOT BESTÄLLNING (per spår: rubrikrad +
// mätarrad Skördat + mätarrad Skotat + förklaringsrad), DIN MASKIN, två listrader som
// öppnar sheets. Inga stora tal, färg bara på en stapel som ligger under plan idag.
import { kapacitetsMaskiner, lageSvar, motBestallningRad, registreringsVarning, TYP_NAMN, type ManadStatus, type SparLage } from '../_lib/berakningar'
import { MANAD_NAMN, dagarText, fmt, kortNamn } from '../_lib/format'
import type { Arbetsdagar, BestallningRad, Maskin, MaskinLage, Typ, UtanTypRad } from '../_lib/queries'
import { ListRad, MatarRad, RAD_KOLUMN } from './Lista'
import Sektion from '@/components/design/Sektion'
import Svarsrad from '@/components/design/Svarsrad'
import { RadGrupp, RadLank } from '@/components/ui/RadGrupp'
import MaskinerSheet from './MaskinerSheet'
import UtanTypSheet from './UtanTypSheet'
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens'
import { usePanelVal } from './PanelVal'

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
  /** Maskiner med manuell datakälla (dim_maskin.datakalla) — Läge varnar när lass inte registrerats. */
  manuella: Set<string>
  /** Senaste lassdatum per manuell maskin (null = inga lass); null = inte hämtat/kunde inte läsas. */
  senasteLass: Record<string, string | null> | null
  /** Alla arbetsdagsrader (global + per maskin) — varningen räknar på maskinens egna dagar. */
  arbetsdagar: Arbetsdagar[]
}

export default function LageFlik({ spar, status, dagar, ar, manad, idag, maskiner, bestallningar, utanTyp, antalPlanerade, dinMaskin, manuella, senasteLass, arbetsdagar }: Props) {
  const [sheet, setSheet] = usePanelVal<'maskiner' | 'utan'>('lage')
  const manadNamn = MANAD_NAMN[manad - 1]
  const svar = lageSvar(spar, antalPlanerade, status, dagar, manadNamn)
  // Manuell datakälla utan registrerade lass de två senaste arbetsdagarna → orange rad under svaret.
  if (status === 'pagaende' && senasteLass) {
    svar.varning = registreringsVarning(maskiner.filter(m => manuella.has(m.maskin_id)), senasteLass, arbetsdagar, idag, manadNamn)
  }
  const utanSumma = (utanTyp ?? []).reduce((s, r) => s + r.volym, 0)

  return (
    <>
      <Svarsrad {...svar} />
      <Sektion className="hk-grupp" rubrik="Mot beställning" foljdAvLankar={!dinMaskin}>
        {spar.map(s => {
          const rad = motBestallningRad(s, antalPlanerade[s.typ], status, manadNamn)
          const harBest = s.bestallt > 0
          const ingenPlan = status !== 'avslutad' && antalPlanerade[s.typ] === 0
          // Mätare bara när det finns både beställning och objekt att mäta mot.
          const visaStapel = harBest && !ingenPlan
          const planAndel = visaStapel && s.plan > 0 ? s.plan / s.bestallt : null
          // Fler än ett bolag: "· Vida 4 000, Södra 1 000" (störst först) i text2 efter spårnamnet.
          const bolagen = bestallningar.filter(b => b.typ === s.typ).sort((a, b) => b.volym - a.volym)
          const bolagText = bolagen.length > 1 ? bolagen.map(b => `${b.bolag} ${fmt(b.volym)}`).join(', ') : null
          return (
            <div key={s.typ} className="hk-rad" style={{ ...RAD_KOLUMN, gap: AVSTAND.m }}>
              <div style={{ ...TYP.listtitel, color: FARG.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {TYP_NAMN[s.typ]}
                {bolagText && <span style={{ ...TYP.meta, color: FARG.text2 }}> · {bolagText}</span>}
              </div>
              <MatarRad
                ikon="forest"
                label="Skördat"
                varde={fmt(s.skordat)}
                av={harBest ? fmt(s.bestallt) : undefined}
                andel={visaStapel ? s.skordat / s.bestallt : undefined}
                planAndel={planAndel}
                orange={visaStapel && s.plan > 0 && s.skordat < s.plan}
              />
              <MatarRad
                ikon="local_shipping"
                label="Skotat"
                varde={fmt(s.skotat)}
                av={harBest ? fmt(s.bestallt) : undefined}
                andel={visaStapel ? s.skotat / s.bestallt : undefined}
                planAndel={planAndel}
                orange={visaStapel && s.plan > 0 && s.skotat < s.plan}
              />
              <div style={{ ...TYP.meta, ...TNUM, color: rad.muted ? FARG.text3 : FARG.text2 }}>{rad.text}</div>
            </div>
          )
        })}
      </Sektion>

      {dinMaskin && (
        <Sektion className="hk-grupp" rubrik="Din maskin" foljdAvLankar>
          <DinMaskinRad {...dinMaskin} />
        </Sektion>
      )}

      <RadGrupp>
        <RadLank text="Skördare och skotare" onClick={() => setSheet('maskiner')} />
        {/* Produktion som inte räknas på något spår — syns samma dag, inte när talen inte stämmer. */}
        {utanTyp == null ? (
          <RadLank orange text="Objekt utan typ eller bolag kunde inte läsas" smakprov="ladda om" onClick={() => window.location.reload()} />
        ) : utanTyp.length > 0 && (
          <RadLank orange text={`${fmt(utanSumma)} m³fub på objekt utan typ eller bolag`} onClick={() => setSheet('utan')} />
        )}
      </RadGrupp>

      <UtanTypSheet open={sheet === 'utan'} onClose={() => setSheet(null)} rader={utanTyp ?? []} manadNamn={manadNamn} />
      <MaskinerSheet open={sheet === 'maskiner'} onClose={() => setSheet(null)} spar={spar} status={status} maskiner={kapacitetsMaskiner(maskiner, idag)} idag={idag} />
    </>
  )
}

function DinMaskinRad({ maskinNamn, lage, fel, onRetry }: { maskinNamn: string; lage: MaskinLage | null; fel: string | null; onRetry: () => void }) {
  if (fel) {
    return (
      <RadLank orange text="Kunde inte läsa maskinen" smakprov="försök igen" onClick={onRetry} />
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
