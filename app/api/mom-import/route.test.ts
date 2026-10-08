/**
 * mom-import: arbetsdagarna byggs ur fakt_skift + fakt_tid. Två regler efter R64428 2026-10-07 (Oskar/Martin):
 *
 *  1. Rasten är förarens EGEN (fakt_tid.rast_sek summerat över hans operatörer), annars 0. Steg 5c, som omfördelade
 *     en förares rast proportionellt mot skiftlängd, är borta: det flyttade en riktig rast till någon som inte tog
 *     den (Martin fick 10 min, Joacim 3 min — båda bekräftade).
 *  2. Ett SYNTETISKT skift (Rottne, SYN_) slutar när nästa förare loggar in på samma maskin. Äkta skift (Ponsse)
 *     rörs inte: där är utloggningen maskinens egen uppgift.
 *
 * Fake-databas med samma kedja som supabase-js (select/eq/in/or/order/gte, update/insert/delete).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const g = globalThis as any;

vi.mock("@supabase/supabase-js", () => {
  class Q {
    f: ((r: any) => boolean)[] = [];
    mode: "select" | "update" | "insert" | "delete" = "select";
    vals: any = null;
    eqs: Record<string, any> = {};
    constructor(public t: string) {}
    select() { return this; }
    order() { return this; }
    limit() { return this; }
    eq(k: string, v: any) { this.eqs[k] = v; this.f.push(r => r[k] === v); return this; }
    gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
    in(k: string, v: any[]) { this.f.push(r => v.includes(r[k])); return this; }
    is(k: string, v: any) { this.f.push(r => (v === null ? r[k] == null : r[k] === v)); return this; }
    or(expr: string) {
      const delar = expr.split(",").map(p => p.split("."));
      this.f.push(r => delar.some(([col, op, val]) => (op === "is" && val === "null" ? r[col] == null : String(r[col]) === val)));
      return this;
    }
    update(v: any) { this.mode = "update"; this.vals = v; return this; }
    insert(v: any) { this.mode = "insert"; this.vals = v; return this; }
    delete() { this.mode = "delete"; return this; }
    then(res: any, rej: any) {
      const db = g.__db as Record<string, any[]>;
      const tab = (db[this.t] = db[this.t] || []);
      let rader: any[];
      if (this.mode === "select") rader = tab.filter(r => this.f.every(fn => fn(r))).map(r => ({ ...r }));
      else if (this.mode === "update") {
        const traff = tab.filter(r => this.f.every(fn => fn(r)));
        traff.forEach(r => Object.assign(r, this.vals));
        g.__skriv.push({ tabell: this.t, op: "update", vals: this.vals, eqs: { ...this.eqs } });
        rader = traff.map(r => ({ ...r }));
      } else if (this.mode === "delete") {
        const traff = tab.filter(r => this.f.every(fn => fn(r)));
        db[this.t] = tab.filter(r => !traff.includes(r));
        g.__skriv.push({ tabell: this.t, op: "delete", antal: traff.length });
        rader = traff.map(r => ({ ...r }));
      } else {
        const nya = (Array.isArray(this.vals) ? this.vals : [this.vals]).map((v: any, i: number) => ({ id: `${this.t}-${tab.length + i}`, ...v }));
        tab.push(...nya);
        g.__skriv.push({ tabell: this.t, op: "insert", vals: nya.map((n: any) => ({ ...n })) });
        rader = nya;
      }
      return Promise.resolve({ data: rader, error: null, count: rader.length }).then(res, rej);
    }
  }
  return { createClient: () => ({ from: (t: string) => new Q(t) }) };
});

import { POST } from "./route";

const MED = { oskar: "med-oskar", martin: "med-martin", stefan: "med-stefan", joacim: "med-joacim", maxx: "med-max" };
const post = (datum: string) => POST(new Request("https://app.example/api/mom-import", { method: "POST", body: JSON.stringify({ datum }) }) as any);
const insatta = (tabell = "arbetsdag") => (g.__skriv as any[]).filter(s => s.tabell === tabell && s.op === "insert").flatMap(s => s.vals);
const dagFor = (med: string) => insatta().find((r: any) => r.medarbetare_id === med);

beforeEach(() => {
  g.__skriv = [];
  g.__db = {
    operator_medarbetare: [
      { operator_id: "R64428_8", medarbetare_id: MED.oskar }, { operator_id: "R64428_9", medarbetare_id: MED.martin },
      { operator_id: "PONS_12", medarbetare_id: MED.stefan }, { operator_id: "PONS_13", medarbetare_id: MED.joacim },
      { operator_id: "A030353_2", medarbetare_id: MED.martin }, { operator_id: "A030353_1", medarbetare_id: MED.maxx },
    ],
    fakt_skift: [], fakt_tid: [], arbetsdag: [], arbetsdag_objekt: [], dim_objekt: [], notis_kö: [],
  };
});

/** R64428 2026-10-07 som i prod: båda förarnas utloggning = filens ReportEndTime. */
function r64428() {
  g.__db.fakt_skift.push(
    { id: 1, datum: "2026-10-07", maskin_id: "R64428", operator_id: "R64428_8", inloggning_tid: "2026-10-07T06:59:48.738105+00:00", maskin_inloggning_tid: "2026-10-07T06:59:36+00:00", utloggning_tid: "2026-10-07T20:50:51.132817+00:00", langd_sek: 49862, shift_key: "SYN_2026-10-07_R64428_8" },
    { id: 2, datum: "2026-10-07", maskin_id: "R64428", operator_id: "R64428_9", inloggning_tid: "2026-10-07T16:50:48.275589+00:00", maskin_inloggning_tid: "2026-10-07T16:50:39+00:00", utloggning_tid: "2026-10-07T20:50:51.132817+00:00", langd_sek: 14402, shift_key: "SYN_2026-10-07_R64428_9" },
  );
  g.__db.fakt_tid.push(
    { id: 1, datum: "2026-10-07", maskin_id: "R64428", operator_id: "R64428_8", objekt_id: "11124748", processing_sek: 28072, terrain_sek: 1314, other_work_sek: 0, rast_sek: 2758, engine_time_sek: 29160 },
    { id: 2, datum: "2026-10-07", maskin_id: "R64428", operator_id: "R64428_9", objekt_id: "11124748", processing_sek: 13799, terrain_sek: 599, other_work_sek: 0, rast_sek: 0, engine_time_sek: 13680 },
  );
}

describe("mom-import: rasten är förarens egen (steg 5c borta)", () => {
  it("R64428 2026-10-07: Oskar 46 min (sin egen), Martin 0 — inte 10, som 5c räknade", async () => {
    r64428();
    await post("2026-10-07");
    expect(dagFor(MED.oskar).rast_min).toBe(46);
    expect(dagFor(MED.martin).rast_min).toBe(0);
  });

  it("Ponsse 2026-08-10: Stefan 71 min, Joacim 0 och Martin 0 — rast flyttas aldrig mellan förare efter skiftlängd", async () => {
    g.__db.fakt_skift.push(
      { id: 1, datum: "2026-08-10", maskin_id: "PONS", operator_id: "PONS_12", inloggning_tid: "2026-08-10T05:59:32+00:00", utloggning_tid: "2026-08-10T16:45:19+00:00", langd_sek: 38747, shift_key: "649" },
      { id: 2, datum: "2026-08-10", maskin_id: "PONS", operator_id: "PONS_13", inloggning_tid: "2026-08-10T06:43:31+00:00", utloggning_tid: "2026-08-10T07:12:19+00:00", langd_sek: 1728, shift_key: "650" },
    );
    g.__db.fakt_tid.push(
      { id: 1, datum: "2026-08-10", maskin_id: "PONS", operator_id: "PONS_12", objekt_id: "O1", processing_sek: 25000, terrain_sek: 800, other_work_sek: 0, rast_sek: 4260, engine_time_sek: 27000 },
      { id: 2, datum: "2026-08-10", maskin_id: "PONS", operator_id: "PONS_13", objekt_id: "O1", processing_sek: 0, terrain_sek: 0, other_work_sek: 0, rast_sek: 0, engine_time_sek: 735 },
    );
    await post("2026-08-10");
    expect(dagFor(MED.stefan).rast_min).toBe(71);
    expect(dagFor(MED.joacim).rast_min).toBe(0);
  });

  it("en förare som kört två operatör-id samma dag får summan av sina egna raster", async () => {
    g.__db.operator_medarbetare.push({ operator_id: "A030353_3", medarbetare_id: MED.maxx });
    g.__db.fakt_skift.push(
      { id: 1, datum: "2026-10-01", maskin_id: "A030353", operator_id: "A030353_1", inloggning_tid: "2026-10-01T06:00:00+00:00", utloggning_tid: "2026-10-01T10:00:00+00:00", langd_sek: 14400, shift_key: "700" },
      { id: 2, datum: "2026-10-01", maskin_id: "A030353", operator_id: "A030353_3", inloggning_tid: "2026-10-01T11:00:00+00:00", utloggning_tid: "2026-10-01T15:00:00+00:00", langd_sek: 14400, shift_key: "701" },
    );
    g.__db.fakt_tid.push(
      { id: 1, datum: "2026-10-01", maskin_id: "A030353", operator_id: "A030353_1", objekt_id: null, processing_sek: 0, terrain_sek: 0, other_work_sek: 0, rast_sek: 600, engine_time_sek: 0 },
      { id: 2, datum: "2026-10-01", maskin_id: "A030353", operator_id: "A030353_3", objekt_id: null, processing_sek: 0, terrain_sek: 0, other_work_sek: 0, rast_sek: 1200, engine_time_sek: 0 },
    );
    await post("2026-10-01");
    expect(dagFor(MED.maxx).rast_min).toBe(30);
  });

  it("en förare utan någon rast i maskinen får 0", async () => {
    r64428();
    g.__db.fakt_tid = g.__db.fakt_tid.map((r: any) => ({ ...r, rast_sek: 0 }));
    await post("2026-10-07");
    expect(dagFor(MED.oskar).rast_min).toBe(0);
    expect(dagFor(MED.martin).rast_min).toBe(0);
  });
});

describe("mom-import: syntetiskt skift slutar när nästa förare loggar in", () => {
  it("R64428 2026-10-07: Oskars dag 06:59–16:50, Martins 16:50–20:50 (inte 06:59–20:50)", async () => {
    r64428();
    await post("2026-10-07");
    const oskar = dagFor(MED.oskar), martin = dagFor(MED.martin);
    expect([oskar.start_tid, oskar.slut_tid]).toEqual(["06:59", "16:50"]);
    expect([martin.start_tid, martin.slut_tid]).toEqual(["16:50", "20:50"]);
  });

  it("Ponsse (äkta skift) rörs inte: 22 min överlapp 2026-08-18 står kvar som maskinen rapporterade", async () => {
    g.__db.fakt_skift.push(
      { id: 1, datum: "2026-08-18", maskin_id: "A030353", operator_id: "A030353_2", inloggning_tid: "2026-08-18T04:07:00+00:00", utloggning_tid: "2026-08-18T07:42:00+00:00", langd_sek: 12900, shift_key: "649" },
      { id: 2, datum: "2026-08-18", maskin_id: "A030353", operator_id: "A030353_1", inloggning_tid: "2026-08-18T07:20:00+00:00", utloggning_tid: "2026-08-18T17:18:00+00:00", langd_sek: 35880, shift_key: "650" },
    );
    await post("2026-08-18");
    expect(dagFor(MED.martin).slut_tid).toBe("07:42");
    expect(dagFor(MED.maxx).start_tid).toBe("07:20");
  });

  it("redigerade och bekräftade dagar skrivs aldrig över (Oskars handrättade dag 06:59–16:50 står kvar)", async () => {
    r64428();
    g.__db.arbetsdag.push({ id: "ad-oskar", medarbetare_id: MED.oskar, datum: "2026-10-07", start_tid: "06:59:00", slut_tid: "16:50:00", rast_min: 45, redigerad: true, bekraftad: true });
    await post("2026-10-07");
    expect(insatta().some((r: any) => r.medarbetare_id === MED.oskar)).toBe(false);
    expect((g.__db.arbetsdag as any[]).find(r => r.id === "ad-oskar")).toMatchObject({ rast_min: 45, slut_tid: "16:50:00" });
  });
});

describe("mom-import: bekräftade dagar ändras inte tyst — avvikelsen registreras", () => {
  it("Martins bekräftade 10 min rast (5c-värdet) mot maskinens 0: raden rörs inte, synk_avvikelse berättar", async () => {
    r64428();
    g.__db.arbetsdag.push({ id: "ad-martin", medarbetare_id: MED.martin, datum: "2026-10-07", start_tid: "16:50:00", slut_tid: "20:50:00", rast_min: 10, redigerad: false, bekraftad: true, synk_avvikelse: null, tidigarelagd_start: null });
    await post("2026-10-07");
    const rad = (g.__db.arbetsdag as any[]).find(r => r.id === "ad-martin");
    expect(rad).toMatchObject({ rast_min: 10, start_tid: "16:50:00", slut_tid: "20:50:00", bekraftad: true });
    expect(rad.synk_avvikelse).toMatchObject({ mom_rast_min: 0, bekraftad_rast_min: 10, mom_start: "16:50", mom_slut: "20:50" });
  });
});
