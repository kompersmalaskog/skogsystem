// @vitest-environment jsdom
// MÄTT I RIKTIG CHROMIUM. jsdom räknar ingen layout, så stepper-knapparnas
// storlek, att Spara syns utan att man scrollar och att inget radbryts i
// sidled går inte att pröva där. Testet renderar arket i jsdom och mäter HTML:en
// i Playwright-Chromium; finns ingen Chromium hoppas mätningen över (det står i
// testnamnet).
//
// Granskningen körs vid skrivbordet och på iPad, inte i hytten — men 44 px är
// 44 px, och summan till höger får aldrig lägga sig över etiketten till vänster
// på en smal skärm.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import GranskningArk, { type GranskningProps, type Vy } from './GranskningArk';
import { raknaSortiment, type SortimentRad } from '@/lib/ekonomi/sortimentAntal';
import { FARG, TRAFFYTA } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SKARMAR = [
  { namn: 'telefon 390', w: 390, h: 844 },
  { namn: 'smal telefon 360', w: 360, h: 740 },
  { namn: 'dator 1280', w: 1280, h: 800 },
];

/**
 * Playwright säger själv var webbläsaren ligger. Att bygga sökvägen för hand
 * ("chrome-linux/chrome") går sönder tyst när mappen heter något annat —
 * chrome-linux64 i den här miljön — och då HOPPAS mätningen över i stället för
 * att larma. Faller importen tillbaka på den globala installationen.
 */
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

const rad = (namn: string, kundkod: string | null, m3: number): SortimentRad =>
  ({ sortiment_id: namn, namn, kundkod, volym_m3sub: m3 });

// Brokamåla ur prod — längsta namnen och båda listorna, alltså värsta fallet.
const rakning = raknaSortiment([
  rad('Timmer: Hästveda 195 kv1_V3', null, 1376.6),
  rad('Massa: BmavFall_V3', '100-1', 403.2),
  rad('Kubb: Alvesta305_V3', '262-VAL', 346.5),
  rad('Energi: Engved3mGran_V3', '539-1', 37.2),
  rad('Massa: BjörkmavFall_V3', '104-1', 10.5),
  rad('Timmer: Hästveda 195 kv2_V3', null, 4.3),
  rad('Massa: HemvedFall_V3', '909-1', 3.9),
  rad('Energi: AvkapGran_V3', '432-2', 3.5),
  rad('Unclassified', null, 2.7),
  rad('Energi: Engved3mÖvLöv_V3', '539-1', 1.2),
]);
const SORT = { rakning, anvant: 7, manuellt: false, grundantal: 6, krPerExtra: 2, giltigFran: '2025-06-03' };

const props = (vy: Vy): GranskningProps => ({
  vy, onVy: () => {},
  sortiment: { g: SORT, volym: 2186.79, sortKr: 2 },
  pris: {
    prislista: { medelstam: 0.69, klass: 0.6, total: 100, skordare: 58, skotare: 58.5 },
    tillaggsposter: [
      { etikett: 'Krönt', belopp: 1.5, mottagare: 'skordare' },
      { etikett: 'Storlek', belopp: -1, mottagare: 'delas' },
      { etikett: 'Terräng', belopp: 2, mottagare: 'skotare' },
      { etikett: 'Sortiment', belopp: 2, mottagare: 'skotare' },
    ],
    avstandKr: 12, volym: 2186.79, prisdatum: '2026-07-31', sortiment: SORT,
  },
  summa: 254761, skotarAntal: 2186.79, skotarPris: 58.5,
  dimObjektIds: ['A_1'], voNummer: '11271849', onSparat: () => {},
});

function html(vy: Vy): string {
  document.body.innerHTML = '';
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  act(() => { r.render(<GranskningArk {...props(vy)} />); });
  const h = document.body.innerHTML;
  act(() => { r.unmount(); });
  return h;
}

const sida = (inner: string) =>
  `<!doctype html><html><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>html,body{margin:0;background:${FARG.bg};color:#fff;`
  + `font-family:system-ui,sans-serif}.material-symbols-outlined{font-size:0}</style>`
  + `</head><body>${inner}</body></html>`;

describe(`Granskningen — ${CHROMIUM ? 'mätt i Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  it.skipIf(!CHROMIUM)('inga träffytor under 44 px, ingen sidscroll, och Spara syns utan att scrolla', async () => {
    const b = await CHROMIUM!.launch({});
    const matt: string[] = [];
    try {
      for (const s of SKARMAR) {
        for (const vy of ['sortiment', 'pris', 'ratta'] as Vy[]) {
          const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
          await p.setContent(sida(html(vy)));
          const r = await p.evaluate((min: number) => {
            // HÖJDEN gäller alla knappar. BREDDEN bara de utan ord (steppern
            // − och +): arkets "Klar"/"Avbryt" är en textlänk i huvudet, 44 px
            // hög men bara så bred som ordet — den delas av hela appen och
            // mäts inte om här.
            const sma = Array.from(document.querySelectorAll('button')).map(k => {
              const b = (k as HTMLElement).getBoundingClientRect();
              const ord = (k.textContent || '').trim();
              return { txt: (ord || k.getAttribute('aria-label') || '?').slice(0, 24), h: Math.round(b.height), w: Math.round(b.width), kravBredd: ord.length <= 1 };
            }).filter(x => x.h + 0.5 < min || (x.kravBredd && x.w + 0.5 < min));
            const sp = Array.from(document.querySelectorAll('button')).find(k => k.textContent === 'Spara');
            const spb = sp ? (sp as HTMLElement).getBoundingClientRect() : null;
            return {
              sma,
              sidscroll: document.documentElement.scrollWidth > window.innerWidth,
              sparaUnder: spb ? Math.round(spb.bottom - window.innerHeight) : null,
              arkBredd: Math.round((document.querySelector('.sheet-upp') as HTMLElement)?.getBoundingClientRect().width ?? 0),
            };
          }, TRAFFYTA.min);
          matt.push(`${s.namn} · ${vy}: ark ${r.arkBredd} px, sidscroll ${r.sidscroll}`
            + (r.sparaUnder != null ? `, Spara ${r.sparaUnder <= 0 ? 'syns' : `${r.sparaUnder} px under kanten`}` : ''));
          expect(r.sma, `${s.namn} · ${vy}: knappar under ${TRAFFYTA.min} px — ${JSON.stringify(r.sma)}`).toEqual([]);
          expect(r.sidscroll, `${s.namn} · ${vy}: sidscroll i sidled`).toBe(false);
          // Spara ligger i arkets FOT, utanför det som rullar — den får aldrig
          // hamna under skärmkanten, annars ser man inte att man kan spara.
          if (r.sparaUnder != null) expect(r.sparaUnder, `${s.namn}: Spara under skärmkanten`).toBeLessThanOrEqual(0);
          await p.close();
        }
      }
    } finally { await b.close(); }
    // eslint-disable-next-line no-console
    console.log('Granskningen mätt:\n  ' + matt.join('\n  '));
  }, 120_000);

  it.skipIf(!CHROMIUM)('summan till höger lägger sig aldrig över etiketten till vänster', async () => {
    const b = await CHROMIUM!.launch({});
    try {
      for (const s of SKARMAR) {
        const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
        await p.setContent(sida(html('pris')));
        const krock = await p.evaluate(() => {
          const ut: string[] = [];
          // Bara rader som LIGGER i sidled: en staplad div har av naturen
          // barn vars högerkanter går om varandra.
          for (const r of Array.from(document.querySelectorAll('div'))) {
            const stil = getComputedStyle(r);
            if (stil.display !== 'flex' || stil.flexDirection !== 'row') continue;
            const barn = (Array.from(r.children) as HTMLElement[])
              .filter(x => x.getBoundingClientRect().width > 0);
            if (barn.length !== 2) continue;
            const [v, h] = barn.map(x => x.getBoundingClientRect());
            if (v.right > h.left + 0.5) ut.push((barn[0].textContent || '').slice(0, 30));
          }
          return ut;
        });
        expect(krock, `${s.namn}: etikett och tal krockar`).toEqual([]);
        await p.close();
      }
    } finally { await b.close(); }
  }, 120_000);
});
