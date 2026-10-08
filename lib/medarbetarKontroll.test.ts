import { describe, it, expect } from "vitest";
import { okandaOperatorer, forareUtanMaskin, saknarHempunkt, obekraftadeHempunkter, normNamn } from "./medarbetarKontroll";

const med = [
  { id: "m1", namn: "Martin Lindqvist", aktiv: true },
  { id: "m2", namn: "Daniel Johansson", aktiv: true },
];
const dim = [
  { operator_id: "A130743_2", operator_namn: "Martin Lindqvist" },
  { operator_id: "PONS_1", operator_namn: "Service Service" },
  { operator_id: "A130743_1", operator_namn: "Daniel Johansson" },
];

describe("okandaOperatorer — Martins fyra dagar på Elefanten", () => {
  it("okopplad operatör med namnmatch listas med sina dagar", () => {
    const skift = [
      { operator_id: "A130743_2", maskin_id: "A130743", datum: "2026-09-26" },
      { operator_id: "A130743_2", maskin_id: "A130743", datum: "2026-09-19" },
      { operator_id: "A130743_2", maskin_id: "A130743", datum: "2026-09-19" },
      { operator_id: "PONS_1", maskin_id: "PONS", datum: "2026-09-14" },
      { operator_id: "A130743_1", maskin_id: "A130743", datum: "2026-09-20" },
    ];
    const ut = okandaOperatorer(skift, new Set(["A130743_1"]), dim, med);
    expect(ut).toEqual([{ operator_id: "A130743_2", maskin_id: "A130743", operator_namn: "Martin Lindqvist", datum: ["2026-09-19", "2026-09-26"], medarbetare: { id: "m1", namn: "Martin Lindqvist" } }]);
  });
  it("utan namnmatch (Service Service) eller med två träffar föreslås ingenting", () => {
    const skift = [{ operator_id: "A130743_2", maskin_id: "A130743", datum: "2026-09-19" }];
    const dubbel = [...med, { id: "m3", namn: "martin  lindqvist", aktiv: true }];
    expect(okandaOperatorer(skift, new Set(), dim, dubbel)).toEqual([]);
    expect(okandaOperatorer([{ operator_id: "PONS_1", maskin_id: "PONS", datum: "2026-09-14" }], new Set(), dim, med)).toEqual([]);
  });
  it("namn jämförs utan skiftläge och extra blanksteg", () => {
    expect(normNamn("  Martin   LINDQVIST ")).toBe("martin lindqvist");
  });
});

describe("forareUtanMaskin + saknarHempunkt", () => {
  it("aktiv förare utan maskin varnas; admin och inaktiva gör det inte", () => {
    expect(forareUtanMaskin([
      { id: "o", namn: "Oscar Ringberg", roll: "forare", maskin_id: null, aktiv: true },
      { id: "j", namn: "Joacim Ringberg", roll: "admin", maskin_id: null, aktiv: true },
      { id: "x", namn: "Slutat", roll: "forare", maskin_id: null, aktiv: false },
      { id: "s", namn: "Stefan", roll: "forare", maskin_id: "PONS", aktiv: true },
    ])).toEqual([{ id: "o", namn: "Oscar Ringberg" }]);
  });
  it("hempunkt saknas: tom adress, väntar, osäker", () => {
    expect(saknarHempunkt([
      { id: "j", namn: "Joacim", aktiv: true, hemadress: "", hem_lat: null, hem_lng: null },
      { id: "o", namn: "Oscar", aktiv: true, hemadress: "Idekulla 6", hem_lat: null, hem_lng: null, hem_geokod_status: "vantar" },
      { id: "q", namn: "Q", aktiv: true, hemadress: "X", hem_lat: null, hem_lng: null, hem_geokod_status: "osaker" },
      { id: "s", namn: "Stefan", aktiv: true, hemadress: "Backvägen 3", hem_lat: 56.5, hem_lng: 14.8 },
    ])).toEqual([
      { id: "j", namn: "Joacim", orsak: "ingen_adress" },
      { id: "o", namn: "Oscar", orsak: "vantar" },
      { id: "q", namn: "Q", orsak: "osaker" },
    ]);
  });
});

describe("obekraftadeHempunkter: geokodade punkter som ingen har sett", () => {
  it("bara aktiva med geokodad punkt utan stämpel; manuell, bekräftad och saknad punkt räknas inte", () => {
    const bas = { aktiv: true, hemadress: "x", hem_lat: 56.4, hem_lng: 14.7, hem_koord_kalla: "geokod", hem_bekraftad_tid: null };
    expect(obekraftadeHempunkter([
      { id: "a", namn: "Anna", ...bas },
      { id: "b", namn: "Bo", ...bas, hem_bekraftad_tid: "2026-10-08T09:00:00Z" },
      { id: "c", namn: "Cia", ...bas, hem_koord_kalla: "manuell" },
      { id: "d", namn: "Dan", ...bas, hem_lat: null, hem_lng: null },
      { id: "e", namn: "Eva", ...bas, aktiv: false },
    ])).toEqual([{ id: "a", namn: "Anna" }]);
  });
});
