import { describe, expect, it } from 'vitest';
import { hogFeatures, hogText, inneIRing, iOmradet, inomRuta, maskinRad, omradeSvar, omradeUnder, rundaM3, rutaRunt, senastText, sistaPunkt, type KartStam, type LngLat } from './karta';
import { klustraStammar } from '@/lib/produktionshogar';

// En kvadrat ~111 m × ~62 m vid 56° N.
const RUTA: LngLat[] = [[15, 56], [15.001, 56], [15.001, 56.001], [15, 56.001]];

describe('inneIRing', () => {
  it('inne och ute', () => {
    expect(inneIRing(15.0005, 56.0005, RUTA)).toBe(true);
    expect(inneIRing(15.002, 56.0005, RUTA)).toBe(false);
    expect(inneIRing(15.0005, 55.9999, RUTA)).toBe(false);
  });
});

describe('iOmradet — hur mycket avverkades här?', () => {
  const stammar: KartStam[] = [
    { lat: 56.0002, lng: 15.0002, volym: 0.6, tradslag: 'Gran' },
    { lat: 56.0004, lng: 15.0004, volym: 0.5, tradslag: 'Gran' },
    { lat: 56.0006, lng: 15.0006, volym: 0.9, tradslag: 'Tall' },
    { lat: 56.0005, lng: 15.005, volym: 9, tradslag: 'Gran' }, // utanför
  ];
  it('under tre hörn finns inget område', () => {
    expect(iOmradet(stammar, RUTA.slice(0, 2))).toBeNull();
  });
  it('räknar bara stammarna inne i området', () => {
    const o = iOmradet(stammar, RUTA)!;
    expect(o.trad).toBe(3);
    expect(o.m3).toBe(2); // 1,1 gran + 0,9 tall, en decimal under 10 m³
    expect(o.tradslag.map(t => t.namn)).toEqual(['Gran', 'Tall']);
  });
  it('summan är summan av de avrundade trädslagen', () => {
    const många: KartStam[] = [];
    for (let i = 0; i < 40; i++) många.push({ lat: 56.0001 + i * 0.00002, lng: 15.0001 + i * 0.00002, volym: 0.333, tradslag: i % 2 ? 'Gran' : 'Tall' });
    const o = iOmradet(många, RUTA)!;
    expect(o.m3).toBe(o.tradslag.reduce((s, t) => s + t.m3, 0));
  });
  it('arean i ha med en decimal', () => {
    const o = iOmradet([], RUTA)!;
    expect(o.ha).toBe(0.7); // ~111 × 62 m = 0,69 ha
    expect(o.m3).toBe(0);
    expect(o.trad).toBe(0);
  });
  it('orden', () => {
    const o = { m3: 312, trad: 1240, ha: 2.1, tradslag: [] };
    expect(omradeSvar(o)).toBe('312 m³fub');
    expect(omradeUnder(o).replace(/ /g, ' ')).toBe('1 240 träd · 2,1 ha');
  });
  it('avrundning: hela m³ från 10', () => {
    expect(rundaM3(12.4, 12.4)).toBe(12);
    expect(rundaM3(4.26, 4.26)).toBe(4.3);
  });
});

describe('högarna', () => {
  it('samma klustring som planeringsvyn: stammar inom ~10 m blir en hög', () => {
    const st = [
      { lat: 56.0001, lng: 15.0001, total_volym: 0.5, tradslag: 'Gran' },
      { lat: 56.00012, lng: 15.00011, total_volym: 0.4, tradslag: 'Gran' },
      { lat: 56.002, lng: 15.002, total_volym: 0.3, tradslag: 'Tall' },
    ];
    const k = klustraStammar(st);
    expect(k).toHaveLength(2);
    expect(k[0].n).toBe(2);
    expect(k[0].volym).toBeCloseTo(0.9);
  });
  it('features: det vanligaste trädslaget färgar högen, och texten vid tryck', () => {
    const f = hogFeatures([
      { lat: 56.0001, lng: 15.0001, volym: 0.5, tradslag: 'Gran' },
      { lat: 56.00011, lng: 15.00011, volym: 0.4, tradslag: 'Gran' },
      { lat: 56.00012, lng: 15.00012, volym: 0.4, tradslag: 'Tall' },
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].properties.tradslag).toBe('Gran');
    expect(f[0].properties.trad).toBe(3);
    expect(hogText(f[0].properties)).toBe('Gran · 1,3 m³fub · 3 träd');
  });
});

describe('maskinerna', () => {
  it('sista punkten med position', () => {
    expect(sistaPunkt([{ lat: 56, lng: 15, tid: 'a' }, { lat: 57, lng: 16 }, { foo: 1 }])).toEqual({ lat: 57, lng: 16, tid: null });
    expect(sistaPunkt(null)).toBeNull();
    expect(sistaPunkt([])).toBeNull();
  });
  it('tiden i ord', () => {
    const nu = new Date('2026-10-24T12:00:00Z'); // 14:00 svensk tid
    expect(senastText('2026-10-24T11:50:00Z', null, nu)).toBe('nu');
    expect(senastText('2026-10-24T08:32:00Z', null, nu)).toBe('kl 10:32');
    expect(senastText('2026-10-23T14:10:00Z', null, nu)).toBe('igår 16:10');
    expect(senastText('2026-10-21T08:00:00Z', null, nu)).toBe('21 okt');
    expect(senastText(null, '2026-10-24', nu)).toBe('idag');
    expect(senastText(null, null, nu)).toBe('tid okänd');
  });
  it('här eller på annan plats', () => {
    const r = rutaRunt(RUTA)!;
    expect(inomRuta(15.0005, 56.0005, r)).toBe(true);
    expect(inomRuta(15.004, 56.0005, r)).toBe(true); // ~180 m utanför: inom 300 m
    expect(inomRuta(15.02, 56.0005, r)).toBe(false);
    const m = { maskin_id: 'x', namn: 'Giant', roll: 'skordare' as const, lat: 0, lng: 0, nar: 'nu', har: true };
    expect(maskinRad(m)).toEqual({ titel: 'Giant', under: 'Här nu' });
    expect(maskinRad({ ...m, nar: 'kl 14:32', har: false }).under).toBe('På annan plats · senast kl 14:32');
  });
});
