import { describe, it, expect } from "vitest";
import { datumLang, datumSpann, deldagText, attTittaPa, dagAvvikelser, okandaVarningar, minText, timMin, kmUppdelning } from "./forarText";

describe("datum i förarens ord", () => {
  it("datumLang", () => expect(datumLang("2026-09-17")).toBe("17 september"));
  it("spann och lösa dagar", () => {
    expect(datumSpann(["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-09"])).toBe("3–5 och 9 september");
    expect(datumSpann(["2026-09-09"])).toBe("9 september");
  });
  it("minText", () => {
    expect(minText(1)).toBe("1 min");
    expect(minText(98)).toBe("1 tim 38 min");
  });
});

describe("tid i timmar och minuter, km uppdelad", () => {
  it("timMin", () => {
    expect(timMin(8.87)).toBe("8 tim 52 min");
    expect(timMin(128.17)).toBe("128 tim 10 min");
    expect(timMin(8)).toBe("8 tim");
    expect(timMin(0.5)).toBe("30 min");
  });
  it("kmUppdelning: ersättningen räknas per dag, inte på summan", () => {
    const k = kmUppdelning([{ km_totalt: 58, ersattningsmil: 0 }, { km_totalt: 68, ersattningsmil: 1 }, { km_totalt: 40 }], 60);
    expect(k).toEqual({ totalKm: 166, overKm: 8, dagarOver: 1, mil: 1 });
  });
});

describe("deldag — Martins formulering", () => {
  it("från ett klockslag", () => expect(deldagText({ typ: "sjuk", fran_tid: "12:03:00", till_tid: null })).toBe("jobbade till 12:03, sedan sjuk"));
  it("VAB", () => expect(deldagText({ typ: "vab", fran_tid: "14:30", till_tid: null })).toBe("jobbade till 14:30, sedan VAB"));
  it("föräldraledig", () => expect(deldagText({ typ: "foraldraledig", fran_tid: "14:30", till_tid: null })).toBe("jobbade till 14:30, sedan föräldraledig"));
});

describe("Att titta på — inga paragrafer, inga systemord", () => {
  const spec = {
    varningar: [
      "Kortpass (under 60 min): 2026-09-17 1 min · 48 km — betald tid men ingen arbetsdag: ingen ×8 i övertidsbasen, ingen vältlappsvecka, ingen reseersättning. Ta bort dagen om den är en felinloggning.",
      "Deldag (sjuk) 2026-09-29 från 12:03: 0.6 tim frånvaro (arbetade 7.4 tim, räknat mot 8 tim/dag — ANTAGANDE tills schema beslutats, §12 mom 3 anm 2). Dagen är arbetsdag. Löneart ej fastställd; läggs INTE som lönerad.",
      "2h extra tid ligger på dagar utan maskinpass — räknas som arbetstid men höjer inte ordinarie-timmarna (kan ge övertid). Granska.",
    ],
    kortpass: [{ datum: "2026-09-17", minuter: 1, km_totalt: 48 }],
    deldagar: [{ datum: "2026-09-29", typ: "sjuk", fran_tid: "12:03", till_tid: null, arbetad_min: 444, timmar: 0.6, schema_timmar: 8 }],
  };
  const poster = attTittaPa(spec);
  it("en post per sak, i datumordning", () => {
    expect(poster.map(p => p.rubrik)).toEqual(["17 september", "29 september"]);
    expect(poster[0].hoger).toBe("1 min");
    expect(poster[1].hoger).toBe("jobbade till 12:03, sedan sjuk");
    expect(poster[1].text).toContain("0,6 tim frånvaro");
  });
  it("inga tekniska ord i förarens text", () => {
    const allt = poster.map(p => `${p.rubrik} ${p.hoger} ${p.text}`).join(" ");
    for (const ord of ["§", "×8", "övertidsbasen", "ANTAGANDE", "lönerad", "vältlapp"]) expect(allt).not.toContain(ord);
  });
  it("okänd varning försvinner aldrig tyst", () => {
    expect(okandaVarningar([...spec.varningar, "Helt ny varning"])).toEqual(["Helt ny varning"]);
    expect(attTittaPa({ varningar: ["Helt ny varning"] }).map(p => p.text)).toEqual(["Helt ny varning"]);
  });
});

describe("dagAvvikelser — det normala är tyst", () => {
  const roda = { "2026-06-06": "Sveriges nationaldag" };
  it("vanlig vardag = inget", () => {
    expect(dagAvvikelser({ datum: "2026-09-01", start_tid: "07:00", rast_min: 0, arbetad_min: 480, bekraftad: true }, { rodaDagar: roda })).toEqual([]);
  });
  it("helg, kortpass, tidig start, lång rast, deldag", () => {
    expect(dagAvvikelser({ datum: "2026-09-05", arbetad_min: 300, bekraftad: true }, { rodaDagar: roda })).toEqual(["helg"]);
    expect(dagAvvikelser({ datum: "2026-09-17", arbetad_min: 1, bekraftad: true }, { rodaDagar: roda })).toEqual(["1 minut"]);
    expect(dagAvvikelser({ datum: "2026-09-02", start_tid: "04:40:00", arbetad_min: 500, bekraftad: true }, { rodaDagar: roda })).toEqual(["började 04:40"]);
    expect(dagAvvikelser({ datum: "2026-09-02", rast_min: 98, arbetad_min: 400, bekraftad: true }, { rodaDagar: roda })).toEqual(["rast 1 tim 38 min"]);
    expect(dagAvvikelser({ datum: "2026-09-29", arbetad_min: 444, bekraftad: true }, { rodaDagar: roda, deldag: { typ: "sjuk", fran_tid: "12:03", till_tid: null } })).toEqual(["jobbade till 12:03, sedan sjuk"]);
    expect(dagAvvikelser({ datum: "2026-06-06", arbetad_min: 480, bekraftad: true }, { rodaDagar: roda })).toEqual(["sveriges nationaldag"]);
  });
});
