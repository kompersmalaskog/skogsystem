'use client'

import { useEffect, useState } from 'react'
import {
  C, FONT, fmtSv, fetchData,
  HeroCard, KpiList, TimeDistribution, AvbrottCard, initials,
  type Maskin, type Period, type Data, type Operator,
} from './OversiktShared'

/**
 * Operatör-djupvy. Glider in från höger ovanpå OversiktNy med en
 * tillbaka-knapp som glider tillbaka. Stänger via onClose.
 *
 * STEG 1 — FORM
 * Visar förarens grundsiffror för vald period (samma period som
 * Översikt har valt — ingen egen period-nav här).
 *
 * INTE än:
 *  - Jämförelse mot maskinens snitt (delta-fält → "—")
 *  - Förarens egen 6-perioders trend (series → null → "För lite
 *    trenddata"-platshållare)
 * Det kommer i nästa steg, samma pattern som 2a/2b.
 */
export default function OperatorDeepView({
  maskin, period, offset, periodLabel, operator, onClose,
}: {
  maskin: Maskin
  period: Period
  offset: number
  periodLabel: string
  operator: Operator
  onClose: () => void
}) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [shown, setShown] = useState(false)

  // Slide-in: mountas med translateX(100%), animerar till 0.
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 10)
    return () => window.clearTimeout(t)
  }, [])

  // Stäng med animation: slide ut → onClose när animation klar.
  const handleClose = () => {
    setShown(false)
    window.setTimeout(onClose, 280)
  }

  // Hämta förarens period-data (operator_id-filter på prod/tid/avbrott)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const dates = (() => {
      // Återanvänd samma datumberäkning som Översikt har gjort
      // — vi får periodLabel som prop men behöver också start/end.
      // Importera getPeriodRange från shared.
      // (gjort statiskt-import i toppen redan? Nej — kallas inte här.
      //  Vi gör en lättare beräkning via period+offset.)
      // — Enklast: gör beräkningen lokalt.
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      if (period === 'V') {
        const day = now.getDay() || 7
        const mon = new Date(now); mon.setDate(now.getDate() - day + 1 + offset * 7)
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
        return { start: fmt(mon), end: fmt(sun) }
      }
      if (period === 'K') {
        const curQ = Math.floor(now.getMonth() / 3)
        const totalQ = now.getFullYear() * 4 + curQ + offset
        const year = Math.floor(totalQ / 4)
        const qIdx = ((totalQ % 4) + 4) % 4
        return { start: fmt(new Date(year, qIdx * 3, 1)), end: fmt(new Date(year, qIdx * 3 + 3, 0)) }
      }
      if (period === 'Å') {
        const y = now.getFullYear() + offset
        return { start: `${y}-01-01`, end: `${y}-12-31` }
      }
      return {
        start: fmt(new Date(now.getFullYear(), now.getMonth() + offset, 1)),
        end:   fmt(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)),
      }
    })()

    fetchData(maskin.id, dates.start, dates.end, operator.id)
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [maskin.id, period, offset, operator.id])

  // Stäng på Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      role="dialog"
      aria-label={`Förare: ${operator.namn}`}
      style={{
        position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
        overflow: 'auto', background: C.bg, color: C.text,
        fontFamily: FONT, fontFeatureSettings: '"tnum"',
        transform: shown ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
        zIndex: 200,
      }}
    >
      {/* Sticky topbar: tillbaka-knapp */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: C.bg,
        borderBottom: `0.5px solid ${C.divider}`,
        padding: '10px 12px',
      }}>
        <button
          onClick={handleClose}
          style={{
            background: 'transparent', border: 'none',
            color: C.blue, fontFamily: FONT,
            fontSize: 16, fontWeight: 400, letterSpacing: -0.2,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
            gap: 2, padding: '6px 8px', minHeight: 36,
          }}
          aria-label="Tillbaka till Översikt"
        >
          <span style={{ fontSize: 22, lineHeight: 1, marginRight: 2 }}>‹</span>
          Översikt
        </button>
      </div>

      {/* Header: avatar + namn + meta */}
      <div style={{
        maxWidth: 720, margin: '0 auto', padding: '20px 16px 8px',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 26,
          background: 'rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 17, fontWeight: 600, color: C.text, flexShrink: 0,
        }}>
          {initials(operator.namn)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 22, fontWeight: 600, color: C.text,
            letterSpacing: -0.4, lineHeight: 1.15,
          }}>
            {operator.namn}
          </div>
          <div style={{
            fontSize: 12, color: C.muted, marginTop: 4,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {periodLabel}
            <span style={{ color: C.dim }}> · </span>
            {loading ? '—' : `${fmtSv(data?.g15h ?? 0, 0)} G15h`}
            <span style={{ color: C.dim }}> · </span>
            {loading ? '—' : `${data?.dagar ?? 0} ${(data?.dagar ?? 0) === 1 ? 'dag' : 'dagar'}`}
          </div>
        </div>
      </div>

      {/* Innehåll — återanvänder samma kort som Översikt */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '8px 16px 80px' }}>
        <HeroCard
          label="Produktivitet"
          unit="m³/G15h"
          dec={1}
          value={data?.produktivitet ?? null}
          prev={null}        // jämförelse mot maskinens snitt = kommer senare
          series={null}      // förarens 6-perioders trend = kommer senare
          loading={loading}
        />
        <KpiList
          data={data}
          prev={null}        // delta = platshållare än
          series={null}      // minitrend = platshållare än
          loading={loading}
        />
        <TimeDistribution data={data} loading={loading} />
        <AvbrottCard data={data} loading={loading} />
      </div>
    </div>
  )
}
