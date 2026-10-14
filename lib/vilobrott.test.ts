import { describe, it, expect } from "vitest";
import { analyseraVilobrott, arTroligtVilobrott, veckovilaPerDag, type VilaTrosklar } from "./vilobrott";
import { sthlmVaggklocka } from "./sthlmTid";

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


// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// ÄNDARNA OCH NATTPASSEN — samma regler för ALLA (Vilobrott-listan, förarens appar, lagkontrollen i Översikten).
// Kom ur prod-kontrollen 2026-10-13: Oscar Ringberg 14,5 tim (anställd 28 sep, inga pass före), Joacim 13,3 tim (pågående vila efter
// sista passet), och att ett pass över midnatt fick 24 tim för mycket dygnsvila. Förut hade bara lagkontrollen reglerna, bakom flaggor.
// `nu` är det ögonblick underlaget är komplett t.o.m. (Stockholms väggklocka); utan `nu` är det riktiga nu.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plus = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); return iso(new Date(y, m - 1, d + n)); };
const vard = (fran: string, till: string) => { const ut: string[] = []; for (let d = fran; d <= till; d = plus(d, 1)) { const w = new Date(d + "T00:00:00").getDay(); if (w !== 0 && w !== 6) ut.push(d); } return ut; };
const alla = (fran: string, till: string) => { const ut: string[] = []; for (let d = fran; d <= till; d = plus(d, 1)) ut.push(d); return ut; };
const NU = new Date(2026, 9, 13, 12, 0);   // 13 okt 2026 12:00 (väggklocka)
const veck = (b: ReturnType<typeof analyseraVilobrott>) => b.filter(x => x.typ === "veckovila");
const dygn = (b: ReturnType<typeof analyseraVilobrott>) => b.filter(x => x.typ === "dygnsvila");

describe("veckovila: tiden FÖRE första passet räknas som vila (ny förare, datafönstrets första dagar)", () => {
  it("Oscar: anställd 28 sep, mån–fre — inga veckovilabrott de första dagarna (förut ett falskt brott på 15 tim)", () => {
    const dagar = vard("2026-09-28", "2026-10-13").map(d => dag(d, "06:00", "15:00"));
    expect(veck(analyseraVilobrott(dagar, trosklar, NU))).toEqual([]);
  });

  it("serien dag för dag: fönstren 29 sep–2 okt har ≥ 36 tim vila (förut 15 tim: de hade bara en veckas pass och 'före första passet' var okänt)", () => {
    const dagar = vard("2026-09-28", "2026-10-13").map(d => dag(d, "06:00", "15:00"));
    const serie = veckovilaPerDag(dagar, 7, NU).filter(d => d.datum >= "2026-09-29" && d.datum <= "2026-10-02");
    expect(Math.min(...serie.map(d => d.max_h))).toBeGreaterThanOrEqual(36);   // inräknat: vilan före första passet
  });

  it("en lång ledighet följd av pass räknas som vila före passet: pass bara 22 och 23 sep (okänd tid före) ger inget brott 22–23 sep", () => {
    const dagar = [dag("2026-09-22", "06:00", "16:00"), dag("2026-09-23", "06:00", "16:00")];
    expect(veck(analyseraVilobrott(dagar, trosklar, NU))).toEqual([]);
  });

  it("ett riktigt brott mitt i datat försvinner INTE: 10 dagar i rad ger fortfarande brott (vilan före/efter ligger utanför de dagarna)", () => {
    const grund = vard("2026-08-24", "2026-09-25");
    const dagar = [...grund, ...alla("2026-09-29", "2026-10-08")].map(d => dag(d, "06:00", "15:00"));
    const brott = veck(analyseraVilobrott(dagar, trosklar, NU));
    expect(brott.length).toBeGreaterThan(0);
    expect(Math.min(...brott.map(b => b.vila_h))).toBe(15);
  });
});

describe("veckovila: vilan efter SISTA passet fram till nu räknas (öppen lucka = slutar nu)", () => {
  const grund = vard("2026-08-24", "2026-09-25");
  it("Joacim: åtta dagar i rad 29 sep–6 okt, sedan ledig till 13 okt — brottet på 6 okt försvinner (vilan efter 6 okt är 165 tim)", () => {
    const dagar = [...grund, ...alla("2026-09-29", "2026-10-06")].map(d => dag(d, "06:00", "15:00"));
    expect(veck(analyseraVilobrott(dagar, trosklar, NU))).toEqual([]);
  });

  it("underlaget är komplett bara t.o.m. `nu`: med nu = 6 okt 23:59 (omanalys av ett fönster som slutar 6 okt) står brottet kvar", () => {
    const dagar = [...grund, ...alla("2026-09-29", "2026-10-06")].map(d => dag(d, "06:00", "15:00"));
    const brott = veck(analyseraVilobrott(dagar, trosklar, new Date(2026, 9, 6, 23, 59)));
    expect(brott.map(b => b.datum)).toEqual(["2026-10-06"]);
    expect(brott[0].vila_h).toBe(15);
  });

  it("en kort öppen lucka räcker inte: sista passet 12 okt 15:00, nu 13 okt 11:00 (20 tim) efter åtta dagar i rad → brott kvar", () => {
    const dagar = [...vard("2026-08-24", "2026-10-02"), ...alla("2026-10-05", "2026-10-12")].map(d => dag(d, "06:00", "15:00"));
    const brott = veck(analyseraVilobrott(dagar, trosklar, new Date(2026, 9, 13, 11, 0)));
    // brottet den 12 okt: fönstret [6–12 okt] har bara 15 tim mellan passen och 20 tim öppen lucka (längst av dem) — kortare än 36
    expect(brott.map(b => b.datum)).toEqual(["2026-10-12"]);
    expect(brott[0].vila_h).toBe(20);
  });

  it("ett PÅGÅENDE pass (start men ingen slut) kapar luckan: öppet pass börjar 7 okt 20:00 → vilan efter 6 okt är 29 tim (inte 44), brott kvar", () => {
    const dagar: any[] = [...grund, ...alla("2026-09-29", "2026-10-06")].map(d => dag(d, "06:00", "15:00"));
    dagar.push({ datum: "2026-10-07", start_tid: "20:00", slut_tid: null });
    const brott = veck(analyseraVilobrott(dagar, trosklar, new Date(2026, 9, 8, 12, 0)));
    expect(brott.find(b => b.datum === "2026-10-06")?.vila_h).toBe(29);
  });

  it("en GAMMAL pågående rad (start före sista avslutade passet, aldrig avslutad) kapar ingenting: Joacim-fallet gäller fortfarande", () => {
    const dagar: any[] = [...grund, ...alla("2026-09-29", "2026-10-06")].map(d => dag(d, "06:00", "15:00"));
    dagar.push({ datum: "2026-09-10", start_tid: "06:00", slut_tid: null });   // glömd rad
    expect(veck(analyseraVilobrott(dagar, trosklar, NU))).toEqual([]);
  });

  it("ett pågående pass som börjar EFTER `nu` (klockskev) förlänger inte vilan: nu 7 okt 12:00 → 21 tim efter 6 okt 15:00, inte 63", () => {
    const dagar: any[] = [...grund, ...alla("2026-09-29", "2026-10-06")].map(d => dag(d, "06:00", "15:00"));
    dagar.push({ datum: "2026-10-09", start_tid: "06:00", slut_tid: null });
    const brott = veck(analyseraVilobrott(dagar, trosklar, new Date(2026, 9, 7, 12, 0)));
    expect(brott.find(b => b.datum === "2026-10-06")?.vila_h).toBe(21);
  });

  it("utan `nu` används RIKTIGA nu (Stockholm): samma resultat som med ett nu långt efter sista passet", () => {
    const dagar = [...grund, ...alla("2026-09-29", "2026-10-06")].map(d => dag(d, "06:00", "15:00"));
    expect(veck(analyseraVilobrott(dagar, trosklar))).toEqual(veck(analyseraVilobrott(dagar, trosklar, new Date(2099, 0, 1))));
  });
});

describe("dygnsvila: ett pass över midnatt slutar nästa dygn — för ALLA (förut 24 tim för mycket vila)", () => {
  it("nattpass mån 22:00–06:00, nästa pass tis 14:00 → 8 tim, brott (förut 32 tim: sluttiden räknades samma datum)", () => {
    const b = dygn(analyseraVilobrott([dag("2026-10-05", "22:00", "06:00"), dag("2026-10-06", "14:00", "22:00")], trosklar, NU));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ datum: "2026-10-05", vila_h: 8, krav_h: 11 });
    // beskrivningen visar passets VERKLIGA slut (6 okt 06:00), inte passets startdatum — brottets datum (nyckeln i vilobrott) är fortfarande 5 okt
    expect(b[0].beskrivning).toBe("Du slutade 06:00 den 6 oktober och började 14:00 den 6 oktober — 8 h vila, kravet är 11 h.");
  });

  it("nattpass följt av ett pass med 14 tim vila → inget brott (förut 38 tim, samma utfall men av fel skäl)", () => {
    expect(dygn(analyseraVilobrott([dag("2026-10-05", "22:00", "06:00"), dag("2026-10-06", "20:00", "23:00")], trosklar, NU))).toEqual([]);
  });

  it("ett vanligt dagpass är oförändrat: 06:00–20:00, nästa dag 06:00 → 10 tim", () => {
    const b = dygn(analyseraVilobrott([dag("2026-10-05", "06:00", "20:00"), dag("2026-10-06", "06:00", "15:00")], trosklar, NU));
    expect(b.map(x => x.vila_h)).toEqual([10]);
  });

  it("start = slut (06:00–06:00) är 24 tim och slutar nästa dygn, som arbetsdagens längd räknas", () => {
    const b = dygn(analyseraVilobrott([dag("2026-10-05", "06:00", "06:00"), dag("2026-10-06", "14:00", "22:00")], trosklar, NU));
    expect(b.map(x => x.vila_h)).toEqual([8]);
  });

  it("två nattpass i rad: 22:00–06:00 mån och 22:00–06:00 tis → 16 tim vila, inget brott; med 18:00 start på tis → 12 → inget; 16:00 → 10 → brott", () => {
    expect(dygn(analyseraVilobrott([dag("2026-10-05", "22:00", "06:00"), dag("2026-10-06", "22:00", "06:00")], trosklar, NU))).toEqual([]);
    expect(dygn(analyseraVilobrott([dag("2026-10-05", "22:00", "06:00"), dag("2026-10-06", "16:00", "23:00")], trosklar, NU)).map(x => x.vila_h)).toEqual([10]);
  });
});

describe("sthlmVaggklocka: Stockholms väggklocka, oavsett datorns tidszon", () => {
  it("12:00 UTC en sommardag är 14:00 i Stockholm; en vinterdag 13:00", () => {
    const s = sthlmVaggklocka(new Date("2026-10-13T10:00:00Z"))!;
    expect([s.getFullYear(), s.getMonth(), s.getDate(), s.getHours(), s.getMinutes()]).toEqual([2026, 9, 13, 12, 0]);
    const v = sthlmVaggklocka(new Date("2026-12-01T10:00:00Z"))!;
    expect([v.getMonth(), v.getDate(), v.getHours()]).toEqual([11, 1, 11]);
  });
  it("minuterna följer med: 10:17 UTC är 12:17 (inte 12:00)", () => {
    const s = sthlmVaggklocka(new Date("2026-10-13T10:17:00Z"))!;
    expect([s.getHours(), s.getMinutes()]).toEqual([12, 17]);
  });
  it("ogiltigt datum ger undefined", () => { expect(sthlmVaggklocka(new Date("x"))).toBeUndefined(); });
});
