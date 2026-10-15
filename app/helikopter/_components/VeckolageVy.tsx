'use client'

// /helikopter/veckolage — veckoläget för en dag (?datum=, default i dag) på EN skärm.
// Data: helikopter_veckolage(p_idag) — samma payload som onsdagsnotisen, som länkar hit.
// Sidhuvud: bakåt · "Veckoläge" + "Onsdag 16 sep · vecka 38 · 11 arbetsdagar kvar" · dela.
// Dela: sheet med "Dela som PDF" / "Dela som bild" (_lib/veckolageDela.ts).
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PageContainer from '@/components/PageContainer'
import { Sheet } from '@/components/Sheet'
import { AVSTAND, FARG, IKON, INAKTIV, RAD, ROT_MIN_HOJD, TRAFFYTA, TYP, VY_ROT } from '@/lib/design/tokens'
import { ymdLokal } from '@/lib/datumLokal'
import { hamtaVeckolage } from '../_lib/queries'
import { veckolageModell, type VeckolageData } from '../_lib/veckolage'
import type { DelaResultat } from '../_lib/veckolageDela'
import { Fel, Laddar } from './Tillstand'
import VeckolageInnehall from './VeckolageInnehall'
import { HK_CSS } from './Lista'
import { Ikon } from './Ikon'

type Slag = 'pdf' | 'bild'

export default function VeckolageVy() {
  const sp = useSearchParams()
  const idag = ymdLokal(new Date())
  const param = sp.get('datum') || ''
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : idag
  const tillbaka = `/helikopter?flik=uppfoljning&ar=${datum.slice(0, 4)}&manad=${Number(datum.slice(5, 7))}`

  const [data, setData] = useState<VeckolageData | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [delaOppen, setDelaOppen] = useState(false)
  const [jobb, setJobb] = useState<Slag | null>(null)
  const [delaText, setDelaText] = useState<{ text: string; fel: boolean } | null>(null)

  useEffect(() => {
    let avbruten = false
    setData(null); setFel(null)
    hamtaVeckolage(datum).then(r => {
      if (avbruten) return
      if (r.error != null) setFel(r.error)
      else setData(r.data)
    })
    return () => { avbruten = true }
  }, [datum, version])

  const modell = useMemo(() => (data ? veckolageModell(data) : null), [data])

  async function dela(slag: Slag) {
    if (!modell || jobb) return
    setJobb(slag)
    setDelaText({ text: slag === 'pdf' ? 'Skapar PDF…' : 'Skapar bild…', fel: false })
    try {
      const { delaVeckolage } = await import('../_lib/veckolageDela')
      const r: DelaResultat = await delaVeckolage(modell, slag)
      if (r === 'avbruten') setDelaText(null)
      else setDelaText({ text: r === 'delad' ? 'Delad' : `Nedladdad som ${modell.filnamn}.${slag === 'pdf' ? 'pdf' : 'png'}`, fel: false })
      if (r === 'delad') setDelaOppen(false)
    } catch (e) {
      console.error('[veckolage] dela misslyckades', e)
      setDelaText({ text: 'Kunde inte skapa filen – försök igen', fel: true })
    } finally {
      setJobb(null)
    }
  }

  return (
    <div style={{ ...VY_ROT, padding: 0, minHeight: ROT_MIN_HOJD, paddingBottom: AVSTAND.xxl }}>
      <style>{HK_CSS}</style>
      <PageContainer width="smal">
        <header style={{ display: 'grid', gridTemplateColumns: `${TRAFFYTA.min}px 1fr ${TRAFFYTA.min}px`, alignItems: 'center', padding: `${AVSTAND.s}px 0` }}>
          <Link href={tillbaka} aria-label="Tillbaka till Uppföljning" style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
            <Ikon namn="chevron_left" storlek={IKON.rad} farg={FARG.bla} />
          </Link>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <h1 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>Veckoläge</h1>
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {modell ? modell.datumRad : fel ? '' : 'Laddar…'}
            </div>
          </div>
          <button
            type="button"
            aria-label="Dela veckoläget"
            onClick={() => { setDelaText(null); setDelaOppen(true) }}
            disabled={!modell}
            style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...(modell ? null : INAKTIV) }}
          >
            <Ikon namn="share" storlek={IKON.rad} farg={FARG.text} />
          </button>
        </header>

        {fel ? (
          <Fel onRetry={() => setVersion(v => v + 1)} />
        ) : !modell ? (
          <Laddar vad="veckoläget" />
        ) : (
          <VeckolageInnehall modell={modell} />
        )}
      </PageContainer>

      {modell && (
        <Sheet open={delaOppen} onClose={() => setDelaOppen(false)} title="Dela">
          <div className="hk-grupp">
            <DelaRad text="Dela som PDF" under="A4, ljus bakgrund" onClick={() => dela('pdf')} upptagen={jobb === 'pdf'} inaktiv={jobb != null} />
            <DelaRad text="Dela som bild" under="PNG av sidan" onClick={() => dela('bild')} upptagen={jobb === 'bild'} inaktiv={jobb != null} />
          </div>
          {delaText && (
            <div role="status" style={{ ...TYP.meta, color: delaText.fel ? FARG.orange : FARG.text2, padding: `${AVSTAND.m}px 0 ${AVSTAND.xs}px` }}>{delaText.text}</div>
          )}
        </Sheet>
      )}
    </div>
  )
}

function DelaRad({ text, under, onClick, upptagen, inaktiv }: { text: string; under: string; onClick: () => void; upptagen: boolean; inaktiv: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inaktiv}
      aria-busy={upptagen}
      className="hk-rad"
      style={{ border: 'none', ...RAD, justifyContent: 'space-between', width: '100%', boxSizing: 'border-box', background: 'none', color: FARG.text, fontFamily: 'inherit', textAlign: 'left', cursor: inaktiv ? 'default' : 'pointer', ...(inaktiv && !upptagen ? INAKTIV : null) }}
    >
      <span>
        <span style={{ display: 'block', ...TYP.listtitel }}>{upptagen ? `${text}…` : text}</span>
        <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{under}</span>
      </span>
      <Ikon namn="share" />
    </button>
  )
}
