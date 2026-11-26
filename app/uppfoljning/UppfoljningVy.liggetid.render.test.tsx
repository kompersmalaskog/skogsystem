// @vitest-environment jsdom
// "Från stubbe till avlägg" finns INTE i traktens uppföljning (Martin 2026-11-22):
// tid och väder per trakt bor bara på sidan Ligger i skogen (/uppfoljning/i-skogen).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
vi.mock('@/lib/skotarLass/koKopplad', () => ({ lasSortimentKlass: async () => false }));
vi.mock('./hooks/useKlarDatum', () => ({ useKlarDatum: () => null }));
import UppfoljningVy, { type UppfoljningData } from './UppfoljningVy';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const idag = new Date().toISOString().slice(0, 10);

const skalviken = (over: Partial<UppfoljningData>): UppfoljningData => ({
  objektNamn: 'Skälviken RP J-Hus -25', objektId: '11271860', typ: 'slutavverkning' as any,
  areal: 8.8, agare: 'Vida', status: 'pagaende',
  volym: 1734, skordat: 1725, skotat: 648, kvarPct: 62,
  maskiner: [], skordareModell: 'Scorpion Giant', skordareStart: '2026-10-20',
  skordareSlut: '2026-10-28', skordareLastDate: '2026-10-28', operatorSkordare: 'Stefan Karlsson',
  skotareModell: 'Elefant 26', operatorSkotare: 'Daniel', skotareStart: '2026-10-26',
  skotareSlut: null, skotareLastDate: idag,
  prodSkordarePerDag: [{ datum: '2026-10-27', m3: 400 }, { datum: '2026-10-28', m3: 400 }] as any,
  avvikelser: [], skotatArManuell: false,
  skordareG15h: 8, skordareG0: 7, skordareTomgang: 0.5, skordareKortaStopp: 0.5, skordareKortStoppRaa: 0.5, skordareRast: 0, skordareAvbrott: 0.8,
  skotareG15h: 8, skotareG0: 7, skotareTomgang: 0.5, skotareKortaStopp: 0.5, skotareRast: 0, skotareAvbrott: 0.5,
  skordareM3G15h: 39, skordareStammarG15h: 20, skordareMedelstam: 0.3, skotareM3G15h: 30, skotareLassG15h: 2, skotareSnittlass: 20,
  tradslag: [{ namn: 'Gran', pct: 73 }, { namn: 'Tall', pct: 27 }], sortiment: [{ namn: 'Timmer', m3: 1000 }],
  dieselTotalt: 400, dieselPerM3: 0.48, skordareL: 300, skordareL_M3: 0.48, skordareL_G15h: 13,
  skotareL: 100, skotareL_M3: 0.4, skotareL_G15h: 12, dieselSkordare: [], dieselSkotare: [],
  avbrottSkordare: [], avbrottSkotareSek: 1800, avbrottSkordareSek: 2880, avbrottSkotare: [],
  antalLass: 32, snittlassM3: 20, lassG15h: 2, skotningsavstand: 300,
  lassPerDag: [
    { datum: '2026-10-26', m3: 20 }, { datum: '2026-10-27', m3: 180 },
    { datum: '2026-10-28', m3: 148 }, { datum: '2026-10-30', m3: 140 }, { datum: idag, m3: 160 },
  ] as any,
  skordareBalG15h: 39, skotareBalG15h: 30,
  ...over,
});

let rot: Root | null = null;
let be: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); be?.remove(); rot = null; be = null; vi.unstubAllGlobals(); });

async function rendera(data: UppfoljningData) {
  be = document.createElement('div'); document.body.appendChild(be);
  rot = createRoot(be);
  await act(async () => { rot!.render(<UppfoljningVy data={data} />); });
}
describe('Från stubbe till avlägg', () => {
  it('står inte i traktens Hur gick det? och vädret hämtas inte', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await rendera(skalviken({ voNummer: '11271860', sistaAvverkning: '2026-10-28' }));
    const t = be!.textContent || '';
    expect(t).toContain('Produktivitet');
    expect(t).not.toContain('Från stubbe');
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('/api/uppfoljning/vader'))).toBe(false);
  });
});
