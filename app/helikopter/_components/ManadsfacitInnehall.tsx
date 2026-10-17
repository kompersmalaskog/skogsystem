'use client'

// Månadsfacit på en skärm: svaret (procent + levererat mot beställt), ett kort per spår, veckorna, sidfot.
// Ingen fritext och inget orsaksfält — facit är siffror ur datan.
import { AVSTAND, FARG, KORT, RADIE, TNUM, TYP } from '@/lib/design/tokens'
import type { FacitModell, FacitSparVy, FacitVeckaVy } from '../_lib/manadsfacit'
import { veckaFarg } from '../_lib/veckaFarg'
import Ikon from '@/components/design/Ikon'
import { Matare } from './Lista'
import { TON_FARG } from './SparKort'
import { VeckoLegend } from './VeckoDiagram'

const HOJD = 120
const STAPEL_BREDD = 16
const MELLAN = 4

export default function ManadsfacitInnehall({ modell }: { modell: FacitModell }) {
  return (
    <>
      <section style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
        {/* Grön ≥ 100 %, orange < 95 %, vanlig text däremellan. */}
        <div style={{ ...TYP.tal, color: TON_FARG[modell.procentTon] }}>{modell.procentText}</div>
        <div style={{ ...TYP.text, ...TNUM, color: FARG.text2, marginTop: AVSTAND.s }}>{modell.levereratText}</div>
      </section>
      {modell.spar.map(s => <SparKortet key={s.typ} s={s} />)}
      {modell.veckor.length > 0 && <VeckorKort veckor={modell.veckor} />}
      {/* Radbrytning bara mellan delarna — aldrig mitt i "22 arbetsdagar". */}
      <div style={{ ...TYP.meta, ...TNUM, color: FARG.text3, textAlign: 'center', padding: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
        {modell.sidfot.split(' · ').map((del, i) => (
          <span key={del}>{i > 0 && ' · '}<span style={{ whiteSpace: 'nowrap' }}>{del}</span></span>
        ))}
      </div>
    </>
  )
}

function SparKortet({ s }: { s: FacitSparVy }) {
  return (
    <section style={{ ...KORT, marginBottom: AVSTAND.rad, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
      <div style={{ ...TYP.listtitel, color: FARG.text }}>
        {s.namn} · {s.bestalltText}
        {s.bolagText && <span style={{ color: FARG.text2 }}> till {s.bolagText}</span>}
      </div>
      <Rad ikon="forest" etikett="Skördat" tal={s.skordatText} andel={s.skordatAndel} farg={FARG.text2} />
      <Rad ikon="local_shipping" etikett="Skotat" tal={s.skotatText} procentText={s.skotatProcentText} andel={s.skotatAndel} farg={TON_FARG[s.skotatTon]} />
      <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{s.klartText}</div>
    </section>
  )
}

/** Ikon + etikett vänster, talet höger (och procent efter talet i mätarens färg), 6 px mätare under. Skördat mäts inte mot något: grå mätare. */
function Rad({ ikon, etikett, tal, procentText, andel, farg }: { ikon: string; etikett: string; tal: string; procentText?: string; andel: number; farg: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.inuti }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, ...TYP.text, color: FARG.text }}>
          <Ikon namn={ikon} />{etikett}
        </span>
        <span style={{ ...TYP.text, ...TNUM, color: FARG.text, flexShrink: 0 }}>
          {tal}{procentText && <span style={{ ...TYP.meta, color: farg }}> {procentText}</span>}
        </span>
      </div>
      <Matare andel={andel} farg={farg} />
    </div>
  )
}

/** Två staplar per vecka (skördat vänster, skotat höger) med Veckor-diagrammets färger och förklaring (grön ≥ plan, orange under, grå utan plan). Ingen planlinje: facit jämför mot beställt. */
function VeckorKort({ veckor }: { veckor: FacitVeckaVy[] }) {
  const max = Math.max(...veckor.flatMap(v => [v.skordat, v.skotat]), 1)
  const h = (v: number) => Math.min(HOJD, Math.max(0, (v / max) * HOJD))
  const bredd = STAPEL_BREDD * 2 + MELLAN
  return (
    <section style={{ ...KORT, marginBottom: AVSTAND.rad }}>
      <VeckoLegend />
      <div style={{ display: 'flex', gap: AVSTAND.xs, alignItems: 'flex-end' }}>
        {veckor.map(v => (
          <div key={v.etikett} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.xs }}>
            <div style={{ position: 'relative', width: bredd, height: HOJD }}>
              <div style={{ position: 'absolute', left: 0, bottom: 0, width: STAPEL_BREDD, height: h(v.skordat), background: veckaFarg(v.skordat, v.plan), borderRadius: `${RADIE.stapel}px ${RADIE.stapel}px 0 0` }} />
              <div style={{ position: 'absolute', right: 0, bottom: 0, width: STAPEL_BREDD, height: h(v.skotat), background: veckaFarg(v.skotat, v.plan), borderRadius: `${RADIE.stapel}px ${RADIE.stapel}px 0 0` }} />
            </div>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>{v.etikett}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
