// @vitest-environment jsdom
// "Nytt från …" end-to-end utan webbläsare: TVÅ skärmar (skördarens och skotarens körvy) kör de RIKTIGA hookarna (useMarkeringarSynk + useNyttFranPlaneraren) mot samma låtsasserver.
// Skördaren sparar en symbol → den stämplas med vem som sparade → skotaren får raden med förarens namn, skördarens egen skärm får ingen. Maskinkonto utan upplåst förare → maskinens namn.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useRef, useState } from 'react';

const net = vi.hoisted(() => ({ rader: new Map<string, { objekt_id: string; marker_id: string; typ: string; data: any }>() }));
const nyckel = (o: string, m: string) => `${o}/${m}`;

vi.mock('@/lib/supabase', () => {
  const bygg = () => {
    const eq: Record<string, string> = {}; let kols = ''; let op: 'select' | 'delete' = 'select'; const f: Record<string, any> = {};
    const kor = async () => {
      const alla = Array.from(net.rader.values()).filter((r) => (!eq.objekt_id || r.objekt_id === eq.objekt_id) && (!eq.marker_id || r.marker_id === eq.marker_id));
      if (op === 'delete') { for (const r of alla) net.rader.delete(nyckel(r.objekt_id, r.marker_id)); return { data: null, error: null }; }
      if (kols.includes('->>')) return { data: alla.map((r) => ({ marker_id: r.marker_id, andradTs: r.data.andradTs != null ? String(r.data.andradTs) : null, photoPath: r.data.photoPath ?? null, photoTs: r.data.photoTs != null ? String(r.data.photoTs) : null })), error: null };
      return { data: alla.map((r) => ({ marker_id: r.marker_id, data: r.data })), error: null };
    };
    f.select = (k: string) => { kols = k; return f; };
    f.eq = (k: string, v: string) => { eq[k] = v; return f; };
    f.in = () => f; f.delete = () => { op = 'delete'; return f; };
    f.upsert = async (rader: any) => { for (const r of Array.isArray(rader) ? rader : [rader]) net.rader.set(nyckel(r.objekt_id, r.marker_id), { ...r }); return { data: null, error: null }; };
    f.then = (res: any, rej: any) => kor().then(res, rej);
    return f;
  };
  return { supabase: { from: bygg, storage: { from: () => ({ upload: async () => ({ error: null }) }) } } };
});
vi.mock('@/lib/markeringFotoKo', () => ({ tomFotoForMarkering: vi.fn(async () => {}), korFotoKo: vi.fn(async () => {}) }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const OBJ = 'objekt-1';
const flush = async (n = 12) => { for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve(); }); };
const vanta = async (ms: number) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); await flush(); };
const svg = (x: number, y: number) => ({ lat: 57 + y / 1e5, lon: 15 + x / 1e5 });

type Skarm = { h: any; nytt: any; set: (f: (p: any[]) => any[]) => void };
const roter: Root[] = [];

async function montera(minId: string, forfattare: { id: string; namn: string }): Promise<{ current: Skarm | null }> {
  const { useMarkeringarSynk } = await import('./useMarkeringarSynk');
  const { useNyttFranPlaneraren } = await import('./useNyttFranPlaneraren');
  const { markeringPlats } = await import('../nyttFranPlaneraren');
  const api: { current: Skarm | null } = { current: null };
  function Harness() {
    const [markers, setMarkers] = useState<any[]>([]);
    const [loaded, setLoaded] = useState(false);
    const refs = { persistedIds: useRef(new Set<string>()), persistedSnapshot: useRef(new Map<string, string>()), mergeChecked: useRef(new Set<string>()), objekt: useRef<string | undefined>(undefined), sparPagar: useRef(false), upptagen: useRef(false) };
    const hamtadRef = useRef<(m: readonly any[], farsk: boolean) => void>(() => {});
    const h = useMarkeringarSynk<any>({
      objektId: OBJ, markers, markersLoaded: loaded, setMarkers, setMarkersLoaded: setLoaded, typAv: () => 'symbol', forfattare: () => forfattare,
      hamtaServer: async (id) => Array.from(net.rader.values()).filter((r) => r.objekt_id === id).map((r) => ({ marker_id: r.marker_id, data: r.data })),
      refs, onHamtad: ({ markers: m, farsk }) => { hamtadRef.current(m, farsk); },
    });
    const nytt = useNyttFranPlaneraren({ objektId: OBJ, aktiv: true, minId, kommentarer: [], kommentarerLaddad: true, markeringPlats: (m) => markeringPlats(m, svg), nyckelPlats: () => null, pos: { lat: 57, lon: 15 }, onVisa: () => {} });
    hamtadRef.current = nytt.hamtadMarkeringar;
    api.current = { h, nytt, set: (f) => setMarkers((p) => f(p)) };
    return null;
  }
  const c = document.createElement('div'); document.body.appendChild(c); const r = createRoot(c); roter.push(r);
  await act(async () => { r.render(<Harness />); });
  await flush(30);
  return api;
}

beforeEach(() => { vi.resetModules(); document.body.innerHTML = ''; net.rader.clear(); });
afterEach(async () => { for (const r of roter.splice(0)) { try { await act(async () => { r.unmount(); }); } catch { /* */ } } });

describe('Nytt från … mellan två körvyer', () => {
  it('skördaren (Stefan har låst upp) lägger till en symbol → skotaren får raden med Stefan, skördarens egen skärm får ingen', async () => {
    const skordare = await montera('maskin-giant', { id: 'maskin-giant', namn: 'Stefan' });
    const skotare = await montera('maskin-wisent', { id: 'maskin-wisent', namn: 'Daniel' });
    await act(async () => { await skotare.current!.h.refetch(true); }); await flush();   // skotarens baslinje
    expect(skotare.current!.nytt.rad).toBeNull();

    await act(async () => { skordare.current!.set((p) => [...p, { id: 1001, isMarker: true, type: 'wet', x: 0, y: 72, comment: '' }]); });
    await vanta(150);   // lokalt sparad + skickad av kön
    const lagrad = Array.from(net.rader.values()).find((r) => r.marker_id === '1001');
    expect(lagrad?.data).toMatchObject({ andradAv: 'maskin-giant', andradAvNamn: 'Stefan' });

    await act(async () => { await skotare.current!.h.refetch(true); }); await flush();   // realtime-händelsen → hämtning
    expect(skotare.current!.nytt.rad?.text).toBe('Nytt från Stefan: Fuktig mark, 80 m');
    await act(async () => { await skordare.current!.h.refetch(true); }); await flush();
    expect(skordare.current!.nytt.rad).toBeNull();
  });

  it('maskinkonto utan vald förare → "Nytt från H8E -26"', async () => {
    const a = await montera('maskin-h8', { id: 'maskin-h8', namn: 'H8E -26' });
    const b = await montera('maskin-wisent', { id: 'maskin-wisent', namn: 'Daniel' });
    await act(async () => { await b.current!.h.refetch(true); }); await flush();
    await act(async () => { a.current!.set((p) => [...p, { id: 2002, isMarker: true, type: 'warning', x: 0, y: 0, comment: 'Torrträd' }]); });
    await vanta(150);
    await act(async () => { await b.current!.h.refetch(true); }); await flush();
    expect(b.current!.nytt.rad).toMatchObject({ text: 'Nytt från H8E -26: Varning – Torrträd, 10 m', ton: 'fara' });
  });

  it('utan forfattare skrivs markeringen som förut (ingen stämpel)', async () => {
    const { useMarkeringarSynk } = await import('./useMarkeringarSynk');
    void useMarkeringarSynk;
    const a = await montera('x', { id: '', namn: 'Z' });   // id tomt → ingen andradAv, men namn
    await act(async () => { a.current!.set((p) => [...p, { id: 3003, isMarker: true, type: 'wet', x: 0, y: 0, comment: '' }]); });
    await vanta(150);
    const data = Array.from(net.rader.values()).find((r) => r.marker_id === '3003')?.data;
    expect(data.andradAv).toBeUndefined();
    expect(data.andradAvNamn).toBe('Z');
  });
});
