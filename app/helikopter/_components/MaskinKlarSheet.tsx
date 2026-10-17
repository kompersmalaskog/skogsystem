'use client'

// En maskins trakter i ordning med från–till. Tryck på en trakt → "Byt maskin" för den.
import { Sheet } from '@/components/Sheet'
import { RadGrupp, RadLank } from '@/components/ui/RadGrupp'
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens'
import { fmtDag, kortNamn } from '../_lib/format'
import type { KlarRoll, MaskinPlan } from '../_lib/klar'

export default function MaskinKlarSheet({ open, onClose, plan, onTrakt }: { open: boolean; onClose: () => void; plan: MaskinPlan | null; onTrakt: (objektId: string, roll: KlarRoll) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={plan?.maskin.namn ?? 'Maskin'}>
      {plan && plan.rader.length === 0 ? (
        <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga trakter på maskinen.</div>
      ) : plan && (
        <RadGrupp bakgrund={FARG.upphojt} marginBottom={0}>
          {plan.rader.map(r => (
            <RadLank
              key={`${r.trakt.objekt_id}:${r.trakt.roll}`}
              text={kortNamn(r.trakt.namn)}
              hoger={{ text: r.fran && r.till ? (r.fran === r.till ? fmtDag(r.fran) : `${fmtDag(r.fran)} – ${fmtDag(r.till)}`) : '?', dampad: !(r.fran && r.till) }}
              onClick={() => onTrakt(r.trakt.objekt_id, r.trakt.roll)}
            />
          ))}
        </RadGrupp>
      )}
    </Sheet>
  )
}
