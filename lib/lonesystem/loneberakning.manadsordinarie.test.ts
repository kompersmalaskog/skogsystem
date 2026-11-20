// ÖVERTID FÖRST NÄR MÅNADENS ORDINARIE ÄR FYLLD (Martin 2026-10-19).
//
// Förut: ordinarie = antal arbetade dagar × 8. Tre långa dagar (28,65 tim) gav 24 timlön + 4,65 övertid. Fel: månaden var långt ifrån full.
// Nu:    ordinarie = månadens ordinarie (lib/lonesystem/manadsordinarie: vardagar × 8 − röda dagar − frånvaro − före anställning − deldagens timmar),
//        timlön = min(arbetad tid, ordinarie), övertid = arbetad tid − ordinarie (aldrig negativ), premien följer timlönen.
//        Hemskickad tid och kortpass är arbetad tid. En månad som överlappar förarens utjämningsperiod behåller den gamla formeln.
//
// FACIT (Martin): Oscar sep 2026 = 28,65 timlön / 0 övertid. Stefan jan 2026 = 160 timlön. Oskar jan 2026 = 160 timlön.
// (Daniel/Max jan och Stefan aug är INTE facit för regeln — datahål vid maskinbyte / Fortnox-praxis, utreds separat.)
import { describe, it, expect } from "vitest";
import { beräknaExport } from "./loneberakning";
import { PROD_KODER } from "./testKoder";

const TYP = { SK: "skordare" as const, ST: "skotare" as const };
const MASKINER = { R64428: TYP.SK, PONS: TYP.SK, A030353: TYP.ST, JD810E: TYP.ST };
const dag = (datum: string, min: number, maskin: string | null = "R64428") => ({ datum, arbetad_min: min, maskin_id: maskin, km_totalt: 0, bekraftad: true, dagtyp: null });
const dagar = (lista: [string, number][], maskin = "R64428") => lista.map(([d, m]) => dag(d, m, maskin));
const fr = (typ: string, start: string, slut = start, extra: Record<string, any> = {}) => ({ typ, startdatum: start, slutdatum: slut, ...extra });
const manad = (ar: string) => { const [y, m] = ar.split("-").map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }; // arbetsmånad → löneperiod
type Kontext = { anstallningsdatum?: string | null; foretagsledare?: boolean; utjamning?: { startdatum: string; slutdatum: string }[]; aktiv?: boolean; franvaroRunt?: any[] };
const kor = (arbetsmanad: string, d: any[], ledigheter: any[] = [], extra: any[] = [], lon: Kontext = {}) =>
  beräknaExport("m", "Anna", "7", d, MASKINER, manad(arbetsmanad), extra, ledigheter, 60, null, new Set(), null, null, PROD_KODER, { anstallningsdatum: "2001-01-01", ...lon });
const mangd = (u: ReturnType<typeof kor>, art: string) => Number(u.rader.find(r => r.loneart === art)?.Number ?? 0);
const vardagarISep = ["01", "02", "03", "04", "07", "08", "09", "10", "11", "14", "15", "16", "17", "18", "21", "22", "23", "24", "25", "28", "29", "30"].map(x => `2026-09-${x}`);

describe("FACIT — Martins tal", () => {
  it("Oscar sep 2026: tre dagar, 28,65 tim → 28,65 timlön, 0 övertid (förut 24 + 4,65)", () => {
    const u = kor("2026-09", dagar([["2026-09-28", 570], ["2026-09-29", 576], ["2026-09-30", 573]], "JD810E"), [], [], { anstallningsdatum: "2023-08-01" });
    expect(u.timlon_h).toBe(28.65);
    expect(u.overtid_h).toBe(0);
    expect(mangd(u, "timlon")).toBe(28.65);
    expect(u.rader.some(r => r.loneart.startsWith("overtid"))).toBe(false);
    expect(u.ordinarie_h).toBe(176);              // septembers ordinarie — inte 3 × 8
    expect(u.arbetsdagar).toBe(3);                // vältlappar m.m. räknar fortfarande de arbetade dagarna
    expect(u.premielon_skotare_h).toBe(28.65);    // premien följer timlönetimmarna
  });

  it("Stefan jan 2026: 190,58 tim arbetade → timlön 160 (20 vardagar efter de två röda dagarna), 30,58 övertid, 16 tim helglön", () => {
    const stefan: [string, number][] = [["02", 102], ["05", 614], ["07", 588], ["08", 610], ["09", 613], ["12", 608], ["13", 655], ["14", 595], ["15", 628], ["16", 626],
      ["19", 650], ["20", 506], ["21", 625], ["22", 639], ["23", 668], ["26", 570], ["27", 512], ["28", 547], ["29", 561], ["30", 518]].map(([d, m]) => [`2026-01-${d}`, m as number]);
    const u = kor("2026-01", dagar(stefan, "PONS"), [], [], { anstallningsdatum: "2001-01-01" });
    expect(u.ordinarie_h).toBe(160);
    expect(u.timlon_h).toBe(160);
    expect(u.overtid_h).toBe(30.58);
    expect(u.helglon.timmar).toBe(16);
  });

  it("Oskar jan 2026: 166,5 tim (varav en lördag och en söndag) → timlön 160, 6,5 övertid", () => {
    const oskar: [string, number][] = [["05", 546], ["06", 505], ["07", 533], ["08", 565], ["13", 541], ["14", 564], ["15", 476], ["16", 602], ["19", 515], ["20", 439],
      ["21", 615], ["22", 582], ["23", 547], ["24", 534], ["25", 472], ["26", 494], ["27", 420], ["29", 541], ["30", 499]].map(([d, m]) => [`2026-01-${d}`, m as number]);
    const u = kor("2026-01", dagar(oskar, "R64428"), [], [], { anstallningsdatum: "2015-04-01" });
    expect(u.ordinarie_h).toBe(160);
    expect(u.timlon_h).toBe(160);
    expect(u.overtid_h).toBe(6.5);
  });
});

describe("kärnan: övertid först när månadens ordinarie är fylld", () => {
  it("tre långa dagar (10 tim) i en tom månad: allt är timlön", () => {
    const u = kor("2026-09", dagar([["2026-09-01", 600], ["2026-09-02", 600], ["2026-09-03", 600]]));
    expect(u.timlon_h).toBe(30);
    expect(u.overtid_h).toBe(0);
  });

  it("full månad med 22 dagar × 9 tim = 198 tim → 176 timlön + 22 övertid", () => {
    const u = kor("2026-09", dagar(vardagarISep.map(d => [d, 540] as [string, number])));
    expect(u.ordinarie_h).toBe(176);
    expect(u.timlon_h).toBe(176);
    expect(u.overtid_h).toBe(22);
    expect(mangd(u, "overtid_skordare")).toBe(22);
  });

  it("precis fylld månad: 22 × 8 tim → 176 timlön, ingen övertid", () => {
    const u = kor("2026-09", dagar(vardagarISep.map(d => [d, 480] as [string, number])));
    expect(u.timlon_h).toBe(176);
    expect(u.overtid_h).toBe(0);
  });

  it("övertiden kommer av månadens summa, inte av enskilda långa dagar: 21 korta + 1 lång dag", () => {
    const lista = vardagarISep.map(d => [d, 420] as [string, number]);   // 7 tim/dag = 154 tim
    lista[0] = ["2026-09-01", 720];                                      // en 12-timmarsdag: summan 159 tim < 176
    const u = kor("2026-09", dagar(lista));
    expect(u.overtid_h).toBe(0);
    expect(u.timlon_h).toBe(159);
  });

  it("timlön + övertid = arbetad tid, alltid (avrundningen ändrar inte summan)", () => {
    const lista = vardagarISep.map(d => [d, 487] as [string, number]);   // 8 tim 7 min/dag
    const u = kor("2026-09", dagar(lista));
    const arbetad = Math.round(lista.reduce((s, [, m]) => s + m, 0) / 60 * 100) / 100;
    expect(Math.round((u.timlon_h + u.overtid_h) * 100) / 100).toBe(arbetad);
  });

  it("premien följer timlönetimmarna: övertiden ger ingen premie", () => {
    const u = kor("2026-09", dagar(vardagarISep.map(d => [d, 540] as [string, number])));
    expect(u.premielon_skordare_h + u.premielon_skotare_h).toBe(176);
  });
});

describe("avdrag i månadens ordinarie (ur lönemotorn)", () => {
  it("röd dag: jan 2026 — nyårsdagen och trettondagen ger helglön, ordinarie är 160", () => {
    const u = kor("2026-01", dagar([["2026-01-05", 480]]));
    expect(u.ordinarie_h).toBe(160);
    expect(u.ordinarie.roda).toEqual(["2026-01-01", "2026-01-06"]);
  });

  it("semester 14–16 okt (Stefan): ordinarie 152, och 171 tim arbetade ger övertid först över 152", () => {
    const okt = ["01", "02", "05", "06", "07", "08", "09", "12", "13", "19", "20", "21", "22", "23", "26", "27", "28", "29", "30"].map(x => [`2026-10-${x}`, 540] as [string, number]);
    const u = kor("2026-10", dagar(okt), [fr("semester", "2026-10-14", "2026-10-16")]);
    expect(u.ordinarie_h).toBe(152);
    expect(u.timlon_h).toBe(152);
    expect(u.overtid_h).toBe(19);
    expect(u.ordinarie.franvaro).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
  });

  it.each(["semester", "atk", "komp", "sjuk", "vab", "foraldraledig", "tjanstledig", "permission"])("%s en vardag tar bort 8 tim ordinarie", typ => {
    const u = kor("2026-09", dagar([["2026-09-01", 480]]), [fr(typ, "2026-09-10")]);
    expect(u.ordinarie_h).toBe(168);
  });

  it("inarbetad (bytesdagens lediga dag) avdras också", () => {
    const u = kor("2026-09", dagar([["2026-09-01", 480]]), [fr("inarbetad", "2026-09-10", "2026-09-10", { ersatter_datum: "2026-06-19" })]);
    expect(u.ordinarie_h).toBe(168);
  });

  it("helg i en frånvaroperiod avdras inte: semester fre–mån = 2 vardagar", () => {
    const u = kor("2026-09", dagar([["2026-09-01", 480]]), [fr("semester", "2026-09-11", "2026-09-14")]);
    expect(u.ordinarie_h).toBe(160);
  });

  it("arbete vinner: en sjukrad på en dag med arbetspass avdras inte", () => {
    const u = kor("2026-09", dagar([["2026-09-10", 480]]), [fr("sjuk", "2026-09-10")]);
    expect(u.ordinarie_h).toBe(176);
  });

  it("halv dag sjuk: frånvarotimmarna (8 − arbetade 4) tas bort, inte hela dagen", () => {
    const u = kor("2026-09", dagar([["2026-09-10", 240]]), [fr("sjuk", "2026-09-10", "2026-09-10", { fran_tid: "11:30" })]);
    expect(u.deldagar[0].timmar).toBe(4);
    expect(u.ordinarie_h).toBe(172);
    expect(u.ordinarie.deldag_h).toBe(4);
  });

  it("halv dag VAB som två timmar: ordinarie minskar med de timmarna", () => {
    const u = kor("2026-09", dagar([["2026-09-10", 360]]), [fr("vab", "2026-09-10", "2026-09-10", { fran_tid: "14:00" })]);
    expect(u.ordinarie_h).toBe(176 - 2);
  });

  it("anställd den 15 september: dagarna före är inte ordinarie", () => {
    const u = kor("2026-09", dagar([["2026-09-15", 480]]), [], [], { anstallningsdatum: "2026-09-15" });
    expect(u.ordinarie_h).toBe(12 * 8);
    expect(u.ordinarie.anstallning).toHaveLength(10);
  });

  it("saknat anställningsdatum: ingen gissning, inget avdrag", () => {
    const u = kor("2026-09", dagar([["2026-09-15", 480]]), [], [], { anstallningsdatum: null });
    expect(u.ordinarie_h).toBe(176);
  });

  it("röd dag avdras också när helglönen INTE betalas (sjuk på den röda dagen): ordinarie är fortfarande 160", () => {
    const u = kor("2026-01", dagar([["2026-01-05", 480]]), [fr("sjuk", "2026-01-06")]);
    expect(u.helglon.dagar.find(h => h.datum === "2026-01-06")!.ger).toBe(false);
    expect(u.ordinarie.roda).toEqual(["2026-01-01", "2026-01-06"]);
    expect(u.ordinarie_h).toBe(160);
  });

  it("hemskickad är ingen frånvaro: den avdras inte", () => {
    const u = kor("2026-09", dagar([["2026-09-10", 360]]), [fr("hemskickad", "2026-09-10", "2026-09-10", { fran_tid: "14:00" })]);
    expect(u.ordinarie_h).toBe(176);
  });

  it("ordinarie går aldrig under noll", () => {
    const u = kor("2026-09", dagar([["2026-09-10", 480]]), [], [], { anstallningsdatum: "2026-12-01" });
    expect(u.ordinarie_h).toBe(0);
    expect(u.timlon_h).toBe(0);
    expect(u.overtid_h).toBe(8);
  });
});

describe("hemskickad tid och kortpass är arbetad tid mot månadens ordinarie", () => {
  it("6 tim + hemskickad kl 14 = 8 tim timlön, 0 övertid (facit från #808)", () => {
    const u = kor("2026-09", dagar([["2026-09-07", 360]]), [fr("hemskickad", "2026-09-07", "2026-09-07", { fran_tid: "14:00" })]);
    expect(u.timlon_h).toBe(8);
    expect(u.overtid_h).toBe(0);
  });

  it("hemskickad tid i en full månad ger övertid precis som annan arbetad tid över ordinarie", () => {
    const lista = vardagarISep.map(d => [d, 480] as [string, number]);
    lista[0] = ["2026-09-01", 360];                                                   // 6 tim + hemskickad 2 tim = en full dag
    const u = kor("2026-09", dagar(lista), [fr("hemskickad", "2026-09-01", "2026-09-01", { fran_tid: "14:00" })], [{ datum: "2026-09-12", minuter: 120 }]);
    expect(u.hemskickad_h).toBe(2);
    expect(u.timlon_h).toBe(176);
    expect(u.overtid_h).toBe(2);                                                      // bara de 2 tim extra tid på lördagen ligger över 176
  });

  it("kortpass (under 60 min) är betald tid: den fyller ordinarie och ger övertid först när månaden är full", () => {
    const tom = kor("2026-09", [dag("2026-09-10", 480), dag("2026-09-11", 26)]);
    expect(tom.timlon_h).toBe(8.43);
    expect(tom.overtid_h).toBe(0);
    const full = kor("2026-09", [...vardagarISep.map(d => dag(d, 480)), dag("2026-09-12", 26)]);
    expect(full.timlon_h).toBe(176);
    expect(full.overtid_h).toBe(0.43);
  });
});

describe("utjämningsperiod: månaden behåller dagens formel (arbetsdagar × 8)", () => {
  const tre = dagar([["2026-09-28", 570], ["2026-09-29", 576], ["2026-09-30", 573]], "JD810E");

  it("överlappar månaden en utjämningsperiod: samma som före regeln — 24 timlön + 4,65 övertid", () => {
    const u = kor("2026-09", tre, [], [], { utjamning: [{ startdatum: "2026-09-01", slutdatum: "2026-09-30" }] });
    expect(u.ordinarie.modell).toBe("utjamning");
    expect(u.ordinarie_h).toBe(24);
    expect(u.timlon_h).toBe(24);
    expect(u.overtid_h).toBe(4.65);
  });

  it("perioden som slutar den 5:e i månaden räknas som överlapp (juli)", () => {
    const u = kor("2026-07", dagar([["2026-07-01", 600], ["2026-07-02", 600]]), [], [], { utjamning: [{ startdatum: "2026-04-20", slutdatum: "2026-07-05" }] });
    expect(u.ordinarie.modell).toBe("utjamning");
    expect(u.timlon_h).toBe(16);
    expect(u.overtid_h).toBe(4);
  });

  it("utjämningsperioden är slut före månaden: den nya regeln gäller", () => {
    const u = kor("2026-09", tre, [], [], { utjamning: [{ startdatum: "2026-04-20", slutdatum: "2026-07-05" }] });
    expect(u.ordinarie.modell).toBe("manad");
    expect(u.timlon_h).toBe(28.65);
    expect(u.overtid_h).toBe(0);
  });

  it("utjämningsmånaden behåller kortpassens gamla behandling (kortpass är ordinarie, aldrig övertid)", () => {
    const u = kor("2026-09", [dag("2026-09-10", 480), dag("2026-09-11", 26)], [], [], { utjamning: [{ startdatum: "2026-09-01", slutdatum: "2026-09-30" }] });
    expect(u.timlon_h).toBe(8.43);
    expect(u.overtid_h).toBe(0);
  });
});

describe("företagsledare, aktiv och beskrivningar", () => {
  it("företagsledare får fortfarande inga lönerader", () => {
    const u = kor("2026-09", dagar(vardagarISep.map(d => [d, 540] as [string, number])), [], [], { foretagsledare: true });
    expect(u.rader).toEqual([]);
    expect(u.lonerader).toEqual([]);
    expect(u.timlon_h).toBe(0);
    expect(u.overtid_h).toBe(0);
  });

  it("timlönens text är oförändrad när månadens ordinarie är arbetade dagar × 8 (så byte-diffen bara visar det som ändras)", () => {
    const u = kor("2026-08", dagar(["03", "04", "05", "06", "07", "10", "11", "12", "13", "14", "17", "18", "19", "20", "21", "24", "25", "26", "27", "28", "31"].map(x => [`2026-08-${x}`, 600] as [string, number])));
    expect(u.rader.find(r => r.loneart === "timlon")!.beskrivning).toBe("Timlön: 168h ordinarie (21 dagar × 8h)");
    expect(u.rader.find(r => r.loneart === "overtid_skordare")!.beskrivning).toBe("Övertid: 42h (210h totalt - 168h ordinarie)");
  });

  it("timlönens text säger vad som avgör när månadens ordinarie skiljer sig från arbetade dagar × 8", () => {
    const u = kor("2026-09", dagar([["2026-09-28", 570], ["2026-09-29", 576], ["2026-09-30", 573]], "JD810E"));
    expect(u.rader.find(r => r.loneart === "timlon")!.beskrivning).toBe("Timlön: 28.65h (arbetade 28.65h av månadens ordinarie 176h: 22 vardagar × 8h)");
  });

  it("ingen inaktiv-varning för en företagsledare eller i en utjämningsmånad (inga rader / egen beräkning)", () => {
    expect(kor("2026-09", dagar([["2026-09-10", 480]]), [], [], { aktiv: false, foretagsledare: true }).varningar.some(v => /inaktivt/.test(v))).toBe(false);
    expect(kor("2026-09", dagar([["2026-09-10", 480]]), [], [], { aktiv: false, utjamning: [{ startdatum: "2026-09-01", slutdatum: "2026-09-30" }] }).varningar.some(v => /inaktivt/.test(v))).toBe(false);
    expect(kor("2026-09", dagar([["2026-09-10", 480]]), [], [], {}).varningar.some(v => /inaktivt/.test(v))).toBe(false);   // aktiv okänd = ingen varning
  });

  it("en inaktiv förare varnas: slutdatum saknas, månadens ordinarie räknas utan avdrag efter avslut", () => {
    const u = kor("2026-09", dagar([["2026-09-10", 480]]), [], [], { aktiv: false });
    expect(u.varningar.some(v => /inaktivt/.test(v) && /slutdatum/.test(v))).toBe(true);
    const aktiv = kor("2026-09", dagar([["2026-09-10", 480]]), [], [], { aktiv: true });
    expect(aktiv.varningar.some(v => /inaktivt/.test(v))).toBe(false);
  });
});

describe("varningen om extra tid utan maskinpass är omskriven", () => {
  it("månadens ordinarie: extra tid räknas som arbetad tid mot ordinarie (säger inte längre 'höjer inte ordinarie')", () => {
    const u = kor("2026-09", dagar([["2026-09-10", 480]]), [], [{ datum: "2026-09-12", minuter: 120 }]);
    const v = u.varningar.find(x => /extra tid ligger på dagar utan maskinpass/.test(x))!;
    expect(v).toBe("2h extra tid ligger på dagar utan maskinpass — räknas som arbetad tid mot månadens ordinarie. Granska.");
    expect(v).not.toMatch(/höjer inte/);
  });

  it("i en utjämningsmånad gäller den gamla texten (där höjer inte tiden ordinarie)", () => {
    const u = kor("2026-09", dagar([["2026-09-10", 480]]), [], [{ datum: "2026-09-12", minuter: 120 }], { utjamning: [{ startdatum: "2026-09-01", slutdatum: "2026-09-30" }] });
    expect(u.varningar.find(x => /extra tid ligger på dagar utan maskinpass/.test(x))).toMatch(/höjer inte ordinarie-timmarna/);
  });
});
