import { describe, expect, it } from 'vitest';
import { ETIKETT_LUCKA, placeraEtiketter, skar, type EtikettPost, type Rektangel } from './egenkontrollEtikettPlats';

const yta: Rektangel = { x0: 0, y0: 0, x1: 500, y1: 360 };
const post = (id: string, x: number, y: number, bredd = 60, hojd = 14): EtikettPost => ({ id, ankare: { x, y }, bredd, hojd });

describe('placeraEtiketter', () => {
  it('en ensam etikett hamnar uppat hoger om ankaret, med luckan emellan', () => {
    const r = placeraEtiketter([post('a', 200, 200)], [], yta).get('a')!;
    expect(r).toEqual({ x0: 200 + ETIKETT_LUCKA, y0: 200 - ETIKETT_LUCKA - 14, x1: 200 + ETIKETT_LUCKA + 60, y1: 200 - ETIKETT_LUCKA });
  });

  it('deterministiskt: samma indata ger samma plats', () => {
    const p = [post('a', 100, 100), post('b', 110, 105), post('c', 120, 110)];
    expect([...placeraEtiketter(p, [], yta)]).toEqual([...placeraEtiketter(p, [], yta)]);
  });

  it('tva etiketter pa samma plats ligger inte ovanpa varandra', () => {
    const m = placeraEtiketter([post('a', 200, 200), post('b', 200, 200)], [], yta);
    expect(skar(m.get('a')!, m.get('b')!)).toBe(false);
  });

  it('en etikett doljer aldrig ett hinder (en kontrollpunkts pinne)', () => {
    const pinne: Rektangel = { x0: 205, y0: 181, x1: 225, y1: 195 };   // precis dar forsta valet hade hamnat
    const r = placeraEtiketter([post('a', 200, 200)], [pinne], yta).get('a')!;
    expect(skar(r, pinne)).toBe(false);
  });

  it('en etikett vid kanten flyttas in: den ligger alltid helt innanfor ytan', () => {
    for (const [x, y] of [[498, 5], [2, 358], [250, 2], [498, 358], [2, 2]]) {
      const r = placeraEtiketter([post('a', x, y)], [], yta).get('a')!;
      expect(r.x0).toBeGreaterThanOrEqual(0); expect(r.y0).toBeGreaterThanOrEqual(0);
      expect(r.x1).toBeLessThanOrEqual(500); expect(r.y1).toBeLessThanOrEqual(360);
    }
  });

  it('finns inget fritt lage placeras etiketten dar den doljer minst — den försvinner aldrig', () => {
    const allt: Rektangel[] = [{ x0: 0, y0: 0, x1: 500, y1: 360 }];
    const r = placeraEtiketter([post('a', 250, 180)], allt, yta);
    expect(r.has('a')).toBe(true);
  });

  it('etiketter som redan placerats flyttas aldrig nar en ny tillkommer', () => {
    const forst = placeraEtiketter([post('a', 100, 100)], [], yta).get('a');
    const sedan = placeraEtiketter([post('a', 100, 100), post('b', 105, 100)], [], yta).get('a');
    expect(sedan).toEqual(forst);
  });

  it('tio etiketter pa en rad hamnar utan overlapp nar det finns plats', () => {
    const p = Array.from({ length: 10 }, (_, i) => post(`n${i}`, 60 + i * 38, 180, 70, 14));
    const m = placeraEtiketter(p, [], yta);
    const lista = p.map((q) => m.get(q.id)!);
    let overlapp = 0;
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) if (skar(lista[i], lista[j])) overlapp++;
    expect(overlapp).toBe(0);
  });
});

describe('placeraEtiketter: ytan och hindren', () => {
  it('en etikett som inte ryms vid ankaret kläms in i ytan i stället för att hamna utanför (ytan 150 x 30, etiketten 120 x 14)', () => {
    const smal: Rektangel = { x0: 0, y0: 0, x1: 150, y1: 30 };
    const r = placeraEtiketter([post('a', 75, 15, 120, 14)], [], smal).get('a')!;
    expect(r.x0).toBeGreaterThanOrEqual(0); expect(r.y0).toBeGreaterThanOrEqual(0);
    expect(r.x1).toBeLessThanOrEqual(150); expect(r.y1).toBeLessThanOrEqual(30);
  });

  it('en kontrollpunkts pinne precis där första läget hade hamnat undviks', () => {
    const pinne: Rektangel = { x0: 210, y0: 182, x1: 230, y1: 194 };
    const fri = placeraEtiketter([post('a', 200, 200)], [], yta).get('a')!;
    expect(skar(fri, pinne)).toBe(true);                          // utan pinnen hamnar etiketten där: hindret ar relevant
    const r = placeraEtiketter([post('a', 200, 200)], [pinne], yta).get('a')!;
    expect(skar(r, pinne)).toBe(false);
  });
});
