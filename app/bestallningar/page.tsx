'use client'
import { useState, useEffect, useCallback } from 'react'

const SUPABASE_URL = 'https://mxydghzfacbenbgpodex.supabase.co'
// Anon-nyckeln lämnas oförändrad denna pass (flaggad för launch-härdning).
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWRnaHpmYWNiZW5iZ3BvZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NzU2MjMsImV4cCI6MjA4NDQ1MTYyM30.NRBG5HcAtEXRTyf4YTp71A3iATk6U3DGhfdJ5EYlMyo'
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }

const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']
const TYP = {
  slutavverkning: { namn: 'Slutavverkning', ikon: '🪵', farg: '#FF9F0A' },
  gallring: { namn: 'Gallring', ikon: '🌲', farg: '#30D158' },
} as const

type TypNyckel = keyof typeof TYP
type Bolag = { id: number; namn: string }
type Bestallning = { id: string; ar: number; manad: number; typ: TypNyckel; bolag: string; bolag_id: number | null; volym: number }

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('sv-SE')

export default function Bestallningar() {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(5) // 0-index, 5 = Juni
  const [bestallningar, setBestallningar] = useState<Bestallning[]>([])
  const [loading, setLoading] = useState(true)

  const [sheet, setSheet] = useState<null | 'ny' | 'edit'>(null)
  const [closing, setClosing] = useState(false)

  // Wizard
  const [steg, setSteg] = useState(1)
  const [valdTyp, setValdTyp] = useState<TypNyckel | null>(null)
  const [valdBolag, setValdBolag] = useState<Bolag | null>(null)
  const [valdVolym, setValdVolym] = useState('')
  const [bolagAlla, setBolagAlla] = useState<Bolag[]>([])
  const [bolagQuery, setBolagQuery] = useState('')
  const [bolagLaddar, setBolagLaddar] = useState(false)
  const [skapar, setSkapar] = useState(false)

  // Edit
  const [redigerar, setRedigerar] = useState<Bestallning | null>(null)
  const [redVolym, setRedVolym] = useState('')

  const manad1 = month + 1

  const fetchBestallningar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/bestallningar?select=*&ar=eq.${year}&manad=eq.${manad1}&order=volym.desc`, { headers: HEADERS })
      setBestallningar(res.ok ? await res.json() : [])
    } catch { setBestallningar([]) }
    setLoading(false)
  }, [year, manad1])

  useEffect(() => { fetchBestallningar() }, [fetchBestallningar])

  const bytManad = (dir: number) => {
    let m = month + dir, y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  const perTyp = (typ: TypNyckel) => {
    const rader = bestallningar.filter(b => b.typ === typ).sort((a, b) => Number(b.volym) - Number(a.volym))
    const total = rader.reduce((s, b) => s + (Number(b.volym) || 0), 0)
    return { rader, total }
  }

  const closeSheet = () => {
    setClosing(true)
    setTimeout(() => { setSheet(null); setClosing(false); setRedigerar(null) }, 250)
  }

  const oppnaNy = async () => {
    setSheet('ny'); setSteg(1); setValdTyp(null); setValdBolag(null); setValdVolym(''); setBolagQuery('')
    setBolagLaddar(true)
    try { const r = await fetch('/api/bolag'); const j = await r.json(); setBolagAlla(j.bolag || []) }
    catch { setBolagAlla([]) }
    setBolagLaddar(false)
  }

  const valjBolag = (b: Bolag) => { setValdBolag(b); setSteg(3) }

  const skapaOchValj = async () => {
    const namn = bolagQuery.trim()
    if (!namn || skapar) return
    setSkapar(true)
    try {
      const r = await fetch('/api/bolag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namn }) })
      const j = await r.json()
      if (r.ok && j.bolag) {
        setBolagAlla(prev => prev.some(x => x.id === j.bolag.id) ? prev : [...prev, j.bolag])
        valjBolag(j.bolag)
      }
    } catch {}
    setSkapar(false)
  }

  const spara = async () => {
    if (!valdTyp || !valdBolag) return
    const v = parseFloat(valdVolym)
    if (!(v > 0)) return
    try {
      // Merge-nyckel: (ar, manad, typ, bolag_id) — full nyckel, bälte och hängslen
      // mot att merga över fel månad om fetch-logiken nånsin ändras.
      const befintlig = bestallningar.find(b =>
        b.typ === valdTyp &&
        b.bolag_id === valdBolag.id &&
        b.ar === year &&
        b.manad === manad1
      )
      if (befintlig) {
        await fetch(`${SUPABASE_URL}/rest/v1/bestallningar?id=eq.${befintlig.id}`, {
          method: 'PATCH', headers: { ...HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ volym: Number(befintlig.volym) + v, uppdaterad_at: new Date().toISOString() }),
        })
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/bestallningar`, {
          method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' },
          // Skriver BÅDE bolag_id OCH kanoniskt bolag.namn (helis text-match bevaras).
          body: JSON.stringify({ ar: year, manad: manad1, typ: valdTyp, bolag_id: valdBolag.id, bolag: valdBolag.namn, volym: v }),
        })
      }
      await fetchBestallningar()
    } catch {}
    closeSheet()
  }

  const oppnaEdit = (b: Bestallning) => { setRedigerar(b); setRedVolym(String(Math.round(Number(b.volym)))); setSheet('edit') }

  const sparaRedigering = async () => {
    if (!redigerar) return
    const v = parseFloat(redVolym)
    if (!(v > 0)) return
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/bestallningar?id=eq.${redigerar.id}`, {
        method: 'PATCH', headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ volym: v, uppdaterad_at: new Date().toISOString() }),
      })
      await fetchBestallningar()
    } catch {}
    closeSheet()
  }

  const taBort = async () => {
    if (!redigerar) return
    if (!confirm(`Ta bort ${redigerar.bolag}s beställning på ${fmt(redigerar.volym)}?`)) return
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/bestallningar?id=eq.${redigerar.id}`, { method: 'DELETE', headers: HEADERS })
      await fetchBestallningar()
    } catch {}
    closeSheet()
  }

  const q = bolagQuery.trim().toLowerCase()
  const bolagFiltrerade = q ? bolagAlla.filter(b => b.namn.toLowerCase().includes(q)) : bolagAlla
  const exaktFinns = bolagAlla.some(b => b.namn.toLowerCase() === q)

  // ---- styles ----
  const navBtn: React.CSSProperties = { width: 44, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 22, cursor: 'pointer' }
  const kort: React.CSSProperties = { background: '#1c1c1e', borderRadius: 16, padding: 20 }
  const kundRad: React.CSSProperties = { width: '100%', minHeight: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', textAlign: 'left' }
  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }
  const sheetWrap: React.CSSProperties = { position: 'fixed', left: 0, right: 0, bottom: 0, background: '#1c1c1e', borderRadius: '24px 24px 0 0', zIndex: 101, maxHeight: '88vh', overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom)', animation: closing ? 'slideDown 0.25s ease forwards' : 'slideUp 0.35s cubic-bezier(0.4,0,0.2,1)' }
  const grip: React.CSSProperties = { padding: '14px 0 6px', display: 'flex', justifyContent: 'center', cursor: 'pointer' }
  const gripBar: React.CSSProperties = { width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }
  const sheetTitel: React.CSSProperties = { fontSize: 22, fontWeight: 700, textAlign: 'center', margin: '6px 0 20px' }
  const sokInput: React.CSSProperties = { width: '100%', padding: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, color: '#fff', fontSize: 17, outline: 'none', boxSizing: 'border-box' }
  const bolagRad: React.CSSProperties = { width: '100%', minHeight: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 4px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#fff', fontSize: 15, cursor: 'pointer', textAlign: 'left' }
  const tillbakaKnapp: React.CSSProperties = { width: '100%', padding: 16, background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 12, color: 'rgba(255,255,255,0.6)', fontSize: 16, cursor: 'pointer', marginTop: 16 }
  const volymInput: React.CSSProperties = { width: '100%', padding: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, color: '#fff', fontSize: 44, fontWeight: 700, textAlign: 'center', outline: 'none', boxSizing: 'border-box' }
  const primar = (farg: string, on: boolean): React.CSSProperties => ({ width: '100%', padding: 18, border: 'none', borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: on ? 'pointer' : 'default', background: on ? farg : 'rgba(255,255,255,0.1)', color: on ? '#000' : 'rgba(255,255,255,0.3)' })

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', paddingBottom: 120 }}>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes slideDown{from{transform:translateY(0)}to{transform:translateY(100%)}}`}</style>

      {/* Header + månadsväljare */}
      <div style={{ padding: '60px 20px 8px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Beställningar</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <button onClick={() => bytManad(-1)} style={navBtn}>‹</button>
          <div style={{ fontSize: 22, fontWeight: 700, minWidth: 170 }}>{MANADER[month].toLowerCase()} {year}</div>
          <button onClick={() => bytManad(1)} style={navBtn}>›</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)' }}>Laddar…</div>
      ) : (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(['slutavverkning', 'gallring'] as TypNyckel[]).map(typ => {
            const { rader, total } = perTyp(typ)
            const t = TYP[typ]
            return (
              <div key={typ} style={kort}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 24 }}>{t.ikon}</span>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>{t.namn}</span>
                </div>
                <div style={{ fontSize: 30, fontWeight: 700 }}>
                  {fmt(total)} <span style={{ fontSize: 15, fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}>m³fub beställt</span>
                </div>

                {/* Mix-stapel: varje kunds andel av typens total (riktig nämnare) */}
                {total > 0 && (
                  <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2, marginTop: 14, marginBottom: 16 }}>
                    {rader.map((b, i) => (
                      <div key={b.id} title={`${b.bolag}: ${fmt(b.volym)}`}
                        style={{ flex: `${(Number(b.volym) / total) * 100} 0 0`, background: t.farg, opacity: i % 2 === 0 ? 1 : 0.55, borderRadius: 2 }} />
                    ))}
                  </div>
                )}

                {rader.length === 0 ? (
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, padding: '12px 0' }}>Inga beställningar</div>
                ) : (
                  <div style={{ marginTop: total > 0 ? 0 : 14 }}>
                    {rader.map(b => (
                      <button key={b.id} onClick={() => oppnaEdit(b)} style={kundRad}>
                        <span style={{ fontSize: 15, fontWeight: 500 }}>{b.bolag}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{fmt(b.volym)} <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>m³fub</span></span>
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>›</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <button onClick={oppnaNy} style={{ width: '100%', padding: 18, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, color: '#fff', fontSize: 17, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>+ Ny beställning</button>
        </div>
      )}

      {sheet && <div onClick={closeSheet} style={overlay} />}

      {/* WIZARD */}
      {sheet === 'ny' && (
        <div style={sheetWrap}>
          <div onClick={closeSheet} style={grip}><div style={gripBar} /></div>
          <div style={{ padding: '0 24px 24px' }}>
            {steg === 1 && (
              <>
                <h2 style={sheetTitel}>Välj typ</h2>
                {(['slutavverkning', 'gallring'] as TypNyckel[]).map(typ => {
                  const t = TYP[typ]
                  return (
                    <button key={typ} onClick={() => { setValdTyp(typ); setSteg(2) }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '20px 22px', background: `${t.farg}1a`, border: `1px solid ${t.farg}55`, borderRadius: 18, cursor: 'pointer', marginBottom: 14 }}>
                      <span style={{ fontSize: 32 }}>{t.ikon}</span>
                      <span style={{ fontSize: 18, fontWeight: 600, color: t.farg }}>{t.namn}</span>
                    </button>
                  )
                })}
              </>
            )}

            {steg === 2 && (
              <>
                <h2 style={sheetTitel}>Välj bolag</h2>
                <input autoFocus value={bolagQuery} onChange={e => setBolagQuery(e.target.value)} placeholder="Sök eller skriv nytt" style={sokInput} />
                <div style={{ marginTop: 12 }}>
                  {bolagQuery.trim() && !exaktFinns && (
                    <button onClick={skapaOchValj} disabled={skapar}
                      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: 'rgba(10,132,255,0.15)', border: '1px solid rgba(10,132,255,0.4)', borderRadius: 12, color: '#0a84ff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 8, textAlign: 'left' }}>
                      <span>{skapar ? 'Skapar…' : `Lägg till ”${bolagQuery.trim()}”`}</span>
                      <span style={{ fontSize: 18 }}>+</span>
                    </button>
                  )}
                  {bolagLaddar ? (
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, padding: '12px 2px' }}>Laddar bolag…</div>
                  ) : bolagFiltrerade.map(b => (
                    <button key={b.id} onClick={() => valjBolag(b)} style={bolagRad}>
                      <span style={{ fontSize: 15, fontWeight: 500 }}>{b.namn}</span>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>›</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setSteg(1)} style={tillbakaKnapp}>← Tillbaka</button>
              </>
            )}

            {steg === 3 && valdTyp && valdBolag && (
              <>
                <h2 style={sheetTitel}>Ange volym</h2>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20, color: 'rgba(255,255,255,0.6)' }}>
                  <span style={{ fontSize: 26 }}>{TYP[valdTyp].ikon}</span>
                  <span style={{ fontSize: 17 }}>{valdBolag.namn}</span>
                </div>
                <input autoFocus type="number" inputMode="numeric" value={valdVolym} onChange={e => setValdVolym(e.target.value)} placeholder="0" style={volymInput} />
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 16, marginTop: 8, marginBottom: 22 }}>m³fub</div>
                <button onClick={spara} disabled={!valdVolym} style={primar(TYP[valdTyp].farg, !!valdVolym)}>Lägg till</button>
                <button onClick={() => setSteg(2)} style={tillbakaKnapp}>← Tillbaka</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* REDIGERA */}
      {sheet === 'edit' && redigerar && (
        <div style={sheetWrap}>
          <div onClick={closeSheet} style={grip}><div style={gripBar} /></div>
          <div style={{ padding: '0 24px 28px' }}>
            {/* Kontext (ej redigerbar) + Spara överst (iOS-mönster, top-right) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ fontSize: 36 }}>{TYP[redigerar.typ].ikon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{redigerar.bolag}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{TYP[redigerar.typ].namn} · {MANADER[(redigerar.manad || 1) - 1].toLowerCase()} {redigerar.ar}</div>
                </div>
              </div>
              <button onClick={sparaRedigering} disabled={!redVolym}
                style={{ flexShrink: 0, padding: '10px 18px', borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700, cursor: redVolym ? 'pointer' : 'default', background: redVolym ? '#fff' : 'rgba(255,255,255,0.1)', color: redVolym ? '#000' : 'rgba(255,255,255,0.3)' }}>Spara</button>
            </div>

            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>Volym</label>
            <input autoFocus type="number" inputMode="numeric" value={redVolym} onChange={e => setRedVolym(e.target.value)} style={volymInput} />
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 16, marginTop: 8 }}>m³fub</div>

            <button onClick={taBort} style={{ width: '100%', padding: 16, background: 'transparent', border: 'none', color: 'rgba(255,69,58,0.85)', fontSize: 15, fontWeight: 500, cursor: 'pointer', marginTop: 32 }}>Ta bort beställning</button>
          </div>
        </div>
      )}
    </div>
  )
}
