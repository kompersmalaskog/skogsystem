'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────
// iOS systemfärger (exakt) + bas-tokens
// ─────────────────────────────────────────────────────────────
const C = {
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

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif'

// ─────────────────────────────────────────────────────────────
// Central helper: svensk locale, komma som decimaltecken
// ─────────────────────────────────────────────────────────────
function fmtSv(num: number | null | undefined, dec: number = 0): string {
  if (num === null || num === undefined || !isFinite(num)) return '—'
  return num.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

// ─────────────────────────────────────────────────────────────
// Maskiner + period
// ─────────────────────────────────────────────────────────────
type Maskin = { id: string; namn: string }
type Period = 'V' | 'M' | 'K' | 'Å'

const MASKINER: Maskin[] = [
  { id: 'PONS20SDJAA270231', namn: 'Ponsse Scorpion Giant 8W' },
  { id: 'R64101',            namn: 'Rottne H8E (ny)' },
  { id: 'R64101+R64428',     namn: 'Rottne H8E (båda)' },
]

const COMBO_IDS: Record<string, string[]> = { 'R64101+R64428': ['R64101', 'R64428'] }
const MONTHS = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December']

function getPeriodRange(p: Period, offset: number): { start: string; end: string; label: string } {
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
type Operator = {
  id: string; namn: string;
  g15h: number; volym: number; prod: number | null;
}

type Data = {
  volym: number; stammar: number; g15h: number
  produktivitet: number | null
  medelstam: number | null
  bransleTotalt: number
  branslePerM3: number | null
  stammarPerG15h: number | null
  proc: number; terr: number; kort: number; avbr: number; rast: number
  operatorer: Operator[]
}

// ─────────────────────────────────────────────────────────────
// Datahämtning — samma tabeller som befintliga fetchDbData, slim
// ─────────────────────────────────────────────────────────────
async function fetchAll(table: string, sel: string, ids: string[], start: string, end: string): Promise<any[]> {
  const PAGE = 1000
  let rows: any[] = []
  let off = 0
  while (true) {
    const { data } = await supabase.from(table)
      .select(sel)
      .in('maskin_id', ids)
      .gte('datum', start).lte('datum', end)
      .range(off, off + PAGE - 1)
    const batch = data || []
    rows = rows.concat(batch)
    if (batch.length < PAGE) break
    off += PAGE
  }
  return rows
}

async function fetchData(maskinId: string, start: string, end: string): Promise<Data> {
  const ids = COMBO_IDS[maskinId] || [maskinId]

  const [prodRows, tidRows, avbrRows, opRes] = await Promise.all([
    fetchAll('fakt_produktion', 'volym_m3sub, stammar, operator_id', ids, start, end),
    fetchAll('fakt_tid', 'operator_id, processing_sek, terrain_sek, kort_stopp_sek, rast_sek, bransle_liter', ids, start, end),
    fetchAll('fakt_avbrott', 'langd_sek', ids, start, end),
    supabase.from('dim_operator').select('operator_id, operator_namn').in('maskin_id', ids),
  ])

  const opNames: Record<string, string> = {}
  for (const o of ((opRes as any).data || [])) opNames[o.operator_id] = o.operator_namn

  // fakt_produktion: total + per operator
  let volym = 0, stammar = 0
  const prodByOp: Record<string, { vol: number; st: number }> = {}
  for (const r of prodRows) {
    volym += r.volym_m3sub || 0
    stammar += r.stammar || 0
    if (r.operator_id) {
      if (!prodByOp[r.operator_id]) prodByOp[r.operator_id] = { vol: 0, st: 0 }
      prodByOp[r.operator_id].vol += r.volym_m3sub || 0
      prodByOp[r.operator_id].st += r.stammar || 0
    }
  }

  // fakt_tid: total + per operator (aldrig joinad mot fakt_produktion)
  let proc = 0, terr = 0, kort = 0, rast = 0, bransle = 0
  const tidByOp: Record<string, { proc: number; terr: number }> = {}
  for (const r of tidRows) {
    proc += r.processing_sek || 0
    terr += r.terrain_sek || 0
    kort += r.kort_stopp_sek || 0
    rast += r.rast_sek || 0
    bransle += parseFloat(r.bransle_liter) || 0
    if (r.operator_id) {
      if (!tidByOp[r.operator_id]) tidByOp[r.operator_id] = { proc: 0, terr: 0 }
      tidByOp[r.operator_id].proc += r.processing_sek || 0
      tidByOp[r.operator_id].terr += r.terrain_sek || 0
    }
  }

  // fakt_avbrott: summa langd_sek (samma källa som Avbrott-vyn använder)
  let avbr = 0
  for (const r of avbrRows) avbr += r.langd_sek || 0

  const g15Sek = proc + terr
  const g15h = g15Sek / 3600
  const produktivitet   = g15h > 0     ? volym / g15h         : null
  const medelstam       = stammar > 0  ? volym / stammar      : null
  const branslePerM3    = volym > 0    ? bransle / volym      : null
  const stammarPerG15h  = g15h > 0     ? stammar / g15h       : null

  const allOpIds = new Set<string>([...Object.keys(prodByOp), ...Object.keys(tidByOp)])
  const operatorer: Operator[] = Array.from(allOpIds).map(id => {
    const p = prodByOp[id] || { vol: 0, st: 0 }
    const t = tidByOp[id]  || { proc: 0, terr: 0 }
    const opG15h = (t.proc + t.terr) / 3600
    return {
      id,
      namn: opNames[id] || id,
      g15h: opG15h,
      volym: p.vol,
      prod: opG15h > 0 ? p.vol / opG15h : null,
    }
  })
  .filter(o => o.volym > 0 || o.g15h > 0)
  .sort((a, b) => b.volym - a.volym)

  return {
    volym, stammar, g15h, produktivitet, medelstam,
    bransleTotalt: bransle, branslePerM3, stammarPerG15h,
    proc, terr, kort, avbr, rast, operatorer,
  }
}

// ─────────────────────────────────────────────────────────────
// Root-komponent
// ─────────────────────────────────────────────────────────────
export default function OversiktNy() {
  const [maskin, setMaskin] = useState<Maskin>(MASKINER[0])
  const [period, setPeriod] = useState<Period>('M')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [maskinOpen, setMaskinOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const { start, end } = getPeriodRange(period, offset)
    fetchData(maskin.id, start, end)
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [maskin.id, period, offset])

  const { label } = getPeriodRange(period, offset)

  // Skriv maskinnamn + period till global TopBar (samma mönster som gamla vyn)
  useEffect(() => {
    const el = document.getElementById('topbar-title')
    if (!el) return
    el.textContent = `${maskin.namn} — ${label}`
    return () => { el.textContent = 'Maskinvy' }
  }, [maskin.namn, label])

  return (
    <div style={{
      position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
      overflow: 'auto', background: C.bg, color: C.text,
      fontFamily: FONT, fontFeatureSettings: '"tnum"',
    }}>
      {/* ── Sticky header: topbar + period-nav + V/M/K/Å ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: C.bg,
        borderBottom: `0.5px solid ${C.divider}`,
      }}>
      {/* ── Topbar: maskinnamn centrerat ── */}
      <div style={{
        padding: '14px 16px', textAlign: 'center', position: 'relative',
      }}>
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
              >
                {m.namn}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Period-nav ‹ Maj 2026 › ── */}
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
        }}>
          {label}
        </div>
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

      {/* ── V/M/K/Å segmented control ── */}
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
      </div>{/* end sticky header */}

      {/* ── Innehåll ── */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px 80px' }}>
        <HeroCard value={data?.produktivitet ?? null} loading={loading} />
        <KpiList data={data} loading={loading} />
        <TimeDistribution data={data} loading={loading} />
        <OperatorList operatorer={data?.operatorer ?? []} loading={loading} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Hero — Produktivitet
// ─────────────────────────────────────────────────────────────
function HeroCard({ value, loading }: { value: number | null; loading: boolean }) {
  return (
    <div style={{ background: C.card, borderRadius: 14, padding: '22px 22px 18px', marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 12, letterSpacing: -0.1 }}>
        Produktivitet
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{
          fontSize: 40, fontWeight: 600, letterSpacing: -1.2,
          color: C.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        }}>
          {loading ? '—' : (value !== null ? fmtSv(value, 1) : '—')}
        </div>
        <div style={{ fontSize: 14, color: C.muted }}>m³/G15h</div>
      </div>

      {/* Förändring vs föregående period — platshållare tills trenddata finns */}
      <div style={{ marginTop: 14, fontSize: 12, color: C.dim }}>
        Ingen jämförelse än
      </div>

      {/* 6-perioders kurva — platshållare */}
      <div style={{
        marginTop: 16, height: 60, borderRadius: 8,
        background: 'rgba(255,255,255,0.025)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: C.dim, fontSize: 11, letterSpacing: -0.1,
      }}>
        6-periodskurva kommer senare
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// KPI-lista — Volym / Stammar / Medelstam / Bränsle/m³ / Stammar/G15h
// ─────────────────────────────────────────────────────────────
type KpiRow = { label: string; value: number | null; unit: string; dec: number }

function KpiList({ data, loading }: { data: Data | null; loading: boolean }) {
  const rows: KpiRow[] = [
    { label: 'Volym',         value: data?.volym ?? null,           unit: 'm³sub',   dec: 0 },
    { label: 'Stammar',       value: data?.stammar ?? null,         unit: 'st',      dec: 0 },
    { label: 'Medelstam',     value: data?.medelstam ?? null,       unit: 'm³/stam', dec: 2 },
    { label: 'Bränsle/m³',    value: data?.branslePerM3 ?? null,    unit: 'L/m³',    dec: 2 },
    { label: 'Stammar/G15h',  value: data?.stammarPerG15h ?? null,  unit: 'st/G15h', dec: 1 },
  ]

  return (
    <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
      {rows.map((r, i) => (
        <button
          key={r.label}
          type="button"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 48px 56px 14px',
            gap: 14, alignItems: 'center',
            padding: '14px 16px',
            borderTop: i > 0 ? `0.5px solid ${C.divider}` : 'none',
            background: 'transparent', border: 'none', width: '100%',
            color: C.text, fontFamily: FONT, cursor: 'pointer', textAlign: 'left',
          }}
        >
          <div style={{ fontSize: 15, color: C.text }}>{r.label}</div>

          <div style={{ fontSize: 16, fontWeight: 500, color: C.text, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            {loading ? '—' : (r.value !== null ? fmtSv(r.value, r.dec) : '—')}
            <span style={{ fontSize: 11, color: C.muted, marginLeft: 4, fontWeight: 400 }}>{r.unit}</span>
          </div>

          {/* Delta-badge — platshållare */}
          <div style={{ fontSize: 11, color: C.dim, textAlign: 'right' }}>—</div>

          {/* Mini-sparkline — platshållare */}
          <div style={{
            height: 18, color: C.dim, fontSize: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          }}>—</div>

          <div style={{ color: C.dim, fontSize: 16, textAlign: 'right' }}>›</div>
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Tidsfördelning — horisontell stapel + legend
// Ersätter utnyttjandegrad (visas inte som KPI)
// ─────────────────────────────────────────────────────────────
function TimeDistribution({ data, loading }: { data: Data | null; loading: boolean }) {
  const segments = [
    { key: 'proc', label: 'Process',     color: C.green  },
    { key: 'terr', label: 'Kör',         color: C.blue   },
    { key: 'kort', label: 'Korta stopp', color: C.purple },
    { key: 'avbr', label: 'Avbrott',     color: C.red    },
    { key: 'rast', label: 'Rast',        color: C.muted  },
  ] as const

  const values = data
    ? { proc: data.proc, terr: data.terr, kort: data.kort, avbr: data.avbr, rast: data.rast }
    : null
  const total = values ? Object.values(values).reduce((s, x) => s + x, 0) : 0

  return (
    <div style={{ background: C.card, borderRadius: 14, padding: 18, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 14 }}>
        Tidsfördelning
      </div>

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
// Operatörer — initial-avatar, namn, G15h + m³/G15h, volym
// ─────────────────────────────────────────────────────────────
function initials(namn: string): string {
  const parts = namn.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return namn.substring(0, 2).toUpperCase()
}

function OperatorList({ operatorer, loading }: { operatorer: Operator[]; loading: boolean }) {
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
          style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr auto 14px',
            gap: 12, alignItems: 'center',
            padding: '12px 16px',
            borderTop: `0.5px solid ${C.divider}`,
            background: 'transparent', border: 'none', width: '100%',
            color: C.text, fontFamily: FONT, cursor: 'pointer', textAlign: 'left',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 18,
            background: 'rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 500, color: C.text,
          }}>
            {initials(o.namn)}
          </div>

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
