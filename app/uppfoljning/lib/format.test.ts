import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tal, tidH, tidSek } from './format';

describe('uppföljningens tal och tid', () => {
  it('tal har decimalkomma', () => {
    expect(tal(12.3)).toBe('12,3');
    expect(tal(0.854, 2)).toBe('0,85');
    expect(tal(0.62, 3)).toBe('0,62');
  });
  it('tid som timmar och minuter', () => {
    expect(tidH(12.3)).toBe('12 h 18 min');
    expect(tidH(0.5)).toBe('30 min');
    expect(tidH(4)).toBe('4 h');
    expect(tidSek(15_120)).toBe('4 h 12 min');
  });
  it('detaljvyn skriver aldrig tal med toFixed eller "h" efter ett decimaltal', () => {
    const vy = readFileSync('app/uppfoljning/UppfoljningVy.tsx', 'utf8');
    expect(vy).not.toMatch(/toFixed\(/);
    expect(vy).not.toMatch(/} G[01]5?h`/);
    const tr = readFileSync('app/uppfoljning/lib/transform.ts', 'utf8');
    expect(tr).not.toMatch(/toFixed\(1\)\}h/);
  });
});
