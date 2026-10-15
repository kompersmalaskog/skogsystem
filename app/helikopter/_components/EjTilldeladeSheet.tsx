'use client'

// "Ej tilldelade": månadens objekt som saknar skördare eller skotare (och utförare).
import { Sheet } from '@/components/Sheet'
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens'
import { TYP_NAMN } from '../_lib/berakningar'
import { fmt, kortNamn } from '../_lib/format'
import type { PlaneringObjekt, Typ } from '../_lib/queries'
import { ListRad, RadGrupp, RadLank } from './Lista'

export default function EjTilldeladeSheet({ open, onClose, objekt, ar, manad }: { open: boolean; onClose: () => void; objekt: PlaneringObjekt[]; ar: number; manad: number }) {
  return (
    <Sheet open={open} onClose={onClose} title="Ej tilldelade">
      <RadGrupp>
        {objekt.length === 0 ? (
          <div className="hk-rad" style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0`, borderBottom: `1px solid ${FARG.linje}` }}>Alla månadens objekt har skördare och skotare.</div>
        ) : (
          objekt.map(o => {
            const saknar: string[] = []
            if (!o.skordare_maskin_id && !o.skordare_utforare) saknar.push('skördare')
            if (!o.skotare_maskin_id && !o.skotare_utforare) saknar.push('skotare')
            const typ = (o.typ === 'gallring' || o.typ === 'slutavverkning') ? TYP_NAMN[o.typ as Typ] : o.typ
            return (
              <ListRad
                key={o.objekt_id}
                namn={kortNamn(o.namn ?? o.vo_nummer)}
                tal={o.volym != null ? `${fmt(o.volym)} m³fub` : 'volym saknas'}
                talTon={o.volym != null ? 'normal' : 'muted'}
                under={`${typ} · saknar ${saknar.join(' och ')}`}
              />
            )
          })
        )}
        <RadLank text="Öppna objektlistan" href={`/objekt?ar=${ar}&manad=${manad}`} />
      </RadGrupp>
    </Sheet>
  )
}
