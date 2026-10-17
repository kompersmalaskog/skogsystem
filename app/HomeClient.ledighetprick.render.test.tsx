// @vitest-environment jsdom
/**
 * Hemskärmens prick på Ledighet: "kräver din handling", aldrig "0", aldrig en gissad siffra.
 * Montera HELA hemskärmen (HomeClient) med fejkad Supabase; RPC:n ledighet_prick styr märket.
 * Föraren har nya startsidan (2026-10-17): märket sitter på Ledighet-rutan i Dina vyer (förarens förinställda),
 * samma tal står i Behöver dig, och den ihopfällda gruppen Personal och tid bär summan.
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
    from: (tabell: string) => tabell === "startsida_favoriter"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ single: async () => ({ data: { roll: "forare" } }) }) }) },
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
const sektion = (namn: string) => document.querySelector(`section[aria-label="${namn}"]`);
// Ledighet-rutan bland favoriterna (Behöver dig har också en länk dit, men utan märke — talet står i texten).
const ledighetLank = () => sektion("Dina vyer")!.querySelector('a[href="/ledighet"]') as HTMLAnchorElement;
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
    expect(sektion("Behöver dig")!.textContent).toContain("3 att göra i ledighet");
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
    expect(sektion("Behöver dig")).toBeNull();
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
    expect(sektion("Dina vyer")).not.toBeNull();
  });

  it("märket sitter bara på Ledighet — och som summa på gruppen den står i — inte på någon annan ikon", async () => {
    h.prick = prick(1, 0);
    await visa();
    const alla = Array.from(document.querySelectorAll('[role="status"]'));
    const personal = Array.from(document.querySelectorAll("button[aria-expanded]")).find(b => b.textContent?.includes("Personal och tid"))!;
    expect(alla).toHaveLength(2);
    expect(alla.filter(m => ledighetLank().contains(m))).toHaveLength(1);
    expect(alla.filter(m => personal.contains(m))).toHaveLength(1);
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
