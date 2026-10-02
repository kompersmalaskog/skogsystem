// @vitest-environment jsdom
/**
 * RENDERINGSKONTROLL: monterar hela Arbetsrapport och låter den gå igenom
 * samma tillståndsövergångar som i webbläsaren (ingen medarbetare → inläst).
 *
 * Varför: 2026-10-02 kraschade hela arbetsrapporten (React #310, "hooks i olika
 * ordning") eftersom en useEffect lagts EFTER `if(!medarbetare) return`. tsc,
 * design-lint och alla tester var gröna — hook-ordning fångas bara av en
 * rendering. Den här testen är den renderingen. Kör den för varje ändring som
 * lägger till hooks eller nya lägen i Arbetsrapport.
 *
 * Supabase är en kedjebar fake (ingen nätverkstrafik, ingen inloggning):
 * första renderingen har medarbetare = null, sedan läses en förare in. Alla
 * andra tabeller svarar tomt.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const FORARE = { id: "m-1", namn: "Test Förare", epost: "test@example.com", roll: "forare", maskin_id: "PONS20SDJAA270231", user_id: "u-1", hemadress: "" };

vi.mock("@/lib/supabase", () => {
  const kedja = (tabell: string) => {
    let enkel = false;
    const svar = () => {
      const rad = tabell === "medarbetare" ? FORARE : null;
      return { data: enkel ? rad : rad ? [rad] : [], error: null, count: 0 };
    };
    const p: any = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === "then") return (res: any, rej: any) => Promise.resolve(svar()).then(res, rej);
        if (prop === "single" || prop === "maybeSingle") return () => { enkel = true; return p; };
        return () => p;
      },
      apply() { return p; },
    });
    return p;
  };
  return {
    supabase: {
      from: (t: string) => kedja(t),
      auth: {
        getUser: async () => ({ data: { user: { id: "u-1", email: FORARE.epost } } }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      rpc: () => kedja("rpc"),
      channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
      removeChannel: () => {},
    },
  };
});

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let konsolFel: string[] = [];

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  konsolFel = [];
  vi.spyOn(console, "error").mockImplementation((...a: any[]) => { konsolFel.push(a.map(String).join(" ")); });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" })));
  window.history.replaceState({}, "", "/arbetsrapport");
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove(); rot = null; behallare = null;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function montera(url = "/arbetsrapport") {
  window.history.replaceState({}, "", url);
  const { default: Arbetsrapport } = await import("./Arbetsrapport");
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<Arbetsrapport />); });
  // Låt inläsningen (medarbetare null → inläst) och efterföljande effekter landa.
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
}

const hookFel = () => konsolFel.filter(m => /Rendered (more|fewer) hooks|change in the order of Hooks|Minified React error #310|#310/i.test(m));

describe("Arbetsrapport renderas utan hook-fel", () => {
  it("morgonvyn: ingen medarbetare → inläst förare, utan krasch", async () => {
    await montera("/arbetsrapport");
    expect(hookFel()).toEqual([]);
    expect(behallare!.textContent).not.toMatch(/Något gick fel/);
    expect(behallare!.textContent!.length).toBeGreaterThan(20);
  });
});
