// @vitest-environment jsdom
// Larmet i körvyn (lib/hooks/useKorvyLarm) i React: samma hook som sidan kör, mot en låtsasdatabas för kvitteringarna.
// Det som avgörs i lib/larm (grupp × kvitterad × annan förare) provas där; här provas kopplingen: markeringar → larm, ljud, och att kvitteringen
// skrivs under RÄTT förare och bara tystar den föraren.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useKorvyLarm, type KorvyLarmIn, type KorvyLarmUt } from './useKorvyLarm';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const M = 1 / 111320;
const POS = { lat: 56.5, lon: 14.7 };
const norr = (m: number) => POS.lat + m * M;

type Rad = { objekt_id: string; marker_id: string; forare_id: string; innehall_hash: string; kvitterad_at: string };
function fakeDb(rader: Rad[]) {
  const upserts: any[] = [];
  const db = {
    upserts,
    from: () => {
      const eq: Record<string, string> = {};
      const q: any = {
        select: () => q,
        eq: (k: string, v: string) => { eq[k] = v; return q; },
        upsert: async (rad: any) => { upserts.push(rad); rader.push({ ...rad }); return { error: null }; },
        then: (res: any, rej: any) => Promise.resolve({ data: rader.filter((r) => Object.entries(eq).every(([k, v]) => (r as any)[k] === v)), error: null }).then(res, rej),
      };
      return q;
    },
  };
  return db;
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

let root: Root; let cont: HTMLDivElement; let ut: KorvyLarmUt;
function mount(inp: KorvyLarmIn) {
  function H({ p }: { p: KorvyLarmIn }) { ut = useKorvyLarm(p); return null; }
  cont = document.createElement('div'); document.body.appendChild(cont); root = createRoot(cont);
  act(() => { root.render(<H p={inp} />); });
  return (p: KorvyLarmIn) => act(() => { root.render(<H p={p} />); });
}
const tom = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

function bas(over: Partial<KorvyLarmIn> = {}): KorvyLarmIn {
  return {
    aktiv: true, pos: POS, markers: [], svgToLatLon: (x, y) => ({ lat: x, lon: y }), typNamn: (t) => ({ powerline: 'El-ledning', culturemonument: 'Kulturminne', manualfelling: 'Manuell fällning', landing: 'Avlägg', wet: 'Blött' } as any)[t ?? ''] ?? 'Markering',
    egna: new Set(), vida: null, objektId: 'o1', forare: { id: 'A', namn: 'Stefan' }, db: fakeDb([]), ljudCtx: () => null, ...over,
  };
}
const sym = (id: number, type: string, metersNorr: number, extra: any = {}) => ({ id, isMarker: true, type, x: norr(metersNorr), y: POS.lon, ...extra });

beforeEach(() => { document.body.innerHTML = ''; });

describe('useKorvyLarm — kopplingen till sidan', () => {
  it('Brun (Kulturminne) 30 m bort: kort med namn och meter, ETT ljud, "Sett"-rad; Sett tystar och sparar under förarens id', async () => {
    const { ctx, toner } = ljudCtx(); const db = fakeDb([]);
    mount(bas({ markers: [sym(1, 'culturemonument', 30)], db, ljudCtx: () => ctx }));
    await tom();
    expect(ut.kort).toMatchObject({ namn: 'Kulturminne', grupp: 'kultur', pulserar: false });
    expect(ut.kort!.avstandM).toBeCloseTo(30, 0);
    expect(toner).toHaveLength(2);                                   // ETT ljud = tvåtonsmärket (inte tre pip)
    expect(ut.settRad).toEqual({ id: '1', namn: 'Kulturminne' });
    await act(async () => { ut.kvittera(); });
    expect(ut.settRad).toBeNull();
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({ objekt_id: 'o1', marker_id: '1', forare_id: 'A', forare_namn: 'Stefan', grupp: 'kultur' });
  });

  it('TESTLÄGE (torr): Sett tystar i minnet men skriver ingenting i databasen', async () => {
    const db = fakeDb([]);
    mount(bas({ markers: [sym(1, 'culturemonument', 30)], db, torr: true })); await tom();
    expect(ut.settRad).toEqual({ id: '1', namn: 'Kulturminne' });
    await act(async () => { ut.kvittera(); });
    expect(ut.settRad).toBeNull();
    expect(db.upserts).toHaveLength(0);
  });

  it('en annan förare får fullt larm trots att Stefan kvitterat; Stefan själv får inget kort efter kvittering', async () => {
    const rader: Rad[] = [{ objekt_id: 'o1', marker_id: '1', forare_id: 'A', innehall_hash: '', kvitterad_at: 't' }];
    // hashen måste stämma: läs den ur en första körning
    const db0 = fakeDb([]);
    const rerender = mount(bas({ markers: [sym(1, 'culturemonument', 30)], db: db0 }));
    await tom(); await act(async () => { ut.kvittera(); });
    rader[0].innehall_hash = db0.upserts[0].innehall_hash;
    // Stefan igen (ny montering, kvittensen läses): inget kort
    document.body.innerHTML = '';
    mount(bas({ markers: [sym(1, 'culturemonument', 30)], db: fakeDb(rader) })); await tom();
    expect(ut.kort).toBeNull(); expect(ut.settRad).toBeNull();
    expect(ut.ringar.map((r) => r.id)).toEqual(['1']);               // ringen i gruppens färg finns kvar när man är nära
    // Annan förare B: fullt larm
    document.body.innerHTML = '';
    mount(bas({ markers: [sym(1, 'culturemonument', 30)], db: fakeDb(rader), forare: { id: 'B', namn: 'Oskar' } })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'Kulturminne' });
    void rerender;
  });

  it('Röd (El-ledning) larmar även efter kvittering; Sett skrivs som bevis men tystar inte nästa närmande', async () => {
    const db = fakeDb([]); const { ctx, toner } = ljudCtx();
    const rerender = mount(bas({ markers: [sym(2, 'powerline', 30)], db, ljudCtx: () => ctx })); await tom();
    expect(ut.kort).toMatchObject({ grupp: 'fara' });
    await act(async () => { ut.kvittera(); });
    expect(db.upserts).toHaveLength(1);                              // beviset sparat
    expect(ut.kort).toMatchObject({ grupp: 'fara' });                // men kortet står kvar
    // lämna (200 m bort) och kom tillbaka: nytt ljud
    toner.length = 0;
    rerender(bas({ markers: [sym(2, 'powerline', 30)], db, ljudCtx: () => ctx, pos: { lat: POS.lat - 200 * M, lon: POS.lon } })); await tom();
    expect(ut.kort).toBeNull();
    rerender(bas({ markers: [sym(2, 'powerline', 30)], db, ljudCtx: () => ctx })); await tom();
    expect(ut.kort).toMatchObject({ grupp: 'fara' });
    expect(toner.length).toBeGreaterThan(0);
  });

  it('inom 15 m pulserar Röd och ett tydligare ljud (en enda ton) spelas', async () => {
    const { ctx, toner } = ljudCtx();
    const rerender = mount(bas({ markers: [sym(2, 'powerline', 30)], ljudCtx: () => ctx })); await tom();
    toner.length = 0;
    rerender(bas({ markers: [sym(2, 'powerline', 10)], ljudCtx: () => ctx })); await tom();
    expect(ut.kort).toMatchObject({ pulserar: true });
    expect(toner).toEqual([520]);
  });

  it('Manuell fällning (Lila) och Avlägg (Mörk) larmar aldrig', async () => {
    mount(bas({ markers: [sym(3, 'manualfelling', 5), sym(4, 'landing', 5)] })); await tom();
    expect(ut.kort).toBeNull(); expect(ut.settRad).toBeNull(); expect(ut.ringar).toEqual([]);
  });

  it('en symbol föraren själv just satt larmar inte; Högstubbe och Evighetsträd larmar aldrig (inte heller planerarens); Naturhörna gör det', async () => {
    mount(bas({ markers: [sym(5, 'culturemonument', 5)], egna: new Set(['5']) })); await tom();
    expect(ut.kort).toBeNull();
    for (const typ of ['highstump', 'eternitytree']) {
      document.body.innerHTML = '';
      mount(bas({ markers: [sym(6, typ, 5)] })); await tom();
      expect(ut.kort, typ).toBeNull(); expect(ut.settRad, typ).toBeNull(); expect(ut.ringar, typ).toEqual([]);
    }
    document.body.innerHTML = '';
    mount(bas({ markers: [sym(7, 'naturecorner', 5)] })); await tom();
    expect(ut.kort).toMatchObject({ grupp: 'natur' });
  });

  it('Stenmur larmar på avstånd till närmaste punkt på linjen (Natur, 40 m)', async () => {
    const linje = { id: 'sm', isLine: true, lineType: 'stonewall', path: [{ x: norr(25), y: POS.lon - 20 * M * 1.8 }, { x: norr(25), y: POS.lon + 20 * M * 1.8 }] };
    mount(bas({ markers: [linje] })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'Stenmur', grupp: 'natur' });
    expect(ut.kort!.avstandM).toBeLessThan(40);
    expect(ut.ringar[0].geometri?.type).toBe('LineString');
  });

  it('inkörning i Vidas Hänsynsyta: "kör inte här" — även efter kvittering', async () => {
    const o = 0.0006; // ~ 67 m
    const vida = { features: [{ type: 'Feature', properties: { _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR' }, geometry: { type: 'Polygon', coordinates: [[[POS.lon - o, POS.lat - o], [POS.lon + o, POS.lat - o], [POS.lon + o, POS.lat + o], [POS.lon - o, POS.lat + o], [POS.lon - o, POS.lat - o]]] } }] };
    const db = fakeDb([]);
    mount(bas({ vida, db })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'Hänsyn', forbjuden: true, text: 'Du är inne i ytan, kör inte här', avstandM: null });
    await act(async () => { ut.kvittera(); });
    expect(ut.kort).toMatchObject({ forbjuden: true });
  });

  it('Risa på basväg räknas som Blött (in vid 12 m, ut först vid 16 m)', async () => {
    const bv = { id: 'bv', isLine: true, lineType: 'mainRoad', path: [{ x: norr(-50), y: POS.lon }, { x: norr(50), y: POS.lon }], risaPath: [{ x: norr(-50), y: POS.lon }, { x: norr(50), y: POS.lon }] };
    const rerender = mount(bas({ markers: [bv] })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'Risa', grupp: 'blott' });
    rerender(bas({ markers: [bv], pos: { lat: POS.lat, lon: POS.lon + 14 * M * 1.8 } })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'Risa' });                // 14 m: kvar (hysteres)
    rerender(bas({ markers: [bv], pos: { lat: POS.lat, lon: POS.lon + 20 * M * 1.8 } })); await tom();
    expect(ut.kort).toBeNull();
  });

  it('inaktiv körvy ger inget larm; läsfel på kvittensen ger fullt larm', async () => {
    mount(bas({ aktiv: false, markers: [sym(2, 'powerline', 10)] })); await tom();
    expect(ut.kort).toBeNull();
    document.body.innerHTML = '';
    const felDb: any = { from: () => { const q: any = { select: () => q, eq: () => q, then: (r: any) => Promise.resolve({ data: null, error: { message: 'nät' } }).then(r) }; return q; } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(bas({ markers: [sym(1, 'culturemonument', 30)], db: felDb })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'Kulturminne' });
  });
});
