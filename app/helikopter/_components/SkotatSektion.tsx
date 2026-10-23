'use client'

// SKOTAT MOT BESTÄLLNING — ett block per spår, och EN siffra per spår: var skotat landar (sparKort i _lib/kort.ts).
//   rad 1: spårets namn · prick + ord (Under / Landar / Över / Nått …)
//   rad 2: talet (TYP.tal) "av beställt"
//   rad 3: grå stapel = skotat hittills, vitt streck = där ni borde vara idag
//   rad 4: en rad under (skördat landar / prognos från dag 4)
// Stapeln är alltid grå och talet alltid vitt: status står i ordet bredvid pricken (skillen).
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens'
import Sektion from '@/components/design/Sektion'
import { fmt } from '../_lib/format'
import type { SparKortVy } from '../_lib/kort'
import { Matare, RAD_KOLUMN } from './Lista'
import { StatusOrd } from './Status'

export default function SkotatSektion({ kort, forklaring }: { kort: SparKortVy[]; forklaring: boolean }) {
  return (
    <Sektion className="hk-grupp" rubrik="Skotat mot beställning" not={forklaring ? 'Talet = var ni landar · stapeln = hur långt ni kommit · strecket = idag' : undefined}>
      {kort.map(k => (
        <div key={k.typ} className="hk-rad" style={{ ...RAD_KOLUMN, gap: AVSTAND.s, padding: `${AVSTAND.l}px 0` }} data-spar={k.typ}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m }}>
            <span style={{ ...TYP.listtitel, color: FARG.text, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.namn}</span>
            <StatusOrd ton={k.ton} ord={k.ord} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s }}>
            <span style={{ ...TYP.tal, color: k.ton === 'dampad' && k.av == null ? FARG.text2 : FARG.text }} data-tal={k.typ}>{fmt(k.tal)}</span>
            {k.av != null && <span style={{ ...TYP.text, ...TNUM, color: FARG.text2 }}>av {fmt(k.av)}</span>}
          </div>
          {k.andel != null && <Matare andel={k.andel} planAndel={k.planAndel} />}
          {k.under && <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{k.under}</div>}
        </div>
      ))}
    </Sektion>
  )
}
