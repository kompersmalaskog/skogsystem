// @vitest-environment jsdom
// Produktion (namnet i pillen, maskinläget) och pillens "N nu".
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import Produktion from './Produktion';
import { KorvyObjektPill } from './KorvyObjektPill';
import type { ProduktionVy } from '@/lib/produktionVy';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null;
let ruta: HTMLElement | null = null;
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
async function montera(el: React.ReactElement) {
  ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta);
  await act(async () => { rot!.render(el); });
}
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });

const VY: ProduktionVy = {
  tal: '1,9 ha', talUnder: 'av 37,7 ha', andel: 0.05, svar: 'Klar ca 1 jan', tempo: 'ca 0,9 ha per dag',
  avvikelser: [{ id: 'a', titel: 'Evighetsträd efter i område 8', under: '0 satta – borde vara 19 för det du gallrat' }],
  iFas: null,
};
const DETALJER = {
  typ: 'skordare' as const,
  harNu: { namn: 'Område 8', under: '1,9 av 4,7 ha gallrat', hogstubbar: { varde: '6 ✓', efter: false }, evighetstrad: { varde: '0 · 19 nu', efter: true } },
  omraden: [
    { id: '8', titel: 'Område 8', under: 'Här nu', hoger: '1,9 av 4,7 ha', dampad: false },
    { id: '6', titel: 'Område 6', under: 'Inte börjat', hoger: '9,0 ha', dampad: false },
    { id: '3', titel: 'Område 3', under: 'Klart', hoger: '✓', dampad: true },
  ],
  hurGarDet: { lage: 'ok' as const, idag: [{ id: 'virke', titel: 'Virke', varde: '38 m³' }, { id: 'g15', titel: 'Per G15-timme', varde: '5,1 m³' }],
    vecka: [{ id: 'virke', titel: 'Virke', varde: '112 m³' }], not: 'Ur maskinens filer · senaste 15:22' },
};

describe('Produktion', () => {
  it('ringen med talet, svaret, tempot och BARA det som avviker', async () => {
    await montera(<Produktion undertitel="Gallring Santhe · H8E -26" vy={VY} detaljer={DETALJER} onStang={() => {}} />);
    expect(q('produktion-tal')!.textContent).toBe('1,9 ha');
    expect(q('produktion-ring')!.getAttribute('data-andel')).toBe('0.050');
    expect(q('produktion-svar')!.textContent).toBe('Klar ca 1 jan');
    expect(q('produktion-tempo')!.textContent).toBe('ca 0,9 ha per dag');
    expect(qa('produktion-avvikelse').map((e) => e.textContent)).toEqual([expect.stringContaining('Evighetsträd efter i område 8')]);
    expect(q('produktion-ifas')).toBeNull();
    expect(q('produktion-omrade')).toBeNull();   // områdena ligger bakom Detaljer
  });

  it('Hur går det? på första sidan; Detaljer byter till här nu och områdena; ‹ Produktion tillbaka', async () => {
    await montera(<Produktion undertitel="x" vy={VY} detaljer={DETALJER} onStang={() => {}} />);
    // Hur går det? står på första sidan (siffrorna ur maskinens filer)
    expect(q('produktion-siffra-virke')!.textContent).toContain('38 m³');
    expect(document.body.textContent).toContain('senaste 15:22');
    act(() => { [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((e) => e.textContent === 'Veckan')!.click(); });
    expect(q('produktion-siffra-virke')!.textContent).toContain('112 m³');
    expect(q('produktion-siffra-g15')).toBeNull();
    act(() => { q('produktion-detaljer')!.click(); });
    expect(q('produktion-ring')).toBeNull();
    expect(q('produktion-siffra-virke')).toBeNull();
    expect(document.body.textContent).toContain('Här nu');
    expect(document.body.textContent).toContain('0 · 19 nu');
    expect(qa('produktion-omrade').map((e) => e.textContent)).toEqual([
      expect.stringContaining('Område 8'), expect.stringContaining('Område 6'), expect.stringContaining('Område 3'),
    ]);
    act(() => { q('produktion-tillbaka')!.click(); });
    expect(q('produktion-ring')).not.toBeNull();
  });

  it('inget avviker: "i fas" i stället för listan', async () => {
    await montera(<Produktion undertitel="x" vy={{ ...VY, avvikelser: [], iFas: 'Högstubbar och evighetsträd i fas' }} detaljer={DETALJER} onStang={() => {}} />);
    expect(qa('produktion-avvikelse')).toHaveLength(0);
    expect(q('produktion-ifas')!.textContent).toContain('i fas');
  });

  it('skotaren: Detaljer öppnar kvar per sortiment (handlingen), inte en egen lista', async () => {
    const oppna = vi.fn();
    await montera(<Produktion undertitel="Mölleryd · Elefant 26" vy={{ ...VY, tal: '~312 m³', talUnder: 'kvar att skota', avvikelser: [] }} detaljer={{ typ: 'skotare', onOppna: oppna, hurGarDet: { lage: 'ok', idag: [], vecka: [{ id: 'lass', titel: 'Lass', varde: '4' }], not: null },
        avlagg: [{ id: 'vida:01-1', titel: 'Avlägg 01-1', under: '24 lass', hoger: '612 m³', dampad: false }] }} onStang={() => {}} />);
    expect(q('produktion-siffror-tom')!.textContent).toBe('Inga lass idag än');
    expect(qa('produktion-avlagg').map((e) => e.textContent)).toEqual([expect.stringContaining('612 m³')]);
    act(() => { [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((e) => e.textContent === 'Veckan')!.click(); });
    expect(q('produktion-siffra-lass')!.textContent).toContain('4');
    act(() => { q('produktion-detaljer')!.click(); });
    expect(oppna).toHaveBeenCalledTimes(1);
    expect(q('produktion-ring')).not.toBeNull();
  });
});

describe('Hur går det? när filerna inte går att läsa', () => {
  it('säger det och har Försök igen — aldrig 0', async () => {
    const forsok = vi.fn();
    await montera(<Produktion undertitel="x" vy={VY} detaljer={{ ...DETALJER, hurGarDet: { lage: 'fel', onForsok: forsok } }} onStang={() => {}} />);
    expect(q('produktion-siffror-fel')!.textContent).toContain('Kunde inte läsa');
    expect(q('produktion-siffra-virke')).toBeNull();
    act(() => { [...q('produktion-siffror-fel')!.querySelectorAll('button')][0].click(); });
    expect(forsok).toHaveBeenCalled();
  });
});

describe('pillen: området och "N nu"', () => {
  const vy = (antal: number, nu = 0) => ({ antal, krav: null, status: 'ingen' as const, nu });
  it('"2 nu" i orange på räknaren och området under namnet', async () => {
    await montera(<KorvyObjektPill namn="Gallring Santhe" namnUnder="Område 8" namnHandling="Tryck för produktion" hogstubbar={vy(6)} evighetstrad={vy(0, 2)} smal={false}
      ikonHogstubbe={null} ikonEvighetstrad={null} onNamn={() => {}} onHogstubbe={() => {}} onEvighetstrad={() => {}} />);
    expect(q('korvy-pill-omrade')!.textContent).toBe('Område 8');
    expect(q('korvy-pill-evighetstrad-nu')!.textContent).toBe('· 2 nu');
    expect(q('korvy-pill-hogstubbar-nu')).toBeNull();
    expect(q('korvy-pill-namn')!.getAttribute('aria-label')).toBe('Gallring Santhe, Område 8. Tryck för produktion');
  });
});
