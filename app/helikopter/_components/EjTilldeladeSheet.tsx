'use client'

// "Ej tilldelade": månadens objekt som saknar skördare eller skotare (och utförare).
import Link from 'next/link'
import { Sheet } from '@/components/Sheet'
import { T } from '@/lib/utbildning'
import { TYP_NAMN } from '../_lib/berakningar'
import { fmt, kortNamn } from '../_lib/format'
import type { PlaneringObjekt, Typ } from '../_lib/queries'
import { ListRad } from './Lista'
import { knapp } from './Tillstand'

export default function EjTilldeladeSheet({ open, onClose, objekt, ar, manad }: { open: boolean; onClose: () => void; objekt: PlaneringObjekt[]; ar: number; manad: number }) {
  return (
    <Sheet open={open} onClose={onClose} title="Ej tilldelade">
      {objekt.length === 0 ? (
        <div style={{ fontSize: 15, color: T.t2, padding: '12px 0', fontFamily: T.ff }}>Alla månadens objekt har skördare och skotare.</div>
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
      <Link href={`/objekt?ar=${ar}&manad=${manad}`} style={{ ...knapp, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 16, textDecoration: 'none' }}>Öppna objektlistan</Link>
    </Sheet>
  )
}
