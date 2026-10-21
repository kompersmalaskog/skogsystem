// @vitest-environment jsdom
//
// Lagervalet sparas PER ENHET och far aldrig vara nagot vyn beror pa (PR 8a).
//
// Det som far ga sonder tyst:
//  - tomt/trasigt/avstangt minne kastar eller ger nagot annat an standarden,
//  - standarden sparas ner vid en kallstart (en senare andring av standarden nar da aldrig dem som aldrig rort menyn),
//  - ett val sparas inte, eller sparas med fel nyckel,
//  - ett fel vid skrivning (fullt minne, privat lage) fäller vyn.
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAGER_LAGRING, LAGER_STANDARD } from '../egenkontrollLager';
import { useEgenkontrollLager } from './useEgenkontrollLager';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let val: Record<string, boolean> = {};
let sett: (f: (p: Record<string, boolean>) => Record<string, boolean>) => void = () => {};

function Prov() { const [v, s] = useEgenkontrollLager(); val = v; sett = s; return null; }
async function montera() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(Prov)); });
}

beforeEach(() => { localStorage.clear(); });
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

describe('useEgenkontrollLager', () => {
  it('tomt minne: standarden - och en kallstart sparar INGET', async () => {
    const skriv = vi.spyOn(Storage.prototype, 'setItem');
    await montera();
    expect(val).toEqual(LAGER_STANDARD);
    expect(skriv).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAGER_LAGRING)).toBeNull();
  });

  it('ett sparat val laggs pa efter forsta renderingen', async () => {
    localStorage.setItem(LAGER_LAGRING, JSON.stringify({ ekSparSkotare: true, ekPunkter: false }));
    await montera();
    expect(val.ekSparSkotare).toBe(true);
    expect(val.ekPunkter).toBe(false);
    expect(val.ekProvytor).toBe(true);
  });

  it('en andring sparas under nyckeln, med alla kanda nycklar', async () => {
    await montera();
    await act(async () => { sett((p) => ({ ...p, ekVidaGrans: true })); });
    const sparat = JSON.parse(localStorage.getItem(LAGER_LAGRING)!);
    expect(sparat.ekVidaGrans).toBe(true);
    expect(sparat.ekPunkter).toBe(true);
    await act(async () => { sett((p) => ({ ...p, ekVidaGrans: false })); });
    expect(JSON.parse(localStorage.getItem(LAGER_LAGRING)!).ekVidaGrans).toBe(false);
  });

  it('trasig JSON i minnet: standarden, ingen krasch', async () => {
    localStorage.setItem(LAGER_LAGRING, '{inte json');
    await montera();
    expect(val).toEqual(LAGER_STANDARD);
  });

  it('minnet gar inte att lasa (privat lage): standarden - vyn beror inte pa det', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    await montera();
    expect(val).toEqual(LAGER_STANDARD);
  });

  it('minnet gar inte att skriva (fullt): valet galler i sessionen och inget kastas', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    await montera();
    await act(async () => { sett((p) => ({ ...p, ekSparSkordare: true })); });
    expect(val.ekSparSkordare).toBe(true);
  });
});
