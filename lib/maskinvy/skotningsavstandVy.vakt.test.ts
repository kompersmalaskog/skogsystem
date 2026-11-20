import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { snittSkotningsavstandM } from '@/lib/skotningsavstand'

// EN sträck-definition i maskinvyn (?ny=1): "Skotningsavstånd", undertext "enkel väg", värde via
// lib/skotningsavstand. Förut stod "Snittsträcka 645 m", "1 114 m/lass" och "halva körda sträckan" samtidigt.
const VYER = [
  'app/maskinvy/SkotareOversiktNy.tsx', 'app/maskinvy/SkotareIdagNy.tsx', 'app/maskinvy/SkotareProduktionNy.tsx',
  'app/maskinvy/SkotareJamforelseNy.tsx', 'app/maskinvy/Jamforelse.tsx',
]
const kod = (fil: string) => readFileSync(join(process.cwd(), fil), 'utf-8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('snittSkotningsavstandM', () => {
  it('645 m rått tur-och-retur per lass är 322,5 m enkel väg', () => {
    expect(snittSkotningsavstandM(645 * 10, 10)).toBe(322.5)
  })
  it('inga lass → null, aldrig 0', () => {
    expect(snittSkotningsavstandM(0, 0)).toBeNull()
  })
})

describe('källvakt — ingen vy visar rå körsträcka som om den vore avstånd', () => {
  for (const fil of VYER) {
    it(fil, () => {
      const k = kod(fil)
      expect(k).not.toMatch(/Snittsträcka/)
      expect(k).not.toMatch(/Körsträcka per lass/)
      expect(k).not.toMatch(/\bm\/lass\b/)
      // snittet av korstracka_m får bara gå via lib/skotningsavstand
      expect(k).not.toMatch(/totalDist\s*\/\s*(lass|totalLass|bucket\.lass)/)
    })
  }
  it('de tre skotarvyerna använder etiketten och undertexten ur lib/skotningsavstand', () => {
    for (const fil of ['app/maskinvy/SkotareOversiktNy.tsx', 'app/maskinvy/SkotareIdagNy.tsx', 'app/maskinvy/SkotareProduktionNy.tsx']) {
      const k = kod(fil)
      expect(k).toContain('SKOTNINGSAVSTAND_ETIKETT')
      expect(k).toContain('SKOTNINGSAVSTAND_UNDERTEXT')
    }
  })
})
