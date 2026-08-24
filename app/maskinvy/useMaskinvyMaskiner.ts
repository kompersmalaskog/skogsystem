'use client'
// Dynamisk maskinlista för maskinvyn — EN källa, så en ny bekräftad maskin med
// data dyker upp automatiskt i alla vyer utan kodändring. Ersätter de hårdkodade
// SKOTARE/MASKINER-arrayerna (där nya maskiner aldrig syntes).
//
// Urval: dim_maskin.bekraftad = true OCH maskinen har fakt_tid-data (drift). Det
// utesluter filfria maskiner utan data (JD810E) men behåller avställda maskiner
// med historik (gamla Elefant, Rottne -23) så jämförelser bakåt finns kvar.
//
// Combo ("(båda)"): när ≥2 maskiner delar samma bas-visningsnamn (årsmodellen
// bortskalad, t.ex. "Rottne H8E -23/-26" → "Rottne H8E") genereras en combo-post
// + id-mappning. dim_maskin.modell är för smutsig för gruppering (R64101 har
// modell='Rottne'), därför grupperas på visningsnamn.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type MaskinvyMaskin = { id: string; namn: string }
export type MaskinvyMaskinerResultat = {
  maskiner: MaskinvyMaskin[]
  comboIds: Record<string, string[]>
  laddar: boolean
}

function arTyp(maskinTyp: string | null | undefined, vill: 'skordare' | 'skotare'): boolean {
  const t = (maskinTyp || '').toLowerCase()
  const skotare = t === 'forwarder' || t.includes('skot')
  const skordare = t === 'harvester' || t.includes('skörd')
  return vill === 'skotare' ? skotare : skordare
}

// Bas-namn för combo-gruppering: skala bort avslutande årsmodell ("-23", " 2026").
function basNamn(namn: string): string {
  return namn.replace(/\s*-?\s*(?:19|20)?\d{2}\s*$/, '').trim() || namn
}

export function useMaskinvyMaskiner(typ: 'skordare' | 'skotare'): MaskinvyMaskinerResultat {
  const [maskiner, setMaskiner] = useState<MaskinvyMaskin[]>([])
  const [comboIds, setComboIds] = useState<Record<string, string[]>>({})
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
      // Har maskinen fakt_tid-data? (drift-signal — filfria utan data faller bort)
      const medData = await Promise.all(avTyp.map(async (m: any) => {
        const { data } = await supabase.from('fakt_tid').select('maskin_id').eq('maskin_id', m.maskin_id).limit(1)
        return data && data.length > 0 ? m : null
      }))
      if (avbruten) return
      const kvar = (medData.filter(Boolean) as any[])
        // Aktiva först (aktiv_till NULL), sen aktiv_fran stigande (äldst först = stabil default).
        .sort((a, b) => {
          const aAktiv = a.aktiv_till == null, bAktiv = b.aktiv_till == null
          if (aAktiv !== bAktiv) return aAktiv ? -1 : 1
          return String(a.aktiv_fran || '').localeCompare(String(b.aktiv_fran || ''))
        })
      const lista: MaskinvyMaskin[] = kvar.map((m: any) => ({
        id: m.maskin_id,
        namn: (m.visningsnamn && String(m.visningsnamn).trim()) || m.modell || m.maskin_id,
      }))
      // Combo: ≥2 med samma bas-namn → "(båda)"-post sist + id-mappning.
      const combos: Record<string, string[]> = {}
      const grupper = new Map<string, MaskinvyMaskin[]>()
      for (const m of lista) {
        const b = basNamn(m.namn)
        const arr = grupper.get(b) || []; arr.push(m); grupper.set(b, arr)
      }
      const medCombo = [...lista]
      grupper.forEach((grp, bas) => {
        if (grp.length >= 2) {
          const id = grp.map(g => g.id).join('+')
          combos[id] = grp.map(g => g.id)
          medCombo.push({ id, namn: `${bas} (båda)` })
        }
      })
      if (avbruten) return
      setMaskiner(medCombo); setComboIds(combos); setLaddar(false)
    })()
    return () => { avbruten = true }
  }, [typ])

  return { maskiner, comboIds, laddar }
}
