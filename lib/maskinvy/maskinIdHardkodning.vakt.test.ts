import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Maskiner väljs ur dim_maskin (lib/maskinvy/jamforelse.ts valjJamforelseMaskiner, useMaskinvyMaskiner) —
// aldrig med ett hårdkodat maskin_id i vyn. Elephant King byttes 2026-08-13 (A110148 → A130743) och
// `isEK = maskin.id === 'A110148'` pekade kvar på den gamla maskinen: en not som påstod "volym/lass registreras
// inte komplett" (alla 426 + 514 lass har volym) visades bara för en maskin som slutade i juni.
const kod = (fil: string) => readFileSync(join(process.cwd(), fil), 'utf-8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('maskin-id i maskinvyns skotarvyer', () => {
  it.each([
    'app/maskinvy/SkotareOversiktNy.tsx', 'app/maskinvy/SkotareIdagNy.tsx', 'app/maskinvy/SkotareProduktionNy.tsx',
    'app/maskinvy/SkotareJamforelseNy.tsx', 'app/maskinvy/Jamforelse.tsx',
  ])('%s jämför aldrig mot ett hårdkodat maskin-id', fil => {
    expect(kod(fil)).not.toMatch(/maskin(_id|\.id)\s*===?\s*['"][A-Z0-9]{5,}['"]/)
    expect(kod(fil)).not.toMatch(/\bisEK\b/)
  })
})
