'use client'

// Nya startsidan — en VÄLJARE, filtrerad efter roll (canvasen "Skogsystem startsida", sidan Slutlig).
// Samma ordning för alla: Behöver dig → Dina vyer → Alla vyer, och det som sällan används i kontomenyn.
// Startsidan växer aldrig: Behöver dig och favoriterna har fast storlek, "Alla vyer" är grupperad och
// ihopfälld på telefon, och sökningen hittar resten. Vyerna kommer ur lib/vyer.ts.
//
// Steg 1 (den här): bara admin ser den (HomeClient väljer). Inget tas bort. Favoriterna är förinställda
// per roll; att ändra dem kommer i nästa steg.

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Ikon from '@/components/design/Ikon'
import Ark from '@/components/design/Ark'
import { AVSTAND, FARG, FONT, IKON, KOLUMN, KORT, RADIE, TRAFFYTA, TYP, designCss, overgang } from '@/lib/design/tokens'
import { favoriterFor, grupperFor, ovrigtFor, sokVyer, type MarkeKalla, type Roll, type Vy } from '@/lib/vyer'

/** Räknare per källa. null = okänt (laddar eller läsfel) → inget märke, aldrig "0". */
export type Marken = Partial<Record<MarkeKalla, number | null>>

/** Datahälsans besked i den form startsidan behöver (samma som useDatahalsa ger). */
export type DatahalsaBesked = { niva: 'laddar' | 'gron' | 'gul' | 'rod' | 'okant'; rubrik: string }

const BRED_FRAN = 900

function useBred(): boolean {
  const [bred, setBred] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(`(min-width: ${BRED_FRAN}px)`).matches === true)
  useEffect(() => {
    const mq = window.matchMedia?.(`(min-width: ${BRED_FRAN}px)`)
    if (!mq) return
    const lyssna = () => setBred(mq.matches)
    mq.addEventListener?.('change', lyssna)
    return () => mq.removeEventListener?.('change', lyssna)
  }, [])
  return bred
}

function datumText(nu = new Date()): string {
  const dag = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'][nu.getDay()]
  const manad = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'][nu.getMonth()]
  return `${dag.charAt(0).toUpperCase()}${dag.slice(1)} ${nu.getDate()} ${manad}`
}

/** Räknarmärket — samma regler som gamla startsidan: aldrig "0", text för skärmläsare. */
function Marke({ antal, text, iRad }: { antal: number; text: string; iRad?: boolean }) {
  return (
    <span role="status" aria-label={`${antal} ${text}`} style={{
      ...(iRad ? {} : { position: 'absolute' as const, top: -AVSTAND.xs, right: -AVSTAND.xs }),
      minWidth: 22, height: 22, padding: `0 ${AVSTAND.s - 2}px`, boxSizing: 'border-box',
      borderRadius: RADIE.rad + 1, background: FARG.rod, color: FARG.text,
      ...TYP.meta, fontWeight: 700, lineHeight: '22px', textAlign: 'center',
      border: iRad ? 'none' : `2px solid ${FARG.bg}`, flexShrink: 0,
    }}>{antal > 99 ? '99+' : antal}</span>
  )
}

const MARKE_TEXT: Record<MarkeKalla, string> = {
  egenkontroll: 'objekt väntar på egenkontroll',
  ledighet: 'att göra i ledighet',
}

function antalFor(v: Vy, marken: Marken): number | null {
  if (!v.marke) return null
  const n = marken[v.marke]
  return typeof n === 'number' && n > 0 ? n : null
}

const radStil: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min + AVSTAND.s,
  textDecoration: 'none', color: FARG.text,
}

function VyRad({ v, marken, sista }: { v: Vy; marken: Marken; sista: boolean }) {
  const n = antalFor(v, marken)
  return (
    <Link href={v.href} style={{ ...radStil, borderBottom: sista ? 'none' : `1px solid ${FARG.linje}` }}>
      <Ikon namn={v.ikon} farg={FARG.text2} />
      <span style={{ ...TYP.text, flex: 1, minWidth: 0 }}>{v.namn}</span>
      {n != null && v.marke && <Marke antal={n} text={MARKE_TEXT[v.marke]} iRad />}
      <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />
    </Link>
  )
}

function Etikett({ children }: { children: string }) {
  return <h2 style={{ ...TYP.micro, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` }}>{children}</h2>
}

type Uppgift = { id: string; text: string; href: string; farg: string }

export default function Startsida({ roll, marken, datahalsa }: { roll: Roll; marken: Marken; datahalsa?: DatahalsaBesked }) {
  const bred = useBred()
  const [fraga, setFraga] = useState('')
  const [oppna, setOppna] = useState<Set<string>>(new Set())
  const [konto, setKonto] = useState(false)

  const favoriter = useMemo(() => favoriterFor(roll), [roll])
  const grupper = useMemo(() => grupperFor(roll), [roll])
  const ovrigt = useMemo(() => ovrigtFor(roll), [roll])
  const traffar = useMemo(() => sokVyer(roll, fraga), [roll, fraga])
  const soker = fraga.trim().length > 0

  // Behöver dig: bara det som redan räknas idag. Visas bara när något väntar.
  const uppgifter: Uppgift[] = []
  const ek = marken.egenkontroll
  if (typeof ek === 'number' && ek > 0) uppgifter.push({ id: 'egenkontroll', text: `${ek} objekt väntar på egenkontroll`, href: '/egenkontroll', farg: FARG.orange })
  const le = marken.ledighet
  if (typeof le === 'number' && le > 0) uppgifter.push({ id: 'ledighet', text: `${le} att göra i ledighet`, href: '/ledighet', farg: FARG.orange })
  if (roll === 'admin' && datahalsa && (datahalsa.niva === 'rod' || datahalsa.niva === 'gul' || datahalsa.niva === 'okant')) {
    uppgifter.push({ id: 'datahalsa', text: `Datahälsa: ${datahalsa.rubrik}`, href: '/datahalsa', farg: datahalsa.niva === 'rod' ? FARG.rod : datahalsa.niva === 'gul' ? FARG.orange : FARG.text3 })
  }

  const vaxla = (id: string) => setOppna(prev => {
    const ny = new Set(prev)
    if (ny.has(id)) ny.delete(id); else ny.add(id)
    return ny
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch',
      background: FARG.bg, color: FARG.text, fontFamily: FONT, WebkitFontSmoothing: 'antialiased',
    }}>
      <style>{designCss}</style>
      <div style={{
        maxWidth: (bred ? KOLUMN.bred : KOLUMN.smal) + 2 * AVSTAND.sidmarginal, margin: '0 auto', boxSizing: 'border-box',
        padding: `calc(${AVSTAND.xxl}px + env(safe-area-inset-top)) ${AVSTAND.sidmarginal}px calc(${AVSTAND.xxl * 3}px + env(safe-area-inset-bottom))`,
      }}>

        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: AVSTAND.l, marginBottom: AVSTAND.l }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>{datumText()}</div>
            <h1 style={{ ...TYP.titel, margin: `${AVSTAND.xs}px 0 0` }}>Kompersmåla Skog</h1>
          </div>
          <button type="button" onClick={() => setKonto(true)} aria-label="Mer: inställningar, datahälsa, feedback, om appen"
            style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, borderRadius: RADIE.cirkel, border: 'none', background: FARG.upphojt, color: FARG.text, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <Ikon namn="person" farg={FARG.text} />
          </button>
        </header>

        <label style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, height: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, background: FARG.kort, borderRadius: RADIE.rad, marginBottom: AVSTAND.xl }}>
          <Ikon namn="search" storlek={IKON.text} />
          <input type="search" value={fraga} onChange={e => setFraga(e.target.value)} placeholder="Sök vy" aria-label="Sök vy"
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: FARG.text, fontFamily: 'inherit', ...TYP.text }} />
          {soker && (
            <button type="button" onClick={() => setFraga('')} aria-label="Rensa sökningen"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', minWidth: TRAFFYTA.min, minHeight: TRAFFYTA.min, alignItems: 'center', justifyContent: 'flex-end' }}>
              <Ikon namn="cancel" storlek={IKON.text} farg={FARG.text3} fylld />
            </button>
          )}
        </label>

        {soker ? (
          <section aria-label="Träffar" className="tona-opacity">
            <Etikett>Träffar</Etikett>
            {traffar.length > 0 ? (
              <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
                {traffar.map((v, i) => <VyRad key={v.id} v={v} marken={marken} sista={i === traffar.length - 1} />)}
              </div>
            ) : (
              <p style={{ ...TYP.text, color: FARG.text2, margin: `0 ${AVSTAND.xs}px` }}>
                Ingen vy heter "{fraga.trim()}". Prova ett annat ord, eller öppna Alla vyer.
              </p>
            )}
          </section>
        ) : (
          <>
            {uppgifter.length > 0 && (
              <section aria-label="Behöver dig" style={{ marginBottom: AVSTAND.xl }}>
                <Etikett>Behöver dig</Etikett>
                <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
                  {uppgifter.map((u, i) => (
                    <Link key={u.id} href={u.href} style={{ ...radStil, borderBottom: i === uppgifter.length - 1 ? 'none' : `1px solid ${FARG.linje}` }}>
                      <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: u.farg, flexShrink: 0 }} />
                      <span style={{ ...TYP.text, flex: 1, minWidth: 0 }}>{u.text}</span>
                      <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section aria-label="Dina vyer" style={{ marginBottom: AVSTAND.xl }}>
              <Etikett>Dina vyer</Etikett>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bred ? 8 : 4}, minmax(0, 1fr))`, gap: `${AVSTAND.l}px ${AVSTAND.s}px` }}>
                {favoriter.map(v => {
                  const n = antalFor(v, marken)
                  return (
                    <Link key={v.id} href={v.href} className="start-ruta" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.s, textDecoration: 'none', color: FARG.text, minWidth: 0 }}>
                      <span style={{ position: 'relative', width: 60, height: 60, borderRadius: RADIE.sheet, background: FARG.kort, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: overgang('transform') }}>
                        <Ikon namn={v.ikon} storlek={28} farg={FARG.text} />
                        {n != null && v.marke && <Marke antal={n} text={MARKE_TEXT[v.marke]} />}
                      </span>
                      <span style={{ ...TYP.meta, textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.namn}</span>
                    </Link>
                  )
                })}
              </div>
            </section>

            <section aria-label="Alla vyer">
              <Etikett>Alla vyer</Etikett>
              {bred ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: AVSTAND.l, alignItems: 'start' }}>
                  {grupper.map(g => (
                    <div key={g.id}>
                      <h3 style={{ ...TYP.listtitel, margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` }}>{g.namn}</h3>
                      <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
                        {g.vyer.map((v, i) => <VyRad key={v.id} v={v} marken={marken} sista={i === g.vyer.length - 1} />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
                  {grupper.map((g, gi) => {
                    const oppen = oppna.has(g.id)
                    const summa = g.vyer.reduce((s, v) => s + (antalFor(v, marken) ?? 0), 0)
                    const sistaGrupp = gi === grupper.length - 1
                    return (
                      <div key={g.id} style={{ borderBottom: sistaGrupp ? 'none' : `1px solid ${FARG.linje}` }}>
                        <button type="button" onClick={() => vaxla(g.id)} aria-expanded={oppen}
                          style={{ ...radStil, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                          <span style={{ ...TYP.listtitel, flex: 1, minWidth: 0 }}>{g.namn}</span>
                          {summa > 0 && <Marke antal={summa} text={`att göra i ${g.namn.toLocaleLowerCase('sv-SE')}`} iRad />}
                          <span style={{ ...TYP.meta, color: FARG.text2 }}>{g.vyer.length}</span>
                          <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} vrid={oppen} />
                        </button>
                        {oppen && (
                          <div className="tona-in" style={{ paddingLeft: AVSTAND.xs, borderTop: `1px solid ${FARG.linje}` }}>
                            {g.vyer.map((v, i) => <VyRad key={v.id} v={v} marken={marken} sista={i === g.vyer.length - 1} />)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {konto && (
        <Ark rubrik="Mer" onStang={() => setKonto(false)}>
          {ovrigt.map((v, i) => <VyRad key={v.id} v={v} marken={marken} sista={i === ovrigt.length - 1} />)}
        </Ark>
      )}

      <style>{`.start-ruta:active > span:first-child { transform: scale(0.92); }`}</style>
    </div>
  )
}
