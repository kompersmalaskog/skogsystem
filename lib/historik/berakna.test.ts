// Enhetstester för historikvyns logik (ren funktion, ingen databas). Kör BARA den här filen: npx vitest run lib/historik/berakna.test.ts
// (aldrig hela vitest med .env.local — den ansluter mot PROD).
import { describe, expect, it } from "vitest";
import {
  antagnaIAtgard, atgardsrader, diagramVarde, fewObjects, fmt, harIndex, huvudtal, jamforRader, jamforSerie, maskinerMedObjekt, nyckeltal, okandaObjekt, procent, skordarlista,
  skotarlista, standardAtgard, tuSvar,
} from "./berakna";
import type { AtgardKod, MaskinArRad, MaskinTyp, Urval } from "./typer";

function r(p: Partial<MaskinArRad> & { maskin: string; typ: MaskinTyp; atgard: AtgardKod | null; ar: number | null; urval: Urval }): MaskinArRad {
  return {
    antal_objekt: 10, antal_med_g15: 10, volym_m3fub: 1000, g15_h: 100, m3_per_g15: 10, stammar_per_g15: 50, medelstam: 0.2, antal_med_index: 10, viktat_index: 100,
    antal_rapporter_med_stopp: 10, andel_rapporter_med_stopp: 1, tu: 0.9, reparationsgrad: 0.02, servicegrad: 0.03, storningsgrad: 0.05, bransle_l_per_m3: 1.5,
    lass_per_g15: null, antal_med_lass: 0, antal_volym_osaker: 0, ...p,
  };
}

const rader: MaskinArRad[] = [
  // Rottne: gallring, 148 objekt (alla = namn)
  r({ maskin: "Rottne H8E Logmax", typ: "skördare", atgard: "gallring", ar: null, urval: "namn", antal_objekt: 148, viktat_index: 102 }),
  r({ maskin: "Rottne H8E Logmax", typ: "skördare", atgard: "gallring", ar: null, urval: "alla", antal_objekt: 148, viktat_index: 102 }),
  r({ maskin: "Rottne H8E Logmax", typ: "skördare", atgard: "gallring", ar: 2023, urval: "namn", antal_objekt: 34 }),
  r({ maskin: "Rottne H8E Logmax", typ: "skördare", atgard: "gallring", ar: 2024, urval: "namn", antal_objekt: 47 }),
  r({ maskin: "Rottne H8E Logmax", typ: "skördare", atgard: "slutavverkning", ar: null, urval: "namn", antal_objekt: 2, antal_med_index: 2, viktat_index: 73.5 }),
  r({ maskin: "Rottne H8E Logmax", typ: "skördare", atgard: "slutavverkning", ar: null, urval: "alla", antal_objekt: 2, antal_med_index: 2, viktat_index: 73.5 }),
  // Komatsu 941: slutavverkning, 100 med namn + 406 antagna
  r({ maskin: "Komatsu 941", typ: "skördare", atgard: "slutavverkning", ar: null, urval: "namn", antal_objekt: 239, viktat_index: 99 }),
  r({ maskin: "Komatsu 941", typ: "skördare", atgard: "slutavverkning", ar: null, urval: "alla", antal_objekt: 645, viktat_index: 100 }),
  r({ maskin: "Komatsu 941", typ: "skördare", atgard: "slutavverkning", ar: 2018, urval: "namn", antal_objekt: 20 }),
  r({ maskin: "Komatsu 941", typ: "skördare", atgard: "slutavverkning", ar: 2018, urval: "alla", antal_objekt: 51 }),
  // Komatsu 911.3: bara antagna i slutavverkning
  r({ maskin: "Komatsu 911.3", typ: "skördare", atgard: "slutavverkning", ar: null, urval: "alla", antal_objekt: 10 }),
  // Skotare Komatsu 875
  r({ maskin: "Komatsu 875", typ: "skotare", atgard: null, ar: null, urval: "namn", antal_objekt: 380, m3_per_g15: 25.12, viktat_index: null, antal_med_index: 0 }),
  r({ maskin: "Komatsu 875", typ: "skotare", atgard: null, ar: null, urval: "alla", antal_objekt: 380, m3_per_g15: 25.12, viktat_index: null, antal_med_index: 0 }),
  r({ maskin: "Komatsu 875", typ: "skotare", atgard: "slutavverkning", ar: null, urval: "namn", antal_objekt: 203, m3_per_g15: 25.81, viktat_index: null, antal_med_index: 0 }),
  r({ maskin: "Komatsu 875", typ: "skotare", atgard: "okand", ar: null, urval: "alla", antal_objekt: 137, viktat_index: null, antal_med_index: 0 }),
  r({ maskin: "Komatsu 875", typ: "skotare", atgard: "okand", ar: null, urval: "namn", antal_objekt: 137, viktat_index: null, antal_med_index: 0 }),
];

describe("index finns bara för skördare i gallring/slutavverkning", () => {
  it("harIndex", () => {
    expect(harIndex("skördare", "gallring")).toBe(true);
    expect(harIndex("skördare", "slutavverkning")).toBe(true);
    expect(harIndex("skördare", "skada")).toBe(false);
    expect(harIndex("skördare", "special")).toBe(false);
    expect(harIndex("skotare", "slutavverkning")).toBe(false);
    expect(harIndex("skotare", null)).toBe(false);
  });
  it("huvudtal: index för skördare gallring, m³/G15 för skotare", () => {
    expect(huvudtal(rader[0])).toEqual({ varde: "102", enhet: "viktat index", ord: null });
    const sk = rader.find((x) => x.maskin === "Komatsu 875" && x.atgard === null && x.urval === "namn");
    expect(huvudtal(sk)).toEqual({ varde: "25,1", enhet: "m³/G15", ord: null });
    expect(huvudtal(undefined).ord).toMatch(/Inga objekt/);
  });
});

describe("antagna (obekräftad maskinstandard)", () => {
  it("skördarlistan utan antagna visar bara namn-objekt; maskin med bara antagna listas inte", () => {
    const l = skordarlista(rader, "slutavverkning", false);
    expect(l.map((x) => x.maskin)).toEqual(["Komatsu 941", "Rottne H8E Logmax"].sort((a, b) => a.localeCompare(b, "sv")).sort((a, b) => (b === "Komatsu 941" ? 1 : -1) * 0));
    expect(l.find((x) => x.maskin === "Komatsu 941")?.antalObjekt).toBe(239);
    expect(l.some((x) => x.maskin === "Komatsu 911.3")).toBe(false);
  });
  it("med antagna räknas alla objekt och 911.3 kommer med", () => {
    const l = skordarlista(rader, "slutavverkning", true);
    expect(l.find((x) => x.maskin === "Komatsu 941")?.antalObjekt).toBe(645);
    expect(l.some((x) => x.maskin === "Komatsu 911.3")).toBe(true);
  });
  it("antagnaIAtgard summerar alla − namn", () => {
    expect(antagnaIAtgard(rader, "slutavverkning")).toBe(645 - 239 + (10 - 0));
    expect(antagnaIAtgard(rader, "gallring")).toBe(0);
  });
});

describe("skotare visas med alla åtgärder tillsammans; uppdelning bara där åtgärden är känd", () => {
  it("skotarlistan = en rad per maskin över alla åtgärder", () => {
    const l = skotarlista(rader);
    expect(l).toHaveLength(1);
    expect(l[0].antalObjekt).toBe(380);
    expect(l[0].talTyp).toBe("m3_per_g15");
  });
  it("åtgärdsraderna: Alla först, sedan känd åtgärd; okänd får ingen egen rad men räknas", () => {
    const a = atgardsrader(rader, "Komatsu 875", "skotare", false);
    expect(a.map((x) => x.etikett)).toEqual(["Alla åtgärder", "Slutavverkning"]);
    expect(a.every((x) => x.index === null && !x.harIndex)).toBe(true);
    expect(okandaObjekt(rader, "Komatsu 875")).toBe(137);
  });
  it("skördare: en rad per åtgärd", () => {
    const a = atgardsrader(rader, "Rottne H8E Logmax", "skördare", false);
    expect(a.map((x) => x.etikett)).toEqual(["Gallring", "Slutavverkning"]);
    expect(a[0].index).toBe(102);
  });
});

describe("tillförlitlighet med ord", () => {
  it("färre än 5 objekt", () => {
    expect(fewObjects(4)).toBe("Bygger på 4 objekt");
    expect(fewObjects(5)).toBeNull();
  });
  it("TU: ord när avbrott saknas, ord när inga stopp, notis under 70 %", () => {
    expect(tuSvar({ tu: null, andel_rapporter_med_stopp: null, antal_rapporter_med_stopp: 0 })).toEqual({ text: "Avbrott saknas i rapportformatet", ord: true, notis: null });
    expect(tuSvar({ tu: null, andel_rapporter_med_stopp: 0, antal_rapporter_med_stopp: 0 }).text).toBe("Inga stopp registrerade i rapporterna");
    const lag = tuSvar({ tu: 0.9, andel_rapporter_med_stopp: 0.5, antal_rapporter_med_stopp: 5 });
    expect(lag.ord).toBe(false);
    expect(lag.notis).toMatch(/TU osäker: stopp registrerade i 50\s%/);
    expect(tuSvar({ tu: 0.9, andel_rapporter_med_stopp: 0.7, antal_rapporter_med_stopp: 7 }).notis).toBeNull();
  });
  it("nyckeltal: saknad data är ord, aldrig 0", () => {
    const rad_ = r({ maskin: "X", typ: "skördare", atgard: "slutavverkning", ar: 2020, urval: "namn", andel_rapporter_med_stopp: null, tu: null, reparationsgrad: null, bransle_l_per_m3: null, viktat_index: null, stammar_per_g15: null, medelstam: null });
    const n = Object.fromEntries(nyckeltal(rad_).map((x) => [x.etikett, x]));
    expect(n["TU"].varde).toBe("Avbrott saknas i rapportformatet");
    expect(n["TU"].ord).toBe(true);
    expect(n["Reparationsgrad"].varde).toBe("Avbrott saknas i rapportformatet");
    expect(n["Bränsle"].varde).toBe("Bränsle saknas i rapportformatet");
    expect(n["Viktat index"].ord).toBe(true);
    expect(n["Stammar/G15"].varde).toMatch(/saknas i rapportformatet/);
    for (const x of Object.values(n)) expect(x.varde).not.toMatch(/^0([,\s]|$)/);
  });
  it("skördare i skada/special: bara volym, G15, m³/G15, medelstam (inget index, ingen TU)", () => {
    const n = nyckeltal(r({ maskin: "X", typ: "skördare", atgard: "skada", ar: 2020, urval: "namn" })).map((x) => x.etikett);
    expect(n).toEqual(["Total volym", "G15", "m³/G15", "Medelstam"]);
  });
  it("skotare: lass/G15, TU, bränsle — inget index, ingen medelstam", () => {
    const n = nyckeltal(r({ maskin: "Y", typ: "skotare", atgard: null, ar: 2020, urval: "namn", lass_per_g15: 1.29 })).map((x) => x.etikett);
    expect(n).toEqual(["Total volym", "G15", "m³/G15", "Lass/G15", "TU", "Bränsle"]);
  });
  it("skördare gallring: alla nio nyckeltal i rätt ordning", () => {
    const n = nyckeltal(r({ maskin: "Z", typ: "skördare", atgard: "gallring", ar: 2020, urval: "namn" })).map((x) => x.etikett);
    expect(n).toEqual(["Total volym", "G15", "m³/G15", "Stammar/G15", "Medelstam", "Viktat index", "TU", "Reparationsgrad", "Bränsle"]);
  });
});

describe("formatering", () => {
  it("svenska tal", () => {
    expect(fmt(1234.5, 1)).toBe("1 234,5");
    expect(fmt(null)).toBeNull();
    expect(procent(0.941, 1)).toBe("94,1 %");
  });
  it("diagramvärde: index för skördare, m³/G15 för övrigt", () => {
    expect(diagramVarde(r({ maskin: "A", typ: "skördare", atgard: "gallring", ar: 2020, urval: "namn", viktat_index: 97, antal_med_index: 3 }))).toEqual({ varde: 97, n: 3 });
    expect(diagramVarde(r({ maskin: "A", typ: "skördare", atgard: "skada", ar: 2020, urval: "namn", m3_per_g15: 6, antal_med_g15: 4 }))).toEqual({ varde: 6, n: 4 });
  });
});

describe("standardåtgärd (steg 12): den åtgärd maskinen har flest objekt i", () => {
  const d: MaskinArRad[] = [
    r({ maskin: "Rottne X", typ: "skördare", atgard: "gallring", ar: null, urval: "alla", antal_objekt: 148 }),
    r({ maskin: "Rottne X", typ: "skördare", atgard: "slutavverkning", ar: null, urval: "alla", antal_objekt: 2 }),
    r({ maskin: "Rottne X", typ: "skördare", atgard: "skada", ar: null, urval: "alla", antal_objekt: 4 }),
    r({ maskin: "Aptman", typ: "skördare", atgard: "slutavverkning", ar: null, urval: "alla", antal_objekt: 193 }),
    r({ maskin: "Aptman", typ: "skördare", atgard: "skada", ar: null, urval: "alla", antal_objekt: 53 }),
    r({ maskin: "Aptman", typ: "skördare", atgard: "slutavverkning", ar: null, urval: "namn", antal_objekt: 28 }),
    r({ maskin: "Skot", typ: "skotare", atgard: null, ar: null, urval: "alla", antal_objekt: 380 }),
    r({ maskin: "Skot", typ: "skotare", atgard: "slutavverkning", ar: null, urval: "alla", antal_objekt: 203 }),
  ];
  it("Rottne öppnas i gallring, AptMan i slutavverkning (räknat över alla objekt), skotare utan åtgärd", () => {
    expect(standardAtgard(d, "Rottne X", "skördare")).toBe("gallring");
    expect(standardAtgard(d, "Aptman", "skördare")).toBe("slutavverkning");
    expect(standardAtgard(d, "Skot", "skotare")).toBeNull();
    expect(standardAtgard(d, "Finns inte", "skördare")).toBeNull();
  });
});

describe("jämförelsen (steg 12)", () => {
  const a = (maskin: string, p: Partial<MaskinArRad>, ar: number | null = null) =>
    r({ maskin, typ: "skördare", atgard: "gallring", ar, urval: "namn", ...p });
  const namnRader: MaskinArRad[] = [
    a("A", { antal_objekt: 50, antal_med_index: 50, antal_med_g15: 50, m3_per_g15: 5.4, viktat_index: 102, tu: 0.94, andel_rapporter_med_stopp: 0.98, bransle_l_per_m3: 2.2 }),
    a("A", { viktat_index: 108, antal_med_index: 30 }, 2023),
    a("A", { viktat_index: 99, antal_med_index: 20 }, 2024),
    a("B", { antal_objekt: 40, antal_med_index: 40, antal_med_g15: 40, m3_per_g15: 5.6, viktat_index: 97, tu: 0.9, andel_rapporter_med_stopp: 0.9, bransle_l_per_m3: 1.9 }),
    a("C", { antal_objekt: 3, antal_med_index: 3, antal_med_g15: 3, m3_per_g15: 9, viktat_index: 120, tu: 0.99, andel_rapporter_med_stopp: 0.4, bransle_l_per_m3: 1.0 }),
    a("D", { antal_objekt: 20, antal_med_index: 20, antal_med_g15: 20, m3_per_g15: 5.6, viktat_index: 97, tu: null, andel_rapporter_med_stopp: null, bransle_l_per_m3: null }),
  ];
  const d: MaskinArRad[] = [...namnRader, ...namnRader.map((x) => ({ ...x, urval: "alla" as Urval }))]; // databasen har alltid både namn- och alla-rader
  it("maskinerMedObjekt: bara maskiner med objekt i åtgärden, flest först", () => {
    expect(maskinerMedObjekt(d, "skördare", "gallring", false).map((x) => x.maskin)).toEqual(["A", "B", "D", "C"]);
    expect(maskinerMedObjekt(d, "skördare", "slutavverkning", false)).toEqual([]);
  });
  it("jamforSerie: ett värde per år, stigande", () => {
    expect(jamforSerie(d, "A", "gallring", false)).toEqual([{ ar: 2023, varde: 108, n: 30 }, { ar: 2024, varde: 99, n: 20 }]);
  });
  it("bäst markeras i m³/G15, index, TU (högst) och bränsle (lägst), bara bland tillförlitliga värden", () => {
    const rader_ = Object.fromEntries(jamforRader(d, ["A", "B", "C"], "skördare", "gallring", false).map((x) => [x.etikett, x]));
    // C har 3 objekt (osäker) och TU i 40 % av rapporterna -> räknas inte som bäst trots högst siffror
    expect(rader_["m³/G15"].celler.map((c) => c.bast)).toEqual([false, false, false]); // m³/G15 och bränsle markeras inte (steg 13)
    expect(rader_["Viktat index"].celler.map((c) => c.bast)).toEqual([true, false, false]);
    expect(rader_["TU"].celler.map((c) => c.bast)).toEqual([true, false, false]);
    expect(rader_["Bränsle l/m³"].celler.map((c) => c.bast)).toEqual([false, false, false]);
    expect(rader_["m³/G15"].celler[0].extra).toBe("medelstam 0,200 m³");
    expect(rader_["Bränsle l/m³"].celler[0].extra).toBe("medelstam 0,200 m³");
    expect(rader_["Antal objekt"].celler.some((c) => c.bast)).toBe(false);
    expect(rader_["m³/G15"].celler[2].notis).toBe("Bygger på 3 objekt");
    expect(rader_["TU"].celler[2].notis).toMatch(/TU osäker: stopp registrerade i 40\s%/);
  });
  it("lika värden delar markeringen; saknad data är ord och aldrig bäst", () => {
    const rader_ = Object.fromEntries(jamforRader(d, ["B", "D"], "skördare", "gallring", false).map((x) => [x.etikett, x]));
    expect(rader_["Viktat index"].celler.map((c) => c.bast)).toEqual([true, true]);
    expect(rader_["TU"].celler[1]).toMatchObject({ text: "Saknas i formatet", ord: true, bast: false });
    expect(rader_["Bränsle l/m³"].celler[1].text).toBe("Saknas i formatet");
  });
  it("skotarjämförelse: lass/G15 i stället för stammar/medelstam/index", () => {
    const sk = [r({ maskin: "S1", typ: "skotare", atgard: null, ar: null, urval: "namn", lass_per_g15: 1.2 }), r({ maskin: "S2", typ: "skotare", atgard: null, ar: null, urval: "namn", lass_per_g15: 1.4 })];
    const e = jamforRader(sk, ["S1", "S2"], "skotare", null, false).map((x) => x.etikett);
    expect(e).toEqual(["Kördes", "Antal objekt", "Total volym (m³)", "G15 (h)", "m³/G15", "Lass/G15", "TU", "Bränsle l/m³"]);
  });
});

describe("väljare (steg 13): varje maskin med minst 1 objekt i åtgärden är valbar", () => {
  const d: MaskinArRad[] = [
    r({ maskin: "911.3", typ: "skördare", atgard: "gallring", ar: null, urval: "alla", antal_objekt: 164 }),
    r({ maskin: "911.3", typ: "skördare", atgard: "gallring", ar: null, urval: "namn", antal_objekt: 110 }),
    r({ maskin: "901XC", typ: "skördare", atgard: "gallring", ar: null, urval: "alla", antal_objekt: 83 }),
    r({ maskin: "901XC", typ: "skördare", atgard: "gallring", ar: null, urval: "namn", antal_objekt: 83 }),
    r({ maskin: "Bara antagna", typ: "skördare", atgard: "gallring", ar: null, urval: "alla", antal_objekt: 7 }),
  ];
  it("alla tre är valbara; antal visar namn-objekt tills antagna tas med; maskin med bara antagna jämförs på dem", () => {
    const k = maskinerMedObjekt(d, "skördare", "gallring", false);
    expect(k.map((x) => [x.maskin, x.antal, x.urval])).toEqual([["911.3", 110, "namn"], ["901XC", 83, "namn"], ["Bara antagna", 7, "alla"]]);
    const k2 = maskinerMedObjekt(d, "skördare", "gallring", true);
    expect(k2.map((x) => [x.maskin, x.antal])).toEqual([["911.3", 164], ["901XC", 83], ["Bara antagna", 7]]);
  });
});
