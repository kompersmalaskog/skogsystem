'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { C, FONT, COMBO_IDS, fmtSv, getPeriodRange, type Maskin, type Period } from './OversiktShared'

// ─────────────────────────────────────────────────────────────
// FlertradKort — flerträd per period i skördarens Översikt.
//
//   FLERTRÄD · HPR
//   12 %  flerträd · 2,1 stammar/grepp
//   1 534 av 12 936 mätta stammar i bunt · 536 grepp
//   [staplar per dag/vecka/månad]
//
// Källa: RPC maskindata_flertrad_period (en rad per dag) ur
// detalj_stam.stam_bunt_nyckel — HPR, aldrig MOM. Isolerad hämtning: rör
// varken Data eller PeriodKpi i OversiktShared.
//
// ÄRLIGHET: mätta = stammar i filer skrivna av den flerträdsmedvetna
// importen (≥ 2026-08-23). En period med stammar men utan mätta filer visar
// "ej mätt", ALDRIG 0 %. Delvis mätt period visar andelen på de mätta och
// säger hur många de är.
// ─────────────────────────────────────────────────────────────

export const FLERTRAD_MATT_SEDAN = '2026-08-23'

type DagRad = { dag: string; stammar_alla: number; stammar_matta: number; bunt_stammar: number; grepp: number }

type Hink = { key: string; label: string; start: string; end: string }
type Summa = { alla: number; matta: number; bunt: number; grepp: number }

const MAN_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const pad2 = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

function isoVecka(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dag = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dag)
  const arStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - arStart.getTime()) / 86400000 + 1) / 7)
}

/** Samma hinkar som Produktion-vyn: dag för V/M, vecka för K, månad för Å. */
function byggHinkar(period: Period, start: string, end: string): Hink[] {
  const s = new Date(start + 'T00:00:00'); const e = new Date(end + 'T00:00:00')
  const ut: Hink[] = []
  if (period === 'V' || period === 'M') {
    for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const k = iso(d)
      ut.push({ key: k, label: period === 'V' ? ['sö', 'må', 'ti', 'on', 'to', 'fr', 'lö'][d.getDay()] : String(d.getDate()), start: k, end: k })
    }
    return ut
  }
  if (period === 'K') {
    const d = new Date(s); d.setDate(d.getDate() - ((d.getDay() || 7) - 1))
    while (d <= e) {
      const hs = new Date(d); const he = new Date(d); he.setDate(he.getDate() + 6)
      const ks = hs < s ? s : hs; const ke = he > e ? e : he
      ut.push({ key: iso(hs), label: `v.${isoVecka(hs)}`, start: iso(ks), end: iso(ke) })
      d.setDate(d.getDate() + 7)
    }
    return ut
  }
  const d = new Date(s.getFullYear(), s.getMonth(), 1)
  while (d <= e) {
    const hs = new Date(d); const he = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const ks = hs < s ? s : hs; const ke = he > e ? e : he
    ut.push({ key: iso(hs), label: MAN_KORT[hs.getMonth()], start: iso(ks), end: iso(ke) })
    d.setMonth(d.getMonth() + 1)
  }
  return ut
}

function summera(rader: DagRad[]): Summa {
  return rader.reduce((a, r) => ({
    alla: a.alla + (r.stammar_alla || 0),
    matta: a.matta + (r.stammar_matta || 0),
    bunt: a.bunt + (r.bunt_stammar || 0),
    grepp: a.grepp + (r.grepp || 0),
  }), { alla: 0, matta: 0, bunt: 0, grepp: 0 })
}

function andelPct(s: Summa): number | null {
  return s.matta > 0 ? (100 * s.bunt) / s.matta : null
}

export default function FlertradKort({ maskin, period, offset }: { maskin: Maskin; period: Period; offset: number }) {
  const { start, end } = getPeriodRange(period, offset)
  const [rader, setRader] = useState<DagRad[] | null>(null)
  const [fel, setFel] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setFel(false)
    const ids = COMBO_IDS[maskin.id] || [maskin.id]
    // ≤ 366 rader per anrop — under PostgREST-taket, ingen paginering behövs.
    supabase.rpc('maskindata_flertrad_period', { p_maskin_ids: ids, p_start: start, p_slut: end })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { setFel(true); setRader(null) } else { setRader((data as DagRad[]) || []) }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [maskin.id, start, end])

  const total = useMemo(() => summera(rader || []), [rader])
  const hinkar = useMemo(() => byggHinkar(period, start, end), [period, start, end])
  const perHink = useMemo(() => hinkar.map(h => {
    const s = summera((rader || []).filter(r => r.dag >= h.start && r.dag <= h.end))
    return { hink: h, summa: s, pct: andelPct(s) }
  }), [hinkar, rader])

  const pct = andelPct(total)
  const stPerGrepp = total.grepp > 0 ? total.bunt / total.grepp : null
  const ejMatt = !loading && !fel && total.alla > 0 && total.matta === 0
  const delvis = !loading && !fel && total.matta > 0 && total.matta < total.alla
  const tomt = !loading && !fel && total.alla === 0

  const rubrik: CSSProperties ={ fontSize: 11, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }
  const badge: CSSProperties ={ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.muted, border: `1px solid ${C.divider}`, borderRadius: 5, padding: '1px 5px', marginLeft: 8 }

  return (
    <div style={{ background: C.card, borderRadius: 14, padding: '14px 18px 12px', marginBottom: 12, fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={rubrik}>Flerträd</span>
        <span style={badge}>HPR</span>
      </div>

      {loading ? (
        <div style={{ fontSize: 14, color: C.muted }}>Läser stammar …</div>
      ) : fel ? (
        <div style={{ fontSize: 14, color: C.muted }}>Kunde inte läsa flerträd — ladda om sidan.</div>
      ) : tomt ? (
        <div style={{ fontSize: 14, color: C.muted }}>Inga stammar i perioden.</div>
      ) : ejMatt ? (
        <>
          <div style={{ fontSize: 20, fontWeight: 600, color: C.muted, letterSpacing: -0.3 }}>ej mätt</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
            {fmtSv(total.alla)} stammar importerade före {FLERTRAD_MATT_SEDAN} — flerträd fångades inte då. Omimport av HPR-filerna ger historiken.
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
              {fmtSv(pct, 0)} %
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>flerträd</span>
            {stPerGrepp !== null && (
              <span style={{ fontSize: 15, color: C.muted }}>· {fmtSv(stPerGrepp, 1)} stammar/grepp</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {fmtSv(total.bunt)} av {fmtSv(total.matta)} mätta stammar i bunt · {fmtSv(total.grepp)} grepp
            {delvis ? ` · ${fmtSv(total.alla - total.matta)} stammar omätta (importerade före ${FLERTRAD_MATT_SEDAN})` : ''}
          </div>
        </>
      )}

      {!loading && !fel && !tomt && (
        <Staplar rader={perHink} period={period} />
      )}
    </div>
  )
}

// En stapel per hink, höjd = andel flerträd, etikett = procent. Hink med
// stammar men utan mätta filer ritas streckad med "ej mätt" — aldrig 0 %.
// En färg; etiketten bär informationen.
function Staplar({ rader, period }: { rader: { hink: Hink; summa: Summa; pct: number | null }[]; period: Period }) {
  const max = Math.max(5, ...rader.map(r => r.pct ?? 0))
  const H = 90
  const tat = rader.length > 14
  const nagonEjMatt = rader.some(r => r.pct === null && r.summa.alla > 0)
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
        {period === 'V' || period === 'M' ? 'Per dag' : period === 'K' ? 'Per vecka' : 'Per månad'}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: tat ? 2 : 6, height: H + 34 }}>
        {rader.map(r => {
          const ejMatt = r.pct === null && r.summa.alla > 0
          const hojd = r.pct !== null ? Math.max(3, (r.pct / max) * H) : 0
          return (
            <div key={r.hink.key} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              {!tat && (
                <div style={{ fontSize: 11, fontWeight: 600, color: r.pct !== null ? C.text : C.dim, marginBottom: 4, whiteSpace: 'nowrap' }}>
                  {r.pct !== null ? `${fmtSv(r.pct, 0)} %` : ejMatt ? 'ej mätt' : ''}
                </div>
              )}
              <div style={{
                width: '100%', maxWidth: 36, height: r.pct !== null ? hojd : ejMatt ? 3 : 0, borderRadius: 3,
                background: r.pct !== null ? 'rgba(255,255,255,0.78)' : 'transparent',
                border: ejMatt ? `1px dashed ${C.dim}` : 'none',
              }} />
              <div style={{ fontSize: 10, color: C.muted, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {tat && Number(r.hink.label) % 5 !== 1 && period === 'M' ? '' : r.hink.label}
              </div>
            </div>
          )
        })}
      </div>
      {nagonEjMatt && (
        <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>streckad = stammar finns men flerträd inte mätt (importerat före {FLERTRAD_MATT_SEDAN})</div>
      )}
    </div>
  )
}
