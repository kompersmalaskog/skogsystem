'use client'
import { AVSTAND, TYP, VIKT, medSafeBotten, RADIE, FARG, FONT, kolumnRot, overgang } from '@/lib/design/tokens'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { tradslagFarg, tradslagLabel } from '@/lib/tradslag'
import {
  COMBO_IDS, fetchAll, fmtSv, getPeriodRange, type Maskin, type Period,
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

  // Summera per NORMALISERAT namn (lib/tradslag), inte per tradslag_id:
  // id:t är per maskin, så "Rottne H8E (båda)" hade två rader för samma art,
  // och R64101:s 'ÖVR LÖV'/'LÖV'/'LOV2' är samma "Övrigt löv" som 'ÖVR_LÖV'.
  const agg: Record<string, { volym: number; stammar: number }> = {}
  for (const r of prodRows) {
    const namn = tradslagLabel(r.tradslag_id ? tradNamn[r.tradslag_id] : null)
    if (!agg[namn]) agg[namn] = { volym: 0, stammar: 0 }
    agg[namn].volym   += r.volym_m3sub || 0
    agg[namn].stammar += r.stammar || 0
  }

  const totalVolym = Object.values(agg).reduce((s, v) => s + v.volym, 0)

  return Object.entries(agg)
    .filter(([, v]) => v.volym > 0)
    .sort((a, b) => b[1].volym - a[1].volym)
    .map(([namn, v], i) => ({
      tradslag_id: namn,
      namn,
      volym:   v.volym,
      stammar: v.stammar,
      andel:   totalVolym > 0 ? v.volym / totalVolym : 0,
      // Appens EN trädslagspalett — samma färg för Gran här som i uppföljningen.
      farg:    tradslagFarg(namn, i),
    }))
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
        position: 'fixed', top: 'calc(56px + env(safe-area-inset-top))', left: 0, right: 0, bottom: 0,
        overflow: 'auto', background: FARG.bg, color: FARG.text,
        fontFamily: FONT, fontFeatureSettings: '"tnum"',
        transform: shown ? 'translateX(0)' : 'translateX(100%)',
        transition: overgang('transform'),
        zIndex: 200,
      }}
    >
      {/* ── Sticky header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: FARG.bg, borderBottom: `0.5px solid ${FARG.linje}`,
        padding: `${AVSTAND.m}px ${AVSTAND.m}px`,
      }}>
        <button
          onClick={handleClose}
          style={{
            background: 'transparent', border: 'none',
            color: FARG.bla, fontFamily: FONT,
            fontSize: TYP.text.fontSize, fontWeight: VIKT.normal,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
            gap: AVSTAND.xs, padding: `${AVSTAND.s}px ${AVSTAND.s}px`, minHeight: 36,
          }}
        >
          <span style={{ fontSize: TYP.rubrik.fontSize, lineHeight: 1, marginRight: AVSTAND.xs }}>‹</span>
          Översikt
        </button>
      </div>

      {/* ── Innehåll ── */}
      <div style={{ ...kolumnRot('smal'), padding: `${AVSTAND.xl}px ${AVSTAND.l}px 0`, paddingBottom: medSafeBotten(AVSTAND.xxl) }}>
        {/* Rubrik */}
        <div style={{
          fontSize: TYP.rubrik.fontSize, fontWeight: VIKT.halvfet, color: FARG.text,
          letterSpacing: -0.4, lineHeight: 1.15, marginBottom: 4,
        }}>Volym</div>
        <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, marginBottom: AVSTAND.xl }}>
          {periodLabel} · {maskin.namn}
        </div>

        {/* Total */}
        <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.xl}px ${AVSTAND.xl}px ${AVSTAND.l}px`, marginBottom: AVSTAND.l }}>
          <div style={{ fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text2, marginBottom: 8 }}>Total</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{
              fontSize: TYP.tal.fontSize, fontWeight: VIKT.halvfet, letterSpacing: -1.2,
              color: FARG.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            }}>
              {loading ? '—' : fmtSv(totalVolym, 0)}
            </div>
            <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>m³sub</div>
          </div>
          {!loading && totalStammar > 0 && (
            <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, marginTop: AVSTAND.s, fontVariantNumeric: 'tabular-nums' }}>
              {fmtSv(totalStammar, 0)} stammar
            </div>
          )}
        </div>

        {/* Per trädslag */}
        <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden', marginBottom: AVSTAND.l }}>
          <div style={{ fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text2, padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.xs}px` }}>
            Per trädslag
          </div>

          {/* Proportionsstapel */}
          {!loading && rader.length > 0 && (
            <div style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px ${AVSTAND.l}px` }}>
              <div style={{
                display: 'flex', height: 10, borderRadius: RADIE.stapel, overflow: 'hidden',
                background: FARG.tonad, gap: AVSTAND.xs,
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
            <div style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px`, fontSize: TYP.meta.fontSize, color: FARG.text2 }}>Laddar…</div>
          ) : error ? (
            <div style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px`, fontSize: TYP.meta.fontSize, color: FARG.text2 }}>
              Kunde inte hämta data
            </div>
          ) : rader.length === 0 ? (
            <div style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px`, fontSize: TYP.meta.fontSize, color: FARG.text2 }}>
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
                borderTop: `0.5px solid ${FARG.linje}`,
              }}
            >
              {/* Färgpunkt */}
              <div style={{ width: 10, height: 10, borderRadius: RADIE.stapel, background: r.farg }} />

              {/* Namn + stammar + andel */}
              <div>
                <div style={{ fontSize: TYP.text.fontSize, color: FARG.text, fontWeight: VIKT.halvfet }}>{r.namn}</div>
                <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginTop: AVSTAND.xs, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtSv(r.stammar, 0)} stammar · {Math.round(r.andel * 100)}&thinsp;%
                </div>
              </div>

              {/* Volym */}
              <div style={{
                fontSize: TYP.text.fontSize, fontWeight: VIKT.halvfet, color: FARG.text,
                textAlign: 'right', fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtSv(r.volym, 0)}
                <span style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginLeft: AVSTAND.xs, fontWeight: VIKT.normal }}>m³</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
