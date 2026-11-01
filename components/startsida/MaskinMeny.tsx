'use client'

// Maskinlådan — appens meny på maskindatorn (canvasen "Skogsystem startsida", sidan Slutlig: V9Maskin/V9MaskinStor).
//
// I maskinläge är kartan hela appen och startsidan nås aldrig (startvakten skickar maskindatorn till /planering).
// Hem-knappen öppnar därför den här lådan OVANPÅ kartan i stället för att lämna den:
//   - överst maskinen och objektet, med "Byt objekt" som det viktigaste valet (objekt byts ungefär en gång i veckan),
//   - "Till kartan" stänger,
//   - under det SAMMA innehåll som startsidan (Behöver dig, Dina vyer, Alla vyer, sök, Mer) — samma vyregister,
//     samma favoriter, samma märken (useStartsidaData). Kartan får inga nya symboler.
//
// Länkar till /planering (Planering, Inställningar) lämnar inte sidan — man STÅR redan där — utan går till
// onSammaSida, så lådan stängs (och Inställningar öppnar inställningsarket) i stället för en navigering som inte syns.

import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import Startsida from '@/components/startsida/Startsida'
import Ikon from '@/components/design/Ikon'
import { useStartsidaData } from '@/components/startsida/useStartsidaData'
import { useDatahalsa } from '@/app/datahalsa/useDatahalsa'
import { AVSTAND, FARG, FONT, IKON, KNAPP, KORT, RORELSE, TRAFFYTA, TYP, overgang } from '@/lib/design/tokens'
import type { Roll } from '@/lib/vyer'

/** Från den här skärmbredden är lådan en panel från vänster med kartan synlig bredvid; under den fyller den skärmen. */
export const LADA_PANEL_FRAN = 900
/** Panelens bredd (maskindatorn 1280 px: 880 px låda, 400 px karta kvar). */
export const LADA_BREDD = 880
/** Minst så mycket karta ska synas bredvid panelen. */
const KARTA_MINST = 120

export function ladaBredd(fonster: number): number {
  return fonster >= LADA_PANEL_FRAN ? Math.min(LADA_BREDD, fonster - KARTA_MINST) : fonster
}

function useFonsterBredd(): number {
  const [b, setB] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth))
  useEffect(() => {
    const p = () => setB(window.innerWidth)
    window.addEventListener('resize', p)
    return () => window.removeEventListener('resize', p)
  }, [])
  return b
}

export default function MaskinMeny({ maskinNamn, objektNamn, onBytObjekt, onStang, onSammaSida }: {
  /** Maskinens visningsnamn ur dim_maskin (tom = okänd). */
  maskinNamn: string
  /** Öppet objekt, null = inget valt. */
  objektNamn: string | null
  onBytObjekt: () => void
  onStang: () => void
  /** En länk till /planering trycktes (href med eventuell query). Lådan har redan stängts. */
  onSammaSida: (href: string) => void
}) {
  const data = useStartsidaData()
  const { besked } = useDatahalsa()
  // Okänd roll → förarens vyer. Adminvyer visas aldrig på en gissning.
  const roll: Roll = data.roll === 'admin' ? 'admin' : 'forare'
  const fonster = useFonsterBredd()
  const panel = fonster >= LADA_PANEL_FRAN
  const bredd = ladaBredd(fonster)
  const [stanger, setStanger] = useState(false)

  const stang = useCallback(() => {
    if (stanger) return
    const minskaRorelse = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (minskaRorelse) { onStang(); return }
    setStanger(true)
    setTimeout(onStang, RORELSE.byte)
  }, [onStang, stanger])

  // Esc stänger lådan — men inte när ett ark ovanpå (Ändra favoriter, Mer) är öppet; då stänger Esc arket.
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-maskinlada])')) return
      stang()
    }
    window.addEventListener('keydown', t)
    return () => window.removeEventListener('keydown', t)
  }, [stang])

  // Länkar till sidan man redan står på: stäng i stället för att navigera.
  const fangaLank = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest?.('a')
    const href = a?.getAttribute('href')
    if (!href) return
    const sokvag = href.split('?')[0].split('#')[0]
    if (sokvag !== '/planering') return
    e.preventDefault()
    e.stopPropagation()
    onStang()
    onSammaSida(href)
  }

  const bytObjekt = () => { onStang(); onBytObjekt() }

  const overst = (
    <button type="button" onClick={stang} style={{ ...KNAPP.lank, marginLeft: -AVSTAND.xs, padding: `0 ${AVSTAND.xs}px` }}>
      <Ikon namn="chevron_left" storlek={IKON.text} farg={FARG.bla} />
      Till kartan
    </button>
  )
  const under = (
    <div style={{ marginBottom: AVSTAND.l }}>
      <h1 style={{ ...TYP.titel, margin: `0 0 ${AVSTAND.l}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {maskinNamn || 'Maskinen'}
      </h1>
      <button type="button" onClick={bytObjekt} aria-label={objektNamn ? `Byt objekt. Nu: ${objektNamn}` : 'Välj objekt'}
        style={{ ...KORT, width: '100%', minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center', gap: AVSTAND.m,
          padding: `${AVSTAND.m}px ${AVSTAND.l}px`, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: FARG.text }}>
        <Ikon namn="layers" storlek={IKON.text} farg={FARG.text2} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...TYP.meta, color: FARG.text2, display: 'block' }}>{objektNamn ? 'Objekt' : 'Inget objekt valt'}</span>
          {objektNamn && <span style={{ ...TYP.listtitel, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{objektNamn}</span>}
        </span>
        <span style={{ ...TYP.text, color: FARG.bla, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {objektNamn ? 'Byt objekt' : 'Välj objekt'}
          <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.bla} />
        </span>
      </button>
    </div>
  )

  return (
    <div data-maskinlada role="dialog" aria-modal="true" aria-label="Meny" style={{ position: 'fixed', inset: 0, zIndex: 1500, fontFamily: FONT }}>
      {/* Sidled finns inte i designsystemets rörelser (de går uppåt); därför en egen glidning, samma tid och kurva.
          Minska rörelse: bara toning (designCss tonaOpacity, som Startsida renderar). */}
      <style>{`
        @keyframes ladaIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @keyframes ladaUt { from { transform: translateX(0); } to { transform: translateX(-100%); } }
        .lada-panel { animation: ladaIn ${RORELSE.byte}ms ${RORELSE.kurva} both; }
        .lada-panel.ut { animation-name: ladaUt; }
        @media (prefers-reduced-motion: reduce) { .lada-panel, .lada-panel.ut { animation-name: tonaOpacity; } }
      `}</style>
      {/* Kartan bakom: tryck där = Till kartan. */}
      <div className="lada-skugga tona-opacity" onClick={stang} aria-hidden="true"
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', opacity: stanger ? 0 : 1, transition: overgang('opacity') }} />
      <div className={`lada-panel${stanger ? ' ut' : ''}`} onClickCapture={fangaLank}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: bredd, background: FARG.bg,
          paddingTop: 'env(safe-area-inset-top)', boxSizing: 'border-box',
          ...(panel ? { borderRight: `1px solid ${FARG.linje}` } : {}) }}>
        <Startsida roll={roll} huvud={{ overst, under }} bred={panel}
          marken={{ egenkontroll: data.vantandeEgenkontroll, ledighet: data.ledighetPrick?.antal ?? null, lass: data.vantandeLass, godkann: data.vantandeGodkannande, maskinkoll: data.maskinkollVantar }}
          datahalsa={besked} favoritIds={data.favoritIds} onSparaFavoriter={data.sparaFavoriterna}
          konto={data.konto} onLoggaUt={data.loggaUt} />
      </div>
    </div>
  )
}
