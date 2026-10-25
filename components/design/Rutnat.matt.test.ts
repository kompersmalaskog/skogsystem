import { describe, expect, it } from 'vitest'
import * as schema from '@/app/ledighet/_components/schemaMatt'
import * as rutnat from './rutnatMatt'
import { readFileSync } from 'node:fs'

// Rutnat är lyft ur Ledighetens Schema: samma mått. Ändras ett mått i Schemat ska Rutnat följa med (eller tvärtom) — testet fäller annars.
describe('Rutnat har Schemats mått', () => {
  it('namnkolumn, dagkolumn, rubrikrad, rad- och avdelarhöjd', () => {
    expect(rutnat.NAMN_W).toBe(schema.NAMN_W)
    expect(rutnat.DAG_MIN_W).toBe(schema.DAG_MIN_W)
    expect(rutnat.HUVUD_H).toBe(schema.HUVUD_H)
    expect(rutnat.RAD_H).toBe(schema.MASKIN_H)
    expect(rutnat.AVDELARE_H).toBe(schema.AVDELARE_H)
  })
  it('"mer åt höger" ger samma svar som Schemats', () => {
    for (const [l, c, w] of [[0, 300, 300], [0, 300, 301], [0, 300, 302], [100, 300, 400], [101, 300, 400], [500, 300, 800]] as const) {
      expect(rutnat.merAttSeAtHoger(l, c, w)).toBe(schema.merAttSeAtHoger(l, c, w))
    }
  })
  it('ritar med samma byggdelar som SchemaVy: IDAG-flik, inverterat datum, dagens ram, tonad helg, tonad högerkant', () => {
    const k = readFileSync(new URL('./Rutnat.tsx', import.meta.url), 'utf8')
    const s = readFileSync(new URL('../../app/ledighet/_components/SchemaVy.tsx', import.meta.url), 'utf8')
    // Dagens ram: 2 px, vit, genom hela kolumnen — samma uttryck i båda
    expect(k).toContain("borderLeft: `2px solid ${FARG.text}`, borderRight: `2px solid ${FARG.text}`")
    expect(s).toContain("borderLeft: `2px solid ${FARG.text}`, borderRight: `2px solid ${FARG.text}`")
    for (const bit of ['background: arIdag ? FARG.text : \'transparent\'', "fontWeight: arIdag ? VIKT.fet : VIKT.normal", 'background: FARG.text, color: FARG.bg', "width: AVSTAND.xxl, pointerEvents: 'none'", 'FARG.fyllning', 'FARG.tonad']) {
      expect(k, bit).toContain(bit)
      expect(s, bit).toContain(bit)
    }
  })
  it('dagbredd: fyller rutan men aldrig smalare än DAG_MIN_W', () => {
    expect(rutnat.dagBreddFor(1120, 28)).toBeCloseTo((1120 - rutnat.NAMN_W) / 28)
    expect(rutnat.dagBreddFor(1120, 40)).toBe(rutnat.DAG_MIN_W)
    expect(rutnat.dagBreddFor(0, 10)).toBe(rutnat.DAG_MIN_W)
    // en sida som visar en hel månad kan ta lägre minimum
    expect(rutnat.dagBreddFor(796, 27, 20)).toBeCloseTo((796 - rutnat.NAMN_W) / 27)
    expect(rutnat.dagBreddFor(300, 27, 20)).toBe(20)
  })
})
