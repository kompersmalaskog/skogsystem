import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { NORMALOMRADE } from "./indexForklaring";

// Anpassningsområdet (steg 20) står i databasen på två ställen (kurvan och flaggan) och i appen (NORMALOMRADE, meningen i bladet).
// Det här provet läser migrationen och larmar om de tre glider isär.
const DIR = join(__dirname, "../../supabase/migrations");
const fil = readdirSync(DIR).filter((f) => /_hist_normalomrade\.sql$/.test(f));
const sql = fil.length === 1 ? readFileSync(join(DIR, fil[0]), "utf-8").replace(/--[^\n]*/g, "") : "";

describe("anpassningsområdet: migrationen och appen säger samma sak", () => {
  it("det finns exakt en migration för området, och den ändrar de tre vyerna", () => {
    expect(fil).toHaveLength(1);
    expect(sql).toMatch(/create or replace view public\.vy_hist_normkurva/i);
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.vy_hist_objekt_index/);
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.vy_hist_objekt_lista/);
    expect(sql.match(/security_invoker = true/gi)).toHaveLength(3);
  });
  it("kurvan anpassas på slutavverkning bara inom området, och gallring har inget filter", () => {
    const m = sql.match(/atgard <> 'slutavverkning' or \(medelstam >= ([\d.]+) and medelstam <= ([\d.]+)\)/);
    expect(m, "filtret i vy_hist_normkurva").not.toBeNull();
    expect(Number(m![1])).toBe(NORMALOMRADE.slutavverkning!.fran);
    expect(Number(m![2])).toBe(NORMALOMRADE.slutavverkning!.till);
    expect(NORMALOMRADE.gallring).toBeUndefined();
    expect(sql.match(/medelstam >= /g)).toHaveLength(1); // inget annat område
  });
  it("flaggan använder samma gränser, bara för slutavverkning, och bara där index finns", () => {
    const m = sql.match(/k\.a IS NOT NULL AND b\.atgard = 'slutavverkning'::text AND b\.medelstam IS NOT NULL AND \(b\.medelstam < ([\d.]+) OR b\.medelstam > ([\d.]+)\) AS utanfor_normalomrade/);
    expect(m, "flaggan i vy_hist_objekt_index").not.toBeNull();
    expect(Number(m![1])).toBe(NORMALOMRADE.slutavverkning!.fran);
    expect(Number(m![2])).toBe(NORMALOMRADE.slutavverkning!.till);
  });
  it("kolumnen läggs sist (create or replace view kräver det) i både index och lista", () => {
    expect(sql).toMatch(/AS utanfor_normalomrade\s+FROM vy_hist_objekt_bas b/);
    expect(sql).toMatch(/i\.utanfor_normalomrade\s+FROM vy_hist_objekt_bas b/);
  });
});
