// @vitest-environment jsdom
// MÄTT I RIKTIG CHROMIUM (jsdom räknar ingen layout). Läget efter omtaget 2026-11-25: Idag överst, Fler siffror fäller ut trädslagen och kontrollerna.
// Ingen sidscroll, inga träffytor under 44 px, på telefon och iPad — med Fler siffror stängd och öppen. Hoppas över utan Chromium.
// LAGET_SKRIV=<mapp> sparar skärmbilderna.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FARG, FONT, KOLUMN, TRAFFYTA, designCss } from '@/lib/design/tokens';
import type { BedomningResp, KravRow, VariabelStat } from '@/lib/kalibrering/typer';
import { hittaChromium } from '../../lib/testStod/chromium';
import { kalibreringCss } from './kalibreringCss';
import LagetFlik from './LagetFlik';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const CHROMIUM = hittaChromium();

const VIDA: KravRow[] = [
  { variabel: 'diameter', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 4, mal: 85, golv: 75, enhet: '%', larm_min_matt: 150 },
  { variabel: 'diameter', metrik: 'systematisk', riktning: 'lag_bra', tolerans: null, mal: 1.0, golv: 1.5, enhet: 'mm', larm_min_matt: null },
  { variabel: 'diameter', metrik: 'standardavv', riktning: 'lag_bra', tolerans: null, mal: 3.5, golv: 4.5, enhet: 'mm', larm_min_matt: null },
  { variabel: 'langd', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 2, mal: 100, golv: 95, enhet: '%', larm_min_matt: 40 },
];
const stat = (o: Partial<VariabelStat> = {}): VariabelStat => ({ n: 500, traffPct: 90, systematisk: 0.2, standardavv: 3, grovPct: null, tolerans: 4, grovTolerans: null, ...o });
const B: BedomningResp = {
  ok: true, maskin_id: 'M', profil: 'VIDA', fonster: { fran: '2026-07-23', till: '2026-10-21', dagar: 90 }, trosklar: VIDA,
  diameter: stat({ n: 1113, traffPct: 77, systematisk: 0.81, standardavv: 4.07 }),
  langd: stat({ n: 285, traffPct: 93.68, tolerans: 2, systematisk: 0.09, standardavv: 1.36 }),
} as BedomningResp;
const d = {
  bedomning: B, bedomningFel: null, forsokIgen: () => {},
  aktivaMaskiner: [{ maskin_id: 'M', namn: 'Scorpion' }], effektiv: null, setValdMaskin: () => {},
  trData: { trosklar: VIDA, tradslag: [] }, trRader: [
    { tradslag: 'GRAN', diameter: stat({ n: 900, traffPct: 79 }), langd: stat({ n: 200, traffPct: 94, tolerans: 2 }) },
    { tradslag: 'TALL', diameter: stat({ n: 200, traffPct: 63 }), langd: stat({ n: 80, traffPct: 92, tolerans: 2 }) },
  ], tradslagFel: null,
  laddaFelet: () => {}, feletFel: null, feletData: {
    ok: true, maskin_id: 'M', tolDia: 4, tolLangd: 2, senasteKalibrering: '2026-10-20',
    dia: Array.from({ length: 10 }, (_, i) => ({ stam: `k${i}`, datum: '2026-10-21', grupp: 'klen', n: 1, traff: i < 5 ? 0 : 1, summa: 4 })),
    rot: Array.from({ length: 10 }, (_, i) => ({ stam: `r${i}`, datum: '2026-10-21', tradslag: 'Gran', avvikCm: 1 })),
    langd: Array.from({ length: 12 }, () => ({ datum: '2026-10-21', kort: false, overCm: 4 })),
  },
  filteredKalib: [
    { filnamn: 'a.hqc', datum: '2026-10-21T00:00:00', weather_at_harvest: { temperature_c: -9 } },
    { filnamn: 'b.hqc', datum: '2026-10-01T00:00:00', weather_at_harvest: { temperature_c: 4 } },
  ],
  tider: { 'a.hqc': { urval: ['Randomly selected stem'] } },
  matdon: null, matdonFel: null,
} as any;
const ark = { oppnaHjalp: () => {}, oppnaArt: () => {}, oppnaMatdon: () => {} } as any;

function html(fler: boolean): string {
  document.body.innerHTML = '';
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  act(() => { r.render(createElement(LagetFlik, { d, ark })); });
  if (fler) act(() => { c.querySelector<HTMLElement>('[data-rad="fler"]')!.click(); });
  const h = c.innerHTML;
  act(() => { r.unmount(); });
  return h;
}
const sida = (inner: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>html,body{margin:0;background:${FARG.bg};color:${FARG.text};font-family:${FONT}}`
  + `.material-symbols-outlined{font-size:0 !important;display:inline-block;width:22px;height:22px}${designCss}${kalibreringCss}</style></head>`
  + `<body><div style="max-width:${KOLUMN.smal}px;margin:0 auto;padding:0 16px">${inner}</div></body></html>`;

describe(`Läget — ${CHROMIUM ? 'mätt i Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  it.skipIf(!CHROMIUM)('ingen sidscroll och inga träffytor under 44 px, med Fler siffror stängd och öppen', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    const b = await CHROMIUM!.launch({});
    const skriv = process.env.LAGET_SKRIV;
    try {
      for (const fler of [false, true]) {
        const s = sida(html(fler));
        for (const w of [360, 390, 820]) {
          const p = await b.newPage({ viewport: { width: w, height: 900 } });
          await p.setContent(s);
          const r = await p.evaluate((min: number) => ({
            sidscroll: document.documentElement.scrollWidth > window.innerWidth,
            sma: Array.from(document.querySelectorAll('button')).map(k => ({ t: (k.textContent || '').slice(0, 30), h: Math.round(k.getBoundingClientRect().height) })).filter(x => x.h + 0.5 < min),
            forsta: document.querySelector('section[aria-label]')?.getAttribute('aria-label'),
          }), TRAFFYTA.min);
          expect(r.sidscroll, `${w} px: sidscroll`).toBe(false);
          expect(r.sma, `${w} px: små träffytor`).toEqual([]);
          expect(r.forsta).toBe('Idag');
          if (skriv) { fs.mkdirSync(skriv, { recursive: true }); await p.screenshot({ path: path.join(skriv, `laget-${fler ? 'fler' : 'kort'}-${w}.png`), fullPage: true }); }
          await p.close();
        }
      }
    } finally { await b.close(); vi.unstubAllGlobals(); }
  }, 120_000);
});
