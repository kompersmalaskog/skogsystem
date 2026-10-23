'use client'
import { underTopbar, RADIE, AVSTAND, TYP, VIKT, medSafeBotten, FARG, FONT, kolumnRot, overgang } from '@/lib/design/tokens'; // layoutmått, inte avstånd (tokens: LAYOUT)

import { useEffect, useState } from 'react'
import {
  MASKINER, COMBO_IDS, getPeriodRange, fetchAll, fmtSv, fmtTid, type Maskin, type Period, FLYTT_FARG, tint,
} from './OversiktShared'
import { AVBROTT_TYPER, AVBROTT_TYP_FARG, antalText, avbrottTid, type AvbrottTyp } from '../../lib/maskinvy/avbrottStil'
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
const TYPER = AVBROTT_TYPER
type Typ = AvbrottTyp

const TYP_FARG = AVBROTT_TYP_FARG

// Kategori-kod som flytt: lyfts UT ur avbrottens totaler
const FLYTT_KATEGORI = 'Trailer transportation'

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
    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px` }}>
      <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginBottom: 8, fontWeight: VIKT.halvfet }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{
          fontSize: TYP.rubrik.fontSize, fontWeight: VIKT.halvfet, letterSpacing: -0.6,
          color: color ?? FARG.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>
          {rendered}
        </div>
        {unit && <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>{unit}</div>}
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
        height: 14, borderRadius: RADIE.stapel, background: FARG.tonad,
      }} />
    )
  }
  return (
    <div style={{
      display: 'flex', height: 14, borderRadius: RADIE.stapel, overflow: 'hidden',
      background: FARG.tonad, gap: AVSTAND.xs,
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
  // En kategori utan stopp är tyst: den visas inte (noll rader i listan, inte fyra rader med nollor). Medan det läses står alla fyra.
  const synliga = loading ? sorted : sorted.filter(t => t.antal > 0)

  return (
    <div>
      {!loading && synliga.length === 0 && (
        <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, padding: `${AVSTAND.m}px ${AVSTAND.l}px` }}>
          Inga stopp under perioden
        </div>
      )}
      {synliga.map((t, i) => {
        const isHaveri    = t.typ === 'Reparation'
        const hasData     = t.antal > 0
        const showAlarm   = isHaveri && hasData   // mörkare orange+bold bara om faktisk reparation
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
                gap: AVSTAND.m, alignItems: 'center',
                padding: '12px 16px',
                borderTop: i > 0 ? `0.5px solid ${FARG.linje}` : 'none',
                cursor: hasKat ? 'pointer' : 'default',
              }}
            >
              {/* Färgprick */}
              <div style={{
                width: 8, height: 8, borderRadius: RADIE.stapel,
                background: TYP_FARG[t.typ],
                opacity: hasData ? 1 : 0.4,
              }} />

              {/* Typnamn */}
              <div style={{
                fontSize: TYP.meta.fontSize, letterSpacing: -0.1,
                color:      showAlarm ? TYP_FARG.Reparation : (hasData ? FARG.text  : FARG.text2),
                fontWeight: showAlarm ? VIKT.halvfet    : VIKT.halvfet,
              }}>{t.typ}</div>

              {/* Antal */}
              <div style={{
                fontSize: TYP.micro.fontSize, color: FARG.text2, fontVariantNumeric: 'tabular-nums',
                minWidth: 50, textAlign: 'right',
              }}>
                {loading ? '—' : antalText(t.antal)}
              </div>

              {/* Timmar */}
              <div style={{
                fontSize: TYP.meta.fontSize, fontVariantNumeric: 'tabular-nums',
                minWidth: 60, textAlign: 'right',
                color:      showAlarm ? TYP_FARG.Reparation : (hasData ? FARG.text  : FARG.text2),
                fontWeight: showAlarm ? VIKT.halvfet    : VIKT.halvfet,
              }}>
                {loading ? '—' : avbrottTid(t.sek, fmtTid)}
              </div>

              {/* Chevron */}
              <div style={{
                color: FARG.text2, fontSize: TYP.meta.fontSize, textAlign: 'center',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: overgang('transform'),
                opacity: hasKat ? 1 : 0,
                lineHeight: 1,
              }}>›</div>
            </div>

            {/* ─ Accordion: kategorier ─ */}
            {isExpanded && hasKat && (
              <div style={{
                background: FARG.tonad,
                borderTop: `0.5px solid ${FARG.linje}`,
              }}>
                {t.kategorier.map((k, ki) => (
                  <div
                    key={k.kategori}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      gap: AVSTAND.m, alignItems: 'center',
                      padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.s}px ${AVSTAND.xxl}px`,
                      borderTop: ki > 0
                        ? `0.5px solid ${FARG.linje}`
                        : 'none',
                    }}
                  >
                    <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text }}>
                      {translateKategori(k.kategori)}
                    </div>
                    <div style={{
                      fontSize: TYP.micro.fontSize, color: FARG.text2,
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 50, textAlign: 'right',
                    }}>
                      {antalText(k.antal)}
                    </div>
                    <div style={{
                      fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text,
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
      background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px`,
      marginBottom: AVSTAND.l, display: 'grid',
      gridTemplateColumns: '34px 1fr auto auto',
      gap: 12, alignItems: 'center',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: RADIE.sheet,
        background: tint(FLYTT_FARG, 18),
        color: FLYTT_FARG, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: TYP.text.fontSize, fontWeight: VIKT.halvfet,
      }}>⇄</div>
      <div>
        <div style={{ fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text }}>
          Flytt mellan objekt
        </div>
        <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginTop: AVSTAND.xs }}>
          Trailertransport — räknas inte med i avbrotten
        </div>
      </div>
      <div style={{
        fontSize: TYP.micro.fontSize, color: FARG.text2, fontVariantNumeric: 'tabular-nums',
        textAlign: 'right',
      }}>
        {antal} {antal === 1 ? 'gång' : 'ggr'}
      </div>
      <div style={{
        fontSize: TYP.text.fontSize, fontWeight: VIKT.halvfet, color: FLYTT_FARG,
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
  const reparationColor = (data?.reparationTimmar ?? 0) > 0 ? TYP_FARG.Reparation : undefined

  return (
    <div style={{
      position: 'fixed', top: underTopbar(), left: 0, right: 0, bottom: 0,
      overflow: 'auto', background: FARG.bg, color: FARG.text,
      fontFamily: FONT, fontFeatureSettings: '"tnum"',
    }}>
      {/* ── Sticky header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: FARG.bg, borderBottom: `0.5px solid ${FARG.linje}`,
      }}>
        {/* Topbar: maskinnamn centrerat */}
        <div style={{ padding: `${AVSTAND.l}px ${AVSTAND.l}px`, textAlign: 'center', position: 'relative' }}>
          <button
            className="mv-maskinval"
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
            <span className="mv-maskinval-pil" style={{ color: FARG.text2, fontSize: TYP.micro.fontSize }}>▾</span>
          </button>
          {maskinOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              background: FARG.kort, borderRadius: RADIE.kort, marginTop: AVSTAND.s,
              minWidth: 260, overflow: 'hidden', zIndex: 100,
              boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
            }}>
              {MASKINER.map(m => (
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
              color: FARG.text2, fontSize: TYP.rubrik.fontSize, cursor: 'pointer', fontFamily: FONT,
            }}
          >‹</button>
          <div style={{
            minWidth: 180, textAlign: 'center',
            fontSize: TYP.text.fontSize, fontWeight: VIKT.halvfet, color: FARG.text, letterSpacing: -0.3,
          }}>{label}</div>
          <button
            onClick={() => setOffset(o => Math.min(o + 1, 0))}
            disabled={offset >= 0}
            aria-label="Nästa period"
            style={{
              width: 44, height: 44, border: 'none', background: 'transparent',
              color: offset >= 0 ? FARG.text3 : FARG.text2, fontSize: TYP.rubrik.fontSize,
              cursor: offset >= 0 ? 'default' : 'pointer', fontFamily: FONT,
            }}
          >›</button>
        </div>

        {/* V/M/K/Å segmented control */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: `${AVSTAND.xs}px ${AVSTAND.l}px ${AVSTAND.l}px` }}>
          <div style={{
            display: 'inline-flex', background: FARG.linje,
            borderRadius: RADIE.kort, padding: AVSTAND.xs,
          }}>
            {(['V', 'M', 'K', 'Å'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setOffset(0) }}
                style={{
                  minWidth: 58, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, border: 'none', borderRadius: RADIE.rad,
                  background: period === p ? FARG.fyllning : 'transparent',
                  color: period === p ? FARG.text : FARG.text2,
                  fontSize: TYP.meta.fontSize, fontWeight: period === p ? VIKT.halvfet : VIKT.halvfet,
                  fontFamily: FONT, cursor: 'pointer',
                }}
              >{p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Innehåll ── */}
      <div style={{ ...kolumnRot('smal'), padding: `${AVSTAND.l}px ${AVSTAND.l}px 0`, paddingBottom: medSafeBotten(AVSTAND.xxl) }}>
        {/* Kontextrad */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: AVSTAND.m, marginBottom: AVSTAND.l,
        }}>
          <MetricKort
            label="Stopp ≥ 15 min"
            value={data?.totalTimmar ?? null}
            unit=""
            loading={loading}
            display={data ? avbrottTid(data.totalTimmar * 3600, fmtTid) : undefined}
          />
          <MetricKort
            label="Tillfällen"
            value={data?.tillfallen ?? null}
            unit={data?.tillfallen === 1 ? 'gång' : 'ggr'}
            loading={loading}
          />
          <MetricKort
            label="Varav reparation"
            value={data?.reparationTimmar ?? null}
            unit=""
            loading={loading}
            color={reparationColor}
            display={data ? avbrottTid(data.reparationTimmar * 3600, fmtTid) : undefined}
          />
        </div>

        {/* Flytt-kort (lyfts ut ur avbrotten — visas bara om > 0) */}
        {showFlytt && data && (
          <FlyttKort timmar={data.flyttTimmar} antal={data.flyttAntal} />
        )}

        {/* Avbrottskort */}
        <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.m}px`, marginBottom: AVSTAND.l }}>
          <div style={{
            fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text2, marginBottom: AVSTAND.l,
            padding: '0 0 0',
          }}>
            Vad stoppade maskinen
          </div>

          {/* Proportionsstapel */}
          {loading ? (
            <div style={{
              height: 14, borderRadius: RADIE.stapel,
              background: FARG.tonad, marginBottom: 16,
            }} />
          ) : (
            <div style={{ marginBottom: 16 }}>
              <ProportionsStapel perTyp={data?.perTyp ?? []} />
            </div>
          )}

          {/* Typ-lista */}
          <div style={{ margin: `0 ${AVSTAND.l}px 0` }}>
            <TypList perTyp={data?.perTyp ?? TYPER.map(t => ({ typ: t, sek: 0, antal: 0, kategorier: [] }))} loading={loading} />
          </div>

          {/* G15-fotnot: hemflytten synlig och begriplig — inget tyst filter */}
          <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, padding: `${AVSTAND.m}px 0 ${AVSTAND.xs}px` }}>
            Stopp under 15 min räknas som korta pauser (se Översikt)
          </div>
        </div>
      </div>
    </div>
  )
}
