'use client'

// /helikopter/veckor — en månad, vecka för vecka mot plan, med växel mellan spåren.
// Båda spåren hämtas direkt (två små RPC-anrop) så bytet är omedelbart.
// Diagram (kolumn per vecka) → detaljblock för vald vecka → orsak.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, TreePine, Truck } from 'lucide-react'
import PageContainer from '@/components/PageContainer'
import { T } from '@/lib/utbildning'
import { ymdLokal } from '@/lib/datumLokal'
import { TYPER, TYP_NAMN } from '../_lib/berakningar'
import { MANAD_NAMN, fmt, manadRubrik } from '../_lib/format'
import { hamtaVeckor, type Typ, type VeckaRad } from '../_lib/queries'
import { Fel, Laddar, Tomt } from './Tillstand'
import { KortLank, STORT_TAL_STIL } from './SparKort'
import VeckoDiagram, { veckaFarg } from './VeckoDiagram'
import OrsakSheet from './OrsakSheet'

type Roll = 'skordare' | 'skotare'
type PerTyp = Record<Typ, VeckaRad[]>

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

  const [data, setData] = useState<PerTyp | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [vald, setVald] = useState<number | null>(null)
  const [roll, setRoll] = useState<Roll | null>(null)
  const [orsakOppen, setOrsakOppen] = useState(false)

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

  const veckor = data ? data[typ] : null

  // Vald vecka: behålls vid spårbyte om den finns, annars senaste låsta.
  useEffect(() => {
    if (!veckor) return
    setVald(prev => (prev != null && veckor.some(v => v.isovecka === prev) ? prev : forvaldVecka(veckor)))
    setRoll(null)
  }, [veckor])

  const sattTyp = (t: Typ) => {
    if (t === typ) return
    const q = new URLSearchParams(sp.toString())
    q.set('typ', t)
    router.replace(`/helikopter/veckor?${q.toString()}`, { scroll: false })
  }

  const vecka = useMemo(() => veckor?.find(v => v.isovecka === vald) ?? null, [veckor, vald])
  const best = veckor ? harBestallning(veckor) : false

  return (
    <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 110, color: T.t1, fontFamily: T.ff, WebkitFontSmoothing: 'antialiased' }}>
      <PageContainer width="smal">
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

        {/* Spårväxel — samma stil som flikraden på /helikopter. Vald = typ i URL:en. */}
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

        {fel ? (
          <Fel onRetry={() => setVersion(v => v + 1)} />
        ) : !veckor ? (
          <Laddar vad={`veckorna i ${MANAD_NAMN[manad - 1]}`} />
        ) : veckor.length === 0 ? (
          <Tomt rubrik="Inga arbetsdagar i månaden" />
        ) : (
          <>
            <section style={{ background: T.group, borderRadius: 12, padding: '14px 12px 10px', marginBottom: 14 }}>
              <VeckoDiagram
                veckor={veckor}
                vald={vald}
                onValjVecka={v => { setVald(v); setRoll(null) }}
                onValjStapel={(v, r) => { setVald(v); setRoll(prev => (vald === v && prev === r ? null : r)) }}
              />
            </section>

            {vecka && (
              <section style={{ background: T.group, borderRadius: 12, padding: '16px 16px 8px', marginBottom: 14 }}>
                {roll ? (
                  <PerMaskin vecka={vecka} roll={roll} onTillbaka={() => setRoll(null)} />
                ) : (
                  <VeckoDetalj vecka={vecka} harBest={best} onAndraOrsak={() => setOrsakOppen(true)} />
                )}
              </section>
            )}
          </>
        )}
      </PageContainer>

      {vecka && (
        <OrsakSheet
          open={orsakOppen}
          onClose={() => setOrsakOppen(false)}
          ar={ar}
          manad={manad}
          typ={typ}
          isovecka={vecka.isovecka}
          orsak={vecka.orsak}
          onSparad={() => { setOrsakOppen(false); setVersion(v => v + 1) }}
        />
      )}
    </div>
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

function PerMaskin({ vecka, roll, onTillbaka }: { vecka: VeckaRad; roll: Roll; onTillbaka: () => void }) {
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
              <span style={{ color: T.t2 }}>{fmt(m.volym)}</span>
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
