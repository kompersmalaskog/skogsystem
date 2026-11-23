// Lass-logikens "tid per väg" (vagTider) väger sedan 2026-11-23 mot SAMMA körspårslinjer som kartan ritar (lib/korspar, en linje per dag och körning) i stället för
// stråkbitar. Facit: Edestads riktiga spår (fixturerna ur prod) — Giants skördarspår 2–4 nov, Elefant 26:s skotarspår 19 nov som fixar var 3:e meter (2 s).
// Mätt före bytet med de gamla stråken (lib/strak, borttagen): 20 "vägar", 94,5 % av fixarna inom 15 m, 10 680 av 11 300 s räknade på en väg.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { korsparLinjer } from '../korspar';
import { vagTider, SPAR, type RaFix, type VagLinje } from './spar';
import { avstandTillLinje } from './geo';

const dec = (d: any) => { let la = d.la0, lo = d.lo0; return d.deltas.split(' ').map((s: string, i: number) => { const [a, b] = s.split(',').map(Number); la += a; lo += b; return { lat: la / 1e6, lng: lo / 1e6, tid: String(i) }; }); };
const dagar = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__', f), 'utf8')).dagar.map(dec);
const skordar = dagar('korspar_edestad_skordare_2026-11-20.json'), skotar = dagar('korspar_edestad_skotare_2026-11-19.json');

const fixar: RaFix[] = [];
let ts = 0;
for (const l of skotar.flatMap((p: any) => korsparLinjer(p))) for (let i = 1; i < l.length; i++) {
  const [a, b] = [l[i - 1], l[i]];
  const d = Math.hypot((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180) * 111_320, (b[1] - a[1]) * 111_320);
  const n = Math.max(1, Math.round(d / 3));
  for (let j = 0; j < n; j++) { fixar.push({ lng: a[0] + ((b[0] - a[0]) * j) / n, lat: a[1] + ((b[1] - a[1]) * j) / n, ts }); ts += 2000; }
}
const vagar: VagLinje[] = skordar.flatMap((p: any) => korsparLinjer(p)).map((c: any, i: number) => ({ vag: `k${i}`, linje: c.map(([lng, lat]: number[]) => ({ lat, lng })) }));

describe('vagTider mot körspårslinjer (Edestad)', () => {
  it('en linje per dag och körning: tre dagar → tre vägar med id k0…k2', () => {
    expect(vagar.map((v) => v.vag)).toEqual(['k0', 'k1', 'k2']);
  });
  it('nästan alla fixar ligger på en väg (≥ 95 % inom 15 m) — minst lika bra som med stråken (94,5 %)', () => {
    const nara = fixar.filter((f) => vagar.some((v) => avstandTillLinje(f, v.linje) <= SPAR.VAG_RADIE_M)).length;
    expect(nara / fixar.length).toBeGreaterThanOrEqual(0.95);
  });
  it('tid på väg summerar till andelarna (1,0) och räknas bara på riktiga vägar', () => {
    const t = vagTider(fixar, vagar);
    expect(t.length).toBeGreaterThan(0);
    expect(t.reduce((s, x) => s + x.andel, 0)).toBeCloseTo(1, 6);
    expect(t.every((x) => /^k\d+$/.test(x.vag) && x.sek > 0)).toBe(true);
    const sek = t.reduce((s, x) => s + x.sek, 0);
    expect(sek).toBeGreaterThan(0.95 * (fixar.length - 1) * 2);   // 2 s per steg; stråken gav 94,5 %
  });
});
