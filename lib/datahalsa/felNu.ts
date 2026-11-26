// FEL NU — Datahälsas enda sanning (Martin 2026-11-25: "bara det som är fel just nu, så enkelt att ett barn förstår").
//
// EN lista med problem, byggd ur alla källor. Sidan, startsidans prick och "Att göra" läser samma lista — aldrig två
// ställen som säger olika. Varje problem säger VAD som är fel och VAD man gör.
//
// Vad som räknas som fel nu, per källa:
//   import_live            status ≠ OK, eller kontrollen äldre än 45 min ("kontrolleras inte"), eller raden saknas.
//   import_fel + filloggen ett fel tills det LÄKT (lib/datahalsa/lakt). Avvisade dubbletter är aldrig fel.
//   kontrollerna           en kontroll som larmar eller inte gick att köra, eller att de inte körts på KONTROLLER_GAMLA_TIM timmar.
//   invarianterna          bara när något finns (mer än 24 h motortid, dubbletter, tomgång som inte går ihop).
//   koordinater            bara när något finns.
//   obekräftade lass       bara när något finns.
//   maskinernas leverans   ALDRIG ett fel (tystnad kan vara semester) — bara om den inte går att läsa.
//   LÄSFEL                 alltid ett problem ("Kunde inte kontrollera X"), aldrig "Allt fungerar".
//
// Rena funktioner: tiden och alla data kommer in som argument.
import { IMPORT_LIVE, importLiveVy, kontrollRader, kontrollerSenastKord, narText, type StatusRad } from './status'
import { bedomFel, importFelKlass, perSerie, type FelBedomning, type FelSerie, type FilIn, type ImportFelIn } from './lakt'

/** Gap check går 06:30 och 18:30. Tre missade körningar = kontrollerna står still. */
export const KONTROLLER_GAMLA_TIM = 36

/** Korten på sidan, i den ordning de står under "Visa allt". */
export const SEKTIONER = ['filer', 'leverans', 'importfel', 'invarianter', 'kontroller', 'koordinat', 'skotarlass'] as const
export type SektionId = (typeof SEKTIONER)[number]

export type Problem = {
  id: string
  /** Kortet som visar detaljerna. */
  sektion: SektionId
  /** Vad som är fel, i ord. */
  text: string
  /** Vad man gör. null = inget att göra just nu. */
  gor: string | null
  /** Sant = det gick inte att läsa: raden får "Försök igen", och problemet är inte ett fel i datan. */
  lasfel: boolean
}

/** En källa: antingen data eller ett läsfel. Aldrig tyst tomt. */
export type Last<T> = { fel: string | null; data: T | null }

export type FelNuIn = {
  nu: number
  status: Last<StatusRad[]>
  /** Filloggen (meta_importerade_filer) de senaste FEL_NU_DYGN dygnen, alla statusar. */
  filer: Last<FilIn[]>
  /** import_fel samma tid. */
  importFel: Last<ImportFelIn[]>
  invarianter: Last<{ over24h: number; dubbletter: number; tomgang: number }>
  koordinat: Last<{ koordlosa: number; dupTrakt: number }>
  /** De gamla självbekräftade lassen som ingen granskat. */
  lass: Last<{ antal: number; m3: number }>
  /** Bara läsbarheten räknas: tystnad är aldrig ett fel. */
  leverans: { fel: string | null }
  maskinNamn: (maskinId: string) => string
}

export type FelNu = {
  problem: Problem[]
  /** Importfelen bedömda — null när underlaget inte gick att läsa. */
  importfel: (FelBedomning & { nuSerier: FelSerie[]; laktaSerier: FelSerie[]; gamlaSerier: FelSerie[]; ofarliga: number }) | null
}

const pl = (n: number, en: string, flera: string) => `${n} ${n === 1 ? en : flera}`

const VAD_GOR_KONTROLL: Record<string, string> = {
  fakt_tid_mot_mom: 'Kör om dagens MOM-fil på importdatorn.',
  stammar_utan_stockar: 'Kör om objektets senaste HPR-fil på importdatorn.',
  fakt_sortiment_mot_stock: 'Sortimentet för objektet behöver byggas om.',
  inkommande_ko: 'Filer ligger kvar i Inkommande. Kolla att importen går på importdatorn.',
  parkerade_filer: 'Flytta filerna till Inkommande om de ska in, annars ta bort dem.',
  deploy_drift: 'Kör deploy_import.ps1 på importdatorn.',
}

/** "Gallring Santhe 2026 · H8E -26" — objektet och maskinen i klartext, aldrig ett maskin-id när namnet finns. */
export function serieNamn(s: FelSerie, maskinNamn: (id: string) => string): string {
  const maskin = s.maskinId ? maskinNamn(s.maskinId) : null
  if (s.objekt && maskin) return `${s.objekt} · ${maskin}`
  return s.objekt ?? maskin ?? 'Okänd fil'
}

/** "3 HPR-filer gick inte in helt" */
export function serieVad(s: FelSerie): string {
  if (s.antalFiler === 0) return `Ett nätfel när ${s.tabeller.join(', ') || 'en tabell'} skrevs`
  const typ = s.filtyp ? `${s.filtyp}-` : ''
  return `${s.antalFiler === 1 ? `1 ${typ}fil` : `${s.antalFiler} ${typ}filer`} gick inte in helt`
}

/** Hur ett läkt fel står i historiken. HPR är kumulativ: nästa fil skriver in allt. */
export function laktText(s: FelSerie): string {
  return s.filtyp === 'HPR' ? 'Läkt – nästa fil skrev in allt' : 'Läkt – en senare fil gick in utan fel'
}

export function felNu(d: FelNuIn): FelNu {
  const problem: Problem[] = []
  const lasfel = (id: string, sektion: SektionId, vad: string) =>
    problem.push({ id: `las:${id}`, sektion, text: `Kunde inte kontrollera ${vad}`, gor: null, lasfel: true })

  // ── Importen just nu (import_live) ──
  if (d.status.fel || !d.status.data) {
    lasfel('status', 'filer', 'importen och kontrollerna på importdatorn')
  } else {
    const live = d.status.data.find((r) => r.id === IMPORT_LIVE) ?? null
    const vy = importLiveVy(live, d.nu)
    if (vy.lage === 'larm') {
      // Databasen skriver en rad per problem och sist när larmet startade. Den sista är ingen egen sak att göra.
      const rader = vy.rader.filter((r) => !/^Larmet startade\b/i.test(r))
      const startade = vy.rader.find((r) => /^Larmet startade\b/i.test(r)) ?? null
      for (const [i, r] of (rader.length > 0 ? rader : ['Importen felar']).entries()) {
        problem.push({
          id: `live:${i}`, sektion: 'filer', text: r,
          gor: /kolla|väntar/i.test(r) ? null : `Kolla importdatorn om det inte går över med nästa fil.${startade && i === 0 ? ` ${startade}.` : ''}`,
          lasfel: false,
        })
      }
    } else if (vy.lage !== 'ok') {
      problem.push({
        id: 'live', sektion: 'filer',
        text: vy.lage === 'gammal' ? `Importen kontrolleras inte — ${(vy.kontrollerad ?? 'ingen kontroll').replace(/^S/, 's')}` : vy.rubrik,
        gor: vy.rader[0] ?? null, lasfel: false,
      })
    }

    // ── Kontrollerna på importdatorn ──
    const kontroller = kontrollRader(d.status.data)
    const korda = kontrollerSenastKord(d.status.data)
    if (kontroller.length === 0 || !korda || d.nu - Date.parse(korda) > KONTROLLER_GAMLA_TIM * 3_600_000) {
      problem.push({
        id: 'kontroller:gamla', sektion: 'kontroller',
        text: korda ? `Kontrollerna på importdatorn har inte körts sedan ${narText(korda, d.nu)}` : 'Kontrollerna på importdatorn har aldrig körts',
        gor: 'Kolla att importdatorn är igång. Kontrollerna körs 06:30 och 18:30.', lasfel: false,
      })
    }
    for (const k of kontroller) {
      if (k.lage === 'larm') {
        const fler = k.rader.length > 1 ? ` (och ${k.rader.length - 1} till)` : ''
        problem.push({
          id: `kontroll:${k.id}`, sektion: 'kontroller',
          text: `${k.namn}: ${k.rader[0] ?? 'larmar'}${fler}`,
          gor: VAD_GOR_KONTROLL[k.id] ?? null, lasfel: false,
        })
      } else if (k.lage === 'okand') {
        problem.push({
          id: `kontroll:${k.id}`, sektion: 'kontroller', text: `${k.namn}: kunde inte kontrolleras`,
          gor: 'Körs igen vid nästa kontroll på importdatorn.', lasfel: false,
        })
      }
    }
  }

  // ── Tappades något vid import? (import_fel + filloggen, läkt-regeln) ──
  let importfel: FelNu['importfel'] = null
  if (d.importFel.fel || !d.importFel.data || d.filer.fel || !d.filer.data) {
    lasfel('importfel', 'importfel', 'om något tappades vid import')
  } else {
    const b = bedomFel(d.importFel.data, d.filer.data, d.nu)
    importfel = {
      ...b, nuSerier: perSerie(b.nu), laktaSerier: perSerie(b.lakta), gamlaSerier: perSerie(b.gamla),
      ofarliga: d.importFel.data.filter((r) => importFelKlass(r) === 'ofarligt').length,
    }
    for (const s of importfel.nuSerier) {
      const utanFil = s.antalFiler === 0
      problem.push({
        id: `importfel:${s.nyckel}`, sektion: 'importfel',
        text: utanFil ? `${serieVad(s)} (${narText(s.sistaFel, d.nu)})` : `${serieNamn(s, d.maskinNamn)}: ${serieVad(s)}`,
        gor: utanFil ? 'Brukar läka med nästa fil. Räknas i ett dygn.' : 'Läks när nästa fil från objektet går in. Kommer ingen: kör om filen på importdatorn.',
        lasfel: false,
      })
    }
  }

  // ── Är datan galen? ──
  if (d.invarianter.fel || !d.invarianter.data) {
    lasfel('invarianter', 'invarianter', 'maskintiden')
  } else {
    const i = d.invarianter.data
    if (i.over24h > 0) problem.push({ id: 'inv:24h', sektion: 'invarianter', text: `${pl(i.over24h, 'dag', 'dagar')} med mer än 24 timmar motortid`, gor: 'Dagen är troligen inläst dubbelt. Se dagarna nedan.', lasfel: false })
    if (i.dubbletter > 0) problem.push({ id: 'inv:dubbletter', sektion: 'invarianter', text: `${pl(i.dubbletter, 'dag', 'dagar')} där två förare har exakt samma tid`, gor: 'Samma rad står på två förare. Se dagarna nedan.', lasfel: false })
    if (i.tomgang > 0) problem.push({ id: 'inv:tomgang', sektion: 'invarianter', text: `${pl(i.tomgang, 'rad', 'rader')} där tomgången inte går ihop med motortiden`, gor: 'Raderna behöver räknas om på importdatorn.', lasfel: false })
  }

  // ── Objekt utan koordinat ──
  if (d.koordinat.fel || !d.koordinat.data) {
    lasfel('koordinat', 'koordinat', 'objektens koordinater')
  } else {
    const k = d.koordinat.data
    if (k.koordlosa > 0) problem.push({ id: 'koord:losa', sektion: 'koordinat', text: `${pl(k.koordlosa, 'arbetsdag', 'arbetsdagar')} på objekt utan koordinat — km blir 0 i lönen`, gor: 'Lägg in koordinat på objektet. Se dagarna nedan.', lasfel: false })
    if (k.dupTrakt > 0) problem.push({ id: 'koord:dup', sektion: 'koordinat', text: `${pl(k.dupTrakt, 'trakt', 'trakter')} ligger på flera VO-nummer`, gor: 'Koordinaten kan tappas när numret byts. Se trakterna nedan.', lasfel: false })
  }

  // ── Obekräftade lass ──
  if (d.lass.fel || !d.lass.data) {
    lasfel('lass', 'skotarlass', 'skotarens lass')
  } else if (d.lass.data.antal > 0) {
    problem.push({
      id: 'lass:obekraftade', sektion: 'skotarlass',
      text: `${pl(d.lass.data.antal, 'lass', 'lass')} väntar på granskning — ${d.lass.data.m3} m³ räknas inte som skotat`,
      gor: 'Bekräfta, slå ihop eller stryk dem nedan.', lasfel: false,
    })
  }

  // ── Maskinernas leverans: bara läsbarheten ──
  if (d.leverans.fel) lasfel('leverans', 'leverans', 'maskinernas leverans')

  return { problem, importfel }
}

export type BeskedNiva = 'laddar' | 'gron' | 'gul' | 'rod' | 'okant'

/** Svaret överst — samma på Datahälsa och på startsidan. */
export function beskedAv(problem: readonly Problem[], laddar: boolean): { niva: BeskedNiva; rubrik: string; punkter: string[] } {
  if (laddar) return { niva: 'laddar', rubrik: 'Kontrollerar …', punkter: [] }
  if (problem.length === 0) return { niva: 'gron', rubrik: 'Allt fungerar', punkter: [] }
  const punkter = problem.map((p) => p.text)
  // Bara läsfel: vi vet inte om något är fel — men aldrig "Allt fungerar".
  if (problem.every((p) => p.lasfel)) return { niva: 'okant', rubrik: 'Kunde inte kontrollera allt', punkter }
  return { niva: 'rod', rubrik: problem.length === 1 ? '1 sak är fel' : `${problem.length} saker är fel`, punkter }
}
