'use client'

// /helikopter — EN sida, inga flikar (omtag 2026-10-23, Martin: "så att ett barn förstår den").
//
// Uppifrån: månaden (‹ Oktober 2026 ›, arbetsdagar kvar) · svaret i EN mening · korten i ett rutnät:
//   SKOTAT MOT BESTÄLLNING (ett tal per spår) · BEHÖVER DIG (bara när något kräver dig) · KLAR (ett datum per maskin) ·
//   DIN MASKIN (förare) · SKÖRDARE · SKOTARE · MER (länkrader: Skördat, Maskiner, Veckor, Per bolag, Tidigare månader, Månadsfacit) · ONSDAGSNOTIS (admin).
// Allt som står på sidan räknas i _lib/kort.ts (ren vymodell); den här filen hämtar och ritar.
//
// Bredd: korten ligger i ett rutnät med CONTAINER QUERIES (sidans egen bredd): 1 kolumn, 2 från 640 px, 3 från 960 px.
// Från 1100 px står månaderna som sidokolumn till vänster (Manadssida), som markägarrapportens lista. Ark underifrån under 600 px, panel från höger annars.
//
// Data i lager, varje med eget fel (ett fel är ett fel, aldrig tomt):
//   fast — maskiner, senaste importtid, bolagshistorik (en gång) · manadsdata — spår, arbetsdagar, planering, stopp (vid månadsbyte) ·
//   klar — helikopter_ny_klar (vid månadsbyte, inte för avslutad månad) · maskiner — månadens maskiner · bolag — först när Per bolag öppnas.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SheetLageContext } from '@/components/Sheet'
import { Sheet } from '@/components/Sheet'
import Svarsrad from '@/components/design/Svarsrad'
import Sektion from '@/components/design/Sektion'
import Ikon from '@/components/design/Ikon'
import { RadGrupp, RadLank } from '@/components/ui/RadGrupp'
import { AVSTAND, FARG, FONT, KNAPP, KOLUMN, KOLUMN_CSS, LAYOUT, ROT_MIN_HOJD, TRAFFYTA, TYP, designCss } from '@/lib/design/tokens'
import { ymdLokal } from '@/lib/datumLokal'
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext'
import {
  hamtaBolag, hamtaFast, hamtaManadsdata, hamtaManuellaMaskiner, hamtaMaskinLage, hamtaMaskiner, hamtaSenasteLass,
  type BolagRad, type FastData, type Manadsdata, type MaskinLage, type MaskinManad, type Typ,
} from '../_lib/queries'
import { TYPER, TYP_NAMN, globalaArbetsdagar, kapacitetsMaskiner, manadStatus, maskinNamn, planeratPerTyp, raknaSpar, valjBas, type PlaneratResultat, type SparLage } from '../_lib/berakningar'
import { MANAD_NAMN, manadRubrik, relativTid } from '../_lib/format'
import { behoverDig, klarRader, sidSvar, sparKort, type BehovRad } from '../_lib/kort'
import { facitHref } from '../_lib/manadsfacit'
import { useKlar } from '../_lib/useKlar'
import { useFonsterBredd } from '../_lib/useFonsterBredd'
import { Fel, Laddar } from './Tillstand'
import { HK_CSS } from './Lista'
import { PanelContext, type PanelPost } from './PanelVal'
import SkotatSektion from './SkotatSektion'
import BehoverDigSektion from './BehoverDigSektion'
import KlarSektion from './KlarSektion'
import { DinMaskinSektion, MaskinSektion, VeckoNotisSektion } from './MaskinSektion'
import Manadssida, { helikopterHref } from './Manadssida'
import HistorikInnehall from './HistorikInnehall'
import MaskinerSheet from './MaskinerSheet'
import UtanTypSheet from './UtanTypSheet'
import EjTilldeladeSheet from './EjTilldeladeSheet'
import MotBestallningSheet from './MotBestallningSheet'
import BolagSheet from './BolagSheet'
import SkordatSheet from './SkordatSheet'

/** Från denna bredd står månaderna som sidokolumn. Samma som markägarrapporten. */
export const SIDOKOLUMN_FRAN_PX = 1100
const SIDOKOLUMN_BREDD_PX = 360
/** Under detta är ett ark underifrån; från det en panel från höger. */
export const ARK_MAX_PX = 600
/** Rutnätets brytpunkter, på SIDANS bredd (container queries), inte fönstrets. */
export const TVA_KOLUMNER_PX = 640
export const TRE_KOLUMNER_PX = 960

const css = `
.hk-ram { display: flex; min-height: ${ROT_MIN_HOJD}; background: ${FARG.bg}; color: ${FARG.text}; -webkit-font-smoothing: antialiased; }
.hk-sida { display: none; }
.hk-innehall { flex: 1; min-width: 0; }
.hk-sidan { container-type: inline-size; max-width: ${KOLUMN.bred + 2 * AVSTAND.sidmarginal}px; margin: 0 auto; box-sizing: border-box; padding: 0 ${AVSTAND.sidmarginal}px ${AVSTAND.xxl * 2}px; }
.hk-rutnat { display: grid; grid-template-columns: minmax(0, 1fr); column-gap: ${AVSTAND.xl}px; align-items: start; }
@container (min-width: ${TVA_KOLUMNER_PX}px) { .hk-rutnat { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (min-width: ${TRE_KOLUMNER_PX}px) { .hk-rutnat { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: ${SIDOKOLUMN_FRAN_PX}px) {
  .hk-sida { display: block; width: ${SIDOKOLUMN_BREDD_PX}px; flex-shrink: 0; box-sizing: border-box; border-right: 1px solid ${FARG.linje};
    padding: ${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl}px; position: sticky; top: ${LAYOUT.topbar}; height: ${ROT_MIN_HOJD}; overflow-y: auto; }
}
`

type Ark = 'maskiner' | 'utan' | 'ej' | 'best' | 'skordat' | 'historik' | `bolag:${Typ}`

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
  const arNu = ar === nuAr && manad === nuManad
  const status = manadStatus(ar, manad, idag)
  const manadNamn = MANAD_NAMN[manad - 1]

  // Gamla adresser med ?flik= (Läge/Planering/Uppföljning/Historik) landar på samma sida — fliken finns inte längre.
  const satt = useCallback((n: { ar: number; manad: number }) => {
    router.replace(helikopterHref(n.ar, n.manad), { scroll: false })
  }, [router])
  const bytManad = (steg: number) => {
    const d = new Date(ar, manad - 1 + steg, 1)
    satt({ ar: d.getFullYear(), manad: d.getMonth() + 1 })
  }

  const fonsterBredd = useFonsterBredd()
  const sheetLage = fonsterBredd < ARK_MAX_PX ? 'ark' : 'panel'

  // EN öppen sheet/panel åt gången (PanelContext delas med arken som själva läser usePanelVal).
  const [panel, setPanel] = useState<PanelPost>(null)
  useEffect(() => { setPanel(null) }, [ar, manad])
  const panelStyrning = useMemo(() => ({ panel, satt: setPanel }), [panel])

  const { medarbetare } = useCurrentMedarbetare()
  const arAdmin = medarbetare?.roll === 'admin'
  const [version, setVersion] = useState(0)
  const [fast, setFast] = useState<FastData | null>(null)
  const [fastFel, setFastFel] = useState<string | null>(null)
  const [manuella, setManuella] = useState<Set<string>>(() => new Set())
  const [senasteLass, setSenasteLass] = useState<Record<string, string | null> | null>(null)
  const [manadsdata, setManadsdata] = useState<Manadsdata | null>(null)
  const [manadFel, setManadFel] = useState<string | null>(null)
  const [laddarManad, setLaddarManad] = useState(true)
  const [bolag, setBolag] = useState<{ nyckel: string; rader: BolagRad[] } | null>(null)
  const [bolagFel, setBolagFel] = useState<string | null>(null)
  const [maskinerManad, setMaskinerManad] = useState<{ nyckel: string; rader: MaskinManad[] } | null>(null)
  const [maskinerFel, setMaskinerFel] = useState<string | null>(null)
  const [maskinLage, setMaskinLage] = useState<MaskinLage | null>(null)
  const [maskinLageFel, setMaskinLageFel] = useState<string | null>(null)

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

  const nyckel = `${ar}-${manad}`
  useEffect(() => {
    if (maskinerManad?.nyckel === nyckel) return
    let avbruten = false
    setMaskinerFel(null)
    hamtaMaskiner(ar, manad, idag).then(r => {
      if (avbruten) return
      if (r.error != null) setMaskinerFel(r.error)
      else setMaskinerManad({ nyckel, rader: r.data })
    })
    return () => { avbruten = true }
  }, [ar, manad, idag, maskinerManad, nyckel, version])

  // Per bolag — först när arket öppnas, cachat per månad.
  const bolagOppet = panel?.agare === 'sida' && panel.val.startsWith('bolag:')
  useEffect(() => {
    if (!bolagOppet || bolag?.nyckel === nyckel) return
    let avbruten = false
    setBolagFel(null)
    hamtaBolag(ar, manad, idag).then(r => {
      if (avbruten) return
      if (r.error != null) setBolagFel(r.error)
      else setBolag({ nyckel, rader: r.data })
    })
    return () => { avbruten = true }
  }, [bolagOppet, ar, manad, idag, bolag, nyckel, version])

  const klar = useKlar(ar, manad, idag, status !== 'avslutad')

  // ── Räkningen (allt som står på sidan) ──
  const dagar = useMemo(() => (manadsdata ? globalaArbetsdagar(manadsdata.arbetsdagar) : null), [manadsdata])
  const spar: SparLage[] = useMemo(() => {
    if (!manadsdata || !dagar) return []
    return TYPER.map(t => {
      const rad = valjBas(manadsdata.spar, t)
      return rad ? raknaSpar(rad, dagar, manadsdata.takter) : null
    }).filter((x): x is SparLage => x != null)
  }, [manadsdata, dagar])
  const antalPlanerade = useMemo(() => {
    const n: Record<Typ, number> = { gallring: 0, slutavverkning: 0 }
    for (const o of manadsdata?.planering ?? []) if (o.typ === 'gallring' || o.typ === 'slutavverkning') n[o.typ as Typ]++
    return n
  }, [manadsdata])
  const kort = useMemo(() => spar.map(s => sparKort(s, status, antalPlanerade[s.typ])), [spar, status, antalPlanerade])
  const svar = useMemo(() => sidSvar(kort, status), [kort, status])
  const plan = useMemo<Record<Typ, PlaneratResultat>>(() => {
    const ut = {} as Record<Typ, PlaneratResultat>
    for (const t of TYPER) ut[t] = planeratPerTyp(manadsdata?.planering ?? [], t, spar.find(s => s.typ === t)?.bestallt ?? 0, fast?.avvikelse ?? [])
    return ut
  }, [manadsdata, spar, fast])
  const behov = useMemo<BehovRad[]>(() => {
    if (!fast || !manadsdata) return []
    return behoverDig({
      status, maskinStopp: manadsdata.maskinStopp, manuella, maskiner: fast.maskiner, senasteLass, arbetsdagar: manadsdata.arbetsdagar,
      rapportdagar: manadsdata.rapportdagar, idag, manadNamn, utanTyp: manadsdata.utanTyp, planering: manadsdata.planering, plan, klar: klar.data,
    })
  }, [fast, manadsdata, status, manuella, senasteLass, idag, manadNamn, plan, klar.data])
  const klarVy = useMemo(() => (klar.data ? klarRader(klar.data, manadsdata?.maskinStopp ?? null) : null), [klar.data, manadsdata])

  const underrad = !dagar
    ? ''
    : status === 'avslutad'
      ? `Avslutad · ${dagar.totalt} arbetsdagar`
      : status === 'kommande'
        ? `${dagar.totalt} arbetsdagar`
        : `${dagar.kvar} arbetsdagar kvar · ${relativTid(fast?.senasteData ?? null)}`

  const dinMaskin = maskinId && fast ? (fast.maskiner.find(m => m.maskin_id === maskinId) ?? null) : null
  const fel = fastFel ?? manadFel
  const laddar = laddarManad || (!fast && !fastFel)
  const klart = !fel && !laddar && fast != null && manadsdata != null && dagar != null

  // ── Arken ──
  // Sidans egna ark ligger i samma PanelContext som arkens egna val (ägare 'sida'), så bara ETT är öppet. Läses direkt ur tillståndet:
  // den här komponenten står utanför sin egen Provider.
  const ark: Ark | null = panel?.agare === 'sida' ? (panel.val as Ark) : null
  const setArk = useCallback((v: Ark | null) => setPanel(v == null ? null : { agare: 'sida', val: v }), [])
  const oppnaBehov = (r: BehovRad) => {
    if (r.oppnar === 'ladda_om') { window.location.reload(); return }
    setArk(r.oppnar)
  }
  const stang = () => setArk(null)

  // Månadspilarna är blå (navigerar). Mellan pilarna står alltid månaden man tittar på; Idag är en egen liten länk (KNAPP.tertiar)
  // som bara finns när vald månad inte är innevarande — samma mönster som ledighetens kalender.
  const pil = (steg: -1 | 1) => (
    <button type="button" aria-label={steg < 0 ? 'Föregående månad' : 'Nästa månad'} onClick={() => bytManad(steg)}
      style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
      <Ikon namn={steg < 0 ? 'chevron_left' : 'chevron_right'} farg={FARG.bla} />
    </button>
  )
  const idagKnapp = (
    <button type="button" onClick={() => satt({ ar: nuAr, manad: nuManad })} style={{ ...KNAPP.tertiar, minWidth: TRAFFYTA.min, justifyContent: 'center', padding: `0 ${AVSTAND.s}px` }}>Idag</button>
  )
  // Månadsrubriken: månaden stor mellan pilarna, underraden under, Idag under när det inte är innevarande månad.
  const manadsHuvud = (
    <header style={{ padding: `${AVSTAND.l}px 0 ${AVSTAND.xs}px` }}>
      <div style={{ display: 'grid', gridTemplateColumns: `${TRAFFYTA.min}px 1fr ${TRAFFYTA.min}px`, alignItems: 'center' }}>
        {pil(-1)}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ margin: 0, ...TYP.titel, color: FARG.text }}>{manadRubrik(ar, manad)}</h1>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, minHeight: AVSTAND.l }}>{underrad}</div>
        </div>
        {pil(1)}
      </div>
      {!arNu && <div style={{ textAlign: 'center' }}>{idagKnapp}</div>}
    </header>
  )

  const bolagTyp: Typ | null = ark && ark.startsWith('bolag:') ? (ark.slice(6) as Typ) : null

  return (
    <PanelContext.Provider value={panelStyrning}>
      <SheetLageContext.Provider value={sheetLage}>
        {/* Typsnittet inline: FONT har citattecken, och React escapar dem i en <style> vid serverrendering. */}
        <div className="hk-ram" style={{ fontFamily: FONT }} data-helikopter="">
          <style>{designCss + KOLUMN_CSS + HK_CSS + css}</style>
          <aside className="hk-sida" aria-label="Månader">
            <Manadssida ar={ar} manad={manad} nuAr={nuAr} nuManad={nuManad} />
          </aside>
          <main className="hk-innehall">
            <div className="hk-sidan">
              {manadsHuvud}
              {!klart ? (
                fel ? <Fel onRetry={() => setVersion(v => v + 1)} /> : <Laddar vad={manadNamn} />
              ) : (
                <>
                  <Svarsrad rubrik={svar.rubrik} avvikelse={svar.avvikelse} />
                  <div className="hk-rutnat">
                    <SkotatSektion kort={kort} forklaring={status === 'pagaende'} />
                    <BehoverDigSektion rader={behov} onOppna={oppnaBehov} />
                    {status !== 'avslutad' && (
                      <KlarSektion rader={klarVy} fel={klar.fel} laddar={klar.laddar} sistaArbetsdag={klar.data?.sista_arbetsdag ?? null} onRetry={() => void klar.ladda()} />
                    )}
                    {dinMaskin && <DinMaskinSektion maskinNamn={maskinNamn(dinMaskin)} lage={maskinLage} fel={maskinLageFel} onRetry={() => setVersion(v => v + 1)} />}
                    <MaskinSektion roll="skordare" maskiner={maskinerManad?.nyckel === nyckel ? maskinerManad.rader : null} fel={maskinerFel} onRetry={() => { setMaskinerManad(null); setVersion(v => v + 1) }} manadNamn={manadNamn} manuella={manuella} />
                    <MaskinSektion roll="skotare" maskiner={maskinerManad?.nyckel === nyckel ? maskinerManad.rader : null} fel={maskinerFel} onRetry={() => { setMaskinerManad(null); setVersion(v => v + 1) }} manadNamn={manadNamn} manuella={manuella} />
                    <Sektion rubrik="Mer" kort={false}>
                      <RadGrupp marginBottom={0}>
                        <RadLank text="Skördat" onClick={() => setArk('skordat')} />
                        <RadLank text="Maskiner och takt" onClick={() => setArk('maskiner')} />
                        {spar.map(s => <RadLank key={`v${s.typ}`} text={`Veckor · ${TYP_NAMN[s.typ]}`} href={`/helikopter/veckor?typ=${s.typ}&ar=${ar}&manad=${manad}`} />)}
                        {spar.map(s => <RadLank key={`b${s.typ}`} text={`Per bolag · ${TYP_NAMN[s.typ]}`} onClick={() => setArk(`bolag:${s.typ}`)} />)}
                        {status === 'avslutad' && <RadLank text="Månadsfacit" smakprov="dela som A4" href={facitHref(ar, manad)} />}
                        {/* Från 1100 px står månaderna i sidokolumnen; under det nås de här. */}
                        {fonsterBredd < SIDOKOLUMN_FRAN_PX && <RadLank text="Tidigare månader" onClick={() => setArk('historik')} />}
                      </RadGrupp>
                    </Sektion>
                    {arAdmin && <VeckoNotisSektion />}
                  </div>

                  <SkordatSheet open={ark === 'skordat'} onClose={stang} spar={spar} status={status} />
                  <MaskinerSheet open={ark === 'maskiner'} onClose={stang} spar={spar} status={status} maskiner={kapacitetsMaskiner(fast.maskiner, idag)} idag={idag} stopp={manadsdata.maskinStopp} />
                  <UtanTypSheet open={ark === 'utan'} onClose={stang} rader={manadsdata.utanTyp ?? []} manadNamn={manadNamn} />
                  <EjTilldeladeSheet open={ark === 'ej'} onClose={stang} objekt={manadsdata.planering} ar={ar} manad={manad} />
                  <MotBestallningSheet open={ark === 'best'} onClose={stang} plan={plan} spar={spar} objekt={manadsdata.planering} avvikelse={fast.avvikelse} />
                  {bolagTyp && (
                    <BolagSheet
                      open onClose={stang} typ={bolagTyp}
                      rader={(bolag?.nyckel === nyckel ? bolag.rader : []).filter(b => b.typ === bolagTyp)}
                      laddar={bolag?.nyckel !== nyckel && !bolagFel} fel={bolagFel}
                      onRetry={() => { setBolag(null); setVersion(v => v + 1) }}
                      kvar={status === 'pagaende' ? dagar.kvar : 0}
                      harPrognos={status === 'pagaende' && (spar.find(s => s.typ === bolagTyp)?.harPrognos ?? false)}
                      ar={ar} manad={manad}
                    />
                  )}
                  {ark === 'historik' && (
                    <Sheet open onClose={stang} title="Tidigare månader">
                      <HistorikInnehall yta={FARG.upphojt} />
                    </Sheet>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </SheetLageContext.Provider>
    </PanelContext.Provider>
  )
}
