'use client'

// Arket "Träffsäkerhet" (ur Mer): hur nära prognoserna låg utfallet på klara trakter — planerarens och appens, var för sig.
// Överst ETT tal per källa ("inom 12 %"), sedan vem som låg närmast, sedan trakterna. Modellen är ren (_lib/traffsakerhet.ts);
// här ritas bara. Underlaget läses när arket öppnas (inte med sidan) och ett läsfel är ett fel med Försök igen, aldrig en tom lista.
// Appens frysta prognos finns bara på trakter importerade från 2026-10-24 — tills den första blir klar står appens tal som "–"
// med en ärlig rad, aldrig ett påhittat tal.
import { useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import Sektion from '@/components/design/Sektion'
import Rad from '@/components/design/Rad'
import Flikkontroll from '@/components/design/Flikkontroll'
import { RadLank } from '@/components/ui/RadGrupp'
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens'
import { hamtaPrognosFacit } from '../_lib/queries'
import { fmtDag } from '../_lib/format'
import { KALLA_ORD, byggPar, grupperaTrakter, kallaText, narmastText, ordna, parNarmastText, parText, summera, type FacitRad, type Ordning } from '../_lib/traffsakerhet'

const ORDNINGAR = [['senaste', 'Senaste'], ['skillnad', 'Störst skillnad']] as const

export default function TraffsakerhetSheet({ open, onClose, hamta = hamtaPrognosFacit }: { open: boolean; onClose: () => void; hamta?: () => Promise<{ data: FacitRad[] | null; error: string | null }> }) {
  const [rader, setRader] = useState<FacitRad[] | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [ordning, setOrdning] = useState<Ordning>('senaste')

  useEffect(() => {
    if (!open || rader != null) return
    let avbruten = false
    setFel(null)
    hamta().then(r => {
      if (avbruten) return
      if (r.error != null || r.data == null) setFel(r.error ?? 'Kunde inte läsa')
      else setRader(r.data)
    })
    return () => { avbruten = true }
  }, [open, rader, version, hamta])

  return (
    <Sheet open={open} onClose={onClose} title="Träffsäkerhet">
      {fel ? (
        <Sektion rubrik="Prognos mot utfall" kort={false}>
          <RadLank orange text="Kunde inte läsa trakterna" smakprov="försök igen" onClick={() => { setRader(null); setVersion(v => v + 1) }} sista />
        </Sektion>
      ) : rader == null ? (
        <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Laddar trakterna…</div>
      ) : (
        <Innehall rader={rader} ordning={ordning} onOrdning={setOrdning} />
      )}
    </Sheet>
  )
}

export function Innehall({ rader, ordning, onOrdning }: { rader: FacitRad[]; ordning: Ordning; onOrdning: (o: Ordning) => void }) {
  const alla = byggPar(rader)
  const s = summera(alla)
  const narmast = narmastText(s)
  const grupper = grupperaTrakter(ordna(alla, ordning))
  const appenSaknas = s.kallor.appen.antal === 0

  return (
    <>
      {/* Svaret först: ett tal per källa. Talet färgas aldrig — orden säger allt. */}
      <Sektion rubrik="Hur nära låg prognosen?" kort={false}
        not={appenSaknas ? 'Appens prognos fryses på varje ny trakt innan maskinen börjat. Den första jämförelsen kommer när en sådan trakt är klar.' : 'Inom N % = hälften av trakterna låg närmare än så. Räknat på G15-timmar.'}>
        {(['planeraren', 'appen'] as const).map((k, i) => {
          const t = kallaText(s.kallor[k])
          return <Rad key={k} titel={KALLA_ORD[k]} under={t.under} hoger={<span style={TNUM}>{t.tal}</span>} dampad={t.tal === '–'} sista={i === 1} attr={{ 'data-kalla': k }} />
        })}
      </Sektion>

      {narmast && (
        <Sektion rubrik="Vem låg närmast?" kort={false}>
          <Rad titel={narmast} sista attr={{ 'data-narmast': '1' }} />
        </Sektion>
      )}

      {alla.length > 0 && (
        <Sektion rubrik="Trakterna" kort={false} not="Blev = uppmätt G15-tid på trakten. En trakt utan appens prognos visar bara planerarens.">
          <div style={{ marginBottom: AVSTAND.m }}>
            <Flikkontroll flikar={ORDNINGAR} aktiv={ordning} onVal={onOrdning} />
          </div>
          {grupper.map((g, gi) => (
            <Rad
              key={g.objekt_id}
              titel={g.namn}
              hoger={g.klart ? <span style={{ ...TYP.meta, color: FARG.text2 }}>{fmtDag(g.klart.slice(0, 10))}</span> : undefined}
              under={g.par.map(p => { const n = parNarmastText(p); return <div key={p.roll}>{parText(p)}{n ? ` · ${n}` : ''}</div> })}
              sista={gi === grupper.length - 1}
              attr={{ 'data-trakt': g.objekt_id }}
            />
          ))}
        </Sektion>
      )}
      {alla.length === 0 && (
        <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Ingen klar trakt har en prognos att jämföra med än.</div>
      )}
    </>
  )
}
