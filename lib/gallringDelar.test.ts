import { describe, expect, it } from 'vitest';
import fx from './__fixtures__/sandasen_gallring_2026-10-22.json';
import { beraknaPerHa, perHaForDel } from './gallringPerHa';
import { beraknaGallradYta, type StamPos } from './gallradYta';
import { foreslaDelning, otsuGrans, vaderstreck, MIN_SKILLNAD_MM } from './gallringDelar';

// Sandåsen gallring 2025 (VO 11183108) ur prod: väster var första gallring, öster andra (Martin 2026-10-22).
const [lo, la] = fx.origo as [number, number];
const SAND: StamPos[] = (fx.stammar_dlat_dlng_dbh as number[][]).map(([a, b, d], i) => ({ id: i, lat: la + a * 1e-5, lng: lo + b * 1e-5, dbhMm: d }));
const RINGAR = fx.ringar as [number, number][][];
const sandPerHa = () => {
  const p = beraknaPerHa({ ringar: RINGAR, volymM3fub: 300, stammar: SAND.length, stamrader: SAND, spar: [] });
  if (p.lage !== 'ok' || !p.yta) throw new Error('ingen yta');
  return p as typeof p & { yta: NonNullable<typeof p.yta> };
};

// En syntetisk trakt 300 × 100 m: vänstra och högra halvan med var sin diameter.
const g = (x: number, y: number): [number, number] => [15 + x / (Math.cos((57 * Math.PI) / 180) * 111320), 57 + y / 110540];
function trakt(vanster: number, hoger: number) {
  const ringar = [[g(0, 0), g(300, 0), g(300, 100), g(0, 100), g(0, 0)]];
  const stammar: StamPos[] = [];
  let id = 0;
  for (let x = 2; x < 300; x += 5) for (let y = 2; y < 100; y += 5) {
    const [lng, lat] = g(x, y);
    stammar.push({ id: id++, lat, lng, dbhMm: (x < 150 ? vanster : hoger) + ((x + y) % 7) - 3 });
  }
  return { yta: beraknaGallradYta({ ringar, stammar })!, stammar };
}

describe('foreslaDelning — Sandåsen', () => {
  it('väster blir första gallring och öster andra, på grovleken', () => {
    const p = sandPerHa();
    const d = foreslaDelning(p.yta, SAND)!;
    expect(d).not.toBeNull();
    const [a, b] = d.forslag;
    expect([a.namn, a.lage, b.namn, b.lage]).toEqual(['forsta', 'väster', 'andra', 'öster']);
    expect(a.medianDbhMm).toBeGreaterThanOrEqual(90);
    expect(a.medianDbhMm).toBeLessThanOrEqual(100);
    expect(b.medianDbhMm).toBeGreaterThanOrEqual(140);
    expect(b.medianDbhMm).toBeLessThanOrEqual(155);
    // Västra delen är ungefär 4,7 ha och östra 7,1 av 11,8 gallrade.
    expect(a.andelYta * p.arealHa).toBeGreaterThan(4);
    expect(a.andelYta * p.arealHa).toBeLessThan(5.5);
    expect(a.andelYta + b.andelYta).toBeCloseTo(1, 9);
    expect(d.svar).toBeNull();
    expect(d.delar).toBe(d.forslag);
  });

  it('delarna delar exakt de stammar som räknas, och uttaget per del summerar till hela trakten', () => {
    const p = sandPerHa();
    const d = foreslaDelning(p.yta, SAND)!;
    const [a, b] = d.forslag;
    for (const id of a.stammar) expect(b.stammar.has(id)).toBe(false);
    expect(a.stammar.size + b.stammar.size).toBe(p.yta.raknade.size);
    const ind = { volymM3fub: 300, stammar: SAND.length, stamrader: SAND };
    const [pa, pb] = [perHaForDel(ind, p.arealHa, a.andelYta, a.stammar), perHaForDel(ind, p.arealHa, b.andelYta, b.stammar)];
    expect(pa.arealHa + pb.arealHa).toBeCloseTo(p.arealHa, 9);
    expect(pa.stammarPerHa * pa.arealHa + pb.stammarPerHa * pb.arealHa).toBeCloseTo(p.stammarPerHa * p.arealHa, 6);
    expect(pa.volymPerHa * pa.arealHa + pb.volymPerHa * pb.arealHa).toBeCloseTo(p.volymPerHa * p.arealHa, 6);
    expect(pa.grundytaPerHa! * pa.arealHa + pb.grundytaPerHa! * pb.arealHa).toBeCloseTo(p.grundytaPerHa! * p.arealHa, 6);
    // Första gallringen tog ut fler stammar per hektar än den andra.
    expect(pa.stammarPerHa).toBeGreaterThan(pb.stammarPerHa * 1.8);
  });

  it('innehaller följer delen: en punkt i väster hör till första, en i öster till andra', () => {
    const p = sandPerHa();
    const d = foreslaDelning(p.yta, SAND)!;
    const vast = SAND.find((s) => d.forslag[0].stammar.has(s.id))!;
    const ost = SAND.find((s) => d.forslag[1].stammar.has(s.id))!;
    expect(d.forslag[0].innehaller(vast.lng, vast.lat)).toBe(true);
    expect(d.forslag[1].innehaller(vast.lng, vast.lat)).toBe(false);
    expect(d.forslag[1].innehaller(ost.lng, ost.lat)).toBe(true);
  });

  it('svaret går före förslaget: tvärtom byter delarna, en gallring tar bort delningen', () => {
    const p = sandPerHa();
    const t = foreslaDelning(p.yta, SAND, 'tvartom')!;
    expect(t.delar![0].lage).toBe('öster');
    expect(t.delar![0].namn).toBe('forsta');
    expect(t.delar![1].lage).toBe('väster');
    expect(t.forslag[0].lage).toBe('väster'); // förslaget syns alltid
    const vast = SAND.find((s) => t.forslag[0].stammar.has(s.id))!;
    expect(t.delar![1].innehaller(vast.lng, vast.lat)).toBe(true);
    const en = foreslaDelning(p.yta, SAND, 'en')!;
    expect(en.delar).toBeNull();
    expect(en.forslag).toHaveLength(2);
    expect(foreslaDelning(p.yta, SAND, 'stammer')!.delar![0].lage).toBe('väster');
  });
});

describe('foreslaDelning — en gallring föreslås aldrig som två', () => {
  it('samma grovlek överallt → null', () => {
    const { yta, stammar } = trakt(110, 110);
    expect(foreslaDelning(yta, stammar)).toBeNull();
  });
  it('för liten skillnad → null', () => {
    const { yta, stammar } = trakt(110, 110 + MIN_SKILLNAD_MM - 8);
    expect(foreslaDelning(yta, stammar)).toBeNull();
  });
  it('tydlig skillnad → två delar, den klenare först', () => {
    const { yta, stammar } = trakt(150, 95);
    const d = foreslaDelning(yta, stammar)!;
    expect(d.forslag[0].lage).toBe('öster');
    expect(d.forslag[0].medianDbhMm).toBeLessThan(100);
    expect(d.forslag[0].andelYta).toBeCloseTo(0.5, 1);
  });
  it('en del under en hektar → null (trakten är 3 ha, delen 0,5)', () => {
    const ringar = [[g(0, 0), g(300, 0), g(300, 100), g(0, 100), g(0, 0)]];
    const stammar: StamPos[] = [];
    let id = 0;
    for (let x = 2; x < 300; x += 5) for (let y = 2; y < 100; y += 5) {
      const [lng, lat] = g(x, y);
      stammar.push({ id: id++, lat, lng, dbhMm: x < 50 ? 160 : 95 });
    }
    expect(foreslaDelning(beraknaGallradYta({ ringar, stammar })!, stammar)).toBeNull();
  });
});

describe('otsuGrans och vaderstreck', () => {
  it('gränsen hamnar mellan två grupper', () => {
    const t = otsuGrans([{ v: 90, w: 5 }, { v: 95, w: 5 }, { v: 145, w: 5 }, { v: 150, w: 5 }])!;
    expect(t).toBeGreaterThan(95);
    expect(t).toBeLessThan(145);
    expect(otsuGrans([{ v: 100, w: 3 }, { v: 100, w: 4 }])).toBeNull();
  });
  it('väderstreck med norr uppåt (y söderut)', () => {
    expect(vaderstreck({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe('väster');
    expect(vaderstreck({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe('norr');
    expect(vaderstreck({ x: 10, y: 10 }, { x: 0, y: 0 })).toBe('sydost');
  });
});
