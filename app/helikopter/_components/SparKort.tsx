'use client'

// Ett spår (gallring / slutavverkning) i Uppföljning: ETT stort tal (TYP.tal) i statusfärg, en mening, en 6 px mätare.
// Färg bara på det stora talet och mätaren; allt annat är text.
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens'
import { TYP_NAMN } from '../_lib/berakningar'
import { fmt } from '../_lib/format'
import type { Typ } from '../_lib/queries'
import { Matare } from './Lista'

export type Ton = 'gron' | 'orange' | 'neutral' | 'dampad'

export const TON_FARG: Record<Ton, string> = {
  gron: FARG.gron,
  orange: FARG.orange,
  neutral: FARG.text,
  dampad: FARG.text2,
}

/** "Gallring · **1 400 m³fub** till Vida och Södra" */
export function SparRubrik({ typ, bestallt, bolag }: { typ: Typ; bestallt: number; bolag: string[] }) {
  const till = bolag.length === 0 ? '' : bolag.length === 1 ? bolag[0] : `${bolag.slice(0, -1).join(', ')} och ${bolag[bolag.length - 1]}`
  return (
    <div style={{ ...TYP.text, color: FARG.text2, minWidth: 0 }}>
      <span style={{ ...TYP.listtitel, color: FARG.text }}>{TYP_NAMN[typ]}</span>
      {bestallt > 0 && <> · <span style={{ ...TYP.listtitel, color: FARG.text }}>{fmt(bestallt)} m³fub</span>{till && ` till ${till}`}</>}
    </div>
  )
}

/** Det stora talet — huvudsaken. `liten` = ett tillstånd i ord ("Inte startad"), inte ett tal: TYP.rubrik. */
export function StortTal({ text, ton = 'neutral', liten }: { text: string; ton?: Ton; liten?: boolean }) {
  return <div style={{ ...(liten ? TYP.rubrik : TYP.tal), ...TNUM, color: TON_FARG[ton], margin: `${AVSTAND.m}px 0 ${AVSTAND.s}px` }}>{text}</div>
}

/** Skotat mot beställt: 6 px, fylld i statusfärgen, planstreck vid plan idag. Inga siffror under. */
export function StapelEnkel({ bestallt, skotat, plan, farg }: { bestallt: number; skotat: number; plan?: number | null; farg: string }) {
  const max = Math.max(bestallt, 1)
  return (
    <div style={{ marginTop: AVSTAND.m }}>
      <Matare andel={skotat / max} planAndel={plan != null && plan > 0 ? plan / max : null} farg={farg} />
    </div>
  )
}
