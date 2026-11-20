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
    export async function begarKodNotis(p: any) { (window as any).__begar.push(p.id); return (window as any).__notis }
    export async function hamtaHarKod(id: string) { (window as any).__harKodAnrop.push(id); return (window as any).__harKod }
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
      ;(window as any).avmontera = () => r.unmount()
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
    ;(window as any).__svar = { ok: false, fel: 'fel_kod', vantarTill: null }
    ;(window as any).__begar = []; (window as any).__harKodAnrop = []; (window as any).__harKod = false
    ;(window as any).__notis = { typ: 'skickad', vantarTill: new Date(Date.now() + 120000).toISOString() } })
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
        // Daniel har ingen kod: en notis har skickats, ingen platta
        await pg.locator('[data-person="p2"]').click()
        await pg.waitForSelector('[data-kod-notis="skickad"]')
        expect(await pg.locator('[data-ingen-kod]').textContent()).toContain('Välj din kod i telefonen – vi har skickat en notis till dig')
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

// "Välj koden från maskinen": namn utan kod → notis, text, "Skicka igen" grå med nedräkning, sifferplatta när koden valts — med finger och mus.
describe.skipIf(!CHROMIUM)('Välj koden från maskinen i riktig Chromium (finger och mus)', () => {
  const tryckPaMitt = async (pg: any, s: { touch: boolean }, locator: string) => {
    const r = await pg.locator(locator).boundingBox()
    const x = r.x + r.width / 2, y = r.y + r.height / 2
    if (s.touch) await pg.touchscreen.tap(x, y); else await pg.mouse.click(x, y)
  }
  for (const s of SKARMAR) {
    it(`${s.namn}: tryck på namnet utan kod → notis begärs EN gång, texten syns, "Skicka igen" är grå (≥ 44 px) med nedräkning, inget scrollar i sidled`, async () => {
      const b = await CHROMIUM!.launch({})
      try {
        const { pg } = await sida(b, s, 'ark')
        await tryckPaMitt(pg, s, '[data-person="p2"]')
        await pg.waitForSelector('[data-kod-notis="skickad"]')
        expect(await pg.evaluate(() => (window as any).__begar)).toEqual(['p2'])
        const m = await pg.evaluate(() => {
          const t = document.querySelector('[data-kod-notis]') as HTMLElement, k = document.querySelector('[data-skicka-igen]') as HTMLButtonElement
          const doc = document.documentElement
          return { text: t.textContent, tBottom: t.getBoundingClientRect().bottom, kH: Math.round(k.getBoundingClientRect().height), kBottom: k.getBoundingClientRect().bottom, kText: k.textContent, kOff: k.disabled, kOpacity: getComputedStyle(k).opacity, sidscroll: doc.scrollWidth > doc.clientWidth + 1, innerH: window.innerHeight, platta: document.querySelectorAll('[data-kodplatta]').length }
        })
        expect(m.text).toBe('Välj din kod i telefonen – vi har skickat en notis till dig')
        expect(m.kText).toMatch(/^Skicka igen \((1[0-2]\d|\d{1,2}) s\)$/); expect(m.kOff).toBe(true); expect(Number(m.kOpacity)).toBeLessThan(0.6)
        expect(m.kH).toBeGreaterThanOrEqual(44)
        expect(m.sidscroll).toBe(false); expect(m.kBottom).toBeLessThanOrEqual(m.innerH); expect(m.tBottom).toBeLessThanOrEqual(m.innerH)
        expect(m.platta).toBe(0)
        // Ett tryck på den grå knappen gör ingenting (ingen andra notis).
        await tryckPaMitt(pg, s, '[data-skicka-igen]')
        await pg.waitForTimeout(150)
        expect(await pg.evaluate(() => (window as any).__begar)).toEqual(['p2'])
        if (process.env.MASKINKONTO_SKRIV) { fs.mkdirSync(process.env.MASKINKONTO_SKRIV, { recursive: true }); await pg.screenshot({ path: path.join(process.env.MASKINKONTO_SKRIV, `valj-kod-${s.w}x${s.h}.png`) }) }
      } finally { await b.close() }
    }, 60_000)
  }

  for (const s of [SKARMAR[0], SKARMAR[2], SKARMAR[3]]) {
    it(`${s.namn}: koden väljs i telefonen → sifferplattan kommer (inget låses upp av sig självt) → personen skriver koden med ${s.touch ? 'fingret' : 'musen'} → upplåsningen kräver koden`, async () => {
      const b = await CHROMIUM!.launch({})
      try {
        const { pg } = await sida(b, s, 'ark')
        await tryckPaMitt(pg, s, '[data-person="p2"]')
        await pg.waitForSelector('[data-kod-notis="skickad"]')
        await pg.waitForTimeout(3300)                                         // ett frågevarv: ännu ingen kod vald
        expect(await pg.locator('[data-kodplatta]').count()).toBe(0)
        expect(await pg.evaluate(() => (window as any).__harKodAnrop.length)).toBeGreaterThan(0)
        await pg.evaluate(() => { (window as any).__harKod = true })           // personen väljer sin kod i telefonen
        await pg.waitForSelector('[data-tangent="5"]', { timeout: 6000 })
        expect(await pg.evaluate(() => (window as any).__lasUpp)).toEqual([])  // plattan har kommit men ingenting är upplåst
        await pg.waitForTimeout(450)
        const tangenter = await pg.evaluate(() => Array.from(document.querySelectorAll('[data-tangent]')).map(e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, nere: r.bottom } }))
        for (const t of tangenter) { expect(t.w).toBeGreaterThanOrEqual(44); expect(t.h).toBeGreaterThanOrEqual(44); expect(t.nere).toBeLessThanOrEqual(s.h) }
        for (const t of ['2', '4', '6', '8']) await tryckKnapp(pg, s, t)
        expect(await pg.evaluate(() => (window as any).__lasUpp)).toEqual([['p2', '2468']])   // personen skrev koden — då, och först då, anropades upplåsningen
      } finally { await b.close() }
    }, 60_000)
  }

  for (const s of [SKARMAR[1], SKARMAR[3]]) {
    it(`${s.namn}: personen saknar push → reservtexten (Profil → Kod för maskinen), ingen "Skicka igen", inget fel, inget scrollar i sidled`, async () => {
      const b = await CHROMIUM!.launch({})
      try {
        const { pg } = await sida(b, s, 'ark')
        await pg.evaluate(() => { (window as any).__notis = { typ: 'ingen_push' } })
        await tryckPaMitt(pg, s, '[data-person="p2"]')
        await pg.waitForSelector('[data-kod-notis="ingen-push"]')
        const m = await pg.evaluate(() => ({ text: document.querySelector('[data-kod-notis]')!.textContent, igen: document.querySelectorAll('[data-skicka-igen]').length, fel: document.querySelectorAll('[role="alert"]').length, sidscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }))
        expect(m).toEqual({ text: 'Öppna appen i telefonen → Profil → Kod för maskinen', igen: 0, fel: 0, sidscroll: false })
      } finally { await b.close() }
    }, 60_000)

    it(`${s.namn}: arket stängs medan koden väljs → ingenting låses upp och frågandet har slutat`, async () => {
      const b = await CHROMIUM!.launch({})
      try {
        const { pg } = await sida(b, s, 'ark')
        await tryckPaMitt(pg, s, '[data-person="p2"]')
        await pg.waitForSelector('[data-kod-notis="skickad"]')
        await pg.evaluate(() => (window as any).avmontera())
        const fore = await pg.evaluate(() => (window as any).__harKodAnrop.length)
        await pg.evaluate(() => { (window as any).__harKod = true })
        await pg.waitForTimeout(3600)
        expect(await pg.evaluate(() => (window as any).__harKodAnrop.length)).toBe(fore)
        expect(await pg.evaluate(() => (window as any).__lasUpp)).toEqual([])
      } finally { await b.close() }
    }, 60_000)
  }
})
