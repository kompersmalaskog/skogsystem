import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MARKERING_KOLUMNER, TOMT_LAGE, VARNING_LASFEL, lasVarningar, objektAttLasaForst, slaIhop, tillMarkeringRad, varningFor, type VarningsLage } from './markeringar-las';

// Fake av planering_markeringar som beter sig som PostgREST för frågan modulen ställer (select med JSON-sökväg, in, order, range) — inklusive
// felen: {error}, kast, `data: null` utan fel, svar som inte är en lista och svar som aldrig kommer.
type Fel = 'fel' | 'kasta' | 'null' | 'objekt' | 'text' | 'delvis' | 'hang';
interface Anrop { kolumner: string; ids: string[]; order: string[]; fran: number; till: number; nr: number }
interface Rad { id: string; objekt_id: string | null; typ: string; data: Record<string, unknown> }
const rad = (id: string, objekt_id: string | null, data: Record<string, unknown>): Rad => ({ id, objekt_id, typ: 'marker', data });
const KRAFT = (id: string, o: string, comment?: string) => rad(id, o, { type: 'powerline', ...(comment ? { comment } : {}) });
const AVLAGG = (id: string, o: string) => rad(id, o, { type: 'landing' });

function fake(tabell: Rad[], fel: (a: Anrop) => Fel | null = () => null) {
  const anrop: Anrop[] = []; let pagar = 0; let maxPagar = 0;
  const sb = {
    from(t: string) {
      if (t !== 'planering_markeringar') throw new Error('oväntad tabell ' + t);
      const a: Anrop = { kolumner: '', ids: [], order: [], fran: -1, till: -1, nr: 0 };
      const q: any = {
        select(k: string) { a.kolumner = k; return q; },
        in(_k: string, v: string[]) { a.ids = v; return q; },
        order(k: string) { a.order.push(k); return q; },
        range(f: number, t2: number) { a.fran = f; a.till = t2; return q; },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
          a.nr = anrop.length; anrop.push(a);
          pagar += 1; maxPagar = Math.max(maxPagar, pagar);
          return Promise.resolve().then(async () => {
            try {
              await new Promise((r) => setTimeout(r, 1)); // ett riktigt nätverksanrop är aldrig synkront
              const f = fel(a);
              if (f === 'kasta') throw new Error('nätverk');
              if (f === 'hang') return await new Promise(() => {}); // svarar aldrig
              if (f === 'fel') return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
              if (f === 'null') return { data: null, error: null };
              if (f === 'objekt') return { data: { rows: [] }, error: null };
              if (f === 'text') return { data: 'abc', error: null };                                                        // en sträng är itererbar — men ingen lista
              if (f === 'delvis') return { data: [{ id: 'x', objekt_id: 'o001', typ: 'marker', t: 'powerline', z: null, l: null, a: null, c: null }], error: { code: '57014', message: 'canceling statement' } }; // fel OCH rader
              const traff = tabell.filter((r) => r.objekt_id != null && a.ids.indexOf(r.objekt_id) >= 0).sort((x, y) => (x.id < y.id ? -1 : 1));
              const del = traff.slice(a.fran, a.till + 1).map((r) => ({
                id: r.id, objekt_id: r.objekt_id, typ: r.typ,
                t: (r.data.type as string) ?? null, z: (r.data.zoneType as string) ?? null, l: (r.data.lineType as string) ?? null, a: (r.data.arrowType as string) ?? null, c: (r.data.comment as string) ?? null,
              }));
              return { data: del, error: null };
            } finally { pagar -= 1; }
          }).then(res, rej);
        },
      };
      return q;
    },
  };
  return { sb, anrop, maxPagar: () => maxPagar };
}
const SNABB = { vanta: async () => {}, tidsgrans: 2000 };
const ids = (n: number) => Array.from({ length: n }, (_, i) => `o${String(i + 1).padStart(3, '0')}`);

let konsol: ReturnType<typeof vi.spyOn>;
beforeEach(() => { konsol = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { konsol.mockRestore(); });

describe('lasVarningar — "ingen" bara när läsningen lyckades', () => {
  it('läst utan fel och 0 faror/hänsyn → ok med TOM ObjWarn (det enda läget där raderna får säga "ingen")', async () => {
    const f = fake([AVLAGG('m1', 'o001')]); // bara ett avlägg — varken fara eller hänsyn
    const r = await lasVarningar(f.sb, ['o001', 'o002'], SNABB);
    expect(r.fel).toEqual([]);
    expect(r.ok.o001).toEqual({ faror: [], hansyn: [] });
    expect(r.ok.o002).toEqual({ faror: [], hansyn: [] });
  });

  it('faror och hänsyn byggs per objekt med planerarens kommentar, övriga markeringar hör inte hit', async () => {
    const f = fake([KRAFT('m1', 'o001', 'stolpe vid vägen'), AVLAGG('m2', 'o001'), rad('m3', 'o001', { type: 'fornlamning', comment: 'stensättning' }), KRAFT('m4', 'o002')]);
    const r = await lasVarningar(f.sb, ['o001', 'o002'], SNABB);
    expect(r.ok.o001.faror).toEqual([{ label: expect.any(String), kommentar: 'stolpe vid vägen' }]);
    expect(r.ok.o001.hansyn).toEqual([{ label: expect.any(String), kommentar: 'stensättning' }]);
    expect(r.ok.o002.faror).toHaveLength(1);
    expect(r.ok.o002.hansyn).toHaveLength(0);
  });

  it('en bit som felar läses om objekt för objekt — lyckas det finns inget fel', async () => {
    const f = fake([KRAFT('m1', 'o001')], (a) => (a.ids.length > 1 ? 'fel' : null));
    const r = await lasVarningar(f.sb, ['o001', 'o002', 'o003'], SNABB);
    expect(r.fel).toEqual([]);
    expect(Object.keys(r.ok).sort()).toEqual(['o001', 'o002', 'o003']);
    expect(r.ok.o001.faror).toHaveLength(1);
    expect(f.anrop.map((a) => a.ids.length)).toEqual([3, 1, 1, 1]);
  });

  it('ETT objekt som felar även enskilt hamnar i fel — de andra i samma bit påverkas inte', async () => {
    const f = fake([KRAFT('m1', 'o001'), KRAFT('m2', 'o003')], (a) => (a.ids.length > 1 || a.ids[0] === 'o002' ? 'fel' : null));
    const r = await lasVarningar(f.sb, ['o001', 'o002', 'o003'], SNABB);
    expect(r.fel).toEqual(['o002']);
    expect(r.ok.o002).toBeUndefined();                       // aldrig en tom ObjWarn för ett objekt som inte gick att läsa
    expect(r.ok.o001.faror).toHaveLength(1);
    expect(r.ok.o003.faror).toHaveLength(1);
  });

  it.each<[string, Fel]>([
    ['{error} (statement timeout)', 'fel'],
    ['ett kast (nätverk)', 'kasta'],
    ['data: null utan error', 'null'],
    ['ett svar som inte är en lista', 'objekt'],
    ['en sträng i stället för en lista', 'text'],
    ['ett fel som kommer MED rader (aldrig en halv lista som ser komplett ut)', 'delvis'],
  ])('%s → fel för alla objekt, aldrig "ingen"', async (_namn, modus) => {
    const f = fake([KRAFT('m1', 'o001')], () => modus);
    const r = await lasVarningar(f.sb, ['o001', 'o002'], SNABB);
    expect(r.ok).toEqual({});
    expect(r.fel.sort()).toEqual(['o001', 'o002']);
  });

  it('inget svar alls (hänger) → tidsgränsen slår till och objektet räknas som fel', async () => {
    const f = fake([], () => 'hang');
    const r = await lasVarningar(f.sb, ['o001'], { vanta: async () => {}, tidsgrans: 25 });
    expect(r.ok).toEqual({});
    expect(r.fel).toEqual(['o001']);
  });

  it('databasen nere: högst bitar + objekt frågor (ingen loop), alla i fel', async () => {
    const f = fake([], () => 'fel');
    const r = await lasVarningar(f.sb, ids(25), SNABB);
    expect(r.fel).toHaveLength(25);
    expect(f.anrop.length).toBe(3 + 25);                     // 3 bitar (10+10+5) + ett försök per objekt
  });

  it('kastar ALDRIG — inte ens när allt går fel', async () => {
    for (const modus of ['fel', 'kasta', 'null', 'objekt', 'text', 'delvis'] as Fel[]) {
      const f = fake([], () => modus);
      await expect(lasVarningar(f.sb, ids(12), SNABB)).resolves.toBeDefined();
    }
  });

  it('tekniken går till konsolen med prefixet "[Översikt v2] markeringar:"', async () => {
    const f = fake([], () => 'fel');
    await lasVarningar(f.sb, ['o001'], SNABB);
    expect(konsol).toHaveBeenCalled();
    for (const c of konsol.mock.calls) expect(String(c[0])).toMatch(/^\[Översikt v2\] markeringar:/);
  });
});

describe('lasVarningar — frågan', () => {
  it('läser bara projicerade kolumner (aldrig hela data), in-filter med bitens id, sorterat på unik nyckel, sida 0..999', async () => {
    const f = fake([]);
    await lasVarningar(f.sb, ['o001', 'o002'], SNABB);
    expect(f.anrop).toHaveLength(1);
    const a = f.anrop[0];
    expect(a.kolumner).toBe(MARKERING_KOLUMNER);
    expect(a.kolumner).toContain('t:data->>type');
    expect(a.kolumner).toContain('c:data->>comment');
    expect(a.kolumner.replace(/\w+:data->>\w+/g, '')).not.toMatch(/\bdata\b/); // ingen bar `data`-kolumn kvar
    expect(a.ids).toEqual(['o001', 'o002']);
    expect(a.order).toEqual(['id']);
    expect([a.fran, a.till]).toEqual([0, 999]);
  });

  it('bitar om 10 objekt — 25 objekt ger tre frågor (10 + 10 + 5)', async () => {
    const f = fake([]);
    await lasVarningar(f.sb, ids(25), SNABB);
    expect(f.anrop.map((a) => a.ids.length).sort((x, y) => y - x)).toEqual([10, 10, 5]);
  });

  it('omläsningen objekt för objekt: högst 5 samtidigt', async () => {
    const f = fake([], (a) => (a.ids.length > 1 ? 'fel' : null));
    const r = await lasVarningar(f.sb, ids(10), SNABB);        // en bit om 10 felar → 10 enskilda
    expect(Object.keys(r.ok)).toHaveLength(10);
    expect(f.anrop).toHaveLength(11);
    expect(f.maxPagar()).toBeLessThanOrEqual(5);
    expect(f.maxPagar()).toBeGreaterThan(1);
  });

  it('dubbletter och tomma id ignoreras', async () => {
    const f = fake([]);
    const r = await lasVarningar(f.sb, ['o001', 'o001', '', 'o002'], SNABB);
    expect(Object.keys(r.ok).sort()).toEqual(['o001', 'o002']);
    expect(f.anrop[0].ids).toEqual(['o001', 'o002']);
  });

  it('inga objekt → ingen fråga alls', async () => {
    const f = fake([]);
    expect(await lasVarningar(f.sb, [], SNABB)).toEqual({ ok: {}, fel: [] });
    expect(f.anrop).toHaveLength(0);
  });

  it('högst 4 bitar samtidigt', async () => {
    const f = fake([]);
    await lasVarningar(f.sb, ids(70), SNABB);                // 7 bitar
    expect(f.anrop).toHaveLength(7);
    expect(f.maxPagar()).toBeLessThanOrEqual(4);
    expect(f.maxPagar()).toBeGreaterThan(1);                 // och de körs faktiskt parallellt
  });

  it('sidar: en bit med fler rader än en sida läses vidare tills sidan är kortare', async () => {
    const tabell = Array.from({ length: 7 }, (_, i) => KRAFT(`m${i + 1}`, 'o001', `fara ${i + 1}`));
    const f = fake(tabell);
    const r = await lasVarningar(f.sb, ['o001'], { ...SNABB, sida: 3 });
    expect(f.anrop.map((a) => [a.fran, a.till])).toEqual([[0, 2], [3, 5], [6, 8]]);
    expect(r.ok.o001.faror.map((v) => v.kommentar).sort()).toEqual(['fara 1', 'fara 2', 'fara 3', 'fara 4', 'fara 5', 'fara 6', 'fara 7']);
  });

  it('exakt full sista sida följs av en tom sida (ingen rad tappas eller dubbleras)', async () => {
    const tabell = Array.from({ length: 6 }, (_, i) => KRAFT(`m${i + 1}`, 'o001', `fara ${i + 1}`));
    const f = fake(tabell);
    const r = await lasVarningar(f.sb, ['o001'], { ...SNABB, sida: 3 });
    expect(f.anrop.map((a) => a.fran)).toEqual([0, 3, 6]);
    expect(r.ok.o001.faror).toHaveLength(6);
  });

  it('en sida som felar mitt i läsningen gör hela objektet till fel (aldrig en halv lista som ser komplett ut)', async () => {
    const tabell = Array.from({ length: 7 }, (_, i) => KRAFT(`m${i + 1}`, 'o001', `fara ${i + 1}`));
    const f = fake(tabell, (a) => (a.fran === 3 ? 'fel' : null));
    const r = await lasVarningar(f.sb, ['o001'], { ...SNABB, sida: 3 });
    expect(r.ok).toEqual({});
    expect(r.fel).toEqual(['o001']);
  });

  it('rader för andra objekt än de efterfrågade skapar inget "ok"', async () => {
    // en klient som läcker en rad för ett objekt som inte efterfrågades
    const sb = { from: () => ({ select: () => ({ in: () => ({ order: () => ({ range: () => Promise.resolve({ data: [{ id: 'x', objekt_id: 'oLAKT', typ: 'marker', t: 'powerline', z: null, l: null, a: null, c: null }], error: null }) }) }) }) }) };
    const r = await lasVarningar(sb, ['o001'], SNABB);
    expect(Object.keys(r.ok)).toEqual(['o001']);
    expect(r.ok.o001).toEqual({ faror: [], hansyn: [] });
  });
});

describe('varningFor — okänt är aldrig "ingen"', () => {
  const lage: VarningsLage = { ok: { a: { faror: [], hansyn: [] }, b: { faror: [{ label: 'Kraftledning', kommentar: null }], hansyn: [] } }, fel: { c: true } };
  it('läst (även tomt) → ObjWarn; misslyckat → "fel"; aldrig läst → "laddar"', () => {
    expect(varningFor(lage, 'a')).toEqual({ faror: [], hansyn: [] });
    expect(varningFor(lage, 'b')).toBe(lage.ok.b);
    expect(varningFor(lage, 'c')).toBe('fel');
    expect(varningFor(lage, 'd')).toBe('laddar');
    expect(varningFor(TOMT_LAGE, 'a')).toBe('laddar');
  });
  it('meddelandet är ordagrant det beställda', () => {
    expect(VARNING_LASFEL).toBe('Kunde inte läsa faror och hänsyn — kolla planeringen');
  });
});

describe('slaIhop', () => {
  const tom = { faror: [], hansyn: [] };
  it('en lyckad läsning ersätter ett tidigare fel', () => {
    const l = slaIhop({ ok: {}, fel: { a: true, b: true } }, { ok: { a: tom }, fel: [] });
    expect(varningFor(l, 'a')).toEqual(tom);
    expect(varningFor(l, 'b')).toBe('fel');
    expect(l.fel).toEqual({ b: true });   // själva posten rensas — varningFor ser den inte (ok kollas före fel), men den är en del av lägets kontrakt
  });
  it('ett fel skriver ALDRIG över något som lästes lyckat', () => {
    const l = slaIhop({ ok: { a: tom }, fel: {} }, { ok: {}, fel: ['a', 'b'] });
    expect(varningFor(l, 'a')).toEqual(tom);
    expect(varningFor(l, 'b')).toBe('fel');
    expect(l.fel).toEqual({ b: true });   // 'a' blir aldrig en fel-post heller
  });
  it('en nyare lyckad läsning ersätter en äldre', () => {
    const ny = { faror: [{ label: 'Kraftledning', kommentar: 'ny' }], hansyn: [] };
    expect(varningFor(slaIhop({ ok: { a: tom }, fel: {} }, { ok: { a: ny }, fel: [] }), 'a')).toBe(ny);
  });
  it('ändrar inte det den fick in', () => {
    const fore: VarningsLage = { ok: { a: tom }, fel: { b: true } };
    const kopia = JSON.stringify(fore);
    slaIhop(fore, { ok: { b: tom }, fel: ['c'] });
    expect(JSON.stringify(fore)).toBe(kopia);
  });
});

describe('objektAttLasaForst — bara icke-avslutade', () => {
  it('tar bort avslutat och klar, behåller allt annat i ursprunglig ordning', () => {
    const lista = ['planerad', 'avslutat', 'pagaende', 'klar', 'oplanerad', 'skordning', 'skotning'].map((status, i) => ({ id: 'o' + i, status }));
    expect(objektAttLasaForst(lista)).toEqual(['o0', 'o2', 'o4', 'o5', 'o6']);
  });
});

describe('tillMarkeringRad', () => {
  it('flyttar tillbaka de projicerade nycklarna till data.type/zoneType/lineType/arrowType/comment', () => {
    expect(tillMarkeringRad({ objekt_id: 'o1', typ: 'zone', t: null, z: 'naturecorner', l: null, a: null, c: 'hänsyn' }))
      .toEqual({ objekt_id: 'o1', typ: 'zone', data: { type: null, zoneType: 'naturecorner', lineType: null, arrowType: null, comment: 'hänsyn' } });
  });
});
