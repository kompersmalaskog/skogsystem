// @vitest-environment jsdom
// Reglagen i + › Lager (Kartan tydligare): bakgrundens "Dämpad ↔ Skarp" och varje påslaget överlägg "Kartan syns ↔ Bara lagret".
// Riktig PlusArk + riktig useKartReglage (localStorage), uppsatta med samma byggare som page.tsx (overlayReglage/bakgrundReglage).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PlusRad } from './PlusRad';
import type { LagerGrupp } from './PlusArk';
import { useKartReglage } from '@/lib/hooks/useKartReglage';
import { bakgrundReglage, overlayReglage } from '@/lib/lagerOpacitet';
import { LAGER_OP_NYCKEL, STYRKA_NYCKEL } from '@/lib/kartReglage';
import { sattBredd } from './PlusRad.testhjalp';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let spion: { styrkor: any; lagerOp: any } = { styrkor: {}, lagerOp: {} };

function Host() {
  const r = useKartReglage();
  spion = { styrkor: r.styrkor, lagerOp: r.lagerOp };
  const [pa, setPa] = useState<Record<string, boolean>>({ sks_markfuktighet: true, produktionshogar: true, hansyn: false });
  const [bak, setBak] = useState<'satellite' | 'lantmateriet'>('satellite');
  const vaxel = (id: string, namn: string) => ({ id, namn, typ: 'vaxel' as const, pa: !!pa[id], onTryck: () => setPa((p) => ({ ...p, [id]: !p[id] })), reglage: overlayReglage(id, r.lagerOp, r.setLagerOp) ?? undefined });
  const lager: LagerGrupp[] = [
    { id: 'bakgrundskarta', rubrik: 'Bakgrundskarta', rader: (['satellite', 'lantmateriet'] as const).map((t) => ({ id: t, namn: t === 'satellite' ? 'Flygfoto' : 'Karta', typ: 'val' as const, pa: bak === t, onTryck: () => setBak(t), reglage: bakgrundReglage(t, r.styrkor, r.setStyrka) })) },
    { id: 'overlay', rubrik: 'Overlay', rader: [vaxel('sks_markfuktighet', 'Markfuktighet'), vaxel('hansyn', 'Hänsynsytor – Vida'), vaxel('produktionshogar', 'Avverkade stammar')] },
  ];
  return <PlusRad oppen poster={[]} ark={{ symboler: [], rita: [], lager }} startFlik="lager" onPost={() => {}} onFastna={() => ({ ok: true, text: '' })} onSparaDocka={() => {}} onAterstall={() => {}} onStang={() => {}} />;
}

let rot: Root; let div: HTMLDivElement;
const montera = () => { div = document.createElement('div'); document.body.appendChild(div); rot = createRoot(div); act(() => { rot.render(<Host />); }); };
const avmontera = () => { act(() => rot.unmount()); div.remove(); };
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const inmat = (el: HTMLInputElement, v: number) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => { set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

beforeEach(() => { sattBredd(390); window.localStorage.clear(); });
afterEach(() => { try { avmontera(); } catch { /* redan avmonterad */ } });

describe('reglaget syns bara under ett påslaget/valt lager', () => {
  it('Markfuktighet (på) har reglage 15–100 steg 5 med orden "Kartan syns" och "Bara lagret"; Hänsynsytor (av) har inget', () => {
    montera();
    const i = q('plus-reglage-input-overlay-sks_markfuktighet') as HTMLInputElement;
    expect(i).not.toBeNull();
    expect([i.min, i.max, i.step]).toEqual(['15', '100', '5']);
    expect(i.value).toBe('70');   // lagrets eget värde (0,7) tills man väljer något annat
    expect(q('plus-reglage-overlay-sks_markfuktighet')!.textContent).toContain('Kartan syns');
    expect(q('plus-reglage-overlay-sks_markfuktighet')!.textContent).toContain('Bara lagret');
    expect(q('plus-reglage-input-overlay-hansyn')).toBeNull();
  });
  it('Produktionshögar har aldrig något reglage, hur påslagna de än är', () => {
    montera();
    expect(q('plus-lager-overlay-produktionshogar')!.getAttribute('data-pa')).toBe('1');
    expect(q('plus-reglage-input-overlay-produktionshogar')).toBeNull();
  });
  it('bara den valda bakgrunden har sitt Dämpad ↔ Skarp (standard 85, 0–100 steg 5)', () => {
    montera();
    const i = q('plus-reglage-input-bakgrundskarta-satellite') as HTMLInputElement;
    expect([i.min, i.max, i.step, i.value]).toEqual(['0', '100', '5', '85']);
    expect(q('plus-reglage-bakgrundskarta-satellite')!.textContent).toMatch(/Dämpad.*Skarp/);
    expect(q('plus-reglage-input-bakgrundskarta-lantmateriet')).toBeNull();
    act(() => { q('plus-lager-bakgrundskarta-lantmateriet')!.click(); });
    expect(q('plus-reglage-input-bakgrundskarta-lantmateriet')).not.toBeNull();
    expect(q('plus-reglage-input-bakgrundskarta-satellite')).toBeNull();
  });
  it('träffytan är minst 44 px hög (finger på maskindatorn) och reglaget ligger i en egen yta som inte skymmer raden', () => {
    montera();
    const i = q('plus-reglage-input-overlay-sks_markfuktighet') as HTMLInputElement;
    expect(i.style.height).toBe('44px');
    expect(i.style.touchAction).toBe('pan-y');   // en vågrät dragning går till reglaget, inte till arkets rullning
    expect(i.closest('button')).toBeNull();      // inte inne i radens knapp: att dra ändrar inte lagrets av/på
  });
});

describe('värdet sparas direkt, per enhet och lager', () => {
  it('att dra sparar i localStorage och ändrar det som visas — direkt, utan Spara', () => {
    montera();
    inmat(q('plus-reglage-input-overlay-sks_markfuktighet') as HTMLInputElement, 40);
    expect(JSON.parse(window.localStorage.getItem(LAGER_OP_NYCKEL)!)).toEqual({ sks_markfuktighet: 40 });
    expect((q('plus-reglage-input-overlay-sks_markfuktighet') as HTMLInputElement).value).toBe('40');
    inmat(q('plus-reglage-input-bakgrundskarta-satellite') as HTMLInputElement, 55);
    expect(JSON.parse(window.localStorage.getItem(STYRKA_NYCKEL)!)).toEqual({ satellite: 55 });
  });
  it('läses tillbaka efter omladdning (ny montering)', () => {
    montera();
    inmat(q('plus-reglage-input-overlay-sks_markfuktighet') as HTMLInputElement, 25);
    inmat(q('plus-reglage-input-bakgrundskarta-satellite') as HTMLInputElement, 30);
    avmontera();
    montera();
    expect((q('plus-reglage-input-overlay-sks_markfuktighet') as HTMLInputElement).value).toBe('25');
    expect((q('plus-reglage-input-bakgrundskarta-satellite') as HTMLInputElement).value).toBe('30');
    expect(spion.lagerOp).toEqual({ sks_markfuktighet: 25 });
  });
  it('ett lager som slås av och på behåller sitt värde (reglaget försvinner när det är av, värdet gör det inte)', () => {
    montera();
    inmat(q('plus-reglage-input-overlay-sks_markfuktighet') as HTMLInputElement, 35);
    act(() => { q('plus-lager-overlay-sks_markfuktighet')!.click(); });
    expect(q('plus-reglage-input-overlay-sks_markfuktighet')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(LAGER_OP_NYCKEL)!)).toEqual({ sks_markfuktighet: 35 });
    act(() => { q('plus-lager-overlay-sks_markfuktighet')!.click(); });
    expect((q('plus-reglage-input-overlay-sks_markfuktighet') as HTMLInputElement).value).toBe('35');
  });
  it('en bakgrund som byts bort och tillbaka behåller sitt eget värde; den andra bakgrunden har sitt', () => {
    montera();
    inmat(q('plus-reglage-input-bakgrundskarta-satellite') as HTMLInputElement, 20);
    act(() => { q('plus-lager-bakgrundskarta-lantmateriet')!.click(); });
    expect((q('plus-reglage-input-bakgrundskarta-lantmateriet') as HTMLInputElement).value).toBe('85');
    act(() => { q('plus-lager-bakgrundskarta-satellite')!.click(); });
    expect((q('plus-reglage-input-bakgrundskarta-satellite') as HTMLInputElement).value).toBe('20');
  });
  it('blockerad lagring fäller inte reglaget — värdet gäller i minnet', () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('full'); };
    try {
      montera();
      inmat(q('plus-reglage-input-overlay-sks_markfuktighet') as HTMLInputElement, 50);
      expect((q('plus-reglage-input-overlay-sks_markfuktighet') as HTMLInputElement).value).toBe('50');
    } finally { Storage.prototype.setItem = orig; }
  });
});
