// @vitest-environment jsdom
// MÄTT I RIKTIG CHROMIUM. jsdom räknar ingen layout: en problemrad som går utanför skärmen, en knapp under 44 px eller
// en rubrik som trycker ut kortet syns inte där. Testet renderar hela sidan i jsdom (läsningen utbytt mot produktionens
// fixtur, reglerna riktiga) och mäter HTML:en i Playwright-Chromium. Hoppas över utan Chromium — det står i testnamnet.
//
// Ikonfonten (Material Symbols) laddas inte här: ikonen får sin riktiga bredd med en stilregel i stället, annars
// skulle ordet "expand_more" stå som text och mätningen gälla något föraren aldrig ser.
//
// Sidans marginal (toppfältet + säker yta, skriven med env()) tappas när jsdom skriver ut stilen. Den sätts därför här
// med samma mått som i webbläsaren utan säker yta: 72 px upptill, 16 px i sidorna, 32 px nedtill.
//
// DATAHALSA_SKRIV=<mapp> sparar skärmbilderna.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FARG, FONT, IKON } from '@/lib/design/tokens'
import { hittaChromium } from '../../lib/testStod/chromium'
import { FX, NU, STATUS, byggDatahalsa, type Over } from './testStod'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./useDatahalsa', async (orig) => ({
  ...(await orig<typeof import('./useDatahalsa')>()),
  useDatahalsa: () => (globalThis as any).__dh,
}))
vi.mock('./SkotarLassKort', () => ({ default: () => <div data-testid="skotarlass-kort">Skotarens lass</div> }))

import DatahalsaPage from './page'

const CHROMIUM = hittaChromium()

const SKARMAR = [
  { namn: 'smal telefon 360', w: 360, h: 740 },
  { namn: 'telefon 390', w: 390, h: 844 },
  { namn: 'iPad stående 834', w: 834, h: 1112 },
  { namn: 'dator 1440', w: 1440, h: 900 },
]

const MITT = Date.parse('2026-11-23T12:00:00Z')
// Den längsta raden som förekommit: ett filnamn utan mellanslag att bryta på.
const LANGT = 'LARM OIMPORTERADE FILER i _vanta_stor_hpr: Sante_Dahl_Ålshult_PONS20SDJAA270231_20260602165212_3124_mycket_langt_filnamn_utan_mellanslag.hpr'
const LAGEN: { namn: string; nu: number; over: Over; fall: boolean }[] = [
  { namn: 'allt-fungerar', nu: NU, over: {}, fall: false },
  { namn: 'allt-fungerar-utfallt', nu: NU, over: {}, fall: true },
  {
    namn: 'fel', nu: MITT, fall: false,
    over: {
      nu: MITT,
      status: STATUS.map((r) => ({ ...r, kordTid: new Date(MITT - 600_000).toISOString(), ...(r.id === 'parkerade_filer' ? { status: 'LARM', larmAntal: 1, sammanfattning: LANGT } : {}) })),
      fel: FX.fel.filter((r) => Date.parse(r.tid) <= MITT), filer: FX.filer.filter((f) => Date.parse(f.importeradTid) <= MITT),
      lass: { antal: 19, m3: 380 }, koordinat: { fel: 'TypeError: Failed to fetch — https://mxydghzfacbenbgpodex.supabase.co/rest/v1/dim_objekt' },
    },
  },
  { namn: 'laddar', nu: NU, over: { laddar: true }, fall: false },
]

function html(l: (typeof LAGEN)[number]): string {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(l.nu))
  ;(globalThis as any).__dh = byggDatahalsa(l.over)
  document.body.innerHTML = ''
  const c = document.createElement('div')
  document.body.appendChild(c)
  const r = createRoot(c)
  act(() => { r.render(<DatahalsaPage />) })
  if (l.fall) act(() => { (c.querySelector('[data-testid="visa-allt"]') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  const h = c.innerHTML
  act(() => { r.unmount() })
  vi.useRealTimers()
  return h
}

const sida = (inner: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>html,body{margin:0;background:${FARG.bg};color:${FARG.text};font-family:${FONT}}`
  + `main{padding:72px 16px 32px!important}`
  + `.material-symbols-outlined{display:inline-block;width:${IKON.rad}px;height:${IKON.rad}px;overflow:hidden;white-space:nowrap;color:transparent!important}</style>`
  + `</head><body>${inner}</body></html>`

describe(`Datahälsa — ${CHROMIUM ? 'mätt i Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  it.skipIf(!CHROMIUM)('ingen sidscroll, inget sticker ut, träffytor minst 44 px, svaret störst', async () => {
    const b = await CHROMIUM!.launch({})
    const skriv = process.env.DATAHALSA_SKRIV
    try {
      for (const lage of LAGEN) {
        const sidHtml = sida(html(lage))
        for (const sk of SKARMAR) {
          const p = await b.newPage({ viewport: { width: sk.w, height: sk.h } })
          await p.setContent(sidHtml)
          const r = await p.evaluate(() => {
            const rot = document.body.firstElementChild as HTMLElement          // sidans rullande yta (position: fixed)
            const main = document.querySelector('main') as HTMLElement
            const mb = main.getBoundingClientRect()
            const rubrik = document.querySelector('[data-testid="svar-rubrik"]') as HTMLElement
            const prick = document.querySelector('[data-testid="svar-prick"]') as HTMLElement
            const tryck = Array.from(document.querySelectorAll('button, a')) as HTMLElement[]
            const alla = Array.from(main.querySelectorAll('*')) as HTMLElement[]
            return {
              sidscroll: rot.scrollWidth > rot.clientWidth || document.documentElement.scrollWidth > window.innerWidth,
              mainBredd: Math.round(mb.width),
              marginal: Math.round((document.querySelector('[data-testid="svar"]') as HTMLElement).getBoundingClientRect().left),
              utanfor: alla.filter((e) => { const eb = e.getBoundingClientRect(); return eb.width > 0 && (eb.right > mb.right + 0.5 || eb.left < mb.left - 0.5) }).length,
              rubrikPx: parseFloat(getComputedStyle(rubrik).fontSize),
              storstPx: Math.max(...alla.map((e) => parseFloat(getComputedStyle(e).fontSize))),
              prick: { w: prick.getBoundingClientRect().width, fore: prick.getBoundingClientRect().right <= rubrik.getBoundingClientRect().left + 0.5 },
              smaTraffytor: tryck.map((e) => ({ text: (e.textContent ?? '').slice(0, 30), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) }))
                .filter((t) => t.h < 44 || t.w < 44),
              antalTryck: tryck.length,
              problemToppar: Array.from(document.querySelectorAll('[data-testid="svar-problem"] li')).map((li) => [Math.round(li.getBoundingClientRect().top), Math.round(li.getBoundingClientRect().bottom)]),
            }
          })
          const var_ = `${lage.namn} / ${sk.namn}`
          expect(r.sidscroll, `${var_}: sidscroll i sidled`).toBe(false)
          expect(r.utanfor, `${var_}: något sticker ut ur kolumnen`).toBe(0)
          expect(r.mainBredd, `${var_}: kolumnen är högst 560 px`).toBeLessThanOrEqual(560)
          expect(r.marginal, `${var_}: sidmarginalen finns`).toBeGreaterThanOrEqual(16)
          // Svaret är det största på sidan — "ett tal per vy är huvudsaken".
          expect(r.rubrikPx, `${var_}: svarets storlek`).toBe(30)
          expect(r.storstPx, `${var_}: något är större än svaret`).toBe(30)
          expect(r.prick.w, `${var_}: pricken syns`).toBeGreaterThanOrEqual(12)
          expect(r.prick.fore, `${var_}: pricken står före svaret`).toBe(true)
          expect(r.smaTraffytor, `${var_}: träffytor under 44 px`).toEqual([])
          // En rad per problem, under varandra.
          for (let i = 1; i < r.problemToppar.length; i++) {
            expect(r.problemToppar[i][0], `${var_}: problem ${i + 1} ligger under problem ${i}`).toBeGreaterThanOrEqual(r.problemToppar[i - 1][1])
          }
          if (lage.namn === 'fel') {
            expect(r.problemToppar.length, `${var_}: fem problem`).toBe(5)
            expect(r.antalTryck, `${var_}: Försök igen + Visa-raden`).toBeGreaterThanOrEqual(2)
          }
          if (lage.namn === 'laddar') expect(r.antalTryck, `${var_}: inget att trycka på medan det läses`).toBe(0)
          if (skriv) {
            fs.mkdirSync(skriv, { recursive: true })
            // Sidans yta är position: fixed och rullar själv — ta hela innehållet genom att göra fönstret lika högt.
            const hojd = await p.evaluate(() => (document.body.firstElementChild as HTMLElement).scrollHeight)
            await p.setViewportSize({ width: sk.w, height: Math.max(sk.h, hojd) })
            await p.screenshot({ path: path.join(skriv, `datahalsa-${lage.namn}-${sk.w}.png`) })
          }
          await p.close()
        }
      }
    } finally {
      await b.close()
    }
  }, 120_000)
})
