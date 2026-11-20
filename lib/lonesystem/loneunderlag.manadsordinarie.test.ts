// Månadens ordinarie genom hela underlaget (beraknaLoneunderlag): utjämningsperioden och `aktiv` måste nå lönemotorn per förare.
// Underlaget är produktionens augusti–september 2026 (testdata/sep2026.json). Oscar (m5) har 3 dagar / 28,65 tim i september.
import { describe, it, expect } from "vitest";
import { beraknaLoneunderlag } from "./loneunderlag";
import { sepTabeller } from "./testdata/sepKlient";

type Rad = Record<string, any>;
class Fraga {
  private f: ((r: Rad) => boolean)[] = [];
  private enkel = false;
  private kolumner: string[] | null = null;
  constructor(private rader: Rad[], private fel: { code?: string; message: string } | null) {}
  // Som PostgREST: bara de kolumner som ber om — en kolumn som inte läses finns inte i svaret (annars bevisar testet inte att `aktiv` läses).
  select(kol?: string) { this.kolumner = kol && kol !== "*" ? kol.split(",").map(k => k.trim()) : null; return this; } order() { return this; } limit() { return this; } range() { return this; }
  eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
  in(k: string, v: any[]) { this.f.push(r => v.includes(r[k])); return this; }
  gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
  lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
  maybeSingle() { this.enkel = true; return this; }
  then(res: any, rej: any) {
    if (this.fel) return Promise.resolve({ data: null, error: this.fel }).then(res, rej);
    const rader = this.rader.filter(r => this.f.every(fn => fn(r))).map(r => (this.kolumner ? Object.fromEntries(this.kolumner.filter(k => k in r).map(k => [k, r[k]])) : { ...r }));
    return Promise.resolve({ data: this.enkel ? rader[0] ?? null : rader, error: null }).then(res, rej);
  }
}
function klient(andra: { utjamning?: Rad[]; utjamningFel?: { code?: string; message: string }; aktiv?: Record<string, boolean> } = {}) {
  const t = sepTabeller();
  t.utjamningsperiod = andra.utjamning ?? [];
  if (andra.aktiv) t.medarbetare = t.medarbetare.map(m => (m.id in andra.aktiv! ? { ...m, aktiv: andra.aktiv![m.id] } : m));
  return { from(namn: string) { return new Fraga(t[namn], namn === "utjamningsperiod" ? andra.utjamningFel ?? null : null); } };
}
const rad = (u: any, id: string) => u.resultat.find((r: any) => r.medarbetare_id === id);

describe("utjämningsperiod når lönemotorn per förare", () => {
  it("Oscars period som täcker september: Oscar behåller dagens formel (24 timlön + 4,65 övertid), alla andra följer månadens ordinarie", async () => {
    const u: any = await beraknaLoneunderlag(klient({ utjamning: [{ startdatum: "2026-09-01", slutdatum: "2026-09-30", medarbetare_id: "m5", anteckning: "test" }] }), { period: "2026-10" });
    expect(rad(u, "m5")).toMatchObject({ timlon_h: 24, overtid_h: 4.65, ordinarie_h: 24 });
    expect(rad(u, "m5").ordinarie.modell).toBe("utjamning");
    expect(rad(u, "m4").ordinarie.modell).toBe("manad");
    expect(rad(u, "m4").ordinarie_h).toBe(176);
  });

  it("utan period är Oscar 28,65 timlön och 0 övertid (facit)", async () => {
    const u: any = await beraknaLoneunderlag(klient(), { period: "2026-10" });
    expect(rad(u, "m5")).toMatchObject({ timlon_h: 28.65, overtid_h: 0, ordinarie_h: 176 });
  });

  it("en period utan förare (gäller alla): alla behåller dagens formel — Daniel i augusti 104 timlön + 14,02 övertid", async () => {
    const u: any = await beraknaLoneunderlag(klient({ utjamning: [{ startdatum: "2026-08-01", slutdatum: "2026-08-31", medarbetare_id: null, anteckning: "alla" }] }), { period: "2026-09" });
    expect(rad(u, "m1")).toMatchObject({ timlon_h: 104, overtid_h: 14.02 });
    expect(rad(u, "m4")).toMatchObject({ timlon_h: 160, overtid_h: 31.03 });
  });

  it("en annan förares period rör inte den här: Daniels period påverkar inte Max", async () => {
    const u: any = await beraknaLoneunderlag(klient({ utjamning: [{ startdatum: "2026-08-01", slutdatum: "2026-08-31", medarbetare_id: "m1", anteckning: "bara Daniel" }] }), { period: "2026-09" });
    expect(rad(u, "m1")).toMatchObject({ timlon_h: 104, overtid_h: 14.02 });
    expect(rad(u, "m4")).toMatchObject({ timlon_h: 168, overtid_h: 23.03 });
  });

  it("en period som slutade före månaden rör inget (Gävle: 20 apr–5 jul, augusti räknas med den nya regeln)", async () => {
    const u: any = await beraknaLoneunderlag(klient({ utjamning: [{ startdatum: "2026-04-20", slutdatum: "2026-07-05", medarbetare_id: null, anteckning: "Gävle" }] }), { period: "2026-09" });
    expect(rad(u, "m1")).toMatchObject({ timlon_h: 118.02, overtid_h: 0 });
  });

  it("ett läsfel på utjämningsperioderna stoppar underlaget — en tyst tom lista skulle ge en utjämnad förare den nya regeln", async () => {
    await expect(beraknaLoneunderlag(klient({ utjamningFel: { code: "57014", message: "timeout" } }), { period: "2026-10" })).rejects.toThrow(/utjämningsperioder/);
  });

  it("tabellen saknas helt (migrationen ej körd): inga perioder, underlaget faller inte", async () => {
    const u: any = await beraknaLoneunderlag(klient({ utjamningFel: { code: "42P01", message: 'relation "utjamningsperiod" does not exist' } }), { period: "2026-10" });
    expect(rad(u, "m5").timlon_h).toBe(28.65);
  });
});

describe("inaktiv förare varnas (medarbetare har inget slutdatum)", () => {
  it("aktiv = false: en varning om att slutdatum saknas — och bara för den föraren", async () => {
    const u: any = await beraknaLoneunderlag(klient({ aktiv: { m5: false } }), { period: "2026-10" });
    expect(rad(u, "m5").varningar.some((v: string) => /inaktivt men slutdatum saknas/.test(v))).toBe(true);
    expect(rad(u, "m4").varningar.some((v: string) => /inaktivt/.test(v))).toBe(false);
  });
  it("aktiv = true (och kolumnen saknas) ger ingen varning", async () => {
    const u: any = await beraknaLoneunderlag(klient({ aktiv: { m5: true } }), { period: "2026-10" });
    expect(rad(u, "m5").varningar.some((v: string) => /inaktivt/.test(v))).toBe(false);
    const utan: any = await beraknaLoneunderlag(klient(), { period: "2026-10" });
    expect(utan.resultat.some((r: any) => r.varningar.some((v: string) => /inaktivt/.test(v)))).toBe(false);
  });
});
