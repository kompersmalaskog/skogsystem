// @vitest-environment jsdom
// TAVLAN MÄTT I RIKTIG CHROMIUM (jsdom räknar ingen layout). Sidan renderas i jsdom mot prod-formade svar, HTML:en mäts i Chromium:
// ingen sidscroll, inga träffytor under 44 px, och talen i kolumnerna Nu och Månadens slut står rakt under varandra.
// Hoppas över utan Chromium. TAVLA_SKRIV=<mapp> sparar bilderna.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import klarOkt from '../_lib/__fixtures__/klar_2026-10-17.json'
import historikOkt from '../_lib/__fixtures__/historik_2026-10-15.json'
import { lasHistorik } from '../_lib/manadsfacit'
import { lasKlar } from '../_lib/klar'
import { FARG, FONT, TRAFFYTA } from '@/lib/design/tokens'
import { hittaChromium } from '../../../lib/testStod/chromium'

const q = vi.hoisted(() => ({
  hamtaFast: vi.fn(), hamtaManadsdata: vi.fn(), hamtaMaskinLage: vi.fn(), hamtaBolag: vi.fn(), hamtaPrognosUtfall: vi.fn(), hamtaSkogKort: vi.fn(async () => ({ data: new Map(), error: null })), hamtaPrognosFacit: vi.fn(),
  tilldelaMaskin: vi.fn(), hamtaHistorik: vi.fn(), hamtaKlar: vi.fn(), hamtaEgenSkotningTrakter: vi.fn(), hamtaMaskinObjekt: vi.fn(async (): Promise<{ data: unknown[]; error: null }> => ({ data: [], error: null })), hamtaEgetSkordat: vi.fn(async () => ({ data: [], error: null })), sattEgenSkotning: vi.fn(async () => ({ error: null })), skickaVeckoNotis: vi.fn(),
}))
vi.mock('../_lib/queries', () => q)
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('ar=2026&manad=10'), useRouter: () => ({ replace: () => {} }) }))
vi.mock('@/lib/CurrentMedarbetareContext', () => ({ useCurrentMedarbetare: () => ({ medarbetare: { id: 'm1', roll: 'admin', maskin_id: null } }) }))
vi.mock('@/lib/datumLokal', () => ({ ymdLokal: () => '2026-10-17' }))

import HelikopterVy from './HelikopterVy'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const CHROMIUM = hittaChromium()
const SKARMAR = [{ w: 360, h: 740 }, { w: 390, h: 844 }, { w: 834, h: 1112 }, { w: 1440, h: 900 }]

const spar = (typ: string, x: Record<string, unknown>) => ({
  typ, bas: 'bestallt', bestallt: 1000, bolag: ['Vida'], skordat: 242, skotat: 0, takt_skordat: 33, takt_skotat: null, takt_dagar: 5, takt_fonster: [],
  oskotat_forandring_per_dag: 0, ingaende_oskotat: 98, oskotat_objekt: [], ...x,
})
const takt = (typ: string, maskin_id: string, roll: string, volym_manad: number) => ({ typ, bas: 'bestallt', maskin_id, roll, takt: 100, takt_dagar: 5, kvar: 10, kvar_datum: [], volym_manad })
const data = {
  spar: [spar('gallring', {}), spar('slutavverkning', { bestallt: 5000, skordat: 3675, skotat: 1345, ingaende_oskotat: 1530 })],
  arbetsdagar: [{ maskin_id: null, totalt: 22, gangna: 12, kvar: 10, gangna_datum: [], kvar_datum: [] }],
  planering: [], stopp: [], bestallningar: [], utanTyp: [], egenSkotning: [], rapportdagar: null,
  takter: [takt('slutavverkning', 'PONS20SDJAA270231', 'skordare', 3675), takt('slutavverkning', 'A130743', 'skotare', 1345), takt('gallring', 'R64428', 'skordare', 242)],
  maskinStopp: [{ maskin_id: 'A130743', namn: 'Elefant 26', roll: 'skotare', stopp_fran: '2026-10-26', stopp_till: '2026-10-30', stopp_orsak: 'ledig:Daniel', stopp_status: 'kommande', stopp_kor_igen: '2026-11-02', stopp_dagar: 5, stopp_dagar_gangna: 0, stopp_dagar_manad: 5, stopp_orsaker_manad: [], oforklarade_datum: [], takt_fran: null }],
}

async function html(klick: string[]): Promise<string> {
  for (const f of Object.values(q)) f.mockReset()
  q.hamtaFast.mockResolvedValue({ data: { maskiner: [], senasteData: '2026-10-17T06:00:00Z', avvikelse: [], g15: {} }, error: null })
  q.hamtaManadsdata.mockResolvedValue({ data, error: null })
  q.hamtaPrognosUtfall.mockResolvedValue({ data: [], error: null })
  q.hamtaHistorik.mockResolvedValue({ data: lasHistorik(historikOkt), error: null })
  q.hamtaKlar.mockResolvedValue({ data: lasKlar(structuredClone(klarOkt)), error: null })
  q.hamtaEgenSkotningTrakter.mockResolvedValue({ data: new Set(), error: null })
  q.hamtaEgetSkordat.mockResolvedValue({ data: [], error: null })
  q.hamtaMaskinObjekt.mockResolvedValue({ data: [{ maskin_id: 'R64428', roll: 'skordare', objekt_id: 'p1', namn: 'Kjell-Erik Lindström Steglehylte', typ: 'Gallring', bolag: 'Privat', egen_skotning: false, volym: 270 }], error: null })
  q.sattEgenSkotning.mockResolvedValue({ error: null })
  document.body.innerHTML = ''
  const c = document.createElement('div'); document.body.appendChild(c)
  const r = createRoot(c)
  await act(async () => { r.render(<HelikopterVy />) })
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() })
  for (const k of klick) {
    await act(async () => { (document.querySelector(k) as HTMLElement).click() })
    for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve() })
  }
  const h = document.body.innerHTML
  await act(async () => { r.unmount() })
  return h
}
const sida = (inner: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>html,body{margin:0;background:${FARG.bg};color:${FARG.text};font-family:${FONT}}`
  + `.material-symbols-outlined{font-size:0 !important;display:inline-block;width:18px;height:18px}`
  + `.sheet-upp,.tona-opacity{animation:none !important;opacity:1 !important;transform:none !important}</style></head><body>${inner}</body></html>`

describe(`Tavlan — ${CHROMIUM ? 'mätt i Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  it.skipIf(!CHROMIUM)('ingen sidscroll, inga träffytor under 44 px, talen i raka kolumner', async () => {
    const rad = '[data-spar="slutavverkning"] [data-rad-vaxla="skotare"]'
    const maskin = '[data-spar="slutavverkning"] [data-block="skotare"] [data-maskin="A130743"] button'
    const vyer = [
      { namn: 'sida', html: await html([]) },
      { namn: 'gor', html: await html(['[data-gor-rad="utan"] button']) },
      { namn: 'oppen', html: await html([rad, maskin]) },
      { namn: 'flytta', html: await html([rad, maskin, '[data-spar="slutavverkning"] [data-block="skotare"] [data-trakt]']) },
    ]
    const b = await CHROMIUM!.launch({})
    const skriv = process.env.TAVLA_SKRIV
    try {
      for (const v of vyer) for (const s of SKARMAR) {
        const p = await b.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 })
        await p.setContent(sida(v.html))
        const r = await p.evaluate((min: number) => ({
          sidscroll: document.documentElement.scrollWidth > window.innerWidth,
          sma: Array.from(document.querySelectorAll('main a, main button, [role="dialog"] button'))
            .filter(e => (e as HTMLElement).offsetParent !== null)
            .map(e => ({ t: (e.textContent || e.getAttribute('aria-label') || '?').trim().slice(0, 24), h: Math.round(e.getBoundingClientRect().height) }))
            .filter(x => x.h + 0.5 < min),
          // Högerkanten på alla Nu-tal i ett block ska vara densamma (kolumnen står rak).
          sneda: Array.from(document.querySelectorAll('[data-block]')).map(bl => {
            const x = Array.from(bl.querySelectorAll('[data-nu]')).map(e => Math.round(e.getBoundingClientRect().right))
            return new Set(x).size
          }).filter(n => n > 1).length,
          utanfor: Array.from(document.querySelectorAll('[data-spar] *')).filter(e => e.getBoundingClientRect().right > window.innerWidth + 0.5).length,
          // Inget i kortet får sticka ut förbi stapelns högerkant (rubriken "Månadens slut" gjorde det innan den bröts på två rader).
          forbi: Array.from(document.querySelectorAll('[data-spar]')).map(k => {
            const h = Math.max(...Array.from(k.querySelectorAll('[data-stapel]')).map(e => e.getBoundingClientRect().right))
            return Array.from(k.querySelectorAll('span')).filter(e => (e as HTMLElement).offsetParent !== null && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis' || e.getBoundingClientRect().right > h + 1).length
          }).reduce((a, n) => a + n, 0),
        }), TRAFFYTA.min)
        expect(r.sidscroll, `${v.namn} ${s.w}: sidscroll`).toBe(false)
        expect(r.sma, `${v.namn} ${s.w}: små träffytor ${JSON.stringify(r.sma)}`).toEqual([])
        expect(r.sneda, `${v.namn} ${s.w}: sneda kolumner`).toBe(0)
        expect(r.utanfor, `${v.namn} ${s.w}: utanför skärmen`).toBe(0)
        expect(r.forbi, `${v.namn} ${s.w}: text förbi kortets kant`).toBe(0)
        if (skriv) { fs.mkdirSync(skriv, { recursive: true }); await p.screenshot({ path: path.join(skriv, `${v.namn}-${s.w}.png`), fullPage: v.namn !== 'flytta' }) }
        await p.close()
      }
    } finally { await b.close() }
  }, 120_000)
})
