'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ── Tema — samma palett som förarflödet ──
const C = {
  bg: '#09090b', card: '#131315', border: 'rgba(255,255,255,0.06)',
  t1: '#fafafa', t2: 'rgba(255,255,255,0.7)', t3: 'rgba(255,255,255,0.45)',
  green: '#22c55e', blue: '#3b82f6', orange: '#ff9f0a', red: '#ff453a',
}
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif"

type PlatsTyp = 'verkstad' | 'uppstallning' | 'gard' | 'kund' | 'annat'

const TYP_LABEL: Record<PlatsTyp, string> = {
  verkstad: 'Verkstad', uppstallning: 'Uppställning', gard: 'Gård', kund: 'Kund', annat: 'Annat',
}

interface Plats {
  id: string
  namn: string
  typ: PlatsTyp
  lat: number | null
  lng: number | null
  adress: string | null
  kommentar: string | null
  aktiv: boolean
}

const TOMT: Omit<Plats, 'id' | 'aktiv'> = { namn: '', typ: 'verkstad', lat: null, lng: null, adress: null, kommentar: null }

// Administrativ vy (nås från flyttloggen, inte förarflödet): lista, lägg till,
// redigera, inaktivera. Inaktiva döljs ur förarflödets snabbval men historiken
// pekar kvar på raden — därför finns ingen radering här.
export default function PlatserClient() {
  const [platser, setPlatser] = useState<Plats[] | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [redigerar, setRedigerar] = useState<Plats | 'ny' | null>(null)
  const [form, setForm] = useState(TOMT)
  const [sparar, setSparar] = useState(false)
  const [gpsHamtar, setGpsHamtar] = useState(false)

  async function ladda() {
    setFel(null)
    const { data, error } = await supabase.from('flyttplats')
      .select('id, namn, typ, lat, lng, adress, kommentar, aktiv')
      .order('aktiv', { ascending: false }).order('namn')
    if (error) { setFel(`Kunde inte läsa platser: ${error.message}`); return }
    setPlatser(data as Plats[])
  }
  useEffect(() => { ladda() }, [])

  function oppnaNy() {
    setForm(TOMT)
    setRedigerar('ny')
  }
  function oppnaRedigering(pl: Plats) {
    setForm({ namn: pl.namn, typ: pl.typ, lat: pl.lat, lng: pl.lng, adress: pl.adress, kommentar: pl.kommentar })
    setRedigerar(pl)
  }

  function minPosition() {
    if (!('geolocation' in navigator)) { setFel('GPS stöds inte i den här webbläsaren'); return }
    setGpsHamtar(true)
    navigator.geolocation.getCurrentPosition(
      p => { setForm(f => ({ ...f, lat: p.coords.latitude, lng: p.coords.longitude })); setGpsHamtar(false) },
      e => { setFel(`GPS: ${e.message}`); setGpsHamtar(false) },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function spara() {
    if (!form.namn.trim() || sparar) return
    setSparar(true); setFel(null)
    const payload = {
      namn: form.namn.trim(),
      typ: form.typ,
      lat: form.lat,
      lng: form.lng,
      adress: form.adress?.trim() || null,
      kommentar: form.kommentar?.trim() || null,
    }
    const q = redigerar === 'ny'
      ? supabase.from('flyttplats').insert(payload).select('id')
      : supabase.from('flyttplats').update(payload).eq('id', (redigerar as Plats).id).select('id')
    const { data, error } = await q
    setSparar(false)
    if (error || !data?.length) {
      setFel(`Kunde inte spara: ${error?.message || 'inga rader sparades'}`)
      return
    }
    setRedigerar(null)
    ladda()
  }

  async function vaxlaAktiv(pl: Plats) {
    setFel(null)
    const { data, error } = await supabase.from('flyttplats')
      .update({ aktiv: !pl.aktiv }).eq('id', pl.id).select('id')
    if (error || !data?.length) {
      setFel(`Kunde inte ändra status: ${error?.message || 'inga rader sparades'}`)
      return
    }
    ladda()
  }

  const falt = (varde: string, satt: (v: string) => void, placeholder: string, autoFocus = false) => (
    <input
      value={varde} onChange={e => satt(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
      style={{
        width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: '11px 12px', fontSize: 15, color: C.t1, fontFamily: ff,
        marginBottom: 10, outline: 'none',
      }}
    />
  )

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: ff, WebkitFontSmoothing: 'antialiased', color: C.t1 }}>
      <style>{`.material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }`}</style>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '12px 16px calc(48px + env(safe-area-inset-bottom))' }}>

        <p style={{ fontSize: 14, color: C.t3, margin: '4px 0 16px' }}>
          Snabbval för flyttarnas start- och slutpunkter (verkstäder, uppställningar, kunder).
          Inaktiva döljs i förarflödet men historiken behålls.
        </p>

        {fel && (
          <div style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.4)', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13 }}>{fel}</div>
        )}

        {redigerar && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
              {redigerar === 'ny' ? 'Ny flyttplats' : `Redigera: ${(redigerar as Plats).namn}`}
            </div>
            {falt(form.namn, v => setForm(f => ({ ...f, namn: v })), 'Namn …', true)}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {(Object.keys(TYP_LABEL) as PlatsTyp[]).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, typ: t }))} style={{
                  background: form.typ === t ? 'rgba(59,130,246,0.18)' : C.bg,
                  color: form.typ === t ? C.blue : C.t2,
                  border: `1px solid ${form.typ === t ? 'rgba(59,130,246,0.6)' : C.border}`,
                  borderRadius: 10, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: ff,
                }}>{TYP_LABEL[t]}</button>
              ))}
            </div>
            {falt(form.adress ?? '', v => setForm(f => ({ ...f, adress: v })), 'Adress (valfritt) …')}
            {falt(form.kommentar ?? '', v => setForm(f => ({ ...f, kommentar: v })), 'Kommentar (valfritt) …')}
            <div style={{ fontSize: 13, color: C.t3, marginBottom: 10 }}>
              {form.lat != null && form.lng != null
                ? `Position: ${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}`
                : 'Ingen position — utan koordinat måste platsen pekas ut på kartan vid varje flytt.'}
              <button onClick={minPosition} disabled={gpsHamtar} style={{
                display: 'block', marginTop: 6, background: 'transparent', color: C.blue, border: 'none',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: ff, padding: 0,
                opacity: gpsHamtar ? 0.5 : 1,
              }}>{gpsHamtar ? 'Hämtar …' : 'Sätt till min position'}</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={spara} disabled={!form.namn.trim() || sparar} style={{
                flex: 1, background: C.blue, color: '#fff', border: 'none', borderRadius: 10,
                padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: ff,
                opacity: !form.namn.trim() || sparar ? 0.4 : 1,
              }}>{sparar ? 'Sparar …' : 'Spara'}</button>
              <button onClick={() => setRedigerar(null)} style={{
                flex: 1, background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: ff,
              }}>Avbryt</button>
            </div>
          </div>
        )}

        {!redigerar && (
          <button onClick={oppnaNy} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            background: 'transparent', border: `1px dashed ${C.border}`, borderRadius: 12,
            padding: '13px 14px', cursor: 'pointer', fontFamily: ff, color: C.t2, fontSize: 14,
            fontWeight: 600, marginBottom: 14,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.t3 }}>add_location_alt</span>
            Ny flyttplats …
          </button>
        )}

        {platser === null && !fel && (
          <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Laddar platser …</div>
        )}
        {platser !== null && platser.length === 0 && (
          <div style={{ color: C.t3, fontSize: 14, padding: 24, textAlign: 'center' }}>Inga flyttplatser ännu.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(platser || []).map(pl => (
            <div key={pl.id} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px',
              opacity: pl.aktiv ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.orange }}>
                  {pl.typ === 'verkstad' ? 'build' : 'location_on'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>
                    {pl.namn}
                    {!pl.aktiv && <span style={{ color: C.t3, fontWeight: 400 }}> · Inaktiv</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
                    {TYP_LABEL[pl.typ]}
                    {pl.adress ? ` · ${pl.adress}` : ''}
                    {pl.lat == null ? ' · saknar koordinat' : ''}
                  </div>
                  {pl.kommentar && <div style={{ fontSize: 12, color: C.t2, marginTop: 2 }}>{pl.kommentar}</div>}
                </div>
                <button onClick={() => oppnaRedigering(pl)} style={{
                  background: 'transparent', color: C.blue, border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: ff, padding: 4,
                }}>Redigera</button>
                <button onClick={() => vaxlaAktiv(pl)} style={{
                  background: 'transparent', color: pl.aktiv ? C.t3 : C.green, border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: ff, padding: 4,
                }}>{pl.aktiv ? 'Inaktivera' : 'Aktivera'}</button>
              </div>
            </div>
          ))}
        </div>

        <Link href="/maskinflytt/sammanstallning" style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 20,
          color: C.t3, fontSize: 14, fontWeight: 600, textDecoration: 'none', fontFamily: ff,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>list_alt</span>
          Till flyttloggen
        </Link>
      </main>
    </div>
  )
}
