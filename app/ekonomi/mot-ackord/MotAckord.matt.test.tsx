// @vitest-environment jsdom
// MÄTT I RIKTIG CHROMIUM: skogens ark i Ackord. jsdom räknar ingen layout, så
// två maskinkort bredvid varandra, en rad som trycker ut arket i sidled eller
// en knapp under 44 px syns inte där. Arket renderas i jsdom, HTML:en (med
// vyns egna <style>) mäts i Playwright-Chromium. Hoppas över utan Chromium —
// det står i testnamnet. ACKORD_SKRIV=<mapp> sparar skärmbilderna.
import fs from 'node:fs';
import path from 'node:path';
import { AVSTAND, FARG, FONT, TRAFFYTA, designCss } from '@/lib/design/tokens';
import { hittaChromium } from '@/lib/testStod/chromium';
// Ackord-fliken (barnregeln): det som kan gå sönder tyst — svaret som inte står
// först, ett fackord på första skärmen, en växel som visar en annan summa än de
// andra, en rad vars ark inte öppnas, eller menyn som får fler än fem flikar.
// Layouten (bredd, sidomeny från 1100 px) mäts i riktig Chromium, inte här.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { MaskinDel, ObjektRad, JamforelseData } from '@/lib/ekonomi/objektJamforelse';

const push = vi.fn();
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: () => undefined }), usePathname: () => '/ekonomi/mot-ackord' }));

const del = (maskin_id: string, roll: MaskinDel['roll'], ackord: number, timpeng: number, timmar = 40): MaskinDel => ({
  maskin_id, roll, volym: 500, ackord, timpeng, timmar, timpris: 1000, forestlinkKr: 0, manuellTid: false,
});
const obj = (id: string, namn: string, klass: number | null, maskiner: MaskinDel[]): ObjektRad => ({
  objekt_id: id, namn, volym: 1000, medelstam: klass ?? 0.3, klass,
  ackord: maskiner.reduce((s, d) => s + d.ackord, 0), timpeng: maskiner.reduce((s, d) => s + d.timpeng, 0),
  diff: 0, krPerM3: null, egenSkotning: false, ejJamforbarOrsak: null,
  grund: [{ label: 'Skördad volym', text: '1 000 m³fub', manuell: false }, { label: 'Medelstam', text: '0,25 m³ · manuell', manuell: true }],
  maskiner,
});

let data: JamforelseData;
vi.mock('@/lib/ekonomi/objektJamforelse', async (orig) => ({
  ...(await orig<typeof import('@/lib/ekonomi/objektJamforelse')>()),
  hamtaObjektJamforelse: vi.fn(async () => data),
}));

// Mätningarna bredvid räkningen (körspår, lass, flyttar) läses ur databasen —
// här är de svar testet bestämmer.
let cyklerSvar = new Map<string, any>();
let mattSvar: any = { tider: null, lass: null, flyttar: 0 };
vi.mock('@/lib/ekonomi/lasVarfor', () => ({
  lasCykler: vi.fn(async () => cyklerSvar),
  lasSkogMatt: vi.fn(async () => mattSvar),
}));

import MotAckordClient from './MotAckordClient';
import { skogRader, krText } from '@/lib/ekonomi/ackordVy';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function montera() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(MotAckordClient)); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return host;
}
const text = () => (host?.textContent || '').replace(/ /g, ' ');
const knapp = (t: string) => [...document.querySelectorAll('button')].find(b => (b.textContent || '').replace(/ /g, ' ').includes(t)) as HTMLButtonElement;
async function tryck(el: Element) { await act(async () => { (el as HTMLElement).click(); }); }

beforeEach(() => {
  window.history.replaceState(null, '', '/ekonomi/mot-ackord');
  data = {
    rader: [
      obj('a', 'Jeppshoka', 0.25, [del('GIANT', 'skördare', 21000, 0), del('WISENT', 'skotare', 12156, 0)]),
      obj('b', 'Kvarnen', 0.3, [del('GIANT', 'skördare', 1000, 4000), del('WISENT', 'skotare', 0, 3160)]),
    ],
    ejJamforbara: [{ namn: 'Rössmåla', orsak: '2,5 h saknar timpris' }],
    vantarNamn: ['Björkebo', 'Rödby'],
    timpengAntal: 0,
    maskinNamnMap: { GIANT: { namn: 'Scorpion Giant', typ: 'Harvester' }, WISENT: { namn: 'Wisent', typ: 'Forwarder' } },
  };
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  root = null; host = null;
});


const CHROMIUM = hittaChromium();
const SKARMAR = [
  { namn: 'smal telefon 360', w: 360, h: 740, kolumner: 1 },
  { namn: 'telefon 390', w: 390, h: 844, kolumner: 1 },
  { namn: 'iPad stående 834', w: 834, h: 1112, kolumner: 2 },
  { namn: 'dator 1280', w: 1280, h: 800, kolumner: 2 },
  { namn: 'dator 1440', w: 1440, h: 900, kolumner: 2 },
];

describe(`Ackord — skogens ark ${CHROMIUM ? 'mätt i Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  it.skipIf(!CHROMIUM)('maskinerna under varandra i telefonen, bredvid varandra från iPad; ingen sidscroll; träffytor ≥ 44 px', async () => {
    cyklerSvar = new Map([['b', { lass: 30, medCykel: 28, volym: 500, volymMedCykel: 480, cykelM: 1800, enkelVagM: 900, hemMedLassM: 780, vidAvlaggetM: 180, ytterstM: 420, utan: {} }]]);
    mattSvar = { tider: { lass: 30, lastaMin: 28.5, koraMin: 21.3, avlaggMin: 12, pausMin: 6.2, totalMin: 68 }, lass: { lass: 30, snittM3: 16.7, breddade: 0 }, flyttar: 0 };
    await montera();
    await tryck(document.querySelectorAll('[data-rad="skog"]')[1]);
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    const ark = document.querySelector('[role="dialog"]')!;
    expect(ark).toBeTruthy();
    const sidHtml = `<!doctype html><html><head><meta charset="utf-8">`
      + `<meta name="viewport" content="width=device-width,initial-scale=1">`
      + `<style>html,body{margin:0;background:${FARG.bg};color:${FARG.text};font-family:${FONT}}`
      + `.material-symbols-outlined{font-size:0 !important;display:inline-block;width:22px;height:22px}${designCss}`
      // jsdom kastar en padding som innehåller env() (arkets innehåll har safe-area
      // i botten), så den kommer inte med i HTML:en. Lägg tillbaka arkets egen
      // padding — utan den mäter vi text som går ända ut i kanten.
      + `.sheet-upp>div:last-child{padding:${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xl}px !important}</style>`
      + `</head><body>${document.body.innerHTML}</body></html>`;
    const b = await CHROMIUM!.launch({});
    const skriv = process.env.ACKORD_SKRIV;
    const matt: string[] = [];
    try {
      for (const s of SKARMAR) {
        const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
        await p.setContent(sidHtml);
        await p.waitForTimeout(700); // arket glider in — mät när det står still
        const r = await p.evaluate((min: number) => {
          const ark = document.querySelector('[role="dialog"]') as HTMLElement;
          const kort = Array.from(ark.querySelectorAll('[data-maskinkort]')).map(k => (k as HTMLElement).getBoundingClientRect());
          const toppar = new Set(kort.map(k => Math.round(k.top)));
          const sma = Array.from(ark.querySelectorAll('button, a')).map(k => {
            const bb = (k as HTMLElement).getBoundingClientRect();
            return { txt: (k.textContent || '?').trim().slice(0, 24), h: Math.round(bb.height) };
          }).filter(x => x.h > 0 && x.h + 0.5 < min);
          const a = ark.getBoundingClientRect();
          const utanfor = Array.from(ark.querySelectorAll('p, span, h2, h3')).filter(e => {
            const bb = (e as HTMLElement).getBoundingClientRect();
            return bb.width > 0 && (bb.right > a.right + 0.5 || bb.left < a.left - 0.5);
          }).map(e => (e.textContent || '').slice(0, 30));
          const breda = Array.from(document.querySelectorAll('body *')).filter(e => (e as HTMLElement).getBoundingClientRect().right > window.innerWidth + 0.5)
            .slice(0, 6).map(e => `${e.tagName}.${(e as HTMLElement).className}|${(e.textContent || '').slice(0, 30)}|${Math.round((e as HTMLElement).getBoundingClientRect().right)}|inArk=${ark.contains(e)}`);
          return {
            breda,
            kort: kort.length, kolumner: kort.length ? kort.length / toppar.size : 0,
            arkBredd: Math.round(a.width), sma, utanfor,
            sidscroll: document.documentElement.scrollWidth > window.innerWidth,
          };
        }, TRAFFYTA.min);
        matt.push(`${s.namn}: ark ${r.arkBredd} px, ${r.kort} maskinkort i ${r.kolumner} kolumn(er)`);
        expect(r.sidscroll, `${s.namn}: sidscroll ${JSON.stringify(r.breda)}`).toBe(false);
        expect(r.kort).toBe(2);
        expect(r.kolumner, `${s.namn}: kolumner`).toBe(s.kolumner);
        expect(r.sma, `${s.namn}: små träffytor ${JSON.stringify(r.sma)}`).toEqual([]);
        expect(r.utanfor, `${s.namn}: text utanför arket ${JSON.stringify(r.utanfor)}`).toEqual([]);
        if (skriv) {
          fs.mkdirSync(skriv, { recursive: true });
          await p.screenshot({ path: path.join(skriv, `ackord-ark-${s.w}.png`), fullPage: false });
        }
        await p.close();
      }
    } finally { await b.close(); }
    // eslint-disable-next-line no-console
    console.log('Ackord-arket mätt:\n  ' + matt.join('\n  '));
  }, 120_000);
});
