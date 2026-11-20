'use client'
import { underTopbar, AVSTAND, TYP, VIKT, RADIE, medSafeBotten, FARG, FONT, kolumnRot } from '@/lib/design/tokens'; // layoutmått, inte avstånd (tokens: LAYOUT)

import { useEffect, useState } from 'react'
import {
  MASKINER, getPeriodRange, getPrevDateRange, fetchData, fetchSeries, HeroCard, KpiList, TimeDistribution, OperatorList, type Maskin, type Period, type Data, type Operator, type PeriodKpi,
} from './OversiktShared'
import OperatorDeepView from './OperatorDeepView'
import VolymDeepView from './VolymDeepView'
import FlertradKort from './FlertradKort'
import TradslagKort from './TradslagKort'
import SortimentKort from './SortimentKort'
import { LivestatusKort } from './Livestatus'

export default function OversiktNy({ maskin, onMaskinChange }: {
  maskin: Maskin
  onMaskinChange: (m: Maskin) => void
}) {
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
    const cur       = getPeriodRange(period, offset)
    const prevRange = getPrevDateRange(period, offset)
    Promise.all([
      fetchData(maskin.id, cur.start,       cur.end      ).catch(() => null),
      fetchData(maskin.id, prevRange.start, prevRange.end).catch(() => null),
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

  const refLabel = getPrevDateRange(period, offset).refLabel

  // Skriv maskinnamn + period till global TopBar (samma mönster som gamla vyn)
  useEffect(() => {
    const el = document.getElementById('topbar-title')
    if (!el) return
    el.textContent = `${maskin.namn} — ${label}`
    return () => { el.textContent = 'Maskinvy' }
  }, [maskin.namn, label])

  return (
    <div style={{
      position: 'fixed', top: underTopbar(), left: 0, right: 0, bottom: 0,
      overflow: 'auto', background: FARG.bg, color: FARG.text,
      fontFamily: FONT, fontFeatureSettings: '"tnum"',
      // Lyft z-index när djupvy är öppen — annars hamnar djupvyns z-index:200
      // INUTI denna stacking context och kan inte täcka bars (z-index:60 i root).
      zIndex: (deepOperator || volymOpen) ? 200 : undefined,
    }}>
      {/* ── Sticky header: topbar + period-nav + V/M/K/Å ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: FARG.bg,
        borderBottom: `0.5px solid ${FARG.linje}`,
      }}>
        {/* Topbar: maskinnamn centrerat */}
        <div style={{ padding: `${AVSTAND.l}px ${AVSTAND.l}px`, textAlign: 'center', position: 'relative' }}>
          <button
            className="mv-maskinval"
            onClick={() => setMaskinOpen(o => !o)}
            aria-expanded={maskinOpen}
            style={{
              background: 'transparent', border: 'none', color: FARG.text,
              fontFamily: FONT, fontSize: TYP.text.fontSize, fontWeight: VIKT.halvfet, letterSpacing: -0.3,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s,
              padding: 0,
            }}
          >
            {maskin.namn}
            <span className="mv-maskinval-pil" style={{ color: FARG.text2, fontSize: TYP.micro.fontSize }}>▾</span>
          </button>
          {maskinOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              background: FARG.kort, borderRadius: RADIE.kort, marginTop: AVSTAND.s,
              minWidth: 260, overflow: 'hidden', zIndex: 100,
              boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
            }}>
              {MASKINER.map(m => (
                <button
                  key={m.id}
                  onClick={() => { onMaskinChange(m); setMaskinOpen(false) }}
                  style={{
                    display: 'block', width: '100%', padding: '12px 16px',
                    background: m.id === maskin.id ? FARG.linje : 'transparent',
                    border: 'none', color: FARG.text, fontFamily: FONT,
                    fontSize: TYP.meta.fontSize, cursor: 'pointer', textAlign: 'left',
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
              color: FARG.text2, fontSize: TYP.rubrik.fontSize, cursor: 'pointer', fontFamily: FONT,
            }}
          >‹</button>
          <div style={{
            minWidth: 180, textAlign: 'center',
            fontSize: TYP.text.fontSize, fontWeight: VIKT.halvfet, color: FARG.text, letterSpacing: -0.3,
          }}>{label}</div>
          <button
            onClick={() => setOffset(o => Math.min(o + 1, 0))}
            disabled={offset >= 0}
            aria-label="Nästa period"
            style={{
              width: 44, height: 44, border: 'none', background: 'transparent',
              color: offset >= 0 ? FARG.text3 : FARG.text2, fontSize: TYP.rubrik.fontSize,
              cursor: offset >= 0 ? 'default' : 'pointer', fontFamily: FONT,
            }}
          >›</button>
        </div>

        {/* V/M/K/Å segmented control */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: `${AVSTAND.xs}px ${AVSTAND.l}px ${AVSTAND.l}px` }}>
          <div style={{
            display: 'inline-flex', background: FARG.linje,
            borderRadius: RADIE.kort, padding: AVSTAND.xs,
          }}>
            {(['V', 'M', 'K', 'Å'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setOffset(0) }}
                style={{
                  minWidth: 58, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, border: 'none', borderRadius: RADIE.rad,
                  background: period === p ? FARG.fyllning : 'transparent',
                  color: period === p ? FARG.text : FARG.text2,
                  fontSize: TYP.meta.fontSize, fontWeight: period === p ? VIKT.halvfet : VIKT.halvfet,
                  fontFamily: FONT, cursor: 'pointer',
                }}
              >{p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Innehåll */}
      <div style={{ ...kolumnRot('smal'), padding: `0 ${AVSTAND.l}px 0`, paddingBottom: medSafeBotten(AVSTAND.xxl) }}>
        {/* Livestatus (när maskinen senast såg något) + maskinhälsa (när senaste fil kom) — alltid nu, oberoende av vald period. */}
        <LivestatusKort maskin={maskin} roll="skordare" />
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
        {/* Flerträd per period — HPR-härlett, egen hämtning (RPC), rör inte Data/PeriodKpi. */}
        <FlertradKort maskin={maskin} period={period} offset={offset} />
        {/* Trädslag per period — via maskindata_produktion (tradslag_id sedan 20260912), lib/tradslag-normaliserat. */}
        <TradslagKort maskin={maskin} period={period} offset={offset} />
        {/* Sortiment per period — fakt_sortiment, gruppen ur vy_sortiment_klass (lib/maskinvy/sortiment). */}
        <SortimentKort maskin={maskin} period={period} offset={offset} produktionsvolym={data?.volym ?? null} />
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
