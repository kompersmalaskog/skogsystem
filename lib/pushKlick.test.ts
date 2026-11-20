/**
 * Tryck på en push-notis → rätt vy. Kör den RIKTIGA public/sw.js i en sandbox (fejkade clients/caches/händelser) och
 * bevisar varje väg, inklusive iOS-hemskärmsappen där WindowClient.navigate() kastar och openWindow(url) landar fel.
 * Löftet som workern ger till event.waitUntil får ALDRIG avvisas (då öppnas ingenting på iOS).
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";
import { PUSH_MAL_CACHE, PUSH_MAL_NYCKEL, PUSH_NAVIGERA, PUSH_MAL_MAX_ALDER_MS, valjNavigering } from "./pushKlick";

const SW = fs.readFileSync(path.resolve(__dirname, "../public/sw.js"), "utf8");
const ORIGIN = "https://app.exempel.se";

type Klient = { url: string; focus: any; navigate?: any; postMessage: any };
const klient = (url: string, over: Partial<Klient> = {}): Klient => ({
  url, focus: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined), postMessage: vi.fn(), ...over,
});

/** Laddar workern i en ny sandbox och returnerar hanterarna + mockarna. */
function ladda(opts: { fonster?: Klient[]; matchAllKastar?: boolean; openWindowAvvisar?: boolean; utanCaches?: boolean } = {}) {
  const lagrat = new Map<string, string>();
  const hanterare: Record<string, (e: any) => void> = {};
  const visa = vi.fn(async () => undefined);
  const clients = {
    matchAll: vi.fn(async () => { if (opts.matchAllKastar) throw new Error("matchAll"); return opts.fonster ?? []; }),
    openWindow: vi.fn(async () => { if (opts.openWindowAvvisar) throw new Error("openWindow"); return null; }),
  };
  const caches = opts.utanCaches ? undefined : {
    open: async () => ({ put: async (k: string, r: Response) => { lagrat.set(k, await r.text()); } }),
  };
  const self = {
    location: { origin: ORIGIN },
    registration: { showNotification: visa },
    addEventListener: (typ: string, fn: (e: any) => void) => { hanterare[typ] = fn; },
  };
  vm.runInNewContext(SW, { self, clients, caches, URL, Response, Date, JSON });
  return { hanterare, clients, lagrat, visa };
}

/** Skickar notificationclick och väntar in workerns löfte — som MÅSTE lösas (aldrig avvisas). */
async function klicka(w: ReturnType<typeof ladda>, data: unknown) {
  const stang = vi.fn();
  let lofte: Promise<unknown> | undefined;
  w.hanterare.notificationclick({ notification: { close: stang, data }, waitUntil: (p: Promise<unknown>) => { lofte = p; } });
  expect(lofte, "workern måste anropa event.waitUntil").toBeDefined();
  await expect(lofte).resolves.toBeUndefined();
  expect(stang).toHaveBeenCalled();
}

describe("sw.js notificationclick — ingen app öppen", () => {
  it("openWindow med en ABSOLUT url mot workerns egen origin (godkännar-notisen)", async () => {
    const w = ladda();
    await klicka(w, { url: "/ledighet?godkann=1" });
    expect(w.clients.openWindow).toHaveBeenCalledTimes(1);
    expect(w.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/ledighet?godkann=1`);
  });

  it("beslutsnotisen → /ledighet; saknad url → roten (aldrig undefined)", async () => {
    const a = ladda(); await klicka(a, { url: "/ledighet" });
    expect(a.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/ledighet`);
    const b = ladda(); await klicka(b, undefined);
    expect(b.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });

  it("lagrar målet (url + tid) i Cache API så SIDAN kan navigera själv", async () => {
    const w = ladda();
    const fore = Date.now();
    await klicka(w, { url: "/ledighet?godkann=1" });
    const lagrat = JSON.parse(w.lagrat.get(PUSH_MAL_NYCKEL)!);
    expect(lagrat.url).toBe(`${ORIGIN}/ledighet?godkann=1`);
    expect(lagrat.t).toBeGreaterThanOrEqual(fore);
  });

  it("en relativ url görs absolut mot workerns egen origin (aldrig en relativ url till openWindow)", async () => {
    const w = ladda();
    await klicka(w, { url: "/admin" });
    expect(w.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/admin`);
  });
});

describe("sw.js notificationclick — appen är öppen", () => {
  it("fokuserar fönstret, skickar målet med postMessage och försöker navigate — openWindow behövs inte", async () => {
    const f = klient(`${ORIGIN}/oversikt`);
    const w = ladda({ fonster: [f] });
    await klicka(w, { url: "/ledighet?godkann=1" });
    expect(f.focus).toHaveBeenCalled();
    expect(f.postMessage).toHaveBeenCalledWith({ typ: PUSH_NAVIGERA, url: `${ORIGIN}/ledighet?godkann=1` });
    expect(f.navigate).toHaveBeenCalledWith(`${ORIGIN}/ledighet?godkann=1`);
    expect(w.clients.openWindow).not.toHaveBeenCalled();
  });

  it("iOS: navigate() KASTAR → löftet avvisas inte, och inget andra fönster öppnas (förr: hela hanteraren avvisades och ingenting hände)", async () => {
    const f = klient(`${ORIGIN}/ledighet`, { navigate: vi.fn(async () => { throw new TypeError("navigate failed"); }) });
    const w = ladda({ fonster: [f] });
    await klicka(w, { url: "/ledighet?godkann=1" }); // samma path, annan query — exakt fallet som tidigare hängde
    expect(f.navigate).toHaveBeenCalled();
    expect(f.postMessage).toHaveBeenCalledWith({ typ: PUSH_NAVIGERA, url: `${ORIGIN}/ledighet?godkann=1` });
    expect(w.clients.openWindow).not.toHaveBeenCalled();
  });

  it("iOS: ingen navigate-metod alls → ändå fokus + postMessage", async () => {
    const f = klient(`${ORIGIN}/oversikt`); delete f.navigate;
    const w = ladda({ fonster: [f] });
    await klicka(w, { url: "/ledighet" });
    expect(f.focus).toHaveBeenCalled();
    expect(f.postMessage).toHaveBeenCalled();
  });

  it("focus() avvisas → postMessage försöks ändå och openWindow är sista utväg (något SKA öppnas)", async () => {
    const f = klient(`${ORIGIN}/oversikt`, { focus: vi.fn(async () => { throw new Error("ej tillåtet"); }) });
    const w = ladda({ fonster: [f] });
    await klicka(w, { url: "/ledighet?godkann=1" });
    expect(f.postMessage).toHaveBeenCalled();
    expect(f.navigate).not.toHaveBeenCalled(); // navigerar inte ett fönster vi inte fått fokus på
    expect(w.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/ledighet?godkann=1`);
  });

  it("fönstret står redan på målet → fokus utan onödig navigate", async () => {
    const f = klient(`${ORIGIN}/ledighet`);
    const w = ladda({ fonster: [f] });
    await klicka(w, { url: "/ledighet" });
    expect(f.focus).toHaveBeenCalled();
    expect(f.navigate).not.toHaveBeenCalled();
  });

  it("ett fönster på annan origin ignoreras", async () => {
    const f = klient("https://annan.exempel.se/ledighet");
    const w = ladda({ fonster: [f] });
    await klicka(w, { url: "/ledighet" });
    expect(f.focus).not.toHaveBeenCalled();
    expect(w.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/ledighet`);
  });
});

describe("sw.js notificationclick — fel stoppar aldrig hanteraren", () => {
  it("matchAll kastar → openWindow", async () => {
    const w = ladda({ matchAllKastar: true });
    await klicka(w, { url: "/ledighet" });
    expect(w.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/ledighet`);
  });

  it("Cache API saknas → fungerar ändå (postMessage/openWindow)", async () => {
    const w = ladda({ utanCaches: true });
    await klicka(w, { url: "/ledighet" });
    expect(w.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/ledighet`);
  });

  it("openWindow avvisas → löftet löses ändå", async () => {
    const w = ladda({ openWindowAvvisar: true });
    await klicka(w, { url: "/ledighet" });
    expect(w.clients.openWindow).toHaveBeenCalled();
  });
});

describe("sw.js push — oförändrat", () => {
  it("visar notisen med titel, text, tag och url i data", async () => {
    const w = ladda();
    let lofte: Promise<unknown> | undefined;
    w.hanterare.push({
      data: { json: () => ({ title: "Ledighet", body: "Joacim har ansökt om ledighet 3 – 7 november", url: "/ledighet?godkann=1", tag: "ledighet-ansokan-a1" }) },
      waitUntil: (p: Promise<unknown>) => { lofte = p; },
    });
    await lofte;
    expect(w.visa).toHaveBeenCalledWith("Ledighet", expect.objectContaining({
      body: "Joacim har ansökt om ledighet 3 – 7 november", tag: "ledighet-ansokan-a1", data: { url: "/ledighet?godkann=1" },
    }));
  });
});

describe("konstanterna i sw.js = lib/pushKlick.ts (workern kan inte importera)", () => {
  it("samma cache-namn, nyckel och meddelandetyp ordagrant", () => {
    expect(SW).toContain(`const PUSH_MAL_CACHE = '${PUSH_MAL_CACHE}';`);
    expect(SW).toContain(`const PUSH_MAL_NYCKEL = '${PUSH_MAL_NYCKEL}';`);
    expect(SW).toContain(`const PUSH_NAVIGERA = '${PUSH_NAVIGERA}';`);
  });
});

describe("valjNavigering — sidans beslut", () => {
  const NU = { origin: ORIGIN, pathname: "/oversikt", search: "", tid: 1_000_000 };
  const mal = (url: string, t = NU.tid - 1000) => ({ url, t });

  it("färskt mål på samma origin → path + query (godkännar-notisen, beslutsnotisen)", () => {
    expect(valjNavigering(mal(`${ORIGIN}/ledighet?godkann=1`), NU)).toBe("/ledighet?godkann=1");
    expect(valjNavigering(mal(`${ORIGIN}/ledighet`), NU)).toBe("/ledighet");
  });
  it("sidan är REDAN på målet → null (ingen omladdning)", () => {
    expect(valjNavigering(mal(`${ORIGIN}/ledighet?godkann=1`), { ...NU, pathname: "/ledighet", search: "?godkann=1" })).toBeNull();
  });
  it("samma path men annan query → navigerar (godkänn-listan ska fällas upp)", () => {
    expect(valjNavigering(mal(`${ORIGIN}/ledighet?godkann=1`), { ...NU, pathname: "/ledighet", search: "" })).toBe("/ledighet?godkann=1");
  });
  it("gammalt mål (äldre än 2 min) → null", () => {
    expect(valjNavigering(mal(`${ORIGIN}/ledighet`, NU.tid - PUSH_MAL_MAX_ALDER_MS - 1), NU)).toBeNull();
    expect(valjNavigering(mal(`${ORIGIN}/ledighet`, NU.tid - PUSH_MAL_MAX_ALDER_MS), NU)).toBe("/ledighet");
  });
  it("tid långt fram i tiden (trasig klocka/rad) → null", () => {
    expect(valjNavigering(mal(`${ORIGIN}/ledighet`, NU.tid + PUSH_MAL_MAX_ALDER_MS + 1), NU)).toBeNull();
  });
  it("annan origin eller ogiltig url → null (en notis kan aldrig skicka bort appen)", () => {
    expect(valjNavigering(mal("https://ond.exempel.se/ledighet"), NU)).toBeNull();
    expect(valjNavigering(mal("http://[ogiltig"), NU)).toBeNull();
  });
  it("trasigt lagrat värde → null", () => {
    for (const x of [null, undefined, {}, { url: 5, t: 1 }, { url: "/x" }, { url: "/x", t: "nu" }]) {
      expect(valjNavigering(x as any, NU)).toBeNull();
    }
  });
});
