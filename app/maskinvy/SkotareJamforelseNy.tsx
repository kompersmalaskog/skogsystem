'use client'

import { useEffect, useRef, useState } from 'react'
import {
  C, FONT, fmtSv, getPeriodRange, fetchAll,
  type Period,
} from './OversiktShared'

// ─────────────────────────────────────────────────────────────
// SkotareJamforelseNy — Wisent vs Elephant King, per avståndsklass
// Bakom ?ny=1, flik "Jämförelse" under Skotare.
//
// 4 mått × 4 avståndklasser. INGEN vinnarkröning.
//
// G15h = (processing_sek + terrain_sek) / 3600
// — exakt samma formel som OversiktShared.fetchData (rad 250).
//   Självläker när tidsdata rättas.
//
// L/m³ är ett maskinmått — kan ej delas per klass.
//   Visas som maskintotal (identisk bar-höjd för alla klasser).
//
// m³/G15h per klass = klassvolym / total G15h för maskinen.
//   Ger "hur stor del av maskinens timmar driver varje klass".
//
// fakt_lass och fakt_tid hämtas ALLTID separat — aldrig joinade.
// ─────────────────────────────────────────────────────────────

// ── Maskiner ──────────────────────────────────────────────────
const WISENT = { id: 'A030353', namn: 'Ponsse Wisent',           kort: 'Wisent', color: C.blue   }
const EK     = { id: 'A110148', namn: 'Ponsse Elephant King AF', kort: 'EK',     color: C.purple }

// ── Avståndklasser ────────────────────────────────────────────
const KLASSER = [
  { label: '0–500m',  short: '0–500',  min: 0,    max: 500      },
  { label: '500–1km', short: '500–1k', min: 500,  max: 1000     },
  { label: '1–2km',   short: '1–2km',  min: 1000, max: 2000     },
  { label: '2km+',    short: '2km+',   min: 2000, max: Infinity },
]
const NK = KLASSER.length

function getKlassIdx(m: number): number {
  for (let i = 0; i < NK; i++) if (m < KLASSER[i].max) return i
  return NK - 1
}

// ── Mått ──────────────────────────────────────────────────────
type MattId = 'lass' | 'snittlass' | 'm3g15h' | 'lm3'

const MATT: { id: MattId; label: string; unit: string; dec: number }[] = [
  { id: 'lass',      label: 'Lass',      unit: 'st',      dec: 0 },
  { id: 'snittlass', label: 'Snittlass', unit: 'm³/lass', dec: 1 },
  { id: 'm3g15h',    label: 'm³/G15h',  unit: 'm³/G15h', dec: 1 },
  { id: 'lm3',       label: 'L/m³',     unit: 'L/m³',    dec: 2 },
]

// ── Typer ─────────────────────────────────────────────────────
type KlassAgg = { lass: number; volym: number }

type MaskinAgg = {
  klasser:    KlassAgg[]  // index 0–3 = KLASSER
  g15h:       number      // total G15h perioden = SUM((proc+terr)/3600)
  bransle:    number      // total L
  totalVolym: number      // SUM(volym_m3sub) alla klasser
  totalLass:  number      // COUNT(lass) alla klasser
}

function emptyAgg(): MaskinAgg {
  return {
    klasser:    KLASSER.map(() => ({ lass: 0, volym: 0 })),
    g15h: 0, bransle: 0, totalVolym: 0, totalLass: 0,
  }
}

// ── Datahämtning ──────────────────────────────────────────────
async function fetchJamforelse(
  start: string, end: string,
): Promise<{ wisent: MaskinAgg; ek: MaskinAgg }> {
  const ids = [WISENT.id, EK.id]

  // fakt_lass och fakt_tid — ALDRIG joinade (kritisk regel i CLAUDE.md)
  const [lassRows, tidRows] = await Promise.all([
    fetchAll('fakt_lass', 'maskin_id, volym_m3sub, korstracka_m', ids, start, end),
    fetchAll('fakt_tid',  'maskin_id, processing_sek, terrain_sek, bransle_liter', ids, start, end),
  ])

  const map: Record<string, MaskinAgg> = {
    [WISENT.id]: emptyAgg(),
    [EK.id]:     emptyAgg(),
  }

  // Aggregera fakt_lass → klasser
  for (const r of lassRows) {
    const a = map[r.maskin_id]; if (!a) continue
    const v  = r.volym_m3sub  || 0
    const ki = getKlassIdx(r.korstracka_m || 0)
    a.klasser[ki].lass++
    a.klasser[ki].volym += v
    a.totalVolym += v
    a.totalLass++
  }

  // Aggregera fakt_tid → G15h + bränsle
  // G15h = (processing_sek + terrain_sek) / 3600
  // Identisk formel med OversiktShared.fetchData rad 250 — självläker vid datarättning.
  for (const r of tidRows) {
    const a = map[r.maskin_id]; if (!a) continue
    a.g15h    += ((r.processing_sek || 0) + (r.terrain_sek || 0)) / 3600
    a.bransle += parseFloat(r.bransle_liter) || 0
  }

  return { wisent: map[WISENT.id], ek: map[EK.id] }
}

// ── Måttberäkning ─────────────────────────────────────────────

/** Värde per klass (viktat SUM/SUM — aldrig snitt av snitt). */
function mattKlass(agg: MaskinAgg, ki: number, matt: MattId): number | null {
  const kl = agg.klasser[ki]
  if (matt === 'lass')      return kl.lass > 0                             ? kl.lass                          : null
  if (matt === 'snittlass') return kl.lass > 0                             ? kl.volym / kl.lass               : null
  if (matt === 'm3g15h')    return agg.g15h > 0                            ? kl.volym / agg.g15h              : null
  // lm3: maskinmått — kan ej delas per klass. Visar maskintotal för alla klasser.
  return (agg.totalVolym > 0 && agg.bransle > 0) ? agg.bransle / agg.totalVolym : null
}

/** Totalvärde alla klasser kombinerat. */
function mattTotal(agg: MaskinAgg, matt: MattId): number | null {
  if (matt === 'lass')      return agg.totalLass > 0                           ? agg.totalLass                           : null
  if (matt === 'snittlass') return agg.totalLass > 0                           ? agg.totalVolym / agg.totalLass          : null
  if (matt === 'm3g15h')    return agg.g15h > 0                                ? agg.totalVolym / agg.g15h               : null
  return (agg.totalVolym > 0 && agg.bransle > 0) ? agg.bransle / agg.totalVolym : null
}

// ── BarChart ──────────────────────────────────────────────────
// Pure SVG — ingen Chart.js. 4 grupper × 2 staplar (Wisent=blå, EK=lila).
// Kontextrad (lass · m³ per maskin per klass) i HTML under SVG.
function BarChart({
  wisent, ek, matt, loading,
}: {
  wisent:  MaskinAgg
  ek:      MaskinAgg
  matt:    MattId
  loading: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [cw, setCw]  = useState(0)

  useEffect(() => {
    if (!containerRef.current) return
    setCw(containerRef.current.clientWidth)
    const ro = new ResizeObserver(ents => {
      for (const e of ents) setCw(Math.max(0, Math.floor(e.contentRect.width)))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const CHART_H   = 110
  const LEFT_PAD  = 36
  const RIGHT_PAD = 6
  const GROUP_GAP = 12
  const BAR_GAP   = 2
  const LABEL_H   = 20

  const usableW = Math.max(1, cw - LEFT_PAD - RIGHT_PAD)
  const groupW  = (usableW - GROUP_GAP * (NK - 1)) / NK
  const barW    = Math.max(2, (groupW - BAR_GAP) / 2)

  // Alla värden för att bestämma maxVal
  const allVals = KLASSER.flatMap((_, ki) => [
    mattKlass(wisent, ki, matt),
    mattKlass(ek,     ki, matt),
  ]).filter((v): v is number => v !== null && v > 0)

  const maxVal = allVals.length > 0 ? Math.max(...allVals) : 1

  // Nice Y-ticks
  function niceStep(max: number): number {
    const raw = max / 4
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 0.001))))
    for (const m of [1, 2, 2.5, 5, 10]) if (mag * m >= raw) return mag * m
    return raw
  }
  const step   = niceStep(maxVal)
  const yTicks: number[] = []
  for (let v = step; v <= maxVal * 1.08; v += step) yTicks.push(parseFloat(v.toPrecision(10)))

  const mattDef = MATT.find(m => m.id === matt)!

  if (loading || cw === 0) {
    return (
      <div ref={containerRef} style={{
        width: '100%', height: CHART_H + LABEL_H + 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {cw > 0 && <span style={{ fontSize: 12, color: C.muted }}>Laddar…</span>}
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg
        width={cw} height={CHART_H + LABEL_H + 4}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Y-axis tick lines */}
        {yTicks.map(t => {
          const y = CHART_H - (t / maxVal) * CHART_H
          if (y < 0) return null
          return (
            <g key={t}>
              <line
                x1={LEFT_PAD - 2} y1={y} x2={cw - RIGHT_PAD} y2={y}
                stroke="rgba(255,255,255,0.05)" strokeWidth={0.5}
              />
              <text
                x={LEFT_PAD - 5} y={y + 3.5}
                textAnchor="end" fontSize={9}
                fill={C.dim} fontFamily={FONT}
              >
                {fmtSv(t, t < 1 ? 2 : t < 10 ? 1 : 0)}
              </text>
            </g>
          )
        })}

        {/* Bars per group */}
        {KLASSER.map((kl, ki) => {
          const gx   = LEFT_PAD + ki * (groupW + GROUP_GAP)
          const wVal = mattKlass(wisent, ki, matt)
          const eVal = mattKlass(ek,     ki, matt)

          const wH = wVal !== null && wVal > 0 ? Math.max(3, (wVal / maxVal) * CHART_H) : 0
          const eH = eVal !== null && eVal > 0 ? Math.max(3, (eVal / maxVal) * CHART_H) : 0

          return (
            <g key={ki}>
              {/* Wisent bar */}
              <rect
                x={gx} y={CHART_H - wH}
                width={barW} height={Math.max(2, wH)}
                rx={2} fill={WISENT.color}
                opacity={wH > 0 ? 0.9 : 0.15}
              />

              {/* EK bar */}
              <rect
                x={gx + barW + BAR_GAP} y={CHART_H - eH}
                width={barW} height={Math.max(2, eH)}
                rx={2} fill={EK.color}
                opacity={eH > 0 ? 0.9 : 0.15}
              />

              {/* Value label on top (Wisent) — bara om stapeln är hög nog */}
              {wH > 18 && wVal !== null && (
                <text
                  x={gx + barW / 2} y={CHART_H - wH - 3}
                  textAnchor="middle" fontSize={8}
                  fill={WISENT.color} fontFamily={FONT} opacity={0.85}
                >
                  {fmtSv(wVal, mattDef.dec)}
                </text>
              )}

              {/* Value label on top (EK) */}
              {eH > 18 && eVal !== null && (
                <text
                  x={gx + barW + BAR_GAP + barW / 2} y={CHART_H - eH - 3}
                  textAnchor="middle" fontSize={8}
                  fill={EK.color} fontFamily={FONT} opacity={0.85}
                >
                  {fmtSv(eVal, mattDef.dec)}
                </text>
              )}

              {/* X-axis class label */}
              <text
                x={gx + groupW / 2} y={CHART_H + LABEL_H - 4}
                textAnchor="middle" fontSize={10}
                fill={C.muted} fontFamily={FONT}
              >
                {kl.short}
              </text>
            </g>
          )
        })}
      </svg>

      {/* ── Kontextrad (HTML) — X lass · Y m³ per maskin per klass ── */}
      {/* Tal vita, prefix (W:/EK:) och enheter (m³) i grått — samma princip som Översikt */}
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${NK}, 1fr)`,
        gap: 4, marginTop: 6,
      }}>
        {KLASSER.map((_, ki) => {
          const wKl = wisent.klasser[ki]
          const eKl = ek.klasser[ki]
          return (
            <div key={ki} style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
              <div style={{ marginBottom: 1 }}>
                {wKl.lass > 0 ? (
                  <>
                    <span style={{ color: C.muted }}>W: </span>
                    <span style={{ color: C.text, fontWeight: 500 }}>{wKl.lass}</span>
                    <span style={{ color: C.muted }}> · </span>
                    <span style={{ color: C.text, fontWeight: 500 }}>{fmtSv(wKl.volym, 0)}</span>
                    <span style={{ color: C.muted }}> m³</span>
                  </>
                ) : <span style={{ color: C.dim }}>W: —</span>}
              </div>
              <div>
                {eKl.lass > 0 ? (
                  <>
                    <span style={{ color: C.muted }}>EK: </span>
                    <span style={{ color: C.text, fontWeight: 500 }}>{eKl.lass}</span>
                    <span style={{ color: C.muted }}> · </span>
                    <span style={{ color: C.text, fontWeight: 500 }}>{fmtSv(eKl.volym, 0)}</span>
                    <span style={{ color: C.muted }}> m³</span>
                  </>
                ) : <span style={{ color: C.dim }}>EK: —</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── FordelningsStaplar ────────────────────────────────────────
// Horisontell avståndsprofil per maskin — visa på EN BLICK om maskinen
// kör nära (vänstertung) eller långt (högertung).
//
// Segmentbredd = andel lass i klassen. Nyansstyrka:
//   0-500m = full opacity → 2km+ = lite transparent
// Tal vita, enheter/prefix grå — samma princip som kontextraden.
//
// VERIFIERAT maj: Wisent 36/40/21/3 %, EK 16/9/33/42 %

// Omvandla hex (#RRGGBB) + opacity → rgba(r,g,b,a) så att
// text-barn inte påverkas av parent opacity.
function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

// Nyansstyrka per avståndsklass: nära = täckande, långt = lätt transparent
const KLASS_OPACITET = [1.0, 0.72, 0.48, 0.28]

function FordelningsStaplar({
  wisent, ek, loading,
}: {
  wisent:  MaskinAgg
  ek:      MaskinAgg
  loading: boolean
}) {
  const shares = (agg: MaskinAgg): number[] =>
    agg.klasser.map(kl => agg.totalLass > 0 ? (kl.lass / agg.totalLass) * 100 : 0)

  const wShares = shares(wisent)
  const eShares = shares(ek)

  // En rad per maskin
  const MaskinRad = ({
    maskin, agg, seg,
  }: {
    maskin: typeof WISENT
    agg:    MaskinAgg
    seg:    number[]
  }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      {/* Maskin-etikett (fast bredd) */}
      <div style={{ width: 52, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <div style={{ width: 7, height: 7, borderRadius: 1.5, background: maskin.color }} />
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>{maskin.kort}</span>
        </div>
        <div style={{ fontSize: 10, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>
          {agg.totalLass} lass
        </div>
      </div>

      {/* Stapel */}
      <div style={{
        flex: 1, height: 26, borderRadius: 5, overflow: 'hidden',
        display: 'flex', gap: 2, background: C.divider,
      }}>
        {seg.map((pct, ki) => {
          if (pct < 0.5) return null
          const bg       = hexToRgba(maskin.color, KLASS_OPACITET[ki])
          const showPct  = pct >= 10
          return (
            <div
              key={ki}
              style={{
                flex:            pct,
                background:      bg,
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                overflow:        'hidden',
                minWidth:        0,
              }}
            >
              {showPct && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: '#fff',
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: '0 1px 3px rgba(0,0,0,0.55)',
                  lineHeight: 1,
                }}>
                  {Math.round(pct)}%
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{ background: C.card, borderRadius: 14, padding: '16px 18px 14px', marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 14 }}>
        Avståndsprofil — lass
      </div>

      {loading ? (
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 12, color: C.muted }}>Laddar…</span>
        </div>
      ) : (
        <>
          <MaskinRad maskin={WISENT} agg={wisent} seg={wShares} />
          <MaskinRad maskin={EK}     agg={ek}     seg={eShares} />

          {/* Legende — visar vad de 4 nyanserna betyder */}
          <div style={{
            display: 'flex', gap: 12, marginTop: 8,
            paddingTop: 10, borderTop: `0.5px solid ${C.divider}`,
            flexWrap: 'wrap',
          }}>
            {KLASSER.map((kl, ki) => (
              <div key={ki} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: 2,
                  // Neutral blå för legende — visar nyansen oavsett maskin
                  background: hexToRgba(C.blue, KLASS_OPACITET[ki]),
                }} />
                <span style={{ fontSize: 11, color: C.muted }}>{kl.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── TotalRad ──────────────────────────────────────────────────
// Totaler för hela perioden (alla klasser kombinerade, viktat).
function TotalRad({
  wisent, ek, matt, loading,
}: {
  wisent: MaskinAgg; ek: MaskinAgg; matt: MattId; loading: boolean
}) {
  const mattDef = MATT.find(m => m.id === matt)!

  return (
    <div style={{
      background: C.card, borderRadius: 14,
      padding: '16px 18px', marginBottom: 12,
    }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
        Total perioden — viktat (SUM/SUM)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {([
          { maskin: WISENT, agg: wisent },
          { maskin: EK,     agg: ek     },
        ] as const).map(({ maskin, agg }) => {
          const val = mattTotal(agg, matt)
          return (
            <div key={maskin.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: maskin.color }} />
                <span style={{ fontSize: 12, color: C.muted }}>{maskin.kort}</span>
              </div>
              <div style={{
                fontSize: 28, fontWeight: 600, letterSpacing: -0.7,
                color: C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>
                {loading ? '—' : (val !== null ? fmtSv(val, mattDef.dec) : '—')}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{mattDef.unit}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                {agg.totalLass} lass · {fmtSv(agg.totalVolym, 0)} m³
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────
export default function SkotareJamforelseNy() {
  const [period,  setPeriod]  = useState<Period>('M')
  const [offset,  setOffset]  = useState(0)
  const [matt,    setMatt]    = useState<MattId>('lass')
  const [data,    setData]    = useState<{ wisent: MaskinAgg; ek: MaskinAgg } | null>(null)
  const [loading, setLoading] = useState(true)

  const { start, end, label } = getPeriodRange(period, offset)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchJamforelse(start, end)
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [start, end])

  const mattDef = MATT.find(m => m.id === matt)!

  return (
    <div style={{
      position: 'fixed', top: 152, left: 0, right: 0, bottom: 0,
      overflow: 'auto', background: C.bg, color: C.text, fontFamily: FONT,
    }}>

      {/* ── Period nav ─────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5, background: C.bg,
        borderBottom: `0.5px solid ${C.divider}`,
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Periodknappar V/M/K/Å */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(['V', 'M', 'K', 'Å'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setOffset(0) }}
              style={{
                background:  period === p ? C.divider : 'transparent',
                border:      'none',
                color:       period === p ? C.text : C.muted,
                fontFamily:  FONT,
                fontSize:    13,
                fontWeight:  period === p ? 600 : 400,
                padding:     '5px 10px',
                borderRadius: 7,
                cursor:      'pointer',
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Period-navigering ‹ etikett › */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setOffset(o => o - 1)}
            style={{ background: 'transparent', border: 'none', color: C.muted,
              fontFamily: FONT, fontSize: 18, cursor: 'pointer', padding: '2px 8px' }}
          >‹</button>
          <span style={{
            fontSize: 12, color: C.muted,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 130, textAlign: 'center',
          }}>
            {label}
          </span>
          <button
            onClick={() => setOffset(o => o + 1)}
            style={{ background: 'transparent', border: 'none', color: C.muted,
              fontFamily: FONT, fontSize: 18, cursor: 'pointer', padding: '2px 8px' }}
          >›</button>
        </div>
      </div>

      {/* ── Innehåll ─────────────────────────────────────────── */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '12px 16px 80px' }}>

        {/* Mått-väljare */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {MATT.map(m => (
            <button
              key={m.id}
              onClick={() => setMatt(m.id)}
              style={{
                background:   matt === m.id ? C.blue : C.card,
                border:       'none',
                color:        matt === m.id ? '#fff' : C.muted,
                fontFamily:   FONT,
                fontSize:     13,
                fontWeight:   matt === m.id ? 600 : 400,
                padding:      '7px 14px',
                borderRadius: 10,
                cursor:       'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Legende + subtitel */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', gap: 14 }}>
            {[WISENT, EK].map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: m.color }} />
                <span style={{ fontSize: 12, color: C.muted }}>{m.kort}</span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: 11, color: C.dim }}>
            {mattDef.unit}
            {matt === 'lm3'    && ' · maskintotal'}
            {matt === 'm3g15h' && ' · klassvolym/G15h'}
          </span>
        </div>

        {/* ── Fördelningsstaplar — grundvy, visar avståndsprofil på en blick ── */}
        {data && (
          <FordelningsStaplar
            wisent={data.wisent} ek={data.ek}
            loading={loading}
          />
        )}

        {/* ── Stapeldiagram per klass ── */}
        <div style={{ background: C.card, borderRadius: 14, padding: '16px 16px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 14 }}>
            {mattDef.label} per avståndsklass
          </div>
          {data ? (
            <BarChart
              wisent={data.wisent} ek={data.ek}
              matt={matt} loading={loading}
            />
          ) : (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: C.muted }}>Laddar…</span>
            </div>
          )}
        </div>

        {/* Totalrad */}
        {data && (
          <TotalRad
            wisent={data.wisent} ek={data.ek}
            matt={matt} loading={loading}
          />
        )}

        {/* Mått-specifika noter */}
        {matt === 'm3g15h' && (
          <div style={{
            background: C.card, border: `0.5px solid rgba(255,159,10,0.3)`,
            borderRadius: 14, padding: '14px 16px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 12, color: C.orange, fontWeight: 500, marginBottom: 5 }}>
              G15h-data troligen uppblåst
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              Skotarnas G15h innehåller troligen dubbelräkning (se Oversikt).
              Formel: (processing_sek + terrain_sek) / 3600 — identisk med övriga vyer.
              Siffran självläker när tidsdata är åtgärdad — ingen hårdkodad gräns.
            </div>
          </div>
        )}

        {matt === 'lm3' && (
          <div style={{
            background: C.card, border: `0.5px solid ${C.divider}`,
            borderRadius: 14, padding: '14px 16px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              <span style={{ color: C.text, fontWeight: 500 }}>L/m³ är ett maskinmått.</span>{' '}
              Bränsle registreras per maskin och dag — vi kan inte koppla det till enskilda
              avståndklasser. Alla staplar visar maskintotalen för perioden.
            </div>
          </div>
        )}

        {/* EK-volym-disclaimer (alltid synlig) */}
        <div style={{
          background: C.card, border: `0.5px solid ${C.divider}`,
          borderRadius: 14, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            <span style={{ color: C.text, fontWeight: 500 }}>Elephant King — volym (m³sub):</span>{' '}
            manuell schablon tills FPR-registrering är åtgärdad.
            Lass och avstånd (korstracka_m) är maskinmätta och tillförlitliga.
          </div>
        </div>

      </div>
    </div>
  )
}
