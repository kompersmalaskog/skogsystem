'use client'

// EGEN SKOTNING — en egen rubrik, inget annat (Martin 2026-10-25): en rad per objekt där markägaren skotar själv, med
// skördat i månaden som tal. Räknas aldrig mot beställningen, takten eller prognosen (egenSkotningVy i _lib/kort.ts).
// Finns inget sådant objekt i månaden finns inget kort. Gick läsningen inte är det ett fel med Försök igen — aldrig "inget".
import { TNUM, TYP, FARG } from '@/lib/design/tokens'
import Rad from '@/components/design/Rad'
import Sektion from '@/components/design/Sektion'
import { RadLank } from '@/components/ui/RadGrupp'
import { EGEN_SKOTNING_NOT, type EgenSkotningVy } from '../_lib/kort'

export default function EgenSkotningSektion({ rader, onRetry }: { rader: EgenSkotningVy[] | null; onRetry: () => void }) {
  const rubrik = 'Egen skotning'
  if (rader == null) {
    return (
      <Sektion rubrik={rubrik}>
        <RadLank orange text="Kunde inte läsa egen skotning" smakprov="försök igen" onClick={onRetry} sista />
      </Sektion>
    )
  }
  if (rader.length === 0) return null
  return (
    <Sektion rubrik={rubrik} not={EGEN_SKOTNING_NOT}>
      {rader.map((r, i) => (
        <Rad
          key={r.objekt_id}
          titel={r.namn}
          under={r.under}
          hoger={<span style={{ ...TYP.text, ...TNUM, color: FARG.text }}>{r.tal}</span>}
          sista={i === rader.length - 1}
          attr={{ 'data-egen-skotning': r.objekt_id }}
        />
      ))}
    </Sektion>
  )
}
