// @vitest-environment jsdom
/**
 * RENDERINGSTEST för "Samma förare" i jämförelsen (/admin/historik/jamfor): segmentväljaren överst, bara förare som går att jämföra, kolumnerna
 * äldst till vänster med åren överst, "För lite data" under 200 G15-timmar, "bäst" bara på index och TU (TU bara inom samma källa), de grå raderna
 * och ⓘ vid Index. Fake-supabasen svarar som PostgREST ({ data, error }, tomt svar utan fel när RLS stänger ute) med de riktiga raderna ur
 * vy_hist_forare_maskin_jamfor (fixturen).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fixtur from "@/lib/historik/__fixtures__/forare_maskin_jamfor_2026-10-14.json";

type Fel = { code?: string; message: string } | null;
const g = globalThis as unknown as { __tabeller: Record<string, unknown[]>; __fel: Record<string, Fel> };

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (tabell: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "range", "eq"]) q[m] = () => q;
      q.then = (res: (v: unknown) => unknown) =>
        Promise.resolve(g.__fel[tabell] ? { data: null, error: g.__fel[tabell] } : { data: g.__tabeller[tabell] ?? [], error: null }).then(res);
      return q;
    },
  },
}));

import JamforClient from "./JamforClient";

const KURVOR = [
  { atgard: "gallring", variant: "g15-viktad", a: 3.75895561541139, b: 0.736407612446492, n: 679 },
  { atgard: "slutavverkning", variant: "g15-viktad", a: 4.01736406793956, b: 0.77799640669071, n: 896 },
];
const maskinAr = (maskin: string, atgard: string, ar: number | null, antal: number) => ({
  maskin, typ: "skördare", atgard, ar, urval: "namn", antal_objekt: antal, antal_med_g15: antal, antal_med_index: antal, g15_h: 100, viktat_index: 100,
});
const MASKIN_AR = [maskinAr("Rottne H8B", "gallring", 2020, 679), maskinAr("Rottne H8B", "slutavverkning", 2021, 896)].flatMap((r) => [r, { ...r, urval: "alla" }]);

let root: Root | null = null;
let cont: HTMLDivElement;
async function monter(hash = "") {
  window.location.hash = hash;
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cont = document.createElement("div"); document.body.appendChild(cont);
  root = createRoot(cont);
  await act(async () => { root!.render(<JamforClient />); });
  await vantaa();
}
const vantaa = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });
const vanlig = (t: string | null | undefined) => (t || "").replace(/ /g, " ");
const sida = () => vanlig(cont.textContent);
const knappar = () => Array.from(cont.querySelectorAll<HTMLButtonElement>("button"));
const knapp = (text: RegExp) => knappar().find((b) => text.test(vanlig(b.textContent)))!;
async function klick(el: Element) { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await vantaa(); }
const kolumnTexter = () => Array.from(cont.querySelectorAll("thead th[scope=col]")).filter((th) => th.textContent).map((th) => vanlig(th.textContent));
const rad = (etikett: string) => {
  const th = Array.from(cont.querySelectorAll("tbody th[scope=row]")).find((t) => vanlig(t.textContent).startsWith(etikett))!;
  return Array.from(th.parentElement!.querySelectorAll("td")).map((td) => vanlig(td.textContent));
};

beforeEach(() => {
  g.__tabeller = { vy_hist_maskin_ar: MASKIN_AR, vy_hist_forare_maskin_jamfor: fixtur as unknown[], vy_hist_normkurva: KURVOR };
  g.__fel = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => { await act(async () => { root?.unmount(); }); cont?.remove(); document.body.innerHTML = ""; root = null; vi.restoreAllMocks(); });

describe("segmentväljaren", () => {
  it("överst: 'Maskiner' | 'Samma förare'; Maskiner är förvald och den vanliga jämförelsen oförändrad", async () => {
    await monter("");
    expect(knapp(/^Maskiner$/).getAttribute("aria-pressed")).toBe("true");
    expect(knapp(/^Samma förare$/).getAttribute("aria-pressed")).toBe("false");
    expect(sida()).toContain("Vad ska jämföras");
    expect(sida()).not.toContain("Välj förare");
  });
  it("ett tryck på 'Samma förare' byter, och tillståndet står i adressen", async () => {
    await monter("");
    await klick(knapp(/^Samma förare$/));
    expect(sida()).toContain("Välj förare");
    expect(sida()).not.toContain("Vad ska jämföras");
    expect(window.location.hash).toContain("l=forare");
  });
});

describe("välj förare", () => {
  it("bara de som går att jämföra: Martin, Oskar och Stefan. Inga tomma val, inga andra förare", async () => {
    await monter("#l=forare");
    const namn = knappar().map((b) => vanlig(b.textContent)).filter((t) => /Lindqvist|Nilsson|Karlsson|Ringberg|Olsson|Johansson/.test(t));
    expect(namn).toHaveLength(3);
    expect(namn[0]).toMatch(/^Martin Lindqvist/);
    expect(namn[1]).toMatch(/^Oskar Nilsson/);
    expect(namn[2]).toMatch(/^Stefan Karlsson/);
    for (const bort of ["Joacim Ringberg", "Christoffer Olsson", "Tobbe Johansson"]) expect(sida(), bort).not.toContain(bort);
  });
  it("första föraren och hennes åtgärd är förvalda (aldrig tomt), och åtgärden visas som text när det bara finns en", async () => {
    await monter("#l=forare");
    expect(knapp(/^Martin Lindqvist/).getAttribute("aria-pressed")).toBe("true");
    expect(sida()).toContain("Martin Lindqvist · Gallring");
    expect(sida()).toContain("Åtgärd: Gallring");
  });
  it("byter förare och åtgärd: Stefan har bara slutavverkning, även om adressen ber om gallring", async () => {
    await monter("#l=forare&g=gallring");
    await klick(knapp(/^Stefan Karlsson/));
    expect(sida()).toContain("Stefan Karlsson · Slutavverkning");
    expect(window.location.hash).toContain("f=Stefan");
  });
  it("en förare från adressen som inte kan jämföras faller tillbaka på första (ingen tom vy)", async () => {
    await monter("#l=forare&f=Joacim%20Ringberg");
    expect(sida()).toContain("Martin Lindqvist · Gallring");
  });
});

describe("tabellen", () => {
  it("Martin gallring: fem kolumner, äldst till vänster, åren överst i varje kolumn", async () => {
    await monter("#l=forare&f=Martin%20Lindqvist&g=gallring");
    expect(kolumnTexter()).toEqual([
      "2017Komatsu 941", "2018–2021Komatsu 901XC", "2020–2022Rottne H8B", "2022–2023Rottne H8D", "2025Rottne H8E Logmax",
    ]);
  });
  it("under 200 timmar: 'För lite data' på index, TU och m³/G15, och bäst bara på H8D (112) bland de med data", async () => {
    await monter("#l=forare&f=Martin%20Lindqvist&g=gallring");
    expect(rad("Index")).toEqual(["För lite data", "För lite data", "98", "113bäst", "För lite data"]);
    expect(rad("m³/G15")).toEqual(["För lite data", "För lite data", "6,0", "6,5", "För lite data"]);
    expect(rad("G15 (h)")).toEqual(["7under 200 h", "132under 200 h", "1 468", "324", "78under 200 h"]);
    expect(rad("Antal objekt")).toEqual(["1", "4", "49", "13", "1"]);
  });
  it("TU med källa i grått under värdet: Stefan har tre Ponsse-maskiner (bäst: Giant 2025) och en ur avbrott (ensam i sin källa, ingen bäst)", async () => {
    await monter("#l=forare&f=Stefan%20Karlsson&g=slutavverkning");
    expect(kolumnTexter()).toEqual(["2018–2021Komatsu 901XC", "2023Scorpion King ny", "2023–2025Scorpion Giant 2023", "2025–2026Scorpion Giant 2025"]);
    expect(rad("TU")).toEqual(["85,0 %ur avbrott", "92,8 %enligt Ponsse", "92,5 %enligt Ponsse", "93,0 %enligt Ponssebäst"]);
    expect(rad("Index")).toEqual(["91", "100", "106", "106bäst"]);
  });
  it("ⓘ vid Index öppnar förklaringen för åtgärden man står i", async () => {
    await monter("#l=forare&f=Stefan%20Karlsson&g=slutavverkning");
    const info = cont.querySelector<HTMLButtonElement>('tbody button[aria-label="Vad är index?"]');
    expect(info).not.toBeNull();
    await klick(info!);
    const blad = vanlig(document.body.querySelector("[data-sheet-grepp]")?.parentElement?.textContent);
    expect(blad).toContain("Vad är index?");
    expect(blad).toContain("Medelstam 0,40 m³. Normalt 27 m³/G15.");
    expect(blad).not.toContain("GallringMedelstam");
  });
});

describe("de grå raderna", () => {
  it("alltid: 'Samma förare på olika maskiner. Skillnaden beror mer på maskinen, men år och objekt skiljer sig fortfarande.'", async () => {
    await monter("#l=forare&f=Oskar%20Nilsson&g=gallring");
    expect(sida()).toContain("Samma förare på olika maskiner. Skillnaden beror mer på maskinen, men år och objekt skiljer sig fortfarande.");
  });
  it("överlappar åren (alla tre jämförbara kombinationer i dag): ingen 'Olika år'-rad", async () => {
    for (const h of ["#l=forare&f=Martin%20Lindqvist&g=gallring", "#l=forare&f=Oskar%20Nilsson&g=gallring", "#l=forare&f=Stefan%20Karlsson&g=slutavverkning"]) {
      await monter(h);
      expect(sida(), h).not.toContain("Olika år.");
      await act(async () => { root?.unmount(); }); cont.remove(); document.body.innerHTML = ""; root = null;
    }
  });
  it("överlappar de inte: 'Olika år. Förarens erfarenhet kan förklara en del av skillnaden.'", async () => {
    const r = (maskin: string, fran: number, till: number) => ({ forare: "Test Förare", atgard: "gallring", maskin, antal_maskiner: 2, ar_fran: fran, ar_till: till, antal_objekt: 20, g15_h: 500, viktat_index: 100, tu: 0.9, antal_med_tu: 20, tu_rapporterad: null, m3_per_g15: 5 });
    g.__tabeller.vy_hist_forare_maskin_jamfor = [r("Maskin sen", 2022, 2024), r("Maskin tidig", 2014, 2019)];
    await monter("#l=forare");
    expect(kolumnTexter()).toEqual(["2014–2019Maskin tidig", "2022–2024Maskin sen"]);
    expect(sida()).toContain("Olika år. Förarens erfarenhet kan förklara en del av skillnaden.");
  });
});

describe("när något går fel", () => {
  it("statement timeout: 'tog för lång tid', utan teknisk text", async () => {
    g.__fel.vy_hist_forare_maskin_jamfor = { code: "57014", message: "canceling statement due to statement timeout" };
    await monter("#l=forare");
    expect(sida()).toContain("Det tog för lång tid att hämta jämförelsen. Försök igen om en stund.");
    expect(sida()).not.toContain("canceling statement");
  });
  it("tomt svar utan fel (RLS: inte admin) → behörighetstexten", async () => {
    g.__tabeller.vy_hist_forare_maskin_jamfor = [];
    await monter("#l=forare");
    expect(sida()).toContain("Du saknar behörighet. Bara roll admin får läsa historiken.");
  });
  it("ingen förare går att jämföra → ett tomt tillstånd som säger varför, inte en tom skärm", async () => {
    g.__tabeller.vy_hist_forare_maskin_jamfor = (fixtur as { forare: string }[]).filter((r) => r.forare === "Joacim Ringberg");
    await monter("#l=forare");
    expect(sida()).toContain("Ingen förare har kört minst två skördare med minst 200 G15-timmar vardera i samma åtgärd.");
  });
});
