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
import { KartKort, KartKortNederst } from '@/components/planering/KartKort';
import { MalbildBlad, MalbildRad } from './Malbild';
import { FARG, KNAPP } from '@/lib/design/tokens';
import { MALBILDER, MALBILD_ORDNING } from '@/lib/malbilder';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const MIN_MARGINAL_PX = 40;
/** Maskindatorn med Windows-skalning 100 % och 125 %. */
const SKARMAR = [{ w: 1280, h: 800 }, { w: 1024, h: 640 }];
/** Telefon (iPhone) och maskindatorn: kortet mäts på alla tre. */
const TELEFON = { w: 390, h: 844 };
/** Mindre telefoner mäts och skrivs ut (MALBILD_HYTT_SKRIV) men kräver inget: där scrollar ett fullt kort. */
const MINDRE_TELEFONER = [{ w: 375, h: 667 }, { w: 360, h: 740 }];
const KORT_SKARMAR = [TELEFON, ...MINDRE_TELEFONER, ...SKARMAR];
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

const KOMMENTAR = [{ id: 'k1', text: 'Stolpen lutar åt vägen, fäll inte åt det hållet.', forfattare: 'Martin · i går 16:20', vantar: false, kanAndra: true, kanRadera: true }];
/** Ett typiskt kort, som sidan bygger det för en egen kommentar: huvud med ✕, en mening, EN kort kommentar med namn och tid (med Ändra/Ta bort), målbildsraden, åtgärdsraden Kommentar · Foto · Röst och två åtgärder. */
const typisktKort = (nyckel: string, roll: 'skordare' | 'skotare') => {
  const m = MALBILDER[nyckel];
  return (
    <KartKort ikon={<div style={{ width: 52, height: 52 }} />} namn={m.namn} grupp={m.grupp} larmRegel="Larmar tills du kvitterat" mening={LANG_MENING} kommentarer={KOMMENTAR} kanKommentera onLaggKommentar={() => {}} onAndraKommentar={() => {}} onRaderaKommentar={() => {}} foton={[]} onLaggTillFoto={() => {}} rost={{ onToggle: () => {}, spelar: false, sekunder: 0 }} onStang={() => {}}
      malbild={<MalbildRad nyckel={nyckel} roll={roll} />}>
      <KartKortNederst>
        <div style={{ display: 'flex', gap: 8 }}><button style={{ ...KNAPP.sekundar }}>Flytta</button><button style={{ ...KNAPP.sekundar }}>Ta bort</button></div>
      </KartKortNederst>
    </KartKort>
  );
};

type Sida = { namn: string; html: string; slag: 'kort' | 'blad' };
function sidor(): Sida[] {
  const ut: Sida[] = [];
  for (const nyckel of MALBILD_ORDNING) {
    const m = MALBILDER[nyckel];
    const roller = nyckel === 'blott' ? (['skordare', 'skotare'] as const) : (['skordare'] as const);
    for (const roll of roller) {
      const tagg = `${nyckel}${nyckel === 'blott' ? '-' + roll : ''}`;
      ut.push({ namn: `kort ${tagg}`, slag: 'kort', html: renderaHtml(typisktKort(nyckel, roll)) });
      ut.push({ namn: `blad ${tagg}`, slag: 'blad', html: renderaHtml(<MalbildBlad nyckel={nyckel} roll={roll} onStang={() => {}} onSett={() => {}} />) });
    }
    if (m.varianter?.some((v) => v.nyckel === 'kolbotten')) {
      ut.push({ namn: `blad ${nyckel}-kolbotten`, slag: 'blad', html: renderaHtml(<MalbildBlad nyckel={nyckel} roll="skordare" onStang={() => {}} onSett={() => {}} />, kolbotten) });
    }
  }
  return ut;
}

describe(`Målbilden på maskindatorn och telefonen — ${CHROMIUM ? 'mätt i Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  const sidaHtml = (html: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:${FARG.bg};color:#fff;font-family:system-ui,sans-serif}.material-symbols-outlined{font-size:0}</style></head><body>${html}</body></html>`;

  it.skipIf(!CHROMIUM)(`BLADET: bild och "Inte så här" syns med minst ${MIN_MARGINAL_PX} px marginal på alla sorter (båda maskintyperna, Kolbotten) vid 1280×800 och 1024×640`, async () => {
    const lista = sidor().filter((x) => x.slag === 'blad');
    expect(lista.length).toBeGreaterThanOrEqual(MALBILD_ORDNING.length);
    const b = await CHROMIUM!.launch({});
    const marginaler: { skarm: string; sida: string; marginal: number }[] = [];
    try {
      for (const s of SKARMAR) {
        const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
        for (const sida of lista) {
          await p.setContent(sidaHtml(sida.html));
          // Bladet är så högt som sitt innehåll (högst 92 % av skärmen). Marginalen är hur många px innehållet ovanför felbilden får växa innan felbilden klipps
          // av foten, räknat mot rullområdets största höjd (92 % minus huvud och fot).
          const m = await p.evaluate(() => {
            const kant = (sel: string) => { const e = document.querySelector(sel) as HTMLElement | null; return e ? e.getBoundingClientRect() : null; };
            const fel = kant('[data-testid="malbild-fel-bild"]'), text = kant('[data-testid="malbild-fel-text"]'), bild = kant('[data-testid="malbild-bild"]');
            const ark = document.querySelector('[data-testid="malbild-blad"]>div:last-child') as HTMLElement | null;
            if (!fel || !text || !bild || !ark || ark.children.length < 3) return null;
            const [huvud, rulle, fot] = Array.from(ark.children) as HTMLElement[];
            const tillgangligt = innerHeight * 0.92 - huvud.offsetHeight - fot.offsetHeight - 1;
            const felUnderRulltopp = Math.max(fel.bottom, text.bottom) - rulle.getBoundingClientRect().top;
            return { fel: Math.round(felUnderRulltopp), nedre: Math.round(tillgangligt) };
          });
          expect(m, `${sida.namn} ${s.w}×${s.h}: bild, felbild eller fot hittades inte`).not.toBeNull();
          marginaler.push({ skarm: `${s.w}×${s.h}`, sida: sida.namn, marginal: m!.nedre - m!.fel });
        }
        await p.close();
      }
    } finally { await b.close(); }
    const for_lite = marginaler.filter((x) => x.marginal < MIN_MARGINAL_PX);
    expect(for_lite, `marginal under ${MIN_MARGINAL_PX} px: ${JSON.stringify(for_lite)}`).toEqual([]);
    if (process.env.MALBILD_HYTT_SKRIV) for (const x of marginaler) console.log('blad', x.skarm, x.sida.padEnd(28), x.marginal);
  }, 120000);

  it.skipIf(!CHROMIUM)('KORTET: målbilden är bara en rad — inget utfällt i kortet, åtgärdsraden har tre lika knappar ≥ 44 px, ✕ ≥ 44 px (ingen Stäng-knapp), och ett typiskt kort (huvud, mening, en kort kommentar, målbildsrad, åtgärdsrad, två åtgärder) rymms utan scroll på telefon', async () => {
    const lista = sidor().filter((x) => x.slag === 'kort');
    const b = await CHROMIUM!.launch({});
    const rader: { skarm: string; sida: string; kortH: number; skroll: number; raden: number; kommentarTop: number; radenTop: number; knappHojd: number; xBredd: number }[] = [];
    try {
      for (const s of KORT_SKARMAR) {
        const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
        for (const sida of lista) {
          await p.setContent(sidaHtml(sida.html));
          const m = await p.evaluate(() => {
            const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
            const ark = document.querySelector('[data-testid="kartkort"]>div') as HTMLElement | null;
            const rulle = ark ? (Array.from(ark.children).find((c) => getComputedStyle(c as HTMLElement).overflowY === 'auto') as HTMLElement | undefined) : undefined;
            const rad = q('malbild-rad-kort'), kom = q('kartkort-kommentar'), atg = q('kartkort-atgarder'), x = q('kartkort-stang');
            if (!ark || !rulle || !rad || !kom || !atg || !x) return null;
            const knappar = Array.from(atg.querySelectorAll('button')).map((b) => b.getBoundingClientRect());
            const xr = x.getBoundingClientRect();
            return {
              kortH: Math.round(ark.getBoundingClientRect().height), skroll: rulle.scrollHeight - rulle.clientHeight, raden: Math.round(rad.getBoundingClientRect().height), kommentarTop: Math.round(kom.getBoundingClientRect().top), radenTop: Math.round(rad.getBoundingClientRect().top),
              utfalld: !!q('malbild-bild') || !!q('malbild-fel'),
              antalKnappar: knappar.length, knappHojd: Math.round(Math.min(...knappar.map((b) => b.height))), knappHojdMax: Math.round(Math.max(...knappar.map((b) => b.height))),
              knappBredd: Math.round(Math.min(...knappar.map((b) => b.width))), knappBreddMax: Math.round(Math.max(...knappar.map((b) => b.width))),
              xBredd: Math.round(xr.width), xHojd: Math.round(xr.height), xHogerKant: Math.round(ark.getBoundingClientRect().right - xr.right),
              harStangText: Array.from(ark.querySelectorAll('button')).some((b) => (b.textContent ?? '').trim() === 'Stäng'),
            };
          });
          expect(m, `${sida.namn} ${s.w}×${s.h}: kort, målbildsrad eller kommentar hittades inte`).not.toBeNull();
          expect((m as any).utfalld, `${sida.namn}: målbilden ligger utfälld i kortet`).toBe(false);
          expect(m!.kommentarTop, `${sida.namn}: kommentaren ska stå före målbildsraden`).toBeLessThan(m!.radenTop);
          expect(m!.raden, `${sida.namn} ${s.w}×${s.h}: målbildsraden är hoptryckt (miniatyren går utanför raden)`).toBeGreaterThanOrEqual(56);
          const mm = m as any;
          expect(mm.antalKnappar, `${sida.namn}: åtgärdsraden ska ha tre knappar`).toBe(3);
          expect(mm.knappHojd, `${sida.namn} ${s.w}×${s.h}: åtgärdsknapp under 44 px`).toBeGreaterThanOrEqual(44);
          expect(mm.knappHojdMax, `${sida.namn}: knapparna är inte lika höga`).toBe(mm.knappHojd);
          expect(mm.knappBreddMax - mm.knappBredd, `${sida.namn}: knapparna är inte lika breda`).toBeLessThanOrEqual(1);
          expect(mm.xBredd, `${sida.namn}: ✕ under 44 px`).toBeGreaterThanOrEqual(44);
          expect(mm.xHojd, `${sida.namn}: ✕ under 44 px`).toBeGreaterThanOrEqual(44);
          expect(mm.harStangText, `${sida.namn}: den stora Stäng-knappen är tillbaka`).toBe(false);
          rader.push({ skarm: `${s.w}×${s.h}`, sida: sida.namn, ...m! });
        }
        await p.close();
      }
    } finally { await b.close(); }
    if (process.env.MALBILD_HYTT_SKRIV) for (const x of rader) console.log('kort', x.skarm, x.sida.padEnd(24), 'kort', x.kortH, 'skroll', x.skroll, 'rad', x.raden, 'rad-topp', x.radenTop, 'knapp', x.knappHojd, 'x', x.xBredd);
    const telefon = rader.filter((x) => x.skarm === `${TELEFON.w}×${TELEFON.h}` && x.skroll > 0);
    expect(telefon, `kortet scrollar på telefonen: ${JSON.stringify(telefon)}`).toEqual([]);
  }, 120000);
});
