import { describe, it, expect } from "vitest";
import {
  veckoText, antalVeckor, arLangPeriod, veckoRader, veckoValFonster, veckoKortText, veckorText, krockarIVecka, krockarIUrval,
  krockText, krockMening, periodNamn, slutFranMandag, kontrolleraPeriod, delaUpp, loneperioderBerorda, arExporterad, mandagFranSlut,
  grupperaPerioder, planeraAndring, forareText, overenskommenText, kortDatumMedAr,
  MAX_VECKOR_UTAN_ÖVERENSKOMMELSE, MAX_NAMN_TECKEN,
} from "./utjamningsperiod";

describe("veckoText: v17–27 ur startdatum och slutdatum (ISO-veckor)", () => {
  it.each([
    [{ startdatum: "2026-04-20", slutdatum: "2026-07-05" }, "v17–27"],
    [{ startdatum: "2026-04-20", slutdatum: "2026-04-26" }, "v17"],
    [{ startdatum: "2026-12-14", slutdatum: "2027-01-24" }, "v51 2026 – v3 2027"],
    [{ startdatum: "2025-12-29", slutdatum: "2026-01-04" }, "v1"],
  ])("%j → %s", (p, t) => { expect(veckoText(p)).toBe(t); });
});

describe("antalVeckor och gränsen 16 veckor (§5 mom 2)", () => {
  it("v17–27 = 11 veckor; en vecka = 1; 16 veckor är inte längre än 16", () => {
    expect(antalVeckor({ startdatum: "2026-04-20", slutdatum: "2026-07-05" })).toBe(11);
    expect(antalVeckor({ startdatum: "2026-04-20", slutdatum: "2026-04-26" })).toBe(1);
    expect(antalVeckor({ startdatum: "2026-01-05", slutdatum: "2026-04-26" })).toBe(16);
    expect(MAX_VECKOR_UTAN_ÖVERENSKOMMELSE).toBe(16);
    expect(arLangPeriod({ startdatum: "2026-01-05", slutdatum: "2026-04-26" })).toBe(false);
    expect(arLangPeriod({ startdatum: "2026-01-05", slutdatum: "2026-05-03" })).toBe(true);   // 17 veckor
  });
});

describe("veckoRader: en rad per hel vecka mellan två datum, måndag som värde, grupperad på månad", () => {
  const rader = veckoRader("2026-10-12", "2027-01-10");
  it("börjar måndagen i veckan som innehåller första datumet och slutar i veckan som innehåller sista, utan hål", () => {
    expect(rader[0].mandag).toBe("2026-10-12");
    expect(veckoRader("2026-10-14", "2026-10-14").map(r => r.mandag)).toEqual(["2026-10-12"]);
    expect(rader[rader.length - 1].mandag).toBe("2027-01-04");
    for (let i = 0; i < rader.length; i++) {
      const [y, m, d] = rader[i].mandag.split("-").map(Number);
      expect(new Date(y, m - 1, d).getDay()).toBe(1);
      if (i > 0) {
        const [y0, m0, d0] = rader[i - 1].mandag.split("-").map(Number);
        expect(Math.round((new Date(y, m - 1, d).getTime() - new Date(y0, m0 - 1, d0).getTime()) / 86400000)).toBe(7);   // avrundat: sommartid ger en 23-timmarsvecka
      }
    }
  });
  it("etiketten är 'v44 · 26 okt–1 nov' över månadsskifte och 'v43 · 19–25 okt' inom en månad (årtalet står på månadsrubriken)", () => {
    expect(rader.find(r => r.mandag === "2026-10-26")!.etikett).toBe("v44 · 26 okt–1 nov");
    expect(rader.find(r => r.mandag === "2026-10-19")!.etikett).toBe("v43 · 19–25 okt");
  });
  it("veckan hör till måndagens månad: 28 dec 2026–3 jan 2027 ligger under december 2026", () => {
    const r = rader.find(r => r.mandag === "2026-12-28")!;
    expect(r.manad).toBe("2026-12");
    expect(r.manadText).toBe("december 2026");
    expect(r.vecka).toBe(53);
  });
});

describe("veckoValFonster: ±6 månader (26 veckor) runt det som är valt i en kort lista", () => {
  it("Från: 26 veckor åt vardera hållet runt den valda veckan", () => {
    expect(veckoValFonster("fran", "2026-10-12", "")).toEqual({ fran: "2026-04-13", till: "2027-04-12" });
  });
  it("Till: aldrig före Från, annars 26 veckor åt vardera hållet", () => {
    expect(veckoValFonster("till", "2026-10-12", "2026-10-05")).toEqual({ fran: "2026-10-05", till: "2027-04-12" });
    expect(veckoValFonster("till", "2026-12-14", "2026-04-20")).toEqual({ fran: "2026-06-15", till: "2027-06-14" });
  });
});

describe("veckoKortText: 'v17 · 20 apr' för Från (måndagen) och 'v27 · 5 jul' för Till (söndagen)", () => {
  it("Från visar måndagens datum, Till söndagens; årtal bara när det inte är innevarande år", () => {
    expect(veckoKortText("2026-04-20", "fran", 2026)).toBe("v17 · 20 apr");
    expect(veckoKortText("2026-06-29", "till", 2026)).toBe("v27 · 5 jul");
    expect(veckoKortText("2027-01-04", "fran", 2026)).toBe("v1 · 4 jan 2027");
    expect(veckoKortText("2026-12-28", "till", 2026)).toBe("v53 · 3 jan 2027");
  });
});

describe("veckorText: '11 veckor'", () => {
  it("antal veckor i singular/plural", () => {
    expect(veckorText("2026-04-20", "2026-06-29")).toBe("11 veckor");
    expect(veckorText("2026-04-20", "2026-04-20")).toBe("1 vecka");
    expect(veckorText("2026-10-26", "2026-12-21")).toBe("9 veckor");
  });
});

describe("kortDatumMedAr och overenskommenText", () => {
  it("'12 okt 2026'; tom överenskommelse = 'Ej dokumenterad överenskommelse'", () => {
    expect(kortDatumMedAr("2026-10-12")).toBe("12 okt 2026");
    expect(overenskommenText("2026-10-12")).toBe("Överenskommen 12 okt 2026");
    expect(overenskommenText(null)).toBe("Ej dokumenterad överenskommelse");
    expect(overenskommenText("")).toBe("Ej dokumenterad överenskommelse");
    expect(overenskommenText(undefined)).toBe("Ej dokumenterad överenskommelse");
  });
});

describe("grupperaPerioder: rader med samma namn, start och slut är EN period", () => {
  const r = (id: string, namn: string | null, med: string | null, s = "2026-04-20", e = "2026-07-05", extra: object = {}) => ({ id, namn, startdatum: s, slutdatum: e, medarbetare_id: med, anteckning: "", ...extra });
  it("en grupp per namn+start+slut (skiftläge spelar ingen roll); förare och rad-id samlade, Alla för sig", () => {
    const g = grupperaPerioder([r("1", "Gävle", "j"), r("2", "gävle", "d"), r("3", "Gävle", null), r("4", "Vinter", null, "2026-11-02", "2026-11-15")]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ namn: "Gävle", startdatum: "2026-04-20", slutdatum: "2026-07-05", alla: true, forare: ["j", "d"], ids: ["1", "2", "3"] });
    expect(g[1]).toMatchObject({ namn: "Vinter", alla: true, forare: [], ids: ["4"] });
  });
  it("samma namn men andra veckor är en annan period", () => {
    expect(grupperaPerioder([r("1", "Gävle", "j"), r("2", "Gävle", "d", "2026-04-20", "2026-07-12")])).toHaveLength(2);
  });
  it("anteckning och överenskommelse bärs av gruppen: första icke-tomma värdet", () => {
    const [g] = grupperaPerioder([r("1", "Gävle", "j"), r("2", "Gävle", "d", "2026-04-20", "2026-07-05", { anteckning: "Hedemora", overenskommen_datum: "2026-04-10" }), r("3", "Gävle", "s", "2026-04-20", "2026-07-05", { overenskommen_datum: "2026-04-11" })]);
    expect(g.anteckning).toBe("Hedemora");
    expect(g.overenskommen).toBe("2026-04-10");
  });
  it("en rad utan namn grupperas på det periodNamn ger (anteckningens första tecken)", () => {
    const g = grupperaPerioder([r("1", null, "j", "2026-04-20", "2026-07-05", { anteckning: "Hela laget" }), r("2", "Hela laget", "d")]);
    expect(g).toHaveLength(1);
  });
  it("gruppens namn är det första radens namn trimmat", () => {
    expect(grupperaPerioder([r("1", " Gävle ", "j")])[0].namn).toBe("Gävle");
  });
});

describe("planeraAndring: bocka ur = radera raden, bocka i = ny rad, resten uppdateras", () => {
  const grupp = (rader: { id: string; medarbetare_id: string | null }[]) => ({ rader });
  it("oförändrade förare: alla rader uppdateras, inget läggs till eller raderas", () => {
    expect(planeraAndring(grupp([{ id: "1", medarbetare_id: "j" }, { id: "2", medarbetare_id: "d" }]), { alla: false, ids: ["j", "d"] }))
      .toEqual({ uppdatera: ["1", "2"], taBort: [], ny: [] });
  });
  it("urbockad förare raderas; ibockad förare blir en ny rad (förarnas ordning bevaras)", () => {
    expect(planeraAndring(grupp([{ id: "1", medarbetare_id: "j" }, { id: "2", medarbetare_id: "d" }]), { alla: false, ids: ["j", "s", "m"] }))
      .toEqual({ uppdatera: ["1"], taBort: ["2"], ny: ["s", "m"] });
  });
  it("Alla är en egen rad: urbockad Alla raderar NULL-raden, ibockad Alla lägger till en", () => {
    expect(planeraAndring(grupp([{ id: "9", medarbetare_id: null }, { id: "1", medarbetare_id: "j" }]), { alla: false, ids: ["j"] }))
      .toEqual({ uppdatera: ["1"], taBort: ["9"], ny: [] });
    expect(planeraAndring(grupp([{ id: "1", medarbetare_id: "j" }]), { alla: true, ids: ["j"] }))
      .toEqual({ uppdatera: ["1"], taBort: [], ny: [null] });
  });
  it("ingen vald alls raderar allt (UI:t tillåter det inte, men planen ska inte gissa)", () => {
    expect(planeraAndring(grupp([{ id: "1", medarbetare_id: "j" }]), { alla: false, ids: [] })).toEqual({ uppdatera: [], taBort: ["1"], ny: [] });
  });
});

describe("forareText: det som står på Förare-raden", () => {
  const p = [{ id: "j", namn: "Joacim Ringberg" }, { id: "d", namn: "Daniel Johansson" }, { id: "s", namn: "Stefan Karlsson" }];
  it("ingen: 'Välj'; Alla: 'Alla'; en: namnet; flera: 'N valda' (Alla räknas som en)", () => {
    expect(forareText({ alla: false, ids: [] }, p)).toBe("Välj");
    expect(forareText({ alla: true, ids: [] }, p)).toBe("Alla");
    expect(forareText({ alla: false, ids: ["d"] }, p)).toBe("Daniel Johansson");
    expect(forareText({ alla: false, ids: ["j", "d", "s"] }, p)).toBe("3 valda");
    expect(forareText({ alla: true, ids: ["j"] }, p)).toBe("2 valda");
  });
});

describe("periodNamn: namnet, och för en rad som saknar det de första orden i anteckningen", () => {
  it("namn vinner; annars anteckningens första ord upp till 20 tecken; annars 'Period'", () => {
    expect(periodNamn({ namn: " Gävle ", anteckning: "Gävle/Hedemora–Sandviken 22 apr" })).toBe("Gävle");
    expect(periodNamn({ namn: null, anteckning: "Gävle/Hedemora–Sandviken 22 apr–29 jun 2026" })).toBe("Gävle/Hedemora–Sandv");
    expect(periodNamn({ namn: "", anteckning: "Hela laget" })).toBe("Hela laget");
    expect(periodNamn({ anteckning: "  " })).toBe("Period");
    expect(MAX_NAMN_TECKEN).toBe(20);
  });
});

describe("krockar: veckor som redan ligger i en period för någon av de valda förarna (varning, aldrig spärr)", () => {
  const p = (id: string, namn: string, s: string, e: string, med: string | null, anteckning = "lång anteckning") => ({ id, namn, startdatum: s, slutdatum: e, medarbetare_id: med, anteckning });
  const GAVLE = p("gavle", "Gävle", "2026-04-20", "2026-07-05", null);
  const ANNA = p("anna", "Anna", "2026-10-05", "2026-10-18", "m1");
  const alla = [GAVLE, ANNA];
  it("en period för alla krockar med varje urval; en personlig period bara med den personen eller med Alla", () => {
    expect(krockarIVecka("2026-04-27", { alla: false, ids: ["m2"] }, alla).map(k => k.id)).toEqual(["gavle"]);
    expect(krockarIVecka("2026-10-05", { alla: false, ids: ["m2"] }, alla)).toEqual([]);
    expect(krockarIVecka("2026-10-05", { alla: false, ids: ["m1", "m2"] }, alla).map(k => k.id)).toEqual(["anna"]);
    expect(krockarIVecka("2026-10-05", { alla: true, ids: [] }, alla).map(k => k.id)).toEqual(["anna"]);
  });
  it("ingen förare vald: ingenting krockar (inte ens en period för alla)", () => {
    expect(krockarIVecka("2026-04-27", { alla: false, ids: [] }, alla)).toEqual([]);
    expect(krockarIUrval({ forsta: "2026-04-20", sista: "2026-04-27" }, { alla: false, ids: [] }, alla)).toEqual([]);
  });
  it("veckan måste ligga i perioden: måndagen efter söndagen krockar inte", () => {
    expect(krockarIVecka("2026-07-06", { alla: true, ids: [] }, alla)).toEqual([]);
    expect(krockarIVecka("2026-06-29", { alla: true, ids: [] }, alla).map(k => k.id)).toEqual(["gavle"]);
  });
  it("den period man ändrar krockar inte med sig själv", () => {
    expect(krockarIVecka("2026-10-05", { alla: false, ids: ["m1"] }, alla, "anna")).toEqual([]);
  });
  it("en hel grupp kan undantas (de rader man ändrar): flera id:n i stället för ett", () => {
    expect(krockarIVecka("2026-04-27", { alla: true, ids: [] }, alla, ["gavle", "anna"])).toEqual([]);
    expect(krockarIVecka("2026-10-05", { alla: true, ids: [] }, alla, ["gavle"]).map(k => k.id)).toEqual(["anna"]);
  });
  it("samma namn och samma veckor är inte en krock: det är samma period för andra förare", () => {
    const ny = { namn: "gävle", startdatum: "2026-04-20", slutdatum: "2026-07-05" };           // skiftläge spelar ingen roll
    expect(krockarIVecka("2026-04-27", { alla: false, ids: ["m2"] }, alla, undefined, ny)).toEqual([]);
    expect(krockarIUrval({ forsta: "2026-04-20", sista: "2026-06-29" }, { alla: false, ids: ["m2"] }, alla, undefined, ny)).toEqual([]);
    // annat namn eller andra veckor = krock
    expect(krockarIVecka("2026-04-27", { alla: false, ids: ["m2"] }, alla, undefined, { ...ny, namn: "Annat" }).map(k => k.id)).toEqual(["gavle"]);
    expect(krockarIVecka("2026-04-27", { alla: false, ids: ["m2"] }, alla, undefined, { ...ny, slutdatum: "2026-06-28" }).map(k => k.id)).toEqual(["gavle"]);
  });
  it("krockText: periodens NAMN (inte anteckningen), och '+N' när flera ligger över varandra", () => {
    expect(krockText([GAVLE])).toBe("Gävle");
    expect(krockText([GAVLE, ANNA])).toBe("Gävle +1");
    expect(krockText([])).toBe("");
    // rader i samma period (samma namn och veckor, olika förare) är EN period, inte "+1"
    expect(krockText([GAVLE, { ...GAVLE, id: "g2", medarbetare_id: "m1" }])).toBe("Gävle");
    expect(krockText([GAVLE, { ...GAVLE, id: "g2", medarbetare_id: "m1" }, ANNA])).toBe("Gävle +1");
    expect(krockText([{ namn: null, anteckning: "Hela laget" }])).toBe("Hela laget");
  });
  it("krockarIUrval: varje period en gång, tidigast först", () => {
    const k = krockarIUrval({ forsta: "2026-04-13", sista: "2026-10-12" }, { alla: true, ids: [] }, alla);
    expect(k.map(x => x.id)).toEqual(["gavle", "anna"]);
    expect(krockarIUrval({ forsta: "2026-08-03", sista: "2026-08-10" }, { alla: true, ids: [] }, alla)).toEqual([]);
  });
});

describe("krockMening: EN rad — 'Krockar med Gävle v17–27 (Joacim, Daniel, Stefan, Martin)'", () => {
  const p = (id: string, namn: string, med: string | null, s = "2026-04-20", e = "2026-07-05") => ({ id, namn, startdatum: s, slutdatum: e, medarbetare_id: med, anteckning: "en mycket lång anteckning som aldrig ska upprepas" });
  const fornamn = (id: string | null) => ({ j: "Joacim", d: "Daniel", s: "Stefan", m: "Martin" } as Record<string, string>)[id || ""] || "?";
  it("samma period för flera förare slås ihop till en post med förarnas förnamn", () => {
    expect(krockMening([p("1", "Gävle", "j"), p("2", "Gävle", "d"), p("3", "Gävle", "s"), p("4", "Gävle", "m")], fornamn))
      .toBe("Krockar med Gävle v17–27 (Joacim, Daniel, Stefan, Martin)");
  });
  it("en period för alla: '(alla)'; anteckningen står aldrig med", () => {
    const t = krockMening([p("1", "Gävle", null)], fornamn);
    expect(t).toBe("Krockar med Gävle v17–27 (alla)");
    expect(t).not.toContain("anteckning");
  });
  it("olika perioder skiljs med komma, fortfarande en rad (inget radbrytande tecken)", () => {
    const t = krockMening([p("1", "Gävle", "j"), p("2", "Vinter", null, "2026-11-02", "2026-11-15")], fornamn);
    expect(t).toBe("Krockar med Gävle v17–27 (Joacim), Vinter v45–46 (alla)");
    expect(t).not.toContain("\n");
  });
  it("ingen krock: tom text", () => { expect(krockMening([], fornamn)).toBe(""); });
});

describe("slutFranMandag: söndagen i veckan", () => {
  it("20 april → 26 april; över månadsskifte och årsskifte", () => {
    expect(slutFranMandag("2026-04-20")).toBe("2026-04-26");
    expect(slutFranMandag("2026-03-30")).toBe("2026-04-05");
    expect(slutFranMandag("2026-12-28")).toBe("2027-01-03");
  });
});

describe("mandagFranSlut: omvänt mot slutFranMandag", () => {
  it("söndag → måndag i samma vecka, också över månads- och årsskifte", () => {
    expect(mandagFranSlut("2026-10-18")).toBe("2026-10-12");
    expect(mandagFranSlut("2027-01-03")).toBe("2026-12-28");
    expect(slutFranMandag(mandagFranSlut("2026-07-05"))).toBe("2026-07-05");
  });
});

describe("kontrolleraPeriod: det som spärrar Spara", () => {
  const ok = { forsta: "2026-04-20", sista: "2026-07-01", namn: "Gävle" };
  it("giltig period ger inget fel — anteckningen är valfri och ingår inte", () => { expect(kontrolleraPeriod(ok)).toBeNull(); });
  it("sista veckan före första: fel", () => { expect(kontrolleraPeriod({ ...ok, sista: "2026-04-13" })).toMatch(/före/); });
  it("namn saknas eller är bara blanksteg: fel; 20 tecken går, 21 gör det inte", () => {
    for (const n of ["", "   "]) expect(kontrolleraPeriod({ ...ok, namn: n }), n).toMatch(/namn/i);
    expect(kontrolleraPeriod({ ...ok, namn: "a".repeat(20) })).toBeNull();
    expect(kontrolleraPeriod({ ...ok, namn: "a".repeat(21) })).toMatch(/20 tecken/);
    expect(kontrolleraPeriod({ ...ok, namn: "  Gävle  " })).toBeNull();
  });
  it("ingen förare vald: fel (Alla räknas som en vald)", () => {
    expect(kontrolleraPeriod({ ...ok, antalForare: 0 })).toMatch(/förare/i);
    expect(kontrolleraPeriod({ ...ok, antalForare: 1 })).toBeNull();
  });
  it("vecka ej vald: fel", () => { expect(kontrolleraPeriod({ ...ok, forsta: "" })).toMatch(/vecka/i); });
  it("Till före Från: fel (formuläret flyttar Till, men funktionen ska inte släppa igenom det)", () => { expect(kontrolleraPeriod({ ...ok, sista: "2026-04-13" })).toMatch(/före/); });
});

describe("delaUpp: kommande och pågående överst, avslutade under", () => {
  const p = (id: string, s: string, e: string) => ({ id, startdatum: s, slutdatum: e });
  it("pågående/kommande efter startdatum stigande; avslutade senast slut först", () => {
    const { kommande, avslutade } = delaUpp([
      p("gavle", "2026-04-20", "2026-07-05"), p("senare", "2026-11-02", "2026-11-15"), p("nu", "2026-10-05", "2026-10-18"), p("aldre", "2026-01-05", "2026-01-18"),
    ], "2026-10-09");
    expect(kommande.map(x => x.id)).toEqual(["nu", "senare"]);
    expect(avslutade.map(x => x.id)).toEqual(["gavle", "aldre"]);
  });
  it("en period som slutar IDAG är fortfarande pågående", () => {
    expect(delaUpp([p("a", "2026-10-05", "2026-10-11")], "2026-10-11").kommande).toHaveLength(1);
    expect(delaUpp([p("a", "2026-10-05", "2026-10-11")], "2026-10-12").avslutade).toHaveLength(1);
  });
});

describe("exporterade löneperioder: perioden får inte tas bort om lönen den berör är skickad", () => {
  it("löneperiod = arbetsmånad + 1: v17–27 (20/4–5/7) berör arbetsmånaderna apr–jul → lön maj–aug", () => {
    expect(loneperioderBerorda({ startdatum: "2026-04-20", slutdatum: "2026-07-05" })).toEqual(["2026-05", "2026-06", "2026-07", "2026-08"]);
  });
  it("en vecka i slutet av december berör arbetsmånad december → lön januari nästa år", () => {
    expect(loneperioderBerorda({ startdatum: "2026-12-28", slutdatum: "2027-01-03" })).toEqual(["2027-01", "2027-02"]);
  });
  const gavle = { startdatum: "2026-04-20", slutdatum: "2026-07-05", medarbetare_id: null };
  it("alla-period: skickad lön för någon förare i en berörd löneperiod spärrar", () => {
    expect(arExporterad(gavle, [{ period: "2026-06", medarbetare_id: "s", status: "skickat" }])).toBe(true);
  });
  it("utkast, fel eller en period utanför berörda månader spärrar inte", () => {
    expect(arExporterad(gavle, [{ period: "2026-06", medarbetare_id: "s", status: "utkast" }, { period: "2026-09", medarbetare_id: "s", status: "skickat" }, { period: "2026-04", medarbetare_id: "s", status: "skickat" }])).toBe(false);
  });
  it("personlig period spärras bara av den personens skickade lön", () => {
    const egen = { ...gavle, medarbetare_id: "m" };
    expect(arExporterad(egen, [{ period: "2026-06", medarbetare_id: "s", status: "skickat" }])).toBe(false);
    expect(arExporterad(egen, [{ period: "2026-06", medarbetare_id: "m", status: "skickat" }])).toBe(true);
  });
});
