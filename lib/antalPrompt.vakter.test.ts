import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Antal-frågan (evighetsträd, naturhörna, högstubbe) i planeringsvyn. Martin 2026-11-11: siffran stod blåmarkerad varje gång
// frågan kom upp (autoFocus + select) — irriterande, och det vanliga svaret är 1. Klar är vyns enda handling: vit, aldrig blå
// (blått betyder navigera/avbryt).
describe('antal-frågan', () => {
  const sida = readFileSync('app/planering/page.tsx', 'utf8');
  const start = sida.indexOf('=== ANTAL-PROMPT');
  const block = sida.slice(start, sida.indexOf('=== GRIND', start));
  it('fältet tar inte fokus och markerar inte siffran av sig själv', () => {
    expect(start).toBeGreaterThan(0);
    expect(block).not.toContain('autoFocus');
    expect(block).not.toContain('.select()');
  });
  it('Klar är vit (KNAPP.primar), inte blå', () => {
    expect(block).toContain('KNAPP.primar');
    expect(block).not.toContain('#0a84ff');
  });
});
