'use client'
import { underTopbar, AVSTAND, RADIE, TYP, VIKT, medSafeBotten, FARG, FONT, kolumnRot, overgang } from '@/lib/design/tokens'; // layoutmått, inte avstånd (tokens: LAYOUT)

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getPeriodRange, getPrevDateRange, fetchAll, fmtSv, DeltaBadge, Sparkline, OperatorList, initials, VolymBadge, hamtaOperatorKoppling, type Period, type Operator, FLYTT_FARG, tint,
} from './OversiktShared'
import {
  hämtaManuellRader, harManuellData, fetchAllTimeLassTid, byggVolymPerDag, sumPerDag,
  type ManuellRad, type LassRad, type TidRad,
} from '@/lib/maskinvy/skotarvolym'
import { FLYTT_KATEGORI } from '../../lib/avbrott-kategorier'
import { slaIhopOperatorer } from '@/lib/maskinvy/operatorer'
import { KLASSER, getKlassIdx } from '@/lib/maskinvy/jamforelse'
import {
  skotningsavstandM, snittSkotningsavstandM, SKOTNINGSAVSTAND_ETIKETT, SKOTNINGSAVSTAND_UNDERTEXT,
} from '@/lib/skotningsavstand'
import { G15_GRANS_SEK, tuProcent, TU_BRANSCHSNITT, arOklassatAvbrott } from '@/lib/g15'
import { useMaskinvyMaskiner, type MaskinvyMaskin } from './useMaskinvyMaskiner'
import { LivestatusKort } from './Livestatus'

// ─────────────────────────────────────────────────────────────
// SkotareOversiktNy — Översikt för skotare bakom ?ny=1.
//
// Skotaren avverkar inte — den kör ut virke från fält till väg.
// Datakälla: fakt_lass (volym, körsträcka) + fakt_tid (G15h) +
// fakt_avbrott (avbrott/flytt — SAMMA källa som avbrottsvyn,
// SkotareAvbrottNy, så de två vyerna alltid visar samma siffror).
// Tabellerna hämtas ALDRIG i samma query — de aggregeras var
// för sig och kombineras sedan i JS.
// ─────────────────────────────────────────────────────────────

// Maskinlistan är dynamisk — se useMaskinvyMaskiner (dim_maskin, bekräftad + data).

// ── Avståndklasser ───────────────────────────────────────────
// Samma ackordsklasser som Jämförelse (lib/maskinvy/jamforelse), på SKOTNINGSAVSTÅND
// (enkel väg) — inte på rå körsträcka (korstracka_m är tur och retur).
const KLASS_FARG = [FARG.bla, tint(FARG.bla, 72), tint(FARG.bla, 52), tint(FARG.bla, 36), tint(FARG.bla, 22)]
const DIST_KLASSER = KLASSER.map((k, i) => ({ label: k.label, farg: KLASS_FARG[i] }))

// ── Typer ─────────────────────────────────────────────────────
type DistKlass = { label: string; farg: string; antal: number; andel: number }

type SkotareData = {
  volym:        number
  lass:         number
  snittLass:    number | null
  snittSträcka: number | null
  g15h:         number
  lassPerG15h:  number | null
  dagar:        number
  distKlasser:  DistKlass[]
  proc:         number   // processing_sek summerat (G15h-tid)
  terr:         number   // terrain_sek summerat (G15h-tid)
  avbr:         number   // fakt_avbrott exkl. flytt (= avbrottsvyns "Stopp")
  flytt:        number   // fakt_avbrott Trailer transportation (= avbrottsvyns flyttkort)
  // Korta stopp: rå kort_stopp_sek (StanForD ShortDownTime). Skotarna emitterar
  // ingen sådan post → 0. Villkoret för "rapporteras inte" avläses ur DATAN
  // (kortStoppSek === 0), inte ur maskintypen — Rottne rapporterar det.
  kortStoppSek: number
  engineSek:    number
  harManuell:   boolean  // true = volym är manuell-korrigerad via skotare_objekt_manuell
  // TU (lib/g15.ts, Skogforsk): (P+T + avbrott < 15 min) / (P+T + OW + ALLA
  // avbrott inkl. flytt). avbr/flytt ovan är avbrottsvyns uppdelning; TU
  // räknar båda i nämnaren.
  owSek:        number
  kortaAvbrSek: number   // alla kategorier < G15_GRANS_SEK — hör till G15
  oklassadAvbrSek: number // avbrott utan registrerad orsak — osäkerhet i TU
  tu:           number | null
}

// Per-operatör i djupvyn
type SkotareOpData = {
  lass:         number
  volym:        number
  snittLass:    number | null
  snittSträcka: number | null
  g15h:         number
  prod:         number | null   // m³/G15h, viktat
  dagar:        number
  proc:         number
  terr:         number
  avbr:         number
  flytt:        number
  distKlasser:  DistKlass[]
}

type SkotareSerie = { label: string; hasData: boolean; volym: number | null }

// ── Tidshjälp ─────────────────────────────────────────────────
function fmtTid(sek: number): string {
  const h = Math.floor(sek / 3600)
  const m = Math.floor((sek % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── Datahämtning ─────────────────────────────────────────────

async function fetchSkotareData(
  maskinId: string, start: string, end: string,
): Promise<SkotareData> {
  const ids = [maskinId]

  // Hämta fakt_lass, fakt_tid och fakt_avbrott SEPARAT — aldrig i samma query
  const [lassRows, tidRows, avbrottRows] = await Promise.all([
    fetchAll('fakt_lass', 'datum, volym_m3sub, korstracka_m', ids, start, end),
    fetchAll('fakt_tid',  'processing_sek, terrain_sek, other_work_sek, kort_stopp_sek, engine_time_sek', ids, start, end),
    fetchAll('fakt_avbrott', 'kategori_kod, langd_sek', ids, start, end),
  ])

  // ── fakt_lass → volym, lass, sträcka, dagar, avståndklasser ──
  let volym = 0, totalDist = 0
  const dagSet = new Set<string>()
  const klassCounts = DIST_KLASSER.map(() => 0)

  for (const r of lassRows) {
    volym     += r.volym_m3sub || 0
    const dist = r.korstracka_m || 0
    totalDist += dist
    if (r.datum) dagSet.add(r.datum)
    // Klassificera avstånd i rätt klass (söker bakifrån för att hitta min-tröskeln)
    klassCounts[getKlassIdx(skotningsavstandM(dist))]++
  }

  const lass = lassRows.length

  // ── fakt_tid → G15h + tomgång (summeras fristående, aldrig join mot lass) ──
  let proc = 0, terr = 0, ow = 0, kortStoppSek = 0, engineSek = 0
  for (const r of tidRows) {
    proc         += r.processing_sek  || 0
    terr         += r.terrain_sek     || 0
    ow           += r.other_work_sek  || 0
    kortStoppSek += r.kort_stopp_sek  || 0
    engineSek    += r.engine_time_sek || 0
  }
  const g15h = (proc + terr + ow) / 3600

  // ── fakt_avbrott → avbrott + flytt ──────────────────────────
  // SAMMA källa som avbrottsvyn: alla DownTime-rader oavsett längd
  // (skotare har ingen G15-split — se lib/g15.ts), flytt utlyft precis
  // som avbrottsvyns flyttkort. OBS: INTE fakt_tid.avbrott_sek — den
  // hinken är bara Övrigt+Reparation (Underhåll/Störning ligger i
  // maintenance_sek/disturbance_sek) och gav en annan total än
  // avbrottsvyn för samma period.
  let avbr = 0, flytt = 0, kortaAvbrSek = 0, oklassadAvbrSek = 0
  for (const r of avbrottRows) {
    const sek = r.langd_sek || 0
    if (r.kategori_kod === FLYTT_KATEGORI) flytt += sek
    else avbr += sek
    if (sek < G15_GRANS_SEK) kortaAvbrSek += sek
    if (arOklassatAvbrott(r.kategori_kod)) oklassadAvbrSek += sek
  }

  return {
    volym,
    lass,
    snittLass:    lass > 0  ? volym / lass        : null,
    snittSträcka: snittSkotningsavstandM(totalDist, lass),
    g15h,
    lassPerG15h:  g15h > 0  ? lass / g15h         : null,
    dagar: dagSet.size,
    distKlasser: DIST_KLASSER.map((k, i) => ({
      label: k.label,
      farg:  k.farg,
      antal: klassCounts[i],
      andel: lass > 0 ? klassCounts[i] / lass : 0,
    })),
    proc,
    terr,
    avbr,
    flytt,
    kortStoppSek,
    engineSek,
    harManuell: false,
    owSek: ow,
    kortaAvbrSek,
    oklassadAvbrSek,
    tu: tuProcent(proc + terr, ow, kortaAvbrSek, avbr + flytt),
  }
}

// Hämtar manuell-rader och — om sådana finns — all-time lass+tid.
// Returnerar null om ingen manuell data finns (snabb no-op-väg).
async function hämtaManuellOchAllTid(maskinId: string): Promise<{
  rader:    ManuellRad[]
  lassRows: LassRad[]
  tidRows:  TidRad[]
} | null> {
  const rader = await hämtaManuellRader(maskinId)
  if (!harManuellData(rader)) return null
  const { lassRows, tidRows } = await fetchAllTimeLassTid([maskinId])
  return { rader, lassRows, tidRows }
}

// ── Operatörslista ────────────────────────────────────────────
// fakt_lass och fakt_tid hämtas SEPARAT per operator_id och slås
// samman i JS. Aldrig en direkt join — det dubbelräknar tidsdatan.
//
// m³/G15h = SUM(volym_m3sub från fakt_lass) / SUM(g15h från fakt_tid)
// Precis som skördaren men med lass-volym i täljaren.

async function fetchSkotareOperatorer(
  maskinId: string, start: string, end: string,
): Promise<Operator[]> {
  const ids = [maskinId]

  const [lassRows, tidRows, opRes, koppling] = await Promise.all([
    fetchAll('fakt_lass', 'datum, volym_m3sub, operator_id', ids, start, end),
    fetchAll('fakt_tid',  'datum, operator_id, processing_sek, terrain_sek, other_work_sek', ids, start, end),
    supabase.from('dim_operator').select('operator_id, operator_namn').in('maskin_id', ids),
    hamtaOperatorKoppling(),
  ])

  // Namn-lookup
  const opNames: Record<string, string> = {}
  for (const o of ((opRes as any).data || [])) {
    if (o.operator_id) opNames[o.operator_id] = o.operator_namn
  }

  // Aggregera fakt_lass per operator_id → volym + distinkta dagar
  const lassByOp: Record<string, { volym: number; dagar: Set<string> }> = {}
  for (const r of lassRows) {
    const id = r.operator_id
    if (!id) continue
    if (!lassByOp[id]) lassByOp[id] = { volym: 0, dagar: new Set() }
    lassByOp[id].volym += r.volym_m3sub || 0
    if (r.datum) lassByOp[id].dagar.add(r.datum)
  }

  // Aggregera fakt_tid per operator_id → G15h (SEPARAT, aldrig join mot lass)
  const tidByOp: Record<string, { proc: number; terr: number; ow: number }> = {}
  for (const r of tidRows) {
    const id = r.operator_id
    if (!id) continue
    if (!tidByOp[id]) tidByOp[id] = { proc: 0, terr: 0, ow: 0 }
    tidByOp[id].proc += r.processing_sek || 0
    tidByOp[id].terr += r.terrain_sek    || 0
    tidByOp[id].ow   += r.other_work_sek || 0
  }

  // Slå ihop, beräkna m³/G15h, filtrera och sortera alfabetiskt
  const allIds = new Set([...Object.keys(lassByOp), ...Object.keys(tidByOp)])
  const perId = Array.from(allIds)
    .map(id => {
      const l = lassByOp[id] || { volym: 0, dagar: new Set<string>() }
      const t = tidByOp[id]  || { proc: 0, terr: 0, ow: 0 }
      const g15h = (t.proc + t.terr + t.ow) / 3600
      return {
        id,
        namn:    opNames[id] || id,
        g15h,
        volym:   l.volym,
        stammar: 0,                               // skotare har inga stammar
        dagar:   l.dagar.size,
        prod:    g15h > 0 ? l.volym / g15h : null, // m³/G15h, viktat
        ids:     [id],
        datum:   Array.from(l.dagar),
      } satisfies Operator
    })
    .filter(o => o.volym > 0)                     // skippa perioder utan lass
  // En rad per PERSON (Max Karlsson hade två operator_id → två rader).
  return slaIhopOperatorer(perId, koppling)
}

// ── Djupvydata per operatör ────────────────────────────────────
// Hämtar fakt_lass + fakt_tid + fakt_avbrott för hela maskinen och
// filtrerar sedan på operator_id i JS. Aldrig join mot varandra.

async function fetchSkotareOpDeep(
  maskinId: string, opIds: string[], start: string, end: string,
): Promise<SkotareOpData> {
  const ids = [maskinId]
  const [lassRows, tidRows, avbrottRows] = await Promise.all([
    fetchAll('fakt_lass', 'datum, volym_m3sub, korstracka_m, operator_id', ids, start, end),
    fetchAll('fakt_tid',  'datum, operator_id, processing_sek, terrain_sek, other_work_sek', ids, start, end),
    fetchAll('fakt_avbrott', 'operator_id, kategori_kod, langd_sek', ids, start, end),
  ])

  // Personen kan ha flera operator_id — djupvyn visar alla tillsammans.
  const lassOp    = (lassRows    as any[]).filter(r => opIds.includes(r.operator_id))
  const tidOp     = (tidRows     as any[]).filter(r => opIds.includes(r.operator_id))
  const avbrottOp = (avbrottRows as any[]).filter(r => opIds.includes(r.operator_id))

  let volym = 0, totalDist = 0
  const dagSet = new Set<string>()
  const klassCounts = DIST_KLASSER.map(() => 0)
  for (const r of lassOp) {
    volym     += r.volym_m3sub || 0
    const dist = r.korstracka_m || 0
    totalDist += dist
    if (r.datum) dagSet.add(r.datum)
    klassCounts[getKlassIdx(skotningsavstandM(dist))]++
  }
  const lass = lassOp.length

  let proc = 0, terr = 0, ow = 0
  for (const r of tidOp) {
    proc += r.processing_sek || 0
    terr += r.terrain_sek    || 0
    ow   += r.other_work_sek || 0
  }
  const g15h = (proc + terr + ow) / 3600

  // fakt_avbrott → avbrott + flytt, samma uppdelning som maskinnivån
  let avbr = 0, flytt = 0
  for (const r of avbrottOp) {
    if (r.kategori_kod === FLYTT_KATEGORI) flytt += r.langd_sek || 0
    else                                   avbr  += r.langd_sek || 0
  }

  return {
    lass, volym,
    snittLass:    lass > 0 ? volym / lass     : null,
    snittSträcka: snittSkotningsavstandM(totalDist, lass),
    g15h,
    prod: g15h > 0 ? volym / g15h : null,
    dagar: dagSet.size,
    proc, terr, avbr, flytt,
    distKlasser: DIST_KLASSER.map((k, i) => ({
      label: k.label, farg: k.farg,
      antal: klassCounts[i],
      andel: lass > 0 ? klassCounts[i] / lass : 0,
    })),
  }
}

const MIN_DAGAR = 2

async function fetchSkotareSerie(
  maskinId: string, period: Period, offset: number,
): Promise<SkotareSerie[]> {
  const ids = [maskinId]
  const ranges = Array.from({ length: 6 }, (_, i) => getPeriodRange(period, offset - (5 - i)))

  const lassRows = await fetchAll(
    'fakt_lass', 'datum, volym_m3sub',
    ids, ranges[0].start, ranges[ranges.length - 1].end,
  )

  const buckets = ranges.map(() => ({ volym: 0, dagar: new Set<string>() }))
  for (const r of lassRows) {
    for (let i = 0; i < ranges.length; i++) {
      if (r.datum >= ranges[i].start && r.datum <= ranges[i].end) {
        buckets[i].volym += r.volym_m3sub || 0
        if (r.datum) buckets[i].dagar.add(r.datum)
        break
      }
    }
  }

  return ranges.map((r, i) => ({
    label:   r.label,
    hasData: buckets[i].dagar.size >= MIN_DAGAR,
    volym:   buckets[i].dagar.size >= MIN_DAGAR ? buckets[i].volym : null,
  }))
}

// ── Hero-kort ─────────────────────────────────────────────────
// Separerat från skördarens HeroCard eftersom trendvärdet är
// volym (m³), inte produktivitet (m³/G15h).
function SkotareHero({
  value, prev, serie, refLabel, loading, harManuell,
}: {
  value:       number | null
  prev:        number | null
  serie:       SkotareSerie[]
  refLabel:    string
  loading:     boolean
  harManuell:  boolean
}) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)

  useEffect(() => {
    if (!chartRef.current) return
    setW(chartRef.current.clientWidth)
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(Math.max(0, Math.floor(e.contentRect.width)))
    })
    ro.observe(chartRef.current)
    return () => ro.disconnect()
  }, [])

  const trendValues = serie.map(s => s.volym)
  const trendValid  = trendValues.filter(v => v !== null && isFinite(v as number)).length

  return (
    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `${AVSTAND.xl}px ${AVSTAND.xl}px ${AVSTAND.l}px`, marginBottom: AVSTAND.l }}>
      <div style={{ fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text2, marginBottom: 12, letterSpacing: -0.1 }}>
        Utkört
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{
            fontSize: TYP.tal.fontSize, fontWeight: VIKT.halvfet, letterSpacing: -1.2,
            color: FARG.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
          }}>
            {loading ? '—' : value !== null ? fmtSv(value, 0) : '—'}
          </div>
          <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2 }}>m³sub</div>
        </div>
        {!loading && <VolymBadge harManuell={harManuell} />}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: AVSTAND.s }}>
        {loading
          ? <span style={{ fontSize: TYP.meta.fontSize, color: FARG.text3 }}>—</span>
          : <DeltaBadge current={value} previous={prev} size="md" />}
        <span style={{ fontSize: TYP.micro.fontSize, color: FARG.text2 }}>{refLabel}</span>
      </div>

      <div style={{ marginTop: 16, height: 60 }} ref={chartRef}>
        {loading ? (
          <div style={{
            height: 60, borderRadius: RADIE.rad, background: FARG.tonad,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: FARG.text2, fontSize: TYP.micro.fontSize,
          }}>—</div>
        ) : trendValid < 2 ? (
          <div style={{
            height: 60, borderRadius: RADIE.rad, background: FARG.tonad,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: FARG.text2, fontSize: TYP.micro.fontSize,
          }}>För lite trenddata</div>
        ) : (
          w > 0 && (
            <Sparkline
              values={trendValues}
              width={w} height={60}
              color={FARG.bla} fillOpacity={0.12} lastDot
            />
          )
        )}
      </div>
    </div>
  )
}

// ── KPI-lista ─────────────────────────────────────────────────
function SkotareKpiList({
  data, prev, loading,
}: {
  data:    SkotareData | null
  prev:    SkotareData | null
  loading: boolean
}) {
  type Row = {
    label: string; val: number | null; prevVal: number | null
    unit: string; dec: number; lowerIsBetter?: boolean; display?: string; muted?: boolean
    hint?: string; hint2?: string; varna?: boolean // TU: branschsnitt under etiketten, orange under snittet
  }
  const tuRef = TU_BRANSCHSNITT.skotare
  // Avbrott utan registrerad orsak — dämpad rad under TU, aldrig larm.
  const oklassadHint = data && data.oklassadAvbrSek >= 1800
    ? `${fmtSv(data.oklassadAvbrSek / 3600, 0)} tim avbrott utan registrerad orsak`
    : undefined
  // Korta stopp: mätt (rå kort_stopp_sek, andel av motortid) OM maskinen
  // rapporterar det — annars "rapporteras inte". Villkoret avläses ur datan
  // (kort_stopp === 0), inte ur maskintypen. Skotarna saknar signalen; skulle
  // en skotare börja emittera ShortDownTime visas den automatiskt.
  const kortSaknas = !!data && data.engineSek > 0 && data.kortStoppSek === 0
  const kortAndel = (d: SkotareData | null) =>
    d && d.engineSek > 0 && d.kortStoppSek > 0 ? (d.kortStoppSek / d.engineSek) * 100 : null
  const kortDisplay = kortSaknas
    ? 'rapporteras inte'
    : (data && data.kortStoppSek > 0
        ? `${fmtSv(data.kortStoppSek / 3600, 0)}h · ${fmtSv((data.kortStoppSek / data.engineSek) * 100, 1)}%`
        : undefined)
  const rows: Row[] = [
    { label: 'Lass',         val: data?.lass          ?? null, prevVal: prev?.lass          ?? null, unit: 'st',      dec: 0 },
    { label: 'Snittlass',    val: data?.snittLass      ?? null, prevVal: prev?.snittLass      ?? null, unit: 'm³/lass', dec: 1 },
    { label: SKOTNINGSAVSTAND_ETIKETT, val: data?.snittSträcka   ?? null, prevVal: prev?.snittSträcka   ?? null, unit: 'm',       dec: 0, hint: SKOTNINGSAVSTAND_UNDERTEXT },
    { label: 'Lass/G15h',    val: data?.lassPerG15h    ?? null, prevVal: prev?.lassPerG15h    ?? null, unit: 'st/G15h', dec: 1 },
    { label: 'G15-tid',      val: data && data.g15h > 0 ? data.g15h : null, prevVal: prev && prev.g15h > 0 ? prev.g15h : null, unit: 'h', dec: 1 },
    { label: 'Korta stopp',  val: kortAndel(data),              prevVal: kortAndel(prev),              unit: '%',       dec: 1, lowerIsBetter: true, display: kortDisplay, muted: kortSaknas, hint: kortSaknas ? undefined : 'mikropauser · % av motortid' },
    { label: 'TU',           val: data?.tu ?? null,             prevVal: prev?.tu ?? null,             unit: '%',       dec: 1, hint: `bransch ${tuRef} %`, hint2: oklassadHint, varna: data?.tu != null && data.tu < tuRef },
  ]

  return (
    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden', marginBottom: AVSTAND.l }}>
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 56px',
            gap: AVSTAND.l, alignItems: 'center',
            padding: `${AVSTAND.l}px ${AVSTAND.l}px`,
            borderTop: i > 0 ? `0.5px solid ${FARG.linje}` : 'none',
          }}
        >
          <div style={{ fontSize: TYP.text.fontSize, color: FARG.text }}>
            {r.label}
            {r.hint && <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginTop: 4, whiteSpace: 'nowrap' }}>{r.hint}</div>}
            {r.hint2 && <div style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginTop: AVSTAND.xs }}>{r.hint2}</div>}
          </div>
          <div style={{
            fontSize: r.muted ? 13 : 16, fontWeight: r.muted ? VIKT.normal : VIKT.halvfet,
            color: r.muted ? FARG.text2 : r.varna && !loading ? FARG.orange : FARG.text,
            fontVariantNumeric: 'tabular-nums', textAlign: 'right',
          }}>
            {loading ? '—' : r.display ?? (r.val !== null ? fmtSv(r.val, r.dec) : '—')}
            {!(!loading && r.display) && (
              <span style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginLeft: 4, fontWeight: VIKT.normal }}>
                {r.unit}
              </span>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            {loading || r.muted
              ? <span style={{ fontSize: TYP.micro.fontSize, color: FARG.text3 }}>—</span>
              : <DeltaBadge current={r.val} previous={r.prevVal} lowerIsBetter={r.lowerIsBetter ?? false} size="sm" />}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tidsfördelning ────────────────────────────────────────────
// Fyra segment: Processing (grön), Terrängkörning (blå), Avbrott (röd),
// Flytt (lila). Avbrott + Flytt kommer från fakt_avbrott — SAMMA källa
// och SAMMA uppdelning som avbrottsvyn (SkotareAvbrottNy: "Stopp" resp.
// flyttkortet), så översikt och avbrottsvy visar alltid samma siffror.
// Skotare har ingen korta pauser-split (se lib/g15.ts) — allt visas.
function SkotareTidsfordelning({
  data, loading,
}: {
  data:    { proc: number; terr: number; avbr: number; flytt: number } | null
  loading: boolean
}) {
  const segments = [
    { key: 'proc'  as const, label: 'Processing',     color: FARG.gron  },
    { key: 'terr'  as const, label: 'Terrängkörning', color: FARG.bla   },
    { key: 'avbr'  as const, label: 'Avbrott',        color: FARG.rod    },
    { key: 'flytt' as const, label: 'Flytt',          color: FLYTT_FARG },
  ]
  const total = data ? data.proc + data.terr + data.avbr + data.flytt : 0

  return (
    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: AVSTAND.l, marginBottom: AVSTAND.l }}>
      <div style={{ fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text2, marginBottom: AVSTAND.l }}>
        Tidsfördelning
      </div>
      {/* Staplad proportionsstapel */}
      <div style={{
        display: 'flex', height: 14, borderRadius: RADIE.stapel, overflow: 'hidden',
        background: FARG.tonad, gap: AVSTAND.xs,
      }}>
        {(!loading && data && total > 0) && segments.map(s => {
          const pct = data[s.key] / total * 100
          if (pct < 0.5) return null
          return <div key={s.key} style={{ flex: pct, background: s.color }} />
        })}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.l, marginTop: AVSTAND.l }}>
        {segments.map(s => {
          const v = data ? data[s.key] : 0
          const pct = total > 0 ? Math.round(v / total * 100) : null
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, fontSize: TYP.meta.fontSize }}>
              <div style={{ width: 8, height: 8, borderRadius: RADIE.stapel, background: s.color }} />
              <span style={{ color: FARG.text2 }}>{s.label}</span>
              <span style={{ color: FARG.text, fontWeight: VIKT.halvfet, fontVariantNumeric: 'tabular-nums' }}>
                {loading || pct === null ? '—' : `${pct}%`}
              </span>
              <span style={{ color: FARG.text2, fontSize: TYP.micro.fontSize, fontVariantNumeric: 'tabular-nums' }}>
                · {loading || !data ? '—' : fmtTid(v)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Skotningsavstånd per lass (enkel väg) ─────────────────────
// Staplad proportionsstapel + legend, liknande SkotareTidsfordelning.
// Accepterar SkotareData och SkotareOpData (båda har lass + distKlasser).
function DistKlasserKort({
  data, loading,
}: {
  data:    { lass: number; distKlasser: DistKlass[] } | null
  loading: boolean
}) {
  const klasser = data?.distKlasser ?? DIST_KLASSER.map(k => ({ label: k.label, farg: k.farg, antal: 0, andel: 0 }))
  const harData = !loading && data && data.lass > 0

  return (
    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: AVSTAND.l, marginBottom: AVSTAND.l }}>
      <div style={{ fontSize: TYP.meta.fontSize, fontWeight: VIKT.halvfet, color: FARG.text2, marginBottom: AVSTAND.l }}>
        {SKOTNINGSAVSTAND_ETIKETT} per lass
        <span style={{ fontWeight: VIKT.normal, marginLeft: AVSTAND.xs }}>· {SKOTNINGSAVSTAND_UNDERTEXT}</span>
      </div>

      {/* Staplad proportionsstapel */}
      <div style={{
        display: 'flex', height: 14, borderRadius: RADIE.stapel, overflow: 'hidden',
        background: FARG.tonad, gap: AVSTAND.xs, marginBottom: AVSTAND.l,
      }}>
        {harData && klasser.map((k, i) => {
          if (k.andel < 0.005) return null
          return <div key={i} style={{ flex: k.andel, background: k.farg }} />
        })}
      </div>

      {/* Legend: en rad per klass */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.l }}>
        {klasser.map((k, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, fontSize: TYP.meta.fontSize }}>
            <div style={{ width: 8, height: 8, borderRadius: RADIE.stapel, background: k.farg }} />
            <span style={{ color: FARG.text2 }}>{k.label}</span>
            <span style={{ color: FARG.text, fontWeight: VIKT.halvfet, fontVariantNumeric: 'tabular-nums' }}>
              {harData ? `${Math.round(k.andel * 100)}%` : '—'}
            </span>
            <span style={{ color: FARG.text2, fontSize: TYP.micro.fontSize, fontVariantNumeric: 'tabular-nums' }}>
              · {harData ? `${k.antal} lass` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Operatör-djupvy ───────────────────────────────────────────
// Glider in från höger med slide-animation (identisk mekanism som
// skördarens OperatorDeepView). Stänger via onClose / Escape / ‹-knapp.
//
// Visar per förare: utkört m³, lass, m³/G15h, snittlass,
// snittsträcka, tidsfördelning, avståndsprofil.
function SkotareOperatorDeepView({
  maskin, period, offset, periodLabel, operator, onClose,
}: {
  maskin:      { id: string; namn: string }
  period:      Period
  offset:      number
  periodLabel: string
  operator:    Operator
  onClose:     () => void
}) {
  const [data, setData]       = useState<SkotareOpData | null>(null)
  const [loading, setLoading] = useState(true)
  const [shown, setShown]     = useState(false)

  // Slide-in-animation: montera med translateX(100%), animera till 0.
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 10)
    return () => window.clearTimeout(t)
  }, [])

  // Stäng med animation: slide ut → onClose när animationen är klar.
  const handleClose = () => {
    setShown(false)
    window.setTimeout(onClose, 280)
  }

  // Stäng på Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hämta förarens data för perioden
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const { start, end } = getPeriodRange(period, offset)
    fetchSkotareOpDeep(maskin.id, operator.ids ?? [operator.id], start, end)
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [maskin.id, period, offset, operator.id, operator.ids?.join(',')])

  const kpiRows = [
    { label: 'Utkört',       val: data?.volym       ?? null, unit: 'm³sub',   dec: 0 },
    { label: 'Lass',         val: data?.lass         ?? null, unit: 'st',      dec: 0 },
    { label: 'm³/G15h',      val: data?.prod         ?? null, unit: 'm³/G15h', dec: 1 },
    { label: 'Snittlass',    val: data?.snittLass    ?? null, unit: 'm³/lass', dec: 1 },
    { label: SKOTNINGSAVSTAND_ETIKETT, val: data?.snittSträcka ?? null, unit: 'm enkel väg', dec: 0 },
  ]

  return (
    <div
      role="dialog"
      className="mv-djup"
      aria-label={`Förare: ${operator.namn}`}
      style={{
        position: 'fixed', top: 'calc(56px + env(safe-area-inset-top))', left: 0, right: 0, bottom: 0,
        overflow: 'auto', background: FARG.bg, color: FARG.text,
        fontFamily: FONT, fontFeatureSettings: '"tnum"',
        transform: shown ? 'translateX(0)' : 'translateX(100%)',
        transition: overgang('transform'),
        zIndex: 200,
      }}
    >
      {/* Sticky topbar: tillbaka-knapp */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: FARG.bg, borderBottom: `0.5px solid ${FARG.linje}`,
        padding: `${AVSTAND.m}px ${AVSTAND.m}px`,
      }}>
        <button
          onClick={handleClose}
          style={{
            background: 'transparent', border: 'none',
            color: FARG.bla, fontFamily: FONT,
            fontSize: TYP.text.fontSize, fontWeight: VIKT.normal, letterSpacing: -0.2,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
            gap: AVSTAND.xs, padding: `${AVSTAND.s}px ${AVSTAND.s}px`, minHeight: 36,
          }}
          aria-label="Tillbaka till Översikt"
        >
          <span style={{ fontSize: TYP.rubrik.fontSize, lineHeight: 1, marginRight: AVSTAND.xs }}>‹</span>
          Översikt
        </button>
      </div>

      {/* Header: avatar + namn + meta */}
      <div style={{
        ...kolumnRot('smal'), padding: `${AVSTAND.xl}px ${AVSTAND.l}px ${AVSTAND.s}px`,
        display: 'flex', alignItems: 'center', gap: AVSTAND.l,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: RADIE.sheet,
          background: FARG.linje,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: TYP.text.fontSize, fontWeight: VIKT.halvfet, color: FARG.text, flexShrink: 0,
        }}>
          {initials(operator.namn)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: TYP.rubrik.fontSize, fontWeight: VIKT.halvfet, color: FARG.text,
            letterSpacing: -0.4, lineHeight: 1.15,
          }}>
            {operator.namn}
          </div>
          <div style={{ fontSize: TYP.meta.fontSize, color: FARG.text2, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
            {periodLabel}
            <span style={{ color: FARG.text2 }}> · </span>
            {loading ? '—' : `${fmtSv(data?.g15h ?? 0, 0)} G15h`}
            <span style={{ color: FARG.text2 }}> · </span>
            {loading ? '—' : `${data?.dagar ?? 0} ${(data?.dagar ?? 0) === 1 ? 'dag' : 'dagar'}`}
          </div>
        </div>
      </div>

      {/* Innehåll */}
      <div style={{ ...kolumnRot('smal'), padding: `${AVSTAND.s}px ${AVSTAND.l}px 0`, paddingBottom: medSafeBotten(AVSTAND.xxl) }}>
        {/* KPI-lista */}
        <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden', marginBottom: AVSTAND.l }}>
          {kpiRows.map((r, i) => (
            <div
              key={r.label}
              style={{
                display: 'grid', gridTemplateColumns: '1fr auto',
                gap: AVSTAND.l, alignItems: 'center',
                padding: `${AVSTAND.l}px ${AVSTAND.l}px`,
                borderTop: i > 0 ? `0.5px solid ${FARG.linje}` : 'none',
              }}
            >
              <div style={{ fontSize: TYP.text.fontSize, color: FARG.text }}>{r.label}</div>
              <div style={{
                fontSize: TYP.text.fontSize, fontWeight: VIKT.halvfet, color: FARG.text,
                fontVariantNumeric: 'tabular-nums', textAlign: 'right',
              }}>
                {loading ? '—' : r.val !== null ? fmtSv(r.val, r.dec) : '—'}
                <span style={{ fontSize: TYP.micro.fontSize, color: FARG.text2, marginLeft: 4, fontWeight: VIKT.normal }}>
                  {r.unit}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Tidsfördelning */}
        <SkotareTidsfordelning data={data} loading={loading} />

        {/* Avståndsprofil */}
        <DistKlasserKort data={data} loading={loading} />
      </div>
    </div>
  )
}

// ── Huvud-komponent ───────────────────────────────────────────
export default function SkotareOversiktNy({ maskin, onMaskinChange }: {
  maskin: MaskinvyMaskin
  onMaskinChange: (m: MaskinvyMaskin) => void
}) {
  const { maskiner: SKOTARE } = useMaskinvyMaskiner('skotare')
  const [period, setPeriod]             = useState<Period>('M')
  const [offset, setOffset]             = useState(0)
  const [data,     setData]             = useState<SkotareData | null>(null)
  const [prevData, setPrevData]         = useState<SkotareData | null>(null)
  const [serie,    setSerie]            = useState<SkotareSerie[]>([])
  const [operatorer, setOperatorer]     = useState<Operator[]>([])
  const [loading,  setLoading]          = useState(false)
  const [maskinOpen, setMaskinOpen]     = useState(false)
  const [deepOperator, setDeepOperator] = useState<Operator | null>(null)
  const [harManuell,  setHarManuell]   = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const cur       = getPeriodRange(period, offset)
    const prevRange = getPrevDateRange(period, offset)

    Promise.all([
      fetchSkotareData(maskin.id, cur.start,       cur.end      ).catch(() => null),
      fetchSkotareData(maskin.id, prevRange.start, prevRange.end).catch(() => null),
      fetchSkotareSerie(maskin.id, period, offset).catch(() => []),
      fetchSkotareOperatorer(maskin.id, cur.start, cur.end).catch(() => []),
      hämtaManuellOchAllTid(maskin.id).catch(() => null),
    ]).then(([curD, prevD, ser, ops, atData]) => {
      if (cancelled) return

      // DEL B: applicera manuell-korrigering om all-time data finns
      if (atData && curD) {
        const { perDag: curPD, harManuell } = byggVolymPerDag(
          atData.lassRows, atData.rader, atData.tidRows, maskin.id, cur.start, cur.end,
        )
        if (harManuell) {
          const mv = sumPerDag(curPD)
          curD.volym     = mv
          curD.snittLass = curD.lass > 0 ? mv / curD.lass : null
          curD.harManuell = true
        }
      }
      if (atData && prevD) {
        const { perDag: prevPD, harManuell } = byggVolymPerDag(
          atData.lassRows, atData.rader, atData.tidRows, maskin.id, prevRange.start, prevRange.end,
        )
        if (harManuell) {
          const mv = sumPerDag(prevPD)
          prevD.volym     = mv
          prevD.snittLass = prevD.lass > 0 ? mv / prevD.lass : null
          prevD.harManuell = true
        }
      }

      // Korrigera serie-volymer (6 perioder bakåt)
      const adjustedSerie = (ser ?? []).map((s, i) => {
        if (!atData) return s
        const r = getPeriodRange(period, offset - (5 - i))
        const { perDag: sPD, harManuell } = byggVolymPerDag(
          atData.lassRows, atData.rader, atData.tidRows, maskin.id, r.start, r.end,
        )
        if (!harManuell) return s
        const sv = sumPerDag(sPD)
        return { ...s, volym: s.hasData ? sv : null }
      })

      // 65%-regel: visa delta bara om föregående period har jämförbar täckning.
      const prevValid = (prevD?.dagar ?? 0) >= (curD?.dagar ?? 0) * 0.65
      setHarManuell(curD?.harManuell ?? false)
      setData(curD)
      setPrevData(prevValid ? prevD : null)
      setSerie(adjustedSerie)
      setOperatorer(ops ?? [])
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [maskin.id, period, offset])

  // Stäng djupvyn automatiskt när maskin eller period ändras
  useEffect(() => {
    setDeepOperator(null)
  }, [maskin.id, period, offset])

  const { label } = getPeriodRange(period, offset)

  const refLabel = getPrevDateRange(period, offset).refLabel

  return (
    <div style={{
      position: 'fixed', top: underTopbar(), left: 0, right: 0, bottom: 0,
      overflow: 'auto', background: FARG.bg, color: FARG.text,
      fontFamily: FONT, fontFeatureSettings: '"tnum"',
      zIndex: deepOperator ? 200 : undefined,
    }}>
      {/* ── Sticky header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: FARG.bg, borderBottom: `0.5px solid ${FARG.linje}`,
      }}>
        {/* Maskin-dropdown */}
        <div style={{ padding: `${AVSTAND.l}px ${AVSTAND.l}px`, textAlign: 'center', position: 'relative' }}>
          <button
            className="mv-maskinval"
            onClick={() => setMaskinOpen(o => !o)}
            aria-expanded={maskinOpen}
            style={{
              background: 'transparent', border: 'none', color: FARG.text,
              fontFamily: FONT, fontSize: TYP.text.fontSize, fontWeight: VIKT.halvfet, letterSpacing: -0.3,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s,
              padding: 0,
            }}
          >
            {maskin.namn}
            <span className="mv-maskinval-pil" style={{ color: FARG.text2, fontSize: TYP.micro.fontSize }}>▾</span>
          </button>

          {maskinOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              background: FARG.kort, borderRadius: RADIE.kort, marginTop: AVSTAND.s,
              minWidth: 260, overflow: 'hidden', zIndex: 100,
              boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
            }}>
              {SKOTARE.map(m => (
                <button
                  key={m.id}
                  onClick={() => { onMaskinChange(m); setMaskinOpen(false) }}
                  style={{
                    display: 'block', width: '100%', padding: '12px 16px',
                    background: m.id === maskin.id ? FARG.linje : 'transparent',
                    border: 'none', color: FARG.text, fontFamily: FONT,
                    fontSize: TYP.meta.fontSize, cursor: 'pointer', textAlign: 'left',
                  }}
                >{m.namn}</button>
              ))}
            </div>
          )}
        </div>

        {/* Period-nav ‹ Maj 2026 › */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          padding: '12px 0 4px',
        }}>
          <button
            onClick={() => setOffset(o => o - 1)}
            aria-label="Föregående period"
            style={{
              width: 44, height: 44, border: 'none', background: 'transparent',
              color: FARG.text2, fontSize: TYP.rubrik.fontSize, cursor: 'pointer', fontFamily: FONT,
            }}
          >‹</button>
          <div style={{
            minWidth: 180, textAlign: 'center',
            fontSize: TYP.text.fontSize, fontWeight: VIKT.halvfet, color: FARG.text, letterSpacing: -0.3,
          }}>{label}</div>
          <button
            onClick={() => setOffset(o => Math.min(o + 1, 0))}
            disabled={offset >= 0}
            aria-label="Nästa period"
            style={{
              width: 44, height: 44, border: 'none', background: 'transparent',
              color: offset >= 0 ? FARG.text3 : FARG.text2, fontSize: TYP.rubrik.fontSize,
              cursor: offset >= 0 ? 'default' : 'pointer', fontFamily: FONT,
            }}
          >›</button>
        </div>

        {/* V/M/K/Å segmented control */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: `${AVSTAND.xs}px ${AVSTAND.l}px ${AVSTAND.l}px` }}>
          <div style={{
            display: 'inline-flex', background: FARG.linje,
            borderRadius: RADIE.kort, padding: AVSTAND.xs,
          }}>
            {(['V', 'M', 'K', 'Å'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setOffset(0) }}
                style={{
                  minWidth: 58, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, border: 'none', borderRadius: RADIE.rad,
                  background: period === p ? FARG.fyllning : 'transparent',
                  color: period === p ? FARG.text : FARG.text2,
                  fontSize: TYP.meta.fontSize, fontWeight: period === p ? VIKT.halvfet : VIKT.halvfet,
                  fontFamily: FONT, cursor: 'pointer',
                }}
              >{p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Innehåll ── */}
      <div style={{ ...kolumnRot('smal'), padding: `0 ${AVSTAND.l}px 0`, paddingBottom: medSafeBotten(AVSTAND.xxl) }}>
        {/* Livestatus (senaste lossning) + maskinhälsa (senaste fil) — alltid nu, oberoende av vald period. */}
        <LivestatusKort maskin={maskin} roll="skotare" />
        <SkotareHero
          value={data?.volym ?? null}
          prev={prevData?.volym ?? null}
          serie={serie}
          refLabel={refLabel}
          loading={loading}
          harManuell={harManuell}
        />
        <SkotareKpiList data={data} prev={prevData} loading={loading} />
        <SkotareTidsfordelning data={data} loading={loading} />
        <DistKlasserKort data={data} loading={loading} />
        <OperatorList
          operatorer={operatorer}
          loading={loading}
          onSelect={(op) => setDeepOperator(op)}
        />
      </div>

      {/* Operatör-djupvy som overlay */}
      {deepOperator && (
        <SkotareOperatorDeepView
          maskin={maskin}
          period={period}
          offset={offset}
          periodLabel={label}
          operator={deepOperator}
          onClose={() => setDeepOperator(null)}
        />
      )}
    </div>
  )
}
