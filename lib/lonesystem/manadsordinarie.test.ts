/**
 * MÅNADENS ORDINARIE (Martins beslut 2026-10-19): övertid först när månadens ordinarie timmar är fyllda.
 *
 *   ordinarie = vardagar i arbetsmånaden × 8
 *             − röda vardagar (helglön betalas för dem)
 *             − dagar med någon frånvaro (semester, ATK, komp, sjuk, VAB, föräldraledig, tjänstledig, permission, inarbetad)
 *             − dagar före anställningsdatum
 *             − frånvarotimmarna på en deldag (halv dag sjuk/VAB: timmarna, inte hela dagen)
 *
 * Facit: jan 2026 = 160 (20 vardagar efter nyårsdagen och trettondagen), aug 2026 = 168, okt 2026 med tre semesterdagar = 152.
 */
import { describe, it, expect } from "vitest";
import { manadensOrdinarie, vardagarIManad, overlapparUtjamning, utjamningOrdinarie, ordinarieText, type OrdinarieIndata } from "./manadsordinarie";

const bas = (o: Partial<OrdinarieIndata> & { arbetsperiod: string }): OrdinarieIndata => ({
  rodaDagar: [], ledigheter: [], arbetadeDatum: new Set(), deldagar: [], anstallningsdatum: null, ...o,
});

describe("vardagarIManad", () => {
  it("räknar måndag–fredag, inte helger", () => {
    expect(vardagarIManad("2026-01")).toHaveLength(22);
    expect(vardagarIManad("2026-08")).toHaveLength(21);
    expect(vardagarIManad("2026-09")).toHaveLength(22);
    expect(vardagarIManad("2026-10")).toHaveLength(22);
    expect(vardagarIManad("2026-02")).toHaveLength(20);   // februari 2026: exakt fyra hela veckor
    expect(vardagarIManad("2026-08")[0]).toBe("2026-08-03"); // 1 aug är en lördag
  });
});

describe("manadensOrdinarie — grunden och röda dagar", () => {
  it("augusti 2026 utan avdrag = 21 × 8 = 168", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-08" }));
    expect(o.timmar).toBe(168);
    expect(o.vardagar).toBe(21);
    expect(o.modell).toBe("manad");
  });

  it("januari 2026: nyårsdagen och trettondagen är röda vardagar → 20 × 8 = 160", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-01", rodaDagar: ["2026-01-01", "2026-01-06"] }));
    expect(o.timmar).toBe(160);
    expect(o.roda).toEqual(["2026-01-01", "2026-01-06"]);
  });

  it("samma röda dag två gånger i indata avdras en gång", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-01", rodaDagar: ["2026-01-01", "2026-01-01", "2026-01-06"] }));
    expect(o.roda).toEqual(["2026-01-01", "2026-01-06"]);
    expect(o.timmar).toBe(160);
  });

  it("en röd dag på en lördag är inget vardagsavdrag", () => {
    expect(manadensOrdinarie(bas({ arbetsperiod: "2026-08", rodaDagar: ["2026-08-01"] })).timmar).toBe(168);
  });

  it("röda dagar avdras alltid — också när föraren arbetade dagen", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-01", rodaDagar: ["2026-01-01", "2026-01-06"], arbetadeDatum: new Set(["2026-01-06"]) }));
    expect(o.timmar).toBe(160);
  });
});

describe("manadensOrdinarie — all frånvaro avdras, en dag i taget", () => {
  const typer = ["semester", "atk", "komp", "sjuk", "vab", "foraldraledig", "tjanstledig", "permission", "inarbetad"];
  it.each(typer)("%s på en vardag tar bort en dag (8 tim)", typ => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", ledigheter: [{ typ, startdatum: "2026-10-14", slutdatum: "2026-10-14" }] }));
    expect(o.timmar).toBe(168);
    expect(o.franvaro).toEqual(["2026-10-14"]);
  });

  it("okt 2026: tre semesterdagar (Stefan 14–16 okt) → 19 × 8 = 152", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", ledigheter: [{ typ: "semester", startdatum: "2026-10-14", slutdatum: "2026-10-16" }] }));
    expect(o.timmar).toBe(152);
    expect(o.franvaro).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
  });

  it("en period över en helg tar bara vardagarna (fre–mån = 2 dagar)", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", ledigheter: [{ typ: "semester", startdatum: "2026-10-09", slutdatum: "2026-10-12" }] }));
    expect(o.franvaro).toEqual(["2026-10-09", "2026-10-12"]);
    expect(o.timmar).toBe(160);
  });

  it("en period som börjar före och slutar efter månaden tar bara månadens vardagar", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", ledigheter: [{ typ: "semester", startdatum: "2026-09-28", slutdatum: "2026-10-02" }] }));
    expect(o.franvaro).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("frånvaro på en röd dag avdras en gång, som röd dag", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-01", rodaDagar: ["2026-01-06"], ledigheter: [{ typ: "semester", startdatum: "2026-01-05", slutdatum: "2026-01-07" }] }));
    expect(o.roda).toEqual(["2026-01-06"]);
    expect(o.franvaro).toEqual(["2026-01-05", "2026-01-07"]);
    expect(o.timmar).toBe((22 - 3) * 8);
  });

  it("två frånvarorader på samma dag avdras en gång", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", ledigheter: [
      { typ: "semester", startdatum: "2026-10-14", slutdatum: "2026-10-14" },
      { typ: "sjuk", startdatum: "2026-10-14", slutdatum: "2026-10-14" },
    ] }));
    expect(o.timmar).toBe(168);
  });

  it("arbete vinner: en heldagsrad på en dag med arbetspass avdras inte", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", arbetadeDatum: new Set(["2026-10-14"]), ledigheter: [{ typ: "sjuk", startdatum: "2026-10-14", slutdatum: "2026-10-15" }] }));
    expect(o.franvaro).toEqual(["2026-10-15"]);
    expect(o.timmar).toBe(168);
  });

  it("hemskickad utan klockslag (felaktig data) är aldrig frånvaro heller", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", ledigheter: [{ typ: "hemskickad", startdatum: "2026-10-14", slutdatum: "2026-10-14" }] }));
    expect(o.timmar).toBe(176);
    expect(o.franvaro).toEqual([]);
  });

  it("hemskickad är betald tid, aldrig frånvaro: inget avdrag", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", ledigheter: [{ typ: "hemskickad", startdatum: "2026-10-14", slutdatum: "2026-10-14", fran_tid: "14:00" }] }));
    expect(o.timmar).toBe(176);
    expect(o.franvaro).toEqual([]);
  });
});

describe("manadensOrdinarie — deldagar", () => {
  it("halv dag sjuk: frånvarotimmarna (4 tim) tas bort, inte hela dagen", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", ledigheter: [{ typ: "sjuk", startdatum: "2026-10-14", slutdatum: "2026-10-14", fran_tid: "12:00" }], deldagar: [{ datum: "2026-10-14", timmar: 4 }] }));
    expect(o.timmar).toBe(176 - 4);
    expect(o.deldag_h).toBe(4);
    expect(o.franvaro).toEqual([]);
  });

  it("tre och en halv timmars deldag ger en halv timme i ordinarie", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", deldagar: [{ datum: "2026-10-14", timmar: 3.5 }] }));
    expect(o.timmar).toBe(172.5);
  });

  it("en deldag på en dag som redan är avdragen (röd/frånvaro/före anställning) räknas inte två gånger", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", ledigheter: [{ typ: "semester", startdatum: "2026-10-14", slutdatum: "2026-10-14" }], deldagar: [{ datum: "2026-10-14", timmar: 4 }] }));
    expect(o.timmar).toBe(168);
    expect(o.deldag_h).toBe(0);
  });

  it("samma dag två gånger bland deldagarna räknas en gång", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", deldagar: [{ datum: "2026-10-14", timmar: 4 }, { datum: "2026-10-14", timmar: 4 }] }));
    expect(o.timmar).toBe(172);
    expect(o.deldag_h).toBe(4);
  });

  it("en negativ deldag (felaktig data) ökar aldrig ordinarie", () => {
    expect(manadensOrdinarie(bas({ arbetsperiod: "2026-10", deldagar: [{ datum: "2026-10-14", timmar: -4 }] })).timmar).toBe(176);
  });

  it("en deldag på en helg räknas inte", () => {
    expect(manadensOrdinarie(bas({ arbetsperiod: "2026-10", deldagar: [{ datum: "2026-10-10", timmar: 4 }] })).timmar).toBe(176);
  });

  it("två deldagar summeras", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", deldagar: [{ datum: "2026-10-14", timmar: 4 }, { datum: "2026-10-15", timmar: 2 }] }));
    expect(o.timmar).toBe(176 - 6);
  });
});

describe("manadensOrdinarie — anställningsdatum", () => {
  it("anställd den 15 oktober: vardagarna före (1–14 okt, 10 st) är inte ordinarie", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", anstallningsdatum: "2026-10-15" }));
    expect(o.anstallning).toHaveLength(10);
    expect(o.timmar).toBe(12 * 8);
  });

  it("anställd före månaden: inget avdrag", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", anstallningsdatum: "2023-08-01" }));
    expect(o.anstallning).toEqual([]);
    expect(o.timmar).toBe(176);
  });

  it("anställd efter månaden: hela månaden är före anställning → 0, aldrig negativt", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", anstallningsdatum: "2026-11-02" }));
    expect(o.timmar).toBe(0);
  });

  it("saknat anställningsdatum: inget avdrag (kontrolleras inte)", () => {
    expect(manadensOrdinarie(bas({ arbetsperiod: "2026-10", anstallningsdatum: null })).timmar).toBe(176);
  });

  it("en dag som både är röd och före anställning räknas som röd (en gång)", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-01", rodaDagar: ["2026-01-01", "2026-01-06"], anstallningsdatum: "2026-01-12" }));
    expect(o.roda).toEqual(["2026-01-01", "2026-01-06"]);
    expect(o.anstallning).toEqual(["2026-01-02", "2026-01-05", "2026-01-07", "2026-01-08", "2026-01-09"]); // före 12 jan, utan de röda
    expect(o.timmar).toBe((22 - 2 - 5) * 8);                                                               // 15 vardagar kvar = 12–30 jan
  });
});

describe("manadensOrdinarie — aldrig negativt", () => {
  it("mer deldagstimmar än månaden har blir 0, inte negativt", () => {
    expect(manadensOrdinarie(bas({ arbetsperiod: "2026-10", deldagar: [{ datum: "2026-10-14", timmar: 500 }] })).timmar).toBe(0);
  });

  it("mer avdrag än timmar blir 0", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-10", anstallningsdatum: "2026-11-02", deldagar: [{ datum: "2026-10-14", timmar: 4 }] }));
    expect(o.timmar).toBe(0);
  });
});

describe("overlapparUtjamning — månaden mot förarens utjämningsperioder", () => {
  const gavle = { startdatum: "2026-04-20", slutdatum: "2026-07-05" };
  it("en månad inuti perioden", () => expect(overlapparUtjamning("2026-05", [gavle])).toBe(true));
  it("månaden där perioden börjar (20 apr)", () => expect(overlapparUtjamning("2026-04", [gavle])).toBe(true));
  it("månaden där perioden slutar (5 jul)", () => expect(overlapparUtjamning("2026-07", [gavle])).toBe(true));
  it("månaden före (mars) och efter (aug) rörs inte", () => {
    expect(overlapparUtjamning("2026-03", [gavle])).toBe(false);
    expect(overlapparUtjamning("2026-08", [gavle])).toBe(false);
  });
  it("ingen period: aldrig", () => expect(overlapparUtjamning("2026-05", [])).toBe(false));
  it("gränsdagarna räknas: perioden slutar den 1:a i månaden / börjar den sista", () => {
    expect(overlapparUtjamning("2026-08", [{ startdatum: "2026-07-01", slutdatum: "2026-08-01" }])).toBe(true);
    expect(overlapparUtjamning("2026-08", [{ startdatum: "2026-08-31", slutdatum: "2026-09-30" }])).toBe(true);
  });
  it("slutdatum den 30:e i månaden före / startdatum den 1:a efter räknas inte som överlapp", () => {
    expect(overlapparUtjamning("2026-08", [{ startdatum: "2026-06-01", slutdatum: "2026-07-31" }])).toBe(false);
    expect(overlapparUtjamning("2026-08", [{ startdatum: "2026-09-01", slutdatum: "2026-09-30" }])).toBe(false);
  });
});

describe("utjamningOrdinarie — dagens formel: arbetade dagar × 8", () => {
  it("13 arbetade dagar i augusti = 104 tim, modellen säger det, och ingenting dras av", () => {
    const o = utjamningOrdinarie("2026-08", 13);
    expect(o).toEqual({ modell: "utjamning", timmar: 104, vardagar: 21, roda: [], franvaro: [], anstallning: [], deldag_h: 0 });
  });
});

describe("ordinarieText — så står det i granskningen", () => {
  it("utan avdrag: bara vardagarna", () => {
    expect(ordinarieText(manadensOrdinarie(bas({ arbetsperiod: "2026-08" })))).toBe("21 vardagar × 8h");
  });
  it("en röd dag och en dag före anställning står i singular, och en period i singular/plural följer antalet", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-01", rodaDagar: ["2026-01-01"], anstallningsdatum: "2026-01-05" }));
    expect(ordinarieText(o)).toBe("22 vardagar × 8h − 1 röd dag − 1 dag före anställning");
    const e = manadensOrdinarie(bas({ arbetsperiod: "2026-01", anstallningsdatum: "2026-01-05", rodaDagar: [] }));
    expect(ordinarieText(e)).toBe("22 vardagar × 8h − 2 dagar före anställning");
    const en = manadensOrdinarie(bas({ arbetsperiod: "2026-01", anstallningsdatum: "2026-01-02" }));
    expect(ordinarieText(en)).toBe("22 vardagar × 8h − 1 dag före anställning");
  });
  it("med avdrag: varje slag med antal", () => {
    const o = manadensOrdinarie(bas({ arbetsperiod: "2026-01", rodaDagar: ["2026-01-01", "2026-01-06"], ledigheter: [{ typ: "sjuk", startdatum: "2026-01-12", slutdatum: "2026-01-12" }], deldagar: [{ datum: "2026-01-13", timmar: 4 }] }));
    expect(ordinarieText(o)).toBe("22 vardagar × 8h − 2 röda dagar − 1 frånvarodag − 4h deldag");
  });
});
