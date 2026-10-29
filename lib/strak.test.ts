import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { hyttsparRitadeLinjer } from './sparJamning';
import { byggStrak, langdM, strakFeatures, type Koord } from './strak';

const LAT0 = 56.28, LNG0 = 15.37;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 111320;
/** Linje i meter (x österut, y norrut) → [lng, lat]. */
const m = (pts: [number, number][]): Koord[] => pts.map(([x, y]) => [LNG0 + x / KX, LAT0 + y / KY]);
const rak = (y: number, fran = 0, till = 200, steg = 3): Koord[] => m(Array.from({ length: Math.floor((till - fran) / steg) + 1 }, (_, i) => [fran + i * steg, y] as [number, number]));
/** Kortaste avstånd (m) från punkten till närmaste linje. */
const narmast = (p: Koord, linjer: Koord[][]) => {
  let best = Infinity;
  const px = p[0] * KX, py = p[1] * KY;
  for (const l of linjer) for (let i = 0; i < l.length; i++) {
    const ax = l[i][0] * KX, ay = l[i][1] * KY;
    const [bx, by] = i + 1 < l.length ? [l[i + 1][0] * KX, l[i + 1][1] * KY] : [ax, ay];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return best;
};

describe('stråk — ren geometri', () => {
  it('skotaren: fem körningar på samma väg (1–2 m isär) blir EN linje i mitten', () => {
    const in_ = [0, 1.2, -1, 2, -0.6].map((y) => rak(y));
    const ut = byggStrak(in_, 'skotare');
    expect(ut.length).toBe(1);
    expect(langdM(ut)).toBeGreaterThan(180);
    expect(langdM(ut)).toBeLessThan(215);
    for (const p of ut[0].slice(3, -3)) expect(narmast(p, [rak(0.3)])).toBeLessThan(1.5);
  });
  it('skördaren: två stråk 6 m isär slås INTE ihop (inget påhittat rutnät)', () => {
    const ut = byggStrak([rak(0), rak(6)], 'skordare');
    expect(ut.length).toBe(2);
    expect(langdM(ut)).toBeGreaterThan(370);
  });
  it('skördaren: körningar ovanpå varandra (0,5 m) blir en', () => {
    expect(byggStrak([rak(0), rak(0.5), rak(-0.4)], 'skordare').length).toBe(1);
  });
  it('en ensam körning blir kvar, ungefär lika lång', () => {
    const ut = byggStrak([rak(0)], 'skordare');
    expect(ut.length).toBe(1);
    expect(langdM(ut)).toBeGreaterThan(190);
  });
  it('korta piggar från en korsning tas bort, långa grenar står kvar', () => {
    const huvud = rak(0);
    const pigg = m([[100, 0], [100, 5.5]]);
    const gren = m([[60, 0], [60, 40]]);
    const ut = byggStrak([huvud, pigg, gren], 'skordare');
    for (const l of ut) for (const p of l) expect(narmast(p, [huvud, gren])).toBeLessThan(2.5);   // inget kvar ute på piggen
    expect(langdM(ut)).toBeGreaterThan(225);   // huvudlinjen + grenen
  });
  it('tomt in → tomt ut; trasig indata → indata ritas som förut (spåret försvinner aldrig)', () => {
    expect(byggStrak([], 'skotare')).toEqual([]);
    const enPunkt: Koord[][] = [[[LNG0, LAT0], [LNG0, LAT0]]];
    expect(byggStrak(enPunkt, 'skotare').length).toBeGreaterThan(0);
  });
  it('strakFeatures: alder = den nyaste dagen, en feature per stråk', () => {
    const f = strakFeatures([{ linjer: [rak(0)], alder: 5 }, { linjer: [rak(0.5)], alder: 1 }], 'skotare');
    expect(f.length).toBe(1);
    expect(f[0].properties.alder).toBe(1);
    expect(strakFeatures([], 'skotare')).toEqual([]);
  });
});

describe('Skälviken RP J-Hus -25 (prod 2026-10-28, båda rollerna)', () => {
  const F = JSON.parse(readFileSync(path.join(__dirname, '__fixtures__/hyttspar_skalviken_2026-10-28.json'), 'utf8'));
  const linjer = (roll: string) => F.rader.filter((r: any) => r.roll === roll)
    .flatMap((r: any) => hyttsparRitadeLinjer(r.points.map(([lat, lng, tid]: [number, number, string]) => ({ lat, lng, tid })))) as Koord[][];
  it('skotaren: ~24 km körning blir ~1 km väg', () => {
    const in_ = linjer('skotare');
    const t = performance.now();
    const ut = byggStrak(in_, 'skotare');
    const ms = performance.now() - t;
    expect(langdM(in_)).toBeGreaterThan(20000);
    expect(langdM(ut)).toBeGreaterThan(800);
    expect(langdM(ut)).toBeLessThan(2000);
    expect(ut.length).toBeLessThan(40);
    expect(ms).toBeLessThan(2000);
  });
  it('skördaren: ~12 km blir under hälften, och varje stråkpunkt ligger på ett riktigt spår', () => {
    const in_ = linjer('skordare');
    const ut = byggStrak(in_, 'skordare');
    expect(langdM(ut)).toBeLessThan(langdM(in_) * 0.6);
    expect(langdM(ut)).toBeGreaterThan(langdM(in_) * 0.25);
    const prov = ut.flat().filter((_, i) => i % 25 === 0);
    for (const p of prov) expect(narmast(p, in_)).toBeLessThan(6);
  });
});

describe('vakt: stråk är BARA ritning', () => {
  it('inga beräkningar importerar lib/strak (avverkad areal, skotat, lassen räknar på rådata)', () => {
    const traffar: string[] = [];
    const gå = (dir: string) => {
      for (const n of readdirSync(dir)) {
        if (n === 'node_modules' || n.startsWith('.')) continue;
        const p = path.join(dir, n);
        if (statSync(p).isDirectory()) gå(p);
        else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) && readFileSync(p, 'utf8').includes("/strak'")) traffar.push(path.relative(process.cwd(), p));
      }
    };
    for (const d of ['lib', 'app', 'components']) gå(path.join(process.cwd(), d));
    expect(traffar.sort()).toEqual(['app/planering/page.tsx', 'lib/objektoversikt/lasKarta.ts']);
  });
});
