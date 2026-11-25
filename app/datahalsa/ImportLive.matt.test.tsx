// @vitest-environment jsdom
// MÄTT I RIKTIG CHROMIUM. jsdom räknar ingen layout: en rubrik i 30 px som trycker ut kortet, en lång felrad som går utanför
// skärmen eller två problem som hamnar på samma rad syns inte där. Testet renderar raden i jsdom och mäter HTML:en i
// Playwright-Chromium i samma ram som Datahälsa-sidan (main, högst 560 px, sidmarginal 16). Hoppas över utan Chromium — det står i testnamnet.
//
// IMPORTLIVE_SKRIV=<mapp> sparar skärmbilderna.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import ImportLive from './ImportLive';
import type { StatusRad } from '@/lib/datahalsa/status';
import { FARG, FONT } from '@/lib/design/tokens';
import { hittaChromium } from '../../lib/testStod/chromium';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const CHROMIUM = hittaChromium();
const NU = Date.parse('2026-11-25T10:10:00Z');

const SKARMAR = [
  { namn: 'smal telefon 360', w: 360, h: 740 },
  { namn: 'telefon 390', w: 390, h: 844 },
  { namn: 'iPad stående 834', w: 834, h: 1112 },
  { namn: 'dator 1440', w: 1440, h: 900 },
];

const live = (over: Partial<StatusRad> = {}): StatusRad[] => [{
  id: 'import_live', kordTid: '2026-11-25T10:00:00Z', status: 'OK', larmAntal: 0,
  sammanfattning: 'Importen fungerar. Senaste fil 2026-11-25 10:26', ...over,
}];
const s = (data: StatusRad[] | null, over: Record<string, unknown> = {}) => ({ laddar: false, fel: null, data, tabellSaknas: false, ...over });

// Den längsta raden som förekommit i import_fel (23 nov 2026): filnamn utan mellanslag att bryta på.
const LANG = '78 importfel senaste timmen: detalj_stock, Tröjemåla 1115 AU_PONS20SDJAA270231_20261123113624.hpr (UPDATE requires a WHERE clause)';
const LAGEN: [string, ReturnType<typeof s>][] = [
  ['ok', s(live())],
  ['larm', s(live({ status: 'LARM', larmAntal: 3, sammanfattning: `Ingen fil har kommit in på 6 timmar\n${LANG}\nKön står: 4 filer äldre än 24 h` }))],
  ['gammal', s(live({ kordTid: '2026-11-25T08:00:00Z' }))],
  ['saknas', s([])],
  ['fel', s(null, { fel: 'TypeError: Failed to fetch — https://mxydghzfacbenbgpodex.supabase.co/rest/v1/meta_datahalsa_status' })],
];

function html(): string {
  document.body.innerHTML = '';
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  act(() => { r.render(<>{LAGEN.map(([namn, sek]) => <ImportLive key={namn} sektion={sek} nu={NU} />)}</>); });
  const h = c.innerHTML;
  act(() => { r.unmount(); });
  return h;
}

const sida = (inner: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>html,body{margin:0;background:${FARG.bg};color:${FARG.text};font-family:${FONT}}main{max-width:560px;margin:0 auto;padding:16px}</style>`
  + `</head><body><main>${inner}</main></body></html>`;

describe(`Importen just nu — ${CHROMIUM ? 'mätt i Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  it.skipIf(!CHROMIUM)('ingen sidscroll, inget sticker ut ur kortet, rubriken störst, ett problem per rad', async () => {
    const b = await CHROMIUM!.launch({});
    const skriv = process.env.IMPORTLIVE_SKRIV;
    try {
      const sidHtml = sida(html());
      for (const sk of SKARMAR) {
        const p = await b.newPage({ viewport: { width: sk.w, height: sk.h } });
        await p.setContent(sidHtml);
        const r = await p.evaluate(() => {
          const kort = Array.from(document.querySelectorAll('[data-testid="import-live"]')) as HTMLElement[];
          return {
            sidscroll: document.documentElement.scrollWidth > window.innerWidth,
            kort: kort.map((k) => {
              const kb = k.getBoundingClientRect();
              const rubrik = k.querySelector('[data-testid="import-live-rubrik"]') as HTMLElement | null;
              const prick = rubrik?.previousElementSibling as HTMLElement | null;
              const rader = Array.from(k.querySelectorAll('[data-testid="import-live-rader"] li')) as HTMLElement[];
              const storlekar = Array.from(k.querySelectorAll('*')).map((e) => parseFloat(getComputedStyle(e).fontSize));
              return {
                lage: k.dataset.lage,
                utanfor: Array.from(k.querySelectorAll('*')).filter((e) => {
                  const eb = e.getBoundingClientRect();
                  return eb.right > kb.right + 0.5 || eb.left < kb.left - 0.5;
                }).length,
                rubrikPx: rubrik ? parseFloat(getComputedStyle(rubrik).fontSize) : null,
                storstPx: Math.max(...storlekar),
                prickSynlig: prick ? prick.getBoundingClientRect().width >= 12 && prick.getBoundingClientRect().height >= 12 : null,
                prickTillVanster: prick && rubrik ? prick.getBoundingClientRect().right <= rubrik.getBoundingClientRect().left + 0.5 : null,
                radToppar: rader.map((li) => Math.round(li.getBoundingClientRect().top)),
                radBottnar: rader.map((li) => Math.round(li.getBoundingClientRect().bottom)),
              };
            }),
          };
        });
        expect(r.sidscroll, `${sk.namn}: sidscroll i sidled`).toBe(false);
        expect(r.kort.map((k: { lage: string }) => k.lage)).toEqual(['ok', 'larm', 'gammal', 'saknas', 'fel']);
        for (const k of r.kort) {
          expect(k.utanfor, `${sk.namn} / ${k.lage}: något sticker ut ur kortet`).toBe(0);
          // Svaret är det största i kortet — "ett tal per vy är huvudsaken".
          expect(k.rubrikPx, `${sk.namn} / ${k.lage}: rubrikens storlek`).toBe(30);
          expect(k.storstPx, `${sk.namn} / ${k.lage}: något är större än rubriken`).toBe(30);
          expect(k.prickSynlig, `${sk.namn} / ${k.lage}: pricken syns`).toBe(true);
          expect(k.prickTillVanster, `${sk.namn} / ${k.lage}: pricken står före rubriken`).toBe(true);
        }
        // Tre problem = tre rader under varandra, ingen ovanpå eller bredvid en annan.
        const larm = r.kort[1];
        expect(larm.radToppar).toHaveLength(3);
        for (let i = 1; i < larm.radToppar.length; i++) {
          expect(larm.radToppar[i], `${sk.namn}: problem ${i + 1} ligger under problem ${i}`).toBeGreaterThanOrEqual(larm.radBottnar[i - 1]);
        }
        if (skriv) {
          fs.mkdirSync(skriv, { recursive: true });
          await p.screenshot({ path: path.join(skriv, `importlive-${sk.w}.png`), fullPage: true });
        }
        await p.close();
      }
    } finally {
      await b.close();
    }
  }, 60_000);
});
