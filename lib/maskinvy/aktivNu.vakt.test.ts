import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// "Aktiv nu" styrs av signalens ålder (lib/maskinvy/aktivNu) i båda Idag-vyerna — inte av att datumet är idag.
const VYER = ['app/maskinvy/IdagNy.tsx', 'app/maskinvy/SkotareIdagNy.tsx']
const kod = (fil: string) => readFileSync(join(process.cwd(), fil), 'utf-8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('källvakt — Aktiv nu-ärlighet', () => {
  for (const fil of VYER) {
    it(fil, () => {
      const k = kod(fil)
      expect(k).toContain('aktivNuStatus(')
      expect(k).not.toContain('Aktiv idag')
      expect(k).not.toMatch(/isFresh\s*\?\s*C\.green/)                 // grönt hela dagen
      const rad = k.slice(k.indexOf('function FreshnessRow'))
      // hooks före tidiga returer (regeln efter React #310)
      expect(rad.indexOf('useMinutklocka()')).toBeGreaterThan(-1)
      expect(rad.indexOf('useMinutklocka()')).toBeLessThan(rad.indexOf('return ('))
    })
  }
})
