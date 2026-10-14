// @vitest-environment jsdom
/**
 * Sidans del av "tryck på notis → rätt vy": byter sida själv när service workern säger det (postMessage) eller har lagrat
 * ett färskt mål (Cache API) — vid start och när appen blir synlig igen. Förr (iOS) hände ingenting.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PushNavigering from "./PushNavigering";
import { PUSH_MAL_NYCKEL, PUSH_NAVIGERA, PUSH_MAL_MAX_ALDER_MS } from "@/lib/pushKlick";

const lager = new Map<string, string>();
let sw: EventTarget;
let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
const navigera = vi.fn();

const lagra = (url: string, t = Date.now()) => lager.set(PUSH_MAL_NYCKEL, JSON.stringify({ url, t }));
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const visa = async () => { rot = createRoot(behallare!); await act(async () => { rot!.render(<PushNavigering navigera={navigera} />); }); await flush(); };
const synlig = async () => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); }); await flush();
};
const meddelande = async (data: unknown) => { await act(async () => { sw.dispatchEvent(new MessageEvent("message", { data })); }); await flush(); };

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  lager.clear(); navigera.mockClear();
  window.history.replaceState({}, "", "/oversikt");
  sw = new EventTarget();
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: sw });
  (globalThis as any).caches = {
    open: async () => ({
      match: async (k: string) => (lager.has(k) ? new Response(lager.get(k)!) : undefined),
      delete: async (k: string) => lager.delete(k),
    }),
  };
  behallare = document.createElement("div"); document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove(); rot = null; behallare = null;
  delete (globalThis as any).caches;
});

describe("PushNavigering — lagrat mål (appen startades av trycket, eller openWindow landade fel)", () => {
  it("färskt mål vid start → navigerar dit, och målet raderas (EN gång)", async () => {
    lagra(`${window.location.origin}/ledighet?godkann=1`);
    await visa();
    expect(navigera).toHaveBeenCalledTimes(1);
    expect(navigera).toHaveBeenCalledWith("/ledighet?godkann=1");
    expect(lager.has(PUSH_MAL_NYCKEL)).toBe(false);
  });

  it("appen blir synlig igen (bakgrund → förgrund) med ett färskt mål → navigerar", async () => {
    await visa();
    expect(navigera).not.toHaveBeenCalled();
    lagra(`${window.location.origin}/ledighet`);
    await synlig();
    expect(navigera).toHaveBeenCalledWith("/ledighet");
  });

  it("gammalt mål → ingen navigering, men det raderas ändå (ska aldrig sitta kvar till nästa start)", async () => {
    lagra(`${window.location.origin}/ledighet`, Date.now() - PUSH_MAL_MAX_ALDER_MS - 5000);
    await visa();
    expect(navigera).not.toHaveBeenCalled();
    expect(lager.has(PUSH_MAL_NYCKEL)).toBe(false);
  });

  it("sidan står redan på målet → ingen omladdning; målet raderas", async () => {
    window.history.replaceState({}, "", "/ledighet?godkann=1");
    lagra(`${window.location.origin}/ledighet?godkann=1`);
    await visa();
    expect(navigera).not.toHaveBeenCalled();
    expect(lager.has(PUSH_MAL_NYCKEL)).toBe(false);
  });

  it("mål på annan origin navigerar aldrig", async () => {
    lagra("https://ond.exempel.se/ledighet");
    await visa();
    expect(navigera).not.toHaveBeenCalled();
  });

  it("inget lagrat mål → inget händer", async () => {
    await visa(); await synlig();
    expect(navigera).not.toHaveBeenCalled();
  });

  it("Cache API saknas → ingen krasch", async () => {
    delete (globalThis as any).caches;
    await visa();
    expect(navigera).not.toHaveBeenCalled();
  });

  it("trasigt lagrat värde → ingen krasch, inget navigeras, raderas", async () => {
    lager.set(PUSH_MAL_NYCKEL, "inte json");
    await visa();
    expect(navigera).not.toHaveBeenCalled();
  });
});

describe("PushNavigering — meddelande från service workern (appen är igång)", () => {
  it("push-navigera med ett mål → navigerar (godkännar-notisen öppnar listan)", async () => {
    await visa();
    await meddelande({ typ: PUSH_NAVIGERA, url: `${window.location.origin}/ledighet?godkann=1` });
    expect(navigera).toHaveBeenCalledWith("/ledighet?godkann=1");
  });

  it("andra meddelanden ignoreras", async () => {
    await visa();
    await meddelande({ typ: "annat", url: "/ledighet" });
    await meddelande({ typ: PUSH_NAVIGERA });
    await meddelande(null);
    expect(navigera).not.toHaveBeenCalled();
  });

  it("efter avmontering lyssnar komponenten inte längre", async () => {
    await visa();
    act(() => { rot!.unmount(); }); rot = null;
    await meddelande({ typ: PUSH_NAVIGERA, url: `${window.location.origin}/ledighet` });
    expect(navigera).not.toHaveBeenCalled();
  });
});
