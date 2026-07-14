'use client'

import { useEffect, useState } from 'react'
import {
  C, FONT, MASKINER, COMBO_IDS, getPeriodRange, fetchAll,
  fmtSv, fmtTid,
  type Maskin, type Period,
} from './OversiktShared'
import { translateKategori } from '../../lib/avbrott-kategorier'
import { G15_GRANS_SEK } from '../../lib/g15'

// ─────────────────────────────────────────────────────────────
// Avbrott-vyn (?ny=1&vy=avbrott) — STEG 1.
//
// Svarar på: "Vad stoppar maskinen, och är det skötsel eller haveri?"
//
// Steg 1: kontextrad + flytt-utlyft + avbrottsstapel + typ-lista
// Steg 2: accordion drill-down per typ + REPAIR_*-översättningar.
// ─────────────────────────────────────────────────────────────

// Typer i fakt_avbrott.typ (verifierat — fältet är ifyllt på alla rader)
const TYPER = ['Underhåll', 'Störning', 'Övrigt', 'Reparation'] as const
type Typ = typeof TYPER[number]

const TYP_FARG: Record<Typ, string> = {
  'Underhåll':  C.green,    // #30d158 — planerat
  'Störning':   C.blue,     // #0a84ff
  'Övrigt':     C.muted,    // #8e8e93
  'Reparation': C.red,      // #ff453a — haveri, lyfts visuellt
}

// Kategori-kod som flytt: lyfts UT ur avbrottens totaler
const FLYTT_KATEGORI = 'Trailer transportation'
const FLYTT_FARG = C.purple // #5e5ce6

// ── Datatyper ────────────────────────────────────────────────
type TypAgg = {
  typ: Typ
  sek: number
  antal: number
  kategorier: { kategori: string; sek: number; antal: number }[]
}

type AvbrottData = {
  totalTimmar: number          // ENBART riktiga avbrott (≥ G15-gränsen), exkl. flytt
  tillfallen: number           // dito
  reparationTimmar: number     // typ='Reparation' (≥ G15), exkl. flytt
  reparationAntal: number
  flyttTimmar: number
  flyttAntal: number
  perTyp: TypAgg[]             // alltid alla 4 typer i samma ordning (≥ G15)
}

// ── Datahämtning ─────────────────────────────────────────────
async function fetchAvbrott(maskinId: string, start: string, end: string): Promise<AvbrottData> {
  const ids = COMBO_IDS[maskinId] || [maskinId]
  const rows = await fetchAll('fakt_avbrott', 'datum, kategori_kod, typ, langd_sek', ids, start, end)

  // 1. Lyft UT flytt-rader (kategori_kod = 'Trailer transportation')
  const flyttRows: any[] = []
  const avbrottRows: any[] = []
  for (const r of rows) {
    if (r.kategori_kod === FLYTT_KATEGORI) flyttRows.push(r)
    else avbrottRows.push(r)
  }

  const flyttTimmar = flyttRows.reduce((s, r) => s + (r.langd_sek || 0), 0) / 3600
  const flyttAntal = flyttRows.length

  // 2. G15-gränsen: bara DownTime ≥ 15 min är avbrott. Rader UNDER gränsen är
  //    samma fenomen som maskinens korta pauser (objektbytesglapp m.m. — verifierat
  //    i MOM-källor, 0 väggklocke-överlapp) och räknas in i "Korta pauser" i
  //    Översikten/uppföljningen — inte här. Se lib/g15.ts.
  const riktigaRows = avbrottRows.filter(r => (r.langd_sek || 0) >= G15_GRANS_SEK)

  // 3. Aggregera avbrotten (≥ G15, utan flytt)
  let totalSek = 0
  let repSek = 0, repAntal = 0
  const byTyp: Record<string, { sek: number; antal: number; kategorier: Record<string, { sek: number; antal: number }> }> = {}

  for (const r of riktigaRows) {
    const sek = r.langd_sek || 0
    totalSek += sek
    if (r.typ === 'Reparation') { repSek += sek; repAntal += 1 }

    const t = (TYPER as readonly string[]).includes(r.typ) ? r.typ : 'Övrigt'
    if (!byTyp[t]) byTyp[t] = { sek: 0, antal: 0, kategorier: {} }
    byTyp[t].sek += sek
    byTyp[t].antal += 1

    const k = r.kategori_kod || 'Default'
    if (!byTyp[t].kategorier[k]) byTyp[t].kategorier[k] = { sek: 0, antal: 0 }
    byTyp[t].kategorier[k].sek += sek
    byTyp[t].kategorier[k].antal += 1
  }

  // Säkerställ att alla 4 typer finns i listan (även med 0 st)
  const perTyp: TypAgg[] = TYPER.map(t => {
    const v = byTyp[t] || { sek: 0, antal: 0, kategorier: {} }
    return {
      typ: t,
      sek: v.sek,
      antal: v.antal,
      kategorier: Object.entries(v.kategorier)
        .map(([k, x]) => ({ kategori: k, sek: x.sek, antal: x.antal }))
        .sort((a, b) => b.sek - a.sek),
    }
  })

  return {
    totalTimmar: totalSek / 3600,
    tillfallen: riktigaRows.length,
    reparationTimmar: repSek / 3600,
    reparationAntal: repAntal,
    flyttTimmar, flyttAntal,
    perTyp,
  }
}

// ── MetricKort (lokal kopia — samma som ProduktionNy:s) ─────
function MetricKort({
  label, value, unit, dec = 0, loading, color, display,
}: {
  label: string
  value: number | null
  unit: string
  dec?: number
  loading: boolean
  color?: string
  display?: string     // om satt används denna direkt — för tidsformattering med fmtTid
}) {
  const rendered = loading
    ? '—'
    : display ?? (value !== null ? fmtSv(value, dec) : '—')
  return (
    <div style={{ background: C.card, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, fontWeight: 500 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{
          fontSize: 24, fontWeight: 600, letterSpacing: -0.6,
          color: color ?? C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>
          {rendered}
        </div>
        {unit && <div style={{ fontSize: 12, color: C.muted }}>{unit}</div>}
      </div>
    </div>
  )
}

// ── ProportionsStapel (handritad SVG) ────────────────────────
function ProportionsStapel({ perTyp }: { perTyp: TypAgg[] }) {
  // Fast ordning Underhåll → Störning → Övrigt → Reparation så att
  // segmenten inte hoppar omkring vid period-byte.
  const totalSek = perTyp.reduce((s, t) => s + t.sek, 0)
  if (totalSek === 0) {
    return (
      <div style={{
        height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.04)',
      }} />
    )
  }
  return (
    <div style={{
      display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden',
      background: 'rgba(255,255,255,0.04)', gap: 2,
    }}>
      {perTyp.map(t => {
        const pct = (t.sek / totalSek) * 100
        if (pct < 0.5) return null
        return (
          <div
            key={t.typ}
            style={{ flex: pct, background: TYP_FARG[t.typ] }}
            title={`${t.typ}: ${pct.toFixed(0)}%`}
          />
        )
      })}
    </div>
  )
}

// ── TypList med accordion drill-down ────────────────────────
function TypList({ perTyp, loading }: { perTyp: TypAgg[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  // Sortera på sek fallande (Reparation håller sin färg oavsett position)
  const sorted = [...perTyp].sort((a, b) => b.sek - a.sek)

  return (
    <div>
      {sorted.map((t, i) => {
        const isHaveri    = t.typ === 'Reparation'
        const hasData     = t.antal > 0
        const showAlarm   = isHaveri && hasData   // rött+bold bara om faktisk reparation
        const isExpanded  = expanded === t.typ
        const hasKat      = !loading && t.kategorier.length > 0

        return (
          <div key={t.typ}>
            {/* ─ Typ-rad ─ */}
            <div
              role={hasKat ? 'button' : undefined}
              onClick={hasKat ? () => setExpanded(isExpanded ? null : t.typ) : undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: '8px 1fr auto auto 18px',
                gap: 10, alignItems: 'center',
                padding: '12px 16px',
                borderTop: i > 0 ? `0.5px solid ${C.divider}` : 'none',
                cursor: hasKat ? 'pointer' : 'default',
              }}
            >
              {/* Färgprick */}
              <div style={{
                width: 8, height: 8, borderRadius: 2,
                background: TYP_FARG[t.typ],
                opacity: hasData ? 1 : 0.4,
              }} />

              {/* Typnamn */}
              <div style={{
                fontSize: 14, letterSpacing: -0.1,
                color:      showAlarm ? C.red  : (hasData ? C.text  : C.muted),
                fontWeight: showAlarm ? 600    : 500,
              }}>{t.typ}</div>

              {/* Antal */}
              <div style={{
                fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums',
                minWidth: 50, textAlign: 'right',
              }}>
                {loading ? '—' : `${t.antal} ${t.antal === 1 ? 'gång' : 'ggr'}`}
              </div>

              {/* Timmar */}
              <div style={{
                fontSize: 14, fontVariantNumeric: 'tabular-nums',
                minWidth: 60, textAlign: 'right',
                color:      showAlarm ? C.red  : (hasData ? C.text  : C.muted),
                fontWeight: showAlarm ? 600    : 500,
              }}>
                {loading ? '—' : fmtTid(t.sek)}
              </div>

              {/* Chevron */}
              <div style={{
                color: C.muted, fontSize: 13, textAlign: 'center',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 200ms cubic-bezier(0.32,0.72,0,1)',
                opacity: hasKat ? 1 : 0,
                lineHeight: 1,
              }}>›</div>
            </div>

            {/* ─ Accordion: kategorier ─ */}
            {isExpanded && hasKat && (
              <div style={{
                background: 'rgba(255,255,255,0.025)',
                borderTop: `0.5px solid ${C.divider}`,
              }}>
                {t.kategorier.map((k, ki) => (
                  <div
                    key={k.kategori}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      gap: 10, alignItems: 'center',
                      padding: '9px 16px 9px 36px',
                      borderTop: ki > 0
                        ? `0.5px solid rgba(255,255,255,0.04)`
                        : 'none',
                    }}
                  >
                    <div style={{ fontSize: 13, color: C.text }}>
                      {translateKategori(k.kategori)}
                    </div>
                    <div style={{
                      fontSize: 11, color: C.muted,
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 50, textAlign: 'right',
                    }}>
                      {k.antal} {k.antal === 1 ? 'gång' : 'ggr'}
                    </div>
                    <div style={{
                      fontSize: 13, fontWeight: 500, color: C.text,
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 60, textAlign: 'right',
                    }}>
                      {fmtTid(k.sek)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── FlyttKort ────────────────────────────────────────────────
function FlyttKort({ timmar, antal }: { timmar: number; antal: number }) {
  return (
    <div style={{
      background: C.card, borderRadius: 14, padding: '14px 16px',
      marginBottom: 14, display: 'grid',
      gridTemplateColumns: '34px 1fr auto auto',
      gap: 12, alignItems: 'center',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 17,
        background: 'rgba(94,92,230,0.18)',
        color: FLYTT_FARG, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 600,
      }}>⇄</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
          Flytt mellan objekt
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          Trailertransport — räknas inte med i avbrotten
        </div>
      </div>
      <div style={{
        fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums',
        textAlign: 'right',
      }}>
        {antal} {antal === 1 ? 'gång' : 'ggr'}
      </div>
      <div style={{
        fontSize: 16, fontWeight: 600, color: FLYTT_FARG,
        fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'right',
      }}>
        {fmtTid(timmar * 3600)}
      </div>
    </div>
  )
}

// ── Root komponent ───────────────────────────────────────────
export default function AvbrottNy({ maskin, onMaskinChange }: {
  maskin: Maskin
  onMaskinChange: (m: Maskin) => void
}) {
  const [period, setPeriod] = useState<Period>('M')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<AvbrottData | null>(null)
  const [loading, setLoading] = useState(false)
  const [maskinOpen, setMaskinOpen] = useState(false)

  const { label, start, end } = getPeriodRange(period, offset)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAvbrott(maskin.id, start, end)
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [maskin.id, start, end])

  useEffect(() => {
    const el = document.getElementById('topbar-title')
    if (!el) return
    el.textContent = `${maskin.namn} — ${label}`
    return () => { el.textContent = 'Maskinvy' }
  }, [maskin.namn, label])

  const showFlytt = !loading && (data?.flyttAntal ?? 0) > 0
  const haveriColor = (data?.reparationTimmar ?? 0) > 0 ? C.red : undefined

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
        {/* Topbar: maskinnamn centrerat */}
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
          <MetricKort
            label="Stopp ≥ 15 min"
            value={data?.totalTimmar ?? null}
            unit=""
            loading={loading}
            display={data ? fmtTid(data.totalTimmar * 3600) : undefined}
          />
          <MetricKort
            label="Tillfällen"
            value={data?.tillfallen ?? null}
            unit={data?.tillfallen === 1 ? 'gång' : 'ggr'}
            loading={loading}
          />
          <MetricKort
            label="Varav haveri"
            value={data?.reparationTimmar ?? null}
            unit=""
            loading={loading}
            color={haveriColor}
            display={data ? fmtTid(data.reparationTimmar * 3600) : undefined}
          />
        </div>

        {/* Flytt-kort (lyfts ut ur avbrotten — visas bara om > 0) */}
        {showFlytt && data && (
          <FlyttKort timmar={data.flyttTimmar} antal={data.flyttAntal} />
        )}

        {/* Avbrottskort */}
        <div style={{ background: C.card, borderRadius: 14, padding: '16px 18px 12px', marginBottom: 14 }}>
          <div style={{
            fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 14,
            padding: '0 0 0',
          }}>
            Vad stoppade maskinen
          </div>

          {/* Proportionsstapel */}
          {loading ? (
            <div style={{
              height: 14, borderRadius: 4,
              background: 'rgba(255,255,255,0.04)', marginBottom: 16,
            }} />
          ) : (
            <div style={{ marginBottom: 16 }}>
              <ProportionsStapel perTyp={data?.perTyp ?? []} />
            </div>
          )}

          {/* Typ-lista */}
          <div style={{ margin: '0 -18px 0' }}>
            <TypList perTyp={data?.perTyp ?? TYPER.map(t => ({ typ: t, sek: 0, antal: 0, kategorier: [] }))} loading={loading} />
          </div>

          {/* G15-fotnot: hemflytten synlig och begriplig — inget tyst filter */}
          <div style={{ fontSize: 11, color: C.muted, padding: '10px 0 2px' }}>
            Stopp under 15 min räknas som korta pauser (se Översikt)
          </div>
        </div>
      </div>
    </div>
  )
}
