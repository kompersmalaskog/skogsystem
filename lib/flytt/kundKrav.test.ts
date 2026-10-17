import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KUND_KRAV_TEXT } from './kundForslag';

const migrationer = join(__dirname, '..', '..', 'supabase', 'migrations');
const forra = readFileSync(join(migrationer, '20261017130000_fakturerbar_manuell_struken_text.sql'), 'utf8');
const ny = readFileSync(join(migrationer, '20261017180000_ratta_flytt_kund_kravs.sql'), 'utf8');
const platt = (s: string) => s.replace(/\s+/g, ' ');
const kropp = (t: string) => platt(t.slice(t.indexOf('create or replace function ratta_flytt'), t.indexOf('revoke all on function ratta_flytt')));

describe('kundkravet i ratta_flytt (migration 20261017180000)', () => {
  it('kravet står efter beräkningen av ny_fakt, bara när flytten blir fakturerbar, och kastar check_violation', () => {
    const sql = platt(ny);
    expect(sql).toMatch(/ny_fakt := fakturerbar_effektiv\(n_typ, f\.flytt_km, n_manuell\); .*?if ny_fakt then if nullif\(btrim\(coalesce\( case when not u_fanns_fore then n_kund when n_kund is distinct from f\.kund then n_kund else u\.kund end, ''\)\), ''\) is null then raise exception 'Välj kund — flytten faktureras' using errcode = 'check_violation'; end if; end if;/);
  });
  it('allt annat i ratta_flytt är som i förra migrationen (bara kravblocket med sin kommentar är nytt)', () => {
    const utanKrav = kropp(ny).replace(/ -- KRAV:.*? end if; end if;/, '');
    expect(utanKrav).toBe(kropp(forra));
  });
  it('databasens text och appens text säger samma sak (appen: "den här flytten", databasen: "flytten")', () => {
    expect(KUND_KRAV_TEXT).toBe('Välj kund — den här flytten faktureras');
    expect(platt(ny)).toContain("'Välj kund — flytten faktureras'");
  });
  it('stryk_flytt och godkännande kräver ingen kund (kravet finns bara i ratta_flytt)', () => {
    expect(ny).not.toMatch(/function stryk_flytt/);
    expect(ny.match(/Välj kund/g)!.length).toBeGreaterThan(0);
    const utanRatta = ny.replace(ny.slice(ny.indexOf('create or replace function ratta_flytt'), ny.indexOf('revoke all on function ratta_flytt')), '');
    expect(utanRatta).not.toMatch(/raise exception 'Välj kund/);
  });
});
