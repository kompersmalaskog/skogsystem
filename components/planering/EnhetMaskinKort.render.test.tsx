// @vitest-environment jsdom
/** Kortet "Den här enheten är maskin": svaret först, ett tryck väljer, "Ingen maskin" tar bort, "Starta som maskin" först när en maskin är vald. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EnhetMaskinKort from './EnhetMaskinKort';

const maskiner = [
  { maskinId: 'R1', namn: 'H8E -26', slag: 'Skördare' as const },
  { maskinId: 'A1', namn: 'Wisent', slag: 'Skotare' as const },
];
let rot: ReturnType<typeof createRoot> | null = null;
let el: HTMLDivElement;
const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const montera = async (p: Partial<React.ComponentProps<typeof EnhetMaskinKort>> = {}) => {
  const props = { maskiner, valdId: null, registerLaddar: false, installerad: true, plats: 'ok' as const, onVal: vi.fn(), onStarta: vi.fn(), ...p };
  rot = createRoot(el);
  await act(async () => { rot!.render(<EnhetMaskinKort {...props} />); });
  return props;
};
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; el = document.createElement('div'); document.body.appendChild(el); });
afterEach(() => { act(() => rot?.unmount()); el.remove(); });

describe('EnhetMaskinKort', () => {
  it('utan vald maskin: svaret är "ingen maskin", ingen Starta-knapp, ingen "Ingen maskin"-rad', async () => {
    await montera();
    expect(el.textContent).toContain('Den här enheten är ingen maskin');
    expect(q('enhet-maskin-starta')).toBeNull();
    expect(q('enhet-maskin-ingen')).toBeNull();
  });

  it('ett tryck på en maskin väljer den (direkt i trycket)', async () => {
    const p = await montera();
    await act(async () => { q('enhet-maskin-A1')!.click(); });
    expect(p.onVal).toHaveBeenCalledWith('A1');
  });

  it('vald maskin: svaret nämner den, valet går inte att välja igen, Starta och Ingen maskin finns', async () => {
    const p = await montera({ valdId: 'A1' });
    expect(el.textContent).toContain('Den här enheten är maskin: Wisent');
    await act(async () => { q('enhet-maskin-A1')!.click(); });
    expect(p.onVal).not.toHaveBeenCalled();
    await act(async () => { q('enhet-maskin-starta')!.click(); });
    expect(p.onStarta).toHaveBeenCalledTimes(1);
    await act(async () => { q('enhet-maskin-ingen')!.click(); });
    expect(p.onVal).toHaveBeenCalledWith(null);
  });

  it('en vald maskin som inte längre är aktiv visas ändå (aldrig tyst borta)', async () => {
    await montera({ valdId: 'GAMMAL' });
    expect(el.textContent).toContain('Den här enheten är maskin: GAMMAL');
  });

  it('förberedelserna: Autolås, plats och installation syns', async () => {
    await montera({ installerad: false, plats: 'nekad' });
    expect(el.textContent).toContain('Autolås: Aldrig');
    expect(el.textContent).toContain('Plats är nekad');
    expect(el.textContent).toContain('Installera appen på hemskärmen');
  });
});
