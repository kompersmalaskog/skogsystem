import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// TYSTNAD ÄR INGET FEL (Rottne H8, 2026-11-18). På Rottnen går GPS:en via GpsGate och ett virtuellt Eltima-portpar innan appen läser COM6: att stänga och öppna
// porten för att den var tyst bröt kedjan, och ingen GPS kom tillbaka på timmar (400 omstarter). Testerna kör på RIKTIGA tider (30 s, 2 min, 10 min, timmar)
// med falska timers. Porten är styrbar: testet bestämmer när data kommer, när strömmen tar slut och när open() misslyckas.

const rad = (kropp: string) => { let cs = 0; for (let i = 0; i < kropp.length; i++) cs ^= kropp.charCodeAt(i); return "$" + kropp + "*" + cs.toString(16).toUpperCase().padStart(2, "0"); };
const nmeaNu = () => {
  const d = new Date(Date.now() - 2000);
  const p = (n: number) => String(n).padStart(2, "0");
  const t = `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.00`;
  const dag = `${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}${p(d.getUTCFullYear() % 100)}`;
  return [rad(`GNGGA,${t},5621.387889,N,01502.992016,E,1,09,0.7,102.6,M,36.0,M,,`), rad(`GNRMC,${t},A,5621.387889,N,01502.992016,E,0.0,72.9,${dag},1.7,E,A,V`)].join("\r\n") + "\r\n";
};

type Lasning = { value?: Uint8Array; done?: boolean; fel?: Error };
/** En port vars ström testet styr. `oppna` bestämmer vad varje open() gör (kasta = porten går inte att öppna). */
function styrbarPort(oppna: (n: number) => Error | null = () => null) {
  const st = { oppnade: 0, oppningsForsok: 0, stangda: 0, avbrutna: 0, tider: [] as number[] };
  let vantar: null | ((r: Lasning) => void) = null;
  const ko: Lasning[] = [];
  const port: any = {
    open: vi.fn(async () => { st.oppningsForsok++; st.tider.push(Date.now()); const e = oppna(st.oppningsForsok); if (e) throw e; st.oppnade++; }),
    close: vi.fn(async () => { st.stangda++; }),
    readable: {
      getReader() {
        return {
          read: () => new Promise<any>((res, rej) => {
            const lev = (r: Lasning) => (r.fel ? rej(r.fel) : res({ value: r.value, done: !!r.done }));
            const nasta = ko.shift();
            if (nasta) return lev(nasta);
            vantar = lev;   // hänger tills testet skickar något
          }),
          cancel: async () => { st.avbrutna++; vantar?.({ done: true }); vantar = null; },
          releaseLock() {},
        };
      },
    },
  };
  const skicka = (r: Lasning) => { if (vantar) { const v = vantar; vantar = null; v(r); } else ko.push(r); };
  return {
    port, st,
    data: () => skicka({ value: new TextEncoder().encode(nmeaNu()) }),
    slut: () => skicka({ done: true }),
    lasfel: () => skicka({ fel: new Error("NetworkError: device lost") }),
  };
}

async function starta(p: ReturnType<typeof styrbarPort>) {
  const m = new Map<string, string>([["gps-serial-vald", "1"]]);
  const hand: Record<string, ((e: any) => void)[]> = {};
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) });
  vi.stubGlobal("navigator", { serial: {
    getPorts: async () => [p.port],
    addEventListener: (n: string, f: (e: any) => void) => { (hand[n] ??= []).push(f); },
    removeEventListener: (n: string, f: (e: any) => void) => { hand[n] = (hand[n] ?? []).filter((x) => x !== f); },
  } });
  vi.resetModules();
  const g = await import("./gpsKalla");
  const logg = await import("./fart/fartLogg");
  logg.taAllt();
  const fixar: any[] = [];
  const h = g.startaGpsKalla((f) => fixar.push(f));
  const rora = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); };
  const handelse = (n: string, e: any) => (hand[n] ?? []).forEach((f) => f(e));
  // taAllt() TÖMMER loggen: samla allt som setts, så att namn() och rader() går att anropa flera gånger.
  const sett: { namn: string; ms: number; detalj?: any }[] = [];
  const rader = () => { sett.push(...logg.taAllt()); return sett; };
  const namn = () => rader().map((r) => r.namn);
  await rora(0);
  return { h, fixar, rora, handelse, namn, rader, logg, g };
}

const MIN = 60_000;
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("tyst port med porten öppen: den stängs ALDRIG", () => {
  for (const [namn, tyst] of [["30 s", 30_000], ["2 min", 2 * MIN], ["10 min", 10 * MIN], ["3 timmar", 180 * MIN]] as const) {
    it(`tyst i ${namn}: porten öppnas en gång, stängs inte, avbryts inte — och data som kommer tillbaka läses direkt`, async () => {
      const p = styrbarPort();
      const k = await starta(p);
      p.data(); await k.rora(10);
      expect(k.fixar.some((f) => f.giltig)).toBe(true);
      const fore = k.fixar.length;
      await k.rora(tyst);
      expect(p.st.oppnade).toBe(1); expect(p.st.stangda).toBe(0); expect(p.st.avbrutna).toBe(0);
      expect(p.port.open).toHaveBeenCalledTimes(1); expect(p.port.close).not.toHaveBeenCalled();
      expect(k.fixar.length).toBe(fore);
      p.data(); await k.rora(10);                                // GpsGate/Eltima-kedjan kommer tillbaka av sig själv
      expect(k.fixar.length).toBeGreaterThan(fore);
      expect(k.fixar[k.fixar.length - 1].giltig).toBe(true);
      expect(p.st.oppnade).toBe(1); expect(p.st.stangda).toBe(0);
      k.h.stop();
    });
  }

  it("lång tystnad loggas EN gång ('gps:tyst-lang', efter 2 min) och 'gps:tillbaka' när datan kommer — aldrig 'tyst-omstart'", async () => {
    const p = styrbarPort(); const k = await starta(p);
    p.data(); await k.rora(10);
    await k.rora(90_000); expect(k.namn()).not.toContain("gps:tyst-lang");     // kort tystnad är normalt
    await k.rora(40_000); expect(k.namn().filter((n) => n === "gps:tyst-lang")).toHaveLength(1);
    await k.rora(30 * MIN); expect(k.namn().filter((n) => n === "gps:tyst-lang")).toHaveLength(1);
    p.data(); await k.rora(10);
    expect(k.namn()).toContain("gps:tillbaka"); expect(k.namn()).not.toContain("gps:tyst-omstart");
    k.h.stop();
  });

  it("en port som aldrig sagt något (tyst från start) rörs inte heller", async () => {
    const p = styrbarPort(); const k = await starta(p);
    await k.rora(60 * MIN);
    expect(p.st.oppnade).toBe(1); expect(p.st.stangda).toBe(0); expect(p.st.avbrutna).toBe(0);
    k.h.stop();
  });
});

describe("porten faller bort på riktigt: den öppnas om", () => {
  it("disconnect-händelse för vår port → läsningen avbryts, porten stängs och öppnas igen, och data läses", async () => {
    const p = styrbarPort(); const k = await starta(p);
    p.data(); await k.rora(10);
    k.handelse("disconnect", { target: p.port });
    await k.rora(10);
    expect(p.st.avbrutna).toBe(1); expect(p.st.stangda).toBe(1);
    await k.rora(10_000);
    expect(p.st.oppnade).toBe(2);
    p.data(); await k.rora(10);
    expect(k.fixar[k.fixar.length - 1].giltig).toBe(true);
    k.h.stop();
  });
  it("disconnect för en ANNAN port rör ingenting", async () => {
    const p = styrbarPort(); const k = await starta(p);
    p.data(); await k.rora(10);
    k.handelse("disconnect", { target: { annan: true } });
    await k.rora(60 * MIN);
    expect(p.st.avbrutna).toBe(0); expect(p.st.stangda).toBe(0); expect(p.st.oppnade).toBe(1);
    k.h.stop();
  });
  it("läsfel (porten tappades) → öppnas om efter 10 s", async () => {
    const p = styrbarPort(); const k = await starta(p);
    p.data(); await k.rora(10);
    p.lasfel(); await k.rora(10);
    expect(p.st.stangda).toBe(1);
    await k.rora(10_000); expect(p.st.oppnade).toBe(2);
    k.h.stop();
  });
  it("strömmen tar slut (done) → öppnas om", async () => {
    const p = styrbarPort(); const k = await starta(p);
    p.data(); await k.rora(10);
    p.slut(); await k.rora(10_000);
    expect(p.st.oppnade).toBe(2);
    k.h.stop();
  });
  it("en port som FALLER OFTA men ger data varje gång (Ponsse, delad port): fortsätter öppnas om, ger aldrig upp", async () => {
    const p = styrbarPort(); const k = await starta(p);
    for (let i = 0; i < 25; i++) { p.data(); await k.rora(10); p.slut(); await k.rora(10_000); }
    expect(p.st.oppnade).toBe(26);
    expect(k.namn()).not.toContain("gps:ger-upp");
    p.data(); await k.rora(10); expect(k.fixar[k.fixar.length - 1].giltig).toBe(true);
    k.h.stop();
  });
});

describe("omstart utan data: slutar efter några försök", () => {
  it("porten går inte att öppna: fem försök med växande uppehåll (10 → 160 s), sedan tyst i timmar — inte hundratals", async () => {
    const p = styrbarPort(() => new DOMException("Failed to open serial port.", "NetworkError"));
    const k = await starta(p);
    await k.rora(6 * 60 * MIN);
    expect(p.st.oppningsForsok).toBe(5);
    expect(k.namn().filter((n) => n === "gps:ger-upp")).toHaveLength(1);
    expect(k.rader().find((r) => r.namn === "gps:ger-upp")!.ms).toBe(5);
    k.h.stop();
  });
  it("porten öppnas men tappas direkt utan en mening: samma sak — slutar efter fem", async () => {
    const p = styrbarPort(); const k = await starta(p);
    for (let i = 0; i < 40; i++) { p.slut(); await k.rora(200_000); }
    expect(p.st.oppnade).toBe(5);
    expect(k.namn().filter((n) => n === "gps:ger-upp")).toHaveLength(1);
    k.h.stop();
  });
  it("när porten kommer tillbaka (connect) börjar försöken om — och datan läses", async () => {
    let tillgangligt = false;
    const p = styrbarPort(() => (tillgangligt ? null : new DOMException("Failed to open serial port.", "NetworkError")));
    const k = await starta(p);
    await k.rora(60 * MIN);
    expect(p.st.oppningsForsok).toBe(5);
    tillgangligt = true;
    k.handelse("connect", {}); await k.rora(10);
    expect(p.st.oppnade).toBe(1);
    p.data(); await k.rora(10);
    expect(k.fixar[k.fixar.length - 1].giltig).toBe(true);
    k.h.stop();
  });
  it("connect-händelsens snabba omförsök (Windows annonserar porten före den går att öppna) räknas inte som ett försök att ge upp efter", async () => {
    let n = 0;
    const p = styrbarPort(() => (++n <= 3 ? new DOMException("busy", "InvalidStateError") : null));
    const k = await starta(p);
    // Tre misslyckade öppningar i följd efter en connect: porten blir tillgänglig vid fjärde — vi får inte ha gett upp.
    k.handelse("connect", {}); await k.rora(10 * MIN);
    expect(p.st.oppnade).toBe(1);
    expect(k.namn()).not.toContain("gps:ger-upp");
    k.h.stop();
  });
  it("uppehållet växer: försök vid 0, 10, 30, 70 och 150 s (10 → 20 → 40 → 80) — inte var 10:e sekund", async () => {
    const p = styrbarPort(() => new Error("x")); const k = await starta(p);
    await k.rora(60 * MIN);
    const t0 = p.st.tider[0];
    expect(p.st.tider.map((t) => (t - t0) / 1000)).toEqual([0, 10, 30, 70, 150]);
    k.h.stop();
  });
  it("ett lyckat varv med data nollar räknaren: fyra misslyckade, ett med data, och sedan får det komma fem nya försök", async () => {
    let n = 0;
    const p = styrbarPort(() => (++n <= 4 || (n >= 6 && n <= 9) ? new Error("x") : null));
    const k = await starta(p);
    await k.rora(2 * MIN);                      // försök 1–4 misslyckas (0, 10, 30, 70 s), 5:e vid 150 s lyckas
    await k.rora(60_000);
    expect(p.st.oppnade).toBe(1);
    p.data(); await k.rora(10); p.slut(); await k.rora(10);   // data, sedan tappad → räknaren nollas
    await k.rora(60 * MIN);
    expect(p.st.oppningsForsok).toBe(9 + 1);    // 4 + 1 lyckat + 4 misslyckade + ett lyckat (försök 10) — gav inte upp vid 6
    expect(k.namn()).not.toContain("gps:ger-upp");
    k.h.stop();
  });
  it("connect efter att ha gett upp nollar försöken: porten är otillgänglig några försök till, och den hittas ändå", async () => {
    let n = 0;
    const p = styrbarPort(() => (++n <= 7 ? new DOMException("busy", "InvalidStateError") : null));
    const k = await starta(p);
    await k.rora(60 * MIN);
    expect(p.st.oppningsForsok).toBe(5);        // gav upp
    k.handelse("connect", {}); await k.rora(10 * MIN);
    expect(p.st.oppnade).toBe(1);               // försök 6 och 7 misslyckas (snabbt omförsök, sedan 10 s), 8 lyckas
    k.h.stop();
  });
  it("felet loggas med namn och text, så att orsaken syns i efterhand ('port-gick-inte-oppna')", async () => {
    const p = styrbarPort(() => new DOMException("Failed to open serial port.", "InvalidStateError"));
    const k = await starta(p);
    await k.rora(5);
    const r = k.rader().find((x) => x.namn === "gps:port-gick-inte-oppna")!;
    expect(r.detalj?.fel).toMatch(/InvalidStateError: Failed to open serial port/);
    k.h.stop();
  });
});

describe("stop()", () => {
  it("stoppar allt: inga fler försök efter stop, ingen timer kvar", async () => {
    const p = styrbarPort(() => new Error("x")); const k = await starta(p);
    k.h.stop();
    await k.rora(60 * MIN);
    expect(p.st.oppningsForsok).toBeLessThanOrEqual(1);
  });
});
