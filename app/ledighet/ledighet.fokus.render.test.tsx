// @vitest-environment jsdom
/**
 * Tryck på en push-notis → vyn landar PÅ ansökan: överst, scrollad till och markerad en stund (som sedan tonar ut).
 *
 * OBS: ett NYTT beslut (godkänd/nekad som personen inte sett) tar beskedsvyn hand om (ledighet.besked.render.test.tsx).
 * Markeringen här gäller det som blir kvar: ett REDAN SETT besked, och beslut som inte längre gäller.
 *
 * Före: beslutsnotisen öppnade bara /ledighet. "Nytt besked" låg UNDER godkänn-raden, saldot och Ansök-knappen
 * (under vikningen på en telefon), och ett redan sett besked låg gömt i Kommande eller den hopfällda Historiken.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Svar = { data?: unknown; error?: unknown };
const h = vi.hoisted(() => ({
  tabeller: {} as Record<string, { data?: unknown; error?: unknown }>,
  rpc: {} as Record<string, () => { data: unknown; error: unknown }>,
}));

vi.mock("@/lib/supabase", () => {
  const kedja = (tabell: string) => {
    const p: any = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === "then") {
          return (res: any, rej: any) => {
            const s: Svar = h.tabeller[tabell] ?? { data: null };
            return Promise.resolve({ data: s.error ? null : (s.data ?? []), error: s.error ?? null }).then(res, rej);
          };
        }
        return () => p;
      },
      apply() { return p; },
    });
    return p;
  };
  return {
    supabase: {
      from: (t: string) => kedja(t),
      rpc: async (namn: string) => { const f = h.rpc[namn]; return f ? f() : { data: null, error: { message: "ingen fake" } }; },
    },
  };
});

import type { CurrentMedarbetare } from "@/lib/CurrentMedarbetareContext";
import MigVy from "./_components/MigVy";
import { MARKERING_MS } from "./_components/fokus";

const FORARE: CurrentMedarbetare = { id: "m-1", namn: "Test Förare", roll: "forare", maskin_id: null, partner_user_id: null };
const ADMIN: CurrentMedarbetare = { ...FORARE, id: "m-admin", namn: "Test Admin", roll: "admin" };
const SALDO = { semester_dagar_kvar: 12.5, atk_timmar_kvar: 24, kalla: "manuell", uppdaterad_at: "2026-10-01T07:00:00Z" };
const ANSOKAN = (id: string, mid: string, status: string, start = "2099-11-02", slut = "2099-11-06") => ({
  id, medarbetare_id: mid, anvandare_id: "Någon Person", typ: "semester", startdatum: start, slutdatum: slut,
  status, kommentar: null, skapad_at: "2026-09-20T08:00:00Z", ersatter_datum: null, fran_tid: null, till_tid: null,
});
const TILL = "2026-10-14T08:00:00Z";
const nya = (ids: string[]) => () => ({ data: { att_godkanna: 0, nya_beslut: ids.length, nya_beslut_ids: ids, nya_beslut_till: ids.length ? TILL : null }, error: null });
const friska = (rader: unknown[]) => ({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { data: rader } });

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let konsol: ReturnType<typeof vi.spyOn>;
let scrollat: { id: string; arg: any }[] = [];
let stillRorelse = false;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  konsol = vi.spyOn(console, "error").mockImplementation(() => {});
  h.rpc = { ledighet_markera_sett: () => ({ data: null, error: null }) };
  scrollat = [];
  (HTMLElement.prototype as any).scrollIntoView = function (this: Element, arg: any) { scrollat.push({ id: this.id, arg }); };
  stillRorelse = false;
  (window as any).matchMedia = (q: string) => ({ matches: stillRorelse && q.includes("reduce"), addEventListener() {}, removeEventListener() {} });
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove(); rot = null; behallare = null;
  window.history.replaceState({}, "", "/");
  delete (HTMLElement.prototype as any).scrollIntoView;
  vi.useRealTimers();
  konsol.mockRestore();
});

const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => document.body.textContent ?? "";
async function visa(url: string, tabeller: Record<string, Svar>, medarbetare = FORARE) {
  window.history.replaceState({}, "", url);
  h.tabeller = tabeller;
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<MigVy medarbetare={medarbetare} />); });
  await flush();
}
const rad = (domId: string) => document.getElementById(domId);
const markerad = (domId: string) => rad(domId)?.getAttribute("data-markerad") === "true";
const tonaUt = async () => { await act(async () => { vi.advanceTimersByTime(MARKERING_MS + 50); }); await flush(); };
const raderIOrdning = () => Array.from(document.querySelectorAll('[id^="ansokan-"]')).map(e => e.id);

describe("Beslutsnotisen — ?besked=<id>", () => {
  it("redan sett besked: överst under 'Besked', scrollad till, markerad — och markeringen tonar ut", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    expect(text()).toContain("Besked");
    expect(text()).not.toContain("Nytt besked");
    expect(rad("ansokan-g1")).not.toBeNull();
    expect(scrollat).toEqual([{ id: "ansokan-g1", arg: { block: "center", behavior: "smooth" } }]);
    expect(markerad("ansokan-g1")).toBe(true);
    await tonaUt();
    expect(markerad("ansokan-g1")).toBe(false);
    expect(rad("ansokan-g1")).not.toBeNull(); // raden står kvar — bara markeringen försvinner
  });

  it("gruppen står ÖVERST: före saldot och Ansök-knappen (inte under vikningen)", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    expect(text().indexOf("Besked")).toBeGreaterThan(-1);
    expect(text().indexOf("Besked")).toBeLessThan(text().indexOf("Semester kvar"));
    expect(text().indexOf("Besked")).toBeLessThan(text().indexOf("Ansök om ledighet"));
  });

  it("ett redan SETT besked (ligger annars gömt i Historik) lyfts upp under rubriken 'Besked' — inte 'Nytt besked'", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?besked=n1", friska([ANSOKAN("n1", "m-1", "nekad")]));
    expect(text()).toContain("Besked");
    expect(text()).not.toContain("Nytt besked");
    expect(text()).not.toContain("Historik"); // raden står bara överst, inte också i den hopfällda Historiken
    expect(text()).toContain("Nekad");
    expect(scrollat.map(s => s.id)).toEqual(["ansokan-n1"]);
    expect(markerad("ansokan-n1")).toBe(true);
  });

  it("målet (redan sett) står FÖRST i gruppen, före ett annat nytt beslut", async () => {
    h.rpc.ledighet_prick = nya(["n2"]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("n2", "m-1", "nekad", "2099-12-01", "2099-12-02"), ANSOKAN("g1", "m-1", "godkänd")]));
    expect(raderIOrdning()).toEqual(["ansokan-g1", "ansokan-n2"]);
    expect(text()).toContain("Besked");
    expect(text()).not.toContain("Nytt besked"); // g1 är inte nytt → gruppen heter inte "Nytt besked"
    expect(markerad("ansokan-g1")).toBe(true);
    expect(markerad("ansokan-n2")).toBe(false); // bara EN rad markeras
  });

  it("ansökan finns inte kvar (borttagen) → säger det, scrollar inte, och resten av vyn är som vanligt", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?besked=borta", friska([ANSOKAN("v1", "m-1", "väntar")]));
    expect(text()).toContain("Den ansökan finns inte längre.");
    expect(scrollat).toEqual([]);
    expect(document.querySelector("[data-markerad]")).toBeNull();
    expect(text()).toContain("Väntar på besked");
  });

  it("någon ANNANS ansökan visas aldrig: samma besked som för en som inte finns", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?besked=x1", friska([ANSOKAN("x1", "m-2", "godkänd")]));
    expect(text()).toContain("Den ansökan finns inte längre.");
    expect(rad("ansokan-x1")).toBeNull();
    expect(scrollat).toEqual([]);
  });

  it("läsfel → ingen notering och ingen scroll (data vi inte kunde läsa)", async () => {
    await visa("/ledighet?besked=g1", { medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { error: { message: "fel" } } });
    expect(text()).not.toContain("finns inte längre");
    expect(scrollat).toEqual([]);
    expect(text()).toContain("Kunde inte läsa dina ansökningar");
  });

  it("ingen länkparameter → ingen markering, ingen scroll, ingen notering (vyn som förut)", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    expect(scrollat).toEqual([]);
    expect(document.querySelector("[data-markerad='true']")).toBeNull();
    expect(text()).not.toContain("finns inte längre");
  });

  it("'minska rörelser' i systemet → scrollar utan animation", async () => {
    stillRorelse = true;
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    expect(scrollat).toEqual([{ id: "ansokan-g1", arg: { block: "center", behavior: "auto" } }]);
  });

  it("ett ogiltigt id (inte ett uuid-tecken) ignoreras helt", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?besked=%3Cb%3E", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    expect(scrollat).toEqual([]);
    expect(text()).not.toContain("finns inte längre");
  });
});

describe("Ansökningsnotisen till en godkännare — ?godkann=<id>", () => {
  const medVantande = friska([ANSOKAN("b1", "m-2", "väntar"), ANSOKAN("b2", "m-3", "väntar", "2099-12-01", "2099-12-03")]);

  it("listan uppfälld, RADEN markerad och scrollad till — och markeringen tonar ut", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?godkann=b2", medVantande, ADMIN);
    const knapp = Array.from(document.querySelectorAll("button")).find(b => /att godkänna/.test(b.textContent ?? ""))!;
    expect(knapp.getAttribute("aria-expanded")).toBe("true");
    expect(scrollat).toEqual([{ id: "godkann-b2", arg: { block: "center", behavior: "smooth" } }]);
    expect(markerad("godkann-b2")).toBe(true);
    expect(markerad("godkann-b1")).toBe(false);
    await tonaUt();
    expect(markerad("godkann-b2")).toBe(false);
  });

  it("?godkann=1 (äldre notiser) → listan uppfälld, ingen rad markerad, ingen scroll", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?godkann=1", medVantande, ADMIN);
    const knapp = Array.from(document.querySelectorAll("button")).find(b => /att godkänna/.test(b.textContent ?? ""))!;
    expect(knapp.getAttribute("aria-expanded")).toBe("true");
    expect(scrollat).toEqual([]);
    expect(document.querySelector("[data-markerad='true']")).toBeNull();
  });

  it("ansökan redan hanterad av någon annan → listan öppen och SÄGER det, ingen markering", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?godkann=klar", medVantande, ADMIN);
    expect(text()).toContain("Den ansökan är redan hanterad.");
    expect(scrollat).toEqual([]);
    expect(document.querySelector("[data-markerad='true']")).toBeNull();
  });

  it("en FÖRARE som öppnar en godkänn-länk får ingen godkänn-lista och ingen markering (rollen styr, inte länken)", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?godkann=b2", medVantande, FORARE);
    expect(text()).not.toContain("att godkänna");
    expect(scrollat).toEqual([]);
    expect(text()).not.toContain("redan hanterad");
  });

  it("adminens egen väntande ansökan: markeringen hamnar bara i godkänn-listan, inte också i 'Väntar på besked'", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?godkann=a-egen", friska([ANSOKAN("a-egen", "m-admin", "väntar")]), ADMIN);
    expect(markerad("godkann-a-egen")).toBe(true);
    expect(document.querySelectorAll("[data-markerad='true']")).toHaveLength(1);
  });
});
