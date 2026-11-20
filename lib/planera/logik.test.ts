import { describe, it, expect } from "vitest";
import {
  timText, relativDag, datumKort, plusDagar, lokalISO, veckoSpann, veckoDagar, senasteTrakter,
  forslagFranIgar, foreslagenStart, periodMinuter, debFor, vanligStarttid, krockMed, dagRubrik, senasteDagar,
  kvartNarmast, kvartNed, kvartUpp, nuKvartNed, liggerIFramtiden, minTillKlocka, klockaTillMin, type PeriodRad,
} from "./logik";

const p = (o: Partial<PeriodRad> & { datum: string; start_tid: string; slut_tid: string }): PeriodRad => ({
  id: Math.random().toString(36).slice(2), minuter: null, aktivitet_typ: "planering", objekt_id: "T1", debiterbar: true, ...o,
});
// 2026-10-02 är en fredag
const IDAG = "2026-10-02";

describe("datum och tid", () => {
  it("plusDagar passerar månadsgräns utan UTC-fel", () => {
    expect(plusDagar("2026-10-01", -1)).toBe("2026-09-30");
    expect(plusDagar("2026-12-31", 1)).toBe("2027-01-01");
    expect(lokalISO(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
  });
  it("relativDag och datumKort", () => {
    expect(relativDag(IDAG, IDAG)).toBe("idag");
    expect(relativDag("2026-10-01", IDAG)).toBe("i går");
    expect(relativDag("2026-09-30", IDAG)).toBe("i förrgår");
    expect(relativDag("2026-09-29", IDAG)).toBe("tis 29 sep");
    expect(datumKort("2026-10-02")).toBe("fre 2 okt");
  });
  it("timText i människoord", () => {
    expect(timText(180)).toBe("3 tim");
    expect(timText(90)).toBe("1 tim 30 min");
    expect(timText(45)).toBe("45 min");
    expect(timText(0)).toBe("0 min");
  });
  it("periodMinuter", () => {
    expect(periodMinuter("07:00", "10:00")).toBe(180);
    expect(periodMinuter("", "10:00")).toBe(0);
  });
});

describe("veckan", () => {
  it("måndag–söndag runt en fredag", () => {
    expect(veckoSpann(IDAG)).toEqual({ start: "2026-09-28", slut: "2026-10-04" });
    expect(veckoSpann("2026-10-04")).toEqual({ start: "2026-09-28", slut: "2026-10-04" }); // söndag
    expect(veckoSpann("2026-09-28")).toEqual({ start: "2026-09-28", slut: "2026-10-04" }); // måndag
  });
  it("grupperar per dag, senaste överst, summerar, och tar bara Planera-typer med slut", () => {
    const ps = [
      p({ datum: "2026-09-29", start_tid: "07:00:00", slut_tid: "10:00:00", minuter: 180 }),
      p({ datum: "2026-10-01", start_tid: "13:00:00", slut_tid: "14:30:00", minuter: 90, aktivitet_typ: "manuellt" }),
      p({ datum: "2026-10-01", start_tid: "07:00:00", slut_tid: "09:00:00", minuter: 120 }),
      p({ datum: "2026-09-27", start_tid: "07:00:00", slut_tid: "10:00:00", minuter: 180 }), // förra veckan
      p({ datum: "2026-10-02", start_tid: "08:00:00", slut_tid: "09:00:00", minuter: 60, aktivitet_typ: "reparation" }), // annan typ
      p({ datum: "2026-10-02", start_tid: "09:00:00", slut_tid: null as any, minuter: 0 }), // öppen
    ];
    const v = veckoDagar(ps, IDAG);
    expect(v.dagar.map(d => d.datum)).toEqual(["2026-10-01", "2026-09-29"]);
    expect(v.dagar[0].perioder.map(x => x.start_tid)).toEqual(["07:00:00", "13:00:00"]);
    expect(v.dagar[0].summaMin).toBe(210);
    expect(v.summaMin).toBe(390);
  });
});

describe("senaste trakter", () => {
  it("senast använd överst, minuter = den senaste dagen, max 5", () => {
    const ps = [
      p({ datum: "2026-10-01", start_tid: "07:00:00", slut_tid: "10:00:00", minuter: 180, objekt_id: "A" }),
      p({ datum: "2026-10-01", start_tid: "11:00:00", slut_tid: "12:00:00", minuter: 60, objekt_id: "A" }),
      p({ datum: "2026-09-29", start_tid: "07:00:00", slut_tid: "09:00:00", minuter: 120, objekt_id: "B" }),
      p({ datum: "2026-09-25", start_tid: "07:00:00", slut_tid: "08:00:00", minuter: 60, objekt_id: "A" }), // äldre dag på A
      p({ datum: "2026-10-02", start_tid: "07:00:00", slut_tid: "08:00:00", minuter: 60, objekt_id: null }), // utan trakt
    ];
    const s = senasteTrakter(ps);
    expect(s.map(x => x.objektId)).toEqual(["A", "B"]);
    expect(s[0]).toEqual({ objektId: "A", datum: "2026-10-01", minuter: 240 });
    expect(senasteTrakter(ps, 1)).toHaveLength(1);
  });
});

describe("förslag: samma som i går", () => {
  const igar = [
    p({ datum: "2026-10-01", start_tid: "07:00:00", slut_tid: "10:00:00", objekt_id: "T1" }),
    p({ datum: "2026-10-01", start_tid: "10:00:00", slut_tid: "11:00:00", objekt_id: "T2", aktivitet_typ: "manuellt" }), // inte planering
    p({ datum: "2026-10-01", start_tid: "12:00:00", slut_tid: "13:00:00", objekt_id: null }), // utan trakt
  ];
  it("kopierar gårdagens planering med trakt, kalla 'igar', datum igår", () => {
    const f = forslagFranIgar(igar, IDAG)!;
    expect(f.kalla).toBe("igar");
    expect(f.datum).toBe("2026-10-01");
    expect(f.perioder).toEqual([{ start: "07:00", slut: "10:00", typ: "planering", objektId: "T1", deb: true }]);
  });
  it("inget förslag förrän gårdagens sista slut har passerat idag", () => {
    expect(forslagFranIgar(igar, IDAG, new Date(2026, 9, 2, 9, 0))).toBeNull(); // 10:00 har inte varit
    expect(forslagFranIgar(igar, IDAG, new Date(2026, 9, 2, 10, 0))?.perioder).toHaveLength(1);
  });
  it("inget förslag utan planering i går eller när idag redan har planering", () => {
    expect(forslagFranIgar([], IDAG)).toBeNull();
    expect(forslagFranIgar([...igar, p({ datum: IDAG, start_tid: "07:00:00", slut_tid: "08:00:00" })], IDAG)).toBeNull();
  });
});

describe("kvartar", () => {
  it("avrundning och klockformat", () => {
    expect(kvartNarmast(10 * 60 + 17)).toBe(10 * 60 + 15);
    expect(kvartNarmast(10 * 60 + 23)).toBe(10 * 60 + 30);
    expect(kvartNed(16 * 60 + 19)).toBe(16 * 60 + 15);
    expect(kvartUpp(10 * 60 + 17)).toBe(10 * 60 + 30);
    expect(kvartUpp(10 * 60 + 30)).toBe(10 * 60 + 30);
    expect(minTillKlocka(9 * 60 + 5)).toBe("09:05");
    expect(minTillKlocka(24 * 60)).toBe("23:45");
    expect(klockaTillMin("07:45:00")).toBe(465);
  });
  it("nuKvartNed rundar NED (16:19 → 16:15)", () => {
    expect(nuKvartNed(new Date(2026, 9, 2, 16, 19))).toBe(16 * 60 + 15);
    expect(nuKvartNed(new Date(2026, 9, 2, 16, 15))).toBe(16 * 60 + 15);
  });
});

describe("framtiden (testdata: 20:17–23:18 sparades kl 16:19)", () => {
  const nu = new Date(2026, 9, 2, 16, 19);
  it("idag får inte sluta efter nu, framtida dagar är spärrade", () => {
    expect(liggerIFramtiden(IDAG, 23 * 60, nu)).toBe(true);
    expect(liggerIFramtiden(IDAG, 16 * 60 + 15, nu)).toBe(false);
    expect(liggerIFramtiden(IDAG, 16 * 60 + 30, nu)).toBe(true);
    expect(liggerIFramtiden("2026-10-01", 23 * 60, nu)).toBe(false);
    expect(liggerIFramtiden("2026-10-03", 8 * 60, nu)).toBe(true);
  });
});

describe("vanlig starttid (median av dagens första period, 30 dagar)", () => {
  const dag = (d: number, start: string) => p({ datum: plusDagar(IDAG, -d), start_tid: start, slut_tid: "12:00:00" });
  it("inga data → 07:00", () => { expect(vanligStarttid([], IDAG)).toBe("07:00"); });
  it("median, kvartsavrundad; bara dagens första period räknas", () => {
    const ps = [dag(1, "08:00:00"), dag(2, "08:15:00"), dag(3, "08:15:00"), dag(4, "07:45:00"), dag(5, "08:30:00"),
      p({ datum: plusDagar(IDAG, -1), start_tid: "13:00:00", slut_tid: "14:00:00" })]; // dagens ANDRA period räknas inte
    expect(vanligStarttid(ps, IDAG)).toBe("08:15");
  });
  it("jämnt antal → medel avrundat till kvart; äldre än 30 dagar och idag räknas inte", () => {
    const ps = [dag(1, "08:00:00"), dag(2, "08:30:00"), dag(40, "05:00:00"), p({ datum: IDAG, start_tid: "04:00:00", slut_tid: "05:00:00" })];
    expect(vanligStarttid(ps, IDAG)).toBe("08:15");
  });
});

describe("krock", () => {
  const ps = [p({ id: "a", datum: IDAG, start_tid: "07:00:00", slut_tid: "10:00:00" }), p({ id: "b", datum: "2026-10-01", start_tid: "07:00:00", slut_tid: "10:00:00" })];
  it("överlapp samma dag ger perioden; angränsande och andra dagar ger null", () => {
    expect(krockMed(ps, IDAG, 9 * 60, 11 * 60)?.id).toBe("a");
    expect(krockMed(ps, IDAG, 10 * 60, 12 * 60)).toBeNull();
    expect(krockMed(ps, IDAG, 5 * 60, 7 * 60)).toBeNull();
    expect(krockMed(ps, "2026-09-30", 7 * 60, 10 * 60)).toBeNull();
  });
  it("undanta den period som redigeras", () => {
    expect(krockMed(ps, IDAG, 8 * 60, 9 * 60, "a")).toBeNull();
  });
});

describe("dag", () => {
  it("dagRubrik: Idag, fre 2 okt · I går, tors 1 okt · Tis 29 sep", () => {
    expect(dagRubrik(IDAG, IDAG)).toBe("Idag, fre 2 okt");
    expect(dagRubrik("2026-10-01", IDAG)).toBe("I går, tors 1 okt");
    expect(dagRubrik("2026-09-29", IDAG)).toBe("Tis 29 sep");
  });
  it("senasteDagar: idag först, bakåt", () => {
    expect(senasteDagar(IDAG, 3)).toEqual(["2026-10-02", "2026-10-01", "2026-09-30"]);
  });
});

describe("förifylld starttid", () => {
  const nu = new Date(2026, 9, 2, 15, 20);
  it("dagens första period → vanlig starttid; efter en period → där den slutade", () => {
    expect(foreslagenStart([], IDAG, IDAG, nu)).toBe("07:00");
    expect(foreslagenStart([p({ datum: IDAG, start_tid: "07:00:00", slut_tid: "09:30:00" }), p({ datum: IDAG, start_tid: "10:00:00", slut_tid: "11:00:00" })], IDAG, IDAG, nu)).toBe("11:00");
  });
  it("en gammal 10:17 ger 10:30 (UPP — aldrig krock), inte 10:17", () => {
    expect(foreslagenStart([p({ datum: IDAG, start_tid: "07:00:00", slut_tid: "10:17:00" })], IDAG, IDAG, nu)).toBe("10:30");
  });
  it("annan dags perioder styr inte starten på dagen", () => {
    expect(foreslagenStart([p({ datum: "2026-10-01", start_tid: "07:00:00", slut_tid: "15:00:00" })], IDAG, IDAG, nu)).toBe("07:00");
  });
  it("förarens vanliga start används när dagen är tom", () => {
    const ps = [1, 2, 3].map(d => p({ datum: plusDagar(IDAG, -d), start_tid: "06:30:00", slut_tid: "15:00:00" }));
    expect(foreslagenStart(ps, IDAG, IDAG, nu)).toBe("06:30");
  });
  it("tom dag: idag aldrig senare än en kvart före nu", () => {
    expect(foreslagenStart([], IDAG, IDAG, new Date(2026, 9, 2, 6, 10))).toBe("06:00"); // nu 06:10 → närmaste kvart 06:15 − en kvart
  });
  it("efter en period klampas starten INTE till nu (ingen falsk start mitt i föregående)", () => {
    expect(foreslagenStart([p({ datum: IDAG, start_tid: "07:00:00", slut_tid: "10:30:00" })], IDAG, IDAG, new Date(2026, 9, 2, 10, 40))).toBe("10:30");
  });
  it("fakturering följer aktivitetens default", () => {
    expect(debFor("planering")).toBe(true);
    expect(debFor("manuellt")).toBe(true);
    expect(debFor("restid")).toBe(false);
    expect(debFor("mote")).toBe(false);
  });
});

import { oppenPeriod, arGlomd, pagatt, slutVidAvsluta, traktGrupper, vanligSluttid, nettoMin, nuKvartNarmast, nuMinut, startLiggerIFramtiden } from "./logik";
describe("pågående period och rast", () => {
  const oppen = (o: Partial<PeriodRad> = {}) => p({ id: "o", datum: IDAG, start_tid: "07:00:00", slut_tid: null as any, ...(o as any) });
  it("oppenPeriod hittar perioden utan slut; glömd = tidigare dag", () => {
    expect(oppenPeriod([p({ datum: IDAG, start_tid: "06:00:00", slut_tid: "07:00:00" })])).toBeNull();
    expect(oppenPeriod([oppen()])?.id).toBe("o");
    expect(arGlomd(oppen(), IDAG)).toBe(false);
    expect(arGlomd(oppen({ datum: "2026-10-01" }), IDAG)).toBe(true);
  });
  it("pagatt räknar verkliga minuter sedan start; glömd har ingen räknare", () => {
    expect(pagatt(oppen(), new Date(2026, 9, 2, 9, 15))).toBe(135);
    expect(pagatt(oppen({ datum: "2026-10-01" }), new Date(2026, 9, 2, 9, 15))).toBe(0);
  });
  it("slutVidAvsluta = EXAKT minut (Martin: tryckte 13:51 och fick 13:45) och null när det inte blir längre än starten", () => {
    expect(slutVidAvsluta("07:30:00", new Date(2026, 9, 2, 16, 52))).toBe(16 * 60 + 52);
    expect(slutVidAvsluta("07:00:00", new Date(2026, 9, 2, 13, 51))).toBe(13 * 60 + 51);
    expect(slutVidAvsluta("07:00:00", new Date(2026, 9, 2, 7, 8))).toBe(7 * 60 + 8);
    expect(slutVidAvsluta("07:30:00", new Date(2026, 9, 2, 7, 30))).toBeNull();
    expect(slutVidAvsluta("07:30:00", new Date(2026, 9, 2, 7, 20))).toBeNull();
  });
  it("krock: en pågående period löper framåt", () => {
    expect(krockMed([oppen()], IDAG, 13 * 60, 14 * 60)?.id).toBe("o");
    expect(krockMed([oppen()], IDAG, 5 * 60, 7 * 60)).toBeNull();
    expect(krockMed([oppen()], IDAG, 8 * 60, 9 * 60, "o")).toBeNull();
  });
});

describe("trakter i grupper", () => {
  const o = (id: string, namn: string, typ: any, aktiv: boolean) => ({ id, namn, ägare: "X", lat: null, lng: null, vo: id, atgard: null, status: aktiv ? "planerad" : "avslutat", typ, aktiv });
  const lista = [o("1", "Alfa", "gallring", true), o("2", "Beta", "slutavverkning", true), o("3", "Gamma", "grot", true), o("4", "Delta", null, true), o("5", "Gammal", "gallring", false)];
  it("utan sökning: bara aktiva, i ordningen Gallring, Slutavverkning, GROT, Övrigt", () => {
    expect(traktGrupper(lista, "").map(g => [g.label, g.objekt.map(x => x.namn)])).toEqual([
      ["Gallring", ["Alfa"]], ["Slutavverkning", ["Beta"]], ["GROT", ["Gamma"]], ["Övrigt", ["Delta"]],
    ]);
  });
  it("med sökning (≥ 2 tecken): alla trakter, filtrerade, samma grupper", () => {
    expect(traktGrupper(lista, "gamm").map(g => [g.label, g.objekt.map(x => x.namn)])).toEqual([["Gallring", ["Gammal"]], ["GROT", ["Gamma"]]]);
    expect(traktGrupper(lista, "a").length).toBe(4); // ett tecken filtrerar inte
    expect(traktGrupper(lista, "zzz")).toEqual([]);
  });
});

describe("exakt minut för Starta nu och Avsluta, kvartar för längdknappar och steg", () => {
  it("nuMinut är exakt minut; nuKvartNarmast finns kvar för Till nu", () => {
    expect(nuMinut(new Date(2026, 9, 2, 13, 51))).toBe(13 * 60 + 51);
    expect(nuKvartNarmast(new Date(2026, 9, 2, 13, 51))).toBe(13 * 60 + 45);
    expect(nuKvartNarmast(new Date(2026, 9, 2, 7, 38))).toBe(7 * 60 + 45);
  });
  it("pågående start får inte ligga efter klockan (exakt), inte ens en halv kvart", () => {
    const nu = new Date(2026, 9, 2, 16, 53);
    expect(startLiggerIFramtiden(IDAG, 16 * 60 + 53, nu)).toBe(false);
    expect(startLiggerIFramtiden(IDAG, 16 * 60 + 54, nu)).toBe(true);
    expect(startLiggerIFramtiden(IDAG, 17 * 60, nu)).toBe(true);
  });
  it("slut: exakt nu är alltid godkänt; Till nu/plus (kvart) får ligga upp till en halv kvart efter", () => {
    expect(liggerIFramtiden(IDAG, 16 * 60 + 52, new Date(2026, 9, 2, 16, 52))).toBe(false); // exakt nu, fast närmaste kvart är 16:45
    expect(liggerIFramtiden(IDAG, 16 * 60 + 53, new Date(2026, 9, 2, 16, 52))).toBe(true);
    expect(liggerIFramtiden(IDAG, 17 * 60, new Date(2026, 9, 2, 16, 53))).toBe(false);     // närmaste kvart 17:00
    expect(liggerIFramtiden(IDAG, 17 * 60 + 15, new Date(2026, 9, 2, 16, 53))).toBe(true);
  });
});

describe("rast: ingen förifylld rast, ingen median", () => {
  it("nettoMin (bara för gamla rader med rast_min)", () => {
    expect(nettoMin(555, 30)).toBe(525);
    expect(nettoMin(20, 30)).toBe(0);
  });
});

describe("vanlig sluttid (snabbvalet 'Slutade 16:00?')", () => {
  const dag = (d: number, start: string, slut: string) => p({ datum: plusDagar(IDAG, -d), start_tid: start, slut_tid: slut });
  it("för få dagar → null", () => {
    expect(vanligSluttid([dag(1, "07:00:00", "16:00:00"), dag(2, "07:00:00", "16:00:00")], IDAG)).toBeNull();
    expect(vanligSluttid([], IDAG)).toBeNull();
  });
  it("median av dagens sista slut (närmaste kvart) och dagens spann; flera perioder per dag räknas som en dag", () => {
    const ps = [
      dag(1, "07:00:00", "12:00:00"), dag(1, "13:00:00", "16:05:00"), // 07:00–16:05
      dag(2, "07:00:00", "15:55:00"), dag(3, "07:30:00", "16:30:00"), dag(4, "07:00:00", "16:00:00"),
      dag(40, "05:00:00", "06:00:00"),                                  // för gammal
    ];
    const v = vanligSluttid(ps, IDAG)!;
    expect(v.dagar).toBe(4);
    expect(v.slut).toBe(16 * 60);        // median(16:05, 15:55, 16:30, 16:00) = 16:02,5 → närmaste kvart 16:00
    expect(v.spann).toBe(9 * 60);        // median(9:05, 8:55, 9:00, 9:00) = 9:00
  });
});
