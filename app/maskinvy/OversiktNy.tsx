'use client'

import { useEffect, useState } from 'react'
import {
  C, FONT, MASKINER, getPeriodRange,
  fetchData, fetchSeries,
  HeroCard, KpiList, TimeDistribution, OperatorList,
  type Maskin, type Period, type Data, type Operator, type PeriodKpi,
} from './OversiktShared'
import OperatorDeepView from './OperatorDeepView'
import VolymDeepView from './VolymDeepView'

export default function OversiktNy() {
  const [maskin, setMaskin] = useState<Maskin>(MASKINER[0])
  const [period, setPeriod] = useState<Period>('M')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<Data | null>(null)
  const [prevData, setPrevData] = useState<Data | null>(null)
  const [series, setSeries] = useState<PeriodKpi[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [maskinOpen, setMaskinOpen] = useState(false)

  // Djupvy-state: aktiv operatör som vyas. null = ingen djupvy öppen.
  const [deepOperator, setDeepOperator] = useState<Operator | null>(null)
  // Volym-djupvy
  const [volymOpen, setVolymOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const cur = getPeriodRange(period, offset)
    const prev = getPeriodRange(period, offset - 1)
    Promise.all([
      fetchData(maskin.id, cur.start,  cur.end ).catch(() => null),
      fetchData(maskin.id, prev.start, prev.end).catch(() => null),
      fetchSeries(maskin.id, period, offset).catch(() => null),
    ]).then(([curD, prevD, ser]) => {
      if (cancelled) return
      // Delta visas bara när föregående period har jämförbar täckning.
      // Tröskeln: ≥ 65 % av nuvarande periods prod-dagar.
      // Skyddar mot t.ex. Å 2026 (100+ dagar) vs Å 2025 (~35 dagar) → "–".
      const prevValid = (prevD?.dagar ?? 0) >= (curD?.dagar ?? 0) * 0.65
      setData(curD)
      setPrevData(prevValid ? prevD : null)
      setSeries(ser)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [maskin.id, period, offset])

  const { label } = getPeriodRange(period, offset)

  // Konkret jämförelse-etikett: "mot april", "mot vecka 18", "mot 2025" …
  const refLabel = (() => {
    const prevL = getPeriodRange(period, offset - 1).label
    if (period === 'Å') return `mot ${prevL}`                                     // "mot 2025"
    if (period === 'M') return `mot ${prevL.split(' ')[0].toLowerCase()}`          // "mot april"
    return `mot ${prevL.split(' · ')[0].toLowerCase()}`                            // "mot vecka 18" / "mot kvartal 1"
  })()

  // Skriv maskinnamn + period till global TopBar (samma mönster som gamla vyn)
  useEffect(() => {
    const el = document.getElementById('topbar-title')
    if (!el) return
    el.textContent = `${maskin.namn} — ${label}`
    return () => { el.textContent = 'Maskinvy' }
  }, [maskin.namn, label])

  return (
    <div style={{
      position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
      overflow: 'auto', background: C.bg, color: C.text,
      fontFamily: FONT, fontFeatureSettings: '"tnum"',
    }}>
      {/* ── Sticky header: topbar + period-nav + V/M/K/Å ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: C.bg,
        borderBottom: `0.5px solid ${C.divider}`,
      }}>
        {/* Topbar: maskinnamn centrerat */}
        <div style={{ padding: '14px 16px', textAlign: 'center', position: 'relative' }}>
          <button
            onClick={() => setMaskinOpen(o => !o)}
            aria-expanded={maskinOpen}
            style={{
              background: 'transparent', border: 'none', color: C.text,
              fontFamily: FONT, fontSize: 15, fontWeight: 600, letterSpacing: -0.3,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: 0,
            }}
          >
            {maskin.namn}
            <span style={{ color: C.muted, fontSize: 11 }}>▾</span>
          </button>
          {maskinOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              background: C.card, borderRadius: 12, marginTop: 6,
              minWidth: 260, overflow: 'hidden', zIndex: 100,
              boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
            }}>
              {MASKINER.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setMaskin(m); setMaskinOpen(false) }}
                  style={{
                    display: 'block', width: '100%', padding: '12px 16px',
                    background: m.id === maskin.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: 'none', color: C.text, fontFamily: FONT,
                    fontSize: 14, cursor: 'pointer', textAlign: 'left',
                  }}
                >{m.namn}</button>
              ))}
            </div>
          )}
        </div>

        {/* Period-nav ‹ Maj 2026 › */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          padding: '12px 0 4px',
        }}>
          <button
            onClick={() => setOffset(o => o - 1)}
            aria-label="Föregående period"
            style={{
              width: 44, height: 44, border: 'none', background: 'transparent',
              color: C.muted, fontSize: 22, cursor: 'pointer', fontFamily: FONT,
            }}
          >‹</button>
          <div style={{
            minWidth: 180, textAlign: 'center',
            fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: -0.3,
          }}>{label}</div>
          <button
            onClick={() => setOffset(o => Math.min(o + 1, 0))}
            disabled={offset >= 0}
            aria-label="Nästa period"
            style={{
              width: 44, height: 44, border: 'none', background: 'transparent',
              color: offset >= 0 ? C.dim : C.muted, fontSize: 22,
              cursor: offset >= 0 ? 'default' : 'pointer', fontFamily: FONT,
            }}
          >›</button>
        </div>

        {/* V/M/K/Å segmented control */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 16px 18px' }}>
          <div style={{
            display: 'inline-flex', background: 'rgba(120,120,128,0.16)',
            borderRadius: 10, padding: 2,
          }}>
            {(['V', 'M', 'K', 'Å'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setOffset(0) }}
                style={{
                  minWidth: 58, padding: '7px 18px', border: 'none', borderRadius: 8,
                  background: period === p ? '#3a3a3c' : 'transparent',
                  color: period === p ? C.text : C.muted,
                  fontSize: 13, fontWeight: period === p ? 600 : 500,
                  fontFamily: FONT, cursor: 'pointer',
                }}
              >{p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Innehåll */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px 80px' }}>
        <HeroCard
          label="Produktivitet"
          unit="m³/G15h"
          dec={1}
          value={data?.produktivitet ?? null}
          prev={prevData?.produktivitet ?? null}
          series={series}
          referenceLabel={refLabel}
          loading={loading}
        />
        <KpiList data={data} prev={prevData} series={series} loading={loading} onVolymClick={() => setVolymOpen(true)} />
        <TimeDistribution data={data} loading={loading} />
        <OperatorList
          operatorer={data?.operatorer ?? []}
          loading={loading}
          onSelect={(op) => setDeepOperator(op)}
        />
      </div>

      {/* Volym-djupvy */}
      {volymOpen && (
        <VolymDeepView
          maskin={maskin}
          period={period}
          offset={offset}
          periodLabel={label}
          onClose={() => setVolymOpen(false)}
        />
      )}

      {/* Operatör-djupvy som overlay */}
      {deepOperator && (
        <OperatorDeepView
          maskin={maskin}
          period={period}
          offset={offset}
          periodLabel={label}
          operator={deepOperator}
          machineData={data}
          onClose={() => setDeepOperator(null)}
        />
      )}
    </div>
  )
}
