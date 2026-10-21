import { describe, it, expect } from 'vitest'
import { aktivNuStatus, relativTid } from './aktivNu'

const NU = new Date('2026-10-21T14:00:00Z').getTime()
const fore = (min: number) => new Date(NU - min * 60000).toISOString()
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })

describe('aktivNuStatus', () => {
  it('under 20 min: grön "Aktiv nu" med relativ tid', () => {
    expect(aktivNuStatus(fore(4), NU, hhmm)).toEqual({ niva: 'aktiv', text: 'Aktiv nu · senaste signal för 4 min sedan' })
    expect(aktivNuStatus(fore(19), NU, hhmm).niva).toBe('aktiv')
    expect(aktivNuStatus(fore(0.2), NU, hhmm).text).toBe('Aktiv nu · senaste signal nyss')
  })
  it('20–60 min: gul "Senaste signal för X min sedan"', () => {
    expect(aktivNuStatus(fore(20), NU, hhmm)).toEqual({ niva: 'sen', text: 'Senaste signal för 20 min sedan' })
    expect(aktivNuStatus(fore(45), NU, hhmm).niva).toBe('sen')
    expect(aktivNuStatus(fore(60), NU, hhmm).niva).toBe('sen')   // 60 min är fortfarande gul
  })
  it('över 60 min: grå "Inget sedan HH:MM" — aldrig grön', () => {
    const s = aktivNuStatus(fore(61), NU, hhmm)
    expect(s.niva).toBe('inget')
    expect(s.text).toBe('Inget sedan 14:59')           // 12:59 UTC = 14:59 svensk sommartid
    expect(aktivNuStatus(fore(300), NU, hhmm).niva).toBe('inget')
  })
  it('tid saknas eller ogiltig: påstår aldrig "Aktiv nu"', () => {
    expect(aktivNuStatus(null, NU, hhmm).niva).toBe('saknas')
    expect(aktivNuStatus('inte-en-tid', NU, hhmm).niva).toBe('saknas')
    expect(aktivNuStatus(undefined, NU, hhmm).text).not.toContain('Aktiv nu')
  })
  it('signal i framtiden (klockskillnad) räknas som nyss, inte negativ tid', () => {
    expect(aktivNuStatus(fore(-3), NU, hhmm).text).toBe('Aktiv nu · senaste signal nyss')
  })
  it('relativTid', () => {
    expect(relativTid(5 * 60000)).toBe('5 min')
    expect(relativTid(65 * 60000)).toBe('1 h 5 min')
    expect(relativTid(120 * 60000)).toBe('2 h')
  })
})
