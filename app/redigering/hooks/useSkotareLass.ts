'use client'
// Per-maskin skotar-fördelning för ETT objekt (steg 1, redigeringsvyn).
// VO-MEDVETEN: delar objektet VO med syster-objekt (t.ex. Jätsbygd där Wisent
// ligger på 11217392 och Elephant King på A130743_7), samlas BÅDA skotarna in
// automatiskt med sin tid/lass ur filerna — grupperat per maskin_id över hela
// VO-gruppen. Martin fördelar bara VOLYMEN (egen skotning vs omlastning).
// Läser fakt_lass (volym per maskin), fakt_tid (G15 per maskin) och den
// människo-ägda skotare_objekt_manuell — SEPARAT, mergas i JS (fakt_lass/fakt_tid
// joinas ALDRIG direkt). Manuell volym/G15 ERSÄTTER det mätta (aldrig adderar).
// Varje maskins manuella rad nycklas på maskinens HEM-objekt (där dess lass
// ligger) så raden följer sin mätta källa och detalj/lista blir konsistenta.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { g15Sek } from '@/lib/g15'

export type SkotareInsats = {
  maskinId: string
  namn: string
  // Objektet där maskinens lass faktiskt ligger (hem). Manuell rad nycklas hit.
  // Filfri/utan lass → det öppnade objektet.
  hemObjektId: string
  // Mätt (importens sanning)
  mattVolym: number        // SUM fakt_lass.volym_m3sub (över VO-gruppen, denna maskin)
  mattAntalLass: number
  mattG15: number          // timmar ur fakt_tid (g15Sek/3600)
  // Manuellt (skotare_objekt_manuell, hela-objektet-raden: datum_fran IS NULL)
  radId: number | null
  manuellVolym: number | null       // legacy volym_m3 (läs-fallback)
  manuellEgen: number | null        // volym_egen_skotning (räknas mot total)
  manuellOmlastning: number | null  // volym_omlastning (räknas ALDRIG mot total)
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
      // ── VO-gruppen: alla objekt_id som delar objektets vo_nummer ──
      // Numeriskt VO → objekt_id = VO; annars maskin_id_obj_key. Skotare på delat
      // VO hamnar på olika objekt_id men SAMMA vo_nummer, så vi grupperar på VO.
      const egetR = await supabase.from('dim_objekt').select('vo_nummer').eq('objekt_id', objektId).limit(1)
      if (avbruten) return
      if (egetR.error) { setFel(egetR.error.message); setLaddar(false); return }
      const voNummer: string | null = egetR.data?.[0]?.vo_nummer || null
      let syskonIds: string[] = [objektId]
      if (voNummer) {
        const syskonR = await supabase.from('dim_objekt').select('objekt_id').eq('vo_nummer', voNummer)
        if (avbruten) return
        if (syskonR.error) { setFel(syskonR.error.message); setLaddar(false); return }
        const s = (syskonR.data || []).map((r: any) => r.objekt_id).filter(Boolean)
        if (s.length > 0) syskonIds = Array.from(new Set([objektId, ...s]))
      }

      const [lassR, tidR, manR, maskinR] = await Promise.all([
        supabase.from('fakt_lass').select('objekt_id, maskin_id, volym_m3sub').in('objekt_id', syskonIds),
        supabase.from('fakt_tid').select('objekt_id, maskin_id, processing_sek, terrain_sek, other_work_sek').in('objekt_id', syskonIds),
        // maskin_id=null-rader är objekt-nivå-avslut (skotad_volym_manuell, datum_fran
        // null) — de är INTE per-maskin-insatser, exkludera dem.
        supabase.from('skotare_objekt_manuell')
          .select('id, objekt_id, maskin_id, volym_m3, volym_egen_skotning, volym_omlastning, g15_timmar, ar_omlastning, avser_objekt_id, notering')
          .in('objekt_id', syskonIds).is('datum_fran', null).not('maskin_id', 'is', null),
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

      // Lass per (maskin, objekt) → så vi kan välja HEM-objekt (där maskinen har mest lass).
      const lassPerMaskinObj = new Map<string, Map<string, { v: number; n: number }>>()
      for (const r of lassR.data || []) {
        if (!r.maskin_id) continue
        let perObj = lassPerMaskinObj.get(r.maskin_id)
        if (!perObj) { perObj = new Map(); lassPerMaskinObj.set(r.maskin_id, perObj) }
        const cur = perObj.get(r.objekt_id) || { v: 0, n: 0 }
        cur.v += Number(r.volym_m3sub) || 0; cur.n += 1
        perObj.set(r.objekt_id, cur)
      }
      // Summera per maskin + välj hem-objekt (max volym).
      const lassMap = new Map<string, { v: number; n: number; hem: string }>()
      for (const [mid, perObj] of lassPerMaskinObj) {
        let v = 0, n = 0, hem = objektId, hemV = -1
        for (const [oid, agg] of perObj) {
          v += agg.v; n += agg.n
          if (agg.v > hemV) { hemV = agg.v; hem = oid }
        }
        lassMap.set(mid, { v, n, hem })
      }
      // G15-sek per maskin (fakt_tid), separat hämtning — ingen direkt-join
      const tidMap = new Map<string, number>()
      for (const r of tidR.data || []) {
        if (!r.maskin_id) continue
        tidMap.set(r.maskin_id, (tidMap.get(r.maskin_id) || 0) + g15Sek(r.processing_sek, r.terrain_sek, r.other_work_sek))
      }
      // Manuell rad per maskin — föredra raden på maskinens hem-objekt, annars valfri.
      const manMap = new Map<string, any>()
      for (const r of manR.data || []) {
        const mid = r.maskin_id
        const prev = manMap.get(mid)
        const hem = lassMap.get(mid)?.hem
        if (!prev) { manMap.set(mid, r); continue }
        if (hem && r.objekt_id === hem && prev.objekt_id !== hem) manMap.set(mid, r)
      }

      // Maskiner att visa: de med lass ELLER en manuell rad (skotardata).
      const ids = new Set<string>([...lassMap.keys(), ...manMap.keys()])
      const lista: SkotareInsats[] = [...ids].map((id) => {
        const l = lassMap.get(id); const man = manMap.get(id)
        // Hem = där maskinen har lass; annars radens objekt_id; annars öppnade objektet.
        const hem = l?.hem || man?.objekt_id || objektId
        return {
          maskinId: id,
          namn: namnAv(id),
          hemObjektId: hem,
          mattVolym: l?.v ?? 0,
          mattAntalLass: l?.n ?? 0,
          mattG15: (tidMap.get(id) || 0) / 3600,
          radId: man?.id ?? null,
          manuellVolym: man?.volym_m3 ?? null,
          manuellEgen: man?.volym_egen_skotning ?? null,
          manuellOmlastning: man?.volym_omlastning ?? null,
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
