import { describe, expect, it } from 'vitest'
import {
  datumText, langdText, lokalDag, maskinSvar, manadRubrik, nyPost, perManad, postDetalj, postRubrik, postTyp,
  radUnder, saknas, senastText, slaIhop, type ServicePost,
} from './servicelogg'

// Raderna är prod-formade (maskin_service 2026-10-21, kalla = 'mom' utom där annat står).
const post = (p: Partial<ServicePost>): ServicePost => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  maskin_id: 'wisent', del: null, kategori: 'ovrigt', beskrivning: null, timmar: null, datum: '2026-10-21',
  kalla: 'mom', ...p,
})

const bandPaBak = (id: string, sek: number) => post({
  id, del: '-', delsystem: 'Carrier', underorsak: 'Mechanical', detalj: 'Tracks and chains',
  beskrivning: 'band på bak', reservdel_namn: '-', reservdel_antal: 1, langd_sek: sek,
})

describe('typ', () => {
  it('band ur detaljen, också när föraren skrev något annat', () => {
    expect(postTyp(bandPaBak('a', 10))).toBe('band')
    expect(postTyp(post({ detalj: 'Tracks and chains', delsystem: 'Carrier', beskrivning: 'Carrier: Tracks and chains' }))).toBe('band')
    expect(postTyp(post({ beskrivning: 'Band på o risgrip', detalj: 'Tracks and chains' }))).toBe('band')
  })
  it('däck ur kategorin, texten eller luft', () => {
    expect(postTyp(post({ kategori: 'punktering', kalla: 'manuell' }))).toBe('dack')
    expect(postTyp(post({ beskrivning: 'Punktering vänster back längst fram på boggin', underorsak: 'Air' }))).toBe('dack')
  })
  it('service bara ur kategorin', () => {
    expect(postTyp(post({ kategori: 'service', kalla: 'manuell' }))).toBe('service')
  })
  it('koppla vagn och hjälpstart är underhåll, inte reparation', () => {
    expect(postTyp(post({ beskrivning: 'koppla av vagn', detalj: 'Miscellaneous' }))).toBe('underhall')
    expect(postTyp(post({ beskrivning: 'hjälpstart' }))).toBe('underhall')
  })
  it('resten är reparation', () => {
    expect(postTyp(post({ kategori: 'hydraulik', beskrivning: 'slang i knä V-yttre' }))).toBe('reparation')
    expect(postTyp(post({ delsystem: 'HarvestingHead', detalj: 'Saw unit', beskrivning: 'HarvestingHead: Saw unit' }))).toBe('reparation')
  })
})

describe('rubrik', () => {
  it('förarens egen text, med stor bokstav', () => {
    expect(postRubrik(bandPaBak('a', 1))).toBe('Band på bak')
  })
  it('maskinens autotext blir svensk detalj', () => {
    expect(postRubrik(post({ delsystem: 'HarvestingHead', detalj: 'Measuring devices', beskrivning: 'HarvestingHead: Measuring devices' }))).toBe('Mätutrustning')
    expect(postRubrik(post({ delsystem: 'Carrier', detalj: 'Hose (pipe)', beskrivning: 'Carrier: Hose (pipe)' }))).toBe('Hydraulslang')
    expect(postRubrik(post({ delsystem: 'Carrier', detalj: 'Fire extinguisher', beskrivning: 'Carrier: Fire extinguisher' }))).toBe('Brandsläckare')
  })
  it('övrigt utan text: delsystemet säger var', () => {
    expect(postRubrik(post({ delsystem: 'Carrier', detalj: 'Miscellaneous', beskrivning: 'Carrier: Miscellaneous' }))).toBe('Maskin, övrigt')
  })
  it('ett ord säger inte vad: detaljen sätts före (prod: "Byte" på gripen)', () => {
    expect(postRubrik(post({ kategori: 'kran', beskrivning: 'Byte', delsystem: 'LoaderLinkage', detalj: 'Grapple' }))).toBe('Grip – byte')
    expect(postRubrik(post({ beskrivning: 'Band', delsystem: 'Carrier', detalj: 'Tracks and chains' }))).toBe('Band')
    expect(postRubrik(post({ beskrivning: 'Montering', delsystem: 'Carrier', detalj: 'Miscellaneous' }))).toBe('Montering')
  })
  it('detaljen upprepar inte rubriken (prod: "slang i knä V-yttre" med reservdel "slang")', () => {
    expect(postDetalj(post({ kategori: 'hydraulik', beskrivning: 'slang i knä V-yttre', del: 'slang', reservdel_namn: 'slang', delsystem: 'LoaderLinkage', detalj: 'Hose (pipe)' }))).toBeNull()
  })
  it('helt tom post: typen', () => {
    expect(postRubrik(post({ delsystem: 'Other' }))).toBe('Reparation')
  })
  it('ingen engelska kvar i någon rubrik ur prod-datans autotexter', () => {
    const autotexter = ['Tracks and chains', 'Hose (pipe)', 'Saw unit', 'Measuring devices', 'Color marking', 'Grapple', 'Pipes (hoses)',
      'Delimbing knives', 'Fire extinguisher', 'Harnesses', 'Working lights', 'Hydraulic cylinder', 'Chain tensioner', 'Feed roller arms', 'Solenoide']
    for (const d of autotexter) {
      const r = postRubrik(post({ delsystem: 'Carrier', detalj: d, beskrivning: `Carrier: ${d}` }))
      expect(r, d).not.toMatch(/[A-Za-z]+ (and|of) |Carrier|Hose|Saw|Tracks/)
    }
  })
})

describe('detalj', () => {
  it('reservdelen när den säger något mer', () => {
    expect(postDetalj(post({ beskrivning: 'Band på o risgrip', reservdel_namn: 'snabbfäste risgrip', del: 'snabbfäste risgrip' }))).toBe('snabbfäste risgrip')
  })
  it('inget för "-", ovrigt eller samma som texten', () => {
    expect(postDetalj(bandPaBak('a', 1))).toBeNull()
    expect(postDetalj(post({ del: 'ovrigt' }))).toBeNull()
    expect(postDetalj(post({ beskrivning: 'Knutkors', del: 'Knutkors', reservdel_namn: 'Knutkors' }))).toBeNull()
  })
  it('hjulet vid däck', () => {
    expect(postDetalj(post({ kategori: 'punktering', del: 'H2', beskrivning: 'Lagat', kalla: 'manuell' }))).toBe('hjul H2')
  })
})

describe('slå ihop', () => {
  it('samma sak samma dag = en rad, tiden summerad (prod: band på bak 2925 + 973 s den 21 okt)', () => {
    const r = slaIhop([bandPaBak('a', 2925), bandPaBak('b', 973)])
    expect(r).toHaveLength(1)
    expect(r[0].antal).toBe(2)
    expect(r[0].langdSek).toBe(3898)
    expect(langdText(r[0].langdSek)).toBe('1 tim 5 min')
    expect(radUnder(r[0])).toBe('Band · 2 gånger · från maskinen')
  })
  it('olika dagar, olika saker eller olika maskiner slås aldrig ihop', () => {
    const r = slaIhop([
      bandPaBak('a', 10),
      { ...bandPaBak('b', 10), datum: '2026-10-20' },
      { ...bandPaBak('c', 10), maskin_id: 'giant' },
      post({ id: 'd', beskrivning: 'Band av', detalj: 'Tracks and chains' }),
    ])
    expect(r).toHaveLength(4)
  })
  it('nyast först', () => {
    const r = slaIhop([post({ id: 'gammal', datum: '2026-08-01' }), post({ id: 'ny', datum: '2026-10-01', beskrivning: 'x' })])
    expect(r.map(x => x.id)).toEqual(['ny', 'gammal'])
  })
  it('perManad håller ordningen', () => {
    const r = slaIhop([post({ datum: '2026-10-02', beskrivning: 'a' }), post({ datum: '2026-10-01', beskrivning: 'b' }), post({ datum: '2026-09-30', beskrivning: 'c' })])
    expect(perManad(r).map(g => [g.manad, g.rader.length])).toEqual([['2026-10', 2], ['2026-09', 1]])
  })
})

describe('text', () => {
  it('datum', () => {
    expect(datumText('2026-10-21', '2026-10-21')).toBe('idag')
    expect(datumText('2026-10-20', '2026-10-21')).toBe('igår')
    expect(datumText('2026-09-01', '2026-10-21')).toBe('1 sep')
    expect(datumText('2025-03-04', '2026-10-21')).toBe('4 mar 2025')
  })
  it('månad', () => {
    expect(manadRubrik('2026-10', 2026)).toBe('Oktober')
    expect(manadRubrik('2025-12', 2026)).toBe('December 2025')
  })
  it('längd', () => {
    expect(langdText(null)).toBeNull()
    expect(langdText(30)).toBeNull()
    expect(langdText(1758)).toBe('29 min')
    expect(langdText(7200)).toBe('2 tim')
  })
  it('lokal dag är svensk tid, inte UTC (strax efter midnatt)', () => {
    expect(lokalDag(new Date('2026-10-21T22:30:00Z'))).toBe('2026-10-22')
  })
  it('maskinens svar', () => {
    const rader = slaIhop([bandPaBak('a', 10), post({ id: 's', kategori: 'service', kalla: 'manuell', beskrivning: '500 h', datum: '2026-03-30' })])
    expect(maskinSvar(rader, '2026-10-21')).toEqual({ rubrik: 'Senaste service 30 mar', rad: 'Senast: band på bak · idag' })
    expect(maskinSvar(slaIhop([bandPaBak('a', 10)]), '2026-10-21').rubrik).toBe('Ingen service registrerad')
    expect(senastText([], '2026-10-21')).toBe('Inget registrerat')
  })
})

describe('formuläret', () => {
  const falt = { beskrivning: 'Bytt olja', datum: '2026-10-21', timmar: '', hjul: null }
  it('service kräver timmätaren, inget annat gör det', () => {
    expect(saknas('service', falt)).toEqual(['timmätaren'])
    expect(saknas('service', { ...falt, timmar: '4 512,5'.replace(' ', '') })).toEqual([])
    expect(saknas('reparation', falt)).toEqual([])
    expect(saknas('band', falt)).toEqual([])
  })
  it('däck kräver hjulet', () => {
    expect(saknas('dack', falt)).toEqual(['vilket hjul'])
    expect(saknas('dack', { ...falt, hjul: 'H2' })).toEqual([])
  })
  it('kategorin följer tabellens CHECK — aldrig "band"', () => {
    const tillatna = ['service', 'hydraulik', 'slang', 'punktering', 'motor', 'kran', 'aggregat', 'elektrisk', 'ovrigt']
    for (const typ of ['service', 'reparation', 'band', 'dack', 'underhall'] as const) {
      const p = nyPost(typ, { beskrivning: 'x', datum: '2026-10-21', timmar: 1, hjul: 'H1' })
      expect(tillatna).toContain(p.kategori)
      expect(p.kalla).toBe('manuell')
    }
  })
  it('en sparad bandpost läses tillbaka som band, en däckpost som däck med hjulet', () => {
    const band = { id: 'x', maskin_id: 'm', ...nyPost('band', { beskrivning: 'band på', datum: '2026-10-21', timmar: null, hjul: null }) } as ServicePost
    expect(postTyp(band)).toBe('band')
    const dack = { id: 'y', maskin_id: 'm', ...nyPost('dack', { beskrivning: 'Lagat', datum: '2026-10-21', timmar: null, hjul: 'H2' }) } as ServicePost
    expect(postTyp(dack)).toBe('dack')
    expect(postDetalj(dack)).toBe('hjul H2')
  })
})
