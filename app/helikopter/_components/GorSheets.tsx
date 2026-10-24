'use client'

// Arken bakom Gör detta och Klar: alla saker (hela listan), maskinens trakter, och flyttförslaget med EN knapp som gör det.
import { useState } from 'react'
import { AVSTAND, FARG, INAKTIV, KNAPP, TNUM, TYP } from '@/lib/design/tokens'
import { Sheet } from '@/components/Sheet'
import Rad from '@/components/design/Rad'
import Sektion from '@/components/design/Sektion'
import { fmtDag } from '../_lib/format'
import type { FlyttForslag, MaskinPlan } from '../_lib/klar'
import { flyttText2, type GorRad, type KlarRad } from '../_lib/kort'
import { GorRadVy } from './GorDettaSektion'

export function AllaSakerSheet({ open, onClose, rader, onOppna }: { open: boolean; onClose: () => void; rader: GorRad[]; onOppna: (r: GorRad) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Gör detta">
      <Sektion rubrik={`${rader.length} ${rader.length === 1 ? 'sak' : 'saker'}`} kort={false}>
        {rader.map((r, i) => <GorRadVy key={r.id} r={r} sista={i === rader.length - 1} onTryck={() => onOppna(r)} />)}
      </Sektion>
    </Sheet>
  )
}

/** Maskinens trakter i kön: namn, "19–23 okt" till höger ("ca" när prognosen är ett förslag). */
export function MaskinTrakterSheet({ open, onClose, rad }: { open: boolean; onClose: () => void; rad: KlarRad | null }) {
  if (!rad) return null
  return (
    <Sheet open={open} onClose={onClose} title={rad.namn}>
      <div style={{ ...TYP.tal, ...TNUM, color: rad.dampad ? FARG.text3 : FARG.text, margin: `${AVSTAND.s}px 0 ${AVSTAND.xs}px` }}>{rad.hoger}</div>
      <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xl }}>{rad.hoger === '–' ? 'Inget planerat' : rad.hoger === '?' ? 'En trakt saknar prognos' : rad.orange ? 'Efter månadens sista arbetsdag' : 'Klar i månaden'}</div>
      {rad.under && <div style={{ ...TYP.text, color: FARG.text2, marginBottom: AVSTAND.xl }}>{rad.under}</div>}
      {rad.trakter.length > 0 && (
        <Sektion rubrik="Trakterna i ordning" kort={false}>
          {rad.trakter.map((t, i) => (
            <Rad
              key={t.objekt_id}
              titel={t.namn}
              under={t.uppskattad ? 'Prognos räknad på liknande trakter' : undefined}
              hoger={t.fran && t.till ? (t.fran === t.till ? fmtDag(t.till) : `${fmtDag(t.fran)} – ${fmtDag(t.till)}`) : '?'}
              dampad={!t.till}
              sista={i === rad.trakter.length - 1}
            />
          ))}
        </Sektion>
      )}
    </Sheet>
  )
}

/** Flyttförslaget: vad det ger, och EN knapp som gör det (tilldelaMaskin). Inget sker utan trycket. */
export function FlyttSheet({ open, onClose, forslag, planer, onFlytta }: {
  open: boolean; onClose: () => void; forslag: FlyttForslag | null; planer: Record<string, MaskinPlan> | null
  onFlytta: (f: FlyttForslag) => Promise<string | null>
}) {
  const [lage, setLage] = useState<{ status: 'vila' | 'skickar' | 'fel'; text: string | null }>({ status: 'vila', text: null })
  if (!forslag || !planer) return null
  const t = flyttText2(forslag, planer)
  const skickar = lage.status === 'skickar'
  async function flytta() {
    if (!forslag) return
    setLage({ status: 'skickar', text: null })
    const fel = await onFlytta(forslag)
    if (fel) setLage({ status: 'fel', text: fel })
    else { setLage({ status: 'vila', text: null }); onClose() }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Flytta">
      <h3 style={{ ...TYP.rubrik, color: FARG.text, margin: `${AVSTAND.s}px 0 ${AVSTAND.l}px` }}>{t.rubrik}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m, ...TYP.text, color: FARG.text2, marginBottom: AVSTAND.xl }}>
        {t.rader.map((r, i) => <p key={i} style={{ margin: 0 }}>{r}</p>)}
      </div>
      <button type="button" onClick={flytta} disabled={skickar} aria-busy={skickar} style={{ ...KNAPP.primar, ...(skickar ? INAKTIV : null) }} data-flytta="">
        {skickar ? 'Flyttar…' : `Flytta till ${forslag.till.namn}`}
      </button>
      {lage.text && <p role="status" style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.m }}>{lage.text}</p>}
    </Sheet>
  )
}
