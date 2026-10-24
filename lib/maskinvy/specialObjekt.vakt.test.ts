import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { FALT_RUTT } from '@/lib/redigering/objektRouter'

// Special-flaggan (dim_objekt.special, 2026-10-21) är bara lagring + admin-redigering + en badge. Den ändrar INGEN
// beräkning. Framtida prestandajämförelser får utesluta special-objekt, men det är en egen beställning med egen PR —
// de här vakterna larmar om flaggan smyger sig in i en beräkning innan dess.
const rot = process.cwd()
const las = (fil: string) => readFileSync(join(rot, fil), 'utf-8')
const kod = (fil: string) => las(fil).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

function alla(dir: string, ut: string[] = []): string[] {
  for (const n of readdirSync(join(rot, dir))) {
    if (n === 'node_modules' || n === '.next' || n.startsWith('.')) continue
    const rel = `${dir}/${n}`
    if (statSync(join(rot, rel)).isDirectory()) alla(rel, ut)
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) ut.push(rel)
  }
  return ut
}

describe('special-objekt: inga beräkningar läser flaggan', () => {
  it('bara maskinvyns tre objektlistor (Produktion, Kapacitet, Idag) importerar läsaren — ren visning', () => {
    const importerare = [...alla('app'), ...alla('lib'), ...alla('components')]
      .filter(f => f !== 'lib/maskinvy/specialObjekt.ts')
      .filter(f => /maskinvy\/specialObjekt'/.test(kod(f)))
      .sort()
    expect(importerare).toEqual(['app/maskinvy/DagensObjekt.tsx', 'app/maskinvy/KapacitetNy.tsx', 'app/maskinvy/ProduktionNy.tsx'])
  })

  it('beräkningsmodulerna nämner inte special', () => {
    for (const f of ['lib/kapacitet.ts', 'lib/g15.ts', 'lib/maskinvy/skotarvolym.ts', 'lib/maskinvy/jamforelse.ts',
      'lib/maskinvy/operatorer.ts', 'lib/skotningsavstand.ts', 'lib/maskinvy/aktivNu.ts']) {
      expect(kod(f), f).not.toMatch(/\bspecial\b|special_skal|specialObjekt/i)
    }
  })

  it('bara läsaren frågar efter kolumnen special', () => {
    // Historik (lib/historik, components/historik) har en EGEN åtgärdskod 'special' (skada/special som klassning av
    // historiska rapporter i hist_*-tabellerna) — ett annat begrepp, inte dim_objekt.special.
    const traffar = [...alla('app'), ...alla('lib'), ...alla('components')]
      .filter(f => !/(^|\/)historik\//.test(f))
      .filter(f => /['"`]special['"`]|special_skal/.test(kod(f)))
      .sort()
    expect(traffar).toEqual([
      // Redigerings nya objektark sätter flaggan och skälet (samma direktSpara som det gamla arket).
      'app/redigering/RedigeringClient.tsx', 'components/redigering/ObjektOversikt.tsx', 'lib/maskinvy/specialObjekt.ts', 'lib/redigering/objektRouter.ts',
    ].sort())
  })
})

describe('special-objekt: Redigering', () => {
  it('fälten är dim-only (objekt-tabellen har dem inte — objekten kan saknas där helt)', () => {
    expect(FALT_RUTT.special).toEqual({ dim: 'special' })
    expect(FALT_RUTT.special_skal).toEqual({ dim: 'special_skal' })
  })

  it('fälten ligger INTE i batch-spar-listorna: utan migrationen skulle ett batch-skriv fälla all objektsparning', () => {
    const k = kod('app/redigering/RedigeringClient.tsx')
    const gem = k.slice(k.indexOf('const GEMENSAMMA_FALT'), k.indexOf('const SKORDARFALT'))
    expect(gem).toContain("'exkludera'")                 // rätt block hittat
    expect(gem).not.toMatch(/special/)
    const ver = k.slice(k.indexOf('const VERIFIERA_BOOL'), k.indexOf('async function direktPatchDimObjekt'))
    expect(ver).toContain("'exkludera'")
    expect(ver).not.toMatch(/special/)
  })

  it('slås flaggan av nollas skälet i samma skrivning (CHECK special OR skäl IS NULL)', () => {
    expect(kod('components/redigering/ObjektOversikt.tsx')).toMatch(/\{ special: false, special_skal: null \}/)
  })

  it('Special och Ta bort (exkludera) är skilda saker: Ta bort sätter exkludera, aldrig special', () => {
    const k = kod('app/redigering/RedigeringClient.tsx')
    expect(k).toContain('direktSpara({ exkludera: true })')
    expect(k).not.toMatch(/exkludera: true[^\n]*special|special[^\n]*exkludera: true/)
  })
})
