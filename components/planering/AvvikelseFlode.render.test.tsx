// @vitest-environment jsdom
// Avvikelse som bevis: foto → typ förvald → Spara → kvittot säger vad servern såg i körspåren (aldrig "fanns innan").
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, createRef } from 'react';

const lagda: any[] = [];
vi.mock('@/lib/egenkontrollfoto', () => ({ komprimeraBild: async () => new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' }) }));
vi.mock('@/lib/avvikelseKo', async (orig) => {
  const o: any = await orig();
  return { ...o, laggAvvikelseIKo: async (rad: any) => { lagda.push(rad); } };
});

import { AvvikelseFlode, type AvvikelseFlodeRef, type AvvikelsePos } from './AvvikelseFlode';
import { AVVIKELSE_SPARAD_EVENT } from '@/lib/avvikelseKo';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(URL as any).createObjectURL = () => 'blob:x';
(URL as any).revokeObjectURL = () => {};
const vanta = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

function visa(pos: AvvikelsePos | null) {
  const cont = document.createElement('div'); document.body.appendChild(cont);
  const root = createRoot(cont);
  const ref = createRef<AvvikelseFlodeRef>();
  act(() => { root.render(<AvvikelseFlode ref={ref} objektId="obj-1" hamtaPos={() => pos} hamtaForval={() => 'stenmur'} fotograf="Martin" maskinNamn={(id) => (id === 'P1' ? 'Scorpion' : null)} />); });
  return { cont, ref };
}
async function valjFoto() {
  const inp = document.querySelector('[data-testid="avvikelse-kamera"]') as HTMLInputElement;
  const fil = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg', lastModified: Date.now() - 1000 });
  Object.defineProperty(inp, 'files', { value: [fil], configurable: true });
  await act(async () => { inp.dispatchEvent(new Event('change', { bubbles: true })); });
  await vanta();
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

beforeEach(() => { document.body.innerHTML = ''; lagda.length = 0; });

describe('AvvikelseFlode', () => {
  it('förvalet är valt, Spara lägger i kön och kvittot väntar på servern', async () => {
    visa({ lat: 57.1, lng: 15.2, noggrannhetM: 5 });
    await valjFoto();
    expect(q('avvikelse-typ-stenmur')?.getAttribute('aria-checked')).toBe('true');
    await act(async () => { q('avvikelse-typ-korskada')!.click(); });
    await act(async () => { q('avvikelse-spara')!.click(); });
    await vanta();
    expect(lagda).toHaveLength(1);
    expect(lagda[0]).toMatchObject({ objekt_id: 'obj-1', typ: 'korskada', lat: 57.1, lng: 15.2, noggrannhet_m: 5 });
    expect(lagda[0].foto_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(q('avvikelse-vantar')?.textContent).toContain('skickas när nätet finns');
    // Servern svarar: fotografens och körspårets fakta visas.
    await act(async () => {
      window.dispatchEvent(new CustomEvent(AVVIKELSE_SPARAD_EVENT, { detail: { ...lagda[0], skapad_at: '2026-11-04T09:20:00Z', skapad_av: 'm', korspar_fore: { kontrollerat_fore: '2026-11-04T09:12:00Z', spar_pa_trakten_fore: 40, traffar: [{ roll: 'skordare', maskin_id: 'P1', forsta: '2026-11-02T12:00:00Z', senaste: '2026-11-02T13:30:00Z' }] } } }));
    });
    expect(q('avvikelse-korspar')?.textContent).toContain('Scorpion körde här 2 nov 14:30');
    expect(q('avvikelse-kvitto')?.textContent).toContain('av Martin');
    expect(q('avvikelse-kvitto')?.textContent).not.toMatch(/fanns innan/i);
  });

  it('utan position går det inte att spara', async () => {
    visa(null);
    await valjFoto();
    expect(q('avvikelse-ingen-pos')).not.toBeNull();
    expect((q('avvikelse-spara') as HTMLButtonElement).disabled).toBe(true);
  });
});
