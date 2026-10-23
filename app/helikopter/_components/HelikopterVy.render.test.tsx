// @vitest-environment jsdom
/**
 * /helikopter monteras på riktigt (jsdom, queries utbytta mot prod-formade svar) som EN sida: svaret, Skotat mot beställning med ett tal
 * per spår och prick + ord, Behöver dig bara när något kräver dig, Klar med ett datum per maskin, Mer, och att ett fel är ett fel.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import klarOkt from '../_lib/__fixtures__/klar_2026-10-17.json'
import historikOkt from '../_lib/__fixtures__/historik_2026-10-15.json'
import { lasHistorik } from '../_lib/manadsfacit'
import { lasKlar } from '../_lib/klar'
import { fmt } from '../_lib/format'

const q = vi.hoisted(() => ({
  hamtaFast: vi.fn(), hamtaManadsdata: vi.fn(), hamtaManuellaMaskiner: vi.fn(), hamtaSenasteLass: vi.fn(), hamtaMaskinLage: vi.fn(),
  hamtaMaskiner: vi.fn(), hamtaMaskinTakter: vi.fn(), hamtaBolag: vi.fn(), hamtaHistorik: vi.fn(), hamtaKlar: vi.fn(), skickaVeckoNotis: vi.fn(), params: '', replace: vi.fn(),
}))
vi.mock('../_lib/queries', () => q)
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(q.params), useRouter: () => ({ replace: q.replace }) }))
vi.mock('@/lib/CurrentMedarbetareContext', () => ({ useCurrentMedarbetare: () => ({ medarbetare: { id: 'm1', roll: 'admin', maskin_id: null } }) }))
vi.mock('@/lib/datumLokal', () => ({ ymdLokal: () => '2026-10-17' }))

import HelikopterVy from './HelikopterVy'

const okt = {
  maskin_id: null, totalt: 22, gangna: 12, kvar: 10,
  gangna_datum: ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'],
  kvar_datum: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
}
const spar = (typ: string, x: Record<string, unknown>) => ({
  typ, bas: 'bestallt', bestallt: 1000, bolag: ['Vida'], skordat: 900, skotat: 800, takt_skordat: 12, takt_skotat: 22, takt_dagar: 5, takt_fonster: [],
  oskotat_forandring_per_dag: 0, ingaende_oskotat: 0, oskotat_objekt: [], ...x,
})
const objekt = (id: string, typ: string, volym: number, x: Record<string, unknown> = {}) => ({
  objekt_id: id, namn: `4007${id} Vällust -26`, vo_nummer: null, typ, bolag: 'Vida', volym, status: 'planerad', skordare_maskin_id: 'R64428', skotare_maskin_id: 'A030353',
  skordare_utforare: null, skotare_utforare: null, prognos_skordare_h: 10, prognos_skotare_h: 10, klar_skordare: false, klar_skotare: false, ...x,
})
const stoppRad = (x: Record<string, unknown>) => ({
  maskin_id: 'PONS', namn: 'Giant', roll: 'skordare', stopp_fran: null, stopp_till: null, stopp_orsak: null, stopp_status: null, stopp_kor_igen: null,
  stopp_dagar: null, stopp_dagar_gangna: null, stopp_dagar_manad: 0, stopp_orsaker_manad: [], oforklarade_datum: [], takt_fran: null, ...x,
})
const manadsdata = (x: Record<string, unknown> = {}) => ({
  // Gallring landar (1 020 av 1 000), slutavverkning under (skotat 3 000 + 100 × 10 = 4 000 av 5 000).
  spar: [spar('gallring', {}), spar('slutavverkning', { bestallt: 5000, skordat: 4800, skotat: 3000, takt_skordat: 100, takt_skotat: 100 })],
  arbetsdagar: [okt],
  planering: [objekt('1', 'gallring', 1000), objekt('2', 'slutavverkning', 5000)],
  stopp: [], bestallningar: [{ typ: 'gallring', bolag: 'Vida', volym: 1000 }, { typ: 'slutavverkning', bolag: 'Vida', volym: 5000 }],
  utanTyp: [], takter: null, maskinStopp: [], rapportdagar: null, ...x,
})
const fast = {
  maskiner: [{ maskin_id: 'PONS', modell: 'Scorpion', visningsnamn: 'Giant', maskin_typ: 'Harvester', klarar_typ: 'slutavverkning', extramaskin: false, aktiv_till: null }],
  senasteData: '2026-10-17T06:00:00Z', avvikelse: [], g15: {},
}
const maskiner = [
  { maskin_id: 'PONS', modell: 'Scorpion', namn: 'Giant', roll: 'skordare', volym_manad: 2498.7, objekt_namn: '400001 Jätsbygd -26', takt_per_dag: 160.4, takt_dagar: 5, oskotat_objekt: null, senast_datum: '2026-10-16' },
  { maskin_id: 'A030353', modell: 'Wisent', namn: 'Wisent', roll: 'skotare', volym_manad: 0, objekt_namn: null, takt_per_dag: null, takt_dagar: 0, oskotat_objekt: null, senast_datum: null },
]

let root: Root | null = null
let cont: HTMLDivElement
async function monter() {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  cont = document.createElement('div'); document.body.appendChild(cont)
  root = createRoot(cont)
  await act(async () => { root!.render(<HelikopterVy />) })
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
}
beforeEach(() => {
  for (const f of Object.values(q)) if (typeof f === 'function' && 'mockReset' in f) (f as ReturnType<typeof vi.fn>).mockReset()
  q.params = 'ar=2026&manad=10'
  q.hamtaFast.mockResolvedValue({ data: fast, error: null })
  q.hamtaManadsdata.mockResolvedValue({ data: manadsdata(), error: null })
  q.hamtaManuellaMaskiner.mockResolvedValue(new Set())
  q.hamtaSenasteLass.mockResolvedValue({ data: {}, error: null })
  q.hamtaMaskiner.mockResolvedValue({ data: maskiner, error: null })
  q.hamtaBolag.mockResolvedValue({ data: [], error: null })
  q.hamtaMaskinTakter.mockResolvedValue({ data: {}, error: null })
  q.hamtaHistorik.mockResolvedValue({ data: lasHistorik(historikOkt), error: null })
  q.hamtaKlar.mockResolvedValue({ data: lasKlar(structuredClone(klarOkt)), error: null })
})
afterEach(async () => { await act(async () => { root?.unmount() }); cont?.remove(); root = null })
const text = () => cont.textContent ?? ''
const sektion = (namn: string) => cont.querySelector(`section[aria-label="${namn}"]`) as HTMLElement | null

describe('/helikopter — en sida', () => {
  it('svaret, ett tal per spår med prick + ord, inga flikar', async () => {
    await monter()
    expect(text()).toContain('Oktober 2026')
    expect(text()).toContain('10 arbetsdagar kvar')
    expect(cont.querySelector('main h2')?.textContent).toBe('Landar under beställt')
    const skotat = sektion('Skotat mot beställning')!
    expect(skotat.querySelector('[data-tal="gallring"]')?.textContent).toBe(fmt(1020))
    expect(skotat.querySelector('[data-spar="gallring"]')?.textContent).toContain('Landar')
    expect(skotat.querySelector('[data-tal="slutavverkning"]')?.textContent).toBe(fmt(4000))
    expect(skotat.querySelector('[data-spar="slutavverkning"]')?.textContent).toContain('Under')
    // Inga flikar, ingen Läge/Planering/Uppföljning-text.
    expect(cont.querySelector('[role="tablist"]')).toBeNull()
    expect(text()).not.toContain('Uppföljning')
    // Klar: ett datum per maskin ur helikopter_ny_klar.
    const klar = sektion('Klar')!
    expect(klar.querySelectorAll('[data-klar]').length).toBe(lasKlar(structuredClone(klarOkt)).maskiner.length)
    // Maskinerna: m³fub till höger, "Ingen produktion" dämpad.
    expect(sektion('Skördare')!.textContent).toContain('m³fub')
    expect(sektion('Skotare')!.textContent).toContain('Ingen produktion i oktober')
    // Mer-raderna och admin-notisen.
    expect(sektion('Mer')!.textContent).toContain('Veckor · Gallring')
    expect(sektion('Onsdagsnotis')).not.toBeNull()
  })

  it('Behöver dig finns bara när något kräver dig, och raden säger vad', async () => {
    await monter()
    // Giant blir klar efter månadens slut i fixturen? Räkna ut ur datan i stället för att anta.
    const sena = lasKlar(structuredClone(klarOkt)).maskiner.filter(m => m.efter_manad && m.klar_datum)
    const behov = sektion('Behöver dig')
    if (sena.length === 0) expect(behov).toBeNull()
    else expect(behov!.querySelectorAll('[data-behov]').length).toBe(sena.length)
  })

  it('oförklarat stopp blir en rad i Behöver dig; ett tryck öppnar Maskiner', async () => {
    q.hamtaKlar.mockResolvedValue({ data: null, error: 'nät' })
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ maskinStopp: [stoppRad({ oforklarade_datum: ['2026-10-14', '2026-10-15', '2026-10-16'] })] }), error: null })
    await monter()
    const rad = cont.querySelector('[data-behov="stod:PONS"]') as HTMLButtonElement
    expect(rad.textContent).toContain('Giant körde inte ons–fre')
    expect(rad.textContent).toContain('Ingen ledighet registrerad')
    // Klar-kortet säger att det inte gick att läsa — aldrig en tom lista.
    expect(sektion('Klar')!.textContent).toContain('Kunde inte läsa')
    await act(async () => { rad.click() })
    expect(cont.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('ett fel i månadsdatan är ett fel med Försök igen — aldrig tomma kort', async () => {
    q.hamtaManadsdata.mockResolvedValueOnce({ data: null, error: 'nätet' })
    await monter()
    expect(text()).toContain('Kunde inte läsa data')
    expect(sektion('Skotat mot beställning')).toBeNull()
    const knapp = Array.from(cont.querySelectorAll('button')).find(b => b.textContent === 'Försök igen')!
    await act(async () => { knapp.click() })
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
    expect(sektion('Skotat mot beställning')).not.toBeNull()
  })

  it('en annan månad: Idag-knappen finns, och sidokolumnen länkar månaderna till samma sida', async () => {
    q.params = 'ar=2026&manad=9'
    await monter()
    expect(Array.from(cont.querySelectorAll('button')).some(b => b.textContent === 'Idag')).toBe(true)
    const vald = cont.querySelector('[data-manad="2026-9"]') as HTMLAnchorElement
    expect(vald.getAttribute('aria-current')).toBe('page')
    expect(vald.getAttribute('href')).toBe('/helikopter?ar=2026&manad=9')
    expect(cont.querySelector('[data-manad="2026-10"]')?.textContent).toContain('pågår')
  })
})
