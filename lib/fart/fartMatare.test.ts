import { describe, expect, it } from 'vitest'
import { arKartruta, fartPa, FART_NYCKEL, matningRader, sammanfatta, tidText, vadAndrades, kartanKlar, KARTA_LUGN_MS } from './fartMatare'

const minne = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, m } }

describe('fartPa', () => {
  it('är av från början, ?fart=1 slår på och sparar, ?fart=0 stänger av', () => {
    const s = minne()
    expect(fartPa('', s)).toBe(false)
    expect(fartPa('?fart=1', s)).toBe(true)
    expect(s.m.get(FART_NYCKEL)).toBe('1')
    expect(fartPa('?objekt=x', s)).toBe(true)   // sparat: gäller också i den installerade appen utan adressfält
    expect(fartPa('?fart=0', s)).toBe(false)
    expect(fartPa('', s)).toBe(false)
  })
  it('tål att minnet inte går att nå', () => {
    const trasigt = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
    expect(fartPa('?fart=1', trasigt)).toBe(true)
    expect(fartPa('', trasigt)).toBe(false)
    expect(fartPa('?fart=1', null)).toBe(true)
  })
})

describe('vadAndrades', () => {
  const namn = (id: string) => ({ sks_markfuktighet: 'Markfuktighet', lantmateriet: 'Karta', sumpskog: 'Sumpskog' } as Record<string, string>)[id] ?? id
  it('säger bakgrunden eller lagret i ord', () => {
    expect(vadAndrades({ bakgrund: 'satellite', lager: {} }, { bakgrund: 'lantmateriet', lager: {} }, namn)).toBe('Bakgrund: Karta')
    expect(vadAndrades({ bakgrund: 'a', lager: {} }, { bakgrund: 'a', lager: { sks_markfuktighet: true } }, namn)).toBe('Markfuktighet på')
    expect(vadAndrades({ bakgrund: 'a', lager: { sks_markfuktighet: true } }, { bakgrund: 'a', lager: { sks_markfuktighet: false } }, namn)).toBe('Markfuktighet av')
    expect(vadAndrades({ bakgrund: 'a', lager: {} }, { bakgrund: 'a', lager: { sks_markfuktighet: true, sumpskog: true } }, namn)).toBe('Markfuktighet på + 1 till')
  })
  it('inget ändrat (undefined och false är samma) = null', () => {
    expect(vadAndrades({ bakgrund: 'a', lager: { x: undefined } }, { bakgrund: 'a', lager: { x: false } }, namn)).toBeNull()
  })
})

describe('arKartruta', () => {
  it('känner igen proxyn, WMS och z/x/y — inte appens egna anrop', () => {
    expect(arKartruta('https://x/api/wms-proxy?layer=a&bbox=1,2,3,4')).toBe(true)
    expect(arKartruta('https://minkarta.lantmateriet.se/map/ortofoto?SERVICE=WMS&BBOX=1,2,3,4')).toBe(true)
    expect(arKartruta('https://tile.openstreetmap.org/14/8861/5012.png')).toBe(true)
    expect(arKartruta('https://x/api/forarkarta?lager=terrain&z=15&x=17700&y=9990')).toBe(true)   // bakgrundens rutor (2026-11-13: mätaren sa "inga hämtades")
    expect(arKartruta('https://x.supabase.co/rest/v1/objekt?select=id')).toBe(false)
    expect(arKartruta('https://x/api/version')).toBe(false)
  })
})

describe('sammanfatta', () => {
  const ruta = (start: number, langd: number) => ({ namn: 'https://x/api/wms-proxy?bbox=1', start, langd })
  it('delar tiden i sidan, rutorna och ritningen', () => {
    const m = sammanfatta({ vad: 'Markfuktighet på', tryck: 1000, ritad: 1400, klar: 5400, hamtningar: [ruta(1450, 900), ruta(1500, 2100), { namn: 'https://x/api/version', start: 1500, langd: 9000 }, ruta(200, 5000)], bildrutor: [1400, 1416, 1700, 1716] })
    expect(m).toEqual({ vad: 'Markfuktighet på', sidanMs: 400, rutornaMs: 4000, rutor: 2, langstaRutaMs: 2100, langstaBildrutaMs: 284 })
    expect(matningRader(m)).toEqual({ sidan: 'Sidan: 400 ms', rutorna: 'Rutorna: 4,0 s · 2 st · långsammaste 2,1 s', ritningen: 'Ritningen: långsammaste bildruta 284 ms' })
  })
  it('ett gammalt tryck räknas inte, och en karta som aldrig blev klar sägs', () => {
    const m = sammanfatta({ vad: 'x', tryck: 0, ritad: 9000, klar: null, hamtningar: [ruta(9100, 300)], bildrutor: [] })
    expect(m.sidanMs).toBeNull()
    expect(m.rutornaMs).toBeNull()
    expect(matningRader(m).sidan).toBe('Sidan: –')
    expect(matningRader(m).rutorna).toBe('Rutorna: över 30 s · 1 st')
  })
  it('inga rutor hämtades (allt fanns sparat)', () => {
    const m = sammanfatta({ vad: 'x', tryck: 100, ritad: 200, klar: 260, hamtningar: [], bildrutor: [200, 216] })
    expect(matningRader(m).rutorna).toBe('Rutorna: 60 ms · inga hämtades')
  })
})

describe('tidText', () => {
  it('ms under en sekund, annars sekunder med decimalkomma', () => {
    expect(tidText(120)).toBe('120 ms')
    expect(tidText(1000)).toBe('1,0 s')
    expect(tidText(12340)).toBe('12,3 s')
  })
})

describe('kartanKlar: klar utan att kartan behöver stå still (maskinläget)', () => {
  const ruta = (start: number, langd: number) => ({ namn: 'https://x/wms-proxy?bbox=1', start, langd });
  it('inga rutor hämtades (högar av/på): klar vid ritad, så fort det varit lugnt en stund', () => {
    expect(kartanKlar({ nu: 1000 + KARTA_LUGN_MS - 1, ritad: 1000, rutornaLaddade: true, hamtningar: [] })).toBeNull();
    expect(kartanKlar({ nu: 1000 + KARTA_LUGN_MS, ritad: 1000, rutornaLaddade: true, hamtningar: [] })).toBe(1000);
  });
  it('med rutor: klar när den SISTA rutan blev färdig, inte när vi märkte det', () => {
    const h = [ruta(1010, 400), ruta(1020, 2500), { namn: 'https://x/rest/v1/objekt', start: 1100, langd: 9000 }];
    expect(kartanKlar({ nu: 3600, ritad: 1000, rutornaLaddade: true, hamtningar: h })).toBeNull();     // sista rutan klar 3520: för nyss
    expect(kartanKlar({ nu: 4100, ritad: 1000, rutornaLaddade: true, hamtningar: h })).toBe(3520);     // appens egna anrop räknas inte
  });
  it('rutor på väg: aldrig klar, hur länge det än varit lugnt', () => {
    expect(kartanKlar({ nu: 99999, ritad: 1000, rutornaLaddade: false, hamtningar: [] })).toBeNull();
  });
  it('rutor från före bytet räknas inte', () => {
    expect(kartanKlar({ nu: 2000, ritad: 1000, rutornaLaddade: true, hamtningar: [ruta(100, 5000)] })).toBe(1000);
  });
});
