import { describe, it, expect } from 'vitest'
import { arRotpost, stamplingsKalla } from './kalla'

describe('rotpost', () => {
  it('namnet räcker när avtalsformen saknas', () => {
    expect(arRotpost({ namn: 'Skälviken RP J-Hus -25' })).toBe(true)
    expect(arRotpost({ namn: 'Bågskyttebanan RP J-Hus- 25' })).toBe(true)
    expect(arRotpost({ namn: 'Göljahult RP' })).toBe(true)
  })
  it('avtalsformen räcker', () => {
    expect(arRotpost({ namn: 'X', dimAvtalsform: 'Rp' })).toBe(true)
    expect(arRotpost({ namn: 'X', avtalsform: 'rp' })).toBe(true)
  })
  it('inte rotpost', () => {
    expect(arRotpost({ namn: 'Hallaslätt AU 2026', dimAvtalsform: 'Au' })).toBe(false)
    expect(arRotpost({ namn: 'Ryparegatan' })).toBe(false)
  })
})

describe('stämplingslängdens källa', () => {
  it('den igenkända går först', () => {
    expect(stamplingsKalla({ stamplingslangd_url: 'a.pdf', ovriga_dokument: [{ namn: 'x.pdf', path: 'b.pdf' }] })).toEqual({ path: 'a.pdf', gissad: false })
  })
  it('en ensam inskannad PDF (Mölleryd)', () => {
    expect(stamplingsKalla({ ovriga_dokument: [{ namn: 'Mölleryd.pdf', path: '886465_ovrigt_0.pdf' }] })).toEqual({ path: '886465_ovrigt_0.pdf', gissad: true })
  })
  it('kartor räknas inte, två okända gissas inte', () => {
    expect(stamplingsKalla({ ovriga_dokument: [{ namn: '888887_ÖK.pdf', path: 'k.pdf' }] })).toBeNull()
    expect(stamplingsKalla({ ovriga_dokument: [{ namn: '887101_ÖK.pdf', path: 'k.pdf' }, { namn: 'betet.pdf', path: 'b.pdf' }] })).toEqual({ path: 'b.pdf', gissad: true })
    expect(stamplingsKalla({ ovriga_dokument: [{ namn: 'a.pdf', path: 'a.pdf' }, { namn: 'b.pdf', path: 'b.pdf' }] })).toBeNull()
    expect(stamplingsKalla({})).toBeNull()
  })
})

import { attLasa } from './kalla'

describe('vilka stämplingslängder som läses automatiskt', () => {
  const o = (vo: string, namn: string, extra: object) => ({ vo_nummer: vo, namn, avtalsform: null, ...extra })
  const objekt = [
    o('3', 'Skälviken RP J-Hus -25', { stamplingslangd_url: 's.pdf' }),
    o('1', 'Mölleryd RP J-Hus -25', { ovriga_dokument: [{ namn: 'Mölleryd.pdf', path: 'm.pdf' }] }),
    o('2', 'Sandåsen gallring 2025', { ovriga_dokument: [{ namn: 'sandåsengallring.pdf', path: 'g.pdf' }] }),
    o('4', 'Bågskyttebanan RP J-Hus- 25', { stamplingslangd_url: 'b.pdf' }),
    o('5', 'Hallaslätt AU 2026', {}),
  ]
  it('igenkänd alltid, gissad bara på rotpost, inte de som redan har en rapport', () => {
    expect(attLasa(objekt, new Map(), new Set(['4']))).toEqual(['1', '3'])
  })
})
