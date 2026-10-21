'use client'
import { TYP, RADIE, AVSTAND, FARG } from '@/lib/design/tokens'

import { useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { livestatus, importhalsa, dagarMellan, stockholmDag, type SenasteSignal } from '@/lib/maskinvy/livestatus'
import { COMBO_IDS, tint, type Maskin } from './OversiktShared'
import { useMinutklocka } from './useMinutklocka'

// ─────────────────────────────────────────────────────────────
// Livestatus + maskinhälsa — EN komponent för Idag och Översikt, skördare och skotare.
//
//   ● Aktiv nu · senaste signal för 4 min sedan        ← livestatus: när maskinen senast SA något
//   ● Filer in · senaste för 6 min sedan               ← maskinhälsa: när senaste FIL importerades
//
// Reglerna bor i lib/maskinvy/livestatus (och aktivNu): grön < 20 min, gul 20–60 min, grå > 60 min — färgen bär aldrig
// ensam, texten säger samma sak. Idag visar bara livestatus-raden i sitt eget kort (`LivestatusRad ram`); Översikten
// visar båda i ett kort (`LivestatusKort`).
// ─────────────────────────────────────────────────────────────

export type Roll = 'skordare' | 'skotare'

const klockslag = (iso: string): string => {
  try { return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }) }
  catch { return '—' }
}

function Prick({ farg, glod }: { farg: string; glod?: boolean }) {
  return (
    <div aria-hidden style={{
      width: 8, height: 8, borderRadius: RADIE.stapel, flexShrink: 0, background: farg,
      boxShadow: glod ? `0 0 0 3px ${tint(FARG.gron, 18)}` : 'none',
    }} />
  )
}

const radStil: CSSProperties = { display: 'flex', alignItems: 'center', gap: AVSTAND.m }
const kortStil: CSSProperties = { background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.l}px ${AVSTAND.l}px`, marginBottom: 12 }

/** Livestatus-raden. `ram` = i ett eget kort (Idag); utan = bar rad att lägga i ett annat kort (Översikt). */
export function LivestatusRad({ fresh, loading, ram, fel }: {
  fresh: SenasteSignal | null; loading: boolean; ram?: boolean; fel?: boolean
}) {
  const nu = useMinutklocka()          // hooks före tidiga returer
  const inRam = (barn: React.ReactNode, extra?: CSSProperties) => (ram ? <div data-livestatus style={{ ...kortStil, ...radStil, ...extra }}>{barn}</div> : <div data-livestatus style={radStil}>{barn}</div>)
  const text = (s: string, farg: string = FARG.text2) => <span style={{ fontSize: TYP.meta.fontSize, color: farg, fontVariantNumeric: 'tabular-nums' }}>{s}</span>

  if (loading) return inRam(<><Prick farg={FARG.text3} />{text('Kontrollerar dataålder…')}</>)
  if (fel) return inRam(<><Prick farg={FARG.text3} />{text('Kunde inte läsa maskinens status.')}</>)
  if (!fresh) return inRam(<><Prick farg={FARG.text3} />{text('Ingen data i databasen')}</>)

  const s = livestatus(fresh, nu, klockslag)
  const aktiv = s.niva === 'aktiv'
  const farg = aktiv ? FARG.gron : s.niva === 'sen' ? FARG.gul : FARG.text3
  const textFarg = s.idag && s.niva !== 'inget' && s.niva !== 'saknas' ? FARG.text : FARG.text2
  return inRam(<><Prick farg={farg} glod={aktiv} />{text(s.text, textFarg)}</>, s.idag ? undefined : { border: `0.5px solid ${tint(FARG.orange, 25)}` })
}

/** Maskinhälsa-raden: senaste importerade fil. */
export function ImportRad({ iso, status, loading, fel }: { iso: string | null; status: string | null; loading: boolean; fel?: boolean }) {
  const nu = useMinutklocka()
  const text = (s: string, farg: string = FARG.text2) => <span style={{ fontSize: TYP.meta.fontSize, color: farg, fontVariantNumeric: 'tabular-nums' }}>{s}</span>
  if (loading) return <div data-importhalsa style={radStil}><Prick farg={FARG.text3} />{text('Kontrollerar filimport…')}</div>
  if (fel) return <div data-importhalsa style={radStil}><Prick farg={FARG.text3} />{text('Kunde inte läsa filimporten.')}</div>
  const h = importhalsa(iso, status, nu, klockslag)
  const farg = h.niva === 'aktiv' ? FARG.gron : h.niva === 'sen' ? FARG.gul : h.niva === 'fel' ? FARG.rod : FARG.text3
  const textFarg = h.niva === 'aktiv' || h.niva === 'sen' || h.niva === 'fel' ? FARG.text : FARG.text2
  return <div data-importhalsa style={radStil}><Prick farg={farg} glod={h.niva === 'aktiv'} />{text(h.text, textFarg)}</div>
}

// ── Hämtning ──────────────────────────────────────────────────

type Hamtat<T> = { data: T | null; loading: boolean; fel: boolean }

/** Senaste produktionssignalen: skördarens `skapad_tid` (importtid), skotarens `lossnings_tid`. */
export function useSenasteSignal(maskinId: string, roll: Roll): Hamtat<SenasteSignal> {
  const [s, setS] = useState<Hamtat<SenasteSignal>>({ data: null, loading: true, fel: false })
  useEffect(() => {
    let avbruten = false
    setS({ data: null, loading: true, fel: false })
    const ids = COMBO_IDS[maskinId] || [maskinId]
    const rpc = roll === 'skordare' ? 'maskindata_produktion_senaste' : 'maskindata_lass_senaste'
    Promise.resolve(supabase.rpc(rpc, { p_maskin_ids: ids })).then(({ data, error }) => {
      if (avbruten) return
      if (error) { setS({ data: null, loading: false, fel: true }); return }
      const rad = (data as any[] | null)?.[0]
      if (!rad?.datum) { setS({ data: null, loading: false, fel: false }); return }
      const signalIso = (roll === 'skordare' ? rad.skapad_tid : rad.lossnings_tid) ?? null
      setS({ data: { senasteDatum: rad.datum, signalIso, daysDiff: dagarMellan(rad.datum, stockholmDag(Date.now())) }, loading: false, fel: false })
    }).catch(() => { if (!avbruten) setS({ data: null, loading: false, fel: true }) })
    return () => { avbruten = true }
  }, [maskinId, roll])
  return s
}

/** Senaste importerade fil för maskinen (valfri filtyp). */
export function useImporthalsa(maskinId: string): Hamtat<{ iso: string | null; status: string | null }> {
  const [s, setS] = useState<Hamtat<{ iso: string | null; status: string | null }>>({ data: null, loading: true, fel: false })
  useEffect(() => {
    let avbruten = false
    setS({ data: null, loading: true, fel: false })
    const ids = COMBO_IDS[maskinId] || [maskinId]
    Promise.resolve(
      supabase.from('meta_importerade_filer').select('importerad_tid, status').in('maskin_id', ids)
        .order('importerad_tid', { ascending: false }).limit(1),
    ).then(({ data, error }) => {
      if (avbruten) return
      if (error) { setS({ data: null, loading: false, fel: true }); return }
      const rad = (data as any[] | null)?.[0]
      setS({ data: { iso: rad?.importerad_tid ?? null, status: rad?.status ?? null }, loading: false, fel: false })
    }).catch(() => { if (!avbruten) setS({ data: null, loading: false, fel: true }) })
    return () => { avbruten = true }
  }, [maskinId])
  return s
}

/** Överst i Översikten: livestatus och maskinhälsa i ETT kort, två rader. */
export function LivestatusKort({ maskin, roll }: { maskin: Maskin | { id: string }; roll: Roll }) {
  const sig = useSenasteSignal(maskin.id, roll)
  const imp = useImporthalsa(maskin.id)
  return (
    <div data-livestatus-kort style={{ ...kortStil, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <LivestatusRad fresh={sig.data} loading={sig.loading} fel={sig.fel} />
      <div style={{ height: 1, background: FARG.linje }} />
      <ImportRad iso={imp.data?.iso ?? null} status={imp.data?.status ?? null} loading={imp.loading} fel={imp.fel} />
    </div>
  )
}
