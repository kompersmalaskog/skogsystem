'use client'

// Obekräftade lass (gammal funktion): lassen den gamla självbekräftelsen satte (före 2026-10-21) och som ingen förare har sagt ja till. De räknas inte som
// skotat. Planeraren går igenom dem per trakt, maskin och dag och väljer Bekräfta, Slå ihop eller Stryk — inget raderas, varje beslut loggas med
// lassets tillstånd före (skotar_lass_granskning). Admin; förarna ser ingenting av detta.
import { useCallback, useEffect, useState } from 'react'
import { granskKonsekvens, granskRad, kanSlaIhop, obekraftadeGrupper, standardMottagare, type Granskning, type ObekraftadGrupp } from '@/lib/skotarLass/granskning'
import { granskaLass, lasObekraftade } from '@/lib/skotarLass/granskaKopplad'
import { klockslag } from '@/lib/skotarLass/avlaggStat'
import type { Lass } from '@/lib/skotarLass/typer'

const C = { divider: 'rgba(255,255,255,0.06)', text: '#f2f2f4', muted: '#8e8e93', dim: '#5c5c61', gron: '#30d158', gul: '#ffd60a', rod: '#ff453a', knapp: 'rgba(255,255,255,0.10)' }
const TRYCK = 44

const datumText = (iso: string) => new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

const knapp = (aktiv: boolean, farg?: string): React.CSSProperties => ({
  minHeight: TRYCK, padding: '0 14px', borderRadius: 10, border: 'none', background: C.knapp, color: farg ?? C.text, fontSize: 14, fontWeight: 600,
  opacity: aktiv ? 1 : 0.4, cursor: aktiv ? 'pointer' : 'default',
})

const BESLUT_ORD: Record<Granskning, string> = { bekrafta: 'Bekräfta', slaihop: 'Slå ihop', stryk: 'Stryk' }

export interface ObekraftadeProps {
  /** Trakt och maskin i klartext (vo_nummer / maskin_id → namn). */
  traktNamn: (vo: string | null) => string
  maskinNamn: (id: string) => string
  /** Anropas när något granskats, så att jämförelsen ovanför läser om. */
  vidGranskat?: () => void
}

export default function ObekraftadeLass({ traktNamn, maskinNamn, vidGranskat }: ObekraftadeProps) {
  const [lass, setLass] = useState<Lass[] | null>(null)
  const [fel, setFel] = useState(false)
  const [oppen, setOppen] = useState<string | null>(null)

  const las = useCallback(async () => {
    const l = await lasObekraftade()
    if (!l) { setFel(true); return }
    setFel(false)
    setLass(l)
  }, [])
  useEffect(() => { void las() }, [las])

  if (fel) return <div data-testid="obekraftade-fel" style={{ color: C.gul, fontSize: 14, paddingTop: 10 }}>Kunde inte läsa de obekräftade lassen. <button type="button" onClick={() => void las()} style={{ ...knapp(true), minHeight: TRYCK }}>Försök igen</button></div>
  if (!lass) return null
  const grupper = obekraftadeGrupper(lass)
  if (grupper.length === 0) return null

  const antal = grupper.reduce((s, g) => s + g.lass.length, 0)
  const m3 = grupper.reduce((s, g) => s + g.m3, 0)

  return (
    <div data-testid="obekraftade-lass" style={{ borderTop: `0.5px solid ${C.divider}`, marginTop: 12, paddingTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: 0.4 }}>OBEKRÄFTADE LASS (GAMMAL FUNKTION)</div>
      <div style={{ fontSize: 14, color: C.text, margin: '6px 0 2px' }}>{antal} lass · {m3} m³ räknas inte som skotat</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Den gamla funktionen bekräftade lass av sig själv. Ingen förare har sagt ja till dem. Bekräfta, slå ihop eller stryk — inget raderas.</div>
      {grupper.map((g) => (
        <GruppRad key={g.nyckel} grupp={g} namn={`${traktNamn(g.voNummer)} · ${maskinNamn(g.maskinId)} · ${datumText(g.datum)}`}
          oppen={oppen === g.nyckel} vidKlick={() => setOppen(oppen === g.nyckel ? null : g.nyckel)}
          vidKlar={async () => { await las(); vidGranskat?.() }} />
      ))}
    </div>
  )
}

function GruppRad({ grupp, namn, oppen, vidKlick, vidKlar }: { grupp: ObekraftadGrupp; namn: string; oppen: boolean; vidKlick: () => void; vidKlar: () => Promise<void> }) {
  const [valda, setValda] = useState<ReadonlySet<string>>(new Set())
  const [steg, setSteg] = useState<Granskning | null>(null)
  const [mal, setMal] = useState<string | null>(null)
  const [anledning, setAnledning] = useState('')
  const [upptagen, setUpptagen] = useState(false)
  const [felText, setFelText] = useState<string | null>(null)

  const valdaLass = grupp.lass.filter((l) => valda.has(l.id))
  const byt = (id: string) => { const n = new Set(valda); if (n.has(id)) n.delete(id); else n.add(id); setValda(n); setSteg(null); setFelText(null) }
  const valjAlla = () => { setValda(valda.size === grupp.lass.length ? new Set() : new Set(grupp.lass.map((l) => l.id))); setSteg(null); setFelText(null) }
  const borja = (b: Granskning) => {
    setFelText(null)
    setSteg(b)
    setMal(b === 'slaihop' ? (standardMottagare(valdaLass)?.id ?? null) : null)
  }
  const mottagare = valdaLass.find((l) => l.id === mal) ?? null

  const utfor = async () => {
    if (!steg) return
    setUpptagen(true); setFelText(null)
    const svar = await granskaLass(steg, valdaLass, mal, anledning)
    setUpptagen(false)
    if (!svar.ok) { setFelText(svar.fel); return }
    setValda(new Set()); setSteg(null); setAnledning('')
    await vidKlar()
  }

  return (
    <div style={{ borderTop: `0.5px solid ${C.divider}` }}>
      <button type="button" onClick={vidKlick} aria-expanded={oppen} data-testid="obekraftad-grupp"
        style={{ display: 'flex', width: '100%', minHeight: TRYCK, alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'none', border: 'none', padding: '8px 0', color: C.text, fontSize: 14, textAlign: 'left' }}>
        <span>{namn}</span>
        <span style={{ color: C.muted, fontSize: 13, whiteSpace: 'nowrap' }}>{grupp.lass.length} lass · {grupp.m3} m³ {oppen ? '▴' : '▾'}</span>
      </button>
      {oppen && (
        <div style={{ paddingBottom: 10 }}>
          <button type="button" onClick={valjAlla} style={{ ...knapp(true), marginBottom: 6 }}>{valda.size === grupp.lass.length ? 'Välj inga' : 'Välj alla'}</button>
          {grupp.lass.map((l) => (
            <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: TRYCK, color: C.text, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
              <input type="checkbox" checked={valda.has(l.id)} onChange={() => byt(l.id)} style={{ width: 22, height: 22 }} />
              <span>{granskRad(l, klockslag)}</span>
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="button" disabled={valdaLass.length === 0} onClick={() => borja('bekrafta')} style={knapp(valdaLass.length > 0, C.gron)}>Bekräfta</button>
            <button type="button" disabled={valdaLass.length < 2} onClick={() => borja('slaihop')} style={knapp(valdaLass.length >= 2)}>Slå ihop</button>
            <button type="button" disabled={valdaLass.length === 0} onClick={() => borja('stryk')} style={knapp(valdaLass.length > 0, C.rod)}>Stryk</button>
          </div>
          {steg && (
            <div data-testid="granska-bekrafta" style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 600, marginBottom: 6 }}>{BESLUT_ORD[steg]} {valdaLass.length === 1 ? '1 lass' : `${valdaLass.length} lass`}?</div>
              {steg === 'slaihop' && (
                <label style={{ display: 'block', fontSize: 13, color: C.muted, marginBottom: 8 }}>
                  Slå ihop i
                  <select value={mal ?? ''} onChange={(e) => setMal(e.target.value || null)} style={{ marginLeft: 8, minHeight: TRYCK, background: C.knapp, color: C.text, border: 'none', borderRadius: 8, padding: '0 8px', fontSize: 14 }}>
                    {valdaLass.map((l) => <option key={l.id} value={l.id}>Lass {l.lassNummer}</option>)}
                  </select>
                </label>
              )}
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>{granskKonsekvens(steg, valdaLass, mottagare)}</div>
              <input type="text" value={anledning} onChange={(e) => setAnledning(e.target.value)} placeholder="Anledning (valfri)" aria-label="Anledning"
                style={{ width: '100%', minHeight: TRYCK, boxSizing: 'border-box', background: C.knapp, color: C.text, border: 'none', borderRadius: 8, padding: '0 10px', fontSize: 14, marginBottom: 8 }} />
              {felText && <div role="alert" style={{ color: C.gul, fontSize: 13, marginBottom: 8 }}>{felText}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" data-testid="granska-utfor" disabled={upptagen || (steg === 'slaihop' && !kanSlaIhop(valdaLass, mal))} onClick={() => void utfor()}
                  style={knapp(!upptagen && (steg !== 'slaihop' || kanSlaIhop(valdaLass, mal)), steg === 'stryk' ? C.rod : C.gron)}>{upptagen ? 'Sparar …' : BESLUT_ORD[steg]}</button>
                <button type="button" disabled={upptagen} onClick={() => { setSteg(null); setFelText(null) }} style={knapp(!upptagen)}>Avbryt</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
