import { describe, it, expect } from 'vitest';
import {
  MAX_GENVAGAR, STANDARD_GENVAGAR, genvagarLagringsnyckel, tolkaGenvagar, hamtaGenvagar, sparaGenvagar,
  laggTillGenvag, taBortGenvag, FASTA_LAGERNAMN, MATNING_NAMN, INSTALLNING_NAMN, MATNING_IDS, INSTALLNING_IDS, hamtaSenast, noteraSenast, ordnaSenastForst, type Genvag, type Lagring,
} from './genvagar';

const lagring = (start: Record<string, string> = {}): Lagring & { _m: Map<string, string> } => {
  const m = new Map(Object.entries(start));
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => { m.set(k, String(v)); }, _m: m };
};

describe('genvägar — standard, max 4, per maskin', () => {
  it('KODBEVIS: standard är Högstubbe, Evighetsträd, Mät sträcka, Mät yta (4 st)', () => {
    expect(MAX_GENVAGAR).toBe(4);
    expect(STANDARD_GENVAGAR.map((g) => `${g.typ}:${g.id}`)).toEqual(['symbol:highstump', 'symbol:eternitytree', 'matning:strackan', 'matning:yta']);
    expect(hamtaGenvagar('R64428', lagring())).toEqual(STANDARD_GENVAGAR);
  });

  it('KODBEVIS: genvägar sparas PER MASKIN — en maskins val rör aldrig en annans', () => {
    const l = lagring();
    const rottne = laggTillGenvag(taBortGenvag(hamtaGenvagar('R64428', l), { typ: 'matning', id: 'yta' }), { typ: 'lager', id: 'wetlands' });
    expect(rottne.ok).toBe(true);
    if (rottne.ok) expect(sparaGenvagar('R64428', rottne.lista, l)).toBe(true);
    expect(hamtaGenvagar('R64428', l).map((g) => `${g.typ}:${g.id}`)).toEqual(['symbol:highstump', 'symbol:eternitytree', 'matning:strackan', 'lager:wetlands']);
    // Ponsse-skotaren har inte rörts → fortfarande standard
    expect(hamtaGenvagar('A030353', l)).toEqual(STANDARD_GENVAGAR);
    // egna nycklar per maskin
    expect(genvagarLagringsnyckel('R64428')).not.toBe(genvagarLagringsnyckel('A030353'));
    expect(Array.from(l._m.keys())).toEqual([genvagarLagringsnyckel('R64428')]);
  });

  it('KODBEVIS: max 4 — är det fullt går en femte inte in (inget byts ut i smyg)', () => {
    const fem: Genvag = { typ: 'lager', id: 'hansyn' };
    const r = laggTillGenvag([...STANDARD_GENVAGAR], fem);
    expect(r).toEqual({ ok: false, skal: 'full' });
    // efter att en tagits bort går den in
    const efter = laggTillGenvag(taBortGenvag([...STANDARD_GENVAGAR], { typ: 'matning', id: 'yta' }), fem);
    expect(efter.ok).toBe(true);
    if (efter.ok) expect(efter.lista).toHaveLength(4);
  });

  it('samma genväg två gånger → "finns" (ingen dubblett)', () => {
    expect(laggTillGenvag([{ typ: 'symbol', id: 'highstump' }], { typ: 'symbol', id: 'highstump' })).toEqual({ ok: false, skal: 'finns' });
  });

  it('tom lista är ett giltigt val (föraren tog bort allt) — standard kommer INTE tillbaka', () => {
    const l = lagring();
    sparaGenvagar('R64101', [], l);
    expect(hamtaGenvagar('R64101', l)).toEqual([]);
  });

  it('maskin saknas (admin/testläge) delar nyckeln "ingen"', () => {
    expect(genvagarLagringsnyckel(null)).toBe(genvagarLagringsnyckel(''));
    expect(genvagarLagringsnyckel(undefined)).toContain(':ingen');
  });

  it('trasig JSON / fel form → standard; okända poster kastas tyst; dubbletter och överskott klipps', () => {
    for (const trasig of ['{', 'inte json', '{"a":1}', '42']) {
      expect(hamtaGenvagar('X', lagring({ [genvagarLagringsnyckel('X')]: trasig }))).toEqual(STANDARD_GENVAGAR);
    }
    const blandat = JSON.stringify([
      { typ: 'symbol', id: 'highstump' }, { typ: 'symbol', id: 'highstump' },            // dubblett
      { typ: 'matning', id: 'hittepa' }, { typ: 'raket', id: 'x' }, { typ: 'symbol' }, null, 5,   // okända
      { typ: 'lager', id: 'wetlands' }, { typ: 'installning', id: 'kompass' }, { typ: 'matning', id: 'kor' },
      { typ: 'symbol', id: 'landing' },                                                   // femte giltiga → klipps
    ]);
    expect(tolkaGenvagar(blandat)!.map((g) => `${g.typ}:${g.id}`)).toEqual(['symbol:highstump', 'lager:wetlands', 'installning:kompass', 'matning:kor']);
  });

  it('blockerad localStorage → standard, kastar aldrig; skrivfel visas som false', () => {
    const blockerad: Lagring = { getItem: () => { throw new Error('blockerad'); }, setItem: () => { throw new Error('blockerad'); } };
    expect(hamtaGenvagar('R64428', blockerad)).toEqual(STANDARD_GENVAGAR);
    expect(sparaGenvagar('R64428', [], blockerad)).toBe(false);
    expect(sparaGenvagar('R64428', [], null)).toBe(false);
  });
});

describe('namn på genvägar', () => {
  it('varje mätläge och inställning har ett namn; fasta lager har svenska namn', () => {
    for (const id of MATNING_IDS) expect(MATNING_NAMN[id]).toBeTruthy();
    for (const id of INSTALLNING_IDS) expect(INSTALLNING_NAMN[id]).toBeTruthy();
    expect(FASTA_LAGERNAMN.sks_markfuktighet).toBe('Markfuktighet');
    expect(MATNING_NAMN.strackan).toBe('Mät sträcka');
    expect(MATNING_NAMN.yta).toBe('Mät yta');
  });
  it('"rotera" är en giltig inställningsgenväg (tolkas, inte kastas)', () => {
    expect(tolkaGenvagar(JSON.stringify([{ typ: 'installning', id: 'rotera' }, { typ: 'installning', id: 'kompass' }]))).toHaveLength(2);
  });
});

describe('senast använda symboler', () => {
  it('noteras först, utan dubbletter, per maskin', () => {
    const l = lagring();
    noteraSenast('A', 'landing', l); noteraSenast('A', 'wet', l); noteraSenast('A', 'landing', l);
    expect(hamtaSenast('A', l)).toEqual(['landing', 'wet']);
    expect(hamtaSenast('B', l)).toEqual([]);
  });
  it('max 12', () => {
    const l = lagring();
    for (let i = 0; i < 20; i++) noteraSenast('A', 's' + i, l);
    expect(hamtaSenast('A', l)).toHaveLength(12);
    expect(hamtaSenast('A', l)[0]).toBe('s19');
  });
  it('ordnaSenastForst: senast först, resten i ursprunglig ordning, okända id:n ignoreras', () => {
    const alla = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(ordnaSenastForst(alla, ['c', 'zzz', 'a']).map((x) => x.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(ordnaSenastForst(alla, []).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('trasig/blockerad lagring ger tom ordning, aldrig ett fel', () => {
    expect(hamtaSenast('A', lagring({ [`korvy_senast_v1:A`]: 'inte json' }))).toEqual([]);
    const blockerad: Lagring = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(hamtaSenast('A', blockerad)).toEqual([]);
    expect(() => noteraSenast('A', 'wet', blockerad)).not.toThrow();
  });
});
