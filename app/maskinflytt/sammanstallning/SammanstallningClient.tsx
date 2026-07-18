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
//  - Flyttar: de fakturerbara sträckorna (flytt_km >= 30 per enskild flytt)
interface FlyttRad {
  id: string
  maskin_id: string
  flyttdag_id: string | null
  fran_lat: number
  fran_lng: number
  fran_objekt_id: string | null
  till_objekt_id: string | null
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

function fmtMin(min: number | null): string {
  if (min == null) return '—'
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} tim ${m % 60} min`
}

/** Mätt tid för en flytt = till-maskin + flytt (aldrig någon beräknad del). */
function mattTid(f: FlyttRad): number | null {
  if (f.tid_till_maskin_min == null && f.tid_flytt_min == null) return null
  return (f.tid_till_maskin_min ?? 0) + (f.tid_flytt_min ?? 0)
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
  const [dagFlyttAntal, setDagFlyttAntal] = useState<Map<string, number>>(new Map())
  const [fel, setFel] = useState<string | null>(null)
  const [maskinNamn, setMaskinNamn] = useState<Map<string, string>>(new Map())
  const [objektNamn, setObjektNamn] = useState<Map<string, string>>(new Map())
  const [maskinFilter, setMaskinFilter] = useState('alla')
  const [forareFilter, setForareFilter] = useState('alla')

  const period = useMemo(() => periodIntervall(periodTyp, offset), [periodTyp, offset])

  useEffect(() => {
    let avbruten = false
    ;(async () => {
      setFlyttar(null); setDagar(null); setFel(null)
      const [fRes, dRes] = await Promise.all([
        supabase.from('maskin_flytt')
          .select('id, maskin_id, flyttdag_id, fran_lat, fran_lng, fran_objekt_id, till_objekt_id, till_lat, till_lng, flytt_km, mellankorning_km, total_km, fakturerbar, tid_till_maskin_min, tid_flytt_min, vader_temp_c, vader_kod, starttid, sluttid, avbruten, forare')
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

      const antal = new Map<string, number>()
      for (const f of fRes.data || []) {
        if (f.flyttdag_id && !f.avbruten && f.sluttid) antal.set(f.flyttdag_id, (antal.get(f.flyttdag_id) || 0) + 1)
      }
      setDagFlyttAntal(antal)

      const objektIds = Array.from(new Set(
        (fRes.data || []).flatMap(f => [f.till_objekt_id, f.fran_objekt_id]).filter(Boolean))) as string[]
      if (objektIds.length) {
        const { data: obj } = await supabase.from('objekt').select('id, namn').in('id', objektIds)
        if (!avbruten && obj) setObjektNamn(new Map(obj.map(o => [o.id, o.namn])))
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
    Array.from(new Set((flyttar || []).map(f => f.maskin_id))), [flyttar])

  // ── Flyttar-nivån ──
  const filtreradeFlyttar = useMemo(() => (flyttar || []).filter(f =>
    (maskinFilter === 'alla' || f.maskin_id === maskinFilter) &&
    (forareFilter === 'alla' || f.forare === forareFilter)
  ), [flyttar, maskinFilter, forareFilter])
  const slutforda = useMemo(() => filtreradeFlyttar.filter(f => !f.avbruten && f.sluttid != null), [filtreradeFlyttar])
  const flyttSumma = useMemo(() => {
    const medTid = slutforda.filter(f => mattTid(f) != null)
    return {
      antal: slutforda.length,
      flyttKm: slutforda.reduce((s, f) => s + (f.flytt_km ?? 0), 0),
      mellanKm: slutforda.reduce((s, f) => s + (f.mellankorning_km ?? 0), 0),
      tidMatt: medTid.length ? medTid.reduce((s, f) => s + mattTid(f)!, 0) : null,
      fakturerbara: slutforda.filter(f => f.fakturerbar).length,
    }
  }, [slutforda])

  // ── Dag-nivån (maskinfiltret gäller inte dagar — en dag kan röra flera maskiner) ──
  const filtreradeDagar = useMemo(() => (dagar || []).filter(d =>
    forareFilter === 'alla' || d.forare === forareFilter
  ), [dagar, forareFilter])
  const raknadeDagar = useMemo(() => filtreradeDagar.filter(d => d.status !== 'pagaende' && d.sluttid != null), [filtreradeDagar])
  const dagSumma = useMemo(() => {
    const medTid = raknadeDagar.filter(d => d.total_tid_min != null)
    return {
      antal: raknadeDagar.length,
      km: raknadeDagar.reduce((s, d) => s + (d.total_km ?? 0), 0),
      tidMatt: medTid.length ? medTid.reduce((s, d) => s + d.total_tid_min!, 0) : null,
      flyttar: raknadeDagar.reduce((s, d) => s + (dagFlyttAntal.get(d.id) || 0), 0),
    }
  }, [raknadeDagar, dagFlyttAntal])

  function exportFlyttCsv() {
    const rubrik = ['Datum', 'Maskin', 'Förare', 'Från objekt', 'Till objekt', 'Mellankörning km', 'Flytt km', 'Flyttid min (mätt)', 'Fakturerbar']
    const rader = slutforda.map(f => [
      new Date(f.starttid).toLocaleDateString('sv-SE'),
      maskinNamn.get(f.maskin_id) || f.maskin_id,
      f.forare || '',
      f.fran_objekt_id ? (objektNamn.get(f.fran_objekt_id) || '') : '',
      f.till_objekt_id ? (objektNamn.get(f.till_objekt_id) || '') : '',
      f.mellankorning_km ?? '',
      f.flytt_km ?? '',
      f.tid_flytt_min != null ? Math.round(f.tid_flytt_min) : '',
      f.fakturerbar ? 'JA' : 'NEJ',
    ])
    laddaNerCsv([rubrik, ...rader], `flyttar-${period.etikett.replace(/[ .]/g, '-')}.csv`)
  }

  function exportDagCsv() {
    const rubrik = ['Datum', 'Förare', 'Flyttar', 'Tillkörning km', 'Hemresa km (beräknad)', 'Total km', 'Tid min (mätt, exkl. hemresa)', 'Status']
    const rader = raknadeDagar.map(d => [
      new Date(d.starttid).toLocaleDateString('sv-SE'),
      d.forare || '',
      dagFlyttAntal.get(d.id) || 0,
      d.tillkorning_km ?? '',
      d.hem_km ?? '',
      d.total_km ?? '',
      d.total_tid_min != null ? Math.round(d.total_tid_min) : '',
      d.status === 'auto_avslutad' ? 'Auto-avslutad' : 'Avslutad',
    ])
    laddaNerCsv([rubrik, ...rader], `flyttdagar-${period.etikett.replace(/[ .]/g, '-')}.csv`)
  }

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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
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

        {/* Nivåflikar: dagens helhet vs fakturerbara flyttar — blandas aldrig */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {([['dagar', 'Dagar'], ['flyttar', 'Flyttar']] as [Flik, string][]).map(([f, namn]) => (
            <button key={f} onClick={() => setFlik(f)} style={{
              flex: 1, background: flik === f ? 'rgba(255,255,255,0.10)' : 'transparent',
              color: flik === f ? C.t1 : C.t3,
              border: `1px solid ${flik === f ? 'rgba(255,255,255,0.2)' : C.border}`,
              borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: ff,
            }}>{namn}</button>
          ))}
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {flik === 'flyttar' && (
            <select className="flytt-select" style={{ flex: 1 }} value={maskinFilter} onChange={e => setMaskinFilter(e.target.value)}>
              <option value="alla">Alla maskiner</option>
              {maskiner.map(id => <option key={id} value={id}>{maskinNamn.get(id) || id}</option>)}
            </select>
          )}
          <select className="flytt-select" style={{ flex: 1 }} value={forareFilter} onChange={e => setForareFilter(e.target.value)}>
            <option value="alla">Alla förare</option>
            {forare.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {fel && (
          <div style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.4)', borderRadius: 12, padding: 14, fontSize: 14 }}>{fel}</div>
        )}
        {flyttar === null && !fel && (
          <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Laddar …</div>
        )}

        {/* ══ DAGAR ══ */}
        {flik === 'dagar' && dagar !== null && !fel && (
          <>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                {[
                  ['Dagar', String(dagSumma.antal)],
                  ['Flyttar', String(dagSumma.flyttar)],
                  ['Total km', String(dagSumma.km)],
                  ['Tid (mätt)*', fmtMin(dagSumma.tidMatt)],
                ].map(([label, varde]) => (
                  <div key={label}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{varde}</div>
                    <div style={{ fontSize: 11, color: C.t3, fontWeight: 600 }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 8, textAlign: 'center' }}>
                * mätt till "Kör hem" — hemresan är beräknad och ingår inte
              </div>
            </div>

            {filtreradeDagar.length === 0 && (
              <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Inga flyttdagar i perioden.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtreradeDagar.map(d => {
                const pagaende = d.status === 'pagaende' || d.sluttid == null
                const auto = d.status === 'auto_avslutad'
                return (
                  <div key={d.id} style={{
                    background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px',
                    opacity: pagaende || auto ? 0.6 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>
                        {new Date(d.starttid).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {d.forare && <span style={{ color: C.t3, fontWeight: 400 }}> · {d.forare}</span>}
                        {pagaende && <span style={{ color: C.blue, fontWeight: 600 }}> · Pågår</span>}
                        {auto && <span style={{ color: C.orange, fontWeight: 600 }}> · Auto-avslutad</span>}
                      </span>
                      <span style={{ fontSize: 12, color: C.t3 }}>{dagFlyttAntal.get(d.id) || 0} flyttar</span>
                    </div>
                    {!pagaende && (
                      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: C.t3, flexWrap: 'wrap' }}>
                        <span>Tillkörning: <b style={{ color: C.t1 }}>{d.tillkorning_km != null ? `${d.tillkorning_km} km` : '—'}</b></span>
                        <span>Hemresa: <b style={{ color: C.t1 }}>{d.hem_km != null ? `~${d.hem_km} km` : '—'}</b></span>
                        <span>Totalt: <b style={{ color: C.t1 }}>{d.total_km != null ? `${d.total_km} km` : '—'}</b></span>
                        <span>Tid (mätt): <b style={{ color: C.t1 }}>{fmtMin(d.total_tid_min)}</b></span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {raknadeDagar.length > 0 && (
              <button onClick={exportDagCsv} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', background: C.card, color: C.t1, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                fontFamily: ff, marginTop: 16,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>download</span>
                Exportera CSV ({raknadeDagar.length} dagar)
              </button>
            )}
          </>
        )}

        {/* ══ FLYTTAR ══ */}
        {flik === 'flyttar' && flyttar !== null && !fel && (
          <>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                {[
                  ['Flyttar', String(flyttSumma.antal)],
                  ['Flytt-km', String(flyttSumma.flyttKm)],
                  ['Tomkörning', `${flyttSumma.mellanKm} km`],
                  ['Fakturerbara', String(flyttSumma.fakturerbara)],
                ].map(([label, varde]) => (
                  <div key={label}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{varde}</div>
                    <div style={{ fontSize: 11, color: C.t3, fontWeight: 600 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {filtreradeFlyttar.length === 0 && (
              <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Inga flyttar i perioden.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtreradeFlyttar.map(f => {
                const pagaende = !f.avbruten && f.sluttid == null
                const dampat = f.avbruten || pagaende
                const franNamn = f.fran_objekt_id ? objektNamn.get(f.fran_objekt_id) : null
                return (
                  <div key={f.id} style={{
                    background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px',
                    opacity: dampat ? 0.55 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>
                        {maskinNamn.get(f.maskin_id) || f.maskin_id}
                        {f.avbruten && <span style={{ color: C.orange, fontWeight: 600 }}> · Avbruten</span>}
                        {pagaende && <span style={{ color: C.blue, fontWeight: 600 }}> · Pågår</span>}
                      </span>
                      {f.vader_temp_c != null && (
                        <span style={{ fontSize: 12, color: C.t2 }}>{vaderIkon(f.vader_kod)} {Math.round(f.vader_temp_c)}°C</span>
                      )}
                      <span style={{ fontSize: 12, color: C.t3 }}>
                        {new Date(f.starttid).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: C.t2, marginTop: 4 }}>
                      {franNamn ? <b style={{ color: C.t1 }}>{franNamn}</b> : (
                        <a href={`https://www.google.com/maps?q=${f.fran_lat},${f.fran_lng}`} target="_blank" rel="noopener noreferrer"
                          style={{ color: C.t3, textDecoration: 'none' }}>
                          {f.fran_lat.toFixed(3)}, {f.fran_lng.toFixed(3)}
                        </a>
                      )}
                      {' → '}
                      <b style={{ color: C.t1 }}>{f.till_objekt_id ? (objektNamn.get(f.till_objekt_id) || '—') : (f.till_lat != null ? 'Vald plats' : '—')}</b>
                    </div>
                    {!f.avbruten && (
                      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: C.t3, flexWrap: 'wrap', alignItems: 'center' }}>
                        {f.mellankorning_km != null && <span>Tomkörning: <b style={{ color: C.t1 }}>{f.mellankorning_km} km</b></span>}
                        <span>Flytt: <b style={{ color: C.t1 }}>{f.flytt_km != null ? `${f.flytt_km} km` : '—'}</b></span>
                        <span>Flyttid: <b style={{ color: C.t1 }}>{fmtMin(f.tid_flytt_min)}</b></span>
                        {f.flyttdag_id == null && f.total_km != null && (
                          <span>Totalt (gammal modell): <b style={{ color: C.t1 }}>{f.total_km} km</b></span>
                        )}
                        {f.fakturerbar && (
                          <span style={{
                            fontSize: 11, fontWeight: 800, color: C.green, background: 'rgba(34,197,94,0.15)',
                            borderRadius: 6, padding: '1px 7px',
                          }}>Fakturerbar</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {slutforda.length > 0 && (
              <button onClick={exportFlyttCsv} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', background: C.card, color: C.t1, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                fontFamily: ff, marginTop: 16,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>download</span>
                Exportera CSV ({slutforda.length} flyttar)
              </button>
            )}
          </>
        )}

        <Link href="/maskinflytt" style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 20,
          color: C.t3, fontSize: 14, fontWeight: 600, textDecoration: 'none', fontFamily: ff,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delivery_truck_speed</span>
          Till Maskinflytt
        </Link>
      </main>
    </div>
  )
}
