// @vitest-environment jsdom
// Läget (2026-10-25): tre delar — svaret, Vidas krav sämst först, trädslagen. Det som kan smyga tillbaka: kortet "Gör så här", ett andra stort tal,
// åtgärdslistan (bor nu i Över tid) — och ett godkänt mått överst när domen är "Under kravet".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { BedomningResp, KravRow, VariabelStat } from '@/lib/kalibrering/typer';
import LagetFlik from './LagetFlik';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const VIDA: KravRow[] = [
  { variabel: 'diameter', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 4, mal: 85, golv: 75, enhet: '%', larm_min_matt: 150 },
  { variabel: 'diameter', metrik: 'systematisk', riktning: 'lag_bra', tolerans: null, mal: 1.0, golv: 1.5, enhet: 'mm', larm_min_matt: null },
  { variabel: 'diameter', metrik: 'standardavv', riktning: 'lag_bra', tolerans: null, mal: 3.5, golv: 4.5, enhet: 'mm', larm_min_matt: null },
  { variabel: 'langd', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 2, mal: 100, golv: 95, enhet: '%', larm_min_matt: 40 },
];
const stat = (o: Partial<VariabelStat> = {}): VariabelStat => ({ n: 500, traffPct: 90, systematisk: 0.2, standardavv: 3, grovPct: null, tolerans: 4, grovTolerans: null, ...o });
// Scorpionens 90-dagarstal (prod 2026-10-21): diameter 77 % (n 1113), längd 93,68 % (n 285) — längden fäller.
const SCORPION: BedomningResp = {
  ok: true, maskin_id: 'M', profil: 'VIDA', fonster: { fran: '2026-07-23', till: '2026-10-21', dagar: 90 }, trosklar: VIDA,
  diameter: stat({ n: 1113, traffPct: 77, systematisk: 0.81, standardavv: 4.07 }),
  langd: stat({ n: 285, traffPct: 93.68, tolerans: 2, systematisk: 0.09, standardavv: 1.36 }),
} as BedomningResp;

const oppnaHjalp = vi.fn(), oppnaArt = vi.fn();
const d = (over: Record<string, unknown> = {}) => ({
  bedomning: SCORPION, bedomningFel: null, forsokIgen: vi.fn(),
  aktivaMaskiner: [{ maskin_id: 'M', namn: 'Scorpion' }], effektiv: 'M', setValdMaskin: vi.fn(),
  trData: { trosklar: VIDA, tradslag: [] }, trRader: [
    { tradslag: 'GRAN', diameter: stat({ n: 900, traffPct: 79 }), langd: stat({ n: 200, traffPct: 94, tolerans: 2 }) },
    { tradslag: 'TALL', diameter: stat({ n: 200, traffPct: 63 }), langd: stat({ n: 80, traffPct: 92, tolerans: 2 }) },
  ], tradslagFel: null, ...over,
}) as any;
const ark = { oppnaHjalp, oppnaArt } as any;

let rot: Root | null = null, host: HTMLDivElement | null = null;
const montera = (el: ReturnType<typeof createElement>) => { host = document.createElement('div'); document.body.appendChild(host); rot = createRoot(host); act(() => rot!.render(el)); return host; };
afterEach(() => { act(() => rot?.unmount()); host?.remove(); rot = null; host = null; oppnaHjalp.mockClear(); oppnaArt.mockClear(); });

const sektion = (h: HTMLElement, namn: string) => h.querySelector<HTMLElement>(`section[aria-label="${namn}"]`);
const radtitlar = (s: HTMLElement) => Array.from(s.querySelectorAll('button')).map(b => b.textContent ?? '');

describe('Läget — svaret, kraven och trädslagen, inget mer', () => {
  it('Scorpion: "Under kravet", fönstret i liten text, längden överst bland kraven', () => {
    const h = montera(createElement(LagetFlik, { d: d(), ark }));
    expect(h.textContent).toContain('Under kravet');
    expect(h.textContent).toContain('Längden ligger under Vidas krav.');
    expect(h.textContent).toContain('Senaste 90 dagarna');
    const krav = radtitlar(sektion(h, 'Vidas krav')!);
    expect(krav).toHaveLength(4);
    expect(krav[0]).toContain('Längden');
    expect(krav[0]).toContain('94 %');
    expect(krav[0]).toContain('under kravet');
    expect(krav[1]).toContain('Diametern');
    expect(krav[1]).toContain('77 %');
  });

  it('bara två sektioner — inget "Gör så här", inga Åtgärder, ingen fotnot med kontroller och stockar', () => {
    const h = montera(createElement(LagetFlik, { d: d(), ark }));
    expect(Array.from(h.querySelectorAll('section[aria-label]')).map(s => s.getAttribute('aria-label'))).toEqual(['Vidas krav', 'Per trädslag']);
    for (const borta of ['Gör så här', 'Åtgärder', 'Lägg till åtgärd', 'stockar', 'Justeringsförslag']) expect(h.textContent).not.toContain(borta);
  });

  it('ett tryck på ett krav visar vad det betyder; ett tryck på ett trädslag öppnar trädslaget', () => {
    const h = montera(createElement(LagetFlik, { d: d(), ark }));
    act(() => sektion(h, 'Vidas krav')!.querySelector('button')!.click());
    expect(oppnaHjalp).toHaveBeenCalledTimes(1);
    act(() => sektion(h, 'Per trädslag')!.querySelectorAll('button')[1].click());
    expect(oppnaArt).toHaveBeenCalledWith('tall');
  });

  it('läsfel: säger det och erbjuder Försök igen — aldrig tomt', () => {
    const h = montera(createElement(LagetFlik, { d: d({ bedomning: null, bedomningFel: 'Läget kunde inte läsas.' }), ark }));
    expect(h.textContent).toContain('Läget kunde inte läsas');
    expect(h.textContent).toContain('Försök igen');
  });
});
