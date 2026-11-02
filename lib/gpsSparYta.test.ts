import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { MIN_YTA_M2, OMRADE_SPAR, arYtSparning, slutRing, ytaSparId, ytaTypAv } from './gpsSparYta';

describe('Spåra en yta med GPS', () => {
  it('id:t säger vad som spåras — linjernas id räknas aldrig som yta', () => {
    expect(arYtSparning(ytaSparId('wet'))).toBe(true);
    expect(arYtSparning(OMRADE_SPAR)).toBe(true);
    expect(arYtSparning('mainRoad')).toBe(false);
    expect(arYtSparning('stonewall')).toBe(false);
    expect(arYtSparning(null)).toBe(false);
    expect(ytaTypAv('yta:ungskog')).toBe('ungskog');
    expect(ytaTypAv(OMRADE_SPAR)).toBeNull();
  });
  it('en runda på 20 × 20 m sluts tillbaka till starten (1 kartenhet = 1 m)', () => {
    const r = slutRing([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }], 1);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.ring[r.ring.length - 1]).toEqual({ x: 0, y: 0 }); expect(r.areaM2).toBe(400); }
  });
  it('för få punkter eller för liten yta sparas inte, och skälet sägs', () => {
    const tva = slutRing([{ x: 0, y: 0 }, { x: 50, y: 0 }], 1);
    expect(tva.ok).toBe(false);
    const liten = slutRing([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }], 1);
    expect(liten.ok).toBe(false);
    expect(MIN_YTA_M2).toBeGreaterThan(4.5);
    if (!liten.ok) expect(liten.skal).toMatch(/för liten/);
  });
  it('skalan räknas in: samma punkter i halvmeter-enheter är en fjärdedel så stor yta', () => {
    const r = slutRing([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }], 0.5);
    expect(r.ok && r.areaM2).toBe(100);
  });
  it('sidan: Spåra med GPS har listan med ytor och Klar sparar ytan eller området', () => {
    const page = readFileSync('app/planering/page.tsx', 'utf8');
    expect(page).toMatch(/<YtaSparLista ytor=\{zoneTypes\.filter\(z => z\.id !== 'gallring'\)\}/);
    expect(page).toMatch(/const r = slutGpsRing\(gpsPathRef\.current, scale\)/);
    expect(page).toMatch(/lineType: 'boundary', nummer: numreringRef\.current\.nastaGransNr, path: r\.ring/);
    expect(page).toMatch(/zoneType: zt, path: r\.ring, isZone: true/);
  });
});
