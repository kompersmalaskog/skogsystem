'use client'
import { useMemo, useState } from 'react'
import { AVSTAND, FARG, FONT, RADIE, TYP, underTopbar } from '@/lib/design/tokens'
import { SIDOLISTA_BREDD, SIDO_GRUPPER, sidoRad, summaRad, type SidoNiva, type SidoRoll } from '@/lib/maskinvy/sidolista'
import { ALLA_SKORDARE_ID, tint } from './OversiktShared'
import { useMinutklocka } from './useMinutklocka'
import { useAvslutadeMaskiner, useSidolistaData, type SidoMaskin } from './useSidolista'

// ─────────────────────────────────────────────────────────────
// Sidolistan: maskinvalet på stor skärm. Ersätter rullgardinen "namn ▾" i varje vy (page.tsx släcker den med CSS medan
// listan står). Alla maskiner syns samtidigt, grupperade Skördare / Skotare; varje rad säger om maskinen lever nu och vad den
// gjort idag. Ett tryck på en rad väljer maskinen och byter till dess flik (skördare/skotare), vyn (Idag, Produktion …) står kvar.
// Avslutade maskiner (`dim_maskin.aktiv_till` före idag) ligger i en hopfälld grupp "Tidigare" längst ner: bara namnet, ingen prick
// och inga dagssiffror (de hämtas inte ens) — men ett tryck väljer dem som vanligt, så helår och historik går att se.
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
  // null medan det läses: då står inga maskinrader (annars hoppar de avslutade från huvudlistan ner till "Tidigare").
  // "Alla skördare" är ingen maskin: den läses inte, hamnar aldrig i Tidigare och får ingen prick.
  const summaMaskin = useMemo(() => maskiner.find(m => m.id === ALLA_SKORDARE_ID) ?? null, [maskiner])
  const enskilda = useMemo(() => maskiner.filter(m => m.id !== ALLA_SKORDARE_ID), [maskiner])
  const avslutade = useAvslutadeMaskiner(enskilda)
  const aktiva = useMemo(() => (avslutade ? enskilda.filter(m => !avslutade.has(m.id)) : []), [enskilda, avslutade])
  const tidigare = useMemo(() => (avslutade ? enskilda.filter(m => avslutade.has(m.id)) : []), [enskilda, avslutade])
  // Bara de aktiva läser dagens siffror.
  const svar = useSidolistaData(aktiva, avslutade !== null)
  const perGrupp = useMemo(
    () => SIDO_GRUPPER.map(g => ({ ...g, rader: aktiva.filter(m => m.roll === g.roll) })),
    [aktiva],
  )
  const [tidigareOppen, setTidigareOppen] = useState(false)
  const laddar = avslutade === null
  const summa = useMemo(
    () => summaRad(aktiva.filter(m => m.roll === 'skordare').map(m => svar[m.id]), nu),
    [aktiva, svar, nu],
  )
  const summaVald = !!summaMaskin && valdRoll === 'skordare' && valdId === ALLA_SKORDARE_ID

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
          {g.roll === 'skordare' && summaMaskin && !laddar && (
            <button
              type="button"
              data-sido-summa={summaMaskin.id}
              aria-current={summaVald ? 'true' : undefined}
              onClick={() => onVal('skordare', summaMaskin.id)}
              style={{
                display: 'flex', flexDirection: 'column', gap: AVSTAND.xs, width: '100%', boxSizing: 'border-box',
                textAlign: 'left', minHeight: 64, padding: `${AVSTAND.m}px ${AVSTAND.m}px`, marginBottom: AVSTAND.s,
                border: `0.5px solid ${FARG.linje}`, borderRadius: RADIE.rad, cursor: 'pointer', fontFamily: FONT, color: FARG.text,
                background: summaVald ? FARG.fyllning : 'transparent', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ ...TYP.listtitel }}>{summaMaskin.namn}</span>
              <span style={{ ...TYP.meta, color: FARG.text2 }}>{summa.status}</span>
              {summa.siffror && <span style={{ ...TYP.meta, color: FARG.text }}>{summa.siffror}</span>}
            </button>
          )}
          {g.rader.length === 0 && (
            <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.s}px ${AVSTAND.m}px` }}>
              {laddar || (g.roll === 'skotare' && skotareLaddar) ? 'Läser maskiner …' : 'Inga aktiva maskiner'}
            </div>
          )}
          {g.rader.map(m => {
            const rad = sidoRad(m.roll, m.id in svar ? svar[m.id] : 'laser', nu, klockslag)
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

      {tidigare.length > 0 && (
        <section data-sido-tidigare>
          <button
            type="button"
            aria-expanded={tidigareOppen}
            onClick={() => setTidigareOppen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box',
              minHeight: 44, padding: `0 ${AVSTAND.m}px`, border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: FONT, color: FARG.text2, ...TYP.micro, WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span>Tidigare ({tidigare.length})</span>
            <span aria-hidden>{tidigareOppen ? '▾' : '▸'}</span>
          </button>
          {tidigareOppen && tidigare.map(m => {
            const vald = valdRoll === m.roll && valdId === m.id
            return (
              <button
                key={m.id}
                type="button"
                data-sido-rad={m.id}
                data-sido-tidigare=""
                aria-current={vald ? 'true' : undefined}
                onClick={() => onVal(m.roll, m.id)}
                style={{
                  display: 'block', width: '100%', boxSizing: 'border-box', minHeight: 44, padding: `${AVSTAND.s}px ${AVSTAND.m}px`,
                  border: 'none', textAlign: 'left', borderRadius: RADIE.rad, cursor: 'pointer', fontFamily: FONT,
                  ...TYP.listtitel, color: vald ? FARG.text : FARG.text2,
                  background: vald ? FARG.fyllning : 'transparent', WebkitTapHighlightColor: 'transparent',
                }}
              >
                {m.namn}
              </button>
            )
          })}
        </section>
      )}
    </nav>
  )
}
