import { describe, it, expect } from 'vitest';
import {
  PLATSER, MAX_FASTA, STANDARD_ORDNING, postNyckel, tomtPlusRad, tolkaPlusRad, hamtaPlusRad, sparaPlusRad, plusRadNyckel,
  noteraAnvandning, beraknaRad, fastaPost, lossaPost, arFast, type PlusPost, type PlusRadState, type Lagring,
} from './plusRad';

const lagring = (start: Record<string, string> = {}): Lagring & { _m: Map<string, string> } => {
  const m = new Map(Object.entries(start));
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => { m.set(k, String(v)); }, _m: m };
};
const sym = (id: string): PlusPost => ({ typ: 'symbol', id });
const lager = (id: string): PlusPost => ({ typ: 'lager', id });
const nycklar = (s: PlusRadState) => beraknaRad(s).map((r) => postNyckel(r.post));
const anvand = (s: PlusRadState, post: PlusPost, n: number) => { for (let i = 0; i < n; i++) s = noteraAnvandning(s, post); return s; };

describe('raden: sex platser, den sjätte är Alla → fem platser åt innehåll', () => {
  it('KODBEVIS: max sex platser totalt (fem + Alla)', () => {
    expect(PLATSER).toBe(6);
    expect(MAX_FASTA).toBe(5);
    expect(STANDARD_ORDNING).toHaveLength(MAX_FASTA);
  });
  it('innan något är använt: standardraden (Högstubbe, Evighetsträd, Mät sträcka, Mät yta, Avlägg)', () => {
    expect(nycklar(tomtPlusRad())).toEqual(['symbol:highstump', 'symbol:eternitytree', 'matning:strackan', 'matning:yta', 'symbol:landing']);
  });
});

describe('sortering: fasta först, resten efter mest använt', () => {
  it('KODBEVIS: mest använt först — en ofta använd symbol tar en automatisk plats från standardposterna', () => {
    let s = anvand(tomtPlusRad(), sym('wet'), 9);
    s = anvand(s, sym('highstump'), 3);
    // wet (9) > highstump (3) > övriga standard (0, i standardordning)
    expect(nycklar(s)).toEqual(['symbol:wet', 'symbol:highstump', 'symbol:eternitytree', 'matning:strackan', 'matning:yta']);
  });
  it('lika många användningar → standardordningen; okända (icke-standard) efter standardposterna', () => {
    let s = anvand(tomtPlusRad(), sym('wet'), 1);
    s = anvand(s, sym('landing'), 1);
    // båda 1 → landing (standardindex 4) före wet (inget standardindex)
    expect(nycklar(s).slice(0, 2)).toEqual(['symbol:landing', 'symbol:wet']);
  });
  it('FASTA kommer före allt automatiskt, i den ordning de fästes — även om något annat används mer', () => {
    let s = anvand(tomtPlusRad(), sym('wet'), 50);
    const a = fastaPost(s, lager('wetlands'));
    expect(a.ok).toBe(true);
    s = (a as any).state;
    const b = fastaPost(s, { typ: 'rita', id: 'yta' });
    s = (b as any).state;
    expect(nycklar(s).slice(0, 3)).toEqual(['lager:wetlands', 'rita:yta', 'symbol:wet']);
    expect(beraknaRad(s).map((r) => r.fast)).toEqual([true, true, false, false, false]);
  });
  it('en fast post räknas inte två gånger i den automatiska delen', () => {
    let s = anvand(tomtPlusRad(), sym('highstump'), 5);
    s = (fastaPost(s, sym('highstump')) as any).state;
    const k = nycklar(s);
    expect(k.filter((x) => x === 'symbol:highstump')).toHaveLength(1);
    expect(k).toHaveLength(5);
  });
  it('raden är alltid exakt fem platser (finns det tillräckligt många kandidater)', () => {
    let s = tomtPlusRad();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) s = anvand(s, sym(id), 2);
    expect(beraknaRad(s)).toHaveLength(5);
  });
  it('sorteringen är stabil: samma state ger samma rad varje gång', () => {
    let s = tomtPlusRad();
    for (const id of ['z', 'y', 'x']) s = anvand(s, sym(id), 4);
    expect(nycklar(s)).toEqual(nycklar(s));
    expect(nycklar(s).slice(0, 3)).toEqual(['symbol:x', 'symbol:y', 'symbol:z']);   // lika → alfabetiskt
  });
  it('poster som inte längre finns (finns-filtret) hoppas över, och nästa kandidat tar platsen', () => {
    let s = anvand(tomtPlusRad(), lager('borttaget'), 20);
    s = (fastaPost(s, lager('borttaget2')) as any).state;
    const rad = beraknaRad(s, (p) => !p.id.startsWith('borttaget'));
    expect(rad.map((r) => postNyckel(r.post))).toEqual(['symbol:highstump', 'symbol:eternitytree', 'matning:strackan', 'matning:yta', 'symbol:landing']);
  });
});

describe('Fast i raden / Lossa — max fem fasta', () => {
  it('KODBEVIS: max sex platser — en sjätte fast post avvisas (full), inget byts ut i smyg', () => {
    let s = tomtPlusRad();
    for (const id of ['a', 'b', 'c', 'd', 'e']) s = (fastaPost(s, sym(id)) as any).state;
    expect(s.fasta).toHaveLength(5);
    expect(fastaPost(s, sym('f'))).toEqual({ ok: false, skal: 'full' });
    expect(s.fasta.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('samma post två gånger → finns', () => {
    const s = (fastaPost(tomtPlusRad(), sym('wet')) as any).state;
    expect(fastaPost(s, sym('wet'))).toEqual({ ok: false, skal: 'finns' });
    expect(arFast(s, sym('wet'))).toBe(true);
  });
  it('Lossa: posten blir automatisk igen och hamnar där dess användning placerar den', () => {
    let s = anvand(tomtPlusRad(), sym('wet'), 10);
    s = (fastaPost(s, sym('wet')) as any).state;
    s = (fastaPost(s, lager('wetlands')) as any).state;
    expect(nycklar(s).slice(0, 2)).toEqual(['symbol:wet', 'lager:wetlands']);
    s = lossaPost(s, lager('wetlands'));
    expect(arFast(s, lager('wetlands'))).toBe(false);
    expect(nycklar(s)[0]).toBe('symbol:wet');
    s = lossaPost(s, sym('wet'));
    expect(nycklar(s)[0]).toBe('symbol:wet');   // 10 användningar → fortfarande först, nu automatiskt
    expect(beraknaRad(s)[0].fast).toBe(false);
  });
});

describe('sparas per maskin och överlever omstart', () => {
  it('KODBEVIS: fasta överlever omstart (spara → ny hämtning ur samma lagring)', () => {
    const l = lagring();
    let s = (fastaPost(tomtPlusRad(), lager('wetlands')) as any).state;
    s = (fastaPost(s, { typ: 'rita', id: 'linje' }) as any).state;
    s = anvand(s, sym('wet'), 4);
    expect(sparaPlusRad('R64428', s, l)).toBe(true);
    const efterOmstart = hamtaPlusRad('R64428', l);
    expect(efterOmstart.fasta).toEqual(s.fasta);
    expect(efterOmstart.anv).toEqual(s.anv);
    expect(nycklar(efterOmstart)).toEqual(nycklar(s));
  });
  it('en maskins val rör aldrig en annans', () => {
    const l = lagring();
    sparaPlusRad('R64428', (fastaPost(tomtPlusRad(), sym('wet')) as any).state, l);
    expect(hamtaPlusRad('A030353', l)).toEqual(tomtPlusRad());
    expect(plusRadNyckel('R64428')).not.toBe(plusRadNyckel('A030353'));
    expect(Array.from(l._m.keys())).toEqual([plusRadNyckel('R64428')]);
  });
  it('maskin saknas delar nyckeln "ingen"', () => {
    expect(plusRadNyckel(null)).toBe(plusRadNyckel(''));
    expect(plusRadNyckel(undefined)).toContain(':ingen');
  });
  it('trasig JSON / fel form / okända poster / dubbletter / överskott → rensas tyst, aldrig ett fel', () => {
    for (const trasig of ['{', 'inte json', 'null', '42', '[]']) expect(tolkaPlusRad(trasig)).toEqual(tomtPlusRad());
    const blandat = JSON.stringify({
      fasta: [sym('a'), sym('a'), { typ: 'rita', id: 'hittepa' }, { typ: 'raket', id: 'x' }, { typ: 'symbol' }, null, 5, sym('b'), lager('c'), sym('d'), sym('e'), sym('f')],
      anv: { 'symbol:x': 3, 'rita:hittepa': 9, 'raket:y': 2, 'symbol:z': -1, 'symbol:w': 'många', 'lager:q': 2.9, 'inget-kolon': 4 },
    });
    const s = tolkaPlusRad(blandat);
    expect(s.fasta.map(postNyckel)).toEqual(['symbol:a', 'symbol:b', 'lager:c', 'symbol:d', 'symbol:e']);   // dubblett + okända kastade, max fem
    expect(s.anv).toEqual({ 'symbol:x': 3, 'lager:q': 2 });
  });
  it('blockerad localStorage → tom rad (standard), kastar aldrig; skrivfel visas som false', () => {
    const blockerad: Lagring = { getItem: () => { throw new Error('blockerad'); }, setItem: () => { throw new Error('blockerad'); } };
    expect(hamtaPlusRad('R64428', blockerad)).toEqual(tomtPlusRad());
    expect(sparaPlusRad('R64428', tomtPlusRad(), blockerad)).toBe(false);
    expect(sparaPlusRad('R64428', tomtPlusRad(), null)).toBe(false);
  });
});
