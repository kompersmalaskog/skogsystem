import { describe, it, expect } from "vitest";
import { arsovertidRader, arsovertidNiva, timmarText, utjamningsRad, VARNING_UNDER_TAK_H, type ArsovertidSvar } from "./arsovertidVy";

// Svaret från /api/lon/arsovertid så som det ser ut i prod 2026-10-09 (skrivskyddad torrkörning av beraknaArsovertid mot
// prod-data): alla fyra modellernas tal per förare. Vyn visar BARA avtalets modell (genomsnitt): samma tal som kolumnen
// "Genomsnitt" visade förut — Stefan 74,5, övriga 0.
const M = (genomsnitt: number, vardagar: number, dagar: number, vecka: number) => ({ genomsnitt, vardagar, dagar, vecka });
const PROD_IDAG: ArsovertidSvar = {
  ok: true, ar: 2026, tak: 250, tomDatum: "2026-10-09",
  medarbetare: [
    { medarbetare_id: "m", namn: "Martin Lindqvist", timmar: 951.5, modeller: M(0, 54.4, 111.9, 183.6), perioder: [] },
    { medarbetare_id: "d", namn: "Daniel Johansson", timmar: 1389.5, modeller: M(0, 102.6, 204.6, 226.3), perioder: [] },
    { medarbetare_id: "o", namn: "Oskar Nilsson", timmar: 1376.1, modeller: M(0, 77.9, 112.1, 98.7), perioder: [] },
    { medarbetare_id: "s", namn: "Stefan Karlsson", timmar: 1583.9, modeller: M(74.5, 205.5, 303.5, 344.3), perioder: [{ fran: 1, till: 16, veckor: 16, timmar: 0, overtid: 43.9, markerad: false }] },
    { medarbetare_id: "j", namn: "Joacim Ringberg", timmar: 383.7, modeller: M(0, 11.9, 94.6, 149.4), perioder: [] },
    { medarbetare_id: "oc", namn: "Oscar Ringberg", timmar: 73, modeller: M(0, 0, 9, 6.3), perioder: [] },
    { medarbetare_id: "x", namn: "Max Karlsson", timmar: 1440.2, modeller: M(0, 125.2, 176.5, 135.6), perioder: [] },
  ],
  utjamning: [{ startdatum: "2026-04-20", slutdatum: "2026-07-05", medarbetare_id: null, anteckning: "Gavle/Hedemora-Sandviken 22 apr-29 jun 2026 (sex objekt, 100 arbetsdagar). Ordinarie tid utlagd ojamnt." }],
  utjamning_fel: null,
};

describe("arsovertidRader: bara avtalets modell, samma tal som förut", () => {
  it("Stefan 74,5 och övriga 0 — exakt kolumnen 'Genomsnitt' ur prod idag", () => {
    const r = arsovertidRader(PROD_IDAG);
    expect(r.map(x => [x.namn, x.timmar])).toEqual([
      ["Stefan Karlsson", 74.5], ["Daniel Johansson", 0], ["Joacim Ringberg", 0], ["Martin Lindqvist", 0],
      ["Max Karlsson", 0], ["Oscar Ringberg", 0], ["Oskar Nilsson", 0],
    ]);
  });

  it("varje rads tal ÄR modeller.genomsnitt för just den föraren — aldrig ett av de tre andra", () => {
    for (const rad of arsovertidRader(PROD_IDAG)) {
      const k = PROD_IDAG.medarbetare!.find(m => m.medarbetare_id === rad.id)!;
      expect(rad.timmar).toBe(k.modeller.genomsnitt);
      expect([k.modeller.vardagar, k.modeller.dagar, k.modeller.vecka]).not.toContain(rad.timmar === 0 ? -1 : rad.timmar);
    }
  });

  it("störst först, lika tal i namnordning; taket följer med; ingen modell-lista behövs i svaret", () => {
    const svar: ArsovertidSvar = { ok: true, tak: 250, medarbetare: [
      { medarbetare_id: "a", namn: "Bo", timmar: 1, modeller: { genomsnitt: 10 } },
      { medarbetare_id: "b", namn: "Ann", timmar: 1, modeller: { genomsnitt: 10 } },
      { medarbetare_id: "c", namn: "Cia", timmar: 1, modeller: { genomsnitt: 120 } },
    ] };
    const r = arsovertidRader(svar);
    expect(r.map(x => x.namn)).toEqual(["Cia", "Ann", "Bo"]);
    expect(r.every(x => x.tak === 250)).toBe(true);
  });

  it("taket saknas i svaret → 250 (avtalets tak)", () => {
    expect(arsovertidRader({ ok: true, medarbetare: [{ medarbetare_id: "a", namn: "A", timmar: 1, modeller: { genomsnitt: 5 } }] })[0].tak).toBe(250);
  });

  it("ett läsfel eller ok:false ger inga rader (anroparen visar felet, aldrig 'ingen övertid')", () => {
    expect(arsovertidRader({ ok: false, meddelande: "nät" })).toEqual([]);
  });

  it("andelen av taket för stapeln: 74,5 av 250 = 0,298; över taket kapas stapeln vid full längd", () => {
    const r = arsovertidRader({ ok: true, tak: 250, medarbetare: [
      { medarbetare_id: "s", namn: "S", timmar: 1, modeller: { genomsnitt: 74.5 } },
      { medarbetare_id: "t", namn: "T", timmar: 1, modeller: { genomsnitt: 300 } },
    ] });
    expect(r.find(x => x.id === "s")!.andel).toBeCloseTo(0.298, 3);
    expect(r.find(x => x.id === "t")!.andel).toBe(1);
  });
});

describe("arsovertidNiva: grå normalt, orange över 200, röd över 250, noll dämpad", () => {
  it("varningen börjar 50 tim under taket", () => { expect(VARNING_UNDER_TAK_H).toBe(50); });
  it.each([
    [0, 250, "noll"], [0.1, 250, "lugn"], [74.5, 250, "lugn"], [200, 250, "lugn"], [200.1, 250, "varning"],
    [250, 250, "varning"], [250.1, 250, "over"], [400, 250, "over"],
  ])("%s tim av %s → %s", (h, tak, niva) => { expect(arsovertidNiva(h as number, tak as number)).toBe(niva); });
  it("följer taket i avtalet: tak 300 → varning över 250", () => {
    expect(arsovertidNiva(250, 300)).toBe("lugn");
    expect(arsovertidNiva(250.1, 300)).toBe("varning");
  });
});

describe("timmarText: svensk decimalkomma, en decimal, inga 'x,0'", () => {
  it.each([[74.5, "74,5"], [0, "0"], [200, "200"], [43.94, "43,9"], [43.96, "44"], [1234.5, "1234,5"]])("%s → %s", (h, t) => { expect(timmarText(h as number)).toBe(t); });
});

describe("utjamningsRad: en grå rad per markerad period", () => {
  it("v17–27 ur 2026-04-20 → 2026-07-05, med platsen ur anteckningen", () => {
    expect(utjamningsRad(PROD_IDAG.utjamning![0])).toBe("Utjämningsperiod v17–27 (Gavle/Hedemora-Sandviken) räknas som genomsnitt");
  });
  it("anteckning utan plats → ingen parentes", () => {
    expect(utjamningsRad({ startdatum: "2026-04-20", slutdatum: "2026-07-05", anteckning: "" })).toBe("Utjämningsperiod v17–27 räknas som genomsnitt");
    expect(utjamningsRad({ startdatum: "2026-04-20", slutdatum: "2026-07-05", anteckning: "22 apr-29 jun, sex objekt" })).toBe("Utjämningsperiod v17–27 räknas som genomsnitt");
    expect(utjamningsRad({ startdatum: "2026-04-20", slutdatum: "2026-07-05", anteckning: null })).toBe("Utjämningsperiod v17–27 räknas som genomsnitt");
  });
  it("samma vecka i start och slut: en vecka", () => {
    expect(utjamningsRad({ startdatum: "2026-04-20", slutdatum: "2026-04-24", anteckning: "Gävle" })).toBe("Utjämningsperiod v17 (Gävle) räknas som genomsnitt");
  });
  it("en lång anteckning kapas före första siffra eller parentes", () => {
    expect(utjamningsRad({ startdatum: "2026-04-20", slutdatum: "2026-07-05", anteckning: "Gävle (sex objekt) 22 apr" })).toBe("Utjämningsperiod v17–27 (Gävle) räknas som genomsnitt");
  });
});
