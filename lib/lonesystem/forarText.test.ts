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
  it("pass över 16 tim, negativ tid, tidsavvikelse och vilobrott — samma regler som granskningen", () => {
    expect(dagAvvikelser({ datum: "2026-09-02", start_tid: "06:00", slut_tid: "23:30", arbetad_min: 1020, bekraftad: true }, { rodaDagar: roda })).toEqual(["pass 17 tim"]);
    expect(dagAvvikelser({ datum: "2026-09-02", start_tid: "08:00", slut_tid: "07:00", arbetad_min: -60, bekraftad: true }, { rodaDagar: roda })).toEqual(["negativ tid"]);
    expect(dagAvvikelser({ datum: "2026-09-02", arbetad_min: 480, bekraftad: true }, { rodaDagar: roda, synkMin: 37 })).toEqual(["37 min mot maskinen"]);
    expect(dagAvvikelser({ datum: "2026-09-02", arbetad_min: 480, bekraftad: true }, { rodaDagar: roda, vilobrott: [{ typ: "dygnsvila", vila_h: 8.5, krav_h: 11 }] })).toEqual(["dygnsvila 8,5 av 11 tim"]);
  });
  it("kontrollvyn: utan maskin och utan objekt — bara när kontroll är på", () => {
    const maskindagUtan = { datum: "2026-09-10", start_tid: "09:00", slut_tid: "17:00", arbetad_min: 480, bekraftad: true, maskin_id: null, objekt: [] as string[] };
    expect(dagAvvikelser(maskindagUtan, { rodaDagar: roda })).toEqual([]);
    expect(dagAvvikelser(maskindagUtan, { rodaDagar: roda, kontroll: true })).toEqual(["utan maskin", "utan objekt"]);
    // Perioddag: ingen maskin är normalt, men objekt ska finnas.
    expect(dagAvvikelser({ datum: "2026-09-10", arbetad_min: 360, bekraftad: true, maskin_id: null, objekt: [], perioddag: true }, { rodaDagar: roda, kontroll: true })).toEqual(["utan objekt"]);
    expect(dagAvvikelser({ datum: "2026-09-10", start_tid: "07:00", slut_tid: "16:00", arbetad_min: 480, bekraftad: true, maskin_id: "JD810E", objekt: ["Betet"] }, { rodaDagar: roda, kontroll: true })).toEqual([]);
  });
});

describe("Lönearter utan kod — förarens ord, aldrig adminens text", () => {
  const admin = [
    "Löneart saknas för Vältlappar (3 veckor): koppla en kod under Lön → Lönearter. Raden skickas inte.",
    "Premielön skördare (24 tim) skickas inte: ingen kod är kopplad (frivillig). Koppla en kod under Lön → Lönearter om den ska med.",
  ];
  const rad = (loneart: string, status: string, mangd = "3.00") => ({ loneart, status, mangd, kod: status === "skickas" ? "136" : null, beskrivning: "" });

  it("adminens varning om saknad kod visas aldrig ordagrant för föraren", () => {
    expect(okandaVarningar(admin)).toEqual([]);
    expect(attTittaPa({ varningar: admin }).map(p => p.text)).toEqual([]);
  });

  it("en löneart utan kod ger en post i förarens ord: den går inte till lönen än, och säg till Martin", () => {
    const poster = attTittaPa({ varningar: admin, lonerader: [rad("valtlappar", "saknar_kod")] });
    expect(poster).toHaveLength(1);
    expect(poster[0].rubrik).toBe("Vältlappar");
    expect(poster[0].text).toMatch(/Går inte till lönen än/);
    expect(poster[0].text).toMatch(/Säg till Martin/);
    expect(`${poster[0].rubrik} ${poster[0].hoger} ${poster[0].text}`).not.toMatch(/Lönearter|kod|mappning/i);
  });

  it("frivillig premie utan kod: föraren behöver inte veta, ingen post", () => {
    expect(attTittaPa({ varningar: admin, lonerader: [rad("premielon_skordare", "valfri_utan_kod", "24.00")] })).toEqual([]);
  });

  it("löneart som skickas ger ingen post", () => {
    expect(attTittaPa({ varningar: [], lonerader: [rad("valtlappar", "skickas")] })).toEqual([]);
  });

  const dagH = (datum: string, namn: string, o: { arbetad?: boolean; ger?: boolean; skal?: string } = {}) => ({ datum, namn, arbetad: o.arbetad ?? false, ger: o.ger ?? true, skal: o.skal ?? "betalas" });
  const helglon = { dagar: [dagH("2026-12-24", "Julafton")], timmar: 8 };
  it("helglön MED kod går till lönen — raden säger inte längre att lönearten är obestämd", () => {
    const p = attTittaPa({ varningar: [], helglon, lonerader: [rad("helglon_skordare", "skickas", "8.00")] });
    expect(p).toHaveLength(1);
    expect(p[0].text).toBe("Helglön, 8 tim. Går till lönen.");
    expect(p[0].text).not.toMatch(/inte bestämd/);
  });
  it("helglön med kod på skotarlönearten går också till lönen", () => {
    expect(attTittaPa({ varningar: [], helglon, lonerader: [rad("helglon_skotare", "skickas", "8.00")] })[0].text).toBe("Helglön, 8 tim. Går till lönen.");
  });
  it("helglön UTAN kod: som förut — går inte till lönen än, och posten kommer bara en gång (inte också som saknad löneart)", () => {
    const p = attTittaPa({ varningar: [], helglon, lonerader: [rad("helglon_skordare", "saknar_kod", "8.00")] });
    expect(p).toHaveLength(1);
    expect(p[0].text).toBe("Helglön, 8 tim. Går inte till lönen än — lönearten är inte bestämd.");
  });
  it("äldre svar utan lonerader: helglön som förut", () => {
    const p = attTittaPa({ varningar: [], helglon });
    expect(p[0].text).toMatch(/inte bestämd/);
  });

  describe("Min månad: varför en röd dag gav eller inte gav helglön", () => {
    const med = (d: ReturnType<typeof dagH>) => attTittaPa({ varningar: [], helglon: { dagar: [d], timmar: d.ger ? 8 : 0 }, lonerader: [rad("helglon_skordare", "skickas", "8.00")] });
    it("arbetad röd dag: du får helglön OCH lön för timmarna", () => {
      const p = med(dagH("2026-01-06", "Trettondedag jul", { arbetad: true, skal: "betalas_arbetad" }));
      expect(p).toHaveLength(1);
      expect(p[0]).toMatchObject({ rubrik: "6 januari", hoger: "Trettondedag jul" });
      expect(p[0].text).toBe("Du arbetade den dagen. Helglön, 8 tim, kommer ovanpå lönen för timmarna du arbetade. Går till lönen.");
    });
    it.each([
      ["sjuk", /Du var sjuk den dagen/],
      ["vab", /VAB/],
      ["foraldraledig", /Du var föräldraledig den dagen/],
      ["tjanstledig", /Du var tjänstledig den dagen/],
      ["tjanstledig_omger", /tjänstledig dagen före eller dagen efter/],
      ["kvalifikationstid", /först efter tre månaders anställning/],
    ])("%s: dagen står med sin orsak, och ingen 'Går till lönen'", (skal, re) => {
      const p = med(dagH("2025-12-24", "Julafton", { ger: false, skal }));
      expect(p).toHaveLength(1);
      expect(p[0].text).toMatch(re);
      expect(p[0].text).not.toMatch(/Går till lönen/);
      expect(p[0].text).toMatch(/ingen helglön|Ingen helglön|ger ingen helglön|betalas ingen helglön|först efter/);
    });
    it("förarens ord innehåller inga paragrafer eller tekniska ord", () => {
      for (const skal of ["sjuk", "vab", "foraldraledig", "tjanstledig", "tjanstledig_omger", "kvalifikationstid"]) {
        expect(med(dagH("2025-12-24", "Julafton", { ger: false, skal }))[0].text).not.toMatch(/§|mom |skal|intern|mappning/i);
      }
    });
    it("varje röd vardag får EN post, sorterade på datum (24, 25, 26, 31 dec)", () => {
      const dagar = [dagH("2025-12-24", "Julafton"), dagH("2025-12-25", "Juldagen", { arbetad: true, skal: "betalas_arbetad" }), dagH("2025-12-26", "Annandag jul", { ger: false, skal: "sjuk" }), dagH("2025-12-31", "Nyårsafton")];
      const p = attTittaPa({ varningar: [], helglon: { dagar, timmar: 24 }, lonerader: [rad("helglon_skotare", "skickas", "24.00")] });
      expect(p.map(x => x.datum)).toEqual(["2025-12-24", "2025-12-25", "2025-12-26", "2025-12-31"]);
    });
    it("ingen maskintyp: egen post 'Säg till Martin', och motorns varning visas inte ordagrant", () => {
      const v = "Ingen helglön skickas: 24 tim kan inte räknas — ingen maskintid i månaden och ingen maskin på medarbetarraden, så maskintypen (skördare/skotare) går inte att avgöra. Sätt förarens maskin i admin.";
      const p = attTittaPa({ varningar: [v], lonerader: [] });
      expect(p).toHaveLength(1);
      expect(p[0]).toMatchObject({ rubrik: "Helglön", hoger: "saknas" });
      expect(p[0].text).toMatch(/Säg till Martin/);
      expect(okandaVarningar([v])).toEqual([]);
    });
    it("'Anställningsdatum saknas' är adminens sak: ingen post och ingen ordagrann varning till föraren", () => {
      const v = "Anställningsdatum saknas: kvalifikationstiden för helglön (tre månader, §10 mom 3) är inte kontrollerad. Helglönen betalas. Fyll i anställningsdatum under Medarbetare.";
      expect(attTittaPa({ varningar: [v], lonerader: [] })).toEqual([]);
      expect(okandaVarningar([v])).toEqual([]);
    });
  });
});

describe("hemskickad — betald tid, aldrig frånvaro (Martin 2026-10-17)", () => {
  const dag = (arbetad_min: number, extra_min = 0) => ({ datum: "2026-09-07", start_tid: "06:00", rast_min: 0, arbetad_min, extra_min, bekraftad: true });
  it("dagen säger vad som betalas: 6 tim arbete → 'hemskickad 2:00 – betalas'", () => {
    expect(dagAvvikelser(dag(360), { rodaDagar: {}, deldag: { typ: "hemskickad", fran_tid: "14:00:00", till_tid: null } })).toEqual(["hemskickad 2:00 – betalas"]);
  });
  it("extra tid räknas som arbetad tid den dagen", () => {
    expect(dagAvvikelser(dag(300, 60), { rodaDagar: {}, deldag: { typ: "hemskickad", fran_tid: "14:00:00", till_tid: null } })).toEqual(["hemskickad 2:00 – betalas"]);
  });
  it("8 tim eller mer arbete: inget att fylla upp, så ingen avvikelse (ingen 'sedan hemskickad')", () => {
    expect(dagAvvikelser(dag(480), { rodaDagar: {}, deldag: { typ: "hemskickad", fran_tid: "16:00:00", till_tid: null } })).toEqual([]);
  });
  it("en riktig deldag (sjuk) säger fortfarande 'jobbade till …, sedan sjuk'", () => {
    expect(dagAvvikelser(dag(300), { rodaDagar: {}, deldag: { typ: "sjuk", fran_tid: "11:30:00", till_tid: null } })).toEqual(["jobbade till 11:30, sedan sjuk"]);
  });
  it("Min månad: en post per hemskickad dag med vad som betalas", () => {
    const p = attTittaPa({ hemskickad: [{ datum: "2026-09-07", minuter: 120 }, { datum: "2026-09-09", minuter: 113 }] });
    expect(p.map(x => [x.nyckel, x.hoger])).toEqual([["hs2026-09-07", "hemskickad 2:00"], ["hs2026-09-09", "hemskickad 1:53"]]);
    expect(p[0].text).toBe("Du blev hemskickad. Dagen fylls upp till 8 tim och 2:00 betalas som timlön. Stämmer det inte — säg till Martin.");
    expect(p[0].text).not.toMatch(/frånvaro|löneart/);
  });
});
