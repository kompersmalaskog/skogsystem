'use client'

// GÖR DETTA — högst tre rader på sidan (gorDetta i _lib/kort.ts), viktigast först. Orange prick = något att göra nu, dämpad = information.
// Finns fler står "N saker till" sist och öppnar hela listan i ett ark. Finns inget: inget kort.
import { AVSTAND, FARG } from '@/lib/design/tokens'
import Rad from '@/components/design/Rad'
import Sektion from '@/components/design/Sektion'
import { GOR_SYNLIGA, type GorRad } from '../_lib/kort'
import { Prick } from './Status'

export function GorRadVy({ r, sista, onTryck }: { r: GorRad; sista: boolean; onTryck: () => void }) {
  return (
    <Rad
      titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.inuti, color: FARG.text }}><Prick ton={r.orange ? 'orange' : 'dampad'} />{r.text}</span>}
      under={r.under ?? undefined}
      onTryck={onTryck}
      sista={sista}
      attr={{ 'data-gor': r.id }}
    />
  )
}

export default function GorDettaSektion({ rader, onOppna, onAlla }: { rader: GorRad[]; onOppna: (r: GorRad) => void; onAlla: () => void }) {
  if (rader.length === 0) return null
  const synliga = rader.length > GOR_SYNLIGA ? rader.slice(0, GOR_SYNLIGA) : rader
  const fler = rader.length - synliga.length
  return (
    <Sektion rubrik="Gör detta">
      {synliga.map((r, i) => <GorRadVy key={r.id} r={r} sista={fler === 0 && i === synliga.length - 1} onTryck={() => onOppna(r)} />)}
      {fler > 0 && <Rad titel={`${fler} ${fler === 1 ? 'sak' : 'saker'} till`} under={rader.slice(GOR_SYNLIGA).map(r => r.text).join(' · ')} onTryck={onAlla} sista attr={{ 'data-gor': 'alla' }} />}
    </Sektion>
  )
}
