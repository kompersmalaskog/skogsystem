'use client'

// Historik — månad för månad hur mycket av beställningen som blev skotat. Hämtar själv (en gång när den visas) så att samma innehåll
// kan ligga i en flik (telefon, iPad) och i en panel (stor skärm).
//   1 svarsrad: snittet senaste 6 månaderna (stort) + hur många som låg inom ±5 % (meta)
//   2 kort: upp till 12 staplar, höjd = procent mot 100 %-linjen, tryck = månadens facit, svep = äldre månader
//   3 radgrupp: en rad per månad, nyast först
// Den pågående månaden ingår aldrig (en halv månad är inget facit). Månader utan beställning finns inte.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AVSTAND, FARG, KORT, RADIE, TNUM, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens'
import { RadGrupp, RadLank } from '@/components/ui/RadGrupp'
import { hamtaHistorik } from '../_lib/queries'
import { historikModell, stapelSkala, type Historik, type HistorikModell } from '../_lib/manadsfacit'
import { Fel, Laddar, Tomt } from './Tillstand'

const HOJD = 120
const STAPEL_BREDD = 24
const KORT_HOJD = 24 // plats för procenttalet över stapeln

/** `yta` = bakgrunden kortet och raderna ska ha: FARG.kort på sidan, FARG.upphojt i en panel (som redan är ett kort). */
export default function HistorikInnehall({ yta = FARG.kort }: { yta?: string }) {
  const [data, setData] = useState<Historik | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let avbruten = false
    setData(null); setFel(null)
    hamtaHistorik().then(r => {
      if (avbruten) return
      if (r.error != null) setFel(r.error)
      else setData(r.data)
    })
    return () => { avbruten = true }
  }, [version])

  const modell = useMemo(() => (data ? historikModell(data) : null), [data])

  if (fel) return <Fel onRetry={() => setVersion(v => v + 1)} />
  if (!data) return <Laddar vad="historiken" />
  if (!modell) return <Tomt rubrik="Ingen historik än" text="Avslutade månader med beställning visas här." />

  return (
    <>
      <section style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
        <div style={{ ...TYP.tal, color: FARG.text }}>{modell.svar}</div>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>{modell.meta}</div>
      </section>
      <Staplar modell={modell} yta={yta} />
      <RadGrupp bakgrund={yta}>
        {modell.rader.map(r => (
          <RadLank key={`${r.ar}-${r.manad}`} text={r.rubrik} hoger={{ text: r.procentText, dampad: r.dampad }} href={r.href} />
        ))}
      </RadGrupp>
    </>
  )
}

function Staplar({ modell, yta }: { modell: HistorikModell; yta: string }) {
  const { skala, linje } = stapelSkala(modell.staplar.map(s => s.procent))
  const rulle = useRef<HTMLDivElement>(null)
  // Nyast längst till höger: börja svepet där, äldre månader nås åt vänster.
  useEffect(() => { if (rulle.current) rulle.current.scrollLeft = rulle.current.scrollWidth }, [modell])
  const h = (p: number) => (p > 0 ? Math.max(2, (p / skala) * HOJD) : 0)

  return (
    <section style={{ ...KORT, background: yta, marginBottom: AVSTAND.rad }}>
      <div ref={rulle} style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', minWidth: '100%', width: 'max-content' }}>
          {/* 100 %-linjen: över stapelhöjden, under etiketten. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: KORT_HOJD + linje * HOJD, height: 1, background: FARG.text }} />
          {modell.staplar.map(s => (
            <Link
              key={`${s.ar}-${s.manad}`}
              href={s.href}
              aria-label={`${s.etikett} ${s.ar}: ${Math.round(s.procent)} %`}
              style={{ width: TRAFFYTA.min, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', textDecoration: 'none', flexShrink: 0 }}
            >
              <span style={{ ...TYP.meta, ...TNUM, height: KORT_HOJD, display: 'flex', alignItems: 'flex-end', paddingBottom: AVSTAND.xs, color: s.over ? FARG.text : FARG.text2 }}>{Math.round(s.procent)}</span>
              <span style={{ display: 'flex', alignItems: 'flex-end', height: HOJD }}>
                <span style={{ display: 'block', width: STAPEL_BREDD, height: h(s.procent), background: s.over ? FARG.text : FARG.text2, borderRadius: `${RADIE.stapel}px ${RADIE.stapel}px 0 0` }} />
              </span>
              <span style={{ ...TYP.meta, fontWeight: VIKT.halvfet, color: FARG.text2, height: KORT_HOJD, display: 'flex', alignItems: 'center' }}>{s.etikett}</span>
            </Link>
          ))}
        </div>
      </div>
      <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>Linjen är 100 % av beställt</div>
    </section>
  )
}
