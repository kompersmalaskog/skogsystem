import { describe, expect, it } from 'vitest';
import { AVSLUTA_RAD_RUBRIK, gammalRundaNot } from './format';

// NOTEN I BEKRAFTELSEN: slutdagen blir alltid i dag - men den som avslutar en runda fran i somras ska veta det INNAN hen trycker.
describe('gammalRundaNot', () => {
  const nu = new Date(2026, 10, 13, 12, 0); // 13 nov 2026

  it('ULFSNAS, sista svaret 28 aug: noten sager datumet och vad som hander', () => {
    const t = gammalRundaNot(new Date(2026, 7, 28, 14, 0).toISOString(), nu);
    expect(t).toContain('28 aug');
    expect(t).toContain('i dag');
  });

  it('svarat i dag: ingen not - i dag AR besoksdagen', () => {
    expect(gammalRundaNot(new Date(2026, 10, 13, 8, 0).toISOString(), nu)).toBe(null);
  });

  it('ingen besvarad punkt: ingen not', () => {
    expect(gammalRundaNot(null, nu)).toBe(null);
  });

  it('noten pastar ALDRIG att rundan avslutas pa svarets dag', () => {
    const t = gammalRundaNot(new Date(2026, 7, 28, 14, 0).toISOString(), nu) ?? '';
    expect(t).not.toMatch(/avslutas (den )?28/);
  });

  it('rubriken pa raden sager att rundan ar klar, inte vad man ska gora', () => {
    expect(AVSLUTA_RAD_RUBRIK).toBe('Rundan är klar');
  });
});
