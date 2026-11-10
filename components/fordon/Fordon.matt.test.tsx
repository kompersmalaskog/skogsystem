// @vitest-environment jsdom
// MÄTT I RIKTIG CHROMIUM. jsdom räknar ingen layout: en rad som blir lägre än 44 px, en status som trycker
// ut raden i sidled eller ett ark som hamnar utanför skärmen syns inte där. Vyn renderas i jsdom mot samma
// API i minnet som render-testet, HTML:en mäts i Playwright-Chromium med vyns egen CSS (designCss + KOLUMN_CSS).
// Hoppas över om det inte finns någon Chromium — det står i testnamnet. FORDON_SKRIV=<mapp> sparar bilderna.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FARG, TRAFFYTA } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom kör inga bildrutor: uppräkningen och övertoningen skulle fotograferas mitt i (0, halvgenomskinligt).
vi.mock('@/lib/design/raknaUpp', () => ({ useRaknaUpp: (v: number) => String(v ?? 0) }));
vi.mock('@/components/design/Tillstand', () => ({ default: ({ children }: any) => children }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }), usePathname: () => '/kontroller' }));

import FordonLista from './FordonLista';
import FordonSida from './FordonSida';
import { hittaChromium } from '../../lib/testStod/chromium';

const SKARMAR = [
  { namn: 'smal telefon 360', w: 360, h: 740 },
  { namn: 'telefon 390', w: 390, h: 844 },
  { namn: 'iPad 834', w: 834, h: 1112 },
  { namn: 'dator 1440', w: 1440, h: 900 },
];

const chromium = () => hittaChromium();
const CHROMIUM = chromium();

function k(id: string, typ: string, nasta_forfall: string | null, extra: Record<string, unknown> = {}) {
  return { id, typ, aktiv: true, nasta_forfall, intervall_manader: 12, intervall_timmar: null, intervall_km: null, senast_utford: null, senast_matarstallning: null, nasta_matarvarde: null, ...extra };
}
// Längsta namnen först — de som krockar med statusen till höger.
const RESURSER = [
  { id: 'volvo', namn: 'Volvo FH16 med kran och vagn', typ: 'lastbil', regnr: 'ABC123', marke: 'Volvo', modell: 'FH16 750', arsmodell: 2016, matarstallning: null, anteckning: null, inkopspris: 1450000, inkopsdatum: '2016-04-01',
    kontroll: [k('k1', 'besiktning', '2026-10-25'), k('k2', 'forsakring', '2026-11-20')] },
  { id: 'pickup', namn: 'Hilux', typ: 'bil', regnr: 'XYZ789', marke: 'Toyota', modell: 'Hilux', arsmodell: 2021, matarstallning: null, anteckning: null,
    kontroll: [k('k5', 'besiktning', '2027-03-02'), k('k6', 'forsakring', '2027-01-15')] },
  { id: 'slap', namn: 'Kilafors maskinsläp', typ: 'slap', regnr: 'GHI789', marke: 'Kilafors', modell: null, arsmodell: 2014, matarstallning: null, anteckning: null,
    kontroll: [k('k3', 'besiktning', '2027-05-14'), k('k7', 'forsakring', '2026-11-30')] },
  { id: 'giant', namn: 'Scorpion Giant', typ: 'maskin', regnr: null, marke: 'Ponsse', modell: 'Scorpion Giant 8W', arsmodell: 2020, matarstallning: null, anteckning: null,
    kontroll: [k('k8', 'brandskydd', '2027-02-01'), k('k10', 'forsakring', null)] },
  { id: 'tank', namn: 'Dieseltanken vid hallen', typ: 'cistern', regnr: null, marke: null, modell: null, arsmodell: null, matarstallning: null, anteckning: null,
    kontroll: [k('k4', 'cisternkontroll', null, { intervall_manader: null }), k('k11', 'brandskydd', '2027-06-01')] },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 10, 6, 12, 0, 0));
  (globalThis as any).fetch = vi.fn((url: string) => {
    const svar = (data: any) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) } as Response);
    if (url === '/api/resurs') return svar({ ok: true, resurs: RESURSER });
    const m = url.match(/^\/api\/resurs\/(\w+)$/);
    if (m) return svar({ ok: true, resurs: RESURSER.find(r => r.id === m[1]) });
    return svar({ ok: true, forslag: [], handelser: [
      { id: 'h1', typ: 'besiktning', benamning: null, datum: '2025-10-25', utford_av: 'Bilprovningen Växjö', kostnad: 1890 },
      { id: 'h2', typ: 'reparation', benamning: 'Lager höger boggi', datum: '2025-06-12', utford_av: null, kostnad: 12400 },
    ] });
  });
});
afterEach(() => { vi.useRealTimers(); });

async function htmlFor(el: JSX.Element, klickaPa?: string): Promise<string> {
  document.body.innerHTML = '';
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  await act(async () => { r.render(el); });
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
  // Talet räknar upp på 400 ms (useRaknaUpp) — vänta in det, annars fotograferas 0.
  await act(async () => { await new Promise(r => setTimeout(r, 700)); });
  if (klickaPa) {
    await act(async () => { (document.querySelector(klickaPa) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
  }
  const h = document.body.innerHTML;
  act(() => { r.unmount(); });
  return h;
}

const sida = (inner: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>html,body{margin:0;background:${FARG.bg};color:${FARG.text};font-family:system-ui,sans-serif}`
  + `.material-symbols-outlined{font-size:0 !important;display:inline-block;width:22px;height:22px}`
  + `.sheet-upp,.tona-opacity{animation:none !important;opacity:1 !important;transform:none !important}</style></head>`
  + `<body>${inner}</body></html>`;

describe(`Fordon — ${CHROMIUM ? 'mätt i Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  it.skipIf(!CHROMIUM)('ingen sidscroll, inga träffytor under 44 px, inget utanför skärmen', async () => {
    const vyer = [
      { namn: 'lista', html: await htmlFor(<FordonLista kanRedigera />) },
      { namn: 'fordon', html: await htmlFor(<FordonSida id="volvo" kanRedigera />) },
      { namn: 'registrera', html: await htmlFor(<FordonSida id="tank" kanRedigera />, '[data-testid="registrera"]') },
      { namn: 'nytt', html: await htmlFor(<FordonLista kanRedigera />, '[data-testid="lagg-till-fordon"]') },
    ];
    const b = await CHROMIUM!.launch({});
    const skriv = process.env.FORDON_SKRIV;
    try {
      for (const v of vyer) {
        for (const s of SKARMAR) {
          const p = await b.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
          await p.setContent(sida(v.html));
          const r = await p.evaluate((min: number) => ({
            sidscroll: document.documentElement.scrollWidth > window.innerWidth,
            sma: Array.from(document.querySelectorAll('a, button'))
              .filter(e => (e as HTMLElement).offsetParent !== null || getComputedStyle(e).position === 'fixed')
              .map(e => ({ t: (e.textContent || '?').trim().slice(0, 24), h: Math.round((e as HTMLElement).getBoundingClientRect().height) }))
              .filter(x => x.h + 0.5 < min),
            utanfor: Array.from(document.querySelectorAll('[data-status]'))
              .filter(e => (e as HTMLElement).getBoundingClientRect().right > window.innerWidth + 0.5)
              .map(e => e.textContent),
          }), TRAFFYTA.min);
          expect(r.sidscroll, `${v.namn} ${s.namn}: sidscroll`).toBe(false);
          expect(r.sma, `${v.namn} ${s.namn}: små träffytor ${JSON.stringify(r.sma)}`).toEqual([]);
          expect(r.utanfor, `${v.namn} ${s.namn}: status utanför`).toEqual([]);
          if (skriv) {
            fs.mkdirSync(skriv, { recursive: true });
            await p.screenshot({ path: path.join(skriv, `${v.namn}-${s.w}.png`), fullPage: v.namn !== 'registrera' && v.namn !== 'nytt' });
          }
          await p.close();
        }
      }
    } finally { await b.close(); }
  }, 120_000);
});
