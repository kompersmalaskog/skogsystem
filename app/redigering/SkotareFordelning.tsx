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

type Utkast = { volym: string; g15: string; omlastning: boolean; avser: string | null }

function tillUtkast(i: SkotareInsats): Utkast {
  return {
    volym: i.manuellVolym != null ? String(i.manuellVolym) : '',
    g15: i.manuellG15 != null ? String(i.manuellG15) : '',
    omlastning: i.arOmlastning,
    avser: i.avserObjektId,
  }
}
const num = (s: string): number | null => {
  const t = s.trim().replace(',', '.'); if (t === '') return null
  const n = Number(t); return Number.isFinite(n) ? n : null
}
// Effektiv volym för totalen: manuell ersätter mätt; omlastning bidrar med 0.
function effektivVolym(i: SkotareInsats, u: Utkast): number {
  if (u.omlastning) return 0
  const man = num(u.volym)
  return man != null ? man : i.mattVolym
}

export default function SkotareFordelning({
  objektId, avverkatVolym,
}: { objektId: string; avverkatVolym: number }) {
  const { insatser, forwarders, laddar, fel, ladda } = useSkotareLass(objektId)
  const [utkast, setUtkast] = useState<Record<string, Utkast>>({})
  const [extra, setExtra] = useState<SkotareInsats[]>([]) // manuellt tillagda (filfria) skotare
  const [sparar, setSparar] = useState(false)
  const [sparFel, setSparFel] = useState<string | null>(null)

  // Initiera utkast när datan laddats
  useEffect(() => {
    const u: Record<string, Utkast> = {}
    for (const i of insatser) u[i.maskinId] = tillUtkast(i)
    setUtkast(u); setExtra([])
  }, [insatser])

  const allaInsatser = useMemo(() => [...insatser, ...extra], [insatser, extra])

  const satt = (id: string, patch: Partial<Utkast>) =>
    setUtkast((prev) => ({ ...prev, [id]: { ...(prev[id] || { volym: '', g15: '', omlastning: false, avser: null }), ...patch } }))

  const laggTill = (m: { maskin_id: string; namn: string }) => {
    if (utkast[m.maskin_id]) return
    setExtra((e) => [...e, {
      maskinId: m.maskin_id, namn: m.namn, mattVolym: 0, mattAntalLass: 0, mattG15: 0,
      radId: null, manuellVolym: null, manuellG15: null, arOmlastning: false, avserObjektId: null, notering: null,
    }])
    satt(m.maskin_id, { volym: '', g15: '', omlastning: false, avser: null })
  }

  // Summan exkl. omlastning — mjuk varning om den överstiger avverkat
  const summaExkl = useMemo(
    () => allaInsatser.reduce((s, i) => s + effektivVolym(i, utkast[i.maskinId] || tillUtkast(i)), 0),
    [allaInsatser, utkast],
  )
  const overAvverkat = avverkatVolym > 0 && summaExkl > avverkatVolym + 0.5

  const dirty = (i: SkotareInsats): boolean => {
    const u = utkast[i.maskinId]; if (!u) return false
    const o = tillUtkast(i)
    return u.volym !== o.volym || u.g15 !== o.g15 || u.omlastning !== o.omlastning || (u.avser || null) !== (o.avser || null)
  }
  const nagotDirty = allaInsatser.some(dirty)

  const spara = async () => {
    setSparar(true); setSparFel(null)
    try {
      for (const i of allaInsatser) {
        const u = utkast[i.maskinId]; if (!u || !dirty(i)) continue
        const payload: any = {
          objekt_id: objektId, maskin_id: i.maskinId, datum_fran: null,
          volym_m3: num(u.volym), g15_timmar: num(u.g15),
          ar_omlastning: u.omlastning,
          avser_objekt_id: u.omlastning ? (u.avser || null) : null,
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
        <div style={{ fontSize: 13, color: C.faint, marginBottom: 10 }}>Inga lass registrerade på objektet ännu.</div>
      ) : allaInsatser.map((i) => {
        const u = utkast[i.maskinId] || tillUtkast(i)
        return (
          <div key={i.maskinId} style={{ background: C.row, borderRadius: 12, padding: 12, marginBottom: 10, opacity: u.omlastning ? 0.85 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{i.namn}</span>
              <span style={{ fontSize: 12, color: C.faint }}>
                lass: {i.mattVolym.toLocaleString('sv-SE')} m³ · {i.mattAntalLass} st · {i.mattG15.toFixed(1)} h
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Falt label="Volym (m³)" value={u.volym} placeholder={i.mattVolym ? String(Math.round(i.mattVolym)) : '0'}
                onChange={(v) => satt(i.maskinId, { volym: v })} />
              <Falt label="G15 (tim)" value={u.g15} placeholder={i.mattG15 ? i.mattG15.toFixed(1) : '0'}
                onChange={(v) => satt(i.maskinId, { g15: v })} />
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>Tomt = använd mätt. Ifyllt värde ersätter (adderar aldrig).</div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={u.omlastning} onChange={(e) => satt(i.maskinId, { omlastning: e.target.checked })} />
              <span style={{ fontSize: 14, color: u.omlastning ? C.orange : C.text }}>Omlastning</span>
              {u.omlastning && <span style={{ fontSize: 11, color: C.faint }}>räknas som arbete, ej mot objektets skotade total</span>}
            </label>

            {u.omlastning && (
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

      {/* Mjuk varning — aldrig spärr */}
      {overAvverkat && (
        <div style={{ padding: '8px 12px', background: 'rgba(255,159,10,0.1)', border: `1px solid rgba(255,159,10,0.3)`, borderRadius: 8, fontSize: 12, color: C.orange, marginBottom: 10 }}>
          Skotad volym exkl. omlastning ({Math.round(summaExkl).toLocaleString('sv-SE')} m³) överstiger avverkat ({Math.round(avverkatVolym).toLocaleString('sv-SE')} m³). Kontrollera fördelning/omlastning — du bestämmer.
        </div>
      )}

      {sparFel && <div style={{ padding: '8px 12px', background: 'rgba(255,69,58,0.1)', borderRadius: 8, fontSize: 12, color: C.red, marginBottom: 10 }}>{sparFel}</div>}

      <button onClick={spara} disabled={!nagotDirty || sparar} style={{
        width: '100%', height: 44, background: nagotDirty && !sparar ? C.green : '#2a2a2c',
        color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600,
        cursor: nagotDirty && !sparar ? 'pointer' : 'default', fontFamily: 'inherit', opacity: nagotDirty && !sparar ? 1 : 0.5,
      }}>
        {sparar ? 'Sparar …' : 'Spara fördelning'}
      </button>
    </div>
  )
}

function Falt({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: 'block', fontSize: 11, color: C.dim, marginBottom: 4 }}>{label}</label>
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
