// @vitest-environment jsdom
// Larmet i körvyn (lib/hooks/useKorvyLarm) i React: samma hook som sidan kör, mot en låtsasdatabas för kvitteringarna.
// Det som avgörs i lib/larm (grupp × kvitterad × annan förare) provas där; här provas kopplingen: markeringar → larm, ljud, och att kvitteringen
// skrivs under RÄTT förare och bara tystar den föraren.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// Klockan styrs av testet: ljudfönstret (flera nya larm inom ~2 s = ett ljud) räknas mot Date.now().
let klocka = 1_000_000;
beforeEach(() => { document.body.innerHTML = ''; klocka += 60_000; vi.spyOn(Date, 'now').mockImplementation(() => klocka); });
afterEach(() => { vi.restoreAllMocks(); });

describe('useKorvyLarm — flera larm samtidigt', () => {
  const typNamn = (t?: string) => ({ powerline: 'El-ledning', warning: 'Varning', eternitytree: 'Evighetsträd', naturecorner: 'Naturhörna', culturemonument: 'Kulturminne' } as Record<string, string>)[t ?? ''] ?? 'Markering';

  it('två röda (Kraftledning-lik El-ledning 13 m, Varning 18 m): ETT stort kort på det närmaste, det andra i raden, pulsen på det stora', async () => {
    mount(bas({ markers: [sym(1, 'powerline', 13), sym(2, 'warning', 18, { comment: 'Hängande trädtopp' })], typNamn })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'El-ledning' });
    expect(ut.fler).toHaveLength(1);
    expect(ut.fler[0]).toMatchObject({ namn: 'Varning', text: 'Hängande trädtopp' });
    expect(ut.puls?.id).toBe('1');
    expect(ut.puls?.geometri.type).toBe('Point');
  });

  it('röd + grön: röd är stor, pulsen följer den; ringen för den gröna är "nasta" (lyser, pulserar inte)', async () => {
    mount(bas({ markers: [sym(3, 'naturecorner', 5), sym(4, 'warning', 30)], typNamn })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'Varning', grupp: 'fara' });
    expect(ut.puls?.id).toBe('4');
    expect(ut.ringar.find((r) => r.id === '3')?.roll).toBe('nasta');
    expect(ut.ringar.find((r) => r.id === '4')?.roll).toBe('stor');
  });

  it('tre samtidigt: ETT kort och "+2 till" (fler.length 2)', async () => {
    mount(bas({ markers: [sym(1, 'warning', 10), sym(2, 'naturecorner', 15), sym(3, 'culturemonument', 25)], typNamn })); await tom();
    expect(ut.kort?.namn).toBe('Varning');
    expect(ut.fler).toHaveLength(2);
  });

  it('Sett gäller det stora och nästa okvitterade flyttar upp DIREKT (inte först vid nästa GPS-punkt); pulsen flyttar med', async () => {
    const db = fakeDb([]);
    mount(bas({ markers: [sym(1, 'naturecorner', 10), sym(2, 'culturemonument', 25)], typNamn, db })); await tom();
    expect(ut.kort?.namn).toBe('Naturhörna');
    expect(ut.puls?.id).toBe('1');
    await act(async () => { ut.kvittera(); });
    await tom();
    expect(ut.kort?.namn).toBe('Kulturminne');
    expect(ut.puls?.id).toBe('2');
    expect(ut.fler).toEqual([]);
    expect(ut.settRad).toMatchObject({ id: '2', namn: 'Kulturminne' });
  });

  it('en linje (Stenmur, brun) i stort kort: pulsen bär hela linjens geometri till sidan, som klipper sträckan närmast maskinen', async () => {
    const linje = { id: 'sm', isLine: true, lineType: 'stonewall', path: [{ x: norr(25), y: POS.lon - 200 * M * 1.8 }, { x: norr(25), y: POS.lon + 200 * M * 1.8 }] };
    mount(bas({ markers: [linje], typNamn })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'Stenmur', grupp: 'kultur' });
    expect(ut.puls?.geometri.type).toBe('LineString');
    expect(ut.puls?.farg).toBe(ut.kort?.farg);
  });

  it('ljud: två nya larm i samma GPS-punkt = ETT ljud; ett nytt larm 5 s senare = ett till; två inom 2 s = bara ett', async () => {
    const { ctx, toner } = ljudCtx();
    const rerender = mount(bas({ markers: [sym(1, 'naturecorner', 30), sym(2, 'culturemonument', 28)], typNamn, ljudCtx: () => ctx })); await tom();
    expect(toner).toHaveLength(2);                                      // ett tvåtonsmärke för båda
    toner.length = 0;
    klocka += 500;                                                      // ett tredje larm 0,5 s senare: tystas
    rerender(bas({ markers: [sym(1, 'naturecorner', 30), sym(2, 'culturemonument', 28), sym(3, 'eternitytree', 20), sym(5, 'naturecorner', 30)], typNamn, ljudCtx: () => ctx })); await tom();
    expect(toner).toHaveLength(0);
    klocka += 5000;
    rerender(bas({ markers: [sym(1, 'naturecorner', 30), sym(2, 'culturemonument', 28), sym(3, 'eternitytree', 20), sym(5, 'naturecorner', 30), sym(6, 'culturemonument', 35)], typNamn, ljudCtx: () => ctx })); await tom();
    expect(toner).toHaveLength(2);                                      // efter fönstret: ett ljud för den nya
  });
});

describe('useKorvyLarm — El-ledning som linje och vår kommentar på Vidas objekt', () => {
  const M_LON = 1 / (111320 * Math.cos(POS.lat * Math.PI / 180));
  const c = (nord: number, ost: number): [number, number] => [POS.lon + ost * M_LON, POS.lat + nord * M];

  it('en ritad El-ledning (linje) larmar Röd på avstånd till närmaste punkt på linjen; pulsen bär hela linjen', async () => {
    const el = { id: 'el', isLine: true, lineType: 'powerline', path: [{ x: norr(25), y: POS.lon - 200 * M_LON }, { x: norr(25), y: POS.lon + 200 * M_LON }] };
    mount(bas({ markers: [el] })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'El-ledning', grupp: 'fara' });
    expect(ut.kort!.avstandM).toBeCloseTo(25, 0);                        // inte avståndet till en ändpunkt (200 m)
    expect(ut.puls?.geometri.type).toBe('LineString');
  });

  it('vår kommentar på Vidas Kraftledning står i larmkortet; ändras den gäller en gammal kvittens inte längre', async () => {
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { _typ: 'linje', _lager: 'L_TILLAGGSLINJER', FLBESKR: 'Kraftledning' }, geometry: { type: 'LineString', coordinates: [c(20, -200), c(20, 200)] } }] };
    const rerender = mount(bas({ vida: fc as any, kommentarer: { 'linje:kraftledning:0': 'Hänger lågt vid vägen' } })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'Kraftledning', grupp: 'fara', text: 'Hänger lågt vid vägen' });
    rerender(bas({ vida: fc as any, kommentarer: {} })); await tom();
    expect(ut.kort?.text ?? null).toBeNull();
  });
});

describe('useKorvyLarm — kopplingen till sidan', () => {
  it('Brun (Kulturminne) 30 m bort: kort med namn och meter, ETT ljud, "Sett"-rad; Sett tystar och sparar under förarens id', async () => {
    const { ctx, toner } = ljudCtx(); const db = fakeDb([]);
    mount(bas({ markers: [sym(1, 'culturemonument', 30)], db, ljudCtx: () => ctx }));
    await tom();
    expect(ut.kort).toMatchObject({ namn: 'Kulturminne', grupp: 'kultur', pulserar: false });
    expect(ut.kort!.avstandM).toBeCloseTo(30, 0);
    expect(toner).toHaveLength(2);                                   // ETT ljud = tvåtonsmärket (inte tre pip)
    expect(ut.settRad).toMatchObject({ id: '1', namn: 'Kulturminne' });
    await act(async () => { ut.kvittera(); });
    expect(ut.settRad).toBeNull();
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({ objekt_id: 'o1', marker_id: '1', forare_id: 'A', forare_namn: 'Stefan', grupp: 'kultur' });
  });

  it('TESTLÄGE (torr): Sett tystar i minnet men skriver ingenting i databasen', async () => {
    const db = fakeDb([]);
    mount(bas({ markers: [sym(1, 'culturemonument', 30)], db, torr: true })); await tom();
    expect(ut.settRad).toMatchObject({ id: '1', namn: 'Kulturminne' });
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
    klocka += 5000;   // utanför ljudfönstret
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

  it('Stenmur larmar på avstånd till närmaste punkt på linjen (Kultur, 40 m)', async () => {
    const linje = { id: 'sm', isLine: true, lineType: 'stonewall', path: [{ x: norr(25), y: POS.lon - 20 * M * 1.8 }, { x: norr(25), y: POS.lon + 20 * M * 1.8 }] };
    mount(bas({ markers: [linje] })); await tom();
    expect(ut.kort).toMatchObject({ namn: 'Stenmur', grupp: 'kultur' });
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
