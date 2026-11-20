import { describe, it, expect } from "vitest";
import { atgarderAtt, EXEMPEL_MEDELSTAM, indexExempel, NORMALOMRADE, normalomradeText, normalt, normaltTabell, SKOTARE_UTAN_INDEX, TABELL_MEDELSTAM, UTANFOR_NORMALOMRADET, underlagAr, underlagText, type Kurva, type Kurvor } from "./indexForklaring";
import type { MaskinArRad } from "./typer";

// Kurvorna är vy_hist_normkurva (variant 'g15-viktad') i prod 2026-10-14 efter steg 20 (slutavverkning anpassad på medelstam 0,10–1,5 m³:
// n 893, b 0,6765; gallring oförändrad). Raderna nedan är riktiga rader ur vy_hist_objekt_index:
// medelstam (avrundad till 6 decimaler) och det forvantad_m3_per_g15 som vyn räknade för just den raden.
const KURVOR: Required<Kurvor> = {
  gallring: { a: 3.76145382237671, b: 0.737428242871544, n: 681 },
  slutavverkning: { a: 3.94779494993236, b: 0.676473132759643, n: 893 },
};
const VYNS_RADER: { atgard: "gallring" | "slutavverkning"; medelstam: number; forvantad: number }[] = [
  { atgard: "gallring", medelstam: 0.017521, forvantad: 2.17939722297705 },
  { atgard: "gallring", medelstam: 0.047841, forvantad: 4.57113025627379 },
  { atgard: "gallring", medelstam: 0.058952, forvantad: 5.33221236181495 },
  { atgard: "gallring", medelstam: 0.074194, forvantad: 6.31768993555482 },
  { atgard: "gallring", medelstam: 0.095353, forvantad: 7.60169562574378 },
  { atgard: "gallring", medelstam: 0.51549, forvantad: 26.3852822650932 },
  { atgard: "slutavverkning", medelstam: 0.037831, forvantad: 5.65529885695249 },
  { atgard: "slutavverkning", medelstam: 0.357206, forvantad: 25.8265883121956 },
  { atgard: "slutavverkning", medelstam: 0.443752, forvantad: 29.9092243640969 },
  { atgard: "slutavverkning", medelstam: 0.523084, forvantad: 33.4292440879617 },
  { atgard: "slutavverkning", medelstam: 0.623884, forvantad: 37.6616085191623 },
  { atgard: "slutavverkning", medelstam: 1.251992, forvantad: 60.3295965316406 },
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
  it("gallring 0,08 / 0,12 / 0,16 → 7 / 9 / 11; slutavverkning 0,25 / 0,40 / 0,60 → 20 / 28 / 37 med dagens kurva", () => {
    expect(normaltTabell(KURVOR.gallring, "gallring")).toEqual([
      { medelstam: "0,08", normalt: "7" }, { medelstam: "0,12", normalt: "9" }, { medelstam: "0,16", normalt: "11" },
    ]);
    expect(normaltTabell(KURVOR.slutavverkning, "slutavverkning")).toEqual([
      { medelstam: "0,25", normalt: "20" }, { medelstam: "0,40", normalt: "28" }, { medelstam: "0,60", normalt: "37" },
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
  it("slutavverkning: medelstam 0,40, normalt 28, gjorde 31, index 111", () => {
    expect(indexExempel(KURVOR.slutavverkning, "slutavverkning")).toEqual({ medelstam: "0,40", normalt: "28", gjorde: "31", index: "111" });
  });
  it("gallring: medelstam 0,12, normalt 9, gjorde 10, index 111", () => {
    expect(indexExempel(KURVOR.gallring, "gallring")).toEqual({ medelstam: "0,12", normalt: "9", gjorde: "10", index: "111" });
  });
  it("bara hela tal, och index räknas från de avrundade talen i texten (går att kontrollräkna med miniräknare), oavsett kurva", () => {
    for (let a = 1; a <= 6; a += 0.37) {
      for (const atgard of ["gallring", "slutavverkning"] as const) {
        const e = indexExempel({ a, b: 0.75, n: 10 }, atgard);
        for (const v of [e.normalt, e.gjorde, e.index]) expect(v).toMatch(/^\d+$/);
        const n = Number(e.normalt), g = Number(e.gjorde);
        expect(g).toBe(Math.round(n * 1.1));
        expect(Number(e.index)).toBe(Math.round((g / n) * 100));
      }
    }
  });
  it("medelstammarna är de som önskats", () => {
    expect(EXEMPEL_MEDELSTAM).toEqual({ gallring: 0.12, slutavverkning: 0.4 });
  });
});

describe("vilka åtgärder och vilket underlag", () => {
  const rad = (atgard: string, ar: number | null, antal: number, o: Record<string, unknown> = {}) =>
    ({ maskin: "R1", typ: "skördare", atgard, ar, urval: "namn", antal_med_index: antal, ...o }) as unknown as MaskinArRad;
  // vy_hist_maskin_ar: en rad per maskin, åtgärd och år (+ rader för hela perioden, ar = null, som aldrig räknas med)
  const RADER = [
    rad("gallring", 2013, 300), rad("gallring", 2024, 381), rad("gallring", null, 681),
    // slutavverkning: 894 objekt har index men kurvan (n = 893) är anpassad utan Hästhagen, som ligger utanför 0,10–1,5 m³
    rad("slutavverkning", 2012, 500), rad("slutavverkning", 2026, 394), rad("slutavverkning", null, 894),
    rad("slutavverkning", 2020, 50, { urval: "alla" }), // med antagna: hör inte till kurvan
    rad("slutavverkning", 2001, 9, { typ: "skotare" }),
  ];
  it("en åtgärd där man tryckte, annars båda", () => {
    expect(atgarderAtt("gallring")).toEqual(["gallring"]);
    expect(atgarderAtt("slutavverkning")).toEqual(["slutavverkning"]);
    expect(atgarderAtt(null)).toEqual(["gallring", "slutavverkning"]);
    expect(atgarderAtt(undefined)).toEqual(["gallring", "slutavverkning"]);
  });
  it("antalet ur kurvans n och åren ur raderna: inget hårdkodat", () => {
    expect(underlagText(KURVOR, ["slutavverkning"], RADER)).toBe("Räknat från 893 egna slutavverkningar 2012–2026.");
    expect(underlagText(KURVOR, ["gallring"], RADER)).toBe("Räknat från 681 egna gallringar 2013–2024.");
    expect(underlagText(KURVOR, ["gallring", "slutavverkning"], RADER)).toBe("Räknat från 681 egna gallringar 2013–2024 och 893 egna slutavverkningar 2012–2026.");
    expect(underlagText({ gallring: { a: 1, b: 1, n: 5 } }, ["gallring"], [rad("gallring", 2019, 2), rad("gallring", 2021, 3)])).toBe("Räknat från 5 egna gallringar 2019–2021.");
  });
  it("stämmer inte åren med kurvans n visas inga år, bara antalet", () => {
    expect(underlagAr(RADER, "gallring", 681)).toEqual({ fran: 2013, till: 2024 });
    expect(underlagAr(RADER, "gallring", 682)).toBeNull(); // färre objekt med index än kurvan säger: något stämmer inte
    expect(underlagText(KURVOR, ["slutavverkning"], [rad("slutavverkning", 2012, 500)])).toBe("Räknat från 893 egna slutavverkningar."); // 500 objekt med index < n = 893
    expect(underlagText(KURVOR, ["slutavverkning"])).toBe("Räknat från 893 egna slutavverkningar.");
  });
  it("med anpassningsområde: fler objekt med index än kurvans n är OK så länge ingen uppsättning av de extra kan tömma första eller sista året", () => {
    // 894 med index, n = 893: ett objekt är utanför området. 2012 och 2026 har många fler än ett: åren är säkra.
    expect(underlagAr(RADER, "slutavverkning", 893)).toEqual({ fran: 2012, till: 2026 });
    expect(underlagAr(RADER, "slutavverkning", 894)).toEqual({ fran: 2012, till: 2026 });
    expect(underlagAr(RADER, "slutavverkning", 895)).toBeNull(); // färre med index än kurvan
    // sista året har ett enda objekt och ett objekt är utanför: det kan vara det enda i 2026, så sista året är osäkert
    const tunt = [rad("slutavverkning", 2012, 500), rad("slutavverkning", 2026, 1)];
    expect(underlagAr(tunt, "slutavverkning", 500)).toBeNull();
    expect(underlagAr(tunt, "slutavverkning", 501)).toEqual({ fran: 2012, till: 2026 });
    // två extra objekt (summa 502, n 500) och 2026 har två: samma sak; har 2026 tre är det säkert
    expect(underlagAr([rad("slutavverkning", 2012, 500), rad("slutavverkning", 2026, 2)], "slutavverkning", 500)).toBeNull();
    expect(underlagAr([rad("slutavverkning", 2012, 500), rad("slutavverkning", 2026, 3)], "slutavverkning", 501)).toEqual({ fran: 2012, till: 2026 });
    expect(underlagAr([], "slutavverkning", 5)).toBeNull();
  });
  it("ett enda objekt böjs rätt, och utan kurva står en neutral rad", () => {
    expect(underlagText({ gallring: { a: 1, b: 1, n: 1 } }, ["gallring"], [rad("gallring", 2020, 1)])).toBe("Räknat från 1 egen gallring 2020–2020.");
    expect(underlagText({}, ["gallring"], RADER)).toBe("Räknat från våra egna objekt.");
  });
  it("skotare-raden är EN konstant", () => {
    expect(SKOTARE_UTAN_INDEX).toBe("Skotare får inget index. Det som styr en skotare är skotningsavståndet, och det finns inte i rapporterna.");
  });
});

describe("anpassningsområdet (steg 20)", () => {
  it("slutavverkning anpassas på medelstam 0,10–1,5 m³; gallring har inget område", () => {
    expect(NORMALOMRADE).toEqual({ slutavverkning: { fran: 0.1, till: 1.5 } });
    expect(NORMALOMRADE.gallring).toBeUndefined();
  });
  it("meningen i index-bladet: ordagrant för slutavverkning, ingen för gallring", () => {
    expect(normalomradeText("slutavverkning")).toBe("Objekt med medelstam under 0,10 m³ ingår inte i normalen, eftersom de är för få för att säga vad som är normalt.");
    expect(normalomradeText("gallring")).toBeNull();
  });
  it("märkningen i objektlistan", () => {
    expect(UTANFOR_NORMALOMRADET).toBe("utanför normalområdet");
  });
});
