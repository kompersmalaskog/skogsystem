'use client'

// "Mot beställning": per spår beställt, planerat (ca, bolagskorrigerat), saknas — och objekten.
import { Sheet } from '@/components/Sheet'
import { T } from '@/lib/utbildning'
import { MIN_HISTORIK_OBJEKT, TYPER, TYP_NAMN, type PlaneratResultat, type SparLage } from '../_lib/berakningar'
import { fmt, kortNamn } from '../_lib/format'
import type { Avvikelse, PlaneringObjekt, Typ } from '../_lib/queries'
import { ListRad, Sektion, TEXT_MUTED } from './Lista'

type Props = {
  open: boolean
  onClose: () => void
  plan: Record<Typ, PlaneratResultat>
  spar: SparLage[]
  objekt: PlaneringObjekt[]
  avvikelse: Avvikelse[]
}

export default function MotBestallningSheet({ open, onClose, plan, spar, objekt, avvikelse }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Mot beställning">
      {TYPER.map(typ => {
        const p = plan[typ]
        const bestallt = spar.find(s => s.typ === typ)?.bestallt ?? 0
        const iTyp = objekt.filter(o => o.typ === typ)
        const just = p.justeringProcent
        return (
          <Sektion key={typ} rubrik={TYP_NAMN[typ]}>
            <ListRad namn="Beställt" tal={bestallt > 0 ? fmt(bestallt) : '–'} talTon={bestallt > 0 ? 'normal' : 'muted'} />
            <ListRad
              namn="Planerat"
              tal={`ca ${fmt(p.korrigerat)}`}
              under={`${p.antalObjekt} objekt · ${fmt(p.planerat)} enligt objekten${just != null ? ` · justerad ${just > 0 ? '+' : ''}${just} % efter bolagets historik` : ` · ingen historik (${MIN_HISTORIK_OBJEKT} avslutade krävs)`}`}
            />
            {bestallt > 0 && (
              <ListRad
                namn={p.saknas > 0 ? 'Saknas' : 'Täcker beställningen'}
                tal={p.saknas > 0 ? fmt(p.saknas) : p.gap < 0 ? `+${fmt(-p.gap)}` : ''}
                talTon={p.saknas > 0 ? 'orange' : 'normal'}
                under={p.saknas > 0 ? 'Planera in fler objekt' : p.gap > 0 ? `${fmt(p.gap)} under beställt, inom bolagets spridning` : undefined}
              />
            )}
            {iTyp.map(o => (
              <ListRad
                key={o.objekt_id}
                namn={kortNamn(o.namn ?? o.vo_nummer)}
                tal={o.volym != null && o.volym > 0 ? fmt(o.volym) : 'volym saknas'}
                talTon={o.volym != null && o.volym > 0 ? 'normal' : 'muted'}
                under={o.bolag ? `${o.bolag}${o.status ? ` · ${o.status}` : ''}` : 'bolag saknas · räknas inte'}
                underMuted={!o.bolag}
              />
            ))}
          </Sektion>
        )
      })}
      <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 12, fontFamily: T.ff }}>m³fub · planerat = objektens volym × bolagets verkliga/planerade kvot ({avvikelse.map(a => `${a.bolag} ${a.typ === 'gallring' ? 'gall' : 'slut'} ${a.medel_kvot.toFixed(2)}`).join(', ') || 'ingen historik'})</div>
    </Sheet>
  )
}
