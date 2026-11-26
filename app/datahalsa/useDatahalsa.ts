'use client'

// ─────────────────────────────────────────────────────────────
// useDatahalsa — EN delad sanning för Datahälsa-beskedet.
// Används av både /datahalsa-vyn och hemskärmens banner, så att
// beskedet aldrig kan betyda olika saker på olika ställen.
//
// Designprinciper (juli-26-lärdomarna):
//  - BARA DET SOM ÄR FEL JUST NU (Martin 2026-11-25). Beskedet är listan
//    med problem ur lib/datahalsa/felNu — inga räknare över fel som läkt.
//  - Skilj OFARLIGT från ÄKTA: en avvisad dubblett (409) är ingen
//    datatapp — den ska aldrig lysa rött. Rött reserveras för
//    verkligt tapp (parse-fel, DB-fel som inte är 409).
//  - Tre tillstånd per sektion: laddar / data / kunde-inte-läsa.
//    Kunde-inte-läsa smittar beskedet ("kunde inte kontrollera
//    allt") — aldrig grönt på ofullständig kontroll.
//  - Vyn visar VAD den vet, gissar aldrig varför. Maskintystnad
//    VISAS men larmar aldrig (semester ser ut som fel).
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { SKARP_START, franGolv } from '@/lib/skarpStart'
import { type StatusRad } from '@/lib/datahalsa/status'
import { FEL_NU_DYGN, type FilIn, type ImportFelIn } from '@/lib/datahalsa/lakt'
import { beskedAv, felNu, type FelNu, type Problem } from '@/lib/datahalsa/felNu'
import { lasObekraftade } from '@/lib/skotarLass/granskaKopplad'
import { obekraftadeGrupper } from '@/lib/skotarLass/granskning'

// Leverans per maskin — tid sedan senaste FIL (inte produktion). Trösklar
// satta så normal maskinkadens är grön (Scorpion dagligen, Wisent 2 fil/vecka,
// Rottne-26 ~10/vecka) och bara genuint lång tystnad går gul/röd. Färgen är en
// OBSERVATION, inte ett larm — den matar aldrig beskedet, och röd kan kvitteras
// som "förväntat" (semester) i vyn. Justerbara.
export const LEV_GRON_DYGN = 3
export const LEV_GUL_DYGN = 10

export type FilerData = {
  senasteImport: string | null   // ISO
  timmarSedan: number | null
  /** Filloggen de senaste FEL_NU_DYGN dygnen, alla statusar — underlaget för läkt-regeln. */
  filer7d: FilIn[]
  /** Äldre rader med fel i filloggen (från skarp start). Bara historik: aldrig ett fel nu. */
  gamlaFel: { antal: number; forsta: string | null; sista: string | null }
}

// Leverans-överblick: en rad per maskin med tid sedan senaste DATA.
// Källan är MAX(datum) i fakt_tid + fakt_lass — den sanna leveranssignalen.
// INTE meta_importerade_filer: den är en fil-logg nycklad på filnamn, och
// kumulativa MOM/FPR-filer bär många dagars data per fil → fil-antal ≪
// dag-antal (Wisent: ~6 filer men 12 produktionsdagar). Meta skulle visa en
// levererande maskin som röd/tyst — tvärtemot syftet.
export type LeveransRad = {
  maskinId: string
  namn: string                   // visningsnamn || modell || maskin_id
  aktivTill: string | null       // satt = ur drift (gråtonas, larmar aldrig)
  sanderFiler: boolean           // false = förväntas aldrig sända filer (JD810E)
  bekraftad: boolean             // false = obekräftad/upptäckt maskin
  senasteData: string | null     // 'YYYY-MM-DD', MAX(datum) i fakt_tid/fakt_lass
  dagarSedan: number | null
}

// Motortid utan arbetstid: motorn gick men ingen RUN-kategori (P = T = OW = 0).
// Förväntat på flyttdagar (lastning på trailer, rast med motorn på) — VISAS
// dämpat, larmar aldrig. Fanns fram till 2026-10-01 en fallback i importen som
// skrev 88 % av motortiden som processing på sådana dagar (15 h påhittat
// arbete på 68 flyttdagar); nu skrivs noll och dagen syns här i stället.
export type MotorUtanArbete = {
  maskin: string; namn: string; datum: string; objekt: string; objektnamn: string
  motorSek: number; avbrottSek: number; rastSek: number
}

export type InvarianterData = {
  over24h: { maskin: string; datum: string; timmar: number }[]
  dubbletter: { maskin: string; datum: string; objekt: string; antal: number }[]
  tomgangInkonsistenta: number
  motorUtanArbete: MotorUtanArbete[]
}

// Statusraderna (meta_datahalsa_status): 'import_live' skrivs av databasen var
// 15:e minut (import_larm_kontroll), övriga av gap_check.py på importdatorn.
// All tolkning — texter, lägen, ordning — bor i lib/datahalsa/status.
export type { StatusRad } from '@/lib/datahalsa/status'

// import_fel — tabellskrivningar som misslyckades i Python-importen (upsert_data:s
// felgren). Wisent-läxan 21/7: skiftdata tappades tyst i en logg ingen läser; nu
// läser datahälsan tabellen direkt. Vad som är ofarligt och när ett fel har läkt
// avgörs i lib/datahalsa/lakt.
export type ImportFelRad = ImportFelIn
export { importFelKlass } from '@/lib/datahalsa/lakt'

// Objekt utan koordinat → km kan inte beräknas → tyst 0 i löneunderlaget. Fångas
// den dagen dagen registreras i stället för veckor senare (Oskars Rössmåla stod
// på 0 i nio dagar). Plus dubblerad trakt: samma objektnr på flera vo-nummer —
// grundfelet bakom Oskar (koordinaten satt bara på det gamla vo:t 11077137, inte
// på det rätta 11240372).
export type KoordlosDag = { medarbetare: string; datum: string; objekt_id: string; objektnamn: string }
export type DupTrakt = { objektnr: string; vo: { objekt_id: string; objektnamn: string; harKoord: boolean }[] }
export type KoordinatLarmData = { koordlosa: KoordlosDag[]; dupTrakt: DupTrakt[] }

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

/** De gamla självbekräftade lassen som ingen granskat (skotarläget). */
export type LassData = { antal: number; m3: number }

export type Datahalsa = {
  filer: Sektion<FilerData>
  leverans: Sektion<LeveransRad[]>
  invarianter: Sektion<InvarianterData>
  /** Alla statusrader. Vyn delar dem i import_live (överst) och importdatorns kontroller (lib/datahalsa/status). */
  status: Sektion<StatusRad[]> & { tabellSaknas: boolean }
  importFel: Sektion<ImportFelRad[]>
  koordinatLarm: Sektion<KoordinatLarmData>
  lass: Sektion<LassData>
  /** Det som är fel just nu, en rad per problem — samma lista som beskedet räknar. */
  problem: Problem[]
  /** Importfelen bedömda med läkt-regeln (null medan det laddar eller när underlaget inte gick att läsa). */
  importfel: FelNu['importfel']
  besked: Besked
  /** Läs allt en gång till (knappen "Försök igen"). */
  lasOm: () => void
  /** Läs bara de obekräftade lassen igen (efter en granskning) — utan att sidan blinkar. */
  lasOmLass: () => void
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
  const [status, setStatus] = useState<Sektion<StatusRad[]> & { tabellSaknas: boolean }>(
    { laddar: true, fel: null, data: null, tabellSaknas: false })
  const [importFel, setImportFel] = useState<Sektion<ImportFelRad[]>>({ laddar: true, fel: null, data: null })
  const [koordinatLarm, setKoordinatLarm] = useState<Sektion<KoordinatLarmData>>({ laddar: true, fel: null, data: null })
  const [lass, setLass] = useState<Sektion<LassData>>({ laddar: true, fel: null, data: null })
  const [omgang, setOmgang] = useState(0)
  const [lassOmgang, setLassOmgang] = useState(0)
  const lasOmLass = useCallback(() => setLassOmgang((n) => n + 1), [])
  const lasOm = useCallback(() => {
    const tom = { laddar: true, fel: null, data: null }
    setFiler(tom); setLeverans(tom); setInvarianter(tom); setImportFel(tom); setKoordinatLarm(tom); setLass(tom)
    setStatus({ ...tom, tabellSaknas: false })
    setOmgang((n) => n + 1)
  }, [])

  useEffect(() => {
    let avbruten = false
    const fran7d = new Date(Date.now() - FEL_NU_DYGN * 86400_000).toISOString()

    // ── 1. Kommer filerna in? (meta_importerade_filer) ──
    // Filloggen de senaste sju dygnen läses HEL (alla statusar): den är underlaget för läkt-regeln
    // (en senare fil i samma serie som gick in OK). Äldre fel läses bara som historik.
    ;(async () => {
      const filer7d: FilIn[] = []
      let fran = 0
      let lasFel: string | null = null
      while (true) {
        const { data, error } = await supabase.from('meta_importerade_filer')
          .select('id, filnamn, maskin_id, importerad_tid, status, felmeddelande')
          .gte('importerad_tid', fran7d)
          .order('id', { ascending: true })
          .range(fran, fran + 999)
        if (error) { lasFel = error.message; break }
        for (const r of (data ?? []) as any[]) {
          filer7d.push({
            filnamn: String(r.filnamn), maskinId: (r.maskin_id ?? '').trim() || null,
            importeradTid: String(r.importerad_tid), status: String(r.status ?? ''), felmeddelande: r.felmeddelande ?? null,
          })
        }
        if (!data || data.length < 1000) break
        fran += 1000
      }
      const [senaste, gamla] = lasFel ? [null, null] : await Promise.all([
        supabase.from('meta_importerade_filer')
          .select('importerad_tid').order('importerad_tid', { ascending: false }).limit(1),
        supabase.from('meta_importerade_filer')
          .select('importerad_tid', { count: 'exact' })
          .neq('status', 'OK')
          .gte('importerad_tid', `${SKARP_START}T00:00:00`)
          .lt('importerad_tid', fran7d)
          .order('importerad_tid', { ascending: true })
          .limit(1000),
      ])
      if (avbruten) return
      const errMsg = lasFel || senaste?.error?.message || gamla?.error?.message || null
      if (errMsg) { setFiler({ laddar: false, fel: errMsg, data: null }); return }
      const senasteIso = senaste?.data?.[0]?.importerad_tid ?? null
      const gamlaRader = (gamla?.data ?? []) as { importerad_tid: string }[]
      setFiler({
        laddar: false, fel: null,
        data: {
          senasteImport: senasteIso,
          timmarSedan: senasteIso ? (Date.now() - new Date(senasteIso).getTime()) / 3600_000 : null,
          filer7d,
          gamlaFel: {
            antal: gamla?.count ?? gamlaRader.length,
            forsta: gamlaRader[0]?.importerad_tid ?? null,
            sista: gamlaRader[gamlaRader.length - 1]?.importerad_tid ?? null,
          },
        },
      })
    })()

    // ── 2+3. Leverans-överblick + invarianter — delar EN fakt_tid-hämtning.
    //   Leverans = MAX(datum) i fakt_tid/fakt_lass per maskin (sann leverans-
    //   signal, INTE meta_importerade_filer — se LeveransRad). Visas men larmar
    //   ALDRIG (semester ser ut som fel). Invarianterna körs på samma fakt_tid. ──
    ;(async () => {
      const [dimRes, tidRes, lassRes] = await Promise.all([
        supabase.from('dim_maskin')
          .select('maskin_id, visningsnamn, modell, aktiv_till, sander_filer, bekraftad'),
        hamtaAlla('fakt_tid', 'maskin_id, datum, objekt_id, operator_id, processing_sek, terrain_sek, other_work_sek, kort_stopp_sek, engine_time_sek, tomgang_sek, bransle_liter, avbrott_sek, disturbance_sek, maintenance_sek, rast_sek'),
        hamtaAlla('fakt_lass', 'maskin_id, datum'),
      ])
      if (avbruten) return

      const tid = tidRes
      const rader = tid.rows.filter(r => r.maskin_id !== 'TEST_MASKIN')

      // ── Leverans: senaste produktions-/lass-datum per maskin ──
      // fakt_tid saknas → kan inte avgöra leverans → fel-tillstånd (aldrig tyst).
      if (dimRes.error || tid.fel) {
        setLeverans({ laddar: false, fel: dimRes.error?.message || tid.fel, data: null })
      } else {
        const senast: Record<string, string> = {}
        const stoppaMax = (mid: string, d: any) => {
          const datum = d ? String(d) : ''
          if (datum && (!senast[mid] || datum > senast[mid])) senast[mid] = datum
        }
        for (const r of rader) stoppaMax(r.maskin_id, r.datum)
        // fakt_lass kompletterar (skotare kan ha lass-dag utan fakt_tid-rad).
        // Fel på fakt_lass är icke-fatalt — fakt_tid bär huvudsignalen.
        if (!lassRes.fel) {
          for (const r of lassRes.rows) {
            if (r.maskin_id && r.maskin_id !== 'TEST_MASKIN') stoppaMax(r.maskin_id, r.datum)
          }
        }
        const idag = new Date(new Date().toISOString().slice(0, 10)).getTime()
        const lista: LeveransRad[] = (dimRes.data ?? [])
          .filter((m: any) => m.maskin_id !== 'TEST_MASKIN')
          .map((m: any): LeveransRad => {
            const d = senast[m.maskin_id] ?? null
            return {
              maskinId: m.maskin_id,
              namn: (m.visningsnamn || '').trim() || m.modell || m.maskin_id,
              aktivTill: m.aktiv_till ?? null,
              sanderFiler: m.sander_filer !== false,
              bekraftad: m.bekraftad !== false,
              senasteData: d,
              dagarSedan: d ? Math.round((idag - new Date(d).getTime()) / 86400_000) : null,
            }
          })
          // aktiva filsändare först (färskast överst), sen icke-sändare, sen ur drift
          .sort((a, b) => {
            const grupp = (x: LeveransRad) => x.aktivTill ? 3 : !x.sanderFiler ? 2 : x.senasteData ? 0 : 1
            if (grupp(a) !== grupp(b)) return grupp(a) - grupp(b)
            return (a.dagarSedan ?? 9e9) - (b.dagarSedan ?? 9e9)
          })
        setLeverans({ laddar: false, fel: null, data: lista })
      }

      // ── Invarianter ur fakt_tid FRÅN SKARP START ──
      // Leveransen ovan använder hela historiken (MAX(datum) per maskin måste
      // kunna säga "tyst sedan juli"). Invarianterna är ÅTGÄRDSLARM och räknar
      // bara från golvet — dubbleringarna från jan–jul är byggmaterial
      // (lib/skarpStart; gap_check.py filtrerar likadant, håll i synk).
      if (tid.fel) { setInvarianter({ laddar: false, fel: tid.fel, data: null }); return }
      const skarpa = rader.filter(r => String(r.datum) >= SKARP_START)

      // Invarianterna — SAMMA formler som gap_check (håll i synk):
      // (a) >24h motortid per (maskin, dag)
      const engDag = new Map<string, number>()
      for (const r of skarpa) {
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
      for (const r of skarpa) {
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
      for (const r of skarpa) {
        const g0 = (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0) - (r.kort_stopp_sek || 0)
        const forv = Math.max(0, (r.engine_time_sek || 0) - g0)
        if (Math.abs((r.tomgang_sek || 0) - forv) > 1) tomgangInkonsistenta++
      }
      // (d) motortid utan arbetstid — observation, inte larm (se MotorUtanArbete).
      //     Summeras per (maskin, dag, objekt) så två förares rader på samma
      //     flyttobjekt blir EN rad; namn ur dim_maskin/dim_objekt, aldrig id.
      const maskinNamn = new Map<string, string>(
        (dimRes.data ?? []).map((m: any) => [m.maskin_id, (m.visningsnamn || '').trim() || m.modell || m.maskin_id]))
      const perDagObjekt = new Map<string, MotorUtanArbete>()
      const arbeteSek = new Map<string, number>()   // P + T + OW per grupp
      for (const r of skarpa) {
        const k = `${r.maskin_id}|${r.datum}|${r.objekt_id ?? ''}`
        const m = perDagObjekt.get(k) ?? {
          maskin: r.maskin_id, namn: maskinNamn.get(r.maskin_id) ?? r.maskin_id, datum: String(r.datum),
          objekt: r.objekt_id ?? '', objektnamn: '', motorSek: 0, avbrottSek: 0, rastSek: 0,
        }
        m.motorSek += (r.engine_time_sek || 0)
        m.avbrottSek += (r.avbrott_sek || 0) + (r.disturbance_sek || 0) + (r.maintenance_sek || 0)
        m.rastSek += (r.rast_sek || 0)
        perDagObjekt.set(k, m)
        arbeteSek.set(k, (arbeteSek.get(k) ?? 0) + (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0))
      }
      const motorUtanArbete = Array.from(perDagObjekt.entries())
        .filter(([k, m]) => (arbeteSek.get(k) ?? 0) === 0 && m.motorSek > 0)
        .map(([, m]) => m)
        .sort((a, b) => b.datum.localeCompare(a.datum))
      const objektIds = Array.from(new Set(motorUtanArbete.map(m => m.objekt).filter(Boolean)))
      if (objektIds.length > 0) {
        const { data: objs } = await supabase.from('dim_objekt').select('objekt_id, object_name').in('objekt_id', objektIds)
        if (avbruten) return
        const namn = new Map<string, string>((objs ?? []).map((o: any) => [o.objekt_id, (o.object_name || '').trim()]))
        for (const m of motorUtanArbete) m.objektnamn = namn.get(m.objekt) || m.objekt
      }
      setInvarianter({ laddar: false, fel: null, data: { over24h, dubbletter, tomgangInkonsistenta, motorUtanArbete } })
    })()

    // ── 4. Statusraderna (meta_datahalsa_status): import_live + importdatorns kontroller ──
    // Alla rader i EN läsning. Förr lästes bara samlingsraden 'gap_check'; den skrivs
    // inte längre, och kontrollerna har var sin rad.
    ;(async () => {
      const { data, error } = await supabase.from('meta_datahalsa_status')
        .select('id, kord_tid, status, larm_antal, sammanfattning').order('id')
      if (avbruten) return
      if (error) {
        const saknas = /does not exist|relation|schema cache/i.test(error.message)
        setStatus({ laddar: false, fel: saknas ? null : error.message, data: null, tabellSaknas: saknas })
        return
      }
      setStatus({
        laddar: false, fel: null, tabellSaknas: false,
        data: ((data ?? []) as any[]).map((r): StatusRad => ({
          id: String(r.id), kordTid: r.kord_tid ?? null, status: String(r.status ?? ''),
          larmAntal: Number(r.larm_antal) || 0, sammanfattning: r.sammanfattning ?? null,
        })),
      })
    })()

    // ── 5. Tappades något vid import? (import_fel) ──
    // Alla rader de senaste sju dygnen, sida för sida (förr högst 50 — 23 nov kom 100 på en dag
    // och hälften syntes aldrig). Vilka som är fel NU avgör läkt-regeln (lib/datahalsa/lakt).
    ;(async () => {
      const rader: ImportFelRad[] = []
      let fran = 0
      while (true) {
        const { data, error } = await supabase.from('import_fel')
          .select('id, tid, tabell, filnamn, felkod, feltext')
          .gte('tid', fran7d)
          .order('tid', { ascending: false }).order('id', { ascending: true })
          .range(fran, fran + 999)
        if (avbruten) return
        if (error) { setImportFel({ laddar: false, fel: error.message, data: null }); return }
        for (const r of (data ?? []) as any[]) {
          rader.push({ tid: String(r.tid), tabell: String(r.tabell ?? ''), filnamn: r.filnamn ?? null, felkod: r.felkod ?? null, feltext: r.feltext ?? null })
        }
        if (!data || data.length < 1000) break
        fran += 1000
      }
      setImportFel({ laddar: false, fel: null, data: rader })
    })()

    // ── 6. Objekt utan koordinat (km kan ej beräknas) + dubblerad trakt ──
    // Koordinatkälla i samma ordning som km-fallbacken (lib/routing.ts): dim_objekt
    // → objekt.lat/lng → objekt.larmkoordinat. Saknas alla tre kan km inte
    // beräknas och dagen blir tyst 0 i lönen.
    ;(async () => {
      const sidor = async (tabell: string, kol: string, ordercol: string) => {
        const rows: any[] = []; let fran = 0
        while (true) {
          const { data, error } = await supabase.from(tabell).select(kol)
            .order(ordercol, { ascending: true }).order('id').range(fran, fran + 999)
          if (error) return { rows: [] as any[], fel: error.message }
          rows.push(...(data || []))
          if (!data || data.length < 1000) break
          fran += 1000
        }
        return { rows, fel: null as string | null }
      }
      // 60 dagar, klippt mot skarp start (lib/skarpStart): koordinatlarmet
      // ska aldrig lista dagar före golvet — de är byggmaterial.
      const cutoff = franGolv(new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10))
      const [dimR, objR, medR, arbR, aoR] = await Promise.all([
        sidor('dim_objekt', 'objekt_id, object_name, objektnr, latitude, longitude, kraver_koordinat', 'objekt_id'),
        sidor('objekt', 'vo_nummer, lat, lng, larmkoordinat_lat, larmkoordinat_lng', 'vo_nummer'),
        supabase.from('medarbetare').select('id, namn'),
        supabase.from('arbetsdag').select('id, medarbetare_id, datum, objekt_id')
          .gte('datum', cutoff).order('datum', { ascending: false }),
        sidor('arbetsdag_objekt', 'arbetsdag_id, objekt_id', 'arbetsdag_id'),
      ])
      if (avbruten) return
      const fel = dimR.fel || objR.fel || medR.error?.message || arbR.error?.message || aoR.fel || null
      if (fel) { setKoordinatLarm({ laddar: false, fel, data: null }); return }

      const dimById = new Map<string, any>(dimR.rows.map((d: any) => [String(d.objekt_id), d]))
      const objByVo = new Map<string, any>(objR.rows.map((o: any) => [String(o.vo_nummer), o]))
      const medById = new Map<string, string>((medR.data || []).map((m: any) => [m.id, m.namn]))
      const harKoord = (oid: string): boolean => {
        const d = dimById.get(String(oid))
        if (d && d.latitude != null && d.longitude != null) return true
        const o = objByVo.get(String(oid))
        if (o && ((o.lat != null && o.lng != null) || (o.larmkoordinat_lat != null && o.larmkoordinat_lng != null))) return true
        return false
      }
      // Alla objekt per arbetsdag ur arbetsdag_objekt (flyttdagar har flera).
      const aoByAd = new Map<string, string[]>()
      for (const r of aoR.rows as any[]) {
        if (!r.arbetsdag_id || !r.objekt_id) continue
        const arr = aoByAd.get(r.arbetsdag_id) || []
        arr.push(String(r.objekt_id)); aoByAd.set(r.arbetsdag_id, arr)
      }

      // Flyttobjekt m.fl. som inte är en fysisk arbetsplats markeras för hand med
      // dim_objekt.kraver_koordinat = false. De hoppas över helt när dagen värderas
      // — de bär ingen koordinat att rätta. Default är true (NULL ⇒ kräver koordinat)
      // så ett nytt platslöst objekt larmar EN gång; sedan lägger Martin in koordinat
      // eller sätter flaggan false, och larmet blir självunderhållande.
      const kraverKoord = (oid: string): boolean => dimById.get(String(oid))?.kraver_koordinat !== false

      // Larma BARA när INGET av dagens KVARVARANDE objekt har koordinat. Dagens objekt =
      // arbetsdag_objekt (alla) UNION arbetsdag.objekt_id (fallback för dagar utan
      // rader där), minus de som inte kräver koordinat. Har dagen minst ett objekt
      // med resolverbar koordinat är allt bra. En dag som BARA består av flytt (allt
      // bortfiltrerat) ger inget larm — det finns inget att rätta. En rad/(förare,datum).
      const koordlosa: KoordlosDag[] = []
      const seen = new Set<string>()
      for (const a of (arbR.data || []) as any[]) {
        const objektSet = Array.from(new Set([
          ...(aoByAd.get(a.id) || []),
          ...(a.objekt_id ? [String(a.objekt_id)] : []),
        ])).filter(oid => kraverKoord(oid))   // släng flytt/ej-plats
        if (objektSet.length === 0) continue                  // ingen relevant objektkoppling
        if (objektSet.some(oid => harKoord(oid))) continue     // minst ett med koordinat → ok
        const nyckel = `${a.medarbetare_id}|${a.datum}`
        if (seen.has(nyckel)) continue
        seen.add(nyckel)
        const rep = objektSet[0]
        koordlosa.push({
          medarbetare: medById.get(a.medarbetare_id) || String(a.medarbetare_id).slice(0, 8) || '?',
          datum: String(a.datum),
          objekt_id: rep,
          objektnamn: (dimById.get(rep)?.object_name || '').trim() || '(okänt objekt)',
        })
      }
      koordlosa.sort((x, y) => y.datum.localeCompare(x.datum))

      // Dubblerad trakt: samma objektnr på flera objekt_id (vo-nummer)
      const pernr = new Map<string, string[]>()
      for (const d of dimR.rows as any[]) {
        if (!d.objektnr) continue
        const arr = pernr.get(String(d.objektnr)) || []
        if (!arr.includes(String(d.objekt_id))) arr.push(String(d.objekt_id))
        pernr.set(String(d.objektnr), arr)
      }
      const dupTrakt: DupTrakt[] = []
      pernr.forEach((vos, nr) => {
        if (vos.length < 2) return
        dupTrakt.push({
          objektnr: nr,
          vo: vos.map(oid => ({
            objekt_id: oid,
            objektnamn: (dimById.get(oid)?.object_name || '').trim() || oid,
            harKoord: harKoord(oid),
          })),
        })
      })

      setKoordinatLarm({ laddar: false, fel: null, data: { koordlosa, dupTrakt } })
    })()

    return () => { avbruten = true }
  }, [omgang])

  // ── Obekräftade lass (den gamla självbekräftelsen) — ett fel så länge något väntar på granskning.
  //    Egen läsning: efter en granskning läses bara den om, så sidan inte blinkar. ──
  useEffect(() => {
    let avbruten = false
    ;(async () => {
      const l = await lasObekraftade()
      if (avbruten) return
      if (!l) { setLass({ laddar: false, fel: 'Kunde inte läsa skotarens lass', data: null }); return }
      const grupper = obekraftadeGrupper(l)
      setLass({
        laddar: false, fel: null,
        data: { antal: grupper.reduce((n, g) => n + g.lass.length, 0), m3: grupper.reduce((n, g) => n + g.m3, 0) },
      })
    })()
    return () => { avbruten = true }
  }, [omgang, lassOmgang])

  // ── Beskedet — EN sammanvägning, samma överallt: listan med det som är fel NU
  //    (lib/datahalsa/felNu). Leverans (maskintystnad) är aldrig ett fel: semester
  //    ser ut som fel. Ett läsfel är alltid ett problem, aldrig "Allt fungerar". ──
  const laddar = filer.laddar || leverans.laddar || invarianter.laddar || status.laddar || importFel.laddar || koordinatLarm.laddar || lass.laddar
  const maskinNamnMap = useMemo(
    () => new Map((leverans.data ?? []).map((m) => [m.maskinId.toUpperCase(), m.namn])), [leverans.data])
  const bedomt = useMemo(() => laddar ? null : felNu({
    nu: Date.now(),
    // En tabell som saknas är också "kunde inte kontrollera".
    status: { fel: status.fel ?? (status.tabellSaknas ? 'tabellen saknas' : null), data: status.data },
    filer: { fel: filer.fel, data: filer.data?.filer7d ?? null },
    importFel: { fel: importFel.fel, data: importFel.data },
    invarianter: {
      fel: invarianter.fel,
      data: invarianter.data && {
        over24h: invarianter.data.over24h.length, dubbletter: invarianter.data.dubbletter.length, tomgang: invarianter.data.tomgangInkonsistenta,
      },
    },
    koordinat: {
      fel: koordinatLarm.fel,
      data: koordinatLarm.data && { koordlosa: koordinatLarm.data.koordlosa.length, dupTrakt: koordinatLarm.data.dupTrakt.length },
    },
    lass: { fel: lass.fel, data: lass.data },
    leverans: { fel: leverans.fel },
    maskinNamn: (id) => maskinNamnMap.get(id.toUpperCase()) ?? id,
  }), [laddar, status, filer, importFel, invarianter, koordinatLarm, lass, leverans.fel, maskinNamnMap])
  const problem = bedomt?.problem ?? []
  const besked: Besked = beskedAv(problem, laddar)

  return { filer, leverans, invarianter, status, importFel, koordinatLarm, lass, problem, importfel: bedomt?.importfel ?? null, besked, lasOm, lasOmLass }
}
