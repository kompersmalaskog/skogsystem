// FEL NU — vad som står i Datahälsas svar. Facit: med produktionens data 2026-11-25 ska importen inte ge ett enda problem.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { KONTROLLER_GAMLA_TIM, beskedAv, felNu, laktText, serieNamn, serieVad, type FelNuIn } from './felNu'
import type { FilIn, ImportFelIn } from './lakt'
import type { StatusRad } from './status'

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'importfel_prod_2026-11-25.json'), 'utf8')) as {
  nu: string; fel: ImportFelIn[]; filer: FilIn[]
}
const NU = Date.parse(FX.nu)
const MASKIN: Record<string, string> = { R64428: 'H8E -26', PONS20SDJAA270231: 'Scorpion' }

// Statusraderna som de stod i produktion 2026-11-26 (alla OK), med tiderna flyttade till facit-kvällen.
const STATUS: StatusRad[] = [
  { id: 'deploy_drift', kordTid: '2026-11-25T17:33:15Z', status: 'OK', larmAntal: 0, sammanfattning: 'OK — 9 importfiler byte-identiska med origin/main (7b03f258)' },
  { id: 'fakt_sortiment_mot_stock', kordTid: '2026-11-25T17:33:15Z', status: 'OK', larmAntal: 0, sammanfattning: 'fakt_sortiment och stockarna säger samma sak för alla objekt' },
  { id: 'fakt_tid_mot_mom', kordTid: '2026-11-25T17:33:15Z', status: 'OK', larmAntal: 0, sammanfattning: '1616 rader kontrollerade — fakt_tid matchar MOM-filerna (14 dagar)' },
  { id: 'import_live', kordTid: '2026-11-25T19:45:00Z', status: 'OK', larmAntal: 0, sammanfattning: 'Importen fungerar. Senaste fil 2026-11-25 20:42' },
  { id: 'inkommande_ko', kordTid: '2026-11-25T17:33:15Z', status: 'OK', larmAntal: 0, sammanfattning: 'Inga filer äldre än 24 h i Inkommande' },
  { id: 'parkerade_filer', kordTid: '2026-11-25T17:33:15Z', status: 'OK', larmAntal: 0, sammanfattning: 'Inga oimporterade filer i parkeringsmapparna' },
  { id: 'stammar_utan_stockar', kordTid: '2026-11-25T17:33:15Z', status: 'OK', larmAntal: 0, sammanfattning: 'Alla objekt med stammar har stockar' },
]

const friskt = (over: Partial<FelNuIn> = {}): FelNuIn => ({
  nu: NU,
  status: { fel: null, data: STATUS },
  filer: { fel: null, data: FX.filer },
  importFel: { fel: null, data: FX.fel },
  invarianter: { fel: null, data: { over24h: 0, dubbletter: 0, tomgang: 0 } },
  koordinat: { fel: null, data: { koordlosa: 0, dupTrakt: 0 } },
  lass: { fel: null, data: { antal: 0, m3: 0 } },
  leverans: { fel: null },
  maskinNamn: (id) => MASKIN[id] ?? id,
  ...over,
})
const medStatus = (id: string, over: Partial<StatusRad>) => STATUS.map((r) => (r.id === id ? { ...r, ...over } : r))

describe('FACIT PROD 2026-11-25', () => {
  it('importen och importfelen ger inga problem: "Allt fungerar"', () => {
    const r = felNu(friskt())
    expect(r.problem).toEqual([])
    expect(beskedAv(r.problem, false)).toEqual({ niva: 'gron', rubrik: 'Allt fungerar', punkter: [] })
  })
  it('de 100 felraderna finns kvar som HISTORIK — fyra läkta serier, inget fel nu', () => {
    const r = felNu(friskt())
    expect(r.importfel!.nuSerier).toEqual([])
    expect(r.importfel!.laktaSerier.map((s) => s.objekt).sort()).toEqual(['Brokamåla 15 V-H -26', 'Brokamåla L-S Lev -25', 'Gallring Santhe 2026', 'Tröjemåla 1115 AU'])
    expect(r.importfel!.laktaSerier.reduce((n, s) => n + s.antalFel, 0)).toBe(100)
  })
  it('parkerade filer larmar tills gap check kört igen — det är det enda som då är fel', () => {
    const r = felNu(friskt({ status: { fel: null, data: medStatus('parkerade_filer', { status: 'LARM', larmAntal: 1, sammanfattning: 'LARM OIMPORTERADE FILER i _vanta_stor_hpr: 5 st (Ålshult)' }) } }))
    expect(r.problem).toHaveLength(1)
    expect(r.problem[0]).toMatchObject({ sektion: 'kontroller', text: 'Parkerade filer: OIMPORTERADE FILER i _vanta_stor_hpr: 5 st (Ålshult)', lasfel: false })
    expect(r.problem[0].gor).toMatch(/Inkommande/)
    expect(beskedAv(r.problem, false).rubrik).toBe('1 sak är fel')
  })
  it('19 obekräftade lass (som i prod 2026-11-26) är ett problem tills de granskats', () => {
    const r = felNu(friskt({ lass: { fel: null, data: { antal: 19, m3: 380 } } }))
    expect(r.problem).toEqual([{
      id: 'lass:obekraftade', sektion: 'skotarlass', lasfel: false,
      text: '19 lass väntar på granskning — 380 m³ räknas inte som skotat', gor: 'Bekräfta, slå ihop eller stryk dem nedan.',
    }])
  })
})

describe('import_live', () => {
  it('larm: en rad per problem, raden om när larmet startade är ingen egen sak', () => {
    const r = felNu(friskt({ status: { fel: null, data: medStatus('import_live', {
      status: 'LARM', larmAntal: 2, sammanfattning: 'H8E -26: HPR-filen kl 16:28 gick inte att importera\nScorpion: inga nya filer sedan kl 11:36\nLarmet startade 2026-11-25 16:30',
    }) } }))
    expect(r.problem.map((p) => p.text)).toEqual(['H8E -26: HPR-filen kl 16:28 gick inte att importera', 'Scorpion: inga nya filer sedan kl 11:36'])
    expect(r.problem.every((p) => p.sektion === 'filer' && !p.lasfel)).toBe(true)
    expect(r.problem[0].gor).toMatch(/Kolla importdatorn.*Larmet startade 2026-11-25 16:30/)
    expect(beskedAv(r.problem, false).rubrik).toBe('2 saker är fel')
  })
  it('en rad som redan säger vad man gör får ingen extra uppmaning', () => {
    const r = felNu(friskt({ status: { fel: null, data: medStatus('import_live', { status: 'LARM', larmAntal: 1, sammanfattning: 'Inga filer alls har kommit in i dag. Kolla importdatorn.' }) } }))
    expect(r.problem).toHaveLength(1)
    expect(r.problem[0].gor).toBeNull()
  })
  it('kontrollen har stannat (äldre än 45 min): aldrig "Allt fungerar"', () => {
    const r = felNu(friskt({ status: { fel: null, data: medStatus('import_live', { kordTid: '2026-11-25T18:00:00Z' }) } }))
    expect(r.problem).toHaveLength(1)
    expect(r.problem[0].text).toBe('Importen kontrolleras inte — senast kontrollerad 19:00')
    expect(beskedAv(r.problem, false).niva).toBe('rod')
  })
  it('raden saknas helt: ett problem', () => {
    const r = felNu(friskt({ status: { fel: null, data: STATUS.filter((x) => x.id !== 'import_live') } }))
    expect(r.problem.map((p) => p.text)).toEqual(['Importen har inte kontrollerats än'])
  })
})

describe('kontrollerna på importdatorn', () => {
  it('bara rader med larm eller fel är problem', () => {
    const data = medStatus('inkommande_ko', { status: 'LARM', larmAntal: 4, sammanfattning: 'LARM fil A\nLARM fil B\nLARM fil C\nLARM fil D' })
    const r = felNu(friskt({ status: { fel: null, data } }))
    expect(r.problem.map((p) => p.text)).toEqual(['Kön i Inkommande: fil A (och 3 till)'])
  })
  it('en kontroll som inte gick att köra är ett problem', () => {
    const r = felNu(friskt({ status: { fel: null, data: medStatus('stammar_utan_stockar', { status: 'OKÄND', sammanfattning: 'RPC gav timeout' }) } }))
    expect(r.problem.map((p) => p.text)).toEqual(['Stammar utan stockar: kunde inte kontrolleras'])
  })
  it(`inte körda på ${KONTROLLER_GAMLA_TIM} timmar: ett problem, också när raderna säger OK`, () => {
    const gamla = STATUS.map((r) => (r.id === 'import_live' ? r : { ...r, kordTid: '2026-11-22T19:02:00Z' }))
    const r = felNu(friskt({ status: { fel: null, data: gamla } }))
    expect(r.problem.map((p) => p.text)).toEqual(['Kontrollerna på importdatorn har inte körts sedan 22 nov 20:02'])
    // precis innanför gränsen: inget problem
    const farska = STATUS.map((x) => (x.id === 'import_live' ? x : { ...x, kordTid: new Date(NU - (KONTROLLER_GAMLA_TIM * 3_600_000 - 60_000)).toISOString() }))
    expect(felNu(friskt({ status: { fel: null, data: farska } })).problem).toEqual([])
  })
  it('den gamla samlingsraden gap_check är aldrig ett problem', () => {
    const med = [...STATUS, { id: 'gap_check', kordTid: '2026-11-25T09:33:20Z', status: 'LARM', larmAntal: 101, sammanfattning: 'LARM gammalt' }]
    expect(felNu(friskt({ status: { fel: null, data: med } })).problem).toEqual([])
  })
})

describe('importfelen: ett fel tills det läkt', () => {
  it('mitt i haveriet 23 november: en rad per objekt, med maskinens namn och vad man gör', () => {
    const t = Date.parse('2026-11-23T12:00:00Z')
    const r = felNu(friskt({
      nu: t,
      status: { fel: null, data: STATUS.map((x) => ({ ...x, kordTid: new Date(t - 600_000).toISOString() })) },
      importFel: { fel: null, data: FX.fel.filter((x) => Date.parse(x.tid) <= t) },
      filer: { fel: null, data: FX.filer.filter((x) => Date.parse(x.importeradTid) <= t) },
    }))
    expect(r.problem.map((p) => p.text).sort()).toEqual([
      'Gallring Santhe 2026 · H8E -26: 24 HPR-filer gick inte in helt',
      'Tröjemåla 1115 AU · Scorpion: 8 HPR-filer gick inte in helt',
    ])
    expect(r.problem.every((p) => p.sektion === 'importfel' && /nästa fil/.test(p.gor ?? ''))).toBe(true)
  })
  it('avvisade dubbletter räknas och visas som ofarliga, aldrig som problem', () => {
    const dubbletter: ImportFelIn[] = Array.from({ length: 232 }, (_, i) => ({
      tid: new Date(NU - 3_600_000 - i * 1000).toISOString(), tabell: 'detalj_kontroll_stock', filnamn: 'PONS20SDJAA270231_20261125143242.hqc', felkod: '409', feltext: '{"code":"23505"}',
    }))
    const r = felNu(friskt({ importFel: { fel: null, data: dubbletter } }))
    expect(r.problem).toEqual([])
    expect(r.importfel!.ofarliga).toBe(232)
  })
  it('ett nätfel utan filnamn: ett problem i ett dygn', () => {
    const utan: ImportFelIn[] = [{ tid: new Date(NU - 2 * 3_600_000).toISOString(), tabell: 'dim_sortiment', filnamn: null, felkod: 'ReadTimeout', feltext: 'Read timed out' }]
    const r = felNu(friskt({ importFel: { fel: null, data: utan } }))
    expect(r.problem).toHaveLength(1)
    expect(r.problem[0].text).toMatch(/^Ett nätfel när dim_sortiment skrevs \(19:00\)$/)
    expect(felNu(friskt({ nu: NU + 23 * 3_600_000, importFel: { fel: null, data: utan }, status: { fel: null, data: STATUS.map((x) => ({ ...x, kordTid: new Date(NU + 23 * 3_600_000 - 60_000).toISOString() })) } })).problem).toEqual([])
  })
})

describe('invarianter, koordinater, lass: bara när något finns', () => {
  it('noll av allt ger inga problem', () => expect(felNu(friskt()).problem).toEqual([]))
  it('varje sak som finns är ett eget problem med vad man gör', () => {
    const r = felNu(friskt({
      invarianter: { fel: null, data: { over24h: 1, dubbletter: 2, tomgang: 3 } },
      koordinat: { fel: null, data: { koordlosa: 4, dupTrakt: 1 } },
    }))
    expect(r.problem.map((p) => p.text)).toEqual([
      '1 dag med mer än 24 timmar motortid',
      '2 dagar där två förare har exakt samma tid',
      '3 rader där tomgången inte går ihop med motortiden',
      '4 arbetsdagar på objekt utan koordinat — km blir 0 i lönen',
      '1 trakt ligger på flera VO-nummer',
    ])
    expect(r.problem.every((p) => !!p.gor)).toBe(true)
    expect(r.problem.map((p) => p.sektion)).toEqual(['invarianter', 'invarianter', 'invarianter', 'koordinat', 'koordinat'])
  })
})

describe('ETT LÄSFEL ÄR ALLTID ETT PROBLEM — aldrig "Allt fungerar"', () => {
  const fall: [string, Partial<FelNuIn>, string, string][] = [
    ['statusraderna', { status: { fel: 'Failed to fetch', data: null } }, 'Kunde inte kontrollera importen och kontrollerna på importdatorn', 'filer'],
    ['import_fel', { importFel: { fel: 'timeout', data: null } }, 'Kunde inte kontrollera om något tappades vid import', 'importfel'],
    ['filloggen', { filer: { fel: 'timeout', data: null } }, 'Kunde inte kontrollera om något tappades vid import', 'importfel'],
    ['invarianterna', { invarianter: { fel: 'statement timeout', data: null } }, 'Kunde inte kontrollera maskintiden', 'invarianter'],
    ['koordinaterna', { koordinat: { fel: 'x', data: null } }, 'Kunde inte kontrollera objektens koordinater', 'koordinat'],
    ['lassen', { lass: { fel: 'x', data: null } }, 'Kunde inte kontrollera skotarens lass', 'skotarlass'],
    ['leveransen', { leverans: { fel: 'x' } }, 'Kunde inte kontrollera maskinernas leverans', 'leverans'],
  ]
  for (const [namn, over, text, sektion] of fall) {
    it(`${namn} gick inte att läsa`, () => {
      const r = felNu(friskt(over))
      expect(r.problem).toEqual([{ id: expect.stringMatching(/^las:/), sektion, text, gor: null, lasfel: true }])
      const b = beskedAv(r.problem, false)
      expect(b.niva).toBe('okant')
      expect(b.rubrik).toBe('Kunde inte kontrollera allt')
      expect(b.rubrik).not.toMatch(/fungerar/i)
    })
  }
  it('data som är null utan felmeddelande räknas också som läsfel', () => {
    expect(felNu(friskt({ invarianter: { fel: null, data: null } })).problem).toHaveLength(1)
  })
  it('läsfel tillsammans med ett riktigt fel: båda räknas, rubriken säger fel', () => {
    const r = felNu(friskt({ koordinat: { fel: 'x', data: null }, lass: { fel: null, data: { antal: 2, m3: 40 } } }))
    expect(beskedAv(r.problem, false)).toMatchObject({ niva: 'rod', rubrik: '2 saker är fel' })
  })
  it('när importfelen inte går att läsa finns ingen bedömning att visa', () => {
    expect(felNu(friskt({ importFel: { fel: 'x', data: null } })).importfel).toBeNull()
  })
})

describe('beskedAv och texterna', () => {
  it('laddar', () => expect(beskedAv([], true)).toEqual({ niva: 'laddar', rubrik: 'Kontrollerar …', punkter: [] }))
  it('punkterna är problemens text, i samma ordning', () => {
    const r = felNu(friskt({ invarianter: { fel: null, data: { over24h: 1, dubbletter: 0, tomgang: 0 } }, lass: { fel: null, data: { antal: 1, m3: 20 } } }))
    expect(beskedAv(r.problem, false).punkter).toEqual(r.problem.map((p) => p.text))
  })
  it('serieNamn, serieVad och laktText', () => {
    const s = { nyckel: 'k', objekt: 'Tröjemåla 1115 AU', maskinId: 'PONS20SDJAA270231', filtyp: 'HPR', antalFiler: 1, antalFel: 2, forstaFel: '', sistaFel: '', tabeller: ['detalj_stock'], orsak: '', laktTid: null }
    expect(serieNamn(s, (id) => MASKIN[id] ?? id)).toBe('Tröjemåla 1115 AU · Scorpion')
    expect(serieNamn({ ...s, objekt: null }, (id) => MASKIN[id] ?? id)).toBe('Scorpion')
    expect(serieNamn({ ...s, objekt: null, maskinId: null }, (id) => id)).toBe('Okänd fil')
    expect(serieVad(s)).toBe('1 HPR-fil gick inte in helt')
    expect(serieVad({ ...s, antalFiler: 3 })).toBe('3 HPR-filer gick inte in helt')
    expect(laktText(s)).toBe('Läkt – nästa fil skrev in allt')
    expect(laktText({ ...s, filtyp: 'MOM' })).toBe('Läkt – en senare fil gick in utan fel')
  })
})
