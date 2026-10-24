'use client'
import { underTopbar, AVSTAND, VIKT, TYP, RADIE, medSafeBotten, FARG, FONT, kolumnRot } from '@/lib/design/tokens'; // layoutmått, inte avstånd (tokens: LAYOUT)

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fmtSv, getPeriodRange, fetchAll, VolymBadge, type Period,
} from './OversiktShared'
import {
  hämtaManuellRader, harManuellData, fetchAllTimeLassTid, byggVolymPerDag, sumPerDag,
} from '@/lib/maskinvy/skotarvolym'
import { skotningsavstandM } from '@/lib/skotningsavstand'
import { g15Sek } from '@/lib/g15'
import {
  KLASSER, NK, getKlassIdx, kvot, valjJamforelseMaskiner, JAMFORELSE_FARG,
  ORSAK_INGEN_G15, ORSAK_INGEN_MASKIN,
} from '@/lib/maskinvy/jamforelse'
import { useJamforelseMaskinRader } from './useJamforelseMaskiner'

// ─────────────────────────────────────────────────────────────
// SkotareJamforelseNy — Wisent vs Elephant King, per avståndsklass
// Bakom ?ny=1, flik "Jämförelse" under Skotare.
//
// 4 mått × 5 avståndsklasser. INGEN vinnarkröning.
//
// G15h = (processing_sek + terrain_sek + other_work_sek) / 3600 via g15Sek
// (lib/g15) — den enda G15-definitionen.
//
// Maskinerna väljs ur dim_maskin per period (lib/maskinvy/jamforelse), aldrig
// som hårdkodade id:n. Saknas G15 för en maskin visas "–" med orsak.
//
// L/m³ är ett maskinmått — kan ej delas per klass.
//   Visas som maskintotal (identisk bar-höjd för alla klasser).
//
// m³/G15h per klass = klassvolym / total G15h för maskinen.
//   Ger "hur stor del av maskinens timmar driver varje klass".
//
// fakt_lass och fakt_tid hämtas ALLTID separat — aldrig joinade.
// ─────────────────────────────────────────────────────────────

// ── Sidor ─────────────────────────────────────────────────────
// Id:n bestäms per period ur dim_maskin (useJamforelseMaskinRader).
const WISENT = { namn: 'Ponsse Wisent', kort: 'Wisent', color: JAMFORELSE_FARG.wisent }
const EK     = { namn: 'Elephant King', kort: 'EK',     color: JAMFORELSE_FARG.ek }

// Avståndsklasserna (KLASSER, getKlassIdx) bor i lib/maskinvy/jamforelse.

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
  klasser:    KlassAgg[]  // ett index per KLASSER
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
// Ett MaskinAgg per maskin-id; sidorna (Wisent / EK) slås ihop efteråt, så en
// period som spänner över maskinbytet får båda Elephant King-maskinerna.
async function fetchJamforelse(
  start: string, end: string, ids: string[],
): Promise<Record<string, MaskinAgg>> {
  const map: Record<string, MaskinAgg> = {}
  for (const id of ids) map[id] = emptyAgg()
  if (ids.length === 0) return map

  // fakt_lass och fakt_tid — ALDRIG joinade (kritisk regel i CLAUDE.md)
  const [lassRows, tidRows] = await Promise.all([
    fetchAll('fakt_lass', 'maskin_id, volym_m3sub, korstracka_m', ids, start, end),
    fetchAll('fakt_tid',  'maskin_id, processing_sek, terrain_sek, other_work_sek, bransle_liter', ids, start, end),
  ])

  // Aggregera fakt_lass → klasser
  for (const r of lassRows) {
    const a = map[r.maskin_id]; if (!a) continue
    const v  = r.volym_m3sub  || 0
    const ki = getKlassIdx(skotningsavstandM(r.korstracka_m))
    a.klasser[ki].lass++
    a.klasser[ki].volym += v
    a.totalVolym += v
    a.totalLass++
  }

  // Aggregera fakt_tid → G15h + bränsle (g15Sek: processing + terrain + other_work)
  for (const r of tidRows) {
    const a = map[r.maskin_id]; if (!a) continue
    a.g15h    += g15Sek(r.processing_sek, r.terrain_sek, r.other_work_sek) / 3600
    a.bransle += parseFloat(r.bransle_liter) || 0
  }

  return map
}

function slaIhop(aggs: MaskinAgg[]): MaskinAgg {
  const ut = emptyAgg()
  for (const a of aggs) {
    a.klasser.forEach((kl, i) => { ut.klasser[i].lass += kl.lass; ut.klasser[i].volym += kl.volym })
    ut.g15h += a.g15h; ut.bransle += a.bransle
    ut.totalVolym += a.totalVolym; ut.totalLass += a.totalLass
  }
  return ut
}

// ── Måttberäkning ─────────────────────────────────────────────

/** Värde per klass (viktat SUM/SUM — aldrig snitt av snitt). */
function mattKlass(agg: MaskinAgg, ki: number, matt: MattId): number | null {
  const kl = agg.klasser[ki]
  if (matt === 'lass')      return kl.lass > 0                             ? kl.lass                          : null
  if (matt === 'snittlass') return kl.lass > 0                             ? kl.volym / kl.lass               : null
  if (matt === 'm3g15h')    return kvot(kl.volym, agg.g15h)
  // lm3: maskinmått — kan ej delas per klass. Visar maskintotal för alla klasser.
  return (agg.totalVolym > 0 && agg.bransle > 0) ? agg.bransle / agg.totalVolym : null
}

/** Totalvärde alla klasser kombinerat. */
function mattTotal(agg: MaskinAgg, matt: MattId): number | null {
  if (matt === 'lass')      return agg.totalLass > 0                           ? agg.totalLass                           : null
  if (matt === 'snittlass') return agg.totalLass > 0                           ? agg.totalVolym / agg.totalLass          : null
  if (matt === 'm3g15h')    return kvot(agg.totalVolym, agg.g15h)
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
        {cw > 0 && <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>Laddar…</span>}
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
                stroke={FARG.tonad} strokeWidth={0.5}
              />
              <text
                x={LEFT_PAD - 5} y={y + 3.5}
                textAnchor="end" fontSize={9}
                fill={FARG.text3} fontFamily={FONT}
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
                fill={FARG.text2} fontFamily={FONT}
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
        gap: 4, marginTop: AVSTAND.s,
      }}>
        {KLASSER.map((_, ki) => {
          const wKl = wisent.klasser[ki]
          const eKl = ek.klasser[ki]
          return (
            <div key={ki} style={{ fontSize: TYP.micro.fontSize, fontVariantNumeric: 'tabular-nums' }}>
              <div>
                {wKl.lass > 0 ? (
                  <>
                    <span style={{ color: FARG.text2 }}>W: </span>
                    <span style={{ color: FARG.text, fontWeight: VIKT.halvfet }}>{wKl.lass}</span>
                    <span style={{ color: FARG.text2 }}> · </span>
                    <span style={{ color: FARG.text, fontWeight: VIKT.halvfet }}>{fmtSv(wKl.volym, 0)}</span>
                    <span style={{ color: FARG.text2 }}> m³</span>
                  </>
                ) : <span style={{ color: FARG.text3 }}>W: —</span>}
              </div>
              <div>
                {eKl.lass > 0 ? (
                  <>
                    <span style={{ color: FARG.text2 }}>EK: </span>
                    <span style={{ color: FARG.text, fontWeight: VIKT.halvfet }}>{eKl.lass}</span>
                    <span style={{ color: FARG.text2 }}> · </span>
                    <span style={{ color: FARG.text, fontWeight: VIKT.halvfet }}>{fmtSv(eKl.volym, 0)}</span>
                    <span style={{ color: FARG.text2 }}> m³</span>
                  </>
                ) : <span style={{ color: FARG.text3 }}>EK: —</span>}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, marginBottom: AVSTAND.m }}>
      {/* Maskin-etikett (fast bredd) */}
      <div style={{ width: 52, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, marginBottom: AVSTAND.xs }}>
          <div style={{ width: 7, height: 7, borderRadius: RADIE.stapel, background: maskin.color }} />
          <span style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, fontWeight: VIKT.halvfet }}>{maskin.kort}</span>
        </div>
        <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text3, fontVariantNumeric: 'tabular-nums' }}>
          {agg.totalLass} lass
        </div>
      </div>

      {/* Stapel */}
      <div style={{
        flex: 1, height: 26, borderRadius: RADIE.stapel, overflow: 'hidden',
        display: 'flex', gap: AVSTAND.xs, background: FARG.upphojt,
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
                  fontSize: TYP.micro.fontSize, fontWeight: VIKT.fet, color: FARG.text,
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
    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.l}px`, marginBottom: 12 }}>
      <div style={{ fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text2, marginBottom: AVSTAND.l }}>
        Avståndsprofil — lass
      </div>

      {loading ? (
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>Laddar…</span>
        </div>
      ) : (
        <>
          <MaskinRad maskin={WISENT} agg={wisent} seg={wShares} />
          <MaskinRad maskin={EK}     agg={ek}     seg={eShares} />

          {/* Legende — visar vad de 4 nyanserna betyder */}
          <div style={{
            display: 'flex', gap: 12, marginTop: 8,
            paddingTop: AVSTAND.m, borderTop: `0.5px solid ${FARG.linje}`,
            flexWrap: 'wrap',
          }}>
            {KLASSER.map((kl, ki) => (
              <div key={ki} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
                <div style={{
                  width: 10, height: 10, borderRadius: RADIE.stapel,
                  // Neutral blå för legende — visar nyansen oavsett maskin
                  background: hexToRgba(FARG.bla, KLASS_OPACITET[ki]),
                }} />
                <span style={{ fontSize: TYP.micro.fontSize, color: FARG.text2 }}>{kl.label}</span>
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

/** Varför ett totalvärde saknas — visas under "–" så tomt aldrig är en gåta. */
function orsakSaknas(agg: MaskinAgg, harMaskin: boolean, matt: MattId): string {
  if (!harMaskin) return ORSAK_INGEN_MASKIN
  if (matt === 'm3g15h' && !(agg.g15h > 0)) return ORSAK_INGEN_G15
  if (matt === 'lm3' && agg.totalLass > 0 && !(agg.bransle > 0)) return 'Inget bränsle registrerat i perioden'
  return 'Inga lass i perioden'
}

function TotalRad({
  wisent, ek, matt, loading, harManuellWisent, harManuellEk, harMaskinWisent, harMaskinEk,
}: {
  wisent: MaskinAgg; ek: MaskinAgg; matt: MattId; loading: boolean
  harManuellWisent: boolean; harManuellEk: boolean
  harMaskinWisent: boolean; harMaskinEk: boolean
}) {
  const mattDef = MATT.find(m => m.id === matt)!
  const harManuell = { [WISENT.kort]: harManuellWisent, [EK.kort]: harManuellEk }
  const harMaskin  = { [WISENT.kort]: harMaskinWisent,  [EK.kort]: harMaskinEk }

  return (
    <div style={{
      background: FARG.kort, borderRadius: RADIE.kort,
      padding: `${AVSTAND.l}px ${AVSTAND.l}px`, marginBottom: 12,
    }}>
      <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, marginBottom: AVSTAND.l }}>
        Total perioden — viktat (SUM/SUM)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {([
          { maskin: WISENT, agg: wisent },
          { maskin: EK,     agg: ek     },
        ] as const).map(({ maskin, agg }) => {
          const val = mattTotal(agg, matt)
          return (
            <div key={maskin.kort}>
              <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: RADIE.stapel, background: maskin.color }} />
                <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>{maskin.kort}</span>
              </div>
              <div style={{
                fontSize: TYP.titel.fontSize, fontWeight: VIKT.halvfet, letterSpacing: -0.7,
                color: FARG.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>
                {loading ? '—' : (val !== null ? fmtSv(val, mattDef.dec) : '—')}
              </div>
              <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginTop: AVSTAND.xs }}>{mattDef.unit}</div>
              {!loading && val === null && (
                <div style={{ fontSize: TYP.micro.fontSize, color: FARG.orange, marginTop: AVSTAND.s }}>
                  {orsakSaknas(agg, harMaskin[maskin.kort] ?? false, matt)}
                </div>
              )}
              <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text3, marginTop: AVSTAND.s, fontVariantNumeric: 'tabular-nums' }}>
                {agg.totalLass} lass · {fmtSv(agg.totalVolym, 0)} m³
              </div>
              {!loading && (harMaskin[maskin.kort] ?? false) && (
                <div style={{ marginTop: AVSTAND.s }}>
                  <VolymBadge harManuell={harManuell[maskin.kort] ?? false} />
                </div>
              )}
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
  const [harManuellWisent, setHarManuellWisent] = useState(false)
  const [harManuellEk,     setHarManuellEk]     = useState(false)

  const { start, end, label } = getPeriodRange(period, offset)

  // Maskinerna ur dim_maskin för perioden — inga hårdkodade id:n.
  const { rader: maskinRader } = useJamforelseMaskinRader()
  const val = useMemo(
    () => (maskinRader ? valjJamforelseMaskiner(maskinRader, start, end) : null),
    [maskinRader, start, end],
  )
  const wisentIds = val?.wisent ?? []
  const ekIds     = val?.ek ?? []
  const idNyckel  = val ? `${wisentIds.join(',')}|${ekIds.join(',')}` : null

  useEffect(() => {
    if (idNyckel === null) return          // dim_maskin ännu inte läst
    let cancelled = false
    setLoading(true)
    const ids = [...wisentIds, ...ekIds]

    // Manuell korrigering hämtas per maskin, som i övriga skotarflikar.
    const manuellFor = (id: string) => hämtaManuellRader(id).then(async rader => {
      if (!harManuellData(rader)) return null
      const { lassRows, tidRows } = await fetchAllTimeLassTid([id])
      return { rader, lassRows, tidRows }
    }).catch(() => null)

    Promise.all([
      fetchJamforelse(start, end, ids),
      Promise.all(ids.map(manuellFor)),
    ]).then(([perId, manuella]) => {
      if (cancelled) return

      // Skalfaktor-korrigering per maskin: manuell total / raw total → applicera på alla klasser
      const harManuellId = new Set<string>()
      ids.forEach((id, i) => {
        const at = manuella[i]
        const agg = perId[id]
        if (!at || agg.totalVolym <= 0) return
        const { perDag, harManuell } = byggVolymPerDag(at.lassRows, at.rader, at.tidRows, id, start, end)
        if (!harManuell) return
        const scale = sumPerDag(perDag) / agg.totalVolym
        for (const kl of agg.klasser) kl.volym *= scale
        agg.totalVolym = sumPerDag(perDag)
        harManuellId.add(id)
      })

      setHarManuellWisent(wisentIds.some(id => harManuellId.has(id)))
      setHarManuellEk(ekIds.some(id => harManuellId.has(id)))
      setData({
        wisent: slaIhop(wisentIds.map(id => perId[id])),
        ek:     slaIhop(ekIds.map(id => perId[id])),
      })
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // wisentIds/ekIds härleds ur idNyckel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, idNyckel])

  const mattDef = MATT.find(m => m.id === matt)!

  return (
    <div style={{
      position: 'fixed', top: underTopbar(96), left: 0, right: 0, bottom: 0,
      overflow: 'auto', background: FARG.bg, color: FARG.text, fontFamily: FONT,
    }}>

      {/* ── Period nav ─────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5, background: FARG.bg,
        borderBottom: `0.5px solid ${FARG.linje}`,
        padding: `${AVSTAND.m}px ${AVSTAND.l}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Periodknappar V/M/K/Å */}
        <div style={{ display: 'flex', gap: AVSTAND.xs }}>
          {(['V', 'M', 'K', 'Å'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setOffset(0) }}
              style={{
                background:  period === p ? FARG.upphojt : 'transparent',
                border:      'none',
                color:       period === p ? FARG.text : FARG.text2,
                fontFamily:  FONT,
                fontSize: TYP.meta.fontSize,
                fontWeight: period === p ? VIKT.halvfet : VIKT.normal,
                padding: `${AVSTAND.xs}px ${AVSTAND.m}px`,
                borderRadius: RADIE.rad,
                cursor:      'pointer',
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Period-navigering ‹ etikett › */}
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
          <button
            onClick={() => setOffset(o => o - 1)}
            style={{ background: 'transparent', border: 'none', color: FARG.text2,
              fontFamily: FONT, fontSize: TYP.text.fontSize, cursor: 'pointer', padding: `${AVSTAND.xs}px ${AVSTAND.s}px` }}
          >‹</button>
          <span style={{
            fontSize: TYP.meta.fontSize, color: FARG.text2,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 130, textAlign: 'center',
          }}>
            {label}
          </span>
          <button
            onClick={() => setOffset(o => o + 1)}
            style={{ background: 'transparent', border: 'none', color: FARG.text2,
              fontFamily: FONT, fontSize: TYP.text.fontSize, cursor: 'pointer', padding: `${AVSTAND.xs}px ${AVSTAND.s}px` }}
          >›</button>
        </div>
      </div>

      {/* ── Innehåll ─────────────────────────────────────────── */}
      <div style={{ ...kolumnRot('smal'), padding: `${AVSTAND.m}px ${AVSTAND.l}px 0`, paddingBottom: medSafeBotten(AVSTAND.xxl) }}>

        {/* Mått-väljare */}
        <div style={{ display: 'flex', gap: AVSTAND.s, marginBottom: AVSTAND.l, flexWrap: 'wrap' }}>
          {MATT.map(m => (
            <button
              key={m.id}
              onClick={() => setMatt(m.id)}
              style={{
                background:   matt === m.id ? FARG.bla : FARG.kort,
                border:       'none',
                color:        matt === m.id ? FARG.text : FARG.text2,
                fontFamily:   FONT,
                fontSize: TYP.meta.fontSize,
                fontWeight: matt === m.id ? VIKT.halvfet : VIKT.normal,
                padding: `${AVSTAND.s}px ${AVSTAND.l}px`,
                borderRadius: RADIE.kort,
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
          justifyContent: 'space-between', marginBottom: AVSTAND.l,
        }}>
          <div style={{ display: 'flex', gap: AVSTAND.l }}>
            {[WISENT, EK].map(m => (
              <div key={m.kort} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
                <div style={{ width: 10, height: 10, borderRadius: RADIE.stapel, background: m.color }} />
                <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>{m.kort}</span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: TYP.micro.fontSize, color: FARG.text3 }}>
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
        <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: '16px 16px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text2, marginBottom: AVSTAND.l }}>
            {mattDef.label} per avståndsklass
          </div>
          {data ? (
            <BarChart
              wisent={data.wisent} ek={data.ek}
              matt={matt} loading={loading}
            />
          ) : (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>Laddar…</span>
            </div>
          )}
        </div>

        {/* Totalrad */}
        {data && (
          <TotalRad
            wisent={data.wisent} ek={data.ek}
            matt={matt} loading={loading}
            harManuellWisent={harManuellWisent}
            harManuellEk={harManuellEk}
            harMaskinWisent={wisentIds.length > 0}
            harMaskinEk={ekIds.length > 0}
          />
        )}

        {/* Mått-specifika noter */}
        {matt === 'm3g15h' && (
          <div style={{
            background: FARG.kort, border: `0.5px solid ${FARG.linje}`,
            borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px`, marginBottom: 12,
          }}>
            <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, lineHeight: 1.5 }}>
              <span style={{ color: FARG.text, fontWeight: VIKT.halvfet }}>G15h</span> =
              (processing + terräng + övrigt arbete) / 3 600 — samma definition som
              övriga vyer. Totalen är viktad: summa volym / summa G15h.
            </div>
          </div>
        )}

        {matt === 'lm3' && (
          <div style={{
            background: FARG.kort, border: `0.5px solid ${FARG.linje}`,
            borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px`, marginBottom: 12,
          }}>
            <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, lineHeight: 1.5 }}>
              <span style={{ color: FARG.text, fontWeight: VIKT.halvfet }}>L/m³ är ett maskinmått.</span>{' '}
              Bränsle registreras per maskin och dag — vi kan inte koppla det till enskilda
              avståndklasser. Alla staplar visar maskintotalen för perioden.
            </div>
          </div>
        )}

        {/* Volymkälla */}
        <div style={{
          background: FARG.kort, border: `0.5px solid ${FARG.linje}`,
          borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px`,
        }}>
          <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, lineHeight: 1.5 }}>
            <span style={{ color: FARG.text, fontWeight: VIKT.halvfet }}>Volym (m³sub):</span>{' '}
            maskinmätt per lass (FPR). Objekt med manuell korrigering
            (skotare_objekt_manuell) fördelas per dag — märket under varje maskin
            visar om korrigering ingår. Lass och körd sträcka är maskinmätta.
            Avståndsklasserna visar skotningsavstånd (enkel väg) — halva den körda
            sträckan, som maskinen mäter tur och retur.
          </div>
        </div>

      </div>
    </div>
  )
}
