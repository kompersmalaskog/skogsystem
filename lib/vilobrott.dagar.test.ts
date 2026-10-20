import { describe, it, expect } from "vitest";
import { analyseraVilobrott, veckovilaPerDag, vilobrottDagar, type VilaTrosklar } from "./vilobrott";
import { sthlmVaggklocka } from "./sthlmTid";

const trosklar: VilaTrosklar = {
  dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14,
};
const dag = (datum: string, start = "06:00", slut = "16:00") => ({ datum, start_tid: start, slut_tid: slut });
const dagarFran = (fran: string, antal: number, start = "06:00", slut = "16:00") =>
  Array.from({ length: antal }, (_, i) => dag(new Date(new Date(fran + "T12:00:00").getTime() + i * 86400000).toISOString().slice(0, 10), start, slut));

describe("vilobrottDagar: dagarna bakom ett brott", () => {
  it("dygnsvila: dagen före (slut) och dagen efter (start) med vilan mellan dem", () => {
    const pass = [...dagarFran("2026-09-22", 6, "05:00", "15:00"), dag("2026-09-28", "05:00", "20:30"), dag("2026-09-29", "05:00", "15:30")];
    const b = analyseraVilobrott(pass, trosklar, null).find(x => x.typ === "dygnsvila")!;
    expect(b.vila_h).toBe(8.5);
    const d = vilobrottDagar(b, pass, trosklar, null)!;
    expect(d.pass).toEqual([
      { datum: "2026-09-28", start_tid: "05:00", slut_tid: "20:30" },
      { datum: "2026-09-29", start_tid: "05:00", slut_tid: "15:30" },
    ]);
    expect(d.vila).toMatchObject({ fran: { datum: "2026-09-28", tid: "20:30" }, till: { datum: "2026-09-29", tid: "05:00" }, h: 8.5, slag: "mellan" });
    expect(d.fonster).toBeNull();
  });

  it("dygnsvila efter ett pass över midnatt: vilan räknas från passets verkliga slut (nästa dygn)", () => {
    const pass = [dag("2026-09-27", "22:00", "02:00"), dag("2026-09-28", "05:00", "13:00")];
    const b = analyseraVilobrott(pass, trosklar, null).find(x => x.typ === "dygnsvila")!;
    expect(b.vila_h).toBe(3);
    const d = vilobrottDagar(b, pass, trosklar, null)!;
    expect(d.vila.fran).toEqual({ datum: "2026-09-28", tid: "02:00" });
    expect(d.vila.till).toEqual({ datum: "2026-09-28", tid: "05:00" });
    expect(d.pass.map(p => p.datum)).toEqual(["2026-09-27", "2026-09-28"]);
  });

  it("dygnsvila: två pass med samma datum — paret vars vila är brottets pekas ut", () => {
    const pass = [dag("2026-09-28", "05:00", "09:00"), dag("2026-09-28", "10:00", "15:00"), dag("2026-09-29", "01:00", "09:00")];
    const brott = analyseraVilobrott(pass, trosklar, null).filter(x => x.typ === "dygnsvila");
    expect(brott.length).toBeGreaterThan(0);
    for (const b of brott) {
      const d = vilobrottDagar(b, pass, trosklar, null)!;
      expect(d).not.toBeNull();
      expect(Math.round(d.vila.h * 10) / 10).toBe(b.vila_h);
    }
  });

  it("veckovila: veckan där den längsta vilan är 30 h — vilan ligger mellan lördagens och söndagens pass, och passen runt den är med", () => {
    // mån–fre 06–16, lör 06–12, sön 18–22, mån 06–16: längsta vilan lör 12:00 → sön 18:00 (30 h), kravet 36 h.
    // (Måndagen börjar 07:00: annars blir tiden före första passet, som räknas som vila, också 30 h och är det som pekas ut.)
    const pass = [
      dag("2026-09-14", "07:00"), dag("2026-09-15"), dag("2026-09-16"), dag("2026-09-17"), dag("2026-09-18"),
      dag("2026-09-19", "06:00", "12:00"), dag("2026-09-20", "18:00", "22:00"), dag("2026-09-21"),
    ];
    const brott = analyseraVilobrott(pass, trosklar, null).filter(x => x.typ === "veckovila");
    expect(brott.length).toBe(1);
    expect(brott[0].vila_h).toBe(30);
    const d = vilobrottDagar(brott[0], pass, trosklar, null)!;
    expect(d.vila).toMatchObject({ fran: { datum: "2026-09-19", tid: "12:00" }, till: { datum: "2026-09-20", tid: "18:00" }, h: 30, slag: "mellan" });
    expect(d.pass.map(p => p.datum)).toContain("2026-09-19");
    expect(d.pass.map(p => p.datum)).toContain("2026-09-20");
    // passen är i datumordning och bara de som hör till fönstret (7 dagar) eller gränsar till vilan
    expect(d.pass.map(p => p.datum)).toEqual([...d.pass.map(p => p.datum)].sort());
    expect(d.fonster).not.toBeNull();
    const dagar = (new Date(d.fonster!.till).getTime() - new Date(d.fonster!.fran).getTime()) / 86400000;
    expect(dagar).toBe(6);
  });

  it("veckovila: passet som vilan BÖRJAR efter visas även när det ligger före fönstrets första dag", () => {
    // Vilan lör 19 sep 12:00 → sön 20 sep 18:00 (30 h) räknas i fönstret 20–26 sep fast lördagen är före fönstret.
    const pass = [
      ...dagarFran("2026-09-08", 5), dag("2026-09-13", "06:00", "10:00"), dag("2026-09-14", "07:00"), dag("2026-09-15"), dag("2026-09-16"), dag("2026-09-17"), dag("2026-09-18"),
      dag("2026-09-19", "06:00", "12:00"), dag("2026-09-20", "18:00", "22:00"), ...dagarFran("2026-09-21", 6),
    ];
    const dagligt = veckovilaPerDag(pass, 7, null).find(r => r.datum === "2026-09-26")!;
    expect(dagligt.max_h).toBe(30);
    const d = vilobrottDagar({ typ: "veckovila", datum: "2026-09-26", vila_h: 30 }, pass, trosklar, null)!;
    expect(d.fonster).toEqual({ fran: "2026-09-20", till: "2026-09-26" });
    expect(d.vila.fran).toEqual({ datum: "2026-09-19", tid: "12:00" });
    expect(d.pass.map(p => p.datum)).toContain("2026-09-19");   // utanför fönstret, men det är passet vilan börjar efter
    expect(d.pass.map(p => p.datum)).not.toContain("2026-09-18");
  });

  it("veckovila: passet som vilan SLUTAR med visas även när det ligger efter fönstrets sista dag", () => {
    // Vilan fre 18 sep 16:00 → lör 19 sep 22:00 (30 h) räknas i fönstret 12–18 sep fast lördagens pass ligger efter fönstret.
    const pass = [...dagarFran("2026-09-08", 11), dag("2026-09-19", "22:00", "23:30")];
    const dagligt = veckovilaPerDag(pass, 7, null).find(r => r.datum === "2026-09-18")!;
    expect(dagligt.max_h).toBe(30);
    const d = vilobrottDagar({ typ: "veckovila", datum: "2026-09-18", vila_h: 30 }, pass, trosklar, null)!;
    expect(d.fonster).toEqual({ fran: "2026-09-12", till: "2026-09-18" });
    expect(d.vila.till).toEqual({ datum: "2026-09-19", tid: "22:00" });
    expect(d.pass.map(p => p.datum)).toContain("2026-09-19");
  });

  it("veckovila: fönstret är det vars längsta vila är brottets lägsta (inte bara stretchens första dag)", () => {
    const pass = dagarFran("2026-09-14", 10);   // 14 h vila varje natt, aldrig 36 h
    const brott = analyseraVilobrott(pass, trosklar, null).filter(x => x.typ === "veckovila");
    expect(brott.length).toBeGreaterThan(0);
    for (const b of brott) {
      const d = vilobrottDagar(b, pass, trosklar, null)!;
      expect(d).not.toBeNull();
      expect(Math.round(d.vila.h * 10) / 10).toBe(b.vila_h);
      expect(d.vila.slag).toBe("mellan");
      // vilan ligger mellan två pass som båda är med i listan
      expect(d.pass.some(p => p.datum === d.vila.fran.datum)).toBe(true);
      expect(d.pass.some(p => p.datum === d.vila.till.datum)).toBe(true);
    }
  });

  it("vilan efter sista passet fram till 'nu' pekas ut när den är den längsta i fönstret", () => {
    // Sju dagar i rad före (14 h natter), sista passet lör 19 sep 16:00, nu = sön 20 sep 08:00 → 16 h efter sista passet är längre än nätterna.
    const pass = dagarFran("2026-09-12", 8);
    const nu = sthlmVaggklocka(new Date("2026-09-20T06:00:00Z"))!;   // sön 08:00 svensk tid
    const dagligt = veckovilaPerDag(pass, 7, nu).find(r => r.datum === "2026-09-19")!;
    expect(dagligt.max_h).toBe(16);
    const d = vilobrottDagar({ typ: "veckovila", datum: "2026-09-19", vila_h: 16 }, pass, trosklar, nu)!;
    expect(d.vila.slag).toBe("efter_sista");
    expect(d.vila.fran).toEqual({ datum: "2026-09-19", tid: "16:00" });
    expect(d.vila.till).toEqual({ datum: "2026-09-20", tid: "08:00" });
    expect(d.vila.h).toBe(16);
  });

  it("tiden före första passet pekas ut som vilan när den är den längsta (ändarna räknas som vila)", () => {
    const pass = dagarFran("2026-09-14", 6);   // första passet mån 14 sep 06:00
    const dagligt = veckovilaPerDag(pass, 7, null).find(r => r.datum === "2026-09-19")!;
    const d = vilobrottDagar({ typ: "veckovila", datum: "2026-09-19", vila_h: dagligt.max_h }, pass, trosklar, null)!;
    expect(d.vila.slag).toBe("fore_forsta");
    expect(d.vila.till).toEqual({ datum: "2026-09-14", tid: "06:00" });
  });

  it("det som inte går att peka ut blir null — aldrig fel dagar: vila som inte stämmer med underlaget", () => {
    const pass = [dag("2026-09-28", "05:00", "20:30"), dag("2026-09-29", "05:00", "15:30")];
    expect(vilobrottDagar({ typ: "dygnsvila", datum: "2026-09-28", vila_h: 9.5 }, pass, trosklar, null)).toBeNull();
    expect(vilobrottDagar({ typ: "dygnsvila", datum: "2026-09-27", vila_h: 8.5 }, pass, trosklar, null)).toBeNull();
    expect(vilobrottDagar({ typ: "veckovila", datum: "2026-09-28", vila_h: 99 }, pass, trosklar, null)).toBeNull();
    expect(vilobrottDagar({ typ: "veckovila", datum: "2026-01-01", vila_h: 14 }, pass, trosklar, null)).toBeNull();
  });

  it("varje brott analysen hittar går att peka ut, och vilan som pekas ut har brottets längd (en uträkning, två vyer)", () => {
    const pass = [
      ...dagarFran("2026-09-01", 12, "05:00", "16:30"),
      dag("2026-09-15", "22:00", "03:00"), dag("2026-09-16", "06:00", "14:00"),
      ...dagarFran("2026-09-20", 5, "04:00", "18:00"),
    ];
    const brott = analyseraVilobrott(pass, trosklar, null);
    expect(brott.length).toBeGreaterThan(3);
    for (const b of brott) {
      const d = vilobrottDagar(b, pass, trosklar, null);
      expect(d, `${b.typ} ${b.datum}`).not.toBeNull();
      expect(Math.round(d!.vila.h * 10) / 10, `${b.typ} ${b.datum}`).toBe(b.vila_h);
    }
  });
});
