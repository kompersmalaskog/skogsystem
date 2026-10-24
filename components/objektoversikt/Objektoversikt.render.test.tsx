// @vitest-environment jsdom
// Objektöversikten: svaret först, frågorna i ordning, grafen som byter dag, listan som söker och markerar valt objekt,
// och PDF:en ur samma vymodell. Layouten (1/2/3 kolumner, listan bredvid från 1100 px) mäts i riktig Chromium — jsdom
// har ingen layout (CLAUDE.md).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Objekt from './Objekt';
import Lista from './Lista';
import fixtur from '@/lib/objektoversikt/__fixtures__/jatsbygd_2026.json';
import { sammanstall, summeraProduktion, type ObjektRad, type Underlag } from '@/lib/objektoversikt/berakna';
import { byggObjektVy, listPost, type ListPost } from '@/lib/objektoversikt/vy';
import { skapaObjektPdf } from '@/lib/objektoversikt/pdf';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock('@/app/helikopter/_components/PdfForhandsvisning', () => ({
  default: ({ filnamn, titel }: any) => createElement('div', { 'data-forhandsvisning': filnamn }, titel),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function montera(el: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(el); });
  return host;
}
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove(); root = null; host = null;
  document.body.innerHTML = '';
});

const objekt = fixtur.objekt as ObjektRad;
const u: Underlag = {
  objekt: [objekt, ...fixtur.franObjekt.map(f => ({ ...f, vo_nummer: null, dim_objekt_id: null, status: 'avslutat', typ: null, bolag: null, volym: null, areal: null, manuell_prognos: null, avslutad_timestamp: null }))],
  dim: fixtur.dim, alt: [], tid: fixtur.tid, manuell: fixtur.manuell, extra: [], flytt: fixtur.flytt, maskiner: fixtur.maskiner, platser: [], medarbetare: [], tradslag: fixtur.tradslag,
};
const namn = (id: string) => fixtur.maskiner.find(m => m.maskin_id === id)?.visningsnamn ?? id;
const vy = byggObjektVy(sammanstall(objekt, u), summeraProduktion(objekt, u, fixtur.produktion), namn);

describe('Objektet', () => {
  it('svaret står först, sedan frågorna i ordning', async () => {
    const h = await montera(createElement(Objekt, { vy }));
    const svar = h.querySelector('[data-svar]')!.textContent ?? '';
    expect(svar).toContain('Hur lång tid tog objektet?');
    expect(svar).toContain('157 tim 33 min');
    expect(svar).toContain('1 401 m³ skördat – 8,9 m³ per timme');
    const rubriker = Array.from(h.querySelectorAll('section')).map(s => s.getAttribute('aria-label'));
    expect(rubriker).toEqual(['Vart gick tiden?', 'Hur kom maskinerna hit?', 'Vad blev det?', 'Vad skulle göras?']);
  });

  it('prognosen står i ord, och skotarens överdrag är orange', async () => {
    const h = await montera(createElement(Objekt, { vy }));
    const skotare = h.querySelector('[data-rad="skotare"]')!;
    expect(skotare.textContent).toContain('Prognos 72 tim – blev 35 tim längre');
    const orange = Array.from(skotare.querySelectorAll('span')).filter(s => s.textContent?.startsWith('Prognos')).pop();
    expect(orange?.getAttribute('style')).toContain('rgb(255, 159, 10)');
    const skordare = h.querySelector('[data-rad="skordare"]')!;
    expect(Array.from(skordare.querySelectorAll('span')).filter(s => s.textContent?.startsWith('Prognos')).pop()?.getAttribute('style')).toBeFalsy();
  });

  it('grafen: senaste dagen vald, tryck byter dag', async () => {
    const h = await montera(createElement(Objekt, { vy }));
    expect(h.querySelector('[data-graf-vald]')!.textContent).toBe('fre 21 aug · 5,2 tim');
    const forsta = h.querySelector('[data-graf] button') as HTMLButtonElement;
    await act(async () => { forsta.click(); });
    expect(h.querySelector('[data-graf-vald]')!.textContent).toBe('mån 3 aug · 3,6 tim');
    expect(forsta.getAttribute('aria-pressed')).toBe('true');
  });

  it('Dela som PDF öppnar förhandsvisningen', async () => {
    const h = await montera(createElement(Objekt, { vy }));
    await act(async () => { (h.querySelector('[data-pdf]') as HTMLButtonElement).click(); });
    expect(h.querySelector('[data-forhandsvisning]')?.getAttribute('data-forhandsvisning')).toBe('Objektöversikt Jätsbygd au 2026.pdf');
  });

  it('pågående: Vad är kvar? står först', async () => {
    const s = sammanstall(objekt, { ...u, dim: u.dim.map(d => ({ ...d, skotning_avslutad: null })) });
    const h = await montera(createElement(Objekt, { vy: byggObjektVy(s, { volym: 0, stammar: 0, tradslag: [] }, namn) }));
    expect(h.querySelector('section')!.getAttribute('aria-label')).toBe('Vad är kvar?');
    expect(h.querySelector('[data-svar]')!.textContent).toContain('Hur lång tid har det tagit hittills?');
  });
});

describe('Listan', () => {
  const poster: ListPost[] = [
    listPost(sammanstall(objekt, u)),
    { id: 'p1', namn: 'Sandåsen gallring 2025', under: 'Gallring', hoger: '54 tim', grupp: 'pagar', klart: null },
  ];
  it('grupperar, söker och markerar valt objekt', async () => {
    const h = await montera(createElement(Lista, { poster, fel: null, valt: objekt.id }));
    expect(Array.from(h.querySelectorAll('section')).map(s => s.getAttribute('aria-label'))).toEqual(['Pågår', 'Augusti']);
    const vald = h.querySelector('[aria-current="page"]')!;
    expect(vald.getAttribute('href')).toBe(`/admin/objektoversikt/${objekt.id}`);
    expect(vald.textContent).toContain('Slutavverkning · 21 aug');
    expect(vald.textContent).toContain('158 tim');
    const sok = h.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(sok, 'sandå');
      sok.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(h.querySelectorAll('[data-objekt]').length).toBe(1);
  });

  it('läsfel är ett fel med Försök igen, aldrig en tom lista', async () => {
    const h = await montera(createElement(Lista, { poster: [], fel: 'maskintiden', valt: null }));
    expect(h.querySelector('[data-lista-fel]')!.textContent).toContain('Kunde inte läsa maskintiden');
  });
});

describe('PDF:en', () => {
  it('skapas ur samma vymodell', async () => {
    const bytes = await skapaObjektPdf(vy, '2026-10-22');
    expect(bytes.length).toBeGreaterThan(1000);
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toBe('Objektöversikt Jätsbygd au 2026');
  });
});
