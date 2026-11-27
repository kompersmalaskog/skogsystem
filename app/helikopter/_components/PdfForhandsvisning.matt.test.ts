// @vitest-environment node
// MÄTT I RIKTIG CHROMIUM — finger och mus. jsdom har ingen layout och ingen touch, så det här är det enda som visar att
// "Spara" och "Dela" går att träffa i ett hörn: varje knapp är minst 44 px (appens minimiyta), de ligger inte ovanpå
// varandra, de syns helt på en smal telefon, raden rullar inte i sidled, och ett RIKTIGT fingertryck på Spara klickar en
// <a download> med rätt filnamn. Komponenten buntas med esbuild och körs i webbläsaren — ingen kopia av koden.
// pdf.js är stubbat (det finns ingen riktig PDF att rita här); nedladdningen är den RIKTIGA laddaNerFil, vi fångar bara
// klicket så webbläsaren inte börjar hämta. SPARA_SKRIV=<mapp> sparar skärmbilderna.
// Finns ingen Chromium hoppas mätningen över (KRAV_CHROMIUM=1 gör det till ett fel).
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hittaChromium } from '../../../lib/testStod/chromium'

const CHROMIUM = hittaChromium()
const rot = process.cwd()
const SKRIV = process.env.SPARA_SKRIV

function bunta(): string {
  const mapp = fs.mkdtempSync(path.join(os.tmpdir(), 'spara-pdf-'))
  // pdf.js: inget att rita här. Returnerar ett dokument med en sida vars render är klar direkt.
  const pdfjs = path.join(mapp, 'pdfjs-stub.ts')
  fs.writeFileSync(pdfjs, `
    export const GlobalWorkerOptions: { workerSrc?: string } = {}
    export function getDocument() {
      return { promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }),
          render: () => ({ promise: Promise.resolve() }),
        }),
        destroy: () => undefined,
      }) }
    }
  `)
  const ingang = path.join(mapp, 'entry.tsx')
  fs.writeFileSync(ingang, `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import PdfForhandsvisning from ${JSON.stringify(path.join(rot, 'app/helikopter/_components/PdfForhandsvisning'))}
    const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])
    ;(window as any).__nedladdat = []
    document.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement)?.closest?.('a[download]') as HTMLAnchorElement | null
      if (a) { (window as any).__nedladdat.push(a.download); e.preventDefault() }
    }, true)
    ;(window as any).montera = () => {
      const r = createRoot(document.getElementById('app')!)
      r.render(<PdfForhandsvisning skapa={async () => PDF} filnamn="skotningsrapport-11280797" titel="Skotningsrapport" onStang={() => undefined} />)
    }
  `)
  const ut = path.join(mapp, 'app.js')
  createRequire(import.meta.url)('esbuild').buildSync({
    entryPoints: [ingang], bundle: true, format: 'iife', outfile: ut, logLevel: 'error', jsx: 'automatic',
    nodePaths: [path.join(rot, 'node_modules')],
    alias: { 'pdfjs-dist/legacy/build/pdf.mjs': pdfjs, '@': rot },
    external: ['pdf-lib'], // bara dynamiskt, inuti funktioner vi aldrig anropar här
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  return ut
}

const SKARMAR = [
  { namn: 'smal telefon 360x640', w: 360, h: 640, touch: true },
  { namn: 'telefon 390x844', w: 390, h: 844, touch: true },
  { namn: 'maskindator 1280x800 (touch)', w: 1280, h: 800, touch: true },
  { namn: 'dator 1440x900 (mus)', w: 1440, h: 900, touch: false },
]

type Matt = {
  spara: { x: number; y: number; b: number; h: number } | null
  dela: { x: number; y: number; b: number; h: number } | null
  tillbaka: { x: number; y: number; b: number; h: number } | null
  sidbredd: number
  synlig: number
}

describe.skipIf(!CHROMIUM)('PdfForhandsvisning — Spara och Dela, mätt i Chromium', () => {
  it('båda knapparna är minst 44 px, ligger inte ovanpå varandra och syns helt; ett fingertryck sparar filen', async () => {
    const js = bunta()
    const b = await CHROMIUM!.launch({})
    try {
      for (const s of SKARMAR) {
        const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch && s.w < 800 })
        const pg = await ctx.newPage()
        await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000;color:#fff;font-family:-apple-system,system-ui,sans-serif}</style></head><body><div id="app"></div></body></html>')
        await pg.addScriptTag({ path: js })
        await pg.evaluate(() => (window as any).montera())
        await pg.waitForFunction(() => {
          const kn = Array.from(document.querySelectorAll('button')).find(k => k.textContent === 'Dela') as HTMLButtonElement | undefined
          return !!kn && !kn.disabled
        }, null, { timeout: 10_000 })

        const m: Matt = await pg.evaluate(() => {
          const hitta = (t: string) => Array.from(document.querySelectorAll('button'))
            .find(k => k.textContent === t || k.getAttribute('aria-label') === t)
          const ruta = (el?: Element) => {
            if (!el) return null
            const r = el.getBoundingClientRect()
            return { x: r.x, y: r.y, b: r.width, h: r.height }
          }
          return {
            spara: ruta(hitta('Spara')),
            dela: ruta(hitta('Dela')),
            tillbaka: ruta(hitta('Tillbaka')),
            sidbredd: document.documentElement.scrollWidth,
            synlig: document.documentElement.clientWidth,
          }
        })

        // Båda finns (Chromium på dator kan spara en fil).
        expect(m.spara, `${s.namn}: Spara saknas`).not.toBeNull()
        expect(m.dela, `${s.namn}: Dela saknas`).not.toBeNull()
        expect(m.tillbaka).not.toBeNull()

        for (const [namn, r] of [['Spara', m.spara!], ['Dela', m.dela!], ['Tillbaka', m.tillbaka!]] as const) {
          expect(r.h, `${s.namn}: ${namn} är ${r.h} px hög`).toBeGreaterThanOrEqual(44)
          expect(r.b, `${s.namn}: ${namn} är ${r.b} px bred`).toBeGreaterThanOrEqual(44)
          expect(r.x, `${s.namn}: ${namn} börjar utanför skärmen`).toBeGreaterThanOrEqual(0)
          expect(r.x + r.b, `${s.namn}: ${namn} slutar utanför skärmen`).toBeLessThanOrEqual(m.synlig + 0.5)
        }
        // Ingen överlappning: Tillbaka · … · Spara · Dela, i den ordningen.
        expect(m.tillbaka!.x + m.tillbaka!.b, `${s.namn}: Tillbaka krockar med Spara`).toBeLessThanOrEqual(m.spara!.x + 0.5)
        expect(m.spara!.x + m.spara!.b, `${s.namn}: Spara krockar med Dela`).toBeLessThanOrEqual(m.dela!.x + 0.5)
        // Ingen sidscroll.
        expect(m.sidbredd, `${s.namn}: sidan rullar i sidled`).toBeLessThanOrEqual(m.synlig + 1)

        // Ett riktigt tryck (finger där det finns, annars mus) sparar filen EN gång.
        if (s.touch) await pg.tap('button:text-is("Spara")')
        else await pg.click('button:text-is("Spara")')
        expect(await pg.evaluate(() => (window as any).__nedladdat), s.namn).toEqual(['skotningsrapport-11280797.pdf'])

        if (SKRIV) {
          fs.mkdirSync(SKRIV, { recursive: true })
          await pg.screenshot({ path: path.join(SKRIV, `spara-${s.w}x${s.h}.png`) })
        }
        await ctx.close()
      }
    } finally {
      await b.close()
    }
  }, 120_000)
})
