'use client'

// "Hur går det per bolag?": ett kort per bolag — skotat av beställt, en stapel och ett ord. CSV:n har fortfarande alla fyra talen (lovat, skördat, skotat, prognos).
import { Sheet } from '@/components/Sheet'
import { AVSTAND, FARG, KNAPP, TNUM, TYP } from '@/lib/design/tokens'
import Rad from '@/components/design/Rad'
import Sektion from '@/components/design/Sektion'
import { TYP_NAMN, prognosPerBolag } from '../_lib/berakningar'
import { MANAD_NAMN } from '../_lib/format'
import { bolagVy } from '../_lib/bolagText'
import { Matare } from './Lista'
import type { BolagRad, Typ } from '../_lib/queries'

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
      {fel ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l, textAlign: 'center', padding: `${AVSTAND.m}px 0` }}>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>Kunde inte läsa bolag – försök igen</div>
          {onRetry && <button type="button" onClick={onRetry} style={KNAPP.sekundar}>Försök igen</button>}
        </div>
      ) : laddar ? (
        <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Laddar bolag…</div>
      ) : lista.length === 0 ? (
        <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga bolag med produktion eller beställning den här månaden.</div>
      ) : (
        <Sektion rubrik={`Skotat av beställt i ${MANAD_NAMN[manad - 1]}`} kort={false} not={`m³fub. Beställt = det bolaget bett oss leverera.${harPrognos ? ' "Ser ut att bli" = skotat hittills + bolagets takt × arbetsdagar kvar.' : ''}`}>
          {lista.map((r, i) => {
            const v = bolagVy(r, harPrognos)
            const farg = v.ton === 'brist' ? FARG.orange : v.ton === 'bra' ? FARG.gron : FARG.text2
            return (
              <Rad
                key={r.bolag}
                titel={r.bolag}
                hoger={<span style={TNUM}>{v.hoger}</span>}
                under={<>
                  {v.andel != null && <div style={{ marginBottom: AVSTAND.s }}><Matare andel={v.andel} prognosAndel={v.prognosAndel} farg={FARG.text} /></div>}
                  <span style={{ color: farg, fontWeight: v.ton === 'neutral' ? 400 : 600 }}>{v.ord}</span>
                </>}
                sista={i === lista.length - 1}
                attr={{ 'data-bolag': r.bolag }}
              />
            )
          })}
        </Sektion>
      )}
      <button type="button" onClick={exportera} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.l }}>Ladda ner CSV</button>
    </Sheet>
  )
}
