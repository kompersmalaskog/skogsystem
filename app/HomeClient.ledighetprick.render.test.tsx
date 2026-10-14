// @vitest-environment jsdom
/**
 * Hemskärmens prick på Ledighet: "kräver din handling", aldrig "0", aldrig en gissad siffra.
 * Montera HELA hemskärmen (HomeClient) med fejkad Supabase; RPC:n ledighet_prick styr märket.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  prick: (() => ({ data: null, error: null })) as () => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>,
  anrop: 0,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { email: "test@exempel.se" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { roll: "forare" } }) }) }) }),
    rpc: async (namn: string) => { if (namn === "ledighet_prick") { h.anrop++; return h.prick(); } return { data: null, error: null }; },
  },
}));
vi.mock("./datahalsa/useDatahalsa", () => ({ useDatahalsa: () => ({ besked: { niva: "gron", rubrik: "Allt lugnt" } }) }));
vi.mock("@/lib/egenkontroll", () => ({ hamtaVantande: async () => ({ antalVantande: 0 }) }));

import HomeClient from "./HomeClient";

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  h.anrop = 0;
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove();
  rot = null; behallare = null;
});

const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
async function visa() {
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<HomeClient />); });
  await flush();
}
const ledighetLank = () => document.querySelector('a[href="/ledighet"]') as HTMLAnchorElement;
const markenPaLedighet = () => ledighetLank().querySelectorAll('[role="status"]');
const prick = (att: number, nya: number, ids: string[] = [], till: string | null = null) =>
  () => ({ data: { att_godkanna: att, nya_beslut: nya, nya_beslut_ids: ids, nya_beslut_till: till }, error: null });

describe("Hemskärmen — prick på Ledighet", () => {
  it("godkännare: väntande + egna nya beslut är EN siffra, med text för skärmläsare", async () => {
    h.prick = prick(2, 1, ["x"], "2026-10-14T08:00:00Z");
    await visa();
    const m = markenPaLedighet();
    expect(m).toHaveLength(1);
    expect(m[0].textContent).toBe("3");
    expect(m[0].getAttribute("aria-label")).toBe("3 att göra i ledighet");
  });

  it("anställd med ett nytt beslut: 1", async () => {
    h.prick = prick(0, 1, ["x"], "2026-10-14T08:00:00Z");
    await visa();
    expect(markenPaLedighet()[0].textContent).toBe("1");
  });

  it("inget att göra → INGET märke (aldrig '0')", async () => {
    h.prick = prick(0, 0);
    await visa();
    expect(markenPaLedighet()).toHaveLength(0);
    expect(ledighetLank().textContent).not.toMatch(/\d/); // ikonens ligaturtext + etiketten, ingen siffra
  });

  it("RPC-fel (t.ex. migrationen inte körd) → inget märke, inte '0'", async () => {
    h.prick = () => ({ data: null, error: { message: "function public.ledighet_prick() does not exist" } });
    await visa();
    expect(markenPaLedighet()).toHaveLength(0);
  });

  it("trasigt svar → inget märke", async () => {
    h.prick = () => ({ data: { att_godkanna: "många" }, error: null });
    await visa();
    expect(markenPaLedighet()).toHaveLength(0);
  });

  it("kastat fel (nätverket föll) → inget märke, hemskärmen renderas ändå", async () => {
    h.prick = () => { throw new Error("nät"); };
    await visa();
    expect(markenPaLedighet()).toHaveLength(0);
    expect(document.body.textContent).toContain("Datahälsa");
  });

  it("märket sitter bara på Ledighet — inte på någon annan ikon", async () => {
    h.prick = prick(1, 0);
    await visa();
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(ledighetLank().contains(document.querySelector('[role="status"]'))).toBe(true);
  });

  it("kommer man tillbaka till appen (t.ex. från en push) läses märket om — det blir inte kvar gammalt", async () => {
    h.prick = prick(0, 0);
    await visa();
    expect(markenPaLedighet()).toHaveLength(0);
    h.prick = prick(1, 0);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await flush();
    expect(markenPaLedighet()[0].textContent).toBe("1");
    expect(h.anrop).toBe(2);
  });
});
