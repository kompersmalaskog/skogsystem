import type { ReactNode } from 'react'
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens'

// Diskret markering av ett special-objekt (vindfällor, stormskadat) där det listas i maskinvyn.
// Ordet "Special" står alltid i text — färgen bär inget ensam. Skälet ligger i title/aria-label.
export function SpecialBadge({ skal }: { skal?: string | null }) {
  const forklaring = skal ? `Special-objekt: ${skal}` : 'Special-objekt'
  return (
    <span
      data-special-badge
      title={forklaring}
      aria-label={forklaring}
      style={{
        ...TYP.micro, flexShrink: 0,
        color: FARG.text2, background: FARG.tonad, borderRadius: RADIE.rad,
        padding: `${AVSTAND.xs}px ${AVSTAND.s}px`,
      }}
    >Special</span>
  )
}

/** Objektnamn med en eventuell Special-badge. `special` = finns i mappen namn → skäl. */
export function ObjektNamn({ namn, special, skal, children }: {
  namn: string; special?: boolean; skal?: string | null; children?: ReactNode
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, minWidth: 0, maxWidth: '100%' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{namn}</span>
      {special && <SpecialBadge skal={skal} />}
      {children}
    </span>
  )
}
