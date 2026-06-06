'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  C, FONT, COMBO_IDS, fetchAll, fmtSv, getPeriodRange,
  type Maskin, type Period,
} from './OversiktShared'

// ─────────────────────────────────────────────────────────────
// VolymDeepView — slide-in panel för Volym-raden i Översikt.
// Visar total volym + per trädslag (proportion + lista).
//
// Datakälla: fakt_produktion grupperat på tradslag_id.
// Aldrig detalj_stock/detalj_stam.
// ─────────────────────────────────────────────────────────────

type TradslagRad = {
  tradslag_id: string
  namn: string
  volym: number
  stammar: number
  andel: number   // 0–1
  farg: string
}

function tradfarg(namn: string): string {
  const n = namn.toLowerCase()
  if (n.includes('gran')) return '#30d158'
  if (n.includes('tall')) return '#ff9f0a'
  if (n.includes('björk') || n.includes('bjork')) return '#ffd60a'
  return '#8e8e93'
}

async function fetchVolymPerTradslag(
  maskinId: string, start: string, end: string,
): Promise<TradslagRad[]> {
  const ids = COMBO_IDS[maskinId] || [maskinId]

  const [prodRows, tradRes] = await Promise.all([
    fetchAll('fakt_produktion', 'tradslag_id, volym_m3sub, stammar', ids, start, end),
    supabase.from('dim_tradslag').select('tradslag_id, namn').in('maskin_id', ids),
  ])

  const tradNamn: Record<string, string> = {}
  for (const t of ((tradRes as any).data || [])) {
    tradNamn[t.tradslag_id] = t.namn
  }

  // Summera per tradslag_id
  const agg: Record<string, { volym: number; stammar: number }> = {}
  for (const r of prodRows) {
    const tid = r.tradslag_id || '__okänt__'
    if (!agg[tid]) agg[tid] = { volym: 0, stammar: 0 }
    agg[tid].volym   += r.volym_m3sub || 0
    agg[tid].stammar += r.stammar || 0
  }

  const totalVolym = Object.values(agg).reduce((s, v) => s + v.volym, 0)

  return Object.entries(agg)
    .filter(([, v]) => v.volym > 0)
    .map(([tid, v]) => {
      const namn = tradNamn[tid] || tid
      return {
        tradslag_id: tid,
        namn,
        volym:   v.volym,
        stammar: v.stammar,
        andel:   totalVolym > 0 ? v.volym / totalVolym : 0,
        farg:    tradfarg(namn),
      }
    })
    .sort((a, b) => b.volym - a.volym)
}

// ─────────────────────────────────────────────────────────────
// Komponent
// ─────────────────────────────────────────────────────────────
export default function VolymDeepView({
  maskin, period, offset, periodLabel, onClose,
}: {
  maskin: Maskin
  period: Period
  offset: number
  periodLabel: string
  onClose: () => void
}) {
  const [shown, setShown] = useState(false)
  const [rader, setRader] = useState<TradslagRad[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Slide-in animation
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 10)
    return () => window.clearTimeout(t)
  }, [])

  // Escape-tangent
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Datahämtning
  useEffect(() => {
    const { start, end } = getPeriodRange(period, offset)
    setLoading(true)
    setError(false)
    fetchVolymPerTradslag(maskin.id, start, end)
      .then(r => { setRader(r); setLoading(false) })
      .catch(() => { setLoading(false); setError(true) })
  }, [maskin.id, period, offset])

  const handleClose = () => {
    setShown(false)
    window.setTimeout(onClose, 280)
  }

  const totalVolym = rader.reduce((s, r) => s + r.volym, 0)
  const totalStammar = rader.reduce((s, r) => s + r.stammar, 0)

  return (
    <div
      role="dialog"
      aria-label="Volym per trädslag"
      style={{
        position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
        overflow: 'auto', background: C.bg, color: C.text,
        fontFamily: FONT, fontFeatureSettings: '"tnum"',
        transform: shown ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
        zIndex: 200,
      }}
    >
      {/* ── Sticky header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: C.bg, borderBottom: `0.5px solid ${C.divider}`,
        padding: '10px 12px',
      }}>
        <button
          onClick={handleClose}
          style={{
            background: 'transparent', border: 'none',
            color: C.blue, fontFamily: FONT,
            fontSize: 16, fontWeight: 400,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
            gap: 2, padding: '6px 8px', minHeight: 36,
          }}
        >
          <span style={{ fontSize: 22, lineHeight: 1, marginRight: 2 }}>‹</span>
          Översikt
        </button>
      </div>

      {/* ── Innehåll ── */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
        {/* Rubrik */}
        <div style={{
          fontSize: 22, fontWeight: 600, color: C.text,
          letterSpacing: -0.4, lineHeight: 1.15, marginBottom: 4,
        }}>Volym</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
          {periodLabel} · {maskin.namn}
        </div>

        {/* Total */}
        <div style={{ background: C.card, borderRadius: 14, padding: '20px 20px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 8 }}>Total</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{
              fontSize: 40, fontWeight: 600, letterSpacing: -1.2,
              color: C.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            }}>
              {loading ? '—' : fmtSv(totalVolym, 0)}
            </div>
            <div style={{ fontSize: 14, color: C.muted }}>m³sub</div>
          </div>
          {!loading && totalStammar > 0 && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              {fmtSv(totalStammar, 0)} stammar
            </div>
          )}
        </div>

        {/* Per trädslag */}
        <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, padding: '14px 16px 4px' }}>
            Per trädslag
          </div>

          {/* Proportionsstapel */}
          {!loading && rader.length > 0 && (
            <div style={{ padding: '10px 16px 14px' }}>
              <div style={{
                display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden',
                background: 'rgba(255,255,255,0.04)', gap: 2,
              }}>
                {rader.map(r => (
                  <div
                    key={r.tradslag_id}
                    title={`${r.namn}: ${Math.round(r.andel * 100)} %`}
                    style={{ flex: r.volym, background: r.farg }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Lista */}
          {loading ? (
            <div style={{ padding: '0 16px 18px', fontSize: 13, color: C.muted }}>Laddar…</div>
          ) : error ? (
            <div style={{ padding: '0 16px 18px', fontSize: 13, color: C.muted }}>
              Kunde inte hämta data
            </div>
          ) : rader.length === 0 ? (
            <div style={{ padding: '0 16px 18px', fontSize: 13, color: C.muted }}>
              Ingen produktion för perioden
            </div>
          ) : rader.map((r) => (
            <div
              key={r.tradslag_id}
              style={{
                display: 'grid',
                gridTemplateColumns: '12px 1fr auto',
                gap: 12, alignItems: 'center',
                padding: '12px 16px',
                borderTop: `0.5px solid ${C.divider}`,
              }}
            >
              {/* Färgpunkt */}
              <div style={{ width: 10, height: 10, borderRadius: 3, background: r.farg }} />

              {/* Namn + stammar + andel */}
              <div>
                <div style={{ fontSize: 15, color: C.text, fontWeight: 500 }}>{r.namn}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtSv(r.stammar, 0)} stammar · {Math.round(r.andel * 100)}&thinsp;%
                </div>
              </div>

              {/* Volym */}
              <div style={{
                fontSize: 15, fontWeight: 500, color: C.text,
                textAlign: 'right', fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtSv(r.volym, 0)}
                <span style={{ fontSize: 11, color: C.muted, marginLeft: 3, fontWeight: 400 }}>m³</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
