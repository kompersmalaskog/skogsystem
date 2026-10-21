// Vakt: markägarrapporten kraschade (2026-10-21, Akelius Tåget, 19 631 stockar) för att detalj_stock pagineras med bara
// .order('id') — Postgres går då längs primärnyckeln genom hela tabellen och första sidan slår i statement timeout.
// Ordningen ska följa indexet (objekt_id, filnamn): .order('filnamn').order('id'). Samma för detalj_stam.
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const kod = readFileSync(new URL('./aggregate.ts', import.meta.url), 'utf8');

describe('aggregate: pagineringen följer index', () => {
  it('detalj_stock och detalj_stam sorteras på (filnamn, id), aldrig bara id', () => {
    for (const tabell of ['detalj_stock', 'detalj_stam']) {
      const start = kod.indexOf(`.from('${tabell}')`);
      expect(start).toBeGreaterThan(-1);
      const block = kod.slice(start, kod.indexOf('});', start));
      expect(block).toContain(".order('filnamn').order('id')");
      expect(block).not.toMatch(/return q\.order\('id'\)/);
    }
  });
  it('hpr_stammar sorteras på (hpr_fil_id, stam_nummer, id)', () => {
    const start = kod.indexOf(".from('hpr_stammar')");
    expect(kod.slice(start, start + 400)).toContain(".order('hpr_fil_id').order('stam_nummer').order('id')");
  });
});
