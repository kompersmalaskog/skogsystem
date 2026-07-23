'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { vaderIkon } from '../vader'

// ── Tema — samma palett som förarflödet ──
const C = {
  bg: '#09090b', card: '#131315', border: 'rgba(255,255,255,0.06)',
  t1: '#fafafa', t2: 'rgba(255,255,255,0.7)', t3: 'rgba(255,255,255,0.45)',
  green: '#22c55e', blue: '#3b82f6', orange: '#ff9f0a', red: '#ff453a',
}
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif"

type PeriodTyp = 'vecka' | 'manad' | 'kvartal' | 'ar'
type Flik = 'dagar' | 'flyttar'

// Två nivåer som ALDRIG blandas i samma siffra:
//  - Dagar: hela dagens körning (tillkörning + flyttar + tomkörning + hemresa)
//  - Flyttar: de fakturerbara sträckorna (per enskild flytt)
// Presentationen följer förarflödet: ETT tal i fokus per rad, detaljer bakom tryck.
interface FlyttRad {
  id: string
  maskin_id: string
  flyttdag_id: string | null
  fran_lat: number
  fran_lng: number
  fran_objekt_id: string | null
  till_objekt_id: string | null
  fran_plats_id: string | null
  till_plats_id: string | null
  extern_maskin: string | null
  flytt_typ: string | null
  kund: string | null
  till_lat: number | null
  till_lng: number | null
  flytt_km: number | null
  mellankorning_km: number | null
  total_km: number | null            // bara gamla rader (före dagmodellen)
  fakturerbar: boolean | null
  tid_till_maskin_min: number | null
  tid_flytt_min: number | null
  vader_temp_c: number | null
  vader_kod: number | null
  starttid: string
  sluttid: string | null
  avbruten: boolean
  forare: string | null
}

interface DagRad {
  id: string
  forare: string | null
  starttid: string
  sluttid: string | null
  tillkorning_km: number | null
  hem_km: number | null
  tid_hem_min: number | null
  total_km: number | null
  total_tid_min: number | null
  status: string
}

const TYP_ETIKETT: Record<string, string> = {
  produktion: 'Produktion', service: 'Service', kunduppdrag: 'Kunduppdrag', annat: 'Annat',
}

/** Kompakt tid för rader/summering: "52 min", "1 h", "1 h 12 min". */
function fmtTid(min: number | null): string {
  if (min == null) return '—'
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r === 0 ? `${h} h` : `${h} h ${r} min`
}

/** ISO-vecka (måndag som veckostart). */
function isoVecka(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dag = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dag)
  const arsstart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil((((t.getTime() - arsstart.getTime()) / 86400000) + 1) / 7)
}

/** [start, slut) för vald period; offset 0 = innevarande, -1 = förra osv. */
function periodIntervall(typ: PeriodTyp, offset: number): { start: Date; slut: Date; etikett: string } {
  const nu = new Date()
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

const PERIOD_KNAPPAR: { typ: PeriodTyp; kort: string }[] = [
  { typ: 'vecka', kort: 'Vecka' },
  { typ: 'manad', kort: 'Månad' },
  { typ: 'kvartal', kort: 'Kvartal' },
  { typ: 'ar', kort: 'År' },
]

function laddaNerCsv(rader: (string | number)[][], filnamn: string) {
  // BOM + semikolon så svensk Excel öppnar rätt direkt
  const csv = '﻿' + rader.map(r => r.join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filnamn
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function SammanstallningClient() {
  const [flik, setFlik] = useState<Flik>('dagar')
  const [periodTyp, setPeriodTyp] = useState<PeriodTyp>('manad')
  const [offset, setOffset] = useState(0)
  const [flyttar, setFlyttar] = useState<FlyttRad[] | null>(null)
  const [dagar, setDagar] = useState<DagRad[] | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [maskinNamn, setMaskinNamn] = useState<Map<string, string>>(new Map())
  const [objektNamn, setObjektNamn] = useState<Map<string, string>>(new Map())
  const [platsNamn, setPlatsNamn] = useState<Map<string, string>>(new Map())
  const [typFilter, setTypFilter] = useState('alla')
  const [maskinFilter, setMaskinFilter] = useState('alla')
  const [forareFilter, setForareFilter] = useState('alla')
  const [oppnaDagar, setOppnaDagar] = useState<Set<string>>(new Set())
  const [oppnaFlyttar, setOppnaFlyttar] = useState<Set<string>>(new Set())

  const period = useMemo(() => periodIntervall(periodTyp, offset), [periodTyp, offset])

  useEffect(() => {
    let avbruten = false
    ;(async () => {
      setFlyttar(null); setDagar(null); setFel(null)
      setOppnaDagar(new Set()); setOppnaFlyttar(new Set())
      const [fRes, dRes] = await Promise.all([
        supabase.from('maskin_flytt')
          .select('id, maskin_id, extern_maskin, flytt_typ, kund, flyttdag_id, fran_lat, fran_lng, fran_objekt_id, till_objekt_id, fran_plats_id, till_plats_id, till_lat, till_lng, flytt_km, mellankorning_km, total_km, fakturerbar, tid_till_maskin_min, tid_flytt_min, vader_temp_c, vader_kod, starttid, sluttid, avbruten, forare')
          .gte('starttid', period.start.toISOString())
          .lt('starttid', period.slut.toISOString())
          .order('starttid', { ascending: false }),
        supabase.from('flyttdag')
          .select('id, forare, starttid, sluttid, tillkorning_km, hem_km, tid_hem_min, total_km, total_tid_min, status')
          .gte('starttid', period.start.toISOString())
          .lt('starttid', period.slut.toISOString())
          .order('starttid', { ascending: false }),
      ])
      if (avbruten) return
      if (fRes.error) { setFel(`Kunde inte läsa flyttar: ${fRes.error.message}`); return }
      if (dRes.error) { setFel(`Kunde inte läsa flyttdagar: ${dRes.error.message}`); return }
      setFlyttar(fRes.data || [])
      setDagar(dRes.data || [])

      const objektIds = Array.from(new Set(
        (fRes.data || []).flatMap(f => [f.till_objekt_id, f.fran_objekt_id]).filter(Boolean))) as string[]
      if (objektIds.length) {
        const { data: obj } = await supabase.from('objekt').select('id, namn').in('id', objektIds)
        if (!avbruten && obj) setObjektNamn(new Map(obj.map(o => [o.id, o.namn])))
      }
      const platsIds = Array.from(new Set(
        (fRes.data || []).flatMap(f => [f.till_plats_id, f.fran_plats_id]).filter(Boolean))) as string[]
      if (platsIds.length) {
        const { data: pl } = await supabase.from('flyttplats').select('id, namn').in('id', platsIds)
        if (!avbruten && pl) setPlatsNamn(new Map(pl.map(x => [x.id, x.namn])))
      }
    })()
    return () => { avbruten = true }
  }, [period.start.getTime(), period.slut.getTime()])

  useEffect(() => {
    supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell').then(({ data }) => {
      if (data) setMaskinNamn(new Map(data.map(m => [m.maskin_id, m.visningsnamn || m.modell || m.maskin_id])))
    })
  }, [])

  const forare = useMemo(() =>
    Array.from(new Set([
      ...(flyttar || []).map(f => f.forare),
      ...(dagar || []).map(d => d.forare),
    ].filter(Boolean))) as string[], [flyttar, dagar])
  const maskiner = useMemo(() =>
    Array.from(new Set((flyttar || []).map(f => f.maskin_id).filter(Boolean))) as string[], [flyttar])

  const namnForMaskin = (id: string | null, extern: string | null) =>
    id ? (maskinNamn.get(id) || id) : (extern || '—')
  const namnForAnde = (objektId: string | null, platsId: string | null) =>
    (objektId && objektNamn.get(objektId)) || (platsId && platsNamn.get(platsId)) || null

  // Slutförda flyttar per dag (avbrutna/pågående räknas aldrig som "en flytt")
  const flyttPerDag = useMemo(() => {
    const m = new Map<string, FlyttRad[]>()
    for (const f of flyttar || []) {
      if (!f.flyttdag_id || f.avbruten || !f.sluttid) continue
      const arr = m.get(f.flyttdag_id) || []
      arr.push(f)
      m.set(f.flyttdag_id, arr)
    }
    // Kronologisk ordning inom dagen (queryn är fallande)
    Array.from(m.values()).forEach((arr: FlyttRad[]) => arr.sort((a, b) => a.starttid.localeCompare(b.starttid)))
    return m
  }, [flyttar])

  // ── Dag-nivån (maskinfiltret gäller inte dagar — en dag kan röra flera maskiner) ──
  // En dag = en flyttdag-rad. Två förare samma datum = två rader; förarnamnet
  // i sekundärraden är det som skiljer dem, så det visas alltid.
  const dagRader = useMemo(() => (dagar || []).filter(d =>
    (forareFilter === 'alla' || d.forare === forareFilter) &&
    (flyttPerDag.get(d.id)?.length || 0) >= 1  // dagar med 0 flyttar är inte kördagar
  ), [dagar, forareFilter, flyttPerDag])
  const kordagar = useMemo(() =>
    dagRader.filter(d => d.status !== 'pagaende' && d.sluttid != null), [dagRader])

  // Fakturerbart = Σ flytt_km för ALLA fakturerbara flyttar (kunduppdrag ingår,
  // fakturerbara oavsett sträcka) — allt vi kan ta betalt för.
  const fakturerbartKm = useMemo(() => (flyttar || [])
    .filter(f => f.fakturerbar && !f.avbruten && f.sluttid &&
      (forareFilter === 'alla' || f.forare === forareFilter))
    .reduce((s, f) => s + (f.flytt_km ?? 0), 0), [flyttar, forareFilter])

  const dagSumma = useMemo(() => ({
    km: kordagar.reduce((s, d) => s + (d.total_km ?? 0), 0),
    dagar: kordagar.length,
    flyttar: kordagar.reduce((s, d) => s + (flyttPerDag.get(d.id)?.length || 0), 0),
    tidMatt: kordagar.reduce((s, d) => s + (d.total_tid_min ?? 0), 0),
    utanTid: kordagar.filter(d => d.total_tid_min == null).length,
  }), [kordagar, flyttPerDag])

  // ── Flyttar-nivån ──
  const filtreradeFlyttar = useMemo(() => (flyttar || []).filter(f =>
    (maskinFilter === 'alla' || f.maskin_id === maskinFilter) &&
    (forareFilter === 'alla' || f.forare === forareFilter) &&
    (typFilter === 'alla' || (f.flytt_typ || 'produktion') === typFilter)
  ), [flyttar, maskinFilter, forareFilter, typFilter])
  const slutforda = useMemo(() => filtreradeFlyttar.filter(f => !f.avbruten && f.sluttid != null), [filtreradeFlyttar])
  const flyttSumma = useMemo(() => ({
    antal: slutforda.length,
    flyttKm: slutforda.reduce((s, f) => s + (f.flytt_km ?? 0), 0),
    tidMatt: slutforda.reduce((s, f) => s + (f.tid_flytt_min ?? 0), 0),
    utanTid: slutforda.filter(f => f.tid_flytt_min == null).length,
    fakturerbara: slutforda.filter(f => f.fakturerbar).length,
    fakturerbarKm: slutforda.filter(f => f.fakturerbar).reduce((s, f) => s + (f.flytt_km ?? 0), 0),
    perTyp: (['produktion', 'service', 'kunduppdrag', 'annat'] as const).map(t => ({
      typ: t,
      antal: slutforda.filter(f => (f.flytt_typ || 'produktion') === t).length,
      km: slutforda.filter(f => (f.flytt_typ || 'produktion') === t).reduce((s, f) => s + (f.flytt_km ?? 0), 0),
    })).filter(r => r.antal > 0),
  }), [slutforda])

  function toggle(set: Set<string>, uppdatera: (s: Set<string>) => void, id: string) {
    const ny = new Set(set)
    ny.has(id) ? ny.delete(id) : ny.add(id)
    uppdatera(ny)
  }

  /** Dagens ben som EN sekundär rad. Nollben och saknade ben utelämnas —
   *  "~0 km" skrivs aldrig ut. ~ markerar den beräknade hemresan. Tiden ligger
   *  på själva radhuvudet, så den upprepas inte här. */
  function benRad(d: DagRad): string | null {
    const delar: string[] = []
    if (d.tillkorning_km != null && d.tillkorning_km > 0) delar.push(`Tillkörning ${d.tillkorning_km} km`)
    if (d.hem_km != null && d.hem_km > 0) delar.push(`Hemresa ~${d.hem_km} km`)
    return delar.length ? delar.join(' · ') : null
  }

  function exportFlyttCsv() {
    const rubrik = ['Datum', 'Maskin', 'Typ', 'Kund', 'Förare', 'Från', 'Till', 'Mellankörning km', 'Flytt km', 'Flyttid min (mätt)', 'Fakturerbar']
    const rader = slutforda.map(f => [
      new Date(f.starttid).toLocaleDateString('sv-SE'),
      f.maskin_id ? (maskinNamn.get(f.maskin_id) || f.maskin_id) : ((f.extern_maskin || '') + ' (extern)'),
      TYP_ETIKETT[f.flytt_typ || 'produktion'],
      f.kund || '',
      f.forare || '',
      namnForAnde(f.fran_objekt_id, f.fran_plats_id) || '',
      namnForAnde(f.till_objekt_id, f.till_plats_id) || '',
      f.mellankorning_km ?? '',
      f.flytt_km ?? '',
      f.tid_flytt_min != null ? Math.round(f.tid_flytt_min) : '',
      f.fakturerbar ? 'JA' : 'NEJ',
    ])
    laddaNerCsv([rubrik, ...rader], `flyttar-${period.etikett.replace(/[ .]/g, '-')}.csv`)
  }

  function exportDagCsv() {
    const rubrik = ['Datum', 'Förare', 'Flyttar', 'Tillkörning km', 'Hemresa km (beräknad)', 'Total km', 'Tid min (mätt, exkl. hemresa)', 'Status']
    const rader = kordagar.map(d => [
      new Date(d.starttid).toLocaleDateString('sv-SE'),
      d.forare || '',
      flyttPerDag.get(d.id)?.length || 0,
      d.tillkorning_km ?? '',
      d.hem_km ?? '',
      d.total_km ?? '',
      d.total_tid_min != null ? Math.round(d.total_tid_min) : '',
      d.status === 'auto_avslutad' ? 'Auto-avslutad' : 'Avslutad',
    ])
    laddaNerCsv([rubrik, ...rader], `flyttdagar-${period.etikett.replace(/[ .]/g, '-')}.csv`)
  }

  const laddar = flyttar === null || dagar === null

  // ── Deltal-komponenter ──
  const fakturerbarBadge = (km: number) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
      fontSize: 13, fontWeight: 800, color: C.green, background: 'rgba(34,197,94,0.14)',
      borderRadius: 10, padding: '6px 12px',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>payments</span>
      {km} km fakturerbart
    </span>
  )

  const tomLage = (text: string) => (
    <div style={{ textAlign: 'center', padding: '48px 16px', color: C.t3 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.6 }}>local_shipping</span>
      <div style={{ fontSize: 15, marginTop: 10 }}>{text}</div>
    </div>
  )

  const fakturerbarChip = (typ: string | null) => (
    <span style={{
      fontSize: 11, fontWeight: 800, color: C.green, background: 'rgba(34,197,94,0.15)',
      borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap',
    }}>{typ === 'kunduppdrag' ? 'Fakturerbar · kund' : 'Fakturerbar'}</span>
  )

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: ff, WebkitFontSmoothing: 'antialiased', color: C.t1 }}>
      <style>{`
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .flytt-select { background: ${C.card}; color: ${C.t1}; border: 1px solid ${C.border}; border-radius: 10px; padding: 8px 10px; font-size: 13px; font-family: ${ff}; }
      `}</style>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '12px 16px calc(48px + env(safe-area-inset-bottom))' }}>

        {/* Periodväljare */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {PERIOD_KNAPPAR.map(p => (
            <button key={p.typ} onClick={() => { setPeriodTyp(p.typ); setOffset(0) }} style={{
              flex: 1, background: periodTyp === p.typ ? C.blue : C.card,
              color: periodTyp === p.typ ? '#fff' : C.t2,
              border: `1px solid ${periodTyp === p.typ ? C.blue : C.border}`,
              borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: ff,
            }}>{p.kort}</button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={() => setOffset(o => o - 1)} aria-label="Föregående period" style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.t2,
            padding: '6px 10px', cursor: 'pointer', display: 'flex',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span>
          </button>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{period.etikett}</div>
          <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0} aria-label="Nästa period" style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.t2,
            padding: '6px 10px', cursor: 'pointer', display: 'flex', opacity: offset >= 0 ? 0.35 : 1,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>
          </button>
        </div>

        {fel && (
          <div style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.4)', borderRadius: 12, padding: 14, fontSize: 14 }}>{fel}</div>
        )}
        {laddar && !fel && (
          <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Laddar …</div>
        )}

        {/* ══ DAGAR ══ */}
        {flik === 'dagar' && !laddar && !fel && (
          <>
            {/* Summering: ett stort tal — periodens totala km */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 18px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: C.t3, fontWeight: 700, letterSpacing: 0.3 }}>HELA KÖRNINGEN</div>
              <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>{dagSumma.km} km</div>
              <div style={{ fontSize: 14, color: C.t3, marginTop: 4 }}>
                {dagSumma.flyttar} {dagSumma.flyttar === 1 ? 'flytt' : 'flyttar'} · {dagSumma.dagar} {dagSumma.dagar === 1 ? 'kördag' : 'kördagar'} · {fmtTid(dagSumma.tidMatt)}
                {dagSumma.utanTid > 0 && (
                  <span style={{ color: C.t3 }}> (exkl {dagSumma.utanTid} utan tid)</span>
                )}
              </div>
              {fakturerbarBadge(fakturerbartKm)}
            </div>

            {dagRader.length === 0 ? tomLage('Inga flyttar den här perioden.') : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dagRader.map(d => {
                  const pagaende = d.status === 'pagaende' || d.sluttid == null
                  const auto = d.status === 'auto_avslutad'
                  const oppen = oppnaDagar.has(d.id)
                  const dagFlyttar = flyttPerDag.get(d.id) || []
                  const ben = benRad(d)
                  return (
                    <div key={d.id} style={{
                      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                      opacity: pagaende || auto ? 0.6 : 1,
                    }}>
                      {/* Kollapsad rad: ett tal (dagens km) högerställt */}
                      <button onClick={() => toggle(oppnaDagar, setOppnaDagar, d.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                        background: 'transparent', border: 'none', padding: '13px 14px', cursor: 'pointer', fontFamily: ff, color: C.t1,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.t3 }}>
                          {oppen ? 'expand_more' : 'chevron_right'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>
                            {new Date(d.starttid).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}
                            {pagaende && <span style={{ color: C.blue, fontWeight: 600 }}> · Pågår</span>}
                            {auto && <span style={{ color: C.orange, fontWeight: 600 }}> · Auto-avslutad</span>}
                          </div>
                          <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>
                            {dagFlyttar.length} {dagFlyttar.length === 1 ? 'flytt' : 'flyttar'}
                            {d.forare && ` · ${d.forare}`}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: 17, fontWeight: 800 }}>{d.total_km != null ? `${d.total_km} km` : '—'}</div>
                          {d.total_tid_min != null && (
                            <div style={{ fontSize: 12, color: C.t3, marginTop: 1 }}>{fmtTid(d.total_tid_min)}</div>
                          )}
                        </div>
                      </button>

                      {/* Expanderat på plats: flyttarna + en sekundär benrad */}
                      {oppen && (
                        <div style={{ padding: '0 14px 12px 44px' }}>
                          {dagFlyttar.map(f => (
                            <div key={f.id} style={{
                              display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0',
                              borderTop: `1px solid ${C.border}`,
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>
                                  {namnForMaskin(f.maskin_id, f.extern_maskin)}
                                  {!f.maskin_id && <span style={{ color: C.t3, fontWeight: 400 }}> (extern)</span>}
                                </div>
                                <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
                                  {namnForAnde(f.fran_objekt_id, f.fran_plats_id) || 'Okänd plats'}
                                  {' → '}
                                  {namnForAnde(f.till_objekt_id, f.till_plats_id) || (f.till_lat != null ? 'Vald plats' : '—')}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <div style={{ fontSize: 14, fontWeight: 700 }}>
                                  {f.flytt_km != null ? `${f.flytt_km} km` : '—'}
                                  {f.tid_flytt_min != null && (
                                    <span style={{ color: C.t3, fontWeight: 400 }}> · {fmtTid(f.tid_flytt_min)}</span>
                                  )}
                                </div>
                                {f.fakturerbar
                                  ? <div style={{ marginTop: 3 }}>{fakturerbarChip(f.flytt_typ)}</div>
                                  : <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>
                                      {(f.flytt_typ || 'produktion') === 'service' ? 'Service'
                                        : (f.flytt_typ || 'produktion') === 'annat' ? 'Annat' : 'Ej fakt.'}
                                    </div>}
                              </div>
                            </div>
                          ))}
                          {ben && (
                            <div style={{ fontSize: 12, color: C.t3, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>{ben}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ══ FLYTTAR ══ */}
        {flik === 'flyttar' && !laddar && !fel && (
          <>
            {/* Summering: ett stort tal — periodens flytt-km */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 18px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.t3, fontWeight: 700, letterSpacing: 0.3 }}>FLYTTSTRÄCKOR</div>
              <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>{flyttSumma.flyttKm} km</div>
              <div style={{ fontSize: 14, color: C.t3, marginTop: 4 }}>
                {flyttSumma.antal} {flyttSumma.antal === 1 ? 'flytt' : 'flyttar'} · {fmtTid(flyttSumma.tidMatt)} flyttid
                {flyttSumma.utanTid > 0 && (
                  <span style={{ color: C.t3 }}> (exkl {flyttSumma.utanTid} utan tid)</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>{flyttSumma.fakturerbara} fakturerbara</div>
              {fakturerbarBadge(flyttSumma.fakturerbarKm)}
              {flyttSumma.perTyp.length > 0 && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, fontSize: 12, color: C.t3 }}>
                  {flyttSumma.perTyp.map(r => (
                    <span key={r.typ}>{TYP_ETIKETT[r.typ]}: <b style={{ color: C.t2 }}>{r.antal} st · {r.km} km</b></span>
                  ))}
                </div>
              )}
            </div>

            {/* Flik-specifika filter (typ/maskin) — förarfiltret ligger i bottenraden */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <select className="flytt-select" style={{ flex: 1 }} value={maskinFilter} onChange={e => setMaskinFilter(e.target.value)}>
                <option value="alla">Alla maskiner</option>
                {maskiner.map(id => <option key={id} value={id}>{maskinNamn.get(id) || id}</option>)}
              </select>
              <select className="flytt-select" style={{ flex: 1 }} value={typFilter} onChange={e => setTypFilter(e.target.value)}>
                <option value="alla">Alla typer</option>
                {Object.entries(TYP_ETIKETT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {filtreradeFlyttar.length === 0 ? tomLage('Inga flyttar den här perioden.') : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtreradeFlyttar.map(f => {
                  const pagaende = !f.avbruten && f.sluttid == null
                  const dampat = f.avbruten || pagaende
                  const oppen = oppnaFlyttar.has(f.id)
                  const franNamn = namnForAnde(f.fran_objekt_id, f.fran_plats_id)
                  const tillNamn = namnForAnde(f.till_objekt_id, f.till_plats_id) || (f.till_lat != null ? 'Vald plats' : '—')
                  return (
                    <div key={f.id} style={{
                      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                      opacity: dampat ? 0.55 : 1,
                    }}>
                      {/* Kollapsad rad: maskin + ett tal (flytt-km) */}
                      <button onClick={() => toggle(oppnaFlyttar, setOppnaFlyttar, f.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                        background: 'transparent', border: 'none', padding: '13px 14px', cursor: 'pointer', fontFamily: ff, color: C.t1,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.t3 }}>
                          {oppen ? 'expand_more' : 'chevron_right'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>
                            {namnForMaskin(f.maskin_id, f.extern_maskin)}
                            {!f.maskin_id && <span style={{ color: C.t3, fontWeight: 400 }}> (extern)</span>}
                            {f.avbruten && <span style={{ color: C.orange, fontWeight: 600 }}> · Avbruten</span>}
                            {pagaende && <span style={{ color: C.blue, fontWeight: 600 }}> · Pågår</span>}
                          </div>
                          <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>
                            {new Date(f.starttid).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                            {(f.flytt_typ || 'produktion') !== 'produktion' &&
                              ` · ${TYP_ETIKETT[f.flytt_typ || 'produktion']}${f.kund ? ` · ${f.kund}` : ''}`}
                          </div>
                        </div>
                        {f.fakturerbar && !dampat && (
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: C.green }}>payments</span>
                        )}
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: 17, fontWeight: 800 }}>{f.flytt_km != null ? `${f.flytt_km} km` : '—'}</div>
                          {f.tid_flytt_min != null && (
                            <div style={{ fontSize: 12, color: C.t3, marginTop: 1 }}>{fmtTid(f.tid_flytt_min)}</div>
                          )}
                        </div>
                      </button>

                      {/* Expanderat: från→till, ben, väder, fakturerbar */}
                      {oppen && (
                        <div style={{ padding: '0 14px 12px 44px' }}>
                          <div style={{ fontSize: 13, color: C.t2, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                            {franNamn ? <b style={{ color: C.t1 }}>{franNamn}</b> : (
                              <a href={`https://www.google.com/maps?q=${f.fran_lat},${f.fran_lng}`} target="_blank" rel="noopener noreferrer"
                                style={{ color: C.t3, textDecoration: 'none' }}>
                                {f.fran_lat.toFixed(3)}, {f.fran_lng.toFixed(3)}
                              </a>
                            )}
                            {' → '}
                            <b style={{ color: C.t1 }}>{tillNamn}</b>
                          </div>
                          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: C.t3, flexWrap: 'wrap', alignItems: 'center' }}>
                            {f.mellankorning_km != null && f.mellankorning_km > 0 && <span>Tomkörning {f.mellankorning_km} km</span>}
                            {f.flyttdag_id == null && f.total_km != null && <span>Totalt (gammal modell) {f.total_km} km</span>}
                            {f.vader_temp_c != null && <span>{vaderIkon(f.vader_kod)} {Math.round(f.vader_temp_c)}°C</span>}
                            {f.fakturerbar && fakturerbarChip(f.flytt_typ)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── Diskret bottenrad: fliktoggle · förarfilter · CSV ── */}
        {!laddar && !fel && (
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3 }}>
                {([['dagar', 'Dagar'], ['flyttar', 'Flyttar']] as [Flik, string][]).map(([f, namn]) => (
                  <button key={f} onClick={() => setFlik(f)} style={{
                    background: flik === f ? 'rgba(255,255,255,0.10)' : 'transparent',
                    color: flik === f ? C.t1 : C.t3,
                    border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: ff,
                  }}>{namn}</button>
                ))}
              </div>
              {forare.length > 0 && (
                <select className="flytt-select" value={forareFilter} onChange={e => setForareFilter(e.target.value)}>
                  <option value="alla">Alla förare</option>
                  {forare.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={flik === 'dagar' ? exportDagCsv : exportFlyttCsv}
                disabled={flik === 'dagar' ? kordagar.length === 0 : slutforda.length === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: C.t2,
                  border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: ff,
                  opacity: (flik === 'dagar' ? kordagar.length === 0 : slutforda.length === 0) ? 0.4 : 1,
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                CSV
              </button>
            </div>
          </div>
        )}

        <Link href="/maskinflytt/platser" style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 20,
          color: C.t3, fontSize: 14, fontWeight: 600, textDecoration: 'none', fontFamily: ff,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_location_alt</span>
          Flyttplatser — hantera
          <span className="material-symbols-outlined" style={{ fontSize: 18, marginLeft: 'auto' }}>chevron_right</span>
        </Link>
        <Link href="/maskinflytt" style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
          color: C.t3, fontSize: 14, fontWeight: 600, textDecoration: 'none', fontFamily: ff,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delivery_truck_speed</span>
          Till Maskinflytt
        </Link>
      </main>
    </div>
  )
}
