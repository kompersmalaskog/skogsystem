'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { translateKategori } from '@/lib/avbrott-kategorier'
import {
  C, FONT, MASKINER, COMBO_IDS, getPeriodRange, fetchAll,
  fmtSv, fmtTid, initials,
  type Maskin, type Period,
} from './OversiktShared'

// ─────────────────────────────────────────────────────────────
// Produktion-vyn (?ny=1&vy=produktion) — DAGLIG del.
//
// Svarar på: "vilka dagar var bra/dåliga, och vad hände?"
// (Inte "hur går det just nu" → Idag. Inte "hur trendar maskinen"
//  → Översikt.)
//
// Steg 1: kontextrad + stapeldiagram (V/M) + kalender (V/M/K)
// + dag-detaljpanel. Steg 2 (senare): K/Å-gruppering och
// flytt/service-dagtyper.
// ─────────────────────────────────────────────────────────────

// ── Datatyper ────────────────────────────────────────────────
type DagInfo = {
  datum: string
  vol: number
  stammar: number
  objektNamn: string[]
  forareNamn: string[]
  avbrott: { kategori: string; sek: number; antal: number }[]
}

type ProduktionData = {
  totalVolym: number
  totalStammar: number
  arbetsdagar: number
  m3PerArbetsdag: number
  perDag: Record<string, DagInfo>
  start: string
  end: string
}

// ── Datahämtning ─────────────────────────────────────────────
async function fetchProduktion(maskinId: string, start: string, end: string): Promise<ProduktionData> {
  const ids = COMBO_IDS[maskinId] || [maskinId]

  const [prodRows, avbrRows, opRes, objRes] = await Promise.all([
    fetchAll('fakt_produktion', 'datum, volym_m3sub, stammar, operator_id, objekt_id', ids, start, end),
    fetchAll('fakt_avbrott', 'datum, kategori_kod, langd_sek', ids, start, end),
    supabase.from('dim_operator').select('operator_id, operator_namn').in('maskin_id', ids),
    supabase.from('dim_objekt').select('objekt_id, object_name'),
  ])

  const opNames: Record<string, string> = {}
  for (const o of ((opRes as any).data || [])) opNames[o.operator_id] = o.operator_namn

  const objNames: Record<string, string> = {}
  for (const o of ((objRes as any).data || [])) objNames[o.objekt_id] = o.object_name

  const perDag: Record<string, DagInfo> = {}
  const objektSets: Record<string, Set<string>> = {}
  const forareSets: Record<string, Set<string>> = {}
  const ensure = (datum: string): DagInfo => {
    if (!perDag[datum]) {
      perDag[datum] = { datum, vol: 0, stammar: 0, objektNamn: [], forareNamn: [], avbrott: [] }
    }
    return perDag[datum]
  }

  for (const r of prodRows) {
    if (!r.datum) continue
    const d = ensure(r.datum)
    d.vol += r.volym_m3sub || 0
    d.stammar += r.stammar || 0
    if (r.objekt_id) {
      if (!objektSets[r.datum]) objektSets[r.datum] = new Set()
      objektSets[r.datum].add(r.objekt_id)
    }
    if (r.operator_id) {
      if (!forareSets[r.datum]) forareSets[r.datum] = new Set()
      forareSets[r.datum].add(r.operator_id)
    }
  }

  for (const [datum, oSet] of Object.entries(objektSets)) {
    ensure(datum).objektNamn = Array.from(oSet).map(id => objNames[id] || id).sort()
  }
  for (const [datum, fSet] of Object.entries(forareSets)) {
    ensure(datum).forareNamn = Array.from(fSet).map(id => opNames[id] || id).sort()
  }

  // Avbrott per kategori per dag
  const avbrottAgg: Record<string, Record<string, { sek: number; antal: number }>> = {}
  for (const r of avbrRows) {
    if (!r.datum) continue
    const kat = r.kategori_kod || 'Övrigt'
    if (!avbrottAgg[r.datum]) avbrottAgg[r.datum] = {}
    if (!avbrottAgg[r.datum][kat]) avbrottAgg[r.datum][kat] = { sek: 0, antal: 0 }
    avbrottAgg[r.datum][kat].sek += r.langd_sek || 0
    avbrottAgg[r.datum][kat].antal += 1
  }
  for (const [datum, kats] of Object.entries(avbrottAgg)) {
    ensure(datum).avbrott = Object.entries(kats)
      .map(([kategori, v]) => ({ kategori, sek: v.sek, antal: v.antal }))
      .sort((a, b) => b.sek - a.sek)
  }

  let totalVolym = 0, totalStammar = 0, arbetsdagar = 0
  for (const d of Object.values(perDag)) {
    totalVolym += d.vol
    totalStammar += d.stammar
    if (d.vol > 0) arbetsdagar++
  }

  return {
    totalVolym, totalStammar, arbetsdagar,
    m3PerArbetsdag: arbetsdagar > 0 ? totalVolym / arbetsdagar : 0,
    perDag, start, end,
  }
}

// ─────────────────────────────────────────────────────────────
// Bucket — en stapel i diagrammet. För V/M en dag, för K en
// vecka, för Å en månad. Innehåller all data som dagpanelen
// behöver så aggregeringen sker en gång och panelen läser därifrån.
// ─────────────────────────────────────────────────────────────
type BucketKind = 'day' | 'week' | 'month'
type Bucket = {
  kind: BucketKind
  key: string                                  // unik id
  start: string                                // ISO yyyy-mm-dd (klippt till perioden)
  end: string                                  // ISO yyyy-mm-dd (klippt till perioden)
  label: string                                // x-axel ("1/5", "v.18", "Maj")
  titleLabel: string                           // panel-titel
  vol: number
  stammar: number
  objektNamn: string[]
  forareNamn: string[]
  avbrott: { kategori: string; sek: number; antal: number }[]
  arbetsdagar: number                          // antal dagar med vol > 0 i bucketen
}

const MAANAD_KORT = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec']
const MAANAD_FULL = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december']
const VECKODAG    = ['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag']

function pad2(n: number): string { return String(n).padStart(2, '0') }
function fmtISO(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}` }

// ISO 8601 veckonummer. Vecka 1 = veckan som innehåller årets första torsdag.
function isoWeek(d: Date): { week: number; year: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (t.getUTCDay() + 6) % 7      // 0=Mon..6=Sun
  t.setUTCDate(t.getUTCDate() - dayNum + 3)   // hoppa till torsdagen i den veckan
  const year = t.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 4))
  const ysDayNum = (yearStart.getUTCDay() + 6) % 7
  const week = 1 + Math.round((((t.getTime() - yearStart.getTime()) / 86400000) - 3 + ysDayNum) / 7)
  return { week, year }
}

function mondayOf(d: Date): Date {
  const r = new Date(d)
  const dow = (r.getDay() + 6) % 7
  r.setDate(r.getDate() - dow)
  return r
}

// Slå ihop avbrott från flera dagar till ett gemensamt set per kategori.
function aggregateAvbrott(days: DagInfo[]): Bucket['avbrott'] {
  const agg: Record<string, { sek: number; antal: number }> = {}
  for (const d of days) {
    for (const a of d.avbrott) {
      if (!agg[a.kategori]) agg[a.kategori] = { sek: 0, antal: 0 }
      agg[a.kategori].sek += a.sek
      agg[a.kategori].antal += a.antal
    }
  }
  return Object.entries(agg)
    .map(([kategori, v]) => ({ kategori, sek: v.sek, antal: v.antal }))
    .sort((a, b) => b.sek - a.sek)
}

function buildDailyBuckets(perDag: Record<string, DagInfo>, start: string, end: string): Bucket[] {
  const sD = new Date(start + 'T12:00:00')
  const eD = new Date(end + 'T12:00:00')
  const totalDays = Math.round((eD.getTime() - sD.getTime()) / 86400000) + 1
  const out: Bucket[] = []
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(sD); d.setDate(sD.getDate() + i)
    const datum = fmtISO(d)
    const dag = perDag[datum]
    out.push({
      kind: 'day',
      key: datum,
      start: datum,
      end: datum,
      label: `${d.getDate()}/${d.getMonth()+1}`,
      titleLabel: `${VECKODAG[d.getDay()]} ${d.getDate()} ${MAANAD_FULL[d.getMonth()]} ${d.getFullYear()}`,
      vol: dag?.vol ?? 0,
      stammar: dag?.stammar ?? 0,
      objektNamn: dag?.objektNamn ?? [],
      forareNamn: dag?.forareNamn ?? [],
      avbrott: dag?.avbrott ?? [],
      arbetsdagar: (dag?.vol ?? 0) > 0 ? 1 : 0,
    })
  }
  return out
}

function buildWeeklyBuckets(perDag: Record<string, DagInfo>, start: string, end: string): Bucket[] {
  const sD = new Date(start + 'T12:00:00')
  const eD = new Date(end + 'T12:00:00')
  const firstMon = mondayOf(sD)
  const out: Bucket[] = []
  for (let cur = new Date(firstMon); cur <= eD; cur.setDate(cur.getDate() + 7)) {
    const weekEnd = new Date(cur); weekEnd.setDate(cur.getDate() + 6)
    const { week, year } = isoWeek(cur)
    // Klipp till periodens gränser
    const bStart = cur < sD ? sD : cur
    const bEnd   = weekEnd > eD ? eD : weekEnd
    // Aggregera dagar inom veckan OCH inom perioden
    const days: DagInfo[] = []
    let vol = 0, stammar = 0, arbetsdagar = 0
    const objSet = new Set<string>(), forSet = new Set<string>()
    for (let i = 0; i < 7; i++) {
      const d = new Date(cur); d.setDate(cur.getDate() + i)
      if (d < sD || d > eD) continue
      const dag = perDag[fmtISO(d)]
      if (!dag) continue
      days.push(dag)
      vol += dag.vol
      stammar += dag.stammar
      if (dag.vol > 0) arbetsdagar++
      dag.objektNamn.forEach(n => objSet.add(n))
      dag.forareNamn.forEach(n => forSet.add(n))
    }
    const bsLow = `${bStart.getDate()} ${MAANAD_FULL[bStart.getMonth()].slice(0,3)}`
    const beLow = `${bEnd.getDate()} ${MAANAD_FULL[bEnd.getMonth()].slice(0,3)}`
    out.push({
      kind: 'week',
      key: `week-${fmtISO(cur)}`,
      start: fmtISO(bStart),
      end: fmtISO(bEnd),
      label: `v.${week}`,
      titleLabel: `Vecka ${week} · ${bsLow}–${beLow} ${year}`,
      vol, stammar,
      objektNamn: Array.from(objSet).sort(),
      forareNamn: Array.from(forSet).sort(),
      avbrott: aggregateAvbrott(days),
      arbetsdagar,
    })
  }
  return out
}

function buildMonthlyBuckets(perDag: Record<string, DagInfo>, start: string, end: string): Bucket[] {
  const sD = new Date(start + 'T12:00:00')
  const eD = new Date(end + 'T12:00:00')
  const out: Bucket[] = []
  for (let cur = new Date(sD.getFullYear(), sD.getMonth(), 1); cur <= eD; cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)) {
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
    const bStart = cur < sD ? sD : cur
    const bEnd   = monthEnd > eD ? eD : monthEnd
    const days: DagInfo[] = []
    let vol = 0, stammar = 0, arbetsdagar = 0
    const objSet = new Set<string>(), forSet = new Set<string>()
    for (const [datum, dag] of Object.entries(perDag)) {
      const d = new Date(datum + 'T12:00:00')
      if (d.getFullYear() !== cur.getFullYear() || d.getMonth() !== cur.getMonth()) continue
      if (d < sD || d > eD) continue
      days.push(dag)
      vol += dag.vol
      stammar += dag.stammar
      if (dag.vol > 0) arbetsdagar++
      dag.objektNamn.forEach(n => objSet.add(n))
      dag.forareNamn.forEach(n => forSet.add(n))
    }
    out.push({
      kind: 'month',
      key: `month-${cur.getFullYear()}-${pad2(cur.getMonth()+1)}`,
      start: fmtISO(bStart),
      end: fmtISO(bEnd),
      label: MAANAD_KORT[cur.getMonth()],
      titleLabel: `${MAANAD_FULL[cur.getMonth()].charAt(0).toUpperCase() + MAANAD_FULL[cur.getMonth()].slice(1)} ${cur.getFullYear()}`,
      vol, stammar,
      objektNamn: Array.from(objSet).sort(),
      forareNamn: Array.from(forSet).sort(),
      avbrott: aggregateAvbrott(days),
      arbetsdagar,
    })
  }
  return out
}

// ── MetricKort ───────────────────────────────────────────────
function MetricKort({ label, value, unit, dec = 0, loading }: {
  label: string
  value: number | null
  unit: string
  dec?: number
  loading: boolean
}) {
  return (
    <div style={{ background: C.card, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, fontWeight: 500 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{
          fontSize: 24, fontWeight: 600, letterSpacing: -0.6,
          color: C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>
          {loading ? '—' : (value !== null ? fmtSv(value, dec) : '—')}
        </div>
        {unit && <div style={{ fontSize: 12, color: C.muted }}>{unit}</div>}
      </div>
    </div>
  )
}

// ── BarChart (handritad SVG) ─────────────────────────────────
// Generisk: tar key/label/vol och returnerar key på klick. Vad
// "key" betyder (dag, vecka, månad) bestäms av caller.
function BarChart({ data, onBarClick }: {
  data: { key: string; label: string; vol: number }[]
  onBarClick: (key: string) => void
}) {
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

  const H = 180
  const PAD_TOP = 14
  const PAD_BOTTOM = 24
  const chartH = H - PAD_TOP - PAD_BOTTOM

  const nonZero = data.filter(d => d.vol > 0)
  const avg = nonZero.length > 0 ? nonZero.reduce((s, d) => s + d.vol, 0) / nonZero.length : 0
  const maxVol = Math.max(...data.map(d => d.vol), avg * 1.2, 1)

  if (w <= 0) return <div ref={ref} style={{ height: H }} />

  const n = data.length
  const slotW = w / Math.max(n, 1)
  const barW = Math.max(2, Math.min(slotW * 0.7, 28))

  const avgY = avg > 0 ? PAD_TOP + chartH - (avg / maxVol) * chartH : 0

  // Vilka x-axis-labels att visa (max ~10 etiketter)
  const labelStep = Math.max(1, Math.ceil(n / 10))

  return (
    <div ref={ref} style={{ width: '100%', height: H }}>
      <svg width={w} height={H} style={{ display: 'block' }}>
        {/* Snittlinje */}
        {avg > 0 && (
          <>
            <line
              x1={0} y1={avgY} x2={w} y2={avgY}
              stroke={C.muted} strokeWidth={1} strokeDasharray="3 3"
              opacity={0.45}
            />
            <text
              x={w - 4} y={avgY - 4}
              fill={C.muted} fontSize={10}
              textAnchor="end" fontFamily={FONT}
            >
              snitt {Math.round(avg).toLocaleString('sv-SE')} m³
            </text>
          </>
        )}
        {/* Bars + click hit areas */}
        {data.map((d, i) => {
          const slotX = i * slotW
          const x = slotX + (slotW - barW) / 2
          const barH = d.vol > 0 ? (d.vol / maxVol) * chartH : 0
          const y = PAD_TOP + chartH - barH
          const isAbove = avg > 0 && d.vol >= avg
          const opacity = d.vol === 0 ? 0 : (isAbove ? 1.0 : 0.4)
          return (
            <g
              key={d.key}
              style={{ cursor: 'pointer' }}
              onClick={() => onBarClick(d.key)}
            >
              <rect
                x={slotX} y={PAD_TOP}
                width={slotW} height={chartH}
                fill="transparent"
              />
              {d.vol > 0 && (
                <rect
                  x={x} y={y}
                  width={barW} height={Math.max(barH, 1)}
                  fill={C.green} opacity={opacity}
                  rx={2}
                />
              )}
            </g>
          )
        })}
        {/* X-axis-etiketter */}
        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== n - 1) return null
          const x = i * slotW + slotW / 2
          return (
            <text
              key={d.key + '_lbl'}
              x={x} y={H - 8}
              fill={C.muted} fontSize={10}
              textAnchor="middle" fontFamily={FONT}
            >{d.label}</text>
          )
        })}
      </svg>
    </div>
  )
}

// ── Kalender ─────────────────────────────────────────────────
function Calendar({ data, onDayClick }: {
  data: { datum: string; vol: number; dayOfMonth: number }[]
  onDayClick: (datum: string) => void
}) {
  if (data.length === 0) return null

  const firstDate = new Date(data[0].datum + 'T12:00:00')
  const firstDow = firstDate.getDay()
  const padBefore = firstDow === 0 ? 6 : firstDow - 1

  const cells: ((typeof data[0]) | null)[] = []
  for (let i = 0; i < padBefore; i++) cells.push(null)
  for (const d of data) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
        {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map((d, i) => (
          <div key={i} style={{
            fontSize: 10, color: C.muted, textAlign: 'center', fontWeight: 500,
            letterSpacing: 0.3,
          }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((c, i) => {
          if (!c) return <div key={i} style={{ aspectRatio: '1', borderRadius: 6 }} />
          const hasProd = c.vol > 0
          const bg = hasProd ? C.green : '#2c2c2e'
          const color = hasProd ? '#08200f' : C.muted
          return (
            <button
              key={i}
              onClick={() => onDayClick(c.datum)}
              title={hasProd
                ? `${c.dayOfMonth}: ${Math.round(c.vol).toLocaleString('sv-SE')} m³`
                : `${c.dayOfMonth}: Ej aktiv`}
              style={{
                aspectRatio: '1', borderRadius: 6, border: 'none',
                background: bg,
                fontSize: 12, fontWeight: 600, color,
                fontFamily: FONT, cursor: 'pointer',
                fontVariantNumeric: 'tabular-nums',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {c.dayOfMonth}
            </button>
          )
        })}
      </div>
      <div style={{
        display: 'flex', gap: 16, marginTop: 14, fontSize: 11, color: C.muted,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: C.green }} />
          <span>Produktion</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: '#2c2c2e' }} />
          <span>Ej aktiv</span>
        </div>
        <div style={{ color: C.dim, marginLeft: 'auto', fontSize: 10 }}>
          Flytt/service kommer i steg 2
        </div>
      </div>
    </div>
  )
}

// ── PeriodDetalj-panel ───────────────────────────────────────
// Visar en bucket (dag/vecka/månad). KPI-raderna växlar lite
// beroende på kind — vecka/månad får extra rader för
// arbetsdagar och snitt.
function PeriodDetalj({ bucket, onClose }: {
  bucket: Bucket
  onClose: () => void
}) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 10)
    return () => window.clearTimeout(t)
  }, [])

  const handleClose = () => {
    setShown(false)
    window.setTimeout(onClose, 280)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasProd = bucket.vol > 0
  const isMulti = bucket.kind !== 'day'
  const snittPerDag = bucket.arbetsdagar > 0 ? bucket.vol / bucket.arbetsdagar : 0

  // Underrubrik
  let subtitle = ''
  if (bucket.kind === 'day') {
    subtitle = hasProd ? 'Produktion' : 'Ingen produktion registrerad'
  } else {
    subtitle = hasProd
      ? `${bucket.arbetsdagar} ${bucket.arbetsdagar === 1 ? 'arbetsdag' : 'arbetsdagar'}`
      : 'Ingen produktion registrerad'
  }

  return (
    <div
      role="dialog"
      aria-label={`Detalj: ${bucket.titleLabel}`}
      style={{
        position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
        overflow: 'auto', background: C.bg, color: C.text,
        fontFamily: FONT, fontFeatureSettings: '"tnum"',
        transform: shown ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
        zIndex: 200,
      }}
    >
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
          Produktion
        </button>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
        <div style={{
          fontSize: 22, fontWeight: 600, color: C.text,
          letterSpacing: -0.4, lineHeight: 1.15, marginBottom: 4,
        }}>{bucket.titleLabel}</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
          {subtitle}
        </div>

        {/* KPI-rader */}
        <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
          <KpiRow label="Volym" value={fmtSv(bucket.vol, 0)} unit="m³sub" first />
          <KpiRow label="Stammar" value={fmtSv(bucket.stammar, 0)} unit="st" />
          {isMulti && (
            <>
              <KpiRow label="Arbetsdagar" value={String(bucket.arbetsdagar)} unit={bucket.arbetsdagar === 1 ? 'dag' : 'dagar'} />
              <KpiRow label="m³/dag" value={hasProd ? fmtSv(snittPerDag, 0) : '—'} unit="snitt" />
            </>
          )}
        </div>

        {/* Objekt */}
        {bucket.objektNamn.length > 0 && (
          <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, padding: '14px 16px 4px' }}>Objekt</div>
            {bucket.objektNamn.map((n, i) => (
              <div key={i} style={{
                padding: '10px 16px', fontSize: 14, color: C.text,
                borderTop: `0.5px solid ${C.divider}`,
              }}>{n}</div>
            ))}
          </div>
        )}

        {/* Förare */}
        {bucket.forareNamn.length > 0 && (
          <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, padding: '14px 16px 4px' }}>Förare</div>
            {bucket.forareNamn.map((n, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px',
                borderTop: `0.5px solid ${C.divider}`,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 15,
                  background: 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 500, color: C.text,
                }}>{initials(n)}</div>
                <span style={{ fontSize: 14 }}>{n}</span>
              </div>
            ))}
          </div>
        )}

        {/* Avbrott */}
        <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, padding: '14px 16px 4px' }}>Avbrott</div>
          {bucket.avbrott.length === 0 ? (
            <div style={{ padding: '8px 16px 14px', fontSize: 13, color: C.muted }}>
              Inga avbrott registrerade
            </div>
          ) : bucket.avbrott.map((a, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '8px 1fr auto auto',
              gap: 10, alignItems: 'center',
              padding: '10px 16px',
              borderTop: `0.5px solid ${C.divider}`,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: C.red, opacity: 0.7 }} />
              <div style={{ fontSize: 14, color: C.text }}>{translateKategori(a.kategori)}</div>
              <div style={{ fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
                {a.antal} {a.antal === 1 ? 'gång' : 'ggr'}
              </div>
              <div style={{
                fontSize: 14, fontWeight: 500, color: C.text,
                fontVariantNumeric: 'tabular-nums', minWidth: 70, textAlign: 'right',
              }}>{fmtTid(a.sek)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KpiRow({ label, value, unit, first }: {
  label: string; value: string; unit: string; first?: boolean
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto',
      gap: 12, alignItems: 'baseline',
      padding: '14px 16px',
      borderTop: first ? 'none' : `0.5px solid ${C.divider}`,
    }}>
      <div style={{ fontSize: 15, color: C.text }}>{label}</div>
      <div style={{
        fontSize: 16, fontWeight: 500, color: C.text,
        fontVariantNumeric: 'tabular-nums', textAlign: 'right',
      }}>
        {value}
        <span style={{ fontSize: 11, color: C.muted, marginLeft: 4, fontWeight: 400 }}>{unit}</span>
      </div>
    </div>
  )
}

// ── Root komponent ───────────────────────────────────────────
export default function ProduktionNy({ maskin, onMaskinChange }: {
  maskin: Maskin
  onMaskinChange: (m: Maskin) => void
}) {
  const [period, setPeriod] = useState<Period>('M')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<ProduktionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [maskinOpen, setMaskinOpen] = useState(false)
  const [openBucketKey, setOpenBucketKey] = useState<string | null>(null)

  const { label, start, end } = getPeriodRange(period, offset)

  // Stäng panelen automatiskt när period/maskin byts
  useEffect(() => { setOpenBucketKey(null) }, [period, offset, maskin.id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchProduktion(maskin.id, start, end)
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [maskin.id, start, end])

  // TopBar-titel
  useEffect(() => {
    const el = document.getElementById('topbar-title')
    if (!el) return
    el.textContent = `${maskin.namn} — ${label}`
    return () => { el.textContent = 'Maskinvy' }
  }, [maskin.namn, label])

  // Buckets för stapeldiagrammet (V/M = daglig, K = veckovis, Å = månadsvis).
  // Kalendern använder fortfarande daglig data — separat lookup nedan.
  const perDag = data?.perDag ?? {}
  const dailyBuckets = buildDailyBuckets(perDag, start, end)
  const bars: Bucket[] = (() => {
    if (period === 'K') return buildWeeklyBuckets(perDag, start, end)
    if (period === 'Å') return buildMonthlyBuckets(perDag, start, end)
    return dailyBuckets
  })()

  // Calendar-data: alltid daglig.
  const calendarData = dailyBuckets.map(b => ({
    datum: b.key,
    vol: b.vol,
    dayOfMonth: new Date(b.key + 'T12:00:00').getDate(),
  }))

  // Slå upp öppen bucket — kan vara i bars (klick från stapel) eller
  // dailyBuckets (klick från kalender). Slå ihop dem.
  const openBucket: Bucket | null = (() => {
    if (!openBucketKey) return null
    return bars.find(b => b.key === openBucketKey)
      ?? dailyBuckets.find(b => b.key === openBucketKey)
      ?? null
  })()

  const arbetsdagarUnit = (data?.arbetsdagar ?? 0) === 1 ? 'dag' : 'dagar'

  // Rubrik för stapeldiagrammet beror på gruppering
  const barTitle =
    period === 'K' ? 'Produktion per vecka' :
    period === 'Å' ? 'Produktion per månad' :
    'Produktion per dag'

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
        {/* Topbar: maskinnamn centrerat (samma mönster som OversiktNy) */}
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
                  onClick={() => { onMaskinChange(m); setMaskinOpen(false) }}
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
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 16px 14px' }}>
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
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '14px 16px 80px' }}>
        {/* Kontextrad */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10, marginBottom: 14,
        }}>
          <MetricKort label="m³ totalt"  value={data?.totalVolym ?? null}      unit="m³sub"  loading={loading} />
          <MetricKort label="Arbetsdagar" value={data?.arbetsdagar ?? null}     unit={arbetsdagarUnit} loading={loading} />
          <MetricKort label="m³/dag"     value={data?.m3PerArbetsdag ?? null}  unit="snitt"  loading={loading} />
        </div>

        {/* Stapeldiagram */}
        <div style={{ background: C.card, borderRadius: 14, padding: '14px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 8, padding: '0 4px' }}>
            {barTitle}
          </div>
          {loading ? (
            <div style={{
              height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.dim, fontSize: 11,
            }}>—</div>
          ) : (
            <BarChart
              data={bars.map(b => ({ key: b.key, label: b.label, vol: b.vol }))}
              onBarClick={(key) => setOpenBucketKey(key)}
            />
          )}
        </div>

        {/* Kalender — alltid daglig, oavsett period */}
        <div style={{ background: C.card, borderRadius: 14, padding: '14px 16px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 12 }}>
            Aktivitet
          </div>
          {loading ? (
            <div style={{
              height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.dim, fontSize: 11,
            }}>—</div>
          ) : calendarData.length > 100 ? (
            <div style={{
              height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 6,
              color: C.dim, fontSize: 12, textAlign: 'center',
            }}>
              <div>Årsvyns kalender</div>
              <div style={{ fontSize: 11 }}>Kommer i steg 2</div>
            </div>
          ) : (
            <Calendar data={calendarData} onDayClick={(d) => setOpenBucketKey(d)} />
          )}
        </div>
      </div>

      {/* Detalj-panel (dag/vecka/månad — beror på vad som klickats) */}
      {openBucket && (
        <PeriodDetalj bucket={openBucket} onClose={() => setOpenBucketKey(null)} />
      )}
    </div>
  )
}
