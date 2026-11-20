// @vitest-environment jsdom
import React, { act } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { KorordningPanel, type KorRad } from './KorordningPanel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let behallare: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; behallare = null; });
const q = (id: string) => behallare!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const tryck = (id: string) => act(() => { q(id)!.click(); });
function montera(el: React.ReactElement) { behallare = document.createElement('div'); document.body.appendChild(behallare); rot = createRoot(behallare); act(() => { rot!.render(el); }); }

const rader: KorRad[] = [
  { id: 'a', ordning: 1, farg: '#ff453a', namn: 'Basväg röd', langd: '640 m' },
  { id: 'b', ordning: 2, farg: '#fbbf24', namn: 'Stickväg Gul', langd: '85 m' },
];
const hand = () => ({ onKlar: vi.fn(), onBorjaOm: vi.fn(), onGodkann: vi.fn(), onInteNu: vi.fn() });

describe('KorordningPanel', () => {
  it('tom lista: säger vad man gör, Börja om är avstängd, Klar finns', () => {
    const h = hand();
    montera(<KorordningPanel rader={[]} forslag={null} smal={true} {...h} />);
    expect(behallare!.textContent).toMatch(/tryck på vägarna i den ordning de ska köras/i);
    expect((q('kor-borja-om') as HTMLButtonElement).disabled).toBe(true);
    tryck('kor-klar');
    expect(h.onKlar).toHaveBeenCalledOnce();
  });
  it('listan: siffra, namn och längd per väg; ände-tipset; Börja om anropas', () => {
    const h = hand();
    montera(<KorordningPanel rader={rader} forslag={null} smal={false} {...h} />);
    const rad = q('kor-rad-b')!;
    expect(rad.textContent).toContain('2');
    expect(rad.textContent).toContain('Stickväg Gul');
    expect(rad.textContent).toContain('85 m');
    expect(behallare!.textContent).toContain('vända den');
    tryck('kor-borja-om');
    expect(h.onBorjaOm).toHaveBeenCalledOnce();
  });
  it('förslag: Godkänn och Inte nu, och pilarna tas bort först vid Godkänn (texten säger det)', () => {
    const h = hand();
    montera(<KorordningPanel rader={[]} forslag={{ rader, pilar: 12 }} smal={true} {...h} />);
    expect(behallare!.textContent).toContain('Förslag ur dina körriktningspilar · 2 vägar');
    expect(behallare!.textContent).toContain('De 12 pilarna tas bort först när du godkänner');
    expect(q('kor-klar')).toBeNull();
    expect(h.onGodkann).not.toHaveBeenCalled();
    tryck('kor-inte-nu');
    expect(h.onInteNu).toHaveBeenCalledOnce();
    tryck('kor-godkann');
    expect(h.onGodkann).toHaveBeenCalledOnce();
  });
});
