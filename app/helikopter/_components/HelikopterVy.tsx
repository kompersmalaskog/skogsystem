'use client'

// /helikopter — skalet: månad + flik i URL:en, header, sticky flikrad, datahämtning.
//
// Data i tre lager:
//   fast        — månadsoberoende (maskiner, senaste importtid, bolagshistorik), hämtas en gång
//   manadsdata  — spår, arbetsdagar, månadens objekt; hämtas om vid pil
//   bolag       — per bolag; hämtas först när Uppföljning öppnas (lazy, cachas per månad)
// Varje lager har eget fel. Ett fel visas som fel, aldrig som tomt.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import PageContainer from '@/components/PageContainer'
import { T } from '@/lib/utbildning'
import { ymdLokal } from '@/lib/datumLokal'
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext'
import {
  hamtaBolag, hamtaFast, hamtaManadsdata, hamtaMaskinLage,
  type BolagRad, type FastData, type Manadsdata, type MaskinLage,
} from '../_lib/queries'
import { TYPER, globalaArbetsdagar, manadStatus, maskinNamn, raknaSpar, valjBas, type SparLage } from '../_lib/berakningar'
import type { Typ } from '../_lib/queries'
import { MANAD_NAMN, dagarText, manadRubrik, relativTid } from '../_lib/format'
import { Fel, Laddar } from './Tillstand'
import LageFlik from './LageFlik'
import PlaneringFlik from './PlaneringFlik'
import UppfoljningFlik from './UppfoljningFlik'

export type Flik = 'lage' | 'planering' | 'uppfoljning'
const FLIKAR: { id: Flik; namn: string }[] = [
  { id: 'lage', namn: 'Läge' },
  { id: 'planering', namn: 'Planering' },
  { id: 'uppfoljning', namn: 'Uppföljning' },
]

function lasFlik(v: string | null): Flik {
  return v === 'planering' || v === 'uppfoljning' ? v : 'lage'
}

const rundKnapp: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 22, background: 'transparent', border: `1px solid ${T.sep}`,
  color: T.t2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}

export default function HelikopterVy() {
  const sp = useSearchParams()
  const router = useRouter()
  const idag = ymdLokal(new Date())
  const nuAr = Number(idag.slice(0, 4))
  const nuManad = Number(idag.slice(5, 7))

  const arParam = parseInt(sp.get('ar') || '')
  const manadParam = parseInt(sp.get('manad') || '')
  const ar = Number.isFinite(arParam) ? arParam : nuAr
  const manad = Number.isFinite(manadParam) && manadParam >= 1 && manadParam <= 12 ? manadParam : nuManad
  const flik = lasFlik(sp.get('flik'))
  const arNu = ar === nuAr && manad === nuManad

  const satt = useCallback((n: { flik?: Flik; ar?: number; manad?: number }) => {
    const q = new URLSearchParams()
    q.set('flik', n.flik ?? flik)
    q.set('ar', String(n.ar ?? ar))
    q.set('manad', String(n.manad ?? manad))
    router.replace(`/helikopter?${q.toString()}`, { scroll: false })
  }, [router, flik, ar, manad])

  const bytManad = (steg: number) => {
    const d = new Date(ar, manad - 1 + steg, 1)
    satt({ ar: d.getFullYear(), manad: d.getMonth() + 1 })
  }

  const { medarbetare } = useCurrentMedarbetare()
  const [version, setVersion] = useState(0) // räknas upp vid "Försök igen" → alla lager hämtas om
  const [fast, setFast] = useState<FastData | null>(null)
  const [fastFel, setFastFel] = useState<string | null>(null)
  const [manadsdata, setManadsdata] = useState<Manadsdata | null>(null)
  const [manadFel, setManadFel] = useState<string | null>(null)
  const [laddarManad, setLaddarManad] = useState(true)
  const [bolag, setBolag] = useState<{ nyckel: string; rader: BolagRad[] } | null>(null)
  const [bolagFel, setBolagFel] = useState<string | null>(null)
  const [maskinLage, setMaskinLage] = useState<MaskinLage | null>(null)
  const [maskinLageFel, setMaskinLageFel] = useState<string | null>(null)

  // Fast data — en gång (och vid retry).
  useEffect(() => {
    let avbruten = false
    setFastFel(null)
    hamtaFast().then(r => {
      if (avbruten) return
      if (r.error != null) setFastFel(r.error)
      else setFast(r.data)
    })
    return () => { avbruten = true }
  }, [version])

  // Månadsdata — vid pil. Gammal månad töms innan ny hämtas.
  useEffect(() => {
    let avbruten = false
    setLaddarManad(true)
    setManadsdata(null)
    setManadFel(null)
    hamtaManadsdata(ar, manad, idag).then(r => {
      if (avbruten) return
      if (r.error != null) setManadFel(r.error)
      else setManadsdata(r.data)
      setLaddarManad(false)
    })
    return () => { avbruten = true }
  }, [ar, manad, idag, version])

  // Din maskin — bara när inloggad har en maskin kopplad.
  const maskinId = medarbetare?.maskin_id ?? null
  useEffect(() => {
    if (!maskinId) return
    let avbruten = false
    setMaskinLageFel(null)
    hamtaMaskinLage(maskinId, idag).then(r => {
      if (avbruten) return
      if (r.error != null) setMaskinLageFel(r.error)
      else setMaskinLage(r.data)
    })
    return () => { avbruten = true }
  }, [maskinId, idag, version])

  // Bolag — lazy när Uppföljning öppnas, cachat per månad.
  const bolagNyckel = `${ar}-${manad}`
  useEffect(() => {
    if (flik !== 'uppfoljning') return
    if (bolag?.nyckel === bolagNyckel) return
    let avbruten = false
    setBolagFel(null)
    hamtaBolag(ar, manad, idag).then(r => {
      if (avbruten) return
      if (r.error != null) setBolagFel(r.error)
      else setBolag({ nyckel: bolagNyckel, rader: r.data })
    })
    return () => { avbruten = true }
  }, [flik, ar, manad, idag, bolag, bolagNyckel, version])

  const status = manadStatus(ar, manad, idag)
  const dagar = useMemo(() => (manadsdata ? globalaArbetsdagar(manadsdata.arbetsdagar) : null), [manadsdata])
  const spar: SparLage[] = useMemo(() => {
    if (!manadsdata || !dagar) return []
    return TYPER.map(t => {
      const rad = valjBas(manadsdata.spar, t)
      return rad ? raknaSpar(rad, dagar) : null
    }).filter((x): x is SparLage => x != null)
  }, [manadsdata, dagar])

  // Antal objekt per spår i månaden (alla statusar) — Läge får inte vara grönt utan plan.
  const antalPlanerade = useMemo(() => {
    const n: Record<Typ, number> = { gallring: 0, slutavverkning: 0 }
    for (const o of manadsdata?.planering ?? []) if (o.typ === 'gallring' || o.typ === 'slutavverkning') n[o.typ as Typ]++
    return n
  }, [manadsdata])

  const underrad = !dagar
    ? ''
    : status === 'avslutad'
      ? `Avslutad · ${dagar.totalt} arbetsdagar`
      : status === 'kommande'
        ? `${dagar.totalt} arbetsdagar`
        : `${dagarText(dagar.kvar)} kvar · ${relativTid(fast?.senasteData ?? null)}`
  // "arbetsdagar" i stället för "dagar" när det är kvar-raden
  const underradText = status === 'pagaende' && dagar ? `${dagar.kvar} arbetsdagar kvar · ${relativTid(fast?.senasteData ?? null)}` : underrad

  const dinMaskinNamn = maskinId && fast ? (fast.maskiner.find(m => m.maskin_id === maskinId) ?? null) : null
  const fel = fastFel ?? manadFel
  const laddar = laddarManad || (!fast && !fastFel)

  return (
    <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 110, color: T.t1, fontFamily: T.ff, WebkitFontSmoothing: 'antialiased' }}>
      <PageContainer width="smal">
        <header style={{ padding: '18px 0 4px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center' }}>
            <button type="button" aria-label="Föregående månad" onClick={() => bytManad(-1)} style={rundKnapp}><ChevronLeft size={22} /></button>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, lineHeight: 1.15 }}>{manadRubrik(ar, manad)}</h1>
              <div style={{ fontSize: 13, color: T.t2, marginTop: 3, minHeight: 16 }}>{underradText}</div>
            </div>
            <button type="button" aria-label="Nästa månad" onClick={() => bytManad(1)} style={rundKnapp}><ChevronRight size={22} /></button>
          </div>
          {!arNu && (
            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <button type="button" onClick={() => satt({ ar: nuAr, manad: nuManad })} style={{ minHeight: 44, padding: '0 16px', background: 'transparent', border: 'none', color: T.blue, fontSize: 15, fontWeight: 600, fontFamily: T.ff, cursor: 'pointer' }}>Idag</button>
            </div>
          )}
        </header>

        {/* Flikar — sticky under toppbaren så man kan byta utan att scrolla upp. */}
        <nav style={{ position: 'sticky', top: 'calc(56px + env(safe-area-inset-top))', zIndex: 20, background: T.bg, padding: '10px 0 14px' }}>
          <div role="tablist" style={{ display: 'flex', background: T.group, borderRadius: 10, padding: 3, gap: 3 }}>
            {FLIKAR.map(f => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={flik === f.id}
                onClick={() => satt({ flik: f.id })}
                style={{
                  flex: 1, minHeight: 44, borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: T.ff,
                  fontSize: 15, fontWeight: 600,
                  background: flik === f.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: flik === f.id ? T.t1 : T.t2,
                }}
              >
                {f.namn}
              </button>
            ))}
          </div>
        </nav>

        {fel ? (
          <Fel onRetry={() => setVersion(v => v + 1)} />
        ) : laddar || !fast || !manadsdata || !dagar ? (
          <Laddar vad={MANAD_NAMN[manad - 1]} />
        ) : flik === 'lage' ? (
          <LageFlik
            spar={spar}
            status={status}
            dagar={dagar}
            ar={ar}
            manad={manad}
            antalPlanerade={antalPlanerade}
            dinMaskin={dinMaskinNamn ? { maskinNamn: maskinNamn(dinMaskinNamn), lage: maskinLage, fel: maskinLageFel, onRetry: () => setVersion(v => v + 1) } : null}
          />
        ) : flik === 'planering' ? (
          <PlaneringFlik manadsdata={manadsdata} fast={fast} spar={spar} status={status} dagar={dagar} idag={idag} ar={ar} manad={manad} />
        ) : (
          <UppfoljningFlik
            spar={spar}
            status={status}
            dagar={dagar}
            bolag={bolag?.nyckel === bolagNyckel ? bolag.rader : null}
            bolagFel={bolagFel}
            onRetryBolag={() => { setBolag(null); setVersion(v => v + 1) }}
            antalPlanerade={antalPlanerade}
            ar={ar}
            manad={manad}
          />
        )}
      </PageContainer>
    </div>
  )
}
