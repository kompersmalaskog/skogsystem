// Kontraktet (migration 20261015150000): FAKTURERINGEN LÄSER BARA GODKÄNDA FLYTTAR.
// Två läsare finns och de ska vara överens: lib/faktura/hamtaUnderlag.ts och faktura_oversikt().
// Läsarna körs mot en riktig databas bara i prod — här vaktas att filtret finns kvar i källan, så en
// omskrivning som tappar det larmar. Lastbilen läser medvetet ALLA rader (där godkänns de).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROT = join(__dirname, '..', '..');
const las = (...delar: string[]) => readFileSync(join(ROT, ...delar), 'utf8');

describe('faktureringen läser bara godkända flyttar', () => {
  it("hamtaUnderlag.ts: flytt-frågan filtrerar på godkand_tid is not null", () => {
    const kalla = las('lib', 'faktura', 'hamtaUnderlag.ts');
    const fraga = kalla.slice(kalla.indexOf("from('fakturaunderlag_flytt')"), kalla.indexOf("Kunde inte läsa flyttar"));
    expect(fraga).toContain(".not('godkand_tid', 'is', null)");
  });

  it('faktura_oversikt(): hindret traillertimmar räknar bara godkända flyttar', () => {
    const sql = las('supabase', 'migrations', '20261015150100_faktura_oversikt_bara_godkanda_flyttar.sql');
    const flytt = sql.slice(sql.indexOf('from fakturaunderlag_flytt f'), sql.indexOf(') as flytt_utan_timmar'));
    expect(flytt).toContain('and f.godkand_tid is not null');
  });

  it('migrationen dokumenterar kontraktet och backfillar redan synliga rader', () => {
    const sql = las('supabase', 'migrations', '20261015150000_fakturaunderlag_flytt_godkannande.sql');
    expect(sql).toContain('FAKTURERINGSVYN LÄSER BARA RADER MED godkand_tid IS NOT NULL');
    expect(sql).toMatch(/update fakturaunderlag_flytt\s+set godkand_tid = skapad_tid/);
    expect(sql).toContain("where godkand_tid is null\n   and status = 'aktiv'");
    expect(sql).not.toMatch(/default\s+now\(\)/i);   // en NY rad är ogodkänd: kolumnen saknar default
  });

  it('Lastbilen läser alla rader (listan där flyttar godkänns får inte filtrera bort de ogodkända)', () => {
    const kalla = las('app', 'lastbil', '_components', 'useFakturerbart.ts');
    expect(kalla).not.toContain("godkand_tid', 'is', null)");
    expect(kalla).toContain('godkand_tid');
  });
});
