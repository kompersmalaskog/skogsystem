// @vitest-environment jsdom
/**
 * Maskinen som maskin — de rena reglerna: koden (hash, aldrig läsbar), vad som är öppet/låst/dolt, utgången upplåsning och vyregistret.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { arGiltigKod, kodPepparFinns, skapaHash, stammerKod } from './kod'
import { byggMaskinKodNotis, MASKIN_KOD_MAX_ALDER_MS } from './notis'
import {
  IDLE_MS, arDoldSokvag, arKartSokvag, arLastSokvag, lasUpplast, maskinUpplast, sattMaskinSession, sattUpplast, utgangen,
} from './upplast'
import { VYER, favoriterFor, grupperFor, sokVyer, vyerFor } from '@/lib/vyer'

describe('koden', () => {
  it('är exakt fyra siffror', () => {
    expect(['1234', '0000', '9999'].every(arGiltigKod)).toBe(true)
    expect(['123', '12345', 'abcd', '12 4', '', ' 123', 1234, null, undefined].some(arGiltigKod)).toBe(false)
  })
  it('sparas som hash med eget salt, aldrig som klartext, och kontrolleras mot hashen', () => {
    process.env.MASKIN_KOD_PEPPAR = 'test-peppar'
    const a = skapaHash('4711'), b = skapaHash('4711')
    expect(a.kod_hash).not.toContain('4711')
    expect(a.salt).not.toBe(b.salt)              // eget salt per person: samma kod ger olika hash
    expect(a.kod_hash).not.toBe(b.kod_hash)
    expect(stammerKod('4711', a)).toBe(true)
    expect(stammerKod('4712', a)).toBe(false)
    expect(stammerKod('', a)).toBe(false)
    process.env.MASKIN_KOD_PEPPAR = 'annan-peppar'  // en läckt databasrad räcker inte utan servern hemlighet
    expect(stammerKod('4711', a)).toBe(false)
  })
})

describe('peppar', () => {
  it('bara MASKIN_KOD_PEPPAR — service-nyckeln är ingen reserv (den ska kunna bytas utan att koderna slutar fungera)', () => {
    const a = process.env.MASKIN_KOD_PEPPAR, k = process.env.SUPABASE_SERVICE_ROLE_KEY
    try {
      process.env.MASKIN_KOD_PEPPAR = 'p1'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'nyckel-A'
      const rad = skapaHash('4711')
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'nyckel-B'               // nyckeln byts
      expect(stammerKod('4711', rad)).toBe(true)                        // koderna fungerar fortfarande
      delete process.env.MASKIN_KOD_PEPPAR
      expect(kodPepparFinns()).toBe(false)
      expect(() => skapaHash('4711')).toThrow(/MASKIN_KOD_PEPPAR/)      // aldrig tyst reserv
      expect(() => stammerKod('4711', rad)).toThrow(/MASKIN_KOD_PEPPAR/) // aldrig ett tyst "fel kod"
    } finally { if (a === undefined) delete process.env.MASKIN_KOD_PEPPAR; else process.env.MASKIN_KOD_PEPPAR = a; if (k === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = k }
  })
})

describe('notisen "Många fel koder"', () => {
  const p = { medarbetare_id: 'p1', namn: 'Oskar Nilsson', maskin_namn: 'H8E -26', till: '2026-11-20T18:00:00Z' }
  it('säger vem och var — aldrig något om koden', () => {
    const u = byggMaskinKodNotis({ payload: p, skapad_at: new Date().toISOString() })
    expect(u.typ).toBe('skicka')
    if (u.typ === 'skicka') { expect(u.meddelande.title).toBe('Många fel koder för Oskar Nilsson på H8E -26'); expect(u.meddelande.body).toContain('10 fel i rad'); expect(u.meddelande.url).toBe('/admin?flik=medarbetare') }
  })
  it('saknat namn/maskin eller för gammal → hoppas över', () => {
    expect(byggMaskinKodNotis({ payload: { namn: 'X' } }).typ).toBe('hoppa_over')
    expect(byggMaskinKodNotis({ payload: p, skapad_at: new Date(Date.now() - MASKIN_KOD_MAX_ALDER_MS - 1000).toISOString() }).typ).toBe('hoppa_over')
  })
})

describe('öppet, låst och dolt', () => {
  it('förarens egna saker är låsta, Ekonomi och Personal dolda, kartan och planeringen öppna', () => {
    for (const p of ['/arbetsrapport', '/planera', '/ledighet', '/utbildning', '/utbildning/person/x', '/introduktion']) expect(arLastSokvag(p)).toBe(true)
    for (const p of ['/ekonomi', '/ekonomi/fakturaunderlag', '/admin', '/admin/historik', '/personal', '/avtal', '/affarsuppfoljning/rakna']) expect(arDoldSokvag(p)).toBe(true)
    for (const p of ['/planering', '/oversikt', '/objekt', '/uppfoljning', '/maskinvy', '/karta', '/kalibrering', '/lastbil', '/om-nagot-hander', '/maskinkoll']) {
      expect(arLastSokvag(p)).toBe(false); expect(arDoldSokvag(p)).toBe(false)
    }
    expect(arLastSokvag('/arbetsrapportfoo')).toBe(false)   // bara hela sökvägssteg
  })
  it('kartan är maskinens egen vy (att gå dit låser)', () => {
    for (const p of ['/planering', '/planering/x', '/maskin', '/maskin/x']) expect(arKartSokvag(p)).toBe(true)
    for (const p of ['/', '/arbetsrapport', '/maskinvy']) expect(arKartSokvag(p)).toBe(false)
  })
})

describe('upplåsningen går ut', () => {
  beforeEach(() => { localStorage.clear() })
  const ms = { access_token: 'a', refresh_token: 'r', maskin_id: 'R64428' }
  it('efter 10 minuter utan tryck', () => {
    expect(utgangen({ aktivitet: 1000 }, 1000 + IDLE_MS - 1)).toBe(false)
    expect(utgangen({ aktivitet: 1000 }, 1000 + IDLE_MS)).toBe(true)
  })
  it('maskinUpplast kräver både personen och maskinkontots sparade session — och att den inte gått ut', () => {
    expect(maskinUpplast()).toBe(false)
    sattUpplast({ id: 'p', namn: 'Oskar', roll: 'forare', aktivitet: Date.now() })
    expect(maskinUpplast()).toBe(false)           // ingen sparad maskinsession → kan inte låsas, räknas inte som upplåst
    sattMaskinSession(ms)
    expect(maskinUpplast()).toBe(true)
    expect(maskinUpplast(Date.now() + IDLE_MS + 1)).toBe(false)
    sattUpplast(null)
    expect(lasUpplast()).toBeNull()
    expect(maskinUpplast()).toBe(false)
  })
  it('trasig localStorage ger aldrig ett undantag', () => {
    localStorage.setItem('maskin_upplast_v1', '{trasigt')
    expect(lasUpplast()).toBeNull()
    expect(maskinUpplast()).toBe(false)
  })
})

describe('vyregistret på en maskin', () => {
  const ids = (l: { id: string }[]) => l.map(v => v.id)
  it('utan maskin är allt som förut — förare ser Personal och Avtal, admin allt', () => {
    expect(ids(vyerFor('forare'))).toEqual(expect.arrayContaining(['personal', 'avtal', 'arbetsrapport', 'ledighet']))
    expect(ids(vyerFor('admin'))).toEqual(expect.arrayContaining(['personal', 'avtal', 'ekonomi', 'admin']))
  })
  it('maskinkonto och upplåst förare: Ekonomi, Personal, Avtal och Affärsuppföljning finns inte — varken i listan, favoriterna eller sökningen', () => {
    const dolda = ['ekonomi', 'admin', 'personal', 'avtal', 'affarsuppfoljning', 'markagarrapport', 'objektoversikt']
    const alla = ids(vyerFor('forare', { maskin: true }))
    for (const d of dolda) expect(alla).not.toContain(d)
    expect(ids(grupperFor('forare', { maskin: true }).flatMap(g => g.vyer))).not.toContain('personal')
    expect(ids(favoriterFor('forare', ['personal', 'avtal', 'ekonomi', 'planering'], { maskin: true }))).toEqual(['planering'])
    for (const q of ['personal', 'ekonomi', 'avtal', 'telefon', 'faktura']) expect(ids(sokVyer('forare', q, { maskin: true }))).not.toEqual(expect.arrayContaining(dolda.slice(0, 5)))
    expect(ids(sokVyer('forare', 'personal', { maskin: true }))).not.toContain('personal')
  })
  it('upplåst admin ser Ekonomi och Personal', () => {
    const a = ids(vyerFor('admin', { maskin: true }))
    expect(a).toEqual(expect.arrayContaining(['ekonomi', 'personal', 'avtal', 'admin']))
  })
  it('förarens egna saker är märkta låsta, kartans och maskinens vyer är det inte', () => {
    const last = VYER.filter(v => v.maskinLas).map(v => v.id).sort()
    expect(last).toEqual(['arbetsrapport', 'introduktion', 'ledighet', 'planera', 'utbildning'])
    for (const id of ['planering', 'oversikt', 'objekt', 'uppfoljning', 'maskinvy', 'maskinvy-2', 'kalibrering', 'maskinkoll', 'om-nagot-hander']) expect(VYER.find(v => v.id === id)?.maskinLas).toBeFalsy()
  })
})
