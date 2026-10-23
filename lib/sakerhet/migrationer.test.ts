/**
 * Källvakter för säkerhetsmigrationerna 2026-10-23. Beteendet bevisas av supabase/tests/sakerhet_lokal (riktig Postgres,
 * riktiga roller och RLS: `bash supabase/tests/sakerhet_lokal/kor-alla.sh`); det här fångar att filerna inte tappar sina
 * kärnrader utan att någon märker det.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIG = join(__dirname, "..", "..", "supabase", "migrations");
const audio = readFileSync(join(MIG, "20261023120000_audio_bucket_privat.sql"), "utf8");
const med = readFileSync(join(MIG, "20261023152043_medarbetare_skydda_kolumner.sql"), "utf8");
const grants = readFileSync(join(MIG, "20261023160000_revoke_truncate_trigger_references.sql"), "utf8");
const utanKommentarer = (s: string) => s.replace(/--.*$/gm, "");
const ettMellanslag = (s: string) => s.replace(/[ \t]+/g, " ");

describe("audio_bucket_privat", () => {
  const sql = ettMellanslag(utanKommentarer(audio));
  it("gör bucketen privat och sätter en storleksgräns", () => {
    expect(sql).toMatch(/update storage\.buckets\s+set public = false,\s+file_size_limit = \d+\s+where id = 'audio'/);
  });
  it("släpper alla fem publika policyer", () => {
    for (const p of ["Allow public delete from audio", "Allow public read from audio", "Allow public upload to audio", "storage_las_publik", "storage_uppdatera_publik"]) {
      expect(sql, p).toContain(`drop policy if exists "${p}" on storage.objects`);
    }
  });
  it("nya policyer är bara för authenticated och kräver en medarbetare — aldrig public/anon", () => {
    expect(sql).not.toMatch(/to (public|anon)\b/i);
    const nya = sql.match(/create policy[\s\S]*?;/g) ?? [];
    expect(nya).toHaveLength(3);
    for (const p of nya) {
      expect(p).toMatch(/to authenticated/);
      expect(p).toContain("aktuell_medarbetare_id() is not null");
      expect(p).toContain("bucket_id = 'audio'");
    }
  });
  it("radera kräver ägare eller admin, och det finns ingen UPDATE-policy", () => {
    expect(sql).toMatch(/for delete[\s\S]*owner = auth\.uid\(\) or public\.ar_admin\(\)/);
    expect(sql).not.toMatch(/for update/i);
  });
});

describe("medarbetare_skydda_kolumner", () => {
  const sql = utanKommentarer(med);
  const tillatna = (sql.match(/tillatna constant text\[\] := array\[([\s\S]*?)\];/) ?? [])[1]?.match(/'([a-z_]+)'/g)?.map(s => s.replace(/'/g, "")) ?? [];

  it("tillåtelselistan finns och har bara egna ofarliga fält", () => {
    expect(tillatna.length).toBeGreaterThan(5);
    expect(tillatna).toContain("telefon");
  });
  it("INGEN skyddad kolumn står på listan (roll, lön, aktiv, e-post, kopplingen, maskin, adress, budget …)", () => {
    const forbjudna = ["roll", "timlon_kr", "manadslon_kr", "aktiv", "foretagsledare", "epost", "user_id", "maskin_id", "hemadress", "hem_lat", "hem_lng", "anstallningsdatum", "friskvard_budget_total", "friskvard_budget_anvant", "partner_user_id", "bt_bil", "id", "namn"];
    expect(tillatna.filter(k => forbjudna.includes(k))).toEqual([]);
  });
  it("admin och servern släpps igenom; en annan inloggad nekas med 42501", () => {
    expect(sql).toContain("coalesce(auth.role(), '') not in ('authenticated', 'anon')");
    expect(sql).toContain("public.ar_admin()");
    expect(sql).toContain("errcode = '42501'");
    expect(sql).toMatch(/\(to_jsonb\(new\) - tillatna\) is distinct from \(to_jsonb\(old\) - tillatna\)/);
  });
  it("triggern är en BEFORE UPDATE på hela raden (inte 'UPDATE OF' en kolumnlista)", () => {
    expect(sql).toMatch(/create or replace trigger a_medarbetare_skydda_kolumner\s+before update on public\.medarbetare\s+for each row/);
    expect(sql).not.toMatch(/before update of/i);
  });
  it("kolumngrants används inte (de skulle stänga ute admin som skriver via webbläsaren)", () => {
    expect(sql).not.toMatch(/revoke update/i);
  });
});

describe("revoke_truncate_trigger_references", () => {
  const sql = utanKommentarer(grants).replace(/\s+/g, " ");
  it("återkallar TRUNCATE, TRIGGER och REFERENCES från anon och authenticated på alla tabeller i public", () => {
    expect(sql).toContain("revoke truncate, trigger, references on all tables in schema public from anon, authenticated;");
  });
  it("ändrar default privileges så att nya tabeller inte får dem", () => {
    expect(sql).toContain("alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;");
  });
  it("rör aldrig SELECT/INSERT/UPDATE/DELETE och aldrig service_role/postgres", () => {
    const listor = Array.from(sql.matchAll(/revoke ([a-z, ]+?) on /g)).map(m => m[1].split(",").map(x => x.trim()).sort().join(","));
    expect(listor.length).toBeGreaterThanOrEqual(2);
    expect(new Set(listor)).toEqual(new Set(["references,trigger,truncate"]));
    expect(sql).not.toMatch(/revoke[^;]*service_role/);
  });
  it("supabase_admin-raden får inte fälla migrationen (postgres är inte medlem i prod)", () => {
    expect(sql).toMatch(/exception when insufficient_privilege or undefined_object then/);
  });
});
