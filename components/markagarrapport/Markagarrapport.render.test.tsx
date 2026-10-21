// @vitest-environment jsdom
// Markägarrapporten: det som kan gå sönder tyst — svaret som inte står först, en fråga som försvinner, Mer som inte öppnas,
// en sökning som inte filtrerar eller en vald avverkning som inte markeras. Layouten (1/2/3 kolumner, listan bredvid från
// 1100 px) mäts i riktig Chromium, inte här — jsdom har ingen layout (CLAUDE.md).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Rapport from './Rapport';
import ObjektLista from './ObjektLista';
import { byggRapportVy } from '@/lib/markagarrapport/vy';
import type { MarkagarRapport } from '@/lib/markagarrapport/types';
import type { ListRad } from '@/lib/markagarrapport/lista';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock('./SkogenKarta', () => ({ default: () => createElement('canvas', { 'data-karta': '' }) }));
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

const data: MarkagarRapport = {
  objekt: { objekt_id: '11124938', namn: 'Husjönäs 1:18 JE-G LRK -25', skogsagare: null, atgard: null, forsta_datum: '2026-02-16', operator: '–', maskin: '–' },
  oversikt: { yta_ha: null, yta_kalla: null, stammar: 1349, volym_m3sub: 678.4, virkesvarde_kr: 433163.2 },
  karta: { stammar: [{ lat: 56.6, lng: 15.4, dbh_mm: 250, rot_typ: 'bmav', tradslag: 'GRAN' }] },
  tradslag: [
    { namn: 'Gran', volym_m3sub: 424.8, andel_pct: 62.6, stammar: 924, medeldiameter_cm: 25.2 },
    { namn: 'Tall', volym_m3sub: 239.4, andel_pct: 35.3, stammar: 359, medeldiameter_cm: 31.1 },
  ],
  rotrota: { stammar_med_rot: 235, bmav_count: 207, avkap_count: 28, grade9_count: 0, gran_stammar: 924, gran_med_rot: 235, pct_av_gran: 25.4, rotpaverkad_volym_m3: 0, rotpaverkad_pct: 0, vardeforlust_kr: -26382, vardeforlust_pct: 0, rotandel_pct: 0 },
  avkap_skicklighet: { totalt: 28, lyckade: 23, raddat_kr: 2597.4, raddad_volym_m3: 0, utfall: { lyckad: 23, misslyckad: 0, avkap_igen: 0, ovrigt: 5 } },
  fordelning: [
    { grupp: 'Timmer', volym_m3sub: 378.8, volym_andel_pct: 0, varde_kr: 0, varde_andel_pct: 0 },
    { grupp: 'Massa', volym_m3sub: 146.8, volym_andel_pct: 0, varde_kr: 0, varde_andel_pct: 0 },
  ],
  timmer_top2: [{ sortiment_namn: 'Timmer: Gran', total_volym_m3sub: 200, dimensioner: [{ dia_klass: '160+ mm', dia_min_mm: 160, dia_max_mm: 160, volym_m3sub: 200, pris_per_m3: 650 }] }],
  stubbar: { behandlade: 0, totalt: 0 },
  sortiment: [{ sortiment_id: 'Timmer: Gran', namn: 'Timmer: Gran', tradslag: 'GRAN', klass: null, stockar: 900, volym_m3sub: 300, varde_kr: 195000 }],
};

describe('Rapporten', () => {
  it('svaret står först, sedan frågorna i ordning', async () => {
    const h = await montera(createElement(Rapport, { vy: byggRapportVy(data), stammar: data.karta.stammar }));
    const text = h.textContent ?? '';
    expect(h.querySelector('[data-svar]')?.textContent).toContain('433 163 kr');
    const ordning = ['433 163 kr', 'Vad blev virket?', 'Vilka träd växte här?', 'Var granarna friska?', 'Här växte träden', 'Mer för den som vill veta'];
    const index = ordning.map(o => text.indexOf(o));
    expect(index.every(i => i >= 0)).toBe(true);
    expect([...index].sort((a, b) => a - b)).toEqual(index);
    expect(text).toContain('3 av 4 granar var friska');
    expect(text).toContain('−26 382 kr');
  });

  it('facktermerna finns bara bakom Mer', async () => {
    const h = await montera(createElement(Rapport, { vy: byggRapportVy(data), stammar: data.karta.stammar }));
    for (const ord of ['Bmav', 'avkap', 'Operatörens', 'Timmer: Gran']) expect(h.textContent).not.toContain(ord);
    await act(async () => { (h.querySelector('[data-mer]') as HTMLButtonElement).click(); });
    const ark = document.querySelector('[role=dialog]');
    expect(ark?.textContent).toContain('Timmer: Gran');
    expect(ark?.textContent).toContain('650 kr/m³');
  });

  it('kartan ritas inte utan positioner — det står varför', async () => {
    const h = await montera(createElement(Rapport, { vy: byggRapportVy(data), stammar: [] }));
    expect(h.querySelector('[data-karta]')).toBeNull();
    expect(h.textContent).toContain('Träden har inga positioner');
  });
});

describe('Listan', () => {
  const rader: ListRad[] = [
    { objekt_id: 'a', namn: 'Mölleryd RP', skogsagare: 'J-Hus', datum: '2026-10-13', pagar: false, volym_m3: 989 },
    { objekt_id: '11124938', namn: 'Husjönäs 1:18', skogsagare: null, datum: '2026-02-16', pagar: false, volym_m3: 678.4 },
  ];

  it('den valda avverkningen är markerad', async () => {
    const h = await montera(createElement(ObjektLista, { rader, fel: null, valt: '11124938' }));
    expect(h.querySelector('[aria-current=page]')?.getAttribute('data-objekt')).toBe('11124938');
    expect(h.querySelectorAll('[aria-current]')).toHaveLength(1);
  });

  it('sökningen filtrerar', async () => {
    const h = await montera(createElement(ObjektLista, { rader, fel: null, valt: null }));
    const inp = h.querySelector('input[type=search]') as HTMLInputElement;
    await act(async () => {
      const satt = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      satt.call(inp, 'möll');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(h.querySelectorAll('[data-objekt]')).toHaveLength(1);
    expect(h.textContent).toContain('Mölleryd RP');
  });

  it('ett läsfel är ett fel, aldrig en tom lista', async () => {
    const h = await montera(createElement(ObjektLista, { rader: [], fel: 'volymerna', valt: null }));
    expect(h.textContent).toContain('Kunde inte läsa volymerna');
    expect(h.textContent).toContain('Försök igen');
  });
});
