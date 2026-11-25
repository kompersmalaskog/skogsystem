'use client'

// /helikopter/veckor — "Hur gick veckorna?": en månad, vecka för vecka mot plan, med växel mellan spåren.
// Båda spåren hämtas direkt (två små RPC-anrop) så bytet är omedelbart.
// Svaret i en mening (pågående vecka) → en rad per vecka med Skördat/Skotat "612 av 669 · 57 kvar" → tryck: maskinerna och orsaken.
// Orden är _lib/veckorText.ts; samma tal som förut (plan, skördat, skotat).
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import PageContainer from '@/components/PageContainer'
import Flikkontroll from '@/components/design/Flikkontroll'
import { AVSTAND, FARG, IKON, KORT, RAD, ROT_MIN_HOJD, TNUM, TRAFFYTA, TYP, VY_ROT } from '@/lib/design/tokens'
import Rad from '@/components/design/Rad'
import Svarsrad from '@/components/design/Svarsrad'
import { ymdLokal } from '@/lib/datumLokal'
import { TYPER, TYP_NAMN } from '../_lib/berakningar'
import { MANAD_NAMN, fmt, manadRubrik } from '../_lib/format'
import { hamtaManuellaMaskiner, hamtaVeckor, type Typ, type VeckaRad } from '../_lib/queries'
import { SPAR_MAX_PX, VECKOR_TVA_SPAR_MIN_PX } from '../_lib/layout'
import { useFonsterBredd } from '../_lib/useFonsterBredd'
import { veckoDatum, veckoRader, veckoSvar } from '../_lib/veckorText'
import { Fel, Laddar, Tomt } from './Tillstand'
import { HK_CSS } from './Lista'
import { RadGrupp, RadLank } from '@/components/ui/RadGrupp'
import Ikon from '@/components/design/Ikon'
import OrsakSheet from './OrsakSheet'

type PerTyp = Record<Typ, VeckaRad[]>
const INGEN_VECKA: Record<Typ, number | null> = { gallring: null, slutavverkning: null }

/** Ingen vecka är utfälld från början: listan ska läsas som den är. */
function forvaldVecka(_veckor: VeckaRad[]): number | null {
  return null
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
  // Vald (utfälld) vecka bor per spår, så båda spåren kan visas samtidigt.
  const [vald, setVald] = useState<Record<Typ, number | null>>(INGEN_VECKA)
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
  }, [data])

  const sattTyp = (t: Typ) => {
    if (t === typ) return
    // Spårbyte: vald vecka följer med om den finns i det andra spåret, annars senaste låsta.
    if (data) {
      setVald(prev => ({ ...prev, [t]: prev[typ] != null && data[t].some(v => v.isovecka === prev[typ]) ? prev[typ] : forvaldVecka(data[t]) }))
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
      onVald={v => setVald(prev => ({ ...prev, [t]: prev[t] === v ? null : v }))}
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
          <div style={{ ...TYP.listtitel, color: FARG.text, padding: `0 ${AVSTAND.xs}px ${AVSTAND.s}px` }}>{TYP_NAMN[t]}</div>
          {sparBlock(t)}
        </div>
      ))}
    </div>
  ) : (
    sparBlock(typ)
  )

  const sidhuvud = (
    <header style={{ display: 'grid', gridTemplateColumns: `${TRAFFYTA.min}px 1fr ${TRAFFYTA.min}px`, alignItems: 'center', padding: `${AVSTAND.l}px 0 ${AVSTAND.m}px` }}>
      <Link href={tillbaka} aria-label="Tillbaka till Uppföljning" style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
        <Ikon namn="chevron_left" storlek={IKON.rad} farg={FARG.bla} />
      </Link>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>Hur gick veckorna?</h1>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{manadRubrik(ar, manad)}</div>
      </div>
      <span />
    </header>
  )

  return (
    <div style={{ ...VY_ROT, padding: 0, minHeight: ROT_MIN_HOJD, paddingBottom: AVSTAND.xxl }}>
      <style>{HK_CSS}</style>
      {/* Bredare än 900 px: ramen rymmer två spår à högst SPAR_MAX_PX. Under det samma kolumn som förut. */}
      <PageContainer width={tvaSpar ? 'full' : 'smal'} style={tvaSpar ? { maxWidth: 2 * SPAR_MAX_PX + AVSTAND.l + 2 * AVSTAND.sidmarginal, marginInline: 'auto', paddingInline: AVSTAND.sidmarginal, boxSizing: 'border-box' } : undefined}>
        {sidhuvud}

        {/* Spårväxel — samma Flikkontroll som Min tid. Vald = typ i URL:en. Försvinner när båda spåren syns. */}
        {!tvaSpar && (
          <div style={{ marginBottom: AVSTAND.l }}>
            <Flikkontroll flikar={TYPER.map(t => [t, TYP_NAMN[t]] as const)} aktiv={typ} onVal={sattTyp} />
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

/** Ett spår: svaret i en mening, sedan en rad per vecka (nyast först). Tryck på en vecka fäller ut maskinerna och orsaken. */
function SparBlock({ veckor, vald, onVald, manuella, onAndraOrsak }: {
  veckor: VeckaRad[]
  vald: number | null
  onVald: (isovecka: number) => void
  manuella: Set<string>
  onAndraOrsak: () => void
}) {
  if (veckor.length === 0) return <Tomt rubrik="Inga arbetsdagar i månaden" />
  const svar = veckoSvar(veckor)
  const lista = [...veckor].reverse()
  return (
    <>
      {svar && <div data-svar="1"><Svarsrad rubrik={svar.rubrik} rad={svar.under} fri /></div>}
      <section style={{ ...KORT, marginBottom: AVSTAND.rad }}>
        {lista.map((v, i) => {
          const r = veckoRader(v)
          const oppen = v.isovecka === vald
          return (
            <div key={v.isovecka} data-vecka={v.isovecka}>
              <Rad
                titel={`Vecka ${v.isovecka}`}
                hoger={<span style={{ ...TYP.meta, color: FARG.text2 }}>{v.status === 'pagar' ? 'pågår' : veckoDatum(v.fran, v.till)}</span>}
                under={[r.skordat, r.skotat].map((x, k) => (
                  <div key={k}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.s, marginTop: AVSTAND.xs, ...TYP.text, color: x.klart ? FARG.text : FARG.text2, fontWeight: x.klart ? 600 : 400 }}>
                      <span style={TNUM}>{x.text}</span>
                      <span style={{ ...TNUM, display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...(x.ord && !x.klart ? { color: FARG.orange, fontWeight: 600 } : null) }}>{x.klart && <Ikon namn="check" storlek={IKON.text} farg={FARG.gron} />}{x.ord}</span>
                    </div>
                    {k === 1 && r.egen && <div data-egen="1" style={{ marginTop: AVSTAND.xs, ...TYP.meta, color: FARG.text2, ...TNUM }}>{r.egen}</div>}
                  </div>
                ))}
                sista={i === lista.length - 1 && !oppen}
                onTryck={() => onVald(v.isovecka)}
                pil={false}
                attr={{ 'aria-expanded': String(oppen) }}
              />
              {oppen && <VeckoDetalj vecka={v} manuella={manuella} sista={i === lista.length - 1} onAndraOrsak={onAndraOrsak} />}
            </div>
          )
        })}
      </section>
    </>
  )
}

/** Utfälld vecka: maskinerna (skördat, sedan skotat) och orsaken. */
function VeckoDetalj({ vecka, manuella, sista, onAndraOrsak }: { vecka: VeckaRad; manuella: Set<string>; sista: boolean; onAndraOrsak: () => void }) {
  const grupper = [['Skördat', 'skordare'], ['Skotat', 'skotare']] as const
  return (
    <div style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.m}px`, borderBottom: sista ? 'none' : RAD.borderBottom }}>
      {grupper.map(([namn, roll]) => {
        const rader = vecka.maskiner.filter(m => m.roll === roll && m.volym > 0).sort((a, b) => b.volym - a.volym)
        const egen = roll === 'skotare' ? Math.round(vecka.skotat_egen ?? 0) : 0
        return rader.length === 0 && egen === 0 ? null : (
          <div key={roll} style={{ marginTop: AVSTAND.s }}>
            <div style={{ ...TYP.micro, color: FARG.text2 }}>{namn} per maskin</div>
            {rader.map(m => (
              <div key={m.maskin_id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: AVSTAND.xs, ...TYP.text, ...TNUM }}>
                <span style={{ color: FARG.text }}>{m.namn}</span>
                <span style={{ color: FARG.text2 }}>{fmt(m.volym)}{manuella.has(m.maskin_id) && <span style={{ color: FARG.text3 }}> · manuell</span>}</span>
              </div>
            ))}
            {egen > 0 && (
              <div data-egen-maskin="1" style={{ display: 'flex', justifyContent: 'space-between', marginTop: AVSTAND.xs, ...TYP.text, ...TNUM }}>
                <span style={{ color: FARG.text }}>Egen skotning</span>
                <span style={{ color: FARG.text2 }}>{fmt(egen)}</span>
              </div>
            )}
          </div>
        )
      })}
      <div style={{ ...TYP.text, color: vecka.orsak ? FARG.text2 : FARG.text3, marginTop: AVSTAND.m }}>{vecka.orsak ? vecka.orsak : 'Ingen orsak angiven'}</div>
      <RadGrupp><RadLank text="Ändra orsak" onClick={onAndraOrsak} /></RadGrupp>
    </div>
  )
}
