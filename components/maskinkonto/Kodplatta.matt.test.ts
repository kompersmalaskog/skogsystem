// @vitest-environment node
// MÄTT I RIKTIG CHROMIUM — finger och mus. jsdom har varken layout eller riktig touch, så det här är det enda som visar att kodplattan går att
// använda i en hytt: varje tangent är minst 44 px (appens minimiyta), tre kolumner i rät linje, hela plattan syns på en låg skärm utan att sidan
// rullar i sidled, ett fingertryck ger EN siffra (inte två: touch + emulerad mus), fjärde siffran loggar in direkt (ingen OK-knapp), och en fel
// kod töms och skakar. Själva komponenterna (KodPlatta, VemArDuArk) buntas med esbuild och körs i webbläsaren — inga kopior.
// MASKINKONTO_SKRIV=<mapp> sparar skärmbilderna. Finns ingen Chromium hoppas mätningen över (KRAV_CHROMIUM=1 gör det till ett fel).
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hittaChromium } from '../../lib/testStod/chromium'

const CHROMIUM = hittaChromium()
const rot = process.cwd()

function bunta(): string {
  const mapp = fs.mkdtempSync(path.join(os.tmpdir(), 'kodplatta-'))
  const stub = path.join(mapp, 'klient-stub.ts')
  fs.writeFileSync(stub, `
    export async function hamtaPersoner() { return (window as any).__personer }
    export async function lasUppMedKod(p: any, kod: string) { (window as any).__lasUpp.push([p.id, kod]); return (window as any).__svar }
  `)
  const ingang = path.join(mapp, 'entry.tsx')
  fs.writeFileSync(ingang, `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import KodPlatta from ${JSON.stringify(path.join(rot, 'components/maskinkonto/KodPlatta'))}
    import VemArDuArk from ${JSON.stringify(path.join(rot, 'components/maskinkonto/VemArDuArk'))}
    ;(window as any).montera = (vad: string) => {
      const el = document.getElementById('app')!
      const r = createRoot(el)
      if (vad === 'platta') r.render(<KodPlatta onFyra={(k) => (window as any).__fyra.push(k)} skakaNyckel={(window as any).__skak ?? 0} />)
      else r.render(<VemArDuArk efterUpplasning="/arbetsrapport" onStang={() => undefined} />)
    }
  `)
  const ut = path.join(mapp, 'app.js')
  createRequire(import.meta.url)('esbuild').buildSync({
    entryPoints: [ingang], bundle: true, format: 'iife', outfile: ut, logLevel: 'error', jsx: 'automatic',
    nodePaths: [path.join(rot, 'node_modules')], alias: { '@/lib/maskinkonto/klient': stub, '@': rot }, define: { 'process.env.NODE_ENV': '"production"' },
  })
  return ut
}

const SKARMAR = [
  { namn: 'smal telefon 360×640', w: 360, h: 640, touch: true },
  { namn: 'telefon 390×844', w: 390, h: 844, touch: true },
  { namn: 'maskindator 1280×800 (touch)', w: 1280, h: 800, touch: true },
  { namn: 'dator 1440×900 (mus)', w: 1440, h: 900, touch: false },
]

async function sida(b: any, s: { w: number; h: number; touch: boolean }, vad: 'platta' | 'ark') {
  const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch && s.w < 800 })
  const pg = await ctx.newPage()
  await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000;color:#fff;font-family:-apple-system,system-ui,sans-serif}</style></head><body><div id="app"></div></body></html>')
  await pg.addScriptTag({ path: bunta() })
  await pg.evaluate(() => { (window as any).__fyra = []; (window as any).__lasUpp = []; (window as any).__personer = [
    { id: 'p1', namn: 'Oskar Nilsson', roll: 'forare', harKod: true }, { id: 'p2', namn: 'Daniel', roll: 'forare', harKod: false }, { id: 'p3', namn: 'Martin', roll: 'admin', harKod: true } ]
    ;(window as any).__svar = { ok: false, fel: 'fel_kod', vantarTill: null } })
  await pg.evaluate((v: string) => (window as any).montera(v), vad)
  await pg.waitForTimeout(450)   // ark-animation
  return { pg, ctx }
}

const tryckKnapp = async (pg: any, s: { touch: boolean }, t: string) => {
  const r = await pg.locator(`[data-tangent="${t}"]`).boundingBox()
  const x = r.x + r.width / 2, y = r.y + r.height / 2
  if (s.touch) await pg.touchscreen.tap(x, y); else await pg.mouse.click(x, y)
}

describe.skipIf(!CHROMIUM)('kodplattan i riktig Chromium (finger och mus)', () => {
  for (const s of SKARMAR) {
    it(`${s.namn}: tangenterna ≥ 44 px i tre rader om fyra, rätt linje, ingen sidscroll, allt syns`, async () => {
      const b = await CHROMIUM!.launch({})
      try {
        const { pg } = await sida(b, s, 'ark')
        await pg.locator('[data-person="p1"]').click()
        await pg.waitForSelector('[data-tangent="5"]')
        await pg.waitForTimeout(450)
        const m = await pg.evaluate(() => {
          const t = Array.from(document.querySelectorAll('[data-tangent]')) as HTMLElement[]
          const rect = (e: Element) => e.getBoundingClientRect()
          const doc = document.documentElement
          return {
            tangenter: t.map(e => ({ t: e.getAttribute('data-tangent'), x: Math.round(rect(e).x), y: Math.round(rect(e).y), w: Math.round(rect(e).width), h: Math.round(rect(e).height), nere: rect(e).bottom })),
            sidscroll: doc.scrollWidth > doc.clientWidth + 1, innerH: window.innerHeight,
            inte: Math.max(...Array.from(document.querySelectorAll('button')).filter(b => b.textContent === 'Det är inte jag').map(b => b.getBoundingClientRect().bottom)),
            prickar: document.querySelectorAll('[data-prick]').length,
          }
        })
        expect(m.tangenter.length).toBe(11)                                 // 1–9, 0, sudda
        for (const t of m.tangenter) { expect(t.w, t.t).toBeGreaterThanOrEqual(44); expect(t.h, t.t).toBeGreaterThanOrEqual(44) }
        const x = (ts: string[]) => ts.map(k => m.tangenter.find((t: { t: string; x: number }) => t.t === k)!.x)
        expect(new Set(x(['1', '4', '7'])).size).toBe(1)                    // första kolumnen (under den står en tom plats)
        expect(new Set(x(['2', '5', '8', '0'])).size).toBe(1)               // mittenkolumnen
        expect(new Set(x(['3', '6', '9', 'sudda'])).size).toBe(1)           // tredje kolumnen
        expect(m.sidscroll).toBe(false)
        for (const t of m.tangenter) expect(t.nere, `${t.t} syns utan att rulla`).toBeLessThanOrEqual(m.innerH)
        expect(m.inte).toBeLessThanOrEqual(m.innerH)
        expect(m.prickar).toBe(4)
        if (process.env.MASKINKONTO_SKRIV) { fs.mkdirSync(process.env.MASKINKONTO_SKRIV, { recursive: true }); await pg.screenshot({ path: path.join(process.env.MASKINKONTO_SKRIV, `kodplatta-${s.w}x${s.h}.png`) }) }
      } finally { await b.close() }
    }, 60_000)
  }

  for (const s of [SKARMAR[1], SKARMAR[3]]) {
    it(`${s.namn}: ett tryck = EN siffra (inget dubbeltryck från touch + emulerad mus), fjärde siffran skickas direkt, ingen OK-knapp`, async () => {
      const b = await CHROMIUM!.launch({})
      try {
        const { pg } = await sida(b, s, 'platta')
        expect(await pg.evaluate(() => /\bOK\b/.test(document.body.textContent || ''))).toBe(false)
        await tryckKnapp(pg, s, '4')
        expect(await pg.evaluate(() => Array.from(document.querySelectorAll('[data-prick]')).filter(p => p.getAttribute('data-prick') === 'full').length)).toBe(1)
        await tryckKnapp(pg, s, '7'); await tryckKnapp(pg, s, '1')
        expect(await pg.evaluate(() => (window as any).__fyra)).toEqual([])    // tre siffror: inget skickat än
        await tryckKnapp(pg, s, '1')
        expect(await pg.evaluate(() => (window as any).__fyra)).toEqual(['4711'])
      } finally { await b.close() }
    }, 60_000)

    it(`${s.namn}: hela flödet — namn, kod, fel kod töms och skakar, rätt kod skickar rätt person och rätt kod`, async () => {
      const b = await CHROMIUM!.launch({})
      try {
        const { pg } = await sida(b, s, 'ark')
        // Daniel har ingen kod: bara beskedet
        await pg.locator('[data-person="p2"]').click()
        expect(await pg.locator('[data-ingen-kod]').textContent()).toBe('Välj din kod i telefonen först')
        expect(await pg.locator('[data-kodplatta]').count()).toBe(0)
        await pg.getByText('Det är inte jag').click()
        // Oskar, fel kod
        await pg.locator('[data-person="p1"]').click()
        await pg.waitForSelector('[data-tangent="1"]')
        for (const t of ['0', '0', '0']) await tryckKnapp(pg, s, t)
        await tryckKnapp(pg, s, '0')
        await pg.waitForTimeout(80)
        const efter = await pg.evaluate(() => ({ full: Array.from(document.querySelectorAll('[data-prick]')).filter(p => p.getAttribute('data-prick') === 'full').length, skakar: (document.querySelector('[role="status"]') as HTMLElement).getAnimations().length, text: document.querySelector('[role="alert"]')?.textContent, anrop: (window as any).__lasUpp }))
        expect(efter.full).toBe(0); expect(efter.skakar).toBeGreaterThan(0); expect(efter.text).toBe('Fel kod. Försök igen.')
        expect(efter.anrop).toEqual([['p1', '0000']])
      } finally { await b.close() }
    }, 60_000)
  }
})
