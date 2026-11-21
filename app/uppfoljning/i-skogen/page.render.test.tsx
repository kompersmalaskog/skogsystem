// @vitest-environment jsdom
// Sidan "Ligger i skogen": bara tid, steg och väder per trakt — ingen volym — och
// ett tryck på en trakt öppnar dess vanliga vy. Vädret visas aldrig som 0 mm innan det kommit.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { UppfoljningObjekt } from '../lib/transform';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
let data: UppfoljningObjekt[] = [];
vi.mock('../hooks/useUppfoljningList', async () => {
  const faktisk = await vi.importActual<typeof import('../hooks/useUppfoljningList')>('../hooks/useUppfoljningList');
  return { ...faktisk, useUppfoljningList: () => ({ objekt: data, loading: false, error: null }) };
});
vi.mock('@/app/helikopter/_components/PdfForhandsvisning', () => ({ default: () => <div data-pdf-oppen /> }));

import ISkogenSida from './page';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const obj = (over: Partial<UppfoljningObjekt>): UppfoljningObjekt => ({
  vo_nummer: 'VO1', namn: 'Objekt', typ: 'slutavverkning', volymSkordare: 1000, volymSkotare: 0,
  skordareStart: null, skordareSlut: null, skotareStart: null, skotareSlut: null, skotareLastDate: null, skordareLastDate: null,
  sistaAvverkning: '2026-10-01', antalLass: 1, skordningAvslutad: false, skotningAvslutad: false, egenSkotning: false,
  externSkotning: false, skordareObjektId: null, skotareObjektId: null,
  ...over,
} as unknown as UppfoljningObjekt);

let rot: Root | null = null;
let be: HTMLElement | null = null;
let svara: ((v: unknown) => void)[] = [];
beforeEach(() => {
  push.mockReset(); svara = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-21T17:00:00Z'));
  globalThis.fetch = vi.fn(() => new Promise(res => { svara.push(res); })) as never;
});
afterEach(() => { act(() => { rot?.unmount(); }); be?.remove(); rot = null; be = null; vi.useRealTimers(); });

async function montera() {
  be = document.createElement('div'); document.body.appendChild(be);
  rot = createRoot(be);
  await act(async () => { rot!.render(<ISkogenSida />); });
}
const text = () => be!.textContent || '';

describe('Ligger i skogen — egen sida', () => {
  it('visar trakterna med steg och väder, ingen volym, och öppnar trakten', async () => {
    data = [
      obj({ vo_nummer: 'A', namn: 'Arvidstorp', volymSkordare: 628, volymSkotare: 440, skordareStart: '2026-10-27', sistaAvverkning: '2026-11-02', skotareStart: '2026-11-10', skordningAvslutad: true }),
      obj({ vo_nummer: 'B', namn: 'Britteberg', volymSkordare: 673, antalLass: 0, skordareStart: '2026-11-04', sistaAvverkning: '2026-11-10', skordningAvslutad: true }),
    ];
    await montera();
    expect(be!.querySelector('[data-skogen-svar]')!.textContent).toBe('2 trakter i skogen · längst legat 19 dagar');
    expect(text().indexOf('Arvidstorp')).toBeLessThan(text().indexOf('Britteberg'));
    expect(text()).toContain('Skördaren fällde 27 okt – 2 nov · 7 dagar');
    expect(text()).toContain('Virket väntar 11 dagar · skotaren har inte börjat');
    expect(text()).not.toMatch(/m³/);
    // Innan vädret kommit: ingen siffra, och PDF-knappen väntar.
    expect(text()).toContain('Hämtar vädret');
    expect(text()).not.toContain('0 mm');
    expect((be!.querySelector('[data-skogen-pdf]') as HTMLElement).style.pointerEvents).toBe('none');

    await act(async () => {
      for (const s of svara) s({ json: async () => ({ ok: true, summa: { regnMm: 61, regnDagar: 11, tMin: -3, tMax: 9, dagar: 25, saknas: 0 } }) });
    });
    await act(async () => {});
    expect(text()).toContain('Regn 61 mm · 11 dagar med regn · −3 till 9 °C');
    expect((be!.querySelector('[data-skogen-pdf]') as HTMLElement).style.pointerEvents).not.toBe('none');

    await act(async () => { (be!.querySelector('[data-skogen-trakt="A"]') as HTMLElement).click(); });
    expect(push).toHaveBeenCalledWith('/uppfoljning/A');

    await act(async () => { (be!.querySelector('[data-skogen-pdf]') as HTMLElement).click(); });
    expect(be!.querySelector('[data-pdf-oppen]')).toBeTruthy();
  });

  it('ett väderfel säger det, aldrig 0 mm', async () => {
    data = [obj({ vo_nummer: 'A', namn: 'Arvidstorp', skordareStart: '2026-10-27', sistaAvverkning: '2026-11-02', skordningAvslutad: true, antalLass: 0 })];
    await montera();
    await act(async () => { for (const s of svara) s({ json: async () => ({ ok: false, orsak: 'las' }) }); });
    await act(async () => {});
    expect(text()).toContain('Vädret kunde inte hämtas');
    expect(text()).toContain('Hämta vädret igen');
    expect(text()).not.toContain('0 mm');
  });
});
