// @vitest-environment jsdom
// Larmkortets ikon kommer ur SAMMA symbolkälla som kartan: form + glyf + färg (triangel med blixt för El-ledning, cirkel för allt annat).
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, afterEach } from 'vitest';
import { LarmKortVy } from './LarmKort';
import type { LarmKort } from '@/lib/larm/larm';
import { GRUPPER, type FargGrupp } from '@/lib/larm/grupper';
import { FARG_STENMUR } from '@/lib/larm/grupper';
import { FORM_PATH, GLYF, symbolDef } from '@/lib/symboler';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let ruta: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });
const montera = (el: React.ReactElement) => { ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta); act(() => { rot!.render(el); }); };

const kort = (kalla: LarmKort['kalla'], typ: string, grupp: FargGrupp, namn = 'X'): LarmKort =>
  ({ id: '1', kalla, typ, grupp, farg: GRUPPER[grupp].farg, namn, text: null, avstandM: 20, bearing: null, pulserar: false, forbjuden: false });
const ikon = () => {
  const svg = ruta!.querySelector<SVGElement>('[data-testid="larm-ikon"] svg')!;
  const [form, glyf] = Array.from(svg.querySelectorAll('path'));
  return { svg, formD: form.getAttribute('d'), fill: form.getAttribute('fill'), glyfD: glyf.getAttribute('d') };
};

describe('larmkortets ikon = kartans symbol', () => {
  it('El-ledning: rundad triangel, ledningens blixt, Rödas färg — exakt symbolDef', () => {
    montera(<LarmKortVy kort={kort('symbol', 'powerline', 'fara', 'El-ledning')} riktning={null} top="0px" />);
    const i = ikon();
    expect(i.svg.getAttribute('data-form')).toBe('triangel');
    expect(i.formD).toBe(FORM_PATH.triangel);
    expect(i.glyfD).toBe(GLYF.powerline);
    expect(i.fill).toBe(symbolDef('powerline').farg);
  });
  it('varje symbol i varje grupp: ikonen är symbolens egen form, glyf och färg', () => {
    for (const [typ, grupp] of [['warning', 'fara'], ['naturecorner', 'natur'], ['culturemonument', 'kultur'], ['wet', 'blott'], ['manualfelling', 'att_gora'], ['landing', 'info']] as const) {
      montera(<LarmKortVy kort={kort('symbol', typ, grupp)} riktning={null} top="0px" />);
      const d = symbolDef(typ);
      const i = ikon();
      expect([typ, i.formD, i.glyfD, i.fill]).toEqual([typ, FORM_PATH[d.form], d.glyf, d.farg]);
      act(() => { rot!.unmount(); }); ruta!.remove();
    }
  });
  it('BARA TVÅ former: triangel för Röd, cirkel för alla andra — även Lila (Att göra)', () => {
    for (const g of ['natur', 'kultur', 'blott', 'att_gora', 'info'] as const) {
      montera(<LarmKortVy kort={kort('symbol', 'landing', g)} riktning={null} top="0px" />);
      expect(ikon().svg.getAttribute('data-form'), g).toBe('cirkel');
      act(() => { rot!.unmount(); }); ruta!.remove();
    }
  });
  it('Vidas Kraftledning (linje) får ledningens blixt i Rött; Stenmur är en brun cirkel med stenar; Hänsyn-yta en grön cirkel', () => {
    montera(<LarmKortVy kort={kort('linje', 'kraftledning', 'fara', 'Kraftledning')} riktning={null} top="0px" />);
    expect([ikon().svg.getAttribute('data-form'), ikon().glyfD]).toEqual(['triangel', GLYF.powerline]);
    act(() => { rot!.unmount(); }); ruta!.remove();
    montera(<LarmKortVy kort={kort('linje', 'stonewall', 'kultur', 'Stenmur')} riktning={null} top="0px" />);
    expect(ikon().svg.getAttribute('data-form')).toBe('cirkel');
    expect(ikon().fill).toBe(FARG_STENMUR);
    expect(ikon().glyfD).not.toBe(GLYF.default);
    act(() => { rot!.unmount(); }); ruta!.remove();
    montera(<LarmKortVy kort={kort('yta', 'protected', 'natur', 'Hänsyn')} riktning={null} top="0px" />);
    expect([ikon().svg.getAttribute('data-form'), ikon().fill, ikon().glyfD]).toEqual(['cirkel', GRUPPER.natur.farg, GLYF.naturecorner]);
  });
  it('inga Material-ikoner kvar i kortet', () => {
    montera(<LarmKortVy kort={kort('symbol', 'powerline', 'fara')} riktning={null} top="0px" />);
    expect(ruta!.querySelector('[data-testid="larm-kort"] .material-symbols-outlined')).toBeNull();
  });
});
