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
import PageContainer from '@/components/PageContainer'
import Flikkontroll from '@/components/design/Flikkontroll'
import { SheetLageContext } from '@/components/Sheet'
import { AVSTAND, FARG, KNAPP, LAYOUT, ROT_MIN_HOJD, TNUM, TRAFFYTA, TYP, VY_ROT } from '@/lib/design/tokens'
import { ymdLokal } from '@/lib/datumLokal'
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext'
import {
  hamtaBolag, hamtaFast, hamtaManadsdata, hamtaManuellaMaskiner, hamtaMaskinLage, hamtaMaskiner, hamtaSenasteLass,
  type BolagRad, type FastData, type Manadsdata, type MaskinLage, type MaskinManad,
} from '../_lib/queries'
import { TYPER, globalaArbetsdagar, manadStatus, maskinNamn, raknaSpar, valjBas, type SparLage } from '../_lib/berakningar'
import type { Typ } from '../_lib/queries'
import { MANAD_NAMN, dagarText, manadRubrik, relativTid } from '../_lib/format'
import { KORT_MAX_PX, KOLUMN_GAP, PANEL_PX, SIDMARGINAL, antalKolumner, hogerFlik, kolumnerBredd, lageForBredd, panelPlats } from '../_lib/layout'
import { useFonsterBredd } from '../_lib/useFonsterBredd'
import { Fel, Laddar } from './Tillstand'
import { HK_CSS } from './Lista'
import Ikon from '@/components/design/Ikon'
import LageFlik from './LageFlik'
import PlaneringFlik from './PlaneringFlik'
import UppfoljningFlik from './UppfoljningFlik'
import HistorikInnehall from './HistorikInnehall'
import { PanelContext, type PanelPost } from './PanelVal'

export type Flik = 'lage' | 'planering' | 'uppfoljning' | 'historik'
/** Telefon: fyra flikar. Stor skärm: tre kolumner (Historik nås som panel ur Uppföljning). */
const FLIKAR: { id: Flik; namn: string }[] = [
  { id: 'lage', namn: 'Läge' },
  { id: 'planering', namn: 'Planering' },
  { id: 'uppfoljning', namn: 'Uppföljning' },
  { id: 'historik', namn: 'Historik' },
]
const KOLUMNER = FLIKAR.filter(f => f.id !== 'historik')

function lasFlik(v: string | null): Flik {
  return v === 'planering' || v === 'uppfoljning' || v === 'historik' ? v : 'lage'
}

/** iPad: högerkolumnens tre val. Läge ligger alltid i vänsterkolumnen. */
const HOGER_FLIKAR = FLIKAR.filter(f => f.id !== 'lage')

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

  // Layoutläge: telefon (en kolumn, tre flikar) · iPad (Läge + Planering|Uppföljning) · stor (tre kolumner).
  // `flik` i adressen styr bara telefon (vilken flik) och iPad (högerkolumnen; `lage` = Planering). På stor skärm ignoreras den.
  const fonsterBredd = useFonsterBredd()
  const lage = lageForBredd(fonsterBredd)
  const n = antalKolumner(lage)
  const hoger = hogerFlik(flik)
  const synlig = (f: Flik): boolean => (lage === 'telefon' ? flik === f : lage === 'ipad' ? f === 'lage' || f === hoger : true)
  const uppfSynlig = synlig('uppfoljning')

  // Öppen sheet/panel — EN åt gången i hela vyn, även när flera flikar syns samtidigt.
  const [panel, setPanel] = useState<PanelPost>(null)
  useEffect(() => { setPanel(null) }, [flik, ar, manad, lage])
  const panelStyrning = useMemo(() => ({ panel, satt: setPanel }), [panel])
  const panelBredvid = lage !== 'telefon' && panel != null && panelPlats(fonsterBredd, n)

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
  // Manuell datakälla (JD810E): etiketten "manuell" i Uppföljning/Veckor och Läge-varningen "inga lass registrerade".
  const [manuella, setManuella] = useState<Set<string>>(() => new Set())
  const [senasteLass, setSenasteLass] = useState<Record<string, string | null> | null>(null)
  const [fastFel, setFastFel] = useState<string | null>(null)
  const [manadsdata, setManadsdata] = useState<Manadsdata | null>(null)
  const [manadFel, setManadFel] = useState<string | null>(null)
  const [laddarManad, setLaddarManad] = useState(true)
  const [bolag, setBolag] = useState<{ nyckel: string; rader: BolagRad[] } | null>(null)
  const [bolagFel, setBolagFel] = useState<string | null>(null)
  const [maskinerManad, setMaskinerManad] = useState<{ nyckel: string; rader: MaskinManad[] } | null>(null)
  const [maskinerFel, setMaskinerFel] = useState<string | null>(null)
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
    hamtaManuellaMaskiner().then(async m => {
      if (avbruten) return
      setManuella(m)
      if (m.size === 0) { setSenasteLass({}); return }
      const r = await hamtaSenasteLass(Array.from(m))
      if (avbruten) return
      setSenasteLass(r.error != null ? null : r.data)
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
    if (!uppfSynlig) return
    if (bolag?.nyckel === bolagNyckel) return
    let avbruten = false
    setBolagFel(null)
    hamtaBolag(ar, manad, idag).then(r => {
      if (avbruten) return
      if (r.error != null) setBolagFel(r.error)
      else setBolag({ nyckel: bolagNyckel, rader: r.data })
    })
    return () => { avbruten = true }
  }, [uppfSynlig, ar, manad, idag, bolag, bolagNyckel, version])

  // Maskinsektionen på Uppföljning — lazy när fliken öppnas, cachat per månad.
  useEffect(() => {
    if (!uppfSynlig) return
    if (maskinerManad?.nyckel === bolagNyckel) return
    let avbruten = false
    setMaskinerFel(null)
    hamtaMaskiner(ar, manad, idag).then(r => {
      if (avbruten) return
      if (r.error != null) setMaskinerFel(r.error)
      else setMaskinerManad({ nyckel: bolagNyckel, rader: r.data })
    })
    return () => { avbruten = true }
  }, [uppfSynlig, ar, manad, idag, maskinerManad, bolagNyckel, version])

  const status = manadStatus(ar, manad, idag)
  const dagar = useMemo(() => (manadsdata ? globalaArbetsdagar(manadsdata.arbetsdagar) : null), [manadsdata])
  const spar: SparLage[] = useMemo(() => {
    if (!manadsdata || !dagar) return []
    return TYPER.map(t => {
      const rad = valjBas(manadsdata.spar, t)
      return rad ? raknaSpar(rad, dagar, manadsdata.takter) : null
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

  // Samma tre kort på alla bredder — bara hur många som syns samtidigt skiljer.
  const innehall = (f: Flik) => {
    // Historiken hänger inte på månadens data: den hämtar själv och visas även om månaden inte gått att läsa.
    if (f === 'historik') return <HistorikInnehall />
    if (!fast || !manadsdata || !dagar) return null
    if (f === 'lage') {
      return (
        <LageFlik
          spar={spar}
          status={status}
          dagar={dagar}
          ar={ar}
          manad={manad}
          idag={idag}
          maskiner={fast.maskiner}
          bestallningar={manadsdata.bestallningar}
          utanTyp={manadsdata.utanTyp}
          antalPlanerade={antalPlanerade}
          dinMaskin={dinMaskinNamn ? { maskinNamn: maskinNamn(dinMaskinNamn), lage: maskinLage, fel: maskinLageFel, onRetry: () => setVersion(v => v + 1) } : null}
          manuella={manuella}
          senasteLass={senasteLass}
          arbetsdagar={manadsdata.arbetsdagar}
          maskinStopp={manadsdata.maskinStopp}
          rapportdagar={manadsdata.rapportdagar}
        />
      )
    }
    if (f === 'planering') {
      return <PlaneringFlik manadsdata={manadsdata} fast={fast} spar={spar} status={status} dagar={dagar} idag={idag} ar={ar} manad={manad} />
    }
    return (
      <UppfoljningFlik
        spar={spar}
        status={status}
        dagar={dagar}
        bolag={bolag?.nyckel === bolagNyckel ? bolag.rader : null}
        bolagFel={bolagFel}
        onRetryBolag={() => { setBolag(null); setVersion(v => v + 1) }}
        maskiner={maskinerManad?.nyckel === bolagNyckel ? maskinerManad.rader : null}
        maskinerFel={maskinerFel}
        onRetryMaskiner={() => { setMaskinerManad(null); setVersion(v => v + 1) }}
        antalPlanerade={antalPlanerade}
        ar={ar}
        manad={manad}
        manuella={manuella}
        arAdmin={medarbetare?.roll === 'admin'}
        visaHistorikRad={lage === 'stor'}
      />
    )
  }
  const klart = !fel && !laddar && fast != null && manadsdata != null && dagar != null
  const tillstand = fel
    ? <Fel onRetry={() => setVersion(v => v + 1)} />
    : <Laddar vad={MANAD_NAMN[manad - 1]} />

  // Flikraden: samma Flikkontroll som Min tid. Sticky i flödet under toppfältet på telefon.
  const flikrad = (lista: { id: Flik; namn: string }[], sticky: boolean) => (
    <nav style={sticky ? { position: 'sticky', top: LAYOUT.topbar, zIndex: 20, background: FARG.bg, padding: `${AVSTAND.m}px 0 ${AVSTAND.l}px` } : { paddingBottom: AVSTAND.l }}>
      <Flikkontroll
        flikar={lista.map(f => [f.id, f.namn] as const)}
        aktiv={lage === 'ipad' ? hoger : flik}
        onVal={id => satt({ flik: id })}
      />
    </nav>
  )

  // Månadspilarna är blå (navigerar), utan ram. Mellan pilarna står alltid månaden man tittar på; Idag är en egen liten länk
  // (KNAPP.tertiar) som bara finns när vald månad inte är innevarande — samma mönster som ledighetens kalender.
  const pil = (steg: -1 | 1) => (
    <button type="button" aria-label={steg < 0 ? 'Föregående månad' : 'Nästa månad'} onClick={() => bytManad(steg)}
      style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
      <Ikon namn={steg < 0 ? 'chevron_left' : 'chevron_right'} farg={FARG.bla} />
    </button>
  )
  const idagKnapp = (
    <button type="button" onClick={() => satt({ ar: nuAr, manad: nuManad })} style={{ ...KNAPP.tertiar, minWidth: TRAFFYTA.min, justifyContent: 'center', padding: `0 ${AVSTAND.s}px` }}>Idag</button>
  )

  // Månadsrubriken (telefon och iPad): månaden stor mellan pilarna, underraden under, Idag under när det inte är innevarande månad
  // (till höger om pilarna får den inte plats på en telefon: rubriken fyller raden).
  const manadsHuvud = (
    <div style={{ padding: `${AVSTAND.l}px 0 ${AVSTAND.xs}px` }}>
      <div style={{ display: 'grid', gridTemplateColumns: `${TRAFFYTA.min}px 1fr ${TRAFFYTA.min}px`, alignItems: 'center' }}>
        {pil(-1)}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ margin: 0, ...TYP.titel, color: FARG.text }}>{manadRubrik(ar, manad)}</h1>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, minHeight: AVSTAND.l }}>{underradText}</div>
        </div>
        {pil(1)}
      </div>
      {!arNu && <div style={{ textAlign: 'center' }}>{idagKnapp}</div>}
    </div>
  )

  // Historikens rubrik (telefon): vyn gäller alla månader, så ingen pil och ingen "Idag".
  const historikHuvud = (
    <div style={{ padding: `${AVSTAND.l}px 0 ${AVSTAND.xs}px`, textAlign: 'center' }}>
      <h1 style={{ margin: 0, ...TYP.titel, color: FARG.text }}>Historik</h1>
      <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Avslutade månader mot beställning</div>
    </div>
  )

  // Kolumngruppens ram: högst n kort à KORT_MAX_PX, centrerad, 16 px sidmarginal. Rubrikraden och kolumnerna delar den, så de linjerar.
  const ram: React.CSSProperties = { width: '100%', maxWidth: kolumnerBredd(n) + 2 * SIDMARGINAL, marginInline: 'auto', paddingInline: SIDMARGINAL, boxSizing: 'border-box' }

  const rot: React.CSSProperties = { ...VY_ROT, padding: 0, minHeight: ROT_MIN_HOJD, paddingBottom: AVSTAND.xxl, WebkitFontSmoothing: 'antialiased' }

  // ── Telefon: en kolumn, tre flikar, sheets underifrån ──
  if (lage === 'telefon') {
    return (
      <PanelContext.Provider value={panelStyrning}>
        <SheetLageContext.Provider value="ark">
          <div style={rot}>
            <style>{HK_CSS}</style>
            {/* Ett kort blir aldrig bredare än KORT_MAX_PX (påverkar bara fönster bredare än ~450 px). */}
            <PageContainer width="smal" style={{ maxWidth: KORT_MAX_PX + 2 * SIDMARGINAL }}>
              {/* Historiken gäller alla månader: ingen månadsrubrik med pilar som inte gör något. */}
              <header>{flik === 'historik' ? historikHuvud : manadsHuvud}</header>

              {/* Flikar — sticky under toppbaren så man kan byta utan att scrolla upp. */}
              {flikrad(FLIKAR, true)}

              {flik === 'historik' ? innehall('historik') : !klart ? tillstand : innehall(flik)}
            </PageContainer>
          </div>
        </SheetLageContext.Provider>
      </PanelContext.Provider>
    )
  }

  // ── iPad och stor skärm ──
  // Panelen läggs bredvid kolumnerna när det finns plats (kolumngruppen skjuts åt vänster, korten behåller sin bredd), annars över högerkolumnen.
  const stor = lage === 'stor'
  return (
    <PanelContext.Provider value={panelStyrning}>
      <SheetLageContext.Provider value="panel">
        <div style={{ ...rot, paddingRight: panelBredvid ? PANEL_PX + KOLUMN_GAP : 0 }}>
          <style>{HK_CSS}</style>
          {/* Månadsrubriken är sticky på alla bredder över telefon och spänner över kolumnerna. */}
          <header style={{ position: 'sticky', top: LAYOUT.topbar, zIndex: 20, background: FARG.bg }}>
            <div style={ram}>
              {stor ? (
                // Stor: pilar och månad EN gång, centrerat. Månadens bredd är fast (längsta namnet ryms), så pilarna står still när man bläddrar.
                // Idag hänger till höger om pilarna och flyttar inget: gruppen ligger på samma plats med och utan den.
                <div style={{ display: 'flex', justifyContent: 'center', padding: `${AVSTAND.s}px 0` }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
                    {pil(-1)}
                    <div style={{ width: AVSTAND.xxl * 5, textAlign: 'center', ...TYP.listtitel, ...TNUM, color: FARG.text }}>{manadRubrik(ar, manad)}</div>
                    {pil(1)}
                    {!arNu && <div style={{ position: 'absolute', left: '100%', top: 0, bottom: 0, display: 'flex', alignItems: 'center', marginLeft: AVSTAND.s }}>{idagKnapp}</div>}
                  </div>
                </div>
              ) : (
                <>
                  {manadsHuvud}
                  <div style={{ height: AVSTAND.m }} />
                </>
              )}
            </div>
          </header>

          <div style={ram}>
            {!klart ? (
              <div style={{ maxWidth: KORT_MAX_PX, marginInline: 'auto' }}>{tillstand}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, ${KORT_MAX_PX}px))`, columnGap: KOLUMN_GAP, justifyContent: 'center', alignItems: 'start' }}>
                {stor ? (
                  KOLUMNER.map(f => (
                    <div key={f.id} style={{ minWidth: 0 }}>
                      <div style={{ padding: `0 ${AVSTAND.xs}px ${AVSTAND.m}px` }}>
                        <div style={{ ...TYP.listtitel, color: FARG.text }}>{f.namn}</div>
                        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
                          {manadRubrik(ar, manad)}{f.id === 'lage' && underradText ? ` · ${underradText}` : ''}
                        </div>
                      </div>
                      {innehall(f.id)}
                    </div>
                  ))
                ) : (
                  <>
                    <div style={{ minWidth: 0 }}>{innehall('lage')}</div>
                    <div style={{ minWidth: 0 }}>
                      {flikrad(HOGER_FLIKAR, false)}
                      {innehall(hoger)}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </SheetLageContext.Provider>
    </PanelContext.Provider>
  )
}
