import { describe, it, expect } from "vitest";
import fixtur from "@/lib/__fixtures__/vilobrott_fore_efter_exempel.json";
import { jamforVilobrott, rapportText, type Analys, type ForeEfterExport } from "./vilobrottForeEfter";
import type { Vilobrott } from "@/lib/vilobrott";

const A = "a0000000-0000-0000-0000-000000000001";
const B = "b0000000-0000-0000-0000-000000000002";
const brott = (typ: Vilobrott["typ"], datum: string, vila_h: number): Vilobrott => ({ typ, datum, vecka: 1, år: 2026, vila_h, krav_h: typ === "dygnsvila" ? 11 : 36, beskrivning: "" });

function exp(over: Partial<ForeEfterExport> = {}): ForeEfterExport {
  return {
    nu: "2026-10-14T10:00:00Z",
    trosklar: { dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 },
    medarbetare: [{ id: A, namn: "Anna" }, { id: B, namn: "Bo" }],
    arbetsdag: [
      { medarbetare_id: A, datum: "2026-09-10", start_tid: "07:00", slut_tid: "16:00" },
      { medarbetare_id: B, datum: "2026-09-10", start_tid: "22:00", slut_tid: "06:00" },
    ],
    extra_tid: [],
    vilobrott: [],
    ...over,
  };
}
// Stub: svarar per förare (via första passets datum/tid) och per 'nu' (Date = full regel, null = bara före första passet).
const stubb = (perForare: Record<string, { gammal?: Vilobrott[]; nyFull?: Vilobrott[]; nyUtanSlut?: Vilobrott[] }>, vilket: "gammal" | "ny"): Analys =>
  (dagar, _t, nu) => {
    const id = dagar[0].start_tid === "07:00" ? A : B;
    const p = perForare[id] || {};
    if (vilket === "gammal") return p.gammal || [];
    return nu === null ? (p.nyUtanSlut || p.nyFull || []) : (p.nyFull || []);
  };

describe("jamforVilobrott — försvinner, tillkommer, ändras", () => {
  it("brott som bara finns FÖRE försvinner, bara EFTER tillkommer, olika vila ändras", () => {
    const r = jamforVilobrott(exp(), stubb({
      [A]: { gammal: [brott("veckovila", "2026-09-10", 14), brott("veckovila", "2026-09-20", 20)], nyFull: [brott("veckovila", "2026-09-20", 22)] },
      [B]: { gammal: [], nyFull: [brott("dygnsvila", "2026-09-10", 8)] },
    }, "gammal"), stubb({
      [A]: { gammal: [brott("veckovila", "2026-09-10", 14), brott("veckovila", "2026-09-20", 20)], nyFull: [brott("veckovila", "2026-09-20", 22)] },
      [B]: { gammal: [], nyFull: [brott("dygnsvila", "2026-09-10", 8)] },
    }, "ny"));
    expect(r.antal_gamla).toBe(2);
    expect(r.antal_nya).toBe(2);
    expect(r.skillnader.map(s => `${s.slag}:${s.namn}:${s.typ}:${s.datum}`)).toEqual([
      "forsvinner:Anna:veckovila:2026-09-10",
      "tillkommer:Bo:dygnsvila:2026-09-10",
      "andrad:Anna:veckovila:2026-09-20",
    ]);
    const andrad = r.skillnader[2];
    expect([andrad.vila_fore, andrad.vila_efter]).toEqual([20, 22]);
  });

  it("orsaken till ett försvunnet veckovilabrott: finns det kvar när bara 'före första passet' gäller är det vilan efter sista passet, annars tiden före första", () => {
    const stub = { [A]: { gammal: [brott("veckovila", "2026-09-10", 14), brott("veckovila", "2026-09-20", 14)], nyFull: [], nyUtanSlut: [brott("veckovila", "2026-09-20", 14)] } };
    const r = jamforVilobrott(exp(), stubb(stub, "gammal"), stubb(stub, "ny"));
    const per = Object.fromEntries(r.skillnader.map(s => [s.datum, s.orsak]));
    expect(per["2026-09-10"]).toMatch(/före första passet/);
    expect(per["2026-09-20"]).toMatch(/efter sista passet fram till nu/);
  });

  it("nya reglerna anropas med 'nu' omräknat till Stockholms väggklocka (12:00 för 10:00Z i oktober), den gamla utan", () => {
    const sedda: (Date | null | undefined)[] = [];
    const gammal: Analys = () => [];
    const ny: Analys = (_d, _t, nu) => { sedda.push(nu); return []; };
    jamforVilobrott(exp(), gammal, ny);
    const full = sedda.find(n => n instanceof Date) as Date;
    expect([full.getFullYear(), full.getMonth() + 1, full.getDate(), full.getHours()]).toEqual([2026, 10, 14, 12]);
    expect(sedda).toContain(null);   // orsaksbestämningen kör också utan avslutande vila
  });

  it("0 h-brott (arTroligtVilobrott) räknas inte med i någon lista", () => {
    const s = { [A]: { gammal: [brott("veckovila", "2026-09-10", 0)], nyFull: [] } };
    const r = jamforVilobrott(exp(), stubb(s, "gammal"), stubb(s, "ny"));
    expect(r.antal_gamla).toBe(0);
    expect(r.skillnader).toEqual([]);
  });

  it("ogiltigt 'nu' i exporten är ett fel, inte tyst tomt", () => {
    expect(() => jamforVilobrott(exp({ nu: "inte-ett-datum" }), () => [], () => [])).toThrow(/Ogiltigt 'nu'/);
  });
});

describe("jamforVilobrott — lagrade rader (tabellen vilobrott)", () => {
  const s = { [A]: { gammal: [brott("veckovila", "2026-09-10", 14)], nyFull: [brott("veckovila", "2026-09-20", 30)] } };
  const lagrad = (datum: string, vila_h: number, besvarat: boolean, typ: "veckovila" | "dygnsvila" = "veckovila") => ({ medarbetare_id: A, typ, datum, vila_h, besvarat_av_forare: besvarat });

  it("obesvarad rad utan stöd raderas, besvarad står kvar, stödd rad med annan vila ändras, oförändrad lämnas", () => {
    const r = jamforVilobrott(exp({
      vilobrott: [lagrad("2026-09-10", 14, false), lagrad("2026-09-11", 14, true), lagrad("2026-09-20", 28, false), lagrad("2026-09-20", 30, false, "dygnsvila")],
    }), stubb(s, "gammal"), stubb(s, "ny"));
    const u = Object.fromEntries(r.lagrade.map(l => [`${l.typ}${l.datum}${l.besvarad}`, l.utfall]));
    expect(u["veckovila2026-09-10false"]).toBe("stods_inte_obesvarad_raderas");
    expect(u["veckovila2026-09-11true"]).toBe("stods_inte_besvarad_star_kvar");
    expect(u["veckovila2026-09-20false"]).toBe("stods_ny_vila");
    expect(u["dygnsvila2026-09-20false"]).toBe("stods_inte_obesvarad_raderas");
  });

  it("oförändrad rad: samma vila i nya analysen", () => {
    const r = jamforVilobrott(exp({ vilobrott: [lagrad("2026-09-20", 30, false)] }), stubb(s, "gammal"), stubb(s, "ny"));
    expect(r.lagrade[0].utfall).toBe("stods_oforandrat");
  });

  it("rad FÖRE underlagets första datum kan inte bedömas och raderas aldrig av jämförelsen", () => {
    const r = jamforVilobrott(exp({ vilobrott: [lagrad("2026-08-01", 14, false)] }), stubb(s, "gammal"), stubb(s, "ny"));
    expect(r.lagrade[0].utfall).toBe("utanfor_underlaget");
  });

  it("'redan utan stöd förut' skiljer rader som ändringen tar bort från rader som redan var obelagda", () => {
    const r = jamforVilobrott(exp({ vilobrott: [lagrad("2026-09-10", 14, false), lagrad("2026-09-15", 14, false)] }), stubb(s, "gammal"), stubb(s, "ny"));
    const per = Object.fromEntries(r.lagrade.map(l => [l.datum, l.stod_utan_stod_redan]));
    expect(per["2026-09-10"]).toBe(false);   // fanns i gamla analysen — ändringen tar bort den
    expect(per["2026-09-15"]).toBe(true);    // fanns aldrig i gamla analysen heller
  });

  it("en skillnad märks med lagrad rad när det finns en", () => {
    const r = jamforVilobrott(exp({ vilobrott: [lagrad("2026-09-10", 14, true)] }), stubb(s, "gammal"), stubb(s, "ny"));
    expect(r.skillnader.find(x => x.datum === "2026-09-10")!.lagrad).toBe("besvarad");
  });
});

describe("rapportText", () => {
  it("rubrikerna, räkneverken och en rad per skillnad; tomt läge säger det", () => {
    const tom = rapportText(jamforVilobrott(exp(), () => [], () => []));
    expect(tom).toContain("0 brott · efter ändringen: 0 brott");
    expect(tom).toContain("## FÖRSVINNER (0)\n(inga)");
    expect(tom).toContain("Alla lagrade rader stöds oförändrade.");
    const s = { [A]: { gammal: [brott("veckovila", "2026-09-10", 14.5)], nyFull: [] } };
    const t = rapportText(jamforVilobrott(exp(), stubb(s, "gammal"), stubb(s, "ny")));
    expect(t).toContain("| Anna | veckovila | 2026-09-10 | 14,5 → — |");
  });
});

describe("exempelunderlaget med de riktiga analyserna (nya) — varje slags skillnad finns med", () => {
  it("fixturen är väl formad och nya analysen ger exakt ett nattbrott", async () => {
    const { analyseraVilobrott, arTroligtVilobrott, medPerioddagSpann } = await import("@/lib/vilobrott");
    const { sthlmVaggklocka } = await import("@/lib/sthlmTid");
    const e = fixtur as unknown as ForeEfterExport;
    const nu = sthlmVaggklocka(new Date(e.nu))!;
    const alla = e.medarbetare.flatMap(m => analyseraVilobrott(medPerioddagSpann(e.arbetsdag.filter(d => d.medarbetare_id === m.id), []), e.trosklar, nu).filter(arTroligtVilobrott));
    expect(alla.map(b => `${b.typ}:${b.datum}`)).toEqual(["dygnsvila:2026-10-05"]);
  });
});
