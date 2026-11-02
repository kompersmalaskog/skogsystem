// @vitest-environment jsdom
// MÄTT I RIKTIG CHROMIUM (samma mönster som FakturaLista.matt.test.tsx). jsdom räknar ingen layout: om listan och
// personen står bredvid varandra, om en lång rad trycker ut sidan i sidled eller om en knapp blir lägre än 44 px syns
// bara i en riktig webbläsare. Vyn renderas i jsdom med vyns EGEN <style> (PERSONAL_CSS), HTML:en mäts i Chromium.
// Hoppas över om det inte finns någon Chromium — det står i testnamnet. PERSONAL_SKRIV=<mapp> sparar skärmbilderna.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import PersonalClient, { PERSONAL_DELAD_FRAN_PX } from './PersonalClient';
import { FARG, KOLUMN, TRAFFYTA } from '@/lib/design/tokens';

vi.mock('@/lib/arbetsmiljo/introduktion', async (orig) => ({
  ...(await orig<typeof import('@/lib/arbetsmiljo/introduktion')>()),
  hamtaKvitton: async () => new Map(),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SKARMAR = [
  { namn: 'smal telefon 360', w: 360, h: 740 },
  { namn: 'telefon 390', w: 390, h: 844 },
  { namn: 'iPad stående 834', w: 834, h: 1112 },
  { namn: 'iPad liggande 1180', w: 1180, h: 820 },
  { namn: 'dator 1440', w: 1440, h: 900 },
];

function chromium(): { launch: (o: object) => Promise<any> } | null {
  for (const las of [
    () => createRequire(import.meta.url)('playwright'),
    () => createRequire(path.join(
      execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'x.js'))('playwright'),
  ]) {
    try {
      const pw = las();
      const exe = pw.chromium.executablePath();
      if (!exe || !fs.existsSync(exe)) continue;
      return { launch: (o) => pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'], ...o }) };
    } catch { /* nästa väg */ }
  }
  return null;
}
const CHROMIUM = chromium();

// Långa namn och långa statusrader — det är där en rad krockar först.
const SVAR = {
  ok: true, arAdmin: true, egenId: 'martin',
  skyddsombud: { id: 'oskar', namn: 'Oskar Nilsson', telefon: '070-333 33 33' },
  personal: [
    { id: 'martin', namn: 'Martin Kompersmåla', roll: 'admin', maskin_namn: 'Scorpion', telefon: '070-000 00 00', anhorig_namn: 'Lisa', anhorig_telefon: '070-999 99 99', anhorig_relation: 'fru', utbildning: [], ledighet: null },
    { id: 'stefan', namn: 'Stefan Nilsson Brorsmåla', roll: 'forare', maskin_namn: 'Scorpion', telefon: null, anhorig_namn: null, anhorig_telefon: null, anhorig_relation: null, utbildning: [{ namn: 'Motorsågskörkort AB', status: 'saknas', kravtyp: 'lag', giltig_till: null }], ledighet: null, mat: 'Laktosfri, äter inte fisk', anstallningsdatum: null },
    { id: 'oskar', namn: 'Oskar Nilsson', roll: 'forare', maskin_namn: 'H8E -26', telefon: '070-333 33 33', anhorig_namn: 'Eva Nilsson', anhorig_telefon: '070-444 44 44', anhorig_relation: 'mamma', utbildning: [{ namn: 'Första hjälpen / HLR', status: 'gar_ut_snart', kravtyp: 'bestallare', giltig_till: '2026-12-10' }], ledighet: null },
    { id: 'joacim', namn: 'Joacim', roll: 'forare', maskin_namn: 'Wisent', telefon: '070-555 55 55', anhorig_namn: 'Sara', anhorig_telefon: '070-666 66 66', anhorig_relation: 'sambo', utbildning: [{ namn: 'HLR', status: 'giltig', kravtyp: 'bestallare', giltig_till: '2099-01-01' }], ledighet: { typ: 'semester', startdatum: '2099-06-01', slutdatum: '2099-06-05' } },
  ],
};

async function html(adress: string): Promise<string> {
  window.history.replaceState(null, '', adress);
  (globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => SVAR });
  window.scrollTo = (() => {}) as any;
  document.body.innerHTML = '';
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  await act(async () => { r.render(<PersonalClient />); });
  await act(async () => { await Promise.resolve(); });
  const h = c.innerHTML;
  act(() => { r.unmount(); });
  return h;
}

const sida = (inner: string) =>
  `<!doctype html><html><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>html,body{margin:0;background:${FARG.bg};color:${FARG.text};font-family:system-ui,sans-serif}`
  // Ikonfonten finns inte här: behåll glyfens ruta så att raden mäts lika bred som den riktiga.
  + `.material-symbols-outlined{font-size:0 !important;display:inline-block;width:18px;height:18px}</style></head>`
  + `<body>${inner}</body></html>`;

describe(`Personal — ${CHROMIUM ? 'mätt i Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  it.skipIf(!CHROMIUM)('listan och personen: en sak per skärm under 1000 px, bredvid varandra därifrån; ingen sidscroll, inga små träffytor', async () => {
    const b = await CHROMIUM!.launch({});
    const skriv = process.env.PERSONAL_SKRIV;
    const matt: string[] = [];
    try {
      const lagen = [
        { namn: 'lista', html: sida(await html('/personal')) },
        { namn: 'person', html: sida(await html('/personal?p=stefan')) },
      ];
      for (const lage of lagen) {
        for (const s of SKARMAR) {
          const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
          await p.setContent(lage.html);
          const r = await p.evaluate((min: number) => {
            const synlig = (e: Element | null) => !!e && (e as HTMLElement).offsetParent !== null && (e as HTMLElement).getBoundingClientRect().height > 0;
            const lista = document.querySelector('.ps-lista');
            const person = document.querySelector('.ps-person');
            // Bredden är KOLUMNENS (VyKolumn, första barnet), inte rutans — under 1000 px är rutan hela sidan.
            const lb = lista?.firstElementChild?.getBoundingClientRect();
            const pb = person?.firstElementChild?.getBoundingClientRect();
            const sma = Array.from(document.querySelectorAll('a, button'))
              .filter((k) => synlig(k))
              .map((k) => ({ txt: (k.textContent || '?').trim().slice(0, 28), h: Math.round((k as HTMLElement).getBoundingClientRect().height) }))
              .filter((x) => x.h + 0.5 < min);
            return {
              sidscroll: document.documentElement.scrollWidth > window.innerWidth,
              listaSyns: synlig(lista), personSyns: synlig(person),
              listaBredd: lb ? Math.round(lb.width) : 0, personBredd: pb ? Math.round(pb.width) : 0,
              bredvid: !!(lb && pb && synlig(lista) && synlig(person) && pb.left >= lb.right),
              tillbakaSyns: synlig(document.querySelector('.ps-tillbaka')),
              sma,
            };
          }, TRAFFYTA.min);
          matt.push(`${lage.namn} ${s.namn}: lista ${r.listaSyns ? r.listaBredd : '–'} · person ${r.personSyns ? r.personBredd : '–'}`);
          expect(r.sidscroll, `${lage.namn} ${s.namn}: sidscroll i sidled`).toBe(false);
          expect(r.sma, `${lage.namn} ${s.namn}: träffytor under ${TRAFFYTA.min} px — ${JSON.stringify(r.sma)}`).toEqual([]);
          if (s.w >= PERSONAL_DELAD_FRAN_PX) {
            expect(r.bredvid, `${lage.namn} ${s.namn}: listan och personen bredvid varandra`).toBe(true);
            expect(r.listaBredd).toBe(320);
            expect(r.personBredd).toBeLessThanOrEqual(KOLUMN.smal);
            expect(r.tillbakaSyns, `${s.namn}: ingen tillbaka-länk när listan står bredvid`).toBe(false);
          } else {
            expect([r.listaSyns, r.personSyns], `${lage.namn} ${s.namn}: en sak per skärm`).toEqual(lage.namn === 'lista' ? [true, false] : [false, true]);
            if (lage.namn === 'person') expect(r.tillbakaSyns).toBe(true);
            const synligBredd = lage.namn === 'lista' ? r.listaBredd : r.personBredd;
            expect(synligBredd, `${lage.namn} ${s.namn}: kolumnen`).toBeLessThanOrEqual(KOLUMN.smal);
          }
          if (skriv) {
            fs.mkdirSync(skriv, { recursive: true });
            await p.screenshot({ path: path.join(skriv, `personal-${lage.namn}-${s.w}.png`), fullPage: true });
          }
          await p.close();
        }
      }
    } finally { await b.close(); }
    // eslint-disable-next-line no-console
    console.log('Personal mätt:\n  ' + matt.join('\n  '));
  }, 120_000);
});
