import { describe, it, expect } from 'vitest'
import { fordelaSkotadVolym, fordelaSkotadVolymFrånDB } from './acord'

// Testdata — en skotare, två dagar med G15-tid och lass
const LASS = [
  { datum: '2026-01-01', maskin_id: 'A110148', volym_m3sub: 60 },
  { datum: '2026-01-02', maskin_id: 'A110148', volym_m3sub: 40 },
]
// G15 = processing_sek + terrain_sek + other_work_sek: 7200s dag 1, 4800s dag 2
const TID = [
  { datum: '2026-01-01', maskin_id: 'A110148', processing_sek: 7200, terrain_sek: 0, other_work_sek: 0 },
  { datum: '2026-01-02', maskin_id: 'A110148', processing_sek: 4800, terrain_sek: 0, other_work_sek: 0 },
]

describe('fordelaSkotadVolymFrånDB', () => {

  it('NULL-maskin-rad: identisk fördelning som fordelaSkotadVolym (noll-diff)', () => {
    const gammal = fordelaSkotadVolym(1000, LASS, TID)
    const ny = fordelaSkotadVolymFrånDB([{ maskin_id: null, volym_m3: 1000 }], LASS, TID)
    expect(ny.anvandeManuell).toBe(true)
    expect(ny.kundeInteFordela).toBe(false)
    expect(ny.delar.length).toBe(gammal.delar.length)
    const sortera = (delar: typeof gammal.delar) =>
      [...delar].sort((a, b) => a.datum.localeCompare(b.datum))
    for (const [a, b] of sortera(ny.delar).map((d, i) => [d, sortera(gammal.delar)[i]])) {
      expect(a.datum).toBe(b.datum)
      expect(a.maskin_id).toBe(b.maskin_id)
      expect(a.volym).toBeCloseTo(b.volym, 8)
    }
  })

  it('maskinspecifik rad: fördelar bara på den maskinen, inte på andra', () => {
    const lass2 = [
      ...LASS,
      { datum: '2026-01-01', maskin_id: 'A030353', volym_m3sub: 200 },
    ]
    const tid2 = [
      ...TID,
      { datum: '2026-01-01', maskin_id: 'A030353', processing_sek: 10000, terrain_sek: 0, other_work_sek: 0 },
    ]
    const res = fordelaSkotadVolymFrånDB([{ maskin_id: 'A110148', volym_m3: 1000 }], lass2, tid2)
    expect(res.anvandeManuell).toBe(true)
    const sumA110148 = res.delar.filter(d => d.maskin_id === 'A110148').reduce((s, d) => s + d.volym, 0)
    const sumA030353 = res.delar.filter(d => d.maskin_id === 'A030353').reduce((s, d) => s + d.volym, 0)
    expect(sumA110148).toBeCloseTo(1000, 8)
    expect(sumA030353).toBeCloseTo(0, 8)
  })

  it('prioritetsregel: maskinspecifika rader ignorerar NULL-rad', () => {
    const rader = [
      { maskin_id: null, volym_m3: 999 },      // ska ignoreras — prioritetsregel
      { maskin_id: 'A110148', volym_m3: 1000 },
    ]
    const res = fordelaSkotadVolymFrånDB(rader, LASS, TID)
    const total = res.delar.reduce((s, d) => s + d.volym, 0)
    expect(total).toBeCloseTo(1000, 8)          // inte 1999
  })

  it('inga rader: returnerar lass as-is (ingen manuell volym)', () => {
    const res = fordelaSkotadVolymFrånDB([], LASS, TID)
    expect(res.anvandeManuell).toBe(false)
    const lassTotal = LASS.reduce((s, r) => s + r.volym_m3sub, 0)
    const delTotal = res.delar.reduce((s, d) => s + d.volym, 0)
    expect(delTotal).toBeCloseTo(lassTotal, 8)
  })

  it('filfri maskin (ingen lass, ingen tid): kundeInteFordela = true', () => {
    // Täcker JD810E-fallet: maskinspecifik rad men noll historik
    const res = fordelaSkotadVolymFrånDB(
      [{ maskin_id: 'JD810E', volym_m3: 500 }],
      [],
      [],
    )
    expect(res.kundeInteFordela).toBe(true)
    expect(res.delar).toHaveLength(0)
  })

  it('timpeng-objekt: funktionen är pengarneutral — returnerar volym-delar oavsett avtalsform', () => {
    // Funktionen fördelar volym, aldrig kronor.
    // Ackord/timpeng-gaten sitter hos ANROPAREN:
    //   EkonomiClient.tsx:342 (skördardelar) och :372 (skotardelar) kontrollerar
    //   dim_objekt.timpeng via somTimpeng() och gater ut objektet UR ackordsberäkningen
    //   — fördelningsfunktionen når aldrig ackordsformeln för timpeng-objekt.
    // Timpeng-objekt med manuell volym → ackordkronor = 0 beror på GATEN, inte här.
    const res = fordelaSkotadVolymFrånDB([{ maskin_id: null, volym_m3: 500 }], LASS, TID)
    expect(res.delar.length).toBeGreaterThan(0)
    const total = res.delar.reduce((s, d) => s + d.volym, 0)
    expect(total).toBeCloseTo(500, 8)
    // Fördelning OK — ackordkronor = 0 styrs av anroparen, inte av denna funktion
  })

  it('flera maskinrader för samma maskin: summeras korrekt', () => {
    // Schema tillåter flera rader per (objekt, maskin) — t.ex. en rad per besök
    const rader = [
      { maskin_id: 'A110148', volym_m3: 600 },
      { maskin_id: 'A110148', volym_m3: 400 },
    ]
    const res = fordelaSkotadVolymFrånDB(rader, LASS, TID)
    const total = res.delar.reduce((s, d) => s + d.volym, 0)
    expect(total).toBeCloseTo(1000, 8)
  })

})
