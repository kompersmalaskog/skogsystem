// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { kopplaFlyttaMig, kopplaLangtryckFlytt } from './testPosition';
import { LANGTRYCK_MS } from './langtryck';
import { readFileSync } from 'node:fs';
import path from 'node:path';

let div: HTMLDivElement; const flyttar: [number, number][] = []; let andraKlick = 0;
const karta = () => ({ getContainer: () => div, unproject: ([x, y]: [number, number]) => ({ lat: 56 + y / 1000, lng: 14 + x / 1000 }) });
beforeEach(() => {
  document.body.innerHTML = ''; div = document.createElement('div'); document.body.appendChild(div); flyttar.length = 0; andraKlick = 0;
  div.getBoundingClientRect = () => ({ left: 10, top: 20, right: 0, bottom: 0, width: 0, height: 0, x: 10, y: 20, toJSON() {} } as DOMRect);
  div.addEventListener('click', () => { andraKlick++; });   // ett annat lager på kartan
});
const tryck = (x: number, y: number, tillX = x, tillY = y) => {
  div.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
  div.dispatchEvent(new MouseEvent('click', { clientX: tillX, clientY: tillY, bubbles: true, cancelable: true }));
};

describe('Flytta mig hit (testläget)', () => {
  it('ett tryck på kartan ger positionen under fingret, och inget annat på kartan reagerar', () => {
    kopplaFlyttaMig(karta(), (la, lo) => flyttar.push([la, lo]));
    tryck(110, 220);
    expect(flyttar).toEqual([[56.2, 14.1]]);              // (110-10, 220-20) → unproject
    expect(andraKlick).toBe(0);
  });
  it('ett drag (panorering) flyttar inget — men sväljs ändå', () => {
    kopplaFlyttaMig(karta(), (la, lo) => flyttar.push([la, lo]));
    tryck(100, 100, 140, 100);
    expect(flyttar).toEqual([]);
  });
  it('upprepade tryck flyttar igen (man kan "gå" över kartan)', () => {
    kopplaFlyttaMig(karta(), (la, lo) => flyttar.push([la, lo]));
    tryck(20, 30); tryck(60, 70);
    expect(flyttar).toHaveLength(2);
  });
  it('avkopplad: trycket går till kartan som vanligt', () => {
    const stang = kopplaFlyttaMig(karta(), (la, lo) => flyttar.push([la, lo]));
    stang(); tryck(50, 50);
    expect(flyttar).toEqual([]); expect(andraKlick).toBe(1);
  });
  it('en karta utan container ger ingen fångst och inget fel', () => {
    expect(() => kopplaFlyttaMig({ getContainer: () => null, unproject: () => ({ lat: 0, lng: 0 }) }, () => {})()).not.toThrow();
  });
});

describe('sidans koppling (källvakt)', () => {
  const sida = readFileSync(path.resolve(process.cwd(), 'app/planering/page.tsx'), 'utf8').replace(/\r\n/g, '\n');
  it('knappen "Flytta mig hit" finns bara i testbannern (som bara finns i testläget)', () => {
    const banner = sida.slice(sida.indexOf('{testlage && ('), sida.indexOf('/maskin: HELSVART'));
    expect(banner).toContain('data-testid="test-flytta-mig"');
    expect(banner).toContain("'Flytta mig hit'");
    expect(sida.split('data-testid="test-flytta-mig"').length - 1).toBe(1);
  });
  it('fångsten är bara på i testläget och bara medan läget är påslaget', () => {
    expect(sida).toContain('if (!map || !mapLibreReady || !testlage || !testFlyttaMig) return;');
    expect(sida).toContain('return kopplaFlyttaMig(map, flyttaTestPosition);');
  });
  it('varje positionsskrivning från GPS-hubben är spärrad i testläget — bara "Flytta mig hit" sätter positionen där', () => {
    const rader = sida.split('\n').filter((l) => /setCurrentPosition\(/.test(l) && !/useState/.test(l));
    const ovakta = rader.filter((l) => !l.includes('if (!testlageAktivRef.current) setCurrentPosition('));
    expect(ovakta.map((l) => l.trim())).toEqual(['setCurrentPosition({ lat, lon });']);   // flyttaTestPosition
    expect(sida).toContain('torr: !!testlage,');                                         // kvittenser skrivs inte i testläget
  });
});

describe('håll fingret på kartan flyttar testpositionen (testläget)', () => {
  const pe = (typ: string, x: number, y: number, id = 1, over: Record<string, unknown> = {}) => {
    const e = new MouseEvent(typ, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    for (const [k, v] of Object.entries({ pointerId: id, pointerType: 'touch', ...over })) Object.defineProperty(e, k, { value: v });
    div.dispatchEvent(e);
    return e;
  };
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T10:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });
  const vib = () => {};
  const koppla = () => kopplaLangtryckFlytt(karta(), (la, lo) => flyttar.push([la, lo]), { vibrera: vib });

  it('efter LANGTRYCK_MS flyttas positionen till det som ligger under fingret', () => {
    koppla();
    pe('pointerdown', 110, 220);
    vi.advanceTimersByTime(LANGTRYCK_MS - 10);
    expect(flyttar).toEqual([]);
    vi.advanceTimersByTime(20);
    expect(flyttar).toEqual([[56.2, 14.1]]);   // (110-10, 220-20) → unproject
  });
  it('ett kort tryck flyttar inget', () => {
    koppla();
    pe('pointerdown', 110, 220); vi.advanceTimersByTime(200); pe('pointerup', 110, 220); vi.advanceTimersByTime(1000);
    expect(flyttar).toEqual([]);
  });
  it('ett drag (panorering) före tiden flyttar inget', () => {
    koppla();
    pe('pointerdown', 110, 220); vi.advanceTimersByTime(200); pe('pointermove', 160, 220); vi.advanceTimersByTime(1000);
    expect(flyttar).toEqual([]);
  });
  it('lite darr (under gränsen) avbryter inte', () => {
    koppla();
    pe('pointerdown', 110, 220); pe('pointermove', 114, 222); vi.advanceTimersByTime(LANGTRYCK_MS + 10);
    expect(flyttar).toHaveLength(1);
  });
  it('nyp (två fingrar) flyttar inget', () => {
    koppla();
    pe('pointerdown', 110, 220, 1); pe('pointerdown', 150, 220, 2); vi.advanceTimersByTime(1000);
    expect(flyttar).toEqual([]);
  });
  it('högerklick med mus flyttar inget', () => {
    koppla();
    pe('pointerdown', 110, 220, 1, { pointerType: 'mouse', button: 2 }); vi.advanceTimersByTime(1000);
    expect(flyttar).toEqual([]);
  });
  it('klicket som följer på lyftet sväljs (inget annat på kartan reagerar), ett senare klick går igenom', () => {
    koppla();
    pe('pointerdown', 110, 220); vi.advanceTimersByTime(LANGTRYCK_MS + 10); pe('pointerup', 110, 220);
    div.dispatchEvent(new MouseEvent('click', { clientX: 110, clientY: 220, bubbles: true, cancelable: true }));
    expect(andraKlick).toBe(0);
    vi.advanceTimersByTime(1000);
    div.dispatchEvent(new MouseEvent('click', { clientX: 110, clientY: 220, bubbles: true, cancelable: true }));
    expect(andraKlick).toBe(1);
  });
  it('man kan "gå" över kartan: ett nytt håll flyttar igen', () => {
    koppla();
    pe('pointerdown', 20, 30); vi.advanceTimersByTime(LANGTRYCK_MS + 10); pe('pointerup', 20, 30);
    vi.advanceTimersByTime(1000);
    pe('pointerdown', 60, 70); vi.advanceTimersByTime(LANGTRYCK_MS + 10); pe('pointerup', 60, 70);
    expect(flyttar).toHaveLength(2);
  });
  it('avkopplad: inget händer', () => {
    const stang = koppla(); stang();
    pe('pointerdown', 110, 220); vi.advanceTimersByTime(2000);
    expect(flyttar).toEqual([]);
  });
  it('en karta utan container ger ingen fångst och inget fel', () => {
    expect(() => kopplaLangtryckFlytt({ getContainer: () => null, unproject: () => ({ lat: 0, lng: 0 }) }, () => {})()).not.toThrow();
  });
});

describe('håll-fingret i testläget: sidans koppling (källvakt)', () => {
  const sida = readFileSync(path.resolve(process.cwd(), 'app/planering/page.tsx'), 'utf8').replace(/\r\n/g, '\n');
  it('kopplas bara i testläget', () => {
    expect(sida).toMatch(/if \(!map \|\| !mapLibreReady \|\| !testlage\) return;\s*return kopplaLangtryckFlytt\(map, flyttaTestPosition\);/);
  });
  it('flyttar via flyttaTestPosition — den enda platsen som skriver position i testläget — aldrig GPS-hubben', () => {
    expect(sida).not.toMatch(/kopplaLangtryckFlytt\(map, (setCurrentPosition|setGpsPosition)/);
  });
  it('plusdockans långtryck är avstängt i testläget (annars öppnas dockan också)', () => {
    expect(sida).toMatch(/&& !objektListaOppen\s*&& !testlage;/);
  });
  it('testbannern säger hur man gör', () => {
    expect(sida).toContain('data-testid="test-langtryck-tips"');
  });
});
