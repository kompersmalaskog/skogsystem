import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { baraEgetNytt, signaturer } from './traktOversikt'

const sig = (markers: Array<{ id: number; type: string; comment?: string }>, kommentarer: Array<{ id: string; text: string }> = []) =>
  signaturer({ markers, kommentarIds: [], kommentarer, texter: ['Vidas direktiv'], infor: [] })

describe('baraEgetNytt — det föraren själv sätter öppnar aldrig överblicken för honom', () => {
  const fore = sig([{ id: 1, type: 'warning' }])
  const forra = new Set(fore)
  it('en egen ny symbol: bara eget', () => {
    expect(baraEgetNytt(forra, sig([{ id: 1, type: 'warning' }, { id: 2, type: 'highstump' }]), new Set(['2']), new Set())).toBe(true)
  })
  it('en egen symbol som får kommentar eller foto efteråt: fortfarande bara eget', () => {
    expect(baraEgetNytt(forra, sig([{ id: 1, type: 'warning' }, { id: 2, type: 'highstump', comment: 'vid stenen' }]), new Set(['2']), new Set())).toBe(true)
  })
  it('en egen kommentar: bara eget', () => {
    expect(baraEgetNytt(forra, sig([{ id: 1, type: 'warning' }], [{ id: 'k1', text: 'hej' }]), new Set(), new Set(['k1']))).toBe(true)
  })
  it('planerarens nya fara samtidigt: INTE bara eget — överblicken ska öppnas', () => {
    expect(baraEgetNytt(forra, sig([{ id: 1, type: 'warning' }, { id: 2, type: 'highstump' }, { id: 3, type: 'powerline' }]), new Set(['2']), new Set())).toBe(false)
  })
  it('någon annan ändrar kommentaren på en befintlig symbol: inte eget', () => {
    expect(baraEgetNytt(forra, sig([{ id: 1, type: 'warning', comment: 'ny text' }]), new Set(['2']), new Set())).toBe(false)
  })
  it('Vidas direktiv ändras: inte eget', () => {
    const ny = signaturer({ markers: [{ id: 1, type: 'warning' }, { id: 2, type: 'highstump' }], kommentarIds: [], texter: ['Nytt direktiv'], infor: [] })
    expect(baraEgetNytt(forra, ny, new Set(['2']), new Set())).toBe(false)
  })
  it('inget nytt, eller aldrig läst: false (vanliga regeln gäller)', () => {
    expect(baraEgetNytt(forra, fore, new Set(['2']), new Set())).toBe(false)
    expect(baraEgetNytt(null, fore, new Set(['1']), new Set())).toBe(false)
  })
  it('sidan använder regeln innan överblicken öppnas', () => {
    const sida = fs.readFileSync(path.resolve(__dirname, '../app/planering/page.tsx'), 'utf8')
    const i = sida.indexOf('baraEgetNytt(forra.sig, oversiktSig, korvyEgnaMarkorRef.current')
    expect(i).toBeGreaterThan(0)
    expect(sida.indexOf("setInfoStartVy('oversikt');\n    setTraktOversiktOpen(true);   // effekten", i)).toBeGreaterThan(i)
  })
})
