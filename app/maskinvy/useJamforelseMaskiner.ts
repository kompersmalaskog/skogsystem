'use client'
// dim_maskin-raderna som Jämförelse väljer Wisent / Elephant King ur — läses en
// gång, själva valet per period görs av valjJamforelseMaskiner (lib/maskinvy/jamforelse).
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { DimMaskinRad } from '@/lib/maskinvy/jamforelse'

export function useJamforelseMaskinRader(): { rader: DimMaskinRad[] | null; fel: boolean } {
  const [rader, setRader] = useState<DimMaskinRad[] | null>(null)
  const [fel, setFel] = useState(false)

  useEffect(() => {
    let avbruten = false
    ;(async () => {
      const { data, error } = await supabase
        .from('dim_maskin')
        .select('maskin_id, visningsnamn, modell, maskin_typ, aktiv_fran, aktiv_till, bekraftad')
        .eq('bekraftad', true)
      if (avbruten) return
      if (error || !data) { setFel(true); setRader([]); return }
      setRader(data as DimMaskinRad[])
    })()
    return () => { avbruten = true }
  }, [])

  return { rader, fel }
}
