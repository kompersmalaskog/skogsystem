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
  hamtaMaskiner: vi.fn(), hamtaMaskinTakter: vi.fn(), hamtaBolag: vi.fn(), hamtaPrognosUtfall: vi.fn(), hamtaSkogKort: vi.fn(async () => ({ data: new Map(), error: null })), hamtaPrognosFacit: vi.fn(async () => ({ data: [], error: null })), tilldelaMaskin: vi.fn(), hamtaHistorik: vi.fn(), hamtaKlar: vi.fn(), hamtaSenasteArbete: vi.fn(async (): Promise<{ data: unknown[]; error: null }> => ({ data: [], error: null })), hamtaEgenSkotningTrakter: vi.fn(), hamtaMaskinObjekt: vi.fn(async (): Promise<{ data: unknown[]; error: null }> => ({ data: [], error: null })), hamtaEgetSkordat: vi.fn(async (): Promise<{ data: { objekt_id: string; maskin_id: string; volym: number }[]; error: null }> => ({ data: [], error: null })), sattEgenSkotning: vi.fn(async () => ({ error: null })), skickaVeckoNotis: vi.fn(), params: '', replace: vi.fn(),
}))
vi.mock('../_lib/queries', () => q)
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(q.params), useRouter: () => ({ replace: q.replace }) }))
vi.mock('@/lib/CurrentMedarbetareContext', () => ({ useCurrentMedarbetare: () => ({ medarbetare: { id: 'm1', roll: 'admin', maskin_id: null } }) }))
vi.mock('@/lib/objekt/data', () => ({ flyttaObjekt: vi.fn(async () => undefined), sattOrdning: vi.fn(async () => undefined) }))
vi.mock('@/lib/datumLokal', () => ({ ymdLokal: () => '2026-10-17' }))

import HelikopterVy from './HelikopterVy'
import { flyttaObjekt, sattOrdning } from '@/lib/objekt/data'

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
  q.params = 'ar=2026&manad=10&sida=laget'
  // Routern byter adress på riktigt: sidan läser om parametrarna när den ritas om (menyn, Planera).
  q.replace.mockImplementation((href: string) => { q.params = href.split('?')[1] ?? '' })
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
/** Routern i testet byter bara q.params; sidan läser dem när den ritas om. */
async function ritaOm() { await act(async () => { root!.render(<HelikopterVy />) }); for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve() }) }
const text = () => cont.textContent ?? ''
const sektion = (namn: string) => cont.querySelector(`section[aria-label="${namn}"]`) as HTMLElement | null

const takt = (typ: string, maskin_id: string, roll: string, volym_manad: number) => ({ typ, bas: 'bestallt', maskin_id, roll, takt: 100, takt_dagar: 5, kvar: 10, kvar_datum: [], volym_manad })
const takter = [
  takt('slutavverkning', 'PONS20SDJAA270231', 'skordare', 4800), takt('slutavverkning', 'A130743', 'skotare', 3000),
  takt('gallring', 'R64428', 'skordare', 900), takt('gallring', 'A030353', 'skotare', 800),
]

describe('/helikopter — tavlan', () => {
  it('Läget nu: ett kort per spår och maskintyp — ett ord, en stapel, "gjort" och "landar" — och inget annat', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    expect(text()).toContain('Oktober 2026')
    expect(text()).toContain('10 arbetsdagar kvar')
    expect(sektion(`Slutavverkning · beställt ${fmt(5000)}`)).not.toBeNull()
    expect(sektion(`Gallring · beställt ${fmt(1000)}`)).not.toBeNull()
    expect(cont.querySelectorAll('[data-lage-kort]').length).toBe(4)
    // Giant: 4 800 skördat, Skälviken hinns: landar 6 534 → över beställt.
    const sk = cont.querySelector('[data-lage-kort="slutavverkning:skordare"]') as HTMLElement
    expect(sk.querySelector('[data-lage-ord]')?.textContent).toContain('över')
    expect(sk.textContent).toContain(`${fmt(4800)} gjort`)
    expect(sk.textContent).toContain(`landar ${fmt(6534)}`)
    // Elefant: 3 000 skotat, landar 3 658 → fattas 1 342.
    const so = cont.querySelector('[data-lage-kort="slutavverkning:skotare"]') as HTMLElement
    expect(so.querySelector('[data-lage-ord]')?.textContent).toContain(`Fattas ${fmt(1342)}`)
    expect(so.textContent).toContain(`${fmt(3000)} gjort`)
    // Strecket "i fas idag": 0 av 10 arbetsdagar kvar-andel kommer ur månaden; det finns på pågående månad.
    expect(sk.querySelector('[data-i-fas]')).not.toBeNull()
    // De gamla korten, listorna och maskinraderna bor inte här — de bor i Planera.
    for (const n of ['Skotat', 'Gör detta', 'Egen skotning', 'Onsdagsnotis']) expect(sektion(n)).toBeNull()
    expect(cont.querySelector('[data-maskin], [data-trakt], [data-racker-rad], [data-rad-vaxla]')).toBeNull()
    expect(cont.querySelector('[role="tablist"]')).toBeNull()
    // Mer: det som är kvar.
    const mer = sektion('Mer')!
    for (const n of ['Träffsäkerhet', 'Veckor', 'Per bolag', 'Månadsplan', 'Onsdagsnotis']) expect(mer.textContent).toContain(n)
    const plan = Array.from(mer.querySelectorAll('a')).find(a => a.textContent?.includes('Månadsplan'))
    expect(plan?.getAttribute('href')).toBe('/helikopter/manadsplan?ar=2026&manad=10')
  })

  it('kör annat: en skotare som arbetat bara utanför kön får en rad på kortet och ingen prognos', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    q.hamtaSenasteArbete.mockResolvedValue({ data: [{ maskin_id: 'A130743', pa: [] }], error: null })
    await monter()
    const rad = cont.querySelector('[data-lage-kort="slutavverkning:skotare"] [data-kor-annat]')
    expect(rad?.textContent).toMatch(/kör annat just nu/)
    expect(cont.querySelector('[data-lage-kort="slutavverkning:skordare"] [data-kor-annat]')).toBeNull()
  })

  it('utfallet per maskin kunde inte läsas: korten står kvar med gjort, utan prognos', async () => {
    await monter() // takter: null
    const so = cont.querySelector('[data-lage-kort="slutavverkning:skotare"]') as HTMLElement
    expect(so.textContent).toContain(`${fmt(3000)} gjort`)
    expect(so.textContent).not.toContain('landar')
  })

  it('köerna kunde inte läsas: en rad säger det, och korten står kvar utan prognos', async () => {
    q.hamtaKlar.mockResolvedValue({ data: null, error: 'nät' })
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    expect(text()).toContain('Kunde inte läsa maskinernas trakter')
    expect(cont.querySelector('[data-lage-kort="slutavverkning:skotare"]')?.textContent).toContain(`${fmt(3000)} gjort`)
    expect(cont.querySelector('[data-lage-kort]')?.textContent).not.toContain('landar')
  })

  it('ett fel i månadsdatan är ett fel med Försök igen — aldrig tomma kort', async () => {
    q.hamtaManadsdata.mockResolvedValueOnce({ data: null, error: 'nätet' })
    await monter()
    expect(text()).toContain('Kunde inte läsa data')
    expect(cont.querySelector('[data-lage-kort]')).toBeNull()
    const knapp = Array.from(cont.querySelectorAll('button')).find(b => b.textContent === 'Försök igen')!
    await act(async () => { knapp.click() })
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
    expect(cont.querySelector('[data-lage-kort]')).not.toBeNull()
  })

  it('en annan månad: Idag-knappen finns, och en avslutad månad har ingen Månadens slut men länk till facit', async () => {
    q.params = 'ar=2026&manad=9&sida=laget'
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    expect(Array.from(cont.querySelectorAll('button')).some(b => b.textContent === 'Idag')).toBe(true)
    expect(cont.querySelector('[data-lage-kort]')?.textContent).not.toContain('landar')
    expect(q.hamtaKlar).not.toHaveBeenCalled()
    expect(sektion('Mer')!.textContent).toContain('Månadsfacit')
  })

  it('menyn: fyra sidor, Hinner vi? vald som standard, och ett tryck byter adress med månaden kvar', async () => {
    q.params = 'ar=2026&manad=10'
    await monter()
    const meny = Array.from(cont.querySelectorAll('[data-meny]')) as HTMLButtonElement[]
    expect(meny.map(b => b.querySelector('.hk-nav-text')!.textContent)).toEqual(['Hinner vi?', 'Läget nu', 'Planera', 'Månader'])
    expect(meny[0].getAttribute('aria-current')).toBe('page')
    expect(cont.querySelector('[data-sida="prognos"]')).not.toBeNull()
    await act(async () => { meny[3].click() })
    expect(q.replace).toHaveBeenLastCalledWith('/helikopter?ar=2026&manad=10&sida=manader', { scroll: false })
    await ritaOm()
    expect(cont.querySelector('[data-meny="manader"]')!.getAttribute('aria-current')).toBe('page')
    await act(async () => { (cont.querySelector('[data-meny="laget"]') as HTMLButtonElement).click() })
    expect(q.replace).toHaveBeenLastCalledWith('/helikopter?ar=2026&manad=10&sida=laget', { scroll: false })
  })

  it('Hinner vi? är första sidan och enkel: ett ord per spår och maskintyp, trakterna med ett besked var; detaljerna bor bakom "Visa detaljer"', async () => {
    q.params = 'ar=2026&manad=10'
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    expect(cont.querySelector('[data-sida="prognos"]')).not.toBeNull()
    expect(cont.querySelector('[data-sida="laget"]')).toBeNull()
    expect(cont.querySelector('[data-prognos-rubrik]')!.textContent).toMatch(/Vad ska vi göra\?|Inget behöver göras/)
    expect(cont.querySelector('[data-prognos-vy]')).toBeNull()
    expect(cont.textContent).not.toMatch(/G15h/)
    await act(async () => { (cont.querySelector('[data-visa-detaljer]') as HTMLButtonElement).click() })
    expect(cont.querySelector('[data-prognos-vy="trakt"]')).not.toBeNull()
    await act(async () => { (Array.from(cont.querySelectorAll('[role="tab"]')).find(b => b.textContent === 'Per maskin') as HTMLButtonElement).click() })
    expect(cont.querySelector('[data-prognos-vy="maskin"]')).not.toBeNull()
    await act(async () => { (cont.querySelector('[data-dolj-detaljer]') as HTMLButtonElement).click() })
    expect(cont.querySelector('[data-prognos-enkel]')).not.toBeNull()
  })

  it('Månader: hur gick det? — procenten per månad står på sin egen sida, inte i en sidokolumn', async () => {
    q.params = 'ar=2026&manad=10&sida=manader'
    await monter()
    const sida = cont.querySelector('[data-sida="manader"]')!
    expect(sida).not.toBeNull()
    expect(sida.textContent).toMatch(/%/)
    expect(sida.querySelector('a[href*="/helikopter/manad?"]')).not.toBeNull()
    expect(cont.querySelector('[data-sida="laget"]')).toBeNull()
    expect(cont.querySelector('.hk-sida')).toBeNull()
  })

  it('Läget nu har inga trakt-listor — de bor i Planera — och raderna leder dit', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    expect(cont.querySelector('[data-maste]')).toBeNull()
    expect(cont.querySelector('[data-lage-kort=\"gallring:skordare\"]')).not.toBeNull()
    await act(async () => { (cont.querySelector('[data-lage-kort=\"gallring:skordare\"]') as HTMLButtonElement).click() })
    expect(q.replace).toHaveBeenLastCalledWith('/helikopter?ar=2026&manad=10&sida=planera', { scroll: false })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('Planera: en sida i menyn — spåret och Skördare | Skotare är växlar, och skotarens rad öppnar den på Skotare', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    expect(cont.querySelector('[data-planera]')).toBeNull()
    await act(async () => { (cont.querySelector('[data-lage-kort=\"gallring:skordare\"]') as HTMLButtonElement).click() })
    expect(cont.querySelector('[data-meny="planera"]')!.getAttribute('aria-current')).toBe('page')
    const sida = cont.querySelector('[data-sida="planera"] [data-planera="gallring"]')!
    expect(sida).not.toBeNull()
    // Skördarens rad öppnar sidan på Skördare; Skotare är en växel på samma sida, inte en kolumn bredvid.
    const flik = (namn: string) => Array.from(sida.querySelectorAll('[role="tab"]')).find(b => b.textContent === namn) as HTMLButtonElement
    expect(flik('Skördare').getAttribute('aria-selected')).toBe('true')
    expect(sida.querySelector('[data-planera-svar="skordare"]')).not.toBeNull()
    expect(sida.querySelector('[data-planera-svar="skotare"]')).toBeNull()
    await act(async () => { flik('Skotare').click() })
    expect(cont.querySelector('[data-planera-svar="skotare"]')).not.toBeNull()
    // Hela sidan, inte ett ark: tavlans kort är borta, ingen dialog, ingen Tillbaka-knapp (menyn är vägen).
    expect(cont.querySelector('[data-racker]')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(cont.querySelector('[data-planera-tillbaka]')).toBeNull()
    // Två spår: en växel överst byter spår.
    const spar = cont.querySelector('[data-planera-spar]')!
    await act(async () => { (Array.from(spar.querySelectorAll('[role="tab"]')).find(b => b.textContent === 'Slutavverkning') as HTMLButtonElement).click() })
    expect(cont.querySelector('[data-planera="slutavverkning"]')).not.toBeNull()
    // Tillbaka på Läget nu via menyn, och skotarens rad öppnar Planera på Skotare.
    await act(async () => { (cont.querySelector('[data-meny="laget"]') as HTMLButtonElement).click() })
    await ritaOm()
    expect(cont.querySelector('[data-planera]')).toBeNull()
    await act(async () => { (cont.querySelector('[data-lage-kort=\"gallring:skotare\"]') as HTMLButtonElement).click() })
    const sida2 = cont.querySelector('[data-planera="gallring"]')!
    expect(Array.from(sida2.querySelectorAll('[role="tab"]')).find(b => b.textContent === 'Skotare')!.getAttribute('aria-selected')).toBe('true')
  })

  it('Räcker trakterna?: skotarens rad öppnar sina trakter med kvar-volym, vem som tar den och tid', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    const knapp = cont.querySelector('[data-lage-kort=\"gallring:skotare\"]') as HTMLButtonElement
    expect(knapp).not.toBeNull()
    await act(async () => { knapp.click() })
    expect(document.querySelector('[data-planera-svar="skotare"]')?.textContent).toMatch(/Skotaren (behöver|är klar)/)
    // Först: de trakter som måste skotas för beställningen — ingen klardatum.
    // Trakter med skotare och trakter utan står var för sig; ingen klardatum i någon av dem.
    expect(document.querySelector('[data-skot-behovs], [data-skot-utan], [data-skot-inte]')).not.toBeNull()
    for (const el of Array.from(document.querySelectorAll('[data-skot-behovs], [data-skot-utan], [data-skot-inte]'))) expect(el.textContent).not.toMatch(/klar /)
    const rader = Array.from(document.querySelectorAll('[data-skot-rad]')) as HTMLElement[]
    expect(rader.length).toBeGreaterThan(0)
    for (const r of rader) expect(r.querySelector('[data-maskin-rad]')?.textContent).toMatch(/\S/)
  })

  it('Räcker trakterna?: skördarens rad öppnar vilka trakter som behövs, och trakter som kan vänta flyttas till nästa månad (admin)', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    const knapp0 = cont.querySelector('[data-lage-kort=\"gallring:skordare\"]') as HTMLButtonElement
    await act(async () => { knapp0.click() })
    const under = document.querySelector('[data-behov-under]') as HTMLElement
    expect(document.querySelector('[data-planera-svar="skordare"]')?.textContent).toContain(`Skördaren behöver ${fmt(100)} m³ till`)
    expect(under.textContent).toMatch(/räcker|saknas|för mycket/)
    expect(document.querySelector('[data-behovs]')?.textContent).toContain('Behövs')
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
    // Efter flytten står man kvar på Planera (menyn är vägen härifrån), inte på en tavla man inte bad om.
    expect(document.querySelector('[data-sida="planera"] [data-planera]')).not.toBeNull()
  })
  it('ordning: pil ändrar förhandsvisningen, Spara skriver ordningen, Ångra ställer tillbaka', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    const mock = sattOrdning as unknown as ReturnType<typeof vi.fn>
    mock.mockClear()
    await monter()
    await act(async () => { (cont.querySelector('[data-lage-kort=\"gallring:skordare\"]') as HTMLButtonElement).click() })
    const forst = () => Array.from(document.querySelectorAll('[data-trakt-rad]')).map(e => e.getAttribute('data-trakt-rad'))
    const f0 = forst()
    expect(f0.length).toBeGreaterThan(1)
    expect(document.querySelector('[data-ordning-bar]')).toBeNull()
    // Första raden kan inte flyttas upp; ned byter plats med nästa.
    const rad0 = document.querySelector('[data-behovs-rad] [data-pil="keyboard_arrow_up"]') as HTMLButtonElement
    expect(rad0.disabled).toBe(true)
    await act(async () => { (document.querySelector('[data-behovs-rad] [data-pil="keyboard_arrow_down"]') as HTMLButtonElement).click() })
    expect(document.querySelector('[data-ordning-bar]')).not.toBeNull()
    expect(forst()[0]).toBe(f0[1])
    // Ångra: tillbaka, ingenting skrivet.
    await act(async () => { (document.querySelector('[data-angra-ordning]') as HTMLButtonElement).click() })
    expect(forst()).toEqual(f0)
    expect(mock).not.toHaveBeenCalled()
    // Ändra igen och spara: hela ordningen skrivs, i den ordning som visas.
    await act(async () => { (document.querySelector('[data-behovs-rad] [data-pil="keyboard_arrow_down"]') as HTMLButtonElement).click() })
    await act(async () => { (document.querySelector('[data-spara-ordning]') as HTMLButtonElement).click() })
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
    expect(mock).toHaveBeenCalledTimes(1)
    const skrivna = mock.mock.calls[0][0] as string[]
    expect(skrivna.indexOf(f0[1] as string)).toBeLessThan(skrivna.indexOf(f0[0] as string))
  })
  it('byt maskin: trakten är ett tryck och leder till "Vem ska ta den?"', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    await monter()
    await act(async () => { (cont.querySelector('[data-lage-kort=\"gallring:skordare\"]') as HTMLButtonElement).click() })
    const knapp = document.querySelector('[data-behovs-rad] button[aria-label$="byt maskin"]') as HTMLButtonElement
    expect(knapp).not.toBeNull()
    await act(async () => { knapp.click() })
    expect(document.body.textContent).toContain('Vem ska ta den?')
  })
  it('flytten faller: arket säger felet och stannar öppet', async () => {
    q.hamtaManadsdata.mockResolvedValue({ data: manadsdata({ takter }), error: null })
    ;(flyttaObjekt as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Objektet flyttades inte. Försök igen.'))
    await monter()
    await act(async () => { (cont.querySelector('[data-lage-kort=\"gallring:skordare\"]') as HTMLButtonElement).click() })
    await act(async () => { (document.querySelector('[data-flytta-manad]') as HTMLButtonElement).click() })
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
    expect(document.body.textContent).toContain('Objektet flyttades inte. Försök igen.')
    expect(document.querySelector('[data-behov-under]')).not.toBeNull()
  })
})
