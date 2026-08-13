'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import LastbilKarta from '@/components/LastbilKarta'
import { supabase } from '@/lib/supabase'
import { medAbortRetry } from '@/lib/supabaseRetry'

/*
  Lastbilen — karta-först-hubben (Mellanvägen). DOLD prototyp-rutt /lastbil-ny.

  Zero Layer: vyn ÄR fullskärmskartan med bilen. Allt annat flyter ovanpå.
   • Hero överst (flytande, färg = läge).
   • FAST fakturerbart-tal (period ≠ dag) — står alltid stilla, gömmer sig aldrig.
   • Tidslinje nederst: periodens rundor som segment; dra/tryck → kartan byter
     spår + ben-vyn reser sig. Perioder Dag/Vecka/Månad/Kvartal/År.
   • Kontextkort (tanka/service) bara när relevanta.
   • Bilen-ark (tank/hälsa/service/diesel) + Mer-ark (demo/förarfilter/CSV/flyttlogg).

  Data: /api/lastbil (hero, position, tank, hälsa, öppen runda, parkerad),
  /api/lastbil/forbrukning (diesel/månad), /api/lastbil/spar?runda= (spår per runda),
  och Supabase direkt (maskin_flytt + flyttdag per period) — exakt som Flyttloggen.
  Läser BARA. Ingen kod skriver något.
*/

const C = {
  bg: '#09090b', card: '#131315', card2: '#17171a', border: 'rgba(255,255,255,0.06)',
  glas: 'rgba(15,16,18,0.82)', glasKant: 'rgba(255,255,255,0.10)',
  t1: '#fafafa', t2: 'rgba(255,255,255,0.72)', t3: 'rgba(255,255,255,0.45)', t4: 'rgba(255,255,255,0.30)',
  green: '#22c55e', blue: '#3b82f6', orange: '#ff9f0a', red: '#ff453a',
}
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif"

/* ── Typer ── */
type Punkt = { lat: number; lng: number; t?: string }
type Segment = { coords: [number, number][]; matchad: boolean }
type KartData = { segment: Segment[]; punkter: Punkt[] }
type ManadF = {
  manad: string; mil: number; diesel_l: number; l_per_mil: number | null
  flytt: { mil: number; diesel_l: number; l_per_mil: number | null }
  ovrig: { mil: number; diesel_l: number; l_per_mil: number | null }
}
type Data = {
  ok: boolean; harData: boolean; namn?: string | null
  position: { lat: number; lng: number; tidpunkt: string | null; alder_min: number | null } | null
  tank: { diesel_pct: number | null; adblue_pct: number | null; rackvidd_km: number | null } | null
  halsa: { har_lampor: boolean; lampor: { kod: string; namn: string; state: string }[]; service_km: number | null; matare_km: number | null; motortimmar: number | null } | null
  runda_pagar: boolean; oppen_runda_id: string | null
  oppen_runda: { id: string; starttid: string | null; live_km: number | null; maskin: { namn: string; lage: 'flaket' | 'lossad' } | null; pa_vag_hem: boolean; km_kvar: number | null } | null
  parkerad: { plats: string; sedan: string | null } | null
  saknas: string[]
}
type FlyttRad = {
  id: string; maskin_id: string; extern_maskin: string | null; flytt_typ: string | null; kund: string | null
  flyttdag_id: string | null; fran_objekt_id: string | null; till_objekt_id: string | null
  fran_plats_id: string | null; till_plats_id: string | null
  flytt_km: number | null; mellankorning_km: number | null; fakturerbar: boolean | null
  tid_till_maskin_min: number | null; tid_flytt_min: number | null
  starttid: string; sluttid: string | null; avbruten: boolean; forare: string | null
}
type DagRad = {
  id: string; forare: string | null; starttid: string; sluttid: string | null
  tillkorning_km: number | null; hem_km: number | null; total_km: number | null; total_tid_min: number | null
  matare_km: number | null; bransle_l: number | null; odometer_stale: boolean | null
  status: string; auto_avslutad_av: string | null; hemresa_matt: boolean | null
}
type PeriodTyp = 'dag' | 'vecka' | 'manad' | 'kvartal' | 'ar'
type Demo = 'normal' | 'kor' | 'tanka' | 'service'

/* ── Formattering ── */
const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const MANAD_LANG = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']
const DAG = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör']
const TYP_ETIKETT: Record<string, string> = { produktion: 'Produktion', service: 'Service', kunduppdrag: 'Kunduppdrag', annat: 'Annat' }

function fmtDatum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${DAG[d.getDay()]} ${d.getDate()} ${MANAD[d.getMonth()]}`
}
function fmtKlocka(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}
function fmtAlder(min: number | null): string {
  if (min == null) return 'okänd tid'
  if (min < 1) return 'nyss'
  if (min < 60) return `för ${min} min sedan`
  const h = Math.floor(min / 60), m = min % 60
  return `för ${h} h${m ? ` ${m} min` : ''} sedan`
}
function fmtSedan(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso), nu = new Date()
  const dagStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDagar = Math.round((dagStart(nu) - dagStart(d)) / 86400000)
  const kl = fmtKlocka(iso)
  if (diffDagar <= 0) return `sedan ${kl}`
  if (diffDagar === 1) return `sedan igår ${kl}`
  if (diffDagar < 7) return `sedan ${DAG[d.getDay()]} ${kl}`
  return `sedan ${d.getDate()} ${MANAD[d.getMonth()]} ${kl}`
}
function fmtTid(min: number | null): string {
  if (min == null) return '—'
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r === 0 ? `${h} h` : `${h} h ${r} min`
}
function manadNamn(m: string): string {
  const [y, mm] = m.split('-')
  return `${MANAD_LANG[Number(mm) - 1]} ${y}`
}

/** ISO-vecka (måndag som veckostart). */
function isoVecka(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dag = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dag)
  const arsstart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil((((t.getTime() - arsstart.getTime()) / 86400000) + 1) / 7)
}
/** [start, slut) för vald period; offset 0 = innevarande. Samma logik som Flyttloggen + 'dag'. */
function periodIntervall(typ: PeriodTyp, offset: number): { start: Date; slut: Date; etikett: string } {
  const nu = new Date()
  if (typ === 'dag') {
    const start = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() + offset)
    const slut = new Date(start); slut.setDate(slut.getDate() + 1)
    const idag = offset === 0
    return { start, slut, etikett: idag ? 'Idag' : `${DAG[start.getDay()]} ${start.getDate()} ${MANAD[start.getMonth()]}` }
  }
  if (typ === 'vecka') {
    const d = new Date(nu)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7)
    d.setHours(0, 0, 0, 0)
    const slut = new Date(d); slut.setDate(slut.getDate() + 7)
    return { start: d, slut, etikett: `v. ${isoVecka(d)} ${d.getFullYear()}` }
  }
  if (typ === 'manad') {
    const start = new Date(nu.getFullYear(), nu.getMonth() + offset, 1)
    const slut = new Date(nu.getFullYear(), nu.getMonth() + offset + 1, 1)
    const namn = start.toLocaleString('sv-SE', { month: 'long' })
    return { start, slut, etikett: `${namn.charAt(0).toUpperCase()}${namn.slice(1)} ${start.getFullYear()}` }
  }
  if (typ === 'kvartal') {
    const q = Math.floor(nu.getMonth() / 3) + offset
    const start = new Date(nu.getFullYear(), q * 3, 1)
    const slut = new Date(nu.getFullYear(), q * 3 + 3, 1)
    return { start, slut, etikett: `Q${((q % 4) + 4) % 4 + 1} ${start.getFullYear()}` }
  }
  const start = new Date(nu.getFullYear() + offset, 0, 1)
  const slut = new Date(nu.getFullYear() + offset + 1, 0, 1)
  return { start, slut, etikett: `${start.getFullYear()}` }
}
const PERIODER: { typ: PeriodTyp; kort: string }[] = [
  { typ: 'dag', kort: 'Dag' }, { typ: 'vecka', kort: 'Vecka' }, { typ: 'manad', kort: 'Månad' },
  { typ: 'kvartal', kort: 'Kvartal' }, { typ: 'ar', kort: 'År' },
]

function laddaNerCsv(rader: (string | number)[][], filnamn: string) {
  const csv = '﻿' + rader.map(r => r.join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filnamn
  a.click()
  URL.revokeObjectURL(a.href)
}

/* ══════════════════════════ HUVUDKOMPONENT ══════════════════════════ */
export default function LastbilNyClient() {
  const [data, setData] = useState<Data | null>(null)
  const [laddar, setLaddar] = useState(true)
  const [fel, setFel] = useState<string | null>(null)
  const [pollN, setPollN] = useState(0)
  const [forbr, setForbr] = useState<ManadF[] | null>(null)

  const [periodTyp, setPeriodTyp] = useState<PeriodTyp>('manad')
  const [offset, setOffset] = useState(0)
  const [flyttar, setFlyttar] = useState<FlyttRad[] | null>(null)
  const [dagar, setDagar] = useState<DagRad[] | null>(null)
  const [objektNamn, setObjektNamn] = useState<Map<string, string>>(new Map())
  const [platsNamn, setPlatsNamn] = useState<Map<string, string>>(new Map())
  const [maskinNamn, setMaskinNamn] = useState<Map<string, string>>(new Map())

  const [valdEvent, setValdEvent] = useState<string | null>(null)
  const [kartData, setKartData] = useState<KartData | null>(null)
  const [sparLaddar, setSparLaddar] = useState(false)
  const sistaSparRef = useRef<string | null>(null)

  const [merOppen, setMerOppen] = useState(false)
  const [bilenOppen, setBilenOppen] = useState(false)
  const [demo, setDemo] = useState<Demo>('normal')
  const [forareFilter, setForareFilter] = useState('alla')
  const [manIx, setManIx] = useState(0)

  const period = useMemo(() => periodIntervall(periodTyp, offset), [periodTyp, offset])

  /* /api/lastbil + poll */
  async function las() {
    try {
      const r = await fetch('/api/lastbil', { cache: 'no-store' })
      if (r.status === 401) { setFel('Du är utloggad — logga in igen.'); setData(null); return }
      if (!r.ok) { setFel('Kunde inte läsa lastbilsdata just nu.'); return }
      const j = await r.json()
      if (!j?.ok) { setFel('Kunde inte läsa lastbilsdata just nu.'); return }
      setFel(null); setData(j); setPollN(n => n + 1)
    } catch { setFel('Kunde inte läsa lastbilsdata just nu.') }
    finally { setLaddar(false) }
  }
  useEffect(() => {
    las()
    fetch('/api/lastbil/forbrukning', { cache: 'no-store' })
      .then(r => r.json()).then(j => { if (j?.ok) setForbr(j.manader ?? []) }).catch(() => {})
    const iv = setInterval(las, 60_000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Periodens rundor + flyttar (Supabase direkt — som Flyttloggen) */
  useEffect(() => {
    let avbruten = false
    ;(async () => {
      setFlyttar(null); setDagar(null); setValdEvent(null)
      const [fRes, dRes] = await Promise.all([
        medAbortRetry(() => supabase.from('maskin_flytt')
          .select('id, maskin_id, extern_maskin, flytt_typ, kund, flyttdag_id, fran_objekt_id, till_objekt_id, fran_plats_id, till_plats_id, flytt_km, mellankorning_km, fakturerbar, tid_till_maskin_min, tid_flytt_min, starttid, sluttid, avbruten, forare')
          .gte('starttid', period.start.toISOString())
          .lt('starttid', period.slut.toISOString())
          .order('starttid', { ascending: false })),
        medAbortRetry(() => supabase.from('flyttdag')
          .select('id, forare, starttid, sluttid, tillkorning_km, hem_km, total_km, total_tid_min, matare_km, bransle_l, odometer_stale, status, auto_avslutad_av, hemresa_matt')
          .gte('starttid', period.start.toISOString())
          .lt('starttid', period.slut.toISOString())
          .order('starttid', { ascending: false })),
      ])
      if (avbruten) return
      if (fRes.error || dRes.error) { console.error('[lastbil-ny] läsfel', fRes.error || dRes.error); return }
      setFlyttar(fRes.data as FlyttRad[] || [])
      setDagar(dRes.data as DagRad[] || [])
      const objektIds = Array.from(new Set((fRes.data || []).flatMap((f: any) => [f.till_objekt_id, f.fran_objekt_id]).filter(Boolean))) as string[]
      if (objektIds.length) {
        const { data: obj } = await medAbortRetry(() => supabase.from('objekt').select('id, namn').in('id', objektIds))
        if (!avbruten && obj) setObjektNamn(new Map(obj.map((o: any) => [o.id, o.namn])))
      }
      const platsIds = Array.from(new Set((fRes.data || []).flatMap((f: any) => [f.till_plats_id, f.fran_plats_id]).filter(Boolean))) as string[]
      if (platsIds.length) {
        const { data: pl } = await medAbortRetry(() => supabase.from('flyttplats').select('id, namn').in('id', platsIds))
        if (!avbruten && pl) setPlatsNamn(new Map(pl.map((x: any) => [x.id, x.namn])))
      }
    })()
    return () => { avbruten = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.start.getTime(), period.slut.getTime()])

  useEffect(() => {
    supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell').then(({ data }) => {
      if (data) setMaskinNamn(new Map(data.map((m: any) => [m.maskin_id, m.visningsnamn || m.modell || m.maskin_id])))
    })
  }, [])

  /* Spår för aktiv runda (vald > pågående) */
  const aktivRunda = valdEvent ?? (data?.runda_pagar ? data.oppen_runda_id : null)
  useEffect(() => {
    if (!aktivRunda) { setKartData(null); sistaSparRef.current = null; return }
    const bytte = sistaSparRef.current !== aktivRunda
    sistaSparRef.current = aktivRunda
    let avbruten = false
    if (bytte) setSparLaddar(true)
    fetch(`/api/lastbil/spar?runda=${encodeURIComponent(aktivRunda)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!avbruten) setKartData(j?.ok ? { segment: j.segment ?? [], punkter: j.spar ?? [] } : { segment: [], punkter: [] }) })
      .catch(() => { if (!avbruten) setKartData({ segment: [], punkter: [] }) })
      .finally(() => { if (!avbruten && bytte) setSparLaddar(false) })
    return () => { avbruten = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktivRunda, pollN])

  /* ── Härledningar ── */
  const namnForMaskin = (id: string | null, extern: string | null) => id ? (maskinNamn.get(id) || id) : (extern || 'Maskin')
  const namnForAnde = (objektId: string | null, platsId: string | null) =>
    (objektId && objektNamn.get(objektId)) || (platsId && platsNamn.get(platsId)) || null

  const flyttPerDag = useMemo(() => {
    const m = new Map<string, FlyttRad[]>()
    for (const f of flyttar || []) {
      if (!f.flyttdag_id || f.avbruten || !f.sluttid) continue
      const arr = m.get(f.flyttdag_id) || []; arr.push(f); m.set(f.flyttdag_id, arr)
    }
    Array.from(m.values()).forEach(arr => arr.sort((a, b) => a.starttid.localeCompare(b.starttid)))
    return m
  }, [flyttar])

  // Tidslinjens händelser = synliga rundor i perioden (flytt-runda eller övrig körning)
  const events = useMemo(() => (dagar || [])
    .filter(d => (forareFilter === 'alla' || d.forare === forareFilter) &&
      ((flyttPerDag.get(d.id)?.length || 0) >= 1 || (d.status === 'ovrig_korning' && d.sluttid != null) || d.sluttid == null))
    .map(d => {
      const fl = flyttPerDag.get(d.id) || []
      const typ: 'flytt' | 'ovrig' | 'pagar' = d.sluttid == null ? 'pagar' : (fl.length ? 'flytt' : 'ovrig')
      return { dag: d, flyttar: fl, typ, km: d.matare_km ?? d.total_km ?? null }
    })
    .sort((a, b) => a.dag.starttid.localeCompare(b.dag.starttid)), [dagar, flyttPerDag, forareFilter])

  // Fakturerbart (period, respekterar förarfilter) — Σ flytt_km för fakturerbara avslutade flyttar
  const slutfordaFlyttar = useMemo(() => (flyttar || []).filter(f =>
    !f.avbruten && f.sluttid && (forareFilter === 'alla' || f.forare === forareFilter)), [flyttar, forareFilter])
  const fakt = useMemo(() => {
    const fakturerbara = slutfordaFlyttar.filter(f => f.fakturerbar)
    return {
      km: Math.round(fakturerbara.reduce((s, f) => s + (f.flytt_km ?? 0), 0)),
      antalFakt: fakturerbara.length,
      antal: slutfordaFlyttar.length,
      totalKm: Math.round(slutfordaFlyttar.reduce((s, f) => s + (f.flytt_km ?? 0), 0)),
    }
  }, [slutfordaFlyttar])

  const forareLista = useMemo(() => Array.from(new Set([
    ...(flyttar || []).map(f => f.forare), ...(dagar || []).map(d => d.forare)].filter(Boolean))) as string[], [flyttar, dagar])

  /* ── Läge: demo styr över härlett ── */
  const heroLage = useMemo(() => harledHeroLage(data, demo), [data, demo])
  const kontext = useMemo(() => harledKontext(data, demo, forbr), [data, demo, forbr])

  const kartSegment = kartData?.segment ?? []
  const kartPunkter = kartData?.punkter ?? []
  const rullar = (!!data?.oppen_runda && !valdEvent) || demo === 'kor'
  const benOppen = !!valdEvent && !!events.find(e => e.dag.id === valdEvent)
  const fitPadding = { top: 176, bottom: benOppen ? 380 : 220, left: 30, right: 30 }

  const valtEvent = events.find(e => e.dag.id === valdEvent) || null

  /* CSV (period) */
  function csvFlyttar() {
    const rub = ['Datum', 'Maskin', 'Typ', 'Kund', 'Förare', 'Från', 'Till', 'Mellankörning km', 'Flytt km', 'Flyttid min', 'Fakturerbar']
    const rader = slutfordaFlyttar.map(f => [
      new Date(f.starttid).toLocaleDateString('sv-SE'),
      namnForMaskin(f.maskin_id, f.extern_maskin), TYP_ETIKETT[f.flytt_typ || 'produktion'], f.kund || '', f.forare || '',
      namnForAnde(f.fran_objekt_id, f.fran_plats_id) || '', namnForAnde(f.till_objekt_id, f.till_plats_id) || '',
      f.mellankorning_km ?? '', f.flytt_km ?? '', f.tid_flytt_min != null ? Math.round(f.tid_flytt_min) : '', f.fakturerbar ? 'JA' : 'NEJ',
    ])
    laddaNerCsv([rub, ...rader], `flyttar-${period.etikett.replace(/[ .]/g, '-')}.csv`)
  }
  function csvDagar() {
    const rub = ['Datum', 'Förare', 'Flyttar', 'Tillkörning km', 'Hemresa km', 'Mätare km', 'Bränsle l', 'Status']
    const rader = events.filter(e => e.typ === 'flytt').map(e => {
      const d = e.dag
      return [new Date(d.starttid).toLocaleDateString('sv-SE'), d.forare || '', e.flyttar.length,
        d.tillkorning_km ?? '', d.hem_km ?? '', d.matare_km ?? '', d.bransle_l ?? '',
        d.auto_avslutad_av === 'cron_sakerhetsnat' ? 'Auto-stängd (säkerhetsnät)' : 'Avslutad']
    })
    laddaNerCsv([rub, ...rader], `flyttdagar-${period.etikett.replace(/[ .]/g, '-')}.csv`)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, fontFamily: ff, color: C.t1, overflow: 'hidden' }}>
      {/* KARTA — fyller allt */}
      <LastbilKarta
        variant="full" position={data?.position ?? null}
        segment={kartSegment} punkter={kartPunkter} puls={rullar} fitPadding={fitPadding}
      />

      {/* Toppgradient för läsbarhet */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200, background: 'linear-gradient(180deg, rgba(9,9,11,0.72), rgba(9,9,11,0))', pointerEvents: 'none', zIndex: 1 }} />

      {/* ── Topprad: hem + Bilen-pill + Mer ── */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 10px)', left: 12, right: 12, zIndex: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link href="/" style={rundKnapp} aria-label="Hem">
          <img src="/home-icon.png" alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover' }} />
        </Link>
        <div style={{ flex: 1 }} />
        {data?.tank && <BilenPill tank={data.tank} halsa={data.halsa} onClick={() => setBilenOppen(true)} />}
        <button onClick={() => setMerOppen(true)} style={rundKnapp} aria-label="Mer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill={C.t2}><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </button>
      </div>

      {/* ── Hero (flytande) ── */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 56px)', left: 12, right: 12, zIndex: 6 }}>
        {laddar && !data ? <FloatKort><span style={{ color: C.t2 }}>Läser lastbilsdata …</span></FloatKort>
          : fel ? <FloatKort kant={C.red}><div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}><span>{fel}</span><button onClick={() => { setLaddar(true); las() }} style={knappStil}>Försök igen</button></div></FloatKort>
          : data && !data.harData ? <FloatKort><span style={{ color: C.t2 }}>Ingen data från lastbilen än.</span></FloatKort>
          : data ? <Hero lage={heroLage} demo={demo !== 'normal'} /> : null}
      </div>

      {/* ── Fakturerbart (fast) + kontextkort ── */}
      {data?.harData && (
        <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 152px)', left: 12, right: 12, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {periodTyp !== 'dag' && <FakturerbartPill fakt={fakt} etikett={period.etikett} laddar={flyttar === null} />}
          {kontext.map((k, i) => <KontextKort key={i} k={k} />)}
        </div>
      )}

      {/* ── Tidslinje (nederst) ── */}
      {data?.harData && (
        <Tidslinje
          periodTyp={periodTyp} setPeriodTyp={(t) => { setPeriodTyp(t); setOffset(0) }}
          offset={offset} setOffset={setOffset} etikett={period.etikett}
          period={period} events={events} laddar={flyttar === null}
          vald={valdEvent} onValj={(id) => setValdEvent(v => v === id ? null : id)}
          sparLaddar={sparLaddar}
        />
      )}

      {/* ── Ben-kort (vid vald runda) ── */}
      {valtEvent && (
        <BenKort event={valtEvent} namnForMaskin={namnForMaskin} namnForAnde={namnForAnde}
          onStang={() => setValdEvent(null)} sparLaddar={sparLaddar} />
      )}

      {/* ── Bilen-ark ── */}
      {bilenOppen && data && (
        <Ark titel="Bilen" onStang={() => setBilenOppen(false)}>
          <BilenInnehall tank={data.tank} halsa={data.halsa} forbr={forbr} ix={manIx} setIx={setManIx} />
        </Ark>
      )}

      {/* ── Mer-ark ── */}
      {merOppen && (
        <Ark titel="Mer" onStang={() => setMerOppen(false)}>
          <MerInnehall
            demo={demo} setDemo={setDemo}
            forareLista={forareLista} forareFilter={forareFilter} setForareFilter={setForareFilter}
            onCsvFlyttar={csvFlyttar} onCsvDagar={csvDagar}
            periodEtikett={period.etikett} harFlyttar={(events.length > 0)}
          />
        </Ark>
      )}
    </div>
  )
}

/* ══════════ Läge-härledning ══════════ */
type HeroLage =
  | { sort: 'avvik'; niva: 'rod'; rubrik: string; under: string }
  | { sort: 'kor'; pill: string; mitt: React.ReactNode; stort: string; under: string }
  | { sort: 'park'; plats: string; sedan: string | null }
  | { sort: 'neutral'; rubrik: string; under: string }

function harledHeroLage(data: Data | null, demo: Demo): HeroLage {
  if (demo === 'kor') {
    return { sort: 'kor', pill: 'KÖR NU', mitt: <span style={{ color: '#fff', fontWeight: 600 }}>🚚 Scorpion på flaket</span>, stort: '18 km', under: 'Avfärd 08:12 · demo-läge' }
  }
  if (data?.harData) {
    // Röd nivå tar hero:n (lampor lyser / kritisk diesel)
    const lampor = data.halsa?.lampor ?? []
    if (demo === 'normal' && lampor.length > 0) return { sort: 'avvik', niva: 'rod', rubrik: lampor.length === 1 ? `${lampor[0].namn} lyser` : `${lampor.length} varningslampor lyser`, under: 'Kontrollera bilen' }
    const d = data.tank?.diesel_pct, r = data.tank?.rackvidd_km
    if (demo === 'normal' && d != null && d < 15) return { sort: 'avvik', niva: 'rod', rubrik: `Diesel ${Math.round(d)} % — tanka nu`, under: r != null ? `Räckvidd ${r} km` : 'Låg nivå' }
    // Kör (öppen runda)
    const o = data.oppen_runda
    if (demo === 'normal' && o) {
      const m = o.maskin
      const mitt = o.pa_vag_hem
        ? <span style={{ color: '#8ab4ff', fontWeight: 600 }}>🏠 På väg hem{o.km_kvar != null ? <span style={{ color: C.t3, fontWeight: 400 }}> · ~{o.km_kvar} km kvar</span> : null}</span>
        : m ? (m.lage === 'lossad'
          ? <span style={{ color: C.green, fontWeight: 600 }}>✓ {m.namn} lossad</span>
          : <span style={{ color: '#fff', fontWeight: 600 }}>🚚 {m.namn} på flaket</span>)
          : <span style={{ color: C.t3, fontWeight: 600 }}>Övrig körning</span>
      return { sort: 'kor', pill: o.pa_vag_hem ? 'PÅ VÄG HEM' : 'KÖR NU', mitt, stort: o.live_km != null ? `${o.live_km} km` : '—', under: `${o.starttid ? `Avfärd ${fmtKlocka(o.starttid)} · ` : ''}senast sedd ${fmtAlder(data.position?.alder_min ?? null)}` }
    }
    // Parkerad
    if (data.parkerad) return { sort: 'park', plats: data.parkerad.plats, sedan: data.parkerad.sedan }
  }
  return { sort: 'neutral', rubrik: data?.namn ? `Scania ${data.namn}` : 'Lastbilen', under: `Senast sedd ${fmtAlder(data?.position?.alder_min ?? null)}` }
}

type Kontext = { niva: 'orange' | 'bla'; ikon: 'diesel' | 'service'; rubrik: string; under: string; demo?: boolean }
function harledKontext(data: Data | null, demo: Demo, _forbr: ManadF[] | null): Kontext[] {
  if (demo === 'tanka') return [{ niva: 'orange', ikon: 'diesel', rubrik: 'Tanka snart', under: '16 % · ~150 km kvar', demo: true }]
  if (demo === 'service') return [{ niva: 'bla', ikon: 'service', rubrik: 'Service närmar sig', under: 'Om 420 km · boka verkstad', demo: true }]
  if (demo !== 'normal' || !data?.harData) return []
  const ut: Kontext[] = []
  const d = data.tank?.diesel_pct, r = data.tank?.rackvidd_km, a = data.tank?.adblue_pct
  // Orange-nivå (röd ligger i hero:n)
  if (d != null && d >= 15 && d < 25) ut.push({ niva: 'orange', ikon: 'diesel', rubrik: 'Tanka snart', under: r != null ? `Diesel ${Math.round(d)} % · räckvidd ${r} km` : `Diesel ${Math.round(d)} %` })
  else if (r != null && r < 150) ut.push({ niva: 'orange', ikon: 'diesel', rubrik: 'Tanka snart', under: `Räckvidd ${r} km` })
  if (a != null && a < 20) ut.push({ niva: 'orange', ikon: 'diesel', rubrik: `AdBlue ${Math.round(a)} %`, under: 'Fyll på snart' })
  if (data.halsa?.service_km != null && data.halsa.service_km < 1500) ut.push({ niva: 'bla', ikon: 'service', rubrik: 'Service närmar sig', under: `Om ${data.halsa.service_km.toLocaleString('sv-SE')} km` })
  return ut
}

/* ══════════ Hero ══════════ */
function Hero({ lage, demo }: { lage: HeroLage; demo: boolean }) {
  if (lage.sort === 'avvik') return (
    <FloatKort kant={C.red} bak="rgba(255,69,58,0.14)" punkt={C.red} puls demo={demo}>
      <h1 style={{ ...heroH, color: '#fff' }}>{lage.rubrik}</h1><div style={heroSub}>{lage.under}</div>
    </FloatKort>
  )
  if (lage.sort === 'kor') return (
    <FloatKort kant="rgba(59,130,246,0.4)" bak="rgba(59,130,246,0.13)" punkt={C.blue} puls demo={demo}>
      <div style={livePill}><span style={{ width: 7, height: 7, borderRadius: '50%', background: C.blue }} />{lage.pill}</div>
      <div style={{ fontSize: 13, margin: '3px 0 5px' }}>{lage.mitt}</div>
      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: '#fff' }}>{lage.stort}</div>
      <div style={heroSub}>{lage.under}</div>
    </FloatKort>
  )
  if (lage.sort === 'park') return (
    <FloatKort kant="rgba(34,197,94,0.32)" bak="rgba(34,197,94,0.1)" punkt={C.green} demo={demo}>
      <h1 style={heroH}>Parkerad på {lage.plats}</h1>
      <div style={heroSub}>{lage.sedan ? `${fmtSedan(lage.sedan)} · ` : ''}allt friskt</div>
    </FloatKort>
  )
  return (
    <FloatKort punkt={C.t3} demo={demo}>
      <h1 style={{ ...heroH, fontSize: 19 }}>{lage.rubrik}</h1><div style={heroSub}>{lage.under}</div>
    </FloatKort>
  )
}
function FloatKort({ children, kant, bak, punkt, puls, demo }: { children: React.ReactNode; kant?: string; bak?: string; punkt?: string; puls?: boolean; demo?: boolean }) {
  return (
    <div style={{
      background: bak ? `linear-gradient(180deg, ${bak}, rgba(0,0,0,0) 78%), ${C.glas}` : C.glas,
      border: `1px solid ${kant || C.glasKant}`, borderRadius: 18, padding: '14px 15px',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative',
    }}>
      {punkt && (
        <span style={{ position: 'relative', width: 12, height: 12, borderRadius: '50%', background: punkt, flex: 'none', marginTop: 5 }}>
          {puls && <span className="lbny-puls" style={{ position: 'absolute', inset: -5, borderRadius: '50%', border: `2px solid ${punkt}` }} />}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {demo && <span style={demoBadge}>DEMO</span>}
      <style>{`.lbny-puls{animation:lbnyp 1.9s ease-out infinite}@keyframes lbnyp{0%{transform:scale(.6);opacity:.85}100%{transform:scale(2);opacity:0}}@media(prefers-reduced-motion:reduce){.lbny-puls{animation:none}}`}</style>
    </div>
  )
}

/* ══════════ Fakturerbart-pill (fast) ══════════ */
function FakturerbartPill({ fakt, etikett, laddar }: { fakt: { km: number; antalFakt: number; antal: number; totalKm: number }; etikett: string; laddar: boolean }) {
  const inga = fakt.antalFakt === 0
  return (
    <div style={{ background: C.glas, border: `1px solid ${inga ? 'rgba(255,159,10,0.3)' : 'rgba(34,197,94,0.3)'}`, borderRadius: 16, padding: '12px 15px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.02em', color: C.t3 }}>Fakturerbart · {etikett}</div>
      <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
        {laddar ? '…' : `${fakt.km.toLocaleString('sv-SE')} km`}
      </div>
      {!laddar && (
        <div style={{ fontSize: 12, marginTop: 3, color: inga && fakt.antal > 0 ? C.orange : C.t3, fontVariantNumeric: 'tabular-nums' }}>
          {inga && fakt.antal > 0 ? `Inga fakturerbara ännu · ${fakt.antal} flyttar · ${fakt.totalKm} km`
            : fakt.antal === 0 ? 'Inga flyttar i perioden'
            : `${fakt.antalFakt} fakturerbara · ${fakt.antal} flyttar totalt`}
        </div>
      )}
    </div>
  )
}

/* ══════════ Kontextkort ══════════ */
function KontextKort({ k }: { k: Kontext }) {
  const farg = k.niva === 'orange' ? C.orange : '#8ab4ff'
  return (
    <div style={{ background: C.glas, border: `1px solid ${k.niva === 'orange' ? 'rgba(255,159,10,0.32)' : 'rgba(59,130,246,0.32)'}`, borderRadius: 15, padding: '11px 14px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
      <span style={{ width: 32, height: 32, borderRadius: 10, background: k.niva === 'orange' ? 'rgba(255,159,10,0.16)' : 'rgba(59,130,246,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        {k.ikon === 'diesel'
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={farg} strokeWidth="2"><path d="M3 22h12V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M15 9h3l3 3v7a2 2 0 0 1-2 2h-1" /></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={farg} strokeWidth="2"><path d="M14 7l-1.5-1.5a2 2 0 0 0-3 0L3 12l4 4 6.5-6.5a2 2 0 0 0 0-3z" /><path d="M14 7l5 5" /></svg>}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: farg }}>{k.rubrik}</div>
        <div style={{ fontSize: 12, color: C.t3, marginTop: 1 }}>{k.under}</div>
      </div>
      {k.demo && <span style={demoBadge}>DEMO</span>}
    </div>
  )
}

/* ══════════ Tidslinje ══════════ */
function Tidslinje({ periodTyp, setPeriodTyp, offset, setOffset, etikett, period, events, laddar, vald, onValj, sparLaddar }: {
  periodTyp: PeriodTyp; setPeriodTyp: (t: PeriodTyp) => void; offset: number; setOffset: (n: number) => void
  etikett: string; period: { start: Date; slut: Date }; events: any[]; laddar: boolean
  vald: string | null; onValj: (id: string) => void; sparLaddar: boolean
}) {
  const axisRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
  const span = period.slut.getTime() - period.start.getTime()
  const posOf = (iso: string) => Math.max(0.02, Math.min(0.97, (new Date(iso).getTime() - period.start.getTime()) / span))

  function nearest(rel: number): any | null {
    let best: any = null, bd = 9
    for (const e of events) { const c = posOf(e.dag.starttid); const dd = Math.abs(c - rel); if (dd < bd) { bd = dd; best = e } }
    return best
  }
  function onMove(clientX: number) {
    const el = axisRef.current; if (!el) return
    const r = el.getBoundingClientRect()
    const rel = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    const e = nearest(rel); if (e && e.dag.id !== vald) onValj(e.dag.id)
  }

  return (
    <div style={{ position: 'absolute', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom) + 12px)', zIndex: 7, background: C.glas, border: `1px solid ${C.glasKant}`, borderRadius: 20, padding: '11px 13px 13px', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
      {/* Period-chips */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {PERIODER.map(p => (
          <button key={p.typ} onClick={() => setPeriodTyp(p.typ)} style={{
            flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: 700, padding: '5px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: ff,
            color: periodTyp === p.typ ? '#fff' : C.t4, background: periodTyp === p.typ ? 'rgba(255,255,255,0.11)' : 'transparent',
          }}>{p.kort}</button>
        ))}
      </div>
      {/* Period-navigering */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => setOffset(offset - 1)} style={pilKnapp(false)} aria-label="Föregående">‹</button>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.t2 }}>{etikett}</span>
        <button onClick={() => setOffset(offset + 1)} disabled={offset >= 0} style={pilKnapp(offset >= 0)} aria-label="Nästa">›</button>
      </div>
      {/* Axel */}
      <div ref={axisRef} onPointerDown={e => { setDrag(true); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onMove(e.clientX) }}
        onPointerMove={e => { if (drag) onMove(e.clientX) }} onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)}
        style={{ position: 'relative', height: 34, cursor: drag ? 'grabbing' : 'grab', touchAction: 'none' }}>
        <div style={{ position: 'absolute', top: 15, left: 0, right: 0, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)' }} />
        {laddar ? <div style={{ position: 'absolute', top: 10, left: 0, fontSize: 11, color: C.t4 }}>Läser rundor …</div>
          : events.length === 0 ? <div style={{ position: 'absolute', top: 9, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: C.t4 }}>Inga rundor i perioden</div>
          : events.map(e => {
            const x = posOf(e.dag.starttid) * 100
            const sel = e.dag.id === vald
            const fl = e.typ === 'flytt'
            return (
              <button key={e.dag.id} onClick={ev => { ev.stopPropagation(); onValj(e.dag.id) }} aria-label={`Runda ${fmtDatum(e.dag.starttid)}`}
                style={{ position: 'absolute', top: 15 - (sel ? 3 : 0), left: `${x}%`, transform: 'translateX(-50%)', width: sel ? 15 : 11, height: sel ? 11 : 5, borderRadius: sel ? '50%' : 3, border: 'none', padding: 0, cursor: 'pointer',
                  background: e.typ === 'pagar' ? C.green : fl ? C.blue : 'rgba(150,160,168,0.55)', boxShadow: sel ? '0 0 0 3px rgba(255,255,255,0.14)' : 'none' }} />
            )
          })}
        {/* Etiketter start/slut */}
        <div style={{ position: 'absolute', bottom: -4, left: 0, fontSize: 9.5, color: C.t4 }}>{new Date(period.start).getDate()}/{new Date(period.start).getMonth() + 1}</div>
        <div style={{ position: 'absolute', bottom: -4, right: 0, fontSize: 9.5, color: C.t4 }}>{new Date(period.slut.getTime() - 86400000).getDate()}/{new Date(period.slut.getTime() - 86400000).getMonth() + 1}</div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 10.5, color: C.t4, marginTop: 9 }}>
        {sparLaddar ? 'Hämtar och matchar spår …' : 'Dra på axeln → kartan visar spåret · tryck en runda → ben-vyn'}
      </div>
    </div>
  )
}

/* ══════════ Ben-kort ══════════ */
function BenKort({ event, namnForMaskin, namnForAnde, onStang, sparLaddar }: {
  event: any; namnForMaskin: (id: string | null, e: string | null) => string
  namnForAnde: (o: string | null, p: string | null) => string | null; onStang: () => void; sparLaddar: boolean
}) {
  const d: DagRad = event.dag
  const flyttar: FlyttRad[] = event.flyttar
  const kmTot = d.matare_km ?? d.total_km
  return (
    <div style={{ position: 'absolute', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom) + 176px)', zIndex: 9, background: 'rgba(16,17,19,0.96)', border: `1px solid ${C.glasKant}`, borderRadius: 20, padding: '15px 16px 16px', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', boxShadow: '0 -12px 40px rgba(0,0,0,0.5)', maxHeight: '42vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtDatum(d.starttid)}{d.starttid ? ` · ${fmtKlocka(d.starttid)}` : ''}</div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 1 }}>{event.typ === 'flytt' ? `${flyttar.length} ${flyttar.length === 1 ? 'flytt' : 'flyttar'}` : 'Övrig körning'}{d.forare ? ` · ${d.forare}` : ''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{kmTot != null ? `${kmTot.toLocaleString('sv-SE')} km` : '—'}</div>
            {d.bransle_l != null && <div style={{ fontSize: 11, color: C.t3 }}>{d.bransle_l.toLocaleString('sv-SE')} l</div>}
          </div>
          <button onClick={onStang} style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }} aria-label="Stäng">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {d.tillkorning_km != null && d.tillkorning_km > 0 && <Leg farg={C.t3} txt="Hemifrån till första maskin" km={`${d.tillkorning_km} km`} />}
        {flyttar.map(f => (
          <div key={f.id}>
            <Leg farg={C.blue} txt={`${namnForAnde(f.fran_objekt_id, f.fran_plats_id) || 'Hämtställe'} → ${namnForAnde(f.till_objekt_id, f.till_plats_id) || 'Lämnställe'}`}
              km={f.flytt_km != null ? `${f.flytt_km} km` : '—'} fet />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '1px 0 4px 19px', fontSize: 11, color: C.t3 }}>
              <span>{namnForMaskin(f.maskin_id, f.extern_maskin)} · {TYP_ETIKETT[f.flytt_typ || 'produktion']}{f.kund ? ` · ${f.kund}` : ''}</span>
              {f.tid_flytt_min != null && <span>· {fmtTid(f.tid_flytt_min)}</span>}
              {f.fakturerbar
                ? <span style={{ color: C.green, fontWeight: 700 }}>· Fakturerbar</span>
                : <span style={{ color: C.t4 }}>· Ej fakt.</span>}
            </div>
          </div>
        ))}
        {d.hem_km != null && d.hem_km > 0 && <Leg farg={C.green} txt={`Hemresa${d.hemresa_matt ? '' : ' (~beräknad)'}`} km={`${d.hemresa_matt ? '' : '~'}${d.hem_km} km`} />}
        {event.typ !== 'flytt' && (d.tillkorning_km == null && d.hem_km == null) && (
          <div style={{ fontSize: 12.5, color: C.t3 }}>{sparLaddar ? 'Hämtar spår …' : 'Spåret ritas på kartan.'}</div>
        )}
      </div>
    </div>
  )
}
function Leg({ farg, txt, km, fet }: { farg: string; txt: string; km: string; fet?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: farg, flex: 'none' }} />
      <span style={{ flex: 1, fontSize: 13, color: fet ? C.t1 : C.t2, fontWeight: fet ? 600 : 400, minWidth: 0 }}>{txt}</span>
      <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{km}</span>
    </div>
  )
}

/* ══════════ Bilen-pill + ark ══════════ */
function BilenPill({ tank, halsa, onClick }: { tank: Data['tank']; halsa: Data['halsa']; onClick: () => void }) {
  const d = tank?.diesel_pct
  const lampor = halsa?.lampor ?? []
  const halsaFarg = lampor.length ? C.red : C.green
  const lag = (d != null && d < 25)
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 13px', borderRadius: 19, background: C.glas, border: `1px solid ${C.glasKant}`, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', cursor: 'pointer', color: C.t1, fontFamily: ff }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={lag ? C.orange : C.t2} strokeWidth="2"><path d="M3 22h12V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M15 9h3l3 3v7a2 2 0 0 1-2 2h-1" /></svg>
      <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: lag ? C.orange : C.t1 }}>{d != null ? `${Math.round(d)} %` : '—'}</span>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: halsaFarg }} />
    </button>
  )
}
function BilenInnehall({ tank, halsa, forbr, ix, setIx }: { tank: Data['tank']; halsa: Data['halsa']; forbr: ManadF[] | null; ix: number; setIx: (n: number) => void }) {
  const lampor = halsa?.lampor ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Tank */}
      <div style={arkKort}>
        <div style={arkRubrik}>Kan jag köra?</div>
        <BRad namn="Diesel" v={tank?.diesel_pct} enhet=" %" lag={tank?.diesel_pct != null && tank.diesel_pct < 25} />
        <BRad namn="AdBlue" v={tank?.adblue_pct} enhet=" %" lag={tank?.adblue_pct != null && tank.adblue_pct < 20} />
        <BRad namn="Räckvidd" v={tank?.rackvidd_km} enhet=" km" lag={tank?.rackvidd_km != null && tank.rackvidd_km < 150} sista />
      </div>
      {/* Hälsa */}
      <div style={arkKort}>
        <div style={arkRubrik}>Mår den bra?</div>
        {!halsa?.har_lampor ? <div style={{ fontSize: 14, color: C.t3 }}>Varningslampor saknas i datan</div>
          : lampor.length === 0 ? <div style={{ fontSize: 15, fontWeight: 600, color: C.green }}>Inga varningar</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{lampor.map(l => <div key={l.kod} style={{ fontSize: 14, fontWeight: 600, color: l.state === 'RED' ? C.red : C.orange }}>{l.namn}</div>)}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.t2, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <span>Service om</span><span style={{ color: C.t1, fontWeight: 600 }}>{halsa?.service_km != null ? `${halsa.service_km.toLocaleString('sv-SE')} km` : '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.t3, marginTop: 6 }}>
          <span>Mätare {halsa?.matare_km != null ? `${halsa.matare_km.toLocaleString('sv-SE')} km` : '—'}</span>
          <span>Motortimmar {halsa?.motortimmar != null ? `${halsa.motortimmar.toLocaleString('sv-SE')} h` : '—'}</span>
        </div>
      </div>
      {/* Förbrukning */}
      <VadDrarDen forbr={forbr} ix={ix} setIx={setIx} />
    </div>
  )
}
function BRad({ namn, v, enhet, lag, sista }: { namn: string; v: number | null | undefined; enhet: string; lag?: boolean; sista?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: sista ? 'none' : `1px solid ${C.border}` }}>
      <span style={{ fontSize: 14, color: C.t2 }}>{namn}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: v == null ? C.t3 : lag ? C.orange : C.t1, fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : `${Math.round(v)}${enhet}`}</span>
    </div>
  )
}
function VadDrarDen({ forbr, ix, setIx }: { forbr: ManadF[] | null; ix: number; setIx: (n: number) => void }) {
  if (forbr == null) return <div style={{ ...arkKort, color: C.t3, fontSize: 13 }}>Läser förbrukning …</div>
  if (forbr.length === 0) return null
  const i = Math.min(Math.max(ix, 0), forbr.length - 1)
  const m = forbr[i]
  const trend = forbr.slice(0, 4).reverse()
  const maxLpm = Math.max(0.1, ...trend.map(t => t.l_per_mil ?? 0))
  return (
    <div style={arkKort}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={arkRubrik}>Vad drar den?</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 13, fontWeight: 700, color: C.t2 }}>
          <button aria-label="Äldre" disabled={i >= forbr.length - 1} onClick={() => setIx(i + 1)} style={pilKnapp(i >= forbr.length - 1)}>‹</button>
          {manadNamn(m.manad)}
          <button aria-label="Nyare" disabled={i <= 0} onClick={() => setIx(i - 1)} style={pilKnapp(i <= 0)}>›</button>
        </span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.t3 }}>Diesel · snitt</div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{m.l_per_mil != null ? `${m.l_per_mil.toLocaleString('sv-SE')} l/mil` : '—'}</div>
      <div style={{ fontSize: 13, color: C.t3, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{m.mil.toLocaleString('sv-SE')} mil · {m.diesel_l.toLocaleString('sv-SE')} l diesel</div>
      <div style={{ display: 'flex', gap: 10, padding: '9px 2px', borderTop: `1px solid ${C.border}`, color: C.t3, fontSize: 13, marginTop: 8 }}><span style={{ flex: 1 }}>Flyttar</span><span style={{ color: C.t2, fontVariantNumeric: 'tabular-nums' }}>{m.flytt.mil.toLocaleString('sv-SE')} mil · {m.flytt.diesel_l} l{m.flytt.l_per_mil != null ? ` · ${m.flytt.l_per_mil.toLocaleString('sv-SE')} l/mil` : ''}</span></div>
      <div style={{ display: 'flex', gap: 10, padding: '9px 2px', borderTop: `1px solid ${C.border}`, color: C.t3, fontSize: 13 }}><span style={{ flex: 1 }}>Övrig körning</span><span style={{ color: C.t2, fontVariantNumeric: 'tabular-nums' }}>{m.ovrig.mil.toLocaleString('sv-SE')} mil · {m.ovrig.diesel_l} l{m.ovrig.l_per_mil != null ? ` · ${m.ovrig.l_per_mil.toLocaleString('sv-SE')} l/mil` : ''}</span></div>
      {/* Trend */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.t3, margin: '14px 0 4px' }}>l/mil — trend bakåt</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 84, padding: '6px 4px 0' }}>
        {trend.map(t => {
          const vald = t.manad === m.manad
          const h = t.l_per_mil != null ? Math.max(6, Math.round((t.l_per_mil / maxLpm) * 60)) : 0
          return (
            <div key={t.manad} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, height: 14, fontVariantNumeric: 'tabular-nums' }}>{t.l_per_mil != null ? t.l_per_mil.toLocaleString('sv-SE') : '—'}</div>
              {t.l_per_mil != null ? <div style={{ width: '64%', height: h, borderRadius: '6px 6px 0 0', background: vald ? C.blue : 'rgba(59,130,246,0.45)' }} />
                : <div style={{ width: '64%', height: 8, borderRadius: 4, border: `1px dashed ${C.border}` }} />}
              <div style={{ fontSize: 11, color: vald ? C.t1 : C.t3, marginTop: 7 }}>{MANAD[Number(t.manad.split('-')[1]) - 1]}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════ Mer-ark ══════════ */
function MerInnehall({ demo, setDemo, forareLista, forareFilter, setForareFilter, onCsvFlyttar, onCsvDagar, periodEtikett, harFlyttar }: {
  demo: Demo; setDemo: (d: Demo) => void; forareLista: string[]; forareFilter: string; setForareFilter: (s: string) => void
  onCsvFlyttar: () => void; onCsvDagar: () => void; periodEtikett: string; harFlyttar: boolean
}) {
  const demoVal: { v: Demo; t: string }[] = [{ v: 'normal', t: 'Normal' }, { v: 'kor', t: 'Kör' }, { v: 'tanka', t: 'Låg tank' }, { v: 'service', t: 'Service' }]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Demo */}
      <div>
        <div style={arkRubrik}>Demo-lägen <span style={{ color: C.t4, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· förhandsvisar lägen mot testdata</span></div>
        <div style={{ display: 'flex', gap: 6, background: 'rgba(118,118,128,0.24)', borderRadius: 10, padding: 3 }}>
          {demoVal.map(d => (
            <button key={d.v} onClick={() => setDemo(d.v)} style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: ff, color: demo === d.v ? '#fff' : C.t2, background: demo === d.v ? '#636366' : 'transparent' }}>{d.t}</button>
          ))}
        </div>
      </div>
      {/* Förarfilter */}
      {forareLista.length > 0 && (
        <div>
          <div style={arkRubrik}>Förare</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <FilterChip aktiv={forareFilter === 'alla'} onClick={() => setForareFilter('alla')}>Alla</FilterChip>
            {forareLista.map(f => <FilterChip key={f} aktiv={forareFilter === f} onClick={() => setForareFilter(f)}>{f}</FilterChip>)}
          </div>
        </div>
      )}
      {/* CSV */}
      <div>
        <div style={arkRubrik}>Exportera · {periodEtikett}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCsvFlyttar} disabled={!harFlyttar} style={{ ...merKnapp, opacity: harFlyttar ? 1 : 0.4 }}>Flyttar (CSV)</button>
          <button onClick={onCsvDagar} disabled={!harFlyttar} style={{ ...merKnapp, opacity: harFlyttar ? 1 : 0.4 }}>Dagar (CSV)</button>
        </div>
      </div>
      {/* Länk */}
      <Link href="/maskinflytt/sammanstallning" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none', color: C.blue, fontSize: 14, fontWeight: 600, padding: '4px 2px' }}>
        Detaljerad flyttlogg — alla filter
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
      </Link>
      <div style={{ fontSize: 11.5, color: C.t4, lineHeight: 1.5 }}>Förarflödet (Lassat / Lassat av / Framme) är en egen göra-yta och når du via Maskinflytt.</div>
    </div>
  )
}
function FilterChip({ aktiv, onClick, children }: { aktiv: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ fontSize: 13, fontWeight: 600, padding: '7px 13px', borderRadius: 10, border: `1px solid ${aktiv ? 'rgba(255,255,255,0.28)' : C.border}`, background: aktiv ? 'rgba(255,255,255,0.12)' : 'transparent', color: aktiv ? '#fff' : C.t2, cursor: 'pointer', fontFamily: ff }}>{children}</button>
}

/* ══════════ Ark (bottensheet) ══════════ */
function Ark({ titel, children, onStang }: { titel: string; children: React.ReactNode; onStang: () => void }) {
  return (
    <div onClick={onStang} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: '#151517', borderRadius: '18px 18px 0 0', border: `1px solid ${C.border}`, borderBottom: 'none', padding: '10px 16px calc(env(safe-area-inset-bottom) + 20px)', maxHeight: '86vh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.18)', margin: '2px auto 12px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{titel}</span>
          <button onClick={onStang} style={{ fontSize: 15, fontWeight: 600, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff }}>Klar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ── Stilar ── */
const heroH: React.CSSProperties = { margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.13 }
const heroSub: React.CSSProperties = { fontSize: 13, color: C.t3, marginTop: 5 }
const livePill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: C.blue, marginBottom: 4 }
const demoBadge: React.CSSProperties = { position: 'absolute', top: 8, right: 10, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: C.t3, background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '2px 6px' }
const rundKnapp: React.CSSProperties = { width: 38, height: 38, borderRadius: 12, background: C.glas, border: `1px solid ${C.glasKant}`, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', textDecoration: 'none', flex: 'none' }
const knappStil: React.CSSProperties = { background: C.blue, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: ff }
const arkKort: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }
const arkRubrik: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.t3, marginBottom: 10 }
const merKnapp: React.CSSProperties = { flex: 1, background: 'rgba(255,255,255,0.06)', color: C.t1, border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: ff }
function pilKnapp(disabled: boolean): React.CSSProperties {
  return { width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: 'none', color: disabled ? C.t4 : C.t2, fontSize: 16, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, fontFamily: ff, lineHeight: 1 }
}
