'use client'

// Produktion på objekt utan typ eller bolag: räknas inte på spåren. Rad per objekt
// med volym och "Öppna objekt" till Objektdetaljer (/redigering), där huvudtyp och
// bolag på dim_objekt rättas.
import { Fragment } from 'react'
import { Sheet } from '@/components/Sheet'
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens'
import { fmt, fmtDag, kortNamn } from '../_lib/format'
import type { UtanTypRad } from '../_lib/queries'
import { ListRad, RadGrupp, RadLank } from './Lista'

export default function UtanTypSheet({ open, onClose, rader, manadNamn }: { open: boolean; onClose: () => void; rader: UtanTypRad[]; manadNamn: string }) {
  const summa = rader.reduce((s, r) => s + r.volym, 0)
  return (
    <Sheet open={open} onClose={onClose} title="Utan typ eller bolag">
      <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.s }}>
        {fmt(summa)} m³fub i {manadNamn} räknas inte på något spår förrän typ och bolag är satta.
      </div>
      <RadGrupp>
        {rader.map(r => {
          const saknas = [r.huvudtyp ? null : 'typ', r.bolag ? null : 'bolag'].filter(Boolean).join(' och ')
          return (
            <Fragment key={r.objekt_id}>
              <ListRad
                namn={kortNamn(r.namn)}
                tal={<>{fmt(r.volym)}<span style={{ ...TYP.meta, color: FARG.text2 }}> m³fub</span></>}
                talTon="orange"
                under={`Saknar ${saknas} · skördat ${fmt(r.skordat)} · skotat ${fmt(r.skotat)}${r.senast_datum ? ` · senast ${fmtDag(r.senast_datum)}` : ''}`}
              />
              <RadLank text="Öppna objekt" href={`/redigering?objekt=${encodeURIComponent(r.objekt_id)}`} />
            </Fragment>
          )
        })}
      </RadGrupp>
      <div style={{ ...TYP.meta, color: FARG.text3 }}>Öppnas i Objektdetaljer, där typ och bolag sätts på maskindatans objekt.</div>
    </Sheet>
  )
}
