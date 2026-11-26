import { describe, it, expect } from 'vitest'
import {
  importLiveVy, problemRader, narText, kontrollRader, kontrollerSenastKord,
  IMPORT_LIVE_GAMMAL_MIN, type StatusRad,
} from './status'

// 2026-11-25 11:10 svensk tid (vintertid, UTC+1).
const NU = Date.parse('2026-11-25T10:10:00Z')
const rad = (over: Partial<StatusRad> = {}): StatusRad => ({
  id: 'import_live', kordTid: '2026-11-25T10:00:00.186722+00:00', status: 'OK', larmAntal: 0,
  sammanfattning: 'Importen fungerar. Senaste fil 2026-11-25 10:26', ...over,
})

// Raderna som de stod i prod 2026-11-25 (utom den gamla samlingsraden, som har egna tester).
const PROD: StatusRad[] = [
  { id: 'deploy_drift', kordTid: '2026-11-24T16:09:49.916171+00:00', status: 'OK', larmAntal: 0, sammanfattning: 'OK — 9 importfiler byte-identiska med origin/main (8cfaaea2)' },
  { id: 'fakt_sortiment_mot_stock', kordTid: '2026-11-24T16:09:49.916171+00:00', status: 'OK', larmAntal: 0, sammanfattning: 'fakt_sortiment och stockarna säger samma sak för alla objekt' },
  rad(),
  { id: 'inkommande_ko', kordTid: '2026-11-24T16:09:49.916171+00:00', status: 'OK', larmAntal: 0, sammanfattning: 'Inga filer äldre än 24 h i Inkommande' },
  { id: 'parkerade_filer', kordTid: '2026-11-24T16:09:49.916171+00:00', status: 'LARM', larmAntal: 1, sammanfattning: 'LARM  OIMPORTERADE FILER i _vanta_stor_hpr: 5 st (5 hpr), äldsta 171 dagar — ingen kontroll ser objekt som bara finns som fil.' },
  { id: 'stammar_utan_stockar', kordTid: '2026-11-24T16:09:49.916171+00:00', status: 'OK', larmAntal: 0, sammanfattning: 'Alla objekt med stammar har stockar' },
]

describe('importLiveVy', () => {
  it('grön: "Importen fungerar", resten av databasens text under, senast kontrollerad ur kord_tid', () => {
    expect(importLiveVy(rad(), NU)).toEqual({
      lage: 'ok', rubrik: 'Importen fungerar', rader: ['Senaste fil 2026-11-25 10:26'],
      kontrollerad: 'Senast kontrollerad 11:00', kontrollGammal: false,
    })
  })

  it('grön utan mer text: ingen rad som upprepar rubriken', () => {
    expect(importLiveVy(rad({ sammanfattning: 'Importen fungerar.' }), NU).rader).toEqual([])
    expect(importLiveVy(rad({ sammanfattning: null }), NU).rader).toEqual([])
  })

  it('röd: en rad per problem, i klartext och i databasens ordning', () => {
    const vy = importLiveVy(rad({ status: 'LARM', larmAntal: 2, sammanfattning: 'Ingen fil har kommit in på 6 timmar\nLARM 12 importfel senaste timmen (detalj_stock)\n\n' }), NU)
    expect(vy.lage).toBe('larm')
    expect(vy.rubrik).toBe('Importen felar')
    expect(vy.rader).toEqual(['Ingen fil har kommit in på 6 timmar', '12 importfel senaste timmen (detalj_stock)'])
  })

  it('röd utan text säger att orsaken saknas — aldrig en tom röd ruta', () => {
    expect(importLiveVy(rad({ status: 'LARM', sammanfattning: '' }), NU).rader).toEqual(['Kontrollen larmar men säger inte varför.'])
  })

  it('kontrollen har stannat: aldrig grönt på ett gammalt svar', () => {
    const gammal = new Date(NU - (IMPORT_LIVE_GAMMAL_MIN + 1) * 60_000).toISOString()
    const vy = importLiveVy(rad({ kordTid: gammal }), NU)
    expect(vy.lage).toBe('gammal')
    expect(vy.rubrik).toBe('Importen kontrolleras inte')
    expect(vy.kontrollGammal).toBe(true)
    expect(vy.kontrollerad).toMatch(/^Senast kontrollerad \d\d:\d\d$/)
  })

  it('precis på gränsen är svaret fortfarande färskt', () => {
    const pa = new Date(NU - IMPORT_LIVE_GAMMAL_MIN * 60_000).toISOString()
    expect(importLiveVy(rad({ kordTid: pa }), NU).lage).toBe('ok')
  })

  it('ett larm står kvar också när kontrollen blivit gammal', () => {
    const vy = importLiveVy(rad({ status: 'LARM', sammanfattning: 'Ingen fil på 6 timmar', kordTid: '2026-11-24T08:00:00Z' }), NU)
    expect(vy.lage).toBe('larm')
    expect(vy.kontrollGammal).toBe(true)
    expect(vy.kontrollerad).toBe('Senast kontrollerad i går 09:00')
  })

  it('okänd status är inte grön', () => {
    const vy = importLiveVy(rad({ status: 'OKÄND', sammanfattning: 'import_fel gick inte att läsa' }), NU)
    expect(vy.lage).toBe('okand')
    expect(vy.rubrik).toBe('Importen kunde inte kontrolleras')
    expect(vy.rader).toEqual(['import_fel gick inte att läsa'])
  })

  it('raden saknas: säger att kontrollen inte kört, påstår inget om importen', () => {
    const vy = importLiveVy(null, NU)
    expect(vy.lage).toBe('saknas')
    expect(vy.kontrollerad).toBeNull()
    expect(vy.rubrik).not.toMatch(/fungerar/)
  })

  it('trasig tid räknas som gammal, inte som färsk', () => {
    expect(importLiveVy(rad({ kordTid: 'inte-en-tid' }), NU).lage).toBe('gammal')
    expect(importLiveVy(rad({ kordTid: null }), NU).lage).toBe('gammal')
  })
})

describe('narText', () => {
  it('klockslag samma dag, "i går" dagen före, datum annars — alltid svensk tid', () => {
    expect(narText('2026-11-25T10:00:00Z', NU)).toBe('11:00')
    expect(narText('2026-11-24T16:09:49Z', NU)).toBe('i går 17:09')
    expect(narText('2026-11-22T19:02:50Z', NU)).toBe('22 nov 20:02')
  })
  it('strax efter midnatt svensk tid är i dag, fast UTC säger i går', () => {
    const nu = Date.parse('2026-11-25T23:30:00Z')   // 00:30 den 26:e i Sverige
    expect(narText('2026-11-25T23:10:00Z', nu)).toBe('00:10')
    expect(narText('2026-11-25T22:50:00Z', nu)).toBe('i går 23:50')
  })
  it('sommartid räknas rätt', () => {
    expect(narText('2026-07-01T10:00:00Z', Date.parse('2026-07-01T11:00:00Z'))).toBe('12:00')
  })
  it('ingen eller trasig tid ger null', () => {
    expect(narText(null, NU)).toBeNull()
    expect(narText('x', NU)).toBeNull()
  })
})

describe('problemRader', () => {
  it('delar på radbrytning, tar bort LARM, punkttecken, tomma rader och dubbletter', () => {
    expect(problemRader('LARM  A\r\n- B\n• LARM: C\n\nA\n   ')).toEqual(['A', 'B', 'C'])
  })
  it('rör inte ord som bara börjar på LARM', () => {
    expect(problemRader('Larmplatsen saknas')).toEqual(['Larmplatsen saknas'])
    expect(problemRader('LARMET gick')).toEqual(['LARMET gick'])
  })
  it('tomt in, tomt ut', () => {
    expect(problemRader(null)).toEqual([])
    expect(problemRader('')).toEqual([])
  })
})

describe('kontrollRader', () => {
  it('importdatorns kontroller i fast ordning, utan import_live', () => {
    const rader = kontrollRader(PROD)
    expect(rader.map((r) => r.id)).toEqual(['stammar_utan_stockar', 'fakt_sortiment_mot_stock', 'inkommande_ko', 'parkerade_filer', 'deploy_drift'])
    expect(rader.find((r) => r.id === 'parkerade_filer')).toMatchObject({ namn: 'Parkerade filer', lage: 'larm', larmAntal: 1 })
    expect(rader.find((r) => r.id === 'parkerade_filer')!.rader[0]).toMatch(/^OIMPORTERADE FILER i _vanta_stor_hpr: 5 st/)
  })

  it('den gamla samlingsraden gap_check visas aldrig, också om den ligger kvar i tabellen', () => {
    const med = [...PROD, { id: 'gap_check', kordTid: '2026-11-25T09:33:20Z', status: 'LARM', larmAntal: 101, sammanfattning: 'LARM gammalt' }]
    expect(kontrollRader(med).some((r) => r.id === 'gap_check')).toBe(false)
    expect(kontrollerSenastKord(med)).toBe('2026-11-24T16:09:49.916171+00:00')
  })

  it('en grön kontroll visar inga rader; en okänd visar sin text', () => {
    const rader = kontrollRader([
      { id: 'inkommande_ko', kordTid: null, status: 'OK', larmAntal: 0, sammanfattning: 'Inga filer äldre än 24 h i Inkommande' },
      { id: 'stammar_utan_stockar', kordTid: null, status: 'OKÄND', larmAntal: 0, sammanfattning: 'RPC saknas' },
    ])
    expect(rader.find((r) => r.id === 'inkommande_ko')).toMatchObject({ lage: 'ok', rader: [] })
    expect(rader.find((r) => r.id === 'stammar_utan_stockar')).toMatchObject({ lage: 'okand', rader: ['RPC saknas'] })
  })

  it('en ny kontroll som appen inte känner till syns ändå, sist, under sitt id', () => {
    const rader = kontrollRader([...PROD, { id: 'ny_kontroll', kordTid: null, status: 'LARM', larmAntal: 1, sammanfattning: 'LARM något nytt' }])
    expect(rader[rader.length - 1]).toMatchObject({ id: 'ny_kontroll', namn: 'ny_kontroll', lage: 'larm', rader: ['något nytt'] })
  })

  it('maskintiden mot filerna har en egen rad, först', () => {
    const rader = kontrollRader([...PROD, { id: 'fakt_tid_mot_mom', kordTid: null, status: 'OK', larmAntal: 0, sammanfattning: '1611 rader kontrollerade' }])
    expect(rader[0]).toMatchObject({ id: 'fakt_tid_mot_mom', namn: 'Maskintid mot maskinfilerna', lage: 'ok' })
  })
})

describe('kontrollerSenastKord', () => {
  it('senaste körningen bland importdatorns rader — import_live räknas inte', () => {
    expect(kontrollerSenastKord(PROD)).toBe('2026-11-24T16:09:49.916171+00:00')
    expect(kontrollerSenastKord([rad()])).toBeNull()
  })
})
