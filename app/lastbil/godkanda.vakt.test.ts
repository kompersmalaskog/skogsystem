// Kontraktet (migration 20261015151948): FAKTURERINGEN LÄSER BARA GODKÄNDA FLYTTAR.
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
    const sql = las('supabase', 'migrations', '20261015152757_faktura_oversikt_bara_godkanda_flyttar.sql');
    const flytt = sql.slice(sql.indexOf('from fakturaunderlag_flytt f'), sql.indexOf(') as flytt_utan_timmar'));
    expect(flytt).toContain('and f.godkand_tid is not null');
  });

  it('migrationen dokumenterar kontraktet och backfillar redan synliga rader', () => {
    const sql = las('supabase', 'migrations', '20261015151948_fakturaunderlag_flytt_godkannande.sql');
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

describe('rätta km/kund (migration 20261015155630): originalet skyddas i DATABASEN, inte i appen', () => {
  const sql = () => las('supabase', 'migrations', '20261015155630_fakturaunderlag_flytt_redigering.sql');

  it('triggern snapshotar båda originalen vid första ändringen och sätter tillbaka dem vid varje annan UPDATE', () => {
    const s = sql();
    expect(s).toContain('create or replace trigger trg_fakturaunderlag_flytt_redigering');
    expect(s).toMatch(/before update on fakturaunderlag_flytt/);
    expect(s).toMatch(/if old\.redigerad_tid is null then\s+[^]*new\.km_original\s+:= old\.km;\s+new\.kund_original := old\.kund;/);
    expect(s).toMatch(/new\.km_original\s+:= old\.km_original;/);
    expect(s).toContain("'Flytten är % och kan inte ändras'");     // fakturerad/struken vägras
    expect(s).toContain('redigerad_konsistens');
  });

  it('appen skriver aldrig originalen eller redigerad_tid (bara redigerad_av)', () => {
    const k = las('app', 'lastbil', '_components', 'godkann.ts');
    const kod = k.split('\n').filter(r => !r.trim().startsWith('*') && !r.trim().startsWith('//')).join('\n');
    expect(kod).not.toMatch(/varden\.(km_original|kund_original|redigerad_tid)/);
    expect(kod).toContain('redigerad_av: av');
  });
});
