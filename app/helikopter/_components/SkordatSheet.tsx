'use client'

// Arket "Skördat" (ur Mer): skördaren per spår — hittills av beställt med stapel, var det landar, och oskotat just nu.
// Sidan visar bara skotat (det som räknas mot beställningen); skördat ligger här ett tryck bort.
import { Sheet } from '@/components/Sheet'
import Sektion from '@/components/design/Sektion'
import { TYP_NAMN, landarRoller, type ManadStatus, type SparLage } from '../_lib/berakningar'
import { fmt } from '../_lib/format'
import { ListRad } from './Lista'

export default function SkordatSheet({ open, onClose, spar, status }: { open: boolean; onClose: () => void; spar: SparLage[]; status: ManadStatus }) {
  return (
    <Sheet open={open} onClose={onClose} title="Skördat">
      <Sektion className="hk-grupp" rubrik="Skördat mot beställning" kort={false}>
        {spar.map(s => {
          const harBest = s.bestallt > 0
          const roller = status === 'pagaende' ? landarRoller(s) : null
          const under = [
            roller ? `Landar ${fmt(roller[0].landar)}` : null,
            `Oskotat ${fmt(s.oskotat)}`,
          ].filter(Boolean).join(' · ')
          return (
            <ListRad
              key={s.typ}
              namn={TYP_NAMN[s.typ]}
              tal={fmt(s.skordat)}
              av={harBest ? fmt(s.bestallt) : undefined}
              andel={harBest ? s.skordat / s.bestallt : undefined}
              planAndel={harBest && s.plan > 0 ? s.plan / s.bestallt : null}
              under={under}
            />
          )
        })}
      </Sektion>
    </Sheet>
  )
}
