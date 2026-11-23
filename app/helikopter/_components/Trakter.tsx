'use client'

// TRAKTERNA SOM SKA KÖRAS — under korten på Läget nu. En rad per inlagd trakt, i körordning. Skördare och skotare står var på sin rad
// (rollprick + maskin) med ordet som säger om den hinner: "Klar 26 nov" · "Klar ca 3 dec · efter månadens slut" · "Prognos saknas" · "Ingen skotare" · "Markägaren skotar".
// Ordet bär betydelsen, pricken förstärker (Status.tsx). Allt räknas i _lib/traktLista.ts; den här filen ritar.
import Sektion from '@/components/design/Sektion'
import { AVSTAND, FARG, RAD, TNUM, TYP } from '@/lib/design/tokens'
import { rollFarg } from '@/lib/sparStil'
import { fmt } from '../_lib/format'
import type { TraktListaRad, TraktRoll } from '../_lib/traktLista'
import { traktRollOrd } from '../_lib/traktLista'
import type { TavlaSpar } from '../_lib/tavla'
import { StatusOrd } from './Status'

function RollRad({ r, trakt }: { r: TraktRoll; trakt: string }) {
  const { ord, ton } = traktRollOrd(r)
  const namn = r.roll === 'skordare' ? 'Skördare' : 'Skotare'
  // Siffran: det som behövs av trakten; behövs bara en del står "av" hela kvarvarande. Skotaren visar också vad som faktiskt går att skota nu.
  const tal = r.status === 'egen' ? null : r.behovs > 0 && r.behovs < r.kvar ? `Behövs ${fmt(r.behovs)} av ${fmt(r.kvar)}` : `Kvar ${fmt(r.kvar)}`
  const skotbart = r.roll === 'skotare' && r.skotbart != null && r.status !== 'inget_skordat' && r.status !== 'ingen_maskin' && r.skotbart < r.kvar ? `fällt ${fmt(r.skotbart)}` : null
  return (
    <div data-trakt-roll={`${trakt}:${r.roll}`} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: AVSTAND.m }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: FARG.text2, minWidth: 0 }}>
        <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: AVSTAND.xs, background: rollFarg(r.roll), flexShrink: 0 }} />
        <span style={{ overflowWrap: 'anywhere' }}>{namn}{r.maskin && r.status !== 'egen' ? ` · ${r.maskin}` : ''}</span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: AVSTAND.xs, minWidth: 0, textAlign: 'right' }}>
        <StatusOrd ton={ton} ord={ord} bryt />
        {(tal || skotbart) && <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{[tal, skotbart].filter(Boolean).join(' · ')} m³</span>}
      </span>
    </div>
  )
}

function TraktKort({ t }: { t: TraktListaRad }) {
  return (
    <div className="hk-rad" data-trakt-lista-rad={t.objekt_id} style={{ ...RAD, flexDirection: 'column', alignItems: 'stretch', gap: AVSTAND.inuti }}>
      <span style={{ ...TYP.listtitel, color: FARG.text, overflowWrap: 'anywhere' }}>{t.namn}</span>
      {t.skordare && <RollRad r={t.skordare} trakt={t.objekt_id} />}
      {t.skotare && <RollRad r={t.skotare} trakt={t.objekt_id} />}
    </div>
  )
}

export default function Trakter({ spar, rader }: { spar: TavlaSpar; rader: TraktListaRad[] }) {
  if (rader.length === 0) return null
  return (
    <div data-trakter={spar.typ} style={{ marginTop: AVSTAND.l }}>
      <Sektion rubrik={`Trakterna · ${spar.namn.toLowerCase()}`}>
        <div className="hk-grupp">{rader.map(t => <TraktKort key={t.objekt_id} t={t} />)}</div>
      </Sektion>
    </div>
  )
}
