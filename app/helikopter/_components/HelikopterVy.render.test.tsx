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
import { lasKlar, raknaAlla } from '../_lib/klar'
import { fmt } from '../_lib/format'

const q = vi.hoisted(() => ({
  hamtaFast: vi.fn(), hamtaManadsdata: vi.fn(), hamtaManuellaMaskiner: vi.fn(), hamtaSenasteLass: vi.fn(), hamtaMaskinLage: vi.fn(),
  hamtaMaskiner: vi.fn(), hamtaMaskinTakter: vi.fn(), hamtaBolag: vi.fn(), hamtaPrognosUtfall: vi.fn(), hamtaPrognosFacit: vi.fn(async () => ({ data: [], error: null })), tilldelaMaskin: vi.fn(), hamtaHistorik: vi.fn(), hamtaKlar: vi.fn(), skickaVeckoNotis: vi.fn(), params: '', replace: vi.fn(),
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
  utanTyp: [], takter: null, maskinStopp: [], rapportdagar: null, egenSkotning: [], ...x,
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
  q.hamtaPrognosUtfall.mockResolvedValue({ data: [], error: null })
  q.tilldelaMaskin.mockResolvedValue({ error: null })
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
    expect(cont.querySelector('main h2')?.textContent).toBe('Vi hinner inte med beställningen')
    const skotat = sektion('Skotat')!
    // Det stora talet är SKOTAT HITTILLS, prognosen står som "Landar på N" under (2026-10-24: 726 lästes som skotat när skotat var 561).
    expect(skotat.querySelector('[data-tal="gallring"]')?.textContent).toBe(fmt(800))
    expect(skotat.querySelector('[data-landar="gallring"]')?.textContent).toBe(`Landar på ${fmt(1020)}`)
    expect(skotat.querySelector('[data-spar="gallring"]')?.textContent).toContain('Hinner')
    expect(skotat.querySelector('[data-tal="slutavverkning"]')?.textContent).toBe(fmt(3000))
    expect(skotat.querySelector('[data-landar="slutavverkning"]')?.textContent).toBe(`Landar på ${fmt(4000)}`)
    expect(skotat.querySelector('[data-spar="slutavverkning"]')?.textContent).toContain(`Fattas ${fmt(1000)}`)
    // Inga flikar, ingen Läge/Planering/Uppföljning-text.
    expect(cont.querySelector('[role="tablist"]')).toBeNull()
    expect(text()).not.toContain('Uppföljning')
    // Klar: ett datum per maskin — namn och datum, inga traktnamn på sidan.
    const klar = sektion('När blir maskinerna klara?')!
    const d = lasKlar(structuredClone(klarOkt))
    expect(klar.querySelectorAll('[data-klar]').length).toBe(d.maskiner.length)
    for (const t of d.trakter) expect(klar.textContent).not.toContain(t.namn.replace(/^\d+\s+/, '').slice(0, 12))
    // Maskinernas m³fub ligger bakom Mer › Maskiner, inte på sidan.
    expect(sektion('Skördare')).toBeNull()
    // Mer-raderna och admin-notisen.
    expect(sektion('Mer')!.textContent).toContain('Veckor')
    expect(sektion('Onsdagsnotis')).not.toBeNull()
  })

  it('Gör detta: högst tre rader på sidan, resten bakom "N saker till"; ett tryck på en maskin visar hennes trakter', async () => {
    await monter()
    const d = lasKlar(structuredClone(klarOkt))
    const sena = Object.values(raknaAlla(d)).filter(p => p.efterManad)
    const gor = sektion('Gör detta')
    if (sena.length === 0) expect(gor).toBeNull()
    else {
      const rader = Array.from(gor!.querySelectorAll('[data-gor]'))
      expect(rader.length).toBeLessThanOrEqual(4)
      expect(rader.filter(r => r.getAttribute('data-gor') !== 'alla').length).toBeLessThanOrEqual(3)
    }
    const forsta = cont.querySelector('[data-klar]') as HTMLButtonElement
    await act(async () => { forsta.click() })
    expect(cont.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(d.maskiner[0].namn)
  })

  it('oförklarat stopp blir en rad i Behöver dig; ett tryck öppnar Maskiner', async () => {
    q.hamtaKlar.mockResolvedValue({ data: null, error: 'nät' })
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ maskinStopp: [stoppRad({ oforklarade_datum: ['2026-10-14', '2026-10-15', '2026-10-16'] })] }), error: null })
    await monter()
    const rad = cont.querySelector('[data-gor="stod:PONS"]') as HTMLButtonElement
    expect(rad.textContent).toContain('Giant körde inte ons–fre')
    expect(rad.textContent).toContain('Ingen ledighet registrerad')
    // Klar-kortet säger att det inte gick att räkna — aldrig en tom lista.
    expect(sektion('När blir maskinerna klara?')!.textContent).toContain('Kunde inte räkna')
    await act(async () => { rad.click() })
    expect(cont.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('Egen skotning: en egen rubrik med en rad per objekt, räknas inte i Skotat; inget kort utan objekt; ett läsfel är ett fel', async () => {
    const egen = [{ objekt_id: '11124748', namn: 'Trestensdal gallring 2025.', vo_nummer: '11124748', typ: 'gallring', bolag: 'Vida', skordat: 178.4, senast_datum: '2026-10-10' }]
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ egenSkotning: egen }), error: null })
    await monter()
    const s = sektion('Egen skotning')!
    expect(s).not.toBeNull()
    expect(s.querySelectorAll('[data-egen-skotning]').length).toBe(1)
    expect(s.textContent).toContain('Trestensdal gallring')
    expect(s.textContent).toContain(`${fmt(178.4)} m³fub`)
    expect(s.textContent).toContain('Gallring · Vida')
    expect(s.textContent).toContain('räknas inte mot beställningen')
    // Skotat-talet är orört: 800, inte 800 + 178.
    expect(sektion('Skotat')!.querySelector('[data-tal="gallring"]')?.textContent).toBe(fmt(800))
    expect(sektion('Skotat')!.querySelector('[data-landar="gallring"]')?.textContent).toBe(`Landar på ${fmt(1020)}`)
    await act(async () => { root?.unmount() }); cont.remove()

    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ egenSkotning: [] }), error: null })
    await monter()
    expect(sektion('Egen skotning')).toBeNull()
    await act(async () => { root?.unmount() }); cont.remove()

    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ egenSkotning: null }), error: null })
    await monter()
    expect(sektion('Egen skotning')?.textContent).toContain('Kunde inte läsa egen skotning')
  })

  it('ett fel i månadsdatan är ett fel med Försök igen — aldrig tomma kort', async () => {
    q.hamtaManadsdata.mockResolvedValueOnce({ data: null, error: 'nätet' })
    await monter()
    expect(text()).toContain('Kunde inte läsa data')
    expect(sektion('Skotat')).toBeNull()
    const knapp = Array.from(cont.querySelectorAll('button')).find(b => b.textContent === 'Försök igen')!
    await act(async () => { knapp.click() })
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
    expect(sektion('Skotat')).not.toBeNull()
  })

  it('flyttförslaget är en rad; arket har EN knapp som skriver maskinen och läser om', async () => {
    await monter()
    const d = lasKlar(structuredClone(klarOkt))
    const { bastaFlytt } = await import('../_lib/klar')
    const f = bastaFlytt(d)
    const rad = cont.querySelector('[data-gor="flytt"]') as HTMLButtonElement | null
    if (!f) { expect(rad).toBeNull(); return }
    expect(rad!.textContent).toContain(`till `)
    await act(async () => { rad!.click() })
    const knapp = cont.querySelector('[data-flytta]') as HTMLButtonElement
    expect(knapp.textContent).toContain(f.till.namn)
    const anrop = q.hamtaKlar.mock.calls.length
    await act(async () => { knapp.click() })
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
    expect(q.tilldelaMaskin).toHaveBeenCalledWith(f.objekt_id, f.roll, f.till.maskin_id)
    expect(q.hamtaKlar.mock.calls.length).toBeGreaterThan(anrop)
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
