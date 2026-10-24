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
  it('svaret står först: hela timmar, prognosen i ord och en förklaring', async () => {
    const h = await montera(createElement(Objekt, { vy }));
    const svar = h.querySelector('[data-svar]')!.textContent ?? '';
    expect(svar).toContain('Det tog');
    expect(h.querySelector('[data-svar-tal]')!.textContent).toBe('158 timmar');
    expect(h.querySelector('[data-plan]')!.textContent).toContain('Prognos för maskinerna: 128 timmar.');
    expect(h.querySelector('[data-plan]')!.textContent).toContain('28 timmar mer än prognosen.');
    expect(h.querySelector('[data-forklaring]')!.textContent).toBe('Skotaren behövde 35 timmar mer än prognosen. Skördaren var klar 7 timmar tidigare.');
    const rubriker = Array.from(h.querySelectorAll('section')).map(s => s.getAttribute('aria-label'));
    expect(rubriker).toEqual(['Vem gjorde vad?', 'Hur mycket virke?', 'Mer om objektet']);
    const synligt = h.cloneNode(true) as HTMLElement;
    synligt.querySelectorAll('style').forEach(x => x.remove());
    expect(synligt.textContent).not.toMatch(/planera|\bG15|l\/m³|medelstam/i);
  });

  it('avvikelsen är orange när det blev mer än 10 % över prognosen', async () => {
    const h = await montera(createElement(Objekt, { vy }));
    const orange = Array.from(h.querySelectorAll('[data-plan] span')).find(x => x.textContent?.includes('28 timmar mer'));
    expect(orange?.getAttribute('style')).toContain('rgb(255, 159, 10)');
  });

  it('vem gjorde vad: skotaren fälls ut på plats och visar maskinerna, en rad åt gången', async () => {
    const h = await montera(createElement(Objekt, { vy }));
    const skotare = h.querySelector('[data-rad="skotare"]') as HTMLElement;
    expect(skotare.textContent).toContain('prognos 72 timmar');
    expect(h.querySelector('[data-detalj]')).toBeNull();
    await act(async () => { skotare.click(); });
    expect(skotare.getAttribute('aria-expanded')).toBe('true');
    expect(Array.from(h.querySelectorAll('[data-detalj]')).map(d => d.textContent)).toEqual([
      expect.stringContaining('Wisent'), expect.stringContaining('Elefant 26'),
    ]);
    await act(async () => { (h.querySelector('[data-rad="flytt"]') as HTMLElement).click(); });
    expect(skotare.getAttribute('aria-expanded')).toBe('false');
    expect(h.querySelector('[data-detalj]')!.textContent).toContain('Giant från Åbogen RP 2026');
  });

  it('virket: svaret och prognosen', async () => {
    const h = await montera(createElement(Objekt, { vy }));
    const v = h.querySelector('section[aria-label="Hur mycket virke?"]')!.textContent ?? '';
    expect(v).toContain('1 401 m³');
    expect(v).toContain('prognos 1 738 m³');
    expect(v).toContain('Gran');
  });

  it('dag för dag ligger bakom en rad; senaste dagen vald, tryck byter dag', async () => {
    const h = await montera(createElement(Objekt, { vy }));
    expect(h.querySelector('[data-graf]')).toBeNull();
    await act(async () => { (h.querySelector('[data-mer="dag"]') as HTMLElement).click(); });
    expect(h.querySelector('[data-graf-vald]')!.textContent).toBe('fre 21 aug · 5,2 tim');
    const forsta = h.querySelector('[data-graf] button') as HTMLButtonElement;
    await act(async () => { forsta.click(); });
    expect(h.querySelector('[data-graf-vald]')!.textContent).toBe('mån 3 aug · 3,6 tim');
    expect(forsta.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { (h.querySelector('[data-mer="fler"]') as HTMLElement).click(); });
    expect(h.querySelector('[data-graf]')).toBeNull();
    expect(h.textContent).toContain('2 262 liter');
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
    expect(h.querySelector('[data-svar]')!.textContent).toContain('Hittills har det tagit');
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
