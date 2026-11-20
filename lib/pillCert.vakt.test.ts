import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { certTyper } from './certKrav';

// Martin 2026-11-05 (Bondeskog AU 2026, cert "PEFC"): namnfältet i planeringen sa ingenting om certifieringen.
describe('namnfältet visar certifieringen', () => {
  it('sidan skriver certTyper i namnfältet, samma tolkning som ⓘ', () => {
    const sida = readFileSync('app/planering/page.tsx', 'utf8');
    expect(sida).toContain('data-testid="objekt-pill-cert"');
    expect(sida).toContain("certTyper(valtObjekt.cert).join(' och ')");
  });
  it('PEFC syns, "Ej certifierad"/"None" ger inget', () => {
    expect(certTyper('PEFC').join(' och ')).toBe('PEFC');
    expect(certTyper('FSC PEFC').join(' och ')).toBe('PEFC och FSC');
    expect(certTyper('Ej certifierad')).toEqual([]);
    expect(certTyper('None')).toEqual([]);
  });
});
