// @vitest-environment jsdom
// useRitadKarta mot en låtsaskarta: inget hämtas förrän Ritad väljs, grunden läggs utan objekt, skogen per objekt, körvyn platt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const { fetchMock, grans } = vi.hoisted(() => ({ fetchMock: vi.fn(), grans: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { vo_nummer: '111', typ: 'slutavverkning' }, error: null }) }) }) }) },
}));
vi.mock('@/lib/egenkontrollOrigo', () => ({ lasVidaGrans: (...a: any[]) => grans(...a) }));
vi.mock('@/lib/egenkontroll', () => ({ hamtaStammoln: async () => ({ punkter: [] }) }));
vi.mock('@/lib/ritadKarta/bygg', () => ({
  byggRitat: () => ({ url: 'data:image/png;base64,AA', horn: [[0, 1], [1, 1], [1, 0], [0, 0]], trad: [], avverkade: 0, kronor: [] }),
}));
vi.mock('@/lib/ritadKarta/stil', async (orig) => ({ ...(await orig() as any), ritaGran: () => null }));

import { useRitadKarta, ritadStatusText } from './useRitadKarta';
import { RITAD_ID } from '@/lib/ritadKarta/lager';

function fakeKarta() {
  const lager = new Map<string, any>(); const kallor = new Map<string, any>(); const synlig = new Map<string, string>();
  const lyss = new Map<string, Set<() => void>>();
  let pitch = 0;
  return {
    lager, kallor, synlig,
    addLayer: (l: any) => { lager.set(l.id, l); synlig.set(l.id, l.layout?.visibility ?? 'visible'); },
    removeLayer: (id: string) => { lager.delete(id); synlig.delete(id); },
    getLayer: (id: string) => lager.get(id),
    addSource: (id: string, k: any) => kallor.set(id, { ...k, setData: vi.fn() }),
    removeSource: (id: string) => kallor.delete(id),
    getSource: (id: string) => kallor.get(id),
    hasImage: () => true, addImage: vi.fn(),
    setLayoutProperty: (id: string, _p: string, v: string) => synlig.set(id, v),
    setPaintProperty: vi.fn(),
    getPitch: () => pitch,
    satPitch: (p: number) => { pitch = p; for (const f of lyss.get('pitch') ?? []) f(); },
    on: (t: string, f: () => void) => { if (!lyss.has(t)) lyss.set(t, new Set()); lyss.get(t)!.add(f); },
    off: (t: string, f: () => void) => lyss.get(t)?.delete(f),
  };
}

const PAINT = { 'raster-brightness-max': 1 };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function renderHook<P, R>(fn: (p: P) => R, opt?: { initialProps: P }) {
  const result = { current: undefined as unknown as R };
  const el = document.createElement('div');
  const root = createRoot(el);
  const Comp = ({ p }: { p: P }) => { result.current = fn(p); return null; };
  act(() => root.render(<Comp p={opt?.initialProps as P} />));
  return { result, rerender: (p: P) => act(() => root.render(<Comp p={p} />)), unmount: () => act(() => root.unmount()) };
}
async function waitFor(f: () => void, ms = 2000) {
  const slut = Date.now() + ms;
  for (;;) {
    try { f(); return; } catch (e) { if (Date.now() > slut) throw e; }
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
}

let laserSvar: any, markSvar: any;
beforeEach(() => {
  fetchMock.mockReset(); grans.mockReset();
  laserSvar = { ok: true, json: async () => ({ minX: 0, maxY: 0, bredd: 1, hojd: 1, hojdDm: [100], ar: 2021 }) };
  markSvar = { ok: true, json: async () => ({ minX: 0, maxY: 0, bredd: 2, hojd: 2, rutaM: 5, fukt: 'AAECAA==', lutning: 'AB4eHg==', skugga: null, fel: [] }) };
  fetchMock.mockImplementation(async (url: string) => (String(url).includes('/mark') ? markSvar : laserSvar));
  grans.mockResolvedValue({ typ: 'ok', ringar: [[[15, 56], [15.01, 56], [15.01, 56.01], [15, 56]]] });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const laserAnrop = () => fetchMock.mock.calls.find((c: any[]) => String(c[0]).includes('/laser'))!;

describe('useRitadKarta', () => {
  it('inget läggs till och inget hämtas förrän Ritad väljs', async () => {
    const m = fakeKarta();
    const { result } = renderHook(() => useRitadKarta({ map: m, klar: true, vald: false, objektId: 'o1', skogPaint: PAINT }));
    await act(async () => {});
    expect(m.lager.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.typ).toBe('av');
  });

  it('utan objekt: grunden syns ändå, ingen laserdata hämtas', async () => {
    const m = fakeKarta();
    const { result } = renderHook(() => useRitadKarta({ map: m, klar: true, vald: true, objektId: null, skogPaint: PAINT }));
    await waitFor(() => expect(m.synlig.get(RITAD_ID.bakgrund)).toBe('visible'));
    expect(m.synlig.get('ritad-vag')).toBe('visible');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ritadStatusText(result.current)).toBe('Skogen ritas när ett objekt är öppet');
  });

  it('med objekt: skogen läggs på och statusen säger laserskanningens år', async () => {
    const m = fakeKarta();
    const { result } = renderHook(() => useRitadKarta({ map: m, klar: true, vald: true, objektId: 'o2', skogPaint: PAINT }));
    await waitFor(() => expect(result.current.typ).toBe('klar'));
    await waitFor(() => expect(m.synlig.get(RITAD_ID.skog)).toBe('visible'));
    expect(ritadStatusText(result.current)).toMatch(/^Skogen ur laserskanningen 2021( ·|$)/);
  });

  it('kartan är platt överallt: ingen 3D-skog och inga trädsymboler, också när kartan lutas', async () => {
    const m = fakeKarta();
    renderHook(() => useRitadKarta({ map: m, klar: true, vald: true, objektId: 'o3', skogPaint: PAINT }));
    await waitFor(() => expect(m.synlig.get(RITAD_ID.skog)).toBe('visible'));
    act(() => m.satPitch(60));
    expect([...m.lager.values()].some((l) => l.type === 'fill-extrusion')).toBe(false);
    expect([...m.lager.values()].some((l) => l.type === 'symbol')).toBe(false);
  });

  it('traktgränsens röda tona släcks medan Ritad är vald och kommer tillbaka efteråt', async () => {
    const m = fakeKarta() as any;
    m.addLayer({ id: 'grans-fill', type: 'fill' });
    const paint = new Map<string, unknown>([['grans-fill', 0.05]]);
    m.getPaintProperty = (id: string) => paint.get(id);
    m.setPaintProperty = (id: string, _p: string, v: unknown) => paint.set(id, v);
    const { rerender } = renderHook((p: { vald: boolean }) => useRitadKarta({ map: m, klar: true, vald: p.vald, objektId: 'o11', skogPaint: PAINT }), { initialProps: { vald: true } });
    await waitFor(() => expect(paint.get('grans-fill')).toBe(0));
    rerender({ vald: false });
    await waitFor(() => expect(paint.get('grans-fill')).toBe(0.05));
  });

  it('väljs ett annat kartlager göms allt igen', async () => {
    const m = fakeKarta();
    const { rerender } = renderHook((p: { vald: boolean }) => useRitadKarta({ map: m, klar: true, vald: p.vald, objektId: 'o5', skogPaint: PAINT }), { initialProps: { vald: true } });
    await waitFor(() => expect(m.synlig.get(RITAD_ID.skog)).toBe('visible'));
    rerender({ vald: false });
    await waitFor(() => expect(m.synlig.get(RITAD_ID.bakgrund)).toBe('none'));
    expect(m.synlig.get(RITAD_ID.skog)).toBe('none');
  });

  it('ingen traktgräns från Vida: grunden syns och raden säger varför — ingen gissad skog', async () => {
    grans.mockResolvedValue({ typ: 'saknas' });
    const m = fakeKarta();
    const { result } = renderHook(() => useRitadKarta({ map: m, klar: true, vald: true, objektId: 'o6', skogPaint: PAINT }));
    await waitFor(() => expect(result.current.typ).toBe('ingen-grans'));
    expect(m.lager.has(RITAD_ID.skog)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ritadStatusText(result.current)).toContain('bara vägar och vatten');
  });

  it('ingen Vida-gräns men en egen ritad: skogen ritas runt den egna gränsen', async () => {
    grans.mockResolvedValue({ typ: 'saknas' });
    const egen = [[[15, 56], [15.01, 56], [15.01, 56.01], [15, 56]]] as any;
    const m = fakeKarta();
    const { result } = renderHook(() => useRitadKarta({ map: m, klar: true, vald: true, objektId: 'o8', skogPaint: PAINT, egnaRingar: egen }));
    await waitFor(() => expect(result.current.typ).toBe('klar'));
    expect(JSON.parse(laserAnrop()[1].body).ringar).toEqual(egen);
    expect(ritadStatusText(result.current)).toMatch(/^Skogen ur laserskanningen 2021 · runt din traktgräns/);
  });

  it('ingen gräns alls men en punkt: en ruta runt objektets punkt, och raden säger det', async () => {
    grans.mockResolvedValue({ typ: 'saknas' });
    const m = fakeKarta();
    const { result } = renderHook(() => useRitadKarta({ map: m, klar: true, vald: true, objektId: 'o9', skogPaint: PAINT, egnaRingar: [], punkt: { lat: 56.9, lng: 15.2 } }));
    await waitFor(() => expect(result.current.typ).toBe('klar'));
    const ring = JSON.parse(laserAnrop()[1].body).ringar[0];
    expect(ring).toHaveLength(5);
    expect(ritadStatusText(result.current)).toContain('1 km runt objektet');
  });

  it('Vidas gräns går före den egna', async () => {
    const m = fakeKarta();
    const egen = [[[16, 57], [16.01, 57], [16.01, 57.01], [16, 57]]] as any;
    const { result } = renderHook(() => useRitadKarta({ map: m, klar: true, vald: true, objektId: 'o10', skogPaint: PAINT, egnaRingar: egen }));
    await waitFor(() => expect(result.current.typ).toBe('klar'));
    expect(JSON.parse(laserAnrop()[1].body).ringar[0][0]).toEqual([15, 56]);
    expect(ritadStatusText(result.current)).toMatch(/^Skogen ur laserskanningen 2021( ·|$)/);
  });

  it('blött och brant hämtas med skogen; faller de ritas skogen ändå och raden säger vad som saknas', async () => {
    markSvar = { ok: false, json: async () => ({ error: 'nej' }) };
    const m = fakeKarta();
    const { result } = renderHook(() => useRitadKarta({ map: m, klar: true, vald: true, objektId: 'o12', skogPaint: PAINT }));
    await waitFor(() => expect(result.current.typ).toBe('klar'));
    expect(fetchMock.mock.calls.some((c: any[]) => String(c[0]).includes('/api/ritad-karta/mark'))).toBe(true);
    expect(ritadStatusText(result.current)).toBe('Skogen ur laserskanningen 2021 · blött och brant kunde inte hämtas');
    expect(m.lager.has(RITAD_ID.brant)).toBe(true);
  });

  it('laserdatan kunde inte hämtas: felet sägs och nästa öppning försöker igen', async () => {
    const bra = laserSvar;
    laserSvar = { ok: false, json: async () => ({ error: 'Skogsstyrelsen svarar inte' }) };
    const m = fakeKarta();
    const { result, unmount } = renderHook(() => useRitadKarta({ map: m, klar: true, vald: true, objektId: 'o7', skogPaint: PAINT }));
    await waitFor(() => expect(result.current.typ).toBe('fel'));
    expect(ritadStatusText(result.current)).toBe('Skogsstyrelsen svarar inte — bara vägar och vatten');
    laserSvar = bra;
    unmount();
    const m2 = fakeKarta();
    const r2 = renderHook(() => useRitadKarta({ map: m2, klar: true, vald: true, objektId: 'o7', skogPaint: PAINT }));
    await waitFor(() => expect(r2.result.current.typ).toBe('klar'));
  });
});
