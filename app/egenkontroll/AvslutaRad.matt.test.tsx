// @vitest-environment jsdom
// MÄTT I RIKTIG CHROMIUM. jsdom räknar ingen layout: att raden blir lägre än Ångra-kvittot (och alltså flyttar sig när den ena
// ersätter den andra i samma spår), att Avsluta-knappen blir mindre än 44 px eller att raden trycker ut sidan syns inte där.
// Hoppas över om det inte finns någon Chromium — det står i testnamnet. AVSLUTA_SKRIV=<mapp> sparar bilderna.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVSTAND, FARG, FONT, KOLUMN, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import AvslutaRad from './AvslutaRad';
import { hittaChromium } from '../../lib/testStod/chromium';

const CHROMIUM = hittaChromium();
const SKARMAR = [
  { namn: 'smal telefon 360', w: 360, h: 740 },
  { namn: 'telefon 390', w: 390, h: 844 },
  { namn: 'iPad 834', w: 834, h: 1112 },
];

async function html(el: JSX.Element): Promise<string> {
  document.body.innerHTML = '';
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  await act(async () => { r.render(el); });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
  const h = document.body.innerHTML;
  act(() => { r.unmount(); });
  return h;
}

/**
 * ÅNGRA-KVITTOT som det ser ut i rundvyn (app/egenkontroll/[objektId]/page.tsx). Kopierat hit MED FLIT: raden och kvittot delar spår,
 * och det enda som betyder något är att de är lika höga. Källvakten i rundRam.vakter.test.ts ser till att båda bär TRAFFYTA.primar,
 * så en ändring på ena stället inte kan glida förbi den här mätningen.
 */
const angraKvitto = `<div data-testid="angra-matt" style="pointer-events:auto;flex:1;min-width:0;margin-right:${TRAFFYTA.min + AVSTAND.s}px;display:flex;align-items:center;`
  + `justify-content:space-between;gap:${AVSTAND.s}px;min-height:${TRAFFYTA.primar}px;padding:0 ${AVSTAND.l}px;border-radius:${RADIE.knapp}px;`
  + `background:${FARG.kort};color:${FARG.text};font-size:${TYP.text.fontSize}px"><span>Körspår: Bra</span><span>Ångra</span></div>`;

/** Arkets kolumn: raderna ligger centrerade i en kolumn på högst KOLUMN.ark, som i vyn. */
const kolumn = (inner: string) =>
  `<div style="position:fixed;left:0;right:0;bottom:120px;margin:0 auto;max-width:${KOLUMN.ark}px;box-sizing:border-box;`
  + `padding:0 ${AVSTAND.l}px;display:flex;align-items:flex-end;justify-content:space-between;pointer-events:none">${inner}</div>`;

const sida = (inner: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>html,body{margin:0;background:${FARG.bg};color:${FARG.text};font-family:${FONT}}</style></head><body>${inner}</body></html>`;

describe(`Raden "Rundan är klar" — ${CHROMIUM ? 'mätt i Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  it.skipIf(!CHROMIUM)('lika hög som Ångra-kvittot, knappen minst 44 px, ingen sidscroll', async () => {
    const raden = await html(<AvslutaRad onAvsluta={() => {}} />);
    const b = await CHROMIUM!.launch({});
    const skriv = process.env.AVSLUTA_SKRIV;
    try {
      for (const s of SKARMAR) {
        const p = await b.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
        // Båda spåren på en gång: samma kolumn, samma bottenavstånd — så höjderna jämförs under exakt samma villkor.
        await p.setContent(sida(kolumn(raden) + kolumn(angraKvitto).replace('bottom:120px', 'bottom:300px')));
        const m = await p.evaluate(() => {
          const rad = document.querySelector('[data-testid=avsluta-rad]') as HTMLElement;
          const knapp = document.querySelector('[data-testid=avsluta-rad-knapp]') as HTMLElement;
          const angra = document.querySelector('[data-testid=angra-matt]') as HTMLElement;
          const r = rad.getBoundingClientRect();
          const k = knapp.getBoundingClientRect();
          return {
            radHojd: Math.round(r.height),
            angraHojd: Math.round((angra?.getBoundingClientRect().height) ?? 0),
            knappHojd: Math.round(k.height),
            knappBredd: Math.round(k.width),
            radHoger: Math.round(r.right),
            sidscroll: document.documentElement.scrollWidth > window.innerWidth,
            fonster: window.innerWidth,
          };
        });
        if (skriv) { fs.mkdirSync(skriv, { recursive: true }); await p.screenshot({ path: path.join(skriv, `avsluta-${s.w}.png`) }); }
        expect(m.sidscroll, `${s.namn}: sidscroll`).toBe(false);
        // LIKA HÖGA — annars flyttar sig något när Ångra byts mot raden i samma spår.
        expect(m.radHojd, `${s.namn}: radens höjd mot Ångra-kvittot`).toBe(m.angraHojd);
        expect(m.knappHojd, `${s.namn}: Avsluta-knappens träffyta`).toBeGreaterThanOrEqual(TRAFFYTA.min);
        // Raden slutar före Centrera-knappen i högerkanten (marginalen är TRAFFYTA.min + AVSTAND.s).
        expect(m.fonster - m.radHoger, `${s.namn}: luft till Centrera`).toBeGreaterThanOrEqual(TRAFFYTA.min);
        await p.close();
      }
    } finally { await b.close(); }
  }, 120000);
});
