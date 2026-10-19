// Maskinflytt som egen rad i dagen (beslut Martin 2026-10-19): flyttiden är VANLIG arbetstid — den ligger redan i arbetad_min
// (förarens inloggade tid) och räknas i timlön och övertid som all annan arbetad tid. Ingen ny löneart.
//
// Raden är ett segment (arbetsdag_segment, kalla 'flytt'): märkning av tid som redan är betald. Beviset:
//  1. Hela lönekedjan (beraknaLoneunderlag) över produktionens augusti–september 2026 ger BYTE FÖR BYTE samma resultat
//     när varje dag får en flyttrad — för varje förare, båda månaderna, alla lönerader och varningar.
//  2. Lönekedjan frågar aldrig efter arbetsdag_segment. Läste den tabellen skulle en flyttrad kunna dubbelräknas.
//  3. Ingen lönekod (utom i testfixturer) nämner tabellen, och inget i lönekatalogen heter flytt: ingen ny löneart.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { beraknaLoneunderlag } from "./loneunderlag";
import { LONEARTER } from "./loneart";
import { sepTabeller } from "./testdata/sepKlient";

type Rad = Record<string, any>;
class Fraga {
  private f: ((r: Rad) => boolean)[] = [];
  private enkel = false;
  constructor(private rader: Rad[]) {}
  select() { return this; } order() { return this; } limit() { return this; } range() { return this; }
  eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
  in(k: string, v: any[]) { this.f.push(r => v.includes(r[k])); return this; }
  gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
  lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
  maybeSingle() { this.enkel = true; return this; }
  then(res: any, rej: any) {
    const rader = this.rader.filter(r => this.f.every(fn => fn(r))).map(r => ({ ...r }));
    return Promise.resolve({ data: this.enkel ? rader[0] ?? null : rader, error: null }).then(res, rej);
  }
}
const min = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hhmmss = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

function klient(medFlytt: boolean, kalla: "flytt" | "flyttlogg" | "bada" = "flytt") {
  const t = sepTabeller();
  const tillfragade = new Set<string>();
  const segment: Rad[] = [];
  if (medFlytt) {
    for (const d of t.arbetsdag as Rad[]) {
      if (!d.start_tid || !d.slut_tid) continue;
      const s = min(String(d.start_tid)) + 120, e = s + 45; // 45 min flytt två timmar in i passet
      if (e >= min(String(d.slut_tid))) continue;
      const rad = (k: "flytt" | "flyttlogg", fran: number, till: number): Rad => ({
        id: `${k}-${d.id}`, medarbetare_id: d.medarbetare_id, datum: d.datum, start_tid: hhmmss(fran), slut_tid: hhmmss(till),
        aktivitet_typ: "flytt", debiterbar: false, kalla: k, flytt_id: k === "flyttlogg" ? `mf-${d.id}` : null, objekt_id: null, kommentar: "A → B · 12 km",
      });
      if (kalla !== "flyttlogg") segment.push(rad("flytt", s, e));
      if (kalla !== "flytt") segment.push(rad("flyttlogg", kalla === "bada" ? e + 60 : s, kalla === "bada" ? e + 105 : e)); // bådadera: en andra flytt en timme senare
    }
  }
  t.arbetsdag_segment = segment;
  return {
    antalSegment: segment.length,
    tillfragade,
    from(namn: string) { tillfragade.add(namn); return new Fraga((t as any)[namn] ?? []); },
  };
}

describe("lön: flyttraden ändrar ingenting", () => {
  for (const period of ["2026-09", "2026-10"]) {
    it(`löneperiod ${period}: lönen är byte för byte densamma med och utan en flyttrad på varje dag`, async () => {
      const utan = klient(false), med = klient(true);
      expect(med.antalSegment).toBeGreaterThan(20); // testet bevisar inget om raderna saknas
      const a: any = await beraknaLoneunderlag(utan, { period });
      const b: any = await beraknaLoneunderlag(med, { period });
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      expect(a.resultat.length).toBeGreaterThan(0);
    });
  }

  // Lastbilsflytt (flyttloggen) ger också en flyttrad (beslut Martin 2026-10-19): samma bevis, kalla 'flyttlogg'.
  for (const period of ["2026-09", "2026-10"]) {
    it(`löneperiod ${period}: lönen är byte för byte densamma med en FLYTTLOGGSRAD (kalla 'flyttlogg') på varje dag`, async () => {
      const utan = klient(false), med = klient(true, "flyttlogg");
      expect(med.antalSegment).toBeGreaterThan(20);
      const a: any = await beraknaLoneunderlag(utan, { period });
      const b: any = await beraknaLoneunderlag(med, { period });
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    });
  }
  it("en dag med BÅDE en GPS-rad och en flyttloggsrad (olika tider) ger fortfarande samma lön — märkt tid läggs aldrig till", async () => {
    const utan = klient(false), med = klient(true, "flytt");
    const extra = klient(true, "bada");
    const a: any = await beraknaLoneunderlag(utan, { period: "2026-10" });
    const b: any = await beraknaLoneunderlag(med, { period: "2026-10" });
    expect(extra.antalSegment).toBeGreaterThan(med.antalSegment);
    const c: any = await beraknaLoneunderlag(extra, { period: "2026-10" });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });
  it("lönekedjan läser aldrig flyttloggen (maskin_flytt) — lastbilens tid är inte förarens lön", async () => {
    const k = klient(true, "flyttlogg");
    await beraknaLoneunderlag(k, { period: "2026-10" });
    expect([...k.tillfragade]).not.toContain("maskin_flytt");
  });

  it("lönekedjan frågar aldrig efter arbetsdag_segment (då kunde flyttiden räknas två gånger)", async () => {
    const k = klient(true);
    await beraknaLoneunderlag(k, { period: "2026-10" });
    expect([...k.tillfragade]).toContain("arbetsdag"); // kontroll: vi ser faktiskt vilka tabeller som läses
    expect([...k.tillfragade]).not.toContain("arbetsdag_segment");
    expect([...k.tillfragade]).not.toContain("arbetsdag_flytt_borta");
  });

  it("ingen lönekod läser segment eller gravstenar", () => {
    const rot = path.join(__dirname);
    const filer: string[] = [];
    const gå = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (f.name !== "testdata" && f.name !== "__fixtures__") gå(p); }
      else if (/\.tsx?$/.test(f.name) && !/\.test\.tsx?$/.test(f.name)) filer.push(p);
    } };
    gå(rot);
    const lon = path.join(__dirname, "..", "..", "app", "api", "lon");
    if (fs.existsSync(lon)) gå(lon);
    expect(filer.length).toBeGreaterThan(10);
    const traffar = filer.filter(f => /arbetsdag_segment|arbetsdag_flytt_borta|maskin_flytt/.test(fs.readFileSync(f, "utf8")));
    expect(traffar).toEqual([]);
  });

  it("ingen ny löneart: katalogen har inget flytt-slag", () => {
    const nycklar = LONEARTER.map(x => String(x.key));
    expect(nycklar.length).toBeGreaterThan(5);
    expect(nycklar.filter(n => /flytt/i.test(n))).toEqual([]);
  });
});
