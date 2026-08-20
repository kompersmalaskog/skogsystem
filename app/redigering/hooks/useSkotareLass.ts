'use client'
// Per-maskin skotar-fördelning för ETT objekt (steg 1, redigeringsvyn).
// Läser fakt_lass (volym per maskin), fakt_tid (G15 per maskin) och den
// människo-ägda skotare_objekt_manuell (manuell korrigering + omlastnings-
// märkning) — SEPARAT, mergas i JS (fakt_lass/fakt_tid joinas ALDRIG direkt).
// Manuell volym/G15 ERSÄTTER det mätta (aldrig adderar). ar_omlastning=false
// är default, så befintliga 57 rader fungerar oförändrat.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { g15Sek } from '@/lib/g15'

export type SkotareInsats = {
  maskinId: string
  namn: string
  // Mätt (importens sanning)
  mattVolym: number        // SUM fakt_lass.volym_m3sub
  mattAntalLass: number
  mattG15: number          // timmar ur fakt_tid (g15Sek/3600)
  // Manuellt (skotare_objekt_manuell, hela-objektet-raden: datum_fran IS NULL)
  radId: number | null
  // Två-volyms-modellen: egen skotning räknas mot skotad total, omlastning aldrig.
  manuellEgen: number | null      // volym_egen_skotning (räknas)
  manuellOmlastning: number | null // volym_omlastning (räknas ej)
  manuellVolym: number | null      // volym_m3 (LEGACY, read-fallback)
  manuellG15: number | null
  arOmlastning: boolean
  avserObjektId: string | null
  notering: string | null
}

export type SkotareLassResultat = {
  insatser: SkotareInsats[]
  forwarders: { maskin_id: string; namn: string }[]  // för "lägg till skotare"-väljaren
  laddar: boolean
  fel: string | null
  ladda: () => void
}

export function useSkotareLass(objektId: string | null): SkotareLassResultat {
  const [insatser, setInsatser] = useState<SkotareInsats[]>([])
  const [forwarders, setForwarders] = useState<{ maskin_id: string; namn: string }[]>([])
  const [laddar, setLaddar] = useState(true)
  const [fel, setFel] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!objektId) { setInsatser([]); setLaddar(false); return }
    let avbruten = false
    setLaddar(true); setFel(null)
    ;(async () => {
      const [lassR, tidR, manR, maskinR] = await Promise.all([
        supabase.from('fakt_lass').select('maskin_id, volym_m3sub').eq('objekt_id', objektId),
        supabase.from('fakt_tid').select('maskin_id, processing_sek, terrain_sek, other_work_sek').eq('objekt_id', objektId),
        // maskin_id=null-rader tillhör grot-hämtat-automatiken (objekt-nivå,
        // datum_fran null) — de är INTE per-maskin-insatser, exkludera dem.
        supabase.from('skotare_objekt_manuell')
          .select('id, maskin_id, volym_egen_skotning, volym_omlastning, volym_m3, g15_timmar, ar_omlastning, avser_objekt_id, notering')
          .eq('objekt_id', objektId).is('datum_fran', null).not('maskin_id', 'is', null),
        supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell, maskin_typ'),
      ])
      if (avbruten) return
      const felM = lassR.error?.message || tidR.error?.message || manR.error?.message || maskinR.error?.message
      if (felM) { setFel(felM); setLaddar(false); return }

      const namnMap = new Map<string, any>()
      for (const m of maskinR.data || []) namnMap.set(m.maskin_id, m)
      const namnAv = (id: string) => {
        const m = namnMap.get(id); return (m?.visningsnamn || '').trim() || m?.modell || id
      }

      // Lass per maskin (volym + antal)
      const lassMap = new Map<string, { v: number; n: number }>()
      for (const r of lassR.data || []) {
        const cur = lassMap.get(r.maskin_id) || { v: 0, n: 0 }
        cur.v += Number(r.volym_m3sub) || 0; cur.n += 1
        lassMap.set(r.maskin_id, cur)
      }
      // G15-sek per maskin (fakt_tid), separat hämtning — ingen direkt-join
      const tidMap = new Map<string, number>()
      for (const r of tidR.data || []) {
        tidMap.set(r.maskin_id, (tidMap.get(r.maskin_id) || 0) + g15Sek(r.processing_sek, r.terrain_sek, r.other_work_sek))
      }
      const manMap = new Map<string, any>()
      for (const r of manR.data || []) manMap.set(r.maskin_id, r)

      // Maskiner att visa: de med lass ELLER en manuell rad (skotardata).
      // Skördarens fakt_tid på objektet ignoreras (den har varken lass eller manuell rad).
      const ids = new Set<string>()
      lassMap.forEach((_v, k) => ids.add(k))
      manMap.forEach((_v, k) => ids.add(k))
      const lista: SkotareInsats[] = Array.from(ids).map((id) => {
        const l = lassMap.get(id); const man = manMap.get(id)
        return {
          maskinId: id,
          namn: namnAv(id),
          mattVolym: l?.v ?? 0,
          mattAntalLass: l?.n ?? 0,
          mattG15: (tidMap.get(id) || 0) / 3600,
          radId: man?.id ?? null,
          manuellEgen: man?.volym_egen_skotning ?? null,
          manuellOmlastning: man?.volym_omlastning ?? null,
          manuellVolym: man?.volym_m3 ?? null,
          manuellG15: man?.g15_timmar ?? null,
          arOmlastning: !!man?.ar_omlastning,
          avserObjektId: man?.avser_objekt_id ?? null,
          notering: man?.notering ?? null,
        }
      }).sort((a, b) => b.mattVolym - a.mattVolym)

      // Forwarders som inte redan är i listan → "lägg till skotare"-väljaren
      const fwd = (maskinR.data || [])
        .filter((m: any) => m.maskin_typ === 'Forwarder' && !ids.has(m.maskin_id))
        .map((m: any) => ({ maskin_id: m.maskin_id, namn: namnAv(m.maskin_id) }))

      setInsatser(lista); setForwarders(fwd); setLaddar(false)
    })()
    return () => { avbruten = true }
  }, [objektId, version])

  return { insatser, forwarders, laddar, fel, ladda: () => setVersion((v) => v + 1) }
}
