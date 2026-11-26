import { describe, it, expect } from 'vitest'
import { bolagVy } from './bolagText'
import { fmt } from './format'

describe('Per bolag — orden', () => {
  it('pågående: prognosen avgör "räcker" eller "fattas"', () => {
    expect(bolagVy({ lovat: 3800, skotat: 3120, prognos: 3900 }, true)).toMatchObject({ ord: `Ser ut att bli ${fmt(3900)} · räcker`, ton: 'bra' })
    expect(bolagVy({ lovat: 1000, skotat: 840, prognos: 940 }, true)).toMatchObject({ ord: 'Ser ut att bli 940 · fattas 60', ton: 'brist', hoger: `840 av ${fmt(1000)}` })
  })
  it('klart: skotat ≥ beställt, med det som är över', () => {
    expect(bolagVy({ lovat: 200, skotat: 260, prognos: 260 }, true)).toMatchObject({ ord: 'Klart · 60 över', andel: 1 })
    expect(bolagVy({ lovat: 200, skotat: 200, prognos: 200 }, true).ord).toBe('Klart')
  })
  it('avslutad månad (ingen prognos): det som blev, inget gissat', () => {
    expect(bolagVy({ lovat: 500, skotat: 430, prognos: 430 }, false)).toMatchObject({ ord: 'Fattade 70', prognosAndel: null })
  })
  it('utan beställning: bara skotat, ingen stapel', () => {
    expect(bolagVy({ lovat: 0, skotat: 90, prognos: 90 }, true)).toEqual({ hoger: '90', ord: 'Ingen beställning', ton: 'neutral', andel: null, prognosAndel: null })
  })
})
