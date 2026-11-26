// @vitest-environment jsdom
// VIKTIGT i kommentarerna, med och utan migrationen (kolumnen kartkommentar.viktigt): samma hook som sidan kör, mot en låtsasdatabas som kan sakna kolumnen.
// Före migrationen får ingenting försvinna: kommentarerna läses som förut, Viktigt-fältet göms, en vanlig kommentar sparas, och en Viktigt-rad som ändå skrivits väntar i kön
// (aldrig bort, aldrig utan Viktigt) tills kolumnen finns.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useKartkommentarer, type KartkommentarerUt } from './useKartkommentarer';
import { antalVantande, korKartkommentarKo, lasKo, nollstallKartkommentarKo, sattKartkommentarAuto, type KoDb } from '../kartkommentarKo';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Rad = { id: string; objekt_id: string; yta_nyckel: string; text: string; viktigt?: string | null; skapad_av: string; skapad_at: string; andrad_at: string };

function fakeDb(state: { kolumn: boolean }) {
  const rader: Rad[] = [];
  const anrop: { op: string; arg?: any }[] = [];
  let t = Date.parse('2026-11-23T08:00:00Z');
  const saknas = (m: string) => ({ code: m === 'select' ? '42703' : 'PGRST204', message: m === 'select' ? 'column kartkommentar.viktigt does not exist' : "Could not find the 'viktigt' column of 'kartkommentar' in the schema cache" });
  const db: KoDb = {
    from: () => {
      const q: any = {
        select: (kol: string) => { q._kol = kol; return q; },
        in: () => q, order: () => q,
        insert: async (r: any) => {
          anrop.push({ op: 'insert', arg: r });
          if ('viktigt' in r && !state.kolumn) return { error: saknas('skriv') };
          t += 60_000; rader.push({ ...r, skapad_at: new Date(t).toISOString(), andrad_at: new Date(t).toISOString() }); return { error: null };
        },
        update: (v: any) => ({ eq: (_k: string, id: string) => {
          anrop.push({ op: 'update', arg: v });
          const fel = 'viktigt' in v && !state.kolumn ? saknas('skriv') : null;
          const rad = rader.find((x) => x.id === id);
          if (rad && !fel) Object.assign(rad, v);
          const res = { error: fel, data: fel ? null : rad ? [{ id }] : [] };
          const p: any = Promise.resolve(res); p.select = () => Promise.resolve(res); return p;
        } }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        then: (res: any, rej: any) => {
          const fel = String(q._kol).includes('viktigt') && !state.kolumn ? saknas('select') : null;
          return Promise.resolve(fel ? { data: null, error: fel } : { data: rader.map((r) => ({ ...r, medarbetare: { namn: 'Martin Hjert' } })), error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
  return { db, rader, anrop };
}

let u: KartkommentarerUt;
function montera(db: KoDb) {
  function H() { u = useKartkommentarer({ objektId: 'o1', minId: 'm1', minNamn: 'Martin Hjert', db }); return null; }
  const c = document.createElement('div'); document.body.appendChild(c);
  act(() => { createRoot(c).render(<H />); });
}
const tom = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

beforeEach(() => { document.body.innerHTML = ''; nollstallKartkommentarKo(); sattKartkommentarAuto(false); localStorage.clear(); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); });

describe('useKartkommentarer — Viktigt', () => {
  it('med kolumnen: en kommentar med bara Viktigt sparas och visas, och fältet får användas (viktigtStod)', async () => {
    const f = fakeDb({ kolumn: true });
    montera(f.db); await tom();
    expect(u.viktigtStod).toBe(true);
    act(() => { u.lagg('hansyn:1', '', '  Gå inte över bäcken  '); });
    await act(async () => { await korKartkommentarKo(true, f.db); });
    await tom();
    expect(f.anrop[0].arg).toMatchObject({ yta_nyckel: 'hansyn:1', text: '', viktigt: 'Gå inte över bäcken' });
    expect(u.rader[0]).toMatchObject({ viktigt: 'Gå inte över bäcken', text: '' });
    expect(antalVantande()).toBe(0);
  });

  it('en kommentar utan något av fälten sparas inte', async () => {
    const f = fakeDb({ kolumn: true });
    montera(f.db); await tom();
    act(() => { u.lagg('hansyn:1', '   ', '  '); });
    expect(lasKo()).toHaveLength(0);
  });

  it('ändra bara Övrigt skickar inte Viktigt (kolumnen rörs inte)', async () => {
    const f = fakeDb({ kolumn: true });
    montera(f.db); await tom();
    act(() => { u.lagg('hansyn:1', 'Text', 'Rad'); });
    await act(async () => { await korKartkommentarKo(true, f.db); }); await tom();
    f.anrop.length = 0;
    act(() => { u.andra(u.rader[0].id, 'Ny text', 'Rad'); });   // Viktigt oförändrad
    await act(async () => { await korKartkommentarKo(true, f.db); });
    expect(f.anrop[0]).toMatchObject({ op: 'update', arg: { text: 'Ny text' } });
    expect(f.anrop[0].arg).not.toHaveProperty('viktigt');
  });

  it('ändra Viktigt (och ta bort den) skickas', async () => {
    const f = fakeDb({ kolumn: true });
    montera(f.db); await tom();
    act(() => { u.lagg('hansyn:1', 'Text', 'Rad'); });
    await act(async () => { await korKartkommentarKo(true, f.db); }); await tom();
    f.anrop.length = 0;
    act(() => { u.andra(u.rader[0].id, 'Text', 'Ny rad'); });
    await act(async () => { await korKartkommentarKo(true, f.db); }); await tom();
    expect(f.anrop[0].arg).toMatchObject({ text: 'Text', viktigt: 'Ny rad' });
    f.anrop.length = 0;
    act(() => { u.andra(u.rader[0].id, 'Text', null); });
    await act(async () => { await korKartkommentarKo(true, f.db); });
    expect(f.anrop[0].arg).toMatchObject({ viktigt: null });
  });

  it('FÖRE migrationen: kommentarerna läses som förut, fältet göms och en vanlig kommentar sparas', async () => {
    const f = fakeDb({ kolumn: false });
    f.rader.push({ id: 'g1', objekt_id: 'o1', yta_nyckel: 'hansyn:1', text: 'Gammal kommentar', skapad_av: 'm1', skapad_at: '2026-11-01T08:00:00Z', andrad_at: '2026-11-01T08:00:00Z' });
    montera(f.db); await tom();
    expect(u.lasFel).toBe(false);
    expect(u.viktigtStod).toBe(false);
    expect(u.rader.map((r) => r.text)).toEqual(['Gammal kommentar']);   // inget försvann
    act(() => { u.lagg('hansyn:1', 'Ny vanlig kommentar'); });
    await act(async () => { await korKartkommentarKo(true, f.db); }); await tom();
    expect(f.anrop[0].arg).not.toHaveProperty('viktigt');
    expect(antalVantande()).toBe(0);
  });

  it('FÖRE migrationen: en Viktigt-rad som ändå skrivits väntar i kön (inte bort, inte utan Viktigt) och går fram när kolumnen finns', async () => {
    const state = { kolumn: false };
    const f = fakeDb(state);
    montera(f.db); await tom();
    act(() => { u.lagg('hansyn:1', 'Övrigt', 'Viktigt-raden'); });
    await act(async () => { await korKartkommentarKo(true, f.db); });
    expect(antalVantande()).toBe(1);                       // väntar
    expect(lasKo()[0]).toMatchObject({ viktigt: 'Viktigt-raden', text: 'Övrigt' });
    expect(f.rader).toHaveLength(0);                       // och skrevs inte utan Viktigt
    state.kolumn = true;                                   // migrationen körs
    await act(async () => { await korKartkommentarKo(true, f.db); });
    expect(antalVantande()).toBe(0);
    expect(f.rader[0]).toMatchObject({ viktigt: 'Viktigt-raden', text: 'Övrigt' });
  });
});
