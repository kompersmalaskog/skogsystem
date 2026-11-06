// @vitest-environment jsdom
// "Skotare utifrån" i ⓘ-kortet: länken skapas först när vyn öppnas, kopieras, öppnas och slås av — monterat på riktigt i jsdom.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const rpc = vi.hoisted(() => ({ anrop: [] as { namn: string; arg: any }[], svar: {} as Record<string, any> }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: async (namn: string, arg: any) => { rpc.anrop.push({ namn, arg }); return rpc.svar[namn] ?? { data: null, error: null }; } } }));

import SkotarLankPlanerare from './SkotarLankPlanerare';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let el: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); el?.remove(); rot = null; el = null; rpc.anrop = []; rpc.svar = {}; });
async function visa(node: React.ReactNode) {
  el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el);
  await act(async () => { rot!.render(node as any); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const q = (id: string) => el!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const tryck = async (x: Element | null) => { await act(async () => { (x as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); }); };
const TOKEN = 'z'.repeat(64);

describe('Skotare utifrån', () => {
  it('skapar länken, kopierar den, öppnar sidan och slår av den', async () => {
    rpc.svar.skotar_lank_hamta = { data: [{ token: TOKEN, aktiv: true }], error: null };
    const kopierat: string[] = [];
    const oppnat: string[] = [];
    await visa(<SkotarLankPlanerare objektId="o-1" status="pagaende" origin="https://skogsystem.vercel.app" kopiera={async (t) => { kopierat.push(t); }} oppnaSida={(u) => oppnat.push(u)} />);
    expect(rpc.anrop[0]).toEqual({ namn: 'skotar_lank_hamta', arg: { p_objekt: 'o-1' } });
    expect(q('skotarlank-lage')!.textContent).toBe('På');
    await tryck(q('skotarlank-kopiera'));
    expect(kopierat).toEqual([`https://skogsystem.vercel.app/skotare/${TOKEN}`]);
    expect(el!.textContent).toContain('Kopierat');
    await tryck(q('skotarlank-visa'));
    expect(oppnat).toEqual([`https://skogsystem.vercel.app/skotare/${TOKEN}`]);
    await tryck(q('skotarlank-av-pa'));
    expect(rpc.anrop.at(-1)).toEqual({ namn: 'skotar_lank_satt_aktiv', arg: { p_objekt: 'o-1', p_aktiv: false } });
    expect(q('skotarlank-lage')!.textContent).toBe('Av');
    await tryck(q('skotarlank-kopiera'));
    expect(kopierat).toHaveLength(1);   // en avstängd länk kopieras inte
    expect(el!.textContent).toContain('slå på den först');
  });
  it('en avslutad trakt skapar ingen länk', async () => {
    await visa(<SkotarLankPlanerare objektId="o-1" status="avslutat" />);
    expect(rpc.anrop).toHaveLength(0);
    expect(q('skotarlank-lage')!.textContent).toBe('Gäller inte');
  });
  it('utan migrationen säger kortet det i klartext', async () => {
    rpc.svar.skotar_lank_hamta = { data: null, error: { message: 'Could not find the function public.skotar_lank_hamta(p_objekt) in the schema cache' } };
    await visa(<SkotarLankPlanerare objektId="o-1" status="pagaende" />);
    expect(q('skotarlank-migrering')).not.toBeNull();
  });
});
