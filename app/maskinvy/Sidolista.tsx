'use client'
import { useMemo } from 'react'
import { AVSTAND, FARG, FONT, RADIE, TYP, underTopbar } from '@/lib/design/tokens'
import { SIDOLISTA_BREDD, SIDO_GRUPPER, sidoRad, type SidoNiva, type SidoRoll } from '@/lib/maskinvy/sidolista'
import { tint } from './OversiktShared'
import { useMinutklocka } from './useMinutklocka'
import { useSidolistaData, type SidoMaskin } from './useSidolista'

// ─────────────────────────────────────────────────────────────
// Sidolistan: maskinvalet på stor skärm. Ersätter rullgardinen "namn ▾" i varje vy (page.tsx släcker den med CSS medan
// listan står). Alla maskiner syns samtidigt, grupperade Skördare / Skotare; varje rad säger om maskinen lever nu och vad den
// gjort idag. Ett tryck på en rad väljer maskinen och byter till dess flik (skördare/skotare), vyn (Idag, Produktion …) står kvar.
// Reglerna för prick och text bor i lib/maskinvy/sidolista.
// ─────────────────────────────────────────────────────────────

function prickFarg(n: SidoNiva): string {
  return n === 'aktiv' ? FARG.gron : n === 'sen' ? FARG.gul : n === 'fel' ? FARG.rod : FARG.text3
}

const klockslag = (iso: string): string => {
  try { return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }) }
  catch { return '—' }
}

export default function Sidolista({ maskiner, skotareLaddar, valdRoll, valdId, onVal }: {
  maskiner: SidoMaskin[]
  /** Skotarlistan läses ur dim_maskin; medan den läses står en rad som säger det. */
  skotareLaddar: boolean
  /** Vald maskin, eller null när ingen maskin är vald (Jämförelse). */
  valdRoll: SidoRoll | null
  valdId: string | null
  onVal: (roll: SidoRoll, id: string) => void
}) {
  const nu = useMinutklocka()
  const svar = useSidolistaData(maskiner, true)
  const perGrupp = useMemo(
    () => SIDO_GRUPPER.map(g => ({ ...g, rader: maskiner.filter(m => m.roll === g.roll) })),
    [maskiner],
  )

  return (
    <nav
      aria-label="Maskiner"
      data-sidolista
      style={{
        position: 'fixed', top: underTopbar(), left: 0, bottom: 0, width: SIDOLISTA_BREDD, boxSizing: 'border-box',
        overflowY: 'auto', background: FARG.bg, borderRight: `0.5px solid ${FARG.linje}`,
        padding: `${AVSTAND.l}px ${AVSTAND.s}px ${AVSTAND.xl}px`, zIndex: 59, fontFamily: FONT,
      }}
    >
      {perGrupp.map(g => (
        <section key={g.roll} data-sido-grupp={g.roll} style={{ marginBottom: AVSTAND.xl }}>
          <div style={{ ...TYP.micro, color: FARG.text2, padding: `0 ${AVSTAND.m}px ${AVSTAND.s}px` }}>{g.rubrik}</div>
          {g.rader.length === 0 && (
            <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.s}px ${AVSTAND.m}px` }}>
              {g.roll === 'skotare' && skotareLaddar ? 'Läser maskiner …' : 'Inga maskiner med data'}
            </div>
          )}
          {g.rader.map(m => {
            const rad = sidoRad(m.roll, svar[m.id] ?? 'laser', nu, klockslag)
            const vald = valdRoll === m.roll && valdId === m.id
            return (
              <button
                key={m.id}
                type="button"
                data-sido-rad={m.id}
                data-sido-niva={rad.niva}
                aria-current={vald ? 'true' : undefined}
                onClick={() => onVal(m.roll, m.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m, width: '100%', boxSizing: 'border-box',
                  minHeight: 64, padding: `${AVSTAND.m}px ${AVSTAND.m}px`, border: 'none', textAlign: 'left',
                  borderRadius: RADIE.rad, cursor: 'pointer', fontFamily: FONT, color: FARG.text,
                  background: vald ? FARG.fyllning : 'transparent', WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8, height: 8, borderRadius: RADIE.stapel, flexShrink: 0, marginTop: AVSTAND.s,
                    background: prickFarg(rad.niva),
                    boxShadow: rad.niva === 'aktiv' ? `0 0 0 3px ${tint(FARG.gron, 18)}` : 'none',
                  }}
                />
                <span style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs, minWidth: 0 }}>
                  <span style={{ ...TYP.listtitel }}>{m.namn}</span>
                  <span style={{ ...TYP.meta, color: FARG.text2 }}>{rad.status}</span>
                  {rad.siffror && <span style={{ ...TYP.meta, color: FARG.text }}>{rad.siffror}</span>}
                </span>
              </button>
            )
          })}
        </section>
      ))}
    </nav>
  )
}
