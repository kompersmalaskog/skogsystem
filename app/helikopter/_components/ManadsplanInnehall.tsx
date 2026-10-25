'use client'

// Månadsplan på en skärm: svar, mot beställning (två spår sida vid sida), maskiner som rutnät med klar-datum, att göra, sidfot.
// Samma modell (_lib/manadsplan.ts) som PDF:en och bilden. Inga egna beräkningar här.
import { AVSTAND, FARG, KORT, RAD, TNUM, TYP } from '@/lib/design/tokens'
import Rutnat from '@/components/design/Rutnat'
import Sektion from '@/components/design/Sektion'
import Svarsrad from '@/components/design/Svarsrad'
import { arHelgEllerRod } from '../_lib/klarRutnat'
import type { PlanModell, PlanSpar } from '../_lib/manadsplan'
import { Matare } from './Lista'

/** A4-sidan visar hela perioden utan scroll där det går: dagkolumnerna får vara smalare än Schemats 34 px, men inte smalare än så här. */
export const A4_MIN_DAG = 20

const ELLIPS = { minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const

export default function ManadsplanInnehall({ modell }: { modell: PlanModell }) {
  return (
    <>
      <Svarsrad rubrik={modell.svar.rubrik} rad={modell.svar.rad} avvikelse={modell.svar.avvikelse} />

      <Sektion rubrik="Mot beställning" kort={false}>
        <section style={{ ...KORT, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.l }}>
          {modell.spar.map(s => <SparKolumn key={s.typ} s={s} />)}
        </section>
      </Sektion>

      <Sektion rubrik="Maskiner" kort={false}>
        <Rutnat
          dagar={modell.dagar}
          idagIso={modell.idagIso}
          tonadDag={arHelgEllerRod}
          minDag={A4_MIN_DAG}
          rader={modell.maskiner.map(m => ({ id: m.id, namn: m.namn, segment: m.segment, hoger: { text: m.klar.text, ton: m.klar.ton } }))}
        />
      </Sektion>

      {modell.attGora.length > 0 && (
        <Sektion className="hk-grupp" rubrik="Att göra">
          {modell.attGora.map(rad => (
            <div key={rad} className="hk-rad" style={{ ...RAD, ...TYP.text, color: FARG.text }}>{rad}</div>
          ))}
        </Sektion>
      )}

      {/* Radbrytning bara mellan delarna — aldrig mitt i en del. */}
      <div style={{ ...TYP.meta, ...TNUM, color: FARG.text3, textAlign: 'center', padding: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
        {modell.sidfot.split(' · ').map((del, i) => (
          <span key={del}>{i > 0 && ' · '}<span style={{ whiteSpace: 'nowrap' }}>{del}</span></span>
        ))}
      </div>
    </>
  )
}

/** Ett spår: namn, "5 240 av 5 000" + mätare, trakterna med volym (saknar prognos i orange under), sist "380 m³fub saknar trakt". */
function SparKolumn({ s }: { s: PlanSpar }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m, minWidth: 0 }}>
      <div style={{ ...TYP.listtitel, color: FARG.text, ...ELLIPS }}>{s.namn}</div>
      <div style={{ ...TYP.text, ...TNUM, color: s.orange ? FARG.orange : FARG.text }}>{s.summaText}</div>
      {s.andel != null && <Matare andel={s.andel} farg={s.orange ? FARG.orange : FARG.text2} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
        {s.trakter.map(t => (
          <div key={t.namn}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.s, ...TYP.meta, color: FARG.text }}>
              <span style={ELLIPS}>{t.namn}</span>
              <span style={{ ...TNUM, flexShrink: 0, color: FARG.text2 }}>{t.volymText}</span>
            </div>
            {t.saknarPrognos && <div style={{ ...TYP.meta, color: FARG.orange }}>saknar prognos</div>}
          </div>
        ))}
        {s.saknasText && <div style={{ ...TYP.meta, color: FARG.orange }}>{s.saknasText}</div>}
      </div>
    </div>
  )
}
