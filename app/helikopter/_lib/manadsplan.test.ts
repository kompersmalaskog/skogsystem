import { describe, expect, it } from 'vitest'
import fixtur from './__fixtures__/klar_2026-10-17.json'
import { lasKlar } from './klar'
import { planModell } from './manadsplan'
import { fmt } from './format'

const prod = () => lasKlar(structuredClone(fixtur))

describe('planModell (oktober, ur prod-fixturen)', () => {
  const m = planModell(prod(), { idag: '2026-10-17', kopierad: false })

  it('rubrik, undertitel och filnamn', () => {
    expect(m.rubrik).toBe('Oktober 2026')
    expect(m.undertitel).toBe('Plan · 17 oktober · Kompersmåla Skog')
    expect(m.filnamn).toBe('manadsplan-2026-10')
  })

  it('mot beställning: summa mot beställt per typ, orange när under, saknar-rad sist', () => {
    const slut = m.spar.find(s => s.typ === 'slutavverkning')!
    expect(slut.summaText).toBe(`${fmt(2739)} av ${fmt(5000)}`)
    expect(slut.orange).toBe(true)
    expect(slut.saknasText).toBe(`${fmt(2261)} m³fub saknar trakt`)
    expect(slut.trakter.map(t => [t.namn, t.saknarPrognos])).toEqual([['Mölleryd RP J-Hus', true], ['Skälviken RP J-Hus', false]])
  })

  it('förra månadens trakt utan kvar visar 0, inte "volym saknas"', () => {
    const gall = m.spar.find(s => s.typ === 'gallring')!
    expect(gall.trakter.find(t => t.namn.startsWith('Trestensdal'))!.volymText).toBe('0')
  })

  it('maskiner: klar-datum per maskin, orange efter månadens slut, "–" utan trakt', () => {
    const per = Object.fromEntries(m.maskiner.map(x => [x.namn, x.klar]))
    expect(per['Giant']).toEqual({ text: '29 okt', ton: 'normal' })
    expect(per['Elefant 26']).toEqual({ text: '12 nov', ton: 'orange' })
    expect(per['Wisent']).toEqual({ text: '–', ton: 'muted' })
  })

  it('rutnätet börjar på planens start (idag i innevarande månad) och sträcker sig till sista klar-datum', () => {
    expect(m.dagar[0]).toBe('2026-10-17')
    expect(m.dagar[m.dagar.length - 1]).toBe('2026-11-12')
  })

  it('att göra: dagar som saknas (ingen flytt räcker — Wisent skulle också bli sen), trakter utan prognos, volym utan trakt; "Vida bekräftad" bara efter "Samma som"', () => {
    expect(m.attGora).toContain('Elefanten: 9 dagar saknas')
    expect(m.attGora.some(r => r.startsWith('Flytta '))).toBe(false)
    expect(m.attGora.find(r => r.startsWith('5 trakter saknar prognos: '))).toContain('Mölleryd RP J-Hus')
    expect(m.attGora.some(r => r.startsWith('Slutavverkning: ') && r.endsWith('saknar trakt'))).toBe(true)
    expect(m.attGora).not.toContain('Vida: beställning bekräftad?')
    expect(planModell(prod(), { idag: '2026-10-17', kopierad: true }).attGora.at(-1)).toBe('Vida: beställning bekräftad?')
  })

  it('sidfoten', () => {
    expect(m.sidfot).toBe('Prognos per trakt ur planeringsverktyget · dagar = uppmätt G15 per arbetsdag, 12 mån · ledighet borträknad')
  })
})
