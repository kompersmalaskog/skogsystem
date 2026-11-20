// Källvakter för Rätta/Stryk flytt och DB-låset (migration 20261015170000). Databasen är provad i riktig
// Postgres (kedjefallen, låset, slaIhopJobb-undantaget); här vaktas att appen och migrationen förblir
// överens med det som provades.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FLYTTA_TABELLER } from '../../lib/slaIhopJobb';

const ROT = join(__dirname, '..', '..');
const las = (...d: string[]) => readFileSync(join(ROT, ...d), 'utf8');
const sql = () => las('supabase', 'migrations', '20261015170000_ratta_flytt.sql');
/** Kod utan kommentarer (rad- och blockkommentarer). */
const kod = (s: string) => s.split('\n').filter(r => !r.trim().startsWith('//') && !r.trim().startsWith('*') && !r.trim().startsWith('/*')).join('\n');

describe('appen rättar och stryker BARA via databasfunktionerna', () => {
  for (const fil of ['ratta.ts', 'useBenStatus.ts', 'usePlatsData.ts', 'FlyttSheet.tsx', 'useFlyttDetalj.ts', 'rattningText.ts', 'RundaArk.tsx']) {
    it(`${fil} skriver aldrig maskin_flytt, maskin_position eller spåret direkt`, () => {
      const k = kod(las('app', 'lastbil', '_components', fil));
      expect(k).not.toMatch(/from\(['"]maskin_flytt['"]\)\s*\.(update|insert|delete|upsert)/);
      expect(k).not.toMatch(/from\(['"]maskin_position['"]\)\s*\.(update|insert|delete|upsert)/);
      expect(k).not.toMatch(/from\(['"]maskin_flytt_rattning['"]\)\s*\.(update|insert|delete|upsert)/);
    });
  }

  it('ratta.ts anropar exakt ratta_flytt och stryk_flytt', () => {
    const k = kod(las('app', 'lastbil', '_components', 'ratta.ts'));
    expect(k).toContain("anropa('ratta_flytt'");
    expect(k).toContain("anropa('stryk_flytt'");
    expect(k).toContain('supabase.rpc(funktion, args)');
  });

  it('Flytten-sheeten är den ENDA rättningsvyn: Körningar och Fakturering öppnar samma komponent, och den gamla är borta', () => {
    const dir = join(ROT, 'app', 'lastbil', '_components');
    expect(existsSync(join(dir, 'RattaFlyttVy.tsx'))).toBe(false);
    expect(existsSync(join(dir, 'PlatsVal.tsx'))).toBe(false);
    expect(existsSync(join(dir, 'FlyttArk.tsx'))).toBe(false);
    expect(existsSync(join(dir, 'StrykArk.tsx'))).toBe(false);
    expect(kod(las('app', 'lastbil', '_components', 'RundaArk.tsx'))).toContain('<FlyttSheet');
    expect(kod(las('app', 'lastbil', '_components', 'FaktureringFlik.tsx'))).toContain('<FlyttSheet');
    for (const f of readdirSync(dir).filter(n => /\.tsx?$/.test(n) && !n.includes('.test.'))) {
      expect(las('app', 'lastbil', '_components', f), f).not.toMatch(/RattaFlyttVy|FlyttArk|StrykArk|underlagKonsekvens/);
    }
  });

  it('sheeten "Flytten" rättar via ratta_flytt och stryker via stryk_flytt — aldrig bara underlaget (den gamla halv-strykningen)', () => {
    const k = kod(las('app', 'lastbil', '_components', 'FlyttSheet.tsx'));
    expect(k).toContain('rattaFlytt(');
    expect(k).toContain('strykEnFlytt(');
    expect(k).not.toMatch(/strykFlytt/);
    expect(k).not.toMatch(/status:\s*'struken'/);
    const g = kod(las('app', 'lastbil', '_components', 'godkann.ts'));
    expect(g).not.toMatch(/struken_anledning/);                 // underlaget stryks av databasfunktionen, inte av appen
  });

  it('underlaget och spåret läses bara när admin (aktiv-grinden) — förare skickar aldrig frågan', () => {
    const k = kod(las('app', 'lastbil', '_components', 'RundaArk.tsx'));
    expect(k).toContain('useBenStatus(runda.ben.map(b => b.id), arAdmin && runda.ben.length > 0)');
  });
});

describe('låset i databasen', () => {
  it('trigger på maskin_flytt: BEFORE UPDATE OR DELETE, och ser underlaget via en DEFINER-funktion (admin-RLS döljer det för förare)', () => {
    const s = sql();
    expect(s).toMatch(/create or replace trigger trg_maskin_flytt_las\s+before update or delete on maskin_flytt/);
    expect(s).toMatch(/create or replace function flytt_ar_last\(p_flytt uuid\)[^$]*security definer/);
    expect(s).toMatch(/where u\.flytt_id = p_flytt and \(u\.godkand_tid is not null or u\.fakturerad_tid is not null\)/);
  });

  it('slaIhopJobb-undantaget: service_role får ändra fran_objekt_id/till_objekt_id och INGET annat', () => {
    const s = sql().replace(/\s+/g, ' ');
    expect(s).toContain("current_user = 'service_role'");
    expect(s).toContain("(to_jsonb(new) - spar - 'fran_objekt_id' - 'till_objekt_id') is not distinct from (to_jsonb(old) - spar - 'fran_objekt_id' - 'till_objekt_id')");
  });

  it('...och slaIhopJobb rör faktiskt bara de två kolumnerna på maskin_flytt (annars är undantaget för snävt)', () => {
    const kolumner = FLYTTA_TABELLER.filter(([t]) => t === 'maskin_flytt').map(([, k]) => k).sort();
    expect(kolumner).toEqual(['fran_objekt_id', 'till_objekt_id']);
  });

  it('underhåll: GUC app.flytt_tillat_andring öppnar låset, och felet säger hur', () => {
    const s = sql();
    expect(s).toContain("current_setting('app.flytt_tillat_andring', true) = 'on'");
    expect(s).toContain("select set_config(''app.flytt_tillat_andring'',''on'',true)");
  });

  it('funktionerna är admin-kontrollerade DEFINER-funktioner, utan public-behörighet', () => {
    const s = sql();
    for (const f of ['ratta_flytt(uuid, jsonb, text, text)', 'stryk_flytt(uuid, text, text)']) {
      expect(s).toContain(`revoke all on function ${f} from public;`);
      expect(s).toContain(`grant execute on function ${f} to authenticated;`);
    }
    expect(s.match(/if not ar_admin\(\) then raise exception/g)).toHaveLength(2);
    expect(s.match(/security definer\s+set search_path = public/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('mätvärden går inte att rätta: listan över fält är exakt de fem människan angav (+ par)', () => {
    const s = sql().replace(/\s+/g, ' ');
    expect(s).toContain("array['maskin_id','extern_maskin','fran_objekt_id','fran_plats_id', 'till_objekt_id','till_plats_id','flytt_typ','kund']");
    for (const matt of ['flytt_km', 'till_odometer_m', 'sluttid', 'starttid', 'tid_flytt_min']) {
      expect(s).not.toMatch(new RegExp(`ok_falt[^;]*'${matt}'`));
    }
  });

  it('stryk raderar positionsraden bara vid EXAKT matchning (count = 1) och sparar raden i spåret', () => {
    const s = sql().replace(/\s+/g, ' ');
    expect(s).toContain('if pos_antal = 1 then select to_jsonb(p) into pos_rad');
    expect(s).toContain("elsif pos_antal = 0 then pos_atgard := 'hittades_inte'; else pos_atgard := 'osaker';");
  });
});
