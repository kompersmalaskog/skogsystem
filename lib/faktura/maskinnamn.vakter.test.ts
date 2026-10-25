// Fakturan säger maskinens NAMN, aldrig dess chassinummer.
//
// fakturaunderlag_flytt.maskin bär maskin_id (PONS20SDJAA270231). Fram till
// 2026-10-25 skrevs det rakt ut på fakturaraden — "Traillerflytt
// PONS20SDJAA270231 från Vällust RP M-R -25" — medan resten av appen säger
// Giant. Slås det inte upp i dim_maskin går fakturan ut med numret, och ingen
// ser det förrän den är skickad; därför en källvakt och inte bara ett
// beteendetest.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { maskinNamnMap } from '@/lib/maskinNamn';

const las = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('maskinnamn på fakturan', () => {
  it('hämtaren slår upp namnet — flyttraden får aldrig id:t rakt av', () => {
    const src = las('lib/faktura/hamtaUnderlag.ts');
    expect(src).toMatch(/maskin:\s*maskinNamn\(/);
    expect(src).not.toMatch(/maskin:\s*f\.maskin\b/);
  });

  it('uppslaget går genom appens enda namnregel', () => {
    const src = las('lib/faktura/hamtaUnderlag.ts');
    expect(src).toContain("from '@/lib/maskinNamn'");
    // Ingen egen ordning (visningsnamn || modell || id) bredvid regeln.
    expect(src).not.toMatch(/visningsnamn\s*\|\|/);
  });

  it('ett id i registret blir namnet, ett okänt står kvar som det skrevs', () => {
    // Prod 2026-10-25: alla fem id:n i fakturaunderlag_flytt går att slå upp.
    const map = maskinNamnMap([
      { maskin_id: 'PONS20SDJAA270231', visningsnamn: 'Giant' },
      { maskin_id: 'A130743', visningsnamn: 'Elefant 26' },
    ]);
    const namn = (v: string) => map[v] || v;
    expect(namn('PONS20SDJAA270231')).toBe('Giant');
    expect(namn('A130743')).toBe('Elefant 26');
    // Någon annans maskin bär fritext i samma fält (maskin_flytt.extern_maskin)
    // och finns inte i registret — texten står kvar, vi hittar inte på ett namn.
    expect(namn('Skogs-Jocke grävmaskin')).toBe('Skogs-Jocke grävmaskin');
  });
});
