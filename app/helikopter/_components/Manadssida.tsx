'use client'

// Sidokolumnen från 1100 px (som markägarrapportens lista): månaderna, nyast överst — den pågående först, sedan avslutade månader
// med beställning (helikopter_historik) och procent skotat mot beställt till höger. Vald rad har FARG.upphojt. Ett tryck byter
// månad på sidan (samma adress som pilarna). På mindre skärmar finns i stället raden "Tidigare månader" under Mer.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens'
import { hamtaHistorik } from '../_lib/queries'
import { historikModell, type Historik } from '../_lib/manadsfacit'
import { manadRubrik } from '../_lib/format'

export function helikopterHref(ar: number, manad: number): string {
  return `/helikopter?ar=${ar}&manad=${manad}`
}

type RadVy = { ar: number; manad: number; rubrik: string; hoger: string; dampad: boolean }

export default function Manadssida({ ar, manad, nuAr, nuManad }: { ar: number; manad: number; nuAr: number; nuManad: number }) {
  const [data, setData] = useState<Historik | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let avbruten = false
    setFel(null)
    hamtaHistorik().then(r => {
      if (avbruten) return
      if (r.error != null) setFel(r.error)
      else setData(r.data)
    })
    return () => { avbruten = true }
  }, [version])

  const rader = useMemo<RadVy[]>(() => {
    const nu: RadVy = { ar: nuAr, manad: nuManad, rubrik: manadRubrik(nuAr, nuManad), hoger: 'pågår', dampad: true }
    const modell = data ? historikModell(data) : null
    const tidigare = (modell?.rader ?? []).filter(r => !(r.ar === nuAr && r.manad === nuManad)).map(r => ({ ar: r.ar, manad: r.manad, rubrik: r.rubrik, hoger: r.procentText, dampad: r.dampad }))
    return [nu, ...tidigare]
  }, [data, nuAr, nuManad])

  // En vald månad som inte finns i listan (kommande, eller äldre än 12 månader) står överst som egen rad så man ser var man är.
  const valdFinns = rader.some(r => r.ar === ar && r.manad === manad)
  const alla = valdFinns ? rader : [{ ar, manad, rubrik: manadRubrik(ar, manad), hoger: '', dampad: true }, ...rader]

  return (
    <nav aria-label="Månader">
      <h2 style={{ ...TYP.micro, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px ${AVSTAND.m}px` }}>Månader</h2>
      {alla.map(r => {
        const vald = r.ar === ar && r.manad === manad
        return (
          <Link
            key={`${r.ar}-${r.manad}`}
            href={helikopterHref(r.ar, r.manad)}
            aria-current={vald ? 'page' : undefined}
            data-manad={`${r.ar}-${r.manad}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min,
              padding: `${AVSTAND.s}px ${AVSTAND.m}px`, borderRadius: RADIE.kort, textDecoration: 'none',
              background: vald ? FARG.upphojt : 'transparent', color: FARG.text,
            }}
          >
            <span style={{ ...TYP.listtitel, color: FARG.text }}>{r.rubrik}</span>
            <span style={{ ...TYP.meta, ...TNUM, color: r.dampad ? FARG.text3 : FARG.text2, flexShrink: 0 }}>{r.hoger}</span>
          </Link>
        )
      })}
      {fel && (
        <button type="button" onClick={() => setVersion(v => v + 1)} style={{ ...TYP.meta, color: FARG.orange, background: 'none', border: 'none', padding: `${AVSTAND.m}px ${AVSTAND.m}px`, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
          Tidigare månader kunde inte läsas · försök igen
        </button>
      )}
      {!fel && data == null && <div style={{ ...TYP.meta, color: FARG.text3, padding: `${AVSTAND.m}px ${AVSTAND.m}px` }}>Läser tidigare månader…</div>}
    </nav>
  )
}
