'use client'
// Hämtningen bakom sidolistan (components i Sidolista.tsx). Per maskin: senaste produktionssignalen (samma RPC:er som Idag och
// Översikt: skördarens `skapad_tid`, skotarens `lossnings_tid`) och — bara om signalen är från idag — dagens rader.
// Produktion och tid hämtas SEPARAT och slås ihop i JavaScript (fakt_produktion och fakt_tid får aldrig joinas).
//
// Ett tillägg som aldrig får fälla vyn: en maskin som inte går att läsa får 'fel' på sin rad, resten visas. En dag med 1 000
// rader (sidgränsen i RPC:erna) är ett fel, aldrig en halv summa.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { stockholmDag } from '@/lib/maskinvy/livestatus'
import { summeraIdag, type SidoData, type SidoRoll } from '@/lib/maskinvy/sidolista'
import { COMBO_IDS } from './OversiktShared'

export type SidoMaskin = { id: string; namn: string; roll: SidoRoll }
export type SidoSvar = SidoData | 'fel' | 'laser' | null

/** Hur ofta listan läser om. Pricken räknas om varje minut av klockan i komponenten; det här hämtar nya signaler. */
export const SIDOLISTA_UPPDATERA_MS = 120000
const SIDGRANS = 1000

async function hamtaEn(roll: SidoRoll, maskinId: string): Promise<SidoData | null> {
  const ids = COMBO_IDS[maskinId] || [maskinId]
  const rpcSenaste = roll === 'skordare' ? 'maskindata_produktion_senaste' : 'maskindata_lass_senaste'
  const { data: sen, error } = await supabase.rpc(rpcSenaste, { p_maskin_ids: ids })
  if (error) throw error
  const rad = (sen as any[] | null)?.[0]
  if (!rad?.datum) return null
  const signalIso: string | null = (roll === 'skordare' ? rad.skapad_tid : rad.lossnings_tid) ?? null
  const ut: SidoData = { signalDatum: rad.datum as string, signalIso, idag: null }
  if (rad.datum !== stockholmDag(Date.now())) return ut

  const dag = { p_maskin_ids: ids, p_datum_start: rad.datum as string, p_datum_slut: rad.datum as string }
  if (roll === 'skordare') {
    const [prod, tid] = await Promise.all([supabase.rpc('maskindata_produktion', dag), supabase.rpc('maskindata_tid', dag)])
    if (prod.error) throw prod.error
    const prodRader = (prod.data as any[] | null) || []
    if (prodRader.length >= SIDGRANS) throw new Error('sidolista: dagens produktion nådde sidgränsen')
    // Tiden är ett tillägg till m³/G15h: går den inte att läsa visas volymen utan kvoten.
    const tidRader = tid.error || ((tid.data as any[] | null) || []).length >= SIDGRANS ? null : ((tid.data as any[] | null) || [])
    ut.idag = summeraIdag('skordare', prodRader, tidRader)
  } else {
    const lass = await supabase.rpc('maskindata_lass', dag)
    if (lass.error) throw lass.error
    const lassRader = (lass.data as any[] | null) || []
    if (lassRader.length >= SIDGRANS) throw new Error('sidolista: dagens lass nådde sidgränsen')
    ut.idag = summeraIdag('skotare', lassRader, null)
  }
  return ut
}

/** Svar per maskin-id. `aktiv` = false (smal skärm) hämtar ingenting. */
export function useSidolistaData(maskiner: SidoMaskin[], aktiv: boolean): Record<string, SidoSvar> {
  const [svar, setSvar] = useState<Record<string, SidoSvar>>({})
  // Nyckeln gör att en ny lista med samma maskiner inte hämtar om.
  const nyckel = useMemo(() => maskiner.map(m => `${m.roll}:${m.id}`).join('|'), [maskiner])

  useEffect(() => {
    if (!aktiv || !nyckel) return
    let avbruten = false
    const lista = nyckel.split('|').map(s => { const i = s.indexOf(':'); return { roll: s.slice(0, i) as SidoRoll, id: s.slice(i + 1) } })

    const lasAlla = () => {
      for (const m of lista) {
        hamtaEn(m.roll, m.id)
          .then(d => { if (!avbruten) setSvar(s => ({ ...s, [m.id]: d })) })
          .catch(e => { console.warn('[sidolista]', m.id, e); if (!avbruten) setSvar(s => ({ ...s, [m.id]: 'fel' })) })
      }
    }
    setSvar(s => {
      const ny = { ...s }
      for (const m of lista) if (!(m.id in ny)) ny[m.id] = 'laser'
      return ny
    })
    lasAlla()
    const id = window.setInterval(lasAlla, SIDOLISTA_UPPDATERA_MS)
    return () => { avbruten = true; window.clearInterval(id) }
  }, [aktiv, nyckel])

  return svar
}
