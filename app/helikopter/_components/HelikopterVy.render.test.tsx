// @vitest-environment jsdom
/**
 * /helikopter monteras på riktigt (jsdom, queries utbytta mot prod-formade svar) som EN sida: svaret, tavlan (ett kort per spår med
 * Skördat och Skotat, en stapel mot beställt och en rad per maskin med Nu och Månadens slut), flytta en trakt, Mer, och att ett fel är ett fel.
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
  hamtaMaskiner: vi.fn(), hamtaMaskinTakter: vi.fn(), hamtaBolag: vi.fn(), hamtaPrognosUtfall: vi.fn(), hamtaSkogKort: vi.fn(async () => ({ data: new Map(), error: null })), hamtaPrognosFacit: vi.fn(async () => ({ data: [], error: null })), tilldelaMaskin: vi.fn(), hamtaHistorik: vi.fn(), hamtaKlar: vi.fn(), hamtaEgenSkotningTrakter: vi.fn(), hamtaMaskinObjekt: vi.fn(async (): Promise<{ data: unknown[]; error: null }> => ({ data: [], error: null })), hamtaEgetSkordat: vi.fn(async (): Promise<{ data: { objekt_id: string; maskin_id: string; volym: number }[]; error: null }> => ({ data: [], error: null })), sattEgenSkotning: vi.fn(async () => ({ error: null })), skickaVeckoNotis: vi.fn(), params: '', replace: vi.fn(),
}))
vi.mock('../_lib/queries', () => q)
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(q.params), useRouter: () => ({ replace: q.replace }) }))
vi.mock('@/lib/CurrentMedarbetareContext', () => ({ useCurrentMedarbetare: () => ({ medarbetare: { id: 'm1', roll: 'admin', maskin_id: null } }) }))
vi.mock('@/lib/objekt/data', () => ({ flyttaObjekt: vi.fn(async () => undefined) }))
vi.mock('@/lib/datumLokal', () => ({ ymdLokal: () => '2026-10-17' }))

import HelikopterVy from './HelikopterVy'
import { flyttaObjekt } from '@/lib/objekt/data'

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
  ;(flyttaObjekt as unknown as ReturnType<typeof vi.fn>).mockClear()
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
  q.hamtaEgetSkordat.mockResolvedValue({ data: [], error: null })
  q.hamtaMaskinObjekt.mockResolvedValue({ data: [], error: null })
  q.sattEgenSkotning.mockResolvedValue({ error: null })
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
/** Detaljerna (maskiner, trakter) ligger bakom ett tryck på raden Skördare/Skotare. */
async function oppnaRader() { for (const b of Array.from(cont.querySelectorAll('[data-rad-vaxla]')) as HTMLElement[]) await act(async () => { b.click() }) }
async function oppnaMer() { await act(async () => { (cont.querySelector('[data-mer] button') as HTMLElement).click() }) }

describe('/helikopter — tavlan', () => {
  it('svaret och ett kort per spår: Skördat och Skotat, en stapel mot beställt och en rad per maskin med Nu och Månadens slut', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    await oppnaRader()
    expect(text()).toContain('Oktober 2026')
    expect(text()).toContain('10 arbetsdagar kvar')
    expect(sektion(`Slutavverkning · beställt ${fmt(5000)}`)).not.toBeNull()
    expect(sektion(`Gallring · beställt ${fmt(1000)}`)).not.toBeNull()
    // Giant: 4 800 skördat. Skälviken (1 734, 58 h på 7,09 h/dag = 9 av 10 dagar kvar) hinns: landar 6 534.
    const sk = block('slutavverkning', 'skordare')
    expect(sk.querySelector('[data-nu="PONS20SDJAA270231"]')?.textContent).toBe(fmt(4800))
    expect(sk.querySelector('[data-landar="PONS20SDJAA270231"]')?.textContent).toBe(fmt(6534))
    expect(sk.querySelector('[data-summa]')?.textContent).toContain('över')
    // Stapeln mot beställt: texten under säger nu och månadens slut av beställt; går det över står ett streck vid beställt.
    expect(sk.querySelector('[data-stapeltext]')?.textContent).toBe(`Gjort ${fmt(4800)}Prognos ${fmt(6534)} av ${fmt(5000)}`)
    expect(sk.querySelector('[data-stapel-bestallt]')).not.toBeNull()
    expect((sk.querySelector('[data-stapel-nu]') as HTMLElement).style.width).toBe(`${(4800 / 6534) * 100}%`)
    // Ordet Landar finns inte kvar: kolumnen heter Prognos.
    expect(cont.querySelector('[data-spar="slutavverkning"]')?.textContent).not.toContain('Landar')
    // Elefant: 3 000 skotat. Skälviken 100 h på 7,59 h/dag = 13,2 dagar; föraren är ledig 26–30 okt, så 5 dagar hinns: 3 000 + 1 734 × 5/13,17 = 3 658.
    const so = block('slutavverkning', 'skotare')
    expect(so.querySelector('[data-nu="A130743"]')?.textContent).toBe(fmt(3000))
    expect(so.querySelector('[data-landar="A130743"]')?.textContent).toBe(fmt(3658))
    expect(so.querySelector('[data-summa]')?.textContent).toContain(`Fattas ${fmt(1342)}`)
    // Under beställt: inget streck, luckan i stapeln är det som fattas.
    expect(so.querySelector('[data-stapel-bestallt]')).toBeNull()
    expect((so.querySelector('[data-stapel-slut]') as HTMLElement).style.width).toBe(`${(3658 / 5000) * 100}%`)
    expect(cont.querySelector('main h2')?.textContent).toBe(`Slutavverkning fattas ${fmt(1342)} · gallring ${fmt(200)}`)
    // Trakter utan maskin står som egna rader.
    expect(so.querySelector('[data-utan]')?.textContent).toContain('Ingen maskin')
    // Kvar i skogen = ingående + skördat − skotat (bakom Mer om tavlan).
    await oppnaMer()
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
    await oppnaRader()
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

  it('egen skotning: aldrig "Ingen maskin" — skördaren får volymen, markägaren en egen rad, och valet går att göra', async () => {
    const d = lasKlar(structuredClone(klarOkt))
    const egna = new Set(d.trakter.filter(t => t.namn.startsWith('Trestensdal')).map(t => t.objekt_id))
    q.hamtaEgenSkotningTrakter.mockResolvedValue({ data: egna, error: null })
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter, egenSkotning: [{ objekt_id: 'dimT', namn: 'Trestensdal', vo_nummer: null, typ: 'gallring', bolag: manadsdata().spar.find((r: any) => r.typ === 'gallring')?.bolag?.[0] ?? null, skordat: 178, senast_datum: null }] }), error: null })
    q.hamtaEgetSkordat.mockResolvedValue({ data: [{ objekt_id: 'dimT', maskin_id: 'R64428', volym: 178 }], error: null })
    await monter()
    await oppnaRader()
    // Flera trakter utan maskin står på EN rad som fälls ut.
    const grupp = block('gallring', 'skotare').querySelector('[data-utan-grupp] button') as HTMLButtonElement
    expect(grupp.textContent).toContain('trakter utan maskin')
    expect(block('gallring', 'skotare').querySelector('[data-utan]')).toBeNull()
    await act(async () => { grupp.click() })
    const utan = Array.from(block('gallring', 'skotare').querySelectorAll('[data-utan]')).map(e => e.textContent ?? '')
    expect(utan.length).toBeGreaterThan(0)
    expect(utan.some(u => u.includes('Trestensdal'))).toBe(false)
    // Markägarens rad: det skördaren fällt där — och skördaren har fått samma volym.
    expect(block('gallring', 'skotare').querySelector('[data-nu="markagare"]')?.textContent).toBe(fmt(178))
    expect(block('gallring', 'skotare').querySelector('[data-maskin="markagare"]')?.textContent).toContain('Egen skotning')
    // Välj egen skotning på en trakt utan maskin.
    await act(async () => { (block('gallring', 'skotare').querySelector('[data-utan] button') as HTMLButtonElement).click() })
    await act(async () => { (document.querySelector('[data-val="egen"]') as HTMLButtonElement).click() })
    expect(document.querySelector('[data-flytta]')?.textContent).toBe('Välj egen skotning')
    await act(async () => { (document.querySelector('[data-flytta]') as HTMLButtonElement).click() })
    expect(q.sattEgenSkotning).toHaveBeenCalledWith(expect.any(String), true)
    expect(q.tilldelaMaskin).not.toHaveBeenCalled()
  })

  it('utfallet per maskin kunde inte läsas: spårets summor står kvar', async () => {
    await monter() // takter: null
    expect(block('slutavverkning', 'skotare').querySelector('[data-stapeltext]')?.textContent).toContain(fmt(3000))
    expect(block('gallring', 'skordare').querySelector('[data-stapeltext]')?.textContent).toContain(fmt(900))
  })

  it('utanför beställningen: står under maskinen i ord, trakterna när hon fälls ut — aldrig i talkolumnerna, och ingen rad när det inte gick att läsa', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    q.hamtaMaskinObjekt.mockResolvedValue({ data: [
      { maskin_id: 'PONS20SDJAA270231', roll: 'skordare', objekt_id: 'a', namn: 'Skälviken RP J-Hus -25', typ: 'Slutavverkning', bolag: 'Vida', egen_skotning: false, volym: 4800 },
      { maskin_id: 'PONS20SDJAA270231', roll: 'skordare', objekt_id: 'b', namn: 'Kjell-Erik Lindström Steglehylte', typ: 'Slutavverkning', bolag: 'Privat', egen_skotning: false, volym: 114.4 },
      { maskin_id: 'PONS20SDJAA270231', roll: 'skordare', objekt_id: 'c', namn: 'GROT Brokamåla', typ: 'Grot', bolag: 'Vida', egen_skotning: false, volym: 46 },
    ], error: null })
    await monter()
    await oppnaRader()
    const giant = block('slutavverkning', 'skordare').querySelector('[data-maskin="PONS20SDJAA270231"]') as HTMLElement
    expect(giant.querySelector('[data-utanfor]')?.textContent).toBe(`${fmt(160)} utanför beställningen`)
    expect(giant.querySelector('[data-nu]')?.textContent).toBe(fmt(4800))
    expect(giant.querySelector('[data-utanfor-lista]')).toBeNull()
    await act(async () => { (giant.querySelector('button') as HTMLButtonElement).click() })
    const lista = giant.querySelector('[data-utanfor-lista]')?.textContent ?? ''
    expect(lista).toContain('Skördat utanför beställningen')
    expect(lista.indexOf('Steglehylte')).toBeLessThan(lista.indexOf('Brokamåla'))
    expect(lista).not.toContain('Skälviken')
  })

  it('utanför beställningen kunde inte läsas: ingen rad — aldrig "0 utanför"', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    q.hamtaMaskinObjekt.mockResolvedValue({ data: null, error: 'nät' } as never)
    await monter()
    await oppnaRader()
    expect(cont.querySelector('[data-maskin]')).not.toBeNull()
    expect(cont.querySelector('[data-utanfor]')).toBeNull()
  })

  it('köerna kunde inte läsas: en rad säger det, och Nu står kvar', async () => {
    q.hamtaKlar.mockResolvedValue({ data: null, error: 'nät' })
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    await oppnaRader()
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

  it('en annan månad: Idag-knappen finns, sidokolumnen länkar månaderna, och en avslutad månad har ingen Månadens slut', async () => {
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

  it('Räcker trakterna?: skotarens rad öppnar sina trakter med kvar-volym, vem som tar den och tid', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    const knapp = cont.querySelector('[data-racker-rad="gallring:skotare"] button') as HTMLButtonElement
    expect(knapp).not.toBeNull()
    await act(async () => { knapp.click() })
    expect(document.querySelector('[data-skot-under]')?.textContent).toContain('Beställt')
    const rader = Array.from(document.querySelectorAll('[data-skot-rad]')) as HTMLElement[]
    expect(rader.length).toBeGreaterThan(0)
    // Varje trakt säger vem som tar den (eller "Ingen skotare") och tid eller "tid saknas" — aldrig tomt.
    for (const r of rader) expect(r.querySelector('[data-tid]')?.textContent).toMatch(/Ingen skotare|·/)
  })

  it('Räcker trakterna?: skördarens rad öppnar vilka trakter som behövs, och trakter som kan vänta flyttas till nästa månad (admin)', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    const knapp0 = cont.querySelector('[data-racker-rad="gallring:skordare"] button') as HTMLButtonElement
    await act(async () => { knapp0.click() })
    const under = document.querySelector('[data-behov-under]') as HTMLElement
    expect(under.textContent).toContain(`Beställt ${fmt(1000)} · gjort ${fmt(900)}`)
    expect(document.querySelector('[data-behovs]')?.textContent).toContain('Tar resten av behovet')
    expect(document.querySelector('[data-takt-ark]')?.textContent ?? '').toMatch(/Måste hålla|takt saknas/)
    // Tid per trakt: maskinens dagar, aldrig ett påhittat tal.
    expect(document.querySelector('[data-behovs] [data-tid]')?.textContent).toMatch(/arbetsdag|Tid saknas/)
    const inte = Array.from(document.querySelectorAll('[data-inte-rad]')) as HTMLElement[]
    expect(inte.length).toBeGreaterThan(0)
    // Allt som kan flyttas är förvalt; knappen säger vad den gör och vart.
    const flytta = document.querySelector('[data-flytta-manad]') as HTMLButtonElement
    expect(flytta.textContent).toBe(`Flytta ${inte.length} trakt${inte.length === 1 ? '' : 'er'} till november · ${fmt(100)} m³`)
    // Avmarkera en: knappen ändras (eller blir inaktiv när ingen är vald).
    await act(async () => { (inte[0].querySelector('button') as HTMLButtonElement).click() })
    expect(flytta.disabled).toBe(inte.length === 1)
    await act(async () => { (inte[0].querySelector('button') as HTMLButtonElement).click() })
    expect(flytta.disabled).toBe(false)
    await act(async () => { flytta.click() })
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
    // Flytten skrivs till objektets planerade månad (samma fält som Objekt-vyn): nästa månad efter den som visas.
    const mock = flyttaObjekt as unknown as ReturnType<typeof vi.fn>
    expect(mock).toHaveBeenCalledTimes(inte.length)
    expect(mock.mock.calls.map(c => c[0]).sort()).toEqual(inte.map(e => e.getAttribute('data-inte-rad')).sort())
    expect(mock.mock.calls[0][1]).toEqual({ ar: 2026, manad: 11 })
    expect(document.querySelector('[data-behov-under]')).toBeNull()
  })
  it('flytten faller: arket säger felet och stannar öppet', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    ;(flyttaObjekt as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Objektet flyttades inte. Försök igen.'))
    await monter()
    await act(async () => { (cont.querySelector('[data-racker-rad="gallring:skordare"] button') as HTMLButtonElement).click() })
    await act(async () => { (document.querySelector('[data-flytta-manad]') as HTMLButtonElement).click() })
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
    expect(document.body.textContent).toContain('Objektet flyttades inte. Försök igen.')
    expect(document.querySelector('[data-behov-under]')).not.toBeNull()
  })
})
