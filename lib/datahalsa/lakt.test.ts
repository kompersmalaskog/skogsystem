// LÄKT-REGELN mot produktionens verkliga fel. Fixturen är import_fel och filloggen de sju dygnen före
// 2026-11-25 kl 21:00 svensk tid (bara SELECT): 78 rader "UPDATE requires a WHERE clause" den 23 november
// (fart_andringsvakt, hotfix 18:03) och 22 FONSTER_BYTTE på Gallring Santhe. Facit (Martin/chatten): ALLA är läkta.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FEL_NU_DYGN, OMKORD_MIN, UTAN_FIL_TIM, bedomFel, filSerie, importFelKlass, kortOrsak, perSerie, sammaSerie,
  type FilIn, type ImportFelIn,
} from './lakt'

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'importfel_prod_2026-11-25.json'), 'utf8')) as {
  nu: string; fel: ImportFelIn[]; filer: FilIn[]; gamlaFilfel: FilIn[]
}
const NU = Date.parse(FX.nu)
const TIM = 3_600_000

const fil = (filnamn: string, tid: string, over: Partial<FilIn> = {}): FilIn =>
  ({ filnamn, maskinId: 'R64428', importeradTid: tid, status: 'OK', felmeddelande: null, ...over })
const fel = (filnamn: string | null, tid: string, over: Partial<ImportFelIn> = {}): ImportFelIn =>
  ({ tid, tabell: 'detalj_stock', filnamn, felkod: '400', feltext: '{"code":"21000","message":"UPDATE requires a WHERE clause"}', ...over })

describe('filSerie — objektet och maskinen ur filnamnet', () => {
  it('Ponsse skördare: objekt, maskin, tidsstämpel', () => {
    expect(filSerie('Tröjemåla 1115 AU_PONS20SDJAA270231_20261123113624.hpr'))
      .toEqual({ typ: 'hpr', stam: 'tröjemåla 1115 au', namn: 'Tröjemåla 1115 AU', maskin: 'PONS20SDJAA270231' })
    // kopia med löpnummer sist
    expect(filSerie('400763 Akelius Tåget SA -26_PONS20SDJAA270231_20260907045651_1.hpr')!.stam).toBe('400763 akelius tåget sa -26')
  })
  it('Ponsse HQC bär bara maskinen', () => {
    expect(filSerie('PONS20SDJAA270231_20260915143242.hqc')).toEqual({ typ: 'hqc', stam: '', namn: '', maskin: 'PONS20SDJAA270231' })
  })
  it('Rottne: objektet före datum och klockslag, punkten och dubbla mellanslag bort', () => {
    expect(filSerie('Gallring Santhe 2026. 2026-11-23 1628.hpr')).toEqual({ typ: 'hpr', stam: 'gallring santhe 2026', namn: 'Gallring Santhe 2026', maskin: null })
    expect(filSerie('Flytt 2026  2026-10-20 1447.mom')!.stam).toBe('flytt 2026')
    expect(filSerie('Intaget gallring 2026-10-21 1607_1019.hqc')!.stam).toBe('intaget gallring')
  })
  it('Ponsse skotare: understreck är mellanslag', () => {
    expect(filSerie('__Edestad_RP_J_Hus__25-181126-110437.fpr')).toEqual({ typ: 'fpr', stam: 'edestad rp j hus 25', namn: 'Edestad RP J Hus 25', maskin: null })
    expect(filSerie('Flytt-050624-132829_full.mom')!.stam).toBe('flytt')
  })
  it('samma objekt men olika filtyp är olika serier', () => {
    const hpr = filSerie('Gallring Santhe 2026. 2026-11-23 1628.hpr')!
    const mom = filSerie('Gallring Santhe 2026. 2026-11-23 1644.mom')!
    expect(sammaSerie(hpr, 'R64428', mom, 'R64428')).toBe(false)
  })
  it('ett namn utan känd form ger ingen serie — aldrig en gissning', () => {
    expect(filSerie('Gallring Santhe 2026.hqc')).toBeNull()
    expect(filSerie('anteckningar.txt')).toBeNull()
    expect(filSerie(null)).toBeNull()
    expect(filSerie('')).toBeNull()
  })
  it('varje fil i produktionens fillogg går att läsa', () => {
    const otolkade = [...FX.filer, ...FX.gamlaFilfel].filter((f) => !filSerie(f.filnamn)).map((f) => f.filnamn)
    expect(otolkade).toEqual([])
  })
  it('maskinen i ett Ponsse-namn är samma som filloggens', () => {
    const olika = FX.filer.filter((f) => filSerie(f.filnamn)?.maskin && f.maskinId && filSerie(f.filnamn)!.maskin !== f.maskinId)
    expect(olika).toEqual([])
  })
})

describe('sammaSerie', () => {
  const a = filSerie('Gallring Santhe 2026. 2026-11-23 1628.hpr')!
  const b = filSerie('Gallring Santhe 2026. 2026-11-24 0705.hpr')!
  it('samma objekt och maskin', () => expect(sammaSerie(a, 'R64428', b, 'R64428')).toBe(true))
  it('samma objektnamn på en ANNAN maskin är inte samma serie', () => expect(sammaSerie(a, 'R64428', b, 'R64101')).toBe(false))
  it('filen som felade saknar maskin i filloggen: objektnamnet räcker', () => expect(sammaSerie(a, null, b, 'R64428')).toBe(true))
  it('annat objekt', () => expect(sammaSerie(a, 'R64428', filSerie('Vashult gallring 2026 2026-11-24 0705.hpr')!, 'R64428')).toBe(false))
  it('Ponsse HQC utan objektnamn kräver samma maskin', () => {
    const h = filSerie('PONS20SDJAA270231_20260915143242.hqc')!
    expect(sammaSerie(h, null, filSerie('PONS20SDJAA270231_20260916143242.hqc')!, null)).toBe(true)
    expect(sammaSerie(h, null, filSerie('PONS99XYZAA111111_20260916143242.hqc')!, null)).toBe(false)
  })
})

describe('importFelKlass — ofarligt är aldrig ett fel', () => {
  it('avvisad dubblett, flyttstrul och väderanteckningen är ofarliga', () => {
    expect(importFelKlass({ felkod: '409', feltext: '{"code":"23505"}' })).toBe('ofarligt')
    // 409 räcker ensamt — också när svaret inte nämner 23505
    expect(importFelKlass({ felkod: '409', feltext: 'Conflict' })).toBe('ofarligt')
    expect(importFelKlass({ felkod: '409', feltext: null })).toBe('ofarligt')
    expect(importFelKlass({ felkod: '500', feltext: 'duplicate key value violates unique constraint' })).toBe('ofarligt')
    expect(importFelKlass({ felkod: 'X', feltext: 'flytt till Behandlade misslyckades' })).toBe('ofarligt')
    expect(importFelKlass({ felkod: 'VADER_PERMANENT', feltext: 'ingen stock med både GPS-position och skördetid' })).toBe('ofarligt')
  })
  it('allt annat är äkta', () => {
    expect(importFelKlass({ felkod: '400', feltext: '{"code":"21000","message":"UPDATE requires a WHERE clause"}' })).toBe('akta')
    expect(importFelKlass({ felkod: 'FONSTER_BYTTE', feltext: '11287866 / R64428_865: langd_max_cm: 330 -> 315' })).toBe('akta')
    expect(importFelKlass({ felkod: 'SSLError', feltext: 'HTTPSConnectionPool' })).toBe('akta')
    expect(importFelKlass({ felkod: null, feltext: null })).toBe('akta')
  })
})

describe('FACIT PROD 2026-11-25: alla fel är läkta', () => {
  const b = bedomFel(FX.fel, FX.filer, NU)

  it('fixturen är den riktiga: 100 felrader, 78 med kod 21000 och 22 FONSTER_BYTTE', () => {
    expect(FX.fel).toHaveLength(100)
    expect(FX.fel.filter((r) => /21000/.test(r.feltext ?? ''))).toHaveLength(78)
    expect(FX.fel.filter((r) => r.felkod === 'FONSTER_BYTTE')).toHaveLength(22)
    expect(FX.fel.filter((r) => r.tabell === 'detalj_stock')).toHaveLength(50)
    expect(FX.fel.filter((r) => r.tabell === 'detalj_stam')).toHaveLength(28)
  })

  it('inget är ett fel nu', () => {
    expect(b.nu).toEqual([])
    expect(b.gamla).toEqual([])
  })

  it('alla 100 felrader ligger i de läkta filerna — ingen rad har fallit bort ur räkningen', () => {
    expect(b.lakta.reduce((n, f) => n + f.antalFel, 0)).toBe(100)
    expect(b.lakta).toHaveLength(38)
  })

  it('fyra serier: Santhe, Tröjemåla och de två Brokamåla', () => {
    const serier = perSerie(b.lakta)
    expect(serier.map((s) => `${s.objekt}|${s.maskinId}|${s.filtyp}|${s.antalFiler}|${s.antalFel}`).sort()).toEqual([
      'Brokamåla 15 V-H -26|PONS20SDJAA270231|HPR|1|2',
      'Brokamåla L-S Lev -25|PONS20SDJAA270231|HPR|2|4',
      'Gallring Santhe 2026|R64428|HPR|27|67',
      'Tröjemåla 1115 AU|PONS20SDJAA270231|HPR|8|27',
    ])
  })

  it('fyra filer kördes om efter hotfixen kl 18:03 — de läkte sig själva och de äldre filerna i sin serie', () => {
    const omkorda = b.lakta.filter((f) => f.lakt!.hur === 'omkord').map((f) => f.filnamn).sort()
    expect(omkorda).toEqual([
      'Brokamåla 15 V-H -26_PONS20SDJAA270231_20261123153555.hpr',
      'Brokamåla L-S Lev -25_PONS20SDJAA270231_20261123152232.hpr',
      'Gallring Santhe 2026. 2026-11-23 1628.hpr',
      'Tröjemåla 1115 AU_PONS20SDJAA270231_20261123113624.hpr',
    ])
    // Varje läkning kom EFTER hotfixen (17:03 UTC) och efter filens sista fel.
    for (const f of b.lakta) {
      expect(Date.parse(f.lakt!.tid)).toBeGreaterThan(Date.parse('2026-11-23T17:03:00Z'))
      expect(Date.parse(f.lakt!.tid)).toBeGreaterThan(Date.parse(f.sistaFel))
    }
  })

  it('FONSTER_BYTTE på Santhe (sista 23 nov 10:31) hör till samma serie och läkte med den', () => {
    const santhe = perSerie(b.lakta).find((s) => s.objekt === 'Gallring Santhe 2026')!
    expect(santhe.tabeller).toEqual(expect.arrayContaining(['dim_objekt_sortiment_fonster', 'detalj_stam', 'detalj_stock']))
  })

  it('SAMMA DATA MITT I HAVERIET: kl 13 den 23 november var Santhe och Tröjemåla fel', () => {
    const t = Date.parse('2026-11-23T12:00:00Z')
    const da = bedomFel(FX.fel.filter((r) => Date.parse(r.tid) <= t), FX.filer.filter((f) => Date.parse(f.importeradTid) <= t), t)
    expect(perSerie(da.nu).map((s) => s.objekt).sort()).toEqual(['Gallring Santhe 2026', 'Tröjemåla 1115 AU'])
    expect(da.lakta).toEqual([])
  })

  it('de 256 gamla felen i filloggen (sista 28 sep) är aldrig fel nu', () => {
    const g = bedomFel([], FX.gamlaFilfel, NU)
    expect(g.nu).toEqual([])
    expect(g.gamla.length + g.lakta.length).toBe(FX.gamlaFilfel.length)
    expect(FX.gamlaFilfel.filter((f) => f.importeradTid >= '2026-08-01')).toHaveLength(256)
  })
})

describe('läkt (1): nästa fil i samma serie', () => {
  const F = 'Gallring Santhe 2026. 2026-11-23 1028.hpr'
  const felen = [fel(F, '2026-11-23T09:31:00Z')]
  const egen = fil(F, '2026-11-23T09:31:40Z')
  const nu = Date.parse('2026-11-23T12:00:00Z')

  it('en senare fil från samma objekt och maskin som gick in OK läker', () => {
    const b = bedomFel(felen, [egen, fil('Gallring Santhe 2026. 2026-11-23 1128.hpr', '2026-11-23T10:33:00Z')], nu)
    expect(b.nu).toEqual([])
    expect(b.lakta[0].lakt).toEqual({ filnamn: 'Gallring Santhe 2026. 2026-11-23 1128.hpr', tid: '2026-11-23T10:33:00Z', hur: 'nasta_fil' })
  })
  it('filens EGEN rad i filloggen läker inte (den skrivs sekunder efter felet)', () => {
    expect(bedomFel(felen, [egen], nu).nu).toHaveLength(1)
  })
  it('en fil som gick in FÖRE felet läker inte', () => {
    expect(bedomFel(felen, [egen, fil('Gallring Santhe 2026. 2026-11-23 0928.hpr', '2026-11-23T08:35:00Z')], nu).nu).toHaveLength(1)
  })
  it('en senare fil som SJÄLV felade läker inte', () => {
    const nasta = 'Gallring Santhe 2026. 2026-11-23 1128.hpr'
    const b = bedomFel([...felen, fel(nasta, '2026-11-23T10:32:30Z')], [egen, fil(nasta, '2026-11-23T10:33:00Z')], nu)
    expect(b.nu.map((f) => f.filnamn).sort()).toEqual([F, nasta].sort())
  })
  it('en senare fil med status FEL läker inte', () => {
    expect(bedomFel(felen, [egen, fil('Gallring Santhe 2026. 2026-11-23 1128.hpr', '2026-11-23T10:33:00Z', { status: 'FEL', felmeddelande: 'Kunde inte spara till databas' })], nu).nu).toHaveLength(2)
  })
  it('ett annat objekt läker inte', () => {
    expect(bedomFel(felen, [egen, fil('Vashult gallring 2026 2026-11-23 1128.hpr', '2026-11-23T10:33:00Z')], nu).nu).toHaveLength(1)
  })
  it('en annan filtyp från samma objekt läker inte (MOM skriver inte stockarna)', () => {
    expect(bedomFel(felen, [egen, fil('Gallring Santhe 2026. 2026-11-23 1144.mom', '2026-11-23T10:49:00Z')], nu).nu).toHaveLength(1)
  })
  it('samma objektnamn från en annan maskin läker inte', () => {
    expect(bedomFel(felen, [egen, fil('Gallring Santhe 2026. 2026-11-23 1128.hpr', '2026-11-23T10:33:00Z', { maskinId: 'R64101' })], nu).nu).toHaveLength(1)
  })
  it('en avvisad dubblett på den senare filen hindrar inte läkningen (ofarligt)', () => {
    const nasta = 'Gallring Santhe 2026. 2026-11-23 1128.hpr'
    const b = bedomFel([...felen, fel(nasta, '2026-11-23T10:32:30Z', { felkod: '409', feltext: '{"code":"23505"}' })], [egen, fil(nasta, '2026-11-23T10:33:00Z')], nu)
    expect(b.nu).toEqual([])
  })
})

describe('läkt (2): samma fil omkörd', () => {
  const F = 'Tröjemåla 1115 AU_PONS20SDJAA270231_20261123113624.hpr'
  const felen = [fel(F, '2026-11-23T11:38:00Z')]
  const nu = Date.parse('2026-11-23T18:00:00Z')

  it(`filloggens rad mer än ${OMKORD_MIN} minuter efter sista felet = omkörd utan fel`, () => {
    const b = bedomFel(felen, [fil(F, '2026-11-23T17:19:51Z', { maskinId: 'PONS20SDJAA270231' })], nu)
    expect(b.nu).toEqual([])
    expect(b.lakta[0].lakt!.hur).toBe('omkord')
  })
  it('gränsen: precis på minuten räknas inte, en sekund över gör det', () => {
    const pa = new Date(Date.parse('2026-11-23T11:38:00Z') + OMKORD_MIN * 60_000).toISOString()
    const over = new Date(Date.parse('2026-11-23T11:38:00Z') + OMKORD_MIN * 60_000 + 1000).toISOString()
    expect(bedomFel(felen, [fil(F, pa)], nu).nu).toHaveLength(1)
    expect(bedomFel(felen, [fil(F, over)], nu).nu).toHaveLength(0)
  })
  it('omkörd men felade igen: sista felet räknas, alltså inte läkt', () => {
    const b = bedomFel([...felen, fel(F, '2026-11-23T17:19:30Z')], [fil(F, '2026-11-23T17:19:51Z')], nu)
    expect(b.nu).toHaveLength(1)
  })
  it('omkörd med status FEL läker inte', () => {
    expect(bedomFel(felen, [fil(F, '2026-11-23T17:19:51Z', { status: 'FEL' })], nu).nu).toHaveLength(1)
  })
  it('en omkörd fil läker de äldre filerna i sin serie', () => {
    const aldre = 'Tröjemåla 1115 AU_PONS20SDJAA270231_20261123061243.hpr'
    const b = bedomFel([fel(aldre, '2026-11-23T06:13:00Z'), ...felen],
      [fil(aldre, '2026-11-23T06:13:17Z', { maskinId: 'PONS20SDJAA270231' }), fil(F, '2026-11-23T17:19:51Z', { maskinId: 'PONS20SDJAA270231' })], nu)
    expect(b.nu).toEqual([])
    expect(b.lakta.find((f) => f.filnamn === aldre)!.lakt).toMatchObject({ filnamn: F, hur: 'nasta_fil' })
  })
})

describe('det som inte läker', () => {
  const F = 'Gallring Santhe 2026. 2026-11-23 1028.hpr'
  const tid = '2026-11-23T09:31:00Z'

  it(`ett oläkt fel är ett fel i ${FEL_NU_DYGN} dygn, sedan är det historik`, () => {
    const t = Date.parse(tid)
    expect(bedomFel([fel(F, tid)], [fil(F, tid)], t + FEL_NU_DYGN * 24 * TIM - 1000).nu).toHaveLength(1)
    const sen = bedomFel([fel(F, tid)], [fil(F, tid)], t + FEL_NU_DYGN * 24 * TIM + 1000)
    expect(sen.nu).toEqual([])
    expect(sen.gamla).toHaveLength(1)
    expect(sen.lakta).toEqual([])
  })
  it(`ett fel utan filnamn kan inte läka och räknas i ${UTAN_FIL_TIM} timmar`, () => {
    const t = Date.parse(tid)
    const utan = [fel(null, tid, { tabell: 'dim_sortiment', felkod: 'ReadTimeout', feltext: 'Read timed out' })]
    const filer = [fil('Gallring Santhe 2026. 2026-11-23 1128.hpr', '2026-11-23T10:33:00Z')]
    expect(bedomFel(utan, filer, t + UTAN_FIL_TIM * TIM - 1000).nu).toHaveLength(1)
    expect(bedomFel(utan, filer, t + UTAN_FIL_TIM * TIM + 1000).nu).toEqual([])
  })
  it('ett filnamn utan känd form kan inte läka av nästa fil', () => {
    const b = bedomFel([fel('Gallring Santhe 2026.hqc', tid)], [fil('Gallring Santhe 2026. 2026-11-23 1128.hqc', '2026-11-23T10:33:00Z')], Date.parse(tid) + TIM)
    expect(b.nu).toHaveLength(1)
  })
  it('en fil som står som FEL i filloggen är ett fel också utan rader i import_fel', () => {
    const b = bedomFel([], [fil(F, tid, { status: 'FEL', felmeddelande: 'Kunde inte spara till databas' })], Date.parse(tid) + TIM)
    expect(b.nu).toHaveLength(1)
    expect(b.nu[0]).toMatchObject({ filnamn: F, antalFel: 1, orsak: 'Kunde inte spara till databas', tabeller: [] })
  })
  it('fel i import_fel OCH status FEL i filloggen är EN felande fil, inte två', () => {
    const b = bedomFel([fel(F, tid)], [fil(F, tid, { status: 'FEL', felmeddelande: 'Delvis import, fel i: detalj_stock' })], Date.parse(tid) + TIM)
    expect(b.nu).toHaveLength(1)
    expect(b.nu[0].antalFel).toBe(1)
  })
  it('avvisade dubbletter blir aldrig en felande fil', () => {
    const b = bedomFel([fel(F, tid, { felkod: '409', feltext: '{"code":"23505"}' })], [fil(F, tid)], Date.parse(tid) + TIM)
    expect(b).toEqual({ nu: [], lakta: [], gamla: [] })
  })
})

describe('perSerie och kortOrsak', () => {
  it('en rad per objekt och maskin; antal filer och fel summeras', () => {
    const t = '2026-11-23T09:31:00Z'
    const b = bedomFel(
      [fel('Gallring Santhe 2026. 2026-11-23 0928.hpr', '2026-11-23T08:35:00Z'), fel('Gallring Santhe 2026. 2026-11-23 1028.hpr', t), fel('Gallring Santhe 2026. 2026-11-23 1028.hpr', t, { tabell: 'detalj_stam' })],
      [fil('Gallring Santhe 2026. 2026-11-23 0928.hpr', '2026-11-23T08:35:20Z')],   // den andra filen saknar ännu rad i filloggen
      Date.parse(t) + TIM)
    const s = perSerie(b.nu)
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ objekt: 'Gallring Santhe 2026', maskinId: 'R64428', filtyp: 'HPR', antalFiler: 2, antalFel: 3, sistaFel: t })
    expect(s[0].tabeller.sort()).toEqual(['detalj_stam', 'detalj_stock'])
  })
  it('kortOrsak tar meddelandet ur PostgREST-svaret', () => {
    expect(kortOrsak('{"code":"21000","details":null,"hint":null,"message":"UPDATE requires a WHERE clause"}')).toBe('UPDATE requires a WHERE clause')
    expect(kortOrsak('Read timed out')).toBe('Read timed out')
    expect(kortOrsak(null)).toBe('okänt fel')
  })
})
