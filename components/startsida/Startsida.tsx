'use client'

// Nya startsidan — en VÄLJARE, filtrerad efter roll (canvasen "Skogsystem startsida", sidan Slutlig).
// Samma ordning för alla: Behöver dig → Dina vyer → Alla vyer, och det som sällan används i kontomenyn.
// Startsidan växer aldrig: Behöver dig och favoriterna har fast storlek, "Alla vyer" är grupperad och
// ihopfälld på telefon, och sökningen hittar resten. Vyerna kommer ur lib/vyer.ts.
//
// Bara admin ser den än (HomeClient väljer). Inget tas bort. Favoriterna är rollens förinställda tills man
// väljer själv under "Ändra" — de sparas per användare (lib/startsidaFavoriter.ts) och följer med mellan enheter.

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Ikon from '@/components/design/Ikon'
import Ark from '@/components/design/Ark'
import { AVSTAND, FARG, FONT, IKON, INAKTIV, KNAPP, KOLUMN, KORT, RADIE, TRAFFYTA, TYP, designCss, overgang } from '@/lib/design/tokens'
import { MAX_FAVORITER, STANDARD_FAVORITER, favoriterFor, grupperFor, ovrigtFor, sokVyer, type MarkeKalla, type Roll, type Vy } from '@/lib/vyer'

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

const ikonKnapp: CSSProperties = {
  width: TRAFFYTA.min, height: TRAFFYTA.min, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
}

/** Arket "Dina vyer": ta bort (−), lägg till (+), flytta upp, återställ. Spara är grå tills något ändrats. */
function AndraFavoriter({ roll, valda, onSpara, onStang }: { roll: Roll; valda: string[]; onSpara: (ids: string[]) => Promise<boolean>; onStang: () => void }) {
  const [ids, setIds] = useState<string[]>(valda)
  const [sparar, setSparar] = useState(false)
  const [fel, setFel] = useState(false)
  const andrat = ids.length !== valda.length || ids.some((id, i) => id !== valda[i])
  const fullt = ids.length >= MAX_FAVORITER
  const nuvarande = favoriterFor(roll, ids)
  const grupper = grupperFor(roll).map(g => ({ ...g, vyer: g.vyer.filter(v => !ids.includes(v.id)) })).filter(g => g.vyer.length > 0)
  const standard = STANDARD_FAVORITER[roll]
  const arStandard = ids.length === standard.length && ids.every((id, i) => id === standard[i])

  const spara = async () => {
    setSparar(true); setFel(false)
    const ok = await onSpara(ids)
    setSparar(false)
    if (ok) onStang(); else setFel(true)
  }
  const flyttaUpp = (i: number) => setIds(prev => { const n = [...prev]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })

  return (
    <Ark rubrik="Dina vyer" onStang={onStang} fot={<>
      {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>Kunde inte spara. Kontrollera nätet och tryck Spara igen.</p>}
      <button type="button" onClick={spara} disabled={!andrat || sparar} style={{ ...KNAPP.primar, ...(!andrat || sparar ? INAKTIV : {}) }}>
        {sparar ? 'Sparar …' : 'Spara'}
      </button>
    </>}>
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: `${AVSTAND.s}px ${AVSTAND.xs}px ${AVSTAND.s}px` }}>
        <span style={{ ...TYP.micro, color: FARG.text2 }}>På startsidan</span>
        <span style={{ ...TYP.meta, color: FARG.text2 }}>{ids.length} av {MAX_FAVORITER}</span>
      </div>
      <div aria-label="På startsidan">
        {nuvarande.length === 0 && <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 ${AVSTAND.xs}px ${AVSTAND.m}px` }}>Inga vyer valda. Lägg till med + nedan.</p>}
        {nuvarande.map((v, i) => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRAFFYTA.min, borderBottom: `1px solid ${FARG.linje}` }}>
            <button type="button" onClick={() => setIds(prev => prev.filter(x => x !== v.id))} aria-label={`Ta bort ${v.namn}`} style={ikonKnapp}>
              <Ikon namn="do_not_disturb_on" farg={FARG.rod} fylld />
            </button>
            <span style={{ ...TYP.text, flex: 1, minWidth: 0 }}>{v.namn}</span>
            {i > 0 && (
              <button type="button" onClick={() => flyttaUpp(i)} aria-label={`Flytta upp ${v.namn}`} style={ikonKnapp}>
                <Ikon namn="arrow_upward" farg={FARG.text2} />
              </button>
            )}
          </div>
        ))}
      </div>

      {grupper.map(g => (
        <div key={g.id} aria-label={`Lägg till: ${g.namn}`}>
          <div style={{ ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.xl}px ${AVSTAND.xs}px ${AVSTAND.s}px` }}>{g.namn}</div>
          {g.vyer.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRAFFYTA.min, borderBottom: `1px solid ${FARG.linje}` }}>
              <button type="button" onClick={() => setIds(prev => prev.length >= MAX_FAVORITER ? prev : [...prev, v.id])} disabled={fullt}
                aria-label={`Lägg till ${v.namn}`} style={{ ...ikonKnapp, ...(fullt ? INAKTIV : {}) }}>
                <Ikon namn="add_circle" farg={FARG.gron} fylld />
              </button>
              <span style={{ ...TYP.text, flex: 1, minWidth: 0, color: fullt ? FARG.text2 : FARG.text }}>{v.namn}</span>
            </div>
          ))}
        </div>
      ))}
      {fullt && <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.m}px ${AVSTAND.xs}px 0` }}>Startsidan har plats för {MAX_FAVORITER}. Ta bort en för att lägga till en annan.</p>}

      {!arStandard && (
        <button type="button" onClick={() => setIds(standard)} style={{ ...KNAPP.tertiar, marginTop: AVSTAND.l }}>
          Återställ till förinställda
        </button>
      )}
    </Ark>
  )
}

export default function Startsida({ roll, marken, datahalsa, favoritIds, onSparaFavoriter, huvud, bred: bredUtifran }: {
  roll: Roll
  marken: Marken
  datahalsa?: DatahalsaBesked
  /** Egna favoriter (id ur lib/vyer.ts). `null` = inga egna → rollens förinställda. `undefined` med onSparaFavoriter = läses fortfarande. */
  favoritIds?: string[] | null
  /** Sparar egna favoriter; utan den finns ingen Ändra-knapp. Svarar true när sparningen landat. */
  onSparaFavoriter?: (ids: string[]) => Promise<boolean>
  /** Inbäddad (maskinlådan): ersätter sidans rubrik (datum + "Kompersmåla Skog") och sidan ligger inte längre
   *  fast över hela skärmen utan fyller sin behållare. Sökfältet och Mer-knappen finns kvar. */
  huvud?: ReactNode
  /** Bred layout styrd av behållaren i stället för fönstret (lådan är smalare än skärmen). */
  bred?: boolean
}) {
  const bredFonster = useBred()
  const bred = bredUtifran ?? bredFonster
  const inbaddad = huvud !== undefined
  const [fraga, setFraga] = useState('')
  const [oppna, setOppna] = useState<Set<string>>(new Set())
  const [konto, setKonto] = useState(false)
  const [andra, setAndra] = useState(false)

  // Läses fortfarande bara när sidan HAR egna favoriter att läsa (onSparaFavoriter finns) och svaret inte kommit.
  const laddarFavoriter = onSparaFavoriter !== undefined && favoritIds === undefined
  const valdaIds = favoritIds ?? STANDARD_FAVORITER[roll]
  const favoriter = useMemo(() => favoriterFor(roll, valdaIds), [roll, valdaIds])
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
      ...(inbaddad ? { height: '100%' } : { position: 'fixed', inset: 0 }), overflow: 'auto', WebkitOverflowScrolling: 'touch',
      background: FARG.bg, color: FARG.text, fontFamily: FONT, WebkitFontSmoothing: 'antialiased',
    }}>
      <style>{designCss}</style>
      <div style={{
        maxWidth: (bred ? KOLUMN.bred : KOLUMN.smal) + 2 * AVSTAND.sidmarginal, margin: '0 auto', boxSizing: 'border-box',
        padding: inbaddad
          ? `${AVSTAND.l}px ${AVSTAND.sidmarginal}px calc(${AVSTAND.xxl}px + env(safe-area-inset-bottom))`
          : `calc(${AVSTAND.xxl}px + env(safe-area-inset-top)) ${AVSTAND.sidmarginal}px calc(${AVSTAND.xxl * 3}px + env(safe-area-inset-bottom))`,
      }}>

        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: AVSTAND.l, marginBottom: AVSTAND.l }}>
          {inbaddad ? <div style={{ minWidth: 0, flex: 1 }}>{huvud}</div> : (
            <div style={{ minWidth: 0 }}>
              <div style={{ ...TYP.meta, color: FARG.text2 }}>{datumText()}</div>
              <h1 style={{ ...TYP.titel, margin: `${AVSTAND.xs}px 0 0` }}>Kompersmåla Skog</h1>
            </div>
          )}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: -AVSTAND.m }}>
                <Etikett>Dina vyer</Etikett>
                {onSparaFavoriter && !laddarFavoriter && (
                  <button type="button" onClick={() => setAndra(true)} style={{ ...KNAPP.lank, ...TYP.text, padding: `0 ${AVSTAND.xs}px` }}>Ändra</button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bred ? 8 : 4}, minmax(0, 1fr))`, gap: `${AVSTAND.l}px ${AVSTAND.s}px`, minHeight: 88 }}>
                {!laddarFavoriter && favoriter.length === 0 && (
                  <p style={{ ...TYP.meta, color: FARG.text2, margin: 0, gridColumn: '1 / -1' }}>Inga vyer valda. Tryck Ändra för att lägga till.</p>
                )}
                {!laddarFavoriter && favoriter.map(v => {
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

      {andra && onSparaFavoriter && (
        <AndraFavoriter roll={roll} valda={favoriter.map(v => v.id)} onSpara={onSparaFavoriter} onStang={() => setAndra(false)} />
      )}

      {konto && (
        <Ark rubrik="Mer" onStang={() => setKonto(false)}>
          {ovrigt.map((v, i) => <VyRad key={v.id} v={v} marken={marken} sista={i === ovrigt.length - 1} />)}
        </Ark>
      )}

      <style>{`.start-ruta:active > span:first-child { transform: scale(0.92); }`}</style>
    </div>
  )
}
