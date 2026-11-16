// @vitest-environment jsdom
// "Vad behöver du kolla?" på en trakt: raderna säger vad som fattas och vad det
// är värt, de går att trycka på, och de finns inte när allt är ifyllt.
//
// Facit är Skälviken RP J-Hus -25 i prod 2026-11-16 — trakten som skulle
// faktureras den dagen: 1 725,2 m³ skördat, två lass med körsträcka som bär
// 40 m³, terräng tom, sortimentsantalet obekräftat.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import TraktKlient from './TraktKlient';
import { byggFattas } from '@/lib/faktura/fattas';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({
  usePathname: () => '/ekonomi/fakturaunderlag/11271860',
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const skalvikenFattas = () => byggFattas({
  timpeng: false,
  kontraktsnummer: '969670',
  volymM3fub: 1725.2,
  terrangKr: 0,
  avstand: { manuellt: null, lassVolym: 40, lassAntal: 2, kronor: 1680 },
  sortiment: { manuellt: false, anvant: 7, raknat: 7, grundantal: 6, krPerExtra: 2 },
});

/** Svaret från /api/faktura/underlag, nedkokat till det vyn läser. */
const svar = (fattas = skalvikenFattas()) => ({
  ok: true,
  resultat: [{
    vo_nummer: '11271860',
    objektnamn: 'Skälviken RP J-Hus -25',
    bolag: 'Vida',
    avtalsform: 'ackord',
    avrakningsdatum: '2026-11-13',
    objekt_ids: ['11271860'],
    rader: [],
    noter: [],
    hinder: [],
    summa_kant: 176826,
    rader_utan_pris: 0,
    granskning: null,
    fattas,
  }],
});

let root: Root | null = null;
let el: HTMLDivElement | null = null;

beforeEach(() => {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  el?.remove();
  el = null;
  vi.unstubAllGlobals();
});

async function rita(fattas?: ReturnType<typeof byggFattas>) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => svar(fattas),
  })));
  await act(async () => { root!.render(<TraktKlient vo="11271860" manuellt={null} />); });
  // Hämtningen är ett löfte till — låt det landa.
  await act(async () => { await Promise.resolve(); });
  return el!;
}

const text = (e: HTMLElement) => (e.textContent || '').replace(/ /g, ' ');

describe('Skälviken: kortet säger vad som fattas', () => {
  it('rubriken räknar sakerna, och alla tre raderna står där', async () => {
    const e = await rita();
    expect(text(e)).toContain('3 saker att kolla');
    expect(e.querySelector('[data-fattas="avstand"]')).toBeTruthy();
    expect(e.querySelector('[data-fattas="terrang"]')).toBeTruthy();
    expect(e.querySelector('[data-fattas="sortiment"]')).toBeTruthy();
  });

  it('avståndsraden bär täckningen och kronorna — inte bara "saknas"', async () => {
    const e = await rita();
    const rad = text(e.querySelector('[data-fattas="avstand"]') as HTMLElement);
    expect(rad).toContain('bygger på 2 % av volymen');
    expect(rad).toContain('40 m³fub av 1 725 m³fub');
    expect(rad).toContain('0,97 kr/m³fub · 1 680 kr');
  });

  it('sortimentet bär vad det kostar hela trakten', async () => {
    const e = await rita();
    expect(text(e.querySelector('[data-fattas="sortiment"]') as HTMLElement))
      .toContain('+2,00 kr/m³fub · 3 450 kr');
  });

  it('terräng och avstånd leder till Redigering, sortimentet till granskningen', async () => {
    const e = await rita();
    const lank = (n: string) => (e.querySelector(`[data-fattas="${n}"]`) as HTMLElement)
      .closest('a')?.getAttribute('href');
    expect(lank('avstand')).toBe('/redigering?objekt=11271860');
    expect(lank('terrang')).toBe('/redigering?objekt=11271860');
    // Sortimentet öppnar ett ark i vyn, alltså en knapp och ingen länk.
    const s = e.querySelector('[data-fattas="sortiment"]') as HTMLElement;
    expect(s.closest('a')).toBeNull();
    expect(s.closest('button')).toBeTruthy();
  });

  it('EN orange prick på förklaringen, aldrig en per rad', async () => {
    const e = await rita();
    const orange = Array.from(e.querySelectorAll('span[aria-hidden="true"]'))
      .filter(s => (s as HTMLElement).style.background.includes('255, 159, 10')
        || (s as HTMLElement).style.background === '#ff9f0a');
    expect(orange).toHaveLength(1);
  });

  it('kortet SPÄRRAR inte — summan står kvar och är läsbar', async () => {
    const e = await rita();
    expect(text(e)).toContain('Vad ska faktureras?');
    expect(text(e)).toContain('176 826');
  });
});

describe('en trakt där allt är ifyllt', () => {
  it('inget kort alls — ingen tom rubrik, ingen grön bock', async () => {
    const e = await rita([]);
    expect(text(e)).not.toContain('att kolla');
    expect(e.querySelector('[data-fattas]')).toBeNull();
  });
});
