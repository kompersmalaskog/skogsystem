'use client'

// /helikopter/manad?ar=&manad= — månadsfacit på en skärm. Utan parametrar: föregående månad.
// Sidhuvud: bakåt (Historik) · "September 2026" + "mot beställning" · dela. Dela: "Dela som PDF" / "Dela som bild" (_lib/manadsfacitDela.ts).
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PageContainer from '@/components/PageContainer'
import { Sheet } from '@/components/Sheet'
import { AVSTAND, FARG, IKON, INAKTIV, ROT_MIN_HOJD, TRAFFYTA, TYP, VY_ROT } from '@/lib/design/tokens'
import { ymdLokal } from '@/lib/datumLokal'
import { hamtaManadsfacit } from '../_lib/queries'
import { facitModell, type Manadsfacit } from '../_lib/manadsfacit'
import { MANAD_NAMN, manadRubrik } from '../_lib/format'
import type { DelaResultat } from '../_lib/veckolageDela'
import { Fel, Laddar, Tomt } from './Tillstand'
import ManadsfacitInnehall from './ManadsfacitInnehall'
import DelaRad from './DelaRad'
import PdfForhandsvisning from './PdfForhandsvisning'
import { HK_CSS } from './Lista'
import { Ikon } from './Ikon'

/** Föregående månad relativt idag ("2026-10-15" → 2026, 9). */
function forraManaden(idag: string): { ar: number; manad: number } {
  const ar = Number(idag.slice(0, 4))
  const manad = Number(idag.slice(5, 7))
  return manad === 1 ? { ar: ar - 1, manad: 12 } : { ar, manad: manad - 1 }
}

export default function ManadsfacitVy() {
  const sp = useSearchParams()
  const idag = ymdLokal(new Date())
  const forra = forraManaden(idag)
  const arParam = parseInt(sp.get('ar') || '')
  const manadParam = parseInt(sp.get('manad') || '')
  const giltig = Number.isFinite(arParam) && Number.isFinite(manadParam) && manadParam >= 1 && manadParam <= 12
  const ar = giltig ? arParam : forra.ar
  const manad = giltig ? manadParam : forra.manad

  const [facit, setFacit] = useState<Manadsfacit | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [delaOppen, setDelaOppen] = useState(false)
  const [jobb, setJobb] = useState(false)
  const [pdfOppen, setPdfOppen] = useState(false)
  const [delaText, setDelaText] = useState<{ text: string; fel: boolean } | null>(null)

  useEffect(() => {
    let avbruten = false
    setFacit(null); setFel(null)
    hamtaManadsfacit(ar, manad).then(r => {
      if (avbruten) return
      if (r.error != null) setFel(r.error)
      else setFacit(r.data)
    })
    return () => { avbruten = true }
  }, [ar, manad, version])

  const modell = useMemo(() => (facit ? facitModell(facit) : null), [facit])
  const undertext = !facit ? (fel ? '' : 'Laddar…') : !modell ? '' : facit.status === 'pagaende' ? 'mot beställning · månaden pågår' : 'mot beställning'

  // Bilden delas direkt (man ser skärmen redan). PDF:en förhandsvisas först (PdfForhandsvisning).
  async function delaBild() {
    if (!modell || jobb) return
    setJobb(true)
    setDelaText({ text: 'Skapar bild…', fel: false })
    try {
      const { delaManadsfacit } = await import('../_lib/manadsfacitDela')
      const r: DelaResultat = await delaManadsfacit(modell, 'bild')
      if (r === 'avbruten') setDelaText(null)
      else setDelaText({ text: r === 'delad' ? 'Delad' : `Nedladdad som ${modell.filnamn}.png`, fel: false })
      if (r === 'delad') setDelaOppen(false)
    } catch (e) {
      console.error('[manadsfacit] dela misslyckades', e)
      setDelaText({ text: 'Kunde inte skapa filen – försök igen', fel: true })
    } finally {
      setJobb(false)
    }
  }
  const oppnaPdf = () => { setDelaOppen(false); setPdfOppen(true) }

  return (
    <div style={{ ...VY_ROT, padding: 0, minHeight: ROT_MIN_HOJD, paddingBottom: AVSTAND.xxl }}>
      <style>{HK_CSS}</style>
      <PageContainer width="smal">
        <header style={{ display: 'grid', gridTemplateColumns: `${TRAFFYTA.min}px 1fr ${TRAFFYTA.min}px`, alignItems: 'center', padding: `${AVSTAND.s}px 0` }}>
          <Link href="/helikopter?flik=historik" aria-label="Tillbaka till Historik" style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
            <Ikon namn="chevron_left" storlek={IKON.rad} farg={FARG.bla} />
          </Link>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <h1 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>{manadRubrik(ar, manad)}</h1>
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{undertext}</div>
          </div>
          <button
            type="button"
            aria-label="Dela månadsfacit"
            onClick={() => { setDelaText(null); setDelaOppen(true) }}
            disabled={!modell}
            style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...(modell ? null : INAKTIV) }}
          >
            <Ikon namn="share" storlek={IKON.rad} farg={FARG.text} />
          </button>
        </header>

        {fel ? (
          <Fel onRetry={() => setVersion(v => v + 1)} />
        ) : !facit ? (
          <Laddar vad="månadsfacit" />
        ) : !modell ? (
          <Tomt rubrik={`Ingen beställning i ${MANAD_NAMN[manad - 1]} ${ar}`} text="Utan beställning finns inget att jämföra med." />
        ) : (
          <ManadsfacitInnehall modell={modell} />
        )}
      </PageContainer>

      {modell && (
        <Sheet open={delaOppen} onClose={() => setDelaOppen(false)} title="Dela">
          <div className="hk-grupp">
            <DelaRad text="Dela som PDF" under="A4, ljus bakgrund" onClick={oppnaPdf} upptagen={false} inaktiv={jobb} />
            <DelaRad text="Dela som bild" under="PNG av sidan" onClick={delaBild} upptagen={jobb} inaktiv={jobb} />
          </div>
          {delaText && (
            <div role="status" style={{ ...TYP.meta, color: delaText.fel ? FARG.orange : FARG.text2, padding: `${AVSTAND.m}px 0 ${AVSTAND.xs}px` }}>{delaText.text}</div>
          )}
        </Sheet>
      )}
      {modell && pdfOppen && (
        <PdfForhandsvisning
          skapa={async () => (await import('../_lib/manadsfacitDela')).skapaManadsfacitPdf(modell)}
          filnamn={modell.filnamn}
          titel={`Månadsfacit ${modell.manadNamn} ${modell.ar}`}
          onStang={() => setPdfOppen(false)}
        />
      )}
    </div>
  )
}
