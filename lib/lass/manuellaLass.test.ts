// Sparlogiken för manuella lass: idempotens, 7-dagarsregeln, att maskinfilernas rader aldrig rörs.
import { describe, it, expect } from 'vitest'
import {
  LAST_TEXT, MANUELL_FILNAMN, REDIGERBAR_DAGAR, byggLassRader, farRedigera, grupperaPerObjekt, manuellMatch,
  senasteVarden, sparaManuellaLass, summaText, taBortManuellaLass, type LassPort, type LassRad,
} from './manuellaLass'

type Rad = LassRad & { id: number }

/** In-memory fakt_lass med generisk eq-matchning — samma semantik som PostgREST:s kedjade .eq(). */
function fakePort(start: Rad[]) {
  const tabell: Rad[] = start.map(r => ({ ...r }))
  let nastaId = 1000
  const anrop: string[] = []
  const port: LassPort = {
    async radera(match) {
      anrop.push('radera')
      const traff = tabell.filter(r => Object.entries(match).every(([k, v]) => String((r as any)[k]) === v))
      for (const t of traff) tabell.splice(tabell.indexOf(t), 1)
      return { antal: traff.length }
    },
    async laggTill(rader) {
      anrop.push('laggTill')
      for (const r of rader) tabell.push({ ...r, id: nastaId++ })
      return { antal: rader.length }
    },
  }
  return { port, tabell, anrop }
}

const auto = (id: number, datum: string, objekt: string, lass: number): Rad => ({
  id, datum, maskin_id: 'JD810E', objekt_id: objekt, lass_nummer: lass, volym_m3sub: 16, volym_m3sob: 16, operator_id: 'X_1', filnamn: 'Kämpamåla_AU_2026.fpr',
})
const nyckel = { datum: '2026-09-24', maskinId: 'JD810E', objektId: '11218909' }
const ratt = { idag: '2026-09-24', arAdmin: false }
const manuella = (t: Rad[]) => t.filter(r => r.filnamn === MANUELL_FILNAMN)

describe('sparaManuellaLass', () => {
  it('skriver N rader med lass_nummer 1..N, filnamn manuell och m³fub per lass', async () => {
    const { port, tabell } = fakePort([])
    const r = await sparaManuellaLass(port, nyckel, 6, 12, null, ratt)
    expect(r).toEqual({ ok: true, antal: 6 })
    expect(tabell.map(x => x.lass_nummer)).toEqual([1, 2, 3, 4, 5, 6])
    expect(tabell.every(x => x.filnamn === 'manuell' && x.volym_m3sub === 12 && x.volym_m3sob === 0 && x.datum === '2026-09-24' && x.objekt_id === '11218909')).toBe(true)
  })

  it('är idempotent: spara om samma dag + maskin + objekt ersätter, dubblerar inte', async () => {
    const { port, tabell } = fakePort([])
    await sparaManuellaLass(port, nyckel, 6, 12, null, ratt)
    const r = await sparaManuellaLass(port, nyckel, 4, 15, null, ratt)
    expect(r).toEqual({ ok: true, antal: 4 })
    expect(manuella(tabell)).toHaveLength(4)
    expect(tabell.map(x => x.lass_nummer)).toEqual([1, 2, 3, 4])
    expect(tabell.every(x => x.volym_m3sub === 15)).toBe(true)
  })

  it('rör aldrig rader med annat filnamn — inte ens på samma dag, maskin och objekt', async () => {
    const start = [auto(1, '2026-09-24', '11218909', 1), auto(2, '2026-09-24', '11218909', 2), auto(3, '2026-09-23', '11218909', 1)]
    const { port, tabell } = fakePort(start)
    await sparaManuellaLass(port, nyckel, 3, 12, null, ratt)
    await sparaManuellaLass(port, nyckel, 2, 12, null, ratt)
    await taBortManuellaLass(port, nyckel, ratt)
    expect(tabell.filter(x => x.filnamn !== 'manuell')).toEqual(start)
    expect(manuella(tabell)).toHaveLength(0)
    // Filtret bär alltid filnamnet.
    expect(manuellMatch(nyckel)).toEqual({ filnamn: 'manuell', datum: '2026-09-24', maskin_id: 'JD810E', objekt_id: '11218909' })
  })

  it('andra objekt och dagar lämnas orörda', async () => {
    const { port, tabell } = fakePort([])
    await sparaManuellaLass(port, { ...nyckel, objektId: '11219961' }, 2, 12, null, ratt)
    await sparaManuellaLass(port, { ...nyckel, datum: '2026-09-23' }, 5, 12, null, ratt)
    await sparaManuellaLass(port, nyckel, 3, 12, null, ratt)
    await sparaManuellaLass(port, nyckel, 1, 12, null, ratt)
    expect(tabell.filter(x => x.objekt_id === '11219961')).toHaveLength(2)
    expect(tabell.filter(x => x.datum === '2026-09-23')).toHaveLength(5)
    expect(tabell.filter(x => x.datum === '2026-09-24' && x.objekt_id === '11218909')).toHaveLength(1)
  })

  it('7-dagarsregeln: 7 dagar bakåt går, 8 är låst, framåt är låst, admin får alltid', async () => {
    const { port, anrop } = fakePort([])
    expect(await sparaManuellaLass(port, { ...nyckel, datum: '2026-09-16' }, 1, 12, null, ratt)).toEqual({ ok: false, fel: LAST_TEXT })
    expect(await sparaManuellaLass(port, { ...nyckel, datum: '2026-09-25' }, 1, 12, null, ratt)).toEqual({ ok: false, fel: LAST_TEXT })
    expect(await taBortManuellaLass(port, { ...nyckel, datum: '2026-09-16' }, ratt)).toEqual({ ok: false, fel: LAST_TEXT })
    expect(anrop).toEqual([]) // porten rörs inte när dagen är låst
    expect((await sparaManuellaLass(port, { ...nyckel, datum: '2026-09-17' }, 1, 12, null, ratt)).ok).toBe(true)
    expect((await sparaManuellaLass(port, { ...nyckel, datum: '2026-08-01' }, 1, 12, null, { idag: '2026-09-24', arAdmin: true })).ok).toBe(true)
    expect(farRedigera('2026-09-17', '2026-09-24', false)).toBe(true)
    expect(farRedigera('2026-09-16', '2026-09-24', false)).toBe(false)
    expect(REDIGERBAR_DAGAR).toBe(7)
  })

  it('validerar antal och m³fub innan något skrivs', async () => {
    const { port, anrop } = fakePort([])
    expect((await sparaManuellaLass(port, nyckel, 0, 12, null, ratt)).ok).toBe(false)
    expect((await sparaManuellaLass(port, nyckel, 2.5, 12, null, ratt)).ok).toBe(false)
    expect((await sparaManuellaLass(port, nyckel, 3, 0, null, ratt)).ok).toBe(false)
    expect(anrop).toEqual([])
  })

  it('port-fel blir ärligt fel, insatt antal ≠ begärt blir fel', async () => {
    const trasig: LassPort = { async radera() { return { fel: 'nere' } }, async laggTill() { return { antal: 0 } } }
    expect(await sparaManuellaLass(trasig, nyckel, 2, 12, null, ratt)).toEqual({ ok: false, fel: 'nere' })
    const halv: LassPort = { async radera() { return { antal: 0 } }, async laggTill() { return { antal: 1 } } }
    expect((await sparaManuellaLass(halv, nyckel, 2, 12, null, ratt)).ok).toBe(false)
  })
})

describe('hjälpfunktioner', () => {
  it('byggLassRader + summaText', () => {
    const rader = byggLassRader(nyckel, 2, 12.5, 'JD810E_1')
    expect(rader).toHaveLength(2)
    expect(rader[1]).toMatchObject({ lass_nummer: 2, volym_m3sub: 12.5, operator_id: 'JD810E_1', filnamn: 'manuell' })
    expect(summaText(6, 12)).toBe(`6 lass · 72 m³fub`)
    expect(summaText(1, 12.5)).toBe(`1 lass · 13 m³fub`)
  })
  it('grupperaPerObjekt + senasteVarden', () => {
    const rader = [
      { datum: '2026-09-22', objekt_id: 'A', lass_nummer: 1, volym_m3sub: 14 },
      { datum: '2026-09-22', objekt_id: 'A', lass_nummer: 2, volym_m3sub: 14 },
      { datum: '2026-09-22', objekt_id: 'B', lass_nummer: 1, volym_m3sub: 10 },
      { datum: '2026-09-15', objekt_id: 'A', lass_nummer: 1, volym_m3sub: 12 },
    ]
    expect(grupperaPerObjekt(rader.filter(r => r.datum === '2026-09-22'))).toEqual([{ objektId: 'A', antal: 2, m3PerLass: 14 }, { objektId: 'B', antal: 1, m3PerLass: 10 }])
    expect(senasteVarden(rader)).toEqual({ antal: 2, m3PerLass: 14 })
    expect(senasteVarden([])).toBeNull()
  })
})
