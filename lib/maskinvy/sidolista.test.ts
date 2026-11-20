import { describe, it, expect } from 'vitest'
import { arAvslutad, sidoRad, summaRad, summeraIdag, type SidoData } from './sidolista'

// 2026-10-22 10:00 svensk tid (08:00 UTC)
const NU = Date.UTC(2026, 9, 22, 8, 0, 0)
const klockslag = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })
const minSedan = (min: number) => new Date(NU - min * 60000).toISOString()

const dag = (signalMin: number | null, idag: SidoData['idag'], datum = '2026-10-22'): SidoData => ({
  signalDatum: datum, signalIso: signalMin == null ? null : minSedan(signalMin), idag,
})

describe('summeraIdag', () => {
  it('skördare: volym och G15 summeras var för sig, G15 via processing + terräng + övrigt arbete', () => {
    const i = summeraIdag('skordare',
      [{ volym_m3sub: 60 }, { volym_m3sub: 82.5 }, { volym_m3sub: null }],
      [{ processing_sek: 7200, terrain_sek: 1800, other_work_sek: 1800 }, { processing_sek: 3600, terrain_sek: 0, other_work_sek: 0 }])
    expect(i.volym).toBeCloseTo(142.5)
    expect(i.g15Sek).toBe(14400)
    expect(i.lass).toBeNull()
  })
  it('skördare: tiden kunde inte läsas → g15 null (volymen visas ändå)', () => {
    expect(summeraIdag('skordare', [{ volym_m3sub: 10 }], null).g15Sek).toBeNull()
  })
  it('skotare: lass = antal rader', () => {
    const i = summeraIdag('skotare', [{ volym_m3sub: 8 }, { volym_m3sub: 9 }, { volym_m3sub: 7.5 }], null)
    expect(i).toEqual({ volym: 24.5, lass: 3, g15Sek: null })
  })
})

describe('sidoRad — lever maskinen nu?', () => {
  it('aktiv: signal för 4 min sedan → grön, "Aktiv nu"', () => {
    const r = sidoRad('skordare', dag(4, { volym: 142, lass: null, g15Sek: 13 * 3600 }), NU, klockslag)
    expect(r.niva).toBe('aktiv')
    expect(r.status).toBe('Aktiv nu')
  })
  it('gul 20–60 min: "För 35 min sedan"', () => {
    const r = sidoRad('skordare', dag(35, { volym: 5, lass: null, g15Sek: null }), NU, klockslag)
    expect(r.niva).toBe('sen')
    expect(r.status).toBe('För 35 min sedan')
  })
  it('grå > 60 min: "Inget sedan 08:20" (svensk tid)', () => {
    const r = sidoRad('skotare', dag(100, { volym: 5, lass: 1, g15Sek: null }), NU, klockslag)
    expect(r.niva).toBe('inget')
    expect(r.status).toBe('Inget sedan 08:20')
  })
  it('gränsen 20 min är gul, 19 min grön', () => {
    expect(sidoRad('skordare', dag(19, null), NU, klockslag).niva).toBe('aktiv')
    expect(sidoRad('skordare', dag(20, null), NU, klockslag).niva).toBe('sen')
  })
  it('tid saknas påstår aldrig "Aktiv nu"', () => {
    const r = sidoRad('skordare', dag(null, { volym: 1, lass: null, g15Sek: null }), NU, klockslag)
    expect(r.niva).toBe('saknas')
    expect(r.status).not.toMatch(/Aktiv/)
  })
  it('senaste signal igår: ingen prick-nivå, "Senast 21 okt · igår" och "Ingen körning idag"', () => {
    const r = sidoRad('skordare', { signalDatum: '2026-10-21', signalIso: minSedan(1000), idag: null }, NU, klockslag)
    expect(r.niva).toBe('idag-ej')
    expect(r.status).toBe('Senast 21 okt · igår')
    expect(r.siffror).toBe('Ingen körning idag')
  })
  it('flera dagar sedan (R64101 stod sedan mars)', () => {
    const r = sidoRad('skordare', { signalDatum: '2026-03-11', signalIso: null, idag: null }, NU, klockslag)
    expect(r.status).toBe('Senast 11 mar · 225 dagar sedan')
  })
  it('ingen data alls, läsfel och läser skiljs åt — läsfel är aldrig "Ingen data"', () => {
    expect(sidoRad('skordare', null, NU, klockslag)).toMatchObject({ niva: 'ingen', status: 'Ingen data', siffror: null })
    expect(sidoRad('skordare', { signalDatum: null, signalIso: null, idag: null }, NU, klockslag).niva).toBe('ingen')
    expect(sidoRad('skordare', 'fel', NU, klockslag)).toMatchObject({ niva: 'fel', status: 'Kunde inte läsas', siffror: null })
    expect(sidoRad('skordare', 'laser', NU, klockslag).niva).toBe('laser')
  })
})

describe('sidoRad — dagens siffror', () => {
  it('skördare: "142 m³ · 11,0 m³/G15h" (SUM/SUM, G15-timmar)', () => {
    const r = sidoRad('skordare', dag(4, { volym: 142, lass: null, g15Sek: 12.9 * 3600 }), NU, klockslag)
    expect(r.siffror).toBe('142 m³ · 11,0 m³/G15h')
  })
  it('skördare utan G15-tid: bara volymen, ingen kvot', () => {
    expect(sidoRad('skordare', dag(4, { volym: 142, lass: null, g15Sek: null }), NU, klockslag).siffror).toBe('142 m³')
    expect(sidoRad('skordare', dag(4, { volym: 142, lass: null, g15Sek: 0 }), NU, klockslag).siffror).toBe('142 m³')
  })
  it('skotare: "96 m³ · 11 lass"', () => {
    expect(sidoRad('skotare', dag(4, { volym: 96, lass: 11, g15Sek: null }), NU, klockslag).siffror).toBe('96 m³ · 11 lass')
  })
  it('liten dag får en decimal så den inte blir "0 m³"', () => {
    expect(sidoRad('skotare', dag(4, { volym: 4.2, lass: 1, g15Sek: null }), NU, klockslag).siffror).toBe('4,2 m³ · 1 lass')
  })
  it('signal idag men inga rader hämtade → inga siffror (ingen påhittad 0)', () => {
    expect(sidoRad('skordare', dag(4, null), NU, klockslag).siffror).toBeNull()
  })
})

describe('arAvslutad — vilka maskiner som hamnar i "Tidigare"', () => {
  const aktivTill = { R64101: '2026-03-11', A110148: '2026-07-08', R64428: null, A030353: null }
  it('aktiv_till före idag = avslutad (R64101, gamla Elephant King)', () => {
    expect(arAvslutad(['R64101'], aktivTill, '2026-10-22')).toBe(true)
    expect(arAvslutad(['A110148'], aktivTill, '2026-10-22')).toBe(true)
  })
  it('sista dagen räknas som aktiv; framtida slutdatum likaså', () => {
    expect(arAvslutad(['R64101'], aktivTill, '2026-03-11')).toBe(false)
    expect(arAvslutad(['R64101'], aktivTill, '2026-03-10')).toBe(false)
    expect(arAvslutad(['A110148'], aktivTill, '2026-07-08')).toBe(false)
  })
  it('utan slutdatum, eller okänd maskin, är aldrig avslutad', () => {
    expect(arAvslutad(['R64428'], aktivTill, '2026-10-22')).toBe(false)
    expect(arAvslutad(['PONS20SDJAA270231'], aktivTill, '2026-10-22')).toBe(false)
    expect(arAvslutad([], aktivTill, '2026-10-22')).toBe(false)
  })
  it('ett kombo är avslutat först när ALLA maskinerna i det är det', () => {
    expect(arAvslutad(['R64101', 'R64428'], aktivTill, '2026-10-22')).toBe(false)
    expect(arAvslutad(['R64101', 'A110148'], aktivTill, '2026-10-22')).toBe(true)
    expect(arAvslutad(['R64101', 'OKAND'], aktivTill, '2026-10-22')).toBe(false)
  })
})

describe('summaRad — Alla skördare', () => {
  const kor = (volym: number, g15h: number | null): SidoData => dag(4, { volym, lass: null, g15Sek: g15h == null ? null : g15h * 3600 })
  it('SUM/SUM över dem som körde, aldrig snitt av snitt', () => {
    const r = summaRad([kor(100, 10), kor(50, 2)], NU)               // 150 m³ / 12 h = 12,5 (snitt av snitt vore 7,5)
    expect(r.siffror).toBe('150 m³ · 12,5 m³/G15h')
    expect(r.status).toBe('2 av 2 körde idag')
  })
  it('en som stått räknas i nämnaren av maskiner men inte i summan', () => {
    const r = summaRad([kor(100, 10), { signalDatum: '2026-10-21', signalIso: minSedan(900), idag: null }, null], NU)
    expect(r).toEqual({ status: '1 av 3 körde idag', siffror: '100 m³ · 10,0 m³/G15h' })
  })
  it('saknas G15-tid hos någon som körde visas volymen utan kvot — kvoten blåses annars upp', () => {
    expect(summaRad([kor(100, 10), kor(50, null)], NU).siffror).toBe('150 m³')
  })
  it('ingen körde idag: det sägs, inga nollor', () => {
    expect(summaRad([null, { signalDatum: '2026-10-21', signalIso: null, idag: null }], NU)).toEqual({ status: 'Ingen körning idag', siffror: null })
  })
  it('läsfel går före allt och läser-medan går före siffror — en delsumma skrivs aldrig', () => {
    expect(summaRad([kor(100, 10), 'fel'], NU).status).toBe('Kunde inte läsas')
    expect(summaRad([kor(100, 10), 'laser'], NU).status).toBe('Läser …')
    expect(summaRad([kor(100, 10), undefined], NU).status).toBe('Läser …')
    expect(summaRad([kor(100, 10), 'fel'], NU).siffror).toBeNull()
  })
  it('inga aktiva skördare', () => {
    expect(summaRad([], NU).status).toBe('Inga aktiva skördare')
  })
})
