'use client'

import { useEffect, useRef, useState } from 'react'
import {
  C, FONT, getPeriodRange, fetchAll,
  fmtSv, DeltaBadge, Sparkline,
  type Period,
} from './OversiktShared'

// ─────────────────────────────────────────────────────────────
// SkotareOversiktNy — Översikt för skotare bakom ?ny=1.
//
// Skotaren avverkar inte — den kör ut virke från fält till väg.
// Datakälla: fakt_lass (volym, körsträcka) + fakt_tid (G15h).
// Dessa två hämtas ALDRIG i samma query — de aggregeras var för
// sig och kombineras sedan i JS.
// ─────────────────────────────────────────────────────────────

// ── Maskiner ─────────────────────────────────────────────────
const SKOTARE = [
  { id: 'A030353',  namn: 'Ponsse Wisent'           },
  { id: 'A110148',  namn: 'Ponsse Elephant King AF' },
]

// ── Avståndklasser ───────────────────────────────────────────
// Baserade på korstracka_m per lass i fakt_lass.
const DIST_KLASSER = [
  { label: '<500 m',    min: 0,    max: 500,       farg: C.blue                     },
  { label: '500–1000',  min: 500,  max: 1000,      farg: 'rgba(10,132,255,0.70)'    },
  { label: '1000–2000', min: 1000, max: 2000,      farg: 'rgba(10,132,255,0.42)'    },
  { label: '2000+',     min: 2000, max: Infinity,  farg: 'rgba(10,132,255,0.22)'    },
] as const

// ── Typer ─────────────────────────────────────────────────────
type DistKlass = { label: string; farg: string; antal: number; andel: number }

type SkotareData = {
  volym:        number
  lass:         number
  snittLass:    number | null
  snittSträcka: number | null
  g15h:         number
  lassPerG15h:  number | null
  dagar:        number
  distKlasser:  DistKlass[]
}

type SkotareSerie = { label: string; hasData: boolean; volym: number | null }

// ── Datahämtning ─────────────────────────────────────────────

async function fetchSkotareData(
  maskinId: string, start: string, end: string,
): Promise<SkotareData> {
  const ids = [maskinId]

  // Hämta fakt_lass och fakt_tid SEPARAT — aldrig i samma query
  const [lassRows, tidRows] = await Promise.all([
    fetchAll('fakt_lass', 'datum, volym_m3sub, korstracka_m', ids, start, end),
    fetchAll('fakt_tid',  'processing_sek, terrain_sek',     ids, start, end),
  ])

  // ── fakt_lass → volym, lass, sträcka, dagar, avståndklasser ──
  let volym = 0, totalDist = 0
  const dagSet = new Set<string>()
  const klassCounts = DIST_KLASSER.map(() => 0)

  for (const r of lassRows) {
    volym     += r.volym_m3sub || 0
    const dist = r.korstracka_m || 0
    totalDist += dist
    if (r.datum) dagSet.add(r.datum)
    // Klassificera avstånd i rätt klass (söker bakifrån för att hitta min-tröskeln)
    for (let i = DIST_KLASSER.length - 1; i >= 0; i--) {
      if (dist >= DIST_KLASSER[i].min) { klassCounts[i]++; break }
    }
  }

  const lass = lassRows.length

  // ── fakt_tid → G15h (summeras fristående, aldrig per-rad mot lass) ──
  let proc = 0, terr = 0
  for (const r of tidRows) {
    proc += r.processing_sek || 0
    terr += r.terrain_sek    || 0
  }
  const g15h = (proc + terr) / 3600

  return {
    volym,
    lass,
    snittLass:    lass > 0  ? volym / lass        : null,
    snittSträcka: lass > 0  ? totalDist / lass    : null,
    g15h,
    lassPerG15h:  g15h > 0  ? lass / g15h         : null,
    dagar: dagSet.size,
    distKlasser: DIST_KLASSER.map((k, i) => ({
      label: k.label,
      farg:  k.farg,
      antal: klassCounts[i],
      andel: lass > 0 ? klassCounts[i] / lass : 0,
    })),
  }
}

const MIN_DAGAR = 2

async function fetchSkotareSerie(
  maskinId: string, period: Period, offset: number,
): Promise<SkotareSerie[]> {
  const ids = [maskinId]
  const ranges = Array.from({ length: 6 }, (_, i) => getPeriodRange(period, offset - (5 - i)))

  const lassRows = await fetchAll(
    'fakt_lass', 'datum, volym_m3sub',
    ids, ranges[0].start, ranges[ranges.length - 1].end,
  )

  const buckets = ranges.map(() => ({ volym: 0, dagar: new Set<string>() }))
  for (const r of lassRows) {
    for (let i = 0; i < ranges.length; i++) {
      if (r.datum >= ranges[i].start && r.datum <= ranges[i].end) {
        buckets[i].volym += r.volym_m3sub || 0
        if (r.datum) buckets[i].dagar.add(r.datum)
        break
      }
    }
  }

  return ranges.map((r, i) => ({
    label:   r.label,
    hasData: buckets[i].dagar.size >= MIN_DAGAR,
    volym:   buckets[i].dagar.size >= MIN_DAGAR ? buckets[i].volym : null,
  }))
}

// ── Hero-kort ─────────────────────────────────────────────────
// Separerat från skördarens HeroCard eftersom trendvärdet är
// volym (m³), inte produktivitet (m³/G15h).
function SkotareHero({
  value, prev, serie, refLabel, loading,
}: {
  value:    number | null
  prev:     number | null
  serie:    SkotareSerie[]
  refLabel: string
  loading:  boolean
}) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)

  useEffect(() => {
    if (!chartRef.current) return
    setW(chartRef.current.clientWidth)
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(Math.max(0, Math.floor(e.contentRect.width)))
    })
    ro.observe(chartRef.current)
    return () => ro.disconnect()
  }, [])

  const trendValues = serie.map(s => s.volym)
  const trendValid  = trendValues.filter(v => v !== null && isFinite(v as number)).length

  return (
    <div style={{ background: C.card, borderRadius: 14, padding: '22px 22px 18px', marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 12, letterSpacing: -0.1 }}>
        Utkört
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{
          fontSize: 40, fontWeight: 600, letterSpacing: -1.2,
          color: C.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        }}>
          {loading ? '—' : value !== null ? fmtSv(value, 0) : '—'}
        </div>
        <div style={{ fontSize: 14, color: C.muted }}>m³sub</div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {loading
          ? <span style={{ fontSize: 13, color: C.dim }}>—</span>
          : <DeltaBadge current={value} previous={prev} size="md" />}
        <span style={{ fontSize: 11, color: C.muted }}>{refLabel}</span>
      </div>

      <div style={{ marginTop: 16, height: 60 }} ref={chartRef}>
        {loading ? (
          <div style={{
            height: 60, borderRadius: 8, background: 'rgba(255,255,255,0.025)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.muted, fontSize: 11,
          }}>—</div>
        ) : trendValid < 2 ? (
          <div style={{
            height: 60, borderRadius: 8, background: 'rgba(255,255,255,0.025)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.muted, fontSize: 11,
          }}>För lite trenddata</div>
        ) : (
          w > 0 && (
            <Sparkline
              values={trendValues}
              width={w} height={60}
              color={C.blue} fillOpacity={0.12} lastDot
            />
          )
        )}
      </div>
    </div>
  )
}

// ── KPI-lista ─────────────────────────────────────────────────
// Enkel lista utan chevroner/djupvy (inte byggt än).
function SkotareKpiList({
  data, prev, loading,
}: {
  data:    SkotareData | null
  prev:    SkotareData | null
  loading: boolean
}) {
  const rows = [
    { label: 'Lass',         val: data?.lass          ?? null, prevVal: prev?.lass          ?? null, unit: 'st',      dec: 0 },
    { label: 'Snittlass',    val: data?.snittLass      ?? null, prevVal: prev?.snittLass      ?? null, unit: 'm³/lass', dec: 1 },
    { label: 'Snittsträcka', val: data?.snittSträcka   ?? null, prevVal: prev?.snittSträcka   ?? null, unit: 'm',       dec: 0 },
    { label: 'Lass/G15h',    val: data?.lassPerG15h    ?? null, prevVal: prev?.lassPerG15h    ?? null, unit: 'st/G15h', dec: 1 },
  ]

  return (
    <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 56px',
            gap: 14, alignItems: 'center',
            padding: '14px 16px',
            borderTop: i > 0 ? `0.5px solid ${C.divider}` : 'none',
          }}
        >
          <div style={{ fontSize: 15, color: C.text }}>{r.label}</div>
          <div style={{
            fontSize: 16, fontWeight: 500, color: C.text,
            fontVariantNumeric: 'tabular-nums', textAlign: 'right',
          }}>
            {loading ? '—' : r.val !== null ? fmtSv(r.val, r.dec) : '—'}
            <span style={{ fontSize: 11, color: C.muted, marginLeft: 4, fontWeight: 400 }}>
              {r.unit}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            {loading
              ? <span style={{ fontSize: 11, color: C.dim }}>—</span>
              : <DeltaBadge current={r.val} previous={r.prevVal} size="sm" />}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Körsträcka per lass ───────────────────────────────────────
// Staplad proportionsstapel + legend, liknande TimeDistribution.
function DistKlasserKort({ data, loading }: { data: SkotareData | null; loading: boolean }) {
  const klasser = data?.distKlasser ?? DIST_KLASSER.map(k => ({ label: k.label, farg: k.farg, antal: 0, andel: 0 }))
  const harData = !loading && data && data.lass > 0

  return (
    <div style={{ background: C.card, borderRadius: 14, padding: 18, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 14 }}>
        Körsträcka per lass
      </div>

      {/* Staplad proportionsstapel */}
      <div style={{
        display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden',
        background: 'rgba(255,255,255,0.04)', gap: 2, marginBottom: 14,
      }}>
        {harData && klasser.map((k, i) => {
          if (k.andel < 0.005) return null
          return <div key={i} style={{ flex: k.andel, background: k.farg }} />
        })}
      </div>

      {/* Legend: en rad per klass */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {klasser.map((k, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: k.farg }} />
            <span style={{ color: C.muted }}>{k.label}</span>
            <span style={{ color: C.text, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
              {harData ? `${Math.round(k.andel * 100)}%` : '—'}
            </span>
            <span style={{ color: C.muted, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
              · {harData ? `${k.antal} lass` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Huvud-komponent ───────────────────────────────────────────
export default function SkotareOversiktNy() {
  type Maskin = typeof SKOTARE[number]
  const [maskin, setMaskin]   = useState<Maskin>(SKOTARE[0])
  const [period, setPeriod]   = useState<Period>('M')
  const [offset, setOffset]   = useState(0)
  const [data,     setData]   = useState<SkotareData | null>(null)
  const [prevData, setPrevData] = useState<SkotareData | null>(null)
  const [serie,    setSerie]  = useState<SkotareSerie[]>([])
  const [loading,  setLoading]= useState(false)
  const [maskinOpen, setMaskinOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const cur  = getPeriodRange(period, offset)
    const prev = getPeriodRange(period, offset - 1)

    Promise.all([
      fetchSkotareData(maskin.id, cur.start,  cur.end ).catch(() => null),
      fetchSkotareData(maskin.id, prev.start, prev.end).catch(() => null),
      fetchSkotareSerie(maskin.id, period, offset).catch(() => []),
    ]).then(([curD, prevD, ser]) => {
      if (cancelled) return
      // 65%-regel: visa delta bara om föregående period har jämförbar täckning.
      const prevValid = (prevD?.dagar ?? 0) >= (curD?.dagar ?? 0) * 0.65
      setData(curD)
      setPrevData(prevValid ? prevD : null)
      setSerie(ser ?? [])
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [maskin.id, period, offset])

  const { label } = getPeriodRange(period, offset)

  // Konkret jämförelsetext: "mot april", "mot vecka 18", "mot 2025" …
  const refLabel = (() => {
    const prevL = getPeriodRange(period, offset - 1).label
    if (period === 'Å') return `mot ${prevL}`
    if (period === 'M') return `mot ${prevL.split(' ')[0].toLowerCase()}`
    return `mot ${prevL.split(' · ')[0].toLowerCase()}`
  })()

  return (
    <div style={{
      position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
      overflow: 'auto', background: C.bg, color: C.text,
      fontFamily: FONT, fontFeatureSettings: '"tnum"',
    }}>
      {/* ── Sticky header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: C.bg, borderBottom: `0.5px solid ${C.divider}`,
      }}>
        {/* Maskin-dropdown */}
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
              {SKOTARE.map(m => (
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

      {/* ── Innehåll ── */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px 80px' }}>
        <SkotareHero
          value={data?.volym ?? null}
          prev={prevData?.volym ?? null}
          serie={serie}
          refLabel={refLabel}
          loading={loading}
        />
        <SkotareKpiList data={data} prev={prevData} loading={loading} />
        <DistKlasserKort data={data} loading={loading} />
      </div>
    </div>
  )
}
