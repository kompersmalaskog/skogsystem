'use client'

// KLAR — ett datum per maskin: när hon är klar med sina trakter (helikopter_ny_klar, klarRader i _lib/kort.ts).
// Orange prick + datum när det blir efter månadens sista arbetsdag; "–" utan trakter; "?" när en trakt saknar prognos.
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens'
import Rad from '@/components/design/Rad'
import Sektion from '@/components/design/Sektion'
import { RadLank } from '@/components/ui/RadGrupp'
import { fmtDag } from '../_lib/format'
import type { KlarRad } from '../_lib/kort'
import { Prick } from './Status'

type Props = {
  rader: KlarRad[] | null
  fel: string | null
  laddar: boolean
  sistaArbetsdag: string | null
  onRetry: () => void
}

export default function KlarSektion({ rader, fel, laddar, sistaArbetsdag, onRetry }: Props) {
  if (fel) {
    return (
      <Sektion rubrik="Klar">
        <RadLank orange text="Kunde inte läsa när maskinerna blir klara" smakprov="försök igen" onClick={onRetry} sista />
      </Sektion>
    )
  }
  if (laddar || rader == null) {
    return (
      <Sektion rubrik="Klar">
        <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Räknar…</div>
      </Sektion>
    )
  }
  if (rader.length === 0) return null
  return (
    <Sektion rubrik="Klar" not={sistaArbetsdag ? `Månadens sista arbetsdag är ${fmtDag(sistaArbetsdag)}` : undefined}>
      {rader.map((r, i) => (
        <Rad
          key={r.maskin_id}
          titel={r.namn}
          under={r.under ?? (r.dampad ? 'Inget planerat' : undefined)}
          hoger={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.inuti, ...TNUM, color: r.dampad ? FARG.text3 : FARG.text }}>
              {r.orange && <Prick ton="orange" />}{r.hoger}
            </span>
          }
          hogerUnder={r.orange ? 'efter månaden' : undefined}
          sista={i === rader.length - 1}
          attr={{ 'data-klar': r.maskin_id }}
        />
      ))}
    </Sektion>
  )
}
