'use client'

// Rutnat: ett dagrutnät med fast namnkolumn, en rad per sak och block över dagarna. Lyft ur Ledighetens Schema (SchemaVy) med SAMMA mått
// (rutnatMatt.ts): rubrikrad med veckodag + datum, IDAG-flik, dagens datum inverterat, en lodrät ram genom dagens kolumn, helg/röd dag tonad,
// högerkanten tonar ut när fler dagar väntar åt höger. Ledighet har kvar sin egen kod; den här tar bara det en annan vy behöver.
import { useLayoutEffect, useRef, useState } from 'react'
import { AVSTAND, FARG, KORT, RADIE, TNUM, TRAFFYTA, TYP, VIKT, overgang } from '@/lib/design/tokens'
import { AVDELARE_H, HOGER_W, HUVUD_H, NAMN_W, RAD_H, dagBreddFor, merAttSeAtHoger } from './rutnatMatt'

const VECKOBOKSTAV = ['S', 'M', 'T', 'O', 'T', 'F', 'L'] // getDay()-index
const MANAD_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

export type RutnatSegment = {
  id: string
  /** Första och sista dagen (ISO, inklusive) som blocket täcker. */
  fran: string
  till: string
  /** Text i blocket (TYP.meta, kapas). Utelämna på fortsättningsbitar. */
  text?: string
  ton?: 'normal' | 'orange'
  ariaLabel?: string
  onKlick?: () => void
}
export type RutnatHoger = { text: string; ton?: 'normal' | 'orange' | 'muted' }
export type RutnatRad = { id: string; namn: string; segment: RutnatSegment[]; /** Text i en fast högerkolumn (klar-datum). */ hoger?: RutnatHoger }

type Props = {
  /** Dagarna som visas, i ordning (ISO). */
  dagar: string[]
  idagIso: string
  rader: RutnatRad[]
  /** Helg eller röd dag — tonas i alla rader. */
  tonadDag: (iso: string) => boolean
  /** Smalaste dagkolumn (px). Standard DAG_MIN_W som Schemat; en sida som ska visa en hel månad utan scroll tar lägre. */
  minDag?: number
  /** Etikett i avdelaren ovanför raderna (som Schemats "Maskiner"). Utelämnad = ingen avdelare. */
  avdelare?: string
}

export default function Rutnat({ dagar, idagIso, rader, tonadDag, avdelare, minDag }: Props) {
  const ramRef = useRef<HTMLDivElement>(null)
  const [bredd, setBredd] = useState(0)
  const [merAtHoger, setMerAtHoger] = useState(false)
  useLayoutEffect(() => {
    const el = ramRef.current
    if (!el) return
    const mat = () => setBredd(el.clientWidth)
    mat()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(mat)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const harHoger = rader.some(r => r.hoger != null)
  const hogerW = harHoger ? HOGER_W : 0
  const dagBredd = dagBreddFor(bredd - hogerW, dagar.length, minDag)
  const gridBredd = dagar.length * dagBredd
  const uppdateraSkroll = () => {
    const el = ramRef.current
    if (el) setMerAtHoger(merAttSeAtHoger(el.scrollLeft, el.clientWidth, el.scrollWidth))
  }
  useLayoutEffect(uppdateraSkroll, [bredd, dagar.length, rader.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const idagIdx = dagar.indexOf(idagIso) // -1 = idag syns inte → ingen flik, ingen ram

  const stickyCell = (h: number, bg: string = FARG.kort): React.CSSProperties => ({
    position: 'sticky', left: 0, zIndex: 2, width: NAMN_W, flexShrink: 0,
    height: h, display: 'flex', alignItems: 'center', padding: `0 ${AVSTAND.s}px`,
    background: bg, borderRight: `1px solid ${FARG.linje}`, boxSizing: 'border-box',
  })
  const hogerCell = (h: number, bg: string = FARG.kort): React.CSSProperties => ({
    position: 'sticky', right: 0, zIndex: 2, width: HOGER_W, flexShrink: 0,
    height: h, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: `0 ${AVSTAND.s}px`,
    background: bg, borderLeft: `1px solid ${FARG.linje}`, boxSizing: 'border-box',
  })
  const dagBakgrund = (iso: string): string => (iso === idagIso ? FARG.fyllning : tonadDag(iso) ? FARG.tonad : 'transparent')

  const dagCeller = (h: number) => (
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      {dagar.map(iso => (
        <div key={iso} style={{
          width: dagBredd, height: h, boxSizing: 'border-box', flexShrink: 0,
          borderRight: `1px solid ${FARG.tonad}`, borderBottom: `1px solid ${FARG.tonad}`, background: dagBakgrund(iso),
        }} />
      ))}
    </div>
  )

  const segment = (s: RutnatSegment) => {
    const sIdx = dagar.findIndex(d => d >= s.fran)
    const eIdx = dagar.filter(d => d <= s.till).length - 1
    if (sIdx === -1 || eIdx < sIdx) return null
    // Det SYNLIGA blocket följer dagarna; träffytan är minst TRAFFYTA.min bred och lika hög som raden (som Schemats stoppblock).
    const synligLeft = sIdx * dagBredd + 2
    const synligBredd = (eIdx - sIdx + 1) * dagBredd - 4
    const orange = s.ton === 'orange'
    const synligt = (
      <span aria-hidden style={{
        position: 'absolute', top: AVSTAND.xs, bottom: AVSTAND.xs, left: 0, width: synligBredd,
        background: orange ? FARG.orange : FARG.upphojt, borderRadius: RADIE.stapel,
        display: 'flex', alignItems: 'center', padding: `0 ${AVSTAND.xs}px`, boxSizing: 'border-box', overflow: 'hidden',
        ...TYP.meta, color: orange ? FARG.bg : FARG.text, whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>{s.text}</span>
    )
    const traffBredd = Math.max(synligBredd, TRAFFYTA.min)
    const traffLeft = Math.max(0, Math.min(gridBredd - traffBredd, synligLeft + synligBredd / 2 - traffBredd / 2))
    const ram: React.CSSProperties = { position: 'absolute', top: 0, height: RAD_H, left: traffLeft, width: traffBredd }
    const inre = <span style={{ position: 'absolute', top: 0, bottom: 0, left: synligLeft - traffLeft, width: synligBredd }}>{synligt}</span>
    return s.onKlick ? (
      <button key={s.id} type="button" aria-label={s.ariaLabel ?? s.text} onClick={s.onKlick} style={{ ...ram, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>{inre}</button>
    ) : (
      <div key={s.id} style={ram} aria-label={s.ariaLabel}>{inre}</div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ramRef} onScroll={uppdateraSkroll} data-rutnat-ram style={{ ...KORT, padding: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ position: 'relative', width: NAMN_W + gridBredd + hogerW }}>
          {/* Rubrikrad: veckodag + dagnummer (månadsbyte visar månad) */}
          <div style={{ display: 'flex' }}>
            <div style={stickyCell(HUVUD_H)} />
            <div style={{ display: 'flex', width: gridBredd, flexShrink: 0 }}>
              {dagar.map(iso => {
                const d = new Date(`${iso}T00:00:00`)
                const helgdag = tonadDag(iso)
                const arIdag = iso === idagIso
                return (
                  <div key={iso} data-dag={iso} aria-current={arIdag ? 'date' : undefined} style={{
                    width: dagBredd, height: HUVUD_H, boxSizing: 'border-box', flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: AVSTAND.xs,
                    borderRight: `1px solid ${FARG.tonad}`, borderBottom: `1px solid ${FARG.linje}`, background: dagBakgrund(iso),
                  }}>
                    {arIdag && (
                      <span data-rutnat-idag-flik style={{ ...TYP.micro, position: 'relative', zIndex: 3, flexShrink: 0, height: AVSTAND.l, marginBottom: AVSTAND.xs, padding: `0 ${AVSTAND.xs}px`, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', borderRadius: RADIE.rad, background: FARG.text, color: FARG.bg }}>
                        Idag
                      </span>
                    )}
                    <span style={{ ...TYP.micro, color: helgdag ? FARG.rod : arIdag ? FARG.text : FARG.text2 }}>
                      {d.getDate() === 1 ? MANAD_KORT[d.getMonth()] : VECKOBOKSTAV[d.getDay()]}
                    </span>
                    <span data-dag-tal style={{ ...TYP.meta, ...TNUM, width: AVSTAND.xl, height: AVSTAND.xl, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: RADIE.cirkel,
                      background: arIdag ? FARG.text : 'transparent', fontWeight: arIdag ? VIKT.fet : VIKT.normal, color: arIdag ? FARG.bg : helgdag ? FARG.rod : FARG.text }}>
                      {d.getDate()}
                    </span>
                  </div>
                )
              })}
            </div>
            {harHoger && <div style={hogerCell(HUVUD_H)} />}
          </div>

          {avdelare && (
            <div style={{ display: 'flex' }}>
              <div style={stickyCell(AVDELARE_H, FARG.upphojt)}><span style={{ ...TYP.micro, color: FARG.text2 }}>{avdelare}</span></div>
              <div style={{ width: gridBredd, height: AVDELARE_H, flexShrink: 0, background: FARG.upphojt, boxSizing: 'border-box' }} />
              {harHoger && <div style={hogerCell(AVDELARE_H, FARG.upphojt)} />}
            </div>
          )}

          {rader.map(r => (
            <div key={r.id} style={{ display: 'flex' }}>
              <div style={stickyCell(RAD_H)}>
                <span style={{ ...TYP.meta, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.namn}</span>
              </div>
              <div style={{ position: 'relative', width: gridBredd, height: RAD_H, flexShrink: 0 }}>
                {dagCeller(RAD_H)}
                {r.segment.map(segment)}
              </div>
              {harHoger && (
                <div style={hogerCell(RAD_H)}>
                  <span style={{ ...TYP.meta, ...TNUM, fontWeight: r.hoger?.ton === 'orange' ? VIKT.halvfet : VIKT.normal, color: r.hoger?.ton === 'orange' ? FARG.orange : r.hoger?.ton === 'muted' ? FARG.text3 : FARG.text }}>{r.hoger?.text}</span>
                </div>
              )}
            </div>
          ))}

          {/* Dagens KOLUMN: en lodrät vit inramning genom alla rader, från under IDAG-fliken. Fångar inga tryck. */}
          {idagIdx >= 0 && (
            <div aria-hidden data-rutnat-idag style={{ position: 'absolute', top: AVSTAND.l + AVSTAND.xs, bottom: 0, left: NAMN_W + idagIdx * dagBredd, width: dagBredd, boxSizing: 'border-box', zIndex: 1, pointerEvents: 'none',
              borderLeft: `2px solid ${FARG.text}`, borderRight: `2px solid ${FARG.text}` }} />
          )}
        </div>
      </div>
      {/* Högerkanten tonar ut när fler dagar väntar åt höger; försvinner när man svept till slutet. */}
      <div aria-hidden data-rutnat-mer={merAtHoger ? 'ja' : 'nej'} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: AVSTAND.xxl, pointerEvents: 'none', borderRadius: `0 ${RADIE.kort}px ${RADIE.kort}px 0`, background: `linear-gradient(to right, transparent, ${FARG.kort})`, opacity: merAtHoger ? 1 : 0, transition: overgang('opacity') }} />
    </div>
  )
}
