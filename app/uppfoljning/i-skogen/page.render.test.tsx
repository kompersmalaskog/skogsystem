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
let forsta: Map<string, string> | null = new Map();
vi.mock('./useForstaDag', () => ({ useForstaDag: () => forsta }));
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
  push.mockReset(); svara = []; forsta = new Map();
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
      for (const s of svara) s({ json: async () => ({ ok: true, summa: { regnMm: 61, regnDagar: 11, tMin: -3, tMax: 9, dagar: 25, saknas: 0 }, dagar: Array.from({ length: 26 }, (_, n) => {
        const datum = new Date(Date.parse('2026-10-27T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
        return { datum, regnMm: datum <= '2026-11-02' ? 2 : datum < '2026-11-10' ? 4 : 0, tMin: -2, tMax: 6 };
      }) }) });
    });
    await act(async () => {});
    expect(text()).toContain('Regn 61 mm · 11 dagar med regn · −3 till 9 °C');
    expect((be!.querySelector('[data-skogen-pdf]') as HTMLElement).style.pointerEvents).not.toBe('none');

    await act(async () => { (be!.querySelector('[data-skogen-trakt="A"]') as HTMLElement).click(); });
    expect(push).not.toHaveBeenCalled();
    const ark = be!.parentElement!.querySelector('[data-skogen-ark]') ?? document.querySelector('[data-skogen-ark]');
    expect(ark).toBeTruthy();
    const tid = (k: string) => document.querySelector(`[data-skogen-tid="${k}"]`)!.textContent!;
    expect(tid('avStart')).toContain('27 okt');
    expect(tid('avSlut')).toContain('2 nov');
    expect(tid('lag')).toContain('7 dagar');
    expect(tid('stStart')).toContain('10 nov');
    expect(tid('stSlut')).toContain('kör fortfarande');
    const cykel = document.querySelector('[data-skogen-cykel]')!.textContent!;
    expect(cykel).toContain('Från stubbe – hittills');
    expect(cykel).toContain('Sedan 27 okt · skotaren kör fortfarande');
    const per = (k: string) => document.querySelector(`[data-skogen-period="${k}"]`)!.textContent!;
    expect(per('avverkning')).toContain('14 mm');
    expect(per('lag')).toContain('28 mm');
    expect(per('lag')).toContain('3 nov – 9 nov · 7 dagar med regn · −2 till 6 °C');
    expect(per('skotning')).toContain('0 mm');
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

describe('första fällningsdagen', () => {
  it('väntar på den innan trakterna visas, och den går före listans felaktiga startdatum', async () => {
    // Bondeskog 2026: dim_objekt.start_date bar skotarens start (20 nov) efter sista fällning (6 nov).
    data = [obj({ vo_nummer: 'B', namn: 'Bondeskog', skordareStart: '2026-11-20', sistaAvverkning: '2026-11-06', skordningAvslutad: true, antalLass: 0, skordareObjektId: 'B' } as never)];
    forsta = null;
    await montera();
    expect(text()).toContain('Läser trakterna');
    forsta = new Map([['B', '2026-11-05']]);
    await act(async () => { rot!.render(<ISkogenSida />); });
    expect(text()).toContain('Skördaren fällde 5–6 nov · 2 dagar');
  });
  it('utan läst dag gäller listans start bara om den inte ligger efter sista fällningen', async () => {
    data = [obj({ vo_nummer: 'B', namn: 'Bondeskog', skordareStart: '2026-11-20', sistaAvverkning: '2026-11-06', skordningAvslutad: true, antalLass: 0 })];
    await montera();
    expect(text()).not.toContain('Skördaren fällde 20 nov');
  });
});
