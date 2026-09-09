'use client'

// "Var virket ligger": alla öppna objekt med oskotat, per spår. Lazy via helikopter_ny_oskotat_objekt.
import { useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { T } from '@/lib/utbildning'
import { TYPER, TYP_NAMN } from '../_lib/berakningar'
import { fmt, fmtDag, kortNamn } from '../_lib/format'
import { hamtaOskotatObjekt, type OskotatObjekt } from '../_lib/queries'
import { ListRad, Sektion, TEXT_MUTED } from './Lista'
import { knapp } from './Tillstand'

export default function VarVirketSheet({ open, onClose, ar, manad }: { open: boolean; onClose: () => void; ar: number; manad: number }) {
  const [rader, setRader] = useState<OskotatObjekt[] | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!open) return
    let avbruten = false
    setRader(null); setFel(null)
    hamtaOskotatObjekt(ar, manad).then(r => {
      if (avbruten) return
      if (r.error != null) setFel(r.error)
      else setRader(r.data)
    })
    return () => { avbruten = true }
  }, [open, ar, manad, version])

  return (
    <Sheet open={open} onClose={onClose} title="Var virket ligger">
      {fel ? (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.t1, marginBottom: 12, fontFamily: T.ff }}>Kunde inte läsa objekten – försök igen</div>
          <button type="button" onClick={() => setVersion(v => v + 1)} style={knapp}>Försök igen</button>
        </div>
      ) : rader == null ? (
        <div style={{ fontSize: 15, color: T.t2, padding: '12px 0', fontFamily: T.ff }}>Laddar objekt…</div>
      ) : rader.length === 0 ? (
        <div style={{ fontSize: 15, color: T.t2, padding: '12px 0', fontFamily: T.ff }}>Inget oskotat virke på öppna objekt.</div>
      ) : (
        TYPER.map(typ => {
          const iTyp = rader.filter(r => r.typ === typ)
          if (iTyp.length === 0) return null
          const summa = iTyp.reduce((s, r) => s + r.oskotat, 0)
          return (
            <Sektion key={typ} rubrik={`${TYP_NAMN[typ]} · ${fmt(summa)} m³fub`}>
              {iTyp.map(r => (
                <ListRad
                  key={r.objekt_id}
                  namn={kortNamn(r.namn)}
                  tal={fmt(r.oskotat)}
                  under={`Skördat ${fmt(r.skordat)} · skotat ${fmt(r.skotat)}${r.senast_datum ? ` · senast ${fmtDag(r.senast_datum)}` : ''}`}
                />
              ))}
            </Sektion>
          )
        })
      )}
      <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 12, fontFamily: T.ff }}>m³fub · öppna objekt, alla perioder</div>
    </Sheet>
  )
}
