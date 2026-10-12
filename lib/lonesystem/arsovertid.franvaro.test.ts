import { describe, it, expect } from "vitest";
import { beraknaArsovertid } from "./arsovertid";
import type { FranvaroRad } from "../franvaro";

// Basen i genomsnittsmodellen = 40 tim/vecka minus FRÅNVARO (semester, sjuk, VAB, föräldraledig, ATK, komp, tjänstledig,
// permission; 8 tim/heldag) och minus RÖDA VARDAGAR (8 tim/dag). Förr räknades varje vecka som 40 tim ordinarie bas, även
// veckor med frånvaro: Stefans v28–29 (semester) tog 80 tim övertid ur blocket och hans tal blev 74,5 i stället för ca 190.
//
// Isolering: varje test markerar EN vecka som utjämningsperiod, så perioden ger just den veckans bas, timmar och övertid.
const AR = 2026;
const dag = (datum: string, timmar: number) => ({ datum, arbetad_min: Math.round(timmar * 60), dagtyp: "Produktion", start_tid: "06:00:00" });
const fr = (typ: string, startdatum: string, slutdatum: string, extra: Partial<FranvaroRad> = {}): FranvaroRad =>
  ({ medarbetare_id: "m", typ: typ as any, startdatum, slutdatum, status: "godkänd", ...extra });
/** Vecka 6 2026 (mån 2/2 – sön 8/2): inga röda dagar. */
const V6 = [{ startdatum: "2026-02-02", slutdatum: "2026-02-08" }];
const V6_DAGAR = ["2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05", "2026-02-06"];
const arbeta = (...h: number[]) => h.map((x, i) => dag(V6_DAGAR[i], x));
const period = (dagar: any[], franvaro: FranvaroRad[], perioder = V6, tom = "2026-03-01", n = 6) =>
  beraknaArsovertid(dagar, [], AR, tom, perioder, franvaro).perioder.find(p => p.markerad && p.fran === n)!;

describe("basen per vecka: 40 − frånvaro − röda vardagar", () => {
  it("ingen frånvaro: basen är 40 och övertiden är timmarna över 40", () => {
    const p = period(arbeta(9, 9, 9, 9, 9), []);
    expect(p).toMatchObject({ bas: 40, franvaroTimmar: 0, rodaTimmar: 0, timmar: 45, overtid: 5 });
  });

  it("en hel vecka semester: basen är 0, inte 40 — och ingen övertid av att inte arbeta", () => {
    const p = period([], [fr("semester", "2026-02-02", "2026-02-06")]);
    expect(p).toMatchObject({ bas: 0, franvaroTimmar: 40, timmar: 0, overtid: 0 });
  });

  it("tre dagars semester (24 tim) och 20 tim arbete resten: bas 16, övertid 4", () => {
    const p = period([dag("2026-02-05", 10), dag("2026-02-06", 10)], [fr("semester", "2026-02-02", "2026-02-04")]);
    expect(p).toMatchObject({ bas: 16, franvaroTimmar: 24, timmar: 20, overtid: 4 });
  });

  it.each(["semester", "sjuk", "vab", "foraldraledig", "atk", "komp", "tjanstledig", "permission"])("%s dras ur basen (8 tim per dag)", (typ) => {
    expect(period([], [fr(typ, "2026-02-04", "2026-02-04", typ === "sjuk" || typ === "vab" ? { status: "registrerad" } : {})])).toMatchObject({ bas: 32, franvaroTimmar: 8 });
  });

  it("inarbetad (skoftning §5 mom 4) är ingen frånvaro: basen rörs inte", () => {
    expect(period([], [fr("inarbetad", "2026-02-02", "2026-02-02", { ersatter_datum: "2026-01-06" })])).toMatchObject({ bas: 40, franvaroTimmar: 0 });
  });

  it("väntande och nekad ledighet är inte frånvaro", () => {
    expect(period([], [fr("semester", "2026-02-02", "2026-02-06", { status: "väntar" }), fr("semester", "2026-02-02", "2026-02-06", { status: "nekad" })])).toMatchObject({ bas: 40, franvaroTimmar: 0 });
  });

  it("anmäld frånvaro (registrerad: sjuk/VAB/föräldraledig) räknas", () => {
    expect(period([], [fr("sjuk", "2026-02-02", "2026-02-03", { status: "registrerad" })])).toMatchObject({ bas: 24, franvaroTimmar: 16 });
  });

  it("ARBETE VINNER: en heldagsrad över en arbetad dag drar inget (dagen är arbete, annars dubbel räkning)", () => {
    const p = period([dag("2026-02-04", 8)], [fr("semester", "2026-02-02", "2026-02-06")]);
    expect(p).toMatchObject({ franvaroTimmar: 32, bas: 8, timmar: 8, overtid: 0 });
  });

  it("deldag: sjuk onsdag från 12:00 efter 3 tim arbete = 5 tim frånvaro (schema 8 − arbetade)", () => {
    const p = period([dag("2026-02-02", 8), dag("2026-02-03", 8), dag("2026-02-04", 3), dag("2026-02-05", 8), dag("2026-02-06", 8)],
      [fr("sjuk", "2026-02-04", "2026-02-04", { status: "registrerad", fran_tid: "12:00:00" })]);
    expect(p).toMatchObject({ franvaroTimmar: 5, bas: 35, timmar: 35, overtid: 0 });
  });

  it("helgdagar i en frånvaroperiod dras inte: semester fre–mån ger bara fredagen i vecka 6", () => {
    expect(period([], [fr("semester", "2026-02-06", "2026-02-09")])).toMatchObject({ franvaroTimmar: 8, bas: 32 });
  });

  it("över årsskiftet: v1 börjar mån 29/12, så semester 22/12–9/1 drar 29–30/12 och 2–9/1 som frånvaro, och 31/12, 1/1, 6/1 som röda", () => {
    const r = beraknaArsovertid([], [], AR, "2026-01-11", [], [fr("semester", "2025-12-22", "2026-01-09")]);
    // ons 31/12 (nyårsafton, röd), tors 1/1 (röd), tis 6/1 (röd): 24 tim röda. Mån 29/12, tis 30/12, fre 2/1, mån 5/1, ons 7/1–fre 9/1: 7 × 8 = 56 tim frånvaro.
    expect(r.basavdrag).toEqual({ franvaroTimmar: 56, rodaTimmar: 24 });
  });
});

describe("röda vardagar", () => {
  const V18 = [{ startdatum: "2026-04-27", slutdatum: "2026-05-03" }]; // 1 maj = fredag
  it("en röd vardag drar 8 tim: basen 32; jobbar man den räknas det som övertid", () => {
    expect(period([dag("2026-04-27", 8), dag("2026-04-28", 8), dag("2026-04-29", 8), dag("2026-04-30", 8)], [], V18, "2026-05-10", 18)).toMatchObject({ rodaTimmar: 8, bas: 32, timmar: 32, overtid: 0 });
    expect(period([dag("2026-04-27", 8), dag("2026-04-28", 8), dag("2026-04-29", 8), dag("2026-04-30", 8), dag("2026-05-01", 8)], [], V18, "2026-05-10", 18)).toMatchObject({ bas: 32, timmar: 40, overtid: 8 });
  });
  it("röd dag på en lördag eller söndag drar inget (6 juni 2026)", () => {
    expect(period([], [], [{ startdatum: "2026-06-01", slutdatum: "2026-06-07" }], "2026-06-14", 23)).toMatchObject({ rodaTimmar: 0, bas: 40 });
  });
  it("röd dag OCH semester samma dag räknas EN gång: semester mån–fre över 1 maj ger 32 + 8, inte 32 + 8 + 8", () => {
    expect(period([], [fr("semester", "2026-04-27", "2026-05-01")], V18, "2026-05-10", 18)).toMatchObject({ franvaroTimmar: 32, rodaTimmar: 8, bas: 0 });
  });
});

describe("gäller både markerade perioder och antagna block, och året/veckan som den är", () => {
  it("antaget block: en veckas semester sänker blockets bas med 40", () => {
    const med = beraknaArsovertid([], [], AR, "2026-03-01", [], [fr("semester", "2026-02-16", "2026-02-20")]).perioder[0];
    const utan = beraknaArsovertid([], [], AR, "2026-03-01", [], []).perioder[0];
    expect(utan.bas - med.bas).toBe(40);
    expect(med.franvaroTimmar).toBe(40);
  });

  it("vecka 1 (29/12–4/1): nyårsafton och nyårsdagen är röda → basen 24, inte 40; 1,7 tim arbetat ger ingen övertid", () => {
    const p = beraknaArsovertid([dag("2026-01-02", 1.7)], [], AR, "2026-01-11", [{ startdatum: "2025-12-29", slutdatum: "2026-01-04" }], []).perioder.find(x => x.markerad)!;
    expect(p).toMatchObject({ fran: 1, till: 1, rodaTimmar: 16, bas: 24, timmar: 1.7, overtid: 0 });
  });

  it("den pågående veckan räknas bara t.o.m. idag: onsdag ger basen 24, inte 40", () => {
    const r = beraknaArsovertid([], [], AR, "2026-02-11", [{ startdatum: "2026-02-09", slutdatum: "2026-02-15" }], []);
    expect(r.perioder.find(x => x.markerad)).toMatchObject({ fran: 7, till: 7, bas: 24 });
  });

  it("basavdraget för hela året summerar frånvaro och röda dagar", () => {
    const r = beraknaArsovertid([], [], AR, "2026-03-01", [], [fr("semester", "2026-02-16", "2026-02-20"), fr("sjuk", "2026-02-24", "2026-02-24", { status: "registrerad" })]);
    expect(r.basavdrag.franvaroTimmar).toBe(48);
    expect(r.basavdrag.rodaTimmar).toBe(24); // 31/12 (v1), 1/1 och 6/1
  });

  it("övertiden blir aldrig negativ: en vecka med mindre arbete än basen ger 0", () => {
    expect(period(arbeta(4, 4, 4, 4, 4), [])).toMatchObject({ bas: 40, timmar: 20, overtid: 0 });
  });
});
