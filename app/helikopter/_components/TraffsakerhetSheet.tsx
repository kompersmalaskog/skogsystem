'use client'

// Arket "Hade vi rätt?" (ur Mer, förut Träffsäkerhet): hur nära prognoserna låg utfallet på klara trakter — planerarens och appens, var för sig.
// Överst svaret i en mening ("Appen hade oftast rätt"), sedan ETT tal per källa ("8 %"), sedan trakterna med vad var och en sa.
// Så lite text som möjligt (Martin 2026-11-25: "så lätt att ett barn förstår direkt"). Modellen är ren (_lib/traffsakerhet.ts);
// här ritas bara. Underlaget läses när arket öppnas (inte med sidan) och ett läsfel är ett fel med Försök igen, aldrig en tom lista.
// Appens frysta prognos finns bara på trakter importerade från 2026-10-24 — tills den första blir klar står appens tal som "–"
// med en ärlig rad, aldrig ett påhittat tal.
import { useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import Sektion from '@/components/design/Sektion'
import Rad from '@/components/design/Rad'
import Svarsrad from '@/components/design/Svarsrad'
import Ikon from '@/components/design/Ikon'
import Flikkontroll from '@/components/design/Flikkontroll'
import { RadLank } from '@/components/ui/RadGrupp'
import { AVSTAND, FARG, IKON, TNUM, TYP } from '@/lib/design/tokens'
import { hamtaPrognosFacit } from '../_lib/queries'
import { fmtDag } from '../_lib/format'
import { KALLA_ORD, blevText, byggPar, grupperaTrakter, kallaText, ordna, parRader, summera, svarRubrik, type FacitRad, type Ordning } from '../_lib/traffsakerhet'

const ORDNINGAR = [['senaste', 'Senaste'], ['skillnad', 'Mest fel']] as const

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
    <Sheet open={open} onClose={onClose} title="Hade vi rätt?">
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
  const svar = svarRubrik(s)
  const grupper = grupperaTrakter(ordna(alla, ordning))
  const appenSaknas = s.kallor.appen.antal === 0

  return (
    <>
      {/* Svaret först, i en mening. */}
      {svar && <div data-svar="1"><Svarsrad rubrik={svar.rubrik} rad={svar.under} fri /></div>}

      <Sektion rubrik="Hur mycket missar de?" kort={false} not={appenSaknas ? 'Appens första jämförelse kommer när en ny trakt är klar.' : undefined}>
        {(['appen', 'planeraren'] as const).map((k, i) => {
          const t = kallaText(s.kallor[k])
          return <Rad key={k} titel={KALLA_ORD[k]} under={t.under} hoger={<span style={TNUM}>{t.tal}</span>} dampad={t.tal === '–'} sista={i === 1} attr={{ 'data-kalla': k }} />
        })}
      </Sektion>

      {alla.length > 0 && (
        <Sektion rubrik="Trakt för trakt" kort={false}>
          <div style={{ marginBottom: AVSTAND.m }}>
            <Flikkontroll flikar={ORDNINGAR} aktiv={ordning} onVal={onOrdning} />
          </div>
          {grupper.map((g, gi) => (
            <Rad
              key={g.objekt_id}
              titel={g.namn}
              hoger={g.klart ? <span style={{ ...TYP.meta, color: FARG.text2 }}>{fmtDag(g.klart.slice(0, 10))}</span> : undefined}
              under={g.par.map(p => (
                <div key={p.roll} style={{ marginBottom: AVSTAND.s }}>
                  <div>{blevText(p)}</div>
                  {parRader(p).map(r => (
                    <div key={r.kalla} style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.s, marginTop: AVSTAND.xs, ...TYP.text, color: r.narmast ? FARG.text : FARG.text2, fontWeight: r.narmast ? 600 : 400 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>{r.narmast && <Ikon namn="check" storlek={IKON.text} farg={FARG.gron} />}{r.text}{r.narmast ? ' · närmast' : ''}</span>
                      <span style={TNUM}>{r.hoger}</span>
                    </div>
                  ))}
                </div>
              ))}
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
