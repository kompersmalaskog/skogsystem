import { describe, it, expect } from 'vitest'
import { livestatus, importhalsa, datumKort, dagarMellan, stockholmDag } from './livestatus'

const NU = new Date('2026-10-21T14:00:00Z').getTime()
const fore = (min: number) => new Date(NU - min * 60000).toISOString()
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })

describe('livestatus — samma regler som Idag', () => {
  it('idag: signalens ålder avgör nivån (grön < 20, gul 20–60, grå > 60)', () => {
    const f = (min: number) => ({ senasteDatum: '2026-10-21', signalIso: fore(min), daysDiff: 0 })
    expect(livestatus(f(4), NU, hhmm)).toEqual({ niva: 'aktiv', text: 'Aktiv nu · senaste signal för 4 min sedan', idag: true })
    expect(livestatus(f(30), NU, hhmm).niva).toBe('sen')
    expect(livestatus(f(90), NU, hhmm)).toMatchObject({ niva: 'inget', idag: true })
  })
  it('idag utan tid: påstår aldrig "Aktiv nu"', () => {
    const s = livestatus({ senasteDatum: '2026-10-21', signalIso: null, daysDiff: 0 }, NU, hhmm)
    expect(s.niva).toBe('saknas')
    expect(s.text).not.toContain('Aktiv nu')
  })
  it('inte idag: datum och "igår"/"N dagar sedan", ingen färgad nivå', () => {
    expect(livestatus({ senasteDatum: '2026-10-20', signalIso: fore(1000), daysDiff: 1 }, NU, hhmm))
      .toEqual({ niva: null, text: 'Senaste körning: 20 okt · igår', idag: false })
    expect(livestatus({ senasteDatum: '2026-10-14', signalIso: fore(9000), daysDiff: 7 }, NU, hhmm).text)
      .toBe('Senaste körning: 14 okt · 7 dagar sedan')
  })
})

describe('importhalsa — senaste fil, samma gränser', () => {
  it('under 20 min grön, 20–60 gul, över 60 grå', () => {
    expect(importhalsa(fore(5), 'OK', NU, hhmm)).toEqual({ niva: 'aktiv', text: 'Filer in · senaste för 5 min sedan' })
    expect(importhalsa(fore(40), 'OK', NU, hhmm)).toEqual({ niva: 'sen', text: 'Senaste fil för 40 min sedan' })
    expect(importhalsa(fore(61), 'OK', NU, hhmm)).toEqual({ niva: 'inget', text: 'Ingen fil sedan 14:59' })
  })
  it('gränserna är exakt de i Idag: 19 min grön, 20 gul, 60 gul, 61 grå', () => {
    expect(importhalsa(fore(19), 'OK', NU, hhmm).niva).toBe('aktiv')
    expect(importhalsa(fore(20), 'OK', NU, hhmm).niva).toBe('sen')
    expect(importhalsa(fore(60), 'OK', NU, hhmm).niva).toBe('sen')
    expect(importhalsa(fore(61), 'OK', NU, hhmm).niva).toBe('inget')
  })
  it('en fil från en annan dag får datum, inte bara klockslag', () => {
    expect(importhalsa(fore(30 * 60), 'OK', NU, hhmm).text).toBe('Ingen fil sedan 20 okt 10:00')
  })
  it('en misslyckad import är ett fel som sägs, aldrig grön', () => {
    const s = importhalsa(fore(2), 'FEL', NU, hhmm)
    expect(s.niva).toBe('fel')
    expect(s.text).toBe('Senaste filen gav importfel · 15:58')
  })
  it('ingen fil alls eller ogiltig tid', () => {
    expect(importhalsa(null, 'OK', NU, hhmm)).toEqual({ niva: 'saknas', text: 'Ingen fil importerad' })
    expect(importhalsa('skräp', 'OK', NU, hhmm).niva).toBe('saknas')
  })
})

describe('datum', () => {
  it('datumKort, dagarMellan och stockholmDag', () => {
    expect(datumKort('2026-10-20')).toBe('20 okt')
    expect(dagarMellan('2026-10-20', '2026-10-21')).toBe(1)
    expect(dagarMellan('2026-03-28', '2026-03-30')).toBe(2)          // över sommartidsbytet
    expect(stockholmDag(new Date('2026-10-20T22:30:00Z').getTime())).toBe('2026-10-21')   // 00:30 svensk tid
  })
})
