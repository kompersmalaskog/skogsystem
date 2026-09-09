'use client'

// "Skördare och skotare": per spår skördat/skotat, skördaren N dagar före + råd; takt per maskin.
import { useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { T } from '@/lib/utbildning'
import { SKORDARE_FORE_VARNING_DAGAR, TYP_NAMN, maskinNamn, maskinRoll, type ManadStatus, type SparLage } from '../_lib/berakningar'
import { dagarText, fmt, kortNamn } from '../_lib/format'
import { hamtaMaskinTakter, type Maskin, type MaskinLage } from '../_lib/queries'
import { ListRad, Sektion, TEXT_MUTED } from './Lista'
import { knapp } from './Tillstand'

type Props = { open: boolean; onClose: () => void; spar: SparLage[]; status: ManadStatus; maskiner: Maskin[]; idag: string }

export default function MaskinerSheet({ open, onClose, spar, status, maskiner, idag }: Props) {
  const [takter, setTakter] = useState<Record<string, MaskinLage | null> | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const ids = maskiner.map(m => m.maskin_id).join(',')

  useEffect(() => {
    if (!open) return
    let avbruten = false
    setTakter(null); setFel(null)
    hamtaMaskinTakter(ids ? ids.split(',') : [], idag).then(r => {
      if (avbruten) return
      if (r.error != null) setFel(r.error)
      else setTakter(r.data)
    })
    return () => { avbruten = true }
  }, [open, ids, idag, version])

  return (
    <Sheet open={open} onClose={onClose} title="Skördare och skotare">
      {spar.map(s => {
        const fore = status === 'pagaende' && s.harPrognos ? s.skordareDagarFore : null
        const rad = fore == null
          ? (status === 'pagaende' ? 'Prognos från arbetsdag 4' : '')
          : fore <= 0
            ? 'Skotaren håller jämna steg'
            : `Skördaren ${dagarText(fore)} före${fore > SKORDARE_FORE_VARNING_DAGAR ? ' · dra ner eller byt trakt' : ''}`
        return (
          <Sektion key={s.typ} rubrik={TYP_NAMN[s.typ]}>
            <ListRad namn="Skördat" tal={fmt(s.skordat)} under={s.taktSkordat != null ? `${fmt(s.taktSkordat)}/dag` : undefined} />
            <ListRad namn="Skotat" tal={fmt(s.skotat)} under={s.taktSkotat != null ? `${fmt(s.taktSkotat)}/dag` : undefined} />
            {rad && <ListRad namn="Oskotat" tal={fmt(Math.max(s.oskotat, 0))} talTon={fore != null && fore > SKORDARE_FORE_VARNING_DAGAR ? 'orange' : 'normal'} under={rad} />}
          </Sektion>
        )
      })}
      <Sektion rubrik="Takt per maskin">
        {fel ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.t1, marginBottom: 12, fontFamily: T.ff }}>Kunde inte läsa maskinerna – försök igen</div>
            <button type="button" onClick={() => setVersion(v => v + 1)} style={knapp}>Försök igen</button>
          </div>
        ) : takter == null ? (
          <div style={{ fontSize: 15, color: T.t2, padding: '12px 0', fontFamily: T.ff }}>Laddar maskiner…</div>
        ) : (
          (['skordare', 'skotare'] as const).map(roll =>
            maskiner.filter(m => maskinRoll(m) === roll).map(m => {
              const l = takter[m.maskin_id]
              return (
                <ListRad
                  key={m.maskin_id}
                  namn={maskinNamn(m)}
                  tal={l?.takt_per_dag != null ? `${fmt(l.takt_per_dag)}/dag` : '–'}
                  talTon={l?.takt_per_dag != null ? 'normal' : 'muted'}
                  under={l ? `Senast ${kortNamn(l.namn)}` : 'Ingen produktion registrerad'}
                  underMuted={!l}
                />
              )
            }),
          )
        )}
      </Sektion>
      <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 12, fontFamily: T.ff }}>m³fub · takt = senaste fem arbetsdagarna</div>
    </Sheet>
  )
}
