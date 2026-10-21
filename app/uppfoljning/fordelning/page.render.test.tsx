// @vitest-environment jsdom
// Apteringen: översikten (ett tal i m³ utanför beställt, staplar, högst en höjdpunkt, Alla objekt),
// listan per månad, senast hämtade lista direkt ur enheten, ärligt fel och tyst omräkning.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

let sok: Record<string, string> = {};
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: (k: string) => sok[k] ?? null }),
}));

import FordelningPage from './page';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const kort = (key: string, namn: string, fil: string, bedomd: number, fel: number | null, extra: Record<string, unknown> = {}) => ({
  objectKey: key, objektNamn: namn, status: 'completed', lastFileAt: fil, dagarSedanFil: 30,
  lage: 2, gradePct: 85, volymM3: bedomd, mening: null, headline: null, trend: null,
  utanforM3: fel, bedomdM3: bedomd, ...extra,
});
const OKT = [
  kort('o1', 'Mölleryd RP J-Hus', '2026-10-21T08:00:00Z', 467, 71),
  kort('o2', 'Älmehult gallring', '2026-10-05T08:00:00Z', 2, 1),
  kort('s1', 'Hålabäck au', '2026-09-22T08:00:00Z', 456, 75),
  kort('a1', 'Ulfsnäs AU', '2026-08-24T08:00:00Z', 451, 77),
  kort('t1', 'Tjuvön AU', '2026-07-29T08:00:00Z', 393, 62, { status: 'active', dagarSedanFil: 84 }),
];

let rot: Root | null = null;
let behallare: HTMLElement | null = null;
beforeEach(() => { sok = {}; localStorage.clear(); push.mockReset(); });
afterEach(() => { act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; behallare = null; vi.unstubAllGlobals(); });

async function montera() {
  behallare = document.createElement('div'); document.body.appendChild(behallare);
  rot = createRoot(behallare);
  await act(async () => { rot!.render(<FordelningPage />); });
}
const text = () => behallare!.textContent ?? '';
const q = (sel: string) => behallare!.querySelector<HTMLElement>(sel);
const svar = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
async function vantaTills(villkor: () => boolean) {
  for (let i = 0; i < 50 && !villkor(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  expect(villkor()).toBe(true);
}
const knapp = (t: string) => Array.from(behallare!.querySelectorAll('button')).find((b) => b.textContent?.includes(t))!;

describe('Översikten', () => {
  it('ett tal: andel rätt längd senaste månaden, och höjdpunkten när den är sann', async () => {
    vi.stubGlobal('fetch', vi.fn(() => svar({ objekt: OKT, vantar: [], attRakna: 0 })));
    await montera();
    await vantaTills(() => !!q('[data-oversikt-tal]'));
    const tal = q('[data-oversikt-tal]')!.textContent!;
    expect(tal).toContain('Rätt längd i oktober');
    expect(tal).toContain('85 %');                 // 100 − 72/469 (15 %)
    expect(tal).toContain('av maskinens 469 m³');
    expect(text()).not.toContain('Uppföljning');   // ingen länk tillbaka på översikten
    // oktober 15 % mot aug 17 % och sep 16 % — under båda men inte 2 enheter under 16 → ingen höjdpunkt
    expect(q('[data-hojdpunkt]')).toBeNull();
    // Tysta objekt (Tjuvön) och detaljer hör inte hemma i översikten
    expect(text()).not.toContain('Tjuvön');
  });

  it('höjdpunkten "Bättre" när månaden ligger minst 2 enheter under de två föregående', async () => {
    const bra = [kort('o1', 'Mölleryd', '2026-10-21T08:00:00Z', 1000, 120), ...OKT.slice(2)];
    vi.stubGlobal('fetch', vi.fn(() => svar({ objekt: bra, vantar: [], attRakna: 0 })));
    await montera();
    await vantaTills(() => !!q('[data-hojdpunkt]'));
    expect(q('[data-hojdpunkt="battre"]')!.textContent).toContain('Mer rätt i oktober än i augusti och september.');
  });

  it('ett tryck på en stapel öppnar listan vid sin månad; Alla objekt öppnar listan', async () => {
    vi.stubGlobal('fetch', vi.fn(() => svar({ objekt: OKT, vantar: [], attRakna: 0 })));
    await montera();
    await vantaTills(() => !!q('[data-stapel="2026-09"]'));
    await act(async () => { q('[data-stapel="2026-09"]')!.click(); });
    expect(push).toHaveBeenCalledWith('/uppfoljning/fordelning?vy=alla&manad=2026-09');
    await act(async () => { q('[data-alla]')!.click(); });
    expect(push).toHaveBeenLastCalledWith('/uppfoljning/fordelning?vy=alla');
  });

  it('senast hämtade lista visas direkt medan servern svarar', async () => {
    localStorage.setItem('fordelning_lista_v3', JSON.stringify({ objekt: OKT, vantar: [] }));
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    await montera();
    expect(q('[data-oversikt-tal]')?.textContent).toContain('85 %');
    expect(text()).not.toContain('Hämtar apteringen');
  });

  it('fel utan sparad lista: säger det och har Försök igen, som hämtar igen', async () => {
    const f = vi.fn()
      .mockReturnValueOnce(svar({ error: 'statement timeout' }, 500))
      .mockReturnValueOnce(svar({ objekt: OKT, vantar: [], attRakna: 0 }));
    vi.stubGlobal('fetch', f);
    await montera();
    await vantaTills(() => text().includes('Kunde inte läsa apteringen'));
    await act(async () => { knapp('Försök igen').click(); });
    await vantaTills(() => !!q('[data-oversikt-tal]'));
  });

  it('kort från en äldre version räknas om tyst och siffrorna byts in', async () => {
    const f = vi.fn((url: string) => {
      if (url === '/api/fordelning/berakna') return svar({ raknade: 5, kvar: 0, fel: [] });
      return f.mock.calls.filter(([u]) => u === '/api/fordelning').length === 1
        ? svar({ objekt: OKT.map((o) => ({ ...o, utanforM3: undefined, uppdateras: true })), vantar: [], attRakna: 5 })
        : svar({ objekt: OKT, vantar: [], attRakna: 0 });
    });
    vi.stubGlobal('fetch', f);
    await montera();
    await vantaTills(() => q('[data-oversikt-tal]')?.textContent?.includes('85 %') ?? false);
    expect(f).toHaveBeenCalledWith('/api/fordelning/berakna', { method: 'POST' });
    expect(localStorage.getItem('fordelning_lista_v3')).toContain('"utanforM3":71');
  });
});

describe('Alla objekt', () => {
  beforeEach(() => { sok = { vy: 'alla' }; });

  it('månader nyast först med månadens andel; små trakter hopfällda; tysta objekt för sig', async () => {
    vi.stubGlobal('fetch', vi.fn(() => svar({ objekt: OKT, vantar: [], attRakna: 0 })));
    await montera();
    await vantaTills(() => text().includes('Mölleryd'));
    const t = text();
    expect(t.indexOf('Oktober · 85 % rätt')).toBeLessThan(t.indexOf('September · 84 % rätt'));
    expect(q('[data-objekt="o1"]')!.textContent).toContain('85 % rätt'); // 71 av 467 utanför → 85 % rätt
    expect(q('[data-objekt="o1"]')!.textContent).not.toContain('15 %');
    expect(t).toContain('1 liten trakt');
    expect(t).not.toContain('Älmehult');                 // hopfälld tills man trycker
    await act(async () => { q('[data-sma="2026-10"]')!.click(); });
    expect(text()).toContain('Älmehult gallring');
    expect(text()).toContain('ingen ny fil på 84 dagar'); // Tjuvön
  });

  it('en rad öppnar trakten; Markera avslutad skickar och läser om', async () => {
    const f = vi.fn((url: string, init?: RequestInit) =>
      init?.method === 'POST' ? svar({ ok: true }) : svar({ objekt: OKT, vantar: [], attRakna: 0 }));
    vi.stubGlobal('fetch', f);
    await montera();
    await vantaTills(() => !!q('[data-objekt="o1"]'));
    await act(async () => { q('[data-objekt="o1"]')!.click(); });
    expect(push).toHaveBeenCalledWith('/uppfoljning/fordelning?objekt=o1');
    await act(async () => { q('[data-avsluta="t1"]')!.click(); });
    await vantaTills(() => f.mock.calls.some(([u, i]) => u === '/api/fordelning/t1' && (i as RequestInit)?.method === 'POST'));
  });

  it('sök filtrerar och säger det när inget träffar', async () => {
    vi.stubGlobal('fetch', vi.fn(() => svar({ objekt: OKT, vantar: [], attRakna: 0 })));
    await montera();
    await vantaTills(() => text().includes('Mölleryd'));
    const input = q('input[type="search"]') as HTMLInputElement;
    const satt = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { satt.call(input, 'zzz'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(text()).toContain('Ingen trakt heter så.');
    expect(text()).not.toContain('Mölleryd');
  });
});

describe('Trakten', () => {
  beforeEach(() => { sok = { objekt: 'o1' }; });
  const produkt = {
    productKey: 'P1', namn: 'Timmer', gradePct: 84.9, gradeAutomatic: 83.5, totalVolumeM3: 467, logCount: 1200,
    forcedCutSharePct: 12.6, volymAutoM3: 412, utanforM3: 68, headline: null, mening: 'Det saknas klena korta stockar',
    vältor: [
      { lenLower: 433, actualM3: 120, orderedM3: 140 },
      { lenLower: 490, actualM3: 151, orderedM3: 140 },
      { lenLower: 546, actualM3: 141, orderedM3: 140 },
    ],
    guide: { klen: 'Klena stockar → 433 cm', grov: null },
    matris: [{ diaLower: 210, lenLower: 433, deviationM3: -9, farga: true }, { diaLower: 210, lenLower: 490, deviationM3: 1, farga: false }],
    färgadeRutor: 1,
  };
  const vy = { ...OKT[0], produkter: [produkt] };

  it('ett tal på maskinens kap, förarens kortningar som en neutral rad, per längd åt två håll', async () => {
    vi.stubGlobal('fetch', vi.fn(() => svar({ objekt: vy })));
    await montera();
    await vantaTills(() => !!q('[data-detalj-tal]'));
    const tal = q('[data-detalj-tal]')!.textContent!;
    expect(tal).toContain('Rätt längd');
    expect(tal).toContain('84 %'); // gradeAutomatic 83,5 → 84
    expect(tal).toContain('68 m³ utanför · av maskinens 412 m³');
    expect(q('[data-forare]')!.textContent).toBe('13 av 100 stockar kortade av föraren');
    expect(text()).not.toMatch(/fel virke/i);
    expect(q('[data-mening]')!.textContent).toBe('Det saknas klena korta stockar.');
    expect(q('[data-langd="433"]')!.textContent).toContain('−20 m³');
    expect(q('[data-langd="490"]')!.textContent).toContain('+11 m³');
    expect(q('[data-langd="546"]')!.textContent).toContain('träff'); // 1 m³ från beställt
  });

  it('Per diameter och När föraren kortar fälls ut på plats, en i taget', async () => {
    vi.stubGlobal('fetch', vi.fn(() => svar({ objekt: vy })));
    await montera();
    await vantaTills(() => !!q('[data-fall-ut="diameter"]'));
    expect(q('[data-matris]')).toBeNull();
    await act(async () => { q('[data-fall-ut="diameter"]')!.click(); });
    expect(q('[data-matris]')!.textContent).toContain('−9');
    await act(async () => { q('[data-fall-ut="forare"]')!.click(); });
    expect(q('[data-matris]')).toBeNull();
    const f = q('[data-forare-kortar]')!.textContent!;
    expect(f).toContain('Alla stockar inräknat: 85 % rätt längd');
    expect(f).toContain('Klena stockar → 433 cm');
  });
});
