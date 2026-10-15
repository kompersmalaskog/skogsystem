// Material Symbols Outlined — appens sätt (fonten laddas i app/layout.tsx). Storlek ur IKON: `rad` i en rad, `text` i löptext.
import { FARG, IKON } from '@/lib/design/tokens'

export function Ikon({ namn, storlek = IKON.rad, farg = FARG.text2 }: { namn: string; storlek?: number; farg?: string }) {
  return (
    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: storlek, color: farg, lineHeight: 1, flexShrink: 0, userSelect: 'none' }}>
      {namn}
    </span>
  )
}
