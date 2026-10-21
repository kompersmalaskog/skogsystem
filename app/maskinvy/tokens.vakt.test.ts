/**
 * Maskinvyn ?ny=1 är klädd mot lib/design/tokens (PR 1, 2026-10-21). Den här vakten håller det så:
 * inga egna färger, textstorlekar, vikter, radier eller typsnitt, ingen egen palett (`C`) och kolumnen kommer
 * från `kolumnRot`, inte från en handskriven maxbredd. design-lint larmar bara på ÄNDRADE rader; vakten läser
 * hela filerna, så ett värde som smugit sig in på en gammal rad syns också.
 *
 * Utanför, med skäl: Jamforelse.tsx och MaskinLogg.tsx delas med den äldre vyn ("den äldre vyn är orörd").
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const DIR = __dirname
const FILER = [
  'OversiktNy', 'OversiktShared', 'IdagNy', 'ProduktionNy', 'AvbrottNy', 'KapacitetNy', 'TradslagKort', 'FlertradKort',
  'OperatorDeepView', 'VolymDeepView', 'SkotareOversiktNy', 'SkotareProduktionNy', 'SkotareAvbrottNy', 'SkotareIdagNy',
  'SkotareJamforelseNy', 'SpecialBadge', 'SortimentKort', 'Livestatus', 'page',
]

/** Källan utan kommentarer, rad för rad (kommentarer får nämna hexvärden och gamla px). */
function kalla(fil: string): { rad: number; text: string }[] {
  const s = readFileSync(path.join(DIR, fil + '.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  return s.split('\n').map((text, i) => ({ rad: i + 1, text: text.replace(/(^|[^:"'`])\/\/.*$/, '$1') }))
}

function fynd(re: RegExp): string[] {
  const ut: string[] = []
  for (const f of FILER) for (const { rad, text } of kalla(f)) if (re.test(text)) ut.push(`${f}.tsx:${rad}: ${text.trim().slice(0, 100)}`)
  return ut
}

describe('maskinvyn mot tokens', () => {
  it('inga hexfärger — allt går via FARG', () => {
    expect(fynd(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/)).toEqual([])
  })

  it('ingen egen palett: varken `C.x` eller en egen `FONT`', () => {
    expect(fynd(/\bC\.[a-z]+\b/)).toEqual([])
    expect(fynd(/\bexport const (C|FONT)\b|\bconst (C|FONT)\s*=/)).toEqual([])
  })

  it('textstorlek och vikt är tokens, aldrig tal (fontWeight 500 finns inte)', () => {
    expect(fynd(/fontSize:\s*\d/)).toEqual([])
    expect(fynd(/fontWeight:\s*[^,}]*\b\d{3}\b/)).toEqual([])
  })

  it('radie är RADIE.*, aldrig tal', () => {
    expect(fynd(/borderRadius:\s*\d/)).toEqual([])
  })

  it('avstånd ligger på skalan 0/4/8/12/16/24/32', () => {
    const skala = new Set([0, 4, 8, 12, 16, 24, 32])
    const fel: string[] = []
    const re = /\b(?:gap|padding(?:Top|Bottom|Left|Right)?|margin(?:Top|Bottom|Left|Right)?):\s*(-?\d+)(?=\s*[,}])/g
    for (const f of FILER) for (const { rad, text } of kalla(f)) for (const m of text.matchAll(re)) {
      if (!skala.has(Math.abs(Number(m[1])))) fel.push(`${f}.tsx:${rad}: ${m[0]}`)
    }
    expect(fel).toEqual([])
  })

  it('kolumnen kommer från kolumnRot — ingen handskriven maxbredd 720', () => {
    expect(fynd(/maxWidth:\s*720\b/)).toEqual([])
    const antal = FILER.reduce((n, f) => n + kalla(f).filter(r => r.text.includes("kolumnRot('smal')")).length, 0)
    expect(antal).toBeGreaterThanOrEqual(12)
  })

  it('SKARPA i design-lint innehåller alla filerna (så nya literaler fäller CI)', () => {
    const lint = readFileSync(path.join(DIR, '../../scripts/design-lint.mjs'), 'utf8')
    for (const f of FILER) expect(lint, f).toContain(`"app/maskinvy/${f}.tsx"`)
  })
})
