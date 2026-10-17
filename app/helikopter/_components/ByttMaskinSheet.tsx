'use client'

// "Byt maskin" för en trakt och roll: en rad per maskin som klarar typen, med HENNES klar-datum om hon får trakten (allt annat oförändrat).
// Ett tryck sparar valet — ingen bekräftelse; vyn räknas om. Den nuvarande maskinen är markerad.
import { useState } from 'react'
import { Sheet } from '@/components/Sheet'
import Ikon from '@/components/design/Ikon'
import { AVSTAND, FARG, KORT, RAD, TNUM, TYP, VIKT } from '@/lib/design/tokens'
import { fmtDag, kortNamn } from '../_lib/format'
import { ROLL_NAMN, valForTrakt, type KlarData, type KlarRoll } from '../_lib/klar'

type Props = {
  open: boolean
  onClose: () => void
  data: KlarData
  objektId: string
  roll: KlarRoll
  /** Sparar valet och räknar om vyn; ett fel kommer tillbaka som text. */
  onValj: (maskinId: string) => Promise<string | null>
}

export default function ByttMaskinSheet({ open, onClose, data, objektId, roll, onValj }: Props) {
  const [sparar, setSparar] = useState<string | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const trakt = data.trakter.find(t => t.objekt_id === objektId && t.roll === roll)
  const rader = valForTrakt(data, objektId, roll)

  const valj = async (maskinId: string) => {
    setSparar(maskinId)
    setFel(null)
    const e = await onValj(maskinId)
    setSparar(null)
    if (e) setFel(e)
  }

  return (
    <Sheet open={open} onClose={onClose} title={`${trakt ? kortNamn(trakt.namn) : 'Trakt'} · ${ROLL_NAMN[roll]}`}>
      {rader.length === 0 ? (
        <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Ingen maskin klarar den här trakten.</div>
      ) : (
        <div style={{ ...KORT, padding: 0, background: FARG.upphojt, overflow: 'hidden' }}>
          {rader.map((r, i) => {
            const hoger = r.saknar ? '?' : r.klar ? fmtDag(r.klar) : '–'
            return (
              <button
                key={r.maskin.maskin_id}
                type="button"
                disabled={sparar != null}
                aria-current={r.nuvarande ? 'true' : undefined}
                onClick={() => (r.nuvarande ? onClose() : valj(r.maskin.maskin_id))}
                style={{
                  border: 'none', ...RAD, width: '100%', boxSizing: 'border-box', padding: `${AVSTAND.m}px ${AVSTAND.l}px`, background: 'transparent',
                  borderBottom: i === rader.length - 1 ? 'none' : RAD.borderBottom, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
                  justifyContent: 'space-between', ...TYP.text, color: FARG.text,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, minWidth: 0 }}>
                  <span style={{ fontWeight: r.nuvarande ? VIKT.halvfet : VIKT.normal, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.maskin.namn}</span>
                  {r.nuvarande && <Ikon namn="check" farg={FARG.text2} />}
                </span>
                <span style={{ ...TNUM, flexShrink: 0, color: r.efterManad ? FARG.orange : r.saknar || !r.klar ? FARG.text3 : FARG.text, fontWeight: r.efterManad ? VIKT.halvfet : VIKT.normal }}>
                  {sparar === r.maskin.maskin_id ? 'Sparar…' : hoger}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {fel && <div role="alert" style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.m }}>Kunde inte byta maskin: {fel}</div>}
    </Sheet>
  )
}
