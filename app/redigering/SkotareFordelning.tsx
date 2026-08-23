'use client'
// Skotare-fördelning per objekt (steg 1). Fristående komponent — monteras i
// SubSkotare med import + en rad, minimal footprint mot RedigeringClient.tsx.
//
// Per skotare på objektet: mätt lass (default) + manuell korrigering som
// ERSÄTTER lass (aldrig adderar), manuell G15, och en "omlastning"-märkning.
// Omlastning = arbete (lass+G15 räknas per maskin) men volymen bidrar ALDRIG
// till objektets skotade total; länkas till det riktiga objektet via avser_objekt_id.
// Mjuk varning om SUM(volym exkl. omlastning) > avverkat — aldrig hård spärr.
// Skarpa regeln + total-omberäkningen bor i steg 2 (uppföljning).
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSkotareLass, type SkotareInsats } from './hooks/useSkotareLass'

const C = {
  panel: '#1b1b1d', row: '#232325', line: 'rgba(255,255,255,0.08)',
  text: '#f2f2f4', dim: 'rgba(255,255,255,0.45)', faint: 'rgba(255,255,255,0.3)',
  blue: '#0a84ff', orange: '#ff9f0a', red: '#ff453a', green: '#30d158', input: '#2a2a2c',
}

// Ett skotarrad-utkast. Normal skotare: bara `egen` (Utkört). Blandad: `egen` (egen skotning,
// räknas) + `omlastning` (räknas ALDRIG mot objektets skotade total) + `avser` (riktigt objekt).
type Utkast = { egen: string; omlastning: string; g15: string; blandad: boolean; avser: string | null }

function tillUtkast(i: SkotareInsats): Utkast {
  // Nya fält (volym_egen_skotning/volym_omlastning) primärt; fall tillbaka på legacy volym_m3 +
  // ar_omlastning så gamla rader visas rätt (ren volym = egen; gammal omlastningsrad = omlastning).
  const egenV = i.manuellEgen != null ? i.manuellEgen
    : (!i.arOmlastning && i.manuellVolym != null ? i.manuellVolym : null)
  const omlV = i.manuellOmlastning != null ? i.manuellOmlastning
    : (i.arOmlastning && i.manuellVolym != null ? i.manuellVolym : null)
  const blandad = i.arOmlastning || i.manuellOmlastning != null
  return {
    egen: egenV != null ? String(egenV) : '',
    omlastning: omlV != null ? String(omlV) : '',
    g15: i.manuellG15 != null ? String(i.manuellG15) : '',
    blandad,
    avser: i.avserObjektId,
  }
}
const TOM_UTKAST: Utkast = { egen: '', omlastning: '', g15: '', blandad: false, avser: null }
const num = (s: string): number | null => {
  const t = s.trim().replace(',', '.'); if (t === '') return null
  const n = Number(t); return Number.isFinite(n) ? n : null
}
// Egen (räknad) volym för totalen/kontrollen: ifylld egen ersätter mätt; tomt på en normal
// skotare = använd mätt; tomt på blandad = 0 (allt är omlastning). Omlastning räknas ALDRIG.
function effektivVolym(i: SkotareInsats, u: Utkast): number {
  const e = num(u.egen)
  if (e != null) return e
  return u.blandad ? 0 : i.mattVolym
}

export default function SkotareFordelning({
  objektId, avverkatVolym,
}: { objektId: string; avverkatVolym: number }) {
  const { insatser, forwarders, laddar, fel, ladda } = useSkotareLass(objektId)
  const [utkast, setUtkast] = useState<Record<string, Utkast>>({})
  const [extra, setExtra] = useState<SkotareInsats[]>([]) // manuellt tillagda (filfria) skotare
  const [sparar, setSparar] = useState(false)
  const [sparFel, setSparFel] = useState<string | null>(null)
  // Objekt som har en objekt-nivå-rad (maskin_id NULL) med RIKTIG volym när en
  // per-maskin-rad sparas ovanpå → explicit ersättning krävs (aldrig tyst).
  const [objektNivaKrock, setObjektNivaKrock] = useState<{ objektId: string; volym: number }[]>([])

  // Initiera utkast när datan laddats
  useEffect(() => {
    const u: Record<string, Utkast> = {}
    for (const i of insatser) u[i.maskinId] = tillUtkast(i)
    setUtkast(u); setExtra([])
  }, [insatser])

  const allaInsatser = useMemo(() => [...insatser, ...extra], [insatser, extra])

  const satt = (id: string, patch: Partial<Utkast>) =>
    setUtkast((prev) => ({ ...prev, [id]: { ...(prev[id] || TOM_UTKAST), ...patch } }))

  const laggTill = (m: { maskin_id: string; namn: string }) => {
    if (utkast[m.maskin_id]) return
    setExtra((e) => [...e, {
      maskinId: m.maskin_id, namn: m.namn, hemObjektId: objektId, mattVolym: 0, mattAntalLass: 0, mattG15: 0,
      radId: null, manuellVolym: null, manuellEgen: null, manuellOmlastning: null, manuellG15: null,
      arOmlastning: false, avserObjektId: null, notering: null,
    }])
    satt(m.maskin_id, { ...TOM_UTKAST })
  }

  // Summan EGEN skotning (exkl. omlastning) över VO-gruppen. HÅRD spärr: den får
  // ALDRIG överstiga avverkat. Omlastning omfattas ALDRIG av spärren (samma virke
  // flyttat andra gången — kan vara stort). +0.5 = avrundningsmarginal.
  const summaExkl = useMemo(
    () => allaInsatser.reduce((s, i) => s + effektivVolym(i, utkast[i.maskinId] || tillUtkast(i)), 0),
    [allaInsatser, utkast],
  )
  const overAvverkat = avverkatVolym > 0 && summaExkl > avverkatVolym + 0.5

  const dirty = (i: SkotareInsats): boolean => {
    const u = utkast[i.maskinId]; if (!u) return false
    const o = tillUtkast(i)
    return u.egen !== o.egen || u.omlastning !== o.omlastning || u.g15 !== o.g15
      || u.blandad !== o.blandad || (u.avser || null) !== (o.avser || null)
  }
  const nagotDirty = allaInsatser.some(dirty)

  const spara = async () => {
    // HÅRD spärr: egen skotning (exkl. omlastning) får aldrig överstiga avverkat.
    if (overAvverkat) {
      setSparFel(`Egen skotning (${Math.round(summaExkl).toLocaleString('sv-SE')} m³) överstiger avverkat (${Math.round(avverkatVolym).toLocaleString('sv-SE')} m³). Sänk egen skotning — eller flytta överskottet till omlastning (som inte räknas mot avverkat). Går inte att spara.`)
      return
    }
    setSparar(true); setSparFel(null)
    try {
      for (const i of allaInsatser) {
        const u = utkast[i.maskinId]; if (!u || !dirty(i)) continue
        const egen = num(u.egen)
        const oml = u.blandad ? num(u.omlastning) : null
        const payload: any = {
          // Nyckla på maskinens HEM-objekt (där dess lass ligger) så raden följer
          // sin mätta källa. Filfri/tillagd skotare → det öppnade objektet.
          objekt_id: i.hemObjektId || objektId, maskin_id: i.maskinId, datum_fran: null,
          volym_egen_skotning: egen,        // räknas mot objektets skotade total
          volym_omlastning: oml,            // räknas ALDRIG mot total (arbete)
          volym_m3: egen,                   // legacy-synk: räknad (egen) volym för äldre läsare
          g15_timmar: num(u.g15),
          ar_omlastning: u.blandad,
          avser_objekt_id: u.blandad ? (u.avser || null) : null,
        }
        // Verifierat sparande: läs tillbaka radantal. 0 utan error = RLS/behörighet.
        const q = i.radId
          ? supabase.from('skotare_objekt_manuell').update(payload).eq('id', i.radId).select('id')
          : supabase.from('skotare_objekt_manuell').insert(payload).select('id')
        const { data, error } = await q
        if (error) { setSparFel(`${i.namn}: ${error.message}`); setSparar(false); return }
        if (!data || data.length === 0) {
          setSparFel(`${i.namn}: sparningen nådde inga rader — troligen behörighet.`); setSparar(false); return
        }
      }

      // Städa objekt-nivå-spökrader (maskin_id NULL) på objekt vi rörde — annars
      // dubbel-G15 när en per-maskin-rad läggs ovanpå (id=119-fällan). Har NULL-
      // raden en RIKTIG volym (objekt-nivå-avslut) rör vi den ALDRIG tyst — den
      // flaggas för explicit ersättning nedan.
      const rorda = Array.from(new Set(allaInsatser.filter(dirty).map((i) => i.hemObjektId || objektId)))
      const krockar: { objektId: string; volym: number }[] = []
      for (const oid of rorda) {
        const { data: nullRader } = await supabase.from('skotare_objekt_manuell')
          .select('id, volym_m3, volym_egen_skotning, g15_timmar')
          .eq('objekt_id', oid).is('maskin_id', null).is('datum_fran', null)
        const nr = (nullRader || [])[0] as any
        if (!nr) continue
        const nrVol = Number(nr.volym_m3 ?? nr.volym_egen_skotning ?? 0)
        if (nrVol > 0) { krockar.push({ objektId: oid, volym: nrVol }); continue }
        // Ren spökrad (bara G15) → folda in G15 i en sparad maskin-rad som saknar
        // egen G15 (så 32h aldrig tappas), ta sedan bort raden + nolla dim_objekt-spegeln.
        const g15 = Number(nr.g15_timmar) || 0
        if (g15 > 0) {
          const utanG15 = allaInsatser.find((i) => (i.hemObjektId || objektId) === oid && num((utkast[i.maskinId] || TOM_UTKAST).g15) == null)
          if (utanG15) {
            await supabase.from('skotare_objekt_manuell').update({ g15_timmar: g15 })
              .eq('objekt_id', oid).eq('maskin_id', utanG15.maskinId).is('datum_fran', null)
          }
        }
        await supabase.from('skotare_objekt_manuell').delete().eq('id', nr.id)
        await supabase.from('dim_objekt').update({ skotning_g15_manuell: null }).eq('objekt_id', oid)
      }
      setObjektNivaKrock(krockar)
      setSparar(false); ladda()
    } catch (e: any) {
      setSparFel(e?.message || String(e)); setSparar(false)
    }
  }

  // Explicit ersättning: objekt-nivå-raden hade en riktig volym — ta bort den
  // (+ nolla dim_objekt-spegeln) så per-maskin-fördelningen blir enda sanningen.
  const ersattObjektNiva = async (oid: string) => {
    setSparar(true); setSparFel(null)
    try {
      const { error } = await supabase.from('skotare_objekt_manuell')
        .delete().eq('objekt_id', oid).is('maskin_id', null).is('datum_fran', null)
      if (error) { setSparFel('Kunde inte ta bort objekt-nivå-raden: ' + error.message); setSparar(false); return }
      await supabase.from('dim_objekt').update({ skotad_volym_manuell: null }).eq('objekt_id', oid)
      setObjektNivaKrock((prev) => prev.filter((k) => k.objektId !== oid))
      setSparar(false); ladda()
    } catch (e: any) {
      setSparFel(e?.message || String(e)); setSparar(false)
    }
  }

  if (laddar) return <div style={{ padding: '12px 16px', color: C.dim, fontSize: 13 }}>Laddar skotardata …</div>
  if (fel) return <div style={{ padding: '12px 16px', color: C.red, fontSize: 13 }}>Kunde inte läsa skotardata: {fel}</div>
  if (allaInsatser.length === 0 && forwarders.length === 0) return null

  return (
    <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
        Fördelning per skotare
      </div>

      {allaInsatser.length === 0 ? (
        <div style={{ fontSize: 13, color: C.faint, marginBottom: 10 }}>Ingen skotare har sänt filer än — lägg till manuellt:</div>
      ) : allaInsatser.map((i) => {
        const u = utkast[i.maskinId] || tillUtkast(i)
        return (
          <div key={i.maskinId} style={{ background: C.row, borderRadius: 12, padding: 12, marginBottom: 10, opacity: u.blandad ? 0.92 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{i.namn}</span>
              <span style={{ fontSize: 12, color: C.faint }}>
                lass: {i.mattVolym.toLocaleString('sv-SE')} m³ · {i.mattAntalLass} st · {i.mattG15.toFixed(1)} h
              </span>
            </div>

            {!u.blandad ? (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Falt label="Utkört (m³)" value={u.egen} placeholder={i.mattVolym ? String(Math.round(i.mattVolym)) : '0'}
                    onChange={(v) => satt(i.maskinId, { egen: v })} />
                  <Falt label="G15 (tim)" value={u.g15} placeholder={i.mattG15 ? i.mattG15.toFixed(1) : '0'}
                    onChange={(v) => satt(i.maskinId, { g15: v })} />
                </div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>Tomt = använd mätt. Ifyllt värde ersätter (adderar aldrig).</div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Falt label="Egen skotning (m³)" accent={C.green} value={u.egen}
                    placeholder={i.mattVolym ? String(Math.round(i.mattVolym)) : '0'}
                    onChange={(v) => satt(i.maskinId, { egen: v })} />
                  <Falt label="Omlastning (m³)" accent={C.orange} value={u.omlastning}
                    placeholder="0"
                    onChange={(v) => satt(i.maskinId, { omlastning: v })} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Falt label="G15 (tim)" value={u.g15} placeholder={i.mattG15 ? i.mattG15.toFixed(1) : '0'}
                    onChange={(v) => satt(i.maskinId, { g15: v })} />
                  <div style={{ flex: 1 }} />
                </div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>
                  Egen skotning räknas mot objektets skotade total. Omlastningsvolymen räknas som arbete — aldrig mot total.
                </div>
              </>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={u.blandad} onChange={(e) => satt(i.maskinId, { blandad: e.target.checked })} />
              <span style={{ fontSize: 14, color: u.blandad ? C.orange : C.text }}>Blandad — egen skotning + omlastning</span>
            </label>

            {u.blandad && (
              <AvserObjektValjare value={u.avser} onChange={(id) => satt(i.maskinId, { avser: id })} />
            )}
          </div>
        )
      })}

      {/* Lägg till filfri/annan skotare */}
      {forwarders.filter((f) => !utkast[f.maskin_id]).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {forwarders.filter((f) => !utkast[f.maskin_id]).map((f) => (
            <button key={f.maskin_id} onClick={() => laggTill(f)} style={{
              background: 'rgba(10,132,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 12px',
              color: C.blue, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>+ {f.namn}</button>
          ))}
        </div>
      )}

      {/* HÅRD spärr — går inte att spara. Omlastning omfattas aldrig. */}
      {overAvverkat && (
        <div style={{ padding: '8px 12px', background: 'rgba(255,69,58,0.1)', border: `1px solid rgba(255,69,58,0.35)`, borderRadius: 8, fontSize: 12, color: C.red, marginBottom: 10 }}>
          Egen skotning ({Math.round(summaExkl).toLocaleString('sv-SE')} m³) överstiger avverkat ({Math.round(avverkatVolym).toLocaleString('sv-SE')} m³). Går inte att spara. Sänk egen skotning — eller lägg överskottet som omlastning (räknas aldrig mot avverkat).
        </div>
      )}

      {/* Objekt-nivå-krock: en gammal objekt-nivå-rad med RIKTIG volym finns kvar.
          Aldrig tyst överskrivning — Martin väljer att ersätta den med per-maskin-fördelningen. */}
      {objektNivaKrock.map((k) => (
        <div key={k.objektId} style={{ padding: '10px 12px', background: 'rgba(255,159,10,0.1)', border: `1px solid rgba(255,159,10,0.3)`, borderRadius: 8, fontSize: 12, color: C.orange, marginBottom: 10 }}>
          Det finns en objekt-nivå-volym ({Math.round(k.volym).toLocaleString('sv-SE')} m³) kvar utöver per-maskin-fördelningen — annars dubbelräknas skotat. Ersätt den med fördelningen ovan?
          <button onClick={() => ersattObjektNiva(k.objektId)} disabled={sparar} style={{
            display: 'block', marginTop: 8, background: C.orange, border: 'none', borderRadius: 8, padding: '7px 12px',
            color: '#000', fontSize: 13, fontWeight: 600, cursor: sparar ? 'default' : 'pointer', fontFamily: 'inherit', opacity: sparar ? 0.6 : 1,
          }}>Ersätt objekt-nivå-volymen</button>
        </div>
      ))}

      {sparFel && <div style={{ padding: '8px 12px', background: 'rgba(255,69,58,0.1)', borderRadius: 8, fontSize: 12, color: C.red, marginBottom: 10 }}>{sparFel}</div>}

      {(() => {
        const kanSpara = nagotDirty && !sparar && !overAvverkat
        return (
          <button onClick={spara} disabled={!kanSpara} style={{
            width: '100%', height: 44, background: kanSpara ? C.green : '#2a2a2c',
            color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600,
            cursor: kanSpara ? 'pointer' : 'default', fontFamily: 'inherit', opacity: kanSpara ? 1 : 0.5,
          }}>
            {sparar ? 'Sparar …' : overAvverkat ? 'Egen skotning > avverkat' : 'Spara fördelning'}
          </button>
        )
      })()}
    </div>
  )
}

function Falt({ label, value, placeholder, onChange, accent }: { label: string; value: string; placeholder: string; onChange: (v: string) => void; accent?: string }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: 'block', fontSize: 11, color: accent || C.dim, marginBottom: 4, fontWeight: accent ? 600 : 400 }}>{label}</label>
      <input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', height: 40, background: C.input, border: `1px solid ${C.line}`, borderRadius: 10, padding: '0 12px', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
    </div>
  )
}

// Sök + länka det riktiga avverkningsobjektet (lös text-länk, ingen hård FK).
function AvserObjektValjare({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const [sok, setSok] = useState('')
  const [traffar, setTraffar] = useState<{ objekt_id: string; object_name: string; vo_nummer: string | null }[]>([])
  const [valtNamn, setValtNamn] = useState<string | null>(null)

  // Hämta namn för redan valt objekt
  useEffect(() => {
    if (!value) { setValtNamn(null); return }
    let av = false
    supabase.from('dim_objekt').select('object_name').eq('objekt_id', value).limit(1)
      .then(({ data }) => { if (!av) setValtNamn(data?.[0]?.object_name || value) })
    return () => { av = true }
  }, [value])

  useEffect(() => {
    const q = sok.trim(); if (q.length < 2) { setTraffar([]); return }
    let av = false
    const t = setTimeout(async () => {
      const { data } = await supabase.from('dim_objekt')
        .select('objekt_id, object_name, vo_nummer')
        .or(`object_name.ilike.*${q}*,vo_nummer.ilike.*${q}*`).limit(8)
      if (!av) setTraffar(data || [])
    }, 250)
    return () => { av = true; clearTimeout(t) }
  }, [sok])

  if (value) {
    return (
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
        <span style={{ color: C.dim }}>Avser:</span>
        <span style={{ fontWeight: 600 }}>{valtNamn || value}</span>
        <button onClick={() => { onChange(null); setSok(''); setValtNamn(null) }} style={{ background: 'none', border: 'none', color: C.blue, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>byt</button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      <input value={sok} onChange={(e) => setSok(e.target.value)} placeholder="Länka riktigt avverkningsobjekt (sök namn/VO) …"
        style={{ width: '100%', height: 40, background: C.input, border: `1px solid ${C.line}`, borderRadius: 10, padding: '0 12px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
      {traffar.length > 0 && (
        <div style={{ marginTop: 4, background: C.panel, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.line}` }}>
          {traffar.map((o) => (
            <button key={o.objekt_id} onClick={() => { onChange(o.objekt_id); setTraffar([]); setSok('') }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none',
              border: 'none', borderBottom: `1px solid ${C.line}`, color: C.text, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {o.object_name} {o.vo_nummer ? <span style={{ color: C.faint }}>· VO {o.vo_nummer}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
