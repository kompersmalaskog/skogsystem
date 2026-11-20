// Material Symbols Outlined — appens sätt (fonten laddas i app/layout.tsx). EN komponent för alla vyer.
// Storlek ur IKON: `rad` (22) i en rad, `text` (18) i löptext. Färg ur FARG; `farg="inherit"` följer omgivande text.
import { FARG, IKON } from '@/lib/design/tokens'

type Props = {
  namn: string
  storlek?: number
  farg?: string
  /** Vänd 90° (en pil som fälls upp/ned). */
  vrid?: boolean
  /** Fylld variant ('FILL' 1). */
  fylld?: boolean
}

export default function Ikon({ namn, storlek = IKON.rad, farg = FARG.text2, vrid, fylld }: Props) {
  return (
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={{
        fontSize: storlek, color: farg, lineHeight: 1, flexShrink: 0, userSelect: 'none',
        transform: vrid ? 'rotate(90deg)' : undefined,
        fontVariationSettings: fylld ? "'FILL' 1" : undefined,
      }}
    >
      {namn}
    </span>
  )
}
