import { describe, it, expect } from "vitest";
import fixtur from "./__fixtures__/forare_maskin_jamfor_2026-10-14.json";
import {
  bastaIndex, bastaTu, delaMaskiner, GRANS_G15_H, harNogData, kolumnRubrik, maskinerForForare, olikaAr, sammaForareRader, TEXT_OLIKA_AR, tillForareMaskin, urvalForare, type ForareMaskinRad,
} from "./sammaForare";

// Fixturen är de 27 riktiga raderna i vy_hist_forare_maskin_jamfor i prod 2026-10-14, efter Svinhult-korrigeringen (hist_korrigering) och slutavverkningens anpassningsområde 0,10–1,5 (steg 20).
const RADER = (fixtur as Record<string, unknown>[]).map(tillForareMaskin);
const rad = (o: Partial<ForareMaskinRad> & { maskin: string }): ForareMaskinRad => ({
  forare: "Test Förare", atgard: "gallring", antal_objekt: 20, ar_fran: 2020, ar_till: 2022, g15_h: 500, viktat_index: 100, tu: 0.9, antal_med_tu: 20, tu_rapporterad: null, m3_per_g15: 5, ...o,
});
const ut = (v: { forare: string; atgarder: string[] }[]) => v.map((x) => `${x.forare}: ${x.atgarder.join(", ")}`);

describe("urvalet: vilka förare och åtgärder går att jämföra", () => {
  it("med dagens data: Martin gallring, Oskar gallring och Stefan slutavverkning, inget annat", () => {
    expect(ut(urvalForare(RADER))).toEqual(["Martin Lindqvist: gallring", "Oskar Nilsson: gallring", "Stefan Karlsson: slutavverkning"]);
  });
  it("kräver minst två maskiner med minst 200 G15-timmar: en förare med många maskiner men bara en över gränsen kommer inte med (Joacim, Martin och Oskar i slutavverkning)", () => {
    const v = urvalForare(RADER);
    expect(v.find((x) => x.forare === "Joacim Ringberg")).toBeUndefined();
    expect(v.find((x) => x.forare === "Martin Lindqvist")?.atgarder).toEqual(["gallring"]);
    expect(v.find((x) => x.forare === "Oskar Nilsson")?.atgarder).toEqual(["gallring"]);
  });
  it("en förare med en enda maskin kommer inte med, hur många timmar den än har (Stefan i gallring: 3 396 h på en maskin)", () => {
    expect(RADER.find((r) => r.forare === "Stefan Karlsson" && r.atgard === "gallring")?.g15_h).toBeGreaterThan(3000);
    expect(urvalForare(RADER).find((x) => x.forare === "Stefan Karlsson")?.atgarder).toEqual(["slutavverkning"]);
  });
  it("gränsen är 200 timmar: exakt 200 räknas, 199,9 räknas inte", () => {
    expect(GRANS_G15_H).toBe(200);
    expect(ut(urvalForare([rad({ maskin: "A", g15_h: 200 }), rad({ maskin: "B", g15_h: 200 })]))).toEqual(["Test Förare: gallring"]);
    expect(urvalForare([rad({ maskin: "A", g15_h: 200 }), rad({ maskin: "B", g15_h: 199.9 })])).toEqual([]);
    expect(harNogData(rad({ maskin: "A", g15_h: 200 }))).toBe(true);
    expect(harNogData(rad({ maskin: "A", g15_h: 199.9 }))).toBe(false);
  });
  it("maskinerna räknas per åtgärd: en maskin i gallring och en i slutavverkning är inte två maskiner i samma åtgärd", () => {
    expect(urvalForare([rad({ maskin: "A" }), rad({ maskin: "B", atgard: "slutavverkning" })])).toEqual([]);
  });
  it("åtgärderna kommer i fast ordning (gallring före slutavverkning) och förarna i namnordning", () => {
    const v = urvalForare([
      rad({ forare: "Örjan", maskin: "A" }), rad({ forare: "Örjan", maskin: "B" }), rad({ forare: "Örjan", maskin: "A", atgard: "slutavverkning" }), rad({ forare: "Örjan", maskin: "B", atgard: "slutavverkning" }),
      rad({ forare: "Anna", maskin: "A" }), rad({ forare: "Anna", maskin: "B" }),
    ]);
    expect(ut(v)).toEqual(["Anna: gallring", "Örjan: gallring, slutavverkning"]);
  });
  it("förare som inte får vara med: inga tekniska förare och inga externa finns i underlaget, och urvalet hårdkodar inga namn (en extern med en maskin faller på regeln)", () => {
    const namn = new Set(RADER.map((r) => r.forare));
    for (const n of ["Driver", "Service Service", "Komatsu Demo", "Trailer", "5", "7", "911", "Förare", "Komponent Test", "PonsseUsb MasterKey", "Ponsse AB Ponsse AB", "Komatsu", "Magnus Gustafsson", "Erik Garpenstedt"]) expect(namn.has(n), n).toBe(false);
    expect(urvalForare([rad({ forare: "Magnus Gustafsson", maskin: "A", g15_h: 900 })])).toEqual([]);
  });
});

describe("kolumnerna", () => {
  it("äldst till vänster: startår, sedan slutår, sedan namn", () => {
    expect(maskinerForForare(RADER, "Oskar Nilsson", "gallring").map((r) => r.maskin)).toEqual(["Rottne H8B", "Rottne H8D", "Rottne H8E Logmax", "Rottne H8E 2026"]);
    expect(maskinerForForare(RADER, "Martin Lindqvist", "gallring").map((r) => r.maskin)).toEqual(["Komatsu 941", "Komatsu 901XC", "Rottne H8B", "Rottne H8D", "Rottne H8E Logmax"]);
    expect(maskinerForForare(RADER, "Stefan Karlsson", "slutavverkning").map((r) => r.maskin)).toEqual(["Komatsu 901XC", "Scorpion King ny", "Scorpion Giant 2023", "Scorpion Giant 2025"]);
  });
  it("åren överst i kolumnen: 2017–2023, och ett enda år står som ett år", () => {
    expect(kolumnRubrik(rad({ maskin: "A", ar_fran: 2017, ar_till: 2023 }))).toBe("2017–2023");
    expect(kolumnRubrik(rad({ maskin: "A", ar_fran: 2025, ar_till: 2025 }))).toBe("2025");
  });
});

describe("raderna", () => {
  const martin = maskinerForForare(RADER, "Martin Lindqvist", "gallring");
  const tabell = sammaForareRader(martin);
  const rowAv = (e: string) => tabell.find((r) => r.etikett === e)!;
  it("samma rader som i den vanliga jämförelsen: Index, TU, m³/G15, G15 timmar, antal objekt", () => {
    expect(tabell.map((r) => r.etikett)).toEqual(["Index", "TU", "m³/G15", "G15 (h)", "Antal objekt"]);
  });
  it("under 200 timmar: 'För lite data' i stället för index, TU och m³/G15, men timmar och objekt står kvar (skälet)", () => {
    const i = martin.findIndex((r) => r.maskin === "Komatsu 901XC");
    for (const e of ["Index", "TU", "m³/G15"]) expect(rowAv(e).celler[i].text, e).toBe("För lite data");
    expect(rowAv("G15 (h)").celler[i].text).toBe("132");
    expect(rowAv("G15 (h)").celler[i].kalla).toBe("under 200 h");
    expect(rowAv("Antal objekt").celler[i].text).toBe("4");
  });
  it("'bäst' sätts bara på index och TU, och aldrig på 'För lite data' (901XC har högst index, 118,4, men för lite data)", () => {
    const i901 = martin.findIndex((r) => r.maskin === "Komatsu 901XC");
    expect(martin[i901].viktat_index).toBe(118.4);
    expect(rowAv("Index").celler.map((c) => c.bast)).toEqual([false, false, false, true, false]); // H8D, 112,5, är bäst bland dem med data
    expect(rowAv("Index").celler[i901].bast).toBe(false);
    for (const e of ["m³/G15", "G15 (h)", "Antal objekt"]) expect(rowAv(e).celler.some((c) => c.bast), e).toBe(false);
  });
  it("TU: 'bäst' bara bland maskiner med samma TU-källa och bara om minst två: Stefan har tre Ponsse-maskiner och en ur avbrott", () => {
    const stefan = maskinerForForare(RADER, "Stefan Karlsson", "slutavverkning");
    const t = sammaForareRader(stefan).find((r) => r.etikett === "TU")!;
    expect(t.celler.map((c) => c.kalla)).toEqual(["ur avbrott", "enligt Ponsse", "enligt Ponsse", "enligt Ponsse"]);
    expect(t.celler.map((c) => c.bast)).toEqual([false, false, false, true]); // Giant 2025, 93,0 %, högst bland Ponsse; 901XC (85,0 %) är ensam i sin källa
  });
  it("TU mellan olika källor jämförs aldrig: en Ponsse-maskin och en avbrottsmaskin ger ingen 'bäst'", () => {
    const k = [rad({ maskin: "A", tu: 0.85 }), rad({ maskin: "B", tu: null, tu_rapporterad: 0.97 })];
    expect(Array.from(bastaTu(k))).toEqual([]);
  });
  it("TU med för få rapporter med stopp (under 70 %) räknas inte som bäst och märks osäker", () => {
    const k = [rad({ maskin: "A", tu: 0.99, antal_objekt: 10, antal_med_tu: 5 }), rad({ maskin: "B", tu: 0.9 }), rad({ maskin: "C", tu: 0.88 })];
    expect(Array.from(bastaTu(k))).toEqual([1]);
    expect(sammaForareRader(k).find((r) => r.etikett === "TU")!.celler[0].notis).toContain("osäker");
  });
  it("index: lika värden delar 'bäst', och en ensam maskin med data får ingen", () => {
    expect(Array.from(bastaIndex([rad({ maskin: "A", viktat_index: 105 }), rad({ maskin: "B", viktat_index: 105 }), rad({ maskin: "C", viktat_index: 90 })]))).toEqual([0, 1]);
    expect(Array.from(bastaIndex([rad({ maskin: "A", viktat_index: 105 }), rad({ maskin: "B", g15_h: 50, viktat_index: 200 })]))).toEqual([]);
  });
  it("TU som saknas helt står som 'Saknas i formatet', aldrig 0", () => {
    const k = [rad({ maskin: "A", tu: null, tu_rapporterad: null }), rad({ maskin: "B" })];
    const c = sammaForareRader(k).find((r) => r.etikett === "TU")!.celler[0];
    expect(c.text).toBe("Saknas i formatet");
    expect(c.tal).toBeNull();
  });
});

describe("de maskiner som visas och de som döljs", () => {
  it("bara maskiner med minst 200 timmar visas; resten döljs, i samma ordning (äldst först)", () => {
    const { visas, dolda } = delaMaskiner(maskinerForForare(RADER, "Martin Lindqvist", "gallring"));
    expect(visas.map((r) => r.maskin)).toEqual(["Rottne H8B", "Rottne H8D"]);
    expect(dolda.map((r) => r.maskin)).toEqual(["Komatsu 941", "Komatsu 901XC", "Rottne H8E Logmax"]);
  });
  it("gränsen: exakt 200 h visas, 199,9 döljs", () => {
    const { visas, dolda } = delaMaskiner([rad({ maskin: "A", g15_h: 200 }), rad({ maskin: "B", g15_h: 199.9 })]);
    expect(visas.map((r) => r.maskin)).toEqual(["A"]);
    expect(dolda.map((r) => r.maskin)).toEqual(["B"]);
  });
  it("Oskar gallring och Stefan slutavverkning har inga dolda maskiner: ingen rad om dem", () => {
    expect(delaMaskiner(maskinerForForare(RADER, "Oskar Nilsson", "gallring")).dolda).toEqual([]);
    expect(delaMaskiner(maskinerForForare(RADER, "Stefan Karlsson", "slutavverkning")).dolda).toEqual([]);
  });
  it("varje jämförbar kombination har minst två visade maskiner (aldrig en tom eller ensam kolumn)", () => {
    for (const v of urvalForare(RADER)) for (const a of v.atgarder) expect(delaMaskiner(maskinerForForare(RADER, v.forare, a)).visas.length, `${v.forare} ${a}`).toBeGreaterThanOrEqual(2);
  });
});

describe("olika år", () => {
  const ar = (maskin: string, fran: number, till: number, g15_h = 500) => rad({ maskin, ar_fran: fran, ar_till: till, g15_h });
  it("NÅGOT par av de visade maskinerna saknar gemensamma år → raden visas", () => {
    expect(olikaAr([ar("A", 2014, 2019), ar("B", 2021, 2023)])).toBe(true);
    expect(olikaAr([ar("A", 2013, 2015), ar("B", 2017, 2019), ar("C", 2023, 2025)])).toBe(true);
    // bara ett par saknar gemensamma år (A och C), B överlappar båda
    expect(olikaAr([ar("A", 2013, 2017), ar("B", 2016, 2020), ar("C", 2019, 2022)])).toBe(true);
    expect(olikaAr([ar("A", 2013, 2015), ar("B", 2017, 2019), ar("C", 2019, 2025)])).toBe(true); // A–B saknar gemensamma år
  });
  it("alla par har minst ett gemensamt år (helt eller delvis, även bara ett år) → ingen rad", () => {
    expect(olikaAr([ar("A", 2017, 2023), ar("B", 2020, 2023)])).toBe(false); // delvis
    expect(olikaAr([ar("A", 2020, 2023), ar("B", 2021, 2022)])).toBe(false); // helt
    expect(olikaAr([ar("A", 2019, 2021), ar("B", 2021, 2023)])).toBe(false); // delar 2021
    expect(olikaAr([ar("A", 2013, 2021), ar("B", 2019, 2023), ar("C", 2020, 2022)])).toBe(false); // alla tre överlappar alla
  });
  it("färre än två visade maskiner: ingen rad", () => {
    expect(olikaAr([])).toBe(false);
    expect(olikaAr([ar("A", 2014, 2019)])).toBe(false);
  });
  it("bara maskiner med nog data räknas: en dold maskin som saknar gemensamma år påverkar inte", () => {
    expect(olikaAr([ar("A", 2014, 2019), ar("B", 2016, 2023), ar("C", 2024, 2026, 50)])).toBe(false);
    expect(olikaAr([ar("A", 2014, 2019), ar("B", 2021, 2023), ar("C", 2018, 2022, 50)])).toBe(true);
  });
  it("dagens jämförbara kombinationer: Martin gallring (H8B 2020–2022, H8D 2022–2023) delar 2022 → ingen rad; Oskar gallring och Stefan slutavverkning har par utan gemensamma år → rad", () => {
    expect(olikaAr(maskinerForForare(RADER, "Martin Lindqvist", "gallring"))).toBe(false);
    expect(olikaAr(maskinerForForare(RADER, "Oskar Nilsson", "gallring"))).toBe(true); // H8B 2017–2023 och H8E 2026
    expect(olikaAr(maskinerForForare(RADER, "Stefan Karlsson", "slutavverkning"))).toBe(true); // 901XC 2018–2021 och Giant 2023
  });
  it("texten", () => {
    expect(TEXT_OLIKA_AR).toBe("Alla maskiner kördes inte samma år. Förarens erfarenhet kan förklara en del av skillnaden.");
  });
});
