// @vitest-environment jsdom
// Sidan "Ligger i skogen": bara tid, steg och väder per trakt — ingen volym — och
// ett tryck på en trakt öppnar tiden och vädret i ett ark, aldrig traktens uppföljning. Vädret visas aldrig som 0 mm innan det kommit.
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
  it('visar trakterna med steg och väder, ingen volym, och öppnar tiden och vädret i ett ark', async () => {
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
      for (const s of svara) s({ json: async () => ({ ok: true, summa: { regnMm: 61, regnDagar: 11, tMin: -3, tMax: 9, dagar: 25, saknas: 0 }, veckor: [
        { vecka: 44, summa: { fran: '2026-10-27', till: '2026-11-01', regnMm: 22, regnDagar: 4, tMin: -2, tMax: 6, dagar: 6, saknas: 0 } },
        { vecka: 45, summa: { fran: '2026-11-02', till: '2026-11-08', regnMm: 0, regnDagar: 0, tMin: 1, tMax: 9, dagar: 7, saknas: 0 } },
      ] }) });
    });
    await act(async () => {});
    expect(text()).toContain('Regn 61 mm · 11 dagar med regn · −3 till 9 °C');
    expect((be!.querySelector('[data-skogen-pdf]') as HTMLElement).style.pointerEvents).not.toBe('none');

    await act(async () => { (be!.querySelector('[data-skogen-trakt="A"]') as HTMLElement).click(); });
    expect(push).not.toHaveBeenCalled();
    const ark = be!.parentElement!.querySelector('[data-skogen-ark]') ?? document.querySelector('[data-skogen-ark]');
    expect(ark).toBeTruthy();
    expect(ark!.textContent).toContain('19 dagar sedan skördaren blev klar');
    expect(ark!.textContent).toContain('Skördaren fällde 27 okt – 2 nov · 7 dagar');
    expect(ark!.textContent).toContain('Regn 61 mm · 11 dagar med regn · −3 till 9 °C');
    const v44 = document.querySelector('[data-skogen-vecka="Vecka 44"]')!.textContent!;
    expect(v44).toContain('22 mm');
    expect(v44).toContain('27 okt – 1 nov · 4 dagar med regn · −2 till 6 °C');
    expect(document.querySelector('[data-skogen-vecka="Vecka 45"]')!.textContent).toContain('0 mm');
    expect(ark!.textContent).not.toMatch(/m³/);
    await act(async () => { (Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Klar') as HTMLElement).click(); });
    expect(document.querySelector('[data-skogen-ark]')).toBeNull();

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
