import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { anropNamn, aterlagg, enhetNamn, kartRad, koLangd, laggTill, taAllt, vyNamn, FART_KO_MAX } from './fartLogg'

const EGEN = 'https://skogsystem.vercel.app'
const SB = 'https://abc.supabase.co'

describe('vyNamn', () => {
  it('tar bort id:n och frågedelen', () => {
    expect(vyNamn('/gallring/11271849')).toBe('/gallring/:id')
    expect(vyNamn('/egenkontroll/5cc47f35-ab06-4a9a-a9a3-eb5a6bbb8ec8?x=1')).toBe('/egenkontroll/:id')
    expect(vyNamn('/planering')).toBe('/planering')
    expect(vyNamn('/')).toBe('/')
  })
})

describe('anropNamn — aldrig innehåll, bara vad som anropades', () => {
  it('databasen: tabell eller funktion, utan filter', () => {
    expect(anropNamn(`${SB}/rest/v1/objekt?select=*&namn=eq.Hemligt`, EGEN)).toBe('db:objekt')
    expect(anropNamn(`${SB}/rest/v1/rpc/helikopter_ny_klar`, EGEN)).toBe('rpc:helikopter_ny_klar')
    expect(anropNamn(`${SB}/storage/v1/object/sign/ytfoto/a.jpg?token=x`, EGEN)).toBe('lagring')
  })
  it('egna servern: sökvägen utan id:n', () => {
    expect(anropNamn(`${EGEN}/api/lon/arbetstid?ar=2026`, EGEN)).toBe('/api/lon/arbetstid')
    expect(anropNamn(`${EGEN}/api/arbetsdag/123456/objekt`, EGEN)).toBe('/api/arbetsdag/:id/objekt')
  })
  it('kartrutor, sidans egna filer och mätningens egen tabell loggas inte', () => {
    expect(anropNamn(`${EGEN}/api/wms-proxy?layer=x&bbox=1,2,3,4`, EGEN)).toBeNull()
    expect(anropNamn(`${EGEN}/api/forarkarta?layer=ortofoto&z=17&x=1&y=2`, EGEN)).toBeNull()
    expect(anropNamn(`${EGEN}/_next/static/chunks/a.js`, EGEN)).toBeNull()
    expect(anropNamn(`${SB}/rest/v1/fart_logg`, EGEN)).toBeNull()
  })
  it('andra värdar: bara värdnamnet', () => {
    expect(anropNamn('https://router.project-osrm.org/route/v1/driving/15.1,56.2;15.3,56.4?x=1', EGEN)).toBe('router.project-osrm.org')
  })
})

describe('kartRad', () => {
  const m = { vad: 'Markfuktighet på', sidanMs: 180, rutornaMs: 6600, rutor: 54, langstaRutaMs: 700, langstaBildrutaMs: 316 }
  it('summan av sidan och rutorna, med delarna i detaljen', () => {
    const r = kartRad(m, '/planering')!
    expect(r).toMatchObject({ slag: 'karta', namn: 'Markfuktighet på', ms: 6780, vy: '/planering' })
    expect(r.detalj).toMatchObject({ sidan: 180, rutorna: 6600, rutor: 54 })
  })
  it('ett snabbt byte sparas inte; en karta som aldrig blev klar räknas som 30 s', () => {
    expect(kartRad({ ...m, sidanMs: 100, rutornaMs: 200 }, '/planering')).toBeNull()
    expect(kartRad({ ...m, rutornaMs: null }, '/planering')!.ms).toBe(30180)
  })
})

describe('kön', () => {
  it('håller högst FART_KO_MAX rader, de äldsta kastas; återlagda kommer först', () => {
    taAllt()
    for (let i = 0; i < FART_KO_MAX + 10; i++) laggTill({ slag: 'anrop', namn: `n${i}`, ms: 600.4, vy: '/' })
    expect(koLangd()).toBe(FART_KO_MAX)
    const alla = taAllt()
    expect(alla[0].namn).toBe('n10')
    expect(alla[0].ms).toBe(600)
    expect(koLangd()).toBe(0)
    laggTill({ slag: 'anrop', namn: 'ny', ms: 1, vy: '/' })
    aterlagg(alla.slice(0, 2))
    expect(taAllt().map((r) => r.namn)).toEqual(['n10', 'n11', 'ny'])
  })
  it('ogiltiga tal läggs aldrig till', () => {
    taAllt(); laggTill(null); laggTill({ slag: 'byte', namn: 'x', ms: NaN, vy: '/' }); laggTill({ slag: 'byte', namn: 'x', ms: -5, vy: '/' })
    expect(koLangd()).toBe(0)
  })
})

describe('enhetNamn — aldrig en person', () => {
  it('telefon, pekskärm, dator', () => {
    expect(enhetNamn(390, true)).toBe('telefon'); expect(enhetNamn(1280, true)).toBe('pekskärm'); expect(enhetNamn(1440, false)).toBe('dator')
  })
})

describe('vakter: tyst och utan person', () => {
  const lager = fs.readFileSync(path.resolve(__dirname, '../../components/FartLoggStartare.tsx'), 'utf8')
  it('startaren ritar ingenting', () => { expect(lager).toMatch(/return null\n\}\s*$/) })
  it('ingen medarbetare eller e-post skickas', () => {
    const rad = /\.insert\(rader\.map\(\(r\) => \(\{([^}]*)\}/.exec(lager)![1]
    expect(rad).not.toMatch(/medarbetare|email|epost|user/i)
  })
  it('planeringen monterar mätaren alltid, och rutan bara med ?fart=1', () => {
    const sida = fs.readFileSync(path.resolve(__dirname, '../../app/planering/page.tsx'), 'utf8')
    expect(sida).toContain('<FartMatare visa={fartMatarePa}')
    expect(sida).not.toMatch(/fartMatarePa && \(\s*<FartMatare/)
  })
})
