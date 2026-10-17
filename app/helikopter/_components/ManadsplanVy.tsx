'use client'

// /helikopter/manadsplan?ar=&manad= — månadsplanen på en A4-sida. Byggd som månadsfacit (ManadsfacitVy): bakåt (Planering) · "November 2026" +
// "Plan · 17 oktober · Kompersmåla Skog" · dela. Dela: "Dela som PDF" (förhandsvisas) / "Dela som bild" (_lib/manadsplanDela.ts). Utan parametrar: innevarande månad.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PageContainer from '@/components/PageContainer'
import { Sheet } from '@/components/Sheet'
import { AVSTAND, FARG, IKON, INAKTIV, ROT_MIN_HOJD, TRAFFYTA, TYP, VY_ROT } from '@/lib/design/tokens'
import { ymdLokal } from '@/lib/datumLokal'
import { arBestallningKopierad } from '../_lib/bestKopierad'
import { arHelgEllerRod } from '../_lib/klarRutnat'
import { planModell } from '../_lib/manadsplan'
import { useKlar } from '../_lib/useKlar'
import type { DelaResultat } from '../_lib/veckolageDela'
import { Fel, Laddar } from './Tillstand'
import ManadsplanInnehall from './ManadsplanInnehall'
import DelaRad from './DelaRad'
import PdfForhandsvisning from './PdfForhandsvisning'
import { HK_CSS } from './Lista'
import Ikon from '@/components/design/Ikon'

export default function ManadsplanVy() {
  const sp = useSearchParams()
  const idag = ymdLokal(new Date())
  const arParam = parseInt(sp.get('ar') || '')
  const manadParam = parseInt(sp.get('manad') || '')
  const giltig = Number.isFinite(arParam) && Number.isFinite(manadParam) && manadParam >= 1 && manadParam <= 12
  const ar = giltig ? arParam : Number(idag.slice(0, 4))
  const manad = giltig ? manadParam : Number(idag.slice(5, 7))

  const { data, fel, laddar, ladda } = useKlar(ar, manad, idag)
  const [delaOppen, setDelaOppen] = useState(false)
  const [jobb, setJobb] = useState(false)
  const [pdfOppen, setPdfOppen] = useState(false)
  const [delaText, setDelaText] = useState<{ text: string; fel: boolean } | null>(null)
  // "Vida: beställning bekräftad?" står bara om beställningen lades in med "Samma som" på den här enheten.
  const [kopierad, setKopierad] = useState(false)
  useEffect(() => { setKopierad(arBestallningKopierad(ar, manad)) }, [ar, manad])

  const modell = useMemo(() => (data ? planModell(data, { idag, kopierad }) : null), [data, idag, kopierad])

  async function delaBild() {
    if (!modell || jobb) return
    setJobb(true)
    setDelaText({ text: 'Skapar bild…', fel: false })
    try {
      const { delaManadsplan } = await import('../_lib/manadsplanDela')
      const r: DelaResultat = await delaManadsplan(modell, arHelgEllerRod, 'bild')
      if (r === 'avbruten') setDelaText(null)
      else setDelaText({ text: r === 'delad' ? 'Delad' : `Nedladdad som ${modell.filnamn}.png`, fel: false })
      if (r === 'delad') setDelaOppen(false)
    } catch (e) {
      console.error('[manadsplan] dela misslyckades', e)
      setDelaText({ text: 'Kunde inte skapa filen – försök igen', fel: true })
    } finally {
      setJobb(false)
    }
  }
  const oppnaPdf = () => { setDelaOppen(false); setPdfOppen(true) }

  return (
    <div style={{ ...VY_ROT, padding: 0, minHeight: ROT_MIN_HOJD, paddingBottom: AVSTAND.xxl }}>
      <style>{HK_CSS}</style>
      <PageContainer width="bred">
        <header style={{ display: 'grid', gridTemplateColumns: `${TRAFFYTA.min}px 1fr ${TRAFFYTA.min}px`, alignItems: 'center', padding: `${AVSTAND.s}px 0` }}>
          <Link href={`/helikopter?flik=planering&ar=${ar}&manad=${manad}`} aria-label="Tillbaka till Planering" style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
            <Ikon namn="chevron_left" storlek={IKON.rad} farg={FARG.bla} />
          </Link>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <h1 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>{modell ? modell.rubrik : 'Månadsplan'}</h1>
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{modell ? modell.undertitel : fel ? '' : 'Laddar…'}</div>
          </div>
          <button
            type="button"
            aria-label="Dela månadsplan"
            onClick={() => { setDelaText(null); setDelaOppen(true) }}
            disabled={!modell}
            style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...(modell ? null : INAKTIV) }}
          >
            <Ikon namn="share" storlek={IKON.rad} farg={FARG.text} />
          </button>
        </header>

        {fel ? (
          <Fel onRetry={() => void ladda()} />
        ) : laddar || !modell ? (
          <Laddar vad="månadsplanen" />
        ) : (
          <ManadsplanInnehall modell={modell} />
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
          skapa={async () => (await import('../_lib/manadsplanDela')).skapaManadsplanPdf(modell, arHelgEllerRod)}
          filnamn={modell.filnamn}
          titel={`Månadsplan ${modell.rubrik}`}
          onStang={() => setPdfOppen(false)}
        />
      )}
    </div>
  )
}
