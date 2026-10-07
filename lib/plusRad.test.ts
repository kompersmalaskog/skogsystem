import { describe, it, expect } from 'vitest';
import {
  PLATSER, MAX_FASTA, STANDARD_ORDNING, PILL_SYMBOLER, arDockPost, postNyckel, tomtPlusRad, tolkaPlusRad, hamtaPlusRad, sparaPlusRad, plusRadNyckel,
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
const fast = (s: PlusRadState, post: PlusPost): PlusRadState => { const r = fastaPost(s, post); if (!r.ok) throw new Error('kunde inte fästa ' + postNyckel(post) + ': ' + r.skal); return r.state; };

describe('dockan: sex symbolknappar (+ Alla och ×)', () => {
  it('KODBEVIS: sex platser åt symboler', () => {
    expect(PLATSER).toBe(6);
    expect(MAX_FASTA).toBe(6);
    expect(STANDARD_ORDNING).toHaveLength(MAX_FASTA);
  });
  it('innan något är använt: standarddockan (Fuktig mark, Brant, Kulturminne, Avlägg, Vindfälle, Manuell fällning)', () => {
    expect(nycklar(tomtPlusRad())).toEqual(['symbol:wet', 'symbol:steep', 'symbol:culturemonument', 'symbol:landing', 'symbol:windfall', 'symbol:manualfelling']);
  });
  it('KODBEVIS: dockan innehåller BARA symboler — aldrig mätverktyg, Rita eller lager', () => {
    let s = tomtPlusRad();
    s = anvand(s, { typ: 'matning', id: 'strackan' }, 50);
    s = anvand(s, { typ: 'rita', id: 'yta' }, 50);
    s = anvand(s, lager('wetlands'), 50);
    expect(beraknaRad(s).every((r) => r.post.typ === 'symbol')).toBe(true);
    expect(nycklar(s)).toEqual(nycklar(tomtPlusRad()));   // hur ofta de än används ändras dockan inte
  });
  it('KODBEVIS: Högstubbe och Evighetsträd hamnar aldrig i dockan (pillen har dem) — hur ofta de än används', () => {
    expect(PILL_SYMBOLER).toEqual(['highstump', 'eternitytree']);
    let s = anvand(tomtPlusRad(), sym('highstump'), 99);
    s = anvand(s, sym('eternitytree'), 99);
    expect(nycklar(s)).toEqual(nycklar(tomtPlusRad()));
    expect(fastaPost(s, sym('highstump'))).toEqual({ ok: false, skal: 'ej-symbol' });
    expect(arDockPost(sym('highstump'))).toBe(false);
    expect(arDockPost(sym('landing'))).toBe(true);
  });
});

describe('sortering: fasta först, resten efter mest använt', () => {
  it('KODBEVIS: mest använt först — en ofta använd symbol tar en automatisk plats och trycker ut den sista standardsymbolen', () => {
    const s = anvand(tomtPlusRad(), sym('brashpile'), 9);
    expect(nycklar(s)).toEqual(['symbol:brashpile', 'symbol:wet', 'symbol:steep', 'symbol:culturemonument', 'symbol:landing', 'symbol:windfall']);
  });
  it('lika många användningar → standardordningen; okända (icke-standard) efter standardposterna', () => {
    let s = anvand(tomtPlusRad(), sym('road'), 1);
    s = anvand(s, sym('landing'), 1);
    // båda 1 → landing (standardindex 3) före road (inget standardindex)
    expect(nycklar(s).slice(0, 2)).toEqual(['symbol:landing', 'symbol:road']);
  });
  it('FASTA kommer före allt automatiskt, i den ordning de fästes — även om något annat används mer', () => {
    let s = anvand(tomtPlusRad(), sym('wet'), 50);
    s = fast(s, sym('bridge'));
    s = fast(s, sym('ditch'));
    expect(nycklar(s).slice(0, 3)).toEqual(['symbol:bridge', 'symbol:ditch', 'symbol:wet']);
    expect(beraknaRad(s).map((r) => r.fast)).toEqual([true, true, false, false, false, false]);
  });
  it('en fast post räknas inte två gånger i den automatiska delen', () => {
    let s = anvand(tomtPlusRad(), sym('landing'), 5);
    s = fast(s, sym('landing'));
    const k = nycklar(s);
    expect(k.filter((x) => x === 'symbol:landing')).toHaveLength(1);
    expect(k).toHaveLength(6);
  });
  it('dockan är alltid exakt sex platser (finns det tillräckligt många kandidater)', () => {
    let s = tomtPlusRad();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) s = anvand(s, sym(id), 2);
    expect(beraknaRad(s)).toHaveLength(6);
  });
  it('sorteringen är stabil: samma state ger samma docka varje gång', () => {
    let s = tomtPlusRad();
    for (const id of ['z', 'y', 'x']) s = anvand(s, sym(id), 4);
    expect(nycklar(s)).toEqual(nycklar(s));
    expect(nycklar(s).slice(0, 3)).toEqual(['symbol:x', 'symbol:y', 'symbol:z']);   // lika → alfabetiskt
  });
  it('symboler som inte längre finns (finns-filtret) hoppas över, och nästa kandidat tar platsen', () => {
    let s = anvand(tomtPlusRad(), sym('borttagen'), 20);
    s = fast(s, sym('borttagen2'));
    const rad = beraknaRad(s, (p) => !p.id.startsWith('borttagen'));
    expect(rad.map((r) => postNyckel(r.post))).toEqual(nycklar(tomtPlusRad()));
  });
});

describe('Fast i dockan / Lossa — max sex fasta', () => {
  it('KODBEVIS: max sex — en sjunde fast symbol avvisas (full), inget byts ut i smyg', () => {
    let s = tomtPlusRad();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) s = fast(s, sym(id));
    expect(s.fasta).toHaveLength(6);
    expect(fastaPost(s, sym('g'))).toEqual({ ok: false, skal: 'full' });
    expect(s.fasta.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
  it('samma post två gånger → finns', () => {
    const s = fast(tomtPlusRad(), sym('wet'));
    expect(fastaPost(s, sym('wet'))).toEqual({ ok: false, skal: 'finns' });
    expect(arFast(s, sym('wet'))).toBe(true);
  });
  it('lager, Rita och mätning går inte att fästa i dockan', () => {
    for (const post of [lager('wetlands'), { typ: 'rita', id: 'yta' } as PlusPost, { typ: 'matning', id: 'strackan' } as PlusPost]) {
      expect(fastaPost(tomtPlusRad(), post)).toEqual({ ok: false, skal: 'ej-symbol' });
    }
  });
  it('Lossa: symbolen blir automatisk igen och hamnar där dess användning placerar den', () => {
    let s = anvand(tomtPlusRad(), sym('bridge'), 10);
    s = fast(s, sym('bridge'));
    s = fast(s, sym('ditch'));
    expect(nycklar(s).slice(0, 2)).toEqual(['symbol:bridge', 'symbol:ditch']);
    s = lossaPost(s, sym('ditch'));
    expect(arFast(s, sym('ditch'))).toBe(false);
    expect(nycklar(s)[0]).toBe('symbol:bridge');
    s = lossaPost(s, sym('bridge'));
    expect(nycklar(s)[0]).toBe('symbol:bridge');   // 10 användningar → fortfarande först, nu automatiskt
    expect(beraknaRad(s)[0].fast).toBe(false);
  });
});

describe('sparas per maskin och överlever omstart', () => {
  it('KODBEVIS: fasta överlever omstart (spara → ny hämtning ur samma lagring)', () => {
    const l = lagring();
    let s = fast(tomtPlusRad(), sym('bridge'));
    s = fast(s, sym('ditch'));
    s = anvand(s, sym('wet'), 4);
    expect(sparaPlusRad('R64428', s, l)).toBe(true);
    const efterOmstart = hamtaPlusRad('R64428', l);
    expect(efterOmstart.fasta).toEqual(s.fasta);
    expect(efterOmstart.anv).toEqual(s.anv);
    expect(nycklar(efterOmstart)).toEqual(nycklar(s));
  });
  it('en maskins val rör aldrig en annans', () => {
    const l = lagring();
    sparaPlusRad('R64428', fast(tomtPlusRad(), sym('wet')), l);
    expect(hamtaPlusRad('A030353', l)).toEqual(tomtPlusRad());
    expect(plusRadNyckel('R64428')).not.toBe(plusRadNyckel('A030353'));
    expect(Array.from(l._m.keys())).toEqual([plusRadNyckel('R64428')]);
  });
  it('maskin saknas delar nyckeln "ingen"', () => {
    expect(plusRadNyckel(null)).toBe(plusRadNyckel(''));
    expect(plusRadNyckel(undefined)).toContain(':ingen');
  });
  it('en äldre sparad rad (lager/Rita/mät som fasta, Högstubbe) kastas tyst — bara symboler blir kvar', () => {
    const gammal = JSON.stringify({
      fasta: [lager('wetlands'), { typ: 'rita', id: 'linje' }, { typ: 'matning', id: 'yta' }, sym('highstump'), sym('bridge'), sym('eternitytree'), sym('ditch')],
      anv: { 'matning:strackan': 12, 'symbol:highstump': 30, 'symbol:landing': 2 },
    });
    const s = tolkaPlusRad(gammal);
    expect(s.fasta.map(postNyckel)).toEqual(['symbol:bridge', 'symbol:ditch']);
    // användningen finns kvar (ofarlig), men påverkar inte dockan
    expect(s.anv['matning:strackan']).toBe(12);
    expect(nycklar(s).slice(0, 2)).toEqual(['symbol:bridge', 'symbol:ditch']);
    expect(nycklar(s)).not.toContain('matning:strackan');
    expect(nycklar(s)).not.toContain('symbol:highstump');
  });
  it('trasig JSON / fel form / okända poster / dubbletter / överskott → rensas tyst, aldrig ett fel', () => {
    for (const trasig of ['{', 'inte json', 'null', '42', '[]']) expect(tolkaPlusRad(trasig)).toEqual(tomtPlusRad());
    const blandat = JSON.stringify({
      fasta: [sym('a'), sym('a'), { typ: 'rita', id: 'hittepa' }, { typ: 'raket', id: 'x' }, { typ: 'symbol' }, null, 5, sym('b'), sym('c'), sym('d'), sym('e'), sym('f'), sym('g')],
      anv: { 'symbol:x': 3, 'rita:hittepa': 9, 'raket:y': 2, 'symbol:z': -1, 'symbol:w': 'många', 'lager:q': 2.9, 'inget-kolon': 4 },
    });
    const s = tolkaPlusRad(blandat);
    expect(s.fasta.map(postNyckel)).toEqual(['symbol:a', 'symbol:b', 'symbol:c', 'symbol:d', 'symbol:e', 'symbol:f']);   // dubblett + okända kastade, max sex
    expect(s.anv).toEqual({ 'symbol:x': 3, 'lager:q': 2 });
  });
  it('blockerad localStorage → tom docka (standard), kastar aldrig; skrivfel visas som false', () => {
    const blockerad: Lagring = { getItem: () => { throw new Error('blockerad'); }, setItem: () => { throw new Error('blockerad'); } };
    expect(hamtaPlusRad('R64428', blockerad)).toEqual(tomtPlusRad());
    expect(sparaPlusRad('R64428', tomtPlusRad(), blockerad)).toBe(false);
    expect(sparaPlusRad('R64428', tomtPlusRad(), null)).toBe(false);
  });
});
