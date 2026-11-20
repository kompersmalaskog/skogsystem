import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { GPS_LINJE_MEDEL, avslutaMedPosition, medelAvSenaste, type P } from './gpsSparLinje';

// En rak promenad österut, 1 m per position (gångfart, en fix per sekund).
const promenad = (n: number): P[] => Array.from({ length: n }, (_, i) => ({ x: i, y: 0 }));

function spela(fixar: P[], n: number): P[] {
  let h: P[] = [fixar[0]];
  const linje: P[] = [fixar[0]];
  for (const f of fixar.slice(1)) { const m = medelAvSenaste(h, f, n); h = m.historik; linje.push(m.medel); }
  return linje;
}

describe('Spåra med GPS', () => {
  it('linjen släpar högst ett par meter efter den riktiga positionen (förut 20 punkters medel: ~10 m)', () => {
    const fixar = promenad(60);
    const nu = spela(fixar, GPS_LINJE_MEDEL);
    const forr = spela(fixar, 20);
    expect(59 - nu[nu.length - 1].x).toBeLessThanOrEqual(1.01);
    expect(59 - forr[forr.length - 1].x).toBeGreaterThan(9);
  });
  it('vid Klar läggs den riktiga positionen till sist — linjen slutar där man står', () => {
    const linje = spela(promenad(30), GPS_LINJE_MEDEL);
    const klar = avslutaMedPosition(linje, { x: 29, y: 0 }, 0.5);
    expect(klar[klar.length - 1]).toEqual({ x: 29, y: 0 });
    expect(avslutaMedPosition(klar, { x: 29.2, y: 0 }, 0.5)).toHaveLength(klar.length);   // står still: ingen extra punkt
    expect(avslutaMedPosition(klar, null, 0.5)).toEqual(klar);                           // ingen färsk position: orörd
  });
  it('sidan: startpunkten tas ur GPS:ens position, inte ur prickens x/y, och inget 20-punkters medel finns kvar', () => {
    const page = readFileSync('app/planering/page.tsx', 'utf8');
    expect(page).not.toMatch(/const startX = gpsMapPositionRef\.current\.x/);
    expect(page).not.toMatch(/gpsHistoryRef\.current\.slice\(-19\)/);
    expect(page).toMatch(/const s0 = latLonToSvg\(startFix\.lat, startFix\.lon\)/);
    expect((page.match(/avslutaMedPosition\(gpsPathRef\.current, farskGps\(\)/g) ?? []).length).toBe(2);
  });
});
