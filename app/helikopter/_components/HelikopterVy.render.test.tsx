// @vitest-environment jsdom
/**
 * /helikopter monteras på riktigt (jsdom, queries utbytta mot prod-formade svar) som EN sida: svaret, tavlan (ett kort per spår med
 * Skördat och Skotat, en rad per maskin med Nu och Landar, summan mot beställt), flytta en trakt, Mer, och att ett fel är ett fel.
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
  hamtaMaskiner: vi.fn(), hamtaMaskinTakter: vi.fn(), hamtaBolag: vi.fn(), hamtaPrognosUtfall: vi.fn(), hamtaPrognosFacit: vi.fn(async () => ({ data: [], error: null })), tilldelaMaskin: vi.fn(), hamtaHistorik: vi.fn(), hamtaKlar: vi.fn(), hamtaEgenSkotningTrakter: vi.fn(), skickaVeckoNotis: vi.fn(), params: '', replace: vi.fn(),
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
  q.hamtaEgenSkotningTrakter.mockResolvedValue({ data: new Set(), error: null })
})
afterEach(async () => { await act(async () => { root?.unmount() }); cont?.remove(); root = null })
const text = () => cont.textContent ?? ''
const sektion = (namn: string) => cont.querySelector(`section[aria-label="${namn}"]`) as HTMLElement | null

const takt = (typ: string, maskin_id: string, roll: string, volym_manad: number) => ({ typ, bas: 'bestallt', maskin_id, roll, takt: 100, takt_dagar: 5, kvar: 10, kvar_datum: [], volym_manad })
const takter = [
  takt('slutavverkning', 'PONS20SDJAA270231', 'skordare', 4800), takt('slutavverkning', 'A130743', 'skotare', 3000),
  takt('gallring', 'R64428', 'skordare', 900), takt('gallring', 'A030353', 'skotare', 800),
]
const block = (typ: string, roll: string) => cont.querySelector(`[data-spar="${typ}"] [data-block="${roll}"]`) as HTMLElement
const SKALVIKEN = '84fa6474'

describe('/helikopter — tavlan', () => {
  it('svaret och ett kort per spår: Skördat och Skotat, en rad per maskin med Nu och Landar, summan mot beställt', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    expect(text()).toContain('Oktober 2026')
    expect(text()).toContain('10 arbetsdagar kvar')
    expect(sektion(`Slutavverkning · beställt ${fmt(5000)}`)).not.toBeNull()
    expect(sektion(`Gallring · beställt ${fmt(1000)}`)).not.toBeNull()
    // Giant: 4 800 skördat. Skälviken (1 734, 58 h på 7,09 h/dag = 9 av 10 dagar kvar) hinns: landar 6 534.
    const sk = block('slutavverkning', 'skordare')
    expect(sk.querySelector('[data-nu="PONS20SDJAA270231"]')?.textContent).toBe(fmt(4800))
    expect(sk.querySelector('[data-landar="PONS20SDJAA270231"]')?.textContent).toBe(fmt(6534))
    expect(sk.querySelector('[data-summa]')?.textContent).toContain('över')
    // Elefant: 3 000 skotat. Skälviken 100 h på 7,59 h/dag = 13,2 dagar; föraren är ledig 26–30 okt, så 5 dagar hinns: 3 000 + 1 734 × 5/13,17 = 3 658.
    const so = block('slutavverkning', 'skotare')
    expect(so.querySelector('[data-nu="A130743"]')?.textContent).toBe(fmt(3000))
    expect(so.querySelector('[data-landar="A130743"]')?.textContent).toBe(fmt(3658))
    expect(so.querySelector('[data-summa]')?.textContent).toContain(`Fattas ${fmt(1342)}`)
    expect(cont.querySelector('main h2')?.textContent).toBe(`Slutavverkning fattas ${fmt(1342)} · gallring ${fmt(200)}`)
    // Trakter utan maskin står som egna rader.
    expect(so.querySelector('[data-utan]')?.textContent).toContain('Ingen maskin')
    // Kvar i skogen = ingående + skördat − skotat.
    expect(cont.querySelector('[data-kvar="slutavverkning"]')?.textContent).toContain(fmt(1800))
    // De gamla korten är borta, inga flikar.
    for (const n of ['Skotat', 'Gör detta', 'När blir maskinerna klara?', 'Egen skotning', 'Onsdagsnotis']) expect(sektion(n)).toBeNull()
    expect(cont.querySelector('[role="tablist"]')).toBeNull()
    // Mer: det som är kvar.
    const mer = sektion('Mer')!
    for (const n of ['Träffsäkerhet', 'Veckor', 'Per bolag', 'Månadsplan', 'Onsdagsnotis']) expect(mer.textContent).toContain(n)
    for (const n of ['Skördat', 'Takt och stopp', 'Månadsfacit']) expect(mer.textContent).not.toContain(n)
    const plan = Array.from(mer.querySelectorAll('a')).find(a => a.textContent?.includes('Månadsplan'))
    expect(plan?.getAttribute('href')).toBe('/helikopter/manadsplan?ar=2026&manad=10')
  })

  it('ett tryck på en maskin visar hennes trakter; ett tryck på en trakt flyttar den med EN knapp som skriver och läser om', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    const so = block('slutavverkning', 'skotare')
    expect(so.querySelector('[data-trakt]')).toBeNull()
    await act(async () => { (so.querySelector('[data-maskin="A130743"] button') as HTMLButtonElement).click() })
    const trakt = block('slutavverkning', 'skotare').querySelector('[data-trakt]') as HTMLButtonElement
    expect(trakt.textContent).toContain('Skälviken')
    await act(async () => { trakt.click() })
    const val = Array.from(cont.querySelectorAll('[data-val]')) as HTMLButtonElement[]
    expect(val[0].getAttribute('data-val')).toBe('A130743')
    expect(val[0].getAttribute('aria-checked')).toBe('true')
    const knapp = cont.querySelector('[data-flytta]') as HTMLButtonElement
    expect(knapp.disabled).toBe(true)
    const wisent = val.find(v => v.getAttribute('data-val') === 'A030353')!
    await act(async () => { wisent.click() })
    expect(knapp.textContent).toBe('Flytta till Wisent')
    const anrop = q.hamtaKlar.mock.calls.length
    await act(async () => { knapp.click() })
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
    expect(q.tilldelaMaskin).toHaveBeenCalledTimes(1)
    expect(q.tilldelaMaskin.mock.calls[0][0]).toMatch(new RegExp(`^${SKALVIKEN}`))
    expect(q.tilldelaMaskin.mock.calls[0].slice(1)).toEqual(['skotare', 'A030353'])
    expect(q.hamtaKlar.mock.calls.length).toBeGreaterThan(anrop)
    expect(cont.querySelector('[data-flytta]')).toBeNull()
  })

  it('egen skotning: trakten står aldrig som "Ingen maskin" och räknas inte', async () => {
    const d = lasKlar(structuredClone(klarOkt))
    const egna = new Set(d.trakter.filter(t => t.namn.startsWith('Trestensdal')).map(t => t.objekt_id))
    q.hamtaEgenSkotningTrakter.mockResolvedValue({ data: egna, error: null })
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    const utan = Array.from(block('gallring', 'skotare').querySelectorAll('[data-utan]')).map(e => e.textContent ?? '')
    expect(utan.length).toBeGreaterThan(0)
    expect(utan.some(u => u.includes('Trestensdal'))).toBe(false)
  })

  it('utfallet per maskin kunde inte läsas: spårets summor står kvar', async () => {
    await monter() // takter: null
    expect(block('slutavverkning', 'skotare').querySelector('[data-summa]')?.textContent).toContain(fmt(3000))
    expect(block('gallring', 'skordare').querySelector('[data-summa]')?.textContent).toContain(fmt(900))
  })

  it('köerna kunde inte läsas: en rad säger det, och Nu står kvar', async () => {
    q.hamtaKlar.mockResolvedValue({ data: null, error: 'nät' })
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    expect(text()).toContain('Kunde inte läsa maskinernas trakter')
    expect(block('slutavverkning', 'skotare').querySelector('[data-nu="A130743"]')?.textContent).toBe(fmt(3000))
    expect(cont.querySelector('[data-landar]')).toBeNull()
  })

  it('ett fel i månadsdatan är ett fel med Försök igen — aldrig tomma kort', async () => {
    q.hamtaManadsdata.mockResolvedValueOnce({ data: null, error: 'nätet' })
    await monter()
    expect(text()).toContain('Kunde inte läsa data')
    expect(cont.querySelector('[data-spar]')).toBeNull()
    const knapp = Array.from(cont.querySelectorAll('button')).find(b => b.textContent === 'Försök igen')!
    await act(async () => { knapp.click() })
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
    expect(cont.querySelector('[data-spar]')).not.toBeNull()
  })

  it('en annan månad: Idag-knappen finns, sidokolumnen länkar månaderna, och en avslutad månad har ingen Landar', async () => {
    q.params = 'ar=2026&manad=9'
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    expect(Array.from(cont.querySelectorAll('button')).some(b => b.textContent === 'Idag')).toBe(true)
    const vald = cont.querySelector('[data-manad="2026-9"]') as HTMLAnchorElement
    expect(vald.getAttribute('aria-current')).toBe('page')
    expect(vald.getAttribute('href')).toBe('/helikopter?ar=2026&manad=9')
    expect(cont.querySelector('[data-manad="2026-10"]')?.textContent).toContain('pågår')
    expect(cont.querySelector('[data-landar]')).toBeNull()
    expect(q.hamtaKlar).not.toHaveBeenCalled()
    expect(sektion('Mer')!.textContent).toContain('Månadsfacit')
  })
})
