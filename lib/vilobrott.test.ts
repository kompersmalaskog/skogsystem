import { describe, it, expect } from "vitest";
import { analyseraVilobrott, arTroligtVilobrott, type VilaTrosklar } from "./vilobrott";

const trosklar: VilaTrosklar = {
  dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14,
};
const dag = (datum: string, start = "06:00", slut = "16:00") => ({ datum, start_tid: start, slut_tid: slut });

describe("analyseraVilobrott: 0 h är 'vet inte', aldrig ett brott", () => {
  // Martin 2026-10-05: "Mellan 29 september och 29 september hade du som mest 0 h sammanhängande
  // vila". Testdata runt 29 september raderades; kvar blev ETT pass, och analysen räknade
  // "inga gap i fönstret" som 0 h vila. Utan minst två pass finns ingen vila att mäta.
  it("ett enda pass i underlaget ger inget veckovilabrott", () => {
    expect(analyseraVilobrott([dag("2026-09-29")], trosklar)).toEqual([]);
  });

  it("två pass med lång vila emellan ger inget brott", () => {
    expect(analyseraVilobrott([dag("2026-09-23"), dag("2026-09-29")], trosklar)).toEqual([]);
  });

  it("första dagen i en serie (inget gap än i fönstret) räknas inte som 0 h", () => {
    // 7 arbetsdagar i rad med 14 h vila emellan: det RIKTIGA brottet (14 h < 36 h) rapporteras,
    // men aldrig med 0 h och aldrig för dagarna där fönstret ännu inte har något gap att mäta.
    const dagar = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"].map(d => dag(d));
    const brott = analyseraVilobrott(dagar, trosklar).filter(b => b.typ === "veckovila");
    expect(brott.length).toBeGreaterThan(0);
    for (const b of brott) {
      expect(b.vila_h).toBeGreaterThan(0);
      expect(b.beskrivning).not.toMatch(/ 0 h /);
    }
  });

  it("ett riktigt veckovilabrott (aldrig 36 h sammanhängande) rapporteras fortfarande med sin vila", () => {
    const dagar = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"].map(d => dag(d));
    const brott = analyseraVilobrott(dagar, trosklar).filter(b => b.typ === "veckovila");
    expect(brott.some(b => b.vila_h === 14)).toBe(true);
  });
});

describe("arTroligtVilobrott: rimlighetskontroll för visning", () => {
  it("veckovila på 0 h är gammal data eller en artefakt, inte ett brott", () => {
    expect(arTroligtVilobrott({ typ: "veckovila", vila_h: 0 })).toBe(false);
    expect(arTroligtVilobrott({ typ: "veckovila", vila_h: "0" as any })).toBe(false);
  });
  it("ett riktigt brott passerar", () => {
    expect(arTroligtVilobrott({ typ: "veckovila", vila_h: 14 })).toBe(true);
    expect(arTroligtVilobrott({ typ: "dygnsvila", vila_h: 8.1 })).toBe(true);
  });
  it("dygnsvila på 0 h är inte heller troligt (passen börjar samtidigt som de slutar)", () => {
    expect(arTroligtVilobrott({ typ: "dygnsvila", vila_h: 0 })).toBe(false);
  });
  it("saknad vila_h (okänd) släpps inte igenom som troligt brott", () => {
    expect(arTroligtVilobrott({ typ: "veckovila", vila_h: null as any })).toBe(false);
  });
});
