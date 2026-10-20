// @vitest-environment jsdom
// Sett-raden: en STOR knapp "✓ Sett" (minst 56 px hög) och namnet som vanlig text bredvid — inte "Sett Varning" med en liten bock längst ut.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { LarmKortVy, SettRad, SETT_KNAPP_MIN_PX } from './LarmKort';
import type { LarmKort as Kort } from '@/lib/larm/larm';

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

describe('LarmKortVy — ETT stort kort med en liten +-rad', () => {
  const kort: Kort = { id: 'a', kalla: 'linje', grupp: 'fara', farg: '#FF453A', namn: 'Kraftledning', text: null, avstandM: 13, bearing: null, pulserar: false, forbjuden: false };
  const rad = { id: 'b', grupp: 'natur' as const, farg: '#30D158', namn: 'Varning', text: 'Gammal stubbe', avstandM: 18 };

  it('ett larm: inget +-rad', () => {
    montera(<LarmKortVy kort={kort} riktning={null} top="0px" nasta={null} />);
    expect(ruta!.querySelector('[data-testid="larm-nasta"]')).toBeNull();
    expect(ruta!.querySelectorAll('[data-testid="larm-kort"]').length).toBe(1);
  });
  it('två larm: raden i SAMMA kort med namn, kommentar och meter — aldrig ett andra stort kort', () => {
    montera(<LarmKortVy kort={kort} riktning={null} top="0px" nasta={{ rad, fler: 0 }} />);
    expect(ruta!.querySelectorAll('[data-testid="larm-kort"]').length).toBe(1);
    const nasta = q('larm-kort').querySelector('[data-testid="larm-nasta"]') as HTMLElement;
    expect(nasta).not.toBeNull();
    expect(nasta.querySelector('[data-testid="larm-nasta-text"]')!.textContent).toBe('+ Varning · Gammal stubbe');
    expect(nasta.querySelector('[data-testid="larm-nasta-meter"]')!.textContent).toBe('18 m');
    expect(q('larm-meter').textContent).toContain('13');   // det stora kortets meter är oförändrat
  });
  it('utan kommentar: bara namnet efter plustecknet', () => {
    montera(<LarmKortVy kort={kort} riktning={null} top="0px" nasta={{ rad: { ...rad, text: null }, fler: 0 }} />);
    expect(q('larm-nasta-text').textContent).toBe('+ Varning');
  });
  it('flera: "+2 till", inget namn', () => {
    montera(<LarmKortVy kort={kort} riktning={null} top="0px" nasta={{ rad: null, fler: 2 }} />);
    expect(q('larm-nasta-text').textContent).toBe('+2 till');
    expect(ruta!.querySelectorAll('[data-testid="larm-kort"]').length).toBe(1);
  });
  it('+-raden är ingen knapp (Sett gäller det stora larmet och bor i Sett-raden)', () => {
    montera(<LarmKortVy kort={kort} riktning={null} top="0px" nasta={{ rad, fler: 0 }} />);
    expect(ruta!.querySelectorAll('button').length).toBe(0);
  });
});
