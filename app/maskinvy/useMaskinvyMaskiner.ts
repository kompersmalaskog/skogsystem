'use client'
// Dynamisk maskinlista för maskinvyn — EN källa, så en ny bekräftad maskin med
// data dyker upp automatiskt i alla vyer utan kodändring. Ersätter de hårdkodade
// SKOTARE/MASKINER-arrayerna (där nya maskiner aldrig syntes).
//
// Urval: dim_maskin.bekraftad = true OCH maskinen har data — antingen fakt_tid
// (drift ur filer) ELLER en manuell skotare_objekt_manuell-rad (filfria maskiner
// som JD810E, som Martin matar in för hand). Filfri maskin utan någon data döljs;
// den dyker upp automatiskt så snart dess skotning matats in.
//
// INGEN combo/gruppering: varje maskin är en egen rad med sin egen historik. Två
// maskiner av samma modell (t.ex. Rottne R64101 såld + R64428 i drift, eller
// gamla Elefant A110148 + Elephant King A130743) hålls SEPARATA — precis som de
// är. Filtret "bekräftad + har data" visar båda om båda har produktion.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type MaskinvyMaskin = { id: string; namn: string }
export type MaskinvyMaskinerResultat = {
  maskiner: MaskinvyMaskin[]
  laddar: boolean
}

function arTyp(maskinTyp: string | null | undefined, vill: 'skordare' | 'skotare'): boolean {
  const t = (maskinTyp || '').toLowerCase()
  const skotare = t === 'forwarder' || t.includes('skot')
  const skordare = t === 'harvester' || t.includes('skörd')
  return vill === 'skotare' ? skotare : skordare
}

export function useMaskinvyMaskiner(typ: 'skordare' | 'skotare'): MaskinvyMaskinerResultat {
  const [maskiner, setMaskiner] = useState<MaskinvyMaskin[]>([])
  const [laddar, setLaddar] = useState(true)

  useEffect(() => {
    let avbruten = false
    ;(async () => {
      setLaddar(true)
      const { data: alla } = await supabase
        .from('dim_maskin')
        .select('maskin_id, visningsnamn, modell, maskin_typ, aktiv_fran, aktiv_till')
        .eq('bekraftad', true)
      if (avbruten) return
      const avTyp = (alla || []).filter((m: any) => arTyp(m.maskin_typ, typ))
      // Har maskinen data? fakt_tid (drift ur filer) ELLER manuell skotning
      // (skotare_objekt_manuell) — så filfria maskiner (JD810E) dyker upp så snart
      // deras skotning matats in, men döljs innan dess.
      const medData = await Promise.all(avTyp.map(async (m: any) => {
        const [tidR, manR] = await Promise.all([
          supabase.from('fakt_tid').select('maskin_id').eq('maskin_id', m.maskin_id).limit(1),
          supabase.from('skotare_objekt_manuell').select('id').eq('maskin_id', m.maskin_id).limit(1),
        ])
        const harFakttid = !!(tidR.data && tidR.data.length > 0)
        const harManuell = !!(manR.data && manR.data.length > 0)
        return (harFakttid || harManuell) ? { ...m, _harFakttid: harFakttid } : null
      }))
      if (avbruten) return
      const kvar = (medData.filter(Boolean) as any[])
        .sort((a, b) => {
          // Fil-drift-maskiner (fakt_tid) före filfria-only — så JD810E hamnar sist
          // och aldrig blir default; en riktig arbetsmaskin är förvald.
          if (a._harFakttid !== b._harFakttid) return a._harFakttid ? -1 : 1
          // Aktiva (aktiv_till NULL) före avställda.
          const aAktiv = a.aktiv_till == null, bAktiv = b.aktiv_till == null
          if (aAktiv !== bAktiv) return aAktiv ? -1 : 1
          // Äldst aktiv först (stabil default = nuvarande primärmaskin, oförändrat).
          return String(a.aktiv_fran || '').localeCompare(String(b.aktiv_fran || ''))
        })
      const lista: MaskinvyMaskin[] = kvar.map((m: any) => ({
        id: m.maskin_id,
        namn: (m.visningsnamn && String(m.visningsnamn).trim()) || m.modell || m.maskin_id,
      }))
      if (avbruten) return
      setMaskiner(lista); setLaddar(false)
    })()
    return () => { avbruten = true }
  }, [typ])

  return { maskiner, laddar }
}
