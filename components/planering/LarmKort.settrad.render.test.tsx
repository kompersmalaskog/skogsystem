// @vitest-environment jsdom
// Sett-raden: en STOR knapp "✓ Sett" (minst 56 px hög) och namnet som vanlig text bredvid — inte "Sett Varning" med en liten bock längst ut.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { SettRad, SETT_KNAPP_MIN_PX } from './LarmKort';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let ruta: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });
const montera = (el: React.ReactElement) => { ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta); act(() => { rot!.render(el); }); };
const q = (id: string) => ruta!.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

describe('SettRad', () => {
  it('knappen säger "Sett" med bock, är minst 56 px hög och är den enda knappen', () => {
    montera(<SettRad namn="Varning" farg="#FF453A" smal onSett={() => {}} />);
    const k = q('larm-sett');
    expect(k.textContent).toContain('Sett');
    expect(k.textContent).toContain('check');
    expect(k.textContent).not.toContain('Varning');
    expect(SETT_KNAPP_MIN_PX).toBeGreaterThanOrEqual(56);
    expect(parseInt(k.style.minHeight, 10)).toBeGreaterThanOrEqual(56);
    expect(parseInt(k.style.minWidth, 10)).toBeGreaterThanOrEqual(112);
    expect(ruta!.querySelectorAll('button').length).toBe(1);
  });
  it('namnet står som text bredvid, utanför knappen', () => {
    montera(<SettRad namn="Kulturminne" farg="#B5651D" smal={false} onSett={() => {}} />);
    expect(q('larm-sett-rad').textContent).toContain('Kulturminne');
    expect(q('larm-sett').textContent).not.toContain('Kulturminne');
    expect(q('larm-sett').getAttribute('aria-label')).toBe('Sett Kulturminne');
  });
  it('ett tryck på knappen kvitterar EN gång; ett tryck på namnet gör inget', () => {
    const onSett = vi.fn();
    montera(<SettRad namn="Varning" farg="#FF453A" smal onSett={onSett} />);
    act(() => { q('larm-sett-rad').querySelector('span:nth-of-type(2)')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onSett).not.toHaveBeenCalled();
    act(() => { q('larm-sett').click(); });
    expect(onSett).toHaveBeenCalledTimes(1);
  });
});
