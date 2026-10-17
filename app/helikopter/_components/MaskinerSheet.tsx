'use client'

// "Skördare och skotare": per spår skördat/skotat, skördaren N dagar före skotaren (bara fakta); takt per maskin.
import { useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens'
import { TYP_NAMN, maskinNamn, maskinRoll, type ManadStatus, type SparLage } from '../_lib/berakningar'
import { dagarText, fmt, kortNamn } from '../_lib/format'
import { hamtaMaskinTakter, type Maskin, type MaskinLage } from '../_lib/queries'
import { ListRad } from './Lista'
import Sektion from '@/components/design/Sektion'

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
            : `Skördaren ${dagarText(fore)} före skotaren`
        return (
          <Sektion className="hk-grupp" key={s.typ} rubrik={TYP_NAMN[s.typ]} kort={false}>
            <ListRad namn="Skördat" tal={fmt(s.skordat)} under={s.taktSkordat != null ? `${fmt(s.taktSkordat)}/dag` : undefined} />
            <ListRad namn="Skotat" tal={fmt(s.skotat)} under={s.taktSkotat != null ? `${fmt(s.taktSkotat)}/dag` : undefined} />
            {rad && <ListRad namn="Oskotat" tal={fmt(Math.max(s.oskotat, 0))} under={rad} />}
          </Sektion>
        )
      })}
      <Sektion className="hk-grupp" rubrik="Takt per maskin" kort={false}>
        {fel ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l, textAlign: 'center', padding: `${AVSTAND.m}px 0` }}>
            <div style={{ ...TYP.listtitel, color: FARG.text }}>Kunde inte läsa maskinerna – försök igen</div>
            <button type="button" onClick={() => setVersion(v => v + 1)} style={KNAPP.sekundar}>Försök igen</button>
          </div>
        ) : takter == null ? (
          <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Laddar maskiner…</div>
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
      <div style={{ ...TYP.meta, color: FARG.text3 }}>m³fub · takt = senaste fem arbetsdagarna</div>
    </Sheet>
  )
}
