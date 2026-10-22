// @vitest-environment jsdom
// Besöken i hytten: läser aktiva anmälningar för objektet, spelar ETT ljud per nytt besök, och "Uppfattat" sparas med maskin, roll och förare (servertiden sätter databasen).
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSb } from '../besok/fakeSb.testStod';

const klient = vi.hoisted(() => ({ ut: null as any }));
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_t, k) => klient.ut[k] }) }));
const ljud = vi.hoisted(() => ({ spelaLarmLjud: vi.fn(() => true) }));
vi.mock('@/lib/larm/ljud', () => ljud);

import { useBesokHytt } from './useBesokHytt';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const OBJ = 'obj-1';
const iso = (min: number) => new Date(Date.now() + min * 60000).toISOString();
let rot: Root | null = null;
let ruta: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; vi.useRealTimers(); });
beforeEach(() => { ljud.spelaLarmLjud.mockClear(); });

type Ut = ReturnType<typeof useBesokHytt>;
async function montera(tabeller: Record<string, any[]>, inp: Partial<Parameters<typeof useBesokHytt>[0]> = {}) {
  klient.ut = fakeSb(tabeller);
  const ref: { ut: Ut | null } = { ut: null };
  function Probe() { ref.ut = useBesokHytt({ aktiv: true, objektId: OBJ, maskinId: 'M1', roll: 'skordare', forareId: 'f1', testlage: false, ljudCtx: () => ({}) as any, ...inp }); return null; }
  ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta);
  await act(async () => { rot!.render(<Probe />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  return { ref, db: klient.ut };
}
const b = (id: string, min: number, objekt = OBJ) => ({ id, objekt_id: objekt, namn: `Gäst ${id}`, telefon: '070', besokstid: iso(min) });

describe('useBesokHytt', () => {
  it('visar aktiva besök för objektet — inte andra trakters och inte de som är mer än 2 h gamla', async () => {
    const { ref } = await montera({ objekt_besok: [b('a', 30), b('gammal', -200), b('annat', 30, 'annan')], objekt_besok_kvittens: [] });
    expect(ref.ut!.aktiva.map((x) => x.id)).toEqual(['a']);
    expect(ref.ut!.vantar.map((x) => x.id)).toEqual(['a']);
  });
  it('ett ljud för ett nytt besök; inget för ett som den här maskinen redan kvitterat', async () => {
    await montera({ objekt_besok: [b('a', 30)], objekt_besok_kvittens: [] });
    expect(ljud.spelaLarmLjud).toHaveBeenCalledTimes(1);
    ljud.spelaLarmLjud.mockClear();
    await montera({ objekt_besok: [b('a', 30)], objekt_besok_kvittens: [{ besok_id: 'a', maskin_id: 'M1' }] });
    expect(ljud.spelaLarmLjud).not.toHaveBeenCalled();
  });
  it('Uppfattat sparar maskin, roll och förare — aldrig en tid från klienten — och kortet (vantar) försvinner', async () => {
    const { ref, db } = await montera({ objekt_besok: [b('a', 30)], objekt_besok_kvittens: [] });
    let ok = false;
    await act(async () => { ok = await ref.ut!.kvittera('a'); });
    expect(ok).toBe(true);
    expect(db._loggar.filter((l: any) => l.op === 'upsert')[0].rad).toEqual({ besok_id: 'a', maskin_id: 'M1', roll: 'skordare', forare_id: 'f1', testlage: false });
    expect(ref.ut!.vantar).toEqual([]);
    expect(ref.ut!.aktiva).toHaveLength(1);   // ringen ligger kvar så länge besöket är aktivt
  });
  it('testläget märks i kvittensen', async () => {
    const { ref, db } = await montera({ objekt_besok: [b('a', 30)], objekt_besok_kvittens: [] }, { testlage: true });
    await act(async () => { await ref.ut!.kvittera('a'); });
    expect(db._loggar[0].rad.testlage).toBe(true);
  });
  it('saknas maskin eller förare sparas ingenting och felet sägs', async () => {
    const { ref, db } = await montera({ objekt_besok: [b('a', 30)], objekt_besok_kvittens: [] }, { forareId: null });
    let ok = true;
    await act(async () => { ok = await ref.ut!.kvittera('a'); });
    expect(ok).toBe(false);
    expect(ref.ut!.fel).toContain('förare saknas');
    expect(db._loggar).toHaveLength(0);
    expect(ref.ut!.vantar).toHaveLength(1);
  });
  it('passiv utanför maskinläget: ingen läsning, inga besök', async () => {
    const { ref, db } = await montera({ objekt_besok: [b('a', 30)], objekt_besok_kvittens: [] }, { aktiv: false });
    expect(ref.ut!.aktiva).toEqual([]);
    expect(db._valda).toHaveLength(0);
  });
  it('läser om var 4:e sekund (kravet är ≤ 5 s) — ett nytt besök dyker upp av sig självt', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const tabeller: Record<string, any[]> = { objekt_besok: [], objekt_besok_kvittens: [] };
    const { ref } = await montera(tabeller);
    expect(ref.ut!.vantar).toEqual([]);
    tabeller.objekt_besok.push(b('ny', 20));
    await act(async () => { vi.advanceTimersByTime(4000); for (let i = 0; i < 8; i++) await Promise.resolve(); });
    expect(ref.ut!.vantar.map((x) => x.id)).toEqual(['ny']);
  });
});
