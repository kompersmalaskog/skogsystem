'use client'

// Produktion på objekt utan typ eller bolag: räknas inte på spåren. Rad per objekt
// med volym och "Öppna objekt" till Objektdetaljer (/redigering), där huvudtyp och
// bolag på dim_objekt rättas.
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Sheet } from '@/components/Sheet'
import { T } from '@/lib/utbildning'
import { fmt, fmtDag, kortNamn } from '../_lib/format'
import type { UtanTypRad } from '../_lib/queries'
import { KANT, TEXT_MUTED } from './Lista'

export default function UtanTypSheet({ open, onClose, rader, manadNamn }: { open: boolean; onClose: () => void; rader: UtanTypRad[]; manadNamn: string }) {
  const summa = rader.reduce((s, r) => s + r.volym, 0)
  return (
    <Sheet open={open} onClose={onClose} title="Utan typ eller bolag">
      <div style={{ fontSize: 14, color: T.t2, marginBottom: 6, fontFamily: T.ff }}>
        {fmt(summa)} m³fub i {manadNamn} räknas inte på något spår förrän typ och bolag är satta.
      </div>
      {rader.map(r => {
        const saknas = [r.huvudtyp ? null : 'typ', r.bolag ? null : 'bolag'].filter(Boolean).join(' och ')
        return (
          <div key={r.objekt_id} style={{ padding: '12px 0', borderTop: KANT, fontFamily: T.ff }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: T.t1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kortNamn(r.namn)}</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: T.orange, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.volym)} <span style={{ color: T.t2, fontWeight: 400 }}>m³fub</span></span>
            </div>
            <div style={{ fontSize: 13, color: T.t2, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              Saknar {saknas} · skördat {fmt(r.skordat)} · skotat {fmt(r.skotat)}{r.senast_datum ? ` · senast ${fmtDag(r.senast_datum)}` : ''}
            </div>
            <Link
              href={`/redigering?objekt=${encodeURIComponent(r.objekt_id)}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginTop: 4, color: T.blue, fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
            >
              <span>Öppna objekt</span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </div>
        )
      })}
      <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 10, fontFamily: T.ff }}>Öppnas i Objektdetaljer, där typ och bolag sätts på maskindatans objekt.</div>
    </Sheet>
  )
}
