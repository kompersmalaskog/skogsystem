'use client'

// Skotarens lass i appen mot Opti-filerna, per trakt och maskin (admin). Förarna ser ingenting av detta. Skillnaden är en fråga, inte ett fel:
// Opti-filerna är fortfarande facit för skotningen tills appens rapportering är beprövad. Visas bara trakter där appen rapporterat.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hamtaAlla } from '@/lib/supabaseAlla'

const C = { card: '#141416', divider: 'rgba(255,255,255,0.06)', text: '#f2f2f4', muted: '#8e8e93', dim: '#5c5c61', gron: '#30d158', gul: '#ffd60a' }

interface Rad { vo_nummer: string; maskin_id: string; app_lass: number; app_m3: number; opti_lass: number; opti_m3: number }
interface Visad extends Rad { trakt: string; maskin: string }

const tal = (n: number) => Math.round(n).toLocaleString('sv-SE')

export default function SkotarLassKort() {
  const [rader, setRader] = useState<Visad[] | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [saknas, setSaknas] = useState(false)

  useEffect(() => {
    let avbruten = false
    ;(async () => {
      const r = await hamtaAlla<Rad>(() => supabase.from('skotar_lass_mot_opti').select('vo_nummer, maskin_id, app_lass, app_m3, opti_lass, opti_m3') as any, ['vo_nummer', 'maskin_id'])
      if (avbruten) return
      if (r.error) {
        // Tabellerna finns först efter releasen: inte ett fel, bara inte aktiverat än.
        if (r.error.code === 'PGRST205' || r.error.code === '42P01' || /does not exist|schema cache/i.test(String(r.error.message))) setSaknas(true)
        else setFel(String(r.error.message ?? r.error))
        return
      }
      const vo = Array.from(new Set(r.data.map((x) => x.vo_nummer)))
      const maskiner = Array.from(new Set(r.data.map((x) => x.maskin_id)))
      const [{ data: o }, { data: m }] = await Promise.all([
        vo.length ? supabase.from('dim_objekt').select('vo_nummer, object_name').in('vo_nummer', vo) : Promise.resolve({ data: [] as any[] }),
        maskiner.length ? supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell').in('maskin_id', maskiner) : Promise.resolve({ data: [] as any[] }),
      ])
      if (avbruten) return
      const trakt = new Map<string, string>(((o ?? []) as any[]).map((x) => [String(x.vo_nummer), String(x.object_name)]))
      const mask = new Map<string, string>(((m ?? []) as any[]).map((x) => [String(x.maskin_id), String(x.visningsnamn || x.modell || x.maskin_id)]))
      setRader(r.data
        .map((x) => ({ ...x, app_m3: Number(x.app_m3), opti_m3: Number(x.opti_m3), trakt: trakt.get(x.vo_nummer) ?? x.vo_nummer, maskin: mask.get(x.maskin_id) ?? x.maskin_id }))
        .sort((a, b) => Math.abs(b.app_m3 - b.opti_m3) - Math.abs(a.app_m3 - a.opti_m3)))
    })()
    return () => { avbruten = true }
  }, [])

  return (
    <div data-testid="skotarlass-kort" style={{ background: C.card, borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: 0.4, marginBottom: 12 }}>SKOTARLASS: APPEN MOT OPTI</div>
      {fel ? (
        <div style={{ color: C.gul, fontSize: 14 }}>Kunde inte läsa: {fel}</div>
      ) : saknas ? (
        <div style={{ color: C.muted, fontSize: 14 }}>Lassrapporteringen i appen är inte aktiverad än.</div>
      ) : !rader ? (
        <div style={{ height: 18, width: '55%', borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
      ) : rader.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 14 }}>Ingen trakt har lass rapporterade i appen än.</div>
      ) : (
        rader.map((x) => {
          const diff = x.app_m3 - x.opti_m3
          return (
            <div key={`${x.vo_nummer}-${x.maskin_id}`} style={{ padding: '9px 0', borderTop: `0.5px solid ${C.divider}`, fontSize: 14 }}>
              <div style={{ color: C.text }}>{x.trakt} · {x.maskin}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: C.muted, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                <span>Appen {x.app_lass} lass · {tal(x.app_m3)} m³ — Opti {x.opti_lass} lass · {tal(x.opti_m3)} m³</span>
                <span style={{ color: Math.abs(diff) < 1 ? C.gron : C.text }}>{diff > 0 ? '+' : ''}{tal(diff)} m³</span>
              </div>
            </div>
          )
        })
      )}
      <div style={{ paddingTop: 10, fontSize: 11, color: C.dim }}>
        Förarens egna m³ (hela m³) mot Optis lass. Opti är fortfarande facit. Förarna ser inget av detta.
      </div>
    </div>
  )
}
