// @vitest-environment jsdom
// Gallringsvyn: det som kan gå sönder tyst — svaret som inte står först, en pågående trakt som ser klar ut,
// maskinens koder i stället för virkets namn, en kvittoknapp som syns innan skördningen är klar, eller ett läsfel
// som ser ut som "inga gallringar". Layouten (listan bredvid trakten från 1100 px, två kolumner från 640 px
// trakt-bredd) mäts i riktig Chromium, inte här — jsdom har ingen layout (CLAUDE.md).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { GallringDetalj, GallringRad } from '@/lib/gallring';

let sokvag = '/gallring';
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('next/navigation', () => ({ usePathname: () => sokvag }));

const hamtaGallringar = vi.fn<() => Promise<GallringRad[]>>();
const hamtaGallring = vi.fn<(vo: string) => Promise<GallringDetalj | null>>();
vi.mock('@/lib/gallring', async (orig) => ({
  ...(await orig<typeof import('@/lib/gallring')>()),
  aktuelltAr: () => 2026,
  hamtaGallringar: () => hamtaGallringar(),
  hamtaGallring: (vo: string) => hamtaGallring(vo),
}));

import GallringRam from './GallringRam';
import Trakt from './Trakt';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function montera(el: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(el); });
  await act(async () => { await Promise.resolve(); });
  return host;
}
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove(); root = null; host = null;
  document.body.innerHTML = '';
  hamtaGallringar.mockReset(); hamtaGallring.mockReset();
  sokvag = '/gallring';
});

function rad(over: Partial<GallringRad>): GallringRad {
  return {
    vo: '1', namn: 'Trakt', objektIds: [], maskiner: ['Rottne H8E -26'], forare: ['Oskar'], forstaDatum: '2026-10-12', sistaDatum: '2026-10-20',
    antalDagar: 7, volymM3fub: 295.7, stammar: 4285, tradslag: [{ namn: 'Gran', stammar: 3000, volym: 200 }, { namn: 'Tall', stammar: 1285, volym: 95.7 }],
    arealHa: null, skordningAvslutad: '2026-10-20', diameter: null, ...over,
  };
}

const LISTA = [
  rad({ vo: '11266677', namn: 'Intaget gallring', volymM3fub: 41.9, stammar: 1203, sistaDatum: '2026-10-22', antalDagar: 3, skordningAvslutad: null }),
  rad({ vo: '11105602', namn: 'Toftåsa gallring 2026', volymM3fub: 105.4, stammar: 909, forstaDatum: '2026-10-10', sistaDatum: '2026-10-12', antalDagar: 3 }),
  rad({ vo: '11219862', namn: 'Hålabäck 16 ga 2026', volymM3fub: 141.2, stammar: 3180, forstaDatum: '2026-08-27', sistaDatum: '2026-09-02', antalDagar: 5 }),
  rad({ vo: '999', namn: 'Gammal', sistaDatum: '2025-12-01' }),
];

describe('listan', () => {
  it('svaret först: årets volym som summan av de visade raderna, och hur många som pågår', async () => {
    hamtaGallringar.mockResolvedValue(LISTA);
    const h = await montera(createElement(GallringRam, null, createElement('div')));
    expect(h.querySelector('[data-svar]')?.textContent).toBe('288,5 m³fub'); // 41,9 + 105,4 + 141,2
    expect(h.textContent).toContain('3 trakter · 1 pågår');
    expect(h.textContent).toContain('1 trakt från tidigare år visas inte');
  });

  it('pågående trakt står under Pågår, de klara per månad', async () => {
    hamtaGallringar.mockResolvedValue(LISTA);
    const h = await montera(createElement(GallringRam, null, createElement('div')));
    const sektioner = Array.from(h.querySelectorAll('section')).map((s) => [s.getAttribute('aria-label'), Array.from(s.querySelectorAll('[data-trakt-rad]')).map((a) => a.getAttribute('data-trakt-rad'))]);
    expect(sektioner).toEqual([
      ['Pågår', ['11266677']],
      ['Oktober', ['11105602']],
      ['September', ['11219862']],
    ]);
    const intaget = h.querySelector('[data-trakt-rad="11266677"]')!;
    expect(intaget.textContent).toContain('Senast');
    expect(intaget.textContent).toContain('41,9 m³');
    expect(h.querySelector('[data-trakt-rad="11105602"]')!.textContent).toContain('10–12 okt · 3 dagar');
  });

  it('vald trakt är markerad i listan (listan bredvid på bred skärm)', async () => {
    hamtaGallringar.mockResolvedValue(LISTA);
    sokvag = '/gallring/11105602';
    const h = await montera(createElement(GallringRam, null, createElement('div')));
    expect(h.querySelector('[aria-current="page"]')?.getAttribute('data-trakt-rad')).toBe('11105602');
    expect(h.querySelector('.gr-trakt-vy')).not.toBeNull();
  });

  it('ett läsfel är ett fel med Försök igen — aldrig en tom lista', async () => {
    hamtaGallringar.mockRejectedValueOnce(new Error('nät')).mockResolvedValueOnce(LISTA);
    const h = await montera(createElement(GallringRam, null, createElement('div')));
    expect(h.textContent).toContain('Kunde inte läsa gallringarna');
    expect(h.querySelector('[data-tom]')).toBeNull();
    const knapp = Array.from(h.querySelectorAll('button')).find((b) => b.textContent === 'Försök igen')!;
    await act(async () => { knapp.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(h.querySelector('[data-svar]')).not.toBeNull();
  });

  it('kvittot ritas utan ram och utan lista', async () => {
    sokvag = '/gallring/11105602/kvitto';
    const h = await montera(createElement(GallringRam, null, createElement('p', { id: 'kvitto' }, 'kvitto')));
    expect(h.querySelector('#kvitto')).not.toBeNull();
    expect(h.querySelector('[data-gallring-lista]')).toBeNull();
    expect(hamtaGallringar).not.toHaveBeenCalled();
  });
});

const DETALJ: GallringDetalj = {
  ...rad({ vo: '11183108', namn: 'Sandåsen gallring 2025', skordningAvslutad: null }),
  sortiment: [
    { grupp: 'Massa', namn: 'BmavFall_V3', stockar: 900, volym: 200 },
    { grupp: 'Massaved', namn: 'Bjork mav3m', stockar: 100, volym: 36 },
    { grupp: 'Kubb', namn: 'Alvesta275_V3', stockar: 80, volym: 36 },
    { grupp: 'Energi', namn: 'AvkapGran_V3', stockar: 40, volym: 23.7 },
  ],
  dagar: [{ datum: '2026-10-12', stammar: 600, volym: 40 }, { datum: '2026-10-13', stammar: 700, volym: 45 }],
  diameter: {
    matta: 4000, dgvMm: 142, medelMm: 130, medianMm: 128, minMm: 60, maxMm: 290, grundytaM2: 5,
    klasser: [{ franMm: 80, tillMm: 100, antal: 500 }, { franMm: 100, tillMm: 120, antal: 1500 }, { franMm: 280, tillMm: null, antal: 10 }],
  },
};

describe('trakten', () => {
  it('svaret först, status i ord, maskinens namn och ingen kvittoknapp medan den pågår', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    const svar = h.querySelector('[data-svar]')!;
    expect(svar.textContent).toContain('VO 11183108 · Pågår');
    expect(svar.textContent).toContain('295,7 m³fub');
    expect(svar.textContent).toContain('medelstam 0,069 m³');
    expect(svar.textContent).toContain('Rottne H8E -26');
    expect(h.querySelector('[data-kvitto]')).toBeNull();
    expect(h.textContent).toContain('Kvitto kan skapas när skördningen är klar');
  });

  it('kvittot är vyns enda handling när skördningen är klar', async () => {
    hamtaGallring.mockResolvedValue({ ...DETALJ, skordningAvslutad: '2026-10-20' });
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    expect(h.textContent).toContain('Klar 20 okt');
    expect(h.querySelector('[data-kvitto]')?.getAttribute('href')).toBe('/gallring/11183108/kvitto');
  });

  it('virket i fyra grupper — maskinens koder syns aldrig', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    const virket = h.querySelector('section[aria-label="Vad blev virket?"]')!;
    expect(virket.textContent).toContain('Massaved');
    expect(virket.textContent).toContain('236,0 m³');
    expect(virket.textContent).toContain('Kubb');
    expect(h.textContent).not.toContain('BmavFall');
    expect(h.textContent).not.toContain('Alvesta275');
  });

  it('Dgv i cm, en gång', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    expect(h.textContent!.match(/Dgv \d/g)).toEqual(['Dgv 1']);
    expect(h.textContent).toContain('Dgv 14,2 cm');
    expect(h.textContent!.replace(/\u00a0/g, ' ')).toContain('Bygger på 4 000 av 4 285 stammar');
  });

  it('trädslag och dagar ligger bakom en rad som öppnar ett ark', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    const mer = h.querySelector('[data-mer]') as HTMLButtonElement;
    expect(mer.textContent).toContain('Trädslag och dagar');
    expect(mer.textContent).toContain('Gran 68 % · Tall 32 %');
    await act(async () => { mer.click(); });
    const ark = document.querySelector('[role="dialog"]')!;
    expect(ark.textContent).toContain('Vilka träd togs ut?');
    expect(ark.textContent).toContain('mån 12 okt');
  });

  it('"hittades inte" och "kunde inte läsa" skrivs olika', async () => {
    hamtaGallring.mockResolvedValue(null);
    let h = await montera(createElement(Trakt, { vo: 'x' }));
    expect(h.textContent).toContain('Ingen gallring med VO x');
    await act(async () => { root!.unmount(); }); root = null; host?.remove();
    hamtaGallring.mockRejectedValue(new Error('nät'));
    h = await montera(createElement(Trakt, { vo: 'x' }));
    expect(h.textContent).toContain('Kunde inte läsa trakten');
    expect(h.querySelector('a[href="/gallring"]')).not.toBeNull();
  });
});
