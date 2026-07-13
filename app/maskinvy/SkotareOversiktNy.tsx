'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  C, FONT, getPeriodRange, fetchAll,
  fmtSv, DeltaBadge, Sparkline, OperatorList, initials,
  type Period, type Operator,
} from './OversiktShared'
import { FLYTT_KATEGORI } from '../../lib/avbrott-kategorier'

// ─────────────────────────────────────────────────────────────
// SkotareOversiktNy — Översikt för skotare bakom ?ny=1.
//
// Skotaren avverkar inte — den kör ut virke från fält till väg.
// Datakälla: fakt_lass (volym, körsträcka) + fakt_tid (G15h) +
// fakt_avbrott (avbrott/flytt — SAMMA källa som avbrottsvyn,
// SkotareAvbrottNy, så de två vyerna alltid visar samma siffror).
// Tabellerna hämtas ALDRIG i samma query — de aggregeras var
// för sig och kombineras sedan i JS.
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
  proc:         number   // processing_sek summerat (G15h-tid)
  terr:         number   // terrain_sek summerat (G15h-tid)
  avbr:         number   // fakt_avbrott exkl. flytt (= avbrottsvyns "Stopp")
  flytt:        number   // fakt_avbrott Trailer transportation (= avbrottsvyns flyttkort)
  // Tomgång: MOTOR-mätning som överlappar väggklocke-hinkarna — eget nyckeltal,
  // ALDRIG segment i tidsfördelningen (dubbelräknas annars).
  tomgangSek:   number
  engineSek:    number
}

// Per-operatör i djupvyn
type SkotareOpData = {
  lass:         number
  volym:        number
  snittLass:    number | null
  snittSträcka: number | null
  g15h:         number
  prod:         number | null   // m³/G15h, viktat
  dagar:        number
  proc:         number
  terr:         number
  avbr:         number
  flytt:        number
  distKlasser:  DistKlass[]
}

type SkotareSerie = { label: string; hasData: boolean; volym: number | null }

// ── Tidshjälp ─────────────────────────────────────────────────
function fmtTid(sek: number): string {
  const h = Math.floor(sek / 3600)
  const m = Math.floor((sek % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── Datahämtning ─────────────────────────────────────────────

async function fetchSkotareData(
  maskinId: string, start: string, end: string,
): Promise<SkotareData> {
  const ids = [maskinId]

  // Hämta fakt_lass, fakt_tid och fakt_avbrott SEPARAT — aldrig i samma query
  const [lassRows, tidRows, avbrottRows] = await Promise.all([
    fetchAll('fakt_lass', 'datum, volym_m3sub, korstracka_m', ids, start, end),
    fetchAll('fakt_tid',  'processing_sek, terrain_sek, tomgang_sek, engine_time_sek', ids, start, end),
    fetchAll('fakt_avbrott', 'kategori_kod, langd_sek', ids, start, end),
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

  // ── fakt_tid → G15h + tomgång (summeras fristående, aldrig join mot lass) ──
  let proc = 0, terr = 0, tomgangSek = 0, engineSek = 0
  for (const r of tidRows) {
    proc       += r.processing_sek  || 0
    terr       += r.terrain_sek     || 0
    tomgangSek += r.tomgang_sek     || 0
    engineSek  += r.engine_time_sek || 0
  }
  const g15h = (proc + terr) / 3600

  // ── fakt_avbrott → avbrott + flytt ──────────────────────────
  // SAMMA källa som avbrottsvyn: alla DownTime-rader oavsett längd
  // (skotare har ingen G15-split — se lib/g15.ts), flytt utlyft precis
  // som avbrottsvyns flyttkort. OBS: INTE fakt_tid.avbrott_sek — den
  // hinken är bara Övrigt+Reparation (Underhåll/Störning ligger i
  // maintenance_sek/disturbance_sek) och gav en annan total än
  // avbrottsvyn för samma period.
  let avbr = 0, flytt = 0
  for (const r of avbrottRows) {
    if (r.kategori_kod === FLYTT_KATEGORI) flytt += r.langd_sek || 0
    else                                   avbr  += r.langd_sek || 0
  }

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
    proc,
    terr,
    avbr,
    flytt,
    tomgangSek,
    engineSek,
  }
}

// ── Operatörslista ────────────────────────────────────────────
// fakt_lass och fakt_tid hämtas SEPARAT per operator_id och slås
// samman i JS. Aldrig en direkt join — det dubbelräknar tidsdatan.
//
// m³/G15h = SUM(volym_m3sub från fakt_lass) / SUM(g15h från fakt_tid)
// Precis som skördaren men med lass-volym i täljaren.

async function fetchSkotareOperatorer(
  maskinId: string, start: string, end: string,
): Promise<Operator[]> {
  const ids = [maskinId]

  const [lassRows, tidRows, opRes] = await Promise.all([
    fetchAll('fakt_lass', 'datum, volym_m3sub, operator_id', ids, start, end),
    fetchAll('fakt_tid',  'datum, operator_id, processing_sek, terrain_sek', ids, start, end),
    supabase.from('dim_operator').select('operator_id, operator_namn').in('maskin_id', ids),
  ])

  // Namn-lookup
  const opNames: Record<string, string> = {}
  for (const o of ((opRes as any).data || [])) {
    if (o.operator_id) opNames[o.operator_id] = o.operator_namn
  }

  // Aggregera fakt_lass per operator_id → volym + distinkta dagar
  const lassByOp: Record<string, { volym: number; dagar: Set<string> }> = {}
  for (const r of lassRows) {
    const id = r.operator_id
    if (!id) continue
    if (!lassByOp[id]) lassByOp[id] = { volym: 0, dagar: new Set() }
    lassByOp[id].volym += r.volym_m3sub || 0
    if (r.datum) lassByOp[id].dagar.add(r.datum)
  }

  // Aggregera fakt_tid per operator_id → G15h (SEPARAT, aldrig join mot lass)
  const tidByOp: Record<string, { proc: number; terr: number }> = {}
  for (const r of tidRows) {
    const id = r.operator_id
    if (!id) continue
    if (!tidByOp[id]) tidByOp[id] = { proc: 0, terr: 0 }
    tidByOp[id].proc += r.processing_sek || 0
    tidByOp[id].terr += r.terrain_sek    || 0
  }

  // Slå ihop, beräkna m³/G15h, filtrera och sortera alfabetiskt
  const allIds = new Set([...Object.keys(lassByOp), ...Object.keys(tidByOp)])
  return Array.from(allIds)
    .map(id => {
      const l = lassByOp[id] || { volym: 0, dagar: new Set<string>() }
      const t = tidByOp[id]  || { proc: 0, terr: 0 }
      const g15h = (t.proc + t.terr) / 3600
      return {
        id,
        namn:    opNames[id] || id,
        g15h,
        volym:   l.volym,
        stammar: 0,                               // skotare har inga stammar
        dagar:   l.dagar.size,
        prod:    g15h > 0 ? l.volym / g15h : null, // m³/G15h, viktat
      } satisfies Operator
    })
    .filter(o => o.volym > 0)                     // skippa perioder utan lass
    .sort((a, b) => a.namn.localeCompare(b.namn, 'sv'))
}

// ── Djupvydata per operatör ────────────────────────────────────
// Hämtar fakt_lass + fakt_tid + fakt_avbrott för hela maskinen och
// filtrerar sedan på operator_id i JS. Aldrig join mot varandra.

async function fetchSkotareOpDeep(
  maskinId: string, opId: string, start: string, end: string,
): Promise<SkotareOpData> {
  const ids = [maskinId]
  const [lassRows, tidRows, avbrottRows] = await Promise.all([
    fetchAll('fakt_lass', 'datum, volym_m3sub, korstracka_m, operator_id', ids, start, end),
    fetchAll('fakt_tid',  'datum, operator_id, processing_sek, terrain_sek', ids, start, end),
    fetchAll('fakt_avbrott', 'operator_id, kategori_kod, langd_sek', ids, start, end),
  ])

  const lassOp    = (lassRows    as any[]).filter(r => r.operator_id === opId)
  const tidOp     = (tidRows     as any[]).filter(r => r.operator_id === opId)
  const avbrottOp = (avbrottRows as any[]).filter(r => r.operator_id === opId)

  let volym = 0, totalDist = 0
  const dagSet = new Set<string>()
  const klassCounts = DIST_KLASSER.map(() => 0)
  for (const r of lassOp) {
    volym     += r.volym_m3sub || 0
    const dist = r.korstracka_m || 0
    totalDist += dist
    if (r.datum) dagSet.add(r.datum)
    for (let i = DIST_KLASSER.length - 1; i >= 0; i--) {
      if (dist >= DIST_KLASSER[i].min) { klassCounts[i]++; break }
    }
  }
  const lass = lassOp.length

  let proc = 0, terr = 0
  for (const r of tidOp) {
    proc += r.processing_sek || 0
    terr += r.terrain_sek    || 0
  }
  const g15h = (proc + terr) / 3600

  // fakt_avbrott → avbrott + flytt, samma uppdelning som maskinnivån
  let avbr = 0, flytt = 0
  for (const r of avbrottOp) {
    if (r.kategori_kod === FLYTT_KATEGORI) flytt += r.langd_sek || 0
    else                                   avbr  += r.langd_sek || 0
  }

  return {
    lass, volym,
    snittLass:    lass > 0 ? volym / lass     : null,
    snittSträcka: lass > 0 ? totalDist / lass : null,
    g15h,
    prod: g15h > 0 ? volym / g15h : null,
    dagar: dagSet.size,
    proc, terr, avbr, flytt,
    distKlasser: DIST_KLASSER.map((k, i) => ({
      label: k.label, farg: k.farg,
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

// ── Elephant King-not ─────────────────────────────────────────
// Visas i operatörslistan OCH i djupvyn för A110148.
function EkDisclaimer() {
  return (
    <div style={{
      background: 'rgba(255,159,10,0.10)',
      border: '0.5px solid rgba(255,159,10,0.30)',
      borderRadius: 10, padding: '10px 14px', marginBottom: 14,
      fontSize: 12, color: '#ff9f0a', lineHeight: 1.5,
    }}>
      Volym/lass registreras inte komplett än – m³/G15h blir korrekt när registreringen är igång.
    </div>
  )
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
function SkotareKpiList({
  data, prev, loading,
}: {
  data:    SkotareData | null
  prev:    SkotareData | null
  loading: boolean
}) {
  // Tomgång: eget nyckeltal (motoraxel, överlappar hinkarna — aldrig i tidsför-
  // delningen). Delta jämför ANDELEN av motortid (lägre är bättre) — timmar
  // skalar med periodlängd. Visas för ALLA maskiner; skotarens låga andel
  // (~0,5–1 %) är kvittot, inte ett skäl att gömma måttet.
  type Row = {
    label: string; val: number | null; prevVal: number | null
    unit: string; dec: number; lowerIsBetter?: boolean; display?: string
  }
  const tomgangAndel = (d: SkotareData | null) =>
    d && d.engineSek > 0 ? (d.tomgangSek / d.engineSek) * 100 : null
  const tomgangDisplay = data && data.engineSek > 0
    ? `${fmtSv(data.tomgangSek / 3600, 0)}h · ${fmtSv((data.tomgangSek / data.engineSek) * 100, 1)}%`
    : undefined
  const rows: Row[] = [
    { label: 'Lass',         val: data?.lass          ?? null, prevVal: prev?.lass          ?? null, unit: 'st',      dec: 0 },
    { label: 'Snittlass',    val: data?.snittLass      ?? null, prevVal: prev?.snittLass      ?? null, unit: 'm³/lass', dec: 1 },
    { label: 'Snittsträcka', val: data?.snittSträcka   ?? null, prevVal: prev?.snittSträcka   ?? null, unit: 'm',       dec: 0 },
    { label: 'Lass/G15h',    val: data?.lassPerG15h    ?? null, prevVal: prev?.lassPerG15h    ?? null, unit: 'st/G15h', dec: 1 },
    { label: 'Tomgång',      val: tomgangAndel(data),           prevVal: tomgangAndel(prev),           unit: '%',       dec: 1, lowerIsBetter: true, display: tomgangDisplay },
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
            {loading ? '—' : r.display ?? (r.val !== null ? fmtSv(r.val, r.dec) : '—')}
            {!(!loading && r.display) && (
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 4, fontWeight: 400 }}>
                {r.unit}
              </span>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            {loading
              ? <span style={{ fontSize: 11, color: C.dim }}>—</span>
              : <DeltaBadge current={r.val} previous={r.prevVal} lowerIsBetter={r.lowerIsBetter ?? false} size="sm" />}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tidsfördelning ────────────────────────────────────────────
// Fyra segment: Processing (grön), Terrängkörning (blå), Avbrott (röd),
// Flytt (lila). Avbrott + Flytt kommer från fakt_avbrott — SAMMA källa
// och SAMMA uppdelning som avbrottsvyn (SkotareAvbrottNy: "Stopp" resp.
// flyttkortet), så översikt och avbrottsvy visar alltid samma siffror.
// Skotare har ingen korta pauser-split (se lib/g15.ts) — allt visas.
function SkotareTidsfordelning({
  data, loading,
}: {
  data:    { proc: number; terr: number; avbr: number; flytt: number } | null
  loading: boolean
}) {
  const segments = [
    { key: 'proc'  as const, label: 'Processing',     color: C.green  },
    { key: 'terr'  as const, label: 'Terrängkörning', color: C.blue   },
    { key: 'avbr'  as const, label: 'Avbrott',        color: C.red    },
    { key: 'flytt' as const, label: 'Flytt',          color: C.purple },
  ]
  const total = data ? data.proc + data.terr + data.avbr + data.flytt : 0

  return (
    <div style={{ background: C.card, borderRadius: 14, padding: 18, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 14 }}>
        Tidsfördelning
      </div>
      {/* Staplad proportionsstapel */}
      <div style={{
        display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden',
        background: 'rgba(255,255,255,0.04)', gap: 2,
      }}>
        {(!loading && data && total > 0) && segments.map(s => {
          const pct = data[s.key] / total * 100
          if (pct < 0.5) return null
          return <div key={s.key} style={{ flex: pct, background: s.color }} />
        })}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14 }}>
        {segments.map(s => {
          const v = data ? data[s.key] : 0
          const pct = total > 0 ? Math.round(v / total * 100) : null
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
              <span style={{ color: C.muted }}>{s.label}</span>
              <span style={{ color: C.text, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {loading || pct === null ? '—' : `${pct}%`}
              </span>
              <span style={{ color: C.muted, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                · {loading || !data ? '—' : fmtTid(v)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Körsträcka per lass ───────────────────────────────────────
// Staplad proportionsstapel + legend, liknande SkotareTidsfordelning.
// Accepterar SkotareData och SkotareOpData (båda har lass + distKlasser).
function DistKlasserKort({
  data, loading,
}: {
  data:    { lass: number; distKlasser: DistKlass[] } | null
  loading: boolean
}) {
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

// ── Operatör-djupvy ───────────────────────────────────────────
// Glider in från höger med slide-animation (identisk mekanism som
// skördarens OperatorDeepView). Stänger via onClose / Escape / ‹-knapp.
//
// Visar per förare: utkört m³, lass, m³/G15h, snittlass,
// snittsträcka, tidsfördelning, avståndsprofil.
// EK-disclaimer visas för A110148.
function SkotareOperatorDeepView({
  maskin, period, offset, periodLabel, operator, onClose,
}: {
  maskin:      { id: string; namn: string }
  period:      Period
  offset:      number
  periodLabel: string
  operator:    Operator
  onClose:     () => void
}) {
  const [data, setData]       = useState<SkotareOpData | null>(null)
  const [loading, setLoading] = useState(true)
  const [shown, setShown]     = useState(false)

  // Slide-in-animation: montera med translateX(100%), animera till 0.
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 10)
    return () => window.clearTimeout(t)
  }, [])

  // Stäng med animation: slide ut → onClose när animationen är klar.
  const handleClose = () => {
    setShown(false)
    window.setTimeout(onClose, 280)
  }

  // Stäng på Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hämta förarens data för perioden
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const { start, end } = getPeriodRange(period, offset)
    fetchSkotareOpDeep(maskin.id, operator.id, start, end)
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [maskin.id, period, offset, operator.id])

  const isEK = maskin.id === 'A110148'

  const kpiRows = [
    { label: 'Utkört',       val: data?.volym       ?? null, unit: 'm³sub',   dec: 0 },
    { label: 'Lass',         val: data?.lass         ?? null, unit: 'st',      dec: 0 },
    { label: 'm³/G15h',      val: data?.prod         ?? null, unit: 'm³/G15h', dec: 1 },
    { label: 'Snittlass',    val: data?.snittLass    ?? null, unit: 'm³/lass', dec: 1 },
    { label: 'Snittsträcka', val: data?.snittSträcka ?? null, unit: 'm',       dec: 0 },
  ]

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
        background: C.bg, borderBottom: `0.5px solid ${C.divider}`,
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
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
            {periodLabel}
            <span style={{ color: C.muted }}> · </span>
            {loading ? '—' : `${fmtSv(data?.g15h ?? 0, 0)} G15h`}
            <span style={{ color: C.muted }}> · </span>
            {loading ? '—' : `${data?.dagar ?? 0} ${(data?.dagar ?? 0) === 1 ? 'dag' : 'dagar'}`}
          </div>
        </div>
      </div>

      {/* Innehåll */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '8px 16px 80px' }}>
        {/* EK-disclaimer — bara för Elephant King */}
        {isEK && <EkDisclaimer />}

        {/* KPI-lista */}
        <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
          {kpiRows.map((r, i) => (
            <div
              key={r.label}
              style={{
                display: 'grid', gridTemplateColumns: '1fr auto',
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
            </div>
          ))}
        </div>

        {/* Tidsfördelning */}
        <SkotareTidsfordelning data={data} loading={loading} />

        {/* Avståndsprofil */}
        <DistKlasserKort data={data} loading={loading} />
      </div>
    </div>
  )
}

// ── Huvud-komponent ───────────────────────────────────────────
export default function SkotareOversiktNy() {
  type Maskin = typeof SKOTARE[number]
  const [maskin, setMaskin]             = useState<Maskin>(SKOTARE[0])
  const [period, setPeriod]             = useState<Period>('M')
  const [offset, setOffset]             = useState(0)
  const [data,     setData]             = useState<SkotareData | null>(null)
  const [prevData, setPrevData]         = useState<SkotareData | null>(null)
  const [serie,    setSerie]            = useState<SkotareSerie[]>([])
  const [operatorer, setOperatorer]     = useState<Operator[]>([])
  const [loading,  setLoading]          = useState(false)
  const [maskinOpen, setMaskinOpen]     = useState(false)
  const [deepOperator, setDeepOperator] = useState<Operator | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const cur  = getPeriodRange(period, offset)
    const prev = getPeriodRange(period, offset - 1)

    Promise.all([
      fetchSkotareData(maskin.id, cur.start,  cur.end ).catch(() => null),
      fetchSkotareData(maskin.id, prev.start, prev.end).catch(() => null),
      fetchSkotareSerie(maskin.id, period, offset).catch(() => []),
      fetchSkotareOperatorer(maskin.id, cur.start, cur.end).catch(() => []),
    ]).then(([curD, prevD, ser, ops]) => {
      if (cancelled) return
      // 65%-regel: visa delta bara om föregående period har jämförbar täckning.
      const prevValid = (prevD?.dagar ?? 0) >= (curD?.dagar ?? 0) * 0.65
      setData(curD)
      setPrevData(prevValid ? prevD : null)
      setSerie(ser ?? [])
      setOperatorer(ops ?? [])
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [maskin.id, period, offset])

  // Stäng djupvyn automatiskt när maskin eller period ändras
  useEffect(() => {
    setDeepOperator(null)
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
        <SkotareTidsfordelning data={data} loading={loading} />
        <DistKlasserKort data={data} loading={loading} />
        <OperatorList
          operatorer={operatorer}
          loading={loading}
          onSelect={(op) => setDeepOperator(op)}
        />
        {maskin.id === 'A110148' && <EkDisclaimer />}
      </div>

      {/* Operatör-djupvy som overlay */}
      {deepOperator && (
        <SkotareOperatorDeepView
          maskin={maskin}
          period={period}
          offset={offset}
          periodLabel={label}
          operator={deepOperator}
          onClose={() => setDeepOperator(null)}
        />
      )}
    </div>
  )
}
