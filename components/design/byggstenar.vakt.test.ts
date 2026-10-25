import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Vakt: Sektion, Grupp och Ikon finns EN gång (components/design). En vy som behöver "etikett över kort" eller en
// Material Symbols-ikon importerar den — den skriver ingen egen `function Sektion|Grupp|Ikon`.
//
// UNDANTAGEN nedan är INTE kopior: samma NAMN men en annan komponent (annan form eller egen palett). De är inventerade
// 2026-10-17 och listan får bara bli kortare — en ny funktion med ett av namnen utanför components/design fäller testet.
const ROT = new URL('../../', import.meta.url).pathname
const SOKT = ['app', 'components', 'lib']
const SKIPPA = new Set(['node_modules', '.next', '__fixtures__'])
const NAMN = /\bfunction\s+(Sektion|Grupp|Ikon)\b/g

const UNDANTAG: Record<string, string> = {
  'components/admin/ui.tsx:Sektion': 'bara en etikett (ingen kortbehållare), orange variant',
  'components/historik/delar.tsx:Sektion': 'etikett med maskinprick, innehållet ligger fritt under',
  // Faktureringsvyns egna `function Grupp` är borta 2026-10-24: vyn använder
  // components/design/Sektion. Listan får bara bli kortare — den här raden
  // kommer inte tillbaka.
}

function filer(dir: string, ut: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (SKIPPA.has(n)) continue
    const p = join(dir, n)
    const s = statSync(p)
    if (s.isDirectory()) filer(p, ut)
    else if (/\.(tsx?|jsx?)$/.test(n) && !/\.test\./.test(n)) ut.push(p)
  }
  return ut
}

const traffar: string[] = []
for (const d of SOKT) {
  for (const f of filer(join(ROT, d))) {
    const rel = relative(ROT, f).replace(/\\/g, '/')
    if (rel.startsWith('components/design/')) continue
    const src = readFileSync(f, 'utf8')
    for (const m of Array.from(src.matchAll(NAMN))) traffar.push(`${rel}:${m[1]}`)
  }
}

describe('byggstenar i components/design', () => {
  it('ingen egen function Sektion/Grupp/Ikon utanför components/design (utom de inventerade undantagen)', () => {
    const nya = traffar.filter(t => !(t in UNDANTAG))
    expect(nya, `Importera från components/design i stället:\n${nya.join('\n')}`).toEqual([])
  })
  it('undantagslistan är aktuell — ett undantag som försvunnit tas bort här', () => {
    const kvar = Object.keys(UNDANTAG).filter(k => !traffar.includes(k))
    expect(kvar).toEqual([])
  })
  it('EN Ikon, EN Sektion, EN Svarsrad i components/design', () => {
    for (const n of ['Ikon', 'Sektion', 'Svarsrad']) {
      expect(statSync(join(ROT, 'components/design', `${n}.tsx`)).isFile(), n).toBe(true)
    }
  })
})
