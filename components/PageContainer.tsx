import type { CSSProperties, ReactNode } from 'react'

export type SidBredd = 'smal' | 'bred' | 'full'

// ── EN KÄLLA TILL SANNING för kolumnbredderna ────────────────────────────
// Talet = maxbredd i px. Responsiviteten faller ut av width:100% + maxWidth:
//   • telefon (smalare än max) → fyller skärmen minus padding
//   • iPad/dator (bredare än max) → kapas och centreras (bekväm läsbredd)
// 'full' = ingen kolumn alls — vyn äger bredden själv (kartor/fullskärm).
const MAXBREDD = {
  smal: 560, // listor & formulär
  bred: 880, // dashboards, data, diagram
} as const

const SIDOPADDING = 'clamp(16px, 4vw, 24px)' // telefon 16 → dator 24

export default function PageContainer({
  width = 'smal',
  children,
  style,
}: {
  width?: SidBredd
  children: ReactNode
  /** För t.ex. paddingBottom (bottom-nav-clearance per vy). */
  style?: CSSProperties
}) {
  if (width === 'full') {
    return <div style={{ width: '100%', ...style }}>{children}</div>
  }
  return (
    <div
      style={{
        width: '100%',
        maxWidth: MAXBREDD[width],
        marginInline: 'auto',
        paddingInline: SIDOPADDING,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
