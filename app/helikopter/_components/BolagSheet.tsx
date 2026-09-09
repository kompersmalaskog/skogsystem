'use client'

// Bolagsrader för ett spår: lovat / skördat / skotat / prognos — och CSV på exakt samma tal.
import { Sheet } from '@/components/Sheet'
import { T } from '@/lib/utbildning'
import { TYP_NAMN, prognosPerBolag } from '../_lib/berakningar'
import { MANAD_NAMN, fmt } from '../_lib/format'
import type { BolagRad, Typ } from '../_lib/queries'
import { knapp } from './Tillstand'

type Props = {
  open: boolean
  onClose: () => void
  typ: Typ
  rader: BolagRad[]
  laddar?: boolean
  fel?: string | null
  onRetry?: () => void
  kvar: number
  harPrognos: boolean
  ar: number
  manad: number
}

type Rad = { bolag: string; lovat: number; skordat: number; skotat: number; prognos: number }

function bygg(rader: BolagRad[], kvar: number, harPrognos: boolean): Rad[] {
  return rader
    .map(r => ({ bolag: r.bolag ?? 'Okänt', lovat: r.lovat, skordat: r.skordat, skotat: r.skotat, prognos: prognosPerBolag(r, kvar, harPrognos) }))
    .sort((a, b) => b.lovat - a.lovat || b.skotat - a.skotat)
}

export default function BolagSheet({ open, onClose, typ, rader, laddar, fel, onRetry, kvar, harPrognos, ar, manad }: Props) {
  const lista = bygg(rader, kvar, harPrognos)
  const filnamn = `helikopter-${TYP_NAMN[typ].toLowerCase()}-${ar}-${String(manad).padStart(2, '0')}.csv`

  const csv = () => {
    const esc = (v: string | number) => {
      const s = String(v)
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = [
      ['Bolag', 'Typ', 'År', 'Månad', 'Lovat_m3fub', 'Skordat_m3fub', 'Skotat_m3fub', 'Prognos_skotat_m3fub'].join(';'),
      ...lista.map(r => [r.bolag, TYP_NAMN[typ], ar, manad, Math.round(r.lovat), Math.round(r.skordat), Math.round(r.skotat), Math.round(r.prognos)].map(esc).join(';')),
    ]
    return '﻿' + rows.join('\n')
  }

  const exportera = async () => {
    const blob = new Blob([csv()], { type: 'text/csv;charset=utf-8;' })
    const navAny = navigator as any
    // iOS: dela-arket tar filer; nedladdningslänkar fungerar dåligt i standalone-PWA.
    if (typeof File !== 'undefined' && navAny.canShare) {
      const fil = new File([blob], filnamn, { type: 'text/csv' })
      if (navAny.canShare({ files: [fil] })) {
        try { await navAny.share({ files: [fil], title: filnamn }); return } catch { /* avbruten — falla tillbaka */ }
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filnamn
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Sheet open={open} onClose={onClose} title={`${TYP_NAMN[typ]} · ${MANAD_NAMN[manad - 1]}`}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 8, fontSize: 11, color: T.t2, textTransform: 'uppercase', letterSpacing: 0.2, padding: '0 0 8px', fontFamily: T.ff }}>
        <span>Bolag</span><span style={{ textAlign: 'right' }}>Lovat</span><span style={{ textAlign: 'right' }}>Skördat</span><span style={{ textAlign: 'right' }}>Skotat</span><span style={{ textAlign: 'right' }}>Prognos</span>
      </div>
      {fel ? (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.t1, marginBottom: 12, fontFamily: T.ff }}>Kunde inte läsa bolag – försök igen</div>
          {onRetry && <button type="button" onClick={onRetry} style={knapp}>Försök igen</button>}
        </div>
      ) : laddar ? (
        <div style={{ fontSize: 15, color: T.t2, padding: '12px 0', fontFamily: T.ff }}>Laddar bolag…</div>
      ) : lista.length === 0 && <div style={{ fontSize: 15, color: T.t2, padding: '12px 0', fontFamily: T.ff }}>Inga bolag med produktion eller beställning den här månaden.</div>}
      {lista.map(r => (
        <div key={r.bolag} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 8, minHeight: 44, alignItems: 'center', borderTop: `1px solid ${T.sep}`, fontSize: 15, fontFamily: T.ff, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: T.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.bolag}</span>
          <span style={{ textAlign: 'right', color: T.t2 }}>{r.lovat > 0 ? fmt(r.lovat) : '–'}</span>
          <span style={{ textAlign: 'right', color: T.t2 }}>{fmt(r.skordat)}</span>
          <span style={{ textAlign: 'right', color: T.t1 }}>{fmt(r.skotat)}</span>
          <span style={{ textAlign: 'right', color: T.t2 }}>{harPrognos ? fmt(r.prognos) : '–'}</span>
        </div>
      ))}
      <div style={{ fontSize: 12, color: T.t2, marginTop: 10, fontFamily: T.ff }}>m³fub. Prognos = bolagets skotat + bolagets takt × arbetsdagar kvar.</div>
      <button type="button" onClick={exportera} style={{ ...knapp, width: '100%', marginTop: 16 }}>Ladda ner CSV</button>
    </Sheet>
  )
}
