// @vitest-environment jsdom
// MÄTT I RIKTIG CHROMIUM. jsdom räknar ingen layout, så en rubrikrad som
// radbryts, en förklaring som trycker ut kortet i sidled eller en rad som blir
// lägre än 44 px syns inte där. Testet renderar listan i jsdom, mäter HTML:en i
// Playwright-Chromium med EXAKT samma CSS som FakturaRam (FAKTURA_CSS) och
// hoppas över om det inte finns någon Chromium — det står i testnamnet.
//
// Varför just listan: faktureringshögarna (2026-10-25) lade till fyra frågor
// med en förklarande rad under och en fakturarad i varje trakt ("Faktura
// 2026181 · 19 okt"). Sidokolumnen är 360 px, och där är det långa namn plus
// ett tal till höger som krockar först.
//
// FAKTURA_SKRIV=<mapp> sparar skärmbilderna.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import FakturaLista from './FakturaLista';
import { FAKTURA_CSS, SIDOKOLUMN_FRAN_PX } from './FakturaRam';
import { byggListVy, type OversiktsRad } from '@/lib/faktura/listaVy';
import { byggFakturaLage } from '@/lib/faktura/fakturaLage';
import { FARG, KOLUMN_CSS, TRAFFYTA, designCss } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({
  usePathname: () => '/ekonomi/fakturaunderlag',
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

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

const bas: OversiktsRad = {
  vo_nummer: '0', namn: 'Trakt', bolag: 'Vida', fortnox_kundnr: 1,
  avtalsform: 'ackord', tillstand: 'klar', avrakningsdatum: '2026-10-01',
  objekt_antal: 1, volym_m3fub: 100, g15h: 10,
  hinder: null, hinder_typ: null, saknar_objektrad: false,
  har_maskindata: true, debiterbart_arbete_tim: 0,
  debiterbart_arbete_poster: 0, manuell_skotartid_tim: 0,
};
const rad = (o: Partial<OversiktsRad>): OversiktsRad => ({ ...bas, ...o });

// Prod 2026-10-25: de verkliga trakterna i varje hög, med de längsta namnen.
const RADER: OversiktsRad[] = [
  rad({ vo_nummer: '11251428', namn: 'Vällust RP M-R -25', avrakningsdatum: '2026-10-20', volym_m3fub: 505 }),
  rad({ vo_nummer: '11225601', namn: 'Östra-Hoka 17 A-C -25', avrakningsdatum: '2026-10-12', volym_m3fub: 1204 }),
  rad({ vo_nummer: '11106406', namn: 'Anders Ingemarsson RP ATA', avrakningsdatum: '2026-02-18', volym_m3fub: 833 }),
  rad({ vo_nummer: '11271849', namn: 'Bågskyttebanan RP J-Hus- 25', avrakningsdatum: '2026-10-19', volym_m3fub: 1687, g15h: 76.6 }),
  rad({ vo_nummer: '11208196', namn: '400763 Akelius Tåget SA -26', avtalsform: 'timpeng', avrakningsdatum: '2026-09-21', volym_m3fub: 2187, g15h: 94.2 }),
  rad({ vo_nummer: '11226833', namn: 'Brokamåla 15 V-H avd 20 -25', avrakningsdatum: '2026-07-31', volym_m3fub: 2187 }),
  rad({ vo_nummer: '11256873', namn: 'Älmehult gallring 2026', avtalsform: 'timpeng', avrakningsdatum: '2026-10-07', volym_m3fub: 88, g15h: 16.1 }),
  rad({ vo_nummer: '11217222', namn: 'Tjuvön AU 2026', tillstand: 'atgard', hinder_typ: 'traillertimmar', hinder: 'Traillerflytt utan ifyllda timmar', avrakningsdatum: '2026-08-06', volym_m3fub: 1511 }),
  rad({ vo_nummer: '11124748', namn: 'Trestensdal gallring 2025.', tillstand: 'pagar', avtalsform: 'timpeng', avrakningsdatum: null, volym_m3fub: 612, g15h: 31.4 }),
  ...Array.from({ length: 12 }, (_, k) => rad({
    vo_nummer: `p${k}`, namn: `Pågår ${k}`, tillstand: 'pagar', avrakningsdatum: null,
  })),
];

const KNR: Record<string, string | null> = {
  '11251428': '971710', '11225601': '971545', '11106406': null,
  '11271849': '968539', '11208196': '972548', '11226833': '972114',
  '11256873': '971209', '11217222': '973322', '11124748': '970778',
};

const F = (dok: number, datum: string, knr: string, slutred = false) => ([
  { document_number: dok, invoice_date: datum, article_number: '8', description: `Kontraktsnr ${knr}` },
  ...(slutred
    ? [{ document_number: dok, invoice_date: datum, article_number: '7', description: 'Slutredovisning' }]
    : [{ document_number: dok, invoice_date: datum, article_number: '1', description: 'Skördning Gigant' }]),
]);

const faktura = byggFakturaLage(
  RADER.map(r => ({ vo_nummer: r.vo_nummer, kontraktsnummer: KNR[r.vo_nummer] ?? null })),
  [
    ...F(2026181, '2026-10-19', '968539'),
    ...F(2026178, '2026-10-19', '971209'),
    ...F(2026159, '2026-09-21', '972548'),
    ...F(2026140, '2026-08-07', '972114'),
    ...F(2026182, '2026-10-19', '972114', true),
    ...F(2026141, '2026-08-14', '973322'),
    ...F(2026150, '2026-09-04', '973322', true),
    ...F(2026175, '2026-10-13', '970778'),
  ],
);

function html(): string {
  document.body.innerHTML = '';
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  act(() => {
    r.render(<FakturaLista vy={byggListVy(RADER, { poster: 2, timmar: 2.93 }, faktura)} />);
  });
  const h = c.innerHTML;
  act(() => { r.unmount(); });
  return h;
}

/** Samma ram som vyn: fa-ram → fa-sida → fa-sida-inre, med vyns egen CSS. */
const sida = (inner: string) =>
  `<!doctype html><html><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>html,body{margin:0;background:${FARG.bg};color:${FARG.text};`
  // Ikonfonten finns inte här. Glyfens inline-fontSize (22 px) slår en vanlig
  // regel, så den måste tvingas bort — och rutan behållas, annars mäter vi en
  // smalare rad än den riktiga.
  + `font-family:system-ui,sans-serif}`
  + `.material-symbols-outlined{font-size:0 !important;display:inline-block;width:22px;height:22px}`
  + `${designCss}${KOLUMN_CSS}${FAKTURA_CSS}</style></head>`
  + `<body><div class="fa-ram fa-lista-vy"><aside class="fa-sida">`
  + `<div class="fa-sida-inre">${inner}</div></aside>`
  + `<main class="fa-innehall"></main></div></body></html>`;

describe(`Faktureringslistan — ${CHROMIUM ? 'mätt i Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  it.skipIf(!CHROMIUM)('ingen sidscroll, inga träffytor under 44 px, ett stort tal per skärm', async () => {
    const b = await CHROMIUM!.launch({});
    const skriv = process.env.FAKTURA_SKRIV;
    const matt: string[] = [];
    try {
      const sidHtml = sida(html());
      for (const s of SKARMAR) {
        const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
        await p.setContent(sidHtml);
        const r = await p.evaluate((min: number) => {
          const sma = Array.from(document.querySelectorAll('a, button')).map(k => {
            const b = (k as HTMLElement).getBoundingClientRect();
            return { txt: (k.textContent || '?').trim().slice(0, 28), h: Math.round(b.height) };
          }).filter(x => x.h + 0.5 < min);
          // Ett tal i TYP.tal per skärm: smalt läge har det stora talet,
          // sidokolumnen har INGET (traktens summa är skärmens tal där).
          const stora = Array.from(document.querySelectorAll('p'))
            .filter(e => getComputedStyle(e).fontSize === '32px'
              && (e as HTMLElement).offsetParent !== null);
          const lista = document.querySelector('.fa-sida') as HTMLElement;
          return {
            sma,
            sidscroll: document.documentElement.scrollWidth > window.innerWidth,
            listBredd: Math.round(lista.getBoundingClientRect().width),
            stora: stora.length,
            // Rubriker och förklaringar får inte sticka ut ur kolumnen.
            utanfor: Array.from(document.querySelectorAll('.fa-sida-inre h2, .fa-sida-inre p, .fa-sida-inre h3'))
              .filter(e => {
                const b = (e as HTMLElement).getBoundingClientRect();
                const l = lista.getBoundingClientRect();
                return b.right > l.right + 0.5 || b.left < l.left - 0.5;
              })
              .map(e => (e.textContent || '').slice(0, 28)),
            hogar: Array.from(document.querySelectorAll('[data-hog]'))
              .map(h => h.getAttribute('data-hog')),
          };
        }, TRAFFYTA.min);
        matt.push(`${s.namn}: lista ${r.listBredd} px, ${r.stora} stort tal, högar ${r.hogar.join('+')}`);
        expect(r.sidscroll, `${s.namn}: sidscroll i sidled`).toBe(false);
        expect(r.sma, `${s.namn}: träffytor under ${TRAFFYTA.min} px — ${JSON.stringify(r.sma)}`).toEqual([]);
        expect(r.utanfor, `${s.namn}: text utanför kolumnen — ${JSON.stringify(r.utanfor)}`).toEqual([]);
        expect(r.stora, `${s.namn}: antal 32-px-tal`).toBe(s.w >= SIDOKOLUMN_FRAN_PX ? 0 : 1);
        expect(r.hogar).toEqual(['att_fakturera', 'okant_lage', 'fakturerat', 'klart']);
        if (skriv) {
          fs.mkdirSync(skriv, { recursive: true });
          await p.screenshot({ path: path.join(skriv, `lista-${s.w}.png`), fullPage: true });
        }
        await p.close();
      }
    } finally { await b.close(); }
    // eslint-disable-next-line no-console
    console.log('Faktureringslistan mätt:\n  ' + matt.join('\n  '));
  }, 120_000);
});
