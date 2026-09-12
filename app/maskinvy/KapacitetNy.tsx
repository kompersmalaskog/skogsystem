'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { g15Sek } from '@/lib/g15'
import {
  bedomObjekt, kapacitetSnitt, kapacitetKlarsprak, behovText, kapacitetKategori, arExtern, arVindfalle,
  KAPACITET_PALITLIG_FRAN, MIN_OBJEKT_FOR_SNITT, MIN_OBJEKT_FOR_HINK,
  KATEGORI_LABEL, UTESLUTNING_LABEL,
  type KapacitetKategori, type KapacitetObjekt, type KapacitetObjektIn, type Uteslutning,
} from '@/lib/kapacitet'
import { C, FONT, MASKINER, COMBO_IDS, getPeriodRange, type Maskin, type Period } from './OversiktShared'

// ─────────────────────────────────────────────────────────────
// Kapacitet-vyn (?ny=1&vy=kapacitet) — hur många skotare skördaren
// behöver bakom sig, över tid. Planeringsmått, inte objektuppföljning.
//
// Svarar på: "behöver den här skördaren ½, 1 eller 1½ skotare?"
//
//   Slutavverkning · behöver 1½ skotare bakom skördaren
//   1 h 25 min skotning per timme skörd · 12 färdiga objekt
//
// Kvoten räknas per FÄRDIGT objekt och hänförs till perioden då skotningen
// avslutades — aldrig råtid per period, eftersom skotningen släpar efter
// skörden med dagar eller veckor och korta perioder då visar noll eller
// oändligt. Staplar: månad för K/Å, vecka för M, ett värde för V. Dag visas
// inte — "ej meningsfullt", inte brus.
//
// Reglerna (fyra undantag + två grundkrav + rimlighetsvakt) bor i
// lib/kapacitet.ts. Vyn bedömer inget själv.
// ─────────────────────────────────────────────────────────────

const KATEGORIER: KapacitetKategori[] = ['gallring', 'slutavverkning', 'vindfalle']

type DimObjektRad = {
  objekt_id: string; vo_nummer: string | null; object_name: string | null
  huvudtyp: string | null; atgard: string | null; risskotning: boolean | null
  extern_skordning: boolean | null; ovrigt_info: unknown
  skotning_avslutad: string | null; skotning_avslutad_auto: boolean | null
}

// Paginerad hämtning — PostgREST cappar svaret på 1 000 rader oavsett .limit().
async function hamtaAlla<T>(bygg: () => any): Promise<T[]> {
  const PAGE = 1000; const out: T[] = []; let from = 0
  while (true) {
    const { data, error } = await bygg().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data as T[]) || []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return out
}

function maskinTyp(m: any): 'skordare' | 'skotare' | 'okand' {
  const t = String(m?.maskin_typ || '').toLowerCase()
  if (t.includes('harvester') || t.includes('skördare') || t.includes('skordare')) return 'skordare'
  if (t.includes('forwarder') || t.includes('skotare')) return 'skotare'
  return 'okand'
}

/**
 * Alla VO-grupper som den valda skördaren kört, bedömda enligt lib/kapacitet.
 * Skotartiden är hela VO-gruppens; om två skördare delat VO (Svinhult:
 * R64101 + R64428) fördelas skotartiden efter skördarnas andel av skördartiden,
 * annars får varje skördare hela skotningen och kvoten blåses upp.
 */
async function hamtaObjekt(maskinId: string): Promise<KapacitetObjekt[]> {
  const egna = new Set(COMBO_IDS[maskinId] || [maskinId])

  // fakt_tid och fakt_produktion har OPERATÖRS-RLS (förare ser bara egna rader).
  // Maskinvyn läser dem därför via maskindata_*-RPC (SECURITY DEFINER, bara
  // maskindata) — aldrig direkt, och aldrig via vy_uppf_prod_per_objekt som är
  // security_invoker och ärver samma filter. Annars stämmer kvoten för admin
  // men blir fel för varje förare. Tidsraderna behövs för ALLA maskiner
  // (skotarna + andra skördare på delat VO); volymen bara för den valda.
  const dimMaskin = await hamtaAlla<{ maskin_id: string; maskin_typ: string | null }>(
    () => supabase.from('dim_maskin').select('maskin_id, maskin_typ').order('maskin_id'))
  const allaMaskinIds = dimMaskin.map(m => m.maskin_id)
  const egnaIds = Array.from(egna)

  const [dimObjekt, tidRader, manuellRader, prodRader] = await Promise.all([
    hamtaAlla<DimObjektRad>(() => supabase.from('dim_objekt').select('objekt_id, vo_nummer, object_name, huvudtyp, atgard, risskotning, extern_skordning, ovrigt_info, skotning_avslutad, skotning_avslutad_auto').order('objekt_id')),
    hamtaAlla<{ objekt_id: string | null; maskin_id: string; processing_sek: number | null; terrain_sek: number | null; other_work_sek: number | null }>(
      () => supabase.rpc('maskindata_tid', { p_maskin_ids: allaMaskinIds, p_datum_start: null, p_datum_slut: null })),
    hamtaAlla<{ objekt_id: string; maskin_id: string | null; g15_timmar: number | null }>(() => supabase.from('skotare_objekt_manuell').select('objekt_id, maskin_id, g15_timmar').order('id')),
    // Skördarens EGEN volym per objekt (rimlighetsvakten jämför den med skotartiden på samma VO).
    hamtaAlla<{ objekt_id: string | null; volym_m3sub: number | null }>(
      () => supabase.rpc('maskindata_produktion', { p_maskin_ids: egnaIds, p_datum_start: null, p_datum_slut: null })),
  ])

  const typAv = new Map<string, 'skordare' | 'skotare' | 'okand'>()
  dimMaskin.forEach(m => typAv.set(m.maskin_id, maskinTyp(m)))

  // objekt_id → VO-grupp, och gruppens metadata (typ, extern, färdig) ur alla dess rader.
  const gruppAv = new Map<string, string>()
  type Meta = { namn: string; kategori: KapacitetKategori | null; extern: boolean; skotningAvslutad: string | null }
  const meta = new Map<string, Meta>()
  for (const o of dimObjekt) {
    const g = o.vo_nummer ? `VO:${o.vo_nummer}` : `OBJ:${o.objekt_id}`
    gruppAv.set(o.objekt_id, g)
    const m = meta.get(g) || { namn: o.object_name || g, kategori: null, extern: false, skotningAvslutad: null }
    if (o.huvudtyp || arVindfalle(o.atgard)) m.kategori = kapacitetKategori(o) ?? m.kategori
    if (arExtern(o)) m.extern = true
    const klar = o.skotning_avslutad || (o.skotning_avslutad_auto ? '9999-12-31' : null)
    if (klar && (!m.skotningAvslutad || klar > m.skotningAvslutad)) m.skotningAvslutad = klar
    if (o.object_name && !o.vo_nummer) m.namn = o.object_name
    meta.set(g, m)
  }
  const gruppFor = (id: string) => gruppAv.get(id) || `OBJ:${id}`

  type Agg = { skEgen: number; skAlla: number; st: number; stMan: number; m3: number }
  const agg = new Map<string, Agg>()
  const A = (g: string): Agg => { let a = agg.get(g); if (!a) { a = { skEgen: 0, skAlla: 0, st: 0, stMan: 0, m3: 0 }; agg.set(g, a) } return a }

  for (const r of tidRader) {
    if (!r.objekt_id) continue
    const t = typAv.get(r.maskin_id) || 'okand'
    if (t === 'okand') continue
    const h = g15Sek(r.processing_sek, r.terrain_sek, r.other_work_sek) / 3600
    const a = A(gruppFor(r.objekt_id))
    if (t === 'skordare') { a.skAlla += h; if (egna.has(r.maskin_id)) a.skEgen += h }
    else a.st += h
  }
  for (const r of manuellRader) {
    if (!r.g15_timmar || r.g15_timmar <= 0) continue
    A(gruppFor(r.objekt_id)).stMan += r.g15_timmar
  }
  for (const r of prodRader) {
    if (!r.objekt_id) continue
    A(gruppFor(r.objekt_id)).m3 += r.volym_m3sub || 0
  }

  const ut: KapacitetObjekt[] = []
  for (const [g, a] of Array.from(agg.entries())) {
    if (a.skEgen <= 0) continue                       // skördaren har inte kört här
    const m = meta.get(g) || { namn: g, kategori: null, extern: false, skotningAvslutad: null }
    const andel = a.skAlla > 0 ? a.skEgen / a.skAlla : 1
    const rad: KapacitetObjektIn = {
      grupp: g, namn: m.namn, kategori: m.kategori, extern: m.extern,
      skotningAvslutad: m.skotningAvslutad === '9999-12-31' ? null : m.skotningAvslutad,
      skordG15h: a.skEgen,
      skotG15h: a.st * andel,
      skotG15hManuell: a.stMan * andel,
      skordadM3: a.m3,                 // redan skördarens egen volym (RPC på egna maskin-id)
    }
    ut.push(bedomObjekt(rad))
  }
  return ut
}

// ── Hinkar ───────────────────────────────────────────────────
type Hink = { key: string; label: string; start: string; end: string }

const MAN_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const pad2 = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

function isoVecka(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dag = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dag)
  const arStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - arStart.getTime()) / 86400000 + 1) / 7)
}

/** Månad för K/Å, vecka för M, ett värde för V. Klippt till perioden. */
function byggHinkar(period: Period, start: string, end: string): Hink[] {
  const s = new Date(start + 'T00:00:00'); const e = new Date(end + 'T00:00:00')
  if (period === 'V') return [{ key: start, label: 'Veckan', start, end }]
  const ut: Hink[] = []
  if (period === 'M') {
    // Måndag–söndag, första hinken kan börja före månadsskiftet (klipps).
    const d = new Date(s); d.setDate(d.getDate() - ((d.getDay() || 7) - 1))
    while (d <= e) {
      const hs = new Date(d); const he = new Date(d); he.setDate(he.getDate() + 6)
      const ks = hs < s ? s : hs; const ke = he > e ? e : he
      ut.push({ key: iso(hs), label: `v.${isoVecka(hs)}`, start: iso(ks), end: iso(ke) })
      d.setDate(d.getDate() + 7)
    }
    return ut
  }
  const d = new Date(s.getFullYear(), s.getMonth(), 1)
  while (d <= e) {
    const hs = new Date(d); const he = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const ks = hs < s ? s : hs; const ke = he > e ? e : he
    ut.push({ key: iso(hs), label: MAN_KORT[hs.getMonth()], start: iso(ks), end: iso(ke) })
    d.setMonth(d.getMonth() + 1)
  }
  return ut
}

function iPeriod(o: KapacitetObjekt, start: string, end: string): boolean {
  return !!o.skotningAvslutad && o.skotningAvslutad >= start && o.skotningAvslutad <= end
}

// ── Komponent ────────────────────────────────────────────────
export default function KapacitetNy({ maskin, onMaskinChange }: {
  maskin: Maskin
  onMaskinChange: (m: Maskin) => void
}) {
  const [period, setPeriod] = useState<Period>('K')
  const [offset, setOffset] = useState(0)
  const [alla, setAlla] = useState<KapacitetObjekt[] | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [maskinOpen, setMaskinOpen] = useState(false)
  const [kategori, setKategori] = useState<KapacitetKategori | null>(null)

  const { label, start, end } = getPeriodRange(period, offset)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setFel(null); setAlla(null); setKategori(null)
    hamtaObjekt(maskin.id)
      .then(d => { if (!cancelled) { setAlla(d); setLoading(false) } })
      .catch(e => { if (!cancelled) { setFel(e?.message || 'Kunde inte läsa maskindata'); setLoading(false) } })
    return () => { cancelled = true }
  }, [maskin.id])

  useEffect(() => {
    const el = document.getElementById('topbar-title')
    if (!el) return
    el.textContent = `${maskin.namn} — ${label}`
    return () => { el.textContent = 'Maskinvy' }
  }, [maskin.namn, label])

  // Objekt avslutade i perioden, uppdelade per kategori.
  const iPerioden = useMemo(() => (alla || []).filter(o => iPeriod(o, start, end)), [alla, start, end])

  // Förval = den kategori skördaren kört mest (skördartid) i perioden; annars totalt.
  useEffect(() => {
    if (!alla || kategori) return
    const vikt = (lista: KapacitetObjekt[]) => {
      const m = new Map<KapacitetKategori, number>()
      lista.forEach(o => { if (o.kategori) m.set(o.kategori, (m.get(o.kategori) || 0) + o.skordG15h) })
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    }
    setKategori(vikt(iPerioden) ?? vikt(alla) ?? 'slutavverkning')
  }, [alla, iPerioden, kategori])

  const valda = useMemo(() => iPerioden.filter(o => o.kategori === kategori), [iPerioden, kategori])
  const maskinmatta = useMemo(() => valda.filter(o => o.uteslutning === null && !o.manuell), [valda])
  const manuella = useMemo(() => valda.filter(o => o.uteslutning === null && o.manuell), [valda])
  const uteslutna = useMemo(() => {
    const m = new Map<Uteslutning, number>()
    valda.forEach(o => { if (o.uteslutning) m.set(o.uteslutning, (m.get(o.uteslutning) || 0) + 1) })
    return Array.from(m.entries())
  }, [valda])

  const snitt = kapacitetSnitt(maskinmatta)
  const snittMan = kapacitetSnitt(manuella)
  const palitlig = end >= KAPACITET_PALITLIG_FRAN
  const hinkar = useMemo(() => byggHinkar(period, start, end), [period, start, end])

  const kat = kategori ?? 'slutavverkning'

  return (
    <div style={{
      position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
      overflow: 'auto', background: C.bg, color: C.text,
      fontFamily: FONT, fontFeatureSettings: '"tnum"',
    }}>
      {/* ── Sticky header: maskin + period-nav + V/M/K/Å ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: C.bg, borderBottom: `0.5px solid ${C.divider}` }}>
        <div style={{ padding: '14px 16px', textAlign: 'center', position: 'relative' }}>
          <button
            onClick={() => setMaskinOpen(o => !o)}
            aria-expanded={maskinOpen}
            style={{ background: 'transparent', border: 'none', color: C.text, fontFamily: FONT, fontSize: 15, fontWeight: 600, letterSpacing: -0.3, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, minHeight: 44 }}
          >
            {maskin.namn}
            <span style={{ color: C.muted, fontSize: 11 }}>▾</span>
          </button>
          {maskinOpen && (
            <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', background: C.card, borderRadius: 12, marginTop: 6, minWidth: 260, overflow: 'hidden', zIndex: 100, boxShadow: '0 8px 28px rgba(0,0,0,0.6)' }}>
              {MASKINER.map(m => (
                <button
                  key={m.id}
                  onClick={() => { onMaskinChange(m); setMaskinOpen(false) }}
                  style={{ display: 'block', width: '100%', padding: '12px 16px', background: m.id === maskin.id ? 'rgba(255,255,255,0.06)' : 'transparent', border: 'none', color: C.text, fontFamily: FONT, fontSize: 14, cursor: 'pointer', textAlign: 'left', minHeight: 44 }}
                >{m.namn}</button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '12px 0 4px' }}>
          <button onClick={() => setOffset(o => o - 1)} aria-label="Föregående period"
            style={{ width: 44, height: 44, border: 'none', background: 'transparent', color: C.muted, fontSize: 22, cursor: 'pointer', fontFamily: FONT }}>‹</button>
          <div style={{ minWidth: 180, textAlign: 'center', fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: -0.3 }}>{label}</div>
          <button onClick={() => setOffset(o => Math.min(o + 1, 0))} disabled={offset >= 0} aria-label="Nästa period"
            style={{ width: 44, height: 44, border: 'none', background: 'transparent', color: offset >= 0 ? C.dim : C.muted, fontSize: 22, cursor: offset >= 0 ? 'default' : 'pointer', fontFamily: FONT }}>›</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 16px 10px' }}>
          <div style={{ display: 'inline-flex', background: 'rgba(120,120,128,0.16)', borderRadius: 10, padding: 2 }}>
            {(['V', 'M', 'K', 'Å'] as Period[]).map(p => (
              <button key={p} onClick={() => { setPeriod(p); setOffset(0) }}
                style={{ minWidth: 58, padding: '7px 18px', border: 'none', borderRadius: 8, background: period === p ? '#3a3a3c' : 'transparent', color: period === p ? C.text : C.muted, fontSize: 13, fontWeight: period === p ? 600 : 500, fontFamily: FONT, cursor: 'pointer', minHeight: 36 }}
              >{p}</button>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: C.dim, padding: '0 16px 12px' }}>
          Per dag visas inte — skotningen släpar efter skörden, så dagsvärden blir brus.
        </div>
      </div>

      {/* ── Innehåll ── */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '14px 16px 80px' }}>
        {/* Kategori — vindfälle aldrig inblandat i de andras snitt */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ display: 'inline-flex', background: 'rgba(120,120,128,0.16)', borderRadius: 10, padding: 2 }}>
            {KATEGORIER.map(k => (
              <button key={k} onClick={() => setKategori(k)}
                style={{ padding: '7px 14px', border: 'none', borderRadius: 8, background: kat === k ? '#3a3a3c' : 'transparent', color: kat === k ? C.text : C.muted, fontSize: 13, fontWeight: kat === k ? 600 : 500, fontFamily: FONT, cursor: 'pointer', minHeight: 36 }}
              >{KATEGORI_LABEL[k]}</button>
            ))}
          </div>
        </div>

        {/* Huvudkort — ETT tal per vy */}
        <div style={{ background: C.card, borderRadius: 14, padding: '16px 18px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
            {KATEGORI_LABEL[kat]} · {label}
          </div>
          {loading ? (
            <div style={{ fontSize: 14, color: C.muted }}>Läser maskindata …</div>
          ) : fel ? (
            <div style={{ fontSize: 14, color: C.muted }}>Kunde inte läsa maskindata — ladda om sidan.</div>
          ) : snitt.kvot === null || snitt.antal < MIN_OBJEKT_FOR_SNITT ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 600, color: C.muted, letterSpacing: -0.3 }}>För få färdiga objekt</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                {snitt.antal === 0 ? 'Inget objekt i kategorin blev färdigskotat i perioden.' : `${snitt.antal} färdigt objekt — behöver minst ${MIN_OBJEKT_FOR_SNITT} för ett behov.`}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', opacity: palitlig ? 1 : 0.55 }}>
                <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1, color: C.text }}>{behovText(snitt.kvot).tal}</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: -0.2 }}>skotare bakom skördaren</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                Behöver {behovText(snitt.kvot).tal} skotare · {kapacitetKlarsprak(snitt.kvot).stod} · {snitt.antal} färdiga objekt
              </div>
              {!palitlig && (
                <div style={{ fontSize: 12, color: C.orange, marginTop: 8, fontWeight: 600 }}>
                  Ej pålitlig data — uppbyggnad före {KAPACITET_PALITLIG_FRAN.slice(0, 4)}
                </div>
              )}
            </>
          )}
          {!loading && !fel && manuella.length > 0 && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${C.divider}` }}>
              + {manuella.length} objekt med manuellt rapporterad skotartid
              {snittMan.kvot !== null ? ` · behöver ${kapacitetKlarsprak(snittMan.kvot).tal} skotare` : ''}
              {' '}— räknas inte in i talet ovan
            </div>
          )}
          {!loading && !fel && uteslutna.length > 0 && (
            <div style={{ fontSize: 12, color: C.dim, marginTop: 8 }}>
              Räknas inte: {uteslutna.map(([u, n]) => `${n} ${UTESLUTNING_LABEL[u]}`).join(' · ')}
            </div>
          )}
        </div>

        {/* Staplar över tid */}
        {!loading && !fel && (
          <Staplar hinkar={hinkar} objekt={maskinmatta} period={period} palitlig={palitlig} />
        )}

        {/* Objekten bakom talet */}
        {!loading && !fel && maskinmatta.length > 0 && (
          <div style={{ background: C.card, borderRadius: 14, padding: '14px 18px 8px', marginTop: 12 }}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Färdiga objekt i perioden</div>
            {maskinmatta
              .slice()
              .sort((a, b) => (b.skotningAvslutad || '').localeCompare(a.skotningAvslutad || ''))
              .map(o => (
                <div key={o.grupp} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '8px 0', borderTop: `0.5px solid ${C.divider}` }}>
                  <span style={{ fontSize: 14, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.namn}</span>
                  <span style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>
                    {o.skotningAvslutad?.slice(5)} · {kapacitetKlarsprak(o.kvot!).tal} skotare
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Staplar ──────────────────────────────────────────────────
// En stapel per hink, höjd = kvoten, etikett = halvsteget i klarspråk.
// Tunn hink (< MIN_OBJEKT_FOR_HINK objekt) ritas tom med "–" — aldrig en
// siffra. En färg; informationen bärs av etiketten, inte av färgen.
function Staplar({ hinkar, objekt, period, palitlig }: { hinkar: Hink[]; objekt: KapacitetObjekt[]; period: Period; palitlig: boolean }) {
  const varden = hinkar.map(h => {
    const i = objekt.filter(o => iPeriod(o, h.start, h.end))
    const s = kapacitetSnitt(i)
    return { hink: h, antal: s.antal, kvot: s.antal >= MIN_OBJEKT_FOR_HINK ? s.kvot : null }
  })
  const max = Math.max(2, ...varden.map(v => v.kvot ?? 0))
  const H = 120
  return (
    <div style={{ background: C.card, borderRadius: 14, padding: '14px 18px 12px' }}>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
        {period === 'V' ? 'Veckan' : period === 'M' ? 'Per vecka' : 'Per månad'} · färdiga objekt
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: H + 34 }}>
        {varden.map(v => {
          const hojd = v.kvot !== null ? Math.max(4, (v.kvot / max) * H) : 0
          return (
            <div key={v.hink.key} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: v.kvot !== null ? C.text : C.dim, marginBottom: 4, opacity: palitlig ? 1 : 0.55 }}>
                {v.kvot !== null ? kapacitetKlarsprak(v.kvot).tal : '–'}
              </div>
              <div style={{
                width: '100%', maxWidth: 40, height: v.kvot !== null ? hojd : 4, borderRadius: 4,
                background: v.kvot !== null ? 'rgba(255,255,255,0.78)' : 'transparent',
                border: v.kvot !== null ? 'none' : `1px dashed ${C.dim}`,
                opacity: palitlig ? 1 : 0.55,
              }} />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6, whiteSpace: 'nowrap' }}>{v.hink.label}</div>
            </div>
          )
        })}
      </div>
      {varden.some(v => v.kvot === null) && (
        <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>– = för få färdiga objekt (under {MIN_OBJEKT_FOR_HINK})</div>
      )}
    </div>
  )
}
