import { describe, it, expect } from 'vitest';
import { valjForaldralosa, MAX_RADERA_PER_KORNING } from './stadaMarkeringFoto';

const DAG = 86400 * 1000;
const NU = Date.UTC(2026, 9, 10);
const fil = (sokvag: string, dagarGammal: number | null) => ({ sokvag, senastMs: dagarGammal === null ? null : NU - dagarGammal * DAG });

describe('valjForaldralosa', () => {
  it('raderar bara filer utan referens OCH äldre än 7 dagar', () => {
    const b = valjForaldralosa(
      [fil('a/1.jpg', 30), fil('a/2.jpg', 30), fil('a/3.jpg', 3), fil('a/4.jpg', 8)],
      new Set(['a/1.jpg']), NU);
    expect(b.radera).toEqual(['a/2.jpg', 'a/4.jpg']);
    expect(b.forNya).toEqual(['a/3.jpg']);
    expect(b.refererade).toBe(1);
  });
  it('refererad fil rörs aldrig, hur gammal den än är', () => {
    const b = valjForaldralosa([fil('a/1.jpg', 900)], new Set(['a/1.jpg']), NU);
    expect(b.radera).toEqual([]);
  });
  it('okänd ålder räknas som ny — aldrig radera på gissning', () => {
    const b = valjForaldralosa([fil('a/1.jpg', null)], new Set(), NU);
    expect(b.radera).toEqual([]);
    expect(b.forNya).toEqual(['a/1.jpg']);
  });
  it('exakt 7 dagar gammal sparas (gränsen är strikt äldre)', () => {
    expect(valjForaldralosa([fil('a/1.jpg', 7)], new Set(), NU).radera).toEqual([]);
  });
  it('skyddstak per körning', () => {
    const filer = Array.from({ length: MAX_RADERA_PER_KORNING + 5 }, (_, i) => fil(`a/${i}.jpg`, 60));
    const b = valjForaldralosa(filer, new Set(), NU);
    expect(b.radera.length).toBe(MAX_RADERA_PER_KORNING);
    expect(b.overTak).toBe(5);
  });
});
