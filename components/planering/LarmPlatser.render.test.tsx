// @vitest-environment jsdom
// Flera larmplatser på en trakt (Vida: en vid varje avlägg). Förarens kort, ⓘ-kortet och "Om något händer" visar den närmaste,
// och när positionen saknas ALLA — aldrig en gissad. Facit: Gallring Santhe 2026 ur prod (lib/__fixtures__/larmpunkter_santhe_2026-11-10.json).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ObjektKortEnkel, { type ObjektKortEnkelProps } from './ObjektKortEnkel';
import LarmVy from './LarmVy';
import santhe from '@/lib/__fixtures__/larmpunkter_santhe_2026-11-10.json';
import { larmpunkterUr, valjLarmpunkt, larmVisning, LARM_VALJ_SJALV } from '@/lib/larmpunkter';

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}), storage: { from: () => ({}) } } }));
vi.mock('@/lib/smhi-brandrisk', () => ({ fetchSmhiFwi: vi.fn(async () => ({ daily: [] })) }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null;
let ruta: HTMLElement | null = null;
const q = (id: string) => ruta!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function montera(el: React.ReactElement) {
  ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta);
  await act(async () => { rot!.render(el); });
}
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });

const punkter = larmpunkterUr(santhe.features as any, santhe.objektLarm);
const vidHuset = { lat: 56.5165, lng: 14.7075 };
const visade: number[] = [];
const larm = (pos: { lat: number; lng: number } | null, farsk: boolean) => ({
  ...larmVisning(valjLarmpunkt(punkter, pos, farsk)), beskrivning: '', onVisa: () => {}, onVisaPlats: (i: number) => { visade.push(i); },
});
function props(l: ObjektKortEnkelProps['larm']): ObjektKortEnkelProps {
  return {
    namn: 'Gallring Santhe 2026.', under: 'Gallring', andel: null, onStang: () => {}, faror: [], grot: null, tillForaren: [], direktivSett: null,
    brand: null, onBrand: () => {}, ytor: [], onYta: () => {}, knappar: [], onKnapp: () => {}, larm: l, dokument: null, onMer: () => {},
  };
}

describe('förarens kort — flera larmplatser', () => {
  it('färsk position: den närmaste, med avlägget och "Närmast dig", och de andra bakom en rad', async () => {
    await montera(<ObjektKortEnkel {...props(larm(vidHuset, true))} />);
    expect(q('kort-larm-koordinat')!.textContent).toBe('Larmkoordinat 56.51626, 14.70847');
    expect(q('kort-larm-namn')!.textContent).toMatch(/^Närmast dig · \d+ m · Avlägg 01-4 · skbv gräskulla öst huset$/);
    expect(q('larm-platser')).toBeNull();
    act(() => { q('kort-larm-alla')!.click(); });
    expect(q('kort-larm-alla')!.textContent).toContain('Alla larmplatser (5)');
    expect(q('larm-platser')!.children).toHaveLength(5);
  });
  it('utan färsk position: ingen koordinat är vald, alla fem står med avlägg och koordinat', async () => {
    await montera(<ObjektKortEnkel {...props(larm(vidHuset, false))} />);
    expect(q('kort-larm')!.getAttribute('data-valj-sjalv')).toBe('1');
    expect(q('kort-larm-koordinat')).toBeNull();
    expect(q('larm-valj-sjalv')!.textContent).toBe(LARM_VALJ_SJALV);
    const lista = q('larm-platser')!;
    expect(lista.children).toHaveLength(5);
    expect(lista.textContent).toContain('Avlägg 01-1 · skbv n karlstorp');
    expect(lista.textContent).toContain('56.49510, 14.65453');
    visade.length = 0;
    act(() => { q('larm-plats-2')!.click(); });
    expect(visade).toEqual([2]);
  });
  it('en enda larmplats: som förut, ingen lista', async () => {
    const en = larmpunkterUr([], { lat: 56.5, lng: 14.7 });
    await montera(<ObjektKortEnkel {...props({ ...larmVisning(valjLarmpunkt(en, null, false)), beskrivning: '', onVisa: () => {}, onVisaPlats: () => {} })} />);
    expect(q('kort-larm-koordinat')!.textContent).toBe('Larmkoordinat 56.50000, 14.70000');
    expect(q('kort-larm-alla')).toBeNull();
    expect(q('larm-valj-sjalv')).toBeNull();
  });
});

describe('"Om något händer" — flera larmplatser', () => {
  it('färsk position: den närmaste stort och alla under', async () => {
    const l = larm(vidHuset, true);
    await montera(<LarmVy koordinat={l.koordinat} beskrivning="" onVisa={() => {}} visning={l} onVisaPlats={() => {}} onTillbaka={() => {}} onStang={() => {}} />);
    expect(q('larm-koordinat')!.textContent).toBe('56.51626, 14.70847');
    expect(q('larm-namn')!.textContent).toContain('Avlägg 01-4');
    expect(q('larm-andra')!.querySelectorAll('[data-testid^="larm-plats-"]')).toHaveLength(5);
  });
  it('utan position: ingen stor koordinat, bara listan att välja i', async () => {
    const l = larm(null, false);
    await montera(<LarmVy koordinat={l.koordinat} beskrivning="" onVisa={() => {}} visning={l} onVisaPlats={() => {}} onTillbaka={() => {}} onStang={() => {}} />);
    expect(q('larm-koordinat')).toBeNull();
    expect(q('larm-valj-sjalv')).not.toBeNull();
    expect(q('larm-platser')!.children).toHaveLength(5);
  });
});
