// @vitest-environment jsdom
// Kommentarerna på kartan i React: samma hook som sidan kör, mot en låtsasdatabas som delas av två förare.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useKartkommentarer, type KartkommentarerIn, type KartkommentarerUt } from './useKartkommentarer';
import { antalVantande, korKartkommentarKo, nollstallKartkommentarKo, sattKartkommentarAuto, type KoDb } from '../kartkommentarKo';
import { kortKommentarer } from '../kartkommentar';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Rad = { id: string; objekt_id: string; yta_nyckel: string; text: string; skapad_av: string; skapad_at: string; andrad_at: string };
const NAMN: Record<string, string> = { martin: 'Martin Lindqvist', daniel: 'Daniel Svensson', oskar: 'Oskar Nilsson' };

/** En delad "server": RLS efterliknas (ändra = bara egna, radera = egna eller admin), tiden sätts av servern. */
function server() {
  const rader: Rad[] = [];
  let klocka = Date.parse('2026-10-20T10:00:00Z');
  const dbFor = (jag: string, arAdmin = false): KoDb => ({
    from: () => {
      const q: any = {
        _filter: null as null | ((r: Rad) => boolean),
        select: () => q,
        in: (_k: string, ids: string[]) => { q._filter = (r: Rad) => ids.includes(r.objekt_id); return q; },
        order: () => q,
        insert: async (r: any) => {
          if (r.skapad_av !== jag) return { error: { code: '42501' } };
          if (rader.some((x) => x.id === r.id)) return { error: { code: '23505' } };
          klocka += 60_000;
          const t = new Date(klocka).toISOString();
          rader.push({ ...r, skapad_at: t, andrad_at: t });
          return { error: null };
        },
        update: (v: any) => ({ eq: (_k: string, id: string) => {
          const rad = rader.find((x) => x.id === id && x.skapad_av === jag);
          if (rad) { rad.text = v.text; rad.andrad_at = new Date(++klocka).toISOString(); }
          const res = { error: null, data: rad ? [{ id }] : [] };
          const p: any = Promise.resolve(res); p.select = () => Promise.resolve(res); return p;
        } }),
        delete: () => ({ eq: async (_k: string, id: string) => { const i = rader.findIndex((x) => x.id === id && (x.skapad_av === jag || arAdmin)); if (i >= 0) rader.splice(i, 1); return { error: null }; } }),
        then: (res: any, rej: any) => Promise.resolve({ data: rader.filter(q._filter ?? (() => true)).map((r) => ({ ...r, medarbetare: { namn: NAMN[r.skapad_av] } })), error: null }).then(res, rej),
      };
      return q;
    },
  });
  return { rader, dbFor };
}

let ut: Record<string, KartkommentarerUt>;
function monteraAnvandare(namn: string, inp: KartkommentarerIn) {
  function H() { ut[namn] = useKartkommentarer(inp); return null; }
  const cont = document.createElement('div'); document.body.appendChild(cont);
  act(() => { createRoot(cont).render(<H />); });
}
const tom = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const NU = new Date('2026-10-20T16:30:00Z');

beforeEach(() => { document.body.innerHTML = ''; ut = {}; nollstallKartkommentarKo(); sattKartkommentarAuto(false); localStorage.clear(); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); });

describe('useKartkommentarer — två förare på samma objekt', () => {
  const NYCKEL = 'linje:1a2b3c4d';

  async function setup() {
    const srv = server();
    const dbD = srv.dbFor('daniel'), dbO = srv.dbFor('oskar'), dbM = srv.dbFor('martin', true);
    monteraAnvandare('daniel', { objektId: 'o1', minId: 'daniel', minNamn: NAMN.daniel, db: dbD });
    monteraAnvandare('oskar', { objektId: 'o1', minId: 'oskar', minNamn: NAMN.oskar, db: dbO });
    monteraAnvandare('martin', { objektId: 'o1', minId: 'martin', minNamn: NAMN.martin, arAdmin: true, db: dbM });
    await tom();
    return { srv, dbD, dbO, dbM };
  }
  const flush = async (db: KoDb) => { await act(async () => { await korKartkommentarKo(true, db); }); await tom(); };
  const ladda = async () => { await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); await tom(); };

  it('två förare kommenterar samma objekt: båda syns, med namn och tid, och ingen skriver över den andra', async () => {
    const { dbD, dbO } = await setup();
    act(() => ut.daniel.lagg(NYCKEL, 'Stolpe lutar'));
    await flush(dbD);
    act(() => ut.oskar.lagg(NYCKEL, 'Såg det också, hänger lågt'));
    await flush(dbO);
    await ladda();
    for (const vem of ['daniel', 'oskar']) {
      const k = kortKommentarer({ rader: ut[vem].rader, nyckel: NYCKEL, objektId: 'o1', minId: vem, arAdmin: false, nu: NU });
      expect(k.map((r) => r.text), vem).toEqual(['Stolpe lutar', 'Såg det också, hänger lågt']);
      expect(k.map((r) => r.forfattare), vem).toEqual(['Daniel · idag 12:01', 'Oskar · idag 12:02']);
    }
  });

  it('en förare kan inte ändra eller ta bort den andras kommentar — varken i vyn eller mot servern', async () => {
    const { srv, dbD, dbO } = await setup();
    act(() => ut.daniel.lagg(NYCKEL, 'Stolpe lutar'));
    await flush(dbD); await ladda();
    const id = ut.oskar.rader[0].id;
    // Knapparna finns inte:
    const k = kortKommentarer({ rader: ut.oskar.rader, nyckel: NYCKEL, objektId: 'o1', minId: 'oskar', arAdmin: false, nu: NU });
    expect(k[0]).toMatchObject({ kanAndra: false, kanRadera: false });
    // Hooken ignorerar försöket:
    act(() => { ut.oskar.andra(id, 'hackat'); ut.oskar.radera(id); });
    expect(antalVantande()).toBe(0);                 // hooken lägger inte ens ändringen i kön
    await flush(dbO);
    expect(srv.rader).toHaveLength(1);
    expect(srv.rader[0].text).toBe('Stolpe lutar');
    // Och även om en köpost skulle ha smugit sig förbi vyn skriver servern (RLS) inte över:
    const { laggIKo } = await import('../kartkommentarKo');
    laggIKo({ id, objekt_id: 'o1', yta_nyckel: NYCKEL, op: 'andra', text: 'hackat', skapad_av: 'daniel', namn: 'Daniel', skapad_lokalt: '' });
    await flush(dbO);
    expect(srv.rader[0].text).toBe('Stolpe lutar');
  });

  it('författaren ändrar sin egen; admin tar bort andras men kan inte ändra deras text', async () => {
    const { srv, dbD, dbM } = await setup();
    act(() => ut.daniel.lagg(NYCKEL, 'Stolpe lutar'));
    await flush(dbD); await ladda();
    const id = ut.daniel.rader[0].id;
    act(() => ut.daniel.andra(id, 'Stolpe 3 lutar'));
    await flush(dbD);
    expect(srv.rader[0].text).toBe('Stolpe 3 lutar');
    await ladda();
    act(() => ut.martin.andra(id, 'admin skriver över'));
    await flush(dbM);
    expect(srv.rader[0].text).toBe('Stolpe 3 lutar');
    act(() => ut.martin.radera(id));
    await flush(dbM);
    expect(srv.rader).toHaveLength(0);
  });

  it('utan täckning syns kommentaren direkt som "väntar" och finns kvar tills nätet kommer; sedan är den en vanlig rad', async () => {
    const { srv, dbD } = await setup();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    act(() => ut.daniel.lagg(NYCKEL, 'Skrivet i skogen'));
    await flush(dbD);
    expect(srv.rader).toHaveLength(0);
    const k = kortKommentarer({ rader: ut.daniel.rader, nyckel: NYCKEL, objektId: 'o1', minId: 'daniel', arAdmin: false, nu: NU });
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ text: 'Skrivet i skogen', vantar: true, kanAndra: true });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    await flush(dbD); await ladda();
    expect(srv.rader).toHaveLength(1);
    expect(ut.daniel.rader[0].vantar).toBe(false);
  });

  it('larmkortet får senaste kommentaren med namn ("Daniel: Stolpe lutar")', async () => {
    const { dbD, dbO } = await setup();
    act(() => ut.oskar.lagg(NYCKEL, 'Hänger lågt'));
    await flush(dbO);
    act(() => ut.daniel.lagg(NYCKEL, 'Stolpe lutar'));
    await flush(dbD); await ladda();
    expect(ut.oskar.larmKommentarer).toEqual({ [NYCKEL]: 'Daniel: Stolpe lutar' });
  });

  it('en tom kommentar eller en utan inloggad medarbetare skrivs inte', async () => {
    const { srv, dbD } = await setup();
    act(() => ut.daniel.lagg(NYCKEL, '   '));
    monteraAnvandare('gast', { objektId: 'o1', minId: null, minNamn: null, db: dbD });
    act(() => ut.gast.lagg(NYCKEL, 'text'));
    await flush(dbD);
    expect(srv.rader).toHaveLength(0);
  });
});
