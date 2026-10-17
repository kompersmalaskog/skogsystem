import { describe, expect, it } from 'vitest';
import { fmtPerDag, g15KapacitetNot, g15PerDagFor, g15Tabell, G15_TOM, snittPerDag } from './helikopterG15';

// Riktiga siffror ur prod 2026-10-17 (12 mån, RPC helikopter_ny_g15_per_arbetsdag)
const RADER = [
  { maskin_id: 'A030353', g15_per_dag: '6.36', dagar: 237 },
  { maskin_id: 'A130743', g15_per_dag: '7.59', dagar: 47 },
  { maskin_id: 'PONS20SDJAA270231', g15_per_dag: '7.09', dagar: 237 },
  { maskin_id: 'R64428', g15_per_dag: '7.36', dagar: 134 },
  { maskin_id: 'NY', g15_per_dag: '9.5', dagar: 12 },         // för få dagar → ej mätt
  { maskin_id: 'NOLL', g15_per_dag: '0', dagar: 100 },        // 0 → ej mätt
];

describe('g15Tabell', () => {
  it('tar maskiner med minst 20 arbetsdagar och ett positivt tal; resten är "ej mätt"', () => {
    const t = g15Tabell(RADER);
    expect(t.lage).toBe('ok');
    expect(Object.keys(t.perMaskin).sort()).toEqual(['A030353', 'A130743', 'PONS20SDJAA270231', 'R64428']);
    expect(t.perMaskin.A030353).toBeCloseTo(6.36, 6);
  });
  it('ett svar som inte är en lista (RPC:n saknas/fel) är "fel" — aldrig en tom tabell som ser ut som "inga maskiner"', () => {
    expect(g15Tabell(null).lage).toBe('fel');
    expect(g15Tabell(undefined).lage).toBe('fel');
    expect(g15Tabell([]).lage).toBe('ok');                      // en läsning utan rader är ett svar: alla "ej mätt"
  });
});

describe('g15PerDagFor', () => {
  const t = g15Tabell(RADER);
  it('uppmätt maskin → dess tal; 810E (ingen fakt_tid) → 8 och ej mätt', () => {
    expect(g15PerDagFor('PONS20SDJAA270231', t)).toEqual({ perDag: 7.09, ejMatt: false });
    expect(g15PerDagFor('JD810E', t)).toEqual({ perDag: 8, ejMatt: true });
    expect(g15PerDagFor('NY', t)).toEqual({ perDag: 8, ejMatt: true });
  });
  it('en tabell som inte gick att läsa ger reserven 8 för alla — och noten säger det', () => {
    expect(g15PerDagFor('PONS20SDJAA270231', G15_TOM)).toEqual({ perDag: 8, ejMatt: true });
    expect(g15KapacitetNot(G15_TOM, [{ maskin_id: 'A', namn: 'Giant' }])).toMatch(/gick inte att läsa .* 8 h/);
  });
});

describe('kapacitet i G15 mot 8 h (Oktober 2026, 10 arbetsdagar kvar)', () => {
  const t = g15Tabell(RADER);
  it('Elefant 26: 10 × 7,59 = 76 G15 mot 80 h förut — samma 100 planerade timmar ger −24 i stället för −20', () => {
    const kap = 10 * g15PerDagFor('A130743', t).perDag;
    expect(Math.round(kap)).toBe(76);
    expect(Math.round(kap - 100)).toBe(-24);
  });
  it('Wisent är den som 8 h gjorde ledigast: 10 × 6,36 = 64 mot 80', () => {
    expect(Math.round(10 * g15PerDagFor('A030353', t).perDag)).toBe(64);
  });
});

describe('texter', () => {
  it('noten nämner varje maskins G15/dag och markerar den som inte är mätt', () => {
    const t = g15Tabell(RADER);
    const n = g15KapacitetNot(t, [{ maskin_id: 'PONS20SDJAA270231', namn: 'Giant' }, { maskin_id: 'JD810E', namn: '810E' }])!;
    expect(n).toBe('Kapacitet = uppmätt G15 per arbetsdag, 12 mån: Giant 7,1 · 810E 8 (ej mätt)');
  });
  it('fmtPerDag och snitt', () => {
    expect(fmtPerDag(6.36)).toBe('6,4');
    expect(snittPerDag([6, 8])).toBe(7);
    expect(snittPerDag([])).toBe(8);
  });
});
