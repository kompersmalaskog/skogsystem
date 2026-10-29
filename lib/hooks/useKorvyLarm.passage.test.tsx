// @vitest-environment jsdom
// Passage på planerad väg genom en förbjuden yta (Martin 2026-10-28, Skälviken: basvägen genom Vidas Hänsyn 6) — i samma hook som sidan kör.
// Reglerna provas i lib/larm/passage.test.ts; här provas kopplingen: sidans basväg/stickväg → "på vägen" → raden i stället för kort och ljud.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useKorvyLarm, type KorvyLarmIn, type KorvyLarmUt } from './useKorvyLarm';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const M = 1 / 111320;
const POS = { lat: 56.5, lon: 14.7 };
const L = M / Math.cos(POS.lat * Math.PI / 180);
const norr = (m: number) => POS.lat + m * M;
const ost = (m: number) => POS.lon + m * L;

function fakeDb() {
  return {
    from: () => {
      const q: any = {
        select: () => q, eq: () => q,
        upsert: async () => ({ error: null }),
        then: (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej),
      };
      return q;
    },
  };
}

function ljudCtx() {
  const toner: number[] = [];
  const ctx: any = {
    currentTime: 0, state: 'running', destination: {},
    createOscillator: () => ({ type: '', frequency: { setValueAtTime: (f: number) => toner.push(f), exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }),
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
  };
  return { ctx, toner };
}

let root: Root; let ut: KorvyLarmUt;
function mount(inp: KorvyLarmIn) {
  function H({ p }: { p: KorvyLarmIn }) { ut = useKorvyLarm(p); return null; }
  const cont = document.createElement('div'); document.body.appendChild(cont); root = createRoot(cont);
  act(() => { root.render(<H p={inp} />); });
  return (p: KorvyLarmIn) => act(() => { root.render(<H p={p} />); });
}
const tom = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

// svgToLatLon: x → lat, y → lon. Ytan 100 × 100 m runt POS; vägen nord–syd `vagOst` meter öster om POS.
function bas(over: Partial<KorvyLarmIn> = {}): KorvyLarmIn {
  return {
    aktiv: true, pos: POS, markers: [], svgToLatLon: (x, y) => ({ lat: x, lon: y }), typNamn: () => 'Markering',
    egna: new Set(), vida: null, objektId: 'o1', forare: { id: 'A', namn: 'Martin' }, db: fakeDb(), ljudCtx: () => null, ...over,
  };
}
const zon = (zoneType: string, id = 10) => ({ id, isZone: true, zoneType, path: [
  { x: norr(-50), y: ost(-50) }, { x: norr(-50), y: ost(50) }, { x: norr(50), y: ost(50) }, { x: norr(50), y: ost(-50) },
] });
const vag = (vagOst: number, lineType = 'mainRoad', id = 20) => ({ id, isLine: true, lineType, path: [{ x: norr(-80), y: ost(vagOst) }, { x: norr(80), y: ost(vagOst) }] });
const vidaHansyn6 = { features: [{ type: 'Feature', properties: { _lager: 'L_TILLAGGSYTOR', _typ: 'hänsynsyta', TYP: '24', LOPNR: 6, FLBESKR: 'Kant mot vatten O' }, geometry: { type: 'Polygon', coordinates: [[
  [ost(-50), norr(-50)], [ost(50), norr(-50)], [ost(50), norr(50)], [ost(-50), norr(50)], [ost(-50), norr(-50)],
]] } }] };

let klocka = 1_000_000;
beforeEach(() => { document.body.innerHTML = ''; klocka += 60_000; vi.spyOn(Date, 'now').mockImplementation(() => klocka); });
afterEach(() => { vi.restoreAllMocks(); });

describe('useKorvyLarm — passage på planerad väg genom en förbjuden yta', () => {
  it('på basvägen inne i Vidas Hänsyn 6: raden "Passage genom Hänsyn 6", inget kort, inget ljud', async () => {
    const l = ljudCtx();
    mount(bas({ markers: [vag(3)], vida: vidaHansyn6, ljudCtx: () => l.ctx })); await tom();
    expect(ut.kort).toBeNull();
    expect(ut.passage).toMatchObject({ namn: 'Hänsyn 6', grupp: 'natur' });
    expect(l.toner).toHaveLength(0);
  });

  it('av vägen (20 m) men kvar i ytan: det stora kortet och ljudet', async () => {
    const l = ljudCtx();
    mount(bas({ markers: [vag(20)], vida: vidaHansyn6, ljudCtx: () => l.ctx })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'Hänsyn', forbjuden: true });
    expect(ut.passage).toBeNull();
    expect(l.toner.length).toBeGreaterThan(0);
  });

  it('kör av vägen under passagen: 9 m (inom hysteresen) räcker inte, 15 m ger kortet och ljudet', async () => {
    const l = ljudCtx();
    const m = [vag(3), zon('protected')];
    const rerender = mount(bas({ markers: m, ljudCtx: () => l.ctx })); await tom();
    expect(ut.passage?.namn).toBe('Hänsyn');
    rerender(bas({ pos: { lat: POS.lat, lon: ost(-6) }, markers: m, ljudCtx: () => l.ctx })); await tom();
    expect(ut.kort).toBeNull();
    expect(ut.passage).not.toBeNull();
    expect(l.toner).toHaveLength(0);
    rerender(bas({ pos: { lat: POS.lat, lon: ost(-12) }, markers: m, ljudCtx: () => l.ctx })); await tom();
    expect(ut.kort).toMatchObject({ forbjuden: true });
    expect(ut.passage).toBeNull();
    expect(l.toner.length).toBeGreaterThan(0);
  });

  it('kör in i ytan PÅ vägen från utsidan: inget ljud vid inkörningen', async () => {
    const l = ljudCtx();
    const m = [vag(3), zon('protected')];
    const rerender = mount(bas({ pos: { lat: norr(-70), lon: ost(3) }, markers: m, ljudCtx: () => l.ctx })); await tom();
    expect(ut.passage).toBeNull();
    rerender(bas({ pos: { lat: norr(-40), lon: ost(3) }, markers: m, ljudCtx: () => l.ctx })); await tom();
    expect(ut.kort).toBeNull();
    expect(ut.passage).not.toBeNull();
    expect(l.toner).toHaveLength(0);
  });

  it('stickväg räknas också som planerad väg', async () => {
    mount(bas({ markers: [vag(2, 'sideRoadYellow'), zon('protected')] })); await tom();
    expect(ut.kort).toBeNull();
    expect(ut.passage).not.toBeNull();
  });

  it('dike genom ytan är ingen planerad väg: fullt larm', async () => {
    mount(bas({ markers: [vag(2, 'ditch'), zon('protected')] })); await tom();
    expect(ut.kort).toMatchObject({ forbjuden: true });
    expect(ut.passage).toBeNull();
  });

  it('på vägen men ytan är Röd fara (Ej framkomlig): kortet och ljudet som förut', async () => {
    const l = ljudCtx();
    mount(bas({ markers: [vag(3), zon('noentry')], ljudCtx: () => l.ctx })); await tom();
    expect(ut.kort).toMatchObject({ grupp: 'fara', namn: 'Ej framkomlig' });
    expect(ut.passage).toBeNull();
    expect(l.toner.length).toBeGreaterThan(0);
  });

  it('körvyn av: ingen passage', async () => {
    mount(bas({ aktiv: false, markers: [vag(3), zon('protected')] })); await tom();
    expect(ut.passage).toBeNull();
  });
});
