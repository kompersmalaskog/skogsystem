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
// explict hur gammal datan är. Grön prick = data från idag.
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

// ── Typer ─────────────────────────────────────────────────────
type FreshnessInfo = {
  senasteDatum: string          // 'YYYY-MM-DD' — vilket datum som visas
  senasteSkapadTid: string | null  // ISO timestamp — när senaste filen importerades
  daysDiff: number              // 0 = data från idag, 1 = igår, …
}

type IdagData = {
  freshness: FreshnessInfo
  volym: number
  stammar: number
  g15h: number                  // timmar (proc + terr) / 3600
  produktivitet: number | null  // volym / g15h
  hourBuckets: Record<number, number>  // timme (0–23) → antal stammar
  hasRytm: boolean              // false om detalj_stam var tom/misslyckad
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
      .from('detalj_stam').select('tidpunkt')
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

async function fetchIdag(maskinId: string): Promise<IdagData | null> {
  const ids = COMBO_IDS[maskinId] || [maskinId]

  // Steg 1: Hitta senaste datum + skapad_tid — visar hur färsk datan är.
  // ORDER BY datum DESC, skapad_tid DESC → senaste dag, och inom den
  // dagen den senast importerade raden (= senaste MOM-filen).
  const { data: latestRows } = await supabase
    .from('fakt_produktion')
    .select('datum, skapad_tid')
    .in('maskin_id', ids)
    .order('datum', { ascending: false })
    .order('skapad_tid', { ascending: false })
    .limit(1)

  if (!latestRows || latestRows.length === 0) return null

  const senasteDatum    = latestRows[0].datum as string
  const senasteSkapadTid = (latestRows[0].skapad_tid as string | null) ?? null

  // Räkna ut dagar sedan (kalender-dagar, inte sekunder — undviker DST-problem)
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const daysDiff = Math.round(
    (new Date(todayStr + 'T12:00:00').getTime() - new Date(senasteDatum + 'T12:00:00').getTime()) / 86400000,
  )

  // Steg 2: Hämta prod, tid och stamrytm parallellt.
  // Prod + tid hämtas SEPARAT och mergas aldrig i SQL — CLAUDE.md-regel.
  // Promise.allSettled: om detalj_stam misslyckas visas ändå siffror.
  const [prodResult, tidResult, rytmResult] = await Promise.allSettled([
    fetchPaged('fakt_produktion', 'volym_m3sub, stammar', ids, senasteDatum),
    fetchPaged('fakt_tid', 'processing_sek, terrain_sek', ids, senasteDatum),
    fetchDetaljStam(ids, senasteDatum),
  ])

  const prodRows = prodResult.status === 'fulfilled' ? prodResult.value : []
  const tidRows  = tidResult.status  === 'fulfilled' ? tidResult.value  : []
  const rytmRows = rytmResult.status === 'fulfilled' ? rytmResult.value : []
  const hasRytm  = rytmResult.status === 'fulfilled'

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

  // Bucketa stammar per timme
  const hourBuckets: Record<number, number> = {}
  for (const r of rytmRows) {
    if (!r.tidpunkt) continue
    const h = new Date(r.tidpunkt).getHours()
    hourBuckets[h] = (hourBuckets[h] || 0) + 1
  }

  return {
    freshness: { senasteDatum, senasteSkapadTid, daysDiff },
    volym, stammar, g15h,
    produktivitet: g15h > 0 ? volym / g15h : null,
    hourBuckets,
    hasRytm,
  }
}

// ── FreshnessRow ──────────────────────────────────────────────
// Vyns viktigaste element — stand om data är dagsfärsk eller äldre.
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
      // Stale data: subtle warning tint so the banner draws the eye
      background: isFresh ? C.card : '#1c1c1e',
      border: isFresh ? 'none' : `0.5px solid rgba(255,159,10,0.25)`,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: 4,
        background: dotColor, flexShrink: 0,
        // Grön prick: subtle glow
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
//  • Ingen "effektivitet" eller "trötthet" i rubrik/tooltips
//
// VIKTIG NOTE: Kallas bara "Dagens rytm / stammar per timme".
function RytmChart({
  hourBuckets, isFresh, hasRytm, loading,
}: {
  hourBuckets: Record<number, number>
  isFresh: boolean
  hasRytm: boolean
  loading: boolean
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
    // Inga stammar än idag — visa från 6 till nuvarande timme
    startH = 6
    endH = Math.min(23, currentHour + 1)
  }

  const displayHours = Array.from({ length: endH - startH + 1 }, (_, i) => i + startH)
  const maxCount = Math.max(...displayHours.map(h => hourBuckets[h] || 0), 1)
  const numBars = displayHours.length

  // Visa bara varannna timme som label om många staplar
  const showEvery = numBars > 10 ? 2 : 1

  function renderBars(width: number) {
    const barW = Math.max(1, (width - GAP * (numBars - 1)) / numBars)
    return displayHours.map((h, i) => {
      const count = hourBuckets[h] || 0
      const x = i * (barW + GAP)

      const isCurrent = isFresh && h === currentHour
      const isFuture  = isFresh && h > currentHour
      const hasCount  = count > 0

      // Beräkna bar-höjd
      const barH = hasCount ? Math.max(3, (count / maxCount) * CHART_H) : 0
      const barY = CHART_H - barH

      // Färg
      let barFill: string
      if (isFuture)      barFill = C.divider                     // #2c2c2e platshållare
      else if (isCurrent) barFill = 'rgba(48,209,88,0.55)'       // pågående timme
      else if (hasCount)  barFill = C.green                      // förfluten timme med stammar
      else                barFill = 'transparent'

      const showLabel = i % showEvery === 0
      const labelColor = isFuture ? C.dim : C.muted

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
        </g>
      )
    })
  }

  return (
    <div style={{ background: C.card, borderRadius: 14, padding: '18px 18px 14px', marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 1 }}>Dagens rytm</div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 16 }}>stammar per timme</div>

      <div ref={containerRef} style={{ width: '100%' }}>
        {loading ? (
          <div style={{
            height: CHART_H + LABEL_H,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 12, color: C.muted }}>Laddar…</span>
          </div>
        ) : !hasRytm ? (
          // detalj_stam-frågan misslyckades (RLS eller nätverksfel)
          <div style={{
            height: CHART_H + LABEL_H,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 12, color: C.dim }}>Rytmdata saknas för denna maskin</span>
          </div>
        ) : populatedHours.length === 0 && !isFresh ? (
          // Gammalt datum, inga stammar i detalj_stam för den dagen
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
export default function IdagNy() {
  const [maskin, setMaskin]       = useState<Maskin>(MASKINER[0])
  const [maskinOpen, setMaskinOpen] = useState(false)
  const [data, setData]           = useState<IdagData | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
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
        />

        {/* 4. Hänvisning till Produktion — ingen detaljredovisning här */}
        <HintRad />
      </div>
    </div>
  )
}
