import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Martin 2026-10-29: Naturvård (grön/röd) går inte att rita längre — ett ringat område är en Hänsyn-yta.
describe('Rita linje utan Naturvård', () => {
  it('ritaLinjeTyper tar bort nature', () => {
    const s = readFileSync('app/planering/page.tsx', 'utf8');
    const rad = s.split('\n').find((r) => r.includes('const ritaLinjeTyper ='));
    expect(rad).toBeDefined();
    expect(rad).toContain("t.id !== 'nature'");
  });
});
