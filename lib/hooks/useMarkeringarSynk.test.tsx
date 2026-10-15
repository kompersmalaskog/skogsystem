// @vitest-environment jsdom
// Planeringsvyns markeringar (lib/hooks/useMarkeringarSynk) i React, mot en låtsasserver med nät som kan slås av. Samma hook som sidan kör.
// IndexedDB finns inte i jsdom → minneslager (stängd app = ny montering över samma lager); det RIKTIGA lagret provas i webbläsare (se PR).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useRef, useState } from 'react';

const net = vi.hoisted(() => ({ paus: null as Promise<void> | null, online: true, rader: new Map<string, { objekt_id: string; marker_id: string; typ: string; data: any }>(), anrop: { upsert: 0, delete: 0, select: 0 } }));
const nyckel = (o: string, m: string) => `${o}/${m}`;

// Låtsas-klient med samma kedjor som koden använder: select/eq/in, upsert, delete/eq/eq.
vi.mock('@/lib/supabase', () => {
  const fel = { message: 'Failed to fetch' };
  const bygg = (table: string) => {
    const f: Record<string, any> = {}; const eq: Record<string, string> = {}; let inn: { kol: string; v: string[] } | null = null; let kols = ''; let op: 'select' | 'delete' = 'select';
    const kor = async () => {
      if (!net.online) return { data: null, error: fel };
      const alla = Array.from(net.rader.values()).filter((r) => (!eq.objekt_id || r.objekt_id === eq.objekt_id) && (!eq.marker_id || r.marker_id === eq.marker_id) && (!inn || inn.v.includes(r.marker_id)));
      if (op === 'delete') { net.anrop.delete++; for (const r of alla) net.rader.delete(nyckel(r.objekt_id, r.marker_id)); return { data: null, error: null }; }
      net.anrop.select++;
      if (kols.includes('->>')) return { data: alla.map((r) => ({ marker_id: r.marker_id, andradTs: r.data.andradTs != null ? String(r.data.andradTs) : null, photoPath: r.data.photoPath ?? null, photoTs: r.data.photoTs != null ? String(r.data.photoTs) : null })), error: null };
      return { data: alla.map((r) => ({ marker_id: r.marker_id, data: r.data })), error: null };
    };
    f.select = (k: string) => { kols = k; return f; };
    f.eq = (k: string, v: string) => { eq[k] = v; return f; };
    f.in = (k: string, v: string[]) => { inn = { kol: k, v }; return f; };
    f.delete = () => { op = 'delete'; return f; };
    f.upsert = async (rader: any) => {
      if (!net.online) return { data: null, error: fel };
      net.anrop.upsert++;
      for (const r of Array.isArray(rader) ? rader : [rader]) net.rader.set(nyckel(r.objekt_id, r.marker_id), { ...r });
      return { data: null, error: null };
    };
    f.then = (res: any, rej: any) => kor().then(res, rej);
    void table;
    return f;
  };
  return { supabase: { from: bygg, storage: { from: () => ({ upload: async () => ({ error: null }) }) } } };
});
vi.mock('@/lib/markeringFotoKo', () => ({ tomFotoForMarkering: vi.fn(async () => {}), korFotoKo: vi.fn(async () => {}) }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const OBJ = 'objekt-1';
const mk = (id: number, extra: Record<string, any> = {}) => ({ id, type: 'wet', isMarker: true, x: 1, y: 2, comment: '', ...extra });
const serverMed = (id: number, extra: Record<string, any> = {}) => net.rader.set(nyckel(OBJ, String(id)), { objekt_id: OBJ, marker_id: String(id), typ: 'symbol', data: mk(id, extra) });
const flush = async (n = 12) => { for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve(); }); };
const vanta = async (ms: number) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); await flush(); };

let rot: Root | null = null; let behallare: HTMLElement | null = null;
type Api = { markers: any[]; loaded: boolean; set: (f: (p: any[]) => any[]) => void; h: ReturnType<typeof import('./useMarkeringarSynk').useMarkeringarSynk<any>>; stamplar: boolean[] };

async function montera(objektId = OBJ) {
  const { useMarkeringarSynk } = await import('./useMarkeringarSynk');
  const api: { current: Api | null } = { current: null };
  function Harness() {
    const [markers, setMarkers] = useState<any[]>([]);
    const [loaded, setLoaded] = useState(false);
    const refs = {
      persistedIds: useRef(new Set<string>()), persistedSnapshot: useRef(new Map<string, string>()), mergeChecked: useRef(new Set<string>()),
      objekt: useRef<string | undefined>(undefined), sparPagar: useRef(false), upptagen: useRef(false),
    };
    const stamplar = useRef<boolean[]>([]);
    const h = useMarkeringarSynk<any>({
      objektId, markers, markersLoaded: loaded, setMarkers, setMarkersLoaded: setLoaded, typAv: () => 'symbol',
      hamtaServer: async (id) => {
        if (net.paus) await net.paus;   // testet kan hålla hämtningen "på väg"
        if (!net.online) return null;
        return Array.from(net.rader.values()).filter((r) => r.objekt_id === id).map((r) => ({ marker_id: r.marker_id, data: r.data }));
      },
      refs, onHamtad: ({ farsk }) => { stamplar.current.push(farsk); },
    });
    api.current = { markers, loaded, set: (f) => setMarkers((p) => f(p)), h, stamplar: stamplar.current };
    return null;
  }
  behallare = document.createElement('div'); document.body.appendChild(behallare); rot = createRoot(behallare);
  await act(async () => { rot!.render(<Harness />); });
  await flush(30);
  return api;
}
const avmontera = async () => { await act(async () => { rot?.unmount(); }); behallare?.remove(); rot = null; };

beforeEach(() => { vi.resetModules(); net.online = true; net.rader.clear(); net.anrop = { upsert: 0, delete: 0, select: 0 }; });
afterEach(async () => { await avmontera().catch(() => {}); });

const ids = (a: { current: Api | null }) => a.current!.markers.map((m) => m.id).sort((x, y) => x - y);

describe('Martins fall: flygplansläge → symbol → nät på', () => {
  it('symbolen LIGGER KVAR när sidan hämtar från servern vid återanslutning — och synkas', async () => {
    serverMed(10);
    const api = await montera();
    expect(ids(api)).toEqual([10]);
    net.online = false;                                                           // flygplansläge
    await act(async () => { api.current!.set((p) => [...p, mk(1792073279866)]); });
    await vanta(50);                                                              // lokalt sparad direkt, inget gick ut
    expect(net.anrop.upsert).toBe(0);
    // nätet kommer tillbaka: appen blir synlig → sidan hämtar (refetch) — FÖRE hämtningen skickas det som väntar
    net.online = true;
    await act(async () => { await api.current!.h.refetch(true); });
    await flush(20);
    expect(ids(api)).toEqual([10, 1792073279866]);                                // symbolen försvann INTE
    expect(net.rader.has(nyckel(OBJ, '1792073279866'))).toBe(true);               // och ligger på servern
  });

  it('hämtningen misslyckas (ingen täckning) → symbolen ligger kvar i det som visas och nuvarande data behålls', async () => {
    serverMed(10);
    const api = await montera();
    net.online = false;
    await act(async () => { api.current!.set((p) => [...p, mk(2)]); });
    await vanta(50);
    await act(async () => { await api.current!.h.refetch(true); });
    await flush();
    expect(ids(api)).toEqual([2, 10]);
  });

  it('5 markeringar utan täckning → appen stängs helt → öppnas offline: de syns → nät på: de synkas', async () => {
    const api = await montera();
    net.online = false;
    await act(async () => { api.current!.set((p) => [...p, ...[1, 2, 3, 4, 5].map((i) => mk(i))]); });
    await vanta(50);
    await avmontera();                                                            // appen stängs helt
    const api2 = await montera();                                                 // öppnas igen, fortfarande utan nät
    expect(ids(api2)).toEqual([1, 2, 3, 4, 5]);
    expect(net.rader.size).toBe(0);
    net.online = true;
    await act(async () => { await api2.current!.h.refetch(true); });
    await flush(20);
    expect(Array.from(net.rader.keys()).sort()).toEqual([1, 2, 3, 4, 5].map((i) => nyckel(OBJ, String(i))));
    expect(ids(api2)).toEqual([1, 2, 3, 4, 5]);
  });

  it('serverns senast sparade bild visas när trakten öppnas utan nät (tillsammans med det som väntar)', async () => {
    serverMed(10); serverMed(11);
    const api = await montera();                                                  // online: bilden sparas
    expect(ids(api)).toEqual([10, 11]);
    await avmontera();
    net.online = false;
    const api2 = await montera();
    expect(ids(api2)).toEqual([10, 11]);
    expect(api2.current!.stamplar.at(-1)).toBe(false);                            // inte "uppdaterad nu"
  });
});

describe('ändringar och borttagningar', () => {
  it('en ändring som görs MEDAN hämtningen pågår ersätts inte av serverns version (den skrivs lokalt före sammanfogningen)', async () => {
    serverMed(10, { comment: 'server' });
    const api = await montera();
    let slapp!: () => void;
    net.paus = new Promise<void>((r) => { slapp = r; });
    let r!: Promise<void>;
    await act(async () => { r = api.current!.h.refetch(true); await Promise.resolve(); });          // hämtningen är på väg (servern har inte svarat)
    await act(async () => { api.current!.set((m) => m.map((x) => (x.id === 10 ? { ...x, comment: 'skriven under hämtningen' } : x))); });
    net.paus = null;
    await act(async () => { slapp(); await r; });
    await flush(20);
    expect(api.current!.markers.find((m) => m.id === 10).comment).toBe('skriven under hämtningen');
  });

  it('en radering utan täckning återuppstår inte när servern hämtas medan den väntar; när nätet kommer går DELETE ut', async () => {
    serverMed(10); serverMed(11);
    const api = await montera();
    net.online = false;
    await act(async () => { api.current!.set((p) => p.filter((m) => m.id !== 10)); await api.current!.h.deleteMarker(10); });
    await vanta(30);
    await act(async () => { await api.current!.h.refetch(true); });
    expect(ids(api)).toEqual([11]);
    net.online = true;
    await act(async () => { await api.current!.h.refetch(true); });
    await flush(20);
    expect(ids(api)).toEqual([11]);
    expect(net.rader.has(nyckel(OBJ, '10'))).toBe(false);
  });

  it('KROCK mellan enheter: en nyare serverversion (annan enhet) vinner över min äldre lokala ändring', async () => {
    serverMed(10, { comment: 'original' });
    const api = await montera();
    net.online = false;
    await act(async () => { api.current!.set((p) => p.map((m) => (m.id === 10 ? { ...m, comment: 'min ändring' } : m))); });
    await vanta(600);                                                             // debouncen skriver lokalt
    // annan enhet ändrar senare:
    net.rader.set(nyckel(OBJ, '10'), { objekt_id: OBJ, marker_id: '10', typ: 'symbol', data: mk(10, { comment: 'annan enhet', andradTs: Date.now() + 60_000 }) });
    net.online = true;
    await act(async () => { await api.current!.h.refetch(true); });
    await flush(20);
    expect(api.current!.markers.find((m) => m.id === 10).comment).toBe('annan enhet');
    expect(net.rader.get(nyckel(OBJ, '10'))!.data.comment).toBe('annan enhet');
  });

  it('en kommentar som ändras skrivs lokalt efter kort stillhet och skickas när nätet finns', async () => {
    serverMed(10);
    const api = await montera();
    await act(async () => { api.current!.set((p) => p.map((m) => (m.id === 10 ? { ...m, comment: 'ny text' } : m))); });
    await vanta(700);
    await act(async () => { await api.current!.h.refetch(true); });
    await flush(20);
    expect(net.rader.get(nyckel(OBJ, '10'))!.data.comment).toBe('ny text');
  });

  it('en markering som tas bort och kommer tillbaka (Ångra/undo) räknas som NY och sparas igen', async () => {
    serverMed(10);
    const api = await montera();
    const m10 = api.current!.markers.find((m) => m.id === 10);
    await act(async () => { api.current!.set((p) => p.filter((m) => m.id !== 10)); await api.current!.h.deleteMarker(10); });
    await vanta(30);
    await act(async () => { api.current!.set((p) => [...p, m10]); });
    await vanta(700);
    await act(async () => { await api.current!.h.refetch(true); });
    await flush(20);
    expect(ids(api)).toEqual([10]);
    expect(net.rader.has(nyckel(OBJ, '10'))).toBe(true);
  });
});
