// @vitest-environment jsdom
// "Nytt från …" i React: samma hook som sidan kör. Markeringarna kommer via hamtadMarkeringar (som onHamtad i useMarkeringarSynk), kommentarerna ur den RIKTIGA
// useKartkommentarer mot en delad låtsasserver med realtime (och utan, för reserven).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useState } from 'react';
import { useNyttFranPlaneraren, type NyttFranIn } from './useNyttFranPlaneraren';
import { useKartkommentarer } from './useKartkommentarer';
import { nollstallKartkommentarKo, sattKartkommentarAuto, type KoDb } from '../kartkommentarKo';
import { NYTT_RAD_MS, markeringPlats, type NyttPlats, type NyttPost } from '../nyttFranPlaneraren';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const svg = (x: number, y: number) => ({ lat: 57 + y / 1e5, lon: 15 + x / 1e5 });
const sym = (id: string, type: string, extra: any = {}) => ({ id, isMarker: true, type, x: 0, y: 0, andradTs: 100, andradAv: 'martin-id', andradAvNamn: 'Martin', ...extra });
let root: Root | null = null;
const tom = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };

// ── Markeringar: hooken ensam ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('Nytt från — markeringar', () => {
  let ut: ReturnType<typeof useNyttFranPlaneraren>;
  let inp: NyttFranIn; let visade: NyttPost[];
  // EN komponent (samma typ hela testet) — annars monteras hooken om och tappar sitt tillstånd i stället för att reagera på ändrade indata.
  function H(_: { k: number }) { ut = useNyttFranPlaneraren(inp); return null; }
  let rk = 0;
  const rendera = () => { const c = document.createElement('div'); document.body.appendChild(c); root = createRoot(c); act(() => { root!.render(<H k={++rk} />); }); };
  const omRendera = (andra: Partial<NyttFranIn> = {}) => { inp = { ...inp, ...andra }; act(() => { root!.render(<H k={++rk} />); }); };

  beforeEach(() => {
    vi.useFakeTimers(); document.body.innerHTML = ''; visade = [];
    inp = {
      objektId: 'o1', aktiv: true, minId: 'jag', kommentarer: [], kommentarerLaddad: true,
      markeringPlats: (m) => markeringPlats(m, svg), nyckelPlats: () => null, pos: { lat: 57, lon: 15 }, onVisa: (p) => { visade.push(p); },
    };
  });
  afterEach(() => { act(() => { root?.unmount(); }); root = null; vi.useRealTimers(); });

  const bas = [sym('1', 'wet', { andradAv: 'x' })];
  const hamta = (ms: any[], farsk = true) => act(() => { ut.hamtadMarkeringar(ms, farsk); });

  it('ingen rad vid start: den första färska bilden är baslinjen, den sparade bilden räknas inte', () => {
    rendera(); hamta([sym('9', 'warning')], false); hamta(bas);
    expect(ut.rad).toBeNull();
    hamta(bas);
    expect(ut.rad).toBeNull();
  });

  it('en planerare lägger till en symbol → raden med namn, typ, kommentar och avstånd; tryck → onVisa och raden försvinner', () => {
    rendera(); hamta(bas);
    hamta([...bas, sym('2', 'warning', { comment: 'Torrträd', y: 108 })]);
    expect(ut.rad).toEqual({ text: 'Nytt från Martin: Varning – Torrträd, 120 m', ton: 'fara', antal: 1 });
    act(() => { ut.tryck(); });
    expect(visade).toHaveLength(1);
    expect(visade[0].nyckel).toBe('markering:2');
    expect(visade[0].plats?.geometri.type).toBe('Point');
    expect(ut.rad).toBeNull();
  });

  it('min egen ändring → ingen rad', () => {
    rendera(); hamta(bas);
    hamta([...bas, sym('2', 'warning', { andradAv: 'jag', andradAvNamn: 'Stefan' })]);
    expect(ut.rad).toBeNull();
  });

  it('en annan maskin → raden med förarens namn; ostämplad rad → "planeringen"', () => {
    rendera(); hamta(bas);
    hamta([...bas, sym('2', 'wet', { andradAv: 'stefan-id', andradAvNamn: 'Stefan', y: 72 })]);
    expect(ut.rad?.text).toBe('Nytt från Stefan: Fuktig mark, 80 m');
    hamta([...bas, sym('2', 'wet', { andradAv: 'stefan-id', andradAvNamn: 'Stefan', y: 72 }), { id: '5', isMarker: true, type: 'note', x: 0, y: 0, andradTs: 300 }]);
    expect(ut.rad?.text).toBe('2 nya från Stefan och planeringen');
  });

  it('tre ändringar → "3 nya från Jocke"; tryck visar dem i tur och ordning och raden försvinner efter den sista', () => {
    rendera(); hamta(bas);
    const nya = ['a', 'b', 'c'].map((id, i) => sym(id, 'wet', { andradAv: 'j', andradAvNamn: 'Jocke', andradTs: 200 + i, y: (i + 1) * 20 }));
    hamta([...bas, nya[0]]); vi.advanceTimersByTime(1000);
    hamta([...bas, nya[0], nya[1]]); vi.advanceTimersByTime(1000);
    hamta([...bas, ...nya]);
    expect(ut.rad).toMatchObject({ text: '3 nya från Jocke', antal: 3 });
    act(() => { ut.tryck(); }); expect(visade.map((p) => p.nyckel)).toEqual(['markering:a']); expect(ut.rad).toMatchObject({ text: '2 nya från Jocke' });
    act(() => { ut.tryck(); }); act(() => { ut.tryck(); });
    expect(visade.map((p) => p.nyckel)).toEqual(['markering:a', 'markering:b', 'markering:c']);
    expect(ut.rad).toBeNull();
  });

  it('raden försvinner av sig själv efter 30 s, men kommer tillbaka med nya ändringar inom 2 min', () => {
    rendera(); hamta(bas);
    hamta([...bas, sym('2', 'wet', { andradAvNamn: 'Jocke' })]);
    expect(ut.rad).not.toBeNull();
    act(() => { vi.advanceTimersByTime(NYTT_RAD_MS + 50); });
    expect(ut.rad).toBeNull();
    hamta([...bas, sym('2', 'wet', { andradAvNamn: 'Jocke' }), sym('3', 'wet', { andradAvNamn: 'Jocke', andradTs: 300 })]);
    expect(ut.rad?.antal).toBe(2);   // den första ingick inte ens osedd inom 2 min — båda visas
  });

  it('ton: fara röd, annars neutral', () => {
    rendera(); hamta(bas);
    hamta([...bas, sym('2', 'wet')]); expect(ut.rad?.ton).toBe('neutral');
    act(() => { ut.tryck(); });
    hamta([...bas, sym('2', 'wet'), sym('3', 'powerline', { andradTs: 400 })]); expect(ut.rad?.ton).toBe('fara');
  });

  it('körvyn av (aktiv = false): ingen rad — men baslinjen följer med, så inget gammalt dyker upp när körvyn öppnas', () => {
    inp.aktiv = false; rendera();   // första renderingen med körvyn av
    hamta(bas); hamta([...bas, sym('2', 'wet')]);
    expect(ut.rad).toBeNull();
    omRendera({ aktiv: true });
    expect(ut.rad).toBeNull();
    hamta([...bas, sym('2', 'wet')]);   // oförändrat sedan baslinjen
    expect(ut.rad).toBeNull();
    hamta([...bas, sym('2', 'wet'), sym('3', 'wet', { andradTs: 500 })]);
    expect(ut.rad?.antal).toBe(1);
  });

  it('objektbyte: ny baslinje, ingen rad från förra objektet', () => {
    rendera(); hamta(bas); hamta([...bas, sym('2', 'wet')]); expect(ut.rad).not.toBeNull();
    omRendera({ objektId: 'o2' });
    expect(ut.rad).toBeNull();
    hamta([sym('77', 'warning')]);   // första bilden för o2 = baslinje
    expect(ut.rad).toBeNull();
  });
});

// ── Kommentarer: riktiga useKartkommentarer + realtime-låtsasserver ───────────────────────────────────────────────────────────────────────────────────────
type Rad = { id: string; objekt_id: string; yta_nyckel: string; text: string; viktigt: string | null; skapad_av: string; skapad_at: string; andrad_at: string };
const NAMN: Record<string, string> = { martin: 'Martin Hjert', jag: 'Stefan Karlsson' };

function server(medRealtime: boolean) {
  const rader: Rad[] = [];
  const lyssnare: Array<{ filter: string; event: string; cb: () => void }> = [];
  let klocka = Date.parse('2026-11-24T10:00:00Z');
  const skapaKanal = () => { const k: any = { on: (_t: string, o: any, cb: () => void) => { lyssnare.push({ filter: o.filter, event: o.event, cb }); return k; }, subscribe: () => k }; return k; };
  const db: any = {
    from: () => {
      const q: any = { _f: null as any,
        select: () => q, in: (_k: string, ids: string[]) => { q._f = (r: Rad) => ids.includes(r.objekt_id); return q; }, order: () => q,
        insert: async (r: any) => { klocka += 60_000; const t = new Date(klocka).toISOString(); rader.push({ viktigt: null, ...r, skapad_at: t, andrad_at: t }); return { error: null }; },
        then: (res: any, rej: any) => Promise.resolve({ data: rader.filter(q._f ?? (() => true)).map((r) => ({ ...r, medarbetare: { namn: NAMN[r.skapad_av] } })), error: null }).then(res, rej),
      };
      return q;
    },
    ...(medRealtime ? { channel: () => skapaKanal(), removeChannel: () => {} } : {}),
  };
  /** Någon annan skriver en kommentar; med realtime skickas händelsen på objektets rader. */
  const skriv = (r: Partial<Rad>) => {
    klocka += 60_000; const t = new Date(klocka).toISOString();
    rader.push({ id: 'k' + (rader.length + 1), objekt_id: 'o1', yta_nyckel: 'hansyn:3', text: '', viktigt: null, skapad_av: 'martin', skapad_at: t, andrad_at: t, ...r });
    for (const l of lyssnare) if (l.event === 'INSERT' && l.filter === 'objekt_id=eq.o1') l.cb();
  };
  return { db: db as KoDb, skriv };
}

describe('Nytt från — kommentarer (riktig useKartkommentarer)', () => {
  let ut: ReturnType<typeof useNyttFranPlaneraren>;
  beforeEach(() => { document.body.innerHTML = ''; nollstallKartkommentarKo(); sattKartkommentarAuto(false); localStorage.clear(); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); });
  afterEach(() => { act(() => { root?.unmount(); }); root = null; });

  const montera = (db: KoDb, reservMs?: number, kommentarer: Partial<Rad>[] = []) => {
    function H() {
      const kk = useKartkommentarer({ objektId: 'o1', minId: 'jag', minNamn: NAMN.jag, db, live: true, reservMs });
      ut = useNyttFranPlaneraren({
        objektId: 'o1', aktiv: true, minId: 'jag', kommentarer: kk.rader, kommentarerLaddad: kk.laddad,
        markeringPlats: () => null, nyckelPlats: () => null, pos: null, onVisa: () => {},
      });
      return null;
    }
    const c = document.createElement('div'); document.body.appendChild(c); root = createRoot(c); act(() => { root!.render(<H />); });
    void kommentarer;
  };

  it('ny Viktigt-kommentar från en annan → gul rad inom sekunder via realtime', async () => {
    const s = server(true); montera(s.db); await tom(20);
    expect(ut.rad).toBeNull();
    s.skriv({ viktigt: 'Kör inte in i hänsynen' });
    expect(ut.rad).toBeNull();   // samlas 400 ms
    await tom(650);
    expect(ut.rad).toEqual({ text: 'Nytt från Martin: Viktigt – Kör inte in i hänsynen', ton: 'viktigt', antal: 1 });
  });

  it('en kommentar som fanns redan vid start ger ingen rad (tyst baslinje)', async () => {
    const s = server(true); s.skriv({ text: 'gammal' }); montera(s.db); await tom(50);
    expect(ut.rad).toBeNull();
  });

  it('realtime av: kommer ändå inom en minut via reserven (här 150 ms)', async () => {
    const s = server(false); montera(s.db, 150); await tom(20);
    s.skriv({ text: 'Stolpe lutar' });
    await tom(10);
    expect(ut.rad).toBeNull();
    await tom(400);
    expect(ut.rad).toMatchObject({ text: 'Nytt från Martin: Kommentar – Stolpe lutar', ton: 'neutral' });
  });

  it('objektbyte: kommentarer som redan fanns på det nya objektet ger ingen rad (baslinjen tas först när det nya objektets rader lästs)', async () => {
    const s = server(true);
    s.skriv({ id: 'a1', objekt_id: 'o1', text: 'på o1' });
    s.skriv({ id: 'b1', objekt_id: 'o2', text: 'på o2' }); s.skriv({ id: 'b2', objekt_id: 'o2', text: 'mer på o2' });
    let byt: (o: string) => void = () => {};
    function H() {
      const [obj, setObj] = useState('o1'); byt = setObj;
      const kk = useKartkommentarer({ objektId: obj, minId: 'jag', minNamn: NAMN.jag, db: s.db, live: true, reservMs: 0 });
      ut = useNyttFranPlaneraren({ objektId: obj, aktiv: true, minId: 'jag', kommentarer: kk.rader, kommentarerLaddad: kk.laddad, markeringPlats: () => null, nyckelPlats: () => null, pos: null, onVisa: () => {} });
      return null;
    }
    const c = document.createElement('div'); document.body.appendChild(c); root = createRoot(c); act(() => { root!.render(<H />); });
    await tom(30);
    expect(ut.rad).toBeNull();
    act(() => { byt('o2'); }); await tom(60);
    expect(ut.rad).toBeNull();
  });

  it('min egen kommentar (skriven på den här skärmen) ger ingen rad', async () => {
    const s = server(true); montera(s.db); await tom(20);
    s.skriv({ skapad_av: 'jag', text: 'min egen' }); await tom(650);
    expect(ut.rad).toBeNull();
  });
});
