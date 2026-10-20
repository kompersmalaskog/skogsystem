// @vitest-environment jsdom
// Flera larm samtidigt: ETT stort kort och en liten rad i samma kort — aldrig flera stora kort.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, afterEach } from 'vitest';
import { LarmKortVy } from './LarmKort';
import type { LarmKort, LarmNasta } from '@/lib/larm/larm';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let ruta: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });
const montera = (el: React.ReactElement) => { ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta); act(() => { rot!.render(el); }); };
const q = (id: string) => ruta!.querySelector<HTMLElement>(`[data-testid="${id}"]`);

const kort = { id: '1', namn: 'Kraftledning', grupp: 'fara', farg: '#FF453A', avstandM: 13, text: null, pulserar: true, forbjuden: false } as unknown as LarmKort;
const nasta = (namn: string, avstandM: number | null, text: string | null = null): LarmNasta => ({ id: namn, namn, grupp: 'fara', farg: '#FF453A', avstandM, text } as unknown as LarmNasta);

describe('LarmKortVy — flera larm', () => {
  it('inga fler: ingen rad', () => {
    montera(<LarmKortVy kort={kort} riktning={null} top="0px" />);
    expect(q('larm-fler')).toBeNull();
  });
  it('ett till larm: "+ Namn · kommentar  meter m" i samma kort, och bara ETT stort kort', () => {
    montera(<LarmKortVy kort={kort} riktning={null} top="0px" fler={[nasta('Varning', 18, 'Hängande trädtopp')]} />);
    expect(ruta!.querySelectorAll('[data-testid="larm-kort"]').length).toBe(1);
    const rad = q('larm-fler')!;
    expect(q('larm-kort')!.contains(rad)).toBe(true);
    expect(q('larm-fler-namn')!.textContent).toBe('+ Varning · Hängande trädtopp');
    expect(q('larm-fler-meter')!.textContent).toBe('18 m');
    expect(q('larm-fler-prick')!.style.background).toBeTruthy();
  });
  it('utan kommentar står bara namnet', () => {
    montera(<LarmKortVy kort={kort} riktning={null} top="0px" fler={[nasta('Naturhörna', 30)]} />);
    expect(q('larm-fler-namn')!.textContent).toBe('+ Naturhörna');
  });
  it('tre samtidigt: "+2 till", inga namn, fortfarande ETT stort kort', () => {
    montera(<LarmKortVy kort={kort} riktning={null} top="0px" fler={[nasta('Varning', 18), nasta('Stenmur', 25)]} />);
    expect(q('larm-fler-antal')!.textContent).toBe('+2 till');
    expect(q('larm-fler-namn')).toBeNull();
    expect(ruta!.querySelectorAll('[data-testid="larm-kort"]').length).toBe(1);
  });
});
