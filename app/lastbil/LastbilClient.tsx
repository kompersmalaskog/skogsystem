'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import LastbilKarta from '@/components/LastbilKarta'

const C = {
  bg: '#09090b', card: '#131315', border: 'rgba(255,255,255,0.06)',
  t1: '#fafafa', t2: 'rgba(255,255,255,0.7)', t3: 'rgba(255,255,255,0.45)',
  green: '#22c55e', blue: '#3b82f6', orange: '#ff9f0a', red: '#ff453a',
}
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif"

type Punkt = { lat: number; lng: number; t?: string }
type Runda = {
  id: string; starttid: string | null; sluttid: string | null
  typ: 'flytt' | 'ovrig' | 'pagar'; antal_flytt: number
  matare_km: number | null; bransle_l: number | null; l_per_mil: number | null
}
type Data = {
  ok: boolean; harData: boolean; namn?: string | null
  position: { lat: number; lng: number; tidpunkt: string | null; alder_min: number | null } | null
  tank: { diesel_pct: number | null; adblue_pct: number | null; rackvidd_km: number | null } | null
  halsa: { har_lampor: boolean; lampor: { kod: string; namn: string; state: string }[]; service_km: number | null; matare_km: number | null; motortimmar: number | null } | null
  spar_idag: Punkt[]; runda_pagar: boolean; rundor: Runda[]; saknas: string[]
}

const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const DAG = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör']
function fmtDatum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${DAG[d.getDay()]} ${d.getDate()} ${MANAD[d.getMonth()]}`
}
function fmtAlder(min: number | null): string {
  if (min == null) return 'okänd tid'
  if (min < 1) return 'nyss'
  if (min < 60) return `för ${min} min sedan`
  const h = Math.floor(min / 60), m = min % 60
  return `för ${h} h${m ? ` ${m} min` : ''} sedan`
}

export default function LastbilClient() {
  const [data, setData] = useState<Data | null>(null)
  const [laddar, setLaddar] = useState(true)
  const [fel, setFel] = useState<string | null>(null)          // KUNDE INTE läsa (≠ äkta tomt)
  const [valdRunda, setValdRunda] = useState<string | null>(null)
  const [valtSpar, setValtSpar] = useState<Punkt[] | null>(null)
  const [sparLaddar, setSparLaddar] = useState(false)
  const kartaRef = useRef<HTMLDivElement>(null)

  async function las() {
    try {
      const r = await fetch('/api/lastbil', { cache: 'no-store' })
      if (r.status === 401) { setFel('Du är utloggad — logga in igen.'); setData(null); return }
      if (!r.ok) { setFel('Kunde inte läsa lastbilsdata just nu.'); return }
      const j = await r.json()
      if (!j?.ok) { setFel('Kunde inte läsa lastbilsdata just nu.'); return }
      setFel(null); setData(j)
    } catch {
      setFel('Kunde inte läsa lastbilsdata just nu.')
    } finally {
      setLaddar(false)
    }
  }

  useEffect(() => {
    las()
    const iv = setInterval(las, 60_000)   // färsk var 60:e s; cron skriver var 5:e min
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function valjRunda(id: string) {
    if (valdRunda === id) { setValdRunda(null); setValtSpar(null); return }   // avmarkera → tillbaka till idag
    setValdRunda(id); setValtSpar(null); setSparLaddar(true)
    kartaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    try {
      const r = await fetch(`/api/lastbil/spar?runda=${encodeURIComponent(id)}`, { cache: 'no-store' })
      const j = await r.json()
      setValtSpar(j?.ok ? (j.spar ?? []) : [])
    } catch {
      setValtSpar([])
    } finally {
      setSparLaddar(false)
    }
  }

  // Vilket spår ritas: vald runda > pågående runda (idag) > inget
  const kartSpar: Punkt[] = valdRunda ? (valtSpar ?? []) : (data?.runda_pagar ? (data.spar_idag ?? []) : [])
  const visarLinje = kartSpar.length >= 2

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '12px 16px calc(40px + env(safe-area-inset-bottom))', fontFamily: ff, color: C.t1 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 2px' }}>Lastbilen</h1>
      <div style={{ fontSize: 13, color: C.t3, marginBottom: 16 }}>
        {data?.namn ? `Scania ${data.namn}` : 'Scania'} · lever av GPS-loggen
      </div>

      {laddar && !data && (
        <div style={{ ...kortStil, color: C.t2, textAlign: 'center', padding: '28px 16px' }}>Läser lastbilsdata …</div>
      )}

      {fel && (
        <div style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.4)', borderRadius: 14, padding: 14, marginBottom: 14, fontSize: 13, color: C.t1 }}>
          {fel}
        </div>
      )}

      {data && !data.harData && !fel && (
        <div style={{ ...kortStil, color: C.t2, textAlign: 'center', padding: '28px 16px' }}>
          Ingen data från lastbilen än.
          <div style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>Så snart bilen loggar en position dyker den upp här.</div>
        </div>
      )}

      {data && data.harData && (
        <>
          {/* 1 — VAR ÄR DEN? */}
          <div ref={kartaRef} style={{ scrollMarginTop: 70 }}>
            <div style={raderStil}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.t2 }}>Var är den?</span>
              <span style={{ fontSize: 12, color: (data.position?.alder_min ?? 999) > 30 ? C.orange : C.t3 }}>
                Uppdaterad {fmtAlder(data.position?.alder_min ?? null)}
              </span>
            </div>
            <LastbilKarta position={data.position} spar={kartSpar} />
            <div style={{ fontSize: 11, color: C.t3, margin: '6px 2px 2px' }}>
              {sparLaddar ? 'Hämtar spår …'
                : visarLinje ? `GPS-spår (5 min-upplösning)${valdRunda ? ' · vald runda' : ' · pågående runda'}`
                : valdRunda ? 'Inga spårpunkter för den rundan.'
                : 'Ingen runda pågår — tryck en runda nedan för att se dess spår.'}
            </div>
          </div>

          {/* 2 — KAN JAG KÖRA? */}
          <Sektion titel="Kan jag köra?">
            <TankRad namn="Diesel" varde={data.tank?.diesel_pct} enhet="%" lag={data.tank?.diesel_pct != null && data.tank.diesel_pct < 25} />
            <TankRad namn="AdBlue" varde={data.tank?.adblue_pct} enhet="%" lag={data.tank?.adblue_pct != null && data.tank.adblue_pct < 20} />
            <TankRad namn="Räckvidd" varde={data.tank?.rackvidd_km} enhet=" km" lag={data.tank?.rackvidd_km != null && data.tank.rackvidd_km < 150} sista />
          </Sektion>

          {/* 3 — MÅR DEN BRA? */}
          <Sektion titel="Mår den bra?">
            {!data.halsa?.har_lampor ? (
              <div style={{ fontSize: 14, color: C.t3, padding: '2px 0 4px' }}>Varningslampor saknas i datan.</div>
            ) : data.halsa.lampor.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: C.green }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
                Inga varningar
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.halsa.lampor.map(l => (
                  <div key={l.kod} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: l.state === 'RED' ? C.red : C.orange }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>warning</span>
                    {l.namn}
                  </div>
                ))}
              </div>
            )}
            <div style={{ height: 1, background: C.border, margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.t2 }}>
              <span>Service om</span>
              <span style={{ color: C.t1, fontWeight: 600 }}>{data.halsa?.service_km != null ? `${data.halsa.service_km.toLocaleString('sv-SE')} km` : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.t3, marginTop: 8 }}>
              <span>Mätare {data.halsa?.matare_km != null ? `${data.halsa.matare_km.toLocaleString('sv-SE')} km` : '—'}</span>
              <span>Motortimmar {data.halsa?.motortimmar != null ? `${data.halsa.motortimmar.toLocaleString('sv-SE')} h` : '—'}</span>
            </div>
          </Sektion>

          {/* 4 — VAD HAR DEN GJORT? */}
          <Sektion titel="Vad har den gjort?">
            {data.rundor.length === 0 ? (
              <div style={{ fontSize: 14, color: C.t3 }}>Inga rundor än.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data.rundor.map((r, i) => (
                  <button key={r.id} onClick={() => valjRunda(r.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                    background: valdRunda === r.id ? 'rgba(59,130,246,0.12)' : 'none',
                    border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
                    borderRadius: valdRunda === r.id ? 10 : 0,
                    padding: '11px 8px', cursor: 'pointer', color: C.t1, fontFamily: ff, width: '100%',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDatum(r.starttid)}</div>
                      <div style={{ fontSize: 12, color: r.typ === 'ovrig' ? C.t3 : r.typ === 'pagar' ? C.green : C.t2, marginTop: 1 }}>
                        {r.typ === 'pagar' ? 'Pågår' : r.typ === 'ovrig' ? 'Övrig körning' : `Flytt${r.antal_flytt > 1 ? ` · ${r.antal_flytt} maskiner` : ''}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: C.t2, whiteSpace: 'nowrap' }}>
                      <div style={{ color: C.t1, fontWeight: 600 }}>{r.matare_km != null ? `${r.matare_km} km` : '—'}</div>
                      <div style={{ color: C.t3, marginTop: 1 }}>
                        {r.bransle_l != null ? `${r.bransle_l} l` : '—'}{r.l_per_mil != null ? ` · ${r.l_per_mil} l/mil` : ''}
                      </div>
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.t3 }}>
                      {valdRunda === r.id ? 'expand_less' : 'chevron_right'}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <Link href="/maskinflytt/sammanstallning" style={{ display: 'block', textAlign: 'center', marginTop: 14, fontSize: 13, color: C.blue, textDecoration: 'none' }}>
              Öppna hela Flyttloggen
            </Link>
          </Sektion>

          {data.saknas.length > 0 && (
            <div style={{ fontSize: 11, color: C.t3, textAlign: 'center', marginTop: 8 }}>
              Saknas i senaste avläsningen: {data.saknas.join(', ')}
            </div>
          )}
        </>
      )}
    </main>
  )
}

const kortStil: React.CSSProperties = {
  background: '#131315', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16,
  padding: 14, marginBottom: 14, fontSize: 14,
}
const raderStil: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }

function Sektion({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={kortStil}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.t2, marginBottom: 12 }}>{titel}</div>
      {children}
    </div>
  )
}

function TankRad({ namn, varde, enhet, lag, sista }: { namn: string; varde: number | null | undefined; enhet: string; lag?: boolean; sista?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: sista ? 'none' : `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 14, color: C.t2 }}>{namn}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: varde == null ? C.t3 : lag ? C.orange : C.t1 }}>
        {varde == null ? '—' : `${varde}${enhet}`}
      </span>
    </div>
  )
}
