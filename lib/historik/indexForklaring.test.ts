import { describe, it, expect } from "vitest";
import { atgarderAtt, EXEMPEL_MEDELSTAM, indexExempel, normalt, normaltTabell, TABELL_MEDELSTAM, underlagText, type Kurva, type Kurvor } from "./indexForklaring";

// Kurvorna är vy_hist_normkurva (variant 'g15-viktad') i prod 2026-10-14. Raderna nedan är riktiga rader ur vy_hist_objekt_index:
// medelstam (avrundad till 6 decimaler) och det forvantad_m3_per_g15 som vyn räknade för just den raden.
const KURVOR: Required<Kurvor> = {
  gallring: { a: 3.75895561541139, b: 0.736407612446492, n: 679 },
  slutavverkning: { a: 4.01736406793956, b: 0.77799640669071, n: 896 },
};
const VYNS_RADER: { atgard: "gallring" | "slutavverkning"; medelstam: number; forvantad: number }[] = [
  { atgard: "gallring", medelstam: 0.017521, forvantad: 2.18295158219144 },
  { atgard: "gallring", medelstam: 0.047841, forvantad: 4.57389382300636 },
  { atgard: "gallring", medelstam: 0.058952, forvantad: 5.33429892792615 },
  { atgard: "gallring", medelstam: 0.074194, forvantad: 6.31867886444597 },
  { atgard: "gallring", medelstam: 0.095353, forvantad: 7.6009389076896 },
  { atgard: "gallring", medelstam: 0.51549, forvantad: 26.3372547049637 },
  { atgard: "slutavverkning", medelstam: 0.037831, forvantad: 4.34797621496127 },
  { atgard: "slutavverkning", medelstam: 0.357206, forvantad: 24.939707821545 },
  { atgard: "slutavverkning", medelstam: 0.443752, forvantad: 29.5253542398555 },
  { atgard: "slutavverkning", medelstam: 0.523084, forvantad: 33.555867402424 },
  { atgard: "slutavverkning", medelstam: 0.623884, forvantad: 38.4866958018116 },
  { atgard: "slutavverkning", medelstam: 1.251992, forvantad: 66.168720783424 },
];

describe("normalt() = vad vy_hist_objekt_index räknar som förväntat m³/G15", () => {
  it("lika med vyns eget värde på riktiga rader, inom ±0,5 (i praktiken inom avrundningen av medelstammen)", () => {
    for (const r of VYNS_RADER) expect(Math.abs(normalt(KURVOR[r.atgard], r.medelstam) - r.forvantad), `${r.atgard} ${r.medelstam}`).toBeLessThanOrEqual(0.5);
  });
});

describe("tabellen i bladet", () => {
  it("värdena är samma tal som vyns formel ger vid samma medelstam (±0,5), avrundade till heltal", () => {
    for (const a of ["gallring", "slutavverkning"] as const) {
      const tabell = normaltTabell(KURVOR[a], a);
      expect(tabell).toHaveLength(3);
      TABELL_MEDELSTAM[a].forEach((ms, i) => {
        const raknat = Math.exp(KURVOR[a].a + KURVOR[a].b * Math.log(ms)); // vyns uttryck, ordagrant
        expect(Math.abs(Number(tabell[i].normalt) - raknat)).toBeLessThanOrEqual(0.5);
      });
    }
  });
  it("gallring 0,08 / 0,12 / 0,16 → 7 / 9 / 11; slutavverkning 0,25 / 0,40 / 0,60 → 19 / 27 / 37 med dagens kurva", () => {
    expect(normaltTabell(KURVOR.gallring, "gallring")).toEqual([
      { medelstam: "0,08", normalt: "7" }, { medelstam: "0,12", normalt: "9" }, { medelstam: "0,16", normalt: "11" },
    ]);
    expect(normaltTabell(KURVOR.slutavverkning, "slutavverkning")).toEqual([
      { medelstam: "0,25", normalt: "19" }, { medelstam: "0,40", normalt: "27" }, { medelstam: "0,60", normalt: "37" },
    ]);
  });
  it("inga hårdkodade normalvärden: en annan kurva ger andra tal", () => {
    const annan: Kurva = { a: KURVOR.gallring.a + Math.log(2), b: KURVOR.gallring.b, n: 1 }; // dubbelt så högt överallt
    const dubbel = normaltTabell(annan, "gallring").map((r) => Number(r.normalt));
    const vanlig = normaltTabell(KURVOR.gallring, "gallring").map((r) => Number(r.normalt));
    dubbel.forEach((v, i) => expect(Math.abs(v - 2 * vanlig[i])).toBeLessThanOrEqual(1));
  });
});

describe("exemplet", () => {
  it("slutavverkning: medelstam 0,40, normalt 27, gjorde 29,7, index 110", () => {
    expect(indexExempel(KURVOR.slutavverkning, "slutavverkning")).toEqual({ medelstam: "0,40", normalt: "27", gjorde: "29,7", index: "110" });
  });
  it("gallring: medelstam 0,12, normalt 9, gjorde 9,9, index 110", () => {
    expect(indexExempel(KURVOR.gallring, "gallring")).toEqual({ medelstam: "0,12", normalt: "9", gjorde: "9,9", index: "110" });
  });
  it("visar ALLTID 110 och går att kontrollräkna med miniräknare, oavsett kurva", () => {
    for (let a = 1; a <= 6; a += 0.37) {
      for (const atgard of ["gallring", "slutavverkning"] as const) {
        const e = indexExempel({ a, b: 0.75, n: 10 }, atgard);
        const n = Number(e.normalt.replace(/\s/g, "")), g = Number(e.gjorde.replace(",", "."));
        expect(e.index).toBe("110");
        expect(Math.round((g / n) * 100)).toBe(110);
      }
    }
  });
  it("medelstammarna är de som önskats", () => {
    expect(EXEMPEL_MEDELSTAM).toEqual({ gallring: 0.12, slutavverkning: 0.4 });
  });
});

describe("vilka åtgärder och vilket underlag", () => {
  it("en åtgärd där man tryckte, annars båda", () => {
    expect(atgarderAtt("gallring")).toEqual(["gallring"]);
    expect(atgarderAtt("slutavverkning")).toEqual(["slutavverkning"]);
    expect(atgarderAtt(null)).toEqual(["gallring", "slutavverkning"]);
    expect(atgarderAtt(undefined)).toEqual(["gallring", "slutavverkning"]);
  });
  it("underlaget säger antalet objekt ur vyn, inte ett hårdkodat", () => {
    expect(underlagText(KURVOR, ["gallring"])).toBe("Räknat från 679 av våra egna objekt i gallring där åtgärden är känd.");
    expect(underlagText(KURVOR, ["gallring", "slutavverkning"])).toBe("Räknat från våra egna objekt där åtgärden är känd: 679 i gallring och 896 i slutavverkning.");
    expect(underlagText({}, ["gallring"])).toBe("Räknat från våra egna objekt där åtgärden är känd.");
  });
});
