'use client'

// SKOTAT — ett block per spår, EN siffra per spår (var skotat landar, sparKort i _lib/kort.ts).
//   rad 1: spårets namn · prick + ordet ("Fattas 229" / "Hinner" / "Klar")
//   rad 2: talet (TYP.tal) = SKOTAT HITTILLS "av beställt" — aldrig prognosen (2026-10-24: 726 lästes som skotat när skotat var 561)
//   rad 2b: "Landar på 726" (prognosen, dämpad) — bara när det finns en
//   rad 3: stapeln — ljust = skotat hittills, mörkt = det som kommer till, vitt streck = där ni borde vara idag
// Talet är alltid vitt och stapeln alltid grå: status står i ordet bredvid pricken (skillen).
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens'
import Sektion from '@/components/design/Sektion'
import { fmt } from '../_lib/format'
import type { SparKortVy } from '../_lib/kort'
import { Matare, RAD_KOLUMN } from './Lista'
import { StatusOrd } from './Status'

export default function SkotatSektion({ kort }: { kort: SparKortVy[] }) {
  const harPrognos = kort.some(k => k.prognosAndel != null)
  const not = harPrognos ? 'Ljust = skotat · mörkt = kommer till · strecket = idag' : kort.some(k => k.andel != null) ? 'Stapeln = skotat av beställt' : undefined
  return (
    <Sektion className="hk-grupp" rubrik="Skotat" not={not}>
      {kort.map(k => (
        <div key={k.typ} className="hk-rad" style={{ ...RAD_KOLUMN, gap: AVSTAND.s, padding: `${AVSTAND.l}px 0` }} data-spar={k.typ}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m }}>
            <span style={{ ...TYP.listtitel, color: FARG.text, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.namn}</span>
            <StatusOrd ton={k.ton} ord={k.ord} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s }}>
            <span style={{ ...TYP.tal, color: k.av == null ? FARG.text2 : FARG.text }} data-tal={k.typ}>{fmt(k.tal)}</span>
            {k.av != null && <span style={{ ...TYP.text, ...TNUM, color: FARG.text2 }}>av {fmt(k.av)}</span>}
          </div>
          {k.landar != null && <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }} data-landar={k.typ}>Landar på {fmt(k.landar)}</span>}
          {k.andel != null && <Matare andel={k.andel} planAndel={k.planAndel} prognosAndel={k.prognosAndel} />}
        </div>
      ))}
    </Sektion>
  )
}
