'use client'

import { useEffect, useRef, useState } from 'react'
import {
  C, FONT, getPeriodRange, fetchAll,
  fmtSv,
  type Period,
} from './OversiktShared'

// ─────────────────────────────────────────────────────────────
// SkotareProduktionNy — Daglig utkörning för skotare bakom ?ny=1.
//
// Visar dagliga volymer (blå staplar), snittlinje (streckad grön),
// "Bästa dagen"-kort och dagsdetalj-panel på tryck.
//
// Datakälla: fakt_lass PER DATUM.
//   COUNT(*)            = lass
//   SUM(volym_m3sub)    = volym
//   SUM(korstracka_m)   = totalDist → snittSträcka = totalDist / lass
//
// fakt_lass och fakt_tid hämtas ALDRIG i samma query.
// ─────────────────────────────────────────────────────────────

// ── Maskiner ─────────────────────────────────────────────────
const SKOTARE = [
  { id: 'A030353',  namn: 'Ponsse Wisent'           },
  { id: 'A110148',  namn: 'Ponsse Elephant King AF' },
]

// ── Hjälpfunktioner ───────────────────────────────────────────
function pad2(n: number): string { return String(n).padStart(2, '0') }
function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
}

function isoWeek(d: Date): { week: number; year: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dayNum + 3)
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

const MAANAD_KORT = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec']
const MAANAD_FULL = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december']
const VECKODAG    = ['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag']

// ── Datatyper ─────────────────────────────────────────────────
type DagInfo = {
  datum:     string
  volym:     number
  lass:      number
  totalDist: number   // SUM(korstracka_m) — dela med lass för snitt
}

type SkotareProduktionData = {
  perDag:          Record<string, DagInfo>
  totalVolym:      number
  totalLass:       number
  arbetsdagar:     number
  snittVolymPerDag: number | null
  snittLassPerDag:  number | null
  bästaDag:        DagInfo | null
  start:           string
  end:             string
}

type BucketKind = 'day' | 'week' | 'month'
type Bucket = {
  kind:        BucketKind
  key:         string
  start:       string
  end:         string
  label:       string
  titleLabel:  string
  volym:       number
  lass:        number
  totalDist:   number
  arbetsdagar: number
}

// ── Datahämtning ─────────────────────────────────────────────
async function fetchSkotareProduktion(
  maskinId: string, start: string, end: string,
): Promise<SkotareProduktionData> {
  const ids = [maskinId]

  const lassRows = await fetchAll(
    'fakt_lass', 'datum, volym_m3sub, korstracka_m',
    ids, start, end,
  )

  const perDag: Record<string, DagInfo> = {}
  const ensure = (datum: string): DagInfo => {
    if (!perDag[datum]) perDag[datum] = { datum, volym: 0, lass: 0, totalDist: 0 }
    return perDag[datum]
  }

  for (const r of lassRows) {
    if (!r.datum) continue
    const d = ensure(r.datum)
    d.volym     += r.volym_m3sub    || 0
    d.totalDist += r.korstracka_m   || 0
    d.lass      += 1
  }

  let totalVolym = 0, totalLass = 0, arbetsdagar = 0
  let bästaDag: DagInfo | null = null
  for (const d of Object.values(perDag)) {
    totalVolym += d.volym
    totalLass  += d.lass
    if (d.volym > 0) {
      arbetsdagar++
      if (!bästaDag || d.volym > bästaDag.volym) bästaDag = d
    }
  }

  return {
    perDag,
    totalVolym,
    totalLass,
    arbetsdagar,
    snittVolymPerDag: arbetsdagar > 0 ? totalVolym / arbetsdagar : null,
    snittLassPerDag:  arbetsdagar > 0 ? totalLass  / arbetsdagar : null,
    bästaDag,
    start,
    end,
  }
}

// ── Bucket-byggare ─────────────────────────────────────────────
function buildDailyBuckets(
  perDag: Record<string, DagInfo>, start: string, end: string,
): Bucket[] {
  const sD = new Date(start + 'T12:00:00')
  const eD = new Date(end   + 'T12:00:00')
  const totalDays = Math.round((eD.getTime() - sD.getTime()) / 86400000) + 1
  const out: Bucket[] = []
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(sD); d.setDate(sD.getDate() + i)
    const datum = fmtISO(d)
    const dag = perDag[datum]
    out.push({
      kind:       'day',
      key:        datum,
      start:      datum,
      end:        datum,
      label:      `${d.getDate()}/${d.getMonth()+1}`,
      titleLabel: `${VECKODAG[d.getDay()]} ${d.getDate()} ${MAANAD_FULL[d.getMonth()]} ${d.getFullYear()}`,
      volym:      dag?.volym     ?? 0,
      lass:       dag?.lass      ?? 0,
      totalDist:  dag?.totalDist ?? 0,
      arbetsdagar: (dag?.volym ?? 0) > 0 ? 1 : 0,
    })
  }
  return out
}

function buildWeeklyBuckets(
  perDag: Record<string, DagInfo>, start: string, end: string,
): Bucket[] {
  const sD = new Date(start + 'T12:00:00')
  const eD = new Date(end   + 'T12:00:00')
  const firstMon = mondayOf(sD)
  const out: Bucket[] = []
  for (let cur = new Date(firstMon); cur <= eD; cur.setDate(cur.getDate() + 7)) {
    const weekEnd = new Date(cur); weekEnd.setDate(cur.getDate() + 6)
    const { week, year } = isoWeek(cur)
    const bStart = cur < sD ? sD : cur
    const bEnd   = weekEnd > eD ? eD : weekEnd
    let volym = 0, lass = 0, totalDist = 0, arbetsdagar = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(cur); d.setDate(cur.getDate() + i)
      if (d < sD || d > eD) continue
      const dag = perDag[fmtISO(d)]
      if (!dag) continue
      volym     += dag.volym
      lass      += dag.lass
      totalDist += dag.totalDist
      if (dag.volym > 0) arbetsdagar++
    }
    const bsLow = `${bStart.getDate()} ${MAANAD_FULL[bStart.getMonth()].slice(0,3)}`
    const beLow = `${bEnd.getDate()}   ${MAANAD_FULL[bEnd.getMonth()].slice(0,3)}`
    out.push({
      kind:       'week',
      key:        `week-${fmtISO(cur)}`,
      start:      fmtISO(bStart),
      end:        fmtISO(bEnd),
      label:      `v.${week}`,
      titleLabel: `Vecka ${week} · ${bsLow}–${beLow} ${year}`,
      volym, lass, totalDist, arbetsdagar,
    })
  }
  return out
}

function buildMonthlyBuckets(
  perDag: Record<string, DagInfo>, start: string, end: string,
): Bucket[] {
  const sD = new Date(start + 'T12:00:00')
  const eD = new Date(end   + 'T12:00:00')
  const out: Bucket[] = []
  for (
    let cur = new Date(sD.getFullYear(), sD.getMonth(), 1);
    cur <= eD;
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  ) {
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
    const bStart = cur < sD ? sD : cur
    const bEnd   = monthEnd > eD ? eD : monthEnd
    let volym = 0, lass = 0, totalDist = 0, arbetsdagar = 0
    for (const [datum, dag] of Object.entries(perDag)) {
      const d = new Date(datum + 'T12:00:00')
      if (d.getFullYear() !== cur.getFullYear() || d.getMonth() !== cur.getMonth()) continue
      if (d < sD || d > eD) continue
      volym     += dag.volym
      lass      += dag.lass
      totalDist += dag.totalDist
      if (dag.volym > 0) arbetsdagar++
    }
    out.push({
      kind:       'month',
      key:        `month-${cur.getFullYear()}-${pad2(cur.getMonth()+1)}`,
      start:      fmtISO(bStart),
      end:        fmtISO(bEnd),
      label:      MAANAD_KORT[cur.getMonth()],
      titleLabel: `${MAANAD_FULL[cur.getMonth()].charAt(0).toUpperCase() + MAANAD_FULL[cur.getMonth()].slice(1)} ${cur.getFullYear()}`,
      volym, lass, totalDist, arbetsdagar,
    })
  }
  return out
}

// ── Stapeldiagram (blå staplar, grön streckad snittlinje) ─────
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

  const H          = 180
  const PAD_TOP    = 14
  const PAD_BOTTOM = 24
  const chartH     = H - PAD_TOP - PAD_BOTTOM

  const nonZero = data.filter(d => d.vol > 0)
  const avg     = nonZero.length > 0 ? nonZero.reduce((s, d) => s + d.vol, 0) / nonZero.length : 0
  const maxVol  = Math.max(...data.map(d => d.vol), avg * 1.2, 1)

  if (w <= 0) return <div ref={ref} style={{ height: H }} />

  const n     = data.length
  const slotW = w / Math.max(n, 1)
  const barW  = Math.max(2, Math.min(slotW * 0.7, 28))
  const avgY  = avg > 0 ? PAD_TOP + chartH - (avg / maxVol) * chartH : 0

  const labelStep = Math.max(1, Math.ceil(n / 10))

  return (
    <div ref={ref} style={{ width: '100%', height: H }}>
      <svg width={w} height={H} style={{ display: 'block' }}>
        {/* Snittlinje — grön streckad */}
        {avg > 0 && (
          <>
            <line
              x1={0} y1={avgY} x2={w} y2={avgY}
              stroke={C.green} strokeWidth={1.2} strokeDasharray="4 4"
              opacity={0.6}
            />
            <text
              x={w - 4} y={avgY - 4}
              fill={C.green} fontSize={10}
              textAnchor="end" fontFamily={FONT}
              opacity={0.8}
            >
              snitt {Math.round(avg).toLocaleString('sv-SE')} m³
            </text>
          </>
        )}

        {/* Staplar + klickyta */}
        {data.map((d, i) => {
          const slotX = i * slotW
          const x     = slotX + (slotW - barW) / 2
          const barH  = d.vol > 0 ? (d.vol / maxVol) * chartH : 0
          const y     = PAD_TOP + chartH - barH
          const isAbove = avg > 0 && d.vol >= avg
          const opacity = d.vol === 0 ? 0 : (isAbove ? 1.0 : 0.45)
          return (
            <g
              key={d.key}
              style={{ cursor: d.vol > 0 ? 'pointer' : 'default' }}
              onClick={() => d.vol > 0 && onBarClick(d.key)}
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
                  fill={C.blue} opacity={opacity}
                  rx={2}
                />
              )}
            </g>
          )
        })}

        {/* X-axel-etiketter */}
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

// ── MetricKort ────────────────────────────────────────────────
function MetricKort({ label, value, unit, dec = 0, loading }: {
  label: string; value: number | null; unit: string; dec?: number; loading: boolean
}) {
  return (
    <div style={{ background: C.card, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, fontWeight: 500 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{
          fontSize: 24, fontWeight: 600, letterSpacing: -0.6,
          color: C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>
          {loading ? '—' : value !== null ? fmtSv(value, dec) : '—'}
        </div>
        {unit && <div style={{ fontSize: 12, color: C.muted }}>{unit}</div>}
      </div>
    </div>
  )
}

// ── KpiRow ────────────────────────────────────────────────────
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

// ── Dagsdetalj-panel ──────────────────────────────────────────
function BucketDetalj({ bucket, onClose }: {
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

  const hasProd      = bucket.volym > 0
  const isMulti      = bucket.kind !== 'day'
  const snittSträcka = bucket.lass > 0 ? bucket.totalDist / bucket.lass : null
  const snittPerDag  = bucket.arbetsdagar > 0 ? bucket.volym / bucket.arbetsdagar : null
  const lassPerDag   = bucket.arbetsdagar > 0 ? bucket.lass  / bucket.arbetsdagar : null

  const subtitle = isMulti
    ? (hasProd
        ? `${bucket.arbetsdagar} ${bucket.arbetsdagar === 1 ? 'arbetsdag' : 'arbetsdagar'}`
        : 'Ingen utkörning registrerad')
    : (hasProd ? 'Utkörning' : 'Ingen utkörning registrerad')

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
      {/* Sticky rubrik */}
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
          Daglig utkörning
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
          <KpiRow label="Volym"  value={fmtSv(bucket.volym, 0)} unit="m³sub"  first />
          <KpiRow label="Lass"   value={String(bucket.lass)}    unit="st" />
          <KpiRow
            label="Snittsträcka"
            value={snittSträcka !== null ? fmtSv(snittSträcka, 0) : '—'}
            unit="m/lass"
          />
          {isMulti && hasProd && (
            <>
              <KpiRow label="Arbetsdagar" value={String(bucket.arbetsdagar)} unit={bucket.arbetsdagar === 1 ? 'dag' : 'dagar'} />
              {snittPerDag !== null && (
                <KpiRow label="m³/dag" value={fmtSv(snittPerDag, 0)} unit="snitt" />
              )}
              {lassPerDag !== null && (
                <KpiRow label="Lass/dag" value={fmtSv(lassPerDag, 1)} unit="snitt" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Root-komponent ─────────────────────────────────────────────
export default function SkotareProduktionNy() {
  const [maskin, setMaskin] = useState(SKOTARE[0])
  const [period, setPeriod] = useState<Period>('M')
  const [offset, setOffset] = useState(0)
  const [data, setData]     = useState<SkotareProduktionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [maskinOpen, setMaskinOpen] = useState(false)
  const [openBucketKey, setOpenBucketKey] = useState<string | null>(null)

  const { label, start, end } = getPeriodRange(period, offset)

  // Stäng detalj automatiskt när period/maskin byts
  useEffect(() => { setOpenBucketKey(null) }, [period, offset, maskin.id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSkotareProduktion(maskin.id, start, end)
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

  // Bygg buckets beroende på period
  const perDag      = data?.perDag ?? {}
  const dailyBuckets = buildDailyBuckets(perDag, start, end)
  const bars: Bucket[] = (() => {
    if (period === 'K') return buildWeeklyBuckets(perDag, start, end)
    if (period === 'Å') return buildMonthlyBuckets(perDag, start, end)
    return dailyBuckets
  })()

  // Slå upp öppen bucket
  const openBucket: Bucket | null = openBucketKey
    ? (bars.find(b => b.key === openBucketKey) ?? dailyBuckets.find(b => b.key === openBucketKey) ?? null)
    : null

  // Undertext i stapeldiagrammet
  const snittM3 = data?.snittVolymPerDag ?? null
  const snittLass = data?.snittLassPerDag ?? null
  const undertext = (!loading && snittM3 !== null && snittLass !== null)
    ? `snitt ${fmtSv(snittM3, 0)} m³ · ${fmtSv(snittLass, 1)} lass/dag`
    : ''

  const barTitle =
    period === 'K' ? 'Utkörning per vecka' :
    period === 'Å' ? 'Utkörning per månad' :
    'Daglig utkörning'

  const bästaDag = data?.bästaDag ?? null

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
        {/* Maskinväljare */}
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
        {/* Sifferkort: totalt · dagar · snitt */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10, marginBottom: 14,
        }}>
          <MetricKort
            label="m³ totalt"
            value={data?.totalVolym ?? null}
            unit="m³sub"
            loading={loading}
          />
          <MetricKort
            label="Arbetsdagar"
            value={data?.arbetsdagar ?? null}
            unit={data?.arbetsdagar === 1 ? 'dag' : 'dagar'}
            loading={loading}
          />
          <MetricKort
            label="m³/dag"
            value={data?.snittVolymPerDag ?? null}
            unit="snitt"
            dec={0}
            loading={loading}
          />
        </div>

        {/* Stapeldiagram */}
        <div style={{ background: C.card, borderRadius: 14, padding: '14px 14px', marginBottom: 14 }}>
          <div style={{ padding: '0 4px', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.muted }}>{barTitle}</div>
            {undertext && (
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{undertext}</div>
            )}
          </div>
          {loading ? (
            <div style={{
              height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.dim, fontSize: 11,
            }}>—</div>
          ) : (
            <BarChart
              data={bars.map(b => ({ key: b.key, label: b.label, vol: b.volym }))}
              onBarClick={key => setOpenBucketKey(key)}
            />
          )}
        </div>

        {/* Bästa dagen */}
        {!loading && bästaDag && (
          <div
            style={{
              background: C.card, borderRadius: 14, padding: '14px 16px',
              marginBottom: 14, cursor: 'pointer',
            }}
            onClick={() => setOpenBucketKey(bästaDag.datum)}
            role="button"
            aria-label={`Öppna bästa dagen ${bästaDag.datum}`}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 10 }}>
              Bästa dagen
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{
                fontSize: 32, fontWeight: 600, letterSpacing: -0.8,
                color: C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>
                {fmtSv(bästaDag.volym, 0)}
              </div>
              <div style={{ fontSize: 14, color: C.muted }}>m³sub</div>
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: C.muted }}>
              {(() => {
                const d = new Date(bästaDag.datum + 'T12:00:00')
                return `${VECKODAG[d.getDay()]} ${d.getDate()} ${MAANAD_FULL[d.getMonth()]} ${d.getFullYear()}`
              })()}
              {bästaDag.lass > 0 && (
                <span style={{ marginLeft: 10, color: C.dim }}>
                  {bästaDag.lass} lass
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Detalj-panel ── */}
      {openBucket && (
        <BucketDetalj
          bucket={openBucket}
          onClose={() => setOpenBucketKey(null)}
        />
      )}
    </div>
  )
}
