import { describe, expect, it } from 'vitest'
import fixtur from './__fixtures__/klar_2026-10-17.json'
import { lasKlar } from './klar'
import { arHelgEllerRod } from './klarRutnat'
import { planModell } from './manadsplan'
import { ritaPlan, skapaManadsplanPdf } from './manadsplanDela'

const modell = () => planModell(lasKlar(structuredClone(fixtur)), { idag: '2026-10-17' })

describe('månadsplanen som PDF/bild', () => {
  it('ritas med allt innehåll och ryms på en A4 (oktober, flest rader)', () => {
    const texter: string[] = []
    const y = ritaPlan({
      bredd: (s, storlek) => s.length * storlek * 0.5,
      text: s => { texter.push(s) },
      rekt: () => {},
    }, modell(), arHelgEllerRod)
    expect(y).toBeLessThan(841.89 - 48)
    const alla = texter.join('\n')
    for (const bit of ['Oktober 2026', 'Plan · 17 oktober · Kompersmåla Skog', 'MOT BESTÄLLNING', 'MASKINER', 'ATT GÖRA', 'Giant', '29 okt', '12 nov', 'saknar prognos']) {
      expect(alla, bit).toContain(bit)
    }
  })

  it('PDF:en skapas av pdf-lib (en sida) utan fel', async () => {
    const bytes = await skapaManadsplanPdf(modell(), arHelgEllerRod)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(2000)
    const { PDFDocument } = await import('pdf-lib')
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })
})
