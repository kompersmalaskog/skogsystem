import { describe, expect, it } from 'vitest'
import { arbetarRad, maskinAlder } from './maskinAlder'

const nu = new Date('2026-11-13T13:00:00Z')   // 14:00 svensk tid
const for_ = (s: number) => new Date(nu.getTime() - s * 1000).toISOString()

describe('maskinAlder', () => {
  it('färsk punkt är "nu"', () => {
    expect(maskinAlder(for_(20), nu)).toEqual({ text: 'nu', gammal: false })
    expect(maskinAlder(for_(120), nu)).toEqual({ text: 'nu', gammal: false })
  })
  it('efter två minuter står klockslaget i svensk tid, inte "nu"', () => {
    expect(maskinAlder(for_(180), nu)).toEqual({ text: 'senast här 13:57', gammal: false })
  })
  it('efter tio minuter är pricken gammal', () => {
    expect(maskinAlder(for_(600), nu)).toEqual({ text: 'senast här 13:50', gammal: true })
    expect(maskinAlder(for_(3 * 3600), nu).gammal).toBe(true)
  })
  it('en tid som inte går att läsa är aldrig "nu"', () => {
    expect(maskinAlder(null, nu)).toEqual({ text: 'tid okänd', gammal: true })
    expect(maskinAlder('skräp', nu).gammal).toBe(true)
  })
  it('en klocka som går lite fel (punkten i framtiden) är "nu", inte ett negativt tal', () => {
    expect(maskinAlder(new Date(nu.getTime() + 5000).toISOString(), nu).text).toBe('nu')
  })
})

describe('arbetarRad', () => {
  it('inga maskiner → ingen rad', () => { expect(arbetarRad([], nu)).toBeNull() })
  it('en färsk maskin räcker för "arbetar här just nu"', () => {
    expect(arbetarRad([for_(3600), for_(30)], nu)).toEqual({ text: 'Maskinerna arbetar här just nu', farsk: true })
  })
  it('bara gamla prickar: sidan påstår inte att de arbetar nu', () => {
    const r = arbetarRad([for_(3600), for_(1800)], nu)!
    expect(r.farsk).toBe(false)
    expect(r.text).toBe('Maskinerna syntes här senast 13:30 – de kan vara kvar')
    expect(r.text).not.toContain('just nu')
  })
})
