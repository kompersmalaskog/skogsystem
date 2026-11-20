// @vitest-environment jsdom
/**
 * Mig-vyn och "sett": ett nytt beslut visas överst ("Nytt besked") och KVITTERAS först när det lästs och visats.
 *
 * Före: en NEKAD ansökan hamnar i den hopfällda Historiken — pricken hade försvunnit utan att beslutet setts.
 * Kvitteringen ska aldrig ske under läsfel, när serverns lista inte kunde läsas, eller innan beslutet visas.
 * Supabase är en kedjebar fake; RPC:erna (ledighet_prick / ledighet_markera_sett) loggas i anropsordning.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Svar = { data?: unknown; error?: unknown };
const h = vi.hoisted(() => ({
  tabeller: {} as Record<string, { data?: unknown; error?: unknown }>,
  rpc: {} as Record<string, () => { data: unknown; error: unknown }>,
  anrop: [] as [string, unknown][],
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
        if (prop === "single" || prop === "maybeSingle") return () => p;
        return () => p;
      },
      apply() { return p; },
    });
    return p;
  };
  return {
    supabase: {
      from: (t: string) => kedja(t),
      rpc: async (namn: string, args?: unknown) => {
        h.anrop.push([namn, args]);
        const f = h.rpc[namn];
        return f ? f() : { data: null, error: { message: "ingen fake" } };
      },
    },
  };
});

import type { CurrentMedarbetare } from "@/lib/CurrentMedarbetareContext";
import MigVy from "./_components/MigVy";

const FORARE: CurrentMedarbetare = { id: "m-1", namn: "Test Förare", roll: "forare", maskin_id: null, partner_user_id: null };
const ADMIN: CurrentMedarbetare = { ...FORARE, id: "m-admin", namn: "Test Admin", roll: "admin" };
const SALDO = { semester_dagar_kvar: 12.5, atk_timmar_kvar: 24, kalla: "manuell", uppdaterad_at: "2026-10-01T07:00:00Z" };
const ANSOKAN = (id: string, mid: string, status: string, start = "2099-11-02", slut = "2099-11-06") => ({
  id, medarbetare_id: mid, anvandare_id: "Någon Person", typ: "semester", startdatum: start, slutdatum: slut,
  status, kommentar: null, skapad_at: "2026-09-20T08:00:00Z", ersatter_datum: null, fran_tid: null, till_tid: null,
});
const TILL = "2026-10-14T08:00:00Z";
const nyaBeslut = (ids: string[]) => () => ({ data: { att_godkanna: 0, nya_beslut: ids.length, nya_beslut_ids: ids, nya_beslut_till: ids.length ? TILL : null }, error: null });

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let konsol: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  konsol = vi.spyOn(console, "error").mockImplementation(() => {});
  h.anrop = [];
  h.rpc = { ledighet_markera_sett: () => ({ data: null, error: null }) };
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove();
  rot = null; behallare = null;
  window.history.replaceState({}, "", "/");
  konsol.mockRestore();
});

const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => document.body.textContent ?? "";
const rpcNamn = () => h.anrop.map(a => a[0]);
async function visa(tabeller: Record<string, Svar>, medarbetare = FORARE) {
  h.tabeller = tabeller;
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<MigVy medarbetare={medarbetare} />); });
  await flush();
}
const friska = (ansokningar: unknown[]) => ({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { data: ansokningar } });

describe("Mig — Nytt besked och 'sett'", () => {
  it("nytt NEKAT och GODKÄNT beslut visas överst, inte också i Kommande/Historik, och kvitteras EFTER läsningen t.o.m. senaste beslutet", async () => {
    h.rpc.ledighet_prick = nyaBeslut(["n1", "g1"]);
    await visa(friska([ANSOKAN("n1", "m-1", "nekad"), ANSOKAN("g1", "m-1", "godkänd", "2099-12-01", "2099-12-03")]));
    expect(text()).toContain("Nytt besked");
    expect(text()).toContain("Nekad");
    expect(text()).toContain("Godkänd");
    // bara dessa två → varken Historik eller Kommande har något kvar att visa
    expect(text()).not.toContain("Historik");
    expect(text()).not.toContain("Kommande ledighet");
    expect(rpcNamn()).toEqual(["ledighet_prick", "ledighet_markera_sett"]);
    expect(h.anrop[1][1]).toEqual({ p_till: TILL });
  });

  it("'Nytt besked' står ovanför de vanliga grupperna, och övriga ansökningar ligger kvar där de hör hemma", async () => {
    h.rpc.ledighet_prick = nyaBeslut(["n1"]);
    await visa(friska([ANSOKAN("n1", "m-1", "nekad"), ANSOKAN("v1", "m-1", "väntar", "2099-12-10", "2099-12-12"), ANSOKAN("g0", "m-1", "godkänd", "2099-12-20", "2099-12-22")]));
    const t = text();
    expect(t.indexOf("Nytt besked")).toBeGreaterThan(-1);
    expect(t.indexOf("Nytt besked")).toBeLessThan(t.indexOf("Väntar på besked"));
    expect(t.indexOf("Väntar på besked")).toBeLessThan(t.indexOf("Kommande ledighet"));
    expect(t).not.toContain("Historik");
  });

  it("inget nytt → ingen grupp och ingen kvittering (inget skrivs i onödan); nekad ligger i Historik som förut", async () => {
    h.rpc.ledighet_prick = nyaBeslut([]);
    await visa(friska([ANSOKAN("n1", "m-1", "nekad")]));
    expect(text()).not.toContain("Nytt besked");
    expect(text()).toContain("Historik (1)");
    expect(rpcNamn()).toEqual(["ledighet_prick"]);
  });

  it("ansökningarna kunde inte läsas → ingenting läses om pricken och INGET kvitteras (beslutet har inte visats)", async () => {
    h.rpc.ledighet_prick = nyaBeslut(["n1"]);
    await visa({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { error: { message: "fel" } } });
    expect(text()).not.toContain("Nytt besked");
    expect(rpcNamn()).toEqual([]);
  });

  it("serverns lista kunde inte läsas → ingen grupp, INGEN kvittering, vyn fungerar som förut", async () => {
    h.rpc.ledighet_prick = () => ({ data: null, error: { message: "function does not exist" } });
    await visa(friska([ANSOKAN("n1", "m-1", "nekad")]));
    expect(text()).not.toContain("Nytt besked");
    expect(text()).toContain("Historik (1)");
    expect(rpcNamn()).toEqual(["ledighet_prick"]);
  });

  it("kvitteringen misslyckas → beslutet visas ändå (pricken ligger då kvar, och vyn kraschar inte)", async () => {
    h.rpc.ledighet_prick = nyaBeslut(["n1"]);
    h.rpc.ledighet_markera_sett = () => ({ data: null, error: { message: "nekad av RLS" } });
    await visa(friska([ANSOKAN("n1", "m-1", "nekad")]));
    expect(text()).toContain("Nytt besked");
    expect(text()).toContain("Nekad");
    expect(rpcNamn()).toEqual(["ledighet_prick", "ledighet_markera_sett"]);
  });
});

describe("Mig som godkännare — notisen öppnar listan", () => {
  const medVantande = friska([ANSOKAN("b1", "m-2", "väntar")]);

  it("?godkann=1 (ur push-notisen) → 'att godkänna' är uppfälld", async () => {
    window.history.replaceState({}, "", "/ledighet?godkann=1");
    h.rpc.ledighet_prick = nyaBeslut([]);
    await visa(medVantande, ADMIN);
    const knapp = Array.from(document.querySelectorAll("button")).find(b => /att godkänna/.test(b.textContent ?? ""))!;
    expect(knapp.getAttribute("aria-expanded")).toBe("true");
    expect(text()).toContain("Godkänn");
  });

  it("utan parametern är listan hopfälld som förut", async () => {
    h.rpc.ledighet_prick = nyaBeslut([]);
    await visa(medVantande, ADMIN);
    const knapp = Array.from(document.querySelectorAll("button")).find(b => /att godkänna/.test(b.textContent ?? ""))!;
    expect(knapp.getAttribute("aria-expanded")).toBe("false");
  });

  it("?godkann=1 under läsfel visar fortfarande ingen godkänn-lista (data vi inte kunde läsa)", async () => {
    window.history.replaceState({}, "", "/ledighet?godkann=1");
    await visa({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { error: { message: "fel" } } }, ADMIN);
    expect(text()).not.toContain("att godkänna");
  });
});
