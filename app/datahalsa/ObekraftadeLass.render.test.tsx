// @vitest-environment jsdom
// Planerarens granskning av de gamla självbekräftade lassen: grupper per trakt/maskin/dag, Bekräfta/Slå ihop/Stryk med bekräftelse, fel sägs.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { Lass } from '@/lib/skotarLass/typer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const lasObekraftade = vi.fn();
const granskaLass = vi.fn();
vi.mock('@/lib/skotarLass/granskaKopplad', () => ({ lasObekraftade: (...a: any[]) => lasObekraftade(...a), granskaLass: (...a: any[]) => granskaLass(...a) }));

import ObekraftadeLass from './ObekraftadeLass';

const L = (id: string, nr: number, m3: number, over: Partial<Lass> = {}): Lass => ({
  id, objektId: 'o', voNummer: '555', maskinId: 'E1', medarbetareId: null, lassNummer: nr, datum: '2026-10-20', status: 'bekraftat', bekraftadAv: 'auto',
  bekraftadTid: null, sparPunkter: [], vagar: [], skapad: '', andrad: '',
  delar: [{ delNr: 1, avlaggId: 'vida:1', avlaggNummer: '01-1', lossadTid: `2026-10-20T10:${String(nr).padStart(2, '0')}:00Z`, lat: 0, lng: 0, rader: [{ nyckel: 'timmer', namn: 'Timmer: Vislanda_V3', m3 }] }],
  ...over,
});

const vantaUt = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
async function visa(vid?: () => void) {
  const cont = document.createElement('div'); document.body.appendChild(cont);
  const root = createRoot(cont);
  await act(async () => { root.render(<ObekraftadeLass traktNamn={() => 'Mölleryd'} maskinNamn={() => 'Elefant 26'} vidGranskat={vid} />); });
  await vantaUt();
  return cont;
}
const t = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const knappMed = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const klick = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); };

beforeEach(() => { document.body.innerHTML = ''; lasObekraftade.mockReset(); granskaLass.mockReset(); });

describe('ObekraftadeLass', () => {
  it('visar ingenting när inga gamla obekräftade lass finns', async () => {
    lasObekraftade.mockResolvedValue([]);
    await visa();
    expect(t('obekraftade-lass')).toBeNull();
  });

  it('läsfel är ett fel med Försök igen, aldrig en tom ruta', async () => {
    lasObekraftade.mockResolvedValue(null);
    await visa();
    expect(t('obekraftade-fel')?.textContent).toContain('Kunde inte läsa');
    lasObekraftade.mockResolvedValue([L('a', 1, 20)]);
    await klick(knappMed('Försök igen'));
    await vantaUt();
    expect(t('obekraftade-lass')).not.toBeNull();
  });

  it('visar antal och m³ och en rad per trakt, maskin och dag', async () => {
    lasObekraftade.mockResolvedValue([L('a', 1, 20), L('b', 2, 20), L('c', 1, 10, { datum: '2026-10-19' })]);
    await visa();
    expect(t('obekraftade-lass')!.textContent).toContain('3 lass · 50 m³ räknas inte som skotat');
    expect(document.querySelectorAll('[data-testid="obekraftad-grupp"]')).toHaveLength(2);
  });

  it('Bekräfta kräver val + bekräftelse, skickar rätt argument och läser om', async () => {
    lasObekraftade.mockResolvedValue([L('a', 1, 20), L('b', 2, 20)]);
    granskaLass.mockResolvedValue({ ok: true });
    const vid = vi.fn();
    await visa(vid);
    await klick(t('obekraftad-grupp'));
    expect(knappMed('Bekräfta')!.disabled).toBe(true);
    await klick(knappMed('Välj alla'));
    await klick(knappMed('Bekräfta'));
    expect(t('granska-bekrafta')!.textContent).toContain('2 lass · 40 m³ räknas som skotat');
    expect(granskaLass).not.toHaveBeenCalled();                    // inget skrivs före bekräftelsen
    await klick(t('granska-utfor'));
    await vantaUt();
    expect(granskaLass).toHaveBeenCalledTimes(1);
    expect(granskaLass.mock.calls[0][0]).toBe('bekrafta');
    expect(granskaLass.mock.calls[0][1].map((l: Lass) => l.id)).toEqual(['a', 'b']);
    expect(lasObekraftade).toHaveBeenCalledTimes(2);               // läst om efteråt
    expect(vid).toHaveBeenCalled();                                // jämförelsen ovanför läser om
  });

  it('Slå ihop kräver minst två lass och föreslår lägst nummer som mottagare', async () => {
    lasObekraftade.mockResolvedValue([L('a', 1, 20), L('b', 2, 20)]);
    granskaLass.mockResolvedValue({ ok: true });
    await visa();
    await klick(t('obekraftad-grupp'));
    const rutor = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    await klick(rutor[1]);
    expect(knappMed('Slå ihop')!.disabled).toBe(true);
    await klick(rutor[0]);
    await klick(knappMed('Slå ihop'));
    expect(t('granska-bekrafta')!.textContent).toContain('Lass 1 får 40 m³');
    await klick(t('granska-utfor'));
    await vantaUt();
    expect(granskaLass.mock.calls[0][0]).toBe('slaihop');
    expect(granskaLass.mock.calls[0][2]).toBe('a');
  });

  it('serverns fel visas som det är och ingenting försvinner ur listan', async () => {
    lasObekraftade.mockResolvedValue([L('a', 1, 20)]);
    granskaLass.mockResolvedValue({ ok: false, fel: 'Granskningen är inte aktiverad än.' });
    await visa();
    await klick(t('obekraftad-grupp'));
    await klick(document.querySelector('input[type="checkbox"]'));
    await klick(knappMed('Stryk'));
    await klick(t('granska-utfor'));
    await vantaUt();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('inte aktiverad');
    expect(t('obekraftade-lass')).not.toBeNull();
    expect(lasObekraftade).toHaveBeenCalledTimes(1);
  });
});
