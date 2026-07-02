'use client'
import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TreePine, Trees } from 'lucide-react'
import PageContainer from '@/components/PageContainer'

const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']
const TYP = {
  slutavverkning: { namn: 'Slutavverkning', Ikon: TreePine, farg: '#FF9F0A' },
  gallring: { namn: 'Gallring', Ikon: Trees, farg: '#30D158' },
} as const

type TypNyckel = keyof typeof TYP
type Bolag = { id: number; namn: string }
type Bestallning = { id: string; ar: number; manad: number; typ: TypNyckel; bolag: string; bolag_id: number | null; volym: number }

// Typ-ikon i typfärgen (lucide line-ikon, ersätter emoji).
function TypIkon({ typ, size }: { typ: TypNyckel; size: number }) {
  const Ikon = TYP[typ].Ikon
  return <Ikon size={size} color={TYP[typ].farg} strokeWidth={2} />
}

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('sv-SE')

export default function Bestallningar() {
  return <Suspense fallback={null}><BestallningarInner /></Suspense>
}

function BestallningarInner() {
  // Förval av månad från URL (?ar=&manad=), t.ex. från helikopter-guiden. Fallback: Juni 2026.
  const sp = useSearchParams()
  const arParam = parseInt(sp.get('ar') || '')
  const manadParam = parseInt(sp.get('manad') || '')
  const [year, setYear] = useState(Number.isFinite(arParam) ? arParam : 2026)
  const [month, setMonth] = useState(Number.isFinite(manadParam) && manadParam >= 1 && manadParam <= 12 ? manadParam - 1 : 5) // 0-index
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
    // Läs som inloggad användare (session-JWT via lib/supabase) — read_bestallningar
    // ger authenticated SELECT, och sidan är låst bakom login.
    const { data, error } = await supabase
      .from('bestallningar')
      .select('*')
      .eq('ar', year)
      .eq('manad', manad1)
      .order('volym', { ascending: false })
    if (error) { console.error('Kunde inte hämta beställningar:', error); setBestallningar([]) }
    else setBestallningar((data ?? []) as Bestallning[])
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
    // Merge-nyckel: (ar, manad, typ, bolag_id) — full nyckel, bälte och hängslen
    // mot att merga över fel månad om fetch-logiken nånsin ändras.
    const befintlig = bestallningar.find(b =>
      b.typ === valdTyp &&
      b.bolag_id === valdBolag.id &&
      b.ar === year &&
      b.manad === manad1
    )
    // Skriv som inloggad användare (session-JWT via lib/supabase) — RLS kräver authenticated.
    // Skriver BÅDE bolag_id OCH kanoniskt bolag.namn (helis text-match bevaras).
    const { error } = befintlig
      ? await supabase.from('bestallningar')
          .update({ volym: Number(befintlig.volym) + v, uppdaterad_at: new Date().toISOString() })
          .eq('id', befintlig.id)
      : await supabase.from('bestallningar')
          .insert({ ar: year, manad: manad1, typ: valdTyp, bolag_id: valdBolag.id, bolag: valdBolag.namn, volym: v })
    if (error) { console.error('Spara misslyckades:', error); alert('Kunde inte spara: ' + error.message); return }
    await fetchBestallningar()
    closeSheet()
  }

  const oppnaEdit = (b: Bestallning) => { setRedigerar(b); setRedVolym(String(Math.round(Number(b.volym)))); setSheet('edit') }

  const sparaRedigering = async () => {
    if (!redigerar) return
    const v = parseFloat(redVolym)
    if (!(v > 0)) return
    // Skriv som inloggad användare (session-JWT via lib/supabase).
    const { error } = await supabase.from('bestallningar')
      .update({ volym: v, uppdaterad_at: new Date().toISOString() })
      .eq('id', redigerar.id)
    if (error) { console.error('Uppdatering misslyckades:', error); alert('Kunde inte spara: ' + error.message); return }
    await fetchBestallningar()
    closeSheet()
  }

  const taBort = async () => {
    if (!redigerar) return
    if (!confirm(`Ta bort ${redigerar.bolag}s beställning på ${fmt(redigerar.volym)}?`)) return
    // Radera som inloggad användare (session-JWT via lib/supabase).
    const { error } = await supabase.from('bestallningar').delete().eq('id', redigerar.id)
    if (error) { console.error('Borttagning misslyckades:', error); alert('Kunde inte ta bort: ' + error.message); return }
    await fetchBestallningar()
    closeSheet()
  }

  const q = bolagQuery.trim().toLowerCase()
  const bolagFiltrerade = q ? bolagAlla.filter(b => b.namn.toLowerCase().includes(q)) : bolagAlla
  const exaktFinns = bolagAlla.some(b => b.namn.toLowerCase() === q)

  // ---- styles ----
  const navBtn: React.CSSProperties = { width: 44, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 22, cursor: 'pointer' }
  const kort: React.CSSProperties = { background: '#1c1c1e', borderRadius: 16, padding: 16 }
  const kundRad: React.CSSProperties = { width: '100%', minHeight: 44, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', textAlign: 'left' }
  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }
  // Centrerad till samma 480px-kolumn. left:0/right:0 behålls som ankare så att
  // margin:auto kan centrera ett position:fixed-element; centreringen sker via
  // margin (ej transform) så slide-animationen (translateY) inte krockar.
  const sheetWrap: React.CSSProperties = { position: 'fixed', left: 0, right: 0, bottom: 0, maxWidth: 480, margin: '0 auto', background: '#1c1c1e', borderRadius: '24px 24px 0 0', zIndex: 101, maxHeight: '88vh', overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom)', animation: closing ? 'slideDown 0.25s ease forwards' : 'slideUp 0.35s cubic-bezier(0.4,0,0.2,1)' }
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

      <PageContainer width="smal">

      {/* Månadsväljare (sidtiteln visas i toppbaren) */}
      <div style={{ padding: '60px 0 8px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <button onClick={() => bytManad(-1)} style={navBtn}>‹</button>
          <div style={{ fontSize: 22, fontWeight: 700, minWidth: 170 }}>{MANADER[month].toLowerCase()} {year}</div>
          <button onClick={() => bytManad(1)} style={navBtn}>›</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)' }}>Laddar…</div>
      ) : (
        <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(['slutavverkning', 'gallring'] as TypNyckel[]).map(typ => {
            const { rader, total } = perTyp(typ)
            const t = TYP[typ]
            return (
              <div key={typ} style={kort}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <TypIkon typ={typ} size={20} />
                  <span style={{ fontSize: 18, fontWeight: 600 }}>{t.namn}</span>
                </div>
                <div style={{ fontSize: 30, fontWeight: 700 }}>
                  {fmt(total)} <span style={{ fontSize: 15, fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}>m³fub beställt</span>
                </div>

                {/* Mix-stapel: varje kunds andel av typens total (riktig nämnare) */}
                {total > 0 && (
                  <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2, marginTop: 12, marginBottom: 12 }}>
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
      </PageContainer>

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
                      <TypIkon typ={typ} size={26} />
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
                  <TypIkon typ={valdTyp} size={22} />
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
                <TypIkon typ={redigerar.typ} size={28} />
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
