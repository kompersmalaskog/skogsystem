import { describe, it, expect } from 'vitest'
import { FARG } from '../design/tokens'
import { AVBROTT_TYPER, AVBROTT_TYP_FARG, antalText, avbrottTid } from './avbrottStil'
import { fmtTid } from '../../app/maskinvy/OversiktShared'

describe('Avbrott: färgerna är semantiska', () => {
  it('Underhåll neutral grå, Störning orange, Reparation mörkare orange', () => {
    expect(AVBROTT_TYP_FARG['Underhåll']).toBe(FARG.text2)
    expect(AVBROTT_TYP_FARG['Störning']).toBe(FARG.orange)
    expect(AVBROTT_TYP_FARG['Reparation']).toBe(FARG.orangeMork)
    expect(FARG.orangeMork).not.toBe(FARG.orange)
  })
  it('aldrig grön (bra/produktion), blå (navigation) eller röd (haveri, finns inte som typ) på en stoppkategori', () => {
    const farger = AVBROTT_TYPER.map(t => AVBROTT_TYP_FARG[t])
    for (const f of [FARG.gron, FARG.bla, FARG.rod]) expect(farger).not.toContain(f)
  })
  it('varje kategori har en egen färg', () => {
    expect(new Set(AVBROTT_TYPER.map(t => AVBROTT_TYP_FARG[t])).size).toBe(AVBROTT_TYPER.length)
  })
})

describe('Avbrott: noll skrivs på ETT sätt', () => {
  it('noll tid är "0 min", aldrig streck; riktig tid som förut', () => {
    expect(avbrottTid(0, fmtTid)).toBe('0 min')
    expect(avbrottTid(null, fmtTid)).toBe('0 min')
    expect(avbrottTid(10, fmtTid)).toBe('0 min')        // under 30 s avrundas till 0 min av fmtTid
    expect(avbrottTid(5400, fmtTid)).toBe('1 h 30 min')
  })
  it('antal: "0 ggr", "1 gång", "3 ggr"', () => {
    expect([0, 1, 3].map(antalText)).toEqual(['0 ggr', '1 gång', '3 ggr'])
  })
})
