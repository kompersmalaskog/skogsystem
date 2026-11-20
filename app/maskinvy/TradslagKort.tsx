'use client'
import { TYP, VIKT, RADIE, AVSTAND, FARG, FONT } from '@/lib/design/tokens'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { tradslagLabel, tradslagFarg } from '@/lib/tradslag'
import { COMBO_IDS, fetchAll, fmtSv, getPeriodRange, type Maskin, type Period } from './OversiktShared'
import { byggHinkar, type Hink } from './FlertradKort'

// ─────────────────────────────────────────────────────────────
// TradslagKort — trädslagsfördelning per period i skördarens Översikt.
//
//   TRÄDSLAG
//   ■ Gran 73 %  ■ Björk 21 %  ■ Tall 5 %  ■ Övrigt löv 1 %     239 m³
//   [100 %-stapel]
//   [staplar per dag/vecka/månad, 100 % var]
//
// Källa: fakt_produktion via maskindata_produktion-RPC (operatörs-RLS på
// tabellen, #539) — kräver att RPC:n returnerar tradslag_id (migration
// 20260912_maskindata_produktion_tradslag). Namn ur dim_tradslag, normaliserade
// i lib/tradslag så att 'ÖVR_LÖV', 'ÖVR LÖV', 'LÖV' och 'LOV2' blir EN grupp
// "Övrigt löv" även när "Rottne H8E (båda)" blandar två maskiners koder.
//
// Färg är aldrig ensam bärare: varje trädslag står med namn och procent i
// text, färgen är samma som i uppföljningen och gallringsvyn (EN palett).
// ─────────────────────────────────────────────────────────────

type ProdRad = { datum: string; tradslag_id: string | null; volym_m3sub: number | null }
type Andel = { namn: string; volym: number; andel: number; farg: string }

const OKANT = 'Okänt trädslag'

function fordelning(rader: ProdRad[], namnAv: Record<string, string>): { total: number; andelar: Andel[] } {
  const agg = new Map<string, number>()
  for (const r of rader) {
    const namn = r.tradslag_id ? tradslagLabel(namnAv[r.tradslag_id] ?? null) : OKANT
    agg.set(namn, (agg.get(namn) || 0) + (r.volym_m3sub || 0))
  }
  const total = Array.from(agg.values()).reduce((s, v) => s + v, 0)
  const andelar = Array.from(agg.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([namn, volym], i) => ({ namn, volym, andel: total > 0 ? volym / total : 0, farg: tradslagFarg(namn, i) }))
  return { total, andelar }
}

export default function TradslagKort({ maskin, period, offset }: { maskin: Maskin; period: Period; offset: number }) {
  const { start, end } = getPeriodRange(period, offset)
  const [rader, setRader] = useState<ProdRad[] | null>(null)
  const [namnAv, setNamnAv] = useState<Record<string, string>>({})
  const [fel, setFel] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setFel(false)
    const ids = COMBO_IDS[maskin.id] || [maskin.id]
    Promise.all([
      fetchAll('fakt_produktion', 'datum, tradslag_id, volym_m3sub', ids, start, end),
      supabase.from('dim_tradslag').select('tradslag_id, namn').in('maskin_id', ids),
    ]).then(([prod, trad]) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const t of ((trad as any).data || [])) if (t.tradslag_id && t.namn) map[t.tradslag_id] = t.namn
      setNamnAv(map)
      setRader(prod as ProdRad[])
      setLoading(false)
    }).catch(() => { if (!cancelled) { setFel(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [maskin.id, start, end])

  const total = useMemo(() => fordelning(rader || [], namnAv), [rader, namnAv])
  const hinkar = useMemo(() => byggHinkar(period, start, end), [period, start, end])
  const perHink = useMemo(() => hinkar.map(h => ({
    hink: h,
    ...fordelning((rader || []).filter(r => r.datum >= h.start && r.datum <= h.end), namnAv),
  })), [hinkar, rader, namnAv])

  const tomt = !loading && !fel && total.total === 0
  // Alla rader utan tradslag_id = RPC:n saknar kolumnen (migrationen inte körd).
  // Säg det, i stället för att visa "Okänt trädslag 100 %" som om det vore data.
  const saknarKolumn = !loading && !fel && total.total > 0 && total.andelar.length === 1 && total.andelar[0].namn === OKANT

  const rubrik: CSSProperties = { fontSize: TYP.micro.fontSize, color: FARG.text2, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: VIKT.fet }

  return (
    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.m}px`, marginBottom: 12, fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: AVSTAND.m }}>
        <span style={rubrik}>Trädslag</span>
        {!loading && !fel && total.total > 0 && (
          <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, fontVariantNumeric: 'tabular-nums' }}>{fmtSv(total.total)} m³</span>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>Läser produktion …</div>
      ) : fel ? (
        <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>Kunde inte läsa trädslag — ladda om sidan.</div>
      ) : tomt ? (
        <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>Ingen produktion i perioden.</div>
      ) : saknarKolumn ? (
        <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>Trädslag saknas i svaret — funktionen maskindata_produktion behöver kolumnen tradslag_id (migration 20260912).</div>
      ) : (
        <>
          {/* Fördelning i text — namn + procent, färgen bara förstärker */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: AVSTAND.m }}>
            {total.andelar.map(a => (
              <span key={a.namn} style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, fontSize: TYP.meta.fontSize, color: FARG.text }}>
                <span style={{ width: 9, height: 9, borderRadius: RADIE.stapel, background: a.farg, flexShrink: 0 }} />
                {a.namn}
                <span style={{ fontWeight: VIKT.fet, fontVariantNumeric: 'tabular-nums' }}>{fmtSv(a.andel * 100, 0)} %</span>
              </span>
            ))}
          </div>
          {/* 100 %-stapel för perioden */}
          <div style={{ display: 'flex', height: 12, borderRadius: RADIE.stapel, overflow: 'hidden' }}>
            {total.andelar.map(a => (
              <div key={a.namn} title={`${a.namn} ${fmtSv(a.volym)} m³`} style={{ width: `${a.andel * 100}%`, background: a.farg, boxSizing: 'border-box', borderLeft: `1px solid ${FARG.bg}` }} />
            ))}
          </div>
          <Staplar rader={perHink} period={period} />
        </>
      )}
    </div>
  )
}

// En 100 %-stapel per hink (dag/vecka/månad), segment i samma färg och ordning
// som fördelningen ovan. Hink utan produktion lämnas tom.
function Staplar({ rader, period }: { rader: { hink: Hink; total: number; andelar: Andel[] }[]; period: Period }) {
  const H = 70
  const tat = rader.length > 14
  return (
    <div style={{ marginTop: AVSTAND.l }}>
      <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginBottom: 8 }}>
        {period === 'V' || period === 'M' ? 'Per dag' : period === 'K' ? 'Per vecka' : 'Per månad'} · andel av dagens volym
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: tat ? AVSTAND.xs : AVSTAND.s, height: H + 20 }}>
        {rader.map(r => (
          <div key={r.hink.key} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{ width: '100%', maxWidth: 36, height: r.total > 0 ? H : 0, display: 'flex', flexDirection: 'column-reverse', borderRadius: RADIE.stapel, overflow: 'hidden' }}>
              {r.andelar.map(a => (
                <div key={a.namn} title={`${a.namn} ${fmtSv(a.andel * 100, 0)} %`} style={{ height: `${a.andel * 100}%`, background: a.farg, boxSizing: 'border-box', borderTop: `1px solid ${FARG.bg}` }} />
              ))}
            </div>
            <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginTop: AVSTAND.s, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {tat && period === 'M' && Number(r.hink.label) % 5 !== 1 ? '' : r.hink.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
