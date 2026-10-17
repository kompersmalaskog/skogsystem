import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const las = (p: string) => readFileSync(p, 'utf8');

// Kapaciteten är uppmätt G15 per arbetsdag i BÅDA helikoptervyerna. Faller någon tillbaka på "× 8" är prognosfältens G15-tim och kapaciteten olika enheter igen.
describe('helikopterns kapacitet är G15 per arbetsdag, inte 8 h', () => {
  it('v1: belaggning och övertid använder maskinens perDagH, aldrig TIMMAR_PER_DAG', () => {
    const b = las('app/helikopter/_lib/berakningar.ts');
    expect(b).not.toMatch(/\bTIMMAR_PER_DAG\b/);
    expect(b).toMatch(/g15PerDagFor\(m\.maskin_id, g15\)/);
    expect(b).toMatch(/kortH \/ b\.perDagH/);
  });
  it('v2: ingen TIMMAR_PER_DAG kvar; kapacitet, kvar-kapacitet och extra skift går via g15PerDagFor', () => {
    const v = las('app/helikopter-v2/page.tsx');
    expect(v).not.toMatch(/\bTIMMAR_PER_DAG\b/);
    expect(v).toMatch(/g15PerDagFor\(m\.maskin_id, g15\)/);
    expect(v).toMatch(/stopp\.dagar\) \* perDag/);
    expect(v).toMatch(/kvarStoppDagar\) \* perDag/);
    expect(v).toMatch(/kortH \/ r\.perDag/);
    expect(v).toMatch(/helikopter_ny_g15_per_arbetsdag/);
  });
  it('flyttid dras inte av separat (G15 per arbetsdag innehåller flyttdagarna redan)', () => {
    for (const p of ['app/helikopter/_lib/berakningar.ts', 'app/helikopter-v2/page.tsx', 'lib/helikopterG15.ts']) {
      expect(las(p), p).not.toMatch(/maskin_flytt|flyttavdrag|flyttH\b/);
    }
  });
});
