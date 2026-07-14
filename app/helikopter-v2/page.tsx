'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { TreePine, Trees } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ============================================================
// Types
// ============================================================

interface ObjektRow {
  objekt_id: string
  object_name: string | null
  vo_nummer: string | null
  bolag: string | null
  huvudtyp: string | null
  inkopare: string | null
  skogsagare: string | null
  skordat_m3: number
  skotat_m3: number
  oskotat_m3: number
  skordare_klar: string | null
  skotare_start: string | null
  dagar_vantar: number | null
}

interface Bestallning {
  id: string
  ar: number
  manad: number
  bolag: string
  typ: 'slutavverkning' | 'gallring'
  volym: number
}

interface DimMaskin {
  maskin_id: string
  modell: string | null
  maskin_typ: string | null   // 'Harvester' | 'Forwarder'
  klarar_typ: string | null
  extramaskin: boolean | null
  aktiv_till: string | null    // satt = såld/utfasad
}

// ============================================================
// Constants & Design tokens
// ============================================================

const bg = '#000'
const text = '#fff'
const muted = '#8e8e93'
const divider = 'rgba(255,255,255,0.08)'
const ff = 'system-ui, sans-serif'

const card: React.CSSProperties = {
  background: '#1c1c1e',
  borderRadius: 12,
  position: 'relative',
  overflow: 'hidden',
}

const MANAD = ['', 'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

// Golv vi planerar på: 8 h dagtid per arbetsdag. Övertid och extramaskin (810E) är
// deras BUFFERT — räknas ALDRIG in i kapaciteten.
const TIMMAR_PER_DAG = 8

// Påskdagen (Meeus/Anonymous Gregorian) — beräknas, aldrig hårdkodad.
function paskdagen(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3=mars, 4=april
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}
function isoDatum(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Svenska helgdagar (röda dagar) för ett år. Rörliga via påsk; midsommar/alla helgons via lördagsregel.
function svenskaRodaDagar(year: number): Set<string> {
  const s = new Set<string>()
  const add = (d: Date) => s.add(isoDatum(d))
  add(new Date(year, 0, 1))   // nyårsdagen
  add(new Date(year, 0, 6))   // trettondedag jul
  add(new Date(year, 4, 1))   // första maj
  add(new Date(year, 5, 6))   // nationaldagen
  add(new Date(year, 11, 25)) // juldagen
  add(new Date(year, 11, 26)) // annandag jul
  const p = paskdagen(year)
  const off = (n: number) => new Date(year, p.getMonth(), p.getDate() + n)
  add(off(-2)) // långfredag
  add(off(1))  // annandag påsk
  add(off(39)) // Kristi himmelsfärd
  for (let day = 20; day <= 26; day++) { const d = new Date(year, 5, day); if (d.getDay() === 6) { add(d); break } } // midsommardagen (lör 20–26 juni)
  for (let o = 0; o <= 6; o++) { const d = new Date(year, 9, 31 + o); if (d.getDay() === 6) { add(d); break } }        // alla helgons dag (lör 31 okt–6 nov)
  return s
}
// Tillgängliga arbetsdagar i månaden: vardag (mån–fre), ej röd dag, och (pågående månad) från idag.
function arbetsdagarIManad(ar: number, manad: number, idagISO: string): string[] {
  const roda = svenskaRodaDagar(ar)
  const dagar: string[] = []
  const antalDagar = new Date(ar, manad, 0).getDate()
  for (let day = 1; day <= antalDagar; day++) {
    const d = new Date(ar, manad - 1, day)
    const dow = d.getDay()
    if (dow === 0 || dow === 6) continue // helg
    const iso = isoDatum(d)
    if (roda.has(iso)) continue          // röd dag
    if (iso < idagISO) continue          // redan passerad
    dagar.push(iso)
  }
  return dagar
}

// ============================================================
// Helpers
// ============================================================

function normalizeBolag(b: string | null): string {
  if (!b || b.trim() === '') return 'Okänt'
  const lower = b.trim().toLowerCase()
  if (lower === 'vida') return 'Vida'
  if (lower === 'ata') return 'ATA'
  return b.trim()
}

function maskinModell(m: DimMaskin | undefined | null): string {
  return m?.modell || m?.maskin_id || 'Maskin'
}

// Timmar ur manuell_prognos: STRÄNGAR ('50', ofta ''). Tomt/ogiltigt -> null (= HÅL,
// aldrig tyst 0). Bara ett tal > 0 räknas som ifylld tid.
function parseTimmar(v: unknown): number | null {
  const t = String(v ?? '').replace(',', '.').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Dedikerade skördare: Rottne = gallring, Ponsse Scorpion = slutavverkning (CLAUDE.md).
const MASKIN_GALLRING = new Set(['R64101', 'R64428'])
const MASKIN_SLUT = new Set(['PONS20SDJAA270231'])

// Härled spår-typ för en helikopter_vy-rad. Prioritet: 1) dim_objekt.huvudtyp om satt,
// 2) maskin-regel, 3) vo-match mot operativa objekt.typ, 4) 'Okänt'.
function harledTyp(huvudtyp: string | null, maskinId: string | undefined, objektTyp: string | undefined): 'Slutavverkning' | 'Gallring' | 'Okänt' {
  const h = (huvudtyp || '').trim().toLowerCase()
  if (h === 'slutavverkning') return 'Slutavverkning'
  if (h === 'gallring') return 'Gallring'
  if (maskinId && MASKIN_GALLRING.has(maskinId)) return 'Gallring'
  if (maskinId && MASKIN_SLUT.has(maskinId)) return 'Slutavverkning'
  const t = (objektTyp || '').trim().toLowerCase()
  if (t === 'slutavverkning') return 'Slutavverkning'
  if (t === 'gallring') return 'Gallring'
  return 'Okänt'
}

function arbetsdagarKvar(ar: number, manad: number): number {
  const idag = new Date()
  const sistaDag = new Date(ar, manad, 0).getDate()
  if (ar < idag.getFullYear() || (ar === idag.getFullYear() && manad < idag.getMonth() + 1)) return 0
  const start = (ar === idag.getFullYear() && manad === idag.getMonth() + 1) ? idag.getDate() + 1 : 1
  let count = 0
  for (let d = start; d <= sistaDag; d++) {
    const day = new Date(ar, manad - 1, d).getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

// ============================================================
// Sheet (för export-menyn)
// ============================================================

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#1c1c1e', color: text, fontFamily: ff, width: '100%', maxHeight: '85vh', borderTopLeftRadius: 12, borderTopRightRadius: 12, display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${divider}` }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
          <button onClick={onClose} style={{ minHeight: 44, padding: '0 4px', fontSize: 17, color: '#0a84ff', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: ff }}>Klar</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '8px 20px 20px' }}>{children}</div>
      </div>
    </div>
  )
}

// ============================================================
// Main page — månad · hero · två spår (servetten)
// ============================================================

export default function HelikopterV2Page() {
  const [data, setData] = useState<ObjektRow[]>([])
  const [bestallningar, setBestallningar] = useState<Bestallning[]>([])
  const [objektAlla, setObjektAlla] = useState<{
    id: string; namn: string | null; vo_nummer: string | null;
    ar: number | null; manad: number | null; status: string | null; typ: string | null;
    volym: number | null; manuell_prognos: { skordare?: string; skotare?: string } | null;
    skordare_maskin_id: string | null; skotare_maskin_id: string | null;
    skordare_utforare: string | null; skotare_utforare: string | null;
  }[]>([])
  const [dimMaskiner, setDimMaskiner] = useState<DimMaskin[]>([])
  const [maskinstoppData, setMaskinstoppData] = useState<{ maskin_id: string; fran_datum: string; till_datum: string; orsak: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [ar, setAr] = useState(() => new Date().getFullYear())
  const [manad, setManad] = useState(() => new Date().getMonth() + 1)
  const [exportOpen, setExportOpen] = useState(false)
  const [oppetSpar, setOppetSpar] = useState<'Slutavverkning' | 'Gallring' | null>(null) // dragspel: ett spår-djup i taget
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const touchStartY = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      // Läs via inloggad session-klient (inte hårdkodad anon-nyckel).
      const [hv, best, dimo, obj, dimm, mstopp] = await Promise.all([
        supabase.from('helikopter_vy').select('*'),
        supabase.from('bestallningar').select('*').eq('ar', ar).eq('manad', manad),
        supabase.from('dim_objekt').select('objekt_id,maskin_id'),
        supabase.from('objekt').select('id,namn,vo_nummer,typ,ar,manad,status,volym,manuell_prognos,skordare_maskin_id,skotare_maskin_id,skordare_utforare,skotare_utforare'),
        supabase.from('dim_maskin').select('maskin_id,modell,maskin_typ,klarar_typ,extramaskin,aktiv_till'),
        supabase.from('maskinstopp').select('maskin_id,fran_datum,till_datum,orsak'),
      ])
      // Härled huvudtyp där den saknas (maskin-regel + vo-match) — fas 1, ingen DB-ändring.
      const maskinById = new Map<string, string>((dimo.data || []).map((d: any) => [d.objekt_id, d.maskin_id]))
      const typByVo = new Map<string, string>(
        (obj.data || [])
          .filter((o: any) => o.vo_nummer != null && String(o.vo_nummer).trim() !== '')
          .map((o: any) => [String(o.vo_nummer).trim(), o.typ])
      )
      if (hv.data) {
        setData(hv.data.map((o: any) => ({
          ...o,
          huvudtyp: harledTyp(o.huvudtyp, maskinById.get(o.objekt_id), typByVo.get(String(o.vo_nummer || '').trim())),
        })))
      }
      if (best.data) setBestallningar(best.data)
      setObjektAlla(obj.data || [])
      if (dimm.data) setDimMaskiner(dimm.data as DimMaskin[])
      setMaskinstoppData(mstopp.data || [])
    } catch { /* use empty */ }
  }, [ar, manad])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const manadAvslutad = useMemo(() => {
    const now = new Date()
    return ar < now.getFullYear() || (ar === now.getFullYear() && manad < now.getMonth() + 1)
  }, [ar, manad])

  // Objekt vars skörd blev klar i vald månad.
  const manadData = useMemo(() => {
    const start = `${ar}-${String(manad).padStart(2, '0')}-01`
    const end = manad === 12 ? `${ar + 1}-01-01` : `${ar}-${String(manad + 1).padStart(2, '0')}-01`
    return data.filter(o => o.skordare_klar && o.skordare_klar >= start && o.skordare_klar < end)
  }, [data, ar, manad])

  const slutBest = useMemo(() =>
    bestallningar.filter(b => b.typ === 'slutavverkning').reduce((s, b) => s + (b.volym || 0), 0),
  [bestallningar])
  const gallBest = useMemo(() =>
    bestallningar.filter(b => b.typ === 'gallring').reduce((s, b) => s + (b.volym || 0), 0),
  [bestallningar])

  // Skördat/skotat per spår. huvudtyp är redan härledd i load(), så 'Okänt' = verkligt oklassat.
  const sparData = useMemo(() => {
    const agg: Record<'Slutavverkning' | 'Gallring' | 'Okänt', { skordat: number; skotat: number }> = {
      Slutavverkning: { skordat: 0, skotat: 0 },
      Gallring: { skordat: 0, skotat: 0 },
      'Okänt': { skordat: 0, skotat: 0 },
    }
    for (const o of manadData) {
      const t = (o.huvudtyp === 'Slutavverkning' || o.huvudtyp === 'Gallring') ? o.huvudtyp : 'Okänt'
      agg[t].skordat += o.skordat_m3 || 0
      agg[t].skotat += o.skotat_m3 || 0
    }
    return agg
  }, [manadData])

  const workdaysInfo = useMemo(() => {
    const totalDays = new Date(ar, manad, 0).getDate()
    const now = new Date()
    let total = 0, passed = 0
    for (let d = 1; d <= totalDays; d++) {
      const dow = new Date(ar, manad - 1, d).getDay()
      if (dow !== 0 && dow !== 6) {
        total++
        if (new Date(ar, manad - 1, d).getTime() <= now.getTime()) passed++
      }
    }
    return { total, passed }
  }, [ar, manad])

  const totalSkotat = useMemo(() => manadData.reduce((s, o) => s + (o.skotat_m3 || 0), 0), [manadData])
  const totalSkordat = useMemo(() => manadData.reduce((s, o) => s + (o.skordat_m3 || 0), 0), [manadData])
  const totalOskotat = useMemo(() => manadData.reduce((s, o) => s + (o.oskotat_m3 || 0), 0), [manadData])

  const manadsmal = useMemo(() => {
    const totalBest = slutBest + gallBest
    if (totalBest === 0) return null
    const procent = Math.round((totalSkotat / totalBest) * 100)
    const skordatProcent = Math.round((totalSkordat / totalBest) * 100)
    const forvantadProcent = workdaysInfo.total > 0 ? Math.round((workdaysInfo.passed / workdaysInfo.total) * 100) : 0
    const onTrack = procent >= forvantadProcent
    // Tomläge: inget skotat än → larma inte rött (vyn är under uppbyggnad).
    const harSkotat = totalSkotat > 0
    return { procent, skordatProcent, forvantadProcent, onTrack, harSkotat }
  }, [slutBest, gallBest, totalSkotat, totalSkordat, workdaysInfo])

  const kvarDagar = arbetsdagarKvar(ar, manad)

  const bytManad = (dir: 'prev' | 'next') => {
    if (dir === 'prev') {
      if (manad === 1) { setManad(12); setAr(ar - 1) }
      else setManad(manad - 1)
    } else {
      if (manad === 12) { setManad(1); setAr(ar + 1) }
      else setManad(manad + 1)
    }
  }

  // Pull-to-refresh
  const onTouchStart = (e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) touchStartY.current = e.touches[0].clientY
    else touchStartY.current = null
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    if (scrollRef.current && scrollRef.current.scrollTop > 0) { touchStartY.current = null; setPullDistance(0); return }
    const dist = e.touches[0].clientY - touchStartY.current
    if (dist > 0) setPullDistance(Math.min(120, dist * 0.5))
  }
  const onTouchEnd = async () => {
    if (pullDistance > 60 && !refreshing) {
      setRefreshing(true); setPullDistance(50); await load(); setRefreshing(false)
    }
    setPullDistance(0); touchStartY.current = null
  }

  // Export (CSV + dela) — tucked away i meny, inte på förstaskärmen.
  const buildCsv = () => {
    const header = ['Objekt', 'VO-nummer', 'Bolag', 'Huvudtyp', 'Skogsägare', 'Inköpare', 'Skördat_m3fub', 'Skotat_m3fub', 'Oskotat_m3fub', 'Skördare_klar', 'Skotare_start']
    const escape = (v: any) => {
      const s = v == null ? '' : String(v)
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = manadData.map(o => [
      o.object_name || o.objekt_id, o.vo_nummer || '', normalizeBolag(o.bolag),
      o.huvudtyp || '', o.skogsagare || '', o.inkopare || '',
      Math.round(o.skordat_m3 || 0), Math.round(o.skotat_m3 || 0), Math.round(o.oskotat_m3 || 0),
      o.skordare_klar || '', o.skotare_start || '',
    ].map(escape).join(';'))
    return [header.join(';'), ...rows].join('\n')
  }
  const exportCsv = () => {
    const blob = new Blob(['﻿' + buildCsv()], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `helikopter-${ar}-${String(manad).padStart(2, '0')}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }
  const sharaSammanfattning = async () => {
    const proc = manadsmal ? `${manadsmal.procent}% av månadens beställning (förväntat ${manadsmal.forvantadProcent}%)` : 'Ingen beställning satt'
    const txt = `Helikopter — ${MANAD[manad]} ${ar}\n${proc}\nSkördat: ${Math.round(totalSkordat).toLocaleString()} m³fub\nSkotat: ${Math.round(totalSkotat).toLocaleString()} m³fub\nOskotat: ${Math.round(totalOskotat).toLocaleString()} m³fub`
    const navAny = navigator as any
    if (navAny.share) { try { await navAny.share({ title: `Helikopter ${MANAD[manad]} ${ar}`, text: txt }) } catch { /* avbruten */ } }
    else { try { await navigator.clipboard.writeText(txt); alert('Kopierat till urklipp') } catch { alert(txt) } }
    setExportOpen(false)
  }

  // ============================================================
  // Render
  // ============================================================

  // Checklista-signaler för tom-vyn — oberoende, ingen hård-gejtning.
  const harBestallning = slutBest + gallBest > 0
  const harProduktion = manadData.length > 0
  const plAntal = useMemo(
    () => objektAlla.filter(o => o.ar === ar && o.manad === manad && (o.status === 'planerad' || o.status === 'pagaende')).length,
    [objektAlla, ar, manad]
  )
  const guideSteg = [
    { n: 1, titel: 'Beställning', klar: harBestallning, vantar: false, under: harBestallning ? `${Math.round(slutBest + gallBest).toLocaleString('sv-SE')} m³fub lovat` : 'Lägg in månadens beställning', href: `/bestallningar?ar=${ar}&manad=${manad}` as string | null, lank: 'Lägg in' as string | null },
    { n: 2, titel: 'Planera objekt', klar: plAntal > 0, vantar: false, under: plAntal > 0 ? `${plAntal} objekt planerade` : 'Planera objekt för månaden', href: `/objekt?ar=${ar}&manad=${manad}` as string | null, lank: 'Planera' as string | null },
    { n: 3, titel: 'Följ upp', klar: false, vantar: true, under: 'Väntar på produktion', href: null as string | null, lank: null as string | null },
  ]

  // Beställning + skördat + skotat per bolag, per spår. Skördat/skotat = SUM ur helikopter_vy per
  // vyns bolag-fält — ren summering av taggade objekt, INGEN gissning. Otaggad produktion
  // (bolag null/tomt → 'Okänt') samlas i 'Övrigt'. Bara bestallningar + helikopter_vy.
  const bolagRader = useMemo(() => {
    const lovatAcc: Record<'Slutavverkning' | 'Gallring', Record<string, number>> = { Slutavverkning: {}, Gallring: {} }
    for (const b of bestallningar) {
      const typ = b.typ === 'slutavverkning' ? 'Slutavverkning' : b.typ === 'gallring' ? 'Gallring' : null
      if (!typ) continue
      lovatAcc[typ][normalizeBolag(b.bolag)] = (lovatAcc[typ][normalizeBolag(b.bolag)] || 0) + (b.volym || 0)
    }
    const prodAcc: Record<'Slutavverkning' | 'Gallring', Record<string, { skordat: number; skotat: number }>> = { Slutavverkning: {}, Gallring: {} }
    for (const o of manadData) {
      const typ = (o.huvudtyp === 'Slutavverkning' || o.huvudtyp === 'Gallring') ? o.huvudtyp : null
      if (!typ) continue
      const namn = normalizeBolag(o.bolag) // null/tomt → 'Okänt' → Övrigt
      if (!prodAcc[typ][namn]) prodAcc[typ][namn] = { skordat: 0, skotat: 0 }
      prodAcc[typ][namn].skordat += o.skordat_m3 || 0
      prodAcc[typ][namn].skotat += o.skotat_m3 || 0
    }
    const bygg = (typ: 'Slutavverkning' | 'Gallring') => {
      const namn = new Set<string>([...Object.keys(lovatAcc[typ]), ...Object.keys(prodAcc[typ])])
      namn.delete('Okänt') // otaggad produktion hamnar i Övrigt-raden
      const rader = Array.from(namn).map(bolag => {
        const lovat = lovatAcc[typ][bolag] || 0
        const p = prodAcc[typ][bolag] || { skordat: 0, skotat: 0 }
        // Klar först när ALLT är framme: både skördat OCH skotat ≥ beställt.
        return { bolag, lovat, skordat: p.skordat, skotat: p.skotat, klar: lovat > 0 && p.skordat >= lovat && p.skotat >= lovat }
      }).sort((a, b) => (b.lovat - a.lovat) || (b.skordat - a.skordat)) // störst beställning först
      return { rader, ovrigt: prodAcc[typ]['Okänt'] ? prodAcc[typ]['Okänt'].skordat : 0 }
    }
    return { Slutavverkning: bygg('Slutavverkning'), Gallring: bygg('Gallring') }
  }, [bestallningar, manadData])

  // === KAPACITET (framåt): hinner maskinerna med månadens objekt — RÄKNAD kapacitet (dagar × 8) ===
  const kapacitet = useMemo(() => {
    const idag = new Date().toISOString().slice(0, 10)
    const monthObjekt = objektAlla.filter(o => o.ar === ar && o.manad === manad && (o.status === 'planerad' || o.status === 'pagaende'))
    const aktiv = (m: DimMaskin) => !m.aktiv_till || m.aktiv_till >= idag
    const kapMaskiner = dimMaskiner.filter(m => (m.maskin_typ === 'Harvester' || m.maskin_typ === 'Forwarder') && aktiv(m) && !m.extramaskin)
    const extraMaskiner = dimMaskiner.filter(m => m.extramaskin && aktiv(m))
    // Arbetsdagar (vardag, ej röd, ej passerad) — golv 8 h/dag
    const availableDays = arbetsdagarIManad(ar, manad, idag)
    const tillgangligaDagar = availableDays.length
    const totalKapacitet = tillgangligaDagar * TIMMAR_PER_DAG
    // Stoppdagar per maskin = availableDays som täcks av maskinens maskinstopp
    const stoppByMaskin: Record<string, { dagar: number; orsaker: string[] }> = {}
    for (const m of kapMaskiner) stoppByMaskin[m.maskin_id] = { dagar: 0, orsaker: [] }
    let antalStoppIManad = 0
    for (const st of maskinstoppData) {
      const traffar = availableDays.filter(d => d >= st.fran_datum && d <= st.till_datum).length
      if (traffar === 0) continue
      antalStoppIManad++
      const s = stoppByMaskin[st.maskin_id]
      if (s) { s.dagar += traffar; if (!s.orsaker.includes(st.orsak)) s.orsaker.push(st.orsak) }
    }
    // Timmar + hål per maskin (oförändrad logik från #137)
    const agg: Record<string, { timmar: number; antal: number; hal: number }> = {}
    for (const m of kapMaskiner) agg[m.maskin_id] = { timmar: 0, antal: 0, hal: 0 }
    const halIds = new Set<string>()
    const halLista: { namn: string; volym: number }[] = []
    for (const o of monthObjekt) {
      const mp = o.manuell_prognos || {}
      let objektHarHal = false
      for (const roll of ['skordare', 'skotare'] as const) {
        const utforare = roll === 'skordare' ? o.skordare_utforare : o.skotare_utforare
        if (utforare === 'egen' || utforare === 'extern') continue // bestämt — inte våra maskiner
        const maskinId = roll === 'skordare' ? o.skordare_maskin_id : o.skotare_maskin_id
        const tim = parseTimmar(mp[roll])
        if (tim != null && maskinId && agg[maskinId]) {
          agg[maskinId].timmar += tim
          agg[maskinId].antal += 1
        } else {
          objektHarHal = true
          if (maskinId && agg[maskinId]) agg[maskinId].hal += 1
        }
      }
      if (objektHarHal && !halIds.has(o.id)) {
        halIds.add(o.id)
        halLista.push({ namn: o.namn || o.vo_nummer || 'Objekt', volym: o.volym || 0 })
      }
    }
    const rader = kapMaskiner.map(m => {
      const a = agg[m.maskin_id]
      const stopp = stoppByMaskin[m.maskin_id]
      const maskinDagar = Math.max(0, tillgangligaDagar - stopp.dagar)
      const kapacitetH = maskinDagar * TIMMAR_PER_DAG
      const luft = kapacitetH - a.timmar
      const behovDagar = Math.ceil(a.timmar / TIMMAR_PER_DAG)
      let status: 'tom' | 'gul' | 'gron' | 'rod'
      if (a.antal === 0 && a.hal === 0) status = 'tom'
      else if (a.hal > 0) status = 'gul' // luften optimistisk — oräknat objekt ligger på maskinen
      else if (luft < 0) status = 'rod'
      else status = 'gron'
      return { maskin: m, timmar: a.timmar, antal: a.antal, hal: a.hal, luft, status, maskinDagar, kapacitetH, behovDagar, stoppDagar: stopp.dagar, stoppOrsaker: stopp.orsaker }
    }).sort((x, y) => x.luft - y.luft)
    const halVolym = halLista.reduce((s, h) => s + (h.volym || 0), 0)
    const harHal = halLista.length > 0
    const rollTightest = (typ: 'Harvester' | 'Forwarder') => {
      const k = rader.filter(r => r.maskin.maskin_typ === typ && r.antal > 0 && r.hal === 0)
      return k.length ? k.reduce((min, r) => (r.luft < min.luft ? r : min)) : null
    }
    const extraNamn = extraMaskiner.length ? maskinModell(extraMaskiner[0]) : null
    let besked: { status: 'vetej' | 'ifas' | 'efter'; rad1: string; rad2?: string }
    if (monthObjekt.length === 0) {
      besked = { status: 'vetej', rad1: 'Inga objekt inlagda för månaden än' }
    } else if (harHal) {
      const tightestFilled = rader.filter(r => r.antal > 0).sort((a, b) => a.luft - b.luft)[0]
      besked = {
        status: 'vetej',
        rad1: `${halLista.length} objekt saknar tid — ${Math.round(halVolym).toLocaleString('sv-SE')} m³fub oräknat`,
        rad2: tightestFilled ? `Räknat på det ifyllda: ${maskinModell(tightestFilled.maskin)} har ${Math.round(tightestFilled.luft).toLocaleString('sv-SE')} h luft` : 'Inga timmar ifyllda än',
      }
    } else {
      const over = rader.filter(r => r.luft < 0).sort((a, b) => a.luft - b.luft)[0]
      if (over) {
        besked = {
          status: 'efter',
          rad1: `${Math.round(-over.luft).toLocaleString('sv-SE')} h saknas på ${maskinModell(over.maskin)} — ${Math.round(over.timmar).toLocaleString('sv-SE')} h behövs, ${Math.round(over.kapacitetH).toLocaleString('sv-SE')} h finns`,
          rad2: extraNamn ? `Sätt in ${extraNamn}, eller flytta ett objekt.` : 'Flytta ett objekt eller planera övertid.',
        }
      } else {
        const tS = rollTightest('Harvester')
        const tF = rollTightest('Forwarder')
        const lufts = [tS?.luft, tF?.luft].filter((x): x is number => x != null)
        const z = lufts.length ? Math.min(...lufts) : totalKapacitet
        const parts = [tS && `${maskinModell(tS.maskin)} ${Math.round(tS.luft)} h`, tF && `${maskinModell(tF.maskin)} ${Math.round(tF.luft)} h`].filter(Boolean)
        besked = { status: 'ifas', rad1: `Ni hinner — ${Math.round(z).toLocaleString('sv-SE')} h ledigt`, rad2: parts.length ? `(${parts.join(', ')})` : undefined }
      }
    }
    return { rader, extraMaskiner, halLista, halVolym, harHal, besked, tillgangligaDagar, totalKapacitet, ingaStopp: antalStoppIManad === 0 }
  }, [objektAlla, dimMaskiner, maskinstoppData, ar, manad])

  const SPAR = [
    { typ: 'Slutavverkning' as const, Ikon: TreePine, farg: '#eab308', best: slutBest },
    { typ: 'Gallring' as const, Ikon: Trees, farg: '#22c55e', best: gallBest },
  ]

  return (
    <div
      ref={scrollRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, background: bg, color: text, fontFamily: ff, WebkitFontSmoothing: 'antialiased', overflowY: 'auto' }}
    >
      {(pullDistance > 0 || refreshing) && (
        <div style={{ height: pullDistance, display: 'flex', alignItems: 'center', justifyContent: 'center', color: muted, fontSize: 13, transition: refreshing ? 'height 0.2s' : 'none' }}>
          {refreshing ? 'Uppdaterar…' : pullDistance > 60 ? 'Släpp för att uppdatera' : 'Dra ned för att uppdatera'}
        </div>
      )}

      {/* Header — månadsväljare */}
      <div style={{ padding: '32px 24px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr 92px', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <button onClick={() => bytManad('prev')} style={{ width: 44, height: 44, borderRadius: 22, background: 'transparent', border: `1px solid ${divider}`, color: muted, fontSize: 22, cursor: 'pointer', fontFamily: ff }}>&#8249;</button>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{MANAD[manad]} {ar}</div>
            <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>
              {manadAvslutad ? 'Avslutad' : `${kvarDagar} arbetsdagar kvar`}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            <button onClick={() => bytManad('next')} style={{ width: 44, height: 44, borderRadius: 22, background: 'transparent', border: `1px solid ${divider}`, color: muted, fontSize: 22, cursor: 'pointer', fontFamily: ff }}>&#8250;</button>
            <button onClick={() => setExportOpen(true)} aria-label="Exportera" style={{ width: 44, height: 44, borderRadius: 22, background: 'transparent', border: `1px solid ${divider}`, color: muted, fontSize: 17, cursor: 'pointer', fontFamily: ff }}>&#x2BAD;</button>
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: muted }}>Laddar...</div>
      )}

      {!loading && (
        <div style={{ padding: '0 24px 120px' }}>
          {harProduktion ? (
          <>
          {/* Hero-procenten borttagen — den mätte skotat/beställt medan spåren visar skördat+skotat
              per typ (dubbelt budskap, och missvisande röd när skördat är över mål men skotat släpar).
              All skördat/skotat-status bärs tydligare av spårens mätare nedan. */}
          {!manadsmal && !manadAvslutad && (
            <div style={{ textAlign: 'center', padding: '8px 0 28px', color: muted, fontSize: 13 }}>
              Beställning ej satt
            </div>
          )}

          {/* Två spår — fyllda mätare: skördat mot mål + tunn skotat-mätare. Objekt-vyns ikoner/färger. */}
          <div style={{ ...card, padding: '4px 18px' }}>
            {SPAR.map((rad, i) => {
              const Ikon = rad.Ikon
              const d = sparData[rad.typ]
              const malet = rad.best > 0 ? rad.best : d.skordat
              const skordatPct = malet > 0 ? Math.min(100, (d.skordat / malet) * 100) : 0
              const skotatPct = malet > 0 ? Math.min(100, (d.skotat / malet) * 100) : 0
              const overMal = rad.best > 0 && d.skordat > rad.best
              const overTon = rad.typ === 'Slutavverkning' ? '#fde047' : '#4ade80' // ljusare typton = passerat mål
              return (
                <div key={rad.typ} style={{ borderTop: i === 1 ? `1px solid ${divider}` : 'none' }}>
                  {/* Header + mätare = tryckyta som fäller ut bolag-djupet (dragspel via oppetSpar) */}
                  <div onClick={() => setOppetSpar(oppetSpar === rad.typ ? null : rad.typ)} style={{ padding: '18px 0', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Ikon size={18} color={rad.farg} strokeWidth={2} />
                      <span style={{ fontSize: 15, fontWeight: 600, color: text }}>{rad.typ}</span>
                    </div>
                    <span style={{ transform: oppetSpar === rad.typ ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.3, fontSize: 11, flexShrink: 0 }}>▼</span>
                  </div>
                  {rad.best > 0 ? (<>
                  {/* Skördat-mätare (primär) — tal "X av beställt" till höger, symmetriskt med skotat */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: muted, width: 44, flexShrink: 0 }}>Skördat</span>
                    <div style={{ flex: 1, height: 7, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                      <div style={{ height: '100%', width: `${skordatPct}%`, background: rad.farg, borderRadius: 4, transition: 'width 0.6s ease' }} />
                      {overMal && <div style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 12, background: overTon }} />}
                    </div>
                    <span style={{ fontSize: 11, color: muted, fontVariantNumeric: 'tabular-nums', flexShrink: 0, whiteSpace: 'nowrap', width: 104, textAlign: 'right' }}><span style={{ color: rad.farg, fontWeight: 700 }}>{Math.round(d.skordat).toLocaleString('sv-SE')}</span> av {Math.round(rad.best).toLocaleString('sv-SE')}</span>
                  </div>
                  {/* Över beställt: HUR MYCKET — egen dämpad rad under talet, bryter inte den fasta talkolumnen. Bara skördat. */}
                  {overMal && (
                    <div style={{ fontSize: 10, color: '#8e8e93', textAlign: 'right', marginTop: -2, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>+{Math.round(d.skordat - rad.best).toLocaleString('sv-SE')} m³fub över beställt</div>
                  )}
                  {/* Skotat-mätare (tunn, dämpad) — samma "X av beställt" som skördat */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: muted, width: 44, flexShrink: 0 }}>Skotat</span>
                    <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${skotatPct}%`, background: `${rad.farg}80`, borderRadius: 2, transition: 'width 0.6s ease' }} />
                    </div>
                    <span style={{ fontSize: 11, color: muted, fontVariantNumeric: 'tabular-nums', flexShrink: 0, whiteSpace: 'nowrap', width: 104, textAlign: 'right' }}>{Math.round(d.skotat).toLocaleString('sv-SE')} av {Math.round(rad.best).toLocaleString('sv-SE')}</span>
                  </div>
                  </>) : (
                    /* Utan beställning → inget mål: skördat/skotat som tal, ingen mätare */
                    <div style={{ fontSize: 13, color: muted, fontVariantNumeric: 'tabular-nums' }}><span style={{ color: rad.farg, fontWeight: 700 }}>{Math.round(d.skordat).toLocaleString('sv-SE')}</span> skördat · {Math.round(d.skotat).toLocaleString('sv-SE')} skotat m³fub</div>
                  )}
                  </div>
                  {/* Bolag-djup (utfällt) — skördat + skotat mot beställt per bolag (två mätare, som huvudspåret).
                      Summerade taggade objekt ur helikopter_vy (ingen gissning); otaggat → Övrigt.
                      Klar-bock när BÅDE skördat OCH skotat ≥ beställt. */}
                  {oppetSpar === rad.typ && (() => {
                    const { rader, ovrigt } = bolagRader[rad.typ]
                    if (rader.length === 0 && ovrigt === 0) {
                      return <div style={{ paddingBottom: 14 }}><div style={{ padding: '6px 0 6px 30px', fontSize: 13, color: muted }}>Ingen beställning lagd för {rad.typ.toLowerCase()}.</div></div>
                    }
                    return (
                      <div style={{ paddingBottom: 14 }}>
                        {/* Saknar HELA spåret beställning? Säg det en gång — inte per bolag. */}
                        {rad.best === 0 && (
                          <div style={{ padding: '2px 0 6px 30px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Ingen beställning satt</div>
                        )}
                        {rader.map(bl => {
                          // Underordnat detalj-block: indraget med subtil vänsterlinje + luft, tunnare mätare
                          // och mindre etiketter än huvudspåret — tydlig hierarki i utfällt läge.
                          const blockStil: React.CSSProperties = { marginTop: 14, marginLeft: 28, paddingLeft: 12, borderLeft: '2px solid rgba(255,255,255,0.08)' }
                          // Skördat utan beställning — ingen nämnare att mäta mot.
                          if (bl.lovat === 0) {
                            return (
                              <div key={bl.bolag} style={{ ...blockStil, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>{bl.bolag}</span>
                                <span style={{ fontSize: 12, color: muted, fontVariantNumeric: 'tabular-nums' }}>{Math.round(bl.skordat).toLocaleString('sv-SE')} skördat · {Math.round(bl.skotat).toLocaleString('sv-SE')} skotat</span>
                              </div>
                            )
                          }
                          const skordatPct = Math.min(100, (bl.skordat / bl.lovat) * 100)
                          const skotatPct = Math.min(100, (bl.skotat / bl.lovat) * 100)
                          const vantar = Math.max(0, bl.skordat - bl.skotat)
                          const skotatFarg = rad.typ === 'Slutavverkning' ? '#8a6a2a' : '#31824f' // dämpad typfärg
                          return (
                            <div key={bl.bolag} style={blockStil}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, fontSize: 13, fontWeight: 500, color: bl.klar ? '#30d158' : 'rgba(255,255,255,0.7)' }}>
                                {bl.bolag}
                                {bl.klar && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                                )}
                              </div>
                              {/* Skördat-mätare — tal "X av beställt" till höger, symmetriskt med skotat */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 10, color: muted, width: 38, flexShrink: 0 }}>Skördat</span>
                                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${skordatPct}%`, background: rad.farg, borderRadius: 3, transition: 'width 0.6s ease' }} />
                                </div>
                                <span style={{ fontSize: 10, color: muted, fontVariantNumeric: 'tabular-nums', flexShrink: 0, whiteSpace: 'nowrap', width: 88, textAlign: 'right' }}>{Math.round(bl.skordat).toLocaleString('sv-SE')} av {Math.round(bl.lovat).toLocaleString('sv-SE')}</span>
                              </div>
                              {bl.skordat > bl.lovat && (
                                <div style={{ fontSize: 9, color: '#8e8e93', textAlign: 'right', marginTop: -2, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>+{Math.round(bl.skordat - bl.lovat).toLocaleString('sv-SE')} över beställt</div>
                              )}
                              {/* Skotat-mätare — samma "X av beställt" som skördat */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 10, color: muted, width: 38, flexShrink: 0 }}>Skotat</span>
                                <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${skotatPct}%`, background: skotatFarg, borderRadius: 2, transition: 'width 0.6s ease' }} />
                                </div>
                                <span style={{ fontSize: 10, color: muted, fontVariantNumeric: 'tabular-nums', flexShrink: 0, whiteSpace: 'nowrap', width: 88, textAlign: 'right' }}>{Math.round(bl.skotat).toLocaleString('sv-SE')} av {Math.round(bl.lovat).toLocaleString('sv-SE')}</span>
                              </div>
                              {/* Nämnaren står nu på varje mätare — kvar: bara det som väntar på skotning */}
                              {vantar > 0 && (
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', paddingLeft: 46, marginTop: 2 }}>{Math.round(vantar).toLocaleString('sv-SE')} väntar på skotning</div>
                              )}
                            </div>
                          )
                        })}
                        {ovrigt > 0 && (
                          /* Otaggat — svagare än kundraderna: en påminnelse, inte en kund */
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, padding: '2px 0 2px 30px', fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>
                            <span>Övrigt · otaggat</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(ovrigt).toLocaleString('sv-SE')} m³fub</span>
                          </div>
                        )}
                        {rader.length === 1 && ovrigt === 0 && rad.best > 0 && (
                          <div style={{ padding: '4px 0 2px 30px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Fler bolag visas när deras beställning läggs in</div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
            {sparData['Okänt'].skordat > 0 && (
              <div style={{ padding: '14px 0', borderTop: `1px solid ${divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: muted }}>
                <span>Okänt spår</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(sparData['Okänt'].skordat).toLocaleString('sv-SE')} skördat · {Math.round(sparData['Okänt'].skotat).toLocaleString('sv-SE')} skotat</span>
              </div>
            )}
          </div>
          </>
          ) : manadAvslutad ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: muted, fontSize: 13 }}>
              Ingen produktion registrerad för {MANAD[manad]}.
            </div>
          ) : (
            <>
              {/* GUIDE — vägledande checklista när månaden saknar produktion. Tre oberoende steg. */}
              <div style={{ textAlign: 'center', padding: '8px 0 20px', color: muted, fontSize: 13 }}>
                Inget skördat än i {MANAD[manad]} — så här sätter du upp månaden.
              </div>
              <div style={{ ...card, padding: '4px 18px' }}>
                {guideSteg.map((s, i) => (
                  <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', borderTop: i > 0 ? `1px solid ${divider}` : 'none' }}>
                    {s.klar ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
                      </svg>
                    ) : (
                      <div style={{ width: 22, height: 22, borderRadius: 11, border: `1.5px solid ${s.vantar ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.35)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: s.vantar ? muted : text, flexShrink: 0 }}>{s.n}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: s.vantar ? muted : text }}>{s.titel}</div>
                      <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>{s.under}</div>
                    </div>
                    {!s.klar && s.href && (
                      <Link href={s.href} style={{ fontSize: 14, fontWeight: 600, color: '#0a84ff', textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap' }}>{s.lank} ›</Link>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* === KAPACITET (framåt): hinner vi + finns luft — lägg TILL, rör inget ovan === */}
          {!manadAvslutad && (
            <div style={{ ...card, marginTop: 20, padding: '4px 18px' }}>
              <div style={{ padding: '16px 0 10px', fontSize: 13, color: muted }}>Kapacitet</div>
              {/* Arbetsdagar-rad — RÄKNAD kapacitet (vardagar − röda − passerade), inte hårdkodad */}
              <div style={{ fontSize: 13, color: text, paddingBottom: 12 }}>
                Arbetsdagar kvar i {MANAD[manad]}: <span style={{ fontWeight: 700 }}>{kapacitet.tillgangligaDagar}</span>
                <span style={{ color: muted }}> · 8 h/dag = {kapacitet.totalKapacitet.toLocaleString('sv-SE')} h</span>
              </div>
              {/* Besked — färg = status (i fas / efter / vet ej). Aldrig grönt på halv data. */}
              {(() => {
                const b = kapacitet.besked
                const farg = b.status === 'ifas' ? '#30d158' : b.status === 'efter' ? '#ff453a' : '#FF9F0A'
                const bakg = b.status === 'ifas' ? 'rgba(48,209,88,0.1)' : b.status === 'efter' ? 'rgba(255,69,58,0.1)' : 'rgba(255,159,10,0.1)'
                return (
                  <div style={{ background: bakg, borderRadius: 10, padding: '14px 16px', marginBottom: 4 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: farg }}>{b.rad1}</div>
                    {b.rad2 && <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>{b.rad2}</div>}
                  </div>
                )
              })()}
              {/* Noll stopp inlagda = vi räknar på FULL kapacitet. Visa det tyst — aldrig påstå mer än vi vet. */}
              {kapacitet.ingaStopp && (
                <div style={{ fontSize: 12, color: muted, padding: '10px 0 2px' }}>
                  Inga stopp inlagda för {MANAD[manad]} — räknat på full kapacitet.
                </div>
              )}
              {/* Per maskin — behövda timmar stort, luft/dagar under */}
              {kapacitet.rader.map((r) => {
                const farg = r.status === 'gron' ? '#30d158' : r.status === 'rod' ? '#ff453a' : r.status === 'gul' ? '#FF9F0A' : muted
                const stoppTxt = r.stoppDagar > 0 ? ` · ${r.stoppDagar} d ${r.stoppOrsaker.join('/')}` : ''
                const visaTal = r.status !== 'tom' && !(r.antal === 0 && r.hal > 0)
                let under: string
                if (r.status === 'tom') under = 'inga objekt inlagda ännu'
                else if (r.antal === 0 && r.hal > 0) under = `${r.hal} objekt saknar tid${stoppTxt}`
                else {
                  const luftTxt = r.luft < 0 ? `${Math.round(-r.luft)} h över` : `${Math.round(r.luft)} h luft`
                  under = `${luftTxt} · behöver ${r.behovDagar} d, har ${r.maskinDagar} d · ${r.antal} objekt${r.hal > 0 ? ` · ${r.hal} saknar tid` : ''}${stoppTxt}`
                }
                return (
                  <div key={r.maskin.maskin_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 0', borderTop: `1px solid ${divider}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color: text }}>{maskinModell(r.maskin)}</div>
                      <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>{under}</div>
                    </div>
                    {visaTal && (
                      <span style={{ fontSize: 22, fontWeight: 700, color: farg, fontVariantNumeric: 'tabular-nums', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {Math.round(r.timmar).toLocaleString('sv-SE')} h
                      </span>
                    )}
                  </div>
                )
              })}
              {/* Extramaskiner — buffert, ingen siffra */}
              {kapacitet.extraMaskiner.map(m => (
                <div key={m.maskin_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 0', borderTop: `1px solid ${divider}` }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: text }}>{maskinModell(m)}</div>
                  <span style={{ fontSize: 13, color: muted, flexShrink: 0, textAlign: 'right' }}>Extramaskin — sätts in vid behov</span>
                </div>
              ))}
              {/* Objekt utan tid — lugn grå checklista, inget larm */}
              {kapacitet.harHal && (
                <div style={{ borderTop: `1px solid ${divider}`, padding: '14px 0 4px' }}>
                  <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>
                    {kapacitet.halLista.length} objekt saknar tid — {Math.round(kapacitet.halVolym).toLocaleString('sv-SE')} m³fub oräknat
                  </div>
                  {kapacitet.halLista.map((h, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', padding: '3px 0' }}>· {h.namn}</div>
                  ))}
                </div>
              )}
              {/* Fotnot — buffert-principen */}
              <div style={{ borderTop: `1px solid ${divider}`, padding: '12px 0 16px', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                Räknat på 8 h dagtid. Övertid och extramaskin är er buffert — inte inräknade.
              </div>
            </div>
          )}
        </div>
      )}

      {exportOpen && (
        <Sheet title="Exportera" onClose={() => setExportOpen(false)}>
          <button onClick={exportCsv} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 56, padding: '12px 0', background: 'transparent', border: 'none', cursor: 'pointer', color: text, fontFamily: ff, fontSize: 17, textAlign: 'left', borderBottom: `1px solid ${divider}` }}>
            <span>Ladda ner CSV</span>
            <span style={{ fontSize: 13, color: muted }}>{`${ar}-${String(manad).padStart(2, '0')}.csv`}</span>
          </button>
          <button onClick={sharaSammanfattning} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 56, padding: '12px 0', background: 'transparent', border: 'none', cursor: 'pointer', color: text, fontFamily: ff, fontSize: 17, textAlign: 'left' }}>
            <span>Dela sammanfattning</span>
            <span style={{ fontSize: 13, color: muted }}>iOS Share / kopiera</span>
          </button>
        </Sheet>
      )}
    </div>
  )
}
