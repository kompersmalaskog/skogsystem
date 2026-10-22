import { describe, expect, it } from 'vitest';
import { beraknaKvar, dagNummer, provpunkter, rimligRuta, TILLVAXT, type LaserRuta } from './laserKvar';

const dag = dagNummer;
const rutor = (n: number, r: LaserRuta): LaserRuta[] => Array.from({ length: n }, () => ({ ...r }));

describe('beraknaKvar', () => {
  it('räknar upp före från skanningsdagen till skördarens start och drar av uttaget', () => {
    // 20 m²/ha skannat exakt 4 år före: 20 × 1,03^4 = 22,51.
    const s = beraknaKvar({ rutor: rutor(10, { g: 20, dag: dag('2022-06-01') }), uttagPerHa: 7, skordStart: '2026-06-01' });
    expect(s.lage).toBe('ok');
    if (s.lage !== 'ok') return;
    expect(s.ar).toBeCloseTo(4, 2);
    expect(s.fore).toBeCloseTo(20 * (1 + TILLVAXT.mitt) ** s.ar, 6);
    expect(s.kvar).toBeCloseTo(s.fore - 7, 6);
    expect(s.kvarLag).toBeLessThan(s.kvar);
    expect(s.kvarHog).toBeGreaterThan(s.kvar);
    expect(s.uttagAndel).toBeCloseTo(7 / s.fore, 6);
    expect([s.skanningFran, s.skanningTill]).toEqual([2022, 2022]);
  });

  it('rutor med 0 (låg skog, väg) räknas som 0 i snittet, utan uppräkning', () => {
    const s = beraknaKvar({
      rutor: [...rutor(3, { g: 30, dag: dag('2025-12-31') }), { g: 0, dag: 0 }],
      uttagPerHa: 5, skordStart: '2026-01-01',
    });
    expect(s.lage).toBe('ok');
    if (s.lage === 'ok') expect(s.fore).toBeCloseTo(22.5, 2);
  });

  it('för lite data → saknas, aldrig ett tal', () => {
    const s = beraknaKvar({
      rutor: [...rutor(7, { g: 20, dag: dag('2022-01-01') }), ...rutor(3, { g: null, dag: null })],
      uttagPerHa: 5, skordStart: '2026-01-01',
    });
    expect(s).toEqual({ lage: 'saknas', tackning: 0.7 });
    expect(beraknaKvar({ rutor: [], uttagPerHa: 5, skordStart: '2026-01-01' }).lage).toBe('saknas');
  });

  it('skannat efter att skördaren började → inget tal', () => {
    const s = beraknaKvar({
      rutor: [...rutor(8, { g: 20, dag: dag('2022-01-01') }), ...rutor(2, { g: 14, dag: dag('2026-07-01') })],
      uttagPerHa: 5, skordStart: '2026-06-01',
    });
    expect(s).toEqual({ lage: 'skannad-efter', skanningAr: 2026 });
  });

  it('enstaka rutor skannade efter räknas inte, och antalet sägs', () => {
    const s = beraknaKvar({
      rutor: [...rutor(19, { g: 20, dag: dag('2026-05-31') }), { g: 2, dag: dag('2026-07-01') }],
      uttagPerHa: 5, skordStart: '2026-06-01',
    });
    expect(s.lage).toBe('ok');
    if (s.lage === 'ok') {
      expect(s.efterRaknasInte).toBe(1);
      expect(s.fore).toBeCloseTo(20, 2);
    }
  });

  it('skanningen samma dag som skördaren började räknas som efter', () => {
    const s = beraknaKvar({ rutor: rutor(5, { g: 20, dag: dag('2026-06-01') }), uttagPerHa: 5, skordStart: '2026-06-01' });
    expect(s.lage).toBe('skannad-efter');
  });

  it('mer uttaget än det som stod där även med hög tillväxt → stämmer inte', () => {
    const s = beraknaKvar({ rutor: rutor(5, { g: 10, dag: dag('2025-01-01') }), uttagPerHa: 12, skordStart: '2026-01-01' });
    expect(s.lage).toBe('stammer-inte');
  });

  it('flera skanningsår ger ett spann', () => {
    const s = beraknaKvar({
      rutor: [...rutor(5, { g: 20, dag: dag('2020-05-01') }), ...rutor(5, { g: 20, dag: dag('2023-05-01') })],
      uttagPerHa: 5, skordStart: '2026-05-01',
    });
    expect(s.lage === 'ok' && [s.skanningFran, s.skanningTill]).toEqual([2020, 2023]);
  });
});

describe('rimligRuta', () => {
  const idag = dag('2026-10-22');
  it('godtar normal data och 0', () => {
    expect(rimligRuta({ g: 25, dag: dag('2021-05-01') }, idag)).toBe(true);
    expect(rimligRuta({ g: 0, dag: 0 }, idag)).toBe(true);
    expect(rimligRuta({ g: null, dag: null }, idag)).toBe(true);
  });
  it('avvisar orimlig grundyta och datum', () => {
    expect(rimligRuta({ g: 250, dag: dag('2021-05-01') }, idag)).toBe(false);
    expect(rimligRuta({ g: -1, dag: null }, idag)).toBe(false);
    expect(rimligRuta({ g: 20, dag: 1500 }, idag)).toBe(false);
    expect(rimligRuta({ g: 20, dag: idag + 10 }, idag)).toBe(false);
  });
});

describe('provpunkter', () => {
  it('lägger en punkt var 10:e meter inom ytan', () => {
    // ~100 × 100 m vid 57° N.
    const lat0 = 57, dLat = 100 / 111_320, dLng = 100 / (111_320 * Math.cos((lat0 * Math.PI) / 180));
    const alla = provpunkter([15, lat0, 15 + dLng, lat0 + dLat], () => true);
    expect(alla.length).toBeGreaterThanOrEqual(90);
    expect(alla.length).toBeLessThanOrEqual(121);
    const halva = provpunkter([15, lat0, 15 + dLng, lat0 + dLat], (lng) => lng < 15 + dLng / 2);
    expect(halva.length / alla.length).toBeCloseTo(0.5, 1);
  });
});
