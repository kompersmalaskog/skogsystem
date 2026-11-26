'use client'

// Maskinen som maskin — appens tillstånd på en enhet med ett maskinkonto (se lib/maskinkonto/upplast). Ligger i AppRamverk.
//   last      maskinen är maskinen. Förarens egna saker är låsta (lås-ikon, "Vem är du?"), Ekonomi och Personal syns inte alls.
//   upplast   en person har skrivit sin kod: hela appen som hen. Pillen "Martin · Lås" överst. Låser sig av sig själv:
//             tillbaka till kartan, Lås, eller 10 minuter utan tryck.
//   avstangd  maskinens brytare är av — kontot används inte, appen säger det.
// En vanlig förare eller admin i telefon/dator berörs inte: lagret är då 'vanlig' och komponenten renderar bara barnen.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Ikon from '@/components/design/Ikon'
import VemArDuArk from '@/components/maskinkonto/VemArDuArk'
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext'
import { supabase } from '@/lib/supabase'
import { ENHET_MASKIN_ANDRAD, hamtaEnhetMaskin, sattEnhetMaskin } from '@/lib/enhetMaskin'
import { antalBeviljadeSerialPortar, harWebSerial, serialGpsVald } from '@/lib/gpsSerialFlagga'
import { AVSTAND, FARG, KNAPP, LAYOUT, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens'
import { blirMaskinAutomatiskt, gaTillKartan, lasMaskinen, loggaUtMaskinen } from '@/lib/maskinkonto/klient'
import { lasAutoPaus, skaBlimaMaskin } from '@/lib/maskinkonto/autoStart'
import { minnsLageForeUpplasning } from '@/lib/maskinkonto/aterstall'
import {
  IDLE_MS, arDoldSokvag, arKartSokvag, arLastSokvag, lasMaskinSession, lasUpplast, sattMaskinSession, sattUpplast, utgangen, type Upplast,
} from '@/lib/maskinkonto/upplast'

export type Lage = 'laddar' | 'vanlig' | 'last' | 'avstangd' | 'upplast'

export type MaskinKonto = {
  lage: Lage
  /** Maskinens id (maskinkonto eller upplåst på en maskin). */
  maskinId: string | null
  /** Vem som har låst upp (lage = upplast). */
  upplast: Upplast | null
  /** Öppnar "Vem är du?". `href` = dit man vill efter upplåsningen (en låst rad). */
  oppnaVemArDu: (href?: string) => void
  las: () => void
  loggaUtMaskinen: () => void
}

const VANLIG: MaskinKonto = { lage: 'vanlig', maskinId: null, upplast: null, oppnaVemArDu: () => undefined, las: () => undefined, loggaUtMaskinen: () => undefined }
const Ctx = createContext<MaskinKonto>(VANLIG)
export const useMaskinKonto = (): MaskinKonto => useContext(Ctx)

/** Är enhetens läge ett där maskinens begränsningar gäller (maskinkonto eller upplåst på en maskin)? Används av vyregistret (`Behorighet.maskin`). */
export const arMaskinLage = (l: Lage): boolean => l === 'last' || l === 'upplast'

export default function MaskinKontoProvider({ children }: { children: ReactNode }) {
  const { medarbetare, loading } = useCurrentMedarbetare()
  const pathname = usePathname() ?? ''
  const [lage, setLage] = useState<Lage>('laddar')
  const [maskinId, setMaskinId] = useState<string | null>(null)
  const [upplast, setUpplastState] = useState<Upplast | null>(null)
  const [vem, setVem] = useState<{ href: string } | null>(null)
  const lasKorsRef = useRef(false)
  const autoRef = useRef<string | null>(null)   // maskinen som redan prövats i den här sidladdningen (ett försök per laddning, aldrig en slinga)
  const [enhetTick, setEnhetTick] = useState(0)

  const las = useCallback(() => {
    if (lasKorsRef.current) return
    lasKorsRef.current = true
    void lasMaskinen()
  }, [])
  const loggaUt = useCallback(() => { if (!lasKorsRef.current) { lasKorsRef.current = true; void loggaUtMaskinen() } }, [])

  // Vilket läge är enheten i? Avgörs av vem som är inloggad.
  useEffect(() => {
    if (loading) return
    let avbruten = false
    if (medarbetare?.roll === 'maskin') {
      sattUpplast(null)   // maskinkontot är inloggat: en kvarlämnad upplåsning gäller inte
      setLage('last')     // låst tills databasen sagt något annat — Ekonomi och Personal ska aldrig hinna blinka förbi
      void (async () => {
        const { data } = await supabase.rpc('maskin_konto_lage')
        if (avbruten) return
        const l = data as { maskin_id?: string; aktiv?: boolean } | null
        if (!l?.maskin_id) { setLage('avstangd'); return }
        setMaskinId(l.maskin_id)
        if (l.aktiv) { sattEnhetMaskin(l.maskin_id); setLage('last') } else setLage('avstangd')
      })()
      return () => { avbruten = true }
    }
    const u = lasUpplast()
    const ms = lasMaskinSession()
    if (u && ms && medarbetare && u.id === medarbetare.id) {
      if (utgangen(u, Date.now())) { las(); return }
      setUpplastState(u); setMaskinId(ms.maskin_id); setLage('upplast')
      return
    }
    // Kvarlämnat men fel person inloggad (någon loggade in som sig själv): städa, enheten är en vanlig enhet.
    if (u || ms) { sattUpplast(null); sattMaskinSession(null) }
    setLage('vanlig')
    return () => { avbruten = true }
  }, [medarbetare, loading, las])

  // Enheten väljer maskin (frågan "Vilken maskin är det här?") eller släpper den: utvärdera om datorn ska bli maskinen.
  useEffect(() => {
    const f = () => setEnhetTick(t => t + 1)
    window.addEventListener(ENHET_MASKIN_ANDRAD, f)
    return () => window.removeEventListener(ENHET_MASKIN_ANDRAD, f)
  }, [])

  // MASKINENS KONTO SKAPAS OCH ANVÄNDS AV SIG SJÄLVT. En riktig maskindator (Web Serial-GPS, vald maskin, inte testläget) där en förare eller admin
  // är inloggad ber servern om maskinens konto; servern kontrollerar brytaren, skapar kontot vid behov och ger en engångstoken. Inget tryck, inget
  // lösenord. Brytaren av, telefon, surfplatta, testläge och hemdator utan maskinens GPS berörs aldrig (se lib/maskinkonto/autoStart).
  useEffect(() => {
    if (lage !== 'vanlig' || loading || !medarbetare) return
    let avbruten = false
    void (async () => {
      const serialFlagga = serialGpsVald()
      const beviljadePortar = harWebSerial() && !serialFlagga ? await antalBeviljadeSerialPortar() : 0
      if (avbruten) return
      const enhetMaskinId = hamtaEnhetMaskin()
      const ska = skaBlimaMaskin({ roll: medarbetare.roll, pathname, harWebSerial: harWebSerial(), serialFlagga, beviljadePortar, enhetMaskinId, pausTill: lasAutoPaus(), nu: Date.now() })
      if (!ska || !enhetMaskinId || autoRef.current === enhetMaskinId) return
      autoRef.current = enhetMaskinId
      // Efter det här anropet ändras inget om det gick fel (personen är kvar som förut). Går det bra är enheten maskinen: ladda om till kartan.
      if ((await blirMaskinAutomatiskt(enhetMaskinId)) === 'ok') gaTillKartan()
    })()
    return () => { avbruten = true }
  }, [lage, loading, medarbetare, pathname, enhetTick])

  // Upplåst: senaste tryck sparas, och en timer låser efter 10 min utan tryck. Karta = lås.
  useEffect(() => {
    if (lage !== 'upplast') return
    let senast = 0
    const stampla = () => {
      const nu = Date.now()
      if (nu - senast < 3000) return
      senast = nu
      const u = lasUpplast()
      if (u) sattUpplast({ ...u, aktivitet: nu })
    }
    const handelser = ['pointerdown', 'keydown', 'touchstart'] as const
    handelser.forEach(h => document.addEventListener(h, stampla, { passive: true }))
    const t = setInterval(() => {
      const u = lasUpplast()
      if (!u || utgangen(u, Date.now(), IDLE_MS)) las()
    }, 10_000)
    return () => { handelser.forEach(h => document.removeEventListener(h, stampla)); clearInterval(t) }
  }, [lage, las])
  useEffect(() => { if (lage === 'upplast' && arKartSokvag(pathname)) las() }, [lage, pathname, las])

  // Varje väg till "Vem är du?" går här: maskinen minns hur den såg ut INNAN upplåsningen (lådan över kartan eller körvyn), så att låsningen
  // kommer tillbaka dit (lib/maskinkonto/aterstall).
  const oppnaVem = useCallback((href: string) => { minnsLageForeUpplasning(); setVem({ href }) }, [])

  const varde = useMemo<MaskinKonto>(() => ({
    lage, maskinId, upplast, oppnaVemArDu: (href = '/') => oppnaVem(href), las, loggaUtMaskinen: loggaUt,
  }), [lage, maskinId, upplast, las, loggaUt, oppnaVem])

  const hemma = <Link href="/" style={{ ...KNAPP.lank, ...TYP.text, display: 'inline-flex', alignItems: 'center', minHeight: TRAFFYTA.min }}>Till menyn</Link>
  let innehall: ReactNode = children
  if (lage === 'avstangd') {
    innehall = (
      <Skarm ikon="power_off" rubrik="Maskinkontot är avstängt" text="Den här maskinen använder inte maskinkonto just nu. Logga in som förare.">
        <button type="button" onClick={loggaUt} style={KNAPP.primar}>Logga ut</button>
      </Skarm>
    )
  } else if ((lage === 'last' || (lage === 'upplast' && upplast?.roll !== 'admin')) && arDoldSokvag(pathname)) {
    // Dolt: finns inte på maskinen. Bara en admin som låst upp ser Ekonomi och Personal.
    innehall = <Skarm ikon="lock" rubrik="Finns inte på maskinen" text="Den här delen öppnas från kontoret.">{hemma}</Skarm>
  } else if (lage === 'last' && arLastSokvag(pathname)) {
    innehall = (
      <Skarm ikon="lock" rubrik="Förarens egna saker" text="Välj vem du är för att öppna dem.">
        <button type="button" onClick={() => oppnaVem(pathname)} style={KNAPP.primar}>Vem är du?</button>
        {hemma}
      </Skarm>
    )
  }

  return (
    <Ctx.Provider value={varde}>
      {innehall}
      {lage === 'upplast' && upplast && <LasPiller namn={upplast.namn} onLas={las} />}
      {lage === 'last' && vem && <VemArDuArk efterUpplasning={vem.href} onStang={() => setVem(null)} />}
    </Ctx.Provider>
  )
}

function Skarm({ ikon, rubrik, text, children }: { ikon: string; rubrik: string; text: string; children?: ReactNode }) {
  return (
    <div data-maskin-skarm style={{ minHeight: '100vh', boxSizing: 'border-box', paddingTop: LAYOUT.topbar, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.m, paddingLeft: AVSTAND.sidmarginal, paddingRight: AVSTAND.sidmarginal, paddingBottom: AVSTAND.xl, textAlign: 'center', color: FARG.text }}>
      <Ikon namn={ikon} storlek={48} farg={FARG.text2} />
      <h1 style={{ ...TYP.titel, margin: 0 }}>{rubrik}</h1>
      <p style={{ ...TYP.text, color: FARG.text2, margin: 0, maxWidth: 360 }}>{text}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, width: '100%', maxWidth: 320, marginTop: AVSTAND.m }}>{children}</div>
    </div>
  )
}

/** Den lilla pillen överst: vem som är inne, och ett tryck låser. */
function LasPiller({ namn, onLas }: { namn: string; onLas: () => void }) {
  return (
    <button type="button" data-las-pill onClick={onLas} aria-label={`${namn} är inloggad. Lås maskinen.`}
      style={{
        position: 'fixed', top: `calc(env(safe-area-inset-top, 0px) + ${AVSTAND.xs}px)`, right: AVSTAND.s, zIndex: 1200,
        display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`,
        borderRadius: RADIE.cirkel, border: `1px solid ${FARG.linje}`, background: FARG.upphojt, color: FARG.text, cursor: 'pointer',
        fontFamily: 'inherit', ...TYP.meta, fontWeight: 600, touchAction: 'manipulation',
      }}>
      <span>{namn.split(' ')[0]}</span>
      <span aria-hidden="true" style={{ color: FARG.text3 }}>·</span>
      <Ikon namn="lock" storlek={16} farg={FARG.text} fylld />
      <span>Lås</span>
    </button>
  )
}
