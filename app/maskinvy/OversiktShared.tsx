'use client'

// ─────────────────────────────────────────────────────────────
// Delad mellan OversiktNy och OperatorDeepView (och kommande djupvyer)
//
// Alla typer, helpers, datakällor och vy-primitives ligger här så att
// nästa djupvy (objekt/inköpare/...) kan återanvända samma kort utan
// att kopiera kod.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { translateKategori } from '@/lib/avbrott-kategorier'

// ─────────────────────────────────────────────────────────────
// iOS systemfärger (exakt) + bas-tokens
// ─────────────────────────────────────────────────────────────
export const C = {
  bg:       '#000000',
  card:     '#1c1c1e',
  divider:  '#2c2c2e',
  green:    '#30d158',
  red:      '#ff453a',
  orange:   '#ff9f0a',
  blue:     '#0a84ff',
  purple:   '#5e5ce6',
  yellow:   '#ffd60a',
  text:     '#ffffff',
  muted:    '#8e8e93',
  dim:      '#48484a',
}

export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif'

// ─────────────────────────────────────────────────────────────
// Formatter — svensk locale, komma som decimaltecken
// ─────────────────────────────────────────────────────────────
export function fmtSv(num: number | null | undefined, dec: number = 0): string {
  if (num === null || num === undefined || !isFinite(num)) return '—'
  return num.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function fmtSvDelta(pct: number): string {
  const abs = Math.abs(pct).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (pct > 0) return `+${abs} %`
  if (pct < 0) return `−${abs} %`
  return `${abs} %`
}

export type Delta = { pct: number; direction: 'up' | 'down' | 'flat' }

export function calcDelta(current: number | null, previous: number | null, lowerIsBetter = false): Delta | null {
  if (current === null || previous === null) return null
  if (!isFinite(current) || !isFinite(previous)) return null
  if (previous === 0) return null
  const pct = (current - previous) / previous * 100
  let direction: Delta['direction']
  if (pct === 0) direction = 'flat'
  else if (lowerIsBetter) direction = pct < 0 ? 'up' : 'down'
  else direction = pct > 0 ? 'up' : 'down'
  return { pct, direction }
}

// ─────────────────────────────────────────────────────────────
// Maskiner + period
// ─────────────────────────────────────────────────────────────
export type Maskin = { id: string; namn: string }
export type Period = 'V' | 'M' | 'K' | 'Å'

export const MASKINER: Maskin[] = [
  { id: 'PONS20SDJAA270231', namn: 'Ponsse Scorpion Giant 8W' },
  { id: 'R64101',            namn: 'Rottne H8E (ny)' },
  { id: 'R64101+R64428',     namn: 'Rottne H8E (båda)' },
]

export const COMBO_IDS: Record<string, string[]> = { 'R64101+R64428': ['R64101', 'R64428'] }
const MONTHS = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December']

export function getPeriodRange(p: Period, offset: number): { start: string; end: string; label: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (p === 'V') {
    const day = now.getDay() || 7
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1 + offset * 7)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    const oneJan = new Date(mon.getFullYear(), 0, 1)
    const w = Math.ceil(((mon.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7)
    return { start: fmt(mon), end: fmt(sun), label: `Vecka ${w} · ${mon.getFullYear()}` }
  }
  if (p === 'K') {
    const curQ = Math.floor(now.getMonth() / 3)
    const totalQ = now.getFullYear() * 4 + curQ + offset
    const year = Math.floor(totalQ / 4)
    const qIdx = ((totalQ % 4) + 4) % 4
    const qs = new Date(year, qIdx * 3, 1)
    const qe = new Date(year, qIdx * 3 + 3, 0)
    return { start: fmt(qs), end: fmt(qe), label: `Kvartal ${qIdx + 1} · ${year}` }
  }
  if (p === 'Å') {
    const y = now.getFullYear() + offset
    return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}` }
  }
  const ms = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const me = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { start: fmt(ms), end: fmt(me), label: `${MONTHS[ms.getMonth()]} ${ms.getFullYear()}` }
}

// ─────────────────────────────────────────────────────────────
// Datatyper
// ─────────────────────────────────────────────────────────────
export type Operator = {
  id: string; namn: string;
  g15h: number; volym: number; stammar: number; dagar: number; prod: number | null;
}

export type AvbrottKat = { kategori: string; sek: number; antal: number }

export type Data = {
  volym: number; stammar: number; g15h: number
  produktivitet: number | null
  medelstam: number | null
  bransleTotalt: number
  branslePerM3: number | null
  stammarPerG15h: number | null
  proc: number; terr: number; kort: number; avbr: number; rast: number
  dagar: number               // distinkta produktionsdagar
  operatorer: Operator[]      // filter: volym > 0 || stammar > 0
  avbrottPerKat: AvbrottKat[] // sorterad fallande på sek
}

// ─────────────────────────────────────────────────────────────
// Datahämtning — slim, separat per tabell
// ─────────────────────────────────────────────────────────────
async function fetchAll(
  table: string, sel: string, ids: string[], start: string, end: string,
  operatorId?: string,
): Promise<any[]> {
  const PAGE = 1000
  let rows: any[] = []
  let off = 0
  while (true) {
    let q = supabase.from(table)
      .select(sel)
      .in('maskin_id', ids)
      .gte('datum', start).lte('datum', end)
    if (operatorId) q = q.eq('operator_id', operatorId)
    const { data } = await q.range(off, off + PAGE - 1)
    const batch = data || []
    rows = rows.concat(batch)
    if (batch.length < PAGE) break
    off += PAGE
  }
  return rows
}

/**
 * Hämtar Data för en period, eventuellt filtrerad på operatorId.
 * Prod och tid hämtas separat och aggregeras separat — aldrig cross-joinade.
 */
export async function fetchData(
  maskinId: string, start: string, end: string, operatorId?: string,
): Promise<Data> {
  const ids = COMBO_IDS[maskinId] || [maskinId]

  const [prodRows, tidRows, avbrRows, opRes] = await Promise.all([
    fetchAll('fakt_produktion', 'datum, volym_m3sub, stammar, operator_id', ids, start, end, operatorId),
    fetchAll('fakt_tid', 'operator_id, processing_sek, terrain_sek, kort_stopp_sek, rast_sek, bransle_liter', ids, start, end, operatorId),
    fetchAll('fakt_avbrott', 'kategori_kod, langd_sek', ids, start, end, operatorId),
    operatorId
      ? Promise.resolve({ data: [] as Array<{ operator_id: string; operator_namn: string }> })
      : supabase.from('dim_operator').select('operator_id, operator_namn').in('maskin_id', ids),
  ])

  const opNames: Record<string, string> = {}
  for (const o of ((opRes as any).data || [])) opNames[o.operator_id] = o.operator_namn

  // fakt_produktion → total + per operator + distinkta dagar
  let volym = 0, stammar = 0
  const prodDays = new Set<string>()
  const prodByOp: Record<string, { vol: number; st: number; dagar: Set<string> }> = {}
  for (const r of prodRows) {
    volym   += r.volym_m3sub || 0
    stammar += r.stammar || 0
    const hasProd = (r.volym_m3sub || 0) > 0 || (r.stammar || 0) > 0
    if (hasProd) prodDays.add(r.datum)
    if (r.operator_id) {
      if (!prodByOp[r.operator_id]) prodByOp[r.operator_id] = { vol: 0, st: 0, dagar: new Set() }
      prodByOp[r.operator_id].vol += r.volym_m3sub || 0
      prodByOp[r.operator_id].st  += r.stammar || 0
      if (hasProd) prodByOp[r.operator_id].dagar.add(r.datum)
    }
  }

  // fakt_tid → total + per operator
  let proc = 0, terr = 0, kort = 0, rast = 0, bransle = 0
  const tidByOp: Record<string, { proc: number; terr: number }> = {}
  for (const r of tidRows) {
    proc    += r.processing_sek || 0
    terr    += r.terrain_sek || 0
    kort    += r.kort_stopp_sek || 0
    rast    += r.rast_sek || 0
    bransle += parseFloat(r.bransle_liter) || 0
    if (r.operator_id) {
      if (!tidByOp[r.operator_id]) tidByOp[r.operator_id] = { proc: 0, terr: 0 }
      tidByOp[r.operator_id].proc += r.processing_sek || 0
      tidByOp[r.operator_id].terr += r.terrain_sek || 0
    }
  }

  // fakt_avbrott → total + per kategori
  let avbr = 0
  const katAgg: Record<string, { sek: number; antal: number }> = {}
  for (const r of avbrRows) {
    const sek = r.langd_sek || 0
    avbr += sek
    const kat = r.kategori_kod || 'Övrigt'
    if (!katAgg[kat]) katAgg[kat] = { sek: 0, antal: 0 }
    katAgg[kat].sek += sek
    katAgg[kat].antal += 1
  }
  const avbrottPerKat: AvbrottKat[] = Object.entries(katAgg)
    .map(([kategori, v]) => ({ kategori, sek: v.sek, antal: v.antal }))
    .sort((a, b) => b.sek - a.sek)

  const g15h = (proc + terr) / 3600
  const produktivitet  = g15h > 0    ? volym / g15h    : null
  const medelstam      = stammar > 0 ? volym / stammar : null
  const branslePerM3   = volym > 0   ? bransle / volym : null
  const stammarPerG15h = g15h > 0    ? stammar / g15h  : null

  // Operatörer — filter: måste ha producerat något (volym > 0 || stammar > 0)
  // Det filtrerar bort "Service Service" som har g15h > 0 men 0 produktion.
  const allOpIds = new Set<string>([...Object.keys(prodByOp), ...Object.keys(tidByOp)])
  const operatorer: Operator[] = Array.from(allOpIds).map(id => {
    const p = prodByOp[id] || { vol: 0, st: 0, dagar: new Set<string>() }
    const t = tidByOp[id]  || { proc: 0, terr: 0 }
    const opG15h = (t.proc + t.terr) / 3600
    return {
      id,
      namn: opNames[id] || id,
      g15h: opG15h,
      volym: p.vol,
      stammar: p.st,
      dagar: p.dagar.size,
      prod: opG15h > 0 ? p.vol / opG15h : null,
    }
  })
  .filter(o => o.volym > 0 || o.stammar > 0)
  .sort((a, b) => b.volym - a.volym)

  return {
    volym, stammar, g15h, produktivitet, medelstam,
    bransleTotalt: bransle, branslePerM3, stammarPerG15h,
    proc, terr, kort, avbr, rast,
    dagar: prodDays.size,
    operatorer, avbrottPerKat,
  }
}

// ─────────────────────────────────────────────────────────────
// Trend-serie — 6 perioder bakåt, en sjavtest = 1 prod + 1 tid
// ─────────────────────────────────────────────────────────────
export type PeriodKpi = {
  label: string
  hasData: boolean
  produktivitet: number | null
  volym: number | null
  stammar: number | null
  medelstam: number | null
  branslePerM3: number | null
  stammarPerG15h: number | null
}

const MIN_DAYS_PER_PERIOD = 2

export async function fetchSeries(
  maskinId: string, period: Period, offset: number, operatorId?: string,
): Promise<PeriodKpi[]> {
  const ids = COMBO_IDS[maskinId] || [maskinId]

  const ranges: { start: string; end: string; label: string }[] = []
  for (let i = 5; i >= 0; i--) ranges.push(getPeriodRange(period, offset - i))

  const spanStart = ranges[0].start
  const spanEnd   = ranges[ranges.length - 1].end

  const [prodRows, tidRows] = await Promise.all([
    fetchAll('fakt_produktion', 'datum, volym_m3sub, stammar', ids, spanStart, spanEnd, operatorId),
    fetchAll('fakt_tid', 'datum, processing_sek, terrain_sek, bransle_liter', ids, spanStart, spanEnd, operatorId),
  ])

  const bucketOf = (datum: string): number => {
    for (let i = 0; i < ranges.length; i++) {
      if (datum >= ranges[i].start && datum <= ranges[i].end) return i
    }
    return -1
  }

  const buckets = ranges.map(() => ({
    volym: 0, stammar: 0, proc: 0, terr: 0, bransle: 0,
    prodDays: new Set<string>(),
  }))

  for (const r of prodRows) {
    const b = bucketOf(r.datum); if (b < 0) continue
    buckets[b].volym   += r.volym_m3sub || 0
    buckets[b].stammar += r.stammar || 0
    if ((r.volym_m3sub || 0) > 0 || (r.stammar || 0) > 0) buckets[b].prodDays.add(r.datum)
  }
  for (const r of tidRows) {
    const b = bucketOf(r.datum); if (b < 0) continue
    buckets[b].proc    += r.processing_sek || 0
    buckets[b].terr    += r.terrain_sek || 0
    buckets[b].bransle += parseFloat(r.bransle_liter) || 0
  }

  return buckets.map((b, i) => {
    const g15h = (b.proc + b.terr) / 3600
    const hasData = b.prodDays.size >= MIN_DAYS_PER_PERIOD
    if (!hasData) {
      return {
        label: ranges[i].label, hasData: false,
        produktivitet: null, volym: null, stammar: null,
        medelstam: null, branslePerM3: null, stammarPerG15h: null,
      }
    }
    return {
      label: ranges[i].label, hasData: true,
      produktivitet:   g15h > 0                       ? b.volym / g15h     : null,
      volym:           b.volym > 0                    ? b.volym             : null,
      stammar:         b.stammar > 0                  ? b.stammar           : null,
      medelstam:       b.stammar > 0                  ? b.volym / b.stammar : null,
      branslePerM3:    (b.volym > 0 && b.bransle > 0) ? b.bransle / b.volym : null,
      stammarPerG15h:  (g15h > 0 && b.stammar > 0)    ? b.stammar / g15h    : null,
    }
  })
}

// ─────────────────────────────────────────────────────────────
// Primitives: DeltaBadge, Sparkline, HeroChart, MiniTrend
// ─────────────────────────────────────────────────────────────
export function DeltaBadge({
  current, previous, lowerIsBetter = false, size = 'sm',
}: {
  current: number | null
  previous: number | null
  lowerIsBetter?: boolean
  size?: 'sm' | 'md'
}) {
  const d = calcDelta(current, previous, lowerIsBetter)
  const fontSize = size === 'md' ? 13 : 11
  if (d === null) {
    return <span style={{ fontSize, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>—</span>
  }
  const color = d.direction === 'up' ? C.green : d.direction === 'down' ? C.red : C.muted
  return (
    <span style={{ fontSize, fontWeight: 500, color, fontVariantNumeric: 'tabular-nums' }}>
      {fmtSvDelta(d.pct)}
    </span>
  )
}

export function Sparkline({
  values, width, height, color, fillOpacity = 0, lastDot = false,
}: {
  values: (number | null)[]
  width: number
  height: number
  color: string
  fillOpacity?: number
  lastDot?: boolean
}) {
  const valid = values.filter((v): v is number => v !== null && isFinite(v))
  if (valid.length < 2 || width <= 0 || height <= 0) return null

  const vmin = Math.min(...valid)
  const vmax = Math.max(...valid)
  const vrange = vmax - vmin || Math.max(Math.abs(vmax), 1)
  const headroom = vrange * 0.1
  const min = vmin - headroom
  const max = vmax + headroom
  const range = max - min

  const PAD = 3
  const w = width - PAD * 2
  const h = height - PAD * 2
  const xStep = values.length > 1 ? w / (values.length - 1) : 0

  const points = values.map((v, i) => {
    if (v === null || !isFinite(v)) return null
    return { x: PAD + i * xStep, y: PAD + h - ((v - min) / range) * h }
  })

  const segments: Array<Array<{ x: number; y: number }>> = []
  let cur: Array<{ x: number; y: number }> = []
  for (const p of points) {
    if (p === null) { if (cur.length > 0) { segments.push(cur); cur = [] } }
    else cur.push(p)
  }
  if (cur.length > 0) segments.push(cur)

  const baseY = PAD + h

  const fills = fillOpacity > 0
    ? segments.map((seg, i) => {
        if (seg.length < 2) return null
        const d = `M ${seg[0].x} ${baseY} L ${seg[0].x} ${seg[0].y} ` +
          seg.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') +
          ` L ${seg[seg.length - 1].x} ${baseY} Z`
        return <path key={`f${i}`} d={d} fill={color} opacity={fillOpacity} />
      })
    : null

  const lines = segments.map((seg, i) => {
    if (seg.length < 2) return null
    const d = `M ${seg[0].x} ${seg[0].y} ` + seg.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    return (
      <path key={`l${i}`} d={d} stroke={color} strokeWidth={1.5} fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
    )
  })

  let dot = null
  if (lastDot) {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i]) { dot = <circle cx={points[i]!.x} cy={points[i]!.y} r={3} fill={color} />; break }
    }
  }

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {fills}
      {lines}
      {dot}
    </svg>
  )
}

export function HeroChart({ values }: { values: (number | null)[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    setW(ref.current.clientWidth)
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(Math.max(0, Math.floor(e.contentRect.width)))
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} style={{ width: '100%', height: 60 }}>
      {w > 0 && (
        <Sparkline values={values} width={w} height={60} color={C.green} fillOpacity={0.12} lastDot />
      )}
    </div>
  )
}

export function MiniTrend({ values }: { values: (number | null)[] }) {
  const validCount = values.filter(v => v !== null && isFinite(v as number)).length
  if (validCount < 2) return <span style={{ fontSize: 10, color: C.dim }}>—</span>
  return <Sparkline values={values} width={80} height={22} color="#636366" />
}

// AndelBadge — visar förarens del av maskinens total. Neutral färg
// (det är inte bra/dåligt, bara hur stor del).
export function AndelBadge({
  part, total, size = 'sm',
}: {
  part: number | null
  total: number | null
  size?: 'sm' | 'md'
}) {
  const fontSize = size === 'md' ? 13 : 11
  if (part === null || total === null || !isFinite(part) || !isFinite(total) || total === 0) {
    return <span style={{ fontSize, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>—</span>
  }
  const pct = Math.round(part / total * 100)
  return (
    <span style={{ fontSize, fontWeight: 500, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
      {pct} %
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// HeroCard — använd både för Översikt och djupvyer
// `prev` = värdet att jämföra mot (föregående period i Översikt,
// maskinens värde i djupvyn). `referenceLabel` styr förklaringstexten.
// ─────────────────────────────────────────────────────────────
export function HeroCard({
  label, unit, dec, value, prev, series,
  lowerIsBetter = false,
  referenceLabel = 'mot föregående period',
  loading,
}: {
  label: string
  unit: string
  dec: number
  value: number | null
  prev: number | null
  series: PeriodKpi[] | null
  lowerIsBetter?: boolean
  referenceLabel?: string
  loading: boolean
}) {
  const trendValues = series?.map(p => p.produktivitet) ?? []
  const trendValid  = trendValues.filter(v => v !== null && isFinite(v as number)).length

  return (
    <div style={{ background: C.card, borderRadius: 14, padding: '22px 22px 18px', marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 12, letterSpacing: -0.1 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{
          fontSize: 40, fontWeight: 600, letterSpacing: -1.2,
          color: C.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        }}>
          {loading ? '—' : (value !== null ? fmtSv(value, dec) : '—')}
        </div>
        <div style={{ fontSize: 14, color: C.muted }}>{unit}</div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {loading
          ? <span style={{ fontSize: 13, color: C.dim }}>—</span>
          : <DeltaBadge current={value} previous={prev} lowerIsBetter={lowerIsBetter} size="md" />}
        <span style={{ fontSize: 11, color: C.dim }}>{referenceLabel}</span>
      </div>

      <div style={{ marginTop: 16, height: 60 }}>
        {loading ? (
          <div style={{
            height: 60, borderRadius: 8, background: 'rgba(255,255,255,0.025)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.dim, fontSize: 11,
          }}>—</div>
        ) : trendValid < 2 ? (
          <div style={{
            height: 60, borderRadius: 8, background: 'rgba(255,255,255,0.025)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.dim, fontSize: 11,
          }}>För lite trenddata</div>
        ) : (
          <HeroChart values={trendValues} />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// KpiList — 5 rader, samma i Översikt och djupvy. `mode` styr om
// jämförelse-kolumnen visar procentdelta ('previous'/'machine' för
// hastighetsmått) eller andel ('machine' för totalmått Volym/Stammar).
// ─────────────────────────────────────────────────────────────
type KpiMetric = 'volym' | 'stammar' | 'medelstam' | 'branslePerM3' | 'stammarPerG15h'

export function KpiList({
  data, prev, series, loading,
  mode = 'previous',
  subtitle,
}: {
  data: Data | null
  prev: Data | null
  series: PeriodKpi[] | null
  loading: boolean
  mode?: 'previous' | 'machine'
  subtitle?: string
}) {
  type Row = {
    label: string; metric: KpiMetric
    cur: number | null; prev: number | null
    unit: string; dec: number; lowerIsBetter: boolean
    kind: 'rate' | 'total'
  }
  const rows: Row[] = [
    { label: 'Volym',         metric: 'volym',          cur: data?.volym ?? null,           prev: prev?.volym ?? null,           unit: 'm³sub',   dec: 0, lowerIsBetter: false, kind: 'total' },
    { label: 'Stammar',       metric: 'stammar',        cur: data?.stammar ?? null,         prev: prev?.stammar ?? null,         unit: 'st',      dec: 0, lowerIsBetter: false, kind: 'total' },
    { label: 'Medelstam',     metric: 'medelstam',      cur: data?.medelstam ?? null,       prev: prev?.medelstam ?? null,       unit: 'm³/stam', dec: 2, lowerIsBetter: false, kind: 'rate'  },
    { label: 'Bränsle/m³',    metric: 'branslePerM3',   cur: data?.branslePerM3 ?? null,    prev: prev?.branslePerM3 ?? null,    unit: 'L/m³',    dec: 2, lowerIsBetter: true,  kind: 'rate'  },
    { label: 'Stammar/G15h',  metric: 'stammarPerG15h', cur: data?.stammarPerG15h ?? null,  prev: prev?.stammarPerG15h ?? null,  unit: 'st/G15h', dec: 1, lowerIsBetter: false, kind: 'rate'  },
  ]

  return (
    <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
      {subtitle && (
        <div style={{
          fontSize: 11, color: C.muted, padding: '14px 16px 0',
          letterSpacing: 0.2, fontWeight: 500,
        }}>
          {subtitle}
        </div>
      )}
      {rows.map((r, i) => {
        const trendValues = (series ?? []).map(p => p[r.metric])
        // I 'machine'-mode visar totalmått andel av maskinen; hastighetsmått visar procentdelta.
        const showAndel = mode === 'machine' && r.kind === 'total'
        return (
          <button
            key={r.label}
            type="button"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 56px 80px 14px',
              gap: 14, alignItems: 'center',
              padding: '14px 16px',
              borderTop: i > 0 ? `0.5px solid ${C.divider}` : 'none',
              background: 'transparent', border: 'none', width: '100%',
              color: C.text, fontFamily: FONT, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 15, color: C.text }}>{r.label}</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: C.text, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
              {loading ? '—' : (r.cur !== null ? fmtSv(r.cur, r.dec) : '—')}
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 4, fontWeight: 400 }}>{r.unit}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              {loading
                ? <span style={{ fontSize: 11, color: C.dim }}>—</span>
                : showAndel
                  ? <AndelBadge part={r.cur} total={r.prev} size="sm" />
                  : <DeltaBadge current={r.cur} previous={r.prev} lowerIsBetter={r.lowerIsBetter} size="sm" />}
            </div>
            <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              {loading
                ? <span style={{ fontSize: 10, color: C.dim }}>—</span>
                : <MiniTrend values={trendValues} />}
            </div>
            <div style={{ color: C.dim, fontSize: 16, textAlign: 'right' }}>›</div>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TimeDistribution — stapel + legend, fungerar med maskin- eller operator-data
// ─────────────────────────────────────────────────────────────
export function TimeDistribution({ data, loading }: { data: Data | null; loading: boolean }) {
  const segments = [
    { key: 'proc', label: 'Process',     color: C.green  },
    { key: 'terr', label: 'Kör',         color: C.blue   },
    { key: 'kort', label: 'Korta stopp', color: C.purple },
    { key: 'avbr', label: 'Avbrott',     color: C.red    },
    { key: 'rast', label: 'Rast',        color: C.muted  },
  ] as const

  const values = data ? { proc: data.proc, terr: data.terr, kort: data.kort, avbr: data.avbr, rast: data.rast } : null
  const total = values ? Object.values(values).reduce((s, x) => s + x, 0) : 0

  return (
    <div style={{ background: C.card, borderRadius: 14, padding: 18, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 14 }}>Tidsfördelning</div>
      <div style={{
        display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden',
        background: 'rgba(255,255,255,0.04)', gap: 2,
      }}>
        {(!loading && values && total > 0) && segments.map(s => {
          const pct = (values[s.key] as number) / total * 100
          if (pct < 0.5) return null
          return <div key={s.key} style={{ flex: pct, background: s.color }} />
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14 }}>
        {segments.map(s => {
          const v = values ? (values[s.key] as number) : 0
          const pct = total > 0 ? Math.round(v / total * 100) : null
          const hours = v / 3600
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
              <span style={{ color: C.muted }}>{s.label}</span>
              <span style={{ color: C.text, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {loading || pct === null ? '—' : `${pct}%`}
              </span>
              <span style={{ color: C.dim, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                · {loading || !values ? '—' : `${fmtSv(hours, 1)}h`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AvbrottCard — per kategori, eller tomt-tillstånd
// ─────────────────────────────────────────────────────────────
function fmtHm(sek: number): string {
  const min = Math.round(sek / 60)
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m} min`
}

export function AvbrottCard({ data, loading }: { data: Data | null; loading: boolean }) {
  return (
    <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, padding: '18px 16px 10px' }}>
        Avbrott
      </div>
      {loading ? (
        <div style={{ color: C.dim, fontSize: 13, padding: '0 16px 18px' }}>Laddar…</div>
      ) : !data || data.avbrottPerKat.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 13, padding: '0 16px 18px' }}>
          Inga avbrott registrerade
        </div>
      ) : data.avbrottPerKat.map((k, i) => (
        <div
          key={k.kategori}
          style={{
            display: 'grid',
            gridTemplateColumns: '8px 1fr auto auto',
            gap: 10, alignItems: 'center',
            padding: '12px 16px',
            borderTop: `0.5px solid ${C.divider}`,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: 2, background: C.red, opacity: 0.7 }} />
          <div style={{ fontSize: 14, color: C.text }}>{translateKategori(k.kategori)}</div>
          <div style={{ fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
            {k.antal} {k.antal === 1 ? 'gång' : 'ggr'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.text, fontVariantNumeric: 'tabular-nums', minWidth: 70, textAlign: 'right' }}>
            {fmtHm(k.sek)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// OperatorList — initialer, namn, G15h + m³/G15h, volym + chevron
// Klickbar via onSelect — utan: bara visning.
// ─────────────────────────────────────────────────────────────
export function initials(namn: string): string {
  const parts = namn.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return namn.substring(0, 2).toUpperCase()
}

export function OperatorList({ operatorer, loading, onSelect }: {
  operatorer: Operator[]
  loading: boolean
  onSelect?: (op: Operator) => void
}) {
  return (
    <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, padding: '18px 16px 10px' }}>
        Operatörer
      </div>
      {loading ? (
        <div style={{ color: C.dim, fontSize: 13, padding: '0 16px 18px' }}>Laddar…</div>
      ) : operatorer.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 13, padding: '0 16px 18px' }}>
          Inga operatörer för perioden
        </div>
      ) : operatorer.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={onSelect ? () => onSelect(o) : undefined}
          style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr auto 14px',
            gap: 12, alignItems: 'center',
            padding: '12px 16px',
            borderTop: `0.5px solid ${C.divider}`,
            background: 'transparent', border: 'none', width: '100%',
            color: C.text, fontFamily: FONT,
            cursor: onSelect ? 'pointer' : 'default', textAlign: 'left',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 18,
            background: 'rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 500, color: C.text,
          }}>{initials(o.namn)}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{o.namn}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              {fmtSv(o.g15h, 0)} G15h · {o.prod !== null ? fmtSv(o.prod, 1) : '—'} m³/G15h
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: C.text, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            {fmtSv(o.volym, 0)}
            <span style={{ fontSize: 11, color: C.muted, marginLeft: 3, fontWeight: 400 }}>m³</span>
          </div>
          <div style={{ color: C.dim, fontSize: 16, textAlign: 'right' }}>›</div>
        </button>
      ))}
    </div>
  )
}
