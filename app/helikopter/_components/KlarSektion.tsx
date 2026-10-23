'use client'

// NÄR BLIR MASKINERNA KLARA? — namn och datum, inget mer (klarRader i _lib/kort.ts). Orange prick + datum när det blir efter
// månadens sista arbetsdag; "ca" när datumet bygger på ett G15-förslag; "–" utan trakter; "?" när en trakt saknar prognos.
// Tryck på en maskin visar hennes trakter i ett ark.
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens'
import Rad from '@/components/design/Rad'
import Sektion from '@/components/design/Sektion'
import { RadLank } from '@/components/ui/RadGrupp'
import { klarNot, type KlarRad } from '../_lib/kort'
import { Prick } from './Status'

type Props = {
  rader: KlarRad[] | null
  fel: string | null
  laddar: boolean
  sistaArbetsdag: string | null
  onRetry: () => void
  onOppna: (r: KlarRad) => void
}

export default function KlarSektion({ rader, fel, laddar, sistaArbetsdag, onRetry, onOppna }: Props) {
  const rubrik = 'När blir maskinerna klara?'
  if (fel) {
    return (
      <Sektion rubrik={rubrik}>
        <RadLank orange text="Kunde inte räkna ut det" smakprov="försök igen" onClick={onRetry} sista />
      </Sektion>
    )
  }
  if (laddar || rader == null) {
    return (
      <Sektion rubrik={rubrik}>
        <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Räknar…</div>
      </Sektion>
    )
  }
  if (rader.length === 0) return null
  return (
    <Sektion rubrik={rubrik} not={sistaArbetsdag ? klarNot(sistaArbetsdag, rader) : undefined}>
      {rader.map((r, i) => (
        <Rad
          key={r.maskin_id}
          titel={r.namn}
          under={r.under ?? undefined}
          dampad={r.dampad}
          hoger={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.inuti, ...TNUM, color: r.dampad ? FARG.text3 : FARG.text }}>
              {r.orange && <Prick ton="orange" />}{r.hoger}
            </span>
          }
          onTryck={() => onOppna(r)}
          sista={i === rader.length - 1}
          attr={{ 'data-klar': r.maskin_id }}
        />
      ))}
    </Sektion>
  )
}
