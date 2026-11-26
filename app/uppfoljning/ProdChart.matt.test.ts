// @vitest-environment node
// "PRODUKTION PER DAG" I RIKTIG CHROMIUM (2026-11-26). jsdom har ingen layout, så
// att staplarna sköt ut ur kortet på långa objekt syntes inte där. Mätt före
// rättningen: från 11 dagar på 390 px, 10 på 360 px och 20 på 640 px låg de
// sista dagarna utanför kortet. Den riktiga komponenten (ProdChart) buntas med
// esbuild och renderas med React i webbläsaren.
// PROD_SKRIV=<mapp> sparar bilderna. Utan Chromium hoppas testet över (utom med KRAV_CHROMIUM=1).
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { hittaChromium } from '../../lib/testStod/chromium';

const CHROMIUM = hittaChromium();
const SKRIV = process.env.PROD_SKRIV;

async function bunta(): Promise<string> {
  const r = await build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { ProdChart } from './app/uppfoljning/ProdChart';
        window.RITA = (n, lass) => { const data = Array.from({ length: n }, (_, i) => ({ datum: (i % 28 + 1) + '/' + (10 + Math.floor(i / 28)), m3: 60 + (i * 53) % 190, lass: lass ? 3 + i % 4 : undefined }));
          createRoot(document.getElementById('r')).render(React.createElement(ProdChart, { data, color: '#a78bfa', snitt: 150 })); };`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' }, jsx: 'automatic',
    alias: { '@': process.cwd() },
  });
  return r.outputFiles[0].text;
}

// Uppföljningens marginal: 24 px runt kortet.
const SIDA = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#000;color:#fff;font-family:Helvetica,Arial}#r{padding:0 24px}</style></head><body><div id="r"></div></body></html>';

describe.skipIf(!CHROMIUM)('Produktion per dag — riktig Chromium', () => {
  it('alla dagar ryms i kortet, siffror bara när de ryms, datum krockar aldrig', async () => {
    const lib = await bunta();
    const b = await CHROMIUM!.launch({});
    try {
      for (const w of [360, 390, 640]) for (const n of [3, 6, 11, 15, 20, 30, 40]) {
        const pg = await (await b.newContext({ viewport: { width: w, height: 600 }, hasTouch: true })).newPage();
        await pg.setContent(SIDA);
        await pg.addScriptTag({ content: lib });
        await pg.evaluate(([n]) => (window as any).RITA(n, false), [n]);
        await pg.waitForFunction((n) => document.querySelectorAll('[data-stapel]').length === n, n);
        await pg.waitForTimeout(50);
        const r = await pg.evaluate(() => {
          const kort = (document.querySelector('[data-stapel]') as HTMLElement).closest('[style*="border-radius"]')!.getBoundingClientRect();
          const staplar = [...document.querySelectorAll('[data-stapel]')].map((e) => e.getBoundingClientRect());
          const datum = [...document.querySelectorAll('[data-datum]')].map((e) => {
            const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect();
          });
          let krock = 0;
          for (let i = 1; i < datum.length; i++) if (datum[i].left < datum[i - 1].right + 2) krock++;
          return {
            inne: staplar.every((s) => s.left >= kort.left - 0.5 && s.right <= kort.right + 0.5),
            datumInne: datum.every((d) => d.left >= kort.left - 0.5 && d.right <= kort.right + 0.5),
            krock,
            sidscroll: document.documentElement.scrollWidth > innerWidth,
          };
        });
        expect(r.inne, `${w} px, ${n} dagar: staplar utanför kortet`).toBe(true);
        expect(r.krock, `${w} px, ${n} dagar: datum krockar`).toBe(0);
        expect(r.sidscroll, `${w} px, ${n} dagar: sidscroll`).toBe(false);
        expect(r.datumInne || n <= 6, `${w} px, ${n} dagar: datum utanför kortet`).toBe(true);
        if (SKRIV && (n === 30 || n === 11)) { mkdirSync(SKRIV, { recursive: true }); writeFileSync(path.join(SKRIV, `per-dag-${w}-${n}.png`), await pg.screenshot()); }
        await pg.close();
      }
    } finally { await b.close(); }
  }, 120_000);

  it('ett tryck på en stapel visar dagen och m³, inom kortet', async () => {
    const lib = await bunta();
    const b = await CHROMIUM!.launch({});
    try {
      const pg = await (await b.newContext({ viewport: { width: 390, height: 600 }, hasTouch: true })).newPage();
      await pg.setContent(SIDA);
      await pg.addScriptTag({ content: lib });
      await pg.evaluate(() => (window as any).RITA(30, true));
      await pg.waitForFunction(() => document.querySelectorAll('[data-stapel]').length === 30);
      for (const i of [0, 15, 29]) {
        await pg.locator('[data-stapel]').nth(i).tap();
        const ruta = await pg.evaluate(() => {
          const e = document.querySelector('[data-stapel-ruta]') as HTMLElement;
          const k = (document.querySelector('[data-stapel]') as HTMLElement).closest('[style*="border-radius"]')!.getBoundingClientRect();
          const r = e.getBoundingClientRect();
          return { text: e.innerText, inne: r.left >= k.left - 0.5 && r.right <= k.right + 0.5 };
        });
        expect(ruta.text).toMatch(/^\d+\/\d+ · \d+ lass · \d+ m³$/);
        expect(ruta.inne, `ruta ${i} utanför kortet`).toBe(true);
        await pg.locator('[data-stapel]').nth(i).tap();
      }
      if (SKRIV) writeFileSync(path.join(SKRIV, 'per-dag-tryck.png'), await pg.screenshot());
    } finally { await b.close(); }
  }, 60_000);
});
