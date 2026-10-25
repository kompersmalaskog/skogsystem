// @vitest-environment jsdom
// Priser och Inställningar (barnregeln, 2026-10-25): första skärmen är en
// lista i vanliga ord, ett tryck öppnar ETT ämne, och ett läsfel säger det —
// aldrig "alla är kopplade".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { skapaMinnesDb, type MinnesDb } from '@/lib/testStod/minnesDb';

let db: MinnesDb;
vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => db.from(t), rpc: (n: string, a: any) => db.rpc(n, a) } }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: () => undefined }), usePathname: () => '/ekonomi/installningar' }));

import InstallningarClient from './InstallningarClient';
import PrislistaClient from '../prislista/PrislistaClient';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function montera(k: any) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(k)); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}
const text = () => (host?.textContent || '').replace(/ /g, ' ');
const tryck = async (el: Element) => act(async () => { (el as HTMLElement).click(); });

let mappningOk = true;
beforeEach(() => {
  window.history.replaceState(null, '', '/ekonomi/installningar');
  mappningOk = true;
  db = skapaMinnesDb({
    fortnox_invoice_rows: [{ id: 1, document_number: 4711, invoice_date: '2026-10-01', description: 'Rp Kvarnen', total: 12000, matched_objekt_id: null, manual_objekt_id: null }],
    dim_objekt: [{ objekt_id: 'o1', object_name: 'Kvarnen', vo_nummer: '111' }],
    dim_sortiment: [{ sortiment_id: 's1', namn: 'Timmer gran', dim_sortiment_grupp: { grupp: 'Timmer', grupp_manuell: false } }],
    maskin_timpris: [{ id: 'm1', maskin_id: 'GIANT', maskin_namn: 'Giant', timpris: 1500, giltig_fran: '2026-01-01', giltig_till: null }],
    dim_maskin: [{ maskin_id: 'GIANT', visningsnamn: 'Giant', modell: 'Scorpion', maskin_typ: 'Harvester' }],
    acord_priser: [{ id: 'a1', medelstam: 0.25, pris_total: 60, pris_skordare: 35, pris_skotare: 25, giltig_fran: '2026-01-01', giltig_till: null }],
    acord_skotningsavstand: [{ id: 'd1', grundavstand_m: 300, kr_per_100m: 4, giltig_fran: '2026-01-01', giltig_till: null }],
    acord_traktstorlek: [], acord_terrang: [], acord_sortiment_tillagg: [], acord_ovrigt: [],
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('sync-status')) {
      const nu = new Date().toISOString();
      return { ok: true, json: async () => ({ ok: true, last_success_at: nu, invoice_last_sync_at: nu, last_status: 'ok' }) };
    }
    if (!mappningOk) return { ok: false, status: 500, json: async () => ({ ok: false }) };
    return { ok: true, json: async () => ({ ok: true, mappningar: [], maskiner: [{ maskin_id: 'GIANT', modell: 'Scorpion', visningsnamn: 'Giant' }], fortnox_kostnadsstallen: [{ kod: 'M8', namn: 'Lastbil' }], omappade: [{ kod: 'M8', namn: 'Lastbil', har_trafik: true }] }) };
  }));
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('Inställningar', () => {
  it('svar först, sedan det som ska kopplas i vanliga ord', async () => {
    await montera(InstallningarClient);
    expect(text()).toContain('Hämtas siffrorna från Fortnox?');
    expect(text()).toContain('Ja');
    expect(text()).toContain('Kostnadsställen utan maskin');
    expect(text()).toContain('Fakturor utan skog');
    for (const ord of ['POST /api', 'VO-regex', 'CC', 'sortiment-id']) expect(text()).not.toContain(ord);
  });

  it('ett tryck öppnar ETT ämne, tillbaka ger listan', async () => {
    await montera(InstallningarClient);
    await tryck(document.querySelector('[data-del="fakturor"]')!);
    expect(text()).toContain('Faktura 4711');
    expect(text()).not.toContain('Kostnadsställen per maskin');
    expect(window.location.search).toBe('?del=fakturor');
    await tryck([...document.querySelectorAll('button')].find(b => b.textContent === '‹ Inställningar')!);
    expect(text()).toContain('Kostnadsställen per maskin');
  });

  it('läsfel säger det — aldrig "alla har en maskin"', async () => {
    mappningOk = false;
    await montera(InstallningarClient);
    expect(text()).not.toContain('Alla har en maskin');
    expect(text()).toContain('Kunde inte läsas');
    await tryck(document.querySelector('[data-del="ccUtan"]')!);
    expect(text()).toContain('Kunde inte läsa det här just nu');
    expect(text()).not.toContain('Alla kostnadsställen har en maskin');
  });
});

describe('Priser', () => {
  it('en rad per pris, inga tabeller förrän man valt', async () => {
    window.history.replaceState(null, '', '/ekonomi/prislista');
    await montera(PrislistaClient);
    expect(document.querySelectorAll('[data-del]').length).toBe(7);
    expect(text()).toContain('Grundpris per kubik');
    expect(text()).toContain('Över 300 m: 4 kr per 100 m');
    expect(document.querySelectorAll('input').length).toBe(0);
    await tryck(document.querySelector('[data-del="acord"]')!);
    expect(document.querySelectorAll('input').length).toBeGreaterThan(0);
    expect(text()).toContain('‹ Priser');
  });

  it('ändrat men inte sparat syns på raden i listan', async () => {
    window.history.replaceState(null, '', '/ekonomi/prislista?del=acord');
    await montera(PrislistaClient);
    const inp = document.querySelector('input')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(inp, '0.3');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await tryck([...document.querySelectorAll('button')].find(b => b.textContent === '‹ Priser')!);
    expect(document.querySelector('[data-del="acord"]')!.textContent).toContain('Inte sparat');
    expect(document.querySelector('[data-del="maskiner"]')!.textContent).not.toContain('Inte sparat');
  });
});
