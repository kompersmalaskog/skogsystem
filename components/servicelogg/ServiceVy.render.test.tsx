// @vitest-environment jsdom
// Serviceloggen monterad på riktigt (jsdom, supabase i minnet): lista, maskin, ihopslagning och arket "Ny åtgärd".
// Layout och touch provas i Chromium (ServiceVy.hytt.test.tsx), inte här — jsdom har ingen layout.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from 'react';

const h = vi.hoisted(() => ({
  tabeller: {} as Record<string, any[]>,
  insatt: [] as any[],
  fel: null as { message: string } | null,
  router: { replace: vi.fn(), push: vi.fn() },
}));

function svar(rader: any[]) {
  const kedja: any = {
    eq: (k: string, v: any) => svar(rader.filter(r => r[k] === v)),
    order: () => kedja,
    range: (a: number, b: number) => Promise.resolve({ data: rader.slice(a, b + 1), error: h.fel }),
    then: (ok: any, nej: any) => Promise.resolve({ data: rader, error: h.fel }).then(ok, nej),
  };
  return kedja;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => ({
      select: () => svar(h.tabeller[t] ?? []),
      insert: (rad: any) => { h.insatt.push(rad); h.tabeller[t] = [...(h.tabeller[t] ?? []), { id: `ny${h.insatt.length}`, ...rad }]; return Promise.resolve({ error: null }); },
    }),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => h.router }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));

import ServiceVy from './ServiceVy';

let container: HTMLDivElement;
let root: Root;

async function montera(valdId: string | null) {
  await act(async () => { root.render(<ServiceVy valdId={valdId} />); });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}
const text = () => container.textContent ?? '';
const knapp = (namn: string) => [...container.ownerDocument.querySelectorAll('button')].find(b => b.textContent?.trim() === namn) as HTMLButtonElement;

beforeEach(() => {
  h.insatt = [];
  h.fel = null;
  h.tabeller = {
    maskiner: [
      { id: 'm-wis', maskin_id: 'A030353', namn: 'gammalt namn', aktiv: true },
      { id: 'm-gia', maskin_id: 'PONS20SDJAA270231', namn: null, aktiv: true },
    ],
    dim_maskin: [
      { maskin_id: 'A030353', visningsnamn: 'Ponsse Wisent', maskin_typ: 'Forwarder' },
      { maskin_id: 'PONS20SDJAA270231', visningsnamn: 'Giant', maskin_typ: 'Harvester' },
    ],
    maskin_service: [
      { id: 'a', maskin_id: 'm-wis', kategori: 'ovrigt', del: '-', delsystem: 'Carrier', detalj: 'Tracks and chains', beskrivning: 'band på bak', langd_sek: 2925, datum: '2026-10-21', kalla: 'mom', timmar: null },
      { id: 'b', maskin_id: 'm-wis', kategori: 'ovrigt', del: '-', delsystem: 'Carrier', detalj: 'Tracks and chains', beskrivning: 'band på bak', langd_sek: 973, datum: '2026-10-21', kalla: 'mom', timmar: null },
      { id: 'c', maskin_id: 'm-gia', kategori: 'ovrigt', del: 'ovrigt', delsystem: 'HarvestingHead', detalj: 'Measuring devices', beskrivning: 'HarvestingHead: Measuring devices', langd_sek: 2400, datum: '2026-09-30', kalla: 'mom', timmar: null },
    ],
  };
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T16:00:00Z'));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('listan', () => {
  it('grupperar på maskintyp ur dim_maskin och visar namnet därifrån, med senaste posten på svenska', async () => {
    await montera(null);
    expect(text()).toContain('Skördare');
    expect(text()).toContain('Skotare');
    expect(text()).toContain('Ponsse Wisent');
    expect(text()).not.toContain('gammalt namn');
    expect(text()).toContain('Band på bak · idag');
    expect(text()).toContain('Mätutrustning · 30 sep');
    expect(text()).not.toContain('HarvestingHead');
    const wisent = container.querySelector('[data-maskin="m-wis"]') as HTMLAnchorElement;
    expect(wisent.getAttribute('href')).toBe('/maskin-service/m-wis');
  });
  it('läsfel säger det och har Försök igen — aldrig en tom lista', async () => {
    h.fel = { message: 'nät' };
    await montera(null);
    expect(text()).toContain('Kunde inte läsa serviceloggen');
    expect(knapp('Försök igen')).toBeTruthy();
  });
});

describe('maskinen', () => {
  it('svaret överst, samma sak samma dag är EN rad med summerad tid', async () => {
    await montera('m-wis');
    expect(text()).toContain('Ingen service registrerad');
    expect(container.querySelectorAll('[data-post]')).toHaveLength(1);
    expect(text()).toContain('Band · 2 gånger · från maskinen');
    expect(text()).toContain('1 tim 5 min');
    expect(text()).toContain('Oktober');
    expect(text()).toContain('‹ Alla maskiner');
  });
  it('inga drifttimmar visas (det fanns inget att lita på)', async () => {
    await montera('m-wis');
    expect(text()).not.toMatch(/Drifttimmar/i);
  });
});

describe('Ny åtgärd', () => {
  it('Spara är grått tills det som krävs är ifyllt; service kräver timmätaren', async () => {
    await montera('m-wis');
    await act(async () => { knapp('Ny åtgärd').click(); });
    expect(text()).toContain('Ny åtgärd · Ponsse Wisent');
    expect(knapp('Spara').disabled).toBe(true);
    expect(text()).toContain('Fyll i vad som gjordes och timmätaren');
  });
  it('band: tryck bak och spara — utan text blir rubriken "Band på bak"', async () => {
    await montera('m-wis');
    await act(async () => { knapp('Ny åtgärd').click(); });
    await act(async () => { knapp('Band').click(); });
    expect(knapp('Spara').disabled).toBe(true);
    expect(text()).toContain('Fyll i var bandet sitter');
    await act(async () => { knapp('Bak').click(); });
    expect(knapp('Bak').getAttribute('aria-pressed')).toBe('true');
    expect(knapp('Fram').getAttribute('aria-pressed')).toBe('false');
    expect(knapp('Spara').disabled).toBe(false);
    await act(async () => { knapp('Spara').click(); });
    for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
    expect(h.insatt).toHaveLength(1);
    expect(h.insatt[0]).toMatchObject({ maskin_id: 'm-wis', kategori: 'ovrigt', del: 'band bak', detalj: 'Tracks and chains', beskrivning: 'Band på bak', datum: '2026-10-21', kalla: 'manuell', timmar: null });
    expect(text()).not.toContain('Ny åtgärd · Ponsse Wisent');
  });
  it('band: Tog av, fram och bak', async () => {
    await montera('m-wis');
    await act(async () => { knapp('Ny åtgärd').click(); });
    await act(async () => { knapp('Band').click(); });
    await act(async () => { knapp('Tog av').click(); });
    await act(async () => { knapp('Fram').click(); });
    await act(async () => { knapp('Bak').click(); });
    await act(async () => { knapp('Spara').click(); });
    for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
    expect(h.insatt[0]).toMatchObject({ del: 'band fram och bak', beskrivning: 'Band av fram och bak' });
  });
  it('däck kräver ett hjul och sparar det', async () => {
    await montera('m-wis');
    await act(async () => { knapp('Ny åtgärd').click(); });
    await act(async () => { knapp('Däck').click(); });
    expect(text()).toContain('Vilket hjul');
    await act(async () => { knapp('H2').click(); });
    expect(knapp('H2').getAttribute('aria-pressed')).toBe('true');
  });
});
