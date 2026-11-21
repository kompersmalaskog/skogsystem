// @vitest-environment jsdom
// "Från stubbe till avlägg" i trakten: tre steg och vädret. Vädret hämtas från
// /api/uppfoljning/vader (mockat här) — ett fel är ett fel med Försök igen, aldrig 0 mm.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
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
  avbrottSkordare: [], avbrottSkotareTotalt: '0,5 h', avbrottSkordare_totalt: '0,8 h', avbrottSkotare: [],
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
async function oppna(titel: string) {
  const knapp = Array.from(be!.querySelectorAll('button')).find(b => (b.textContent || '').includes(titel))!;
  await act(async () => { knapp.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

describe('Från stubbe till avlägg', () => {
  it('visar stegen och vädret för traktens VO och period', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({ json: async () => ({ ok: true, summa: { fran: '2026-10-27', till: idag, dagar: 20, saknas: 0, regnMm: 61, regnDagar: 11, tMin: -2, tMax: 11 } }) }));
    vi.stubGlobal('fetch', fetchMock);
    await rendera(skalviken({ voNummer: '11271860', sistaAvverkning: '2026-10-28' }));
    await oppna('Från stubbe till avlägg');
    const t = be!.textContent || '';
    expect(t).toContain('Skördaren fällde');
    expect(t).toContain('27–28 okt · 2 dagar');
    expect(t).toContain('Skotaren kör');
    expect(t).toContain('61 mm · 11 dagar med regn');
    expect(t).toContain('−2 till 11 °C');
    expect(String(fetchMock.mock.calls[0][0])).toContain('vo=11271860&fran=2026-10-27&till=' + idag);
  });

  it('ett läsfel är ett fel med Försök igen, aldrig 0 mm', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ ok: false, orsak: 'las' }) })));
    await rendera(skalviken({ voNummer: '11271860', sistaAvverkning: '2026-10-28' }));
    await oppna('Från stubbe till avlägg');
    const t = be!.textContent || '';
    expect(t).toContain('Kunde inte hämta vädret');
    expect(t).not.toContain('0 mm');
  });
});
