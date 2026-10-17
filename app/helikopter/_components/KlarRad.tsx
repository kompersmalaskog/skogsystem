'use client'

// En rad i KLAR-listan: maskin (eller trakt) vänster, datum höger, trakternas namn under. Hela raden är en knapp (ListRad är inte tryckbar).
import { AVSTAND, FARG, TNUM, TYP, VIKT } from '@/lib/design/tokens'
import { RAD_KOLUMN } from './Lista'

const ELLIPS = { minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const

export type KlarHogerTon = 'normal' | 'orange' | 'muted'

export default function KlarRad({ namn, under, underTon = 'muted2', hoger, hogerTon = 'normal', onClick }: {
  namn: string
  under?: string | null
  /** `orange` för en trakt utan maskin; annars dämpad. */
  underTon?: 'muted2' | 'orange'
  hoger: string
  hogerTon?: KlarHogerTon
  onClick: () => void
}) {
  const hogerFarg = hogerTon === 'orange' ? FARG.orange : hogerTon === 'muted' ? FARG.text3 : FARG.text
  return (
    // `border: 'none'` FÖRE RAD_KOLUMN: knappens egen ram nollar annars raden under.
    <button type="button" className="hk-rad" onClick={onClick} style={{ border: 'none', ...RAD_KOLUMN, width: '100%', boxSizing: 'border-box', background: 'transparent', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.m }}>
        <span style={{ ...TYP.listtitel, color: FARG.text, ...ELLIPS }}>{namn}</span>
        <span style={{ ...TYP.text, ...TNUM, flexShrink: 0, color: hogerFarg, fontWeight: hogerTon === 'orange' ? VIKT.halvfet : VIKT.normal }}>{hoger}</span>
      </div>
      {under != null && under !== '' && <div style={{ ...TYP.meta, color: underTon === 'orange' ? FARG.orange : FARG.text2, ...ELLIPS }}>{under}</div>}
    </button>
  )
}
