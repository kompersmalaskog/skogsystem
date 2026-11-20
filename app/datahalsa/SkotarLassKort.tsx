'use client'

// Skotarens lass i appen mot Opti-filerna, per trakt och maskin (admin). Förarna ser ingenting av detta. Skillnaden är en fråga, inte ett fel:
// Opti-filerna är fortfarande facit för skotningen tills appens rapportering är beprövad. Visas bara trakter där appen rapporterat.
// "Appen" räknar bara det som räknas som skotat: de gamla självbekräftade lassen (bekraftad_av 'auto') står på egen rad och granskas nedanför
// (ObekraftadeLass). Är mer skotat än skördat på en trakt står en rad om det — bara info, ingen spärr.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hamtaAlla } from '@/lib/supabaseAlla'
import { lasSkotatMerAnSkordat } from '@/lib/skotarLass/granskaKopplad'
import type { SkotatMerAnSkordat } from '@/lib/skotarLass/kvar'
import ObekraftadeLass from './ObekraftadeLass'

const C = { card: '#141416', divider: 'rgba(255,255,255,0.06)', text: '#f2f2f4', muted: '#8e8e93', dim: '#5c5c61', gron: '#30d158', gul: '#ffd60a' }

interface Rad { vo_nummer: string; maskin_id: string; app_lass: number; app_m3: number; opti_lass: number; opti_m3: number; gammal_lass?: number; gammal_m3?: number; objekt_id?: string | null }
interface Visad extends Rad { trakt: string; maskin: string }

// Kolumnerna som kom med granskningsmigrationen. Före den finns de inte: då läses vyn som förut (och inget "obekräftat" visas ur vyn).
const KOLUMNER_NYA = 'vo_nummer, maskin_id, app_lass, app_m3, opti_lass, opti_m3, gammal_lass, gammal_m3, objekt_id'
const KOLUMNER_GAMLA = 'vo_nummer, maskin_id, app_lass, app_m3, opti_lass, opti_m3'
const saknadKolumn = (e: any) => e?.code === '42703' || /column .* does not exist/i.test(String(e?.message))

const tal = (n: number) => Math.round(n).toLocaleString('sv-SE')

export default function SkotarLassKort() {
  const [rader, setRader] = useState<Visad[] | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [saknas, setSaknas] = useState(false)
  const [omlasning, setOmlasning] = useState(0)
  const [namn, setNamn] = useState<{ trakt: Map<string, string>; mask: Map<string, string> }>({ trakt: new Map(), mask: new Map() })
  /** Per objekt: skotat mer än skördat (null = nej), eller inte läst än / gick inte att läsa (saknas i kartan). */
  const [over, setOver] = useState<Map<string, SkotatMerAnSkordat | null>>(new Map())

  useEffect(() => {
    let avbruten = false
    ;(async () => {
      let r = await hamtaAlla<Rad>(() => supabase.from('skotar_lass_mot_opti').select(KOLUMNER_NYA) as any, ['vo_nummer', 'maskin_id'])
      if (r.error && saknadKolumn(r.error)) r = await hamtaAlla<Rad>(() => supabase.from('skotar_lass_mot_opti').select(KOLUMNER_GAMLA) as any, ['vo_nummer', 'maskin_id'])
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
      setNamn({ trakt, mask })
      const visade = r.data
        .map((x) => ({ ...x, app_m3: Number(x.app_m3), opti_m3: Number(x.opti_m3), gammal_lass: Number(x.gammal_lass ?? 0), gammal_m3: Number(x.gammal_m3 ?? 0), trakt: trakt.get(x.vo_nummer) ?? x.vo_nummer, maskin: mask.get(x.maskin_id) ?? x.maskin_id }))
        .sort((a, b) => Math.abs(b.app_m3 - b.opti_m3) - Math.abs(a.app_m3 - a.opti_m3))
      setRader(visade)
      // Skotat mer än skördat: en trakt i taget (samma underlag som "kvar" i skotarläget). Det som inte går att läsa ger ingen rad, aldrig en gissning.
      const traktOrd = new Map<string, string | null>()
      for (const x of visade) if (x.objekt_id) traktOrd.set(x.objekt_id, x.vo_nummer)
      const nya = new Map<string, SkotatMerAnSkordat | null>()
      for (const [objektId, vo] of traktOrd) {
        const k = await lasSkotatMerAnSkordat(objektId, vo)
        if (avbruten) return
        if (k) { nya.set(objektId, k.varning); setOver(new Map(nya)) }
      }
    })()
    return () => { avbruten = true }
  }, [omlasning])

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
              {(x.gammal_lass ?? 0) > 0 && (
                <div data-testid="skotarlass-gammal" style={{ color: C.gul, fontSize: 13 }}>
                  + {x.gammal_lass} obekräftade lass ({tal(x.gammal_m3 ?? 0)} m³, gammal funktion) räknas inte
                </div>
              )}
              {x.objekt_id && over.get(x.objekt_id) && (
                <div data-testid="skotarlass-over" style={{ color: C.gul, fontSize: 13 }}>
                  Skotat {tal(over.get(x.objekt_id)!.skotat)} m³ — skördat {tal(over.get(x.objekt_id)!.skordat)} m³ ({tal(over.get(x.objekt_id)!.over)} m³ mer skotat än skördat)
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: C.muted, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                <span>Appen {x.app_lass} lass · {tal(x.app_m3)} m³ — Opti {x.opti_lass} lass · {tal(x.opti_m3)} m³</span>
                <span style={{ color: Math.abs(diff) < 1 ? C.gron : C.text }}>{diff > 0 ? '+' : ''}{tal(diff)} m³</span>
              </div>
            </div>
          )
        })
      )}
      {!saknas && !fel && <ObekraftadeLass traktNamn={(vo) => (vo ? namn.trakt.get(vo) ?? vo : 'Okänd trakt')} maskinNamn={(id) => namn.mask.get(id) ?? id} vidGranskat={() => setOmlasning((n) => n + 1)} />}
      <div style={{ paddingTop: 10, fontSize: 11, color: C.dim }}>
        Förarens egna m³ (hela m³) mot Optis lass. Opti är fortfarande facit. Förarna ser inget av detta. "Skotat mer än skördat" är bara information.
      </div>
    </div>
  )
}
