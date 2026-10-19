import { describe, expect, it } from 'vitest';
import { byggAvlagg, traffaAvlagg, nastaEgnaNummer, egnaNummer, visaNummer } from './avlagg';
import { LOSSNING, nyDetektor, stegaDetektor, avvisaFraga, type DetektorState, type Handelse } from './lossning';
import type { Avlagg } from './typer';

// 1 m ≈ 0,000009 grader lat
const M = 1 / 111320;
const BAS = { lat: 56.6, lng: 15.8 };
const pos = (nordM: number, ostM = 0) => ({ lat: BAS.lat + nordM * M, lng: BAS.lng + (ostM * M) / Math.cos((BAS.lat * Math.PI) / 180) });
const avl = (nummer: string, nordM: number, ostM = 0): Avlagg => ({ id: `vida:${nummer}`, nummer, kalla: 'vida', ...pos(nordM, ostM) });

/** Kör detektorn över en lista (sek, nordM, ostM) och samla händelserna. */
function kor(fixar: Array<[number, number, number?]>, avlagg: Avlagg[], start: DetektorState = nyDetektor(), spar?: number) {
  let st = start;
  const h: Handelse[] = [];
  for (const [s, n, o] of fixar) {
    const r = stegaDetektor(st, { ...pos(n, o ?? 0), ts: 1_000_000 + s * 1000 }, { avlagg, avstandTillSpar: spar });
    st = r.state;
    if (r.handelse) h.push(r.handelse);
  }
  return { st, h };
}
const still = (fran: number, till: number, nord: number, ost = 0): Array<[number, number, number]> =>
  Array.from({ length: Math.floor((till - fran) / 2) + 1 }, (_, i) => [fran + i * 2, nord + (i % 2) * 0.5, ost] as [number, number, number]);

describe('avlägg', () => {
  it('närmaste avlägg inom 40 m, annars inget', () => {
    const a = [avl('2', 0), avl('3', 500)];
    expect(traffaAvlagg(pos(20), a).narmaste?.nummer).toBe('2');
    expect(traffaAvlagg(pos(60), a).narmaste).toBeNull();
  });
  it('två avlägg inom 50 m från varandra är tvetydiga och listas närmast först', () => {
    const t = traffaAvlagg(pos(5), [avl('2', 0), avl('3', 30)]);
    expect(t.tvetydigt).toBe(true);
    expect(t.kandidater.map((k) => k.nummer)).toEqual(['2', '3']);
  });
  it('avlägg 60 m isär är inte tvetydiga', () => {
    expect(traffaAvlagg(pos(0), [avl('2', 0), avl('3', 60)]).tvetydigt).toBe(false);
  });
  it('Vidas nummer behålls och egna får löpnummer efter det högsta', () => {
    const a = byggAvlagg([{ nummer: 'Avlägg 1', ...BAS }, { nummer: '01-2', ...BAS }], [{ id: '200', ...BAS }, { id: '100', ...BAS }]);
    // '01-2' räknas som 1: egna avlägg får 2 och 3 i skapandeordning (id 100 före 200)
    expect(a.map((x) => x.nummer)).toEqual(['1', '01-2', '3', '2']);
    expect(visaNummer('Avlägg 7')).toBe('7');
  });
  it('sparat nummer på egen markering behålls', () => {
    expect(egnaNummer([], [{ id: '1', ...BAS, nummer: 9 }, { id: '2', ...BAS }]).get('2')).toBe('10');
    expect(nastaEgnaNummer([avl('4', 0)])).toBe('5');
  });
});

describe('lossningsdetektor', () => {
  const a = [avl('2', 0)];

  it('30 s stilla vid ett avlägg = nytt lass (första lossningen)', () => {
    const { h } = kor(still(0, 40, 5), a);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ typ: 'lossning', lossning: 'nytt_lass' });
  });
  it('29 s räcker inte', () => {
    expect(kor(still(0, 28, 5), a).h).toHaveLength(0);
  });
  it('en lossning utlöser en händelse, inte en per fix', () => {
    expect(kor(still(0, 300, 5), a).h).toHaveLength(1);
  });
  it('kör förbi avlägget utan att stanna: ingen lossning', () => {
    const fixar: Array<[number, number]> = Array.from({ length: 20 }, (_, i) => [i * 2, -100 + i * 10]);
    expect(kor(fixar, a).h).toHaveLength(0);
  });
  it('lossar, lastar (kranpaus 60 s utanför avlägg), lossar igen = nytt lass', () => {
    const fixar = [...still(0, 40, 5), ...still(60, 130, 400), ...still(200, 240, 5)];
    const { h } = kor(fixar, a);
    expect(h.filter((x) => x.typ === 'lossning').map((x) => (x as { lossning: string }).lossning)).toEqual(['nytt_lass', 'nytt_lass']);
  });
  it('lossar och står kvar / kör till samma avlägg utan att lasta = upprepning (hooken ignorerar den)', () => {
    const fixar = [...still(0, 40, 5), ...still(100, 140, -10)];
    const { h } = kor(fixar, a);
    expect(h.map((x) => (x as { lossning: string }).lossning)).toEqual(['nytt_lass', 'upprepning']);
  });
  it('samma last på ett andra avlägg utan lastning emellan = del 2', () => {
    const tva = [avl('2', 0), avl('3', 200)];
    const fixar = [...still(0, 40, 5), ...Array.from({ length: 10 }, (_, i) => [50 + i * 2, 20 + i * 18] as [number, number]), ...still(80, 120, 205)];
    const { h } = kor(fixar, tva);
    expect(h.map((x) => (x as { lossning: string }).lossning)).toEqual(['nytt_lass', 'ny_del']);
  });
  it('lastat via 240 s sedan lossningen räknas som nytt lass även nära avlägget', () => {
    const fixar = [...still(0, 40, 5), ...still(100, 130, 70), ...still(300, 340, 5)];
    const { h } = kor(fixar, a);
    expect(h.map((x) => (x as { lossning: string }).lossning)).toEqual(['nytt_lass', 'nytt_lass']);
  });
  it('tvetydigt avlägg flaggas i träffen', () => {
    const { h } = kor(still(0, 40, 5), [avl('2', 0), avl('3', 30)]);
    expect((h[0] as { traff: { tvetydigt: boolean } }).traff.tvetydigt).toBe(true);
  });

  describe('Nytt avlägg här?', () => {
    it('långt stopp (90 s) utanför avlägg, bort från skördarens spår → fråga', () => {
      const { h } = kor(still(0, 100, 300), a, nyDetektor(), 60);
      expect(h).toEqual([expect.objectContaining({ typ: 'nytt_avlagg_fraga' })]);
    });
    it('okänt avstånd till spår → ingen fråga', () => {
      expect(kor(still(0, 100, 300), a, nyDetektor(), undefined).h).toHaveLength(0);
    });
    it('stopp på skördarens spår (lastning på stickvägen) → ingen fråga', () => {
      expect(kor(still(0, 100, 300), a, nyDetektor(), 5).h).toHaveLength(0);
    });
    it('kort stopp (60 s) → ingen fråga', () => {
      expect(kor(still(0, 60, 300), a, nyDetektor(), 60).h).toHaveLength(0);
    });
    it('avvisad fråga ställs inte igen på samma plats', () => {
      const st = avvisaFraga(nyDetektor(), pos(300));
      expect(kor(still(0, 100, 310), a, st, 60).h).toHaveLength(0);
    });
    it('stopp nära förra lossningen (< 150 m) → ingen fråga', () => {
      const { h } = kor([...still(0, 40, 5), ...still(100, 200, 100)], a, nyDetektor(), 60);
      expect(h.filter((x) => x.typ === 'nytt_avlagg_fraga')).toHaveLength(0);
    });
  });

  it('glapp i loggen längre än 90 s nollställer stillastående', () => {
    const fixar: Array<[number, number]> = [[0, 5], [10, 5], [20, 5], [200, 5], [210, 5]];
    expect(kor(fixar, a).h).toHaveLength(0);
  });
  it('LOSSNING-konstanterna är de specade', () => {
    expect(LOSSNING.STILLA_S).toBe(30);
  });
});
