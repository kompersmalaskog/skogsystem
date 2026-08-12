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

// Godkänd ledighet på en dag med registrerat arbete (arbetad_min > 0). Systemet
// löser det via "arbete vinner" i visning/lön — men en godkänd semesterdag som
// samtidigt är en full arbetsdag ÄR en avvikelse (antingen ska semestern inte
// förbrukas, eller så är ansökan fel). Ytas här så ingen ställer frågan tyst.
// Ingen automatisk rättning.
export type LedighetKollision = { medarbetare: string; datum: string; typ: string; arbetad_min: number }

// Synk-avvikelse: en bekräftad dag vars maskintider byggts om till andra värden än
// de föraren skrev under på (mom-import 5d). Lönen betalar den BEKRÄFTADE tiden, så
// en OFÖRKLARAD avvikelse = betald tid ingen granskat. Läses direkt ur
// arbetsdag.synk_avvikelse (inte via salary-export — olika livscykler). Admin ser
// ALLA oavsett förarens visningströskel.
export type SynkAvvikelseRad = {
  medarbetare: string; datum: string; deltaMin: number
  bekraftat: string; maskinen: string
  forklaring: string | null   // aktivitet i klartext om föraren förklarat, annars null
  status: 'oforklarad' | 'forklarad' | 'hoppad'
}
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

export type Datahalsa = {
  filer: Sektion<FilerData>
  leverans: Sektion<LeveransRad[]>
  invarianter: Sektion<InvarianterData>
  gapCheck: Sektion<GapCheckData | null> & { tabellSaknas: boolean }
  importFel: Sektion<ImportFelRad[]> & { tabellSaknas: boolean }
  ledighetKollision: Sektion<LedighetKollision[]>
  synkAvvikelser: Sektion<SynkAvvikelseRad[]>
  koordinatLarm: Sektion<KoordinatLarmData>
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
  const [ledighetKollision, setLedighetKollision] = useState<Sektion<LedighetKollision[]>>({ laddar: true, fel: null, data: null })
  const [synkAvvikelser, setSynkAvvikelser] = useState<Sektion<SynkAvvikelseRad[]>>({ laddar: true, fel: null, data: null })
    })()

  const [koordinatLarm, setKoordinatLarm] = useState<Sektion<KoordinatLarmData>>({ laddar: true, fel: null, data: null })

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

    // ── 2+3. Leverans-överblick + invarianter — delar EN fakt_tid-hämtning.
    //   Leverans = MAX(datum) i fakt_tid/fakt_lass per maskin (sann leverans-
    //   signal, INTE meta_importerade_filer — se LeveransRad). Visas men larmar
    //   ALDRIG (semester ser ut som fel). Invarianterna körs på samma fakt_tid. ──
    ;(async () => {
      const [dimRes, tidRes, lassRes] = await Promise.all([
        supabase.from('dim_maskin')
          .select('maskin_id, visningsnamn, modell, aktiv_till, sander_filer, bekraftad'),
        hamtaAlla('fakt_tid', 'maskin_id, datum, objekt_id, operator_id, processing_sek, terrain_sek, other_work_sek, kort_stopp_sek, engine_time_sek, tomgang_sek, bransle_liter'),
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

      // ── Invarianter ur HELA fakt_tid ──
      if (tid.fel) { setInvarianter({ laddar: false, fel: tid.fel, data: null }); return }

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

    // ── Godkänd ledighet på dag med registrerat arbete (kollision) ──
    // Läser ledighet_ansokningar (godkänd) + arbetsdag med arbete, expanderar
    // ledigheten till datum och matchar. Bara ytning, ingen rättning.
    ;(async () => {
      const [ledR, arbR, medR] = await Promise.all([
        supabase.from('ledighet_ansokningar').select('medarbetare_id, typ, startdatum, slutdatum').eq('status', 'godkänd'),
        supabase.from('arbetsdag').select('medarbetare_id, datum, arbetad_min').gt('arbetad_min', 0),
        supabase.from('medarbetare').select('id, namn'),
      ])
      if (avbruten) return
      const fel = ledR.error?.message || arbR.error?.message || medR.error?.message || null
      if (fel) { setLedighetKollision({ laddar: false, fel, data: null }); return }
      const medById = new Map<string, string>((medR.data || []).map((m: any) => [m.id, m.namn]))
      const arb = new Map<string, number>()
      for (const a of (arbR.data || []) as any[]) arb.set(`${a.medarbetare_id}|${a.datum}`, a.arbetad_min || 0)
      const koll: LedighetKollision[] = []
      for (const l of (ledR.data || []) as any[]) {
        if (!l.startdatum || !l.slutdatum) continue
        const start = new Date(l.startdatum + 'T00:00:00')
        const slut = new Date(l.slutdatum + 'T00:00:00')
        for (let dt = new Date(start); dt <= slut; dt.setDate(dt.getDate() + 1)) {
          const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
          const min = arb.get(`${l.medarbetare_id}|${iso}`)
          if (min && min > 0) koll.push({
            medarbetare: medById.get(l.medarbetare_id) || String(l.medarbetare_id).slice(0, 8),
            datum: iso, typ: l.typ || 'ledig', arbetad_min: min,
          })
        }
      }
      koll.sort((a, b) => b.datum.localeCompare(a.datum))
      setLedighetKollision({ laddar: false, fel: null, data: koll })
    })()

    // ── Synk-avvikelser: bekräftade dagar vars maskintider byggts om (5d) ──
    // Alla synk_avvikelse != null, sorterat på Δarbetad_min. Skiljer OFÖRKLARAD
    // (kvitterad IS NULL) från FÖRKLARAD (förarens aktivitet-svar) och HOPPAD.
    ;(async () => {
      const [aR, mR] = await Promise.all([
        supabase.from('arbetsdag').select('medarbetare_id, datum, synk_avvikelse').not('synk_avvikelse', 'is', null),
        supabase.from('medarbetare').select('id, namn'),
      ])
      if (avbruten) return
      const fel = aR.error?.message || mR.error?.message || null
      if (fel) { setSynkAvvikelser({ laddar: false, fel, data: null }); return }
      const namn = new Map<string, string>((mR.data || []).map((m: any) => [m.id, m.namn]))
      const AKT: Record<string, string> = { reservdelar: 'Hämta reservdelar', service: 'Service', reparation: 'Reparation', utbildning: 'Utbildning', markagare: 'Markägarmöte', flytt: 'Flytt av maskin', brandkontroll: 'Brandkontroll', mote: 'Möte', rotben: 'Kapa rotben', annat: 'Annat' }
      const tMin = (t: any) => { const m = String(t || '').match(/(\d{2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0 }
      const rader: SynkAvvikelseRad[] = []
      for (const d of (aR.data || []) as any[]) {
        const a = d.synk_avvikelse; if (!a) continue
        const conf = (tMin(a.bekraftad_slut) - tMin(a.bekraftad_start)) - (a.bekraftad_rast_min || 0)
        const mom = (tMin(a.mom_slut) - tMin(a.mom_start)) - (a.mom_rast_min || 0)
        const status: SynkAvvikelseRad['status'] = !a.kvitterad ? 'oforklarad' : (a.aktivitet ? 'forklarad' : 'hoppad')
        rader.push({
          medarbetare: namn.get(d.medarbetare_id) || String(d.medarbetare_id).slice(0, 8),
          datum: String(d.datum), deltaMin: conf - mom,
          bekraftat: `${a.bekraftad_start}–${a.bekraftad_slut}, ${a.bekraftad_rast_min} min rast`,
          maskinen: `${a.mom_start}–${a.mom_slut}, ${a.mom_rast_min} min rast`,
          forklaring: a.aktivitet ? (AKT[a.aktivitet] || a.aktivitet) : null,
          status,
        })
      }
      rader.sort((x, y) => y.deltaMin - x.deltaMin)
      setSynkAvvikelser({ laddar: false, fel: null, data: rader })
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
            .order(ordercol, { ascending: true }).range(fran, fran + 999)
          if (error) return { rows: [] as any[], fel: error.message }
          rows.push(...(data || []))
          if (!data || data.length < 1000) break
          fran += 1000
        }
        return { rows, fel: null as string | null }
      }
      const cutoff = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10)
      const [dimR, objR, medR, arbR] = await Promise.all([
        sidor('dim_objekt', 'objekt_id, object_name, objektnr, latitude, longitude', 'objekt_id'),
        sidor('objekt', 'vo_nummer, lat, lng, larmkoordinat_lat, larmkoordinat_lng', 'vo_nummer'),
        supabase.from('medarbetare').select('id, namn'),
        supabase.from('arbetsdag').select('medarbetare_id, datum, objekt_id')
          .gte('datum', cutoff).order('datum', { ascending: false }),
      ])
      if (avbruten) return
      const fel = dimR.fel || objR.fel || medR.error?.message || arbR.error?.message || null
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

      // Koordinatlösa arbetsdagar senaste 60 d — en rad per (förare, datum, objekt)
      const koordlosa: KoordlosDag[] = []
      const seen = new Set<string>()
      for (const a of (arbR.data || []) as any[]) {
        if (!a.objekt_id || harKoord(a.objekt_id)) continue
        const nyckel = `${a.medarbetare_id}|${a.datum}|${a.objekt_id}`
        if (seen.has(nyckel)) continue
        seen.add(nyckel)
        koordlosa.push({
          medarbetare: medById.get(a.medarbetare_id) || String(a.medarbetare_id).slice(0, 8) || '?',
          datum: String(a.datum),
          objekt_id: String(a.objekt_id),
          objektnamn: (dimById.get(String(a.objekt_id))?.object_name || '').trim() || '(okänt objekt)',
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
  }, [])

  // ── Beskedet — EN sammanvägning, samma överallt. Leverans (maskintystnad)
  //    matar ALDRIG beskedet: semester ser ut som fel. ──
  const laddar = filer.laddar || invarianter.laddar || gapCheck.laddar || importFel.laddar || ledighetKollision.laddar || synkAvvikelser.laddar || koordinatLarm.laddar
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
    // Koordinatlarm: flägga FÄRSKA fall (senaste 7 d) i beskedet så en ny dag på
    // koordinatlöst objekt syns direkt; hela 60-dagarslistan bor i kortet.
    if (koordinatLarm.data) {
      const cutoff7 = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)
      const farska = koordinatLarm.data.koordlosa.filter(k => k.datum >= cutoff7).length
      if (farska > 0)
        punkter.push(`${farska} arbetsdag(ar) senaste veckan på objekt utan koordinat — km kan inte beräknas`)
      if (koordinatLarm.data.dupTrakt.length > 0)
        punkter.push(`${koordinatLarm.data.dupTrakt.length} trakt(er) på flera vo-nummer — koordinat kan tappas vid vo-byte`)
    }

    if ((ledighetKollision.data?.length ?? 0) > 0)
      punkter.push(`${ledighetKollision.data!.length} dag(ar) med godkänd ledighet OCH registrerat arbete — granska (semester uttagen fast dagen jobbades)`)

    const synkOforklarade = (synkAvvikelser.data ?? []).filter(r => r.status === 'oforklarad').length
    if (synkOforklarade > 0)
      punkter.push(`${synkOforklarade} oförklarad(e) tidsavvikelse(r) — bekräftad tid som skiljer sig från maskinen, granska före lön`)

    const kundeInteLasa = [filer.fel, invarianter.fel, gapCheck.fel, importFel.fel, ledighetKollision.fel, synkAvvikelser.fel, koordinatLarm.fel].some(Boolean)
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

  return { filer, leverans, invarianter, gapCheck, importFel, ledighetKollision, synkAvvikelser, koordinatLarm, besked }
}
