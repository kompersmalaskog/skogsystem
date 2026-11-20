import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// "Aktiv nu" styrs av signalens ålder (lib/maskinvy/aktivNu) — inte av att datumet är idag. Sedan PR 2 (2026-10-21) finns
// regeln på EN plats, den delade livestatus-raden (app/maskinvy/Livestatus.tsx → lib/maskinvy/livestatus → aktivNuStatus),
// och de fyra vyer som visar den (Idag och Översikt, skördare och skotare) använder alla den — ingen egen kopia.
const kod = (fil: string) => readFileSync(join(process.cwd(), fil), 'utf-8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('källvakt — Aktiv nu-ärlighet', () => {
  it('den delade raden: signalens ålder avgör, aldrig "Aktiv idag", hooks före tidiga returer', () => {
    const k = kod('app/maskinvy/Livestatus.tsx')
    const logik = kod('lib/maskinvy/livestatus.ts')
    expect(logik).toContain('aktivNuStatus(')
    expect(k).toContain('livestatus(')
    expect(k + logik).not.toContain('Aktiv idag')
    expect(k).not.toMatch(/isFresh\s*\?\s*C\.green/)                 // grönt hela dagen
    for (const komp of ['export function LivestatusRad', 'export function ImportRad']) {
      const rad = k.slice(k.indexOf(komp))
      expect(rad.indexOf('useMinutklocka()'), komp).toBeGreaterThan(-1)
      expect(rad.indexOf('useMinutklocka()'), komp).toBeLessThan(rad.indexOf('if (loading)'))
    }
  })

  for (const [fil, kravs] of [
    ['app/maskinvy/IdagNy.tsx', '<LivestatusRad'],
    ['app/maskinvy/SkotareIdagNy.tsx', '<LivestatusRad'],
    ['app/maskinvy/OversiktNy.tsx', '<LivestatusKort'],
    ['app/maskinvy/SkotareOversiktNy.tsx', '<LivestatusKort'],
  ] as const) {
    it(`${fil} använder den delade raden — ingen egen färskhetslogik`, () => {
      const k = kod(fil)
      expect(k).toContain(kravs)
      expect(k).not.toContain('function FreshnessRow')
      expect(k).not.toContain('aktivNuStatus(')
    })
  }
})
