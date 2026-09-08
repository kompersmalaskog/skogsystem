'use client'

// /helikopter/veckor — ett spår, en månad, vecka för vecka mot plan.
// Diagram (kolumn per vecka) → detaljblock för vald vecka → orsak.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, TreePine, Trees, Truck } from 'lucide-react'
import PageContainer from '@/components/PageContainer'
import { T } from '@/lib/utbildning'
import { ymdLokal } from '@/lib/datumLokal'
import { TYP_NAMN } from '../_lib/berakningar'
import { MANAD_NAMN, fmt, manadRubrik } from '../_lib/format'
import { hamtaVeckor, type Typ, type VeckaRad } from '../_lib/queries'
import { Fel, Laddar, Tomt } from './Tillstand'
import { KortLank, STORT_TAL_STIL } from './SparKort'
import VeckoDiagram, { veckaFarg } from './VeckoDiagram'
import OrsakSheet from './OrsakSheet'

type Roll = 'skordare' | 'skotare'

export default function VeckorVy() {
  const sp = useSearchParams()
  const idag = ymdLokal(new Date())
  const typ: Typ = sp.get('typ') === 'gallring' ? 'gallring' : 'slutavverkning'
  const arParam = parseInt(sp.get('ar') || '')
  const manadParam = parseInt(sp.get('manad') || '')
  const ar = Number.isFinite(arParam) ? arParam : Number(idag.slice(0, 4))
  const manad = Number.isFinite(manadParam) && manadParam >= 1 && manadParam <= 12 ? manadParam : Number(idag.slice(5, 7))
  const tillbaka = `/helikopter?flik=uppfoljning&ar=${ar}&manad=${manad}`

  const [veckor, setVeckor] = useState<VeckaRad[] | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [vald, setVald] = useState<number | null>(null)
  const [roll, setRoll] = useState<Roll | null>(null)
  const [orsakOppen, setOrsakOppen] = useState(false)

  useEffect(() => {
    let avbruten = false
    setVeckor(null); setFel(null)
    hamtaVeckor(ar, manad, typ, idag).then(r => {
      if (avbruten) return
      if (r.error != null) { setFel(r.error); return }
      setVeckor(r.data)
      // Default: senaste låsta veckan, annars första.
      const lasta = r.data.filter(v => v.status === 'last')
      setVald(prev => prev ?? (lasta.length > 0 ? lasta[lasta.length - 1].isovecka : r.data[0]?.isovecka ?? null))
    })
    return () => { avbruten = true }
  }, [ar, manad, typ, idag, version])

  const vecka = useMemo(() => veckor?.find(v => v.isovecka === vald) ?? null, [veckor, vald])
  const TypIkon = typ === 'gallring' ? Trees : TreePine

  return (
    <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 110, color: T.t1, fontFamily: T.ff, WebkitFontSmoothing: 'antialiased' }}>
      <PageContainer width="smal">
        <header style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', padding: '14px 0 12px' }}>
          <Link href={tillbaka} aria-label="Tillbaka till Uppföljning" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.blue }}>
            <ChevronLeft size={26} />
          </Link>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <TypIkon size={18} color={T.t2} aria-hidden="true" />{TYP_NAMN[typ]}
            </h1>
            <div style={{ fontSize: 13, color: T.t2, marginTop: 2 }}>{manadRubrik(ar, manad)} · vecka för vecka</div>
          </div>
          <span />
        </header>

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
                  <VeckoDetalj vecka={vecka} onAndraOrsak={() => setOrsakOppen(true)} />
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

function VeckoDetalj({ vecka, onAndraOrsak }: { vecka: VeckaRad; onAndraOrsak: () => void }) {
  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.t1 }}>
        Vecka {vecka.isovecka}{vecka.plan != null ? <span style={{ color: T.t2, fontWeight: 400 }}> · plan {fmt(vecka.plan)}</span> : ''}
        {vecka.status === 'pagar' && <span style={{ color: T.t2, fontWeight: 400 }}> · pågår</span>}
        {vecka.status === 'kommande' && <span style={{ color: T.t2, fontWeight: 400 }}> · kommande</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <Spalt ikon={<TreePine size={15} color={T.t2} aria-hidden="true" />} label="Skördat" varde={vecka.skordat} vecka={vecka} />
        <Spalt ikon={<Truck size={15} color={T.t2} aria-hidden="true" />} label="Skotat" varde={vecka.skotat} vecka={vecka} />
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

function Spalt({ ikon, label, varde, vecka }: { ikon: React.ReactNode; label: string; varde: number; vecka: VeckaRad }) {
  const plan = vecka.plan
  const farg = vecka.status === 'kommande' ? T.t2 : veckaFarg(varde, plan)
  let diff: string
  if (plan == null) diff = ''
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
              <span style={{ color: T.t1 }}>{m.modell || m.maskin_id}</span>
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
