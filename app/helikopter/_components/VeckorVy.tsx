'use client'

// /helikopter/veckor — en månad, vecka för vecka mot plan, med växel mellan spåren.
// Båda spåren hämtas direkt (två små RPC-anrop) så bytet är omedelbart.
// Diagram (kolumn per vecka) → detaljblock för vald vecka → orsak.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, TreePine, Truck } from 'lucide-react'
import PageContainer from '@/components/PageContainer'
import { AVSTAND } from '@/lib/design/tokens'
import { T } from '@/lib/utbildning'
import { ymdLokal } from '@/lib/datumLokal'
import { TYPER, TYP_NAMN } from '../_lib/berakningar'
import { MANAD_NAMN, fmt, manadRubrik } from '../_lib/format'
import { hamtaManuellaMaskiner, hamtaVeckor, type Typ, type VeckaRad } from '../_lib/queries'
import { SPAR_MAX_PX, VECKOR_TVA_SPAR_MIN_PX } from '../_lib/layout'
import { useFonsterBredd } from '../_lib/useFonsterBredd'
import { Fel, Laddar, Tomt } from './Tillstand'
import { TEXT_MUTED } from './Lista'
import { KortLank, STORT_TAL_STIL } from './SparKort'
import VeckoDiagram, { veckaFarg } from './VeckoDiagram'
import OrsakSheet from './OrsakSheet'

type Roll = 'skordare' | 'skotare'
type PerTyp = Record<Typ, VeckaRad[]>
const INGEN_VECKA: Record<Typ, number | null> = { gallring: null, slutavverkning: null }
const INGEN_ROLL: Record<Typ, Roll | null> = { gallring: null, slutavverkning: null }

/** Senaste låsta veckan, annars första. */
function forvaldVecka(veckor: VeckaRad[]): number | null {
  const lasta = veckor.filter(v => v.status === 'last')
  return lasta.length > 0 ? lasta[lasta.length - 1].isovecka : veckor[0]?.isovecka ?? null
}

/** Spåret har beställning i månaden när någon vecka har plan > 0. */
function harBestallning(veckor: VeckaRad[]): boolean {
  return veckor.some(v => v.plan != null && v.plan > 0)
}

export default function VeckorVy() {
  const sp = useSearchParams()
  const router = useRouter()
  const idag = ymdLokal(new Date())
  const typ: Typ = sp.get('typ') === 'gallring' ? 'gallring' : 'slutavverkning'
  const arParam = parseInt(sp.get('ar') || '')
  const manadParam = parseInt(sp.get('manad') || '')
  const ar = Number.isFinite(arParam) ? arParam : Number(idag.slice(0, 4))
  const manad = Number.isFinite(manadParam) && manadParam >= 1 && manadParam <= 12 ? manadParam : Number(idag.slice(5, 7))
  const tillbaka = `/helikopter?flik=uppfoljning&ar=${ar}&manad=${manad}`
  // Från 900 px visas båda spåren sida vid sida (ingen växel); under det ett spår i taget som förut.
  const tvaSpar = useFonsterBredd() >= VECKOR_TVA_SPAR_MIN_PX

  const [data, setData] = useState<PerTyp | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  // Vald vecka och roll bor per spår, så båda spåren kan visas samtidigt.
  const [vald, setVald] = useState<Record<Typ, number | null>>(INGEN_VECKA)
  const [roll, setRoll] = useState<Record<Typ, Roll | null>>(INGEN_ROLL)
  const [orsakFor, setOrsakFor] = useState<Typ | null>(null)
  // Maskiner med manuell datakälla — "manuell" efter volymen i veckoraden.
  const [manuella, setManuella] = useState<Set<string>>(() => new Set())
  useEffect(() => { let avbruten = false; hamtaManuellaMaskiner().then(m => { if (!avbruten) setManuella(m) }); return () => { avbruten = true } }, [])

  useEffect(() => {
    let avbruten = false
    setData(null); setFel(null)
    Promise.all(TYPER.map(t => hamtaVeckor(ar, manad, t, idag))).then(svar => {
      if (avbruten) return
      const felet = svar.find(s => s.error != null)?.error
      if (felet != null) { setFel(felet); return }
      const per = { gallring: [], slutavverkning: [] } as PerTyp
      TYPER.forEach((t, i) => { per[t] = svar[i].data ?? [] })
      setData(per)
    })
    return () => { avbruten = true }
  }, [ar, manad, idag, version])

  // Vald vecka: behålls om den finns, annars senaste låsta. Gäller varje spår för sig.
  useEffect(() => {
    if (!data) return
    setVald(prev => {
      const nytt = { ...INGEN_VECKA }
      for (const t of TYPER) nytt[t] = prev[t] != null && data[t].some(v => v.isovecka === prev[t]) ? prev[t] : forvaldVecka(data[t])
      return nytt
    })
    setRoll(INGEN_ROLL)
  }, [data])

  const sattTyp = (t: Typ) => {
    if (t === typ) return
    // Spårbyte: vald vecka följer med om den finns i det andra spåret, annars senaste låsta.
    if (data) {
      setVald(prev => ({ ...prev, [t]: prev[typ] != null && data[t].some(v => v.isovecka === prev[typ]) ? prev[typ] : forvaldVecka(data[t]) }))
      setRoll(prev => ({ ...prev, [t]: null }))
    }
    const q = new URLSearchParams(sp.toString())
    q.set('typ', t)
    router.replace(`/helikopter/veckor?${q.toString()}`, { scroll: false })
  }

  const orsakVecka = orsakFor && data ? data[orsakFor].find(v => v.isovecka === vald[orsakFor]) ?? null : null

  const sparBlock = (t: Typ) => (
    <SparBlock
      veckor={data![t]}
      vald={vald[t]}
      roll={roll[t]}
      onVald={v => { setVald(prev => ({ ...prev, [t]: v })); setRoll(prev => ({ ...prev, [t]: null })) }}
      onRoll={(v, r) => { setVald(prev => ({ ...prev, [t]: v })); setRoll(prev => ({ ...prev, [t]: vald[t] === v && prev[t] === r ? null : r })) }}
      onTillbakaRoll={() => setRoll(prev => ({ ...prev, [t]: null }))}
      manuella={manuella}
      onAndraOrsak={() => setOrsakFor(t)}
    />
  )

  const innehall = fel ? (
    <Fel onRetry={() => setVersion(v => v + 1)} />
  ) : !data ? (
    <Laddar vad={`veckorna i ${MANAD_NAMN[manad - 1]}`} />
  ) : tvaSpar ? (
    // Två spår sida vid sida: varsitt diagram och detaljblock, högst SPAR_MAX_PX per spår, centrerat.
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(2, minmax(0, ${SPAR_MAX_PX}px))`, columnGap: AVSTAND.l, justifyContent: 'center', alignItems: 'start' }}>
      {TYPER.map(t => (
        <div key={t} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: T.t1, padding: `0 ${AVSTAND.xs}px ${AVSTAND.s + AVSTAND.xs / 2}px` }}>{TYP_NAMN[t]}</div>
          {sparBlock(t)}
        </div>
      ))}
    </div>
  ) : (
    sparBlock(typ)
  )

  const sidhuvud = (
    <header style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', padding: '14px 0 12px' }}>
      <Link href={tillbaka} aria-label="Tillbaka till Uppföljning" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.blue }}>
        <ChevronLeft size={26} />
      </Link>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Veckor</h1>
        <div style={{ fontSize: 13, color: T.t2, marginTop: 2 }}>{manadRubrik(ar, manad)}</div>
      </div>
      <span />
    </header>
  )

  return (
    <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 110, color: T.t1, fontFamily: T.ff, WebkitFontSmoothing: 'antialiased' }}>
      {/* Bredare än 900 px: ramen rymmer två spår à högst SPAR_MAX_PX. Under det samma kolumn som förut. */}
      <PageContainer width={tvaSpar ? 'full' : 'smal'} style={tvaSpar ? { maxWidth: 2 * SPAR_MAX_PX + AVSTAND.l + 2 * AVSTAND.sidmarginal, marginInline: 'auto', paddingInline: AVSTAND.sidmarginal, boxSizing: 'border-box' } : undefined}>
        {sidhuvud}

        {/* Spårväxel — samma stil som flikraden på /helikopter. Vald = typ i URL:en. Försvinner när båda spåren syns. */}
        {!tvaSpar && (
          <div role="tablist" aria-label="Spår" style={{ display: 'flex', background: T.group, borderRadius: 10, padding: 3, gap: 3, marginBottom: 14 }}>
            {TYPER.map(t => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={typ === t}
                onClick={() => sattTyp(t)}
                style={{
                  flex: 1, minHeight: 44, borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: T.ff,
                  fontSize: 15, fontWeight: 600,
                  background: typ === t ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: typ === t ? T.t1 : T.t2,
                }}
              >
                {TYP_NAMN[t]}
              </button>
            ))}
          </div>
        )}

        {innehall}
      </PageContainer>

      {orsakFor && orsakVecka && (
        <OrsakSheet
          open={orsakFor != null}
          onClose={() => setOrsakFor(null)}
          ar={ar}
          manad={manad}
          typ={orsakFor}
          isovecka={orsakVecka.isovecka}
          orsak={orsakVecka.orsak}
          onSparad={() => { setOrsakFor(null); setVersion(v => v + 1) }}
        />
      )}
    </div>
  )
}

/** Ett spår: diagram (kolumn per vecka) och detaljblock för vald vecka. Samma block i båda lägena. */
function SparBlock({ veckor, vald, roll, onVald, onRoll, onTillbakaRoll, manuella, onAndraOrsak }: {
  veckor: VeckaRad[]
  vald: number | null
  roll: Roll | null
  onVald: (isovecka: number) => void
  onRoll: (isovecka: number, roll: Roll) => void
  onTillbakaRoll: () => void
  manuella: Set<string>
  onAndraOrsak: () => void
}) {
  const vecka = veckor.find(v => v.isovecka === vald) ?? null
  const best = harBestallning(veckor)
  if (veckor.length === 0) return <Tomt rubrik="Inga arbetsdagar i månaden" />
  return (
    <>
      <section style={{ background: T.group, borderRadius: 12, padding: '14px 12px 10px', marginBottom: 14 }}>
        <VeckoDiagram veckor={veckor} vald={vald} onValjVecka={onVald} onValjStapel={onRoll} />
      </section>

      {vecka && (
        <section style={{ background: T.group, borderRadius: 12, padding: '16px 16px 8px', marginBottom: 14 }}>
          {roll ? (
            <PerMaskin vecka={vecka} roll={roll} onTillbaka={onTillbakaRoll} manuella={manuella} />
          ) : (
            <VeckoDetalj vecka={vecka} harBest={best} onAndraOrsak={onAndraOrsak} />
          )}
        </section>
      )}
    </>
  )
}

/** " · 4 arbetsdagar · plan 909" — pågående: " · 3 dagar kvar · behöver 250/dag" (kvar till veckoplan för skotat). Utan beställning: " · 4 arbetsdagar · ingen beställning". */
function veckoRubrik(v: VeckaRad, harBest: boolean): string {
  const dagar = ` · ${v.arbetsdagar} ${v.arbetsdagar === 1 ? 'arbetsdag' : 'arbetsdagar'}`
  if (!harBest || v.plan == null) return `${dagar} · ingen beställning`
  if (v.status === 'pagar') {
    const kvarM3 = v.plan - v.skotat
    const behov = v.arbetsdagar_kvar > 0 && kvarM3 > 0 ? ` · behöver ${fmt(kvarM3 / v.arbetsdagar_kvar)}/dag` : kvarM3 <= 0 ? ' · veckoplanen nådd' : ''
    return ` · ${v.arbetsdagar_kvar} ${v.arbetsdagar_kvar === 1 ? 'dag' : 'dagar'} kvar${behov}`
  }
  return `${dagar} · plan ${fmt(v.plan)}`
}

function VeckoDetalj({ vecka, harBest, onAndraOrsak }: { vecka: VeckaRad; harBest: boolean; onAndraOrsak: () => void }) {
  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.t1 }}>
        Vecka {vecka.isovecka}
        <span style={{ color: T.t2, fontWeight: 400 }}>{veckoRubrik(vecka, harBest)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <Spalt ikon={<TreePine size={15} color={T.t2} aria-hidden="true" />} label="Skördat" varde={vecka.skordat} vecka={vecka} harBest={harBest} />
        <Spalt ikon={<Truck size={15} color={T.t2} aria-hidden="true" />} label="Skotat" varde={vecka.skotat} vecka={vecka} harBest={harBest} />
      </div>
      <div style={{ fontSize: 14, color: T.t2, marginTop: 14, lineHeight: 1.4 }}>
        {vecka.orsak ? vecka.orsak : <span style={{ color: 'rgba(235,235,245,0.4)' }}>Ingen orsak angiven</span>}
      </div>
      <div style={{ marginTop: 8 }}>
        <KortLank text="Ändra orsak" onClick={onAndraOrsak} />
      </div>
    </>
  )
}

function Spalt({ ikon, label, varde, vecka, harBest }: { ikon: React.ReactNode; label: string; varde: number; vecka: VeckaRad; harBest: boolean }) {
  const plan = harBest ? vecka.plan : null
  const farg = vecka.status === 'kommande' ? T.t2 : veckaFarg(varde, plan)
  let diff: string
  if (plan == null) diff = harBest ? '' : 'Ingen beställning'
  else if (vecka.status === 'kommande') diff = `plan ${fmt(plan)}`
  else if (vecka.status === 'pagar') {
    const kvarM3 = plan - varde
    diff = kvarM3 <= 0 ? `+${fmt(-kvarM3)} över plan` : vecka.arbetsdagar_kvar > 0 ? `behöver ${fmt(kvarM3 / vecka.arbetsdagar_kvar)}/dag` : `${fmt(kvarM3)} kvar till plan`
  } else {
    const d = varde - plan
    diff = d >= 0 ? `+${fmt(d)} över plan` : `${fmt(d)} under plan`
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.t2 }}>{ikon}{label}</div>
      <div style={{ ...STORT_TAL_STIL, fontSize: 28, color: farg, marginTop: 4 }}>{vecka.status === 'kommande' ? '–' : fmt(varde)}</div>
      <div style={{ fontSize: 13, color: T.t2, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{diff}</div>
    </div>
  )
}

function PerMaskin({ vecka, roll, onTillbaka, manuella }: { vecka: VeckaRad; roll: Roll; onTillbaka: () => void; manuella: Set<string> }) {
  const rader = vecka.maskiner.filter(m => m.roll === roll).sort((a, b) => b.volym - a.volym)
  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.t1 }}>
        Vecka {vecka.isovecka} · {roll === 'skordare' ? 'Skördat' : 'Skotat'} per maskin
      </div>
      {rader.length === 0 ? (
        <div style={{ fontSize: 14, color: T.t2, marginTop: 10 }}>Ingen {roll === 'skordare' ? 'skördning' : 'skotning'} registrerad den veckan.</div>
      ) : (
        <div style={{ marginTop: 6 }}>
          {rader.map(m => (
            <div key={m.maskin_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, fontSize: 15, borderTop: `1px solid ${T.sep}`, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: T.t1 }}>{m.namn}</span>
              <span style={{ color: T.t2 }}>{fmt(m.volym)}{manuella.has(m.maskin_id) && <span style={{ color: TEXT_MUTED }}> · manuell</span>}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <KortLank text="Visa veckan" onClick={onTillbaka} />
      </div>
    </>
  )
}
