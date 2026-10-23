'use client'

// BEHÖVER DIG — en rad per sak som kräver en människa (behoverDig i _lib/kort.ts). Finns bara när det finns något.
// Varje rad: orange prick + vad som hänt, en rad under som säger varför, tryck öppnar det ark som visar mer.
import { AVSTAND, FARG } from '@/lib/design/tokens'
import Rad from '@/components/design/Rad'
import Sektion from '@/components/design/Sektion'
import type { BehovRad } from '../_lib/kort'
import { Prick } from './Status'

export default function BehoverDigSektion({ rader, onOppna }: { rader: BehovRad[]; onOppna: (r: BehovRad) => void }) {
  if (rader.length === 0) return null
  return (
    <Sektion rubrik="Behöver dig">
      {rader.map((r, i) => (
        <Rad
          key={r.id}
          titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.inuti, color: FARG.text }}><Prick ton="orange" />{r.text}</span>}
          under={r.under ?? undefined}
          onTryck={() => onOppna(r)}
          sista={i === rader.length - 1}
          attr={{ 'data-behov': r.id }}
        />
      ))}
    </Sektion>
  )
}
