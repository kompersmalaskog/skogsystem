'use client'

// ─────────────────────────────────────────────────────────────
// useDatahalsa — EN delad sanning för Datahälsa-beskedet.
// Används av både /datahalsa-vyn och hemskärmens banner, så att
// beskedet aldrig kan betyda olika saker på olika ställen.
//
// Designprinciper (juli-26-lärdomarna):
//  - Larm ska LARMA — men bara på verkliga problem. Kända arv
//    hanteras med daterade baslinjer; larm vid FÖRÄNDRING.
//  - Skilj OFARLIGT från ÄKTA: en avvisad dubblett (409) är ingen
//    datatapp — den ska aldrig lysa rött. Rött reserveras för
//    verkligt tapp (parse-fel, DB-fel som inte är 409).
//  - Tre tillstånd per sektion: laddar / data / kunde-inte-läsa.
//    Kunde-inte-läsa smittar beskedet ("kunde inte kontrollera
//    allt") — aldrig grönt på ofullständig kontroll.
//  - Vyn visar VAD den vet, gissar aldrig varför. Maskintystnad
//    VISAS men larmar aldrig (semester ser ut som fel).
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Baslinje: kända importfel (2 st "Kunde inte spara" 2026-05-22 +
// 2 st "No such file" 2026-05-22/06-02). Uppmätt 2026-07-13.
// LARM endast om antalet VÄXER. Sänk konstanten om felen städas.
export const KANDA_IMPORTFEL = 4

// Importfärskhet (Martins trösklar 2026-07-13): filer kommer flera
// gånger om dagen, men helg/semester ger naturliga luckor.
const GRONT_TIM = 24
const GULT_TIM = 72

// Leverans per maskin — tid sedan senaste FIL (inte produktion). Trösklar
// satta så normal maskinkadens är grön (Scorpion dagligen, Wisent 2 fil/vecka,
// Rottne-26 ~10/vecka) och bara genuint lång tystnad går gul/röd. Färgen är en
// OBSERVATION, inte ett larm — den matar aldrig beskedet, och röd kan kvitteras
// som "förväntat" (semester) i vyn. Justerbara.
export const LEV_GRON_DYGN = 3
export const LEV_GUL_DYGN = 10

export type FelFil = { filnamn: string; felmeddelande: string | null; importerad_tid: string }

export type FilerData = {
  senasteImport: string | null   // ISO
  timmarSedan: number | null
  antal7d: number
  felFiler: FelFil[]
}

// Leverans-överblick: en rad per maskin med tid sedan senaste importerade fil.
export type LeveransRad = {
  maskinId: string
  namn: string                   // visningsnamn || modell || maskin_id
  aktivTill: string | null       // satt = ur drift (gråtonas, larmar aldrig)
  sanderFiler: boolean           // false = förväntas aldrig sända filer (JD810E)
  bekraftad: boolean             // false = obekräftad/upptäckt maskin
  senasteFil: string | null      // ISO importerad_tid ur meta_importerade_filer
  timmarSedan: number | null
}

export type InvarianterData = {
  over24h: { maskin: string; datum: string; timmar: number }[]
  dubbletter: { maskin: string; datum: string; objekt: string; antal: number }[]
  tomgangInkonsistenta: number
}

export type GapCheckData = {
  kordTid: string
  status: string                 // 'OK' | 'LARM'
  larmAntal: number
  sammanfattning: string | null
}

// import_fel — verifierade datatapp: tabellskrivningar som misslyckades i
// Python-importen (upsert_data:s felgren). Wisent-läxan 21/7: skiftdata
// tappades tyst i en logg ingen läser; nu läser datahälsan tabellen direkt.
export type ImportFelRad = {
  tid: string
  tabell: string
  filnamn: string | null
  felkod: string | null
  feltext: string | null
}

// Skilj OFARLIGT tabellskrivfel från ÄKTA datatapp. Importern lagrar felkod =
// HTTP-status (t.ex. "409") vid DB-avvisning, feltext = PostgREST-svaret.
//  - 409 / unique-constraint (23505) / "already exists" = raden finns REDAN =
//    ingen data tappad, tvärtom (dubbletten stoppades korrekt).
//  - flytt/arkiverings-strul = filen sparades, bara filflytten failade.
//  - allt annat (parse-fel, 4xx/5xx som inte är 409, saknad data) = ÄKTA tapp.
export function importFelKlass(r: ImportFelRad): 'ofarligt' | 'akta' {
  const kod = (r.felkod || '').toLowerCase()
  const txt = (r.feltext || '').toLowerCase()
  if (kod === '409') return 'ofarligt'
  if (txt.includes('duplicate key') || txt.includes('23505') || txt.includes('already exists')) return 'ofarligt'
  if (txt.includes('flytt') || /\bmove\b/.test(txt)) return 'ofarligt'
  return 'akta'
}

export type Sektion<T> = {
  laddar: boolean
  fel: string | null             // 'kunde inte läsa'-tillstånd — aldrig tyst tomt
  data: T | null
}

export type Besked = {
  niva: 'laddar' | 'gron' | 'gul' | 'rod' | 'okant'
  rubrik: string
  punkter: string[]
}

export type Datahalsa = {
  filer: Sektion<FilerData>
  leverans: Sektion<LeveransRad[]>
  invarianter: Sektion<InvarianterData>
  gapCheck: Sektion<GapCheckData | null> & { tabellSaknas: boolean }
  importFel: Sektion<ImportFelRad[]> & { tabellSaknas: boolean }
  besked: Besked
}

// Paginerad hämtning (fakt_tid är >1000 rader; PostgREST svarar max 1000/anrop)
async function hamtaAlla(tabell: string, kolumner: string): Promise<{ rows: any[]; fel: string | null }> {
  const SIDA = 1000
  let rows: any[] = []
  let fran = 0
  while (true) {
    const { data, error } = await supabase.from(tabell).select(kolumner)
      .order('id', { ascending: true })
      .range(fran, fran + SIDA - 1)
    if (error) return { rows: [], fel: error.message }
    rows = rows.concat(data || [])
    if (!data || data.length < SIDA) break
    fran += SIDA
  }
  return { rows, fel: null }
}

export function useDatahalsa(): Datahalsa {
  const [filer, setFiler] = useState<Sektion<FilerData>>({ laddar: true, fel: null, data: null })
  const [leverans, setLeverans] = useState<Sektion<LeveransRad[]>>({ laddar: true, fel: null, data: null })
  const [invarianter, setInvarianter] = useState<Sektion<InvarianterData>>({ laddar: true, fel: null, data: null })
  const [gapCheck, setGapCheck] = useState<Sektion<GapCheckData | null> & { tabellSaknas: boolean }>(
    { laddar: true, fel: null, data: null, tabellSaknas: false })
  const [importFel, setImportFel] = useState<Sektion<ImportFelRad[]> & { tabellSaknas: boolean }>(
    { laddar: true, fel: null, data: null, tabellSaknas: false })

  useEffect(() => {
    let avbruten = false

    // ── 1. Kommer filerna in? (meta_importerade_filer) ──
    ;(async () => {
      const [senaste, veckan, fel] = await Promise.all([
        supabase.from('meta_importerade_filer')
          .select('importerad_tid').order('importerad_tid', { ascending: false }).limit(1),
        supabase.from('meta_importerade_filer')
          .select('id', { count: 'exact', head: true })
          .gte('importerad_tid', new Date(Date.now() - 7 * 86400_000).toISOString()),
        supabase.from('meta_importerade_filer')
          .select('filnamn, felmeddelande, importerad_tid')
          .eq('status', 'FEL').order('importerad_tid', { ascending: false }),
      ])
      if (avbruten) return
      const errMsg = senaste.error?.message || veckan.error?.message || fel.error?.message || null
      if (errMsg) { setFiler({ laddar: false, fel: errMsg, data: null }); return }
      const senasteIso = senaste.data?.[0]?.importerad_tid ?? null
      setFiler({
        laddar: false, fel: null,
        data: {
          senasteImport: senasteIso,
          timmarSedan: senasteIso ? (Date.now() - new Date(senasteIso).getTime()) / 3600_000 : null,
          antal7d: veckan.count ?? 0,
          felFiler: (fel.data ?? []) as FelFil[],
        },
      })
    })()

    // ── 2. Leverans-överblick: senaste FIL per maskin (meta_importerade_filer
    //       + dim_maskin). Visas men larmar ALDRIG — filtystnad är en
    //       observation (semester), inte ett fel. ──
    ;(async () => {
      const dim = await supabase.from('dim_maskin')
        .select('maskin_id, visningsnamn, modell, aktiv_till, sander_filer, bekraftad')
      if (avbruten) return
      if (dim.error) { setLeverans({ laddar: false, fel: dim.error.message, data: null }); return }
      const maskinerRaw = (dim.data ?? []).filter((m: any) => m.maskin_id !== 'TEST_MASKIN')

      // Senaste fil per maskin — en liten indexerad query per maskin (fåtal maskiner).
      const filResultat = await Promise.all(maskinerRaw.map(async (m: any) => {
        const { data, error } = await supabase.from('meta_importerade_filer')
          .select('importerad_tid').eq('maskin_id', m.maskin_id)
          .order('importerad_tid', { ascending: false }).limit(1)
        return { id: m.maskin_id, tid: error ? null : (data?.[0]?.importerad_tid ?? null), fel: error?.message ?? null }
      }))
      if (avbruten) return
      const nagotFel = filResultat.find(r => r.fel)
      if (nagotFel) { setLeverans({ laddar: false, fel: nagotFel.fel, data: null }); return }

      const filMap = new Map(filResultat.map(r => [r.id, r.tid]))
      const lista: LeveransRad[] = maskinerRaw
        .map((m: any): LeveransRad => {
          const tid = filMap.get(m.maskin_id) ?? null
          return {
            maskinId: m.maskin_id,
            namn: (m.visningsnamn || '').trim() || m.modell || m.maskin_id,
            aktivTill: m.aktiv_till ?? null,
            sanderFiler: m.sander_filer !== false,
            bekraftad: m.bekraftad !== false,
            senasteFil: tid,
            timmarSedan: tid ? (Date.now() - new Date(tid).getTime()) / 3600_000 : null,
          }
        })
        // aktiva filsändare först (färskast överst), sen icke-sändare, sen ur drift
        .sort((a, b) => {
          const grupp = (x: LeveransRad) => x.aktivTill ? 3 : !x.sanderFiler ? 2 : x.senasteFil ? 0 : 1
          if (grupp(a) !== grupp(b)) return grupp(a) - grupp(b)
          return (a.timmarSedan ?? 9e9) - (b.timmarSedan ?? 9e9)
        })
      setLeverans({ laddar: false, fel: null, data: lista })
    })()

    // ── 3. Är datan galen? (invarianter ur HELA fakt_tid) ──
    ;(async () => {
      const tid = await hamtaAlla('fakt_tid', 'maskin_id, datum, objekt_id, operator_id, processing_sek, terrain_sek, other_work_sek, kort_stopp_sek, engine_time_sek, tomgang_sek, bransle_liter')
      if (avbruten) return
      if (tid.fel) { setInvarianter({ laddar: false, fel: tid.fel, data: null }); return }
      const rader = tid.rows.filter(r => r.maskin_id !== 'TEST_MASKIN')

      // Invarianterna — SAMMA formler som gap_check (håll i synk):
      // (a) >24h motortid per (maskin, dag)
      const engDag = new Map<string, number>()
      for (const r of rader) {
        const k = `${r.maskin_id}|${r.datum}`
        engDag.set(k, (engDag.get(k) ?? 0) + (r.engine_time_sek || 0))
      }
      const over24h: InvarianterData['over24h'] = []
      engDag.forEach((s, k) => {
        if (s > 24 * 3600) {
          const [maskin, datum] = k.split('|')
          over24h.push({ maskin, datum, timmar: s / 3600 })
        }
      })
      // (b) dubblett-signaturen: identiska (proc,terr,eng,fuel)>0 över olika operatörer
      const grupper = new Map<string, any[]>()
      for (const r of rader) {
        const k = `${r.datum}|${r.maskin_id}|${r.objekt_id}`
        const g = grupper.get(k) ?? []
        g.push(r); grupper.set(k, g)
      }
      const dubbletter: InvarianterData['dubbletter'] = []
      grupper.forEach((g, k) => {
        if (g.length < 2) return
        const sedd = new Map<string, string[]>()
        for (const r of g) {
          const fp = `${r.processing_sek || 0}|${r.terrain_sek || 0}|${r.engine_time_sek || 0}|${r.bransle_liter || 0}`
          if ((r.processing_sek || 0) + (r.terrain_sek || 0) + (r.engine_time_sek || 0) > 0) {
            const ops = sedd.get(fp) ?? []
            ops.push(r.operator_id); sedd.set(fp, ops)
          }
        }
        sedd.forEach(ops => {
          if (ops.length > 1) {
            const [datum, maskin, objekt] = k.split('|')
            dubbletter.push({ maskin, datum, objekt, antal: ops.length })
          }
        })
      })
      // (c) tomgångs-konsistens: lagrad == max(0, eng − (P+T+OW − kort_stopp))
      //     Arvet läkt 2026-07-13 → baslinjen är 0; varje inkonsistent rad är röd.
      let tomgangInkonsistenta = 0
      for (const r of rader) {
        const g0 = (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0) - (r.kort_stopp_sek || 0)
        const forv = Math.max(0, (r.engine_time_sek || 0) - g0)
        if (Math.abs((r.tomgang_sek || 0) - forv) > 1) tomgangInkonsistenta++
      }
      setInvarianter({ laddar: false, fel: null, data: { over24h, dubbletter, tomgangInkonsistenta } })
    })()

    // ── 4. Senaste Gap Check (meta_datahalsa_status — kräver migration) ──
    ;(async () => {
      const { data, error } = await supabase.from('meta_datahalsa_status')
        .select('kord_tid, status, larm_antal, sammanfattning').eq('id', 'gap_check')
      if (avbruten) return
      if (error) {
        const saknas = /does not exist|relation|schema cache/i.test(error.message)
        setGapCheck({ laddar: false, fel: saknas ? null : error.message, data: null, tabellSaknas: saknas })
        return
      }
      const rad = data?.[0]
      setGapCheck({
        laddar: false, fel: null, tabellSaknas: false,
        data: rad ? { kordTid: rad.kord_tid, status: rad.status, larmAntal: rad.larm_antal, sammanfattning: rad.sammanfattning } : null,
      })
    })()

    // ── 5. Tappades något vid import? (import_fel — kräver migration) ──
    // Sektionen visar 7 dygn; beskedet blir rött bara på ÄKTA rader senaste
    // DYGNET (409-dubbletter räknas aldrig som tapp), så ett åtgärdat tapp
    // inte skriker i en vecka. Äldre/ofarliga rader syns ändå i listan.
    ;(async () => {
      const { data, error } = await supabase.from('import_fel')
        .select('tid, tabell, filnamn, felkod, feltext')
        .gte('tid', new Date(Date.now() - 7 * 86400_000).toISOString())
        .order('tid', { ascending: false })
        .limit(50)
      if (avbruten) return
      if (error) {
        const saknas = /does not exist|relation|schema cache/i.test(error.message)
        setImportFel({ laddar: false, fel: saknas ? null : error.message, data: null, tabellSaknas: saknas })
        return
      }
      setImportFel({ laddar: false, fel: null, tabellSaknas: false, data: (data ?? []) as ImportFelRad[] })
    })()

    return () => { avbruten = true }
  }, [])

  // ── Beskedet — EN sammanvägning, samma överallt. Leverans (maskintystnad)
  //    matar ALDRIG beskedet: semester ser ut som fel. ──
  const laddar = filer.laddar || invarianter.laddar || gapCheck.laddar || importFel.laddar
  let besked: Besked
  if (laddar) {
    besked = { niva: 'laddar', rubrik: 'Kontrollerar …', punkter: [] }
  } else {
    const punkter: string[] = []
    // röda villkor
    if (filer.data && filer.data.felFiler.length > KANDA_IMPORTFEL)
      punkter.push(`${filer.data.felFiler.length - KANDA_IMPORTFEL} NYA importfel (utöver ${KANDA_IMPORTFEL} kända)`)
    if (filer.data?.timmarSedan != null && filer.data.timmarSedan > GULT_TIM)
      punkter.push(`Ingen fil på ${Math.round(filer.data.timmarSedan / 24)} dygn`)
    if (invarianter.data) {
      if (invarianter.data.over24h.length > 0)
        punkter.push(`${invarianter.data.over24h.length} dag(ar) med >24h motortid`)
      if (invarianter.data.dubbletter.length > 0)
        punkter.push(`${invarianter.data.dubbletter.length} dubblett-signatur(er)`)
      if (invarianter.data.tomgangInkonsistenta > 0)
        punkter.push(`${invarianter.data.tomgangInkonsistenta} tomgångs-inkonsistenta rader`)
    }
    if (gapCheck.data && gapCheck.data.status !== 'OK')
      punkter.push(`Gap Check larmade (${gapCheck.data.larmAntal})`)
    // Bara ÄKTA tapp senaste dygnet är rött — avvisade dubbletter (409) är
    // ingen datatapp och räknas aldrig hit.
    const farskaAktaImportFel = (importFel.data ?? [])
      .filter(r => importFelKlass(r) === 'akta' && Date.now() - new Date(r.tid).getTime() < 86400_000).length
    if (farskaAktaImportFel > 0)
      punkter.push(`${farskaAktaImportFel} tabellskrivfel senaste dygnet — data tappades vid import`)

    const kundeInteLasa = [filer.fel, invarianter.fel, gapCheck.fel, importFel.fel].some(Boolean)
    if (punkter.length > 0) {
      besked = { niva: 'rod', rubrik: `${punkter.length} sak${punkter.length > 1 ? 'er' : ''} att titta på`, punkter }
    } else if (kundeInteLasa) {
      besked = { niva: 'okant', rubrik: 'Kunde inte kontrollera allt', punkter: [] }
    } else if (filer.data?.timmarSedan != null && filer.data.timmarSedan > GRONT_TIM) {
      besked = {
        niva: 'gul',
        rubrik: `Inga larm — senaste fil för ${Math.round(filer.data.timmarSedan)} tim sedan`,
        punkter: [],
      }
    } else {
      besked = { niva: 'gron', rubrik: 'Allt lugnt', punkter: [] }
    }
  }

  return { filer, leverans, invarianter, gapCheck, importFel, besked }
}
