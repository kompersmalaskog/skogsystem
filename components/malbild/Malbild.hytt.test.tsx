// @vitest-environment jsdom
// MASKINDATORN: målbilden ska synas över vikningen på de skärmstorlekar hytten kör, med marginal.
// Pixlar går inte att mäta i jsdom, så testet renderar varje sort i jsdom (HTML inklusive bladet i body) och mäter den i RIKTIG Chromium via Playwright.
// Finns ingen Chromium i miljön hoppas mätningen över (det står i testnamnet) — kör den i en miljö med Chromium innan layouten ändras.
// Marginal = kort: avstånd från felbildens nederkant till skärmens nederkant; blad: hur mycket innehållet ovanför felbilden får växa innan felbilden klipps av foten (rullområdet är högst 92 % av skärmen minus huvud och fot).
// Marginalen är 40 px: Windows-typsnitt är högre än Chromium på Linux, och en radbrytning till får inte skjuta "Inte så här" utanför.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KartKort } from '@/components/planering/KartKort';
import { MalbildBlad, MalbildSektion } from './Malbild';
import { MALBILDER, MALBILD_ORDNING } from '@/lib/malbilder';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const MIN_MARGINAL_PX = 40;
/** Maskindatorn med Windows-skalning 100 % och 125 %. */
const SKARMAR = [{ w: 1280, h: 800 }, { w: 1024, h: 640 }];
const LANG_MENING = 'Stenröse, tjärdal, kolbotten eller råsten – lagskyddat, kör inte på det. Gäller också vid fällning och risning i närheten.';

function chromium(): { launch: (o: object) => Promise<any> } | null {
  try {
    const rot = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const kor = createRequire(path.join(rot, 'x.js'));
    const pw = kor('playwright');
    const mapp = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const ver = fs.readdirSync(mapp).filter((n) => /^chromium-\d+$/.test(n)).sort().pop();
    const exe = ver && path.join(mapp, ver, 'chrome-linux', 'chrome');
    if (!exe || !fs.existsSync(exe)) return null;
    return { launch: (o) => pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'], ...o }) };
  } catch { return null; }
}
const CHROMIUM = chromium();

function renderaHtml(el: React.ReactElement, efter?: () => void): string {
  document.body.innerHTML = '';
  const c = document.createElement('div'); document.body.appendChild(c);
  const r = createRoot(c);
  act(() => { r.render(el); });
  if (efter) efter();
  const h = document.body.innerHTML;
  act(() => { r.unmount(); });
  return h;
}
const kolbotten = () => act(() => { (document.querySelector('[data-testid="malbild-variant-kolbotten"]') as HTMLElement).click(); });

type Sida = { namn: string; html: string; slag: 'kort' | 'blad' };
function sidor(): Sida[] {
  const ut: Sida[] = [];
  for (const nyckel of MALBILD_ORDNING) {
    const m = MALBILDER[nyckel];
    const roller = nyckel === 'blott' ? (['skordare', 'skotare'] as const) : (['skordare'] as const);
    for (const roll of roller) {
      const tagg = `${nyckel}${nyckel === 'blott' ? '-' + roll : ''}`;
      ut.push({ namn: `kort ${tagg}`, slag: 'kort', html: renderaHtml(<KartKort ikon={<div style={{ width: 52, height: 52 }} />} namn={m.namn} grupp={m.grupp} larmRegel="Larmar tills du kvitterat" mening={LANG_MENING} kommentarer={[]} kanKommentera={false} foton={[]} onStang={() => {}} malbild={<MalbildSektion nyckel={nyckel} roll={roll} />} />) });
      ut.push({ namn: `blad ${tagg}`, slag: 'blad', html: renderaHtml(<MalbildBlad nyckel={nyckel} roll={roll} onStang={() => {}} onSett={() => {}} />) });
    }
    if (m.varianter?.some((v) => v.nyckel === 'kolbotten')) {
      ut.push({ namn: `kort ${nyckel}-kolbotten`, slag: 'kort', html: renderaHtml(<KartKort ikon={<div style={{ width: 52, height: 52 }} />} namn={m.namn} grupp={m.grupp} larmRegel="Larmar tills du kvitterat" mening={LANG_MENING} kommentarer={[]} kanKommentera={false} foton={[]} onStang={() => {}} malbild={<MalbildSektion nyckel={nyckel} roll="skordare" />} />, kolbotten) });
      ut.push({ namn: `blad ${nyckel}-kolbotten`, slag: 'blad', html: renderaHtml(<MalbildBlad nyckel={nyckel} roll="skordare" onStang={() => {}} onSett={() => {}} />, kolbotten) });
    }
  }
  return ut;
}

describe(`Målbilden över vikningen på maskindatorn (marginal ≥ ${MIN_MARGINAL_PX} px) — ${CHROMIUM ? 'mätt i Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  it.skipIf(!CHROMIUM)('bild och "Inte så här" syns med marginal på alla sorter (kort och blad, båda maskintyperna, Kolbotten) vid 1280×800 och 1024×640', async () => {
    const lista = sidor();
    expect(lista.length).toBeGreaterThanOrEqual(MALBILD_ORDNING.length * 2); // kort + blad per sort
    const b = await CHROMIUM!.launch({});
    const marginaler: { skarm: string; sida: string; marginal: number }[] = [];
    try {
      for (const s of SKARMAR) {
        const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
        for (const sida of lista) {
          await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#1E2A1B;color:#fff;font-family:system-ui,sans-serif}.material-symbols-outlined{font-size:0}</style></head><body>${sida.html}</body></html>`);
          const m = await p.evaluate((slag: 'kort' | 'blad') => {
            const kant = (sel: string) => { const e = document.querySelector(sel) as HTMLElement | null; return e ? e.getBoundingClientRect() : null; };
            const fel = kant('[data-testid="malbild-fel-bild"]'), text = kant('[data-testid="malbild-fel-text"]'), bild = kant('[data-testid="malbild-bild"]');
            if (!fel || !text || !bild) return null;
            if (slag === 'kort') return { fel: Math.round(Math.max(fel.bottom, text.bottom)), nedre: innerHeight };
            // Bladet är så högt som sitt innehåll (högst 92 % av skärmen). Marginalen är hur många px innehållet ovanför felbilden får växa innan felbilden klipps
            // av foten, räknat mot det scrollande områdets största höjd (92 % minus huvud och fot).
            const ark = document.querySelector('[data-testid="malbild-blad"]>div:last-child') as HTMLElement | null;
            if (!ark || ark.children.length < 3) return null;
            const [huvud, rulle, fot] = Array.from(ark.children) as HTMLElement[];
            const tillgangligt = innerHeight * 0.92 - huvud.offsetHeight - fot.offsetHeight - 1;
            const felUnderRulltopp = Math.max(fel.bottom, text.bottom) - rulle.getBoundingClientRect().top;
            return { fel: Math.round(felUnderRulltopp), nedre: Math.round(tillgangligt) };
          }, sida.slag);
          expect(m, `${sida.namn} ${s.w}×${s.h}: bild, felbild eller fot hittades inte`).not.toBeNull();
          marginaler.push({ skarm: `${s.w}×${s.h}`, sida: sida.namn, marginal: m!.nedre - m!.fel });
        }
        await p.close();
      }
    } finally { await b.close(); }
    const for_lite = marginaler.filter((x) => x.marginal < MIN_MARGINAL_PX);
    expect(for_lite, `marginal under ${MIN_MARGINAL_PX} px: ${JSON.stringify(for_lite)}`).toEqual([]);
    if (process.env.MALBILD_HYTT_SKRIV) for (const x of marginaler) console.log(x.skarm, x.sida.padEnd(28), x.marginal);
  }, 120000);
});
