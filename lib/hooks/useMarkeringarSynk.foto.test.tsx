// @vitest-environment jsdom
// Ångra efter Ta bort ger tillbaka markeringen MED sitt väntande foto. Den RIKTIGA fotokön (lib/markeringFotoKo, minneslager i jsdom) och den
// RIKTIGA markeringshooken mot en låtsasserver med nät som kan slås av. Sidans Ångra-rad = lib/borttagenKvitto (aterstallMarkering).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useRef, useState } from 'react';

const net = vi.hoisted(() => ({ online: true, rader: new Map<string, { objekt_id: string; marker_id: string; typ: string; data: any }>(), uppladdade: [] as string[] }));
const nyckel = (o: string, m: string) => `${o}/${m}`;

// Korta Ångra-tiden så testet inte väntar 7 s — städningen av fotot hänger på den (FOTO_STAD_MS = BORTTAGEN_MS + 2000).
vi.mock('@/lib/borttagenKvitto', async (orig) => ({ ...(await orig<typeof import('@/lib/borttagenKvitto')>()), BORTTAGEN_MS: 100 }));
vi.mock('../borttagenKvitto', async (orig) => ({ ...(await orig<typeof import('../borttagenKvitto')>()), BORTTAGEN_MS: 100 }));

vi.mock('@/lib/supabase', () => {
  const fel = { message: 'Failed to fetch' };
  const bygg = () => {
    const f: Record<string, any> = {}; const eq: Record<string, string> = {}; let inn: string[] | null = null; let kols = '';
    let op: 'select' | 'delete' | 'update' = 'select'; let nyData: any = null; let enda = false;
    const kor = async () => {
      if (!net.online) return { data: null, error: fel };
      const alla = Array.from(net.rader.values()).filter((r) => (!eq.objekt_id || r.objekt_id === eq.objekt_id) && (!eq.marker_id || r.marker_id === eq.marker_id) && (!inn || inn.includes(r.marker_id)));
      if (op === 'delete') { for (const r of alla) net.rader.delete(nyckel(r.objekt_id, r.marker_id)); return { data: null, error: null }; }
      if (op === 'update') { for (const r of alla) r.data = nyData; return { data: alla.map((r) => ({ marker_id: r.marker_id })), error: null }; }
      if (kols.includes('->>')) return { data: alla.map((r) => ({ marker_id: r.marker_id, andradTs: r.data.andradTs != null ? String(r.data.andradTs) : null, photoPath: r.data.photoPath ?? null, photoTs: r.data.photoTs != null ? String(r.data.photoTs) : null })), error: null };
      if (enda) return { data: alla[0] ? { data: alla[0].data } : null, error: null };
      return { data: alla.map((r) => ({ marker_id: r.marker_id, data: r.data })), error: null };
    };
    f.select = (k: string) => { kols = k; return f; };
    f.eq = (k: string, v: string) => { eq[k] = v; return f; };
    f.in = (_k: string, v: string[]) => { inn = v; return f; };
    f.delete = () => { op = 'delete'; return f; };
    f.update = (d: any) => { op = 'update'; nyData = d.data; return f; };
    f.maybeSingle = () => { enda = true; return f; };
    f.upsert = async (rader: any) => {
      if (!net.online) return { data: null, error: fel };
      for (const r of Array.isArray(rader) ? rader : [rader]) net.rader.set(nyckel(r.objekt_id, r.marker_id), { ...r });
      return { data: null, error: null };
    };
    f.then = (res: any, rej: any) => kor().then(res, rej);
    return f;
  };
  return { supabase: { from: bygg, storage: { from: () => ({ upload: async (sokvag: string) => { if (!net.online) return { error: { message: 'Failed to fetch' } }; net.uppladdade.push(sokvag); return { error: null }; } }) } } };
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const OBJ = 'objekt-1';
const MID = 1792073279866;
const mk = (id: number, extra: Record<string, any> = {}) => ({ id, type: 'wet', isMarker: true, x: 1, y: 2, comment: '', ...extra });
const flush = async (n = 12) => { for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve(); }); };
const vanta = async (ms: number) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); await flush(); };

let rot: Root | null = null; let behallare: HTMLElement | null = null;
type Api = { markers: any[]; set: (f: (p: any[]) => any[]) => void; h: ReturnType<typeof import('./useMarkeringarSynk').useMarkeringarSynk<any>> };

async function montera() {
  const { useMarkeringarSynk } = await import('./useMarkeringarSynk');
  const api: { current: Api | null } = { current: null };
  function Harness() {
    const [markers, setMarkers] = useState<any[]>([]);
    const [loaded, setLoaded] = useState(false);
    const refs = {
      persistedIds: useRef(new Set<string>()), persistedSnapshot: useRef(new Map<string, string>()), mergeChecked: useRef(new Set<string>()),
      objekt: useRef<string | undefined>(undefined), sparPagar: useRef(false), upptagen: useRef(false),
    };
    const h = useMarkeringarSynk<any>({
      objektId: OBJ, markers, markersLoaded: loaded, setMarkers, setMarkersLoaded: setLoaded, typAv: () => 'symbol',
      hamtaServer: async (id) => {
        if (!net.online) return null;
        return Array.from(net.rader.values()).filter((r) => r.objekt_id === id).map((r) => ({ marker_id: r.marker_id, data: r.data }));
      },
      refs,
    });
    api.current = { markers, set: (f) => setMarkers((p) => f(p)), h };
    return null;
  }
  behallare = document.createElement('div'); document.body.appendChild(behallare); rot = createRoot(behallare);
  await act(async () => { rot!.render(<Harness />); });
  await flush(30);
  return api;
}

beforeEach(() => { vi.resetModules(); net.online = true; net.rader.clear(); net.uppladdade = []; });
afterEach(async () => { await act(async () => { rot?.unmount(); }); behallare?.remove(); rot = null; });

const foto = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });
const fotoKvar = async () => (await (await import('@/lib/markeringFotoKo')).vantandeFotoNycklar()).has(nyckel(OBJ, String(MID)));
const ids = (a: { current: Api | null }) => a.current!.markers.map((m) => m.id);

/** Flygplansläge → symbol + foto → Ta bort. Ger markeringen så som Ångra-raden håller den. */
async function symbolMedFotoUtanNatSedanTaBort() {
  const { laggFotoIKo } = await import('@/lib/markeringFotoKo');
  const api = await montera();
  net.online = false;
  const m = mk(MID);
  await act(async () => { api.current!.set((p) => [...p, m]); });
  await vanta(50);
  await laggFotoIKo(OBJ, String(MID), foto());
  expect(await fotoKvar()).toBe(true);
  await act(async () => { api.current!.set((p) => p.filter((x) => x.id !== MID)); await api.current!.h.deleteMarker(MID); });
  await vanta(30);
  return { api, m };
}

describe('Ångra efter Ta bort ger tillbaka markeringen MED det väntande fotot', () => {
  it('foto utan nät → Ta bort → Ångra → fotot finns kvar och laddas upp när nätet kommer', async () => {
    const { aterstallMarkering } = await import('@/lib/borttagenKvitto');
    const { korMarkeringSynk } = await import('@/lib/markeringSynkKo');
    const { korFotoKo } = await import('@/lib/markeringFotoKo');
    const { api, m } = await symbolMedFotoUtanNatSedanTaBort();
    expect(ids(api)).toEqual([]);
    expect(await fotoKvar()).toBe(true);                       // Ta bort rör inte fotot direkt

    await act(async () => { api.current!.set((p) => aterstallMarkering(p, m)); });   // Ångra (inom raden)
    await vanta(2600);                                         // …och långt förbi FOTO_STAD_MS
    expect(ids(api)).toEqual([MID]);
    expect(await fotoKvar()).toBe(true);                       // fotot städades INTE

    net.online = true;                                         // nätet kommer tillbaka
    await act(async () => { await korMarkeringSynk(true); await korFotoKo(true); });
    await vanta(100);
    await act(async () => { await korFotoKo(true); });
    expect(net.rader.has(nyckel(OBJ, String(MID)))).toBe(true);                 // markeringen ligger på servern
    expect(net.uppladdade.length).toBe(1);                                      // fotot är uppladdat
    expect(net.rader.get(nyckel(OBJ, String(MID)))!.data.photoPath).toContain(String(MID));   // …och kopplat
    expect(await fotoKvar()).toBe(false);                      // kön är tom
  });

  it('kontroll: utan Ångra städas det väntande fotot när raden gått ut (men inte före)', async () => {
    const { api } = await symbolMedFotoUtanNatSedanTaBort();
    await vanta(500);
    expect(await fotoKvar()).toBe(true);                       // fortfarande inom Ångra-tiden + marginal
    await vanta(2000);
    expect(await fotoKvar()).toBe(false);                      // raden är borta → fotot städas
    expect(ids(api)).toEqual([]);
  });

  it('fotot kom upp MEDAN markeringen väntar på Ångra: den borttagna markeringen får photoPath → Ångra tappar inte filen', async () => {
    const { aterstallMarkering, medUppladdatFoto } = await import('@/lib/borttagenKvitto');
    const m = mk(MID);
    const med = medUppladdatFoto(m, { markerId: String(MID), sokvag: 'markering-foton/o/1.jpg', skapad: 123 });
    expect(med).toMatchObject({ id: MID, photoPath: 'markering-foton/o/1.jpg', photoTs: 123 });
    expect(medUppladdatFoto(m, { markerId: '999', sokvag: 'x', skapad: 1 })).toBe(m);   // en annan markerings foto rör den inte
    // …och sidan använder den i sin FOTO_UPPE_EVENT-hanterare
    const page = (await import('node:fs')).readFileSync((await import('node:path')).resolve(__dirname, '../../app/planering/page.tsx'), 'utf8');
    expect(page).toContain('setBorttagenKvitto((b) => (b ? { ...b, marker: medUppladdatFoto(b.marker, d) } : b))');
    // Ångra efter att fotot kommit upp: markeringen kommer tillbaka med photoPath
    expect(aterstallMarkering([], med)[0]).toMatchObject({ photoPath: 'markering-foton/o/1.jpg' });
  });
});
