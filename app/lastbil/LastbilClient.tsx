'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import LastbilKarta from '@/components/LastbilKarta'

const C = {
  bg: '#09090b', card: '#131315', card2: '#17171a', border: 'rgba(255,255,255,0.06)',
  t1: '#fafafa', t2: 'rgba(255,255,255,0.72)', t3: 'rgba(255,255,255,0.45)', t4: 'rgba(255,255,255,0.30)',
  green: '#22c55e', blue: '#3b82f6', orange: '#ff9f0a', red: '#ff453a',
}
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif"

type Punkt = { lat: number; lng: number; t?: string }
type Segment = { coords: [number, number][]; matchad: boolean }
type KartData = { segment: Segment[]; punkter: Punkt[]; nagonOmatchad: boolean; matchningPa: boolean }
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
  runda_pagar: boolean; oppen_runda_id: string | null
  oppen_runda: { id: string; starttid: string | null; live_km: number | null; maskin: { namn: string; lage: 'flaket' | 'lossad' } | null } | null
  parkerad: { plats: string; sedan: string | null } | null
  rundor: Runda[]; saknas: string[]
}
type ManadF = { manad: string; mil: number; diesel_l: number; l_per_mil: number | null
  flytt: { mil: number; diesel_l: number; l_per_mil: number | null }
  ovrig: { mil: number; diesel_l: number; l_per_mil: number | null } }

const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const MANAD_LANG = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']
const DAG = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör']
function fmtDatum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${DAG[d.getDay()]} ${d.getDate()} ${MANAD[d.getMonth()]}`
}
function fmtKlocka(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}
function fmtAlder(min: number | null): string {
  if (min == null) return 'okänd tid'
  if (min < 1) return 'nyss'
  if (min < 60) return `för ${min} min sedan`
  const h = Math.floor(min / 60), m = min % 60
  return `för ${h} h${m ? ` ${m} min` : ''} sedan`
}
/** "sedan 13:16", "sedan igår 13:16", "sedan 3 aug 13:16" */
function fmtSedan(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso), nu = new Date()
  const dagStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDagar = Math.round((dagStart(nu) - dagStart(d)) / 86400000)
  const kl = fmtKlocka(iso)
  if (diffDagar <= 0) return `sedan ${kl}`
  if (diffDagar === 1) return `sedan igår ${kl}`
  if (diffDagar < 7) return `sedan ${DAG[d.getDay()]} ${kl}`
  return `sedan ${d.getDate()} ${MANAD[d.getMonth()]} ${kl}`
}
function manadNamn(m: string): string {
  const [y, mm] = m.split('-')
  return `${MANAD_LANG[Number(mm) - 1]} ${y}`
}

// Avvikelse: det som kräver handling tar över hero:n. Röd > orange, allvarligast vinner.
function harledAvvikelse(data: Data): { niva: 'rod' | 'orange'; rubrik: string; under: string } | null {
  const lampor = data.halsa?.lampor ?? []
  if (lampor.length > 0) {
    return { niva: 'rod', rubrik: lampor.length === 1 ? `${lampor[0].namn} lyser` : `${lampor.length} varningslampor lyser`, under: 'Kontrollera bilen' }
  }
  const d = data.tank?.diesel_pct, a = data.tank?.adblue_pct, r = data.tank?.rackvidd_km
  if (d != null && d < 15) return { niva: 'rod', rubrik: `Diesel ${Math.round(d)} % — tanka nu`, under: r != null ? `Räckvidd ${r} km` : 'Låg nivå' }
  if (d != null && d < 25) return { niva: 'orange', rubrik: `Diesel ${Math.round(d)} % — tanka snart`, under: r != null ? `Räckvidd ${r} km` : 'Planera tankning' }
  if (r != null && r < 150) return { niva: 'orange', rubrik: `Räckvidd ${r} km — tanka snart`, under: 'Planera tankning' }
  if (a != null && a < 20) return { niva: 'orange', rubrik: `AdBlue ${Math.round(a)} % — fyll på`, under: 'Låg AdBlue-nivå' }
  return null
}

export default function LastbilClient() {
  const [data, setData] = useState<Data | null>(null)
  const [laddar, setLaddar] = useState(true)
  const [fel, setFel] = useState<string | null>(null)
  const [pollN, setPollN] = useState(0)
  const [valdRunda, setValdRunda] = useState<string | null>(null)
  const [kartData, setKartData] = useState<KartData | null>(null)
  const [sparLaddar, setSparLaddar] = useState(false)
  const [forbr, setForbr] = useState<ManadF[] | null>(null)
  const [manIx, setManIx] = useState(0)
  const [tankOppen, setTankOppen] = useState(false)
  const [halsaOppen, setHalsaOppen] = useState(false)
  const kartaRef = useRef<HTMLDivElement>(null)
  const sistaAktivRef = useRef<string | null>(null)

  async function las() {
    try {
      const r = await fetch('/api/lastbil', { cache: 'no-store' })
      if (r.status === 401) { setFel('Du är utloggad — logga in igen.'); setData(null); return }
      if (!r.ok) { setFel('Kunde inte läsa lastbilsdata just nu.'); return }
      const j = await r.json()
      if (!j?.ok) { setFel('Kunde inte läsa lastbilsdata just nu.'); return }
      setFel(null); setData(j); setPollN(n => n + 1)
    } catch { setFel('Kunde inte läsa lastbilsdata just nu.') }
    finally { setLaddar(false) }
  }

  useEffect(() => {
    las()
    fetch('/api/lastbil/forbrukning', { cache: 'no-store' })
      .then(r => r.json()).then(j => { if (j?.ok) setForbr(j.manader ?? []) }).catch(() => {})
    const iv = setInterval(las, 60_000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function valjRunda(id: string) {
    if (valdRunda === id) { setValdRunda(null); return }
    setValdRunda(id)
    kartaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Aktiv runda: vald > pågående > inget. Spåret hämtas + map-matchas.
  const aktivRunda = valdRunda ?? (data?.runda_pagar ? data.oppen_runda_id : null)
  useEffect(() => {
    if (!aktivRunda) { setKartData(null); sistaAktivRef.current = null; return }
    const bytte = sistaAktivRef.current !== aktivRunda
    sistaAktivRef.current = aktivRunda
    let avbruten = false
    if (bytte) setSparLaddar(true)
    fetch(`/api/lastbil/spar?runda=${encodeURIComponent(aktivRunda)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!avbruten) setKartData(j?.ok ? { segment: j.segment ?? [], punkter: j.spar ?? [], nagonOmatchad: !!j.nagonOmatchad, matchningPa: !!j.matchningPa } : { segment: [], punkter: [], nagonOmatchad: false, matchningPa: false }) })
      .catch(() => { if (!avbruten) setKartData({ segment: [], punkter: [], nagonOmatchad: false, matchningPa: false }) })
      .finally(() => { if (!avbruten && bytte) setSparLaddar(false) })
    return () => { avbruten = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktivRunda, pollN])

  const kartSegment = kartData?.segment ?? []
  const kartPunkter = kartData?.punkter ?? []
  const visarLinje = kartSegment.length >= 1
  const rullar = !!(data?.oppen_runda) && !valdRunda
  const kartHojd = rullar ? 264 : (valdRunda ? 240 : 150)

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '10px 16px calc(40px + env(safe-area-inset-bottom))', fontFamily: ff, color: C.t1 }}>
      {laddar && !data && (
        <div style={{ ...kortStil, color: C.t2, textAlign: 'center', padding: '28px 16px', marginTop: 8 }}>Läser lastbilsdata …</div>
      )}

      {fel && (
        <div style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.4)', borderRadius: 14, padding: 16, margin: '8px 0 14px', fontSize: 13, color: C.t1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <span>{fel}</span>
          <button onClick={() => { setLaddar(true); las() }} style={knappStil}>Försök igen</button>
        </div>
      )}

      {data && !data.harData && !fel && (
        <div style={{ ...kortStil, color: C.t2, textAlign: 'center', padding: '28px 16px', marginTop: 8 }}>
          Ingen data från lastbilen än.
          <div style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>Så snart bilen loggar en position dyker den upp här.</div>
        </div>
      )}

      {data && data.harData && (() => {
        const avvik = harledAvvikelse(data)
        const oppen = data.oppen_runda
        const park = data.parkerad
        return (
          <>
            {/* ── STATUS-HEADLINE: hela svaret på en rad, färg = läge ── */}
            <StatusHero avvik={avvik} oppen={oppen} park={park} alder_min={data.position?.alder_min ?? null} namn={data.namn} />

            {/* ── KARTA ── */}
            <div ref={kartaRef} style={{ scrollMarginTop: 70, marginBottom: 12 }}>
              <LastbilKarta position={data.position} segment={kartSegment} punkter={kartPunkter} height={kartHojd} puls={rullar} />
              <div style={{ fontSize: 11, color: C.t3, margin: '6px 2px 2px' }}>
                {sparLaddar ? 'Hämtar och matchar spår …'
                  : visarLinje ? `Kört spår · grov upplösning${valdRunda ? ' · vald runda' : ''}`
                  : rullar ? 'Väntar på spår för rundan …'
                  : valdRunda ? 'Inga spårpunkter för den rundan.'
                  : `Senaste position${park ? ` — ${park.plats}` : ''} · tryck en runda för spår`}
              </div>
            </div>

            {/* ── KAN JAG KÖRA? (ihopfällt) ── */}
            <KanJagKora tank={data.tank} oppen={tankOppen} onToggle={() => setTankOppen(v => !v)} />

            {/* ── MÅR DEN BRA? (ihopfällt) ── */}
            <MarDenBra halsa={data.halsa} oppen={halsaOppen} onToggle={() => setHalsaOppen(v => !v)} />

            {/* ── VAD DRAR DEN? ── */}
            <VadDrarDen forbr={forbr} ix={manIx} setIx={setManIx} />

            {/* ── SENASTE KÖRNINGAR (flyttar först) ── */}
            <SenasteKorningar rundor={data.rundor} valdRunda={valdRunda} onValj={valjRunda} />

            {data.saknas.length > 0 && (
              <div style={{ fontSize: 11, color: C.t3, textAlign: 'center', marginTop: 8 }}>
                Saknas i senaste avläsningen: {data.saknas.join(', ')}
              </div>
            )}
          </>
        )
      })()}
    </main>
  )
}

/* ══════════ Status-headline ══════════ */
function StatusHero({ avvik, oppen, park, alder_min, namn }: {
  avvik: { niva: 'rod' | 'orange'; rubrik: string; under: string } | null
  oppen: Data['oppen_runda']; park: Data['parkerad']; alder_min: number | null; namn?: string | null
}) {
  // Prioritet: avvikelse (röd/orange) → kör (blå) → parkerad (grön) → neutral
  if (avvik) {
    const f = avvik.niva === 'rod' ? C.red : C.orange
    return (
      <HeroSkal kant={f} bak={avvik.niva === 'rod' ? 'rgba(255,69,58,0.12)' : 'rgba(255,159,10,0.11)'} punktFarg={f} puls>
        <h1 style={{ ...heroH, color: '#fff' }}>{avvik.rubrik}</h1>
        <div style={heroSub}>{avvik.under}</div>
      </HeroSkal>
    )
  }
  if (oppen) {
    const m = oppen.maskin
    const mittrad = m
      ? (m.lage === 'lossad'
        ? <div style={{ ...flaketRad, color: C.green }}>✓ <b style={{ color: C.green }}>{m.namn}</b> lossad</div>
        : <div style={flaketRad}>🚚 <b style={{ color: '#fff' }}>{m.namn}</b> på flaket</div>)
      : <div style={{ ...flaketRad, color: C.t3 }}>Övrig körning · ingen maskin</div>
    return (
      <HeroSkal kant="rgba(59,130,246,0.30)" bak="rgba(59,130,246,0.10)" punktFarg={C.blue} puls>
        <div style={livePill}><span style={{ width: 7, height: 7, borderRadius: '50%', background: C.blue }} />KÖR NU</div>
        {mittrad}
        <div style={{ fontSize: 33, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: '#fff' }}>
          {oppen.live_km != null ? `${oppen.live_km} km` : '—'}
        </div>
        <div style={heroSub}>
          {oppen.starttid ? `Avfärd ${fmtKlocka(oppen.starttid)} · ` : ''}senast sedd {fmtAlder(alder_min)}
        </div>
      </HeroSkal>
    )
  }
  if (park) {
    return (
      <HeroSkal kant="rgba(34,197,94,0.22)" bak="rgba(34,197,94,0.07)" punktFarg={C.green}>
        <h1 style={heroH}>Parkerad på {park.plats}</h1>
        <div style={heroSub}>{park.sedan ? `${fmtSedan(park.sedan)} · ` : ''}allt friskt</div>
      </HeroSkal>
    )
  }
  return (
    <HeroSkal kant={C.border} bak="transparent" punktFarg={C.t3}>
      <h1 style={{ ...heroH, fontSize: 19 }}>{namn ? `Scania ${namn}` : 'Lastbilen'}</h1>
      <div style={heroSub}>Senast sedd {fmtAlder(alder_min)}</div>
    </HeroSkal>
  )
}
function HeroSkal({ children, kant, bak, punktFarg, puls }: { children: React.ReactNode; kant: string; bak: string; punktFarg: string; puls?: boolean }) {
  return (
    <div style={{ background: `linear-gradient(180deg, ${bak}, rgba(0,0,0,0) 72%), ${C.card}`, border: `1px solid ${kant}`, borderRadius: 18, padding: '16px 15px', margin: '8px 0 12px', display: 'flex', gap: 13, alignItems: 'flex-start' }}>
      <span style={{ position: 'relative', width: 13, height: 13, borderRadius: '50%', background: punktFarg, flex: 'none', marginTop: 6 }}>
        {puls && <span className="lb-hero-puls" style={{ position: 'absolute', inset: -5, borderRadius: '50%', border: `2px solid ${punktFarg}` }} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <style>{`.lb-hero-puls{animation:lbhero 1.9s ease-out infinite}@keyframes lbhero{0%{transform:scale(.6);opacity:.85}100%{transform:scale(2);opacity:0}}@media(prefers-reduced-motion:reduce){.lb-hero-puls{animation:none}}`}</style>
    </div>
  )
}
const heroH: React.CSSProperties = { margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.13 }
const heroSub: React.CSSProperties = { fontSize: 13, color: C.t3, marginTop: 5 }
const flaketRad: React.CSSProperties = { fontSize: 13, color: C.t2, margin: '2px 0 6px', fontWeight: 600 }
const livePill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: C.blue, marginBottom: 6 }

/* ══════════ Kan jag köra ══════════ */
function KanJagKora({ tank, oppen, onToggle }: { tank: Data['tank']; oppen: boolean; onToggle: () => void }) {
  const d = tank?.diesel_pct, r = tank?.rackvidd_km
  const lag = (d != null && d < 25) || (tank?.adblue_pct != null && tank.adblue_pct < 20) || (r != null && r < 150)
  const rubrik = d == null ? 'Tank' : d >= 55 ? 'Full tank' : `Diesel ${Math.round(d)} %`
  return (
    <div style={kortStil}>
      <button onClick={onToggle} style={radKnapp}>
        <Ikon namn={lag ? 'orange' : 'diesel'} />
        <div style={{ flex: 1, minWidth: 0 }}><span style={{ fontSize: 15, fontWeight: 600, color: lag ? C.orange : C.t1 }}>{rubrik}</span></div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r != null ? `${r} km` : '—'}</span>
          <div style={subStil}>räckvidd</div>
        </div>
        <Chevron open={oppen} />
      </button>
      {oppen && (
        <div style={{ marginTop: 6 }}>
          <TankRad namn="Diesel" varde={tank?.diesel_pct} enhet="%" lag={d != null && d < 25} />
          <TankRad namn="AdBlue" varde={tank?.adblue_pct} enhet="%" lag={tank?.adblue_pct != null && tank.adblue_pct < 20} />
          <TankRad namn="Räckvidd" varde={tank?.rackvidd_km} enhet=" km" lag={r != null && r < 150} sista />
        </div>
      )}
    </div>
  )
}
function TankRad({ namn, varde, enhet, lag, sista }: { namn: string; varde: number | null | undefined; enhet: string; lag?: boolean; sista?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: sista ? 'none' : `1px solid ${C.border}` }}>
      <span style={{ fontSize: 14, color: C.t2 }}>{namn}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: varde == null ? C.t3 : lag ? C.orange : C.t1, fontVariantNumeric: 'tabular-nums' }}>
        {varde == null ? '—' : `${Math.round(varde)}${enhet}`}
      </span>
    </div>
  )
}

/* ══════════ Mår den bra ══════════ */
function MarDenBra({ halsa, oppen, onToggle }: { halsa: Data['halsa']; oppen: boolean; onToggle: () => void }) {
  const lampor = halsa?.lampor ?? []
  const harLampor = !!halsa?.har_lampor
  return (
    <div style={kortStil}>
      <button onClick={onToggle} style={radKnapp}>
        {!harLampor
          ? <Ikon namn="check" farg={C.t3} />
          : lampor.length === 0 ? <Ikon namn="check" farg={C.green} /> : <Ikon namn="warn" farg={C.red} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!harLampor ? <span style={{ fontSize: 15, color: C.t3 }}>Varningslampor saknas i datan</span>
            : lampor.length === 0 ? <span style={{ fontSize: 15, fontWeight: 600, color: C.green }}>Inga varningar</span>
            : <span style={{ fontSize: 15, fontWeight: 600, color: C.red }}>{lampor.length === 1 ? lampor[0].namn : `${lampor.length} varningar`}</span>}
        </div>
        <div style={{ textAlign: 'right' }}><span style={subStil}>{halsa?.service_km != null ? `Service om ${halsa.service_km.toLocaleString('sv-SE')} km` : ''}</span></div>
        <Chevron open={oppen} />
      </button>
      {oppen && (
        <div style={{ marginTop: 10 }}>
          {lampor.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {lampor.map(l => (
                <div key={l.kod} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: l.state === 'RED' ? C.red : C.orange }}>
                  <Ikon namn="warn" farg={l.state === 'RED' ? C.red : C.orange} liten />{l.namn}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.t2, padding: '2px 0' }}>
            <span>Service om</span><span style={{ color: C.t1, fontWeight: 600 }}>{halsa?.service_km != null ? `${halsa.service_km.toLocaleString('sv-SE')} km` : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.t3, marginTop: 6 }}>
            <span>Mätare {halsa?.matare_km != null ? `${halsa.matare_km.toLocaleString('sv-SE')} km` : '—'}</span>
            <span>Motortimmar {halsa?.motortimmar != null ? `${halsa.motortimmar.toLocaleString('sv-SE')} h` : '—'}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════ Vad drar den ══════════ */
function VadDrarDen({ forbr, ix, setIx }: { forbr: ManadF[] | null; ix: number; setIx: (n: number) => void }) {
  if (forbr == null) return <div style={{ ...kortStil, color: C.t3, fontSize: 13 }}>Läser förbrukning …</div>
  if (forbr.length === 0) return null
  const i = Math.min(Math.max(ix, 0), forbr.length - 1)
  const m = forbr[i]
  const trend = forbr.slice(0, 4).reverse()   // äldst → nyast av de 4 senaste
  const maxLpm = Math.max(0.1, ...trend.map(t => t.l_per_mil ?? 0))
  return (
    <div style={kortStil}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.t2 }}>Vad drar den?</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 13, fontWeight: 700, color: C.t2 }}>
          <button aria-label="Äldre månad" disabled={i >= forbr.length - 1} onClick={() => setIx(i + 1)} style={pilKnapp(i >= forbr.length - 1)}>‹</button>
          {manadNamn(m.manad)}
          <button aria-label="Nyare månad" disabled={i <= 0} onClick={() => setIx(i - 1)} style={pilKnapp(i <= 0)}>›</button>
        </span>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.t3 }}>Diesel · snitt</div>
      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
        {m.l_per_mil != null ? `${m.l_per_mil.toLocaleString('sv-SE')} l/mil` : '—'}
      </div>
      <div style={{ fontSize: 13, color: C.t3, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{m.mil.toLocaleString('sv-SE')} mil · {m.diesel_l.toLocaleString('sv-SE')} l diesel</div>

      <div style={consRad}><span style={{ flex: 1 }}>Flyttar</span><span style={{ color: C.t2, fontVariantNumeric: 'tabular-nums' }}>{m.flytt.mil.toLocaleString('sv-SE')} mil · {m.flytt.diesel_l} l{m.flytt.l_per_mil != null ? ` · ${m.flytt.l_per_mil.toLocaleString('sv-SE')} l/mil` : ''}</span></div>
      <div style={consRad}><span style={{ flex: 1 }}>Övrig körning</span><span style={{ color: C.t2, fontVariantNumeric: 'tabular-nums' }}>{m.ovrig.mil.toLocaleString('sv-SE')} mil · {m.ovrig.diesel_l} l{m.ovrig.l_per_mil != null ? ` · ${m.ovrig.l_per_mil.toLocaleString('sv-SE')} l/mil` : ''}</span></div>

      {/* Trend */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.t3, margin: '16px 0 4px' }}>Diesel l/mil — trend bakåt</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 92, padding: '6px 4px 0' }}>
        {trend.map(t => {
          const vald = t.manad === m.manad
          const h = t.l_per_mil != null ? Math.max(6, Math.round((t.l_per_mil / maxLpm) * 66)) : 0
          return (
            <div key={t.manad} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, height: 14, fontVariantNumeric: 'tabular-nums' }}>{t.l_per_mil != null ? t.l_per_mil.toLocaleString('sv-SE') : '—'}</div>
              {t.l_per_mil != null
                ? <div style={{ width: '64%', height: h, borderRadius: '6px 6px 0 0', background: vald ? C.blue : 'rgba(59,130,246,0.45)' }} />
                : <div style={{ width: '64%', height: 8, borderRadius: 4, border: `1px dashed ${C.border}` }} />}
              <div style={{ fontSize: 11, color: vald ? C.t1 : C.t3, marginTop: 7 }}>{MANAD[Number(t.manad.split('-')[1]) - 1]}</div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: C.t3, marginTop: 8, lineHeight: 1.5 }}>Historiken fylls på månad för månad. Här syns ett däckbyte eller en släpande broms först — som en knuff uppåt i l/mil.</div>
    </div>
  )
}

/* ══════════ Senaste körningar ══════════ */
function SenasteKorningar({ rundor, valdRunda, onValj }: { rundor: Runda[]; valdRunda: string | null; onValj: (id: string) => void }) {
  const flyttar = rundor.filter(r => r.typ === 'flytt')
  const ovriga = rundor.filter(r => r.typ === 'ovrig')
  const ovrigMil = ovriga.reduce((s, r) => s + (r.matare_km ?? 0), 0)
  return (
    <div style={kortStil}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.t2, marginBottom: 12 }}>Senaste körningar</div>
      {flyttar.length === 0 && ovriga.length === 0 ? (
        <div style={{ fontSize: 14, color: C.t3 }}>Inga körningar än.</div>
      ) : (
        <>
          {flyttar.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.t3, marginBottom: 8 }}>Flyttar</div>}
          {flyttar.map((r, i) => (
            <button key={r.id} onClick={() => onValj(r.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%',
              background: valdRunda === r.id ? 'rgba(59,130,246,0.12)' : 'none',
              border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
              borderRadius: valdRunda === r.id ? 10 : 0, padding: '11px 6px', cursor: 'pointer', color: C.t1, fontFamily: ff,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDatum(r.starttid)}{r.starttid ? ` · ${fmtKlocka(r.starttid)}` : ''}</div>
                <div style={{ fontSize: 12, color: C.t2, marginTop: 1 }}>Flytt{r.antal_flytt > 1 ? ` · ${r.antal_flytt} maskiner` : ''}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: C.t2, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ color: C.t1, fontWeight: 700, fontSize: 14 }}>{r.matare_km != null ? `${r.matare_km} km` : '—'}</div>
                <div style={{ color: C.t3, marginTop: 1 }}>{r.bransle_l != null ? `${r.bransle_l} l` : ''}{r.l_per_mil != null ? ` · ${r.l_per_mil} l/mil` : ''}</div>
              </div>
              <Chevron open={valdRunda === r.id} />
            </button>
          ))}
          {ovriga.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px', marginTop: 10, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: `1px dashed ${C.border}`, color: C.t3 }}>
              <div style={{ flex: 1 }}><span style={{ fontSize: 13.5, fontWeight: 600 }}>Övriga körningar</span><span style={{ fontVariantNumeric: 'tabular-nums' }}> · {ovriga.length} {ovriga.length === 1 ? 'runda' : 'rundor'} · {Math.round(ovrigMil).toLocaleString('sv-SE')} km</span></div>
            </div>
          )}
        </>
      )}
      <Link href="/maskinflytt/sammanstallning" style={{ display: 'block', textAlign: 'center', marginTop: 14, fontSize: 13, color: C.blue, textDecoration: 'none' }}>Öppna hela Flyttloggen</Link>
    </div>
  )
}

/* ══════════ Småkomponenter ══════════ */
function Chevron({ open }: { open: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t4} strokeWidth="2" style={{ flex: 'none', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" /></svg>
}
function Ikon({ namn, farg, liten }: { namn: 'diesel' | 'orange' | 'check' | 'warn'; farg?: string; liten?: boolean }) {
  const s = liten ? 16 : 20
  const stroke = farg ?? (namn === 'orange' ? C.orange : C.green)
  if (namn === 'check') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></svg>
  if (namn === 'warn') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={namn === 'orange' ? C.orange : C.green} strokeWidth="2"><path d="M3 22h12V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M15 9h3l3 3v7a2 2 0 0 1-2 2h-1" /></svg>
}

const kortStil: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 12, fontSize: 14 }
const knappStil: React.CSSProperties = { background: C.blue, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: ff }
const radKnapp: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.t1, fontFamily: ff, textAlign: 'left' }
const subStil: React.CSSProperties = { fontSize: 13, color: C.t3, marginTop: 2 }
const consRad: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', borderTop: `1px solid ${C.border}`, color: C.t3, fontSize: 13 }
function pilKnapp(disabled: boolean): React.CSSProperties {
  return { width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: 'none', color: disabled ? C.t4 : C.t2, fontSize: 16, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, fontFamily: ff, lineHeight: 1 }
}
