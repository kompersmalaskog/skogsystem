// @vitest-environment jsdom
// Datahälsa: raden 'import_live' står ÖVERST som en stor rad (grön "Importen fungerar", röd = en rad per problem, "senast kontrollerad"),
// och importdatorns kontroller har var sin rad i stället för samlingsraden 'gap_check'.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import type { StatusRad } from '@/lib/datahalsa/status'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const h = vi.hoisted(() => ({ status: null as any }))
const tom = <T,>(data: T) => ({ laddar: false, fel: null, data })

vi.mock('./SkotarLassKort', () => ({ default: () => null }))
vi.mock('./useDatahalsa', async (orig) => ({
  ...(await orig<typeof import('./useDatahalsa')>()),
  useDatahalsa: () => ({
    filer: tom({ senasteImport: '2026-11-25T09:26:00Z', timmarSedan: 1, antal7d: 240, felFiler: [] }),
    leverans: tom([]),
    invarianter: tom({ over24h: [], dubbletter: [], tomgangInkonsistenta: 0, motorUtanArbete: [] }),
    status: h.status,
    importFel: { ...tom([]), tabellSaknas: false },
    koordinatLarm: tom({ koordlosa: [], dupTrakt: [] }),
    besked: { niva: 'gron', rubrik: 'Allt lugnt', punkter: [] },
  }),
}))

import DatahalsaPage from './page'

// 11:10 svensk tid den 25 november 2026.
const NU = Date.parse('2026-11-25T10:10:00Z')
const LIVE: StatusRad = { id: 'import_live', kordTid: '2026-11-25T10:00:00.186722+00:00', status: 'OK', larmAntal: 0, sammanfattning: 'Importen fungerar. Senaste fil 2026-11-25 10:26' }
const DATORN: StatusRad[] = [
  { id: 'deploy_drift', kordTid: '2026-11-24T16:09:49Z', status: 'OK', larmAntal: 0, sammanfattning: 'OK — 9 importfiler byte-identiska med origin/main (8cfaaea2)' },
  { id: 'fakt_sortiment_mot_stock', kordTid: '2026-11-24T16:09:49Z', status: 'OK', larmAntal: 0, sammanfattning: 'fakt_sortiment och stockarna säger samma sak för alla objekt' },
  { id: 'inkommande_ko', kordTid: '2026-11-24T16:09:49Z', status: 'OK', larmAntal: 0, sammanfattning: 'Inga filer äldre än 24 h i Inkommande' },
  { id: 'parkerade_filer', kordTid: '2026-11-24T16:09:49Z', status: 'LARM', larmAntal: 1, sammanfattning: 'LARM  OIMPORTERADE FILER i _vanta_stor_hpr: 5 st (5 hpr), äldsta 171 dagar' },
  { id: 'stammar_utan_stockar', kordTid: '2026-11-24T16:09:49Z', status: 'OK', larmAntal: 0, sammanfattning: 'Alla objekt med stammar har stockar' },
  // Den gamla samlingsraden ligger kvar i tabellen tills migrationen är körd — den ska inte synas.
  { id: 'gap_check', kordTid: '2026-11-25T09:33:20Z', status: 'LARM', larmAntal: 101, sammanfattning: 'LARM  IMPORTFEL gammalt' },
]
const sektion = (rader: StatusRad[] | null, over: Record<string, unknown> = {}) => ({ laddar: false, fel: null, data: rader, tabellSaknas: false, ...over })

let cont: HTMLElement
async function visa() {
  cont = document.createElement('div'); document.body.appendChild(cont)
  const root = createRoot(cont)
  await act(async () => { root.render(<DatahalsaPage />) })
  return cont
}
const live = () => cont.querySelector('[data-testid="import-live"]') as HTMLElement
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NU); h.status = sektion([LIVE, ...DATORN]) })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

describe('Datahälsa — importen just nu', () => {
  it('står överst på sidan, före beskedet och alla kort', async () => {
    await visa()
    const main = cont.querySelector('main')!
    expect(main.firstElementChild).toBe(live())
    expect(text(main).indexOf('Importen fungerar')).toBeLessThan(text(main).indexOf('Allt lugnt'))
  })

  it('grön: "Importen fungerar", senaste filen under, senast kontrollerad ur kord_tid', async () => {
    await visa()
    expect(live().dataset.lage).toBe('ok')
    expect(text(live().querySelector('[data-testid="import-live-rubrik"]'))).toBe('Importen fungerar')
    expect(text(live())).toContain('Senaste fil 2026-11-25 10:26')
    expect(text(live().querySelector('[data-testid="import-live-kontrollerad"]'))).toBe('Senast kontrollerad 11:00')
    // Rubriken säger det en gång — databasens "Importen fungerar." upprepas inte under.
    expect(text(live()).match(/Importen fungerar/g)).toHaveLength(1)
  })

  it('röd: sammanfattningen i klartext, en rad per problem', async () => {
    h.status = sektion([{ ...LIVE, status: 'LARM', larmAntal: 2, sammanfattning: 'Ingen fil har kommit in på 6 timmar\n12 importfel senaste timmen (detalj_stock)' }, ...DATORN])
    await visa()
    expect(live().dataset.lage).toBe('larm')
    expect(text(live().querySelector('[data-testid="import-live-rubrik"]'))).toBe('Importen felar')
    const rader = Array.from(live().querySelectorAll('[data-testid="import-live-rader"] li')).map(text)
    expect(rader).toEqual(['Ingen fil har kommit in på 6 timmar', '12 importfel senaste timmen (detalj_stock)'])
    expect(text(live())).not.toContain('Importen fungerar')
    expect(text(live())).toContain('Senast kontrollerad 11:00')
  })

  it('kontrollen har stannat: inte grönt, och tiden sticker ut', async () => {
    h.status = sektion([{ ...LIVE, kordTid: '2026-11-25T08:00:00Z' }, ...DATORN])
    await visa()
    expect(live().dataset.lage).toBe('gammal')
    expect(text(live())).toContain('Importen kontrolleras inte')
    expect(text(live())).toContain('Senast kontrollerad 09:00')
    expect(text(live())).not.toContain('Importen fungerar')
  })

  it('raden saknas: säger att kontrollen inte kört — påstår inget om importen', async () => {
    h.status = sektion(DATORN)
    await visa()
    expect(live().dataset.lage).toBe('saknas')
    expect(text(live())).not.toContain('Importen fungerar')
    expect(live().querySelector('[data-testid="import-live-kontrollerad"]')).toBeNull()
  })

  it('läses: säger vad som läses; läsfel: säger det, aldrig grönt', async () => {
    h.status = sektion(null, { laddar: true })
    await visa()
    expect(text(live())).toContain('Läser importens läge')
    document.body.innerHTML = ''
    h.status = sektion(null, { fel: 'connection reset' })
    await visa()
    expect(live().dataset.lage).toBe('fel')
    expect(text(live())).toContain('Importens läge kunde inte läsas')
    expect(text(live())).not.toContain('Importen fungerar')
  })
})

describe('Datahälsa — kontrollerna på importdatorn', () => {
  it('en rad per kontroll; den som larmar säger varför', async () => {
    await visa()
    const k = cont.querySelector('[data-testid="kontroller"]')!
    expect(Array.from(k.querySelectorAll('[data-kontroll]')).map((e) => (e as HTMLElement).dataset.kontroll))
      .toEqual(['stammar_utan_stockar', 'fakt_sortiment_mot_stock', 'inkommande_ko', 'parkerade_filer', 'deploy_drift'])
    const park = k.querySelector('[data-kontroll="parkerade_filer"]') as HTMLElement
    expect(park.dataset.lage).toBe('larm')
    expect(text(park)).toContain('Parkerade filer')
    expect(text(park)).toContain('OIMPORTERADE FILER i _vanta_stor_hpr: 5 st')
    expect(text(k)).toContain('Senast körda')
    expect(text(k)).toContain('i går 17:09')
  })

  it('samlingsraden gap_check och det gamla kortet finns inte kvar', async () => {
    await visa()
    expect(text(cont)).not.toContain('SENASTE GAP CHECK')
    expect(text(cont)).not.toContain('IMPORTFEL gammalt')
    expect(text(cont)).not.toContain('101')
    expect(cont.querySelector('[data-kontroll="gap_check"]')).toBeNull()
    expect(cont.querySelector('[data-kontroll="import_live"]')).toBeNull()
  })
})
