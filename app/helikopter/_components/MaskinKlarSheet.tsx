'use client'

// Ark med en lista trakter som man trycker på för att byta maskin: en maskins trakter med från–till, eller trakterna som saknar maskin.
import { Sheet } from '@/components/Sheet'
import { RadGrupp, RadLank } from '@/components/ui/RadGrupp'
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens'

export type KlarArkRad = { id: string; text: string; hoger: string; dampad?: boolean }

export default function MaskinKlarSheet({ open, onClose, titel, rader, tomText, onRad }: {
  open: boolean
  onClose: () => void
  titel: string
  rader: KlarArkRad[]
  tomText: string
  onRad: (id: string) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={titel}>
      {rader.length === 0 ? (
        <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>{tomText}</div>
      ) : (
        <RadGrupp bakgrund={FARG.upphojt} marginBottom={0}>
          {rader.map(r => (
            <RadLank key={r.id} text={r.text} hoger={{ text: r.hoger, dampad: r.dampad }} onClick={() => onRad(r.id)} />
          ))}
        </RadGrupp>
      )}
    </Sheet>
  )
}
