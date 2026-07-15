'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  C, FONT, MASKINER, COMBO_IDS, fmtSv, fmtTid,
  type Maskin,
} from './OversiktShared'

// ─────────────────────────────────────────────────────────────
// Idag-vyn (?ny=1&vy=idag) — STEG 1: färskhet + siffra + rytm.
//
// Svarar på: "Är maskinen igång just nu och hur långt har vi
// kommit idag?"  En snabb nulägeskoll — inte en detaljvy.
//
// ÄRLIGHETSREGEL: Gamla vyn kallade alltid data för "idag" utan
// att kolla om den faktiskt var dagsfärsk. Vi visar alltid
// explicit hur gammal datan är. Grön prick = data från idag.
// Dämpat varningsband = data från ett äldre datum.
//
// STEG 2 (separat): "Vem kör" från fakt_skift.
// ─────────────────────────────────────────────────────────────

// ── Svenska månadsetiketter ───────────────────────────────────
const MONTHS_SHORT = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec']

function fmtDatumSv(datum: string): string {
  // '2026-05-22' → '22 maj'
  const d = new Date(datum + 'T12:00:00')
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

function fmtTimeHHMM(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

/** "GRAN" → "Gran", "BJÖRK" → "Björk" */
function toTitleCase(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** Artfärg för proportionsstaplar i HourPanel */
function tradslakFarg(namn: string): string {
  const u = (namn || '').toUpperCase()
  if (u.startsWith('GRAN'))                            return '#30d158'
  if (u.startsWith('TALL'))                            return '#ff9f0a'
  if (u.startsWith('BJÖRK') || u.startsWith('BJORK')) return '#ffd60a'
  return '#636366'
}

/** Extrahera timme (0–23) ur UTC-timestamp i Stockholm-tid */
function toStockholmHour(isoTs: string): number {
  const h = new Intl.DateTimeFormat('sv-SE', {
    hour: 'numeric', hour12: false, timeZone: 'Europe/Stockholm',
  }).format(new Date(isoTs))
  const n = parseInt(h, 10)
  return isNaN(n) ? 0 : n
}

type MomTiderHour = {
  processing: number   // minuter
  terrain:    number
  kort_stopp: number
  ovrigt:     number   // other + disturbance
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
  maskinIds: string[], datum: string,
): Promise<Record<number, MomTiderHour> | null> {
  const { gte, lt } = stockholmDayBoundsUtc(datum)
  const { data, error } = await supabase
    .from('mom_tider')
    .select('timme, typ, minuter')
    .in('maskin_id', maskinIds)
    .gte('timme', gte)
    .lt('timme', lt)
  if (error) return null
  const result: Record<number, MomTiderHour> = {}
  for (const row of (data || [])) {
    const h = toStockholmHour(row.timme as string)
    if (!result[h]) result[h] = { processing: 0, terrain: 0, kort_stopp: 0, ovrigt: 0 }
    const min = (row.minuter as number) || 0
    switch (row.typ as string) {
      case 'processing':  result[h].processing += min; break
      case 'terrain':     result[h].terrain    += min; break
      case 'kort_stopp':  result[h].kort_stopp += min; break
      case 'other':
      case 'disturbance': result[h].ovrigt     += min; break
    }
  }
  return result
}

// ── Typer ─────────────────────────────────────────────────────
type FreshnessInfo = {
  senasteDatum: string          // 'YYYY-MM-DD' — vilket datum som visas
  senasteSkapadTid: string | null  // ISO timestamp — när senaste filen importerades
  daysDiff: number              // 0 = data från idag, 1 = igår, …
}

type StamDetail = {
  hour: number
  tradslag_id: string
  dbh_mm: number
}

type AvbrottDetail = {
  hour: number
  langd_sek: number
  typ: string | null
  kategori_kod: string | null
}

type IdagData = {
  freshness: FreshnessInfo
  volym: number
  stammar: number
  g15h: number                  // timmar (proc + terr) / 3600
  produktivitet: number | null  // volym / g15h
  hourBuckets: Record<number, number>  // timme (0–23) → antal stammar
  hasRytm: boolean              // false om detalj_stam var tom/misslyckad
  // HourPanel-data (steg 1)
  stamDetalj: StamDetail[]
  avbrottDetalj: AvbrottDetail[] | null  // null = fetch misslyckades
  tradNamn: Record<string, string>       // tradslag_id → namn ("GRAN" etc.)
  momTider: Record<number, MomTiderHour> | null  // null = fetch misslyckades
}

// ── Datahämtning ─────────────────────────────────────────────

/** Paginerad SELECT med eq('datum', datum) — aldrig joinar fakt_produktion + fakt_tid */
async function fetchPaged(
  table: string, sel: string, ids: string[], datum: string,
): Promise<any[]> {
  const PAGE = 1000
  let rows: any[] = [], off = 0
  while (true) {
    const { data } = await supabase
      .from(table).select(sel)
      .in('maskin_id', ids).eq('datum', datum)
      .range(off, off + PAGE - 1)
    const batch = data || []
    rows = rows.concat(batch)
    if (batch.length < PAGE) break
    off += PAGE
  }
  return rows
}

/** detalj_stam — filtreras på tidpunkt-range (har inget datum-kolumn) */
async function fetchDetaljStam(ids: string[], datum: string): Promise<any[]> {
  const PAGE = 2000
  let rows: any[] = [], off = 0
  const startTs = `${datum}T00:00:00`
  const endTs   = `${datum}T23:59:59.999`
  while (true) {
    const { data, error } = await supabase
      .from('detalj_stam').select('tidpunkt, tradslag_id, dbh_mm')
      .in('maskin_id', ids)
      .gte('tidpunkt', startTs)
      .lte('tidpunkt', endTs)
      .range(off, off + PAGE - 1)
    if (error) throw error
    const batch = data || []
    rows = rows.concat(batch)
    if (batch.length < PAGE) break
    off += PAGE
  }
  return rows
}

/** fakt_avbrott — alla avbrott för aktuell dag, bucketas på starttimme (klockslag) */
async function fetchAvbrottForDay(ids: string[], datum: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('fakt_avbrott')
    .select('klockslag, langd_sek, typ, kategori_kod')
    .in('maskin_id', ids)
    .eq('datum', datum)
  if (error) throw error
  return data || []
}

/** dim_tradslag → { tradslag_id: namn } — för att visa artnamn i HourPanel */
async function fetchTradslagNamn(ids: string[]): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('dim_tradslag')
    .select('tradslag_id, namn')
    .in('maskin_id', ids)
  const map: Record<string, string> = {}
  for (const r of (data || [])) {
    if (r.tradslag_id && r.namn) map[r.tradslag_id] = r.namn as string
  }
  return map
}

async function fetchIdag(maskinId: string): Promise<IdagData | null> {
  const ids = COMBO_IDS[maskinId] || [maskinId]

  // Steg 1: Hitta senaste datum + skapad_tid — visar hur färsk datan är.
  // ORDER BY datum DESC, skapad_tid DESC → senaste dag + senast importerade raden.
  const { data: latestRows } = await supabase
    .from('fakt_produktion')
    .select('datum, skapad_tid')
    .in('maskin_id', ids)
    .order('datum', { ascending: false })
    .order('skapad_tid', { ascending: false })
    .limit(1)

  if (!latestRows || latestRows.length === 0) return null

  const senasteDatum     = latestRows[0].datum as string
  const senasteSkapadTid = (latestRows[0].skapad_tid as string | null) ?? null

  // Räkna ut dagar sedan (kalender-dagar, inte sekunder — undviker DST-problem)
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const daysDiff = Math.round(
    (new Date(todayStr + 'T12:00:00').getTime() - new Date(senasteDatum + 'T12:00:00').getTime()) / 86400000,
  )

  // Steg 2: Parallella hämtningar.
  // Prod + tid hämtas SEPARAT — CLAUDE.md-regel (aldrig JOIN).
  // Promise.allSettled: om enskild hämtning misslyckas visas ändå resten.
  const [prodResult, tidResult, rytmResult, avbrottResult, tradNamnResult, momTiderResult] = await Promise.allSettled([
    fetchPaged('fakt_produktion', 'volym_m3sub, stammar', ids, senasteDatum),
    fetchPaged('fakt_tid', 'processing_sek, terrain_sek', ids, senasteDatum),
    fetchDetaljStam(ids, senasteDatum),
    fetchAvbrottForDay(ids, senasteDatum),
    fetchTradslagNamn(ids),
    fetchMomTider(ids, senasteDatum),
  ])

  const prodRows  = prodResult.status    === 'fulfilled' ? prodResult.value    : []
  const tidRows   = tidResult.status     === 'fulfilled' ? tidResult.value     : []
  const rytmRows  = rytmResult.status    === 'fulfilled' ? rytmResult.value    : []
  const hasRytm   = rytmResult.status    === 'fulfilled'
  const tradNamn  = tradNamnResult.status === 'fulfilled' ? tradNamnResult.value : {}
  const momTider  = momTiderResult.status === 'fulfilled' ? momTiderResult.value : null

  // Aggregera produktion
  let volym = 0, stammar = 0
  for (const r of prodRows) {
    volym   += r.volym_m3sub || 0
    stammar += r.stammar || 0
  }

  // Aggregera tid (G15h = (processing_sek + terrain_sek) / 3600)
  let proc = 0, terr = 0
  for (const r of tidRows) {
    proc += r.processing_sek || 0
    terr += r.terrain_sek    || 0
  }
  const g15h = (proc + terr) / 3600

  // Bucketa stammar per timme + bygg stamDetalj för HourPanel
  const hourBuckets: Record<number, number> = {}
  const stamDetalj: StamDetail[] = []
  for (const r of rytmRows) {
    if (!r.tidpunkt) continue
    const h = new Date(r.tidpunkt).getHours()
    hourBuckets[h] = (hourBuckets[h] || 0) + 1
    stamDetalj.push({
      hour: h,
      tradslag_id: r.tradslag_id || '',
      dbh_mm: r.dbh_mm || 0,
    })
  }

  // Bygg avbrottDetalj — null om fetch misslyckades (ärlighet: "okänt" ≠ "inga")
  let avbrottDetalj: AvbrottDetail[] | null = null
  if (avbrottResult.status === 'fulfilled') {
    avbrottDetalj = []
    for (const r of avbrottResult.value) {
      if (!r.klockslag) continue
      const h = parseInt(r.klockslag.split(':')[0], 10)
      if (isNaN(h)) continue
      avbrottDetalj.push({
        hour: h,
        langd_sek: r.langd_sek || 0,
        typ: r.typ ?? null,
        kategori_kod: r.kategori_kod ?? null,
      })
    }
  }

  return {
    freshness: { senasteDatum, senasteSkapadTid, daysDiff },
    volym, stammar, g15h,
    produktivitet: g15h > 0 ? volym / g15h : null,
    hourBuckets,
    hasRytm,
    stamDetalj,
    avbrottDetalj,
    tradNamn,
    momTider,
  }
}

// ── FreshnessRow ──────────────────────────────────────────────
// Vyns viktigaste element — status om data är dagsfärsk eller äldre.
function FreshnessRow({
  freshness, loading,
}: {
  freshness: FreshnessInfo | null
  loading: boolean
}) {
  const baseStyle: React.CSSProperties = {
    background: C.card, borderRadius: 14,
    padding: '14px 18px', marginBottom: 12,
    display: 'flex', alignItems: 'center', gap: 10,
  }

  if (loading) {
    return (
      <div style={baseStyle}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: C.dim, flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: C.muted }}>Kontrollerar dataålder…</span>
      </div>
    )
  }

  if (!freshness) {
    return (
      <div style={baseStyle}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: C.dim, flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: C.muted }}>Ingen data i databasen</span>
      </div>
    )
  }

  const isFresh = freshness.daysDiff === 0

  let dotColor = isFresh ? C.green : C.dim
  let labelText: string
  if (isFresh) {
    const t = freshness.senasteSkapadTid ? fmtTimeHHMM(freshness.senasteSkapadTid) : null
    labelText = t ? `Aktiv nu · senaste signal ${t}` : 'Aktiv nu'
  } else if (freshness.daysDiff === 1) {
    labelText = `Senaste körning: ${fmtDatumSv(freshness.senasteDatum)} · igår`
  } else {
    labelText = `Senaste körning: ${fmtDatumSv(freshness.senasteDatum)} · ${freshness.daysDiff} dagar sedan`
  }

  return (
    <div style={{
      ...baseStyle,
      background: isFresh ? C.card : '#1c1c1e',
      border: isFresh ? 'none' : `0.5px solid rgba(255,159,10,0.25)`,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: 4,
        background: dotColor, flexShrink: 0,
        boxShadow: isFresh ? `0 0 0 3px rgba(48,209,88,0.18)` : 'none',
      }} />
      <span style={{
        fontSize: 13,
        color: isFresh ? C.text : C.muted,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {labelText}
      </span>
    </div>
  )
}

// ── SiffraCard ────────────────────────────────────────────────
// Tre stora siffror: Volym, Stammar, G15h. Produktivitet nedan.
function SiffraCard({ data, loading }: { data: IdagData | null; loading: boolean }) {
  const datumLabel = loading || !data
    ? '—'
    : fmtDatumSv(data.freshness.senasteDatum)

  const items = [
    { label: 'Volym',    display: data ? fmtSv(data.volym,    0) : '—', unit: 'm³' },
    { label: 'Stammar',  display: data ? fmtSv(data.stammar,  0) : '—', unit: 'st' },
    { label: 'G15h',     display: data ? fmtSv(data.g15h,     1) : '—', unit: 'h'  },
  ]

  return (
    <div style={{ background: C.card, borderRadius: 14, padding: '18px 18px 16px', marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, letterSpacing: -0.1, fontWeight: 500 }}>
        {datumLabel}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {items.map((item, i) => (
          <div
            key={item.label}
            style={{
              paddingRight: i < 2 ? 12 : 0,
              paddingLeft:  i > 0 ? 12 : 0,
              borderRight: i < 2 ? `0.5px solid ${C.divider}` : 'none',
            }}
          >
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>{item.label}</div>
            <div style={{
              fontSize: 26, fontWeight: 600, letterSpacing: -0.7,
              color: C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            }}>
              {loading ? '—' : item.display}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{item.unit}</div>
          </div>
        ))}
      </div>

      {/* Produktivitet — sekundär rad */}
      {!loading && data && data.produktivitet !== null && (
        <div style={{
          marginTop: 16, paddingTop: 14,
          borderTop: `0.5px solid ${C.divider}`,
          display: 'flex', alignItems: 'baseline', gap: 6,
        }}>
          <span style={{ fontSize: 13, color: C.muted }}>Produktivitet</span>
          <span style={{
            fontSize: 20, fontWeight: 600, letterSpacing: -0.5,
            color: C.text, fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtSv(data.produktivitet, 1)}
          </span>
          <span style={{ fontSize: 12, color: C.muted }}>m³/G15h</span>
        </div>
      )}
    </div>
  )
}

// ── RytmChart ─────────────────────────────────────────────────
// Stapeldiagram: stammar per timme ur detalj_stam.tidpunkt.
//
//  • Gröna staplar = förflutna timmar med stammar
//  • Grön 55% opacity = pågående timme (sista stapeln om dagsfärsk)
//  • #2c2c2e platshållare = timmar som inte hänt än (om dagsfärsk)
//  • Tunn markering = förflutna timmar utan stammar (t.ex. rast)
//  • Vit underline = vald timme (öppnar HourPanel)
//
// VIKTIG NOTE: Kallas bara "Dagens rytm / stammar per timme".
function RytmChart({
  hourBuckets, isFresh, hasRytm, loading, selectedHour, onBarClick,
}: {
  hourBuckets: Record<number, number>
  isFresh: boolean
  hasRytm: boolean
  loading: boolean
  selectedHour?: number | null
  onBarClick?: (hour: number | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [cw, setCw] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return
    setCw(containerRef.current.clientWidth)
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setCw(Math.max(0, Math.floor(e.contentRect.width)))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const CHART_H = 84
  const LABEL_H = 20
  const GAP = 2

  const now = new Date()
  const currentHour = now.getHours()

  // Bestäm vilka timmar som ska visas
  const populatedHours = Object.keys(hourBuckets).map(Number).filter(h => (hourBuckets[h] ?? 0) > 0)

  let startH = 6, endH = 16 // rimligt standardspann om inga data
  if (populatedHours.length > 0) {
    const minH = Math.min(...populatedHours)
    const maxH = Math.max(...populatedHours)
    startH = Math.max(0, minH - 1)
    endH = isFresh
      ? Math.min(23, Math.max(maxH + 1, currentHour + 1))
      : Math.min(23, maxH + 1)
  } else if (isFresh) {
    startH = 6
    endH = Math.min(23, currentHour + 1)
  }

  const displayHours = Array.from({ length: endH - startH + 1 }, (_, i) => i + startH)
  const maxCount = Math.max(...displayHours.map(h => hourBuckets[h] || 0), 1)
  const numBars = displayHours.length

  const showEvery = numBars > 10 ? 2 : 1

  function renderBars(width: number) {
    const barW = Math.max(1, (width - GAP * (numBars - 1)) / numBars)
    return displayHours.map((h, i) => {
      const count = hourBuckets[h] || 0
      const x = i * (barW + GAP)

      const isCurrent  = isFresh && h === currentHour
      const isFuture   = isFresh && h > currentHour
      const hasCount   = count > 0
      const isSelected = selectedHour === h

      // Beräkna bar-höjd
      const barH = hasCount ? Math.max(3, (count / maxCount) * CHART_H) : 0
      const barY = CHART_H - barH

      // Färg
      let barFill: string
      if (isFuture)       barFill = C.divider                     // #2c2c2e platshållare
      else if (isCurrent) barFill = 'rgba(48,209,88,0.55)'        // pågående timme
      else if (hasCount)  barFill = C.green                       // förfluten timme med stammar
      else                barFill = 'transparent'

      const showLabel  = i % showEvery === 0
      const labelColor = isFuture ? C.dim : (isSelected ? '#fff' : C.muted)

      return (
        <g key={h}>
          {/* Platshållare för framtida timmar */}
          {isFuture && (
            <rect x={x} y={0} width={barW} height={CHART_H} rx={2} fill={C.divider} />
          )}
          {/* Faktisk stapel */}
          {(hasCount || isCurrent) && (
            <rect x={x} y={barY} width={barW} height={Math.max(3, barH)} rx={2} fill={barFill} />
          )}
          {/* Tunn markering för förflutna nolltimmar (rast etc.) */}
          {!hasCount && !isFuture && (
            <rect x={x} y={CHART_H - 2} width={barW} height={2} rx={1}
                  fill={C.dim} opacity={0.35} />
          )}
          {/* Selektion-indikator: vit linje i botten av stapelområdet */}
          {isSelected && (
            <rect x={x} y={CHART_H - 3} width={barW} height={3} rx={1.5}
                  fill="#fff" opacity={0.85} />
          )}
          {/* Timlabel */}
          {showLabel && (
            <text
              x={x + barW / 2}
              y={CHART_H + LABEL_H - 3}
              textAnchor="middle"
              fontSize={10}
              fill={labelColor}
              fontFamily={FONT}
            >
              {String(h).padStart(2, '0')}
            </text>
          )}
          {/* Klick-yta — placeras sist (ovanpå) för att fånga tryck */}
          {onBarClick && (
            <rect
              x={x - 1} y={0}
              width={barW + 2} height={CHART_H + LABEL_H}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => onBarClick(selectedHour === h ? null : h)}
            />
          )}
        </g>
      )
    })
  }

  return (
    <div style={{ background: C.card, borderRadius: 14, padding: '18px 18px 14px', marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 1 }}>Dagens rytm</div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 16 }}>
        stammar per timme{onBarClick ? ' · tryck på stapel för detaljer' : ''}
      </div>

      <div ref={containerRef} style={{ width: '100%' }}>
        {loading ? (
          <div style={{
            height: CHART_H + LABEL_H,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 12, color: C.muted }}>Laddar…</span>
          </div>
        ) : !hasRytm ? (
          <div style={{
            height: CHART_H + LABEL_H,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 12, color: C.dim }}>Rytmdata saknas för denna maskin</span>
          </div>
        ) : populatedHours.length === 0 && !isFresh ? (
          <div style={{
            height: CHART_H + LABEL_H,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 12, color: C.dim }}>Inga stämpeltider registrerade för denna dag</span>
          </div>
        ) : cw > 0 ? (
          <svg
            width={cw}
            height={CHART_H + LABEL_H}
            style={{ display: 'block', overflow: 'visible' }}
          >
            {renderBars(cw)}
          </svg>
        ) : null}
      </div>

      {/* Förklaring av ljusare stapel */}
      {!loading && hasRytm && isFresh && populatedHours.length > 0 && (
        <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
          <LegendDot color={C.green} label="Förflutna timmar" />
          <LegendDot color="rgba(48,209,88,0.55)" label="Pågående timme" />
          <LegendDot color={C.divider} label="Kommande timmar" />
        </div>
      )}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
    </div>
  )
}

// ── TradslagRow ───────────────────────────────────────────────
// En art med proportionsstapel i HourPanel.
function TradslagRow({
  namn, count, total, avgDbhCm,
}: {
  namn: string
  count: number
  total: number
  avgDbhCm: number
}) {
  const pct      = total > 0 ? count / total : 0
  const barColor = tradslakFarg(namn)
  const display  = toTitleCase(namn)

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 5,
      }}>
        <span style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{display}</span>
        <span style={{ fontSize: 12, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
          {count} st · {fmtSv(avgDbhCm, 1)} cm
        </span>
      </div>
      {/* Proportionsstapel */}
      <div style={{ height: 5, background: C.divider, borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
        <div style={{
          height: '100%',
          width: `${Math.round(pct * 100)}%`,
          background: barColor,
          borderRadius: 3,
        }} />
      </div>
      <div style={{ fontSize: 10, color: C.dim }}>{Math.round(pct * 100)} %</div>
    </div>
  )
}

// ── AvbrottRow ────────────────────────────────────────────────
function AvbrottRow({ avbrott }: { avbrott: AvbrottDetail }) {
  const label = avbrott.typ || avbrott.kategori_kod || 'Avbrott'
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', padding: '7px 0',
      borderBottom: `0.5px solid ${C.divider}`,
    }}>
      <span style={{ fontSize: 13, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 12, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>
        {fmtTid(avbrott.langd_sek)}
      </span>
    </div>
  )
}

// ── TiderDelSection ───────────────────────────────────────────
// Visar processing/körning/kortstopp/övrigt per timme från mom_tider.
function TiderDelSection({ momHour }: { momHour: MomTiderHour | null | undefined }) {
  const sectionLabel: React.CSSProperties = {
    fontSize: 11, color: C.muted, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10,
  }

  const entries: { label: string; min: number; color: string }[] = momHour ? [
    { label: 'Processing',      min: momHour.processing, color: '#30d158' },
    { label: 'Körning/terräng', min: momHour.terrain,   color: '#0a84ff' },
    { label: 'Kortstopp',       min: momHour.kort_stopp, color: '#8e8e93' },
    { label: 'Övrigt/störning', min: momHour.ovrigt,    color: '#ff9f0a' },
  ].filter(e => e.min > 0) : []

  const total = entries.reduce((s, e) => s + e.min, 0)

  return (
    <div style={{ borderTop: `0.5px solid ${C.divider}`, paddingTop: 14, marginBottom: 16 }}>
      <div style={sectionLabel}>Maskinen den timmen</div>
      {total === 0 ? (
        <div style={{ fontSize: 13, color: C.dim }}>Tid ej tillgänglig</div>
      ) : (
        <>
          <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
            {entries.map(e => (
              <div key={e.label} style={{ flex: e.min, background: e.color }} />
            ))}
          </div>
          {entries.map(e => (
            <div key={e.label} style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: e.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.text }}>{e.label}</span>
              </div>
              <span style={{ fontSize: 12, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
                {e.min} min
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── HourPanel ─────────────────────────────────────────────────
// Öppnas vid tryck på en stapel i RytmChart.
// Innehåll: trädslag (alltid), avbrott (alltid), maskintid (mom_tider),
// slutsatsrad (alltid).
function HourPanel({
  selectedHour,
  stamDetalj,
  avbrottDetalj,
  tradNamn,
  momTider,
  onClose,
}: {
  selectedHour: number
  stamDetalj: StamDetail[]
  avbrottDetalj: AvbrottDetail[] | null
  tradNamn: Record<string, string>
  momTider: Record<number, MomTiderHour> | null
  onClose: () => void
}) {
  const hourStammar = stamDetalj.filter(s => s.hour === selectedHour)
  const hourAvbrott = avbrottDetalj !== null
    ? avbrottDetalj.filter(a => a.hour === selectedHour)
    : null

  // Gruppera per tradslag
  const tradMap = new Map<string, { count: number; dbhSum: number }>()
  for (const s of hourStammar) {
    const prev = tradMap.get(s.tradslag_id) || { count: 0, dbhSum: 0 }
    tradMap.set(s.tradslag_id, { count: prev.count + 1, dbhSum: prev.dbhSum + s.dbh_mm })
  }

  const totalStammar = hourStammar.length
  const avgDbhCm = totalStammar > 0
    ? hourStammar.reduce((sum, s) => sum + s.dbh_mm, 0) / totalStammar / 10
    : 0

  // Sortera arter efter antal (störst först)
  const tradEntries = Array.from(tradMap.entries())
    .map(([id, v]) => ({
      id,
      namn: tradNamn[id] || id,
      count: v.count,
      avgDbhCm: v.dbhSum / v.count / 10,
    }))
    .sort((a, b) => b.count - a.count)

  // Slutsatsrad
  let slutsats: string
  if (totalStammar === 0) {
    slutsats = 'Ingen registrerad aktivitet denna timme'
  } else if (tradEntries.length === 1) {
    slutsats = `${totalStammar} stammar · snitt ${fmtSv(avgDbhCm, 1)} cm · enbart ${toTitleCase(tradEntries[0].namn)}`
  } else {
    slutsats = `${totalStammar} stammar · snitt ${fmtSv(avgDbhCm, 1)} cm · ${toTitleCase(tradEntries[0].namn)} dominerar`
  }

  const endHour = selectedHour + 1

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, color: C.muted, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10,
  }

  return (
    <div style={{
      background: C.card, borderRadius: 14,
      padding: '16px 18px 18px',
      marginBottom: 12,
      border: `0.5px solid rgba(255,255,255,0.07)`,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 18,
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: -0.3 }}>
          Kl {String(selectedHour).padStart(2, '0')}–{String(endHour).padStart(2, '0')}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(120,120,128,0.18)', border: 'none',
            color: C.muted, fontFamily: FONT, fontSize: 12,
            cursor: 'pointer', padding: '4px 10px', borderRadius: 6,
            letterSpacing: -0.1,
          }}
        >
          stäng
        </button>
      </div>

      {/* ── Trädslag ────────────────────────────────────────── */}
      <div style={{ marginBottom: 18 }}>
        <div style={sectionLabel}>
          {totalStammar === 0
            ? 'Vad som kördes'
            : `Vad som kördes · ${totalStammar} stammar · snitt ${fmtSv(avgDbhCm, 1)} cm`}
        </div>
        {totalStammar === 0 ? (
          <div style={{ fontSize: 13, color: C.dim }}>Inga stammar registrerade</div>
        ) : (
          tradEntries.map(t => (
            <TradslagRow
              key={t.id}
              namn={t.namn}
              count={t.count}
              total={totalStammar}
              avgDbhCm={t.avgDbhCm}
            />
          ))
        )}
      </div>

      {/* ── Avbrott ─────────────────────────────────────────── */}
      <div style={{ borderTop: `0.5px solid ${C.divider}`, paddingTop: 14, marginBottom: 18 }}>
        <div style={sectionLabel}>Avbrott</div>
        {hourAvbrott === null ? (
          <div style={{ fontSize: 13, color: C.dim }}>Avbrottsdata kunde inte hämtas</div>
        ) : hourAvbrott.length === 0 ? (
          <div style={{ fontSize: 13, color: C.dim }}>Inga avbrott</div>
        ) : (
          <>
            {hourAvbrott.map((a, i) => <AvbrottRow key={i} avbrott={a} />)}
          </>
        )}
      </div>

      {/* ── Maskintid (mom_tider) ───────────────────────────── */}
      <TiderDelSection momHour={momTider === null ? null : momTider?.[selectedHour]} />

      {/* ── Slutsatsrad ─────────────────────────────────────── */}
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
        {slutsats}
      </div>
    </div>
  )
}

// ── HintRad ───────────────────────────────────────────────────
function HintRad() {
  return (
    <div style={{
      textAlign: 'center', padding: '14px 0 6px',
      fontSize: 12, color: C.dim,
      letterSpacing: -0.1,
    }}>
      Tryck på en dag i Produktion för full historik
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// IdagNy — huvud-komponent
// ─────────────────────────────────────────────────────────────
export default function IdagNy({ maskin, onMaskinChange }: {
  maskin: Maskin
  onMaskinChange: (m: Maskin) => void
}) {
  const [maskinOpen, setMaskinOpen] = useState(false)
  const [data, setData]             = useState<IdagData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [selectedHour, setSelectedHour] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    setSelectedHour(null)
    fetchIdag(maskin.id)
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [maskin.id])

  // Skriv maskin + datum till TopBar
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
    <div
      style={{
        position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
        overflow: 'auto', background: C.bg, color: C.text,
        fontFamily: FONT, fontFeatureSettings: '"tnum"',
      }}
    >
      {/* ── Sticky maskin-väljare ─────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: C.bg,
        borderBottom: `0.5px solid ${C.divider}`,
      }}>
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
      </div>

      {/* ── Innehåll ─────────────────────────────────────────── */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '12px 16px 80px' }}>

        {/* 1. Färskhet — vyns viktigaste element */}
        <FreshnessRow freshness={data?.freshness ?? null} loading={loading} />

        {/* 2. Dagens siffra: volym + stammar + G15h + produktivitet */}
        <SiffraCard data={data} loading={loading} />

        {/* 3. Dagens rytm — stammar per timme ur detalj_stam */}
        <RytmChart
          hourBuckets={data?.hourBuckets ?? {}}
          isFresh={isFresh}
          hasRytm={data?.hasRytm ?? false}
          loading={loading}
          selectedHour={selectedHour}
          onBarClick={setSelectedHour}
        />

        {/* 4. Tim-detaljpanel — visas när en stapel är vald */}
        {selectedHour !== null && data && (
          <HourPanel
            selectedHour={selectedHour}
            stamDetalj={data.stamDetalj}
            avbrottDetalj={data.avbrottDetalj}
            tradNamn={data.tradNamn}
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
