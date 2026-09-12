'use client'

// /helikopter/veckolage — veckoläget för en dag (?datum=, default i dag) på EN skärm.
// Data: helikopter_veckolage(p_idag) — samma payload som onsdagsnotisen, som länkar hit.
// Sidhuvud: bakåt · "Veckoläge" + "Onsdag 16 sep · vecka 38 · 11 arbetsdagar kvar" · dela.
// Dela: sheet med "Dela som PDF" / "Dela som bild" (_lib/veckolageDela.ts).
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, Share2 } from 'lucide-react'
import PageContainer from '@/components/PageContainer'
import { Sheet } from '@/components/Sheet'
import { T } from '@/lib/utbildning'
import { ymdLokal } from '@/lib/datumLokal'
import { hamtaVeckolage } from '../_lib/queries'
import { veckolageModell, type VeckolageData } from '../_lib/veckolage'
import type { DelaResultat } from '../_lib/veckolageDela'
import { Fel, Laddar } from './Tillstand'
import VeckolageInnehall, { VL } from './VeckolageInnehall'
import { KANT } from './Lista'

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
    <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 96, color: T.t1, fontFamily: T.ff, WebkitFontSmoothing: 'antialiased' }}>
      <PageContainer width="smal">
        <header style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', padding: '10px 0 8px' }}>
          <Link href={tillbaka} aria-label="Tillbaka till Uppföljning" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.blue }}>
            <ChevronLeft size={26} />
          </Link>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Veckoläge</h1>
            <div style={{ fontSize: 13, color: T.t2, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {modell ? modell.datumRad : fel ? '' : 'Laddar…'}
            </div>
          </div>
          <button
            type="button"
            aria-label="Dela veckoläget"
            onClick={() => { setDelaText(null); setDelaOppen(true) }}
            disabled={!modell}
            style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: T.blue, cursor: modell ? 'pointer' : 'default', opacity: modell ? 1 : 0.4, padding: 0 }}
          >
            <Share2 size={22} />
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
          <DelaRad text="Dela som PDF" under="A4, ljus bakgrund" onClick={() => dela('pdf')} upptagen={jobb === 'pdf'} inaktiv={jobb != null} />
          <DelaRad text="Dela som bild" under="PNG av sidan" onClick={() => dela('bild')} upptagen={jobb === 'bild'} inaktiv={jobb != null} />
          {delaText && (
            <div role="status" style={{ fontSize: 14, color: delaText.fel ? VL.varning : T.t2, padding: '12px 0 4px' }}>{delaText.text}</div>
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
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 56, padding: '8px 0', background: 'none', border: 'none', borderTop: KANT, color: T.t1, fontFamily: T.ff, textAlign: 'left', cursor: inaktiv ? 'default' : 'pointer', opacity: inaktiv && !upptagen ? 0.4 : 1 }}
    >
      <span>
        <span style={{ display: 'block', fontSize: 17, fontWeight: 600 }}>{upptagen ? `${text}…` : text}</span>
        <span style={{ display: 'block', fontSize: 13, color: T.t2, marginTop: 2 }}>{under}</span>
      </span>
      <Share2 size={18} color={T.blue} aria-hidden="true" />
    </button>
  )
}
