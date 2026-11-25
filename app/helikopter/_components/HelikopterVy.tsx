'use client'

// /helikopter — EN sida, inga flikar (omtag 2026-10-23, Martin: "så att ett barn förstår den").
//
// Uppifrån: månaden (‹ Oktober 2026 ›, arbetsdagar kvar) · svaret i EN mening i vanliga ord · fyra kort i ett rutnät:
//   SKOTAT (ett tal per spår) · GÖR DETTA (högst tre rader, resten bakom "N saker till") · NÄR BLIR MASKINERNA KLARA? (namn + datum) ·
//   MER (Skördat, Maskiner, Takt, Träffsäkerhet, Veckor, Per bolag, Månadsplan (pågående/kommande), Tidigare månader, Månadsfacit (avslutad)) · DIN MASKIN (förare) · ONSDAGSNOTIS (admin).
// Allt som står på sidan räknas i _lib/kort.ts (ren vymodell); den här filen hämtar och ritar.
// Klar-datumen räknas i appen (klar.ts raknaAlla) på RPC:ns underlag + G15-förslaget för trakter utan prognos (medUppskattadPrognos) + prognosen som följer trakten (medFoljandePrognos),
// så sidan och flyttförslaget räknar på samma tal.
//
// Bredd: korten ligger i ett rutnät med CONTAINER QUERIES (sidans egen bredd): 1 kolumn, 2 från 640 px, 3 från 960 px.
// MENY (2026-11-19, Prognos 2026-11-20): fyra sidor, var och en svarar på en fråga — Läget nu (ligger vi bra till?), Prognos (hinner vi?), Planera (vilka trakter, i vilken ordning?), Månader (hur gick det?).
// Sidomeny från 1000 px, fyra flikar i botten under det (HelikopterMeny). Sidan ligger i adressen (?sida=). Ark underifrån under 600 px, panel från höger annars.
//
// Data i lager, varje med eget fel (ett fel är ett fel, aldrig tomt):
//   fast — maskiner, senaste importtid, bolagshistorik (en gång) · manadsdata — spår, arbetsdagar, planering, stopp (vid månadsbyte) ·
//   klar — helikopter_ny_klar (vid månadsbyte, inte för avslutad månad) · utfall — prognos_utfall (en gång) · maskiner — först när Maskiner öppnas ·
//   bolag — först när Per bolag öppnas.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SheetLageContext } from '@/components/Sheet'
import { Sheet } from '@/components/Sheet'
import Sektion from '@/components/design/Sektion'
import Ikon from '@/components/design/Ikon'
import { RadGrupp, RadLank } from '@/components/ui/RadGrupp'
import { AVSTAND, FARG, FONT, KNAPP, KOLUMN, KOLUMN_CSS, LAYOUT, ROT_MIN_HOJD, TRAFFYTA, TYP, designCss } from '@/lib/design/tokens'
import { ymdLokal } from '@/lib/datumLokal'
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext'
import {
  hamtaBolag, hamtaEgenSkotningTrakter, hamtaEgetSkordat, hamtaMaskinObjekt, hamtaSenasteArbete, type SenasteArbete, hamtaKorNu, type KorNu, type MaskinObjektRad, sattEgenSkotning, hamtaFast, hamtaManadsdata, hamtaMaskinLage, hamtaPrognosUtfall, hamtaSkogKort, tilldelaMaskin,
  type BolagRad, type FastData, type Manadsdata, type MaskinLage, type Typ,
} from '../_lib/queries'
import { TYPER, TYP_NAMN, globalaArbetsdagar, manadStatus, maskinNamn, planeringStoppText, raknaSpar, sparTakter, valjBas, type SparLage } from '../_lib/berakningar'
import { MANAD_NAMN, fmt, manadRubrik, relativTid } from '../_lib/format'
import { medPrognoser } from '../_lib/klar'
import Kalender from './Kalender'
import type { SkogKort } from '@/lib/skogsdata/las'
import { byggTidslinje } from '../_lib/lage'
import { EGEN_SKOTNING, byggTavla, flyttVal, slutordning, utanforBestallning, type TavlaIndata, type TavlaUtfall } from '../_lib/tavla'
import type { UtfallRad } from '@/lib/g15Forslag'
import { facitHref } from '../_lib/manadsfacit'
import { planHref } from '../_lib/manadsplan'
import { useKlar } from '../_lib/useKlar'
import { useFonsterBredd } from '../_lib/useFonsterBredd'
import { Fel, Laddar } from './Tillstand'
import { HK_CSS } from './Lista'
import { PanelContext, type PanelPost } from './PanelVal'
import Lage from './Lage'
import { FlyttaSheet, GorKort, PlaneraFlik, type PlaneraRoll, type OrdningsStyrning, type TraktVal } from './Tavla'
import { flyttaObjekt, sattOrdning } from '@/lib/objekt/data'
import { stegaManad } from '@/lib/objekt/manad'
import { DinMaskinSektion, VeckoNotisSektion } from './MaskinSektion'
import HelikopterMeny, { MENY_CSS } from './HelikopterMeny'
import { helikopterHref, tolkaSida, type Sida } from '../_lib/meny'
import HistorikInnehall from './HistorikInnehall'
import UtanTypSheet from './UtanTypSheet'
import BolagSheet from './BolagSheet'
import TraffsakerhetSheet from './TraffsakerhetSheet'

/** Under detta är ett ark underifrån; från det en panel från höger. */
export const ARK_MAX_PX = 600
/** Rutnätets brytpunkter, på SIDANS bredd (container queries), inte fönstrets. */
export const TVA_KOLUMNER_PX = 640
export const TRE_KOLUMNER_PX = 960

const css = `
.hk-ram { display: flex; min-height: ${ROT_MIN_HOJD}; background: ${FARG.bg}; color: ${FARG.text}; -webkit-font-smoothing: antialiased; }
.hk-innehall { flex: 1; min-width: 0; }
.hk-sidan { container-type: inline-size; max-width: ${KOLUMN.bred + 2 * AVSTAND.sidmarginal}px; margin: 0 auto; box-sizing: border-box; padding: 0 ${AVSTAND.sidmarginal}px ${AVSTAND.xxl * 2}px; }
.hk-rutnat { display: grid; grid-template-columns: minmax(0, 1fr); column-gap: ${AVSTAND.xl}px; align-items: start; }
@container (min-width: ${TVA_KOLUMNER_PX}px) { .hk-rutnat { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (min-width: ${TRE_KOLUMNER_PX}px) { .hk-rutnat { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
`

type Ark = 'traffsakerhet' | 'utan' | 'veckor' | 'bolagval' | 'notis' | `bolag:${Typ}` | `flytta:${string}`

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
  const sida = tolkaSida(sp.get('sida'))
  const satt = useCallback((n: { ar: number; manad: number }) => {
    router.replace(helikopterHref(n.ar, n.manad, sida), { scroll: false })
  }, [router, sida])
  const valjSida = (s: Sida) => router.replace(helikopterHref(ar, manad, s), { scroll: false })
  // Planera öppnas ur Läget nu med spåret och rollen man tryckte på; öppnas sidan direkt är det första spåret och skördaren.
  const [planera, setPlanera] = useState<{ typ: Typ | null; roll: PlaneraRoll }>({ typ: null, roll: 'skordare' })
  const tillPlanera = (typ: Typ, roll: PlaneraRoll) => { setPlanera({ typ, roll }); valjSida('planera') }
  const bytManad = (steg: number) => {
    const d = new Date(ar, manad - 1 + steg, 1)
    satt({ ar: d.getFullYear(), manad: d.getMonth() + 1 })
  }

  const fonsterBredd = useFonsterBredd()
  const sheetLage = fonsterBredd < ARK_MAX_PX ? 'ark' : 'panel'

  // EN öppen sheet/panel åt gången (PanelContext delas med arken som själva läser usePanelVal).
  const [panel, setPanel] = useState<PanelPost>(null)
  // Förhandsvisad körordning (alla trakter, objekt_id, första först): sparas först när du trycker Spara ordning.
  const [nyOrdning, setNyOrdning] = useState<string[] | null>(null)
  // Arket som öppnade "Vem ska ta den?": dit går man tillbaka efteråt.
  const [fran, setFran] = useState<Ark | null>(null)
  useEffect(() => { setPanel(null); setNyOrdning(null) }, [ar, manad])
  // En förhandsvisad ordning som inte sparats får aldrig följa med till en annan sida och se ut som verklig.
  useEffect(() => { setNyOrdning(null) }, [sida])
  const panelStyrning = useMemo(() => ({ panel, satt: setPanel }), [panel])

  const { medarbetare } = useCurrentMedarbetare()
  const arAdmin = medarbetare?.roll === 'admin'
  const [version, setVersion] = useState(0)
  const [fast, setFast] = useState<FastData | null>(null)
  const [fastFel, setFastFel] = useState<string | null>(null)
  const [manadsdata, setManadsdata] = useState<Manadsdata | null>(null)
  const [manadFel, setManadFel] = useState<string | null>(null)
  const [laddarManad, setLaddarManad] = useState(true)
  const [bolag, setBolag] = useState<{ nyckel: string; rader: BolagRad[] } | null>(null)
  const [bolagFel, setBolagFel] = useState<string | null>(null)
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
  // Utfallet bakom G15-förslaget — en gång. null = inte läst eller kunde inte läsas: trakter utan prognos får då "?" som förut.
  const [utfall, setUtfall] = useState<UtfallRad[] | null>(null)
  useEffect(() => {
    let avbruten = false
    hamtaPrognosUtfall().then(r => {
      if (avbruten) return
      if (r.error != null) console.error('[helikopter] prognos_utfall', r.error)
      else setUtfall(r.data)
    })
    return () => { avbruten = true }
  }, [version])

  // Laserdatan och det uppmätta uttaget per trakt (objekt_skogsdata) — en gång. null = inte läst eller kunde inte läsas: prognosen räknas då utan.
  const [skog, setSkog] = useState<Map<string, SkogKort> | null>(null)
  useEffect(() => {
    let avbruten = false
    hamtaSkogKort().then(r => {
      if (avbruten) return
      if (r.error != null) console.error('[helikopter] objekt_skogsdata', r.error)
      else setSkog(r.data)
    })
    return () => { avbruten = true }
  }, [version])

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
  // Underlaget med uppskattade prognoser, och planerna (klar-datum per maskin) räknade ur det — SAMMA räkning som flyttförslaget.
  // G15-förslag för trakter utan prognos, sedan den FÖLJANDE prognosen för trakter maskinen redan kört på (lib/prognosFoljer) — i den ordningen.
  const klarData = useMemo(() => (klar.data ? medPrognoser(klar.data, utfall, skog) : null), [klar.data, utfall, skog])

  // Trakter där markägaren skotar själv: räknas inte mot beställningen och är aldrig "ingen skotare". null = inte läst än.
  const [egna, setEgna] = useState<Set<string> | null>(null)
  const traktIds = useMemo(() => (klar.data ? Array.from(new Set(klar.data.trakter.map(t => t.objekt_id))).sort().join(',') : null), [klar.data])
  useEffect(() => {
    setEgna(null)
    if (traktIds == null) return
    let avbruten = false
    hamtaEgenSkotningTrakter(traktIds === '' ? [] : traktIds.split(',')).then(r => {
      if (avbruten) return
      if (r.error != null) { console.error('[helikopter] egen skotning', r.error); setEgna(new Set()) } else setEgna(r.data)
    })
    return () => { avbruten = true }
  }, [traktIds, version])

  // Skördat på egen skotning, per skördare: spårens egna tal räknar inte med de trakterna, men skördaren har gjort jobbet.
  // null = inte läst än (eller kunde inte läsas: då står skördaren utan den volymen, och det loggas).
  const [egetRader, setEgetRader] = useState<{ objekt_id: string; maskin_id: string; volym: number }[] | null>(null)
  const egnaDimIds = useMemo(() => (manadsdata ? (manadsdata.egenSkotning ?? []).map(e => e.objekt_id).sort().join('|') : null), [manadsdata])
  useEffect(() => {
    setEgetRader(null)
    if (egnaDimIds == null) return
    let avbruten = false
    hamtaEgetSkordat(ar, manad, egnaDimIds === '' ? [] : egnaDimIds.split('|')).then(r => {
      if (avbruten) return
      if (r.error != null) { console.error('[helikopter] eget skördat', r.error); setEgetRader([]) } else setEgetRader(r.data)
    })
    return () => { avbruten = true }
  }, [egnaDimIds, ar, manad])

  // Allt maskinerna gjort i månaden per objekt: det som inte räknas mot beställningen står under maskinen. null = inte läst (ingen rad).
  const [maskinObjekt, setMaskinObjekt] = useState<MaskinObjektRad[] | null>(null)
  useEffect(() => {
    setMaskinObjekt(null)
    let avbruten = false
    hamtaMaskinObjekt(ar, manad).then(r => {
      if (avbruten) return
      if (r.error != null) console.error('[helikopter] utanför beställningen', r.error); else setMaskinObjekt(r.data)
    })
    return () => { avbruten = true }
  }, [ar, manad, version])

  // Var maskinerna arbetat de senaste 3 dagarna: bara i pågående månad, och först när köerna finns. Ett fel säger ingenting — prognosen som förut.
  const [senaste, setSenaste] = useState<SenasteArbete[] | null>(null)
  const koIds = klarData && status === 'pagaende' ? klarData.trakter.map(t => t.objekt_id).join(',') : ''
  useEffect(() => {
    setSenaste(null)
    if (!koIds) return
    let avbruten = false
    const fran = new Date(); fran.setDate(fran.getDate() - 3)
    hamtaSenasteArbete(ymdLokal(fran), koIds.split(',')).then(r => {
      if (avbruten) return
      if (r.error != null) console.error('[helikopter] senaste arbete', r.error); else setSenaste(r.data)
    })
    return () => { avbruten = true }
  }, [koIds, version])

  // Vad varje maskin senast gjorde, rakt ur data (visas på Läget nu). Ett fel säger ingenting — raden uteblir.
  const [korNu, setKorNu] = useState<KorNu[] | null>(null)
  useEffect(() => {
    setKorNu(null)
    if (status !== 'pagaende') return
    let avbruten = false
    const fran = new Date(); fran.setDate(fran.getDate() - 7)
    hamtaKorNu(ymdLokal(fran)).then(r => {
      if (avbruten) return
      if (r.error != null) console.error('[helikopter] kör nu', r.error); else setKorNu(r.data)
    })
    return () => { avbruten = true }
  }, [status, version])

  // ── Räkningen (allt som står på sidan) ──
  const dagar = useMemo(() => (manadsdata ? globalaArbetsdagar(manadsdata.arbetsdagar) : null), [manadsdata])
  const spar: SparLage[] = useMemo(() => {
    if (!manadsdata || !dagar) return []
    return TYPER.map(t => {
      const rad = valjBas(manadsdata.spar, t)
      return rad ? raknaSpar(rad, dagar, manadsdata.takter) : null
    }).filter((x): x is SparLage => x != null)
  }, [manadsdata, dagar])
  // Maskinernas volym i månaden per spår (samma rader som spårets summa). null = kunde inte läsas.
  const maskinUtfall = useMemo<TavlaUtfall[] | null>(() => {
    if (!manadsdata || manadsdata.takter == null) return null
    return TYPER.flatMap(t => {
      const rad = valjBas(manadsdata.spar, t)
      return rad ? sparTakter(rad, manadsdata.takter).map(m => ({ typ: t, maskin_id: m.maskin_id, roll: m.roll, volym: m.volym_manad })) : []
    })
  }, [manadsdata])
  const tavlaIn = useMemo<TavlaIndata | null>(() => {
    if (!manadsdata || spar.length === 0) return null
    // Kön väntar på egen skotning-svaret, så en trakt aldrig hinner blinka som "ingen maskin".
    const klarKlar = status !== 'avslutad' && klarData != null && egna != null
    const stopp: Record<string, string | null> = {}
    for (const m of manadsdata.maskinStopp ?? []) stopp[m.maskin_id] = status === 'avslutad' ? null : (planeringStoppText(m)?.split(' · ')[0] ?? null) // bara "Står 26–30 okt" — orsaken står i ledighetsvyn
    // Egen skotning räknas mot beställningen bara för bolag som har en (som spårets egna tal).
    const dim = new Map((manadsdata.egenSkotning ?? []).map(e => [e.objekt_id, e]))
    const egetSkordat = (egetRader ?? []).flatMap(r => {
      const e = dim.get(r.objekt_id)
      const sp = spar.find(x => x.typ === e?.typ)
      if (!e || !sp) return []
      if (sp.bestallt > 0 && !sp.bolag.some(b => b.toLowerCase() === (e.bolag ?? '').toLowerCase())) return []
      return [{ typ: sp.typ, maskin_id: r.maskin_id, volym: r.volym }]
    })
    return { status, spar, utfall: maskinUtfall, klar: klarKlar ? klarData : null, egna: egna ?? new Set(), egetSkordat, stopp, senaste: senaste ?? undefined, utanfor: maskinObjekt ? utanforBestallning(maskinObjekt, spar) : undefined, ordning: nyOrdning ?? undefined }
  }, [manadsdata, spar, maskinUtfall, status, klarData, egna, egetRader, maskinObjekt, senaste, nyOrdning])
  const tavla = useMemo(() => (tavlaIn ? byggTavla(tavlaIn) : null), [tavlaIn])
  // Tidslinjen på Läget nu: vem gör vad dag för dag. Bara i en pågående månad med köunderlag.
  const tidslinje = useMemo(() => (tavla && tavlaIn ? byggTidslinje(tavlaIn, tavla) : null), [tavla, tavlaIn])
  const utanTypSumma = Math.round((manadsdata?.utanTyp ?? []).reduce((a, r) => a + r.volym, 0))

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
  const kolar = (status !== 'avslutad' && !klar.fel && (klar.laddar || (klar.data != null && egna == null))) || (manadsdata != null && egetRader == null)
  const klart = !fel && !laddar && !kolar && fast != null && manadsdata != null && dagar != null && tavla != null

  // ── Arken ──
  // Sidans egna ark ligger i samma PanelContext som arkens egna val (ägare 'sida'), så bara ETT är öppet.
  const ark: Ark | null = panel?.agare === 'sida' ? (panel.val as Ark) : null
  const setArk = useCallback((v: Ark | null) => setPanel(v == null ? null : { agare: 'sida', val: v }), [])
  const stang = () => setArk(null)
  // Flytta en trakt: "flytta:<roll>:<objekt_id>". Valen räknas om på samma underlag som tavlan.
  const flyttaVal: TraktVal | null = ark && ark.startsWith('flytta:') ? { roll: ark.split(':')[1] as TraktVal['roll'], objekt_id: ark.split(':').slice(2).join(':') } : null
  const flyttaVy = useMemo(() => (flyttaVal && tavlaIn ? flyttVal(tavlaIn, flyttaVal.objekt_id, flyttaVal.roll) : null), [flyttaVal?.objekt_id, flyttaVal?.roll, tavlaIn]) // eslint-disable-line react-hooks/exhaustive-deps
  // Flytten skrivs till objektet (samma kolumn som planeringsverktyget) och underlaget läses om; ett fel visas i arket.
  const flytta = async (maskinId: string): Promise<string | null> => {
    if (!flyttaVal) return 'Ingen trakt vald'
    const varEgen = flyttaVal.roll === 'skotare' && (egna?.has(flyttaVal.objekt_id) ?? false)
    if (maskinId === EGEN_SKOTNING) {
      const r = await sattEgenSkotning(flyttaVal.objekt_id, true)
      if (r.error) return r.error
    } else {
      if (varEgen) {
        const e = await sattEgenSkotning(flyttaVal.objekt_id, false)
        if (e.error) return e.error
      }
      const r = await tilldelaMaskin(flyttaVal.objekt_id, flyttaVal.roll, maskinId)
      if (r.error) return r.error
    }
    // Egen skotning ändrar också månadens tal (spåren räknar inte med de trakterna): läs om allt.
    if (maskinId === EGEN_SKOTNING || varEgen) setVersion(v => v + 1)
    await klar.ladda()
    return null
  }
  const kanFlytta = arAdmin && status !== 'avslutad'
  const grundOrdning = useMemo(() => (klarData ? slutordning(klarData.trakter, undefined) : []), [klarData])
  const ordningSt: OrdningsStyrning | undefined = kanFlytta && klarData
    ? {
        onOrdning: ids => {
          // Gruppens nya inbördes ordning tar över gruppens platser i den hela ordningen (tidigare ändringar behålls).
          const full = slutordning(klarData.trakter, nyOrdning ?? undefined)
          const grupp = new Set(ids)
          const platser = full.flatMap((id, i) => (grupp.has(id) ? [i] : []))
          const ny = [...full]
          platser.forEach((pos, k) => { ny[pos] = ids[k] })
          setNyOrdning(ny)
        },
        andrad: nyOrdning != null && nyOrdning.join('|') !== grundOrdning.join('|'),
        onAngra: () => setNyOrdning(null),
        onSpara: async () => {
          try { await sattOrdning(slutordning(klarData.trakter, nyOrdning ?? undefined)) }
          catch (e) { return e instanceof Error ? e.message : 'Ordningen sparades inte. Försök igen.' }
          await klar.ladda()
          setNyOrdning(null)
          return null
        },
      }
    : undefined
  const stangArk = () => { setNyOrdning(null); setFran(null); setArk(null) }
  // Byt maskin på en trakt ur ett ark: "Vem ska ta den?" öppnas och du kommer tillbaka till arket.
  const bytMaskin = kanFlytta ? (v: TraktVal) => { setFran(ark); setArk(`flytta:${v.roll}:${v.objekt_id}`) } : undefined
  // Flytten gäller trakten som helhet och skrivs till objektets planerade månad, samma fält som Objekt-vyn — så ändringen syns i båda.
  const nastaManad = stegaManad({ ar, manad }, 1)
  const flyttaTillNasta = async (ids: string[]): Promise<string | null> => {
    let flyttade = 0
    try {
      for (const id of ids) { await flyttaObjekt(id, nastaManad); flyttade++ }
    } catch (e) {
      // Arket ska stå kvar med felet: läs bara om trakterna om något hann flyttas (hela sidan laddas inte om).
      if (flyttade > 0) await klar.ladda()
      const fel = e instanceof Error ? e.message : 'Kunde inte flytta. Försök igen.'
      return flyttade > 0 ? `${flyttade} av ${ids.length} flyttades. ${fel}` : fel
    }
    setVersion(v => v + 1)
    await klar.ladda()
    return null
  }

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
          <style>{designCss + KOLUMN_CSS + HK_CSS + css + MENY_CSS}</style>
          <HelikopterMeny aktiv={sida} onVal={valjSida} />
          <main className="hk-innehall">
            <div className="hk-sidan">
              {sida === 'manader' ? (
                // Månader: hur gick det? Ingen månadsrubrik — sidan gäller alla månader, och varje rad öppnar månadens facit.
                <div data-sida="manader">
                  <h1 style={{ margin: 0, padding: `${AVSTAND.l}px 0 ${AVSTAND.s}px`, ...TYP.titel, color: FARG.text }}>Månader</h1>
                  <HistorikInnehall />
                </div>
              ) : (
              <>
              {manadsHuvud}
              {!klart ? (
                fel ? <Fel onRetry={() => setVersion(v => v + 1)} /> : <Laddar vad={manadNamn} />
              ) : (
                <>
                  {status !== 'avslutad' && klar.fel && (
                    <RadGrupp><RadLank orange text="Kunde inte läsa maskinernas trakter" smakprov="försök igen" onClick={() => void klar.ladda()} sista /></RadGrupp>
                  )}
                  {sida === 'kalender' ? (
                    <div data-sida="kalender">
                      <Kalender tidslinje={tidslinje} korNu={korNu} onPlanera={kanFlytta ? () => valjSida('planera') : undefined} manadNamn={MANAD_NAMN[manad - 1]} ar={ar} />
                    </div>
                  ) : sida === 'planera' ? (
                    <div data-sida="planera">
                      <PlaneraFlik tavla={tavla} typ={planera.typ} onTyp={typ => setPlanera({ typ, roll: 'skordare' })} start={planera.roll} manadNamn={MANAD_NAMN[manad - 1].toLowerCase()} nastaNamn={MANAD_NAMN[nastaManad.manad - 1].toLowerCase()} kanFlytta={kanFlytta} onFlytta={flyttaTillNasta} ordning={ordningSt} onTrakt={bytMaskin} />
                    </div>
                  ) : (
                  <div className="hk-rutnat" data-sida="laget">
                    {tavla && tavla.gor.length > 0 && <div style={{ gridColumn: '1 / -1' }}><GorKort gor={tavla.gor} onTrakt={bytMaskin} /></div>}
                    <Lage tavla={tavla} status={status} onSpar={tillPlanera} tidslinje={tidslinje} korNu={korNu} />
                    {dinMaskin && <DinMaskinSektion maskinNamn={maskinNamn(dinMaskin)} lage={maskinLage} fel={maskinLageFel} onRetry={() => setVersion(v => v + 1)} />}
                    <Sektion rubrik="Mer" kort={false}>
                      <RadGrupp marginBottom={0}>
                        {manadsdata.utanTyp == null && <RadLank orange text="Objekt utan typ kunde inte läsas" smakprov="ladda om" onClick={() => setVersion(v => v + 1)} />}
                        {utanTypSumma > 0 && <RadLank orange text={`${fmt(utanTypSumma)} m³fub saknar typ`} smakprov="räknas inte" onClick={() => setArk('utan')} />}
                        <RadLank text="Träffsäkerhet" onClick={() => setArk('traffsakerhet')} />
                        <RadLank text="Veckor" onClick={() => setArk('veckor')} />
                        <RadLank text="Per bolag" onClick={() => setArk('bolagval')} />
                        {status !== 'avslutad' && <RadLank text="Månadsplan" href={planHref(ar, manad)} />}
                        {status === 'avslutad' && <RadLank text="Månadsfacit" href={facitHref(ar, manad)} />}
                        {arAdmin && <RadLank text="Onsdagsnotis" onClick={() => setArk('notis')} />}
                      </RadGrupp>
                    </Sektion>
                  </div>
                  )}

                  <TraffsakerhetSheet open={ark === 'traffsakerhet'} onClose={stang} />
                  {/* Veckor och Per bolag: ett spår i taget — valet i ett litet ark så Mer inte blir en lång lista. */}
                  {(ark === 'veckor' || ark === 'bolagval') && (
                    <Sheet open onClose={stang} title={ark === 'veckor' ? 'Veckor' : 'Per bolag'}>
                      <RadGrupp bakgrund={FARG.upphojt}>
                        {spar.map(s => ark === 'veckor'
                          ? <RadLank key={s.typ} text={TYP_NAMN[s.typ]} href={`/helikopter/veckor?typ=${s.typ}&ar=${ar}&manad=${manad}`} />
                          : <RadLank key={s.typ} text={TYP_NAMN[s.typ]} onClick={() => setArk(`bolag:${s.typ}`)} />)}
                      </RadGrupp>
                    </Sheet>
                  )}
                  {flyttaVal && flyttaVy && <FlyttaSheet key={ark} open onClose={() => { const tillbaka = fran; setFran(null); setArk(tillbaka) }} namn={flyttaVy.namn} val={flyttaVy.val} onFlytta={flytta} />}
                  {ark === 'notis' && <Sheet open onClose={stang} title="Onsdagsnotis"><VeckoNotisSektion /></Sheet>}
                  <UtanTypSheet open={ark === 'utan'} onClose={stang} rader={manadsdata.utanTyp ?? []} manadNamn={manadNamn} />
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
                </>
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
