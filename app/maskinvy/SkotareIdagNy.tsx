'use client'
import { underTopbar, RADIE, AVSTAND, TYP, VIKT, medSafeBotten, FARG, FONT, kolumnRot } from '@/lib/design/tokens'; // layoutmått, inte avstånd (tokens: LAYOUT)

import { useEffect, useRef, useState } from 'react'
import { useMaskinvyMaskiner, type MaskinvyMaskin } from './useMaskinvyMaskiner'
import { supabase } from '@/lib/supabase'
import { aktivNuStatus, type AktivNiva } from '@/lib/maskinvy/aktivNu'
import { useMinutklocka } from './useMinutklocka'
import { snittSkotningsavstandM, SKOTNINGSAVSTAND_ETIKETT, SKOTNINGSAVSTAND_UNDERTEXT } from '@/lib/skotningsavstand'
import {
  fmtSv, VolymBadge, FLYTT_FARG, tint,
} from './OversiktShared'

// ─────────────────────────────────────────────────────────────
// SkotareIdagNy — Idag-vy för skotare bakom ?ny=1.
//
// Svarar på: "Har maskinen kört idag, och hur ser timkurvan ut?"
//
// ÄRLIGHETSREGEL (identisk med skördarens IdagNy):
// Vi visar alltid explicit hur gammal datan är. Grön prick =
// lossning gjord idag (Stockholm-tid). Dämpat = äldre datum.
//
// DATAKÄLLA: fakt_lass
//   lossnings_tid (TIMESTAMPTZ) → Stockholm-timme för stapeldiagram
//   volym_m3sub  → utkört m³sub
//   korstracka_m (tur och retur) → skotningsavstånd (enkel väg, lib/skotningsavstand)
//
// Lastningstid finns INTE i FPR-filerna. Diagrammet visar när
// lassen LOSSADES vid väg — det är vad vi har, och vi namnger
// det ärligt: "Leveranser per timme".
// ─────────────────────────────────────────────────────────────

// ── Maskiner ──────────────────────────────────────────────────
// Maskinlistan är dynamisk — se useMaskinvyMaskiner (dim_maskin, bekräftad + data).

// ── Hjälpfunktioner ───────────────────────────────────────────

/** Dagens datum i Stockholm-tid ('YYYY-MM-DD') */
function getStockholmToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
}

/** Extrahera timme (0–23) ur UTC-timestamp i Stockholm-tid */
function toStockholmHour(isoTs: string): number {
  const h = new Intl.DateTimeFormat('sv-SE', {
    hour: 'numeric', hour12: false, timeZone: 'Europe/Stockholm',
  }).format(new Date(isoTs))
  const n = parseInt(h, 10)
  return isNaN(n) ? 0 : n
}

/** Senaste lossning → "HH:MM" i Stockholm-tid */
function fmtStockholmHHMM(isoTs: string): string {
  try {
    return new Date(isoTs).toLocaleTimeString('sv-SE', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm',
    })
  } catch { return '—' }
}

const MONTHS_SHORT = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec']
function fmtDatumSv(datum: string): string {
  const d = new Date(datum + 'T12:00:00')
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

type MomTiderHour = {
  processing:  number   // minuter
  terrain:     number
  kort_stopp:  number
  other:       number   // RUN "Other work" — maskinen kör/arbetar
  disturbance: number   // DOWN "Disturbance" — maskinen står; = fakt_avbrott typ='Störning'
}

function stockholmDayBoundsUtc(datum: string): { gte: string; lt: string } {
  const m = parseInt(datum.slice(5, 7), 10)
  const off = m >= 4 && m <= 10 ? '+02:00' : '+01:00'
  const gte = new Date(`${datum}T00:00:00${off}`).toISOString()
  const [y, mo, d] = datum.split('-').map(Number)
  const nextDay = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10)
  const lt  = new Date(`${nextDay}T00:00:00${off}`).toISOString()
  return { gte, lt }
}

async function fetchMomTider(
  maskinId: string, datum: string,
): Promise<Record<number, MomTiderHour> | null> {
  const { gte, lt } = stockholmDayBoundsUtc(datum)
  const { data, error } = await supabase
    .from('mom_tider')
    .select('timme, typ, minuter')
    .eq('maskin_id', maskinId)
    .gte('timme', gte)
    .lt('timme', lt)
  if (error) return null
  const result: Record<number, MomTiderHour> = {}
  for (const row of (data || [])) {
    const h = toStockholmHour(row.timme as string)
    if (!result[h]) result[h] = { processing: 0, terrain: 0, kort_stopp: 0, other: 0, disturbance: 0 }
    const min = (row.minuter as number) || 0
    switch (row.typ as string) {
      case 'processing':  result[h].processing  += min; break
      case 'terrain':     result[h].terrain      += min; break
      case 'kort_stopp':  result[h].kort_stopp   += min; break
      case 'other':       result[h].other        += min; break
      case 'disturbance': result[h].disturbance  += min; break
    }
  }
  return result
}

// ── Typer ─────────────────────────────────────────────────────
type FreshnessInfo = {
  senasteDatum:       string        // 'YYYY-MM-DD' (datum-kolumn från fakt_lass)
  senasteLossningsTid: string | null // ISO timestamp — senaste lossnings_tid
  daysDiff:           number        // 0 = idag, 1 = igår, …
}

type HourBucket = {
  lass:      number
  volym:     number
  totalDist: number   // SUM(korstracka_m)
}

type SkotareIdagData = {
  freshness:   FreshnessInfo
  volym:       number
  lass:        number
  snittSträcka: number | null    // null om lass = 0
  g15h:        number            // SUM(processing_sek + terrain_sek) / 3600 från fakt_tid
  hourBuckets: Record<number, HourBucket>  // timme (0–23) → bucket
  momTider:    Record<number, MomTiderHour> | null  // null = fetch misslyckades
}

// ── Datahämtning ──────────────────────────────────────────────
async function fetchSkotareIdag(maskinId: string): Promise<SkotareIdagData | null> {
  const ids = [maskinId]

  // 1. Senaste rad i fakt_lass — bestämmer vilket datum vi visar
  //    och ger senasteLossningsTid för färskhetsetiketten.
  const { data: latestRows } = await supabase.rpc('maskindata_lass_senaste', {
    p_maskin_ids: ids,
  })

  if (!latestRows || latestRows.length === 0) return null

  const senasteDatum        = latestRows[0].datum        as string
  const senasteLossningsTid = (latestRows[0].lossnings_tid as string | null) ?? null

  // daysDiff mot Stockholm-datum (undviker DST-problem)
  const todayStr   = getStockholmToday()
  const daysDiff   = Math.round(
    (new Date(todayStr + 'T12:00:00').getTime() - new Date(senasteDatum + 'T12:00:00').getTime())
    / 86400000,
  )

  // 2. Hämta alla lass för senasteDatum via RPC (kringgår RLS)
  const { data: lassData } = await supabase.rpc('maskindata_lass', {
    p_maskin_ids: ids, p_datum_start: senasteDatum, p_datum_slut: senasteDatum,
  })
  const allRows: any[] = lassData || []

  // 3. Aggregera totaler och bygg timme-buckets
  let totalVolym = 0, totalDist = 0
  const hourBuckets: Record<number, HourBucket> = {}

  for (const r of allRows) {
    const volym = r.volym_m3sub  || 0
    const dist  = r.korstracka_m || 0
    totalVolym += volym
    totalDist  += dist

    // Extrahera Stockholm-timme ur lossnings_tid
    const h = r.lossnings_tid ? toStockholmHour(r.lossnings_tid as string) : -1
    if (h < 0 || h > 23) continue
    if (!hourBuckets[h]) hourBuckets[h] = { lass: 0, volym: 0, totalDist: 0 }
    hourBuckets[h].lass      += 1
    hourBuckets[h].volym     += volym
    hourBuckets[h].totalDist += dist
  }

  const totalLass = allRows.length

  // 4. G15h från fakt_tid + mom_tider — separata hämtningar, parallellt.
  const [tidResult, momTiderResult] = await Promise.allSettled([
    supabase.rpc('maskindata_tid', {
      p_maskin_ids: ids, p_datum_start: senasteDatum, p_datum_slut: senasteDatum,
    }),
    fetchMomTider(maskinId, senasteDatum),
  ])

  const tidRows: Array<{ processing_sek: number | null; terrain_sek: number | null; other_work_sek: number | null }> =
    tidResult.status === 'fulfilled' ? (tidResult.value.data || []) : []
  const g15sek  = tidRows.reduce(
    (sum, r) => sum + (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0), 0,
  )
  const g15h    = g15sek / 3600
  const momTider = momTiderResult.status === 'fulfilled' ? momTiderResult.value : null

  return {
    freshness: { senasteDatum, senasteLossningsTid, daysDiff },
    volym:       totalVolym,
    lass:        totalLass,
    snittSträcka: snittSkotningsavstandM(totalDist, totalLass),
    g15h,
    hourBuckets,
    momTider,
  }
}

// ── FreshnessRow ──────────────────────────────────────────────
// Aktiv nu (grön, < 20 min) · Senaste signal för X min sedan (gul, 20–60 min) · Inget sedan HH:MM (grå, > 60 min).
function FreshnessRow({
  freshness, loading,
}: {
  freshness: FreshnessInfo | null
  loading:   boolean
}) {
  const nu = useMinutklocka()          // hooks före tidiga returer
  const baseStyle: React.CSSProperties = {
    background: FARG.kort, borderRadius: RADIE.kort,
    padding: `${AVSTAND.l}px ${AVSTAND.l}px`, marginBottom: 12,
    display: 'flex', alignItems: 'center', gap: AVSTAND.m,
  }

  if (loading) {
    return (
      <div style={baseStyle}>
        <div style={{ width: 8, height: 8, borderRadius: RADIE.stapel, background: FARG.text3, flexShrink: 0 }} />
        <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>Kontrollerar dataålder…</span>
      </div>
    )
  }

  if (!freshness) {
    return (
      <div style={baseStyle}>
        <div style={{ width: 8, height: 8, borderRadius: RADIE.stapel, background: FARG.text3, flexShrink: 0 }} />
        <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>Ingen data i databasen</span>
      </div>
    )
  }

  const isToday = freshness.daysDiff === 0

  // Idag: signalens ÅLDER avgör (lib/maskinvy/aktivNu) — grön bara när senaste lossning/signal kom nyss.
  let niva: AktivNiva | null = null
  let labelText: string
  if (isToday) {
    const st = aktivNuStatus(freshness.senasteLossningsTid, nu, fmtStockholmHHMM)
    niva = st.niva
    labelText = st.text
  } else if (freshness.daysDiff === 1) {
    labelText = `Senaste körning: ${fmtDatumSv(freshness.senasteDatum)} · igår`
  } else {
    labelText = `Senaste körning: ${fmtDatumSv(freshness.senasteDatum)} · ${freshness.daysDiff} dagar sedan`
  }
  const aktiv = niva === 'aktiv'

  return (
    <div style={{
      ...baseStyle,
      background: FARG.kort,
      border:     isToday ? 'none' : `0.5px solid ${tint(FARG.orange, 25)}`,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: RADIE.stapel, flexShrink: 0,
        background: aktiv ? FARG.gron : niva === 'sen' ? FARG.gul : FARG.text3,
        boxShadow:  aktiv ? `0 0 0 3px ${tint(FARG.gron, 18)}` : 'none',
      }} />
      <span style={{
        fontSize: TYP.meta.fontSize,
        color: isToday && niva !== 'inget' && niva !== 'saknas' ? FARG.text : FARG.text2,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {labelText}
      </span>
    </div>
  )
}

// ── SiffraCard ────────────────────────────────────────────────
// Fyra siffror: Utkört (m³sub) · Lass (st) · Skotningsavstånd (m, enkel väg) · m³/G15h.
function SiffraCard({ data, loading }: { data: SkotareIdagData | null; loading: boolean }) {
  const datumLabel = loading || !data ? '—' : fmtDatumSv(data.freshness.senasteDatum)

  const m3g15h = data && data.g15h > 0 ? fmtSv(data.volym / data.g15h, 1) : '—'

  const items = [
    {
      label: 'Utkört',
      display: data ? fmtSv(data.volym, 0) : '—',
      unit: 'm³sub',
    },
    {
      label: 'Lass',
      display: data ? String(data.lass) : '—',
      unit: 'st',
    },
    {
      label: SKOTNINGSAVSTAND_ETIKETT,
      display: data && data.snittSträcka !== null ? fmtSv(data.snittSträcka, 0) : '—',
      unit: `m · ${SKOTNINGSAVSTAND_UNDERTEXT}`,
    },
    {
      label: 'm³/G15h',
      display: loading ? '—' : m3g15h,
      unit: 'm³/G15h',
    },
  ]

  return (
    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.l}px`, marginBottom: 12 }}>
      <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, marginBottom: AVSTAND.l, letterSpacing: -0.1, fontWeight: VIKT.halvfet }}>
        {datumLabel}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {items.map((item, i) => (
          <div
            key={item.label}
            style={{
              paddingRight: i < 3 ? 8 : 0,
              paddingLeft:  i > 0 ? 8 : 0,
              borderRight: i < 3 ? `0.5px solid ${FARG.linje}` : 'none',
            }}
          >
            <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginBottom: AVSTAND.xs }}>{item.label}</div>
            <div style={{
              fontSize: TYP.rubrik.fontSize, fontWeight: VIKT.halvfet, letterSpacing: -0.5,
              color: FARG.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            }}>
              {loading ? '—' : item.display}
            </div>
            <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginTop: AVSTAND.xs }}>{item.unit}</div>
            {i === 0 && !loading && (
              <div style={{ marginTop: AVSTAND.xs }}>
                <VolymBadge harManuell={false} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── LeveransChart ─────────────────────────────────────────────
// Blå staplar: antal lossningar per timme (Stockholm-tid).
// Framtida timmar visas som #2c2c2e (om datan är dagsfärsk).
// Tryck på stapel → öppnar HourPanel.
function LeveransChart({
  hourBuckets, isFresh, loading, selectedHour, onBarClick,
}: {
  hourBuckets: Record<number, HourBucket>
  isFresh:     boolean
  loading:     boolean
  selectedHour: number | null
  onBarClick:  (hour: number | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [cw, setCw]  = useState(0)

  useEffect(() => {
    if (!containerRef.current) return
    setCw(containerRef.current.clientWidth)
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setCw(Math.max(0, Math.floor(e.contentRect.width)))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const CHART_H  = 84
  const LABEL_H  = 20
  const GAP      = 2

  const now         = new Date()
  const currentHour = toStockholmHour(now.toISOString())

  const populatedHours = Object.keys(hourBuckets).map(Number).filter(h => (hourBuckets[h]?.lass ?? 0) > 0)

  let startH = 7, endH = 18
  if (populatedHours.length > 0) {
    const minH = Math.min(...populatedHours)
    const maxH = Math.max(...populatedHours)
    startH = Math.max(0, minH - 1)
    endH   = isFresh
      ? Math.min(23, Math.max(maxH + 1, currentHour + 1))
      : Math.min(23, maxH + 1)
  } else if (isFresh) {
    endH = Math.min(23, currentHour + 1)
  }

  const displayHours = Array.from({ length: endH - startH + 1 }, (_, i) => i + startH)
  const maxLass      = Math.max(...displayHours.map(h => hourBuckets[h]?.lass ?? 0), 1)
  const numBars      = displayHours.length
  const showEvery    = numBars > 10 ? 2 : 1

  function renderBars(width: number) {
    const barW = Math.max(1, (width - GAP * (numBars - 1)) / numBars)
    return displayHours.map((h, i) => {
      const bucket    = hourBuckets[h]
      const lass      = bucket?.lass ?? 0
      const x         = i * (barW + GAP)
      const isCurrent  = isFresh && h === currentHour
      const isFuture   = isFresh && h > currentHour
      const hasLass    = lass > 0
      const isSelected = selectedHour === h

      const barH = hasLass ? Math.max(3, (lass / maxLass) * CHART_H) : 0
      const barY = CHART_H - barH

      let barFill: string
      if (isFuture)       barFill = FARG.upphojt
      else if (isCurrent) barFill = tint(FARG.bla, 55)
      else if (hasLass)   barFill = FARG.bla
      else                barFill = 'transparent'

      const showLabel  = i % showEvery === 0
      const labelColor = isFuture ? FARG.text3 : (isSelected ? FARG.text : FARG.text2)

      return (
        <g key={h}>
          {isFuture && (
            <rect x={x} y={0} width={barW} height={CHART_H} rx={2} fill={FARG.upphojt} />
          )}
          {(hasLass || isCurrent) && (
            <rect x={x} y={barY} width={barW} height={Math.max(3, barH)} rx={2} fill={barFill} />
          )}
          {!hasLass && !isFuture && (
            <rect x={x} y={CHART_H - 2} width={barW} height={2} rx={1}
                  fill={FARG.text3} opacity={0.35} />
          )}
          {isSelected && (
            <rect x={x} y={CHART_H - 3} width={barW} height={3} rx={1.5}
                  fill={FARG.text} opacity={0.85} />
          )}
          {showLabel && (
            <text
              x={x + barW / 2} y={CHART_H + LABEL_H - 3}
              textAnchor="middle" fontSize={10}
              fill={labelColor} fontFamily={FONT}
            >
              {String(h).padStart(2, '0')}
            </text>
          )}
          {/* Klick-yta — ovanpå allt */}
          <rect
            x={x - 1} y={0}
            width={barW + 2} height={CHART_H + LABEL_H}
            fill="transparent"
            style={{ cursor: hasLass ? 'pointer' : 'default' }}
            onClick={() => hasLass && onBarClick(selectedHour === h ? null : h)}
          />
        </g>
      )
    })
  }

  return (
    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.l}px`, marginBottom: 12 }}>
      <div style={{ fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text2 }}>
        Leveranser per timme
      </div>
      <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text3, marginBottom: 16 }}>
        lossningar vid väg · Stockholm-tid{populatedHours.length > 0 ? ' · tryck på stapel för detaljer' : ''}
      </div>

      <div ref={containerRef} style={{ width: '100%' }}>
        {loading ? (
          <div style={{
            height: CHART_H + LABEL_H,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>Laddar…</span>
          </div>
        ) : populatedHours.length === 0 && !isFresh ? (
          <div style={{
            height: CHART_H + LABEL_H,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text3 }}>Inga lossningar registrerade för denna dag</span>
          </div>
        ) : cw > 0 ? (
          <svg
            width={cw} height={CHART_H + LABEL_H}
            style={{ display: 'block', overflow: 'visible' }}
          >
            {renderBars(cw)}
          </svg>
        ) : null}
      </div>

      {!loading && isFresh && populatedHours.length > 0 && (
        <div style={{ display: 'flex', gap: AVSTAND.l, marginTop: 12, flexWrap: 'wrap' }}>
          <LegendDot color={FARG.bla}                      label="Förflutna timmar" />
          <LegendDot color={tint(FARG.bla, 55)}       label="Pågående timme"   />
          <LegendDot color={FARG.upphojt}                   label="Kommande timmar"  />
        </div>
      )}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
      <div style={{ width: 8, height: 8, borderRadius: RADIE.stapel, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: TYP.micro.fontSize, color: FARG.text2 }}>{label}</span>
    </div>
  )
}

// ── TiderDelSection ───────────────────────────────────────────
// Visar maskintid per timme från mom_tider.
// RUNTIME (proc+terräng+annat) summerar till ~60 min — visas som stapel+rader.
// KORTSTOPP är inbäddat i runtime (StanForD-design) — visas som "varav X min".
// STÖRNING är downtime utöver runtime — visas separat som "Stillestånd".
function TiderDelSection({ momHour }: { momHour: MomTiderHour | null | undefined }) {
  const sectionLabel: React.CSSProperties = {
    fontSize: TYP.micro.fontSize, color: FARG.text2, fontWeight: VIKT.halvfet,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: AVSTAND.m,
  }

  const runtime = momHour ? [
    { label: 'Processing',      min: momHour.processing, color: FARG.gron },
    { label: 'Körning/terräng', min: momHour.terrain,    color: FARG.bla },
    { label: 'Annat arbete',    min: momHour.other,      color: FARG.text2 },
  ].filter(e => e.min > 0) : []

  const runtimeTotal   = runtime.reduce((s, e) => s + e.min, 0)
  const kortStoppMin   = momHour?.kort_stopp  ?? 0
  const disturbanceMin = momHour?.disturbance ?? 0
  const hasAnything    = runtimeTotal > 0 || kortStoppMin > 0 || disturbanceMin > 0

  return (
    <div style={{ borderTop: `0.5px solid ${FARG.linje}`, paddingTop: AVSTAND.l, marginBottom: 16 }}>
      <div style={sectionLabel}>Maskinen den timmen</div>
      {!hasAnything ? (
        <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text3 }}>Tid ej tillgänglig</div>
      ) : (
        <>
          {runtimeTotal > 0 && (
            <>
              <div style={{ display: 'flex', height: 5, borderRadius: RADIE.stapel, overflow: 'hidden', marginBottom: AVSTAND.m }}>
                {runtime.map(e => (
                  <div key={e.label} style={{ flex: e.min, background: e.color }} />
                ))}
              </div>
              {runtime.map(e => (
                <div key={e.label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: AVSTAND.xs,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
                    <div style={{ width: 8, height: 8, borderRadius: RADIE.stapel, background: e.color, flexShrink: 0 }} />
                    <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text }}>{e.label}</span>
                  </div>
                  <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, fontVariantNumeric: 'tabular-nums' }}>
                    {e.min} min
                  </span>
                </div>
              ))}
              {kortStoppMin > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, paddingLeft: 8, marginTop: AVSTAND.xs, marginBottom: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: RADIE.stapel, background: FLYTT_FARG, flexShrink: 0 }} />
                  <span style={{ fontSize: TYP.micro.fontSize, color: FARG.text2 }}>
                    varav {kortStoppMin} min korta stopp (ingår i ovan)
                  </span>
                </div>
              )}
            </>
          )}
          {disturbanceMin > 0 && (
            <div style={{
              marginTop: runtimeTotal > 0 ? AVSTAND.s : 0,
              paddingTop: runtimeTotal > 0 ? 8 : 0,
              borderTop: runtimeTotal > 0 ? `0.5px solid ${FARG.linje}` : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
                  <div style={{ width: 8, height: 8, borderRadius: RADIE.stapel, background: FARG.orange, flexShrink: 0 }} />
                  <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text }}>Stillestånd</span>
                </div>
                <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, fontVariantNumeric: 'tabular-nums' }}>
                  {disturbanceMin} min
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── TidPerTimmeKort ───────────────────────────────────────────
// Alltid synlig om mom_tider har data för dagen — oberoende av lassdata.
// RUNTIME (proc+terräng+annat) är stapeln och summerar till ~60 min.
// KORTSTOPP är inbäddat i runtime — visas som "varav X min".
// STÖRNING är downtime — visas som "Stillestånd" under en tunn linje.
function TidPerTimmeKort({
  momTider, loading,
}: {
  momTider: Record<number, MomTiderHour> | null
  loading: boolean
}) {
  if (loading || !momTider) return null
  const hours = Object.keys(momTider).map(Number).sort((a, b) => a - b)
  if (hours.length === 0) return null

  return (
    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.s}px`, marginBottom: 12 }}>
      <div style={{ fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text2 }}>Körtid per timme</div>
      <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text3, marginBottom: 4 }}>
        Ur maskindatorn · stapeln = runtime (processing + körning + annat arbete)
      </div>
      {hours.map(h => {
        const m = momTider[h]
        const runtime = [
          { label: 'Processing',      min: m.processing, color: FARG.gron },
          { label: 'Körning/terräng', min: m.terrain,    color: FARG.bla },
          { label: 'Annat arbete',    min: m.other,      color: FARG.text2 },
        ].filter(e => e.min > 0)
        const runtimeTotal   = runtime.reduce((s, e) => s + e.min, 0)
        const kortStoppMin   = m.kort_stopp
        const disturbanceMin = m.disturbance
        if (runtimeTotal === 0 && kortStoppMin === 0 && disturbanceMin === 0) return null
        return (
          <div key={h} style={{ borderTop: `0.5px solid ${FARG.linje}`, paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text, marginBottom: AVSTAND.s }}>
              kl {String(h).padStart(2, '0')}
            </div>
            {runtimeTotal > 0 && (
              <>
                <div style={{ display: 'flex', height: 4, borderRadius: RADIE.stapel, overflow: 'hidden', marginBottom: 8 }}>
                  {runtime.map(e => (
                    <div key={e.label} style={{ flex: e.min, background: e.color }} />
                  ))}
                </div>
                {runtime.map(e => (
                  <div key={e.label} style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
                      <div style={{ width: 8, height: 8, borderRadius: RADIE.stapel, background: e.color, flexShrink: 0 }} />
                      <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text }}>{e.label}</span>
                    </div>
                    <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, fontVariantNumeric: 'tabular-nums' }}>
                      {e.min} min
                    </span>
                  </div>
                ))}
                {kortStoppMin > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, paddingLeft: 8, marginTop: AVSTAND.xs, marginBottom: AVSTAND.s }}>
                    <div style={{ width: 6, height: 6, borderRadius: RADIE.stapel, background: FLYTT_FARG, flexShrink: 0 }} />
                    <span style={{ fontSize: TYP.micro.fontSize, color: FARG.text2 }}>
                      varav {kortStoppMin} min korta stopp (ingår i ovan)
                    </span>
                  </div>
                )}
              </>
            )}
            {disturbanceMin > 0 && (
              <div style={{
                marginTop: runtimeTotal > 0 ? AVSTAND.s : 0,
                paddingTop: runtimeTotal > 0 ? 6 : 0,
                borderTop: runtimeTotal > 0 ? `0.5px solid ${FARG.linje}` : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
                    <div style={{ width: 8, height: 8, borderRadius: RADIE.stapel, background: FARG.orange, flexShrink: 0 }} />
                    <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text }}>Stillestånd</span>
                  </div>
                  <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, fontVariantNumeric: 'tabular-nums' }}>
                    {disturbanceMin} min
                  </span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── HourPanel ─────────────────────────────────────────────────
// Inline-kort som öppnas vid stapeltryck. Visar lass/volym/sträcka
// + maskintid (mom_tider) för den timmen.
function HourPanel({
  hour, bucket, momTider, onClose,
}: {
  hour:     number
  bucket:   HourBucket
  momTider: Record<number, MomTiderHour> | null
  onClose:  () => void
}) {
  const endHour    = hour + 1
  const snittLass  = bucket.lass > 0 ? bucket.volym / bucket.lass : null
  const snittDist  = snittSkotningsavstandM(bucket.totalDist, bucket.lass)

  return (
    <div style={{
      background: FARG.kort, borderRadius: RADIE.kort,
      padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.l}px`, marginBottom: 12,
      border: `0.5px solid ${FARG.linje}`,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: AVSTAND.l,
      }}>
        <span style={{ fontSize: TYP.text.fontSize, fontWeight: VIKT.halvfet, color: FARG.text, letterSpacing: -0.3 }}>
          Kl {String(hour).padStart(2, '0')}–{String(endHour).padStart(2, '0')}
        </span>
        <button
          onClick={onClose}
          style={{
            background: FARG.linje, border: 'none',
            color: FARG.text2, fontFamily: FONT, fontSize: TYP.meta.fontSize,
            cursor: 'pointer', padding: `${AVSTAND.xs}px ${AVSTAND.m}px`, borderRadius: RADIE.stapel,
          }}
        >
          stäng
        </button>
      </div>

      {/* KPI-rader */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: AVSTAND.l }}>
        <div>
          <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginBottom: 4 }}>Lass</div>
          <div style={{ fontSize: TYP.rubrik.fontSize, fontWeight: VIKT.halvfet, color: FARG.text, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>
            {bucket.lass}
          </div>
          <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2 }}>st</div>
        </div>
        <div>
          <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginBottom: 4 }}>Utkört</div>
          <div style={{ fontSize: TYP.rubrik.fontSize, fontWeight: VIKT.halvfet, color: FARG.text, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>
            {fmtSv(bucket.volym, 0)}
          </div>
          <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2 }}>m³sub</div>
        </div>
        <div>
          <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginBottom: 4 }}>{SKOTNINGSAVSTAND_ETIKETT}</div>
          <div style={{ fontSize: TYP.rubrik.fontSize, fontWeight: VIKT.halvfet, color: FARG.text, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>
            {snittDist !== null ? fmtSv(snittDist, 0) : '—'}
          </div>
          <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2 }}>m · {SKOTNINGSAVSTAND_UNDERTEXT}</div>
        </div>
      </div>

      {/* Snitt per lass — sekundär */}
      {snittLass !== null && (
        <div style={{
          paddingTop: 12, borderTop: `0.5px solid ${FARG.linje}`,
          fontSize: TYP.meta.fontSize, color: FARG.text2,
        }}>
          {fmtSv(snittLass, 1)} m³/lass snitt denna timme
        </div>
      )}

      {/* Maskintid (mom_tider) */}
      <TiderDelSection momHour={momTider === null ? null : momTider?.[hour]} />
    </div>
  )
}

// ── HintRad ───────────────────────────────────────────────────
function HintRad() {
  return (
    <div style={{
      textAlign: 'center', padding: `${AVSTAND.l}px 0 ${AVSTAND.s}px`,
      fontSize: TYP.meta.fontSize, color: FARG.text3, letterSpacing: -0.1,
    }}>
      Tryck på en dag i Produktion för full historik
    </div>
  )
}

// ── Root-komponent ─────────────────────────────────────────────
export default function SkotareIdagNy({ maskin, onMaskinChange }: {
  maskin: MaskinvyMaskin
  onMaskinChange: (m: MaskinvyMaskin) => void
}) {
  const { maskiner: SKOTARE } = useMaskinvyMaskiner('skotare')
  const [maskinOpen,   setMaskinOpen]   = useState(false)
  const [data,         setData]         = useState<SkotareIdagData | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [selectedHour, setSelectedHour] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    setSelectedHour(null)
    fetchSkotareIdag(maskin.id)
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [maskin.id])

  useEffect(() => {
    const el = document.getElementById('topbar-title')
    if (!el) return
    el.textContent = data?.freshness.senasteDatum
      ? `${maskin.namn} — ${fmtDatumSv(data.freshness.senasteDatum)}`
      : maskin.namn
    return () => { el.textContent = 'Maskinvy' }
  }, [maskin.namn, data?.freshness.senasteDatum])

  const isFresh = (data?.freshness.daysDiff ?? 1) === 0

  return (
    <div style={{
      position: 'fixed', top: underTopbar(), left: 0, right: 0, bottom: 0,
      overflow: 'auto', background: FARG.bg, color: FARG.text,
      fontFamily: FONT, fontFeatureSettings: '"tnum"',
    }}>
      {/* ── Sticky maskinväljare ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: FARG.bg, borderBottom: `0.5px solid ${FARG.linje}`,
      }}>
        <div style={{ padding: `${AVSTAND.l}px ${AVSTAND.l}px`, textAlign: 'center', position: 'relative' }}>
          <button
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
            <span style={{ color: FARG.text2, fontSize: TYP.micro.fontSize }}>▾</span>
          </button>

          {maskinOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              background: FARG.kort, borderRadius: RADIE.kort, marginTop: AVSTAND.s,
              minWidth: 260, overflow: 'hidden', zIndex: 100,
              boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
            }}>
              {SKOTARE.map(m => (
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
      </div>

      {/* ── Innehåll ── */}
      <div style={{ ...kolumnRot('smal'), padding: `${AVSTAND.m}px ${AVSTAND.l}px 0`, paddingBottom: medSafeBotten(AVSTAND.xxl) }}>

        {/* 1. Färskhet */}
        <FreshnessRow freshness={data?.freshness ?? null} loading={loading} />

        {/* 2. Dagens siffror: Utkört · Lass · Skotningsavstånd */}
        <SiffraCard data={data} loading={loading} />

        {/* 3. Leveranser per timme */}
        <LeveransChart
          hourBuckets={data?.hourBuckets ?? {}}
          isFresh={isFresh}
          loading={loading}
          selectedHour={selectedHour}
          onBarClick={setSelectedHour}
        />

        {/* 3b. Körtid per timme — alltid synlig om mom_tider har data */}
        <TidPerTimmeKort momTider={data?.momTider ?? null} loading={loading} />

        {/* 4. Timdetalj — visas när en stapel är vald */}
        {selectedHour !== null && data?.hourBuckets[selectedHour] && (
          <HourPanel
            hour={selectedHour}
            bucket={data.hourBuckets[selectedHour]}
            momTider={data.momTider}
            onClose={() => setSelectedHour(null)}
          />
        )}

        {/* 5. Hänvisning till Produktion */}
        <HintRad />
      </div>
    </div>
  )
}
