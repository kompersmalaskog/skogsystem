'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { translateKategori } from '@/lib/avbrott-kategorier'
import {
  C, FONT, MASKINER, COMBO_IDS, getPeriodRange, fetchAll,
  fmtSv, initials,
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
function BarChart({ data, onBarClick }: {
  data: { datum: string; label: string; vol: number }[]
  onBarClick: (datum: string) => void
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
              key={d.datum}
              style={{ cursor: 'pointer' }}
              onClick={() => onBarClick(d.datum)}
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
              key={d.datum + '_lbl'}
              x={x} y={H - 8}
              fill={C.dim} fontSize={10}
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

// ── DagDetalj-panel ──────────────────────────────────────────
function DagDetalj({ datum, dag, onClose }: {
  datum: string
  dag: DagInfo | null
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

  const d = new Date(datum + 'T12:00:00')
  const MONTHS = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december']
  const WEEKDAYS = ['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag']
  const dateStr = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`

  const hasProd = (dag?.vol ?? 0) > 0

  return (
    <div
      role="dialog"
      aria-label={`Dagdetalj: ${dateStr}`}
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
        }}>{dateStr}</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
          {hasProd ? 'Produktion' : 'Ingen produktion registrerad'}
        </div>

        {/* KPI-rader */}
        <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
          <KpiRow label="Volym" value={dag ? fmtSv(dag.vol, 0) : '—'} unit="m³sub" first />
          <KpiRow label="Stammar" value={dag ? fmtSv(dag.stammar, 0) : '—'} unit="st" />
        </div>

        {/* Objekt */}
        {(dag?.objektNamn.length ?? 0) > 0 && (
          <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, padding: '14px 16px 4px' }}>Objekt</div>
            {dag!.objektNamn.map((n, i) => (
              <div key={i} style={{
                padding: '10px 16px', fontSize: 14, color: C.text,
                borderTop: `0.5px solid ${C.divider}`,
              }}>{n}</div>
            ))}
          </div>
        )}

        {/* Förare */}
        {(dag?.forareNamn.length ?? 0) > 0 && (
          <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, padding: '14px 16px 4px' }}>Förare</div>
            {dag!.forareNamn.map((n, i) => (
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
          {(dag?.avbrott.length ?? 0) === 0 ? (
            <div style={{ padding: '8px 16px 14px', fontSize: 13, color: C.dim }}>
              Inga avbrott registrerade
            </div>
          ) : dag!.avbrott.map((a, i) => {
            const min = Math.round(a.sek / 60)
            const h = Math.floor(min / 60)
            const m = min % 60
            const tid = h > 0 ? (m > 0 ? `${h}h ${m} min` : `${h}h`) : `${m} min`
            return (
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
                }}>{tid}</div>
              </div>
            )
          })}
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
export default function ProduktionNy() {
  const [maskin, setMaskin] = useState<Maskin>(MASKINER[0])
  const [period, setPeriod] = useState<Period>('M')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<ProduktionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [maskinOpen, setMaskinOpen] = useState(false)
  const [openDag, setOpenDag] = useState<string | null>(null)

  const { label, start, end } = getPeriodRange(period, offset)

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

  // Bygg alla dagar i perioden (även de utan data, så de syns i kalender/staplar)
  const allDays = (() => {
    const days: { datum: string; label: string; vol: number; dayOfMonth: number }[] = []
    const sDate = new Date(start + 'T12:00:00')
    const eDate = new Date(end + 'T12:00:00')
    const totalDays = Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(sDate)
      d.setDate(sDate.getDate() + i)
      const pad = (n: number) => String(n).padStart(2, '0')
      const datum = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const labelStr = `${d.getDate()}/${d.getMonth() + 1}`
      const dag = data?.perDag[datum]
      days.push({
        datum, label: labelStr,
        vol: dag?.vol ?? 0,
        dayOfMonth: d.getDate(),
      })
    }
    return days
  })()

  const goToOversikt = () => {
    window.location.href = '/maskinvy?ny=1'
  }

  const arbetsdagarUnit = (data?.arbetsdagar ?? 0) === 1 ? 'dag' : 'dagar'

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
        {/* Topp: ‹ Översikt + maskinnamn centrerat */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          padding: '10px 8px 6px',
        }}>
          <button
            onClick={goToOversikt}
            style={{
              background: 'transparent', border: 'none',
              color: C.blue, fontFamily: FONT, fontSize: 15, fontWeight: 400,
              cursor: 'pointer', padding: '6px 8px', minHeight: 36,
              display: 'inline-flex', alignItems: 'center',
            }}
            aria-label="Tillbaka till Översikt"
          >
            <span style={{ fontSize: 20, lineHeight: 1, marginRight: 2 }}>‹</span>
            Översikt
          </button>

          <div style={{ position: 'relative', textAlign: 'center', minWidth: 0 }}>
            <button
              onClick={() => setMaskinOpen(o => !o)}
              style={{
                background: 'transparent', border: 'none', color: C.text,
                fontFamily: FONT, fontSize: 15, fontWeight: 600, letterSpacing: -0.3,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: 0, maxWidth: '100%', overflow: 'hidden',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {maskin.namn}
              </span>
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

          {/* Spacer för balans */}
          <div style={{ width: 88 }} />
        </div>

        {/* Avsnittsrubrik */}
        <div style={{
          textAlign: 'center', fontSize: 11, color: C.muted,
          letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 500,
          padding: '2px 0 4px',
        }}>
          Produktion
        </div>

        {/* Period-nav ‹ Maj 2026 › */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          padding: '6px 0 4px',
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
            Produktion per dag
          </div>
          {loading ? (
            <div style={{
              height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.dim, fontSize: 11,
            }}>—</div>
          ) : allDays.length > 35 ? (
            <div style={{
              height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 6,
              color: C.dim, fontSize: 12, textAlign: 'center', padding: '0 24px',
            }}>
              <div>{allDays.length} dagar är för många staplar för per-dag-vy</div>
              <div style={{ fontSize: 11 }}>K/Å-gruppering kommer i steg 2</div>
            </div>
          ) : (
            <BarChart data={allDays} onBarClick={(d) => setOpenDag(d)} />
          )}
        </div>

        {/* Kalender */}
        <div style={{ background: C.card, borderRadius: 14, padding: '14px 16px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 12 }}>
            Aktivitet
          </div>
          {loading ? (
            <div style={{
              height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.dim, fontSize: 11,
            }}>—</div>
          ) : allDays.length > 100 ? (
            <div style={{
              height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 6,
              color: C.dim, fontSize: 12, textAlign: 'center',
            }}>
              <div>Årsvyns kalender</div>
              <div style={{ fontSize: 11 }}>Kommer i steg 2</div>
            </div>
          ) : (
            <Calendar data={allDays} onDayClick={(d) => setOpenDag(d)} />
          )}
        </div>
      </div>

      {/* Dag-detalj-panel */}
      {openDag && (
        <DagDetalj
          datum={openDag}
          dag={data?.perDag[openDag] ?? null}
          onClose={() => setOpenDag(null)}
        />
      )}
    </div>
  )
}
