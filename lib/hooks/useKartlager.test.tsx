// @vitest-environment jsdom
// Kartlagret per användare: Flygfoto som standard, valet sparas på kontot (medarbetare.kartlager via RPC satt_kartlager) och lokalt, och fungerar utan nät.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const db = vi.hoisted(() => ({
  session: { user: { id: 'u1' } } as any,
  konto: null as string | null,
  lasFel: false,
  rpcFel: false,
  rpc: [] as string[],
  lasningar: 0,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: db.session } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => { db.lasningar++; return db.lasFel ? { data: null, error: { message: 'offline' } } : { data: { kartlager: db.konto }, error: null }; },
        }),
      }),
    }),
    rpc: async (namn: string, args: any) => {
      if (db.rpcFel) throw new TypeError('Failed to fetch');
      db.rpc.push(`${namn}:${args.p_lager}`);
      db.konto = args.p_lager;
      return { data: true, error: null };
    },
  },
}));

import { useKartlager } from './useKartlager';
import { LOKAL_NYCKEL, type Kartlager } from '@/lib/kartlager';

let root: Root; let div: HTMLDivElement;
let nu: Kartlager; let valj: (v: Kartlager) => void;
function Prov() { const [l, v] = useKartlager(); nu = l; valj = v; return null; }
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
const montera = async () => { await act(async () => { root.render(<Prov />); }); await flush(); };
const lokal = () => { const r = localStorage.getItem(LOKAL_NYCKEL); return r ? JSON.parse(r) : null; };

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  db.session = { user: { id: 'u1' } }; db.konto = null; db.lasFel = false; db.rpcFel = false; db.rpc = []; db.lasningar = 0;
  div = document.createElement('div'); document.body.appendChild(div); root = createRoot(div);
});
afterEach(() => { act(() => root.unmount()); div.remove(); });

describe('useKartlager', () => {
  it('användare som aldrig valt får Flygfoto — och inget skrivs till kontot', async () => {
    await montera();
    expect(nu).toBe('satellite');
    expect(db.rpc).toEqual([]);
  });
  it('kontot har ett val: det visas och enhetens kopia följer', async () => {
    db.konto = 'terrain';
    await montera();
    expect(nu).toBe('terrain');
    expect(lokal()).toEqual({ val: 'terrain', osynkad: false, anvandarId: 'u1' });
  });
  it('byter användaren lager sparas det på kontot och lokalt, och gäller nästa gång (också på en annan enhet)', async () => {
    await montera();
    await act(async () => { valj('lantmateriet'); });
    await flush();
    expect(nu).toBe('lantmateriet');
    expect(db.rpc).toEqual(['satt_kartlager:lantmateriet']);
    expect(lokal()).toEqual({ val: 'lantmateriet', osynkad: false, anvandarId: 'u1' });
    // ny enhet: tom lokal lagring, kontot minns
    localStorage.clear();
    act(() => root.unmount());
    root = createRoot(div);
    await montera();
    expect(nu).toBe('lantmateriet');
  });
  it('utan nät: valet gäller direkt på enheten, ligger osynkat och skickas när nätet kommer tillbaka', async () => {
    await montera();
    db.rpcFel = true;
    await act(async () => { valj('osm'); });
    await flush();
    expect(nu).toBe('osm');
    expect(lokal()).toEqual({ val: 'osm', osynkad: true, anvandarId: 'u1' });
    expect(db.rpc).toEqual([]);
    db.rpcFel = false;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await flush();
    expect(db.rpc).toEqual(['satt_kartlager:osm']);
    expect(lokal()?.osynkad).toBe(false);
  });
  it('start utan nät: enhetens senaste val används (kontot kan inte läsas)', async () => {
    localStorage.setItem(LOKAL_NYCKEL, JSON.stringify({ val: 'terrain', osynkad: false, anvandarId: 'u1' }));
    db.lasFel = true;
    await montera();
    expect(nu).toBe('terrain');
  });
  it('osynkat val från förra sessionen vinner över kontot och skickas vid start', async () => {
    localStorage.setItem(LOKAL_NYCKEL, JSON.stringify({ val: 'osm', osynkad: true, anvandarId: 'u1' }));
    db.konto = 'terrain';
    await montera();
    expect(nu).toBe('osm');
    expect(db.rpc).toEqual(['satt_kartlager:osm']);
    expect(db.konto).toBe('osm');
  });
  it('delad enhet: förra användarens val följer inte med till en användare som aldrig valt', async () => {
    localStorage.setItem(LOKAL_NYCKEL, JSON.stringify({ val: 'terrain', osynkad: true, anvandarId: 'u-annan' }));
    await montera();
    expect(nu).toBe('satellite');
    expect(db.rpc).toEqual([]);   // den andras osynkade val skickas aldrig som mitt
  });
  it('första renderingen använder enhetens lokala val direkt (ingen blixt av fel lager)', async () => {
    localStorage.setItem(LOKAL_NYCKEL, JSON.stringify({ val: 'lantmateriet', osynkad: false, anvandarId: 'u1' }));
    db.lasFel = true;
    const sett: Kartlager[] = [];
    function Spana() { const [l] = useKartlager(); sett.push(l); return null; }
    await act(async () => { root.render(<Spana />); });
    expect(sett[0]).toBe('lantmateriet');
  });
  it('utan inloggning: valet sparas bara lokalt, kontot rörs aldrig', async () => {
    db.session = null;
    await montera();
    await act(async () => { valj('terrain'); });
    await flush();
    expect(nu).toBe('terrain');
    expect(db.rpc).toEqual([]);
    expect(db.lasningar).toBe(0);
    expect(lokal()).toEqual({ val: 'terrain', osynkad: true, anvandarId: null });
  });
  it('okänt lager ignoreras', async () => {
    await montera();
    await act(async () => { valj('hybrid' as any); });
    expect(nu).toBe('satellite');
  });
});
