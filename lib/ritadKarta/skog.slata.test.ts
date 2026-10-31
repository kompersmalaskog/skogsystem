import { describe, it, expect } from 'vitest';
import { slataKlasser } from './skog';

describe('små fläckar i skogen tar grannarnas klass', () => {
  it('en ensam ruta mitt i mogen skog blir mogen, en stor fläck står kvar, fasta klasser rörs aldrig', () => {
    const b = 20, h = 20;
    const kl = new Uint8Array(b * h).fill(4);       // mogen
    kl[5 * b + 5] = 2;                               // en ruta ungskog
    for (let y = 10; y < 15; y++) for (let x = 10; x < 15; x++) kl[y * b + x] = 3; // 25 rutor gallringsskog
    kl[1 * b + 1] = 5;                               // avverkat (fast)
    kl[2 * b + 2] = 0;                               // ingen data (fast)
    slataKlasser(kl, b, h, 10, [0, 5]);
    expect(kl[5 * b + 5]).toBe(4);
    expect(kl[12 * b + 12]).toBe(3);
    expect(kl[1 * b + 1]).toBe(5);
    expect(kl[2 * b + 2]).toBe(0);
  });
});
