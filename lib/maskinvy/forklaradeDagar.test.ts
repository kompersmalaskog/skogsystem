import { describe, it, expect } from 'vitest'
import { forklaraTommaDagar, forklaringsRader, periodText, type Forklaring, type ForklaringsUnderlag, type MaskindagRad } from './forklaradeDagar'
import { manaderI } from './forklaradeDagarLasning'

const SCORPION = 'PONS20SDJAA270231'
const rad = (maskin_id: string, datum: string, status: string, orsak: string | null = null): MaskindagRad => ({ maskin_id, datum, status, orsak })
const underlag = (o: Partial<ForklaringsUnderlag>): ForklaringsUnderlag => ({ maskinIds: [SCORPION], manuella: [], rader: [], ledighet: [], ...o })
const ingenProd = new Set<string>()

describe('forklaraTommaDagar — Scorpion 14–16 oktober 2026 (Stefans semester)', () => {
  const u = underlag({
    rader: ['2026-10-14', '2026-10-15', '2026-10-16'].map(d => rad(SCORPION, d, 'planerat', 'ledig:Stefan')),
    ledighet: [{ maskin_id: SCORPION, typ: 'semester', startdatum: '2026-10-14', slutdatum: '2026-10-16' }],
  })
  it('semester visas som Semester', () => {
    const f = forklaraTommaDagar(u, ingenProd)
    expect(Object.keys(f)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16'])
    expect(f['2026-10-15']).toEqual({ slag: 'semester', text: 'Semester', detalj: null })
  })
  it('alla andra typer visas bara som Ledig — sjuk avslöjas aldrig', () => {
    for (const typ of ['sjuk', 'vab', 'foraldraledig', 'atk', 'tjanstledig', 'komp', 'permission']) {
      const f = forklaraTommaDagar(underlag({ ...u, ledighet: [{ maskin_id: SCORPION, typ, startdatum: '2026-10-14', slutdatum: '2026-10-16' }] }), ingenProd)
      expect(f['2026-10-15']).toEqual({ slag: 'ledig', text: 'Ledig', detalj: null })
    }
  })
  it('semester + annan ledighet samma dag (två förare) är Ledig, inte Semester', () => {
    const f = forklaraTommaDagar(underlag({ ...u, ledighet: [
      { maskin_id: SCORPION, typ: 'semester', startdatum: '2026-10-14', slutdatum: '2026-10-16' },
      { maskin_id: SCORPION, typ: 'sjuk', startdatum: '2026-10-15', slutdatum: '2026-10-15' },
    ] }), ingenProd)
    expect(f['2026-10-14'].text).toBe('Semester')
    expect(f['2026-10-15'].text).toBe('Ledig')
  })
  it('en dag MED produktion visas alltid som produktion, oavsett ledighet', () => {
    const f = forklaraTommaDagar(u, new Set(['2026-10-15']))
    expect(f['2026-10-15']).toBeUndefined()
    expect(f['2026-10-14'].text).toBe('Semester')
  })
  it('ledighet utan att helikopterfunktionen räknar dagen (helg, röd dag) förklaras inte', () => {
    const f = forklaraTommaDagar(underlag({ ledighet: u.ledighet }), ingenProd)
    expect(f).toEqual({})
  })
  it('planerat men typen saknas i underlaget → Ledig (aldrig Semester på gissning)', () => {
    const f = forklaraTommaDagar(underlag({ rader: u.rader }), ingenProd)
    expect(f['2026-10-15'].text).toBe('Ledig')
  })
})

describe('forklaraTommaDagar — stopp, okända dagar, manuell maskin, kombon', () => {
  it('registrerat stopp visas som Stopp med orsaken som detalj', () => {
    const f = forklaraTommaDagar(underlag({ rader: [rad(SCORPION, '2026-07-06', 'registrerat', 'registrerat:semesterstopp')] }), ingenProd)
    expect(f['2026-07-06']).toEqual({ slag: 'stopp', text: 'Stopp', detalj: 'Semesterstopp' })
  })
  it('oförklarad dag och orapporterad dag får ingen förklaring', () => {
    const f = forklaraTommaDagar(underlag({ rader: [rad(SCORPION, '2026-10-05', 'oforklarat'), rad(SCORPION, '2026-10-06', 'orapporterat'), rad(SCORPION, '2026-10-07', 'kord'), rad(SCORPION, '2026-10-26', 'arbetsdag')] }), ingenProd)
    expect(f).toEqual({})
  })
  it('manuell maskin (810E) förklaras aldrig, inte ens med ledighet och stopp', () => {
    const f = forklaraTommaDagar(underlag({
      maskinIds: ['810E'], manuella: ['810E'],
      rader: [rad('810E', '2026-10-14', 'planerat', 'ledig:Oscar'), rad('810E', '2026-10-15', 'registrerat', 'registrerat:x')],
      ledighet: [{ maskin_id: '810E', typ: 'semester', startdatum: '2026-10-14', slutdatum: '2026-10-14' }],
    }), ingenProd)
    expect(f).toEqual({})
  })
  it('rader för andra maskiner än de som visas räknas inte', () => {
    const f = forklaraTommaDagar(underlag({ rader: [rad('R64428', '2026-10-14', 'planerat', 'ledig:Oskar')] }), ingenProd)
    expect(f).toEqual({})
  })
  const KOMBO = ['R64101', 'R64428']
  it('kombo: förklaras bara när alla maskinerna har SAMMA kända orsak', () => {
    const lg = [
      { maskin_id: 'R64101', typ: 'semester', startdatum: '2026-10-14', slutdatum: '2026-10-14' },
      { maskin_id: 'R64428', typ: 'semester', startdatum: '2026-10-14', slutdatum: '2026-10-14' },
    ]
    const rader = [
      rad('R64101', '2026-10-14', 'planerat'), rad('R64428', '2026-10-14', 'planerat'),
      rad('R64101', '2026-10-15', 'planerat'), rad('R64428', '2026-10-15', 'oforklarat'),
      rad('R64101', '2026-10-16', 'planerat'), rad('R64428', '2026-10-16', 'registrerat', 'registrerat:service'),
    ]
    const f = forklaraTommaDagar(underlag({ maskinIds: KOMBO, rader, ledighet: lg }), ingenProd)
    expect(f['2026-10-14'].text).toBe('Semester')
    expect(f['2026-10-15']).toBeUndefined()   // en maskin utan känd orsak
    expect(f['2026-10-16']).toBeUndefined()   // blandade orsaker
  })
})

describe('manaderI', () => {
  it('en månad, två månader (vecka över månadsskifte) och kvartal över årsskifte', () => {
    expect(manaderI('2026-10-01', '2026-10-31')).toEqual([{ ar: 2026, manad: 10 }])
    expect(manaderI('2026-09-28', '2026-10-04')).toEqual([{ ar: 2026, manad: 9 }, { ar: 2026, manad: 10 }])
    expect(manaderI('2026-11-30', '2027-01-02')).toEqual([{ ar: 2026, manad: 11 }, { ar: 2026, manad: 12 }, { ar: 2027, manad: 1 }])
  })
})

describe('forklaringsRader — raderna under kalendern', () => {
  const sem: Forklaring = { slag: 'semester', text: 'Semester', detalj: null }
  const ledig: Forklaring = { slag: 'ledig', text: 'Ledig', detalj: null }
  const stopp: Forklaring = { slag: 'stopp', text: 'Stopp', detalj: 'Service' }
  const alla = (...d: string[]) => d
  it('dagar i följd blir EN rad; en dag med produktion emellan bryter', () => {
    const f = { '2026-10-14': sem, '2026-10-16': sem }
    expect(forklaringsRader(f, alla('2026-10-14', '2026-10-15', '2026-10-16')).map(r => `${r.text} ${r.period}`)).toEqual(['Semester 14 okt', 'Semester 16 okt'])
    const g = { '2026-10-14': sem, '2026-10-15': sem, '2026-10-16': sem }
    expect(forklaringsRader(g, alla('2026-10-14', '2026-10-15', '2026-10-16')).map(r => `${r.text} ${r.period}`)).toEqual(['Semester 14–16 okt'])
  })
  it('fredag och måndag hör ihop över helgen, men inte över en vardag', () => {
    const f = { '2026-10-09': sem, '2026-10-12': sem }
    expect(forklaringsRader(f, alla('2026-10-09', '2026-10-12')).map(r => r.period)).toEqual(['9–12 okt'])
    const g = { '2026-10-08': sem, '2026-10-12': sem }
    expect(forklaringsRader(g, alla('2026-10-08', '2026-10-12')).map(r => r.period)).toEqual(['8 okt', '12 okt'])
  })
  it('olika förklaringar blir olika rader, stoppets orsak hålls isär', () => {
    const f = { '2026-10-14': sem, '2026-10-15': ledig, '2026-10-19': stopp, '2026-10-20': { ...stopp, detalj: 'Annat' } }
    expect(forklaringsRader(f, alla('2026-10-14', '2026-10-15', '2026-10-19', '2026-10-20')).map(r => `${r.text} ${r.period}`))
      .toEqual(['Semester 14 okt', 'Ledig 15 okt', 'Stopp 19 okt', 'Stopp 20 okt'])
  })
  it('månadsskifte och dagar utanför kalendern', () => {
    expect(periodText('2026-09-30', '2026-10-02')).toBe('30 sep–2 okt')
    const f = { '2026-09-30': sem, '2026-10-01': sem, '2026-11-20': sem }
    expect(forklaringsRader(f, alla('2026-09-30', '2026-10-01')).map(r => r.period)).toEqual(['30 sep–1 okt'])
  })
})
