'use client'
import { TYP, VIKT, RADIE, AVSTAND, FARG, FONT } from '@/lib/design/tokens'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { hamtaAlla } from '@/lib/supabaseAlla'
import { SORTIMENT, SORTIMENT_NAMN } from '@/lib/medelstam/berakna'
import { Sortimentstapel, sortimentFarg } from '@/components/Sortimentstapel'
import {
  SORTIMENT_BESKRIVNING, avvikelseMotProduktion, sortimentFordelning, type SortimentRad,
} from '@/lib/maskinvy/sortiment'
import { COMBO_IDS, fmtSv, getPeriodRange, type Maskin, type Period } from './OversiktShared'

// ─────────────────────────────────────────────────────────────
// SortimentKort — hur periodens volym fördelar sig på timmer, kubb, massaved och övrigt (skördarens Översikt).
//
//   SORTIMENT
//   [100 %-stapel: mörkast = mest värt]
//   ■ Timmer                60 %   2 095 m³
//   ■ Kubb                  10 %     359 m³
//     kubb och klentimmer
//   ■ Massaved              24 %     817 m³
//   ■ Övrigt                 6 %     208 m³
//     energived, avkap, hemved och osorterat
//
// Källa: fakt_sortiment (per sortiment_id) + GRUPPEN ur vyn vy_sortiment_klass — aldrig dim_sortiment_grupp direkt
// (se lib/maskinvy/sortiment). Färg är aldrig ensam: varje rad har ord, procent och m³. Ett läsfel i endera källan är ett
// fel som sägs — det blir aldrig "allt är Övrigt".
// ─────────────────────────────────────────────────────────────

type Laddat = { rader: SortimentRad[]; gruppAv: Map<string, string | null> }

async function hamtaSortiment(ids: string[], start: string, end: string): Promise<Laddat> {
  const [rader, grupper] = await Promise.all([
    hamtaAlla<SortimentRad & { id: number }>(
      () => supabase.from('fakt_sortiment').select('id, sortiment_id, volym_m3sub').in('maskin_id', ids).gte('datum', start).lte('datum', end) as any,
      'id',
    ),
    hamtaAlla<{ sortiment_id: string; grupp: string | null }>(
      () => supabase.from('vy_sortiment_klass').select('sortiment_id, grupp') as any,
      'sortiment_id',
    ),
  ])
  if (rader.error) throw rader.error
  if (grupper.error) throw grupper.error
  return { rader: rader.data, gruppAv: new Map(grupper.data.map(g => [g.sortiment_id, g.grupp])) }
}

export default function SortimentKort({ maskin, period, offset, produktionsvolym }: {
  maskin: Maskin; period: Period; offset: number
  /** Periodens volym ur fakt_produktion (Översiktens egen siffra) — för att säga det när källorna skiljer sig. */
  produktionsvolym?: number | null
}) {
  const { start, end } = getPeriodRange(period, offset)
  const [laddat, setLaddat] = useState<Laddat | null>(null)
  const [fel, setFel] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setFel(false)
    hamtaSortiment(COMBO_IDS[maskin.id] || [maskin.id], start, end)
      .then(l => { if (!cancelled) { setLaddat(l); setLoading(false) } })
      .catch(() => { if (!cancelled) { setFel(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [maskin.id, start, end])

  const f = useMemo(() => (laddat ? sortimentFordelning(laddat.rader, laddat.gruppAv) : null), [laddat])
  const tomt = !loading && !fel && (f?.total ?? 0) === 0
  const avvik = f ? avvikelseMotProduktion(f.total, produktionsvolym) : null

  const rubrik: CSSProperties = { fontSize: TYP.micro.fontSize, color: FARG.text2, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: VIKT.fet }
  const meta: CSSProperties = { fontSize: TYP.meta.fontSize, color: FARG.text2 }

  return (
    <div data-sortiment-kort style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.m}px`, marginBottom: 12, fontFamily: FONT }}>
      <div style={{ marginBottom: AVSTAND.m }}>
        <span style={rubrik}>Sortiment</span>
      </div>

      {loading ? (
        <div style={meta}>Läser sortiment …</div>
      ) : fel ? (
        <div style={meta}>Kunde inte läsa sortiment — ladda om sidan.</div>
      ) : tomt || !f ? (
        <div style={meta}>Ingen produktion i perioden.</div>
      ) : (
        <>
          <Sortimentstapel andel={f.andel} hela={f.hela} luft={0} />
          <div style={{ marginTop: AVSTAND.m }}>
            {SORTIMENT.filter(s => f.volym[s] > 0).map(s => (
              <div key={s} data-sortiment={s} style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m, padding: `${AVSTAND.s}px 0` }}>
                <span aria-hidden style={{ width: 12, height: 12, marginTop: AVSTAND.xs, borderRadius: RADIE.stapel, background: sortimentFarg(s), border: `1px solid ${FARG.linje}`, boxSizing: 'border-box', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: TYP.text.fontSize, color: FARG.text }}>{SORTIMENT_NAMN[s]}</div>
                  {SORTIMENT_BESKRIVNING[s] && <div style={{ ...meta, marginTop: AVSTAND.xs }}>{SORTIMENT_BESKRIVNING[s]}</div>}
                </div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  <div style={{ fontSize: TYP.text.fontSize, fontWeight: VIKT.halvfet, color: FARG.text }}>{f.hela[s]} %</div>
                  <div style={{ ...meta, marginTop: AVSTAND.xs }}>{fmtSv(f.volym[s])} m³</div>
                </div>
              </div>
            ))}
          </div>
          {f.utanGrupp > 0 && (
            <div data-sortiment-not style={{ ...meta, marginTop: AVSTAND.s }}>{fmtSv(f.utanGrupp, 1)} m³ saknar sortimentgrupp och ingår i Övrigt.</div>
          )}
          {f.okandaGrupper.length > 0 && (
            <div data-sortiment-not style={{ ...meta, marginTop: AVSTAND.s }}>Okänd grupp ({f.okandaGrupper.join(', ')}) ingår i Övrigt.</div>
          )}
          {avvik && (
            <div data-sortiment-not style={{ ...meta, marginTop: AVSTAND.s }}>
              Sortimentfilerna visar {fmtSv(avvik.sortiment)} m³ mot {fmtSv(avvik.produktion)} m³ i produktionen.
            </div>
          )}
        </>
      )}
    </div>
  )
}
