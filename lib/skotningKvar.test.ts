import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hamtaSkotningKvar, raknaSkotningKvar, SKOTNING_KVAR_MIN_M3 } from './skotningKvar';

const dim = (objekt_id: string, vo_nummer: string | null, extra: Record<string, unknown> = {}) => ({ objekt_id, vo_nummer, skotning_avslutad: null, egen_skotning: false, ...extra });
const tom = { dim: [], prod: [], lass: [], manuell: [] };

describe('raknaSkotningKvar — samma villkor som den gamla väljaren', () => {
  it('Vällust-formen: 900 m³ skördat, 600 skotat → skotning kvar', () => {
    const k = raknaSkotningKvar({ ...tom, dim: [dim('v', 'VO-V')], prod: [{ objekt_id: 'v', volym_m3sub: 900 }], lass: [{ objekt_id: 'v', volym_m3sub: 600 }] });
    expect(Array.from(k)).toEqual(['VO-V']);
  });
  it('gränsen: mer än 5 m³ kvar räknas, precis 5 räknas inte', () => {
    const med = (skotat: number) => raknaSkotningKvar({ ...tom, dim: [dim('v', 'VO-V')], prod: [{ objekt_id: 'v', volym_m3sub: 100 }], lass: [{ objekt_id: 'v', volym_m3sub: skotat }] });
    expect(SKOTNING_KVAR_MIN_M3).toBe(5);
    expect(med(95).size).toBe(0);
    expect(med(94.9).size).toBe(1);
  });
  it('skotning_avslutad eller egen_skotning → aldrig kvar', () => {
    const rader = { prod: [{ objekt_id: 'v', volym_m3sub: 900 }], lass: [] };
    expect(raknaSkotningKvar({ ...tom, ...rader, dim: [dim('v', 'VO-V', { skotning_avslutad: '2026-09-20' })] }).size).toBe(0);
    expect(raknaSkotningKvar({ ...tom, ...rader, dim: [dim('v', 'VO-V', { egen_skotning: true })] }).size).toBe(0);
  });
  it('manuell EGEN skotning räknas som skotat, omlastning aldrig, grot-rader (maskin_id null) hoppas över', () => {
    const bas = { ...tom, dim: [dim('v', 'VO-V')], prod: [{ objekt_id: 'v', volym_m3sub: 100 }] };
    expect(raknaSkotningKvar({ ...bas, manuell: [{ objekt_id: 'v', maskin_id: 'M1', volym_egen_skotning: 100 }] }).size).toBe(0);
    expect(raknaSkotningKvar({ ...bas, manuell: [{ objekt_id: 'v', maskin_id: 'M1', volym_m3: 100, ar_omlastning: true }] }).size).toBe(1);
    expect(raknaSkotningKvar({ ...bas, manuell: [{ objekt_id: 'v', maskin_id: null, volym_m3: 100 }] }).size).toBe(1);
  });
  it('flera rader per objekt summeras; rader utan objekt_id ignoreras', () => {
    const k = raknaSkotningKvar({ ...tom, dim: [dim('v', 'VO-V')], prod: [{ objekt_id: 'v', volym_m3sub: 60 }, { objekt_id: 'v', volym_m3sub: 60 }, { objekt_id: null, volym_m3sub: 999 }], lass: [{ objekt_id: 'v', volym_m3sub: 50 }] });
    expect(Array.from(k)).toEqual(['VO-V']);
  });
});

// Fake av supabase-js som beter sig som PostgREST: utan .range() kapar den vid 1 000 rader, och utan .order() kommer raderna i en
// OSORTERAD (men fast) ordning — så en hämtning som glömmer sortera får dubbletter/saknade rader, precis som i prod (STATUS.md).
type Tabeller = Record<string, any[]>;
function fakeKlient(tabeller: Tabeller, opt: { felPaTabell?: string; felFranSida?: number } = {}) {
  const anrop: Record<string, number> = {};
  const klient = {
    from: (t: string) => ({
      select: () => {
        let sort: string | null = null;
        let filterIs: [string, null] | null = null;
        const b: any = {
          order: (k: string) => { sort = k; return b; },
          is: (k: string, v: null) => { filterIs = [k, v]; return b; },
          range: (fran: number, till: number) => {
            anrop[t] = (anrop[t] ?? 0) + 1;
            if (t === opt.felPaTabell && fran >= (opt.felFranSida ?? 0)) return Promise.resolve({ data: null, error: { message: 'nät' } });
            let rader = (tabeller[t] ?? []).filter((r) => !filterIs || r[filterIs[0]] == null);
            if (sort) { const k = sort; rader = [...rader].sort((x, y) => (x[k] < y[k] ? -1 : x[k] > y[k] ? 1 : 0)); }
            else rader = [...rader].sort((x, y) => (JSON.stringify(x).length % 7) - (JSON.stringify(y).length % 7) || (JSON.stringify(x) < JSON.stringify(y) ? 1 : -1));
            return Promise.resolve({ data: rader.slice(fran, Math.min(till + 1, fran + 1000)), error: null });
          },
        };
        return b;
      },
    }),
  };
  return { klient, anrop };
}
const smaTabeller = (): Tabeller => ({
  dim_objekt: [dim('v', 'VO-V')],
  vy_uppf_prod_per_objekt: [{ objekt_id: 'v', volym_m3sub: 900 }],
  vy_uppf_lass_per_objekt: [{ objekt_id: 'v', volym_m3sub: 600 }],
  skotare_objekt_manuell: [],
});

describe('hamtaSkotningKvar — fel är okänt, aldrig "inga"', () => {
  it('alla fyra frågor lyckas → mängden', async () => {
    expect(Array.from((await hamtaSkotningKvar(fakeKlient(smaTabeller()).klient))!)).toEqual(['VO-V']);
  });
  it('någon fråga ger fel → null', async () => {
    for (const t of ['dim_objekt', 'vy_uppf_prod_per_objekt', 'vy_uppf_lass_per_objekt', 'skotare_objekt_manuell']) {
      expect(await hamtaSkotningKvar(fakeKlient(smaTabeller(), { felPaTabell: t }).klient)).toBeNull();
    }
  });
  it('en fråga som kastar → null', async () => {
    expect(await hamtaSkotningKvar({ from: () => { throw new Error('boom'); } } as any)).toBeNull();
  });
});

describe('hamtaSkotningKvar — fler än 1 000 rader läses i omgångar tills allt är läst', () => {
  // 2 500 objekt. Varje objekt har VO-{n}, skördat 100 m³; de med jämnt n har skotat 100 (klart), de med udda n har skotat 0 (100 m³ kvar).
  // Manuell egen skotning (1 200 rader) täcker de udda objekten n = 1…2399 → de är klara; kvar blir bara udda n ≥ 2401.
  const N = 2500;
  const id = (n: number) => `o${String(n).padStart(5, '0')}`;
  const stor = (): Tabeller => {
    const t: Tabeller = { dim_objekt: [], vy_uppf_prod_per_objekt: [], vy_uppf_lass_per_objekt: [], skotare_objekt_manuell: [] };
    for (let n = 1; n <= N; n++) {
      t.dim_objekt.push(dim(id(n), `VO-${n}`));
      t.vy_uppf_prod_per_objekt.push({ objekt_id: id(n), volym_m3sub: 100 });
      t.vy_uppf_lass_per_objekt.push({ objekt_id: id(n), volym_m3sub: n % 2 === 0 ? 100 : 0 });
    }
    for (let n = 1, i = 1; n < 2400; n += 2, i++) t.skotare_objekt_manuell.push({ id: i, objekt_id: id(n), maskin_id: 'M1', volym_egen_skotning: 100, datum_fran: null });
    t.skotare_objekt_manuell.push({ id: 9000, objekt_id: id(1), maskin_id: 'M1', volym_egen_skotning: 50, datum_fran: '2026-01-01' });   // filtreras bort av .is('datum_fran', null)
    return t;
  };
  const forvantat = () => {
    const k = new Set<string>();
    for (let n = 2401; n <= N; n += 2) k.add(`VO-${n}`);
    return k;
  };

  it('2 500 rader per tabell (1 200 manuella): resultatet är exakt det som en komplett läsning ger', async () => {
    const { klient, anrop } = fakeKlient(stor());
    const k = await hamtaSkotningKvar(klient);
    expect(k).not.toBeNull();
    expect(Array.from(k!).sort()).toEqual(Array.from(forvantat()).sort());
    expect(k!.size).toBe(50);
    expect(anrop.dim_objekt).toBe(3);                       // 1 000 + 1 000 + 500
    expect(anrop.vy_uppf_prod_per_objekt).toBe(3);
    expect(anrop.vy_uppf_lass_per_objekt).toBe(3);
    expect(anrop.skotare_objekt_manuell).toBe(2);           // 1 000 + 200
  });

  it('en klippt läsning (bara första 1 000 raderna) hade gett ett annat svar — testet kan alltså fånga felet', () => {
    const t = stor();
    const klippt = raknaSkotningKvar({ dim: t.dim_objekt.slice(0, 1000), prod: t.vy_uppf_prod_per_objekt.slice(0, 1000), lass: t.vy_uppf_lass_per_objekt.slice(0, 1000), manuell: t.skotare_objekt_manuell.filter((m) => m.datum_fran == null).slice(0, 1000) });
    expect(Array.from(klippt).sort()).not.toEqual(Array.from(forvantat()).sort());
  });

  it('sidgränsen 1 000 exakt: en tom sista sida avslutar läsningen utan fel', async () => {
    const t = smaTabeller();
    t.dim_objekt = []; t.vy_uppf_prod_per_objekt = []; t.vy_uppf_lass_per_objekt = [];
    for (let n = 1; n <= 1000; n++) { t.dim_objekt.push(dim(id(n), `VO-${n}`)); t.vy_uppf_prod_per_objekt.push({ objekt_id: id(n), volym_m3sub: 10 }); }
    const { klient, anrop } = fakeKlient(t);
    const k = await hamtaSkotningKvar(klient);
    expect(k!.size).toBe(1000);                              // 10 m³ skördat, inget skotat → kvar
    expect(anrop.dim_objekt).toBe(2);
  });

  it('fel på den ANDRA sidan → null, aldrig en halv lista som ser komplett ut', async () => {
    for (const t of ['dim_objekt', 'vy_uppf_prod_per_objekt', 'vy_uppf_lass_per_objekt', 'skotare_objekt_manuell']) {
      expect(await hamtaSkotningKvar(fakeKlient(stor(), { felPaTabell: t, felFranSida: 1000 }).klient)).toBeNull();
    }
  });
});

describe('vakt: samma villkor som ObjektValjare (som lever kvar orörd för maskinläget)', () => {
  const valjare = readFileSync(resolve(__dirname, '../app/planering/ObjektValjare.tsx'), 'utf8');
  it('gränsen "> 5" och de fyra källorna är desamma', () => {
    expect(valjare).toContain('if (sk - (skotat.get(vo) || 0) > 5) kvar.add(vo);');
    for (const k of ["from('dim_objekt')", "from('vy_uppf_prod_per_objekt')", "from('vy_uppf_lass_per_objekt')", "from('skotare_objekt_manuell')"]) expect(valjare).toContain(k);
    expect(valjare).toContain('if (skotKlar.has(vo) || egen.has(vo)) continue;');
    expect(valjare).toContain("const arKlartAvslutat = (o: any) => o.status === 'avslutat' && !harSkotningKvar(o);");
  });
});
